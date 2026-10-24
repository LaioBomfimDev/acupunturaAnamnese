import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

// ============================================================
// Escalas no menu principal (pedido da administradora, 13/10/2026):
// "mova essas escalas pra uma nova aba principal no sistema", acordeão
// com todas fechadas de início, e "enquanto fechado já ter bastante
// informação sobre data aplicada e datas reaplicadas"; a mesma peça na
// ficha do paciente, numa aba depois de "Área do Paciente"; visual mais
// forte (bolinha, números, datas, cores) e com movimento.
// ============================================================

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = rel => readFile(path.resolve(root, 'src', rel), 'utf8');
const stripComments = css => css.replace(/\/\*[\s\S]*?\*\//g, '');
const noop = () => {};

let server;
let access;
let instruments;
let format;
let panel;
let TrendChart;
let tabs;
let homeConsole;

before(async () => {
  server = await createServer({
    root,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  });
  access = await server.ssrLoadModule('/src/utils/instrumentAccess.js');
  instruments = await server.ssrLoadModule('/src/data/clinicalInstruments.js');
  format = await server.ssrLoadModule('/src/components/instruments/instrumentFormat.js');
  panel = await server.ssrLoadModule('/src/components/instruments/PatientInstrumentsPanel.jsx');
  ({ InstrumentTrendChart: TrendChart } = await server.ssrLoadModule('/src/components/instruments/InstrumentTrendChart.jsx'));
  tabs = await server.ssrLoadModule('/src/utils/patientProfileTabs.js');
  homeConsole = await server.ssrLoadModule('/src/components/HomeConsole.jsx');
});

after(async () => {
  await server?.close();
});

// ---- quem vê ---------------------------------------------------------------

test('áreas com escala batem com o catálogo', () => {
  const fromCatalog = [...new Set(instruments.CLINICAL_INSTRUMENTS.flatMap(instrument => instrument.disciplines))].sort();
  assert.deepEqual([...access.INSTRUMENT_DISCIPLINES].sort(), fromCatalog);
});

test('Escalas: administração e quem atende numa área com escala; recepção nunca', () => {
  assert.deepEqual(access.scaleDisciplinesFor({ role: 'clinic_admin', disciplines: [] }), ['psicologia']);
  assert.deepEqual(access.scaleDisciplinesFor({ role: 'professional', disciplines: ['psicologia', 'nutricao'] }), ['psicologia']);
  assert.deepEqual(access.scaleDisciplinesFor({ role: 'professional', disciplines: ['fisioterapia'] }), []);
  assert.deepEqual(access.scaleDisciplinesFor({ role: 'receptionist', disciplines: ['psicologia'] }), []);
  assert.deepEqual(access.scaleDisciplinesFor(null), []);
  assert.equal(access.canSeeScales({ role: 'professional', disciplines: ['psicologia'] }), true);
  assert.equal(access.canSeeScales({ role: 'receptionist' }), false);
});

// ---- datas e ordem do acordeão ---------------------------------------------

const app = (id, appliedAt, score, extra = {}) => ({
  id,
  instrumentId: 'phq9',
  instrumentVersion: 1,
  appliedAt,
  appliedById: 'u1',
  appliedByName: 'Denise N.',
  source: 'consultorio',
  answers: {},
  result: { score, bandLabel: score >= 15 ? 'Moderadamente grave' : score >= 10 ? 'Moderada' : 'Leve' },
  ...extra,
});

test('datas do cartão fechado: primeira aplicação, reaplicações e quantas, sem as anuladas', () => {
  const apps = [
    app('c', '2026-10-12T12:00:00Z', 8),
    app('x', '2026-10-05T12:00:00Z', 20, { voidedAt: '2026-10-05T13:00:00Z' }),
    app('b', '2026-09-26T12:00:00Z', 12),
    app('a', '2026-09-12T12:00:00Z', 15),
  ];
  assert.deepEqual(format.applicationDates(apps), {
    first: '2026-09-12T12:00:00Z',
    reapplied: ['2026-09-26T12:00:00Z', '2026-10-12T12:00:00Z'],
    count: 3,
  });
  assert.deepEqual(format.applicationDates([]), { first: null, reapplied: [], count: 0 });
});

test('ordem: aplicadas primeiro, da mais recente; depois as outras, na ordem do catálogo', () => {
  const list = instruments.CLINICAL_INSTRUMENTS;
  const apps = [
    { ...app('g', '2026-10-01T12:00:00Z', 6), instrumentId: 'gad7' },
    app('p', '2026-10-10T12:00:00Z', 8),
    { ...app('k', '2026-10-11T12:00:00Z', 20, { voidedAt: '2026-10-11T13:00:00Z' }), instrumentId: 'k10' },
  ];
  const { applied, notApplied } = format.orderInstrumentsForPatient(list, apps);
  assert.deepEqual(applied.map(instrument => instrument.id), ['phq9', 'gad7']);
  assert.ok(notApplied.some(instrument => instrument.id === 'k10'), 'só anulada conta como não aplicada');
  assert.deepEqual(notApplied.map(instrument => instrument.id), list.map(instrument => instrument.id).filter(id => !['phq9', 'gad7'].includes(id)));
});

test('seta de subiu/desceu: só a direção, com arredondamento e sem as duas notas, nada', () => {
  assert.deepEqual(format.scoreTrend(8, 12), { direction: 'down', size: 4, label: 'Desceu 4 pontos em relação à anterior' });
  assert.deepEqual(format.scoreTrend(13, 12), { direction: 'up', size: 1, label: 'Subiu 1 ponto em relação à anterior' });
  assert.equal(format.scoreTrend(3.46, 3.25).label, 'Subiu 0,21 pontos em relação à anterior');
  assert.equal(format.scoreTrend(5, 5).direction, 'same');
  assert.equal(format.scoreTrend(5, undefined), null);
  assert.equal(format.bandIndexOf(instruments.PHQ9.bands, 'Moderada'), 2);
  assert.equal(format.bandIndexOf(instruments.PHQ9.bands, null), -1);
});

// ---- cartão em acordeão ----------------------------------------------------

function renderCard(applications, extra = {}) {
  return renderToStaticMarkup(React.createElement(panel.InstrumentCard, {
    instrument: instruments.PHQ9,
    applications,
    requests: [],
    patient: { id: 'pac', name: 'Paciente de teste' },
    clinicName: 'Clínica',
    discipline: 'psicologia',
    currentUserId: 'u1',
    recipients: { info: null },
    readOnly: false,
    acknowledging: '',
    open: false,
    onToggle: noop,
    onApply: noop,
    onOpen: noop,
    onAcknowledge: noop,
    onPortalChanged: noop,
    ...extra,
  }));
}

test('fechado, o cartão já diz nota, faixa, seta, datas e quando reaplicar', () => {
  const html = renderCard([
    app('c', '2026-10-12T12:00:00Z', 8),
    app('b', '2026-09-26T12:00:00Z', 12),
    app('a', '2026-09-12T12:00:00Z', 15),
  ]);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /class="instrument-acc-score">8<small>pontos<\/small>/);
  assert.match(html, /instrument-band-tag instrument-tone-1">Leve</);
  assert.match(html, /Desceu 4 pontos em relação à anterior/);
  assert.match(html, /class="instrument-spark"/, 'linha pequena da evolução');
  assert.match(html, /Aplicada em <b>12\/09\/2026<\/b>/);
  assert.match(html, /Reaplicada em<span><span><b>26\/09\/2026<\/b><\/span><span>, <b>12\/10\/2026<\/b><\/span><\/span>/,
    'as datas num bloco só: sem espaço antes da vírgula');
  assert.match(html, />3 aplicações</);
  assert.match(html, /Reaplicar a partir de|Já pode reaplicar/);
  // Fechado: o corpo ainda não montou e o painel fica inerte.
  assert.doesNotMatch(html, /instrument-acc-body/);
  assert.doesNotMatch(html, /Aplicar agora/);
  assert.match(html, /class="instrument-acc-panel"[^>]*inert=""/);
});

test('reaplicações demais: mostra as três últimas e conta as outras', () => {
  const dates = ['2026-06-01', '2026-06-20', '2026-07-10', '2026-08-01', '2026-08-20', '2026-09-10'];
  const html = renderCard(dates.map((date, index) => app(`a${index}`, `${date}T12:00:00Z`, 10 + index)).reverse());
  assert.match(html, /class="instrument-acc-more">\+2, <\/span>/);
  assert.match(html, /Aplicada em <b>01\/06\/2026<\/b>/);
  assert.doesNotMatch(html, /<b>20\/06\/2026<\/b>/, 'a reaplicação mais antiga vira +N');
  assert.match(html, />6 aplicações</);
});

test('DASS-21 fechada: uma nota por subescala, sem linha pequena de uma subescala só', () => {
  const dass = instruments.CLINICAL_INSTRUMENTS.find(instrument => instrument.id === 'dass21');
  const subscales = (d, a, e) => ({ score: null, bandLabel: null, subscales: [
    { id: 'depressao', label: 'Depressão', score: d, bandLabel: 'Moderada' },
    { id: 'ansiedade', label: 'Ansiedade', score: a, bandLabel: 'Leve' },
    { id: 'estresse', label: 'Estresse', score: e, bandLabel: 'Moderada' },
  ] });
  const html = renderCard([
    { ...app('b', '2026-10-10T12:00:00Z', 0), instrumentId: 'dass21', result: subscales(14, 8, 20) },
    { ...app('a', '2026-09-26T12:00:00Z', 0), instrumentId: 'dass21', result: subscales(20, 12, 26) },
  ], { instrument: dass });
  assert.equal((html.match(/class="instrument-acc-subscale"/g) || []).length, 3);
  assert.doesNotMatch(html, /instrument-spark/);
  assert.match(html, />2 aplicações</);
});

test('nunca aplicada: diz isso e o tempo, sem datas inventadas', () => {
  const html = renderCard([]);
  assert.match(html, /Ainda não aplicada · cerca de 5 min/);
  assert.doesNotMatch(html, /Aplicada em/);
  assert.match(html, /instrument-card is-empty/);
});

test('alerta de risco não visto fica à vista com a escala fechada', () => {
  const html = renderCard([app('r', '2026-10-12T12:00:00Z', 14, {
    source: 'area_do_paciente', hasRisk: true, result: { score: 14, bandLabel: 'Moderada', riskItems: ['q9'] },
  })]);
  assert.match(html, /instrument-card has-risk/);
  assert.match(html, /Alerta de risco<\/span>/, 'selo no cabeçalho');
  const alertAt = html.indexOf('instrument-risk-unseen');
  const panelAt = html.indexOf('class="instrument-acc-panel"');
  assert.ok(alertAt > 0 && alertAt < panelAt, 'o alerta mora fora do corpo que fecha');
  assert.match(html, /Vi o alerta/);
});

test('aberto: aplicar, nota grande, régua das faixas, gráfico e lista', () => {
  const html = renderCard([
    app('b', '2026-10-12T12:00:00Z', 8),
    app('a', '2026-09-12T12:00:00Z', 15),
  ], { open: true });
  assert.match(html, /aria-expanded="true"/);
  assert.match(html, /class="instrument-acc-body"/);
  assert.match(html, /Aplicar agora/);
  assert.match(html, /class="instrument-meter"/);
  assert.match(html, /class="instrument-chart"/);
  assert.match(html, /class="instrument-latest-tag">Última</);
  assert.doesNotMatch(html, /class="instrument-acc-panel"[^>]*inert=""/);
});

test('painel: tudo fechado de início, "Abrir todas" e a recém-aplicada volta aberta', async () => {
  const source = await read('components/instruments/PatientInstrumentsPanel.jsx');
  assert.match(source, /const \[openIds, setOpenIds\] = useState\(\(\) => new Set\(\)\);/);
  assert.match(source, /\{allOpen \? 'Fechar todas' : 'Abrir todas'\}/);
  assert.match(source, /setOpenIds\(current => new Set\(current\)\.add\(applying\.instrument\.id\)\);/);
  assert.match(source, /Aplicadas a este paciente/);
  assert.match(source, /aria-controls=\{bodyId\}/);
});

// ---- gráfico ---------------------------------------------------------------

test('gráfico: bolinha da última com halo e caixinha, notas nas outras, linha que se desenha', () => {
  const html = renderToStaticMarkup(React.createElement(TrendChart, {
    instrument: instruments.PHQ9,
    applications: [
      app('c', '2026-10-12T12:00:00Z', 8),
      app('b', '2026-09-26T12:00:00Z', 12),
      app('a', '2026-09-12T12:00:00Z', 15),
    ],
  }));
  assert.equal((html.match(/class="instrument-point-halo"/g) || []).length, 1);
  assert.match(html, /class="instrument-point-pill"><rect[^>]*><\/rect><text[^>]*>8<\/text>/);
  assert.equal((html.match(/class="instrument-point-value"/g) || []).length, 2);
  assert.match(html, /<polyline class="instrument-line" points="[^"]+" pathLength="1"/);
  assert.match(html, /<polygon class="instrument-area"/);
  assert.match(html, /class="instrument-date-label is-last"/);
});

test('gráfico: aplicações em dias seguidos não empilham data nem nota; nome comprido de faixa cabe', () => {
  // 09/10 e 11/10 ficavam com "09/10/26" por cima de "11/10/26" e o 13 colado na caixinha do 11.
  const html = renderToStaticMarkup(React.createElement(TrendChart, {
    instrument: instruments.PHQ9,
    applications: [
      app('c', '2026-10-11T12:00:00Z', 11),
      app('b', '2026-10-09T12:00:00Z', 13),
      app('a', '2026-09-08T12:00:00Z', 16),
    ],
  }));
  const dates = [...html.matchAll(/class="instrument-date-label(?: is-last)?"[^>]*>([^<]+)</g)].map(match => match[1]);
  assert.deepEqual(dates, ['08/09/26', '11/10/26']);
  const values = [...html.matchAll(/class="instrument-point-value"[^>]*>([^<]+)</g)].map(match => match[1]);
  assert.deepEqual(values, ['16']);
  assert.match(html, /<title>09\/10\/2026: 13 pontos, faixa Moderada<\/title>/, 'a nota escondida continua no toque');

  // PHQ-4: "No ponto de corte ou acima" (26 letras) ganha coluna do tamanho dele.
  const phq4 = instruments.CLINICAL_INSTRUMENTS.find(instrument => instrument.id === 'phq4');
  const [gad2] = format.scoreViews(phq4);
  const chart = renderToStaticMarkup(React.createElement(TrendChart, {
    instrument: { ...phq4, scoring: gad2.scoring, bands: gad2.bands },
    applications: [{ ...app('x', '2026-10-12T12:00:00Z', 3), instrumentId: 'phq4', result: { score: 3, bandLabel: gad2.bands[1].label } }],
  }));
  const labelX = Number(chart.match(/class="instrument-band-label" x="([\d.]+)"/)[1]);
  assert.ok(640 - labelX >= 26 * 6.6, `coluna das faixas estreita demais: ${640 - labelX}px`);
});

test('CSS: movimento ao abrir, cores da clínica e nada mexe para quem pediu menos movimento', async () => {
  const css = stripComments(await read('styles/instruments.css'));
  assert.match(css, /\.instrument-acc-panel \{\s+display: grid;\s+grid-template-rows: 0fr;/);
  assert.match(css, /\.instrument-card\.is-open \.instrument-acc-panel \{\s+grid-template-rows: 1fr;/);
  assert.match(css, /\.instrument-card\.is-open \.instrument-line \{\s+animation: instrument-draw/);
  assert.match(css, /\.instrument-point-halo \{[^}]*animation: instrument-halo/);
  assert.match(css, /@keyframes instrument-halo/);
  const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
  for (const selector of ['.instrument-point-halo', '.instrument-card.is-open .instrument-line', '.instrument-spark polyline']) {
    assert.ok(reduced.includes(selector), `${selector} sem pausa para menos movimento`);
  }
  assert.match(reduced, /animation: none;/);
  // Faixa mais alta cheia na cor da clínica; vermelho só no risco.
  assert.match(css, /\.instrument-tone-4 \{[^}]*background: var\(--r1-accent\);/);
  assert.doesNotMatch(css, /instrument-tone-[0-4] \{[^}]*--r1-danger/);
});

// ---- menu principal --------------------------------------------------------

function renderHome(variant, extra = {}) {
  return renderToStaticMarkup(React.createElement(homeConsole.HomeConsole, {
    profile: { id: 'p1', role: variant === 'professional' ? 'professional' : 'clinic_admin', clinic: { name: 'Clínica de teste' }, disciplines: ['psicologia'] },
    therapistName: 'Karen',
    variant,
    onSelect: noop,
    onSignOut: noop,
    onOpenAgenda: noop,
    onOpenGestao: noop,
    onOpenClinicPatients: noop,
    ...extra,
  }));
}

test('tela inicial: Escalas no menu e, no celular, a um toque (fora da barra de baixo)', () => {
  const admin = renderHome('admin', { onOpenScales: noop });
  assert.match(admin, /class="hc-nav-title">Escalas<\/p>/);
  assert.match(admin, /class="hc-mobile-only">[\s\S]*?<b>Escalas<\/b>/);
  const pro = renderHome('professional', { onOpenScales: noop, onOpenDocuments: noop });
  assert.match(pro, /class="hc-mobile-only">[\s\S]*?<b>Escalas<\/b>[\s\S]*?<b>Documentos timbrados<\/b>/);
  assert.doesNotMatch(renderHome('reception'), /Escalas/);
});

test('App: tela Escalas do hub, com a barra de baixo e a regra de quem vê', async () => {
  const source = await read('App.jsx');
  assert.match(source, /onOpenScales=\{canSeeScales\(profile\) \? \(\) => \{ setHubScalesPatient\(null\); setShowHubScales\(true\); \} : undefined\}/);
  assert.match(source, /renderHubDock\('escalas'\)/);
  assert.match(source, /setShowHubScales\(screen === 'escalas'\);/);
  // Escalas fora da tela inicial; telas que vierem depois (Financeiro,
  // 23/10/2026) entram na mesma condição.
  assert.match(source, /!showHubEvolutions && !showHubScales(?: && !\w+)*\) \{/);
});

test('tela Escalas: lista e paciente; no celular, um de cada vez, com "Voltar à lista"', async () => {
  const source = await read('components/instruments/ScalesScreen.jsx');
  assert.match(source, /<ScreenHelp topic=\{ESCALAS_HELP\} \/>/);
  assert.match(source, /<HubBackButton nested label="Voltar à lista" onClick=\{\(\) => setSelected\(null\)\} className="topbar-button scales-back" \/>/);
  assert.match(source, /className=\{`scales-layout\$\{current \? ' has-patient' : ''\}`\}/);
  assert.match(source, /<div className="forms-scope scales-panel">/);
  assert.doesNotMatch(source, /matchMedia|innerWidth/, 'quem decide o que aparece é o CSS');
  const css = stripComments(await read('styles/instruments.css'));
  assert.match(css, /\.scales-layout\.has-patient \.scales-patients,\s+\.scales-layout:not\(\.has-patient\) \.scales-detail \{\s+display: none;/);
  assert.match(css, /\.scales-layout \{\s+display: grid;\s+grid-template-columns: minmax\(0, 1fr\) minmax\(0, 2\.7fr\);/);
});

// ---- ficha do paciente -----------------------------------------------------

test('ficha: aba Escalas depois de "Área do Paciente", com ícone, número e resumo', async () => {
  const source = await read('components/ClinicPatientProfile.jsx');
  assert.match(source, /\{ id: 'portal', label: 'Área do Paciente' \},\r?\n\s+\/\/[^\n]*\r?\n\s+\{ id: 'escalas', label: 'Escalas' \},/);
  assert.match(source, /escalas: TOOL_GLYPHS\.escalas,/);
  assert.match(source, /\.filter\(tab => tab\.id !== 'escalas' \|\| scaleDisciplines\.length > 0\)/);
  assert.match(source, /scales: scalesState,/);
  assert.match(source, /import\('\.\.\/services\/patientInstrumentService'\)/, 'serviço das escalas não pesa na ficha de quem não vê');
  assert.match(source, /<section className="pf-panel forms-scope pf-scales">/);
});

test('resumo da aba Escalas: escalas diferentes, última data, risco e sem leitura', () => {
  const ready = tabs.buildScalesTabSummary({
    status: 'ready',
    applications: [
      app('a', '2026-09-12T12:00:00Z', 15),
      app('b', '2026-10-12T12:00:00Z', 8),
      { ...app('g', '2026-10-01T12:00:00Z', 6), instrumentId: 'gad7' },
      app('x', '2026-10-13T12:00:00Z', 20, { voidedAt: '2026-10-13T13:00:00Z' }),
    ],
  });
  assert.equal(ready.count, 2);
  assert.equal(ready.summary, '3 aplicações · última 12/10');
  assert.equal(ready.tone, null);

  const risk = tabs.buildScalesTabSummary({ status: 'ready', applications: [app('r', '2026-10-12T12:00:00Z', 14, { hasRisk: true })] });
  assert.equal(risk.summary, 'Alerta de risco não visto');
  assert.equal(risk.tone, 'alert');

  assert.deepEqual(tabs.buildScalesTabSummary({ status: 'denied' }), {
    count: null, summary: 'Com quem atende e a administração', tone: null, dots: [],
  });
  assert.equal(tabs.buildScalesTabSummary(null).summary, 'Notas, datas e gráfico');
  assert.equal(tabs.buildScalesTabSummary({ status: 'ready', applications: [] }).summary, 'Nenhuma aplicada');
  assert.equal(tabs.buildProfileTabSummaries({}).escalas.summary, 'Notas, datas e gráfico');
});
