import { listAppointments, listPatientsAwaitingReturn } from './appointmentService';
import { listClinicMembers } from './clinicMembersService';
import { listClinicAccessLogs } from './clinicAccessLogService';
import { listSatisfactionSurveys } from './satisfactionSurveyService';
import { listAssignments } from './patientPortalService';
import { SUMMARY_RETURN_DAYS, buildGestaoSummary, summaryAppointmentRange } from '../utils/gestaoSummary';

/**
 * Resumo da Gestão: busca o que cada quadro precisa, tudo em paralelo,
 * com as mesmas funções que as abas usam. Uma busca que falha não
 * derruba as outras (allSettled): só o quadro dela fica sem número.
 * A Agenda vem numa ida só (mês corrente + últimos 30 dias).
 */
export async function loadGestaoSummary({ now = new Date() } = {}) {
  const range = summaryAppointmentRange(now);
  const settled = await Promise.allSettled([
    listAppointments({ from: range.from.toISOString(), to: new Date(range.to.getTime() - 1).toISOString() }),
    listPatientsAwaitingReturn({ minDays: SUMMARY_RETURN_DAYS }),
    listSatisfactionSurveys({ limit: 500, from: range.month.start.toISOString(), to: range.month.end.toISOString() }),
    listAssignments(),
    listClinicMembers(),
    listClinicAccessLogs({ limit: 100 }),
  ]);
  const [appointments, returns, surveys, assignments, members, accessLogs] = settled
    .map(result => (result.status === 'fulfilled' ? result.value : null));

  return buildGestaoSummary({ appointments, returns, surveys, assignments, members, accessLogs, now });
}
