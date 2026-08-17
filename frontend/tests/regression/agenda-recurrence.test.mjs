// ============================================================
// Agenda — série de sessões (pacote)
//
// O que estes testes protegem:
//  * a série é contada em SESSÕES, não em semanas;
//  * nenhuma data é descartada em silêncio — feriado e sábado entram
//    marcados, e quem decide é a pessoa;
//  * um conflito no meio do pacote não derruba as outras sessões.
// ============================================================

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const recurrence = await import(
  new URL('../../src/utils/agendaRecurrence.js', import.meta.url).href
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

// 2026-08-11 é uma terça-feira.
const TERCA = new Date(2026, 7, 11);

// ---------- geração de datas ----------

test('dez sessões numa terça geram dez terças seguidas', () => {
  const dates = recurrence.buildRecurrenceDates({ start: TERCA, count: 10 });

  assert.equal(dates.length, 10);
  assert.equal(dates[0].getDate(), 11, 'a primeira sessão é a data escolhida');
  assert.equal(dates.every(date => date.getDay() === 2), true);
  assert.equal(dates[1].getDate(), 18);
  assert.equal(dates.at(-1).getMonth(), 9, 'dez terças a partir de agosto chegam em outubro');
});

test('duas vezes por semana alterna os dias na ordem certa', () => {
  // Terça e quinta, o padrão de fisioterapia.
  const dates = recurrence.buildRecurrenceDates({
    start: TERCA,
    weekdays: [2, 4],
    count: 6,
  });

  assert.deepEqual(dates.map(date => date.getDate()), [11, 13, 18, 20, 25, 27]);
  assert.deepEqual(dates.map(date => date.getDay()), [2, 4, 2, 4, 2, 4]);
});

test('a data inicial só entra se o dia dela estiver selecionado', () => {
  const dates = recurrence.buildRecurrenceDates({
    start: TERCA,
    weekdays: [4], // só quinta
    count: 3,
  });

  assert.equal(dates[0].getDate(), 13, 'começa na quinta seguinte, não na terça');
  assert.equal(dates.every(date => date.getDay() === 4), true);
});

test('a série atravessa a virada de mês e de ano sem inventar data', () => {
  const dates = recurrence.buildRecurrenceDates({
    start: new Date(2026, 11, 29), // terça, 29/12/2026
    count: 3,
  });

  assert.deepEqual(dates.map(d => `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`), [
    '29/12/2026', '5/1/2027', '12/1/2027',
  ]);
});

test('contagem inválida não vira laço infinito nem série gigante', () => {
  assert.deepEqual(recurrence.buildRecurrenceDates({ start: TERCA, count: 0 }), []);
  assert.deepEqual(recurrence.buildRecurrenceDates({ start: TERCA, count: -5 }), []);
  assert.deepEqual(recurrence.buildRecurrenceDates({ start: 'ontem', count: 10 }), []);

  const enorme = recurrence.buildRecurrenceDates({ start: TERCA, count: 9999 });
  assert.equal(enorme.length, recurrence.MAX_OCCURRENCES);
});

// ---------- conferência da série ----------

function evaluateSabadoEFeriado(start) {
  const excecoes = [];
  if (start.getDay() === 6) excecoes.push({ kind: 'day_off', label: 'Fora dos dias de atendimento (sábado)' });
  if (start.getMonth() === 8 && start.getDate() === 7) excecoes.push({ kind: 'holiday', label: 'Feriado: Independência' });

  return {
    isException: excecoes.length > 0,
    reason: excecoes.map(item => item.label).join(' · '),
    exceptions: excecoes,
  };
}

test('feriado no meio do pacote entra MARCADO, não some da lista', () => {
  // Segundas a partir de 31/08: a segunda sessão cai em 07/09.
  const dates = recurrence.buildRecurrenceDates({ start: new Date(2026, 7, 31), count: 4 });
  const items = recurrence.describeSeries({
    dates,
    evaluate: evaluateSabadoEFeriado,
    time: '14:00',
    durationMinutes: 60,
  });

  assert.equal(items.length, 4, 'pular sozinho seria o sistema decidindo pela clínica');

  const feriado = items.find(item => item.key === '2026-09-07');
  assert.ok(feriado);
  assert.equal(feriado.isException, true);
  assert.match(feriado.reason, /Independência/);

  const resumo = recurrence.summarizeSeries(items);
  assert.equal(resumo.total, 4);
  assert.equal(resumo.excecoes, 1);
});

test('a conferência avisa o conflito com quem já está marcado', () => {
  const dates = recurrence.buildRecurrenceDates({ start: TERCA, count: 3 });
  const jaMarcado = {
    id: 'x1',
    kind: 'appointment',
    status: 'scheduled',
    professional_id: 'prof-1',
    starts_at: new Date(2026, 7, 18, 14, 30).toISOString(),
    ends_at: new Date(2026, 7, 18, 15, 30).toISOString(),
  };

  const items = recurrence.describeSeries({
    dates,
    appointments: [jaMarcado],
    professionalId: 'prof-1',
    time: '14:00',
    durationMinutes: 60,
  });

  assert.equal(items[0].conflict, null);
  assert.equal(items[1].conflict?.id, 'x1', '18/08 às 14h invade o atendimento das 14h30');
  assert.equal(items[2].conflict, null);
  assert.equal(recurrence.summarizeSeries(items).conflitos, 1);
});

test('agendamento cancelado não conta como conflito — o horário está livre', () => {
  const dates = recurrence.buildRecurrenceDates({ start: TERCA, count: 1 });
  const items = recurrence.describeSeries({
    dates,
    appointments: [{
      id: 'x1',
      kind: 'appointment',
      status: 'cancelled',
      professional_id: 'prof-1',
      starts_at: new Date(2026, 7, 11, 14, 0).toISOString(),
      ends_at: new Date(2026, 7, 11, 15, 0).toISOString(),
    }],
    professionalId: 'prof-1',
    time: '14:00',
  });

  assert.equal(items[0].conflict, null);
});

test('agenda de outro profissional não conflita com a série', () => {
  const dates = recurrence.buildRecurrenceDates({ start: TERCA, count: 1 });
  const items = recurrence.describeSeries({
    dates,
    appointments: [{
      id: 'x1',
      kind: 'appointment',
      status: 'scheduled',
      professional_id: 'outro',
      starts_at: new Date(2026, 7, 11, 14, 0).toISOString(),
      ends_at: new Date(2026, 7, 11, 15, 0).toISOString(),
    }],
    professionalId: 'prof-1',
    time: '14:00',
  });

  assert.equal(items[0].conflict, null);
});

// ---------- criação da série ----------

function runtimeQueFalhaEm(datasQueFalham) {
  return {
    newGroupId: () => 'grupo-teste',
    getAuthenticatedUser: async () => ({ id: 'u1' }),
    from: () => ({
      insert(payload) {
        return {
          select: () => ({
            single: async () => {
              const dia = new Date(payload.starts_at).getDate();
              if (datasQueFalham.includes(dia)) {
                return {
                  data: null,
                  error: {
                    code: '23P01',
                    message: 'conflicting key value violates exclusion constraint "appointments_no_overlap"',
                  },
                };
              }
              return { data: { id: `a-${dia}`, ...payload }, error: null };
            },
          }),
        };
      },
    }),
  };
}

const BASE_SERIE = {
  kind: 'appointment',
  patientId: 'p1',
  professionalId: 'prof-1',
  discipline: 'acupuntura',
};

function itemsDe(dates, { time = '14:00' } = {}) {
  return dates.map(date => {
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), ...time.split(':').map(Number));
    return { start, end: new Date(start.getTime() + 3600000), isException: false, reason: '' };
  });
}

test('todas as sessões da série compartilham o mesmo grupo', async () => {
  const dates = recurrence.buildRecurrenceDates({ start: TERCA, count: 4 });
  const result = await service.createSeries(BASE_SERIE, {
    items: itemsDe(dates),
    runtime: runtimeQueFalhaEm([]),
  });

  assert.equal(result.created.length, 4);
  assert.equal(result.failed.length, 0);
  assert.equal(
    result.created.every(item => item.recurrence_group_id === 'grupo-teste'),
    true,
    'sem o grupo não há como cancelar "deste em diante" depois',
  );
});

test('conflito no meio do pacote NÃO derruba as outras sessões', async () => {
  const dates = recurrence.buildRecurrenceDates({ start: TERCA, count: 5 });
  const result = await service.createSeries(BASE_SERIE, {
    items: itemsDe(dates),
    runtime: runtimeQueFalhaEm([18]), // a segunda terça já está ocupada
  });

  assert.equal(result.created.length, 4);
  assert.equal(result.failed.length, 1);
  assert.equal(result.failed[0].start.getDate(), 18);
  assert.match(result.failed[0].message, /já tem atendimento nesse horário/);
});

test('série vazia é recusada antes de tocar no banco', async () => {
  await assert.rejects(
    () => service.createSeries(BASE_SERIE, {
      items: [],
      runtime: { from: () => { throw new Error('não deveria consultar o banco'); } },
    }),
    /pelo menos uma sessão/,
  );
});

test('a exceção de cada sessão é gravada individualmente', async () => {
  const dates = recurrence.buildRecurrenceDates({ start: new Date(2026, 7, 31), count: 2 });
  const items = itemsDe(dates).map((item, index) => (
    index === 1
      ? { ...item, isException: true, reason: 'Feriado: Independência' }
      : item
  ));

  const result = await service.createSeries(BASE_SERIE, {
    items,
    runtime: runtimeQueFalhaEm([]),
  });

  assert.equal(result.created[0].is_exception, false);
  assert.equal(result.created[1].is_exception, true);
  assert.equal(result.created[1].exception_reason, 'Feriado: Independência');
});

test('cancelar a série exige grupo e data válidos', async () => {
  const runtime = {
    getAuthenticatedUser: async () => { throw new Error('não deveria autenticar'); },
    from: () => { throw new Error('não deveria consultar o banco'); },
  };

  await assert.rejects(
    () => service.cancelSeriesFrom(null, { fromIso: '2026-08-11T00:00:00Z', runtime }),
    /Série não informada/,
  );

  await assert.rejects(
    () => service.cancelSeriesFrom('g1', { fromIso: 'qualquer coisa', runtime }),
    /Data inicial inválida/,
  );
});

test('cancelar "deste em diante" não toca no que já foi atendido', async () => {
  const chamadas = {};
  const runtime = {
    getAuthenticatedUser: async () => ({ id: 'u1' }),
    from: () => ({
      update(patch) {
        chamadas.patch = patch;
        const chain = {
          eq(column, value) { chamadas[column] = value; return chain; },
          gte(column, value) { chamadas[`gte_${column}`] = value; return chain; },
          select: async () => ({ data: [], error: null }),
        };
        return chain;
      },
    }),
  };

  await service.cancelSeriesFrom('grupo-1', {
    fromIso: '2026-09-01T14:00:00.000Z',
    reason: 'paciente desistiu',
    runtime,
  });

  assert.equal(chamadas.patch.status, 'cancelled');
  assert.equal(chamadas.patch.cancellation_reason, 'paciente desistiu');
  assert.equal(chamadas.recurrence_group_id, 'grupo-1');
  assert.equal(chamadas.gte_starts_at, '2026-09-01T14:00:00.000Z');
  assert.equal(chamadas.status, 'scheduled',
    'sessão já atendida ou faltada não pode ser cancelada retroativamente');
});
