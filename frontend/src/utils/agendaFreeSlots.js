// ============================================================
// Agenda — horários vagos do dia, para colar no WhatsApp
// (Ferramentas → "Copiar horários vagos", 06/10/2026).
//
// Vago = faixa "Livre" da jornada (a mesma grade da visão Dia) que
// nenhum atendimento ativo nem bloqueio toca. Diferenças de propósito
// em relação ao que a tela pinta:
// - olha TODOS os atendimentos do profissional, não os da tela: filtro
//   de disciplina ou "esconder cancelados" não pode fazer horário
//   ocupado virar vago na mensagem do paciente;
// - atendimento que passa de uma faixa ocupa todas as que toca;
// - cancelado, não compareceu e cancelado pelo paciente liberam o
//   horário (FREEING_STATUSES); bloqueio (reunião etc.) ocupa;
// - hoje, só o que ainda não começou; dia que passou não tem vago;
//   feriado sem atendimento também não.
// Na visão de recepção (todos os profissionais) sai um bloco por
// profissional, só de quem tem jornada no dia: a grade padrão de quem
// nunca cadastrou jornada ofereceria o dia inteiro, sem ser verdade.
//
// Sem React, sem Supabase, sem relógio escondido: `now` vem de fora.
// ============================================================

import { FREEING_STATUSES, toDayKey } from './agenda.js';
import { ROW_STATES, buildDayTimeline, schedulesOfDay } from './agendaTimeline.js';

function minutesOf(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return { dayKey: toDayKey(date), minutes: date.getHours() * 60 + date.getMinutes() };
}

/** Atendimento ou bloqueio que tira o horário de quem atende. */
function takesTheSlot(item) {
  return item?.kind === 'block' || !FREEING_STATUSES.includes(item?.status);
}

/**
 * Horários vagos de UM profissional num dia.
 *
 * @param appointments atendimentos SEM filtro de tela; só os do
 *                     profissional entram na conta (professionalId)
 * @returns {{ slots: Array<{ startMinutes, label }>, closedReason: null|'past'|'holiday' }}
 */
export function freeSlotsOfDay({
  date,
  professionalId,
  schedules = [],
  appointments = [],
  holidays = [],
  fallback = null,
  now = null,
} = {}) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return { slots: [], closedReason: null };

  const dayKey = toDayKey(date);
  let notBefore = -1;
  if (now instanceof Date && !Number.isNaN(now.getTime())) {
    const todayKey = toDayKey(now);
    if (dayKey < todayKey) return { slots: [], closedReason: 'past' };
    if (dayKey === todayKey) notBefore = now.getHours() * 60 + now.getMinutes();
  }

  const { rows, holiday } = buildDayTimeline({ date, schedules, appointments: [], holidays, fallback });
  if (holiday && holiday.is_working_day !== true) return { slots: [], closedReason: 'holiday' };

  const taken = [];
  for (const item of appointments || []) {
    if (item?.professional_id !== professionalId || !takesTheSlot(item)) continue;
    const start = minutesOf(item.starts_at);
    const end = minutesOf(item.ends_at);
    if (!start || !end || start.dayKey !== dayKey) continue;
    taken.push([start.minutes, end.dayKey === dayKey ? end.minutes : 24 * 60]);
  }

  const slots = rows
    .filter(row => row.state === ROW_STATES.FREE && row.startMinutes > notBefore)
    // Encostar não é ocupar: 09:00-10:00 não tira a faixa das 10:00.
    .filter(row => !taken.some(([from, to]) => from < row.endMinutes && row.startMinutes < to))
    .map(row => ({ startMinutes: row.startMinutes, label: row.label }));

  return { slots, closedReason: null };
}

/**
 * Horários vagos do dia na agenda exibida.
 *
 * @param professionals [{ id, name }] — um só (agenda de alguém) ou a
 *                      equipe que atende (visão de recepção)
 * @param allProfessionals true na visão de recepção: um bloco por
 *                      profissional, só de quem tem jornada no dia
 * @returns {{ groups: Array<{ id, name, slots }>, total, text, closedReason }}
 *   closedReason: 'past' | 'holiday' | 'no-schedule' (recepção, ninguém
 *   com jornada no dia) | null
 */
export function buildFreeSlotsCopy({
  date,
  professionals = [],
  allProfessionals = false,
  schedules = [],
  appointments = [],
  holidays = [],
  fallback = null,
  now = null,
} = {}) {
  const empty = { groups: [], total: 0, text: '', closedReason: null };
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return empty;

  const scheduleOf = id => schedules.filter(item => item?.professional_id === id);
  const people = allProfessionals
    ? professionals.filter(person => schedulesOfDay(scheduleOf(person.id), date).length > 0)
    : professionals.slice(0, 1);

  const groups = [];
  for (const person of people) {
    const { slots, closedReason } = freeSlotsOfDay({
      date,
      professionalId: person.id,
      schedules: scheduleOf(person.id),
      appointments,
      holidays,
      fallback,
      now,
    });
    if (closedReason) return { ...empty, closedReason };
    groups.push({ id: person.id, name: allProfessionals ? person.name : null, slots });
  }

  if (allProfessionals && people.length === 0) {
    // Dia que passou ou feriado vale mais que "ninguém tem jornada".
    const { closedReason } = freeSlotsOfDay({ date, holidays, fallback, now });
    return { ...empty, closedReason: closedReason || 'no-schedule' };
  }

  const filled = groups.filter(group => group.slots.length > 0);
  const total = filled.reduce((sum, group) => sum + group.slots.length, 0);
  const text = filled
    .map(group => [group.name, ...group.slots.map(slot => slot.label)].filter(Boolean).join('\n'))
    .join('\n\n');

  return { groups, total, text, closedReason: null };
}

function capitalize(text) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}

/** "quinta-feira, 08/10" */
export function freeSlotsDayLabel(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });
}

/**
 * Recado que aparece na Agenda depois do toque. `copied` = a área de
 * transferência aceitou; sem ela, o recado traz os horários para a
 * pessoa copiar à mão.
 */
export function freeSlotsNotice({ result, date, now = null, copied = true }) {
  const day = freeSlotsDayLabel(date);
  const isToday = now instanceof Date && date instanceof Date && toDayKey(date) === toDayKey(now);

  if (result?.closedReason === 'past') return `${capitalize(day)} já passou: não há horário vago para oferecer.`;
  if (result?.closedReason === 'holiday') return `Feriado sem atendimento em ${day}: nenhum horário vago.`;
  if (result?.closedReason === 'no-schedule') {
    return `Ninguém da equipe tem jornada em ${day}. Escolha um profissional ou cadastre os Horários de atendimento.`;
  }

  const total = result?.total || 0;
  if (total === 0) return isToday ? 'Nenhum horário vago no resto de hoje.' : `Nenhum horário vago em ${day}.`;

  const amount = total === 1 ? '1 horário vago' : `${total} horários vagos`;
  const people = result.groups.filter(group => group.name && group.slots.length > 0).length;
  const who = people > 1 ? ` de ${people} profissionais` : '';

  if (!copied) {
    const inline = result.groups
      .filter(group => group.slots.length > 0)
      .map(group => `${group.name ? `${group.name}: ` : ''}${group.slots.map(slot => slot.label).join(', ')}`)
      .join(' · ');
    return `Não deu para copiar sozinho. ${capitalize(amount)}${who} em ${day}: ${inline}`;
  }
  return `${total === 1 ? '1 horário vago copiado' : `${total} horários vagos copiados`}${who} (${day}). É só colar no WhatsApp.`;
}
