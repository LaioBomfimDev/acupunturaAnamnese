import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

// Agenda no celular (05/10/2026, junção das opções A e B das prévias):
// - tocar num atendimento na visão "Hoje" abria o detalhe no painel
//   lateral, que no celular fica no fim da página (1.463px), fora da tela:
//   o toque parecia não fazer nada;
// - o "Novo agendamento" só aparecia rolando a página inteira;
// - as seis ferramentas ocupavam duas fileiras antes dos atendimentos.
// Agora o painel lateral sobe de baixo (atendimento, horário livre ou
// "+ Novo agendamento") e as ferramentas ficam atrás de "Ferramentas".

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = rel => readFile(path.resolve(root, 'src', rel), 'utf8');

let server;
let toolsMenu;
let agenda;
let css;
let phone;
let sheetCss;

before(async () => {
  server = await createServer({
    root,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  });
  toolsMenu = await server.ssrLoadModule('/src/components/panels/agenda/AgendaToolsMenu.jsx');
  agenda = await read('components/panels/Agenda.jsx');
  css = await read('styles/agenda.css');
  const block = css.slice(css.indexOf('Ferramentas guardadas + painel de baixo (05/10/2026'));
  assert.ok(css.includes('Ferramentas guardadas + painel de baixo (05/10/2026'), 'bloco do painel de baixo precisa existir');
  // Ferramentas na barra e painel de baixo: um bloco só, celular e tablet.
  phone = block.slice(block.indexOf('@media (max-width: 1024px)'));
  sheetCss = block.slice(block.indexOf('@media (max-width: 1024px)'));
});

after(async () => {
  await server?.close();
});

function zIndex(source, selector) {
  const start = source.indexOf(`${selector} {`);
  assert.ok(start >= 0, `regra ${selector} não encontrada`);
  const match = source.slice(start, source.indexOf('}', start)).match(/z-index: (\d+);/);
  assert.ok(match, `${selector} sem z-index`);
  return Number(match[1]);
}

test('tocar num atendimento ou num horário livre abre o painel de baixo', () => {
  const open = agenda.slice(agenda.indexOf('function openAppointment('), agenda.indexOf('function openAppointment(') + 300);
  assert.match(open, /setSelectedAppointment\(appointment\);\r?\n\s+setSheetOpen\(true\);/);
  const pick = agenda.slice(agenda.indexOf('function pickSlot('), agenda.indexOf('function pickCell('));
  assert.match(pick, /setSheetOpen\(true\);/, 'tocar em "Livre" sobe o formulário com a hora');
  assert.match(agenda, /className="ag-fab" onClick=\{openNewAppointment\}/);
  assert.match(agenda, /function openNewAppointment\(\) \{\r?\n\s+setSelectedAppointment\(null\);/);
});

test('o painel fecha ao salvar, excluir, mover e trocar de dia', () => {
  const persist = agenda.slice(agenda.indexOf('async function persist('), agenda.indexOf('function buildSeries('));
  assert.match(persist, /setError\(''\);\r?\n\s+setSheetOpen\(false\);/);
  const series = agenda.slice(agenda.indexOf('async function confirmSeries('), agenda.indexOf('async function confirmSeries(') + 1200);
  assert.match(series, /setSheetOpen\(false\);/);
  const reset = agenda.slice(agenda.indexOf('function resetTransient('), agenda.indexOf('function startMoving('));
  assert.match(reset, /setSheetOpen\(false\);/);
  // Mover precisa da agenda à vista: todo começo de mover passa por startMoving.
  assert.match(agenda, /function startMoving\(appointment\) \{\r?\n\s+setMoving\(appointment\);\r?\n\s+setSelectedAppointment\(null\);\r?\n\s+setSheetOpen\(false\);/);
  assert.doesNotMatch(agenda, /setMoving\((appointment|selectedAppointment)\); setSelectedAppointment\(null\);/);
  const del = agenda.slice(agenda.indexOf('async function handleDelete('), agenda.indexOf('async function handleDeleteSeries('));
  assert.match(del, /setSheetOpen\(false\);/);
});

test('o painel fecha com Esc e clique fora, e mostra o erro dentro dele', () => {
  assert.match(agenda, /const sheetDismiss = useDismiss\(\{ open: sheetOpen, onClose: \(\) => setSheetOpen\(false\), busy: saving \}\);/);
  assert.match(agenda, /\{sheetOpen && <div className="ag-sheet-scrim" \{\.\.\.sheetDismiss\.backdropProps\} \/>\}/);
  // O erro de agendar aparecia só no topo da página, escondido atrás do painel.
  assert.match(agenda, /\{sheetOpen && error && <div className="ag-alert ag-sheet-alert" role="alert">\{error\}<\/div>\}/);
  assert.match(agenda, /aria-modal=\{isPhone && sheetOpen \? 'true' : undefined\}/);
});

test('CSS decide: painel de baixo só no celular, abaixo das janelas da Agenda', () => {
  // No computador o painel lateral está sempre à vista: nada disto aparece.
  assert.match(css, /\.ag-fab,\s+\.ag-sheet-close,\s+\.ag-sheet-scrim,\s+\.ag-sheet-alert \{ display: none; \}/);
  // Celular e tablet (≤ 1024px), o mesmo corte da barra de baixo do hub.
  assert.ok(sheetCss.startsWith('@media (max-width: 1024px)'), 'painel de baixo vale também no tablet');
  assert.match(sheetCss, /\.ag-side \{ display: none; \}/);
  assert.match(sheetCss, /\.ag-side\.ag-side--sheet \{[^}]*position: fixed;[^}]*max-height: calc\(88 \* var\(--dvh\)\);/);
  assert.match(sheetCss, /\.ag-fab \{[^}]*bottom: calc\(var\(--r1-bottom-nav-h\) \+ var\(--r1-safe-bottom\) \+ 16px\);/);
  assert.match(agenda, /const AGENDA_PHONE_QUERY = '\(max-width: 1024px\)';/);

  const dialog = zIndex(css, '.ag-dialog-overlay');
  const sheet = zIndex(sheetCss, '.ag-side.ag-side--sheet');
  const menu = zIndex(phone, '.agt-panel');
  const fab = zIndex(sheetCss, '.ag-fab');
  assert.ok(sheet < dialog && menu < dialog, 'painel e menu ficam abaixo das janelas (editar, compartilhar)');
  assert.ok(sheet > 50 && menu > 50, 'painel e menu cobrem a barra de baixo (z-index 50)');
  assert.ok(fab < 50, '"+ Novo" fica abaixo da barra de baixo e dos painéis');
});

test('"Ferramentas" abre a lista e fecha ao escolher, com Esc ou clique fora', async () => {
  const html = renderToStaticMarkup(React.createElement(toolsMenu.AgendaToolsMenu, { placement: 'head' },
    React.createElement('button', { type: 'button', className: 'agt-item' }, 'Feriados')));
  assert.match(html, /class="agt agt--head"/);
  assert.match(html, /aria-expanded="false"[^>]*>.*Ferramentas<\/button>/s);
  assert.doesNotMatch(html, /agt-panel|Feriados/, 'fechado, a lista não aparece');

  const source = await read('components/panels/agenda/AgendaToolsMenu.jsx');
  assert.match(source, /const dismiss = useDismiss\(\{ open, onClose: close \}\);/);
  assert.match(source, /<div className="agt-backdrop" \{\.\.\.dismiss\.backdropProps\} \/>/);
  assert.match(source, /onClick=\{event => \{ if \(event\.target\.closest\('button'\)\) close\(\); \}\}/);
});
