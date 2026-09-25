// ============================================================
// SERVICE: Painel de Indicadores da Gestão (Fase 5 do ERP de agenda)
//
// Só busca e monta o objeto final — a conta de verdade mora em
// utils/gestaoDashboard.js, pura e testável sem Supabase. Reaproveita
// listAppointments já existente: nenhuma consulta nova ao banco,
// nenhuma migration.
// ============================================================

import { listAppointments } from './appointmentService';
import {
  currentMonthBirthdays,
  groupAbsencesByDiscipline,
  groupAbsencesByProfessional,
  groupByTimeOfDay,
  groupByWeekday,
  groupNewVsReturning,
  isAbsence,
  isCountableAppointment,
} from '../utils/gestaoDashboard';

/**
 * Métricas do painel de Indicadores para o intervalo `from`/`to`
 * ('YYYY-MM-DD'). `patients` chega já resolvido por quem chama (a tela
 * decide se busca ou reaproveita cache) — este service só recebe o
 * array pronto, nunca decide isso sozinho. `byProfessional` sai como
 * `{id, count}`: resolver o nome de exibição é trabalho da tela, que já
 * tem `professionalName()`/`shortName()` — mantém a agregação em
 * utils/gestaoDashboard.js livre de import de service (ver comentário
 * lá sobre `import.meta.env` fora do Vite).
 *
 * `discipline` filtra DEPOIS da busca (não é `.eq()` no banco): o
 * período já traz tudo pro profissional escolhido, e recortar por
 * disciplina em memória evita uma segunda ida ao Supabase — mesmo
 * raciocínio de listMissedAppointments/listPatientsAwaitingReturn no
 * appointmentService.
 */
export async function loadDashboardMetrics({
  from,
  to,
  professionalId = null,
  discipline = null,
  patients = [],
  runtime,
} = {}) {
  const rawAppointments = await listAppointments({
    from: new Date(`${from}T00:00:00`).toISOString(),
    to: new Date(`${to}T23:59:59`).toISOString(),
    professionalId,
    runtime,
  });

  const appointments = discipline
    ? rawAppointments.filter(item => item.kind === 'block' || item.discipline === discipline)
    : rawAppointments;

  const countable = appointments.filter(isCountableAppointment);

  return {
    absences: {
      total: appointments.filter(isAbsence).length,
      byProfessional: groupAbsencesByProfessional(appointments),
      byDiscipline: groupAbsencesByDiscipline(appointments),
    },
    byWeekday: groupByWeekday(countable),
    byTimeOfDay: groupByTimeOfDay(countable),
    newVsReturning: groupNewVsReturning(countable),
    birthdays: currentMonthBirthdays(patients),
  };
}
