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
  assert.ok(instruments.CLINICAL_INSTRUMENTS.length >= 3);
  for (const instrument of instruments.CLINICAL_INSTRUMENTS) {
    assert.deepEqual(scoring.validateInstrumentDefinition(instrument), [], instrument.id);
    // Escala sem ponto de corte clínico (Rosenberg): nenhuma faixa, nem inventada.
    if (instrument.noBands) {
      assert.deepEqual(instrument.bands, [], instrument.id);
      continue;
    }
    // Uma régua por nota: a escala inteira ou cada subescala (DASS-21).
    // Nota por média anda de 0,01 em 0,01 (`scoring.step`).
    for (const view of format.scoreViews(instrument)) {
      // Na média por subescala (Autocompaixão) só o total tem faixa; nas
      // outras escalas toda nota tem.
      if (!view.bands.length) {
        assert.equal(instrument.scoring.method, 'subscale_means', `${instrument.id}/${view.id}: nota sem faixa`);
        assert.notEqual(view.id, 'total', `${instrument.id}: o total precisa de faixa`);
        continue;
      }
      const step = view.scoring.step || 1;
      const steps = Math.round((view.scoring.max - view.scoring.min) / step);
      for (let index = 0; index <= steps; index += 1) {
        const score = Math.round((view.scoring.min + index * step) * 100) / 100;
        const matches = view.bands.filter(band => score >= band.min && score <= band.max);
        assert.equal(matches.length, 1, `${instrument.id}/${view.id}: ${score} pontos em ${matches.length} faixas`);
      }
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

test('escalas só na Psicologia, em conferência até a psicóloga aprovar', () => {
  const psi = instruments.instrumentsForDiscipline('psicologia').map(instrument => instrument.id);
  assert.deepEqual(psi, ['phq9', 'phq8', 'gad7', 'phq4', 'dass21', 'k10', 'k6', 'pcl5', 'phq15', 'asrs6', 'rosenberg', 'scs', 'scssf']);
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
  // (20261012 tirou o referred_by: ver instrument-responsible.test.mjs.)
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
  assert.match(functionBody(sql, 'portal_admin_read_answers'), /AND f\.kind = 'form'/, 'escala abre pelo resultado da aplicação (list_patient_instrument_applications), não pelas respostas cruas');

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

  // Alerta da tela inicial leva direto às Escalas da paciente.
  const app = await src('App.jsx');
  assert.match(app, /onOpenInstrumentAlert=\{openInstrumentAlert\}/);
  assert.match(app, /if \(patient\) selectPatient\(patient\);\r?\n\s*handleSelectDiscipline\(discipline, patient \? 'escalas' : null\);/);
  assert.match(app, /entryView=\{workspaceEntryView\}/);
  const workspace = await src('components/PsychologyWorkspace.jsx');
  assert.match(workspace, /entryView === 'escalas' && selectedPatient \? PSYCHOLOGY_TABS\.ESCALAS : PSYCHOLOGY_TABS\.HOME/);
  assert.match(alerts, /onClick=\{\(\) => onOpen\(alert\)\}>\r?\n\s*Ver resultado/);

  const gestao = await src('components/panels/RelatoriosGestao.jsx');
  assert.match(gestao, /section === 'acessopaciente' && <AcessoPaciente profile=\{profile\} \/>/);
  const config = await src('components/panels/AcessoPaciente.jsx');
  assert.match(config, /await setClinicPortalPolicy\(next\)/);
  assert.match(config, /setAllowed\(previous\)/, 'volta à escolha anterior se o banco recusar');
});

// 09/10/2026: a administradora mandou, a paciente respondeu, e o resultado
// só existia dentro da aba Escalas. O envio agora tem "Ver resultado".
test('envio respondido: "Ver resultado" abre a aplicação gravada por aquele envio', async () => {
  const request = { id: 'r1', kind: 'instrument', instrument_id: 'phq9', submitted_at: '2026-10-09T14:17:10.454601+00:00' };
  const fromHome = { id: 'a1', source: 'area_do_paciente', instrumentId: 'phq9', appliedAt: '2026-10-09T14:17:10.454601Z' };
  const apps = [
    { id: 'a0', source: 'consultorio', instrumentId: 'phq9', appliedAt: request.submitted_at },
    { id: 'a2', source: 'area_do_paciente', instrumentId: 'gad7', appliedAt: request.submitted_at },
    { id: 'a3', source: 'area_do_paciente', instrumentId: 'phq9', appliedAt: '2026-10-02T10:00:00Z' },
    fromHome,
  ];
  assert.equal(format.findRequestApplication(apps, request), fromHome);
  assert.equal(format.findRequestApplication(apps.slice(0, 3), request), null);
  const rounded = { ...fromHome, id: 'a4', appliedAt: '2026-10-09T14:17:10Z' };
  assert.equal(format.findRequestApplication([...apps.slice(0, 3), rounded], request), rounded, 'horário arredondado ainda casa');
  const twoSecondsLater = { ...fromHome, id: 'a5', appliedAt: '2026-10-09T14:17:12.6Z' };
  assert.equal(format.findRequestApplication([twoSecondsLater], request), null, 'outra resposta não casa');
  assert.equal(format.findRequestApplication(apps, { ...request, submitted_at: null }), null, 'envio ainda aberto');
  assert.ok(format.isInstrumentAccessDenied('Acesso negado: o paciente não está em atendimento nesta área com você.'));

  const { AssignmentList } = await server.ssrLoadModule('/src/components/patientForms/AssignmentList.jsx');
  const row = { id: 'r1', patient_id: 'p1', form_title: 'Questionário PHQ-9', created_at: '2026-10-09T12:00:00Z', due_date: null };
  const html = renderToStaticMarkup(React.createElement(AssignmentList, {
    assignments: [
      { ...row, kind: 'instrument', status: 'submitted', submitted_at: request.submitted_at },
      { ...row, id: 'r2', kind: 'instrument', status: 'in_progress', progress: 40 },
      { ...row, id: 'r3', kind: 'form', form_title: 'Ficha', status: 'submitted', submitted_at: request.submitted_at },
    ],
    onView: () => {},
    onChanged: () => {},
  }));
  assert.equal((html.match(/>Ver resultado</g) || []).length, 1, 'só a escala respondida');
  assert.equal((html.match(/>Ver respostas</g) || []).length, 1, 'formulário continua com as respostas');
  assert.doesNotMatch(html, /Ver o que já respondeu/, 'escala pela metade não mostra respostas');

  for (const file of ['components/patientForms/Importaveis.jsx', 'components/patientForms/PatientPortalTab.jsx']) {
    const source = await src(file);
    assert.match(source, /viewing\?\.kind === 'instrument' && \(\r?\n\s*<InstrumentRequestResult request=\{viewing\} currentUserId=\{profile\?\.id\}/, file);
    assert.match(source, /viewing && viewing\.kind !== 'instrument' && \(\r?\n\s*<FormResponseDialog/, file);
  }
  const result = await src('components/instruments/InstrumentRequestResult.jsx');
  assert.match(result, /listInstrumentApplications\(\{ patientId: request\.patient_id, discipline: request\.discipline \}\)/, 'quem vê continua decidido no banco');
  assert.match(result, /findRequestApplication\(applications, request\)/);
  assert.match(await src('services/patientPortalService.js'), /kind,instrument_id,instrument_version,discipline,/);
});

// ---- lote 1: DASS-21 (10/10/2026) ----------------------------------------
// Três notas (depressão, ansiedade, estresse), cada uma soma 7 perguntas e
// multiplica por 2; faixas do manual (Lovibond, 1995). Texto da tradução
// de Vignola e Tucci do site oficial (domínio público). Respostas da
// validação (4), nunca uma quinta inventada (escolha de 10/10/2026).

test('DASS-21: 21 perguntas da tradução oficial, 4 respostas e cada pergunta numa subescala só', () => {
  const dass = instruments.DASS21;
  assert.equal(dass.items.length, 21);
  assert.equal(dass.items[0].text, 'Achei difícil me acalmar');
  assert.equal(dass.items[20].text, 'Senti que a vida não tinha sentido');
  for (const item of dass.items) {
    assert.deepEqual(item.options.map(option => option.value), [0, 1, 2, 3], item.id);
  }
  // Chave de correção do manual.
  const byId = Object.fromEntries(dass.scoring.subscales.map(sub => [sub.id, sub.items]));
  assert.deepEqual(byId.depressao, ['q3', 'q5', 'q10', 'q13', 'q16', 'q17', 'q21']);
  assert.deepEqual(byId.ansiedade, ['q2', 'q4', 'q7', 'q9', 'q15', 'q19', 'q20']);
  assert.deepEqual(byId.estresse, ['q1', 'q6', 'q8', 'q11', 'q12', 'q14', 'q18']);
  assert.equal(dass.scoring.multiplier, 2);
  assert.ok(dass.items.every(item => !item.risk), 'a DASS-21 não tem item de risco: nada inventado');
  assert.match(dass.license, /domínio público/);

  const broken = { ...dass, scoring: { ...dass.scoring, subscales: dass.scoring.subscales.slice(0, 2) } };
  assert.ok(scoring.validateInstrumentDefinition(broken).some(problem => problem.includes('q1: está em 0 subescalas')));
});

test('DASS-21: cada nota soma a subescala, multiplica por 2 e cai na faixa do manual', () => {
  const dass = instruments.DASS21;
  const answers = Object.fromEntries(dass.items.map(item => [item.id, 0]));
  // Depressão: 1+1+1+1+1+1+1 = 7 → 14 (moderada, 14 a 20).
  for (const id of ['q3', 'q5', 'q10', 'q13', 'q16', 'q17', 'q21']) answers[id] = 1;
  // Ansiedade: 4 → 8 (leve, 8 a 9).
  answers.q2 = 2;
  answers.q4 = 2;
  // Estresse: 17 → 34 (extremamente grave, a partir de 34).
  Object.assign(answers, { q1: 3, q6: 3, q8: 3, q11: 3, q12: 3, q14: 2, q18: 0 });

  const result = scoring.scoreInstrument(dass, answers);
  assert.equal(result.complete, true);
  assert.equal(result.score, null, 'não existe nota única na DASS-21');
  assert.deepEqual(result.subscales.map(sub => [sub.id, sub.score, sub.band.id]), [
    ['depressao', 14, 'moderada'],
    ['ansiedade', 8, 'leve'],
    ['estresse', 34, 'extremamente_grave'],
  ]);

  // Limites das faixas, já multiplicados por 2.
  const bandAt = (subscaleId, score) => scoring.bandIn(
    dass.scoring.subscales.find(sub => sub.id === subscaleId).bands, score,
  ).id;
  assert.equal(bandAt('depressao', 8), 'normal');
  assert.equal(bandAt('depressao', 10), 'leve');
  assert.equal(bandAt('depressao', 28), 'extremamente_grave');
  assert.equal(bandAt('ansiedade', 6), 'normal');
  assert.equal(bandAt('ansiedade', 20), 'extremamente_grave');
  assert.equal(bandAt('estresse', 14), 'normal');
  assert.equal(bandAt('estresse', 26), 'grave');

  // Pela metade: subescala completa já tem nota; a escala ainda não salva.
  const partial = scoring.scoreInstrument(dass, { q3: 1, q5: 1, q10: 1, q13: 1, q16: 1, q17: 1, q21: 1 });
  assert.equal(partial.complete, false);
  assert.equal(partial.subscales[0].score, 14);
  assert.equal(partial.subscales[1].score, null);
  assert.throws(() => scoring.buildApplicationPayload(dass, { q1: 0 }), /Responda as 21 perguntas/);

  // O que vai cifrado: as três notas com a faixa de cada uma.
  const payload = scoring.buildApplicationPayload(dass, answers);
  assert.deepEqual(payload.result.subscales.map(sub => [sub.label, sub.score, sub.bandLabel]), [
    ['Depressão', 14, 'Moderada'],
    ['Ansiedade', 8, 'Leve'],
    ['Estresse', 34, 'Extremamente grave'],
  ]);
  assert.equal(payload.result.score, null);
  assert.deepEqual(payload.result.riskItems, []);
  // PHQ-9 continua sem subescalas no que é gravado.
  assert.equal('subscales' in scoring.buildApplicationPayload(instruments.PHQ9, fill(instruments.PHQ9, 1)).result, false);
});

test('DASS-21 na tela: três notas no cartão, no gráfico, no histórico e na janela do resultado', async () => {
  const dass = instruments.DASS21;
  const views = format.scoreViews(dass);
  assert.deepEqual(views.map(view => [view.id, view.short, view.scoring.max]), [
    ['depressao', 'D', 42], ['ansiedade', 'A', 42], ['estresse', 'E', 42],
  ]);
  assert.equal(format.scoreViews(instruments.PHQ9).length, 1);
  // "a DASS-21" (escala), "o PHQ-9" (questionário): nada de "O DASS-21 pede".
  assert.equal(format.namedInstrument(dass), 'a DASS-21');
  assert.equal(format.namedInstrument(dass, 'de'), 'da DASS-21');
  assert.equal(format.namedInstrument(instruments.PHQ9, 'de'), 'do PHQ-9');
  assert.match(await src('components/instruments/InstrumentApplyForm.jsx'), /\{upperFirst\(namedInstrument\(instrument\)\)\} pede pelo menos/);

  const answers = Object.fromEntries(dass.items.map(item => [item.id, 1]));
  const payload = scoring.buildApplicationPayload(dass, answers);
  const app = { id: 'a1', appliedAt: '2026-10-10T12:00:00Z', result: payload.result, answers: payload.answers, source: 'consultorio' };
  assert.equal(format.validApplications([app]).length, 1, 'aplicação sem nota única continua válida');
  assert.deepEqual(views.map(view => view.read(app.result).score), [14, 14, 14]);
  assert.equal(format.viewApplications([app], views[2])[0].result.score, 14);
  assert.match(
    format.savedNotice(dass, { payload }).text,
    /^DASS-21 salvo: depressão 14 pontos \(moderada\), ansiedade 14 pontos \(moderada\), estresse 14 pontos \(normal\)\.$/,
  );

  const { InstrumentApplicationDialog } = await server.ssrLoadModule('/src/components/instruments/InstrumentApplicationDialog.jsx');
  const html = renderToStaticMarkup(React.createElement(InstrumentApplicationDialog, {
    application: { ...app, appliedByName: 'Denise N.' },
    instrument: dass,
    canVoid: false,
    onClose: () => {},
  }));
  for (const label of ['Depressão', 'Ansiedade', 'Estresse']) assert.match(html, new RegExp(`>${label}<`));
  assert.match(html, /multiplica por 2, como no manual/);
  assert.doesNotMatch(html, /Soma das 21 perguntas/);

  // Faixas estreitas da ansiedade (Leve = 8 a 9 numa régua de 0 a 42):
  // os nomes não podem ficar um em cima do outro.
  const chart = renderToStaticMarkup(React.createElement(TrendChart, {
    instrument: { ...dass, shortName: 'DASS-21 · Ansiedade', scoring: views[1].scoring, bands: views[1].bands },
    applications: format.viewApplications([app], views[1]),
  }));
  const labelYs = [...chart.matchAll(/class="instrument-band-label" x="[\d.]+" y="([\d.]+)"/g)].map(match => Number(match[1])).sort((a, b) => a - b);
  assert.equal(labelYs.length, 5);
  for (let index = 1; index < labelYs.length; index += 1) {
    assert.ok(labelYs[index] - labelYs[index - 1] >= 11.99, `nomes das faixas colados: ${labelYs.join(', ')}`);
  }
  // Números do eixo: 8 e 10 ficavam a ~8 px um do outro; um sai, o máximo fica.
  const tickYs = [...chart.matchAll(/class="instrument-axis-label" x="[\d.]+" y="([\d.]+)"[^>]*>(\d+)</g)]
    .map(match => ({ y: Number(match[1]), value: Number(match[2]) }))
    .sort((a, b) => a.y - b.y);
  assert.ok(tickYs.some(tick => tick.value === 42), 'o máximo sempre aparece');
  for (let index = 1; index < tickYs.length; index += 1) {
    assert.ok(tickYs[index].y - tickYs[index - 1].y >= 10.99, `números do eixo colados: ${tickYs.map(tick => tick.value).join(', ')}`);
  }

  const panel = await src('components/instruments/PatientInstrumentsPanel.jsx');
  assert.match(panel, /const views = scoreViews\(instrument\);/);
  assert.match(panel, /className="instrument-chart-tabs" role="group"/, 'um gráfico por vez, com botões');
  assert.match(panel, /aria-pressed=\{chartView\.id === view\.id\}/);
  assert.match(panel, /views\.map\(view => `\$\{view\.short\} \$\{formatScore\(view\.read\(app\.result\)\.score\)\}`\)\.join\(' · '\)/);

  // Em casa: 21 perguntas obrigatórias, sem aviso de risco.
  const portal = await server.ssrLoadModule('/src/utils/instrumentPortal.js');
  const questions = portal.buildPortalQuestions(dass);
  assert.equal(questions.filter(question => question.type === 'single' && question.required).length, 21);
  assert.equal(questions.filter(question => question.riskNotice).length, 0);
});

// ---- lote 1: PCL-5 (10/10/2026) -------------------------------------------
// Forma "sem Critério A" da versão brasileira de Osório (2017), CC BY 4.0;
// original de domínio público (National Center for PTSD). Cinco respostas
// da validação (0 a 4), nota de 0 a 80 e só um ponto de corte.

test('PCL-5: 20 perguntas da versão brasileira, 5 respostas de 0 a 4 e nota de 0 a 80', () => {
  const pcl = instruments.PCL5;
  assert.equal(pcl.items.length, 20);
  assert.equal(pcl.items[0].text, 'Lembranças indesejáveis, perturbadoras e repetitivas da experiência estressante?');
  assert.equal(pcl.items[19].text, 'Problemas para adormecer ou continuar dormindo?');
  for (const item of pcl.items) {
    assert.deepEqual(item.options.map(option => [option.value, option.label]), [
      [0, 'De modo nenhum'], [1, 'Um pouco'], [2, 'Moderadamente'], [3, 'Muito'], [4, 'Extremamente'],
    ], item.id);
  }
  assert.deepEqual(pcl.scoring, { method: 'sum', min: 0, max: 80 });
  assert.match(pcl.license, /domínio público/);
  assert.match(pcl.instructions, /no último mês/);
  // O item 16 não vira alerta sozinho: a psicóloga decide (está na nota de conferência).
  assert.ok(pcl.items.every(item => !item.risk));
  assert.match(pcl.review.note, /item 16/);
});

test('PCL-5: ponto de corte da validação brasileira (36) e nenhuma faixa de gravidade inventada', () => {
  const pcl = instruments.PCL5;
  assert.equal(pcl.bands.length, 2);
  assert.equal(scoring.bandForScore(pcl, 35).id, 'abaixo_corte');
  assert.equal(scoring.bandForScore(pcl, 36).id, 'corte_ou_acima');
  assert.equal(scoring.bandForScore(pcl, 80).id, 'corte_ou_acima');
  assert.match(pcl.review.note, /36/);
  assert.match(pcl.review.note, /31 a 33/);

  assert.equal(scoring.scoreInstrument(pcl, fill(pcl, 4)).score, 80);
  assert.equal(scoring.scoreInstrument(pcl, fill(pcl, 0)).score, 0);
  const payload = scoring.buildApplicationPayload(pcl, { ...fill(pcl, 1), q1: 4, q2: 4, q3: 4, q4: 4, q5: 3, q6: 3 });
  assert.deepEqual([payload.result.score, payload.result.bandId], [36, 'corte_ou_acima']);
  assert.equal('subscales' in payload.result, false);
  assert.equal(format.scoreViews(pcl).length, 1);
  assert.equal(format.namedInstrument(pcl), 'a PCL-5');
});

// ---- lote 1, segunda leva: PHQ-4, K10, PHQ-15, ASRS-6 e Rosenberg ----------

// Nota exata numa escala de 10 a 50 (K10): todos em "Nunca" e o resto distribuído.
function k10Answers(target) {
  const answers = fill(instruments.K10, 1);
  let left = target - 10;
  for (const item of instruments.K10.items) {
    const add = Math.min(4, left);
    answers[item.id] += add;
    left -= add;
  }
  assert.equal(left, 0, `não deu para montar ${target} pontos`);
  return answers;
}

test('licença: texto brasileiro liberado também para uso comercial, nunca artigo CC BY-NC', async () => {
  for (const instrument of instruments.CLINICAL_INSTRUMENTS) {
    assert.doesNotMatch(instrument.license, /BY-NC/, instrument.id);
  }
  const source = await src('data/clinicalInstruments.js');
  assert.match(source, /Artigo CC BY-NC não\r?\n\/\/ basta\./);
});

test('PHQ-4: duas perguntas do GAD-7 e duas do PHQ-9, na ordem do formulário, e duas notas com corte 3', () => {
  const phq4 = instruments.PHQ4;
  const { GAD7, PHQ9 } = instruments;
  assert.deepEqual(phq4.items.map(item => item.text), [
    GAD7.items[0].text, GAD7.items[1].text, PHQ9.items[1].text, PHQ9.items[0].text,
  ]);
  for (const item of phq4.items) assert.deepEqual(item.options, PHQ9.items[0].options, item.id);
  assert.equal(phq4.scoring.method, 'subscales');
  assert.deepEqual(phq4.scoring.subscales.map(sub => [sub.id, sub.items]), [
    ['ansiedade', ['q1', 'q2']],
    ['depressao', ['q3', 'q4']],
  ]);

  const result = scoring.scoreInstrument(phq4, { q1: 2, q2: 1, q3: 0, q4: 2 });
  assert.equal(result.score, null, 'sem nota total: duas notas');
  assert.deepEqual(result.subscales.map(sub => [sub.id, sub.score, sub.band.id]), [
    ['ansiedade', 3, 'corte_ou_acima'],
    ['depressao', 2, 'abaixo_corte'],
  ]);
  const payload = scoring.buildApplicationPayload(phq4, { q1: 2, q2: 1, q3: 0, q4: 2 });
  assert.equal(
    format.savedNotice(phq4, { payload }).text,
    'PHQ-4 salvo: ansiedade (GAD-2) 3 pontos (no ponto de corte ou acima), depressão (PHQ-2) 2 pontos (abaixo do ponto de corte).',
  );
  assert.equal(format.scoreViews(phq4).length, 2);
  assert.match(phq4.review.note, /nota total/);
});

test('K10: tradução brasileira oficial, opções na ordem da folha e nota de 10 a 50', () => {
  const k10 = instruments.K10;
  assert.equal(k10.items.length, 10);
  assert.equal(k10.items[0].text, '...exausto (a) sem um bom motivo?');
  assert.equal(k10.items[8].text, 'Durante os últimos 30 dias, com que frequência você sentiu que tudo era um esforço?');
  for (const item of k10.items) {
    assert.deepEqual(item.options.map(option => [option.value, option.label]), [
      [5, 'O tempo todo'], [4, 'A maior parte do tempo'], [3, 'Parte do tempo'], [2, 'Um pouco'], [1, 'Nunca'],
    ], item.id);
  }
  assert.deepEqual(k10.scoring, { method: 'sum', min: 10, max: 50 });
  assert.match(k10.instructions, /marque a opção/);
  // O que o paciente lê: instrução, perguntas e respostas (a nota de conferência cita o original).
  assert.doesNotMatch(JSON.stringify([k10.instructions, k10.items]), /circule|freqü/);
  assert.equal(scoring.scoreInstrument(k10, fill(k10, 1)).score, 10);
  assert.equal(scoring.scoreInstrument(k10, fill(k10, 5)).score, 50);
  assert.equal(scoring.scoreInstrument(k10, fill(k10, 0)).score, null, 'zero não é resposta do K10');
  for (const [score, band] of [[15, 'baixo'], [16, 'moderado'], [21, 'moderado'], [22, 'alto'], [29, 'alto'], [30, 'muito_alto']]) {
    assert.equal(scoring.scoreInstrument(k10, k10Answers(score)).band.id, band, `${score} pontos`);
  }
  assert.match(k10.license, /Kessler/);
  assert.match(k10.review.note, /Andrews e Slade/);
  assert.equal(format.namedInstrument(k10), 'a K10');
});

test('PHQ-15: texto do PHQ brasileiro oficial, três respostas e nenhuma pergunta presa ao sexo do cadastro', () => {
  const phq15 = instruments.PHQ15;
  assert.equal(phq15.items.length, 15);
  for (const item of phq15.items) {
    assert.deepEqual(item.options.map(option => [option.value, option.label]), [
      [0, 'Não fui incomodado/a'], [1, 'Pouco incomodado/a'], [2, 'Muito incomodado/a'],
    ], item.id);
  }
  assert.ok(phq15.items.every(item => !/somente para mulheres/i.test(item.text)));
  assert.match(phq15.items[3].text, /se não se aplica a você, marque “Não fui incomodado\/a”/);
  assert.deepEqual(phq15.scoring, { method: 'sum', min: 0, max: 30 });
  assert.equal(scoring.scoreInstrument(phq15, fill(phq15, 2)).score, 30);
  for (const [score, band] of [[4, 'minima'], [5, 'baixa'], [9, 'baixa'], [10, 'media'], [14, 'media'], [15, 'alta']]) {
    assert.equal(scoring.bandForScore(phq15, score).id, band, `${score} pontos`);
  }
  assert.ok(phq15.items.every(item => !item.risk));
  assert.match(phq15.license, /Pfizer/);
});

test('ASRS-6: tradução brasileira oficial, nota de 0 a 24 com corte 14 e os dois tons de sombreado', async () => {
  const asrs = instruments.ASRS6;
  assert.equal(asrs.items.length, 6);
  for (const item of asrs.items) {
    assert.deepEqual(item.options.map(option => [option.value, option.label]), [
      [0, 'Nunca'], [1, 'Raramente'], [2, 'Algumas vezes'], [3, 'Frequentemente'], [4, 'Muito frequentemente'],
    ], item.id);
  }
  assert.deepEqual(asrs.items.map(item => item.shadeFrom), [2, 2, 2, 3, 3, 3]);
  assert.deepEqual(asrs.scoring, { method: 'sum', min: 0, max: 24 });
  assert.equal(scoring.scoreInstrument(asrs, fill(asrs, 4)).score, 24);
  for (const [score, band] of [[9, 'negativo_baixo'], [10, 'negativo_alto'], [13, 'negativo_alto'], [14, 'positivo_baixo'], [17, 'positivo_baixo'], [18, 'positivo_alto']]) {
    assert.equal(scoring.bandForScore(asrs, score).id, band, `${score} pontos`);
  }
  assert.match(asrs.license, /sombreado/);
  assert.match(asrs.review.note, /2024/);

  const broken = { ...asrs, items: asrs.items.map(item => ({ ...item, shadeFrom: 9 })) };
  assert.ok(scoring.validateInstrumentDefinition(broken).some(problem => problem.includes('sombreado')));

  // Área do Paciente: o servidor e a tela mandam os mesmos tons.
  const portal = await server.ssrLoadModule('/src/utils/instrumentPortal.js');
  const questions = portal.buildPortalQuestions(asrs);
  assert.deepEqual(questions.find(question => question.id === 'q1').shading.dark, ['Algumas vezes', 'Frequentemente', 'Muito frequentemente']);
  assert.deepEqual(questions.find(question => question.id === 'q4').shading.dark, ['Frequentemente', 'Muito frequentemente']);
  assert.ok(portal.buildPortalQuestions(instruments.PHQ9).every(question => !question.shading));

  const { PatientFormQuestion } = await server.ssrLoadModule('/src/components/patientForms/PatientFormQuestion.jsx');
  const q1 = renderToStaticMarkup(React.createElement(PatientFormQuestion, {
    question: questions.find(question => question.id === 'q1'), answers: {}, onChange: () => {},
  }));
  assert.equal((q1.match(/pq-option pq-option--shade-dark/g) || []).length, 3);
  assert.equal((q1.match(/pq-option pq-option--shade-light/g) || []).length, 2);
  const plain = renderToStaticMarkup(React.createElement(PatientFormQuestion, {
    question: portal.buildPortalQuestions(instruments.PHQ9).find(question => question.id === 'q1'), answers: {}, onChange: () => {},
  }));
  assert.doesNotMatch(plain, /shade/);

  // Consultório: os mesmos tons nos botões do formulário.
  const form = renderToStaticMarkup(React.createElement(ApplyForm, {
    instrument: asrs,
    patientName: 'Paciente Teste',
    patientId: '00000000-0000-0000-0000-000000000001',
    discipline: 'psicologia',
    onCancel: () => {},
    onSaved: () => {},
  }));
  assert.equal((form.match(/instrument-option--shade-dark/g) || []).length, 3 * 3 + 3 * 2);
  assert.equal((form.match(/instrument-option--shade-light/g) || []).length, 3 * 2 + 3 * 3);

  // Cinza neutro: nem âmbar (aviso) nem vermelho (risco).
  for (const [file, selector] of [['styles/patientForms.css', 'pq-option--shade-'], ['styles/instruments.css', 'instrument-option--shade-']]) {
    const css = await src(file);
    const rules = css.split('}').filter(rule => rule.includes(selector));
    assert.equal(rules.length, 2, file);
    for (const rule of rules) assert.doesNotMatch(rule, /danger|warning|amber|red-|#[0-9a-f]{3,6}/i, file);
  }
});

test('Rosenberg: versão EPM/Rosenberg, metade das frases invertida e nenhuma faixa inventada', () => {
  const ros = instruments.ROSENBERG;
  assert.equal(ros.items.length, 10);
  assert.equal(ros.items[0].text, 'De uma forma geral (apesar de tudo), estou satisfeito(a) comigo mesmo(a).');
  const labels = ['Concordo plenamente', 'Concordo', 'Discordo', 'Discordo plenamente'];
  for (const item of ros.items) {
    assert.deepEqual(item.options.map(option => option.label), labels, item.id);
    const reversed = ['q2', 'q5', 'q6', 'q8', 'q9'].includes(item.id);
    assert.deepEqual(item.options.map(option => option.value), reversed ? [0, 1, 2, 3] : [3, 2, 1, 0], item.id);
  }
  const best = Object.fromEntries(ros.items.map(item => [item.id, Math.max(...item.options.map(option => option.value))]));
  assert.equal(scoring.scoreInstrument(ros, best).score, 30, 'mais pontos, mais autoestima');
  const allAgree = Object.fromEntries(ros.items.map(item => [item.id, item.options[0].value]));
  assert.equal(scoring.scoreInstrument(ros, allAgree).score, 15, 'concordar com tudo empata as frases invertidas');

  assert.equal(ros.noBands, true);
  assert.deepEqual(ros.bands, []);
  assert.ok(scoring.validateInstrumentDefinition({ ...ros, bands: [{ id: 'x', label: 'X', min: 0, max: 30 }] })
    .some(problem => problem.includes('noBands')));
  const payload = scoring.buildApplicationPayload(ros, best);
  assert.deepEqual([payload.result.score, payload.result.bandId, payload.result.bandLabel], [30, null, null]);
  assert.equal(format.savedNotice(ros, { payload }).text, 'Rosenberg salvo: 30 pontos.');
  assert.match(ros.license, /domínio público/);
  assert.match(ros.license, /CC BY 4\.0/);
  assert.match(ros.review.note, /instrução/);

  const apps = [
    { id: 'b', appliedAt: '2026-10-06T12:00:00Z', result: { score: 22, bandLabel: null } },
    { id: 'a', appliedAt: '2026-09-01T12:00:00Z', result: { score: 18, bandLabel: null } },
  ];
  const html = renderToStaticMarkup(React.createElement(TrendChart, { instrument: ros, applications: apps }));
  for (const tick of ['0', '15', '30']) assert.match(html, new RegExp(`class="instrument-axis-label"[^>]*>${tick}<`), `régua ${tick}`);
  assert.doesNotMatch(html, /instrument-band-label/);
  assert.doesNotMatch(html, /faixa/);
});

test('Rosenberg na tela: o cartão diz que não há faixa, em vez de mostrar faixa vazia', async () => {
  const panel = await src('components/instruments/PatientInstrumentsPanel.jsx');
  assert.match(panel, /instrument\.noBands\r?\n\s*\? <span>Sem faixas clínicas: compare com as aplicações anteriores\.<\/span>/);
});

// ---- lote 3: PHQ-8, K6 e Escala de Autocompaixão (completa e reduzida) ----

test('nota com vírgula: inteira fica igual, média sai com duas casas', () => {
  assert.equal(format.formatScore(12), '12');
  assert.equal(format.formatScore(3.46), '3,46');
  assert.equal(format.formatScore(2.5), '2,5');
  assert.equal(format.formatScore(null), '—');
  assert.equal(format.pointsLabel(2.5), '2,5 pontos');
  assert.equal(format.differenceLabel(3.46, 3.25), 'Subiu 0,21 pontos em relação à anterior.');
  assert.equal(format.differenceLabel(3.1, 3.1), 'Igual à aplicação anterior.');
});

test('servidor e tela dão a mesma nota com todas as perguntas respondidas, inclusive as médias', async () => {
  const back = await import(pathToFileURL(path.resolve(root, '../supabase/functions/_shared/instrumentScoring.ts')).href);
  let seed = 20261012;
  const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (const instrument of instruments.CLINICAL_INSTRUMENTS) {
    for (let n = 0; n < 150; n += 1) {
      const answers = {};
      for (const item of instrument.items) {
        answers[item.id] = item.options[Math.floor(random() * item.options.length)].value;
      }
      const front = scoring.scoreInstrument(instrument, answers);
      assert.equal(front.complete, true, instrument.id);
      assert.deepEqual(back.scoreInstrument(instrument, answers), front, `${instrument.id} ${JSON.stringify(answers)}`);
      assert.deepEqual(back.buildApplicationPayload(instrument, answers), scoring.buildApplicationPayload(instrument, answers), instrument.id);
    }
  }
});

test('PHQ-8: as 8 primeiras perguntas do PHQ-9 brasileiro, sem item de risco, e faixas até 24', () => {
  const phq8 = instruments.PHQ8;
  assert.deepEqual(phq8.items.map(item => item.text), instruments.PHQ9.items.slice(0, 8).map(item => item.text));
  assert.ok(phq8.items.every(item => !item.risk), 'o PHQ-8 não rastreia risco');
  for (const item of phq8.items) assert.deepEqual(item.options, instruments.PHQ9.items[0].options, item.id);
  assert.deepEqual(phq8.extraItems.map(item => item.id), ['dificuldade']);
  assert.deepEqual(phq8.scoring, { method: 'sum', min: 0, max: 24 });
  assert.equal(scoring.scoreInstrument(phq8, fill(phq8, 3)).score, 24);
  for (const [score, band] of [[4, 'minima'], [5, 'leve'], [10, 'moderada'], [15, 'moderadamente_grave'], [19, 'moderadamente_grave'], [20, 'grave'], [24, 'grave']]) {
    assert.equal(scoring.bandForScore(phq8, score).id, band, `${score} pontos`);
  }
  assert.match(phq8.reading, /não rastreia risco/);
  assert.match(phq8.reading, /use o PHQ-9/);
  assert.equal(instruments.PHQ9.items[8].risk.fromValue, 1, 'o PHQ-9 continua com o item 9 de risco');
});

test('K6: as seis perguntas do K10 brasileiro oficial que formam o K6, de 0 a 4 cada', () => {
  const k6 = instruments.K6;
  const k10 = id => instruments.K10.items.find(item => item.id === id).text;
  assert.deepEqual(k6.items.map(item => item.text), [k10('q2'), k10('q4'), k10('q5'), k10('q8'), k10('q9'), k10('q10')]);
  for (const item of k6.items) {
    assert.deepEqual(item.options.map(option => [option.value, option.label]), [
      [4, 'O tempo todo'], [3, 'A maior parte do tempo'], [2, 'Parte do tempo'], [1, 'Um pouco'], [0, 'Nunca'],
    ], item.id);
  }
  assert.deepEqual(k6.scoring, { method: 'sum', min: 0, max: 24 });
  assert.equal(scoring.scoreInstrument(k6, fill(k6, 4)).score, 24);
  for (const [score, band] of [[4, 'baixo'], [5, 'moderado'], [12, 'moderado'], [13, 'grave']]) {
    assert.equal(scoring.bandForScore(k6, score).id, band, `${score} pontos`);
  }
  assert.match(k6.license, /Kessler/);
});

test('Autocompaixão: 26 frases da versão brasileira oficial, seis subescalas e erros de digitação corrigidos', () => {
  const scs = instruments.SCS;
  assert.equal(scs.items.length, 26);
  assert.equal(scs.items[0].text, 'Sou realmente crítico e severo com meus próprios erros e defeitos.');
  assert.match(scs.items[7].text, /costumo ser duro comigo mesmo/);
  assert.match(scs.items[10].text, /de que não gosto na minha personalidade/);
  assert.match(scs.items[13].text, /tento ver a situação de forma equilibrada/);
  assert.doesNotMatch(JSON.stringify(scs.items), /costume ser|gusto|tent over/);
  for (const item of scs.items) {
    assert.deepEqual(item.options.map(option => option.value), [1, 2, 3, 4, 5], item.id);
  }
  // Chave de codificação da versão brasileira.
  const key = Object.fromEntries(scs.scoring.subscales.map(sub => [sub.id, [sub.items.map(id => Number(id.slice(1))), Boolean(sub.reverseInTotal)]]));
  assert.deepEqual(key, {
    bondade: [[5, 12, 19, 23, 26], false],
    autocritica: [[1, 8, 11, 16, 21], true],
    humanidade: [[3, 7, 10, 15], false],
    isolamento: [[4, 13, 18, 25], true],
    mindfulness: [[9, 14, 17, 22], false],
    sobreidentificacao: [[2, 6, 20, 24], true],
  });
  assert.match(scs.license, /qualquer finalidade/);
  assert.match(scs.review.note, /masculino/);
});

test('Autocompaixão: subescala é média sem inverter, total é a média das seis com as negativas invertidas', () => {
  const scs = instruments.SCS;
  // Bondade 4, autocrítica 2, humanidade 3, isolamento 1, mindfulness 5, sobre-identificação 4.
  const values = { bondade: 4, autocritica: 2, humanidade: 3, isolamento: 1, mindfulness: 5, sobreidentificacao: 4 };
  const answers = {};
  for (const sub of scs.scoring.subscales) for (const id of sub.items) answers[id] = values[sub.id];
  const result = scoring.scoreInstrument(scs, answers);
  assert.deepEqual(result.subscales.map(sub => [sub.id, sub.score]), Object.entries(values));
  // (4 + (6-2) + 3 + (6-1) + 5 + (6-4)) / 6 = 23/6 = 3,8333 → 3,83.
  assert.equal(result.score, 3.83);
  assert.equal(result.band.id, 'alta');

  // Arredonda só o total: bondade 3,8 (média de 4,4,4,4,3) entra sem arredondar.
  const mixed = { ...fill(scs, 3), q5: 4, q12: 4, q19: 4, q23: 4, q26: 3 };
  const mixedResult = scoring.scoreInstrument(scs, mixed);
  assert.equal(mixedResult.subscales.find(sub => sub.id === 'bondade').score, 3.8);
  assert.equal(mixedResult.score, 3.13, '(3,8 + 3 + 3 + 3 + 3 + 3) / 6 = 3,1333');

  for (const [score, band] of [[2.49, 'baixa'], [2.5, 'moderada'], [3.5, 'moderada'], [3.51, 'alta'], [1, 'baixa'], [5, 'alta']]) {
    assert.equal(scoring.bandForScore(scs, score).id, band, `${score}`);
  }
  const payload = scoring.buildApplicationPayload(scs, answers);
  assert.equal(payload.result.score, 3.83);
  assert.equal(payload.result.bandLabel, 'Alta');
  assert.equal(payload.result.subscales.length, 6);
  assert.ok(payload.result.subscales.every(sub => sub.bandId === null), 'subescala sem faixa');
  assert.equal(format.savedNotice(scs, { payload }).text, 'Autocompaixão salvo: 3,83 pontos, faixa Alta.');

  const views = format.scoreViews(scs);
  assert.deepEqual(views.map(view => view.id), ['total', 'bondade', 'autocritica', 'humanidade', 'isolamento', 'mindfulness', 'sobreidentificacao']);
  assert.equal(views[0].read(payload.result).score, 3.83);
  assert.equal(views[2].read(payload.result).score, 2);
  assert.equal(format.scoringSummary(scs, payload.result), 'Cada subescala é a média das suas perguntas. O total é a média das subescalas, com as negativas invertidas.');
});

test('validador da nota por média pega régua errada e buraco entre faixas decimais', () => {
  const scs = instruments.SCS;
  const wrongMin = {
    ...scs,
    scoring: { ...scs.scoring, subscales: scs.scoring.subscales.map((sub, index) => (index === 0 ? { ...sub, min: 0 } : sub)) },
  };
  assert.ok(scoring.validateInstrumentDefinition(wrongMin).some(problem => problem.includes('bondade: mínimo')));
  const gap = { ...scs, bands: [{ id: 'a', label: 'A', min: 1, max: 2.49 }, { id: 'b', label: 'B', min: 2.6, max: 5 }] };
  assert.ok(scoring.validateInstrumentDefinition(gap).some(problem => problem.includes('buraco')));
  const noTotalBand = { ...scs, bands: [] };
  assert.ok(scoring.validateInstrumentDefinition(noTotalBand).some(problem => problem.includes('sem faixas')));
});

test('Autocompaixão forma reduzida: 12 frases da completa, negativas invertidas na própria opção, nota por média', () => {
  const sf = instruments.SCSSF;
  const full = id => instruments.SCS.items.find(item => item.id === id).text;
  assert.deepEqual(sf.items.map(item => item.text), [
    full('q6'), full('q26'), full('q14'), full('q13'), full('q15'), full('q12'),
    full('q9'), full('q25'), full('q2'), full('q10'), full('q1'), full('q11'),
  ]);
  const reversed = sf.items.filter(item => item.options[0].value === 5).map(item => item.id);
  assert.deepEqual(reversed, ['q1', 'q4', 'q8', 'q9', 'q11', 'q12'], 'autocrítica, isolamento e sobre-identificação');
  assert.ok(sf.items.every(item => item.options[0].label === '1 – Quase nunca'));
  assert.deepEqual(sf.scoring, { method: 'mean', decimals: 2, step: 0.01, min: 1, max: 5 });

  const allAlways = Object.fromEntries(sf.items.map(item => [item.id, item.options[4].value]));
  assert.equal(scoring.scoreInstrument(sf, allAlways).score, 3, 'quase sempre em tudo empata positivas e negativas');
  const kind = Object.fromEntries(sf.items.map(item => [item.id, 5]));
  assert.equal(scoring.scoreInstrument(sf, kind).score, 5);
  const oneOff = { ...kind, q1: 4 };
  assert.equal(scoring.scoreInstrument(sf, oneOff).score, 4.92, '59/12 = 4,9167');
  assert.equal(format.scoringSummary(sf, scoring.scoreInstrument(sf, oneOff)), 'Média das 12 perguntas: 4,92.');
  assert.equal(format.scoreViews(sf).length, 1, 'a forma reduzida mostra só o total');
  assert.match(sf.review.note, /não há validação brasileira própria/);
});

test('gráfico da nota por média: faixas no meio passo e números com vírgula', () => {
  const scs = instruments.SCS;
  const [total] = format.scoreViews(scs);
  const apps = [
    { id: 'b', appliedAt: '2026-10-06T12:00:00Z', result: { score: 3.46, bandLabel: 'Moderada' } },
    { id: 'a', appliedAt: '2026-09-01T12:00:00Z', result: { score: 2.21, bandLabel: 'Baixa' } },
  ];
  const html = renderToStaticMarkup(React.createElement(TrendChart, {
    instrument: { ...scs, scoring: total.scoring, bands: total.bands },
    applications: format.viewApplications(apps, total),
  }));
  assert.match(html, /de 2,21 pontos em 01\/09\/2026 para 3,46 pontos em 06\/10\/2026/);
  assert.match(html, />3,46</);
  assert.match(html, />2,5</);
  assert.doesNotMatch(html, />3\.46<|>2\.5</, 'sem ponto decimal em inglês');
  for (const band of scs.bands) assert.match(html, new RegExp(`>${band.label}<`));
});

test('cartão: subescala sem faixa (Autocompaixão) não mostra "Faixa: —"', async () => {
  const panel = await src('components/instruments/PatientInstrumentsPanel.jsx');
  assert.match(panel, /\{view\.bands\.length > 0 && <span>Faixa: <b>\{now\.bandLabel \|\| '—'\}<\/b><\/span>\}/);
});
