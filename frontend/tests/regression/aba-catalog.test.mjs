// ============================================================
// Área ABA (01/11/2026): contrato entre tela e banco.
//   * os códigos da tela (mapping.js / catalog.js) são os mesmos dos
//     CHECKs de 20261101b_aba_coleta.sql — mudar um lado sem o outro
//     faria o banco recusar a coleta;
//   * nenhuma tabela aba_* tem leitura direta: RLS ligada, sem policy,
//     REVOKE, e toda RPC pública passa pelo gate de conta;
//   * a área está ligada no hub, no App, na fila de Evoluções e nas Edge
//     Functions que repetem a lista de áreas;
//   * a ida e volta tela → banco → tela não perde dado.
// ============================================================

import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdir, readFile } from 'node:fs/promises';
import {
  EFFICIENCY_TO_DB, GENERALIZATION_CONDITION_CODES, LOCATION_TO_DB, MEASURE_TO_DB, PHASE_CODES,
  PREFERENCE_TO_DB, PROGRAM_STATUS_TO_DB, REINFORCER_CATEGORY_TO_DB, SEVERITY_TO_DB, TRIAL_RESPONSE_CODES,
  newId, programFromDb, programToDb, sessionFromDb, sessionToDb,
} from '../../src/utils/aba/mapping.js';
import { GENERALIZATION_CONDITIONS, OUTCOME_CODES, PROGRAM_PHASES, PROMPT_LEVELS } from '../../src/utils/aba/catalog.js';
import { DISCIPLINES } from '../../src/data/disciplines.js';
import { EVOLUTION_DISCIPLINES, PSYCHOLOGY_FORM_DISCIPLINES } from '../../src/utils/evolutionQueue.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = rel => readFile(path.resolve(root, rel), 'utf8');
const MIGRATION = '../supabase/migrations/20261101b_aba_coleta.sql';

// Valores do CHECK `coluna IN ('a', 'b', …)` da tabela.
function checkValues(sql, table, column) {
  const body = sql.match(new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table} \\(([\\s\\S]*?)\\r?\\n\\);`))?.[1];
  assert.ok(body, `tabela ${table}`);
  const list = body.match(new RegExp(`${column}\\s+IN\\s+\\(([^)]*)\\)`))?.[1];
  assert.ok(list, `CHECK de ${table}.${column}`);
  return [...list.matchAll(/'([^']+)'/g)].map(match => match[1]).sort();
}

const sorted = values => [...values].sort();

test('códigos da tela = CHECKs do banco', async () => {
  const sql = await read(MIGRATION);
  const responses = [...PROMPT_LEVELS.map(level => level.response), ...OUTCOME_CODES.map(outcome => outcome.response)];
  assert.deepEqual(sorted(TRIAL_RESPONSE_CODES), sorted(responses), 'mapping × catálogo');
  assert.deepEqual(checkValues(sql, 'aba_trial_records', 'response'), sorted(TRIAL_RESPONSE_CODES));
  assert.deepEqual(checkValues(sql, 'aba_session_programs', 'phase'), sorted(PHASE_CODES));
  assert.deepEqual(sorted(PROGRAM_PHASES.map(phase => phase.value)), sorted(PHASE_CODES));
  assert.deepEqual(checkValues(sql, 'aba_programs', 'status'), sorted(Object.values(PROGRAM_STATUS_TO_DB)));
  assert.deepEqual(checkValues(sql, 'aba_programs', 'measure'), sorted(Object.values(MEASURE_TO_DB)));
  assert.deepEqual(checkValues(sql, 'aba_reinforcers', 'category'), sorted(Object.values(REINFORCER_CATEGORY_TO_DB)));
  assert.deepEqual(checkValues(sql, 'aba_reinforcers', 'initial_preference'), sorted(Object.values(PREFERENCE_TO_DB)));
  assert.deepEqual(checkValues(sql, 'aba_reinforcer_uses', 'efficiency'), sorted(Object.values(EFFICIENCY_TO_DB)));
  assert.deepEqual(checkValues(sql, 'aba_risk_incidents', 'severity'), sorted(Object.values(SEVERITY_TO_DB)));
  assert.deepEqual(checkValues(sql, 'aba_sessions', 'location'), sorted(Object.values(LOCATION_TO_DB)));
  assert.deepEqual(checkValues(sql, 'aba_sessions', 'generalization_condition'), sorted(GENERALIZATION_CONDITION_CODES));
  assert.deepEqual(sorted(GENERALIZATION_CONDITIONS.map(entry => entry.value)), sorted(GENERALIZATION_CONDITION_CODES));
});

test('tabelas ABA fechadas e RPCs com gate de conta', async () => {
  const sql = await read(MIGRATION);
  const tables = [...sql.matchAll(/CREATE TABLE IF NOT EXISTS public\.(aba_\w+)/g)].map(match => match[1]);
  assert.equal(tables.length, 17);
  const locked = sql.match(/FOREACH v_table IN ARRAY ARRAY\[([\s\S]*?)\]/)[1];
  for (const table of tables) assert.ok(locked.includes(`'${table}'`), `${table} sem RLS/REVOKE`);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON TABLE public\.%I FROM PUBLIC, anon, authenticated/);
  assert.doesNotMatch(sql, /CREATE POLICY/, 'sem policy: ninguém lê direto');

  const granted = [...sql.matchAll(/GRANT EXECUTE ON FUNCTION public\.(aba_\w+)\(/g)].map(match => match[1]);
  assert.ok(granted.length >= 20);
  for (const name of granted) {
    const body = sql.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\$${name}\\$;`))?.[0];
    assert.ok(body, `função ${name}`);
    assert.match(body, /SECURITY DEFINER/, `${name} precisa ser SECURITY DEFINER`);
    assert.match(body, /SET search_path = pg_catalog/, `${name} com search_path fixo`);
    assert.match(body, /aba_require_(gate|patient|team_manager)\(/, `${name} sem o gate de conta`);
  }
  // Internas não abrem para a tela (cifra, montagem de JSON, perguntas com p_user).
  for (const internal of ['aba_encrypt(TEXT)', 'aba_can_access_patient(UUID, UUID)', 'aba_can_supervise_patient(UUID, UUID)', 'aba_require_gate()']) {
    assert.match(sql, new RegExp(`REVOKE ALL ON FUNCTION public\\.${internal.replace(/[()]/g, '\\$&')} FROM PUBLIC, anon, authenticated;`), internal);
    assert.doesNotMatch(sql, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${internal.replace(/[()]/g, '\\$&')}`), internal);
  }
  // Situação de risco não se apaga num rascunho.
  assert.match(sql, /Situação de risco: só entra, nunca sai/);
  assert.doesNotMatch(sql.match(/FUNCTION public\.aba_replace_session_children[\s\S]*?\$aba_replace_session_children\$;/)[0], /DELETE FROM public\.aba_risk_incidents/);
});

test('ABA ligada no hub, no App, nas Evoluções e nas Edge Functions', async () => {
  const entry = DISCIPLINES.find(item => item.id === 'aba');
  assert.ok(entry?.available, 'card no hub');
  assert.equal(entry.color, 'var(--r1-discipline-aba)');
  assert.match(await read('src/styles/tokens.css'), /--r1-discipline-aba:/);
  assert.match(await read('src/components/HomeConsole.jsx'), /\n {2}aba: \(/);
  const app = await read('src/App.jsx');
  assert.match(app, /lazyPanel\(\(\) => import\('\.\/components\/AbaWorkspace'\), 'AbaWorkspace'\)/);
  assert.match(app, /activeDiscipline === 'aba'/);
  assert.ok(EVOLUTION_DISCIPLINES.includes('aba'), 'evolução do atendimento ABA');
  assert.ok(PSYCHOLOGY_FORM_DISCIPLINES.includes('aba'), 'com o formulário da Psicologia');
  assert.match(await read('src/components/evolutions/EvolutionRecordPanel.jsx'), /if \(discipline === 'aba'\) \{\s+return \{ session: createEmptyPsychologySession\(\) \};/);
  assert.match(await read('../supabase/functions/create-record-share/index.ts'), /'aba',/);
  assert.match(await read('../supabase/functions/super-admin-create-user/index.ts'), /'neuropsicologia', 'aba'\]/);

  const discipline = await read('../supabase/migrations/20261101_aba_discipline.sql');
  // Só CHECK com a lista completa das cinco áreas ganha 'aba'.
  assert.match(discipline, /'acupuntura''::text, ''fisioterapia''::text, ''psicologia''::text, ''nutricao''::text, ''neuropsicologia''::text\]'/);
  assert.match(discipline, /WHERE 'psicologia' = ANY\(disciplines\)/);
});

test('área ABA sem cópia local e sem confirmação sim/não', async () => {
  const dir = path.resolve(root, 'src/components/aba');
  const files = (await readdir(dir)).filter(name => name.endsWith('.jsx'));
  files.push('../AbaWorkspace.jsx');
  for (const name of files) {
    const source = await readFile(path.join(dir, name), 'utf8');
    assert.doesNotMatch(source, /localStorage|sessionStorage/, `${name}: coleta é dado clínico (AGENTS.md §9)`);
    assert.doesNotMatch(source, /window\.confirm/, `${name}: exclusão confirma digitando "excluir"`);
  }
  assert.match(await readFile(path.join(dir, 'AbaCollection.jsx'), 'utf8'), /isDeleteConfirmationValid\(discardText\)/);
});

test('programa e sessão vão e voltam do banco sem perder dado', () => {
  const program = {
    id: newId(),
    revision: 3,
    type: 'reducao',
    name: 'Morder',
    status: 'Generalização',
    collectionType: 'intervalo_parcial',
    measure: 'intervalo parcial',
    unit: 'intervalos',
    procedure: 'DRA',
    objective: 'Reduzir mordidas',
    target: 'Morde a mão',
    criteria: { minimumPercentage: 80, requiredSessions: 3 },
    intervalSeconds: 30,
    goalDirection: 'reduzir',
    reinforcerIds: ['r1'],
    notes: 'nota',
  };
  const row = programToDb(program);
  assert.equal(row.status, 'generalizacao');
  assert.equal(row.measure, 'intervalo_parcial');
  const back = programFromDb({ ...row, patient_id: 'p1', revision: 3 });
  assert.equal(back.status, 'Generalização');
  assert.equal(back.measure, 'intervalo parcial');
  assert.equal(back.intervalSeconds, 30);
  assert.equal(back.criteria.minimumPercentage, 80);
  assert.deepEqual(back.reinforcerIds, ['r1']);

  const session = {
    clientEventId: newId(),
    status: 'em_andamento',
    startAt: Date.parse('2026-11-01T13:00:00Z'),
    location: 'Escola',
    material: 'Cartões',
    peoplePresent: ['Mãe'],
    isGeneralizationProbe: true,
    generalizationCondition: 'ambiente',
    arrivalState: 'Calmo',
    notes: 'bem',
    records: [
      { programId: 'a', type: 'aquisicao', phase: 'linha_de_base', trials: ['independente', null, 'erro'], trialSeconds: [4, null, null] },
      { programId: 'b', type: 'reducao', phase: 'intervencao', value: 2, observedSeconds: 600 },
    ],
    pauses: [{ startAt: Date.parse('2026-11-01T13:10:00Z') }],
    reinforcers: [{ reinforcerId: 'r1', programId: 'a', uses: 2, accessMinutes: 1, efficiency: 'Muito eficiente' }],
    behaviors: [{ id: 'e1', behaviorId: 'b1', quantity: 1, intensity: 'Leve', moment: '10:05', antecedent: 'Demanda', consequence: 'Atenção', conduct: 'Redirecionar' }],
    incidents: [{ id: 'i1', reason: 'Fuga', behavior: 'Fuga', identifiedRisk: 'Correu', interventionType: 'Bloqueio', severity: 'Moderada', durationMinutes: 2, peoplePresent: [] }],
  };
  const payload = sessionToDb(session);
  assert.equal(payload.revision, null, 'rascunho novo ainda sem revisão');
  assert.equal(payload.location, 'escola');
  assert.deepEqual(payload.records[0].trials, ['independente', null, 'erro']);
  assert.equal(payload.reinforcers[0].efficiency, 'muito_eficiente');
  assert.equal(payload.incidents[0].severity, 'moderada');

  // O banco devolve as tentativas como lista de índice/código.
  const loaded = sessionFromDb({
    id: 's1', client_event_id: payload.client_event_id, revision: 2, patient_id: 'p1', therapist_id: 't1',
    session_date: '2026-11-01', started_at: payload.started_at, location: payload.location,
    people_present: payload.people_present, is_generalization_probe: true, generalization_condition: 'ambiente',
    private: payload.private, status: 'em_andamento', review_status: 'pending_review',
    records: [
      { program_id: 'a', phase: 'linha_de_base', type: 'aquisicao', trial_count: 3, trials: [{ index: 1, response: 'independente', seconds: 4 }, { index: 3, response: 'erro', seconds: null }] },
      { program_id: 'b', phase: 'intervencao', type: 'reducao', reduction: { value: 2, observed_seconds: 600 } },
    ],
    pauses: payload.pauses,
    reinforcers: payload.reinforcers,
    behaviors: payload.behaviors,
    incidents: payload.incidents.map(item => ({ ...item, status: 'pending_review' })),
    reviews: [],
  });
  assert.deepEqual(loaded.records[0].trials, ['independente', null, 'erro']);
  assert.deepEqual(loaded.records[0].trialSeconds, [4, null, null]);
  assert.equal(loaded.records[1].observedSeconds, 600);
  assert.equal(loaded.location, 'Escola');
  assert.equal(loaded.notes, 'bem');
  assert.equal(loaded.reinforcers[0].efficiency, 'Muito eficiente');
  assert.equal(loaded.behaviors[0].antecedent, 'Demanda');
  assert.equal(loaded.incidents[0].severity, 'Moderada');
  assert.equal(loaded.revision, 2);
});
