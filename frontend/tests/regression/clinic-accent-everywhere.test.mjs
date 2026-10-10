import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { applyThemeColorMeta } from '../../src/utils/screenAccent.js';

// Cor da clínica em toda a tela (30/09/2026). Botão principal, seleção
// (chip, segmento, dia de hoje) e botão secundário seguiam o preto/
// petróleo fixo do Vitalis em Evoluções, Agenda, Pacientes e Gestão — a
// clínica escolhia azul e via preto. Também a barra de título do app
// instalado ficava petróleo. Ver docs/regressao-log.md.

const read = rel => readFileSync(new URL(`../../src/${rel}`, import.meta.url), 'utf8');
const stripComments = css => css.replace(/\/\*[\s\S]*?\*\//g, '');

// Corpo das regras com esse seletor exato numa linha própria (CRLF ou LF);
// o mesmo seletor pode aparecer em mais de um bloco.
function rule(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const bodies = [...stripComments(css).matchAll(new RegExp(`(?:^|\\r?\\n)${escaped} \\{([^}]*)\\}`, 'g'))].map(m => m[1]);
  assert.ok(bodies.length, `regra ${selector} não encontrada`);
  return bodies.join('\n');
}

test('telas do hub não pintam ação nem seleção com o preto/petróleo fixo', () => {
  for (const file of ['styles/agenda.css', 'styles/clinicPatients.css', 'styles/evolutions.css', 'styles/gestao.css', 'styles/hub.css']) {
    const css = stripComments(read(file));
    assert.doesNotMatch(css, /--r1-surface-inverse/, `${file} voltou a usar o fundo escuro fixo`);
    assert.doesNotMatch(css, /--r1-navy-\d|--r1-gold-\d/, `${file} usa cor primitiva da marca em vez da cor da clínica`);
  }

  const agenda = read('styles/agenda.css');
  const evolutions = read('styles/evolutions.css');
  const patients = read('styles/clinicPatients.css');
  const gestao = read('styles/gestao.css');
  for (const [css, selector] of [
    [evolutions, ".evs-chip[aria-pressed='true']"],
    [agenda, ".ag-chip-btn[aria-pressed='true']"],
    [agenda, ".ag-seg-btn[aria-pressed='true']"],
    [agenda, '.ag-btn--primary'],
    [agenda, '.ag-pill--count'],
    [agenda, '.agd-wday--on'],
    [patients, '.cp-btn--primary'],
    [gestao, '.gt-btn--primary'],
    [gestao, ".gt-nav-item[aria-current='page']"],
  ]) {
    assert.match(rule(css, selector), /background: var\(--r1-accent\)/, `${selector} sem a cor da clínica`);
  }
  assert.match(rule(agenda, '.ag-day--today .ag-day-num'), /background: var\(--r1-accent\)/);
});

test('botão secundário tem texto na cor da clínica (Abrir agenda, Voltar, Como funciona…)', () => {
  for (const [file, selector] of [
    ['styles/hub.css', '.topbar-button'],
    ['styles/overlays.css', '.help-trigger'],
    ['styles/agenda.css', '.ag-btn'],
    ['styles/clinicPatients.css', '.cp-btn'],
    ['styles/gestao.css', '.gt-btn'],
    ['styles/evolutions.css', '.evs-register'],
    ['App.css', '.quiet-button'],
  ]) {
    assert.match(rule(read(file), selector), /\bcolor: var\(--r1-accent\)/, `${file} ${selector}`);
  }
  // Nas fichas a cor fica só no elemento principal (AGENTS.md §7).
  const forms = read('styles/forms.css');
  assert.match(rule(forms, '.forms-scope .quiet-button'), /\bcolor: var\(--r1-text\)/);
  assert.match(forms, /\.forms-scope \.topbar-button,\r?\n\.forms-scope \.save-button \{[^}]*\bcolor: var\(--r1-text\)/);
});

test('hover do botão principal não apaga o texto branco', () => {
  // .gt-btn:hover pinta um fundo claro; sem regra própria o principal
  // ficava com texto branco sobre fundo quase branco.
  assert.match(rule(read('styles/gestao.css'), '.gt-btn--primary:hover:not(:disabled)'), /background: var\(--r1-accent-strong\)/);
  assert.match(rule(read('styles/agenda.css'), '.ag-btn--warn:hover:not(:disabled)'), /background:/);
  assert.match(rule(read('styles/agenda.css'), '.agp-whatsapp:hover:not(:disabled)'), /#25d366/);
});

test('App.css: nenhum tom de petróleo fixo sobrando nos destaques', () => {
  const css = read('App.css');
  assert.doesNotMatch(css, /rgba\(15, *76, *73/, 'tom do petróleo antigo escrito à mão');
  assert.doesNotMatch(css, /#0b3159/i, 'hover azul-marinho antigo');
  assert.match(rule(css, '.primary-button'), /background: var\(--r1-accent\)/);
  assert.match(rule(css, '.tag.active'), /background: var\(--r1-accent\)/);
  // Avatar escuro com texto na cor da clínica = ilegível; agora é a cor
  // da clínica com texto branco.
  assert.match(rule(css, '.patient-summary-avatar'), /background: var\(--r1-accent\);[\s\S]*color: var\(--r1-accent-contrast\)/);
});

test('barra de título do app segue a cor da tela e volta ao padrão sem clínica', () => {
  const meta = {
    attrs: { content: '#0f4c49' },
    dataset: {},
    getAttribute(name) { return this.attrs[name]; },
    setAttribute(name, value) { this.attrs[name] = value; },
  };
  const doc = { querySelector: selector => (selector === 'meta[name="theme-color"]' ? meta : null) };

  applyThemeColorMeta('#2E5A7D', doc);
  assert.equal(meta.attrs.content, '#2E5A7D');
  applyThemeColorMeta('#A62D63', doc);
  assert.equal(meta.attrs.content, '#A62D63');
  applyThemeColorMeta('', doc);
  assert.equal(meta.attrs.content, '#0f4c49', 'sem cor volta ao valor do index.html');
  assert.doesNotThrow(() => applyThemeColorMeta('#2E5A7D', { querySelector: () => null }));

  const auth = read('hooks/AuthContext.jsx');
  assert.match(auth, /applyThemeColorMeta\(accent\)/);
  assert.match(auth, /applyThemeColorMeta\(''\)/);
});

test('Gestão: menu agrupado na ordem combinada, toda aba num grupo só', () => {
  const source = read('components/panels/RelatoriosGestao.jsx');
  const ids = [...source.match(/const SECTIONS = \[([\s\S]*?)\];/)[1].matchAll(/id: '([a-z]+)'/g)].map(m => m[1]);
  const groups = [...source.match(/const SECTION_GROUPS = \[([\s\S]*?)\];/)[1]
    .matchAll(/side: '([a-z]+)', label: '([^']+)', ids: \[([^\]]*)\]/g)]
    .map(m => ({ side: m[1], label: m[2], ids: [...m[3].matchAll(/'([a-z]+)'/g)].map(x => x[1]) }));

  // Dois botões grandes (08/10/2026): Gestão (dia a dia) e Configurações
  // (o que se ajusta uma vez só). Cada lado mostra só os próprios grupos.
  // Resumo (opção B, 10/10/2026): a entrada do lado Gestão, antes de tudo.
  assert.deepEqual(groups, [
    { side: 'gestao', label: 'Visão geral', ids: ['resumo'] },
    { side: 'gestao', label: 'Atendimentos', ids: ['indicadores', 'faltosos', 'retornos', 'pesquisa'] },
    { side: 'gestao', label: 'Área do Paciente', ids: ['importaveis'] },
    { side: 'gestao', label: 'Equipe', ids: ['profissionais', 'acessos'] },
    { side: 'gestao', label: 'Documentos', ids: ['documentos'] },
    { side: 'configuracoes', label: 'Instituição', ids: ['personalizar', 'acessopaciente'] },
    { side: 'configuracoes', label: 'Sua conta', ids: ['cadastro'] },
  ]);
  assert.match(source, /\{ id: 'gestao', label: 'Gestão' \},\r?\n\s*\{ id: 'configuracoes', label: 'Configurações' \}/);
  assert.match(source, /groups=\{sideGroups\}/, 'menu mostra só os grupos do lado aberto');
  assert.match(source, /className="gt-side-btn"\r?\n\s*aria-pressed=\{side === option\.id\}/);
  assert.match(source, /className="gt-sides no-print"/);
  const grouped = groups.flatMap(group => group.ids);
  assert.deepEqual([...grouped].sort(), [...ids].sort(), 'aba fora do menu ou repetida');
  assert.deepEqual(ids, grouped, 'SECTIONS na mesma ordem do menu');
  // Abre na primeira aba do menu, a não ser que o atalho do hub peça outra.
  assert.match(source, /initialSection : SECTION_GROUPS\[0\]\.ids\[0\]/);

  const nav = read('components/panels/GestaoNav.jsx');
  assert.match(nav, /aria-current=\{active === id \? 'page' : undefined\}/);
  for (const file of ['components/panels/RelatoriosGestao.jsx', 'components/panels/GestaoProfissional.jsx']) {
    assert.match(read(file), /<GestaoNav\r?\n/, `${file} sem o menu novo`);
    assert.match(read(file), /<GestaoSectionHead /, `${file} sem título da aba`);
  }
});
