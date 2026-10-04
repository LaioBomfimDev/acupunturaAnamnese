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

before(async () => {
  server = await createServer({
    root,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  });
  hubNav = await server.ssrLoadModule('/src/components/HubNav.jsx');
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
  const mobile = mediaBlock(css, 'Celular (≤ 768px) — navegação no polegar');

  // Fora do celular a barra não existe.
  assert.match(mobile, /\.hub-dock \{\s*display: none;\s*\}\s*@media \(max-width: 768px\)/);
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
  const phone = mediaBlock(shell, '@media (max-width: 768px)', '@media print');
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
