// ============================================================
// SERVICE: consultas que a assistente pede (31/10/2026; contagens da
// clínica em 01/11/2026).
//
// A assistente não lê o banco: quando a pergunta pede um dado, o Gemini
// devolve o pedido e é este aparelho, com o login de quem perguntou (a
// mesma permissão da tela), que faz a conta pelas mesmas funções das
// telas. Volta para a IA só o resultado: horários, números e nomes da
// equipe. Exceção ACUP-016: financeiro só para administração, campos T2 e FIN-1–4.
// ============================================================

import { loadReceivablesData } from './financeiroService';
import { listClinicPatients } from './clinicPatientsService';
import { listAppointments, listAppointmentsAwaitingEvolution, listPatientsAwaitingReturn } from './appointmentService';
import { listClinicMembers, shortName } from './clinicMembersService';
import { listHolidays, listProfessionalSchedules } from './agendaScheduleService';
import { loadAgendaSettings } from './agendaSettingsService';
import { supabase } from '../lib/supabase';
import { CLINICAL_INSTRUMENTS } from '../data/clinicalInstruments';
import { fallbackGridOf } from '../utils/agendaSettings';
import { onlyEvolutionDisciplines } from '../utils/evolutionQueue';
import { todayInClinic } from '../utils/finance';
import {
  freeSlotsForAssistant,
  readFinanceConsulta, financeConsultaIssue, financeConsultaFailure, summarizeFinance,
  matchTeamMember,
  summarizeDayAppointments,
  summarizePendingEvolutions,
  summarizeReturns,
  summarizeScaleApplications,
} from '../utils/clinicAssistant';

const RETURN_DAYS_DEFAULT = 30;

/** Quem atende na instituição (para a IA saber os nomes e para achar a pessoa). */
export async function loadAssistantTeam() {
  const members = await listClinicMembers();
  return members.filter(member => member.has_agenda !== false && member.is_active !== false);
}

function dayStart(dia) {
  const [year, month, day] = dia.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function dayRange(dia) {
  const date = dayStart(dia);
  const end = new Date(date.getTime() + 86_400_000);
  return { date, from: date.toISOString(), to: new Date(end.getTime() - 1).toISOString() };
}

function nameOfFor(people) {
  const names = new Map(people.map(member => [member.id, shortName(member.full_name)]));
  return id => names.get(id) || 'Outra pessoa da equipe';
}

/** "equipe" = todos; "eu" ou um nome = uma pessoa (ou pergunta de volta). */
function resolvePerson(query, people, selfId) {
  if (!query || query === 'equipe') return { member: null, motivo: null, opcoes: [] };
  return matchTeamMember(query, people, selfId);
}

async function freeSlots(consulta, person, profile, now) {
  const { date, from, to } = dayRange(consulta.dia);
  const [appointments, schedules, holidays, settings] = await Promise.all([
    listAppointments({ from, to, professionalId: person.id }),
    listProfessionalSchedules({ professionalId: person.id }),
    listHolidays({ from: consulta.dia, to: consulta.dia }),
    loadAgendaSettings(profile?.clinic_id),
  ]);
  // Mesma conta da Agenda de uma pessoa: sem jornada no dia, vale a
  // grade padrão da clínica, e `grade` avisa qual foi.
  return freeSlotsForAssistant({
    date,
    professionalId: person.id,
    schedules,
    appointments,
    holidays,
    fallback: fallbackGridOf(settings?.settings),
    now,
  });
}

async function scaleApplications(dia) {
  const [year, month] = dia.split('-').map(Number);
  const first = `${year}-${String(month).padStart(2, '0')}-01`;
  const last = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
  const { data, error } = await supabase.rpc('instrument_applications_summary', { p_from: first, p_to: end });
  if (error) throw new Error(error.message);
  const labels = new Map(CLINICAL_INSTRUMENTS.map(item => [item.id, item.shortName]));
  return { periodo: `${String(month).padStart(2, '0')}/${year}`, ...summarizeScaleApplications({ rows: data || [], labelOf: id => labels.get(id) || id }) };
}

/**
 * Faz a consulta pedida e devolve o formato que a Edge Function aceita
 * em `dados` (_shared/assistantConsulta.ts).
 */
export async function runAssistantConsulta(consulta, { profile, team = null, now = new Date() }) {
  if (consulta.tipo === 'financeiro') return runFinanceConsulta(consulta, profile, now);
  const dia = consulta.dia || todayInClinic(now);
  const base = {
    tipo: consulta.tipo, profissional: consulta.profissional, dia, horarios: [], motivo: null, opcoes: [], linhas: [], total: null,
  };
  try {
    const people = team || await loadAssistantTeam();
    const match = resolvePerson(consulta.profissional, people, profile?.id);
    if (match.motivo) {
      return { ...base, motivo: match.motivo, opcoes: match.opcoes.map(member => shortName(member.full_name)) };
    }
    const person = match.member;
    const named = person ? { ...base, profissional: shortName(person.full_name) } : { ...base, profissional: 'equipe' };
    const nameOf = nameOfFor(people);

    if (consulta.tipo === 'horarios_vagos') {
      return { ...named, ...(await freeSlots({ ...consulta, dia }, person, profile, now)) };
    }
    if (consulta.tipo === 'atendimentos_dia') {
      const { from, to } = dayRange(dia);
      const appointments = await listAppointments({ from, to, professionalId: person?.id || null });
      return { ...named, ...summarizeDayAppointments({ appointments, nameOf, professionalId: person?.id || null }) };
    }
    if (consulta.tipo === 'evolucoes_pendentes') {
      const pending = onlyEvolutionDisciplines(await listAppointmentsAwaitingEvolution())
        .filter(item => !person || item.professional_id === person.id);
      return { ...named, ...summarizePendingEvolutions({ pending, nameOf }) };
    }
    if (consulta.tipo === 'escalas_aplicadas') {
      return { ...named, ...(await scaleApplications(dia)) };
    }
    if (consulta.tipo === 'retornos_pendentes') {
      const minDays = consulta.dias || RETURN_DAYS_DEFAULT;
      const returns = (await listPatientsAwaitingReturn({ minDays }))
        .filter(item => !person || item.professional_id === person.id);
      return { ...named, periodo: `${minDays} dias ou mais`, ...summarizeReturns({ returns, nameOf }) };
    }
    return { ...base, motivo: 'erro' };
  } catch {
    return { ...base, motivo: 'erro' };
  }
}

// T1: nenhuma fonte de nomes ou dinheiro é chamada antes da permissão do login.
async function runFinanceConsulta(raw, profile, now) {
  const query = readFinanceConsulta(raw);
  if (!profile?.id || !profile?.clinic_id || profile.role !== 'clinic_admin') return financeConsultaFailure(query, 'sem_permissao');
  try {
    const { data: allowed, error } = await supabase.rpc('can_manage_finance', { p_clinic: profile.clinic_id });
    if (error || allowed !== true) return financeConsultaFailure(query, 'sem_permissao');
    const issue = financeConsultaIssue(query);
    if (issue) return financeConsultaFailure(query, issue);
    const [money, patients, members] = await Promise.all([loadReceivablesData(), listClinicPatients(), listClinicMembers()]);
    if (money.tissReady === false) return financeConsultaFailure(query, 'erro');
    return summarizeFinance({ consulta: query, money, patients, members, shortName, today: todayInClinic(now), selfId: profile.id });
  } catch {
    return financeConsultaFailure(query, 'erro');
  }
}
