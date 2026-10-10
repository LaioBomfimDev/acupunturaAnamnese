// Datas e textos curtos das escalas, num lugar só.

export function formatInstrumentDate(value, { short = false } = {}) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('pt-BR', short
    ? { day: '2-digit', month: '2-digit', year: '2-digit' }
    : { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** "o PHQ-9" / "a DASS-21"; com `de`: "do PHQ-9" / "da DASS-21". */
export function namedInstrument(instrument, preposition = null) {
  const feminine = instrument?.article === 'a';
  if (preposition === 'de') return `${feminine ? 'da' : 'do'} ${instrument?.shortName || ''}`;
  return `${feminine ? 'a' : 'o'} ${instrument?.shortName || ''}`;
}

/** "1 ponto" / "12 pontos". */
export function pointsLabel(score) {
  return `${score} ${Math.abs(score) === 1 ? 'ponto' : 'pontos'}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Dias de calendário (fuso local) entre duas datas; 0 = mesmo dia. */
export function calendarDaysBetween(from, to = new Date()) {
  const start = new Date(from);
  const end = new Date(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const startDay = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endDay = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((endDay - startDay) / DAY_MS);
}

/**
 * Situação de reaplicação a partir da última aplicação válida:
 * `{ tooSoon, daysSince, availableFrom }`. Sem aplicação ou sem intervalo
 * definido, nunca é cedo demais.
 */
export function reapplyStatus(lastAppliedAt, intervalDays, now = new Date()) {
  const daysSince = lastAppliedAt ? calendarDaysBetween(lastAppliedAt, now) : null;
  if (daysSince == null || !intervalDays) return { tooSoon: false, daysSince, availableFrom: null };
  const last = new Date(lastAppliedAt);
  const availableFrom = new Date(last.getFullYear(), last.getMonth(), last.getDate() + intervalDays, 12);
  return { tooSoon: daysSince < intervalDays, daysSince, availableFrom: availableFrom.toISOString() };
}

/** "hoje", "ontem", "há 5 dias". */
export function daysAgoLabel(days) {
  if (days === 0) return 'hoje';
  if (days === 1) return 'ontem';
  return `há ${days} dias`;
}

/** Data de hoje no fuso local, no formato do <input type="date">. */
export function todayInputValue(now = new Date()) {
  const pad = number => String(number).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Data escolhida → instante salvo. Hoje vira "agora" (a hora real da
 * aplicação); dia passado vira meio-dia local, longe da virada do dia
 * em qualquer fuso do Brasil.
 */
export function appliedAtFromInput(value, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
  if (value === todayInputValue(now)) return now.toISOString();
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (Number.isNaN(date.getTime()) || date > now) return null;
  return date.toISOString();
}

export function differenceLabel(current, previous) {
  if (typeof current !== 'number' || typeof previous !== 'number') return '';
  const delta = current - previous;
  if (delta === 0) return 'Igual à aplicação anterior.';
  const size = Math.abs(delta);
  return `${delta > 0 ? 'Subiu' : 'Desceu'} ${pointsLabel(size)} em relação à anterior.`;
}

/** Aplicações válidas (não anuladas, com nota), da mais recente para a mais antiga. */
export function validApplications(applications) {
  return applications.filter(app => !app.voidedAt && (
    typeof app.result?.score === 'number' || Array.isArray(app.result?.subscales)
  ));
}

/**
 * As notas que a escala mostra: uma só (PHQ-9, GAD-7) ou uma por
 * subescala (DASS-21). Cada visão lê do resultado gravado a nota e a
 * faixa dela, e traz as faixas e a régua (`scoring.min/max`) do gráfico.
 */
export function scoreViews(instrument) {
  if (instrument?.scoring?.method === 'subscales') {
    return (instrument.scoring.subscales || []).map(subscale => ({
      id: subscale.id,
      label: subscale.label,
      short: subscale.short || subscale.label.slice(0, 1),
      itemCount: subscale.items.length,
      scoring: { min: subscale.min, max: subscale.max },
      bands: subscale.bands,
      read: result => {
        const found = (result?.subscales || []).find(item => item.id === subscale.id);
        return { score: typeof found?.score === 'number' ? found.score : null, bandLabel: found?.bandLabel || null };
      },
    }));
  }
  return [{
    id: 'total',
    label: null,
    short: null,
    itemCount: (instrument?.items || []).length,
    scoring: instrument?.scoring,
    bands: instrument?.bands || [],
    read: result => ({
      score: typeof result?.score === 'number' ? result.score : null,
      bandLabel: result?.bandLabel || null,
    }),
  }];
}

/** As aplicações vistas por uma visão: `result.score`/`bandLabel` passam a ser os dela. */
export function viewApplications(applications, view) {
  return applications.map(app => ({ ...app, result: { ...app.result, ...view.read(app.result) } }));
}

/** Recado depois de salvar: o resultado em uma frase, e o risco junto. */
export function savedNotice(instrument, saved) {
  if (saved?.replayed) return { text: 'Esta aplicação já estava salva.', risk: false };
  const result = saved?.payload?.result || {};
  let base = `${instrument.shortName} salvo.`;
  if (Array.isArray(result.subscales)) {
    const parts = result.subscales
      .filter(subscale => typeof subscale.score === 'number')
      .map(subscale => `${subscale.label.toLowerCase()} ${pointsLabel(subscale.score)} (${String(subscale.bandLabel || '').toLowerCase()})`);
    if (parts.length) base = `${instrument.shortName} salvo: ${parts.join(', ')}.`;
  } else if (typeof result.score === 'number') {
    base = `${instrument.shortName} salvo: ${pointsLabel(result.score)}, faixa ${result.bandLabel}.`;
  }
  return { text: base, risk: (result.riskItems || []).length > 0 };
}

// Envio para a Área do Paciente (etapa 2).
const STATUS_LABELS = {
  pending: 'esperando o paciente abrir',
  in_progress: 'paciente respondendo',
};

export function openRequestOf(requests) {
  return requests.find(request => request.status === 'pending' || request.status === 'in_progress') || null;
}

export function requestStatusLabel(request) {
  if (!request) return '';
  if (request.status === 'in_progress') return `${STATUS_LABELS.in_progress} (${request.progress}%)`;
  return STATUS_LABELS[request.status] || '';
}

/** Recusa do banco para quem não atende o paciente na área (frase das RPCs). */
export function isInstrumentAccessDenied(message) {
  return /não está em atendimento nesta área/.test(String(message || ''));
}

/**
 * A aplicação que um envio para casa gerou: mesma escala, vinda da Área do
 * Paciente, no instante em que o envio foi respondido (portal_save_answers
 * grava os dois com o mesmo now()). Aceita até 1 s de diferença por causa
 * do arredondamento do horário e fica com a mais próxima; a mesma escala
 * não tem dois envios abertos ao mesmo tempo. `request` é a linha de
 * patient_form_assignments.
 */
export function findRequestApplication(applications, request) {
  const answeredAt = new Date(request?.submitted_at || 0).getTime();
  if (!answeredAt) return null;
  let best = null;
  let bestGap = Infinity;
  for (const app of applications || []) {
    if (app.source !== 'area_do_paciente' || app.instrumentId !== request.instrument_id) continue;
    const gap = Math.abs(new Date(app.appliedAt).getTime() - answeredAt);
    if (gap <= 1000 && gap < bestGap) {
      best = app;
      bestGap = gap;
    }
  }
  return best;
}
