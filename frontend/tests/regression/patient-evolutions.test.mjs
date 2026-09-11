import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';

// Cobertura da entrega de 03/09/2026 (patient_evolutions): até aqui nenhum
// teste importava patientEvolutionService nem checava o comportamento da
// migração — apontado como P1 no dossiê de due diligence
// (docs/dossie-tecnico-due-diligence-2026-09-03.md). Este arquivo cobre o
// que dá pra verificar sem um Postgres real: merge de histórico legado+novo,
// mapeamento de erro de schema ausente e as regras de acesso escritas nas
// migrações (por inspeção do SQL, mesmo padrão de record-shares.test.mjs).

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ORIGINAL_MIGRATION_PATH = path.resolve(root, '../supabase/migrations/20260903_patient_evolutions.sql');
const ADMIN_ACCESS_MIGRATION_PATH = path.resolve(root, '../supabase/migrations/20260911_patient_evolutions_clinic_admin_access.sql');

let server;
let patientEvolutionService;
let evolutionHistory;
let originalSql;
let adminAccessSql;

before(async () => {
  server = await createServer({
    root,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  });
  patientEvolutionService = await server.ssrLoadModule('/src/services/patientEvolutionService.js');
  evolutionHistory = await server.ssrLoadModule('/src/utils/evolutionHistory.js');
  [originalSql, adminAccessSql] = await Promise.all([
    readFile(ORIGINAL_MIGRATION_PATH, 'utf8'),
    readFile(ADMIN_ACCESS_MIGRATION_PATH, 'utf8'),
  ]);
});

after(async () => {
  await server?.close();
});

test('isMissingPatientEvolutionsRpc identifica schema ausente e ignora outros erros', () => {
  const { isMissingPatientEvolutionsRpc } = patientEvolutionService;
  assert.equal(
    isMissingPatientEvolutionsRpc({ message: 'Could not find the function public.insert_patient_evolution' }),
    true,
  );
  assert.equal(
    isMissingPatientEvolutionsRpc({ message: 'relation "public.patient_evolutions" does not exist' }),
    true,
  );
  assert.equal(isMissingPatientEvolutionsRpc({ message: 'permission denied' }), false);
  assert.equal(isMissingPatientEvolutionsRpc(null), false);
});

test('PATIENT_EVOLUTIONS_MIGRATION_HINT cita o arquivo da migração', () => {
  assert.match(
    patientEvolutionService.PATIENT_EVOLUTIONS_MIGRATION_HINT,
    /20260903_patient_evolutions\.sql/,
  );
});

test('mergeEvolutionHistory: legado primeiro, registros novos ordenados por atendimento_em, sessao renumerada', () => {
  const { mergeEvolutionHistory } = evolutionHistory;
  const legacy = [{ sessao: 1, data: '01/01/2026', dor: '5' }];
  const records = [
    {
      id: 'r2', conteudo: JSON.stringify({ dor: '3' }),
      atendimento_em: '2026-02-02T10:00:00Z', registrado_em: '2026-02-02T20:00:00Z',
      appointment_id: 'a2', attendance_status: 'attended',
    },
    {
      id: 'r1', conteudo: JSON.stringify({ dor: '4' }),
      atendimento_em: '2026-01-15T10:00:00Z', registrado_em: '2026-01-15T21:00:00Z',
      appointment_id: 'a1', attendance_status: 'no_show',
    },
  ];

  const merged = mergeEvolutionHistory(legacy, records);

  assert.equal(merged.length, 3);
  assert.deepEqual(merged.map(m => m.sessao), [1, 2, 3]);
  // Legado primeiro, sempre editável.
  assert.equal(merged[0].source, 'legacy');
  assert.equal(merged[0].editable, true);
  assert.equal(merged[0].attendanceStatus, 'attended');
  // Registros novos ordenados por atendimento_em (r1 antes de r2, apesar de vir depois no array de entrada).
  assert.equal(merged[1].id, 'r1');
  assert.equal(merged[1].dor, '4');
  assert.equal(merged[1].attendanceStatus, 'no_show');
  assert.equal(merged[1].editable, false);
  assert.equal(merged[2].id, 'r2');
  assert.equal(merged[2].dor, '3');
});

test('mergeEvolutionHistory tolera conteúdo malformado e entradas ausentes', () => {
  const { mergeEvolutionHistory } = evolutionHistory;
  assert.deepEqual(mergeEvolutionHistory(null, null), []);
  const merged = mergeEvolutionHistory([], [
    { id: 'r1', conteudo: '{not json', atendimento_em: '2026-01-01T00:00:00Z', attendance_status: 'attended' },
  ]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].source, 'record');
  assert.equal(merged[0].sessao, 1);
});

test('migração original: data/registro travados no servidor, disciplinas válidas e RPCs owner-only', () => {
  assert.match(originalSql, /CREATE TABLE IF NOT EXISTS public\.patient_evolutions/);
  assert.match(originalSql, /discipline TEXT NOT NULL CHECK \(discipline IN \('acupuntura', 'fisioterapia', 'psicologia', 'nutricao'\)\)/);
  // Trigger de imutabilidade rejeita mudança de data/registro/vínculo.
  assert.match(originalSql, /FUNCTION public\.reject_evolution_date_mutation/);
  assert.match(originalSql, /Evolução imutável/);
  // RPCs originais são owner-only.
  assert.match(originalSql, /FUNCTION public\.insert_patient_evolution/);
  assert.match(originalSql, /FUNCTION public\.list_patient_evolutions/);
  assert.match(originalSql, /p\.therapist_id = v_uid/);
});

test('migração de acesso do admin: list_patient_evolutions ganha exceção de clinic_admin/super_admin sem abrir escrita', () => {
  assert.match(adminAccessSql, /CREATE OR REPLACE FUNCTION public\.list_patient_evolutions/);
  assert.match(adminAccessSql, /is_clinic_admin\(v_uid\) OR public\.is_super_admin\(v_uid\)/);
  assert.match(adminAccessSql, /v_patient_clinic = public\.user_clinic_id\(v_uid\)/);
  assert.match(adminAccessSql, /Acesso negado/);
  // A migração não deve tocar insert_patient_evolution nem update_patient_evolution —
  // escrita continua restrita a quem atende o paciente.
  assert.ok(!/FUNCTION public\.insert_patient_evolution/.test(adminAccessSql));
  assert.ok(!/FUNCTION public\.update_patient_evolution/.test(adminAccessSql));
});
