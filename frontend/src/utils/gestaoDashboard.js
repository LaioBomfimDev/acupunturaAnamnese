// ============================================================
// Gestão — cálculo puro do painel de Indicadores (Fase 5 do ERP de
// agenda, docs/plano-agenda-gestao-clinica.md)
//
// Mesma regra do resto do módulo agenda: sem React, sem Supabase, sem
// relógio escondido — tudo recebe o que precisa por parâmetro, para dar
// pra testar sem subir servidor nem mockar nada.
// ============================================================

import { WEEKDAY_LABELS, birthdaysByDay, parseDateOnly, periodOfDay, toDayKey } from './agenda.js';
import { availableMinutes, occupiedMinutes } from './agendaTimeline.js';
import { getDiscipline } from '../data/disciplines.js';

// Um atendimento "conta" (ocupa horário) se não foi cancelado — cancelar
// libera o horário e pode ter sido reocupado por outro registro no
// mesmo slot; somar os dois contaria a mesma hora duas vezes. Bloqueio
// nunca conta: é reserva da agenda, não atendimento.
export function isCountableAppointment(item) {
  return item?.kind === 'appointment' && item?.status !== 'cancelled';
}

// Falta + cancelamento somados numa métrica só (mesma frase do roadmap):
// a pessoa não foi atendida no horário reservado, o motivo de sobra é
// detalhe.
const ABSENCE_STATUSES = ['no_show', 'excused', 'cancelled'];

export function isAbsence(item) {
  return item?.kind === 'appointment' && ABSENCE_STATUSES.includes(item?.status);
}

export const TIME_OF_DAY_LABELS = { manha: 'Manhã', tarde: 'Tarde', noite: 'Noite' };
const TIME_OF_DAY_ORDER = ['manha', 'tarde', 'noite'];

function sortedEntries(map, order) {
  return order.map(id => ({ id, count: map.get(id) || 0 }));
}

function sortedByCountDesc(map, labelOf) {
  return [...map.entries()]
    .map(([id, count]) => ({ id, label: labelOf(id), count }))
    .sort((a, b) => b.count - a.count);
}

/** Atendimentos por dia da semana (Dom-Sáb, na ordem de WEEKDAY_LABELS). */
export function groupByWeekday(appointments) {
  const counts = new Map();
  for (const item of appointments || []) {
    const date = new Date(item?.starts_at);
    if (Number.isNaN(date.getTime())) continue;
    const weekday = date.getDay();
    counts.set(weekday, (counts.get(weekday) || 0) + 1);
  }
  return WEEKDAY_LABELS.map((label, weekday) => ({
    id: weekday,
    label,
    count: counts.get(weekday) || 0,
  }));
}

/** Atendimentos por período do dia (Manhã/Tarde/Noite), via periodOfDay. */
export function groupByTimeOfDay(appointments) {
  const counts = new Map();
  for (const item of appointments || []) {
    const bucket = periodOfDay(item?.starts_at);
    if (!bucket) continue;
    counts.set(bucket, (counts.get(bucket) || 0) + 1);
  }
  return sortedEntries(counts, TIME_OF_DAY_ORDER).map(entry => ({
    ...entry,
    label: TIME_OF_DAY_LABELS[entry.id],
  }));
}

/**
 * Faltas/cancelamentos por profissional, ranqueado do maior pro menor.
 * Devolve só `{id, count}` — resolver o nome de exibição é trabalho de
 * quem chama (a tela já tem `professionalName()`/`shortName()` prontos
 * e importar serviço aqui quebraria a pureza deste módulo: services
 * importam o cliente Supabase, que lê `import.meta.env`, inexistente
 * fora do Vite — é por isso que estes testes rodam sem servidor).
 */
export function groupAbsencesByProfessional(appointments) {
  const counts = new Map();
  for (const item of appointments || []) {
    if (!isAbsence(item)) continue;
    const id = item.professional_id;
    if (!id) continue;
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count);
}

/** Faltas/cancelamentos por disciplina, ranqueado do maior pro menor. */
export function groupAbsencesByDiscipline(appointments) {
  const counts = new Map();
  for (const item of appointments || []) {
    if (!isAbsence(item)) continue;
    const id = item.discipline;
    if (!id) continue;
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  return sortedByCountDesc(counts, id => getDiscipline(id)?.label || id);
}

/**
 * Pacientes novos vs. retorno por mês local. Só `first_visit`/`return`
 * contam — avaliação e o que a recepção não classificou ficam de fora
 * (ver plano, "Decisões de produto"). Chave de mês por toDayKey (nunca
 * `new Date('YYYY-MM-DD')`, mesmo cuidado do resto do módulo agenda).
 */
export function groupNewVsReturning(appointments) {
  const buckets = new Map(); // 'YYYY-MM' -> { firstVisit, returning }

  for (const item of appointments || []) {
    if (item?.appointment_type !== 'first_visit' && item?.appointment_type !== 'return') continue;
    const date = new Date(item?.starts_at);
    const dayKey = toDayKey(date);
    if (!dayKey) continue;
    const monthKey = dayKey.slice(0, 7);
    const bucket = buckets.get(monthKey) || { firstVisit: 0, returning: 0 };
    if (item.appointment_type === 'first_visit') bucket.firstVisit += 1;
    else bucket.returning += 1;
    buckets.set(monthKey, bucket);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monthKey, bucket]) => ({ monthKey, ...bucket }));
}

/** Aniversariantes do mês corrente, lista achatada e ordenada por dia. */
export function currentMonthBirthdays(patients, today = new Date()) {
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const byDay = birthdaysByDay(patients, year, month);
  const result = [];
  for (const [dayKey, list] of byDay.entries()) {
    const day = Number(dayKey.slice(8, 10));
    for (const patient of list) result.push({ ...patient, day });
  }
  return result.sort((a, b) => a.day - b.day);
}

/**
 * Taxa de ocupação no período: minutos ocupados ÷ minutos disponíveis
 * da jornada, dia a dia. Feriado com is_working_day === false zera a
 * disponibilidade daquele dia — availableMinutes() sozinho não olha
 * feriado, é o único pedaço de conta que é código novo aqui, o resto é
 * feriado (agendaTimeline.js) reaproveitado como está.
 */
export function computeOccupancy({ appointments, schedules, holidays, from, to }) {
  const holidayByDay = new Map((holidays || []).map(item => [item.day, item]));
  const fromParts = parseDateOnly(from);
  const toParts = parseDateOnly(to);

  let available = 0;
  if (fromParts && toParts) {
    const cursor = new Date(fromParts.year, fromParts.month - 1, fromParts.day);
    const end = new Date(toParts.year, toParts.month - 1, toParts.day);
    while (cursor <= end) {
      const dayKey = toDayKey(cursor);
      const holiday = holidayByDay.get(dayKey);
      if (!holiday || holiday.is_working_day) {
        available += availableMinutes(schedules, cursor);
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  const occupied = occupiedMinutes((appointments || []).filter(isCountableAppointment));
  const rate = available > 0 ? occupied / available : null;

  return { occupiedMinutes: occupied, availableMinutes: available, rate };
}

/** Presets do filtro de período do painel de Indicadores. */
export const DASHBOARD_PERIOD_PRESETS = [
  { id: 'month', label: 'Este mês' },
  { id: 'last30', label: 'Últimos 30 dias' },
  { id: 'last90', label: 'Últimos 90 dias' },
  { id: 'last6m', label: 'Últimos 6 meses' },
  { id: 'year', label: 'Este ano' },
];

export function presetToRange(presetId, today = new Date()) {
  const to = toDayKey(today);
  let from;

  switch (presetId) {
    case 'last30': {
      const start = new Date(today);
      start.setDate(start.getDate() - 30);
      from = toDayKey(start);
      break;
    }
    case 'last90': {
      const start = new Date(today);
      start.setDate(start.getDate() - 90);
      from = toDayKey(start);
      break;
    }
    case 'last6m': {
      const start = new Date(today.getFullYear(), today.getMonth() - 6, today.getDate());
      from = toDayKey(start);
      break;
    }
    case 'year':
      from = `${today.getFullYear()}-01-01`;
      break;
    case 'month':
    default:
      from = toDayKey(new Date(today.getFullYear(), today.getMonth(), 1));
      break;
  }

  return { from, to };
}
