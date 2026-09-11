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
const CLINIC_PATIENT_PROFILE_PATH = path.resolve(root, 'src/components/ClinicPatientProfile.jsx');
const TIMELINE_PATH = path.resolve(root, 'src/components/PatientEvolutionTimeline.jsx');

let server;
let patientEvolutionService;
let evolutionHistory;
let appointmentService;
let originalSql;
let adminAccessSql;
let profileSource;
let timelineSource;

before(async () => {
  server = await createServer({
    root,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  });
  patientEvolutionService = await server.ssrLoadModule('/src/services/patientEvolutionService.js');
  evolutionHistory = await server.ssrLoadModule('/src/utils/evolutionHistory.js');
  appointmentService = await server.ssrLoadModule('/src/services/appointmentService.js');
  [originalSql, adminAccessSql, profileSource, timelineSource] = await Promise.all([
    readFile(ORIGINAL_MIGRATION_PATH, 'utf8'),
    readFile(ADMIN_ACCESS_MIGRATION_PATH, 'utf8'),
    readFile(CLINIC_PATIENT_PROFILE_PATH, 'utf8'),
    readFile(TIMELINE_PATH, 'utf8'),
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

// ---------- ficha do paciente: abas, aviso de pendência e linha do tempo ----------
// Entrega de 11/09/2026: a ficha (ClinicPatientProfile) virou abas em vez de
// seções empilhadas; "Evolução" deixou de listar registros ali dentro e virou
// um resumo + atalho pra PatientEvolutionTimeline (tela própria, só deste
// paciente — o texto que a profissional escreveu, para fiscalização).

function makeAwaitingEvolutionRuntime({ onEq, rows = [] } = {}) {
  return {
    getAuthenticatedUser: async () => ({ id: 'u1' }),
    from: () => {
      const chain = {
        select: () => chain,
        order: () => chain,
        eq(column, value) { onEq?.(column, value); return chain; },
        then(resolve) { resolve({ data: rows, error: null }); },
      };
      return chain;
    },
  };
}

test('listAppointmentsAwaitingEvolution filtra por paciente quando patientId é informado', async () => {
  const seen = {};
  const runtime = makeAwaitingEvolutionRuntime({
    onEq: (column, value) => { seen[column] = value; },
    rows: [{ appointment_id: 'ap1', patient_id: 'p1' }],
  });
  const list = await appointmentService.listAppointmentsAwaitingEvolution({ patientId: 'p1', runtime });
  assert.deepEqual(seen, { patient_id: 'p1' });
  assert.equal(list.length, 1);
});

test('listAppointmentsAwaitingEvolution sem patientId não filtra (comportamento clínica-inteira preservado)', async () => {
  let calledEq = false;
  const runtime = makeAwaitingEvolutionRuntime({ onEq: () => { calledEq = true; } });
  await appointmentService.listAppointmentsAwaitingEvolution({ runtime });
  assert.equal(calledEq, false);
});

test('ficha do paciente: navegação por abas substitui as seções empilhadas', () => {
  assert.match(profileSource, /className="pf-tabs"/);
  assert.match(profileSource, /role="tab"/);
  assert.match(profileSource, /hidden=\{activeTab !== 'cadastro'\}/);
  assert.match(profileSource, /hidden=\{activeTab !== 'evolucao'\}/);
});

test('ficha do paciente: matrículas listam TODAS as disciplinas, com check pra quem enxerga', () => {
  assert.match(profileSource, /DISCIPLINES\.map\(discipline/);
  assert.match(profileSource, /enrollmentByDiscipline\.get\(discipline\.id\)/);
  assert.match(profileSource, /Não matriculado/);
});

test('ficha do paciente: evolução é resumo + atalho, com aviso pulsante quando há pendência', () => {
  assert.match(profileSource, /listAppointmentsAwaitingEvolution\(\{ patientId: patient\.id \}\)/);
  assert.match(profileSource, /pf-pulse-dot/);
  assert.match(profileSource, /setShowTimeline\(true\)/);
  assert.match(profileSource, /<PatientEvolutionTimeline/);
  // A lista crua de evoluções não deve mais ser renderizada dentro da ficha.
  assert.ok(!/evolutions\.map\(evo =>/.test(profileSource));
});

test('linha do tempo da evolução: só o registro do paciente, sem navegar pra outros', () => {
  assert.match(timelineSource, /updatePatientEvolution/);
  assert.match(timelineSource, /listAppointmentsAwaitingEvolution/);
  assert.match(timelineSource, /Corrigir texto/);
  assert.match(timelineSource, /Imprimir/);
  assert.match(timelineSource, /Baixar PDF/);
  // Mesma infra de papel timbrado dos relatórios/cadastro, nenhuma
  // biblioteca de PDF nova.
  assert.match(timelineSource, /from '\.\/report\/reportPrint'/);
  assert.match(timelineSource, /from '\.\/report\/reportPagination'/);
});
