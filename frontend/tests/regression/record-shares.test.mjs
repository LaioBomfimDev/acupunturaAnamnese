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

let server;
let recordSharesService;
let migrationSql;

before(async () => {
  server = await createServer({
    root,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  });
  recordSharesService = await server.ssrLoadModule('/src/services/recordSharesService.js');
  migrationSql = await readFile(MIGRATION_PATH, 'utf8');
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
  // Só a sessão clínica é devolvida (não outros record_types).
  assert.match(migrationSql, /cr\.record_type = 'full_session'/);
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
