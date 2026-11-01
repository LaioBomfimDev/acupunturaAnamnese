// ============================================================
// SERVICE: consultas que a assistente pede (31/10/2026).
//
// A assistente não lê o banco: quando a pergunta pede horários vagos,
// o Gemini devolve o pedido e é este aparelho, com o login de quem
// perguntou (a mesma permissão da tela), que faz a conta, pela mesma
// regra do "Copiar horários vagos" da Agenda (utils/agendaFreeSlots.js).
// Volta para a IA só o resultado: horários e o nome de quem atende,
// nunca paciente.
// ============================================================

import { listAppointments } from './appointmentService';
import { listClinicMembers, shortName } from './clinicMembersService';
import { listHolidays, listProfessionalSchedules } from './agendaScheduleService';
import { loadAgendaSettings } from './agendaSettingsService';
import { fallbackGridOf } from '../utils/agendaSettings';
import { freeSlotsForAssistant, matchTeamMember } from '../utils/clinicAssistant';

/** Quem atende na instituição (para a IA saber os nomes e para achar a pessoa). */
export async function loadAssistantTeam() {
  const members = await listClinicMembers();
  return members.filter(member => member.has_agenda !== false && member.is_active !== false);
}

function dayStart(dia) {
  const [year, month, day] = dia.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Horários vagos de alguém num dia. Devolve o formato que a Edge
 * Function aceita em `dados` (_shared/assistantConsulta.ts).
 */
export async function runAssistantConsulta(consulta, { profile, team = null, now = new Date() }) {
  const base = { tipo: consulta.tipo, profissional: consulta.profissional, dia: consulta.dia, horarios: [], motivo: null, opcoes: [] };
  try {
    const people = team || await loadAssistantTeam();
    const match = matchTeamMember(consulta.profissional, people, profile?.id);
    if (match.motivo) {
      return { ...base, motivo: match.motivo, opcoes: match.opcoes.map(member => shortName(member.full_name)) };
    }
    const person = match.member;
    const date = dayStart(consulta.dia);
    const end = new Date(date.getTime() + 86_400_000);
    const [appointments, schedules, holidays, settings] = await Promise.all([
      listAppointments({ from: date.toISOString(), to: new Date(end.getTime() - 1).toISOString(), professionalId: person.id }),
      listProfessionalSchedules({ professionalId: person.id }),
      listHolidays({ from: consulta.dia, to: consulta.dia }),
      loadAgendaSettings(profile?.clinic_id),
    ]);
    // Mesma conta da Agenda de uma pessoa: sem jornada no dia, vale a
    // grade padrão da clínica, e `grade` avisa qual foi.
    const result = freeSlotsForAssistant({
      date,
      professionalId: person.id,
      schedules,
      appointments,
      holidays,
      fallback: fallbackGridOf(settings?.settings),
      now,
    });
    return { ...base, profissional: shortName(person.full_name), ...result };
  } catch {
    return { ...base, motivo: 'erro' };
  }
}
