import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { readFile } from 'node:fs/promises';

// Navegação no celular (opção C, escolhida em 04/10/2026): no celular o
// "← Voltar às áreas" quebrava em duas linhas e espremia o nome da
// instituição, Evoluções empilhava dois botões no topo, Configurar agenda
// mostrava dois "voltar" seguidos e as áreas de atendimento tinham uma
// pílula de 11px para voltar e dois botões de menu. Agora o topo só diz
// onde a pessoa está; navegar é a barra de baixo (HubDock) e o voltar de
// tela dentro de tela vira uma faixa logo acima dela. No computador o
// botão continua no topo — quem decide é o CSS.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = rel => readFile(path.resolve(root, 'src', rel), 'utf8');
const noop = () => {};

let server;
let hubNav;
let homeConsole;

before(async () => {
  server = await createServer({
    root,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  });
  hubNav = await server.ssrLoadModule('/src/components/HubNav.jsx');
  homeConsole = await server.ssrLoadModule('/src/components/HomeConsole.jsx');
});

after(async () => {
  await server?.close();
});

function renderDock(props) {
  return renderToStaticMarkup(React.createElement(hubNav.HubDock, props));
}

function dockLabels(html) {
  return [...html.matchAll(/<span>([^<]+)<\/span>/g)].map(match => match[1]);
}

function mediaBlock(css, marker, endMarker) {
  const start = css.indexOf(marker);
  assert.ok(start >= 0, `bloco "${marker}" precisa existir`);
  const end = endMarker ? css.indexOf(endMarker, start) : css.length;
  return css.slice(start, end > start ? end : css.length);
}

function zIndexOf(css, selector) {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `regra ${selector} não encontrada`);
  const body = css.slice(start, css.indexOf('}', start));
  const match = body.match(/z-index:\s*(\d+)/);
  assert.ok(match, `${selector} sem z-index`);
  return Number(match[1]);
}

test('barra de baixo segue os destinos de cada perfil, no máximo cinco', () => {
  const base = { onHome: noop, onOpenAgenda: noop, onOpenPatients: noop, onOpenGestao: noop };

  // Admin: Documentos mora na aba da Gestão, não no hub.
  assert.deepEqual(
    dockLabels(renderDock({ ...base, onOpenEvolutions: noop })),
    ['Início', 'Agenda', 'Evoluções', 'Pacientes', 'Gestão'],
  );
  // Profissional: seis destinos não cabem em 375px; Documentos fica na tela inicial.
  assert.deepEqual(
    dockLabels(renderDock({ ...base, onOpenEvolutions: noop, onOpenDocuments: noop })),
    ['Início', 'Agenda', 'Evoluções', 'Pacientes', 'Gestão'],
  );
  // Recepção: sem Evoluções (não é tarefa dela), com Documentos.
  assert.deepEqual(
    dockLabels(renderDock({ ...base, onOpenDocuments: noop })),
    ['Início', 'Agenda', 'Pacientes', 'Gestão', 'Documentos'],
  );
});

test('destino atual marcado e pendência de evolução contada', () => {
  const props = {
    onHome: noop, onOpenAgenda: noop, onOpenEvolutions: noop, onOpenPatients: noop, onOpenGestao: noop,
  };
  const html = renderDock({ ...props, active: 'evolucao', pendingEvolutionsCount: 3 });
  assert.equal((html.match(/aria-current="page"/g) || []).length, 1);
  assert.match(html, /aria-current="page"[^>]*>(?:(?!<\/button>).)*<span>Evoluções<\/span>/s);
  assert.match(html, /class="hub-dock-count"><span class="sr-only">pendentes: <\/span>3<\/b>/);
  assert.match(html, /aria-label="Navegação da instituição"/);
  assert.match(html, /class="hub-dock no-print"/, 'a barra não sai no papel');

  assert.doesNotMatch(renderDock({ ...props, pendingEvolutionsCount: 0 }), /hub-dock-count/);
  assert.match(renderDock({ ...props, pendingEvolutionsCount: 150 }), />99\+<\/b>/);
});

test('voltar: mesmo botão no computador, faixa no celular só para tela dentro de tela', () => {
  const { HubBackButton } = hubNav;
  const top = renderToStaticMarkup(React.createElement(HubBackButton, { label: 'Voltar às áreas', onClick: noop }));
  assert.match(top, /class="topbar-button hub-back"/);
  // O texto visível continua "← Voltar às áreas"; a seta não entra no nome lido pelo leitor de tela.
  assert.match(top, /<span class="hub-back-arrow" aria-hidden="true">←<\/span> Voltar às áreas/);

  const nested = renderToStaticMarkup(React.createElement(HubBackButton, {
    nested: true, className: 'ag-btn', label: 'Voltar à agenda', onClick: noop,
  }));
  assert.match(nested, /class="ag-btn hub-back hub-back--nested"/);
});

test('todas as telas do hub usam o botão compartilhado e a barra de baixo', async () => {
  const app = await read('App.jsx');
  for (const screen of ['inicio', 'pacientes', 'agenda', 'evolucao', 'documentos', 'gestao']) {
    assert.match(app, new RegExp(`renderHubDock\\('${screen}'\\)`), `tela ${screen} sem a barra de baixo`);
  }
  assert.doesNotMatch(app, /← Voltar/, 'voltar escrito à mão no App');
  assert.equal((app.match(/<HubBackButton\s+label="Voltar às áreas"/g) || []).length, 4);
  // "Abrir agenda" de Evoluções some no celular: a Agenda já está na barra.
  assert.match(app, /className="topbar-button hub-topbar-extra"[\s\S]{0,200}?\}>\s*Abrir agenda/);
  assert.match(app, /className="hub-topbar hub-topbar--titled"/);

  // Mesmas regras de perfil do menu da tela inicial (HomeConsole).
  assert.match(app, /onOpenPendingEvolutions=\{isReceptionist \? undefined/);
  assert.match(app, /onOpenEvolutions=\{isReceptionist \? undefined/);
  assert.match(app, /onOpenDocuments=\{isClinicAdmin \? undefined : \(\) => setShowHubDocuments\(true\)\}/);
  assert.match(app, /onOpenDocuments=\{isClinicAdmin \? undefined : \(\) => openHubScreen\('documentos'\)\}/);

  const expectations = [
    ['components/ClinicPatientsPanel.jsx', /<HubBackButton label="Voltar às áreas" onClick=\{onBack\} \/>/],
    ['components/ClinicPatientProfile.jsx', /<HubBackButton nested label="Voltar à lista"/],
    ['components/PatientEvolutionTimeline.jsx', /<HubBackButton nested label="Voltar à ficha"/],
    ['components/panels/agenda/ScheduleEditor.jsx', /<HubBackButton nested className="ag-btn" label="Voltar à agenda"/],
    ['components/panels/agenda/HolidaysEditor.jsx', /<HubBackButton nested className="ag-btn" label="Voltar à agenda"/],
    ['components/panels/agenda/AgendaSettingsEditor.jsx', /<HubBackButton nested className="ag-btn" label="Voltar à agenda"/],
  ];
  for (const [file, pattern] of expectations) {
    const source = await read(file);
    assert.match(source, pattern, file);
    assert.doesNotMatch(source, />← Voltar/, `${file} voltou a escrever o voltar à mão`);
  }
});

test('celular: topo sem voltar, faixa acima da barra, abaixo das janelas', async () => {
  const css = await read('styles/hub.css');
  const mobile = mediaBlock(css, 'Celular e tablet (≤ 1024px) — navegação no polegar');

  // Fora do celular e do tablet a barra não existe.
  assert.match(mobile, /\.hub-dock \{\s*display: none;\s*\}\s*@media \(max-width: 1024px\)/);
  assert.match(mobile, /\.hub-topbar \.hub-back:not\(\.hub-back--nested\),\s*\.hub-topbar-extra \{\s*display: none;/);
  assert.match(mobile, /button\.hub-back\.hub-back--nested \{[^}]*position: fixed;[^}]*bottom: calc\(var\(--r1-bottom-nav-h\) \+ var\(--r1-safe-bottom\)\);/);
  assert.match(mobile, /\.hub-dock \{[^}]*position: fixed;[^}]*bottom: 0;/);
  // Conteúdo termina acima da barra (e da faixa, quando há).
  assert.match(mobile, /\.hub-screen,\s*\.hc-screen \{\s*padding-bottom: calc\(var\(--r1-bottom-nav-h\) \+ var\(--r1-safe-bottom\)\);/);
  assert.match(mobile, /\.hub-screen:has\(\.hub-back--nested\) \{\s*padding-bottom: calc\(var\(--r1-bottom-nav-h\) \+ var\(--r1-safe-bottom\) \+ var\(--r1-hub-strip-h\)\);/);
  // Alvo de toque mínimo de 44px.
  assert.match(mobile, /\.hub-dock-item \{[^}]*min-height: var\(--r1-bottom-nav-h\);/);

  const agenda = await read('styles/agenda.css');
  const dialog = zIndexOf(agenda, '.ag-dialog-overlay');
  const dockZ = Number(mobile.match(/\.hub-dock \{[^}]*z-index: (\d+);/)[1]);
  const stripZ = Number(mobile.match(/button\.hub-back\.hub-back--nested \{[^}]*z-index: (\d+);/)[1]);
  assert.ok(dockZ < dialog && stripZ < dialog, 'barra e faixa não podem cobrir as janelas da Agenda');
});

test('áreas de atendimento no celular: sem ☰ flutuante, voltar e sair dentro do Menu', async () => {
  const shell = await read('styles/shell.css');
  const phone = mediaBlock(shell, '≤ 1024px — barra inferior (celular e tablet)', '@media print');
  assert.match(phone, /\.shell-menu,\s*\.main \.app-signout,\s*\.main \.app-specialty-switch,\s*\.main \.home-specialty-switcher-banner \{\s*display: none;/);
  assert.match(phone, /\.sidebar-signout \{\s*display: flex;/);
  // Bug achado junto: .forms-scope .mini-clock (forms.css) vencia o
  // .mini-clock daqui e o relógio ficava no topo das áreas no telefone.
  assert.match(phone, /\.main \.mini-clock \{\s*display: none;/);
  const forms = await read('styles/forms.css');
  assert.match(forms, /\.forms-scope \.mini-clock \{[^}]*display: grid;/, 'se a regra das fichas mudar, rever o peso acima');
  assert.doesNotMatch(phone, /padding-left: calc\(var\(--r1-tap\)/, 'sem ☰ flutuante não há o que desviar no topo');
  assert.match(shell, /\.shell-drawer-close,\s*\.sidebar-signout \{\s*display: none;/, 'saída da gaveta escondida fora do celular');

  const sidebar = await read('components/Sidebar.jsx');
  assert.match(sidebar, /className="sidebar-signout no-print"/);
  assert.match(sidebar, /onClick=\{\(\) => \{ setDrawerOpen\(false\); onSignOut\(\); \}\}/);

  for (const file of ['App.jsx', 'components/PsychologyWorkspace.jsx', 'components/NeuropsychologyWorkspace.jsx', 'components/DisciplineWorkspace.jsx']) {
    const source = await read(file);
    const sidebarProps = source.match(/<Sidebar\b[\s\S]*?\/>/);
    assert.ok(sidebarProps, `${file} monta a Sidebar`);
    assert.match(sidebarProps[0], /onSignOut=\{handleSignOut\}/, `${file}: a saída da gaveta passa pela confirmação de alterações`);
    assert.match(source, /className="topbar-button app-signout"[^>]*>Sair<\/button>/, `${file}: "Sair" do topo some no celular`);
  }

  const app = await read('App.jsx');
  assert.match(app, /className="active-specialty-badge app-specialty-switch"/);
  const start = await read('components/PatientStart.jsx');
  assert.match(start, /className="quiet-button app-signout"/);
});

// Tela inicial no celular (opção B, 05/10/2026): o menu escuro ocupava a
// primeira tela inteira e repetia a barra de baixo; o "Bom dia" e os
// números só apareciam rolando. Agora o topo é o cartão do dia.
function renderHome(variant, extra = {}) {
  const profile = {
    id: 'p1',
    role: variant === 'professional' ? 'professional' : 'clinic_admin',
    clinic: { name: 'Clínica de teste' },
    disciplines: ['psicologia'],
  };
  return renderToStaticMarkup(React.createElement(homeConsole.HomeConsole, {
    profile,
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

test('tela inicial no celular: cartão do dia com instituição, Sair, saudação e números', () => {
  const html = renderHome('admin', { onOpenPendingEvolutions: noop, onOpenBirthdays: noop });
  const hero = html.indexOf('class="hc-hero"');
  assert.ok(hero > html.indexOf('</aside>'), 'cartão fica no conteúdo, não no menu escuro');
  const top = html.slice(hero, html.indexOf('hc-greeting', hero));
  assert.match(top, /class="hc-hero-clinic">Clínica de teste</);
  assert.match(top, /class="hc-hero-signout"[^>]*>Sair<\/button>/);
  const order = ['hc-greeting', '<h2>Visão geral de hoje</h2>', 'hc-stat-row', 'class="hc-areas"']
    .map(mark => html.indexOf(mark, hero));
  assert.ok(order.every((at, i) => at > 0 && (i === 0 || at > order[i - 1])), `ordem do cartão: ${order}`);
  // Saída: uma visível por largura (menu escuro no computador, cartão no celular).
  assert.equal((html.match(/>Sair<\/button>/g) || []).length, 2);
  assert.doesNotMatch(html, /hc-mobile-only/, 'admin não tem atalho extra: Documentos mora na Gestão');
});

test('tela inicial no celular: profissional atende de dentro do cartão e acha Documentos', async () => {
  const html = renderHome('professional', { onOpenPendingEvolutions: noop, onOpenDocuments: noop });
  assert.doesNotMatch(html, /hc-stat-row/, 'profissional continua sem números');
  // A barra de baixo do profissional não leva Documentos (cinco destinos no máximo)…
  assert.doesNotMatch(renderDock({
    onHome: noop, onOpenAgenda: noop, onOpenEvolutions: noop, onOpenPatients: noop, onOpenGestao: noop, onOpenDocuments: noop,
  }), /Documentos/);
  // …então a tela inicial guarda o atalho, só no celular.
  assert.match(html, /class="hc-mobile-only"><p class="hc-section-label">Atalhos<\/p>[\s\S]*?<b>Documentos timbrados<\/b>/);
  // Recepção tem Documentos na barra de baixo: sem atalho repetido.
  assert.doesNotMatch(renderHome('reception', { onOpenDocuments: noop }), /hc-mobile-only/);

  const source = await read('components/HomeConsole.jsx');
  assert.match(source, /const areasInHero = variant === 'professional';/);
  const heroBlock = source.slice(source.indexOf('<div className="hc-hero">'), source.indexOf('{!areasInHero && areasSection}'));
  assert.match(heroBlock, /\{areasInHero && areasSection\}\s*<\/div>/, 'áreas do profissional dentro do cartão');
});

test('tela inicial: computador igual, celular sem o menu escuro', async () => {
  const css = await read('styles/console.css');
  const block = mediaBlock(css, 'Cartão do dia (celular, opção B');
  // No computador o cartão não desenha nada e as partes do celular somem.
  assert.match(block, /\.hc-hero \{\s*display: contents;\s*\}\s*\.hc-hero-top,\s*\.hc-mobile-only \{\s*display: none;/);
  const phone = block.slice(block.indexOf('@media (max-width: 1024px)'));
  assert.ok(phone.length > 0 && block.includes('@media (max-width: 1024px)'), 'cartão do dia vale até 1024px');
  assert.match(phone, /\.hc-rail \{\s*display: none;/);
  assert.match(phone, /\.hc-hero \{\s*display: grid;[^}]*background: var\(--r1-accent-strong\);/);
  assert.match(phone, /\.hc-hero \.hc-stat-row \{\s*grid-area: stats;\s*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/);
  assert.match(phone, /\.hc-hero-signout \{[^}]*min-height: 40px;/);
  // Vem depois da faixa ≤900px, que empilha os números em uma coluna.
  assert.ok(css.indexOf('Cartão do dia (celular') > css.indexOf('@media (max-width: 900px)'));
});

// Pedido de 05/10/2026: "tablet é só um celular grande". Até então a
// barra de baixo começava em 768px e o tablet ficava num meio-termo
// (gaveta com ☰ flutuante, "Voltar às áreas" no topo, menu escuro na
// tela inicial). Agora o corte da navegação é um só, 1024px, o mesmo da
// gaveta: acima dele é computador.
test('tablet segue o celular: navegação com um corte só, 1024px', async () => {
  const hub = await read('styles/hub.css');
  const shell = await read('styles/shell.css');
  const consoleCss = await read('styles/console.css');
  const evolutions = await read('styles/evolutions.css');

  const dock = mediaBlock(hub, 'Celular e tablet (≤ 1024px) — navegação no polegar');
  assert.match(dock, /@media \(max-width: 1024px\) \{/);
  const bar = mediaBlock(shell, '≤ 1024px — barra inferior (celular e tablet)', '@media print');
  assert.match(bar, /\*\/\r?\n@media \(max-width: 1024px\) \{/);
  assert.match(bar, /\.shell-tabs \{\s*position: fixed;/);
  const card = mediaBlock(consoleCss, 'Cartão do dia (celular, opção B');
  assert.match(card, /@media \(max-width: 1024px\) \{\s*\.hc-rail \{\s*display: none;/);

  // Nenhum dos arquivos da navegação volta a cortar em 768px.
  for (const [name, css] of [['hub.css', hub], ['shell.css', shell], ['console.css', consoleCss], ['evolutions.css', evolutions]]) {
    assert.doesNotMatch(css, /@media \(max-width: 76[0-9]px\)/, `${name} voltou a separar tablet de celular`);
  }
  // O zoom de 1,1 continua só acima do corte (computador).
  const tokens = await read('styles/tokens.css');
  assert.match(tokens, /@media screen and \(min-width: 1025px\) \{\s*:root \{\s*--app-zoom: 1\.1;/);
});
