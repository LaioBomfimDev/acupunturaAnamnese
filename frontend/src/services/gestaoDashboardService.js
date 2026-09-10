// ============================================================
// SERVICE: Painel de Indicadores da Gestão (Fase 5 do ERP de agenda)
//
// Só busca e monta o objeto final — a conta de verdade mora em
// utils/gestaoDashboard.js, pura e testável sem Supabase. Reaproveita
// listAppointments/listProfessionalSchedules/listHolidays já existentes:
// nenhuma consulta nova ao banco, nenhuma migration.
// ============================================================

import { listAppointments } from './appointmentService';
import { listProfessionalSchedules, listHolidays } from './agendaScheduleService';
import {
  computeOccupancy,
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
 */
export async function loadDashboardMetrics({
  from,
  to,
  professionalId = null,
  patients = [],
  runtime,
} = {}) {
  const [appointments, schedules, holidays] = await Promise.all([
    listAppointments({
      from: new Date(`${from}T00:00:00`).toISOString(),
      to: new Date(`${to}T23:59:59`).toISOString(),
      professionalId,
      runtime,
    }),
    listProfessionalSchedules({ professionalId, runtime }),
    listHolidays({ from, to, runtime }),
  ]);

  const countable = appointments.filter(isCountableAppointment);

  return {
    occupancy: computeOccupancy({ appointments, schedules, holidays, from, to }),
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
