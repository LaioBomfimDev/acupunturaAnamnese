// ============================================================
// Agenda — o que é "fora do normal"
//
// A clínica é flexível: atende em feriado, em sábado, dentro do almoço,
// fora da jornada. O sistema NÃO impede nada disso. Ele reconhece a
// exceção, nomeia em português, e a tela usa isso para pedir confirmação
// dupla antes de gravar (docs/plano-agenda-gestao-clinica.md §6.1).
//
// Regra que governa o arquivo inteiro: nada aqui devolve "proibido".
// Devolve "isto é atípico, e o motivo é este". Quem barra de verdade é a
// constraint appointments_no_overlap, e só para dois pacientes no mesmo
// horário do mesmo profissional.
//
// Sem React, sem Supabase, sem relógio escondido: tudo entra por
// parâmetro para poder ser testado sem subir nada.
// ============================================================

// Extensão explícita: o teste de regressão carrega este módulo direto no
// Node (sem Vite), e lá import sem extensão não resolve.
import { toDayKey } from './agenda.js';

export const EXCEPTION_KINDS = {
  HOLIDAY: 'holiday',
  DAY_OFF: 'day_off',
  OUTSIDE_HOURS: 'outside_hours',
  BREAK: 'break',
  BLOCK: 'block',
};

const WEEKDAY_NAMES = [
  'domingo', 'segunda-feira', 'terça-feira', 'quarta-feira',
  'quinta-feira', 'sexta-feira', 'sábado',
];

/**
 * 'HH:MM' ou 'HH:MM:SS' -> minutos desde a meia-noite.
 * O Postgres devolve TIME como texto; nunca passe isso por new Date().
 */
export function timeToMinutes(value) {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

/** Minutos desde a meia-noite local de uma Date. */
export function minutesOfDay(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return date.getHours() * 60 + date.getMinutes();
}

export function minutesToLabel(minutes) {
  if (!Number.isFinite(minutes)) return '--:--';
  const hour = String(Math.floor(minutes / 60)).padStart(2, '0');
  const minute = String(Math.round(minutes % 60)).padStart(2, '0');
  return `${hour}:${minute}`;
}

function overlaps(startA, endA, startB, endB) {
  // Encostar não é sobrepor: 12:00–13:00 e 13:00–14:00 convivem.
  return startA < endB && startB < endA;
}

/**
 * Um atendimento que cruza a meia-noite não existe em clínica, mas se
 * alguém digitar 23:00 + 120min o fim vira 01:00 do dia seguinte. Nesse
 * caso o intervalo é tratado como indo até o fim do dia, para a
 * comparação com a jornada não inverter e dar falso "dentro do horário".
 */
function slotMinutes(start, end) {
  const startMinutes = minutesOfDay(start);
  let endMinutes = minutesOfDay(end);
  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes)) return null;
  if (toDayKey(start) !== toDayKey(end)) endMinutes = 24 * 60;
  return { startMinutes, endMinutes };
}

/**
 * Avalia um horário candidato contra jornada, feriados e bloqueios.
 *
 * @param start Date  início do atendimento
 * @param end   Date  término
 * @param schedules   linhas de professional_schedules DO profissional
 *                    escolhido (weekday, starts_at, ends_at, break_*)
 * @param holidays    [{ day: 'YYYY-MM-DD', name, is_working_day }]
 * @param blocks      agendamentos com kind === 'block' do mesmo
 *                    profissional (a tela já filtra por dia)
 *
 * @returns {{ isException: boolean, reason: string, exceptions: Array }}
 *   Cada exceção traz { kind, label, detail } — `label` é o título curto
 *   do aviso e `detail` explica em uma linha.
 */
export function evaluateSlot({
  start,
  end,
  schedules = [],
  holidays = [],
  blocks = [],
} = {}) {
  const empty = { isException: false, reason: '', exceptions: [] };
  if (!(start instanceof Date) || !(end instanceof Date)) return empty;

  const range = slotMinutes(start, end);
  if (!range) return empty;

  const { startMinutes, endMinutes } = range;
  const dayKey = toDayKey(start);
  const weekday = start.getDay();
  const exceptions = [];

  // ---------- feriado ----------
  const holiday = holidays.find(item => item?.day === dayKey);
  if (holiday && holiday.is_working_day !== true) {
    exceptions.push({
      kind: EXCEPTION_KINDS.HOLIDAY,
      label: `Feriado: ${holiday.name || 'dia não útil'}`,
      detail: 'A instituição não atende neste dia por padrão.',
    });
  }

  // ---------- jornada ----------
  // Profissional sem NENHUMA jornada cadastrada não é exceção: é
  // configuração que ainda não foi feita. Avisar aqui transformaria todo
  // agendamento da casa nova em alerta, e o aviso viraria ruído.
  const activeSchedules = schedules.filter(item => item?.is_active !== false);

  if (activeSchedules.length > 0) {
    const ofDay = activeSchedules.filter(item => Number(item?.weekday) === weekday);

    if (ofDay.length === 0) {
      exceptions.push({
        kind: EXCEPTION_KINDS.DAY_OFF,
        label: `Fora dos dias de atendimento (${WEEKDAY_NAMES[weekday]})`,
        detail: 'Este profissional não tem jornada cadastrada neste dia da semana.',
      });
    } else {
      const insideAny = ofDay.some(item => {
        const from = timeToMinutes(item?.starts_at);
        const to = timeToMinutes(item?.ends_at);
        if (from === null || to === null) return false;
        return startMinutes >= from && endMinutes <= to;
      });

      if (!insideAny) {
        const janelas = ofDay
          .map(item => `${minutesToLabel(timeToMinutes(item?.starts_at))}–${minutesToLabel(timeToMinutes(item?.ends_at))}`)
          .join(', ');
        exceptions.push({
          kind: EXCEPTION_KINDS.OUTSIDE_HOURS,
          label: 'Fora do horário de atendimento',
          detail: `A jornada cadastrada para ${WEEKDAY_NAMES[weekday]} é ${janelas}.`,
        });
      }

      const breakHit = ofDay.find(item => {
        const from = timeToMinutes(item?.break_starts_at);
        const to = timeToMinutes(item?.break_ends_at);
        if (from === null || to === null) return false;
        return overlaps(startMinutes, endMinutes, from, to);
      });

      if (breakHit) {
        const from = minutesToLabel(timeToMinutes(breakHit.break_starts_at));
        const to = minutesToLabel(timeToMinutes(breakHit.break_ends_at));
        exceptions.push({
          kind: EXCEPTION_KINDS.BREAK,
          label: 'Dentro do intervalo',
          detail: `O intervalo cadastrado é ${from}–${to}.`,
        });
      }
    }
  }

  // ---------- bloqueios ----------
  const startAt = start.getTime();
  const endAt = end.getTime();

  for (const block of blocks) {
    if (block?.kind !== 'block') continue;
    const blockStart = new Date(block.starts_at).getTime();
    const blockEnd = new Date(block.ends_at).getTime();
    if (!Number.isFinite(blockStart) || !Number.isFinite(blockEnd)) continue;
    if (!overlaps(startAt, endAt, blockStart, blockEnd)) continue;

    exceptions.push({
      kind: EXCEPTION_KINDS.BLOCK,
      label: `Bloqueio: ${block.note?.trim() || 'horário reservado'}`,
      detail: 'Há um bloqueio cadastrado cobrindo este horário.',
    });
  }

  return {
    isException: exceptions.length > 0,
    // Vira a coluna exception_reason. Texto, não código: quem abrir o
    // banco daqui a um ano precisa entender sem consultar tabela.
    reason: exceptions.map(item => item.label).join(' · '),
    exceptions,
  };
}

/**
 * Slots sugeridos do dia a partir da jornada. Alimenta o toque em
 * "horário vago" da agenda mobile — no celular ninguém digita hora se
 * puder tocar.
 *
 * @returns [{ startMinutes, endMinutes, label }]
 */
export function buildDaySlots({ date, schedules = [], slotMinutes: override = null } = {}) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return [];

  const weekday = date.getDay();
  const ofDay = schedules
    .filter(item => item?.is_active !== false && Number(item?.weekday) === weekday)
    .sort((a, b) => (timeToMinutes(a?.starts_at) ?? 0) - (timeToMinutes(b?.starts_at) ?? 0));

  const slots = [];

  for (const schedule of ofDay) {
    const from = timeToMinutes(schedule?.starts_at);
    const to = timeToMinutes(schedule?.ends_at);
    const step = Number(override || schedule?.slot_minutes) || 60;
    if (from === null || to === null || step <= 0) continue;

    const breakFrom = timeToMinutes(schedule?.break_starts_at);
    const breakTo = timeToMinutes(schedule?.break_ends_at);

    for (let cursor = from; cursor + step <= to; cursor += step) {
      const slotEnd = cursor + step;
      // O intervalo some da lista de sugestões, mas continua marcável
      // pela tela de exceção — sumir da sugestão não é proibir.
      if (breakFrom !== null && breakTo !== null && overlaps(cursor, slotEnd, breakFrom, breakTo)) {
        continue;
      }
      slots.push({
        startMinutes: cursor,
        endMinutes: slotEnd,
        label: minutesToLabel(cursor),
      });
    }
  }

  return slots;
}
