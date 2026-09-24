// ============================================================
// "Registrar atendimento realizado" — o paciente veio, foi atendido e
// foi embora sem nunca ter sido marcado na Agenda. Como evolução só
// nasce de agendamento (20260924b), sem isto ele ficaria de fora da
// fila de Evoluções. Regras puras, para a tela Evoluções, a Agenda e os
// testes lerem a mesma coisa.
//
// Decisões da administradora (2026-09-24):
// - nasce Atendido e confirmado: o paciente já esteve lá, não há o que
//   confirmar, e é "Atendido" que coloca o atendimento na fila;
// - só para trás, até 30 dias; o futuro continua sendo "Agendar";
// - sem aviso de jornada/feriado e sem link de confirmação, porque já
//   aconteceu. Dois pacientes no mesmo horário do mesmo profissional
//   continua recusado pelo banco (appointments_no_overlap);
// - fica visível como "lançado depois": o banco já guarda created_at,
//   então não precisa de coluna nova.
// ============================================================

import { toDayKey } from './agenda.js';

export const COMPLETED_APPOINTMENT_LABEL = 'Registrar atendimento realizado';

export const COMPLETED_MAX_DAYS_BACK = 30;

export const COMPLETED_FUTURE_ERROR =
  'Esse horário ainda não chegou. Para um atendimento futuro, use "Agendar" na Agenda.';

export const COMPLETED_TOO_OLD_ERROR =
  `Só dá para registrar atendimentos dos últimos ${COMPLETED_MAX_DAYS_BACK} dias.`;

// Quem marca para a equipe inteira também lança para ela; o
// profissional lança só o próprio atendimento. A evolução continua
// sendo escrita só pelo profissional do atendimento (insert_patient_evolution).
const TEAM_ROLES = ['receptionist', 'clinic_admin', 'super_admin'];

export function canChooseProfessional(profile) {
  return TEAM_ROLES.includes(profile?.role);
}

/**
 * Áreas que dá para lançar para este profissional: as oferecidas pela
 * tela, cortadas pelas que ele atende. Sem esse corte a recepção
 * lançaria Psicologia para quem só faz Acupuntura, e ninguém
 * conseguiria evoluir o atendimento. Profissional sem áreas cadastradas
 * (cadastro antigo) não corta nada.
 */
export function disciplinesForProfessional(offered, professional) {
  const list = Array.isArray(offered) ? offered : [];
  const own = Array.isArray(professional?.disciplines) ? professional.disciplines : [];
  if (own.length === 0) return list;
  return list.filter(item => own.includes(item.id));
}

function startOfLocalDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function earliestAllowed(now) {
  const limit = startOfLocalDay(now);
  limit.setDate(limit.getDate() - COMPLETED_MAX_DAYS_BACK);
  return limit;
}

/** Limites do campo de data: { min, max } em 'YYYY-MM-DD' local. */
export function completedDayRange(now = new Date()) {
  return { min: toDayKey(earliestAllowed(now)), max: toDayKey(startOfLocalDay(now)) };
}

/** 'YYYY-MM-DD' + 'HH:MM' → Date local, sem passar pelo parser de ISO. */
export function combineDayAndTime(dayKey, time) {
  const [year, month, day] = String(dayKey || '').split('-').map(Number);
  const [hour, minute] = String(time || '').split(':').map(Number);
  if (![year, month, day, hour, minute].every(Number.isFinite)) return null;
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * O início do atendimento realizado precisa já ter passado e caber na
 * janela de 30 dias (contada por dia, não por hora). Devolve a mensagem
 * de erro, ou null quando está ok.
 */
export function validateCompletedStart(start, now = new Date()) {
  if (!(start instanceof Date) || Number.isNaN(start.getTime())) {
    return 'Informe o dia e o horário do atendimento.';
  }
  if (start.getTime() > now.getTime()) return COMPLETED_FUTURE_ERROR;
  if (start.getTime() < earliestAllowed(now).getTime()) return COMPLETED_TOO_OLD_ERROR;
  return null;
}

/**
 * Foi lançado depois de acontecer? Criado depois do fim do atendimento.
 * Encaixe marcado durante a sessão (criado às 14h10 para as 14h) não
 * conta: foi registrado enquanto acontecia.
 */
export function isLateEntry(appointment) {
  if (!appointment || appointment.kind === 'block') return false;
  const created = new Date(appointment.created_at);
  const ended = new Date(appointment.ends_at);
  if (Number.isNaN(created.getTime()) || Number.isNaN(ended.getTime())) return false;
  return created.getTime() > ended.getTime();
}

export function lateEntryLabel(appointment) {
  if (!isLateEntry(appointment)) return '';
  const created = new Date(appointment.created_at);
  const dia = created.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  const hora = created.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `Lançado depois do atendimento, em ${dia} às ${hora}.`;
}

/**
 * Agendamento recém-criado → item da fila de Evoluções, no mesmo
 * formato da view appointments_awaiting_evolution.
 */
export function toEvolutionQueueItem(appointment, patientName = '') {
  return {
    appointment_id: appointment.id,
    clinic_id: appointment.clinic_id,
    patient_id: appointment.patient_id,
    patient_name: patientName,
    professional_id: appointment.professional_id,
    discipline: appointment.discipline,
    starts_at: appointment.starts_at,
    attendance_status: appointment.status,
  };
}
