import { DISCIPLINE_IDS, getDiscipline } from '../data/disciplines';

// ============================================================
// Configuração da agenda (Admin da clínica → "Configurar agenda")
//
// Fica em clinics.agenda_settings (JSONB) e vale para a equipe toda.
// O banco só garante que é um objeto; QUEM decide o que vale é
// `normalizeAgendaSettings`: chave desconhecida ou valor fora da lista
// cai no padrão. Assim um JSON antigo, incompleto ou mexido à mão nunca
// quebra a agenda — no pior caso ela volta ao padrão naquele item.
//
// Arquivo puro (sem service, sem React): é o que os testes exercitam.
// ============================================================

// Visual de um atendimento que não vai acontecer. Vale para
// "Cancelado"/"Cancelado pelo paciente" (cancelledLook) e, em separado,
// para "Não compareceu" (noShowLook).
export const STATUS_LOOKS = [
  { id: 'solid-x', label: 'Preto com X grande', hint: 'O mais forte: impossível confundir com horário ocupado.' },
  { id: 'solid', label: 'Preto', hint: 'Card preto com o nome riscado, sem o X.' },
  { id: 'x', label: 'X grande na cor da disciplina', hint: 'Mantém a cor da área e crava um X por cima.' },
  { id: 'outline', label: 'Vazado', hint: 'Fundo branco e contorno tracejado: o horário parece livre.' },
  { id: 'faded', label: 'Cinza apagado', hint: 'O visual antigo, mais discreto.' },
];

// Fixo = sessão de pacote no horário do pacote. Eventual = marcado só
// para aquele dia, ou sessão de pacote que foi movida.
export const SERIES_HIGHLIGHTS = [
  { id: 'one-off', label: 'Destacar os eventuais', hint: 'O fixo fica normal; o marcado só para aquele dia ganha a marca.' },
  { id: 'fixed', label: 'Destacar os fixos', hint: 'O pacote ganha a marca; o eventual fica normal.' },
  { id: 'none', label: 'Não diferenciar', hint: 'Todos iguais, como era antes.' },
];

export const SERIES_MARK_STYLES = [
  { id: 'dashed', label: 'Moldura tracejada + selo' },
  { id: 'stripes', label: 'Listras + selo' },
  { id: 'badge', label: 'Só o selo' },
];

export const DEFAULT_VIEW_OPTIONS = [
  { id: 'hoje', label: 'Hoje' },
  { id: 'dia', label: 'Dia' },
  { id: 'semana', label: 'Semana' },
  { id: 'mes', label: 'Mês' },
];

export const DURATION_OPTIONS = [15, 20, 30, 40, 45, 50, 60, 75, 90, 120, 150, 180];
export const SLOT_OPTIONS = [15, 20, 30, 45, 60];

// Cores que o Admin pode dar a cada disciplina na agenda. Todas com
// contraste >= 4,5:1 para o texto branco do card e sem vermelho
// (reservado a risco/conflito) — mesma régua da cor da clínica.
export const AGENDA_COLOR_PALETTE = [
  { value: '#0F4C49', label: 'Verde-petróleo' },
  { value: '#0E2A4A', label: 'Petróleo' },
  { value: '#2E5578', label: 'Azul aço' },
  { value: '#2E5A7D', label: 'Azul' },
  { value: '#1F6F8B', label: 'Turquesa' },
  { value: '#3F7D5C', label: 'Verde' },
  { value: '#5B6B2E', label: 'Oliva' },
  { value: '#46426B', label: 'Índigo' },
  { value: '#6A4C93', label: 'Roxo' },
  { value: '#5C3D63', label: 'Ameixa' },
  { value: '#8B4F7E', label: 'Rosa malva' },
  { value: '#8C4460', label: 'Rosa vinho' },
  { value: '#A62D63', label: 'Rosa framboesa' },
  { value: '#A1506A', label: 'Rosa antigo' },
  { value: '#9A5B3C', label: 'Terracota' },
  { value: '#7A5A2E', label: 'Caramelo' },
  { value: '#75602A', label: 'Ouro velho' },
  { value: '#8C6D12', label: 'Dourado' },
  { value: '#3A3F45', label: 'Grafite' },
];

export const AGENDA_SETTINGS_DEFAULTS = Object.freeze({
  cancelledLook: 'solid-x',
  noShowLook: 'outline',
  hideCancelled: false,
  seriesHighlight: 'one-off',
  seriesMarkStyle: 'dashed',
  disciplineColors: Object.freeze({}),
  defaultDurationMinutes: 60,
  defaultView: 'hoje',
  fallbackDayStartHour: 7,
  fallbackDayEndHour: 20,
  fallbackSlotMinutes: 60,
});

// "Cancelado" (cancelar pacote) e "Cancelado pelo paciente" são o mesmo
// fato para quem olha a agenda: o horário não vai acontecer.
const CANCELLED_STATUSES = ['cancelled', 'excused'];

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

function pickFrom(options, value, fallback) {
  return options.some(option => option.id === value) ? value : fallback;
}

function pickNumber(allowed, value, fallback) {
  const number = Number(value);
  return allowed.includes(number) ? number : fallback;
}

function pickHour(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= 24 ? number : fallback;
}

/** Qualquer coisa → configuração válida e completa. Nunca lança. */
export function normalizeAgendaSettings(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const defaults = AGENDA_SETTINGS_DEFAULTS;

  const disciplineColors = {};
  const rawColors = source.disciplineColors;
  if (rawColors && typeof rawColors === 'object' && !Array.isArray(rawColors)) {
    for (const id of DISCIPLINE_IDS) {
      if (HEX_COLOR.test(String(rawColors[id] || ''))) disciplineColors[id] = rawColors[id].toUpperCase();
    }
  }

  let startHour = pickHour(source.fallbackDayStartHour, defaults.fallbackDayStartHour);
  let endHour = pickHour(source.fallbackDayEndHour, defaults.fallbackDayEndHour);
  // Grade invertida ou vazia não tem conserto parcial: volta as duas pontas.
  if (endHour <= startHour) {
    startHour = defaults.fallbackDayStartHour;
    endHour = defaults.fallbackDayEndHour;
  }

  return {
    cancelledLook: pickFrom(STATUS_LOOKS, source.cancelledLook, defaults.cancelledLook),
    noShowLook: pickFrom(STATUS_LOOKS, source.noShowLook, defaults.noShowLook),
    hideCancelled: source.hideCancelled === true,
    seriesHighlight: pickFrom(SERIES_HIGHLIGHTS, source.seriesHighlight, defaults.seriesHighlight),
    seriesMarkStyle: pickFrom(SERIES_MARK_STYLES, source.seriesMarkStyle, defaults.seriesMarkStyle),
    disciplineColors,
    defaultDurationMinutes: pickNumber(DURATION_OPTIONS, source.defaultDurationMinutes, defaults.defaultDurationMinutes),
    defaultView: pickFrom(DEFAULT_VIEW_OPTIONS, source.defaultView, defaults.defaultView),
    fallbackDayStartHour: startHour,
    fallbackDayEndHour: endHour,
    fallbackSlotMinutes: pickNumber(SLOT_OPTIONS, source.fallbackSlotMinutes, defaults.fallbackSlotMinutes),
  };
}

/** Cor do card: a escolhida pelo Admin, senão a da disciplina (tokens.css). */
export function disciplineColorFor(discipline, settings) {
  return settings?.disciplineColors?.[discipline] || getDiscipline(discipline)?.color || null;
}

export function isCancelledStatus(status) {
  return CANCELLED_STATUSES.includes(status);
}

/** Visual de status (id de STATUS_LOOKS) ou null quando o status não tem um. */
export function statusLookOf(appointment, settings) {
  if (!appointment || appointment.kind === 'block') return null;
  if (isCancelledStatus(appointment.status)) return settings?.cancelledLook || AGENDA_SETTINGS_DEFAULTS.cancelledLook;
  if (appointment.status === 'no_show') return settings?.noShowLook || AGENDA_SETTINGS_DEFAULTS.noShowLook;
  return null;
}

/**
 * 'fixed' | 'one-off' | null (bloqueio). Sessão de pacote movida vira
 * eventual: naquele dia está fora do horário fixo, e é isso que a
 * recepção precisa enxergar.
 */
export function seriesKindOf(appointment) {
  if (!appointment || appointment.kind === 'block') return null;
  return appointment.recurrence_group_id && !appointment.rescheduled_from ? 'fixed' : 'one-off';
}

/**
 * Marca de fixo/eventual a desenhar no card, ou null. Card cancelado ou
 * de falta não ganha marca: já está resolvido, e o visual de status
 * manda nele.
 */
export function seriesMarkOf(appointment, settings) {
  const kind = seriesKindOf(appointment);
  const highlight = settings?.seriesHighlight || AGENDA_SETTINGS_DEFAULTS.seriesHighlight;
  if (!kind || highlight === 'none' || kind !== highlight) return null;
  if (statusLookOf(appointment, settings)) return null;
  return {
    kind,
    style: settings?.seriesMarkStyle || AGENDA_SETTINGS_DEFAULTS.seriesMarkStyle,
    label: kind === 'fixed' ? 'Fixo' : 'Eventual',
  };
}

/** Atributos data-* que o CSS da agenda lê (visual de status e fixo/eventual). */
export function appointmentLookAttrs(appointment, settings) {
  const look = statusLookOf(appointment, settings);
  const mark = seriesMarkOf(appointment, settings);
  return {
    'data-look': look || undefined,
    'data-series': mark?.kind,
    'data-series-mark': mark?.style,
  };
}

/** "Remarcada de ter 29/09 14:00", ou '' se nunca foi movida. */
export function rescheduledLabel(appointment) {
  const from = new Date(appointment?.rescheduled_from);
  if (!appointment?.rescheduled_from || Number.isNaN(from.getTime())) return '';
  const weekday = from.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
  const day = from.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  const time = from.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `Remarcada de ${weekday} ${day} ${time}`;
}

/**
 * Valor de `rescheduled_from` depois de mover: guarda o horário ORIGINAL
 * (o da primeira remarcação, não o da última) e limpa quando a sessão
 * volta exatamente para ele.
 */
export function nextRescheduledFrom(appointment, newStartIso) {
  const original = appointment?.rescheduled_from || appointment?.starts_at || null;
  if (!original) return null;
  const originalTime = new Date(original).getTime();
  const newTime = new Date(newStartIso).getTime();
  if (Number.isNaN(originalTime) || Number.isNaN(newTime)) return null;
  return originalTime === newTime ? null : new Date(originalTime).toISOString();
}

/**
 * Esconde os cancelados quando o Admin pediu — a não ser que a pessoa
 * esteja filtrando justamente por um status de cancelado.
 */
export function hidesAppointment(appointment, settings, statusFilter = '') {
  if (!settings?.hideCancelled || !appointment || appointment.kind === 'block') return false;
  if (isCancelledStatus(statusFilter)) return false;
  return isCancelledStatus(appointment.status);
}

/** Grade sugerida para quem não cadastrou jornada, em minutos. */
export function fallbackGridOf(settings) {
  const normalized = normalizeAgendaSettings(settings);
  return {
    start: normalized.fallbackDayStartHour * 60,
    end: normalized.fallbackDayEndHour * 60,
    slot: normalized.fallbackSlotMinutes,
  };
}

/** "das 07h às 20h" — texto do aviso de grade sem jornada. */
export function fallbackGridLabel(settings) {
  const { start, end } = fallbackGridOf(settings);
  const hour = minutes => `${String(Math.floor(minutes / 60)).padStart(2, '0')}h`;
  return `das ${hour(start)} às ${hour(end)}`;
}
