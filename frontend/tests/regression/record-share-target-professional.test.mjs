import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, readdir } from 'node:fs/promises';
import { createServer } from 'vite';

// ============================================================
// Guarda de regressão: compartilhamento passou a autorizar por
// PROFISSIONAL específico (to_user_id), não mais por "qualquer
// colega ativo na disciplina de destino" (to_discipline = ANY
// (user_disciplines(...))). Pedido do usuário em 2026-08-18: por
// disciplina inteira era ruim para privacidade — o destinatário
// devia ser a pessoa escolhida, não o time todo da área.
//
// Mesma técnica de frontend/tests/regression/shared-session-
// cumulative-hardening.test.mjs: não confia em qual arquivo define
// a função/política hoje — acha, entre TODAS as migrations
// versionadas em ordem de nome (= ordem real de aplicação), a
// definição MAIS RECENTE e valida só essa. Uma migration futura que
// reintroduza a liberação por disciplina inteira quebra este teste,
// não importa o nome do arquivo.
// ============================================================

const migrationsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../supabase/migrations',
);

let latestGetSharedSession;
let latestAuditLog;
let latestCreateShareFn;
let latestSelectPolicy;

function latestBlockByRegex(sources, regex) {
  let latest;
  for (const [, source] of sources) {
    const match = source.match(regex);
    if (match) latest = match[0];
  }
  return latest;
}

/** Recorta do início de `startNeedle` até o próximo `CREATE `/`DROP ` de topo. */
function sliceTopLevelStatement(source, startNeedle) {
  const start = source.lastIndexOf(startNeedle);
  if (start === -1) return undefined;
  const nextCreate = source.indexOf('\nCREATE ', start + startNeedle.length);
  const nextDrop = source.indexOf('\nDROP ', start + startNeedle.length);
  const candidates = [nextCreate, nextDrop].filter(i => i !== -1);
  const end = candidates.length ? Math.min(...candidates) : source.length;
  return source.slice(start, end);
}

before(async () => {
  const entries = (await readdir(migrationsDir))
    .filter(name => name.endsWith('.sql'))
    .sort();

  const sources = await Promise.all(
    entries.map(async name => [name, await readFile(path.join(migrationsDir, name), 'utf8')]),
  );

  const getSharedSessionRegex =
    /CREATE OR REPLACE FUNCTION public\.get_shared_session\b[\s\S]*?AS \$get_shared_session\$([\s\S]*?)\$get_shared_session\$;/;
  const auditLogRegex =
    /CREATE OR REPLACE FUNCTION public\.get_patient_audit_log\b[\s\S]*?AS \$get_patient_audit_log\$([\s\S]*?)\$get_patient_audit_log\$;/;
  const createShareRegex =
    /CREATE OR REPLACE FUNCTION public\.create_record_share_after_reauthentication\b[\s\S]*?AS \$create_record_share_after_reauthentication\$([\s\S]*?)\$create_record_share_after_reauthentication\$;/;

  for (const [, source] of sources) {
    const sessionMatch = source.match(getSharedSessionRegex);
    if (sessionMatch) latestGetSharedSession = sessionMatch[1];

    const auditMatch = source.match(auditLogRegex);
    if (auditMatch) latestAuditLog = auditMatch[1];

    const shareMatch = source.match(createShareRegex);
    if (shareMatch) latestCreateShareFn = shareMatch[1];

    const policySlice = sliceTopLevelStatement(source, 'CREATE POLICY record_shares_select_clinic');
    if (policySlice) latestSelectPolicy = policySlice;
  }
});

test('as três definições existem em pelo menos uma migration', () => {
  assert.ok(latestGetSharedSession, 'get_shared_session não encontrada');
  assert.ok(latestAuditLog, 'get_patient_audit_log não encontrada');
  assert.ok(latestCreateShareFn, 'create_record_share_after_reauthentication não encontrada');
  assert.ok(latestSelectPolicy, 'policy record_shares_select_clinic não encontrada');
});

test('get_shared_session (versão vigente) autoriza pelo destinatário específico', () => {
  assert.match(latestGetSharedSession, /s\.to_user_id = v_uid/);
  assert.doesNotMatch(
    latestGetSharedSession,
    /to_discipline\s*=\s*ANY/,
    'liberação por disciplina inteira não pode voltar a autorizar leitura de conteúdo clínico',
  );
});

test('get_patient_audit_log (versão vigente) segue a mesma regra', () => {
  assert.match(latestAuditLog, /s\.to_user_id = v_uid/);
  assert.doesNotMatch(latestAuditLog, /to_discipline\s*=\s*ANY/);
});

test('a policy de leitura de record_shares (versão vigente) restringe ao destinatário', () => {
  assert.match(latestSelectPolicy, /to_user_id = auth\.uid\(\)/);
  assert.doesNotMatch(
    latestSelectPolicy,
    /to_discipline\s*=\s*ANY/,
    'a NOTA de encaminhamento (texto puro) não pode voltar a ser legível pelo time inteiro da disciplina',
  );
});

test('create_record_share_after_reauthentication (versão vigente) exige destinatário', () => {
  assert.match(latestCreateShareFn, /p_to_user_id IS NULL/);
  assert.match(latestCreateShareFn, /INSERT INTO public\.record_shares/);
  assert.match(latestCreateShareFn, /to_user_id/);
  // O destinatário precisa ser validado contra clínica e disciplina do
  // profissional-alvo, não só existir.
  assert.match(latestCreateShareFn, /v_target_clinic IS DISTINCT FROM v_patient_clinic/);
  assert.match(
    latestCreateShareFn,
    /p_to_discipline = ANY\(COALESCE\(v_target_disciplines, ARRAY\[\]::TEXT\[\]\)\)/,
  );
});

// ---------- frontend: o serviço e o diálogo exigem o profissional ----------

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let server;
let recordSharesService;

before(async () => {
  server = await createServer({
    root,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  });
  recordSharesService = await server.ssrLoadModule('/src/services/recordSharesService.js');
});

after(async () => {
  await server?.close();
});

test('createRecordShare rejeita envio sem destinatário', async () => {
  const { createRecordShare } = recordSharesService;
  await assert.rejects(
    () => createRecordShare('p1', {
      fromDiscipline: 'acupuntura',
      toDiscipline: 'psicologia',
      scopes: [],
      password: 'x',
      idempotencyKey: crypto.randomUUID(),
    }),
    /profissional/i,
  );
});

test('SharePatientDialog escolhe uma pessoa, não só a disciplina', async () => {
  const dialogSource = await readFile(
    path.resolve(root, 'src/components/SharePatientDialog.jsx'),
    'utf8',
  );
  assert.match(dialogSource, /toUserId/);
  assert.match(dialogSource, /listClinicMembers/);
  // A validação de envio precisa travar em falta de destinatário, não em
  // falta de disciplina (a disciplina sozinha deixou de bastar).
  assert.match(dialogSource, /if \(!toUserId\)/);
});
