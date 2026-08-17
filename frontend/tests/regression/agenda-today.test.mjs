// ============================================================
// Agenda — fila do dia (recepção, Fase 3)
//
// O que estes testes protegem:
//  * o paciente entra em UM balde só, e a ordem dos baldes é a ordem
//    da atenção;
//  * check-in grava o instante E o status (o instante alimenta o BI, o
//    status alimenta a fila) — guardar só um dos dois quebra um lado;
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

test('cada paciente entra em um balde só', () => {
  const lista = [
    at(9, 0, { checked_in_at: new Date(2026, 7, 12, 8, 50).toISOString(), status: 'ready' }),
    at(9, 30),                                   // horário passou, não chegou
    at(11, 0),                                   // ainda vem
    at(8, 0, { status: 'attended' }),            // encerrado
  ];

  const fila = today.buildTodayQueue({ appointments: lista, now: AGORA });

  assert.deepEqual(fila.aguardando.map(i => i.appointment.id), ['a90']);
  assert.deepEqual(fila.atrasados.map(i => i.appointment.id), ['a930']);
  assert.deepEqual(fila.proximos.map(i => i.appointment.id), ['a110']);
  assert.deepEqual(fila.concluidos.map(i => i.appointment.id), ['a80']);

  const total = fila.aguardando.length + fila.atrasados.length
    + fila.proximos.length + fila.concluidos.length;
  assert.equal(total, 4, 'ninguém pode aparecer em dois baldes');
});

test('quem chegou continua "aguardando" mesmo com o horário vencido', () => {
  const lista = [at(9, 0, {
    checked_in_at: new Date(2026, 7, 12, 8, 50).toISOString(),
    status: 'ready',
  })];

  const fila = today.buildTodayQueue({ appointments: lista, now: AGORA });

  assert.equal(fila.atrasados.length, 0,
    'quem está sentado na sala não é "atrasado" — está esperando');
  assert.equal(fila.aguardando[0].waitingMinutes, 70);
});

test('a tolerância de um minuto evita o cartão pular para atrasado no relógio', () => {
  const emCima = today.buildTodayQueue({
    appointments: [at(10, 0)],
    now: AGORA,
  });
  assert.equal(emCima.proximos.length, 1, 'às 10:00 em ponto ainda não é atraso');

  const doisMinutos = today.buildTodayQueue({
    appointments: [at(9, 58)],
    now: AGORA,
  });
  assert.equal(doisMinutos.atrasados[0].lateMinutes, 2);
});

test('a sala de espera é ordenada por horário marcado, não por ordem de chegada', () => {
  const lista = [
    at(11, 0, { id: 'tarde', checked_in_at: new Date(2026, 7, 12, 9, 0).toISOString(), status: 'ready' }),
    at(9, 0, { id: 'cedo', checked_in_at: new Date(2026, 7, 12, 9, 40).toISOString(), status: 'ready' }),
  ];

  const fila = today.buildTodayQueue({ appointments: lista, now: AGORA });

  assert.deepEqual(fila.aguardando.map(i => i.appointment.id), ['cedo', 'tarde'],
    'chegar cedo não passa na frente de quem tem hora antes');
});

test('bloqueio não entra na fila — vira contagem', () => {
  const lista = [
    at(9, 0),
    at(12, 0, { kind: 'block', patient_id: null, discipline: null, note: 'Almoço' }),
  ];

  const fila = today.buildTodayQueue({ appointments: lista, now: AGORA });

  assert.equal(fila.bloqueios, 1);
  assert.equal(fila.resumo.total, 1, 'bloqueio não conta como atendimento');
  const todos = [...fila.aguardando, ...fila.atrasados, ...fila.proximos, ...fila.concluidos];
  assert.equal(todos.some(i => i.appointment.kind === 'block'), false);
});

test('agendamento de outro dia não entra na fila de hoje', () => {
  const outroDia = {
    ...at(9, 0),
    starts_at: new Date(2026, 7, 13, 9, 0).toISOString(),
    ends_at: new Date(2026, 7, 13, 10, 0).toISOString(),
  };

  const fila = today.buildTodayQueue({ appointments: [outroDia], now: AGORA });
  assert.equal(fila.resumo.total, 0);
});

test('o resumo conta o que a recepção olha de relance', () => {
  const lista = [
    at(9, 0, { checked_in_at: new Date(2026, 7, 12, 8, 30).toISOString(), status: 'ready' }),
    at(9, 15, { checked_in_at: new Date(2026, 7, 12, 9, 50).toISOString(), status: 'ready' }),
    at(9, 30),
    at(11, 0, { confirmed_at: new Date(2026, 7, 11, 18, 0).toISOString() }),
    at(8, 0, { status: 'attended' }),
    at(7, 0, { status: 'no_show' }),
  ];

  const { resumo } = today.buildTodayQueue({ appointments: lista, now: AGORA });

  assert.equal(resumo.total, 6);
  assert.equal(resumo.aguardando, 2);
  assert.equal(resumo.atrasados, 1);
  assert.equal(resumo.proximos, 1);
  assert.equal(resumo.atendidos, 1);
  assert.equal(resumo.faltas, 1);
  assert.equal(resumo.confirmados, 1);
  assert.equal(resumo.esperaMaxima, 90);
  assert.equal(resumo.esperaMedia, 50, '90 e 10 minutos de espera');
});

test('espera nunca é negativa, mesmo com relógio adiantado', () => {
  const lista = [at(9, 0, {
    checked_in_at: new Date(2026, 7, 12, 10, 30).toISOString(),
    status: 'ready',
  })];

  const fila = today.buildTodayQueue({ appointments: lista, now: AGORA });
  assert.equal(fila.aguardando[0].waitingMinutes, 0);
});

test('tempo humano vira hora quando passa de 60 minutos', () => {
  assert.equal(today.humanMinutes(0), '0 min');
  assert.equal(today.humanMinutes(45), '45 min');
  assert.equal(today.humanMinutes(60), '1 h');
  assert.equal(today.humanMinutes(95), '1 h 35 min');
  assert.equal(today.humanMinutes(-10), '0 min');
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

test('check-in grava o instante E o status — os dois lados dependem disso', async () => {
  const store = {};
  await service.checkInAppointment('a1', {
    at: '2026-08-12T13:00:00.000Z',
    runtime: runtimeCapturando(store),
  });

  assert.equal(store.patch.status, 'ready', 'a fila lê o status');
  assert.equal(store.patch.checked_in_at, '2026-08-12T13:00:00.000Z', 'o BI lê o instante');
  assert.equal(store.id, 'a1');
});

test('desfazer chegada limpa o carimbo, não só o status', async () => {
  const store = {};
  await service.checkInAppointment('a1', { undo: true, runtime: runtimeCapturando(store) });

  assert.equal(store.patch.checked_in_at, null,
    'deixar o carimbo com o status revertido faria o tempo de espera mentir');
  assert.equal(store.patch.status, 'scheduled');
});

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

test('check-in e confirmação exigem agendamento', async () => {
  const runtime = {
    getAuthenticatedUser: async () => { throw new Error('não deveria autenticar'); },
    from: () => { throw new Error('não deveria consultar o banco'); },
  };

  await assert.rejects(() => service.checkInAppointment(null, { runtime }), /não informado/i);
  await assert.rejects(() => service.confirmAppointment('', { runtime }), /não informado/i);
});
