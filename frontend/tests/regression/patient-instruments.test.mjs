import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

// Escalas clínicas, etapa 1 (consultório) — caminho C escolhido em
// 08/10/2026. Cobre: definição dos instrumentos (faixas sem buraco, soma
// certa), cálculo e risco, payload que vai cifrado, data da aplicação,
// regras da migração (acesso por disciplina + matrícula, cifra, sem
// acesso direto à tabela, exclusão de paciente) e a aba na Psicologia.
// Etapa 2 (Área do Paciente, mesmo dia): espelho do servidor, perguntas
// do portal com o aviso de risco, migração 20261011 e as telas novas.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = rel => readFile(path.join(root, 'src', rel), 'utf8');
const MIGRATION = path.resolve(root, '../supabase/migrations/20261008_patient_instruments.sql');
const ERASURE_ORIGINAL = path.resolve(root, '../supabase/migrations/20260915b_patient_suspend_and_erasure.sql');
const PORTAL_MIGRATION = path.resolve(root, '../supabase/migrations/20261011_patient_instruments_portal.sql');
const shared = name => import(pathToFileURL(path.resolve(root, '../supabase/functions/_shared', name)).href);

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

// ---- espelho do servidor (etapa 2) -----------------------------------------

test('cálculo do servidor (_shared/instrumentScoring.ts) dá o mesmo resultado da tela', async () => {
  const back = await import(pathToFileURL(path.resolve(root, '../supabase/functions/_shared/instrumentScoring.ts')).href);
  // Sorteio com semente fixa: os mesmos casos em toda máquina.
  let seed = 20261008;
  const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const values = [0, 1, 2, 3, 4, -1, '2', null, undefined, 1.5];

  for (const instrument of instruments.CLINICAL_INSTRUMENTS) {
    const cases = [
      {},
      fill(instrument, 0),
      { ...fill(instrument, 0), dificuldade: 2 },
      { ...fill(instrument, 3), dificuldade: 3, intrusa: 1 },
      { q1: 1, q9: 1 },
    ];
    for (let n = 0; n < 200; n += 1) {
      const answers = {};
      for (const item of [...instrument.items, ...instrument.extraItems]) {
        if (random() < 0.9) answers[item.id] = values[Math.floor(random() * values.length)];
      }
      cases.push(answers);
    }

    for (const answers of cases) {
      const label = `${instrument.id} ${JSON.stringify(answers)}`;
      assert.deepEqual(back.scoreInstrument(instrument, answers), scoring.scoreInstrument(instrument, answers), label);
      assert.deepEqual(back.sanitizeInstrumentAnswers(instrument, answers), scoring.sanitizeInstrumentAnswers(instrument, answers), label);
      assert.deepEqual(
        back.visibleExtraItems(instrument, answers).map(item => item.id),
        scoring.visibleExtraItems(instrument, answers).map(item => item.id),
        label,
      );
      const run = lib => {
        try {
          return lib.buildApplicationPayload(instrument, answers, ' nota ');
        } catch (error) {
          return { error: error.message };
        }
      };
      assert.deepEqual(run(back), run(scoring), label);
    }
  }
  assert.equal(back.INSTRUMENT_NOTE_MAX, scoring.INSTRUMENT_NOTE_MAX);
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
  const match = sql.match(new RegExp(`CREATE (?:OR REPLACE )?FUNCTION public\\.${name}\\([\\s\\S]*?\\$${name}\\$;`));
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

// ---- etapa 2: escala respondida em casa (Área do Paciente) ----------------

test('portal: instruções, itens obrigatórios, aviso de risco só no item 9 e dificuldade opcional', async () => {
  const portal = await server.ssrLoadModule('/src/utils/instrumentPortal.js');
  const questions = portal.buildPortalQuestions(instruments.PHQ9);
  assert.equal(questions[0].type, 'section');
  assert.equal(questions[0].help, instruments.PHQ9.instructions);
  assert.equal(questions.filter(question => question.type === 'single' && question.required).length, 9);

  const q9 = instruments.PHQ9.items.find(item => item.id === 'q9');
  assert.deepEqual(
    questions.find(question => question.id === 'q9').riskNotice.values,
    q9.options.filter(option => option.value >= q9.risk.fromValue).map(option => option.label),
  );
  assert.equal(questions.filter(question => question.riskNotice).length, 1);
  const extra = questions.find(question => question.id === 'dificuldade');
  assert.equal(extra.required, false);
  assert.equal(extra.help, portal.EXTRA_ITEM_HELP);
  assert.equal(portal.buildPortalQuestions(instruments.GAD7).filter(question => question.riskNotice).length, 0);

  // O paciente marca o rótulo; o rótulo vira ponto pela definição da escala.
  const labels = Object.fromEntries(instruments.PHQ9.items.map(item => [item.id, item.options[2].label]));
  const payload = portal.buildPortalPayload(instruments.PHQ9, labels);
  assert.equal(payload.result.score, 18);
  assert.deepEqual(payload.result.riskItems, ['q9']);
  assert.deepEqual(payload, scoring.buildApplicationPayload(instruments.PHQ9, fill(instruments.PHQ9, 2)));

  assert.ok(portal.hasRiskAnswer(questions, labels));
  assert.ok(!portal.hasRiskAnswer(questions, { ...labels, q9: q9.options[0].label }));
  assert.ok(!portal.hasRiskAnswer(questions, { q9: 'Resposta que não existe' }));

  // Respondida em casa não há atendimento acontecendo: a orientação muda.
  const [office] = scoring.riskMessages(instruments.PHQ9, ['q9']);
  const [home] = scoring.riskMessages(instruments.PHQ9, ['q9'], { source: 'area_do_paciente' });
  assert.match(office.message, /ainda neste atendimento/);
  assert.match(home.message, /marcada pelo paciente em casa/);
  assert.doesNotMatch(home.message, /neste atendimento/);
  const panel = await src('components/instruments/PatientInstrumentsPanel.jsx');
  assert.ok(panel.includes('riskMessages(instrument, app.result.riskItems || [], { source: app.source })'), 'alerta usa a orientação da origem');
});

test('portal: o servidor monta as mesmas perguntas e calcula a mesma nota da tela', async () => {
  const portal = await server.ssrLoadModule('/src/utils/instrumentPortal.js');
  const back = await shared('instrumentPortal.ts');
  const serverDefs = await shared('clinicalInstruments.ts');

  // Definições do servidor geradas da fonte única (scripts/sync-instrument-mirror.mjs).
  const mirror = await import(pathToFileURL(path.resolve(root, 'scripts/sync-instrument-mirror.mjs')).href);
  const { body } = await mirror.buildInstrumentMirror();
  assert.equal(
    (await readFile(mirror.MIRROR_TARGET, 'utf8')).replace(/\r\n/g, '\n'),
    body.replace(/\r\n/g, '\n'),
    'clinicalInstruments.ts desatualizado: rode node frontend/scripts/sync-instrument-mirror.mjs',
  );
  assert.equal(serverDefs.getServerInstrument('phq9', 99), null, 'versão desconhecida não é adivinhada');
  assert.equal(back.EXTRA_ITEM_HELP, portal.EXTRA_ITEM_HELP);
  assert.equal(back.INSTRUCTIONS_SECTION_ID, portal.INSTRUCTIONS_SECTION_ID);
  const backScoring = await shared('instrumentScoring.ts');
  for (const source of [null, 'consultorio', 'area_do_paciente']) {
    assert.deepEqual(
      backScoring.riskMessages(serverDefs.getServerInstrument('phq9', instruments.PHQ9.version), ['q9'], { source }),
      scoring.riskMessages(instruments.PHQ9, ['q9'], { source }),
      String(source),
    );
  }

  let seed = 20261011;
  const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (const instrument of instruments.CLINICAL_INSTRUMENTS) {
    const serverInstrument = serverDefs.getServerInstrument(instrument.id, instrument.version);
    assert.ok(serverInstrument, `${instrument.id} sem definição no servidor`);
    assert.deepEqual(back.buildPortalQuestions(serverInstrument), portal.buildPortalQuestions(instrument), instrument.id);

    for (let n = 0; n < 200; n += 1) {
      const answers = {};
      for (const item of [...instrument.items, ...instrument.extraItems]) {
        const labels = [...item.options.map(option => option.label), 'Outra coisa', '', null];
        if (random() < 0.9) answers[item.id] = labels[Math.floor(random() * labels.length)];
      }
      const run = (lib, definition) => {
        try {
          return lib.buildPortalPayload(definition, answers);
        } catch (error) {
          return { error: error.message };
        }
      };
      assert.deepEqual(back.answersToValues(serverInstrument, answers), portal.answersToValues(instrument, answers));
      assert.deepEqual(run(back, serverInstrument), run(portal, instrument), `${instrument.id} ${JSON.stringify(answers)}`);
    }
  }
});

test('tela do paciente: CVV e SAMU aparecem só quando marca a resposta de risco', async () => {
  const portal = await server.ssrLoadModule('/src/utils/instrumentPortal.js');
  const { PatientFormQuestion } = await server.ssrLoadModule('/src/components/patientForms/PatientFormQuestion.jsx');
  const q9 = portal.buildPortalQuestions(instruments.PHQ9).find(question => question.id === 'q9');
  const render = value => renderToStaticMarkup(React.createElement(PatientFormQuestion, {
    question: q9,
    answers: value === undefined ? {} : { q9: value },
    onChange: () => {},
  }));
  for (const value of q9.riskNotice.values) {
    const html = render(value);
    assert.match(html, /href="tel:188"/);
    assert.match(html, /href="tel:192"/);
  }
  assert.doesNotMatch(render(q9.options[0]), /tel:188/);
  assert.doesNotMatch(render(undefined), /tel:188/);

  const page = await src('PatientPortalPage.jsx');
  assert.match(page, /hasRiskAnswer\(/, 'apoio aparece de novo depois de enviar');
});

test('Edge Function: escala com perguntas e nota da definição oficial, nunca do aparelho', async () => {
  const edge = await readFile(path.resolve(root, '../supabase/functions/patient-portal/index.ts'), 'utf8');
  assert.match(edge, /getServerInstrument\(String\(assignment\.instrument_id/);
  assert.match(edge, /questions: instrument \? buildPortalQuestions\(instrument\) : null/);
  assert.match(edge, /const answers = sanitizeAnswers\(questions, body\.answers\)/);
  assert.match(edge, /instrumentPayload = buildPortalPayload\(instrument, answers\)/);
  assert.match(edge, /p_instrument_payload: instrumentPayload/);
  assert.match(edge, /case 'invalid_instrument':/);
});

test('migração da etapa 2: código, envio, resposta e alerta com a permissão certa', async () => {
  const sql = await readFile(PORTAL_MIGRATION, 'utf8');

  // Código: gerar e ver seguem a configuração; trocar e liberar ficam como
  // em 20261006 (só a administração).
  assert.match(sql, /portal_professionals_manage_access BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.match(functionBody(sql, 'clinic_admin_set_portal_access_policy'), /NOT public\.is_clinic_admin\(v_actor\)/);
  const manage = functionBody(sql, 'can_manage_patient_access');
  assert.match(manage, /public\.can_manage_patient_portal\(p\.clinic_id, p_user\)/);
  assert.match(manage, /c\.portal_professionals_manage_access IS TRUE AND public\.user_attends_patient\(p_patient, p_user\)/);
  assert.match(functionBody(sql, 'user_attends_patient'), /public\.can_use_patient_instruments\(p_patient, discipline\.id, p_user\)/);
  assert.match(sql, /CREATE POLICY patient_portal_access_select[\s\S]*?USING \(public\.can_manage_patient_access\(patient_id\)\);/);
  assert.match(functionBody(sql, 'portal_ensure_access'), /NOT public\.can_manage_patient_access\(p_patient_id\)/);
  assert.doesNotMatch(sql, /FUNCTION public\.(portal_regenerate_code|portal_set_access_active)\(/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.portal_ensure_access_row\(UUID\) FROM PUBLIC, anon, authenticated;/);

  // Envio: quem atende ou a administração, e só com alguém para receber a nota.
  const send = functionBody(sql, 'portal_send_instrument');
  assert.match(send, /public\.can_manage_patient_portal\(v_clinic, v_uid\)\r?\n\s*OR public\.can_use_patient_instruments\(p_patient_id, p_discipline, v_uid\)/);
  assert.match(send, /AND public\.can_use_patient_instruments\(p_patient_id, p_discipline, pr\.id\)/);
  assert.match(send, /Ninguém da área desta escala atende o paciente/);
  assert.match(send, /f\.status IN \('pending', 'in_progress'\)/, 'sem dois envios abertos da mesma escala');

  // Resposta: só pela Edge Function, com o resultado junto e na mesma transação.
  const save = functionBody(sql, 'portal_save_answers');
  assert.match(save, /'invalid_instrument'/);
  assert.match(save, /'area_do_paciente'/);
  assert.match(save, /v_row\.id, v_has_risk/, 'idempotência pelo id do envio');
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.portal_save_answers\([^)]*\) FROM PUBLIC, anon, authenticated;/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.portal_save_answers\([^)]*\) TO service_role;/);
  assert.match(functionBody(sql, 'portal_admin_read_answers'), /AND f\.kind = 'form'/, 'resposta de escala não vai para a administração');

  // Alerta: só quem atende vê e marca; no consultório nasce visto.
  const alerts = functionBody(sql, 'list_my_instrument_risk_alerts');
  assert.match(alerts, /public\.can_use_patient_instruments\(pia\.patient_id, pia\.discipline, v_uid\)/);
  assert.match(alerts, /pia\.risk_acknowledged_at IS NULL/);
  assert.match(alerts, /pia\.voided_at IS NULL/);
  assert.match(functionBody(sql, 'acknowledge_instrument_risk'), /public\.can_use_patient_instruments\(v_row\.patient_id, v_row\.discipline, v_uid\)/);
  assert.match(functionBody(sql, 'record_patient_instrument_application'), /CASE WHEN v_has_risk THEN v_uid END/);

  assert.doesNotMatch(sql, /ON CONFLICT \(/, 'ON CONFLICT só com ON CONSTRAINT (AGENTS.md §9)');
  assert.doesNotMatch(sql, /CREATE TABLE/, 'tabela nova com paciente precisaria entrar na exclusão');
  for (const name of [
    'clinic_admin_set_portal_access_policy', 'user_attends_patient', 'can_manage_patient_access', 'portal_ensure_access',
    'list_my_instrument_risk_alerts', 'acknowledge_instrument_risk', 'portal_send_instrument', 'list_patient_instrument_requests',
    'cancel_patient_instrument_request', 'portal_admin_read_answers',
  ]) {
    assert.match(functionBody(sql, name), /SECURITY DEFINER\r?\n\s*SET search_path = pg_catalog/, `${name}: search_path fixo`);
    if (name !== 'portal_ensure_access') {
      assert.match(sql, new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\([^)]*\\) FROM PUBLIC, anon;`), `${name}: sem anon`);
    }
  }
});

test('telas da etapa 2: alerta na tela inicial, envio pela aba e pela ficha, Configurações', async () => {
  const home = await src('components/HomeConsole.jsx');
  assert.match(home, /variant !== 'reception' && \(\r?\n\s*<InstrumentRiskAlerts/, 'recepção não recebe alerta clínico');

  const alerts = await src('components/instruments/InstrumentRiskAlerts.jsx');
  assert.match(alerts, /O aviso lembra, nunca decide/);
  assert.match(alerts, /Vi o alerta/);

  const panel = await src('components/instruments/PatientInstrumentsPanel.jsx');
  assert.match(panel, /<InstrumentPortalBox/);
  assert.match(panel, /Vi o alerta/);
  assert.match(panel, /Respondida em casa/);

  assert.match(await src('components/patientForms/PatientPortalTab.jsx'), /<SendInstrumentForm/);
  assert.match(await src('components/patientForms/AssignmentList.jsx'), /const hasAnswers = !isInstrument && /);

  const service = await src('services/patientInstrumentService.js');
  for (const rpc of ['portal_send_instrument', 'list_patient_instrument_requests', 'cancel_patient_instrument_request', 'acknowledge_instrument_risk', 'list_my_instrument_risk_alerts']) {
    assert.match(service, new RegExp(`supabase\\.rpc\\('${rpc}'`), rpc);
  }

  const gestao = await src('components/panels/RelatoriosGestao.jsx');
  assert.match(gestao, /section === 'acessopaciente' && <AcessoPaciente profile=\{profile\} \/>/);
  const config = await src('components/panels/AcessoPaciente.jsx');
  assert.match(config, /await setClinicPortalPolicy\(next\)/);
  assert.match(config, /setAllowed\(previous\)/, 'volta à escolha anterior se o banco recusar');
});
