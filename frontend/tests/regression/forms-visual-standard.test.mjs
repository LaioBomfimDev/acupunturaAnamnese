import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { buildReportAccentPalette } from '../../src/utils/reportUtils.js';

// Novo padrão visual das fichas das disciplinas (24/09/2026): kit
// styles/forms.css (só tokens), roteiro da ficha com progresso real,
// perguntas de escuta antes da caixa e lateral clara nas áreas de
// atendimento. Ver docs/regressao-log.md (lateral ilegível com a cor da
// clínica sobre fundo escuro).

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = rel => readFile(path.join(root, 'src', rel), 'utf8');

let server;
let route;
let registry;
let kit;
let DisciplineAnamnese;

before(async () => {
  server = await createServer({
    root,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  });
  [route, registry, kit, { DisciplineAnamnese }] = await Promise.all([
    server.ssrLoadModule('/src/utils/formRoute.js'),
    server.ssrLoadModule('/src/data/anamneseRegistry.js'),
    server.ssrLoadModule('/src/data/anamneseKit.js'),
    server.ssrLoadModule('/src/components/anamnese/DisciplineAnamnese.jsx'),
  ]);
});

after(async () => {
  await server?.close();
});

// ---- contraste (WCAG) -------------------------------------------------

const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const blend = (base, top, ratio) => base.map((v, i) => Math.round(v + (top[i] - v) * ratio));
function luminance(color) {
  const [r, g, b] = color.map(value => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

async function clinicBrandColors() {
  const source = await src('services/clinicService.js');
  const block = source.match(/export const CLINIC_BRAND_COLORS = \[([\s\S]*?)\];/)[1];
  return [...block.matchAll(/value: '(#[0-9A-Fa-f]{6})'/g)].map(match => match[1]);
}

test('lateral clara: aba ativa legível (≥ 4,5:1) em todas as cores da clínica', async () => {
  // Regressão: na lateral escura, .logo h1 e .nav button.active usavam
  // --gold-2 (a cor ESCURA da clínica) sobre fundo escuro — 1,0:1 a 2,0:1.
  const colors = await clinicBrandColors();
  assert.ok(colors.length >= 10, 'paleta curada da clínica encontrada');
  const white = [255, 255, 255];
  for (const hex of colors) {
    const { accent, shade } = buildReportAccentPalette(hex);
    const wash = blend(white, rgb(accent), 0.14); // --r1-accent-wash sobre a lateral branca
    const ratio = contrast(rgb(shade), wash);
    assert.ok(ratio >= 4.5, `${hex}: aba ativa com ${ratio.toFixed(2)}:1`);
    // Sinal marcado e botão primário: texto branco sobre a cor da clínica.
    const onAccent = contrast(white, rgb(accent));
    assert.ok(onAccent >= 4.5, `${hex}: texto branco sobre a cor com ${onAccent.toFixed(2)}:1`);
  }

  const shell = await src('styles/shell.css');
  const sidebar = await src('components/Sidebar.jsx');
  assert.match(shell, /\.sidebar--clinical \{[^}]*background: var\(--r1-surface\)/);
  assert.match(shell, /\.sidebar--clinical \.nav button\.active \{[^}]*color: var\(--r1-accent-strong\)/);
  assert.match(sidebar, /isSuperAdmin \? '' : ' sidebar--clinical'/, 'só o SuperAdm fica fora da lateral clara');
});

test('forms.css usa só tokens e entra depois do App.css', async () => {
  const css = await src('styles/forms.css');
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(withoutComments, /#[0-9a-fA-F]{3,8}\b/, 'cor literal no kit das fichas');
  assert.doesNotMatch(withoutComments, /Georgia/);
  // Regressão: textarea caía na monoespaçada padrão do navegador.
  assert.match(withoutComments, /font-family: inherit;/, 'campos precisam herdar a fonte do app');

  const main = await src('main.jsx');
  const appCss = main.indexOf("import './App.css'");
  const formsCss = main.indexOf("import './styles/forms.css'");
  assert.ok(appCss >= 0 && formsCss > appCss, 'forms.css precisa vir depois do App.css');
});

test('o kit vale nas 4 áreas e na ficha dentro de Evoluções, mas não no SuperAdm', async () => {
  for (const file of ['components/DisciplineWorkspace.jsx', 'components/PsychologyWorkspace.jsx', 'components/NeuropsychologyWorkspace.jsx']) {
    assert.match(await src(file), /className="main psi-main forms-scope"/, file);
  }
  assert.match(await src('App.jsx'), /className=\{`main\$\{isSuperAdmin \? '' : ' forms-scope'\}`\}/);
  assert.match(await src('components/evolutions/EvolutionRecordPanel.jsx'), /<div className="forms-scope">/);
});

test('fichas não voltam a escrever Georgia/cor da clínica direto no JSX', async () => {
  const files = [
    'components/panels/Anamnese.jsx',
    'components/panels/Reabilitacao.jsx',
    'components/panels/RaciocinioClinical.jsx',
    'components/panels/Evolucao.jsx',
    'components/anamnese/DisciplineEvolucao.jsx',
    'components/psychology/PsychologyEvolucao.jsx',
    'components/psychology/PsychologyAssistantRail.jsx',
  ];
  for (const file of files) {
    const source = await src(file);
    assert.doesNotMatch(source, /Georgia/, `${file} voltou a usar Georgia inline`);
    assert.doesNotMatch(source, /style=\{\{[^}]*var\(--gold\)/, `${file} voltou a pintar com --gold inline`);
  }
  const anamnese = await src('components/panels/Anamnese.jsx');
  assert.doesNotMatch(anamnese, /#f8fbff|#c9d8ef|#061F3A/i, 'aviso azul chumbado voltou');
  assert.match(anamnese, /className="alert alert-info"/);
  assert.match(anamnese, /group="seguranca"[^>]*tone="risk"/, 'segurança marca em vermelho, não na cor da clínica');
});

// ---- roteiro da ficha: progresso real --------------------------------

function fisioSession(overrides = {}) {
  const config = registry.getAnamneseConfig('fisioterapia');
  const session = kit.createEmptySession(config);
  return { config, session: { ...session, intakeProfile: config.profiles[0].id, ...overrides } };
}

test('roteiro conta campos, grupos de sinais e ignora bloco fechado', () => {
  const { config, session: base } = fisioSession();
  const [firstField, secondField] = config.textFields;
  const module = config.contextModules[0];
  const check = config.checklistSections[0];
  const risk = config.riskItems[0];
  const session = {
    ...base,
    fields: {
      [firstField.id]: 'Dor lombar há 3 meses',
      [secondField.id]: '   ',
      [module.fields[0].id]: 'texto escrito antes de fechar o bloco',
    },
    selectedMap: { [`${check.group}:${check.items[0]}`]: true, [`${config.riskGroup}:${risk.label}`]: true },
    contextModules: { [module.id]: false },
    axisNotes: { [config.axes[0].id]: 'formulação' },
  };
  const sections = kit.getProfileSections(config, session.intakeProfile);
  const items = route.buildAnamneseRoute({ ...config, sections }, session);
  const byId = id => route.findRouteItem(items, id);

  assert.deepEqual([byId('escuta').done, byId('escuta').total], [1, config.textFields.length], 'espaço em branco não conta');
  assert.equal(byId('contexto').total, 0, 'bloco fechado não entra na conta');
  assert.equal(byId('contexto').hint, 'nenhum bloco aberto');
  assert.deepEqual([byId('sinais').done, byId('sinais').total], [1, config.checklistSections.length]);
  assert.equal(byId('risco').risk, true, 'sinal de risco marcado vira flag, não preenchimento');
  assert.equal(byId('risco').done, 0);
  assert.equal(byId('eixos').done, 1);
  assert.equal(byId('escuta').number, '1');
  assert.equal(byId(`percurso-${sections[0].id}`).number, '2');
  assert.equal(byId('sinais').number, null, 'sinais/risco/eixos seguem sem número, como na tela');

  const opened = route.buildAnamneseRoute(
    { ...config, sections },
    { ...session, contextModules: { [module.id]: true } },
  );
  assert.deepEqual(
    [route.findRouteItem(opened, 'contexto').done, route.findRouteItem(opened, 'contexto').total],
    [1, module.fields.length],
    'reabrir o bloco devolve o que já estava escrito',
  );
});

test('roteiro da Acupuntura: seção 7 segue o sexo clínico e segurança vira flag', () => {
  const empty = route.buildAcupunturaAnamneseRoute({}, {}, null);
  const repro = route.findRouteItem(empty, 'reprodutiva');
  assert.equal(repro.title, 'Saúde reprodutiva e hormonal');
  assert.equal(repro.total, 0);
  assert.equal(repro.hint, 'sexo clínico não informado');

  const feminino = route.buildAcupunturaAnamneseRoute(
    { sexo: 'Feminino', profissao: 'Analista', queixa: 'Cefaleia' },
    { 'seguranca:Gestação': true, 'queixaEstruturada:Início gradual': true },
    'feminino',
  );
  const byId = id => route.findRouteItem(feminino, id);
  assert.equal(byId('reprodutiva').title, 'Saúde menstrual, ginecológica e hormonal');
  assert.deepEqual([byId('identificacao').done, byId('identificacao').total], [2, 3]);
  assert.deepEqual([byId('queixa').done, byId('queixa').total], [2, 3]);
  assert.equal(byId('seguranca').risk, true);
  assert.equal(byId('seguranca').hint, '1 sinal marcado');
});

test('roteiro da Avaliação neuropsicológica conta sessões concluídas e instrumentos revisados', async () => {
  const neuro = await server.ssrLoadModule('/src/data/neuropsychologyEvaluation.js');
  const evaluation = neuro.createEmptyNeuropsychologyEvaluation();
  evaluation.sessions[0].status = 'concluida';
  evaluation.instruments[0].status = 'revisado';
  evaluation.referral.reason = 'Esquecimentos no trabalho';
  const items = route.buildNeuroAssessmentRoute(evaluation);
  const byId = id => route.findRouteItem(items, id);
  assert.deepEqual([byId('sessoes').done, byId('sessoes').total], [1, 10]);
  assert.equal(byId('sessoes').unitLabel, 'concluídas');
  assert.deepEqual([byId('instrumentos').done, byId('instrumentos').total], [1, evaluation.instruments.length]);
  assert.deepEqual([byId('encaminhamento').done, byId('encaminhamento').total], [1, 5]);
  assert.equal(byId('integracao').total, 10);
});

// ---- ficha renderizada ------------------------------------------------

test('ficha genérica: roteiro, títulos com âncora e perguntas antes da caixa', () => {
  const { config, session } = fisioSession();
  const noop = () => {};
  const html = renderToStaticMarkup(React.createElement(DisciplineAnamnese, {
    config,
    session,
    onUpdateField: noop,
    onQuickWord: noop,
    onToggleCheck: noop,
    onToggleContextModule: noop,
    onAxisNote: noop,
    onRiskNotesChange: noop,
    onChooseProfile: noop,
  }));

  assert.match(html, /<nav class="form-route no-print" aria-label="Roteiro da ficha">/);
  assert.match(html, /<h3 class="form-section-title" id="form-sec-escuta">/);
  assert.match(html, /href="#form-sec-risco"/);

  // Rótulo → perguntas de escuta → caixa (antes a pergunta vinha depois).
  const field = config.textFields.find(entry => entry.questionGuide.length > 0);
  const labelAt = html.indexOf(`>${field.label}</label>`);
  const questionAt = html.indexOf(field.questionGuide[0].replace(/"/g, '&quot;'), labelAt);
  const textareaAt = html.indexOf('<textarea', labelAt);
  assert.ok(labelAt >= 0 && questionAt > labelAt && textareaAt > questionAt, 'pergunta de escuta entre o rótulo e a caixa');

  // Cartão de risco: caixa de marcar acessível, sem "✓ " no texto.
  const risk = config.riskItems[0];
  assert.match(html, new RegExp(`aria-pressed="false">${risk.label}</button>`));
});
