import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

// Escalas clínicas, etapa 1 (consultório) — caminho C escolhido em
// 08/10/2026. Cobre: definição dos instrumentos (faixas sem buraco, soma
// certa), cálculo e risco, payload que vai cifrado, data da aplicação,
// regras da migração (acesso por disciplina + matrícula, cifra, sem
// acesso direto à tabela, exclusão de paciente) e a aba na Psicologia.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = rel => readFile(path.join(root, 'src', rel), 'utf8');
const MIGRATION = path.resolve(root, '../supabase/migrations/20261008_patient_instruments.sql');
const ERASURE_ORIGINAL = path.resolve(root, '../supabase/migrations/20260915b_patient_suspend_and_erasure.sql');

let server;
let instruments;
let scoring;
let format;
let ApplyForm;
let TrendChart;
let migrationSql;

before(async () => {
  server = await createServer({
    root,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  });
  instruments = await server.ssrLoadModule('/src/data/clinicalInstruments.js');
  scoring = await server.ssrLoadModule('/src/utils/instrumentScoring.js');
  format = await server.ssrLoadModule('/src/components/instruments/instrumentFormat.js');
  ({ InstrumentApplyForm: ApplyForm } = await server.ssrLoadModule('/src/components/instruments/InstrumentApplyForm.jsx'));
  ({ InstrumentTrendChart: TrendChart } = await server.ssrLoadModule('/src/components/instruments/InstrumentTrendChart.jsx'));
  migrationSql = await readFile(MIGRATION, 'utf8');
});

after(async () => {
  await server?.close();
});

const fill = (instrument, value) => Object.fromEntries(instrument.items.map(item => [item.id, value]));

function answersForScore(instrument, target) {
  // Distribui a nota do primeiro ao último item, sem passar do máximo de cada um.
  const answers = {};
  let left = target;
  for (const item of instrument.items) {
    const top = Math.max(...item.options.map(option => option.value));
    const value = Math.min(top, left);
    answers[item.id] = value;
    left -= value;
  }
  assert.equal(left, 0, `não deu para montar ${target} pontos`);
  return answers;
}

// ---- definição -----------------------------------------------------------

test('cada instrumento tem faixas cobrindo a escala inteira, sem buraco nem sobreposição', () => {
  assert.ok(instruments.CLINICAL_INSTRUMENTS.length >= 2);
  for (const instrument of instruments.CLINICAL_INSTRUMENTS) {
    assert.deepEqual(scoring.validateInstrumentDefinition(instrument), [], instrument.id);
    for (let score = instrument.scoring.min; score <= instrument.scoring.max; score += 1) {
      const matches = instrument.bands.filter(band => score >= band.min && score <= band.max);
      assert.equal(matches.length, 1, `${instrument.id}: ${score} pontos em ${matches.length} faixas`);
    }
  }
});

test('o validador pega faixa com buraco e máximo errado', () => {
  const broken = {
    ...instruments.GAD7,
    bands: [
      { id: 'a', label: 'A', min: 0, max: 4 },
      { id: 'b', label: 'B', min: 6, max: 21 },
    ],
    scoring: { method: 'sum', min: 0, max: 20 },
  };
  const problems = scoring.validateInstrumentDefinition(broken);
  assert.ok(problems.some(problem => problem.includes('buraco')), problems.join('; '));
  assert.ok(problems.some(problem => problem.includes('máximo')), problems.join('; '));
});

test('PHQ-9 e GAD-7 só na Psicologia, em conferência até a psicóloga aprovar', () => {
  const psi = instruments.instrumentsForDiscipline('psicologia').map(instrument => instrument.id);
  assert.deepEqual(psi, ['phq9', 'gad7']);
  assert.deepEqual(instruments.instrumentsForDiscipline('nutricao'), []);
  for (const instrument of instruments.CLINICAL_INSTRUMENTS) {
    assert.equal(instrument.review.status, instruments.INSTRUMENT_REVIEW_STATUS.PENDING, instrument.id);
    assert.ok(instrument.review.note.length > 20, `${instrument.id}: nota de conferência`);
    assert.ok(instrument.sources.length >= 1, `${instrument.id}: fonte`);
    assert.match(instrument.license, /Uso livre/, `${instrument.id}: licença livre`);
  }
  assert.equal(instruments.getInstrument('phq9', 1), instruments.PHQ9);
  assert.equal(instruments.getInstrument('phq9', 99), instruments.PHQ9, 'versão desconhecida cai na atual');
  assert.equal(instruments.getInstrument('inexistente'), null);
});

// ---- cálculo ---------------------------------------------------------------

test('PHQ-9: limites de cada faixa', () => {
  const cases = [[0, 'minima'], [4, 'minima'], [5, 'leve'], [9, 'leve'], [10, 'moderada'], [14, 'moderada'],
    [15, 'moderadamente_grave'], [19, 'moderadamente_grave'], [20, 'grave'], [27, 'grave']];
  for (const [target, band] of cases) {
    const result = scoring.scoreInstrument(instruments.PHQ9, answersForScore(instruments.PHQ9, target));
    assert.equal(result.complete, true);
    assert.equal(result.score, target);
    assert.equal(result.band.id, band, `${target} pontos`);
  }
});

test('GAD-7: limites de cada faixa', () => {
  const cases = [[0, 'minima'], [4, 'minima'], [5, 'leve'], [9, 'leve'], [10, 'moderada'], [14, 'moderada'], [15, 'grave'], [21, 'grave']];
  for (const [target, band] of cases) {
    const result = scoring.scoreInstrument(instruments.GAD7, answersForScore(instruments.GAD7, target));
    assert.equal(result.score, target);
    assert.equal(result.band.id, band, `${target} pontos`);
  }
});

test('escala pela metade não tem nota nem faixa, mas o risco aparece na hora', () => {
  const partial = scoring.scoreInstrument(instruments.PHQ9, { q1: 2, q9: 1 });
  assert.equal(partial.complete, false);
  assert.equal(partial.answered, 2);
  assert.equal(partial.score, null);
  assert.equal(partial.band, null);
  assert.deepEqual(partial.riskItems, ['q9']);
  assert.equal(scoring.riskMessages(instruments.PHQ9, partial.riskItems).length, 1);

  const noRisk = scoring.scoreInstrument(instruments.PHQ9, { ...fill(instruments.PHQ9, 3), q9: 0 });
  assert.deepEqual(noRisk.riskItems, [], '"Nenhuma vez" no item 9 não é risco');
  assert.equal(noRisk.score, 24);

  assert.deepEqual(scoring.scoreInstrument(instruments.GAD7, fill(instruments.GAD7, 3)).riskItems, [], 'GAD-7 não tem item de risco');
});

test('resposta fora das opções não conta', () => {
  const answers = { ...fill(instruments.GAD7, 1), q1: 5, q2: '2', q3: null };
  const result = scoring.scoreInstrument(instruments.GAD7, answers);
  assert.equal(result.answered, 4);
  assert.equal(result.complete, false);
  assert.deepEqual(scoring.sanitizeInstrumentAnswers(instruments.GAD7, { ...answers, extra: 1 }),
    { q4: 1, q5: 1, q6: 1, q7: 1 });
});

test('o que vai cifrado: respostas limpas, resultado da faixa do próprio instrumento e observação', () => {
  assert.throws(
    () => scoring.buildApplicationPayload(instruments.PHQ9, { q1: 1 }),
    /Responda as 9 perguntas para salvar \(faltam 8\)/,
  );

  const answers = { ...answersForScore(instruments.PHQ9, 12), dificuldade: 1, intrusa: 3 };
  answers.q9 = 0;
  answers.q8 = 3;
  const payload = scoring.buildApplicationPayload(instruments.PHQ9, answers, '  respondida no tablet  ');
  const expected = scoring.scoreInstrument(instruments.PHQ9, answers);
  assert.equal(payload.result.score, expected.score);
  const band = instruments.PHQ9.bands.find(item => item.id === payload.result.bandId);
  assert.equal(payload.result.bandLabel, band.label, 'texto da faixa sai da mesma definição do cálculo');
  assert.equal(payload.answers.dificuldade, 1, 'pergunta de dificuldade vai junto, sem pontuar');
  assert.equal(payload.answers.intrusa, undefined);
  assert.equal(payload.note, 'respondida no tablet');
  assert.equal('note' in scoring.buildApplicationPayload(instruments.GAD7, fill(instruments.GAD7, 0), '   '), false);
});

test('pergunta de dificuldade só vale com algum problema assinalado e some do que é gravado', () => {
  const zeros = { ...fill(instruments.PHQ9, 0), dificuldade: 2 };
  assert.deepEqual(scoring.visibleExtraItems(instruments.PHQ9, zeros), []);
  const payload = scoring.buildApplicationPayload(instruments.PHQ9, zeros);
  assert.equal(payload.answers.dificuldade, undefined, 'resposta da pergunta escondida não vai para o banco');
  assert.equal(payload.result.score, 0);

  const withProblem = { ...zeros, q4: 1 };
  assert.deepEqual(scoring.visibleExtraItems(instruments.PHQ9, withProblem).map(item => item.id), ['dificuldade']);
  assert.equal(scoring.buildApplicationPayload(instruments.PHQ9, withProblem).answers.dificuldade, 2);
});

test('reaplicação: antes de 14 dias avisa e diz a partir de quando', () => {
  const now = new Date(2026, 9, 8, 15, 0, 0);
  const fiveDaysAgo = new Date(2026, 9, 3, 10, 0, 0).toISOString();
  const soon = format.reapplyStatus(fiveDaysAgo, 14, now);
  assert.equal(soon.tooSoon, true);
  assert.equal(soon.daysSince, 5);
  assert.equal(format.formatInstrumentDate(soon.availableFrom), '17/10/2026');
  assert.equal(format.reapplyStatus(new Date(2026, 8, 24, 9).toISOString(), 14, now).tooSoon, false, '14 dias já pode');
  assert.equal(format.reapplyStatus(null, 14, now).tooSoon, false, 'sem aplicação, nunca é cedo');
  assert.equal(format.daysAgoLabel(0), 'hoje');
  assert.equal(format.daysAgoLabel(1), 'ontem');
  assert.equal(format.daysAgoLabel(5), 'há 5 dias');
});

test('recados: diferença para a anterior e resultado salvo com o risco junto', () => {
  assert.equal(format.differenceLabel(12, 15), 'Desceu 3 pontos em relação à anterior.');
  assert.equal(format.differenceLabel(13, 12), 'Subiu 1 ponto em relação à anterior.');
  assert.equal(format.differenceLabel(12, 12), 'Igual à aplicação anterior.');
  assert.equal(format.differenceLabel(12, undefined), '');

  const saved = format.savedNotice(instruments.PHQ9, { payload: { result: { score: 9, bandLabel: 'Leve', riskItems: ['q9'] } } });
  assert.deepEqual(saved, { text: 'PHQ-9 salvo: 9 pontos, faixa Leve.', risk: true });
  assert.equal(format.savedNotice(instruments.GAD7, { replayed: true }).text, 'Esta aplicação já estava salva.');

  const apps = [{ id: 'a', voidedAt: '2026-10-01', result: { score: 3 } }, { id: 'b', result: { score: 5 } }, { id: 'c', result: {} }];
  assert.deepEqual(format.validApplications(apps).map(app => app.id), ['b']);
});

test('acesso negado explica o que fazer, casando com a mensagem do banco', async () => {
  const panel = await src('components/instruments/PatientInstrumentsPanel.jsx');
  const phrase = 'não está em atendimento nesta área';
  assert.ok(migrationSql.includes(`o paciente ${phrase} com você.`), 'mensagem do banco');
  assert.ok(panel.includes(phrase), 'a tela reconhece a mesma mensagem');
  assert.match(panel, /precisa ter um atendimento com você na \{area\}, marcado na Agenda/);
  assert.match(panel, /Tentar de novo/);
  assert.match(panel, /!loadedOnce \?/, 'cartões só depois da primeira leitura (sem "Ainda não aplicada" falso)');
});

test('data da aplicação: hoje vira agora, passado vira meio-dia, futuro não vale', () => {
  const now = new Date(2026, 9, 8, 15, 30, 0);
  assert.equal(format.todayInputValue(now), '2026-10-08');
  assert.equal(format.appliedAtFromInput('2026-10-08', now), now.toISOString());
  assert.equal(format.appliedAtFromInput('2026-10-01', now), new Date(2026, 9, 1, 12, 0, 0).toISOString());
  assert.equal(format.appliedAtFromInput('2026-10-09', now), null);
  assert.equal(format.appliedAtFromInput('08/10/2026', now), null);
  assert.equal(format.pointsLabel(1), '1 ponto');
  assert.equal(format.pointsLabel(12), '12 pontos');
});

// ---- tela ------------------------------------------------------------------

test('formulário: uma pergunta por grupo de opções e salvar travado até completar', () => {
  const html = renderToStaticMarkup(React.createElement(ApplyForm, {
    instrument: instruments.PHQ9,
    patientName: 'Paciente Teste',
    patientId: '00000000-0000-0000-0000-000000000001',
    discipline: 'psicologia',
    onCancel: () => {},
    onSaved: () => {},
  }));
  assert.equal((html.match(/role="radiogroup"/g) || []).length, 9);
  assert.match(html, /Salvar resultado<\/button>/);
  assert.match(html, /disabled=""[^>]*>Salvar resultado/);
  assert.match(html, /0 de 9 respondidas · faltam 9\./);
  assert.match(html, /A nota aparece depois de salvar/);
  assert.doesNotMatch(html, /pontos/, 'a nota não aparece enquanto o paciente responde');
});

test('gráfico: anuladas ficam de fora e a descrição diz de onde para onde foi', () => {
  const apps = [
    { id: 'c', appliedAt: '2026-10-06T12:00:00Z', result: { score: 12, bandLabel: 'Moderada' } },
    { id: 'b', appliedAt: '2026-09-20T12:00:00Z', result: { score: 25, bandLabel: 'Grave' }, voidedAt: '2026-09-21T10:00:00Z' },
    { id: 'a', appliedAt: '2026-09-01T12:00:00Z', result: { score: 18, bandLabel: 'Moderadamente grave' } },
  ];
  const html = renderToStaticMarkup(React.createElement(TrendChart, { instrument: instruments.PHQ9, applications: apps }));
  assert.match(html, /de 18 pontos em 01\/09\/2026 para 12 pontos em 06\/10\/2026/);
  assert.equal((html.match(/class="instrument-point(?: is-last)?"/g) || []).length, 2);
  assert.match(html, /<polyline/);
  for (const band of instruments.PHQ9.bands) assert.match(html, new RegExp(`>${band.label}<`));
  assert.equal(renderToStaticMarkup(React.createElement(TrendChart, { instrument: instruments.PHQ9, applications: [] })), '');
});

test('aba Escalas no grupo Avaliação da Psicologia, funcional e com a disciplina certa', async () => {
  const anamnese = await server.ssrLoadModule('/src/data/psychologyAnamnese.js');
  assert.equal(anamnese.PSYCHOLOGY_TABS.ESCALAS, 'Escalas');
  assert.ok(!anamnese.PSYCHOLOGY_PLACEHOLDER_TABS.includes('Escalas'));

  const workspace = await src('components/PsychologyWorkspace.jsx');
  assert.match(workspace, /title: 'Avaliação',\r?\n\s+tabs: \[\r?\n\s+PSYCHOLOGY_TABS\.ANAMNESE,\r?\n\s+PSYCHOLOGY_TABS\.PERGUNTAS_COMPLEMENTARES,\r?\n\s+PSYCHOLOGY_TABS\.ESCALAS,/);
  assert.match(workspace, /case PSYCHOLOGY_TABS\.ESCALAS:[\s\S]*?<PatientInstrumentsPanel[\s\S]*?discipline="psicologia"/);

  const sidebar = await src('components/Sidebar.jsx');
  assert.match(sidebar, /'Escalas': \(/, 'ícone da aba');

  const panel = await src('components/instruments/PatientInstrumentsPanel.jsx');
  assert.match(panel, /A faixa não é diagnóstico/);
  assert.match(panel, /className="alert instrument-risk"/, 'risco usa o alerta (vermelho só para risco)');

  const service = await src('services/patientInstrumentService.js');
  for (const rpc of ['record_patient_instrument_application', 'list_patient_instrument_applications', 'void_patient_instrument_application']) {
    assert.match(service, new RegExp(`supabase\\.rpc\\('${rpc}'`), rpc);
  }
  assert.doesNotMatch(service, /\.from\('patient_instrument_applications'\)/, 'sem leitura direta da tabela');
  assert.doesNotMatch(service, /localStorage/, 'escala não tem fallback local');
});

test('CSS das escalas só com tokens e sem o petróleo fixo', async () => {
  const css = (await src('styles/instruments.css')).replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/);
  assert.doesNotMatch(css, /rgba?\(/);
  assert.doesNotMatch(css, /--r1-(navy|gold)-|--r1-surface-inverse/);
  assert.doesNotMatch(css, /\b\d+(?:\.\d+)?[sd]?vh\b/, 'altura da janela usa calc(N * var(--vh))');
});

// ---- migração --------------------------------------------------------------

function functionBody(sql, name) {
  const match = sql.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\$${name}\\$;`));
  assert.ok(match, `função ${name}`);
  return match[0];
}

test('migração: tabela sem acesso direto, conteúdo cifrado e idempotência', () => {
  assert.match(migrationSql, /ALTER TABLE public\.patient_instrument_applications ENABLE ROW LEVEL SECURITY;/);
  assert.match(migrationSql, /REVOKE ALL ON TABLE public\.patient_instrument_applications FROM PUBLIC, anon, authenticated;/);
  assert.doesNotMatch(migrationSql, /CREATE POLICY [^\r\n]*patient_instrument_applications/, 'sem policy: só RPC');
  assert.doesNotMatch(migrationSql, /GRANT [^\r\n]*ON (TABLE )?public\.patient_instrument_applications/);
  assert.match(migrationSql, /payload_encrypted BYTEA NOT NULL/);
  assert.match(migrationSql, /patient_id UUID NOT NULL REFERENCES public\.patients\(id\) ON DELETE RESTRICT/);
  assert.match(migrationSql, /UNIQUE INDEX IF NOT EXISTS idx_patient_instrument_applications_idempotency\r?\n\s+ON public\.patient_instrument_applications\(applied_by, idempotency_key\)/);
  assert.doesNotMatch(migrationSql, /ON CONFLICT \(/, 'ON CONFLICT com coluna colide com RETURNS TABLE (AGENTS.md §9)');

  const record = functionBody(migrationSql, 'record_patient_instrument_application');
  assert.match(record, /extensions\.pgp_sym_encrypt\(p_payload::TEXT, public\.get_clinical_encryption_key\(\)\)/);
  assert.match(record, /pg_advisory_xact_lock/);
  assert.match(record, /can_use_patient_instruments\(p_patient_id, p_discipline, v_uid\)/);
  assert.match(record, /archived_at IS NOT NULL OR v_patient\.erased_at IS NOT NULL/);
  assert.match(record, /'consultorio'/);

  const voidFn = functionBody(migrationSql, 'void_patient_instrument_application');
  assert.match(voidFn, /v_row\.applied_by IS DISTINCT FROM v_uid/, 'só quem aplicou anula');
  assert.match(voidFn, /FOR UPDATE/);
  assert.match(voidFn, /void_reason_encrypted = extensions\.pgp_sym_encrypt/);
  assert.doesNotMatch(migrationSql, /DELETE FROM public\.patient_instrument_applications WHERE (?!patient_id = v_req\.patient_id)/);
});

test('migração: só vê e aplica quem atende o paciente na disciplina, na mesma clínica', () => {
  const access = functionBody(migrationSql, 'can_use_patient_instruments');
  assert.match(access, /public\.can_access_clinical_data\(p_user\)/);
  assert.match(access, /p_discipline = ANY\(public\.user_disciplines\(p_user\)\)/);
  // Atende = atendimento dele na Agenda nessa área...
  assert.match(access, /appointment\.professional_id = p_user/);
  assert.match(access, /appointment\.discipline = p_discipline/);
  assert.match(access, /appointment\.clinic_id = public\.user_clinic_id\(p_user\)/);
  // ...ou responsável pela matrícula. Matrícula sozinha (sem ser dele) não basta.
  assert.match(access, /enrollment\.status = 'active'/);
  assert.match(access, /enrollment\.clinic_id = public\.user_clinic_id\(p_user\)/);
  assert.match(access, /\(enrollment\.assigned_to = p_user OR enrollment\.referred_by = p_user\)/);

  const list = functionBody(migrationSql, 'list_patient_instrument_applications');
  assert.match(list, /can_use_patient_instruments\(p_patient_id, p_discipline, v_uid\)/);
  assert.match(list, /pia\.clinic_id = public\.user_clinic_id\(v_uid\)/);
  assert.match(list, /LIMIT 500/);

  for (const name of ['can_use_patient_instruments', 'record_patient_instrument_application', 'list_patient_instrument_applications', 'void_patient_instrument_application']) {
    const body = functionBody(migrationSql, name);
    assert.match(body, /SECURITY DEFINER\r?\n\s*SET search_path = pg_catalog/, `${name}: search_path fixo`);
    assert.match(migrationSql, new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\([^)]*\\) FROM PUBLIC, anon;`), `${name}: sem anon`);
  }
});

test('migração: exclusão de paciente copia a versão viva e só acrescenta as escalas', async () => {
  const original = functionBody(await readFile(ERASURE_ORIGINAL, 'utf8'), 'admin_decide_patient_deletion');
  const updated = functionBody(migrationSql, 'admin_decide_patient_deletion');
  const lines = text => text.split(/\r?\n/);
  const added = lines(updated).filter(line => line.includes('patient_instrument_applications'));
  assert.equal(added.length, 2, 'snapshot + DELETE');
  assert.ok(added.some(line => line.includes("'patient_instrument_applications', (SELECT coalesce(jsonb_agg")), 'entra no snapshot');
  assert.ok(added.some(line => /DELETE FROM public\.patient_instrument_applications WHERE patient_id = v_req\.patient_id;/.test(line)));
  assert.deepEqual(
    lines(updated).filter(line => !line.includes('patient_instrument_applications')),
    lines(original),
    'o resto da função é idêntico à versão de 20260915b',
  );
  assert.ok(
    updated.indexOf('INSERT INTO patient_erasure_backup.snapshots') < updated.indexOf('DELETE FROM public.patient_instrument_applications'),
    'snapshot antes de apagar',
  );
});
