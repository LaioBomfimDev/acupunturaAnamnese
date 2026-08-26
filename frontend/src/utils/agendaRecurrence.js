// ============================================================
// Agenda — série de sessões (pacote)
//
// "10 sessões, toda terça e quinta às 14h" é o caso mais comum em
// acupuntura e fisioterapia. Sem isto, a recepção marca dez vezes na
// mão e erra a data em alguma.
//
// Duas decisões que governam o arquivo:
//
// 1. A série é gerada por CONTAGEM DE SESSÕES, não por data final. A
//    clínica vende "10 sessões", não "até 20 de outubro" — pedir a data
//    final obrigaria a pessoa a fazer a conta de cabeça.
//
// 2. Nenhuma data é descartada aqui. Feriado, sábado e horário fora da
//    jornada entram na lista e são MARCADOS; quem decide se ficam é a
//    pessoa, na tela de conferência. Pular sozinho seria o sistema
//    decidindo pela clínica, que é justamente o oposto do combinado
//    (docs/plano-agenda-gestao-clinica.md §6.1).
//
// Sem React, sem Supabase, sem relógio escondido.
// ============================================================

import { toDayKey } from './agenda.js';

// Trava de segurança: um erro de digitação em "sessões" não pode virar
// um laço de anos. Dois anos cobre qualquer pacote real com folga.
const MAX_LOOKAHEAD_DAYS = 730;

export const MAX_OCCURRENCES = 60;

/**
 * Datas de uma série semanal.
 *
 * @param start     Date da primeira sessão (entra na lista se o dia da
 *                  semana dela estiver selecionado)
 * @param weekdays      dias da semana (0=domingo). Vazio = usa o da data
 *                      inicial, que é o caso "toda terça"
 * @param count         número de sessões, incluindo a primeira
 * @param intervalWeeks 1 = semanal (padrão), 2 = quinzenal, etc.
 *
 * @returns Date[] em ordem cronológica
 */
export function buildRecurrenceDates({
  start, weekdays = [], count = 1, intervalWeeks = 1,
} = {}) {
  if (!(start instanceof Date) || Number.isNaN(start.getTime())) return [];

  const total = Math.min(Math.max(Math.trunc(Number(count) || 0), 0), MAX_OCCURRENCES);
  if (total === 0) return [];

  const dias = weekdays.length ? [...new Set(weekdays.map(Number))] : [start.getDay()];
  const step = Math.max(Math.trunc(Number(intervalWeeks) || 1), 1);
  const dates = [];

  // Percorre dia a dia em vez de somar semanas: com dois ou três dias
  // por semana, somar 7 exigiria controlar cada trilha em separado e a
  // ordem sairia embaralhada. O domingo da semana da data inicial é a
  // âncora do quinzenal — fixada aqui, na criação, e nunca recalculada
  // depois. Diferente de recorrência virtual (base editável que
  // "desloca o ciclo" quando alguém muda a data), aqui a série já nasce
  // materializada: não existe base para reeditar, então não existe
  // ciclo para desalinhar.
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const startWeek = new Date(start.getFullYear(), start.getMonth(), start.getDate() - start.getDay());

  for (let dayStep = 0; dayStep < MAX_LOOKAHEAD_DAYS && dates.length < total; dayStep += 1) {
    if (dias.includes(cursor.getDay())) {
      const cursorWeek = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - cursor.getDay());
      const weeksSinceStart = Math.round((cursorWeek - startWeek) / (7 * 86400000));
      if (weeksSinceStart % step === 0) {
        dates.push(new Date(cursor));
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

/**
 * Prévia da série: cada data com o que a torna atípica e se já existe
 * algo ocupando aquele horário.
 *
 * A checagem de conflito aqui é só para avisar antes — a autoridade
 * continua sendo a constraint appointments_no_overlap.
 *
 * @param evaluate  (date) => { isException, reason, exceptions }
 */
export function describeSeries({
  dates = [],
  evaluate = null,
  appointments = [],
  professionalId = null,
  durationMinutes = 60,
  time = '00:00',
} = {}) {
  const [hour, minute] = String(time).split(':').map(Number);

  return dates.map((date, index) => {
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour || 0, minute || 0);
    const end = new Date(start.getTime() + (Number(durationMinutes) || 60) * 60000);

    const evaluation = evaluate
      ? evaluate(start, end)
      : { isException: false, reason: '', exceptions: [] };

    const conflict = appointments.find(item => {
      if (item.kind === 'block') return false;
      if (professionalId && item.professional_id !== professionalId) return false;
      if (['cancelled', 'no_show', 'excused'].includes(item.status)) return false;
      const itemStart = new Date(item.starts_at).getTime();
      const itemEnd = new Date(item.ends_at).getTime();
      return itemStart < end.getTime() && start.getTime() < itemEnd;
    }) || null;

    return {
      index,
      number: index + 1,
      date,
      key: toDayKey(start),
      start,
      end,
      isException: evaluation.isException,
      reason: evaluation.reason,
      exceptions: evaluation.exceptions,
      conflict,
    };
  });
}

/** Resumo curto para o botão e o cabeçalho da conferência. */
export function summarizeSeries(items = []) {
  return {
    total: items.length,
    excecoes: items.filter(item => item.isException).length,
    conflitos: items.filter(item => item.conflict).length,
    primeira: items[0]?.start || null,
    ultima: items.at(-1)?.start || null,
  };
}
