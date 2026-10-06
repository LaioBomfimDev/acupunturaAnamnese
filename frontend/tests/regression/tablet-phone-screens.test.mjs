import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

// Agenda, Pacientes e Gestão no tablet (pedido de 06/10/2026): "tablet é
// celular grande". O jeito de celular dessas telas (topo empilhado,
// filtros recolhidos, ferramentas na barra, semana um dia por vez, menu
// da Gestão em faixa, ficha com o nome em cima das ações) começava em
// 768, 860, 900 ou 720px; agora vale até 1024px, o mesmo corte da barra
// de baixo do hub. Ao conferir no navegador (dados fictícios, 375, 820,
// 1024 e 1280px) apareceram três defeitos que também estavam no celular:
// a Agenda e a ficha do paciente rolavam de lado e os filtros da Gestão
// abriam um vão enorme entre um campo e outro.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = rel => readFile(path.resolve(root, 'src', rel), 'utf8');
const stripComments = css => css.replace(/\/\*[\s\S]*?\*\//g, '');

let agenda;
let agendaJsx;
let gestao;
let patients;
let hub;

before(async () => {
  [agenda, agendaJsx, gestao, patients, hub] = await Promise.all([
    read('styles/agenda.css').then(stripComments),
    read('components/panels/Agenda.jsx'),
    read('styles/gestao.css').then(stripComments),
    read('styles/clinicPatients.css').then(stripComments),
    read('styles/hub.css').then(stripComments),
  ]);
});

// Bloco @media que contém a última regra do seletor (a do celular vem
// depois da regra base no arquivo e precisa estar DENTRO dele).
function mediaOf(css, selector) {
  const at = css.lastIndexOf(`${selector} {`);
  assert.ok(at >= 0, `regra ${selector} não encontrada`);
  const start = css.lastIndexOf('@media', at);
  assert.ok(start >= 0, `${selector} fora de @media`);
  let depth = 0;
  for (let i = css.indexOf('{', start); i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    if (css[i] === '}') depth -= 1;
    if (depth === 0) {
      assert.ok(at < i, `${selector} fora do @media mais próximo`);
      return css.slice(start, css.indexOf('{', start)).trim();
    }
  }
  throw new Error(`@media de ${selector} não fecha`);
}

test('o jeito de celular dessas telas vale até 1024px', () => {
  // Agenda: toque, topo empilhado, filtros recolhidos, ferramentas na barra.
  assert.equal(mediaOf(agenda, '.ag-filters:not(.is-open)'), '@media (max-width: 1024px)');
  assert.equal(mediaOf(agenda, '.ag-head'), '@media (max-width: 1024px)');
  assert.match(agenda, /@media \(max-width: 1024px\) \{\s+\.ag \{\s+gap: 14px;/);
  assert.match(agenda, /@media \(max-width: 1024px\) \{\s+\.ag-toolbar \.ag-seg--views \{ grid-column: 1 \/ -1; \}/);
  // Semana um dia por vez (JS, porque troca o componente).
  assert.match(agendaJsx, /const AGENDA_WEEK_MOBILE_QUERY = '\(max-width: 1024px\)';/);
  // Gestão: menu em faixa, números e gráficos em uma coluna, filtros empilhados.
  assert.equal(mediaOf(gestao, '.gt-nav-label'), '@media (max-width: 1024px)');
  assert.match(gestao, /@media \(max-width: 1024px\) \{\s+\.gt-stat-row \{/);
  assert.match(gestao, /@media \(max-width: 1024px\) \{\s+\.gt-filters \{\s+flex-direction: column;/);
  // Pacientes: formulário em duas colunas e ficha com o nome em cima.
  assert.match(patients, /@media \(max-width: 1024px\) \{\s+\.cp-form-grid \{\s+grid-template-columns: 1fr 1fr;/);
  assert.match(patients, /@media \(max-width: 1024px\) \{\s+\.pf-identity \{\s+flex-direction: column;/);
  // Margens e título das telas do hub.
  assert.match(hub, /@media \(max-width: 1024px\) \{\s+\.hub-topbar \{\s+padding: 14px 18px;\s+\}\s+\.hub-body \{\s+padding: 20px 18px 36px;/);

  // Nenhum meio-termo volta entre 721 e 1023px nessas telas.
  for (const [name, css] of [['agenda.css', agenda], ['gestao.css', gestao], ['clinicPatients.css', patients], ['hub.css', hub]]) {
    const leftovers = [...css.matchAll(/@media \(max-width: (\d+)px\)/g)]
      .map(match => Number(match[1]))
      .filter(width => width > 720 && width < 1024);
    assert.deepEqual(leftovers, [], `${name} voltou a separar tablet de celular`);
  }
  assert.doesNotMatch(agendaJsx, /'\(max-width: (7\d\d|8\d\d|9\d\d)px\)'/, 'Agenda.jsx voltou a separar tablet de celular');
});

test('Agenda: a coluna não cresce além da tela (rolava de lado no celular)', () => {
  // Com 1fr a coluna ia até o conteúdo mais largo: 404px num celular de 375.
  assert.match(agenda, /@media \(max-width: 1080px\) \{\s+\.ag \{\s+grid-template-columns: minmax\(0, 1fr\);/);
  assert.doesNotMatch(agenda, /\.ag \{\s+grid-template-columns: 1fr;/);
});

test('ficha do paciente: as ações quebram linha (rolava de lado no celular)', () => {
  // Cinco ações presas numa linha mediam 459px num celular de 375.
  assert.match(patients, /\.pf-identity-actions \{\s+flex-wrap: wrap;\s+width: 100%;/);
  assert.match(patients, /\.pf-identity-actions \.cp-btn \{\s+flex: 1 1 auto;/);
  assert.doesNotMatch(patients, /\.pf-identity-actions \.cp-btn \{\s+flex: 1;/);
});

test('Gestão: filtros empilhados sem vão entre um campo e outro', () => {
  // Em coluna, o flex-basis de 220px virava altura (campos de 220px).
  const at = gestao.search(/\.gt-filters \{\s+flex-direction: column;/);
  assert.ok(at > 0, 'filtros empilhados não encontrados');
  assert.match(gestao.slice(at), /^\.gt-filters \{\s+flex-direction: column;\s+align-items: stretch;\s+\}\s+\.gt-filters > \* \{\s+flex: 0 0 auto;/);
});
