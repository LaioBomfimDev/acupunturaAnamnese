// ============================================================
// Gestão — painel de Indicadores (Fase 5 do ERP de agenda)
//
// Cálculo puro (utils/gestaoDashboard.js): sem Supabase, sem mock. Trava
// os pontos que já erraram em código parecido antes — mês por fuso
// local (não UTC), taxa null (não NaN) sem jornada, feriado zerando
// disponibilidade, e falta/cancelamento não contando o que não devia.
// ============================================================

import assert from 'node:assert/strict';
import { test } from 'node:test';

const dashboard = await import(
  new URL('../../src/utils/gestaoDashboard.js', import.meta.url).href
);

const JORNADA_QUARTA = [{
  professional_id: 'prof-1',
  weekday: 3, // quarta
  starts_at: '08:00:00',
  ends_at: '12:00:00',
  slot_minutes: 60,
  is_active: true,
}];

function appointment(startIso, durationMinutes, extra = {}) {
  const start = new Date(startIso);
  return {
    id: `a-${startIso}`,
    kind: 'appointment',
    status: 'scheduled',
    professional_id: 'prof-1',
    discipline: 'acupuntura',
    starts_at: start.toISOString(),
    ends_at: new Date(start.getTime() + durationMinutes * 60000).toISOString(),
    ...extra,
  };
}

test('isCountableAppointment exclui cancelado e bloqueio', () => {
  assert.equal(dashboard.isCountableAppointment(appointment('2026-08-12T09:00', 60)), true);
  assert.equal(dashboard.isCountableAppointment(appointment('2026-08-12T09:00', 60, { status: 'cancelled' })), false);
  assert.equal(dashboard.isCountableAppointment({ kind: 'block', status: 'scheduled' }), false);
});

test('isAbsence conta falta/justificada/cancelada, não agendado nem atendido', () => {
  assert.equal(dashboard.isAbsence(appointment('2026-08-12T09:00', 60, { status: 'no_show' })), true);
  assert.equal(dashboard.isAbsence(appointment('2026-08-12T09:00', 60, { status: 'excused' })), true);
  assert.equal(dashboard.isAbsence(appointment('2026-08-12T09:00', 60, { status: 'cancelled' })), true);
  assert.equal(dashboard.isAbsence(appointment('2026-08-12T09:00', 60, { status: 'scheduled' })), false);
  assert.equal(dashboard.isAbsence(appointment('2026-08-12T09:00', 60, { status: 'attended' })), false);
});

test('groupByWeekday devolve os 7 dias na ordem de WEEKDAY_LABELS, mesmo com zero', () => {
  const list = dashboard.groupByWeekday([appointment('2026-08-12T09:00', 60)]); // quarta
  assert.equal(list.length, 7);
  assert.deepEqual(list.map(item => item.count), [0, 0, 0, 1, 0, 0, 0]);
});

test('groupByTimeOfDay usa os cortes de periodOfDay (manhã/tarde/noite)', () => {
  const list = dashboard.groupByTimeOfDay([
    appointment('2026-08-12T09:00', 30), // manhã
    appointment('2026-08-12T14:00', 30), // tarde
    appointment('2026-08-12T19:00', 30), // noite
    appointment('2026-08-12T11:59', 30), // ainda manhã
  ]);
  const byId = Object.fromEntries(list.map(item => [item.id, item.count]));
  assert.deepEqual(byId, { manha: 2, tarde: 1, noite: 1 });
});

test('groupAbsencesByProfessional ranqueia do maior pro menor e ignora quem não faltou', () => {
  // Devolve só {id, count} de propósito — resolver o nome é trabalho da
  // tela (professionalName()/shortName()), não deste módulo puro.
  const list = dashboard.groupAbsencesByProfessional([
    appointment('2026-08-12T09:00', 60, { status: 'no_show' }),
    appointment('2026-08-13T09:00', 60, { status: 'excused' }),
    appointment('2026-08-13T10:00', 60, { professional_id: 'prof-2', status: 'cancelled' }),
    appointment('2026-08-13T11:00', 60, { status: 'attended' }),
  ]);
  assert.deepEqual(list.map(item => [item.id, item.count]), [['prof-1', 2], ['prof-2', 1]]);
});

test('groupAbsencesByDiscipline agrupa por disciplina e usa o rótulo, não o id', () => {
  const list = dashboard.groupAbsencesByDiscipline([
    appointment('2026-08-12T09:00', 60, { status: 'no_show', discipline: 'acupuntura' }),
    appointment('2026-08-13T09:00', 60, { status: 'no_show', discipline: 'fisioterapia' }),
  ]);
  assert.equal(list.length, 2);
  assert.ok(list.every(item => item.label !== item.id));
});

test('groupNewVsReturning só conta first_visit/return, agrupado por mês LOCAL', () => {
  const list = dashboard.groupNewVsReturning([
    appointment('2026-08-05T09:00', 60, { appointment_type: 'first_visit' }),
    appointment('2026-08-20T09:00', 60, { appointment_type: 'return' }),
    appointment('2026-09-01T09:00', 60, { appointment_type: 'return' }),
    appointment('2026-08-06T09:00', 60, { appointment_type: 'evaluation' }),
    appointment('2026-08-07T09:00', 60, { appointment_type: null }),
  ]);
  assert.deepEqual(list, [
    { monthKey: '2026-08', firstVisit: 1, returning: 1 },
    { monthKey: '2026-09', firstVisit: 0, returning: 1 },
  ]);
});

test('groupNewVsReturning não escorrega de mês por causa de fuso (meia-noite local)', () => {
  // 01/09 00:00 local não pode virar 31/08 em UTC-3 se o agrupamento
  // passasse por new Date('YYYY-MM-DD') — aqui é Date real, já no fuso
  // local do processo, então a proteção é o toDayKey usado internamente.
  const list = dashboard.groupNewVsReturning([
    appointment(new Date(2026, 8, 1, 0, 0).toISOString(), 60, { appointment_type: 'first_visit' }),
  ]);
  assert.deepEqual(list, [{ monthKey: '2026-09', firstVisit: 1, returning: 0 }]);
});

test('currentMonthBirthdays recebe "hoje" por parâmetro e bate com o mês dele', () => {
  const patients = [
    { id: 'p1', name: 'Marcos', birth_date: '1990-08-15' },
    { id: 'p2', name: 'Julia', birth_date: '1985-09-01' },
  ];
  const list = dashboard.currentMonthBirthdays(patients, new Date(2026, 7, 1)); // agosto
  assert.deepEqual(list.map(item => item.name), ['Marcos']);
  assert.equal(list[0].age, 36);
  assert.equal(list[0].day, 15);
});

test('computeOccupancy: sem jornada nenhuma, rate é null (não NaN/Infinity)', () => {
  const result = dashboard.computeOccupancy({
    appointments: [],
    schedules: [],
    holidays: [],
    from: '2026-08-12',
    to: '2026-08-12',
  });
  assert.equal(result.availableMinutes, 0);
  assert.equal(result.rate, null);
});

test('computeOccupancy: feriado com is_working_day=false zera a disponibilidade daquele dia', () => {
  // 2026-08-12 e 2026-08-19 são quartas; só a segunda é feriado.
  const result = dashboard.computeOccupancy({
    appointments: [],
    schedules: JORNADA_QUARTA,
    holidays: [{ day: '2026-08-19', is_working_day: false }],
    from: '2026-08-12',
    to: '2026-08-19',
  });
  // Uma quarta de 4h (08h-12h) disponível, a outra zerada pelo feriado.
  assert.equal(result.availableMinutes, 240);
});

test('computeOccupancy: feriado com is_working_day=true NÃO zera (clínica atende no feriado)', () => {
  const result = dashboard.computeOccupancy({
    appointments: [],
    schedules: JORNADA_QUARTA,
    holidays: [{ day: '2026-08-12', is_working_day: true }],
    from: '2026-08-12',
    to: '2026-08-12',
  });
  assert.equal(result.availableMinutes, 240);
});

test('computeOccupancy: ocupado ignora cancelado e bloqueio, rate é a razão certa', () => {
  const result = dashboard.computeOccupancy({
    appointments: [
      appointment('2026-08-12T08:00', 60), // conta: 60min
      appointment('2026-08-12T09:00', 60, { status: 'cancelled' }), // não conta
      { kind: 'block', starts_at: '2026-08-12T10:00:00.000Z', ends_at: '2026-08-12T11:00:00.000Z' }, // não conta
    ],
    schedules: JORNADA_QUARTA,
    holidays: [],
    from: '2026-08-12',
    to: '2026-08-12',
  });
  assert.equal(result.occupiedMinutes, 60);
  assert.equal(result.availableMinutes, 240);
  assert.equal(result.rate, 60 / 240);
});

test('presetToRange("month") vai do dia 1 do mês corrente até hoje, em datas locais', () => {
  const { from, to } = dashboard.presetToRange('month', new Date(2026, 7, 15)); // 15/08
  assert.equal(from, '2026-08-01');
  assert.equal(to, '2026-08-15');
});

test('presetToRange("year") vai de 1º de janeiro até hoje', () => {
  const { from, to } = dashboard.presetToRange('year', new Date(2026, 7, 15));
  assert.equal(from, '2026-01-01');
  assert.equal(to, '2026-08-15');
});
