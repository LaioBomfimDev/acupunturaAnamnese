// ============================================================
// Agenda — linha do tempo do dia (Fase 2)
//
// A visão Dia é lista de faixas, não grade posicionada por pixel. Estes
// testes travam o que a lista precisa garantir: nada some, o intervalo
// aparece inteiro, o encaixe fora de hora ganha faixa própria, e nenhum
// estado significa "proibido".
// ============================================================

import assert from 'node:assert/strict';
import { test } from 'node:test';

const timeline = await import(
  new URL('../../src/utils/agendaTimeline.js', import.meta.url).href
);

const JORNADA = [{
  professional_id: 'prof-1',
  weekday: 3, // quarta
  starts_at: '08:00:00',
  ends_at: '18:00:00',
  break_starts_at: '12:00:00',
  break_ends_at: '13:00:00',
  slot_minutes: 60,
  is_active: true,
}];

// 2026-08-12 é uma quarta-feira.
const QUARTA = new Date(2026, 7, 12);

function atendimento(hour, minute, durationMinutes, extra = {}) {
  const start = new Date(2026, 7, 12, hour, minute);
  return {
    id: `a-${hour}-${minute}`,
    kind: 'appointment',
    status: 'scheduled',
    professional_id: 'prof-1',
    starts_at: start.toISOString(),
    ends_at: new Date(start.getTime() + durationMinutes * 60000).toISOString(),
    ...extra,
  };
}

test('o dia sai da jornada e o intervalo vira UMA faixa, não três meio slots', () => {
  const { rows, hasSchedule } = timeline.buildDayTimeline({ date: QUARTA, schedules: JORNADA });

  assert.equal(hasSchedule, true);
  assert.equal(rows[0].label, '08:00');
  assert.equal(rows.at(-1).label, '17:00');

  const intervalos = rows.filter(row => row.state === timeline.ROW_STATES.BREAK);
  assert.equal(intervalos.length, 1);
  assert.equal(intervalos[0].label, '12:00');
  assert.equal(intervalos[0].endLabel, '13:00');
});

test('o intervalo continua sendo uma faixa tocável — almoço não é parede', () => {
  const { rows } = timeline.buildDayTimeline({ date: QUARTA, schedules: JORNADA });
  const almoco = rows.find(row => row.state === timeline.ROW_STATES.BREAK);

  assert.ok(almoco.startMinutes < almoco.endMinutes,
    'a faixa precisa ter horário próprio para a tela conseguir abrir o formulário nela');
});

test('sem jornada cadastrada a visão Dia não fica em branco', () => {
  const { rows, hasSchedule } = timeline.buildDayTimeline({ date: QUARTA, schedules: [] });

  assert.equal(hasSchedule, false);
  assert.equal(rows[0].label, '07:00');
  assert.equal(rows.at(-1).label, '19:00');
  assert.equal(rows.every(row => row.fromSchedule === false), true);
});

test('atendimento cai na faixa certa e a marca como ocupada', () => {
  const consulta = atendimento(9, 0, 60);
  const { rows } = timeline.buildDayTimeline({
    date: QUARTA,
    schedules: JORNADA,
    appointments: [consulta],
  });

  const nove = rows.find(row => row.label === '09:00');
  assert.equal(nove.state, timeline.ROW_STATES.BUSY);
  assert.deepEqual(nove.items.map(item => item.id), [consulta.id]);

  const dez = rows.find(row => row.label === '10:00');
  assert.equal(dez.state, timeline.ROW_STATES.FREE);
});

test('atendimento desalinhado entra na faixa que ele invade, não some', () => {
  const encaixe = atendimento(9, 30, 30);
  const { rows } = timeline.buildDayTimeline({
    date: QUARTA,
    schedules: JORNADA,
    appointments: [encaixe],
  });

  const nove = rows.find(row => row.label === '09:00');
  assert.equal(nove.items.length, 1, '09:30 invade a faixa das 09:00');
  assert.equal(nove.state, timeline.ROW_STATES.BUSY);
});

test('encaixe fora da jornada ganha faixa própria, em ordem de horário', () => {
  const fora = atendimento(21, 0, 60);
  const { rows } = timeline.buildDayTimeline({
    date: QUARTA,
    schedules: JORNADA,
    appointments: [fora],
  });

  const ultima = rows.at(-1);
  assert.equal(ultima.label, '21:00');
  assert.equal(ultima.state, timeline.ROW_STATES.OUTSIDE);
  assert.equal(ultima.items[0].id, fora.id);
  assert.equal(ultima.fromSchedule, false);
});

test('bloqueio marca a faixa como bloqueada, e não como ocupada', () => {
  const bloqueio = atendimento(15, 0, 60, { kind: 'block', note: 'Reunião' });
  const { rows } = timeline.buildDayTimeline({
    date: QUARTA,
    schedules: JORNADA,
    appointments: [bloqueio],
  });

  const quinze = rows.find(row => row.label === '15:00');
  assert.equal(quinze.state, timeline.ROW_STATES.BLOCKED);
});

test('bloqueio e atendimento no mesmo horário convivem, com o bloqueio prevalecendo no rótulo', () => {
  const bloqueio = atendimento(15, 0, 60, { id: 'b1', kind: 'block', note: 'Reunião' });
  const consulta = atendimento(15, 0, 60, { id: 'c1' });

  const { rows } = timeline.buildDayTimeline({
    date: QUARTA,
    schedules: JORNADA,
    appointments: [consulta, bloqueio],
  });

  const quinze = rows.find(row => row.label === '15:00');
  assert.equal(quinze.items.length, 2, 'os dois aparecem: marcar sobre bloqueio é permitido');
  assert.equal(quinze.state, timeline.ROW_STATES.BLOCKED);
});

test('agendamento de outro dia não entra na linha do tempo', () => {
  const outroDia = {
    id: 'x',
    kind: 'appointment',
    professional_id: 'prof-1',
    starts_at: new Date(2026, 7, 13, 9, 0).toISOString(),
    ends_at: new Date(2026, 7, 13, 10, 0).toISOString(),
  };

  const { rows } = timeline.buildDayTimeline({
    date: QUARTA,
    schedules: JORNADA,
    appointments: [outroDia],
  });

  assert.equal(rows.every(row => row.items.length === 0), true);
});

test('feriado do dia vem junto para a tela poder avisar', () => {
  const { holiday } = timeline.buildDayTimeline({
    date: QUARTA,
    schedules: JORNADA,
    holidays: [{ day: '2026-08-12', name: 'Aniversário da cidade', is_working_day: false }],
  });

  assert.equal(holiday.name, 'Aniversário da cidade');
});

// ---------- faixa da semana ----------

test('a faixa da semana começa no domingo e marca hoje', () => {
  const week = timeline.buildWeekStrip(QUARTA, { today: QUARTA });

  assert.equal(week.length, 7);
  assert.equal(week[0].weekday, 0);
  assert.equal(week[0].day, 9, 'a semana de 12/08/2026 começa em 09/08');
  assert.equal(week.filter(day => day.isToday).length, 1);
  assert.equal(week.find(day => day.isToday).day, 12);
});

test('a faixa da semana atravessa a virada de mês sem inventar dia', () => {
  const week = timeline.buildWeekStrip(new Date(2026, 7, 31), { today: null });

  assert.equal(week[0].key, '2026-08-30');
  assert.equal(week.at(-1).key, '2026-09-05');
});

test('a contagem do dia aparece na faixa da semana', () => {
  const counts = new Map([['2026-08-12', [1, 2, 3]]]);
  const week = timeline.buildWeekStrip(QUARTA, { counts });

  assert.equal(week.find(day => day.key === '2026-08-12').count, 3);
  assert.equal(week.find(day => day.key === '2026-08-11').count, 0);
});

// ---------- base da taxa de ocupação (Fase 5) ----------

test('minutos disponíveis descontam o intervalo', () => {
  assert.equal(timeline.availableMinutes(JORNADA, QUARTA), 9 * 60,
    '08–18 menos uma hora de almoço');
});

test('dia sem jornada não tem minutos disponíveis', () => {
  assert.equal(timeline.availableMinutes(JORNADA, new Date(2026, 7, 15)), 0);
});

test('minutos ocupados ignoram bloqueio — bloqueio não é atendimento', () => {
  const lista = [
    atendimento(9, 0, 60),
    atendimento(10, 0, 30),
    atendimento(15, 0, 60, { kind: 'block' }),
  ];

  assert.equal(timeline.occupiedMinutes(lista), 90);
});
