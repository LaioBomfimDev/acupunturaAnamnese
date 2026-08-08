import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';

import { DISCIPLINE_IDS } from '../../src/data/disciplines.js';
import { normalizeSharedScopes, ALWAYS_SHARED_SCOPES, SHARE_SCOPE_IDS } from '../../src/data/shareScopes.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MIGRATION_PATH = path.resolve(root, '../supabase/migrations/20260709_record_shares.sql');
const RPC_ORIGINAL_PATH = path.resolve(root, '../supabase/migrations/20260521_fix_clinical_record_rpc.sql');
// 07/08/2026: get_shared_session deixou de ler só a sessão de acupuntura.
const MULTI_PATH = path.resolve(root, '../supabase/migrations/20260807_shared_session_multidisciplina.sql');
const MULTI_APPLY_PATH = path.resolve(root, '../docs/aplicar-sql-compartilhamento-2026-08-07.sql');

let server;
let recordSharesService;
let migrationSql;
let multiSql;

before(async () => {
  server = await createServer({
    root,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  });
  recordSharesService = await server.ssrLoadModule('/src/services/recordSharesService.js');
  [migrationSql, multiSql] = await Promise.all([
    readFile(MIGRATION_PATH, 'utf8'),
    readFile(MULTI_PATH, 'utf8'),
  ]);
});

after(async () => {
  await server?.close();
});

test('normalizeSharedScopes sempre inclui cadastro, filtra inválidos e não duplica', () => {
  assert.deepEqual(normalizeSharedScopes([]), ALWAYS_SHARED_SCOPES);
  assert.ok(normalizeSharedScopes(['resumo']).includes('cadastro'));
  assert.ok(normalizeSharedScopes(['resumo']).includes('resumo'));
  assert.deepEqual(normalizeSharedScopes(['inexistente']), ALWAYS_SHARED_SCOPES);
  // sem duplicatas e na ordem do catálogo
  const all = normalizeSharedScopes([...SHARE_SCOPE_IDS, 'resumo', 'resumo']);
  assert.equal(new Set(all).size, all.length);
  assert.deepEqual(all, SHARE_SCOPE_IDS);
});

test('createRecordShare rejeita disciplina inválida e origem = destino', async () => {
  const { createRecordShare } = recordSharesService;
  await assert.rejects(
    () => createRecordShare('p1', { fromDiscipline: 'acupuntura', toDiscipline: 'acupuntura', scopes: [] }),
    /não podem ser a mesma/,
  );
  await assert.rejects(
    () => createRecordShare('p1', { fromDiscipline: 'xyz', toDiscipline: 'nutricao', scopes: [] }),
    /Disciplina inválida/,
  );
});

test('schema de compartilhamento ausente vira erro explícito citando a migração', () => {
  const { isMissingShareSchemaError, SHARE_MIGRATION_HINT } = recordSharesService;
  assert.equal(
    isMissingShareSchemaError({ message: 'relation "public.record_shares" does not exist' }),
    true,
  );
  assert.equal(
    isMissingShareSchemaError({ message: 'Could not find the function public.get_shared_session' }),
    true,
  );
  assert.equal(isMissingShareSchemaError({ message: 'permission denied' }), false);
  assert.match(SHARE_MIGRATION_HINT, /20260709_record_shares\.sql/);
});

test('migração Fase 3: record_shares, is_clinic_admin e get_shared_session presentes', () => {
  assert.match(migrationSql, /CREATE TABLE IF NOT EXISTS public\.record_shares/);
  assert.match(migrationSql, /shared_scopes TEXT\[\]/);
  assert.match(migrationSql, /CHECK \(from_discipline <> to_discipline\)/);
  assert.match(migrationSql, /FUNCTION public\.is_clinic_admin/);
  assert.match(migrationSql, /FUNCTION public\.get_shared_session/);
  for (const id of DISCIPLINE_IDS) {
    assert.ok(migrationSql.includes(`'${id}'`), `disciplina ${id} ausente da migração`);
  }
});

test('Fase 3 é ADITIVA: não altera a RPC dona-somente nem cria DELETE de compartilhamento', async () => {
  // A get_clinical_records original (dona-somente) NÃO pode ser redefinida aqui.
  assert.ok(!/FUNCTION public\.get_clinical_records/.test(migrationSql),
    'get_clinical_records não pode ser tocada na Fase 3');
  // A original permanece com a trava de posse.
  const originalRpc = await readFile(RPC_ORIGINAL_PATH, 'utf8');
  assert.match(originalRpc, /cr\.therapist_id = v_therapist_id/);
  // Compartilhamento se revoga, não se apaga.
  assert.ok(!/FOR DELETE/i.test(migrationSql));
  assert.match(migrationSql, /GRANT SELECT, INSERT, UPDATE ON public\.record_shares/);
});

test('Fase 3: get_shared_session autoriza por dono/admin/compartilhamento e trava não-autorizado', () => {
  // Precisa checar os três caminhos e negar explicitamente.
  assert.match(migrationSql, /p\.therapist_id = v_uid/);
  assert.match(migrationSql, /is_clinic_admin\(v_uid\) OR public\.is_super_admin\(v_uid\)/);
  assert.match(migrationSql, /s\.revoked_at IS NULL/);
  assert.match(migrationSql, /to_discipline = ANY \(public\.user_disciplines\(v_uid\)\)/);
  assert.match(migrationSql, /Acesso negado/);
  // Comportamento ORIGINAL desta migração: só a sessão de acupuntura era
  // devolvida. Corrigido em 20260807 — ver os testes adiante.
  assert.match(migrationSql, /cr\.record_type = 'full_session'/);
});

// O cabeçalho das migrações explica o que foi corrigido e cita o filtro
// antigo. Para afirmar que ele saiu de verdade, olhe só o código.
function sqlCodeOnly(sql) {
  return sql
    .split('\n')
    .filter(line => !line.trimStart().startsWith('--'))
    .join('\n');
}

test('20260807: get_shared_session devolve qualquer disciplina, não só a sessão de MTC', () => {
  // O filtro que deixava Psi/Fisio/Nutri sem conteúdo tinha de sair.
  assert.doesNotMatch(sqlCodeOnly(multiSql), /record_type = 'full_session'/);
  // A assinatura mudou: precisa derrubar antes de recriar.
  assert.match(multiSql, /DROP FUNCTION IF EXISTS public\.get_shared_session\(UUID\)/);
  // O cliente precisa saber de qual disciplina é cada registro.
  assert.match(multiSql, /discipline TEXT,/);
  assert.match(multiSql, /cr\.discipline,/);
});

test('20260807: encaminhamento expõe APENAS a disciplina de origem', () => {
  // Sem isso, um share psicologia → fisioterapia entregaria também a
  // sessão de acupuntura do mesmo paciente.
  assert.match(multiSql, /array_agg\(DISTINCT s\.from_discipline\)/);
  assert.match(multiSql, /s\.revoked_at IS NULL/);
  assert.match(multiSql, /s\.to_discipline = ANY \(public\.user_disciplines\(v_uid\)\)/);
  assert.match(multiSql, /cr\.discipline = ANY \(v_allowed_disciplines\)/);
  // Dono e adm da clínica não regridem.
  assert.match(multiSql, /v_full_access BOOLEAN := FALSE/);
  assert.match(multiSql, /p\.therapist_id = v_uid/);
  assert.match(multiSql, /is_clinic_admin\(v_uid\) OR public\.is_super_admin\(v_uid\)/);
  // Sem compartilhamento ativo continua negando.
  assert.match(multiSql, /Acesso negado/);
  assert.match(multiSql, /ERRCODE = '42501'/);
});

test('20260807: mantém o padrão de segurança das funções SECURITY DEFINER', () => {
  assert.match(multiSql, /SECURITY DEFINER/);
  assert.match(multiSql, /SET search_path = public, extensions/);
  assert.match(multiSql, /REVOKE EXECUTE ON FUNCTION public\.get_shared_session\(UUID\) FROM anon/);
  assert.match(multiSql, /GRANT EXECUTE ON FUNCTION public\.get_shared_session\(UUID\) TO authenticated/);
});

test('20260807: o SQL para colar no Supabase acompanha a migração e traz verificação', async () => {
  const applySql = await readFile(MULTI_APPLY_PATH, 'utf8');
  // Mesmo corpo de função nos dois arquivos — não podem divergir.
  assert.match(applySql, /array_agg\(DISTINCT s\.from_discipline\)/);
  assert.match(applySql, /cr\.discipline = ANY \(v_allowed_disciplines\)/);
  assert.doesNotMatch(sqlCodeOnly(applySql), /record_type = 'full_session'/);
  // Consulta de conferência ao final.
  assert.match(applySql, /AS ok/);
});

test('a leitura compartilhada deixou de ser exclusiva de MTC', async () => {
  const { getSharedRecords, getSharedSession } = recordSharesService;
  assert.equal(typeof getSharedRecords, 'function');
  // A função antiga devolvia só a sessão de acupuntura: não deve sobreviver.
  assert.equal(getSharedSession, undefined);

  const viewer = await readFile(
    path.resolve(root, 'src/components/SharedSessionViewer.jsx'),
    'utf8',
  );
  // O visualizador precisa escolher o desenho pela disciplina do registro,
  // e não assumir os campos de MTC para todo mundo.
  assert.match(viewer, /record\.discipline === 'acupuntura'/);
  assert.match(viewer, /resolveDisciplineView/);
  assert.match(viewer, /getAnamneseConfig/);
  assert.match(viewer, /getSharedRecords/);
  // Segue somente leitura: nenhum handler de escrita na tela.
  assert.doesNotMatch(viewer, /onChange=|upsertVersionedClinicalRecord/);
});

test('Fase 3: helpers SECURITY DEFINER com search_path fixo e sem execução por anon', () => {
  // 3 funções: is_clinic_admin, set_record_share_defaults, get_shared_session.
  const definers = migrationSql.match(/SECURITY DEFINER/g) || [];
  const pinned = migrationSql.match(/SET search_path = public/g) || [];
  assert.equal(definers.length, 3);
  // Todo SECURITY DEFINER tem search_path fixo (get_shared_session usa "public, extensions").
  assert.equal(pinned.length, definers.length);
  assert.match(migrationSql, /REVOKE EXECUTE ON FUNCTION public\.is_clinic_admin\(UUID\) FROM anon/);
  assert.match(migrationSql, /REVOKE EXECUTE ON FUNCTION public\.get_shared_session\(UUID\) FROM anon/);
});
