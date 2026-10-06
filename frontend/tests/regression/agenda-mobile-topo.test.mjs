import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

// Topo da Agenda no celular (2026-09-24): o seletor de visões era uma
// grade de 2 colunas que não ocupava a largura (sobrava um vão à
// direita), as ferramentas tinham larguras diferentes e os filtros
// empilhavam em negrito antes do calendário. Estes testes seguram a
// correção — verificada no navegador em 320, 375 e 1280px.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let css;
let mobile;
let agenda;

before(async () => {
  css = await readFile(path.resolve(root, 'src/styles/agenda.css'), 'utf8');
  agenda = await readFile(path.resolve(root, 'src/components/panels/Agenda.jsx'), 'utf8');
  const start = css.indexOf('Topo da agenda no celular (≤768px)');
  assert.ok(start > 0, 'bloco do topo no celular precisa existir');
  mobile = css.slice(start, css.indexOf('@media (max-width: 480px)', start));
});

// 05/10/2026 (junção das opções A e B): as visões em grade 3×2 e as
// ferramentas em grade 2×2 somavam 332px antes do primeiro atendimento.
// Visões viraram uma linha só e as ferramentas foram para "Ferramentas".
test('visões numa linha só, rolando para o lado', () => {
  assert.match(css, /\.ag-seg--views \{\s+display: flex;\s+flex-wrap: nowrap;\s+overflow-x: auto;/);
  assert.doesNotMatch(css, /\.ag-seg--views \{\s+(grid-column: 1 \/ -1;\s+)?grid-template-columns: repeat\(/, 'grade de visões voltou');
  assert.match(css, /\.ag-seg--views \.ag-seg-btn \{ flex-direction: row; min-height: 40px;/);
});

test('ferramentas guardadas: no celular ao lado de Filtros, no computador ao lado de ← Hoje →', () => {
  assert.match(mobile, /\.ag-toolbar \{\s+display: grid;\s+grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(agenda, /<AgendaToolsMenu placement="bar">\{toolItems\}<\/AgendaToolsMenu>/);
  assert.match(agenda, /<AgendaToolsMenu placement="head">\{toolItems\}<\/AgendaToolsMenu>/);
  // Dentro do menu o rótulo é inteiro; não há mais rótulo encurtado.
  assert.match(agenda, /<IconClockCalendar \/>\s+Horários de atendimento/);
  assert.match(agenda, /<IconSliders \/>\s+Configurar agenda/);
  assert.doesNotMatch(agenda, /ag-tool-long|ag-tool-btn--wide/);
  // Um lugar por largura: .agt--bar só no celular, .agt--head só no computador.
  assert.match(css, /\.agt--bar \{ display: none; \}/);
  assert.match(css, /\.agt--head \{ display: none; \}\s+\.agt--bar \{ display: block; \}/);
});

test('filtros recolhidos no celular, sempre visíveis no desktop, sem negrito herdado', () => {
  assert.match(css, /\.ag-filters-toggle \{\s+display: none;/, 'botão Filtros não aparece no desktop');
  assert.match(mobile, /\.ag-filters:not\(\.is-open\) \{\s+display: none;/);
  assert.match(mobile, /\.ag-filter-wrap \{\s+font-weight: 400;/);
  assert.match(agenda, /aria-expanded=\{filtersOpen\}/);
});

test('data do título com só a primeira letra maiúscula', () => {
  assert.match(css, /\.ag-month::first-letter,\s+\.ag-side-title::first-letter \{\s+text-transform: uppercase;/);
  const month = css.slice(css.indexOf('.ag-month {'), css.indexOf('}', css.indexOf('.ag-month {')));
  assert.doesNotMatch(month, /capitalize/, '"24 De Setembro" não pode voltar');
});
