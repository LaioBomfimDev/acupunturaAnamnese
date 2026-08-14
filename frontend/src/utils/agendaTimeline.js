// ============================================================
// Agenda — linha do tempo do dia
//
// A visão Dia é uma LISTA DE FAIXAS, não uma grade com eventos
// posicionados por pixel. Motivo: no telefone, tocar num bloco de 14px
// de altura é loteria; numa linha de 44px, não. A grade bonita de
// calendário desktop é o que torna agenda ruim de usar no celular.
//
// Cada faixa sabe o próprio estado (livre, ocupada, intervalo,
// bloqueada, fora da jornada). Nenhum estado significa "proibido" — a
// clínica é flexível e a confirmação dupla é quem cuida do atípico
// (docs/plano-agenda-gestao-clinica.md §6.1).
//
// Sem React, sem Supabase, sem relógio escondido.
// ============================================================

import { toDayKey } from './agenda.js';
import { minutesToLabel, timeToMinutes } from './agendaExceptions.js';

export const ROW_STATES = {
  FREE: 'free',
  BUSY: 'busy',
  BREAK: 'break',
  BLOCKED: 'blocked',
  OUTSIDE: 'outside',
};

// Grade usada enquanto ninguém cadastrou jornada. Sem isto a visão Dia
// de uma instituição nova seria uma tela em branco — pior que um palpite
// razoável, porque não dá nem onde tocar para marcar.
export const FALLBACK_DAY_START = 7 * 60;
export const FALLBACK_DAY_END = 20 * 60;
export const FALLBACK_SLOT_MINUTES = 60;

function minutesOfLocalDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return { date, minutes: date.getHours() * 60 + date.getMinutes() };
}

function overlaps(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

/**
 * Faixas de jornada do dia, já ordenadas. Devolve lista vazia quando o
 * profissional não atende naquele dia da semana — quem chama decide se
 * isso vira grade padrão ou dia fechado.
 */
export function schedulesOfDay(schedules, date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return [];
  const weekday = date.getDay();

  return (schedules || [])
    .filter(item => item?.is_active !== false && Number(item?.weekday) === weekday)
    .sort((a, b) => (timeToMinutes(a?.starts_at) ?? 0) - (timeToMinutes(b?.starts_at) ?? 0));
}

/**
 * Linha do tempo do dia.
 *
 * @param date         Date do dia exibido
 * @param schedules    professional_schedules do profissional escolhido
 * @param appointments agendamentos JÁ filtrados por profissional
 * @param holidays     [{ day, name, is_working_day }]
 *
 * @returns {{
 *   rows: Array<{ key, startMinutes, endMinutes, label, endLabel, state, items, fromSchedule }>,
 *   hasSchedule: boolean,
 *   holiday: object|null,
 * }}
 */
export function buildDayTimeline({
  date,
  schedules = [],
  appointments = [],
  holidays = [],
} = {}) {
  const empty = { rows: [], hasSchedule: false, holiday: null };
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return empty;

  const dayKey = toDayKey(date);
  const ofDay = schedulesOfDay(schedules, date);
  const hasSchedule = ofDay.length > 0;
  const holiday = holidays.find(item => item?.day === dayKey) || null;

  // ---------- 1. esqueleto de faixas ----------
  const rows = [];

  function pushRow(startMinutes, endMinutes, state, fromSchedule) {
    if (endMinutes <= startMinutes) return;
    rows.push({
      key: `${startMinutes}-${endMinutes}`,
      startMinutes,
      endMinutes,
      label: minutesToLabel(startMinutes),
      endLabel: minutesToLabel(endMinutes),
      state,
      items: [],
      fromSchedule,
    });
  }

  if (hasSchedule) {
    for (const schedule of ofDay) {
      const from = timeToMinutes(schedule?.starts_at);
      const to = timeToMinutes(schedule?.ends_at);
      const step = Number(schedule?.slot_minutes) || FALLBACK_SLOT_MINUTES;
      if (from === null || to === null || step <= 0) continue;

      const breakFrom = timeToMinutes(schedule?.break_starts_at);
      const breakTo = timeToMinutes(schedule?.break_ends_at);
      let breakPlaced = false;

      for (let cursor = from; cursor + step <= to; cursor += step) {
        const slotEnd = cursor + step;

        if (breakFrom !== null && breakTo !== null && overlaps(cursor, slotEnd, breakFrom, breakTo)) {
          // O intervalo aparece como UMA faixa, não como três slots
          // meio cobertos — e continua tocável, porque marcar no almoço
          // é decisão da clínica, não erro.
          if (!breakPlaced) {
            pushRow(breakFrom, breakTo, ROW_STATES.BREAK, true);
            breakPlaced = true;
          }
          continue;
        }

        pushRow(cursor, slotEnd, ROW_STATES.FREE, true);
      }
    }
  } else {
    for (let cursor = FALLBACK_DAY_START; cursor < FALLBACK_DAY_END; cursor += FALLBACK_SLOT_MINUTES) {
      pushRow(cursor, cursor + FALLBACK_SLOT_MINUTES, ROW_STATES.FREE, false);
    }
  }

  // ---------- 2. encaixa os agendamentos ----------
  const doDia = (appointments || [])
    .filter(item => toDayKey(new Date(item?.starts_at)) === dayKey)
    .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));

  for (const appointment of doDia) {
    const start = minutesOfLocalDate(appointment?.starts_at);
    const end = minutesOfLocalDate(appointment?.ends_at);
    if (!start || !end) continue;

    // Um atendimento que passa da meia-noite não existe em clínica, mas
    // se existir a faixa termina no fim do dia em vez de inverter.
    const endMinutes = toDayKey(end.date) === dayKey ? end.minutes : 24 * 60;

    const host = rows.find(row => overlaps(start.minutes, endMinutes, row.startMinutes, row.endMinutes));

    if (host) {
      host.items.push(appointment);
      if (appointment.kind === 'block') {
        host.state = ROW_STATES.BLOCKED;
      } else if (host.state !== ROW_STATES.BLOCKED) {
        host.state = ROW_STATES.BUSY;
      }
      continue;
    }

    // Fora de qualquer faixa da jornada: entra com faixa própria em vez
    // de sumir. Um encaixe às 21h precisa aparecer na agenda do dia.
    const own = {
      key: `extra-${appointment.id || `${start.minutes}-${endMinutes}`}`,
      startMinutes: start.minutes,
      endMinutes,
      label: minutesToLabel(start.minutes),
      endLabel: minutesToLabel(endMinutes),
      state: appointment.kind === 'block' ? ROW_STATES.BLOCKED : ROW_STATES.OUTSIDE,
      items: [appointment],
      fromSchedule: false,
    };
    rows.push(own);
  }

  rows.sort((a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes);

  return { rows, hasSchedule, holiday };
}

/**
 * Faixa de sete dias para a navegação do telefone: mostra a semana
 * inteira sem gastar a tela de um calendário mensal.
 *
 * @param date    dia de referência (a semana que o contém)
 * @param today   para marcar o dia de hoje
 * @param counts  Map de 'YYYY-MM-DD' -> quantidade de atendimentos
 */
export function buildWeekStrip(date, { today = null, counts = null } = {}) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return [];

  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate() - date.getDay());
  const todayKey = today ? toDayKey(today) : null;
  const week = [];

  for (let index = 0; index < 7; index += 1) {
    const current = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
    const key = toDayKey(current);
    week.push({
      date: current,
      key,
      day: current.getDate(),
      weekday: current.getDay(),
      isToday: key === todayKey,
      count: counts?.get(key)?.length ?? counts?.get(key) ?? 0,
    });
  }

  return week;
}

/** Soma de minutos ocupados por atendimento (bloqueio não conta). */
export function occupiedMinutes(appointments = []) {
  return appointments.reduce((total, item) => {
    if (item?.kind === 'block') return total;
    const start = new Date(item?.starts_at).getTime();
    const end = new Date(item?.ends_at).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return total;
    return total + Math.round((end - start) / 60000);
  }, 0);
}

/**
 * Minutos de jornada disponíveis no dia, descontando o intervalo. É o
 * denominador da taxa de ocupação do dashboard (Fase 5) — por isso mora
 * aqui, e não numa consulta solta depois.
 */
export function availableMinutes(schedules, date) {
  return schedulesOfDay(schedules, date).reduce((total, schedule) => {
    const from = timeToMinutes(schedule?.starts_at);
    const to = timeToMinutes(schedule?.ends_at);
    if (from === null || to === null || to <= from) return total;

    const breakFrom = timeToMinutes(schedule?.break_starts_at);
    const breakTo = timeToMinutes(schedule?.break_ends_at);
    const pausa = breakFrom !== null && breakTo !== null ? breakTo - breakFrom : 0;

    return total + (to - from) - pausa;
  }, 0);
}
