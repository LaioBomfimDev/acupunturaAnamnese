// ============================================================
// Agenda — cálculo puro de calendário
//
// Sem React, sem Supabase, sem Date.now() escondido: tudo recebe o que
// precisa por parâmetro. É o pedaço da agenda que dá para testar sem
// subir servidor, então é aqui que mora a lógica de verdade.
// ============================================================

export const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export const MONTH_LABELS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

// Os seis estados espelham o CHECK da tabela appointments. Se um lado
// mudar sem o outro, o teste de simetria quebra de propósito.
export const APPOINTMENT_STATUSES = [
  { id: 'scheduled', label: 'Agendado', tone: 'neutral' },
  { id: 'ready', label: 'Pronto para atender', tone: 'info' },
  { id: 'attended', label: 'Atendeu', tone: 'success' },
  { id: 'cancelled', label: 'Cancelou', tone: 'muted' },
  { id: 'no_show', label: 'Não compareceu', tone: 'danger' },
  { id: 'excused', label: 'Faltou com aviso', tone: 'warning' },
];

export const APPOINTMENT_STATUS_IDS = APPOINTMENT_STATUSES.map(item => item.id);

// Estados que liberam o horário do profissional. Espelha o WHERE da
// constraint appointments_no_overlap.
export const FREEING_STATUSES = ['cancelled', 'no_show', 'excused'];

export function getStatusLabel(id) {
  return APPOINTMENT_STATUSES.find(item => item.id === id)?.label || id || '';
}

/**
 * Quebra 'YYYY-MM-DD' em números SEM passar pelo construtor de Date.
 *
 * new Date('1990-05-10') é interpretado como UTC meia-noite; a oeste de
 * Greenwich isso vira 09/05 no horário local e o aniversário aparece um
 * dia antes. O Brasil inteiro cai nesse buraco, então a data pura é
 * tratada como texto, nunca como instante.
 */
export function parseDateOnly(value) {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

/** Chave estável de dia local, imune a fuso: 'YYYY-MM-DD'. */
export function toDayKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function isSameDay(a, b) {
  const keyA = toDayKey(a);
  return keyA !== null && keyA === toDayKey(b);
}

/**
 * Grade do mês: sempre 6 semanas x 7 dias, para o calendário não pular
 * de altura ao trocar de mês. Os dias de fora vêm marcados.
 *
 * @param month 1-12 (não o 0-11 do Date, que é fonte eterna de erro).
 */
export function buildMonthGrid(year, month, { today = null } = {}) {
  const first = new Date(year, month - 1, 1);
  const start = new Date(year, month - 1, 1 - first.getDay());

  const weeks = [];
  const cursor = new Date(start);

  for (let week = 0; week < 6; week += 1) {
    const days = [];
    for (let day = 0; day < 7; day += 1) {
      const date = new Date(cursor);
      days.push({
        date,
        key: toDayKey(date),
        day: date.getDate(),
        inMonth: date.getMonth() === month - 1,
        isToday: today ? isSameDay(date, today) : false,
        isWeekend: date.getDay() === 0 || date.getDay() === 6,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(days);
  }

  return weeks;
}

/**
 * Aniversariantes por dia do mês. Compara dia e mês ignorando o ano,
 * usando parseDateOnly para não escorregar de fuso.
 *
 * @returns Map de 'YYYY-MM-DD' -> [{ id, name, age }]
 */
export function birthdaysByDay(patients, year, month) {
  const result = new Map();
  if (!Array.isArray(patients)) return result;

  for (const patient of patients) {
    const parts = parseDateOnly(patient?.birth_date);
    if (!parts || parts.month !== month) continue;

    // 29/02 em ano comum é celebrado em 28/02, senão o aniversário
    // simplesmente some do calendário em três anos de cada quatro.
    const lastDay = new Date(year, month, 0).getDate();
    const day = Math.min(parts.day, lastDay);

    const key = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const list = result.get(key) || [];
    list.push({
      id: patient.id,
      name: patient.name,
      age: year - parts.year,
    });
    result.set(key, list);
  }

  return result;
}

/** Agrupa agendamentos por dia local de início. */
export function appointmentsByDay(appointments) {
  const result = new Map();
  if (!Array.isArray(appointments)) return result;

  for (const appointment of appointments) {
    const start = new Date(appointment?.starts_at);
    const key = toDayKey(start);
    if (!key) continue;
    const list = result.get(key) || [];
    list.push(appointment);
    result.set(key, list);
  }

  for (const list of result.values()) {
    list.sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  }

  return result;
}

/**
 * Checagem de sobreposição no cliente. NÃO substitui a constraint
 * appointments_no_overlap — o banco continua sendo a autoridade. Serve
 * para avisar antes da ida ao servidor, com mensagem melhor que a do
 * Postgres.
 */
export function findOverlap(appointments, candidate) {
  if (!Array.isArray(appointments) || !candidate) return null;
  const start = new Date(candidate.starts_at).getTime();
  const end = new Date(candidate.ends_at).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;

  return appointments.find(item => {
    if (item.id && item.id === candidate.id) return false;
    if (item.professional_id !== candidate.professional_id) return false;
    if (FREEING_STATUSES.includes(item.status)) return false;
    const itemStart = new Date(item.starts_at).getTime();
    const itemEnd = new Date(item.ends_at).getTime();
    // Encostar não é sobrepor: 09:00-10:00 e 10:00-11:00 convivem.
    return itemStart < end && start < itemEnd;
  }) || null;
}

/** Manhã / tarde / noite — o gráfico de períodos do dashboard sai daqui. */
export function periodOfDay(date) {
  const hour = date instanceof Date ? date.getHours() : new Date(date).getHours();
  if (!Number.isFinite(hour)) return null;
  if (hour < 12) return 'manha';
  if (hour < 18) return 'tarde';
  return 'noite';
}
