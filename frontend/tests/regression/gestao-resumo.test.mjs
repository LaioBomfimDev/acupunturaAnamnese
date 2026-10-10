import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';

// Gestão, opção B (escolhida em 10/10/2026): a Gestão abre num Resumo,
// um quadro por aba com o número que mais importa nela, e o menu repete o
// número ao lado do nome. No celular e no tablet o Resumo é o índice: a
// faixa de abas some e cada aba volta por "Voltar ao Resumo".

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => readFile(path.join(root, 'src', file), 'utf8');

let server;
let summary;

before(async () => {
  server = await createServer({ root, logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' });
  summary = await server.ssrLoadModule('/src/utils/gestaoSummary.js');
});

after(async () => {
  await server?.close();
});

const NOW = new Date(2026, 9, 9, 15, 0); // 09/10/2026, 15h
const at = (month, day, hour = 10) => new Date(2026, month, day, hour).toISOString();
const appt = (status, iso) => ({ kind: 'appointment', status, starts_at: iso });

test('cada quadro conta pelo mesmo critério da sua aba', () => {
  const appointments = [
    appt('attended', at(9, 2)), appt('scheduled', at(9, 20)), // outubro, conta em Indicadores
    appt('no_show', at(9, 7)), appt('excused', at(9, 6)), // faltas recentes
    appt('no_show', at(8, 20)), // falta de 19 dias atrás: Faltosos, não Indicadores (setembro)
    appt('no_show', at(7, 20)), // mais de 30 dias: fora
    { kind: 'block', status: 'scheduled', starts_at: at(9, 3) }, // bloqueio nunca conta
    appt('cancelled', at(9, 4)),
  ];
  const tiles = summary.buildGestaoSummary({
    appointments,
    returns: [{ patient_id: 'a' }, { patient_id: 'b' }],
    surveys: [
      { responded_at: at(9, 3), rating: 5 },
      { responded_at: at(9, 4), rating: 4 },
      { responded_at: null, expires_at: at(9, 30) }, // aguardando
      { responded_at: null, expires_at: at(9, 1) }, // expirada: não aguarda mais
    ],
    assignments: [{ status: 'submitted' }, { status: 'pending' }, { status: 'cancelled' }],
    members: [{ has_agenda: true }, { has_agenda: false }, {}],
    accessLogs: [{ created_at: new Date(2026, 9, 9, 8).toISOString() }, { created_at: at(9, 8) }],
    now: NOW,
  });

  assert.equal(tiles.indicadores.value, 2);
  assert.match(tiles.indicadores.line, /em outubro, sem contar faltas/);
  assert.equal(tiles.faltosos.value, 3);
  assert.equal(tiles.faltosos.line, '2 sem aviso nos últimos 30 dias');
  assert.equal(tiles.faltosos.tone, 'danger');
  assert.equal(tiles.retornos.value, 2);
  assert.equal(tiles.retornos.tone, 'warning');
  assert.equal(summary.summaryDisplay(tiles.pesquisa), '4,5');
  assert.match(tiles.pesquisa.line, /1 aguardando resposta$/);
  assert.equal(tiles.importaveis.value, 2, 'cancelado não conta');
  assert.equal(tiles.importaveis.line, '1 respondido · 1 aguardando');
  assert.equal(tiles.profissionais.value, 3);
  assert.equal(tiles.profissionais.line, '2 atendem na Agenda');
  assert.equal(tiles.acessos.value, 1);
  assert.equal(tiles.acessos.line, 'entrada no sistema hoje');
});

test('busca que falha deixa só o seu quadro com traço; zero é número de verdade', () => {
  const tiles = summary.buildGestaoSummary({ appointments: [], returns: null, now: NOW });
  assert.equal(summary.summaryDisplay(tiles.retornos), '–');
  assert.equal(summary.summaryDisplay(tiles.faltosos), '0');
  assert.equal(tiles.faltosos.line, 'nenhuma falta nos últimos 30 dias');
  assert.equal(summary.summaryDisplay(tiles.pesquisa), '–', 'sem pesquisa carregada, sem número');
  assert.equal(summary.summaryDisplay(tiles.documentos), '', 'Documentos não tem número');
});

test('a Agenda vem numa busca só, cobrindo o mês e os últimos 30 dias', async () => {
  const range = summary.summaryAppointmentRange(new Date(2026, 9, 9));
  assert.equal(range.from.getMonth(), 8, 'começa em setembro (30 dias antes)');
  assert.equal(range.to.getMonth(), 10, 'vai até o fim de outubro');

  const service = await read('services/gestaoSummaryService.js');
  assert.match(service, /Promise\.allSettled\(/, 'uma busca que falha não derruba as outras');
  assert.equal((service.match(/listAppointments\(/g) || []).length, 1);
});

test('Resumo é a primeira aba do lado Gestão, com ajuda, números no menu e índice no celular', async () => {
  const gestao = await read('components/panels/RelatoriosGestao.jsx');
  assert.match(gestao, /\{ side: 'gestao', label: 'Visão geral', ids: \['resumo'\] \},\r?\n\s+\{ side: 'gestao', label: 'Atendimentos'/);
  assert.match(gestao, /<GestaoResumo\r?\n/);
  assert.match(gestao, /counts=\{navCounts\}/);
  assert.match(gestao, /<HubBackButton nested label="Voltar ao Resumo" onClick=\{\(\) => setSection\('resumo'\)\} className="topbar-button gt-back-summary" \/>/);
  assert.match(gestao, /className=\{`gt gt--rail\$\{side === 'gestao' \? ' gt--index' : ''\}`\}/);

  const help = await server.ssrLoadModule('/src/data/screenHelp.js');
  assert.ok(help.GESTAO_HELP.resumo?.summary, 'Resumo sem "Como funciona"');

  const nav = await read('components/panels/GestaoNav.jsx');
  assert.match(nav, /className=\{`gt-nav-count\$\{counts\[id\]\.tone \? ` gt-nav-count--\$\{counts\[id\]\.tone\}` : ''\}`\}/);

  const css = await read('styles/gestao.css');
  // Fora do celular o "Voltar ao Resumo" some; no celular a faixa de abas some no lado Gestão.
  assert.match(css, /\.gt button\.hub-back\.gt-back-summary \{\r?\n\s+display: none;/);
  assert.match(css, /@media \(max-width: 1024px\) \{\r?\n\s+\.gt--index \.gt-nav \{\r?\n\s+display: none;\r?\n\s+\}\r?\n\r?\n\s+\.gt--index button\.hub-back\.gt-back-summary \{\r?\n\s+display: flex;/);
  assert.match(css, /\.gt-resumo \{\r?\n\s+grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
});
