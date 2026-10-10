// ============================================================
// Evoluções > "Ver evoluções" — conferência, não leitura.
//
// Junta os atendimentos concluídos da Agenda com os DADOS de registro
// das evoluções (se existe, quando foi escrita, quantas vezes foi
// corrigida) — nunca o texto. A administração confere se a equipe
// está evoluindo; cada profissional vê o próprio histórico. O conteúdo
// clínico continua na ficha do paciente.
//
// Só duas contas importam (pedido da administradora, 2026-10-01):
// atendimentos concluídos e o que falta evoluir. Nada de "no mesmo
// dia × em outro dia" — a data em que foi escrita aparece na linha.
//
// Cálculo puro (sem React, sem Supabase, sem Date.now() escondido),
// testado em tests/regression/evolutions-review.test.mjs.
// ============================================================

import { isLateEntry } from './completedAppointment';
import { EVOLUTION_DISCIPLINES } from './evolutionQueue';

// Mesmo corte da fila (20260929_evolution_queue_production_start.sql):
// antes de 22/09/2026 a evolução era feita no sistema anterior, então
// atendimento sem evolução daí para trás não é pendência.
export const EVOLUTION_REVIEW_START = new Date('2026-09-22T00:00:00-03:00');

const CONCLUDED = ['attended', 'no_show', 'excused'];
const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(value) {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Dias de calendário entre duas datas (0 = mesmo dia), no fuso local. */
export function calendarDaysBetween(from, to) {
  const start = startOfDay(from);
  const end = startOfDay(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return Math.round((end.getTime() - start.getTime()) / DAY_MS);
}

// Quem vê a equipe inteira — o mesmo par que a RLS de
// patient_evolutions libera (is_clinic_admin / is_super_admin).
const TEAM_REVIEW_ROLES = ['clinic_admin', 'super_admin'];

export function canSeeTeamEvolutions(profile) {
  return TEAM_REVIEW_ROLES.includes(profile?.role);
}

/**
 * Uma linha por atendimento concluído (ou que já tem evolução, mesmo que
 * o status tenha mudado depois), do mais recente para o mais antigo.
 *
 * `onlyProfessionalId` é obrigatório para quem não é administração: a
 * Agenda é da instituição inteira, mas a RLS só devolve as evoluções da
 * própria pessoa — sem o corte, o atendimento de um colega apareceria
 * como "Falta evoluir" mesmo já evoluído.
 */
export function buildEvolutionReview(appointments, evolutions, { now = new Date(), onlyProfessionalId = null } = {}) {
  const byAppointment = new Map(
    (Array.isArray(evolutions) ? evolutions : [])
      .filter(item => item?.appointment_id)
      .map(item => [item.appointment_id, item]),
  );

  const rows = [];
  for (const appointment of Array.isArray(appointments) ? appointments : []) {
    if (appointment?.kind !== 'appointment') continue;
    if (!EVOLUTION_DISCIPLINES.includes(appointment.discipline)) continue;
    if (onlyProfessionalId && appointment.professional_id !== onlyProfessionalId) continue;

    const evolution = byAppointment.get(appointment.id) || null;
    if (!evolution) {
      if (!CONCLUDED.includes(appointment.status)) continue;
      if (new Date(appointment.starts_at).getTime() < EVOLUTION_REVIEW_START.getTime()) continue;
    }

    rows.push({
      id: appointment.id,
      appointment,
      evolution,
      professionalId: appointment.professional_id,
      discipline: appointment.discipline,
      attendanceStatus: evolution?.attendance_status || appointment.status,
      evolved: Boolean(evolution),
      pendingDays: evolution ? null : Math.max(0, calendarDaysBetween(appointment.starts_at, now) ?? 0),
      corrections: evolution ? Math.max(0, (Number(evolution.revision) || 1) - 1) : 0,
      lateEntry: isLateEntry(appointment),
    });
  }

  return rows.sort((a, b) => new Date(b.appointment.starts_at) - new Date(a.appointment.starts_at));
}

export function evolutionReviewStats(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const pending = list.filter(row => !row.evolved);
  return {
    total: list.length,
    evolved: list.length - pending.length,
    pending: pending.length,
    oldestPendingDays: pending.reduce((max, row) => Math.max(max ?? 0, row.pendingDays), null),
  };
}

/** Resumo por profissional: quem tem pendência vem primeiro. */
export function evolutionReviewByProfessional(rows) {
  const groups = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!groups.has(row.professionalId)) groups.set(row.professionalId, []);
    groups.get(row.professionalId).push(row);
  }
  return [...groups.entries()]
    .map(([id, list]) => ({ id, ...evolutionReviewStats(list) }))
    .sort((a, b) => b.pending - a.pending || b.total - a.total);
}

/** Sem acento e sem maiúscula: "joao" acha "João". */
export function normalizeSearch(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

export function filterEvolutionReview(rows, {
  onlyPending = false,
  professionalId = '',
  discipline = '',
  query = '',
  nameOf = () => '',
} = {}) {
  const words = normalizeSearch(query).split(/\s+/).filter(Boolean);
  return (Array.isArray(rows) ? rows : []).filter(row => {
    if (onlyPending && row.evolved) return false;
    if (professionalId && row.professionalId !== professionalId) return false;
    if (discipline && row.discipline !== discipline) return false;
    if (!words.length) return true;
    // Cada palavra em qualquer parte do nome: "ana rib" acha "Ana Ribeiro".
    const name = normalizeSearch(nameOf(row.appointment.patient_id));
    return words.every(word => name.includes(word));
  });
}

/** [[dayKey, linhas do dia], ...] na ordem recebida. */
export function groupEvolutionReviewByDay(rows) {
  const groups = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const day = startOfDay(row.appointment.starts_at);
    const key = `${day.getFullYear()}-${day.getMonth() + 1}-${day.getDate()}`;
    const last = groups[groups.length - 1];
    if (last && last[0] === key) last[1].push(row);
    else groups.push([key, [row]]);
  }
  return groups;
}

export function pendingLabel(days) {
  if (!days || days <= 0) return 'Falta evoluir · atendido hoje';
  if (days === 1) return 'Falta evoluir · há 1 dia';
  return `Falta evoluir · há ${days} dias`;
}

export function correctionsLabel(count) {
  if (!count) return '';
  return count === 1 ? 'corrigida 1 vez' : `corrigida ${count} vezes`;
}

export function pendingDaysLabel(days) {
  if (days === null || days === undefined) return '—';
  if (days <= 0) return 'hoje';
  return days === 1 ? '1 dia' : `${days} dias`;
}

export function atendimentosLabel(count) {
  return count === 1 ? '1 atendimento' : `${count} atendimentos`;
}

/** Não há o que conferir antes de a evolução entrar em uso. */
export function canGoBackEvolutionReview(range) {
  return Boolean(range) && range.start.getTime() > EVOLUTION_REVIEW_START.getTime();
}

export function isBeforeEvolutionReview(range) {
  return Boolean(range) && range.end.getTime() <= EVOLUTION_REVIEW_START.getTime();
}

/**
 * Linha de baixo da aba "Ver evoluções" (abas de pasta, 10/10/2026): o
 * número grande é o total de atendimentos concluídos no mês; aqui vai o
 * mês e quanto falta evoluir — os mesmos dois números da conferência.
 */
export function reviewTabHint(stats, now = new Date()) {
  const mes = new Date(now).toLocaleDateString('pt-BR', { month: 'long' });
  const total = stats?.total || 0;
  const pending = stats?.pending || 0;
  const base = `${total === 1 ? 'concluído' : 'concluídos'} em ${mes}`;
  return pending ? `${base} · ${pending} falta evoluir` : `${base} · tudo evoluído`;
}
