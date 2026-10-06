import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';

// Evoluções > "Ver evoluções" (2026-10-01): a administração confere se a
// equipe evoluiu cada atendimento e quando — sem ler o texto (opção A).
// Mora na tela Evoluções, ao lado de "Escrever evoluções" (AGENTS.md §7).

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let server;
let review;
let service;
let screen;
let reviewScreen;

before(async () => {
  server = await createServer({
    root,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  });
  review = await server.ssrLoadModule('/src/utils/evolutionReview.js');
  service = await server.ssrLoadModule('/src/services/patientEvolutionService.js');
  [screen, reviewScreen] = await Promise.all([
    readFile(path.join(root, 'src/components/evolutions/EvolutionsScreen.jsx'), 'utf8'),
    readFile(path.join(root, 'src/components/evolutions/EvolutionsReview.jsx'), 'utf8'),
  ]);
});

after(async () => {
  await server?.close();
});

function appointment(id, overrides = {}) {
  return {
    id,
    kind: 'appointment',
    status: 'attended',
    discipline: 'psicologia',
    professional_id: 'ana',
    patient_id: `pac-${id}`,
    starts_at: new Date(2026, 8, 28, 14, 0).toISOString(),
    ends_at: new Date(2026, 8, 28, 15, 0).toISOString(),
    created_at: new Date(2026, 8, 20, 9, 0).toISOString(),
    ...overrides,
  };
}

function evolution(appointmentId, registradoEm, revision = 1) {
  return { id: `ev-${appointmentId}`, appointment_id: appointmentId, registrado_em: registradoEm.toISOString(), revision };
}

const now = new Date(2026, 9, 1, 10, 0);

test('cada atendimento concluído vira linha: evoluído ou falta evoluir', () => {
  const rows = review.buildEvolutionReview(
    [
      appointment('mesmo-dia'),
      appointment('depois'),
      appointment('pendente', { starts_at: new Date(2026, 8, 26, 9, 0).toISOString() }),
      appointment('falta', { status: 'no_show' }),
    ],
    [
      evolution('mesmo-dia', new Date(2026, 8, 28, 19, 30)),
      evolution('depois', new Date(2026, 9, 1, 8, 0), 3),
    ],
    { now },
  );
  const byId = Object.fromEntries(rows.map(row => [row.id, row]));

  assert.equal(byId['mesmo-dia'].evolved, true);
  assert.equal(byId.depois.evolved, true);
  assert.equal(byId.depois.corrections, 2, 'revisão 3 = corrigida 2 vezes');
  assert.equal(byId.pendente.evolved, false);
  assert.equal(byId.pendente.pendingDays, 5);
  assert.equal(byId.falta.attendanceStatus, 'no_show', 'falta também pede evolução');
  // Mais recente primeiro, como a fila.
  assert.equal(rows.at(-1).id, 'pendente');
});

test('fica fora o que não pede evolução', () => {
  const rows = review.buildEvolutionReview(
    [
      appointment('agendado', { status: 'scheduled' }),
      appointment('cancelado', { status: 'cancelled' }),
      appointment('bloqueio', { kind: 'block' }),
      appointment('sem-formulario', { discipline: 'fonoaudiologia' }),
      // Antes de 22/09/2026 a evolução era no sistema anterior.
      appointment('importado', { starts_at: new Date(2026, 8, 21, 14, 0).toISOString() }),
    ],
    [],
    { now },
  );
  assert.deepEqual(rows, []);
});

test('evolução já escrita continua aparecendo mesmo antes do corte', () => {
  const rows = review.buildEvolutionReview(
    [appointment('antigo', { starts_at: new Date(2026, 8, 21, 14, 0).toISOString() })],
    [evolution('antigo', new Date(2026, 8, 21, 18, 0))],
    { now },
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].evolved, true);
});

test('profissional só vê os próprios: atendimento do colega não vira falso "Falta evoluir"', () => {
  // A Agenda é da instituição, mas a RLS só devolve as evoluções da
  // própria pessoa: sem o corte, o atendimento já evoluído da Bia
  // apareceria como pendente para a Ana.
  const appointments = [appointment('da-ana'), appointment('da-bia', { professional_id: 'bia' })];
  const rows = review.buildEvolutionReview(appointments, [], { now, onlyProfessionalId: 'ana' });
  assert.deepEqual(rows.map(row => row.id), ['da-ana']);

  assert.equal(review.canSeeTeamEvolutions({ role: 'clinic_admin' }), true);
  assert.equal(review.canSeeTeamEvolutions({ role: 'super_admin' }), true);
  assert.equal(review.canSeeTeamEvolutions({ role: 'therapist' }), false);
  assert.equal(review.canSeeTeamEvolutions({ role: 'receptionist' }), false);
  assert.match(reviewScreen, /onlyProfessionalId: teamView \? null : profile\?\.id/);
});

test('números do topo, filtros e resumo por profissional', () => {
  const rows = review.buildEvolutionReview(
    [
      appointment('a1'),
      appointment('a2'),
      appointment('b1', { professional_id: 'bia', discipline: 'fisioterapia' }),
      appointment('b2', { professional_id: 'bia', discipline: 'fisioterapia' }),
    ],
    [
      evolution('a1', new Date(2026, 8, 28, 20, 0)),
      evolution('a2', new Date(2026, 8, 30, 8, 0), 2),
    ],
    { now },
  );

  // Só dois números: concluídos (com quantos evoluídos) e falta evoluir.
  assert.deepEqual(review.evolutionReviewStats(rows), {
    total: 4, evolved: 2, pending: 2, oldestPendingDays: 3,
  });
  assert.deepEqual(review.evolutionReviewStats([]).oldestPendingDays, null);
  assert.deepEqual(
    review.filterEvolutionReview(rows, { onlyPending: true }).map(row => row.id).sort(),
    ['b1', 'b2'],
  );
  assert.equal(review.filterEvolutionReview(rows, { discipline: 'fisioterapia' }).length, 2);

  // Quem tem pendência vem primeiro no quadro.
  const team = review.evolutionReviewByProfessional(rows);
  assert.deepEqual(team.map(item => item.id), ['bia', 'ana']);
  assert.equal(team[0].oldestPendingDays, 3);
  assert.equal(team[1].oldestPendingDays, null);
});

test('busca pelo nome sem acento, sem maiúscula e por pedaços', () => {
  const names = { p1: 'João Conceição', p2: 'Ana Ribeiro', p3: 'Mariana Souza' };
  const rows = review.buildEvolutionReview(
    [
      appointment('1', { patient_id: 'p1' }),
      appointment('2', { patient_id: 'p2' }),
      appointment('3', { patient_id: 'p3' }),
    ],
    [],
    { now },
  );
  const find = query => review.filterEvolutionReview(rows, { query, nameOf: id => names[id] })
    .map(row => row.appointment.patient_id).sort();

  assert.deepEqual(find('joao conceicao'), ['p1']);
  assert.deepEqual(find('  ANA rib '), ['p2']);
  assert.deepEqual(find('ana'), ['p2', 'p3'], 'pedaço do nome vale');
  assert.deepEqual(find('ana souza'), ['p3'], 'todas as palavras precisam estar no nome');
  assert.deepEqual(find(''), ['p1', 'p2', 'p3']);
});

test('textos no plural certo, sem "(s)"', () => {
  assert.equal(review.pendingLabel(0), 'Falta evoluir · atendido hoje');
  assert.equal(review.pendingLabel(1), 'Falta evoluir · há 1 dia');
  assert.equal(review.pendingLabel(6), 'Falta evoluir · há 6 dias');
  assert.equal(review.correctionsLabel(1), 'corrigida 1 vez');
  assert.equal(review.correctionsLabel(2), 'corrigida 2 vezes');
  assert.equal(review.pendingDaysLabel(null), '—');
  assert.equal(review.pendingDaysLabel(1), '1 dia');
  assert.equal(review.atendimentosLabel(1), '1 atendimento');
  assert.equal(review.atendimentosLabel(3), '3 atendimentos');
});

test('período: não volta para antes de 22/09/2026', () => {
  const setembro = { start: new Date(2026, 8, 1), end: new Date(2026, 9, 1) };
  const outubro = { start: new Date(2026, 9, 1), end: new Date(2026, 10, 1) };
  const agosto = { start: new Date(2026, 7, 1), end: new Date(2026, 8, 1) };
  assert.equal(review.canGoBackEvolutionReview(outubro), true);
  assert.equal(review.canGoBackEvolutionReview(setembro), false);
  assert.equal(review.isBeforeEvolutionReview(agosto), true);
  assert.equal(review.isBeforeEvolutionReview(setembro), false);
});

test('a conferência nunca pede o texto da evolução ao banco', async () => {
  assert.doesNotMatch(service.EVOLUTION_REVIEW_COLUMNS, /conteudo/);
  for (const column of ['appointment_id', 'therapist_id', 'registrado_em', 'revision']) {
    assert.ok(service.EVOLUTION_REVIEW_COLUMNS.split(',').includes(column), `falta ${column}`);
  }

  const calls = [];
  const query = {
    select(columns) { calls.push(['select', columns]); return query; },
    gte(column, value) { calls.push(['gte', column, value]); return query; },
    lt(column, value) { calls.push(['lt', column, value]); return query; },
    order() { return query; },
    limit() { return Promise.resolve({ data: [{ id: 'ev-1' }], error: null }); },
  };
  const runtime = {
    getAuthenticatedUser: async () => ({ id: 'admin' }),
    from: table => { calls.push(['from', table]); return query; },
  };
  const from = new Date(2026, 8, 1).toISOString();
  const to = new Date(2026, 9, 1).toISOString();
  const data = await service.listEvolutionReviewRows({ from, to, runtime });

  assert.deepEqual(data, [{ id: 'ev-1' }]);
  assert.deepEqual(calls[0], ['from', 'patient_evolutions']);
  assert.deepEqual(calls[1], ['select', service.EVOLUTION_REVIEW_COLUMNS]);
  assert.deepEqual(calls.slice(2), [['gte', 'atendimento_em', from], ['lt', 'atendimento_em', to]]);

  // Nem a tela de conferência busca conteúdo por outro caminho.
  assert.doesNotMatch(reviewScreen, /listPatientEvolutions|conteudo/);
});

test('tela Evoluções: dois botões, e escrever não perde texto ao ir conferir', () => {
  assert.match(screen, /label: 'Escrever evoluções'/);
  assert.match(screen, /label: 'Ver evoluções'/);
  // A fila é escondida, não desmontada: a evolução em andamento continua lá.
  assert.match(screen, /<div className="evs-layout" hidden=\{mode !== 'escrever'\}>/);
  assert.match(screen, /<ScreenHelp topic=\{EVOLUCOES_REVIEW_HELP\} \/>/);
});

test('conferência só com os dois números pedidos, na tela inteira', async () => {
  // Pedido de 2026-10-01: nada de "no mesmo dia × em outro dia".
  assert.doesNotMatch(reviewScreen, /mesmo dia|outro dia/i);
  assert.match(reviewScreen, /Atendimentos concluídos/);
  assert.match(reviewScreen, /Falta evoluir/);

  const app = await readFile(path.join(root, 'src/App.jsx'), 'utf8');
  assert.match(app, /<main className="hub-body hub-body--full">\r?\n\s*<Suspense fallback=\{<PanelLoading \/>\}>\r?\n\s*<EvolutionsScreen /);
});

// Bug de 05/10/2026: no celular a página de Evoluções rolava para a
// direita. Em "Ver evoluções" o bloco Período (Semana | Mês, ‹ mês ›)
// não encolhia (flex: 0 0 auto, nome do mês em 132px) e media 392px numa
// tela de 375px. A tabela "Por profissional" (626px) também rolava de
// lado dentro da caixa. Conferido no navegador em 360, 375, 820 e 1024px.
test('celular e tablet: Ver evoluções cabe na largura da tela', async () => {
  const css = (await readFile(path.join(root, 'src/styles/evolutions.css'), 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '');
  const start = css.lastIndexOf('@media (max-width: 1024px)');
  assert.ok(start > css.indexOf('.evs-review-field--period'), 'faixa de celular e tablet depois das regras do computador');
  const phone = css.slice(start);

  // Período em linha própria, com o nome do mês podendo encolher.
  assert.match(phone, /\.evs-review-field--period \{\s*flex: 1 1 100%;/);
  assert.match(phone, /\.evs-review-period \{\s*display: grid;\s*grid-template-columns: auto minmax\(0, 1fr\) auto;/);
  assert.match(phone, /\.evs-review-segmented \{[^}]*grid-column: 1 \/ -1;/);
  assert.match(phone, /\.evs-review-period-label \{\s*min-width: 0;/);
  // Regra morta de antes: a barra é flex, grid-template-columns não fazia nada.
  assert.doesNotMatch(phone, /\.evs-review-toolbar \{[^}]*grid-template-columns/);

  // "Por profissional" vira cartão, com o rótulo de cada número.
  assert.match(phone, /\.evs-review-table thead \{\s*display: none;/);
  assert.match(phone, /\.evs-review-table tbody tr \{\s*display: grid;\s*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/);
  assert.match(phone, /\.evs-review-table td::before \{\s*content: attr\(data-label\);/);
  for (const label of ['Concluídos', 'Evoluídos', 'Falta evoluir', 'Mais antiga']) {
    assert.match(reviewScreen, new RegExp(`<td data-label="${label}"`), `número "${label}" sem rótulo no cartão`);
  }
});
