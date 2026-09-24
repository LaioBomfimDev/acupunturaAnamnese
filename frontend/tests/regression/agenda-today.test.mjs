// ============================================================
// Agenda — lista do dia (painel "Hoje")
//
// O que estes testes protegem (regra de 2026-09-24):
//  * três grupos só — a atender, atendidos, não compareceram ou
//    cancelaram — e cada paciente em UM grupo;
//  * a agenda não sinaliza chegada nem atraso: o status legado 'ready'
//    (chegou) é tratado como "a atender";
//  * confirmar NÃO mexe no status: confirmado pode faltar.
// ============================================================

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const today = await import(
  new URL('../../src/utils/agendaToday.js', import.meta.url).href
);

let server;
let service;

before(async () => {
  server = await createServer({
    root,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  });
  service = await server.ssrLoadModule('/src/services/appointmentService.js');
});

after(async () => {
  await server?.close();
});

// Quarta, 12/08/2026, 10h da manhã.
const AGORA = new Date(2026, 7, 12, 10, 0);

function at(hour, minute, extra = {}) {
  const start = new Date(2026, 7, 12, hour, minute);
  return {
    id: `a${hour}${minute}`,
    kind: 'appointment',
    status: 'scheduled',
    discipline: 'acupuntura',
    patient_id: `p${hour}`,
    professional_id: 'prof-1',
    starts_at: start.toISOString(),
    ends_at: new Date(start.getTime() + 3600000).toISOString(),
    checked_in_at: null,
    confirmed_at: null,
    ...extra,
  };
}

test('cada paciente entra em um grupo só, na ordem do horário', () => {
  const lista = [
    at(11, 0),                                    // ainda vem
    at(9, 30),                                    // horário passou: continua "a atender"
    at(9, 0, { status: 'ready', checked_in_at: new Date(2026, 7, 12, 8, 50).toISOString() }), // legado
    at(8, 0, { status: 'attended' }),
    at(7, 0, { status: 'no_show' }),
    at(13, 0, { status: 'excused' }),             // cancelado pelo paciente
    at(15, 0, { status: 'cancelled' }),           // pacote encerrado pela clínica
  ];

  const fila = today.buildTodayQueue({ appointments: lista, now: AGORA });

  assert.deepEqual(fila.aAtender.map(i => i.appointment.id), ['a90', 'a930', 'a110']);
  assert.deepEqual(fila.atendidos.map(i => i.appointment.id), ['a80']);
  assert.deepEqual(fila.ausentes.map(i => i.appointment.id), ['a70', 'a130', 'a150']);

  const total = fila.aAtender.length + fila.atendidos.length + fila.ausentes.length;
  assert.equal(total, lista.length, 'ninguém pode aparecer em dois grupos');
});

test('sem sala de espera nem atraso: a lista não calcula tempo', () => {
  const fila = today.buildTodayQueue({ appointments: [at(9, 0)], now: AGORA });
  assert.equal('lateMinutes' in fila.aAtender[0], false);
  assert.equal('waitingMinutes' in fila.aAtender[0], false);
  assert.equal(typeof today.humanMinutes, 'undefined', 'o relógio de espera saiu junto com a sala');
});

test('bloqueio não entra na lista — vira contagem', () => {
  const lista = [
    at(9, 0),
    at(12, 0, { kind: 'block', patient_id: null, discipline: null, note: 'Almoço' }),
  ];

  const fila = today.buildTodayQueue({ appointments: lista, now: AGORA });

  assert.equal(fila.bloqueios, 1);
  assert.equal(fila.resumo.total, 1, 'bloqueio não conta como atendimento');
  const todos = [...fila.aAtender, ...fila.atendidos, ...fila.ausentes];
  assert.equal(todos.some(i => i.appointment.kind === 'block'), false);
});

test('agendamento de outro dia não entra na lista de hoje', () => {
  const outroDia = {
    ...at(9, 0),
    starts_at: new Date(2026, 7, 13, 9, 0).toISOString(),
    ends_at: new Date(2026, 7, 13, 10, 0).toISOString(),
  };

  const fila = today.buildTodayQueue({ appointments: [outroDia], now: AGORA });
  assert.equal(fila.resumo.total, 0);
});

test('o resumo conta o que se olha de relance, incluindo quem confirmou', () => {
  const lista = [
    at(9, 30),
    at(11, 0, { confirmed_at: new Date(2026, 7, 11, 18, 0).toISOString() }),
    at(8, 0, { status: 'attended' }),
    at(7, 0, { status: 'no_show' }),
    at(13, 0, { status: 'excused', confirmed_at: new Date(2026, 7, 11, 18, 0).toISOString() }),
  ];

  const { resumo } = today.buildTodayQueue({ appointments: lista, now: AGORA });

  assert.equal(resumo.total, 5);
  assert.equal(resumo.aAtender, 2);
  assert.equal(resumo.atendidos, 1);
  assert.equal(resumo.ausentes, 2);
  assert.equal(resumo.confirmados, 1, 'confirmado que cancelou não conta como confirmado a atender');
});

// ---------- service ----------

function runtimeCapturando(store) {
  return {
    getAuthenticatedUser: async () => ({ id: 'u1' }),
    from: () => ({
      update(patch) {
        store.patch = patch;
        const chain = {
          eq(column, value) { store[column] = value; return chain; },
          select: () => ({ single: async () => ({ data: { id: 'a1', ...patch }, error: null }) }),
        };
        return chain;
      },
    }),
  };
}

test('confirmar NÃO mexe no status: confirmado pode faltar', async () => {
  const store = {};
  await service.confirmAppointment('a1', {
    at: '2026-08-11T21:00:00.000Z',
    runtime: runtimeCapturando(store),
  });

  assert.equal(store.patch.confirmed_at, '2026-08-11T21:00:00.000Z');
  assert.equal('status' in store.patch, false,
    'misturar confirmação com estado do atendimento estragaria as duas informações');
});

test('confirmação exige agendamento', async () => {
  const runtime = {
    getAuthenticatedUser: async () => { throw new Error('não deveria autenticar'); },
    from: () => { throw new Error('não deveria consultar o banco'); },
  };

  await assert.rejects(() => service.confirmAppointment('', { runtime }), /não informado/i);
});
