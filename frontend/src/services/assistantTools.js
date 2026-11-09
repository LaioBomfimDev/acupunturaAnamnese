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
// ACUP-023: só leituras do Resumo do Financeiro (convênio e notas), sem escrita.
import { loadFiscalData, loadTissData } from './financeiroService';
import { listSatisfactionSurveys } from './satisfactionSurveyService';
import { listAssignments } from './patientPortalService';
import { listClinicPatients } from './clinicPatientsService';
import { listAppointments, listAppointmentsAwaitingEvolution, listPatientsAwaitingReturn, listPendingConfirmations, listSeriesSessions } from './appointmentService';
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
  AGENDA_CONSULTAS, AGENDA_ACCESS, AGENDA_SOURCE_LIMIT, PACKAGE_WINDOW_DAYS,
  PATIENT_CONSULTAS, PATIENT_NEXT_MAX, readPatientConsulta, patientConsultaIssue, patientConsultaFailure, matchPatients,
  summarizeAgendaWithPatients, summarizeNextSessions, summarizeFrequentAbsences, summarizeBirthdayPeople,
  readAgendaConsulta, agendaConsultaIssue, agendaConsultaFailure,
  summarizeAgendaPeriod, summarizeAbsencesPeriod, summarizePendingConfirmationsPeriod, summarizePackagesNearEndAgenda,
  summarizeBirthdaysCount, summarizeSurveysPeriod, summarizePortalForms, summarizeConvenioState,
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
  if (AGENDA_CONSULTAS.includes(consulta.tipo)) return runAgendaConsulta(consulta, profile, team, now);
  if (PATIENT_CONSULTAS.includes(consulta.tipo)) return runPatientConsulta(consulta, profile, team, now);
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

// ============================================================
// ACUP-023 (AG-1, AG-5): agenda e operação sem paciente. A porta de perfil
// vem ANTES de qualquer fonte: quem não vê a tela de origem não dispara busca.
// ============================================================
async function agendaAllowed(access, profile) {
  if (!profile?.id || !profile?.clinic_id) return false;
  if (access === 'equipe') return true;
  if (access === 'admin_recepcao') return profile.role === 'clinic_admin' || profile.role === 'receptionist';
  if (profile.role !== 'clinic_admin') return false;
  if (access === 'admin') return true;
  const rpc = access === 'portal' ? 'can_manage_patient_portal' : access === 'financeiro' ? 'can_manage_finance' : null;
  if (!rpc) return false;
  const { data, error } = await supabase.rpc(rpc, { p_clinic: profile.clinic_id });
  return !error && data === true;
}

function periodRange(de, ate) {
  const start = dayStart(de);
  const end = dayStart(ate);
  return { from: start.toISOString(), to: new Date(end.getTime() + 86_400_000 - 1).toISOString(), next: new Date(end.getTime() + 86_400_000).toISOString() };
}

function localKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Lista cheia até o limite do serviço pode estar cortada: vira erro, nunca subcontagem.
function full(list, limit = AGENDA_SOURCE_LIMIT) {
  if (list.length >= limit) throw new Error('fonte no limite');
  return list;
}

async function runAgendaConsulta(raw, profile, team, now) {
  let query = readAgendaConsulta(raw);
  const access = AGENDA_ACCESS[query.tipo];
  try {
    if (!access || !(await agendaAllowed(access, profile))) return agendaConsultaFailure(query, 'sem_permissao');
    if (query.tipo === 'confirmacoes_pendentes' && !query.de && !query.ate) {
      const tomorrow = localKey(new Date(now.getTime() + 86_400_000));
      query = { ...query, de: tomorrow, ate: tomorrow };
    }
    const issue = agendaConsultaIssue(query);
    if (issue) return agendaConsultaFailure(query, issue);

    const byPerson = ['agenda', 'faltas', 'confirmacoes_pendentes', 'pacotes_fim'].includes(query.tipo);
    let person = null;
    let nameOf = () => '';
    if (byPerson) {
      const people = team || await loadAssistantTeam();
      const match = resolvePerson(query.profissional, people, profile.id);
      if (match.motivo) return agendaConsultaFailure(query, match.motivo);
      person = match.member;
      if (person) query = { ...query, profissional: shortName(person.full_name) };
      nameOf = nameOfFor(await listClinicMembers().catch(() => people));
    }

    if (query.tipo === 'agenda' || query.tipo === 'faltas') {
      const { from, to } = periodRange(query.de, query.ate);
      const appointments = full(await listAppointments({ from, to, professionalId: person?.id || null }));
      return query.tipo === 'agenda'
        ? summarizeAgendaPeriod({ consulta: query, appointments, nameOf })
        : summarizeAbsencesPeriod({ consulta: query, appointments, nameOf });
    }
    if (query.tipo === 'confirmacoes_pendentes') {
      const { from, to } = periodRange(query.de, query.ate);
      // A fila também corta em 2000 (QA, 09/11/2026): cheia vira erro, como as outras fontes.
      const pending = full(await listPendingConfirmations({ from, to, professionalId: person?.id || null }));
      return summarizePendingConfirmationsPeriod({ consulta: query, pending, nameOf });
    }
    if (query.tipo === 'pacotes_fim') {
      const from = new Date(now.getTime() - PACKAGE_WINDOW_DAYS * 86_400_000).toISOString();
      const to = new Date(now.getTime() + PACKAGE_WINDOW_DAYS * 86_400_000).toISOString();
      const appointments = full(await listAppointments({ from, to }));
      return summarizePackagesNearEndAgenda({ consulta: query, appointments, nameOf, professionalId: person?.id || null, now });
    }
    if (query.tipo === 'aniversarios') {
      // listClinicPatients corta em 2000 (QA, 09/11/2026): cheia vira erro, nunca subcontagem.
      return summarizeBirthdaysCount({ consulta: query, patients: full(await listClinicPatients()), today: now });
    }
    if (query.tipo === 'pesquisas') {
      const { from, next } = periodRange(query.de, query.ate);
      const surveys = full(await listSatisfactionSurveys({ limit: 1000, from, to: next }), 1000);
      return summarizeSurveysPeriod({ consulta: query, surveys, now });
    }
    if (query.tipo === 'formularios_pendentes') {
      return summarizePortalForms({ consulta: query, assignments: full(await listAssignments({ limit: 500 }), 500), now });
    }
    if (query.tipo === 'convenio') {
      const [tiss, fiscal] = await Promise.all([loadTissData(), loadFiscalData()]);
      return summarizeConvenioState({ consulta: query, tiss, fiscal, today: todayInClinic(now) });
    }
    return agendaConsultaFailure(query, 'erro');
  } catch {
    return agendaConsultaFailure(query, 'erro');
  }
}

// ============================================================
// ACUP-025 (AG-2, AG-8): agenda COM paciente (primeiro nome + idade). Mesma
// porta de perfil, antes de qualquer fonte. Os nomes vêm de listClinicPatients
// com o login de quem perguntou (só o que ele já vê); "eu" vira a pessoa aqui,
// pelo login, nunca pelo nome que vem no pedido.
// ============================================================
async function runPatientConsulta(raw, profile, team, now) {
  const parsed = readPatientConsulta(raw);
  const access = AGENDA_ACCESS[parsed.pedido];
  try {
    if (!access || !(await agendaAllowed(access, profile))) return patientConsultaFailure(raw, 'sem_permissao');
    const issue = patientConsultaIssue(raw);
    if (issue) return patientConsultaFailure(raw, issue);
    const today = todayInClinic(now);
    let query = { tipo: parsed.tipo, de: parsed.de, ate: parsed.ate, profissional: parsed.profissional, paciente: parsed.paciente, idade: parsed.idade, minimo: parsed.minimo };
    let person = null;
    let nameOf = () => '';
    if (parsed.tipo !== 'aniversariantes') {
      const people = team || await loadAssistantTeam();
      const match = resolvePerson(parsed.profissional, people, profile.id);
      if (match.motivo) return patientConsultaFailure(query, match.motivo);
      person = match.member;
      if (person) query = { ...query, profissional: shortName(person.full_name) };
      nameOf = nameOfFor(await listClinicMembers().catch(() => people));
    }
    const patients = await listClinicPatients();
    const matched = parsed.paciente ? matchPatients({ patients, paciente: parsed.paciente, idade: parsed.idade, today }) : null;
    if (matched && !matched.length) return patientConsultaFailure(query, 'nao_encontrado');

    if (parsed.tipo === 'agenda_pacientes' || parsed.tipo === 'faltosos') {
      const { from, to } = periodRange(parsed.de, parsed.ate);
      const appointments = full(await listAppointments({ from, to, professionalId: person?.id || null }));
      const ids = matched ? new Set(matched.map(row => row.id)) : null;
      return parsed.tipo === 'agenda_pacientes'
        ? summarizeAgendaWithPatients({ consulta: query, appointments, patients, nameOf, today, patientIds: ids })
        : summarizeFrequentAbsences({ consulta: query, appointments: ids ? appointments.filter(item => ids.has(item.patient_id)) : appointments, patients, nameOf, today });
    }
    if (parsed.tipo === 'proxima_sessao') {
      // Mais de PATIENT_NEXT_MAX pacientes com o mesmo nome: pergunta de volta, nunca escolhe calado.
      if (matched.length > PATIENT_NEXT_MAX) return patientConsultaFailure(query, 'ambiguo');
      const from = now.toISOString();
      const to = new Date(now.getTime() + PACKAGE_WINDOW_DAYS * 86_400_000).toISOString();
      const nexts = [];
      for (const patient of matched) {
        const upcoming = (await listAppointments({ from, to, patientId: patient.id }))
          .filter(item => item.kind !== 'block' && (item.status === 'scheduled' || item.status === 'ready') && (!person || item.professional_id === person.id))
          .sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)));
        const next = upcoming[0];
        if (!next) continue;
        const series = next.recurrence_group_id ? await listSeriesSessions(next.recurrence_group_id) : null;
        nexts.push({ appointment: next, series });
      }
      return summarizeNextSessions({ consulta: query, nexts, patients, nameOf, today });
    }
    if (parsed.tipo === 'aniversariantes') {
      return summarizeBirthdayPeople({ consulta: query, patients, today });
    }
    return patientConsultaFailure(query, 'erro');
  } catch {
    return patientConsultaFailure(raw, 'erro');
  }
}
