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
//
// Rótulos revistos com a administradora (2026-09-24):
// - 'excused' é "Cancelado pelo paciente": o paciente avisou que não
//   vem. Conta como falta justificada e vai para a fila de Evoluções.
//   Antes havia "Cancelou" e "Faltou com aviso" separados, com o mesmo
//   sentido na prática.
// - 'cancelled' fica para o que a clínica encerra (pacote cancelado
//   daqui em diante) e para registros antigos. Não vira evolução.
// - 'ready' ("chegou", sala de espera) saiu da tela: a agenda não
//   sinaliza chegada, só o resultado. Continua no CHECK do banco por
//   causa dos registros antigos e aparece como "Agendado".
export const APPOINTMENT_STATUSES = [
  { id: 'scheduled', label: 'Agendado', tone: 'neutral' },
  { id: 'ready', label: 'Agendado', tone: 'neutral', legacy: true },
  { id: 'attended', label: 'Atendido', tone: 'success' },
  { id: 'cancelled', label: 'Cancelado', tone: 'muted' },
  { id: 'no_show', label: 'Não compareceu', tone: 'danger' },
  { id: 'excused', label: 'Cancelado pelo paciente', tone: 'warning' },
];

export const APPOINTMENT_STATUS_IDS = APPOINTMENT_STATUSES.map(item => item.id);

// Estados que a tela oferece (filtros, legenda): sem os legados.
export const SELECTABLE_STATUSES = APPOINTMENT_STATUSES.filter(item => !item.legacy);

// Resultado do atendimento, na ordem dos botões do card.
export const OUTCOME_STATUSES = ['attended', 'no_show', 'excused']
  .map(id => APPOINTMENT_STATUSES.find(item => item.id === id));

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

/**
 * Aniversariantes ordenados pela PRÓXIMA ocorrência a partir de `from`,
 * ignorando o mês em exibição no calendário — vira dezembro e quem faz
 * aniversário em janeiro deve continuar no topo da lista, não sumir.
 * Base da lista "Aniversários" (uso de marketing/relacionamento da
 * clínica), separada de birthdaysByDay (que serve a grade do mês).
 *
 * @returns [{ id, name, phone, birthDate, age, nextDate, daysUntil }]
 *          ordenado por daysUntil crescente (hoje = 0), empate por nome.
 */
export function upcomingBirthdays(patients, from) {
  const result = [];
  if (!Array.isArray(patients) || !(from instanceof Date) || Number.isNaN(from.getTime())) {
    return result;
  }

  const todayStart = new Date(from.getFullYear(), from.getMonth(), from.getDate());

  for (const patient of patients) {
    const parts = parseDateOnly(patient?.birth_date);
    if (!parts) continue;

    // Tenta a ocorrência deste ano; se já passou, cai pra do ano que
    // vem. 29/02 cai em 28/02 em ano comum, mesma regra de birthdaysByDay.
    let year = todayStart.getFullYear();
    let next = nextOccurrence(parts, year);
    if (next < todayStart) {
      year += 1;
      next = nextOccurrence(parts, year);
    }

    const daysUntil = Math.round((next - todayStart) / 86400000);
    result.push({
      id: patient.id,
      name: patient.name,
      phone: patient.phone || null,
      birthDate: patient.birth_date,
      age: year - parts.year,
      nextDate: toDayKey(next),
      daysUntil,
    });
  }

  result.sort((a, b) => a.daysUntil - b.daysUntil || (a.name || '').localeCompare(b.name || '', 'pt-BR'));

  return result;
}

function nextOccurrence(parts, year) {
  const lastDay = new Date(year, parts.month, 0).getDate();
  const day = Math.min(parts.day, lastDay);
  return new Date(year, parts.month - 1, day);
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
    // Bloqueio não disputa horário: ele avisa, não barra. Espelha o
    // `kind = 'appointment'` no WHERE da constraint de exclusão
    // (docs/plano-agenda-gestao-clinica.md §6.1).
    if (item.kind === 'block') return false;
    if (FREEING_STATUSES.includes(item.status)) return false;
    const itemStart = new Date(item.starts_at).getTime();
    const itemEnd = new Date(item.ends_at).getTime();
    // Encostar não é sobrepor: 09:00-10:00 e 10:00-11:00 convivem.
    return itemStart < end && start < itemEnd;
  }) || null;
}

/**
 * "amanhã (18 de setembro)" perto da consulta, dia da semana por extenso
 * quando está longe — mesma régua usada na mensagem de WhatsApp
 * (PendingConfirmationView) e na página pública de confirmação
 * (ConfirmAppointmentPage), pro paciente ver a mesma coisa nos dois
 * lugares. `today` explícito, não Date.now() escondido — mesma regra do
 * resto do arquivo.
 */
export function relativeDayLabel(iso, today) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime()) || !(today instanceof Date) || Number.isNaN(today.getTime())) {
    return '';
  }

  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((target - todayStart) / 86400000);

  const diaMes = date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
  if (diffDays === 0) return `hoje (${diaMes})`;
  if (diffDays === 1) return `amanhã (${diaMes})`;
  if (diffDays === 2) return `depois de amanhã (${diaMes})`;
  return date.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
}

/** Manhã / tarde / noite — o gráfico de períodos do dashboard sai daqui. */
export function periodOfDay(date) {
  const hour = date instanceof Date ? date.getHours() : new Date(date).getHours();
  if (!Number.isFinite(hour)) return null;
  if (hour < 12) return 'manha';
  if (hour < 18) return 'tarde';
  return 'noite';
}
