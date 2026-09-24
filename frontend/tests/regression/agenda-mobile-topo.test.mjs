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

test('visões ocupam a largura toda em 3 colunas (sem vão à direita)', () => {
  assert.match(mobile, /\.ag-seg--views \{\s+grid-column: 1 \/ -1;\s+grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/);
  // Precisa vir depois da faixa ≤900px, que põe 2 colunas.
  assert.ok(css.indexOf('Topo da agenda no celular') > css.indexOf('grid-template-columns: repeat(2, minmax(64px, 1fr))'));
});

test('ferramentas em grade 2x2 de largura igual', () => {
  assert.match(mobile, /\.ag-toolbar \{\s+display: grid;\s+grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(agenda, /Horários<span className="ag-tool-long"> de atendimento<\/span>/);
  assert.match(mobile, /\.ag-tool-long \{\s+display: none;/);
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
