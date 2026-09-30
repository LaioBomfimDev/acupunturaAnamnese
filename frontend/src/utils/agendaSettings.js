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
// para aquele dia, ou sessão de pacote que foi movida. O NOME de cada um
// é da clínica (seriesBadges): aqui ficam só os ids e a explicação, e o
// rótulo da opção sai de seriesHighlightLabel.
export const SERIES_HIGHLIGHTS = [
  { id: 'one-off', hint: 'Ganha o selo o que foi marcado só para aquele dia, ou a sessão do pacote que foi movida.' },
  { id: 'fixed', hint: 'Ganha o selo a sessão do pacote no horário de sempre.' },
  { id: 'both', hint: 'Cada tipo com o próprio selo e a própria moldura: os dois se distinguem de longe.' },
  { id: 'none', label: 'Não diferenciar', hint: 'Todos iguais, como era antes.' },
];

export const SERIES_KINDS = ['one-off', 'fixed'];

// Selo de cada tipo: nome, cor, ícone e moldura escolhidos pelo Admin.
// Cor vazia = selo branco com o texto na cor do card (o visual de antes).
export const SERIES_BADGE_DEFAULTS = Object.freeze({
  'one-off': Object.freeze({ label: 'Eventual', color: '', icon: 'none', mark: 'dashed' }),
  fixed: Object.freeze({ label: 'Fixo', color: '', icon: 'none', mark: 'dashed' }),
});

// O selo mora dentro do card da visão Semana: nome comprido quebra a linha.
export const SERIES_LABEL_MAX_LENGTH = 16;

// Atalhos na tela; a pessoa também pode escrever outro nome.
export const SERIES_LABEL_SUGGESTIONS = Object.freeze({
  'one-off': ['Eventual', 'Avulso', 'Pontual'],
  fixed: ['Fixo', 'Pacote', 'Recorrente'],
});

// Ids que o SeriesBadge.jsx desenha. Nada que já tenha outro sentido na
// agenda (alfinete = presencial, câmera = online, etiqueta = bloqueio).
export const SERIES_ICONS = [
  { id: 'none', label: 'Sem ícone' },
  { id: 'star', label: 'Estrela' },
  { id: 'bolt', label: 'Raio' },
  { id: 'clock', label: 'Relógio' },
  { id: 'repeat', label: 'Repetir' },
  { id: 'flag', label: 'Bandeira' },
  { id: 'sparkle', label: 'Brilho' },
];

// Moldura do card destacado — o reforço visto de longe; o selo aparece
// sempre, porque padrão visual sozinho não é leitura acessível. Só
// contorno (outline) e fundo: sombra já é de selecionado, movendo, foco
// e pendência (agenda.css), e as duas coisas não podem se apagar.
export const SERIES_MARK_STYLES = [
  { id: 'dashed', label: 'Tracejada', hint: 'Contorno em traços por dentro do card.' },
  { id: 'dotted', label: 'Pontilhada', hint: 'Contorno em pontos por dentro do card.' },
  { id: 'double', label: 'Dupla', hint: 'Duas linhas finas por dentro do card.' },
  { id: 'ring', label: 'Anel por fora', hint: 'Contorno em volta do card, na cor do selo (grafite se o selo for branco).' },
  { id: 'stripes', label: 'Listras', hint: 'Fundo com listras diagonais claras.' },
  { id: 'dots', label: 'Bolinhas', hint: 'Fundo com bolinhas claras.' },
  { id: 'badge', label: 'Só o selo', hint: 'Card normal; só o selo avisa.' },
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
  seriesBadges: SERIES_BADGE_DEFAULTS,
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

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

/** Nome do selo sem quebra de linha, espaço sobrando ou excesso; '' se não sobrar nada. */
export function cleanSeriesLabel(value) {
  if (typeof value !== 'string') return '';
  const text = value.replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim();
  return Array.from(text).slice(0, SERIES_LABEL_MAX_LENGTH).join('').trim();
}

/** Os dois selos com o mesmo nome (sem diferenciar maiúscula) apagam a diferença que eles mostram. */
export function seriesLabelsClash(badges) {
  const fixed = cleanSeriesLabel(badges?.fixed?.label).toLocaleLowerCase('pt-BR');
  const oneOff = cleanSeriesLabel(badges?.['one-off']?.label).toLocaleLowerCase('pt-BR');
  return Boolean(fixed) && fixed === oneOff;
}

const SERIES_COLORS = AGENDA_COLOR_PALETTE.map(color => color.value);

// `legacyMark`: até 2026-09-30 a moldura era uma só (seriesMarkStyle) para
// qualquer selo. Configuração salva nesse formato continua valendo para os
// dois, até o Admin escolher a moldura de cada um.
function normalizeSeriesBadges(raw, legacyMark) {
  const source = plainObject(raw);
  const badges = {};
  for (const kind of SERIES_KINDS) {
    const item = plainObject(source[kind]);
    const defaults = SERIES_BADGE_DEFAULTS[kind];
    // Só a paleta da agenda: garante contraste com o texto branco e
    // nenhum vermelho (reservado a conflito).
    const color = typeof item.color === 'string' ? item.color.toUpperCase() : '';
    badges[kind] = {
      label: cleanSeriesLabel(item.label) || defaults.label,
      color: SERIES_COLORS.includes(color) ? color : '',
      icon: pickFrom(SERIES_ICONS, item.icon, defaults.icon),
      mark: pickFrom(SERIES_MARK_STYLES, item.mark, pickFrom(SERIES_MARK_STYLES, legacyMark, defaults.mark)),
    };
  }
  // Mesmo nome nos dois não tem conserto parcial: voltam os dois nomes.
  if (seriesLabelsClash(badges)) {
    for (const kind of SERIES_KINDS) badges[kind].label = SERIES_BADGE_DEFAULTS[kind].label;
  }
  return badges;
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
    seriesBadges: normalizeSeriesBadges(source.seriesBadges, source.seriesMarkStyle),
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

/** Nome que a clínica deu ao tipo ('fixed' | 'one-off'): "Fixo", "Avulso"… */
export function seriesLabelOf(kind, settings) {
  return settings?.seriesBadges?.[kind]?.label || SERIES_BADGE_DEFAULTS[kind]?.label || '';
}

/** Rótulo da opção de destaque com o nome da clínica: "Destacar Avulso". */
export function seriesHighlightLabel(option, settings) {
  if (option.id === 'none') return option.label;
  if (option.id === 'both') {
    return `Destacar ${seriesLabelOf('one-off', settings)} e ${seriesLabelOf('fixed', settings)}`;
  }
  return `Destacar ${seriesLabelOf(option.id, settings)}`;
}

/** O tipo ('fixed' | 'one-off') ganha selo nos cards com o destaque atual? */
export function isSeriesKindHighlighted(kind, settings) {
  const highlight = settings?.seriesHighlight || AGENDA_SETTINGS_DEFAULTS.seriesHighlight;
  return highlight === 'both' || highlight === kind;
}

/**
 * Marca de fixo/eventual a desenhar no card, ou null. Card cancelado ou
 * de falta não ganha marca: já está resolvido, e o visual de status
 * manda nele. Nome, cor, ícone e moldura vêm de seriesBadges.
 */
export function seriesMarkOf(appointment, settings) {
  const kind = seriesKindOf(appointment);
  if (!kind || !isSeriesKindHighlighted(kind, settings)) return null;
  if (statusLookOf(appointment, settings)) return null;
  const badge = settings?.seriesBadges?.[kind] || SERIES_BADGE_DEFAULTS[kind];
  return {
    kind,
    style: badge.mark || SERIES_BADGE_DEFAULTS[kind].mark,
    label: seriesLabelOf(kind, settings),
    color: badge.color || '',
    icon: badge.icon || 'none',
  };
}

/**
 * Estilo inline do card: a cor da disciplina e, quando o selo tem cor
 * própria, essa cor (o "Anel por fora" desenha com ela).
 */
export function appointmentCardStyle(disciplineColor, mark) {
  const style = {};
  if (disciplineColor) style['--card-color'] = disciplineColor;
  if (mark?.color) style['--series-color'] = mark.color;
  return Object.keys(style).length ? style : undefined;
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
