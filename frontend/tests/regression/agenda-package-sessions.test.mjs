// "Sessões do pacote" na Agenda (03/11/2026, prévia A escolhida pela
// administradora). Regra em AGENTS.md §7.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const srcDir = path.join(root, 'src');

const pkg = await import(new URL('../../src/utils/agendaPackageSessions.js', import.meta.url).href);

let server;
let service;

before(async () => {
  server = await createServer({ root, logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' });
  service = await server.ssrLoadModule('/src/services/appointmentService.js');
});

after(async () => {
  await server?.close();
});

function session(id, isoDay, status, extra = {}) {
  return {
    id,
    kind: 'appointment',
    recurrence_group_id: 'g1',
    starts_at: `${isoDay}T17:00:00.000Z`,
    ends_at: `${isoDay}T17:50:00.000Z`,
    status,
    ...extra,
  };
}

// 10 sessões, fora de ordem de propósito: a conta ordena pela data.
const ROWS = [
  session('s10', '2026-12-08', 'scheduled'),
  session('s1', '2026-10-06', 'attended'),
  session('s2', '2026-10-13', 'attended'),
  session('s3', '2026-10-20', 'no_show'),
  session('s4', '2026-10-27', 'attended'),
  session('s5', '2026-11-03', 'scheduled'),
  session('s6', '2026-11-10', 'ready'),
  session('s7', '2026-11-19', 'scheduled', { rescheduled_from: '2026-11-17T17:00:00.000Z' }),
  session('s8', '2026-11-24', 'excused'),
  session('s9', '2026-12-01', 'cancelled'),
];

test('conta atendidas, faltam e total pela regra combinada', () => {
  const summary = pkg.summarizePackageSessions(ROWS, { currentId: 's5', now: new Date('2026-11-03T12:00:00Z') });

  assert.deepEqual(summary.items.map(item => item.id), ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10']);
  assert.equal(summary.attended, 3);
  // Agendado (e o legado "ready") = falta.
  assert.equal(summary.remaining, 4);
  assert.equal(summary.noShow, 1);
  assert.equal(summary.excused, 1);
  // Cancelado sai do total e fica sem número.
  assert.equal(summary.cancelled, 1);
  assert.equal(summary.total, 9);
  assert.equal(summary.items.find(item => item.id === 's9').number, null);
  assert.equal(summary.items.find(item => item.id === 's10').number, 9);
  assert.equal(summary.currentNumber, 5);
  assert.equal(summary.items.find(item => item.id === 's6').status, 'scheduled');
});

test('sessão que já passou sem resultado continua faltando e ganha aviso', () => {
  const summary = pkg.summarizePackageSessions(ROWS, { currentId: 's5', now: new Date('2026-11-12T12:00:00Z') });
  assert.equal(summary.pastWithoutOutcome, 2); // s5 e s6
  assert.equal(summary.remaining, 4);
  assert.match(pkg.packageSessionsNote(summary), /2 já passaram sem resultado marcado\./);
});

test('números e frase no plural certo', () => {
  const one = pkg.summarizePackageSessions(
    [session('a', '2026-10-06', 'attended'), session('b', '2026-10-13', 'scheduled')],
    { currentId: 'b', now: new Date('2026-10-01T00:00:00Z') },
  );
  assert.deepEqual(pkg.packageSessionsTiles(one).map(tile => `${tile.value} ${tile.label}`),
    ['1 atendida', '1 falta', '2 no pacote']);
  assert.equal(pkg.packageSessionsNote(one), 'Esta é a sessão 2 de 2.');

  const many = pkg.summarizePackageSessions(ROWS, { currentId: 's5', now: new Date('2026-11-03T12:00:00Z') });
  assert.deepEqual(pkg.packageSessionsTiles(many).map(tile => tile.label), ['atendidas', 'faltam', 'no pacote']);
  const note = pkg.packageSessionsNote(many);
  assert.match(note, /Esta é a sessão 5 de 9\./);
  assert.match(note, /1 não compareceu\./);
  assert.match(note, /1 cancelada pelo paciente\./);
  assert.match(note, /1 cancelada pela clínica, fora do total\./);
  assert.doesNotMatch(note, /\(s\)|items/);
});

test('rótulos de status são os da Agenda', async () => {
  const agenda = await import(new URL('../../src/utils/agenda.js', import.meta.url).href);
  for (const status of agenda.SELECTABLE_STATUSES) {
    assert.equal(pkg.sessionStatusLabel(status.id), status.label);
  }
  assert.equal(pkg.sessionStatusLabel('ready'), 'Agendado');
});

test('a lista vem do banco, do começo do pacote, sem coluna de valor', async () => {
  const filters = [];
  let selected = '';
  const runtime = {
    getAuthenticatedUser: async () => ({ id: 'prof-1' }),
    from: (table) => {
      assert.equal(table, 'appointments');
      const query = {
        select: (cols) => { selected = cols; return query; },
        eq: (col, value) => { filters.push(['eq', col, value]); return query; },
        gte: (col, value) => { filters.push(['gte', col, value]); return query; },
        order: async () => ({ data: [{ id: 's1' }], error: null }),
      };
      return query;
    },
  };

  const rows = await service.listSeriesSessions('g1', { runtime });
  assert.equal(rows.length, 1);
  assert.deepEqual(filters, [
    ['eq', 'recurrence_group_id', 'g1'],
    ['gte', 'starts_at', '1970-01-01T00:00:00.000Z'],
  ]);
  assert.doesNotMatch(selected, /price|amount|valor|payment|cents/i, 'a lista nunca traz valor nem pagamento');
});

test('a janela lê pelo banco, fecha por useDismiss e não usa o estado da tela', async () => {
  const dialog = await readFile(path.join(srcDir, 'components/panels/agenda/PackageSessionsDialog.jsx'), 'utf8');
  assert.match(dialog, /listSeriesSessions\(/);
  assert.match(dialog, /useDismiss\(/);
  assert.match(dialog, /dismiss\.backdropProps/);
  assert.match(dialog, /aria-label="Fechar"/);
  assert.match(dialog, /className="ag-dialog-overlay"/, 'mesmo diálogo da Agenda: painel de baixo no celular');
  assert.match(dialog, /<ScreenHelp topic=\{AGENDA_HELP\.pacote\} \/>/);
  assert.match(dialog, /PACKAGE_SESSIONS_FINANCE_NOTE/, 'diz que o pagamento fica no Financeiro');
  assert.doesNotMatch(dialog, /appointments\b(?!Service)/, 'nada do estado appointments da tela');
});

test('Agenda: botão no detalhe de toda sessão de pacote e toque leva à sessão', async () => {
  const agenda = await readFile(path.join(srcDir, 'components/panels/Agenda.jsx'), 'utf8');
  assert.match(agenda, /selectedAppointment\.recurrence_group_id && \(\r?\n\s*<button[\s\S]*?setPackageOf\(selectedAppointment\)[\s\S]*?OPEN_PACKAGE_SESSIONS_LABEL/);
  const handler = agenda.match(/function openPackageSession[\s\S]*?\r?\n {2}}\r?\n/);
  assert.ok(handler, 'openPackageSession precisa existir');
  assert.match(handler[0], /goToDate\(dayKey\)/);
  assert.match(handler[0], /setSelectedAppointment\(row\)/);
  assert.match(handler[0], /setSheetOpen\(true\)/, 'no celular, o detalhe abre no painel de baixo');
  assert.match(handler[0], /setPackageOf\(null\)/);
});

test('pacote da Agenda é diferente do pagamento do Financeiro, e a tela diz isso', async () => {
  assert.match(pkg.PACKAGE_SESSIONS_FINANCE_NOTE, /Financeiro/);
  assert.match(pkg.PACKAGE_SESSIONS_FINANCE_NOTE, /tudo no início, tudo no fim ou a cada sessão/);
  const help = await readFile(path.join(srcDir, 'data/screenHelp.js'), 'utf8');
  assert.match(help, /title: 'Sessões do pacote'/);
});
