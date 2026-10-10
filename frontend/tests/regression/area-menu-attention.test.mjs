import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';

// Menu das áreas, opção C (escolhida em 10/10/2026): bloco "Pede atenção"
// no topo com atalhos para o que precisa de ação (risco não visto,
// pergunta em aberto, parte incompleta), ponto da mesma cor no item do
// menu, abas sem conteúdo fechadas em "Em breve" e, no celular e no
// tablet, o Menu abrindo uma página inteira acima da barra de baixo.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => readFile(path.join(root, 'src', file), 'utf8');

let server;
let attention;

before(async () => {
  server = await createServer({ root, logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' });
  attention = await server.ssrLoadModule('/src/utils/areaAttention.js');
});

after(async () => {
  await server?.close();
});

const PATIENT = 'p-1';
const alert = (over = {}) => ({
  applicationId: 'a-1', patientId: PATIENT, discipline: 'psicologia', instrumentId: 'phq9',
  appliedAt: '2026-10-09T13:00:00Z', source: 'area_do_paciente', ...over,
});

test('risco não visto: só do paciente e da área abertos; falha vira aviso, nunca silêncio', () => {
  const opts = { patientId: PATIENT, discipline: 'psicologia', tab: 'Escalas', instrumentLabel: id => (id === 'phq9' ? 'PHQ-9' : id) };
  const [item] = attention.riskAttention([alert()], opts);
  assert.equal(item.tone, 'risk');
  assert.equal(item.tab, 'Escalas');
  assert.equal(item.title, 'Risco não visto no PHQ-9');
  assert.match(item.hint, /^Escalas · em casa, \d{2}\/\d{2}$/);

  // Outro paciente ou outra área não entram.
  assert.deepEqual(attention.riskAttention([alert({ patientId: 'p-2' }), alert({ discipline: 'neuropsicologia' })], opts), []);
  assert.equal(attention.riskAttention([alert(), alert({ applicationId: 'a-2' })], opts)[0].title, '2 alertas de risco não vistos');

  // Não deu para conferir: avisa (e leva para Escalas) em vez de esconder o risco.
  const [unchecked] = attention.riskAttention(null, opts);
  assert.equal(unchecked.title, 'Não deu para conferir os alertas de risco');
  assert.equal(unchecked.tab, 'Escalas');
});

test('perguntas em aberto e parte incompleta, com plural certo', () => {
  assert.deepEqual(attention.openQuestionsAttention([{ answer: 'sim' }], { tab: 'Perguntas complementares' }), []);
  const [one] = attention.openQuestionsAttention([{ answer: '' }, { answer: 'x' }], { tab: 'Perguntas complementares' });
  assert.equal(one.title, '1 pergunta em aberto');
  assert.equal(one.tone, 'open');
  assert.equal(attention.openQuestionsAttention([{}, { answer: '  ' }], { tab: 'P' })[0].title, '2 perguntas em aberto');

  const route = [{ done: 30, total: 40 }, { done: 8, total: 12 }];
  const [todo] = attention.routeAttention(route, { id: 'anamnese', tab: 'Anamnese', partLabel: 'da anamnese' });
  assert.equal(todo.title, 'Faltam 14 itens da anamnese');
  assert.equal(todo.hint, 'Anamnese · 38 de 52');
  assert.equal(attention.routeAttention([{ done: 4, total: 5 }], { id: 'a', tab: 'A', partLabel: 'da anamnese' })[0].title, 'Falta 1 item da anamnese');
  assert.deepEqual(attention.routeAttention([{ done: 5, total: 5 }], { id: 'a', tab: 'A', partLabel: 'x' }), [], 'completa não pede atenção');

  // Percurso ainda não escolhido: pede a escolha, no Painel.
  const [choose] = attention.routeAttention(null, { id: 'anamnese', tab: 'Anamnese', partLabel: 'x', chooseHint: 'Escolha o percurso da anamnese', chooseTab: 'Painel' });
  assert.equal(choose.tab, 'Painel');
});

test('risco vem primeiro e o ponto do menu leva o tom mais forte da aba', () => {
  const sorted = attention.sortAttention(
    [{ id: 't', tone: 'todo', tab: 'Escalas' }],
    [{ id: 'r', tone: 'risk', tab: 'Escalas' }],
    [{ id: 'o', tone: 'open', tab: 'Perguntas' }],
  );
  assert.deepEqual(sorted.map(item => item.tone), ['risk', 'open', 'todo']);
  assert.deepEqual(attention.attentionTonesByTab(sorted), { Escalas: 'risk', Perguntas: 'open' });
});

test('Sidebar: bloco, ponto com texto para leitor de tela, "Em breve" e Menu em página inteira', async () => {
  const sidebar = await read('components/Sidebar.jsx');
  assert.match(sidebar, /className="sidebar-attention" aria-labelledby="sidebar-attention-title"/);
  assert.match(sidebar, /Pede atenção <span>\{attention\.length\}<\/span>/);
  assert.match(sidebar, /onClick=\{\(\) => selectTab\(item\.tab\)\}/, 'cada linha é atalho para a parte');
  assert.match(sidebar, /<span className="sr-only">\{ATTENTION_TONE_LABELS\[tone\]\}<\/span>/, 'cor nunca sozinha');
  assert.match(sidebar, /Em breve \(\{soonTabs\.length\}\)/);
  assert.match(sidebar, /aria-expanded=\{soonVisible\}/);
  assert.match(sidebar, /group\.tabs\.filter\(tab => !soonTabs\.includes\(tab\)\)/, 'aba vazia sai do grupo');
  // Menu da barra abre e fecha a página; só o SuperAdm tem fundo escurecido.
  assert.match(sidebar, /onClick=\{\(\) => setDrawerOpen\(open => !open\)\}/);
  assert.match(sidebar, /\{drawerOpen && isSuperAdmin && \(/);

  const shell = await read('styles/shell.css');
  assert.match(shell, /\.sidebar\.sidebar--clinical \{\r?\n\s+width: 100%;\r?\n\s+bottom: calc\(var\(--r1-bottom-nav-h\) \+ var\(--r1-safe-bottom\)\);/);
  for (const tone of ['risk', 'open']) {
    assert.match(shell, new RegExp(`\\.nav-tone--${tone}`), `ponto ${tone} sem cor`);
  }
});

test('cada área monta o "Pede atenção" com o que já sabe', async () => {
  const psi = await read('components/PsychologyWorkspace.jsx');
  assert.match(psi, /listMyInstrumentRiskAlerts\(\)/);
  assert.match(psi, /riskAttention\(riskAlerts, \{/);
  assert.match(psi, /openQuestionsAttention\(session\.complementaryQuestions/);
  assert.match(psi, /soonTabs=\{PSYCHOLOGY_PLACEHOLDER_TABS\}/);
  assert.match(psi, /onApplicationsLoaded=\{\(\) => setRiskAlertsToken\(token => token \+ 1\)\}/, '"Vi o alerta" tira o risco do menu');
  // Mesmo roteiro da tela da anamnese, num lugar só.
  const anamnese = await read('components/psychology/PsychologyAnamnese.jsx');
  assert.match(anamnese, /import \{ PSYCHOLOGY_ROUTE_SPEC \} from '..\/..\/data\/psychologyRouteSpec';/);
  assert.doesNotMatch(anamnese, /const PSYCHOLOGY_ROUTE_SPEC = \{/);

  for (const file of ['components/DisciplineWorkspace.jsx', 'components/NeuropsychologyWorkspace.jsx', 'App.jsx']) {
    const source = await read(file);
    const props = source.match(/<Sidebar\b[\s\S]*?\/>\r?\n/)[0];
    assert.match(props, /attention=\{/, `${file} sem "Pede atenção"`);
    assert.match(source, /routeAttention\(/, `${file} sem a parte incompleta`);
  }
});
