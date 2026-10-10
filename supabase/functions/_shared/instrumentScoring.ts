// ============================================================
// Escalas clínicas — cálculo do lado do servidor
//
// Espelho de frontend/src/utils/instrumentScoring.js (fonte das regras):
// a Edge Function da Área do Paciente não confia na nota que viria da
// tela e refaz aqui a limpeza das respostas, a soma, a faixa e o risco.
// Sem import externo, para o teste do frontend carregar este arquivo e
// comparar as duas versões com os mesmos casos
// (tests/regression/patient-instruments.test.mjs). Mudou lá, muda aqui.
// ============================================================

type Option = { value: number; label?: string };
type Item = {
  id: string;
  text?: string;
  options?: Option[];
  risk?: { fromValue: number; message?: string; homeMessage?: string } | null;
  showWhen?: string;
};
type Band = { id: string; label: string; min: number; max: number };
type Subscale = { id: string; label: string; short?: string; items: string[]; min: number; max: number; bands: Band[] };
export type Instrument = {
  id: string;
  version: number;
  items?: Item[];
  extraItems?: Item[];
  scoring: { method: string; min?: number; max?: number; multiplier?: number; subscales?: Subscale[] };
  bands: Band[];
};
type Answers = Record<string, unknown>;

export const INSTRUMENT_NOTE_MAX = 2000;

function optionValues(item: Item): number[] {
  return (item.options || []).map(option => option.value);
}

function isValidAnswer(item: Item, value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && optionValues(item).includes(value);
}

export function bandIn(bands: Band[] | undefined, score: unknown): Band | null {
  if (typeof score !== 'number' || !Number.isFinite(score)) return null;
  return (bands || []).find(band => score >= band.min && score <= band.max) || null;
}

export function bandForScore(instrument: Instrument, score: unknown): Band | null {
  return bandIn(instrument.bands, score);
}

function scoreSubscales(instrument: Instrument, answers: Answers) {
  const items = instrument.items || [];
  const multiplier = instrument.scoring.multiplier || 1;
  return (instrument.scoring.subscales || []).map(subscale => {
    const subItems = subscale.items.map(id => items.find(item => item.id === id));
    const complete = subItems.length > 0 && subItems.every(item => item && isValidAnswer(item, answers?.[item.id]));
    const score = complete
      ? subItems.reduce((total, item) => total + (answers[(item as Item).id] as number), 0) * multiplier
      : null;
    return { id: subscale.id, label: subscale.label, score, band: complete ? bandIn(subscale.bands, score) : null };
  });
}

export function scoreInstrument(instrument: Instrument, answers: Answers = {}) {
  const items = instrument.items || [];
  let sum = 0;
  let answered = 0;
  const riskItems: string[] = [];

  for (const item of items) {
    const value = answers?.[item.id];
    if (!isValidAnswer(item, value)) continue;
    answered += 1;
    sum += value;
    if (item.risk && value >= item.risk.fromValue) riskItems.push(item.id);
  }

  const complete = items.length > 0 && answered === items.length;
  const bySubscale = instrument.scoring.method === 'subscales';
  let score: number | null = null;
  if (complete && !bySubscale) {
    if (instrument.scoring.method === 'sum_times_2') score = sum * 2;
    else if (instrument.scoring.method === 'mean') score = sum / items.length;
    else score = sum;
  }

  return {
    answered,
    total: items.length,
    complete,
    score,
    band: complete && !bySubscale ? bandForScore(instrument, score) : null,
    ...(bySubscale ? { subscales: scoreSubscales(instrument, answers) } : {}),
    riskItems,
  };
}

export function riskMessages(instrument: Instrument, riskItems: string[] = [], { source = null }: { source?: string | null } = {}) {
  const fromHome = source === 'area_do_paciente';
  return (instrument.items || [])
    .filter(item => item.risk && riskItems.includes(item.id))
    .map(item => ({ itemId: item.id, message: (fromHome && item.risk?.homeMessage) || item.risk?.message }));
}

export function visibleExtraItems(instrument: Instrument, answers: Answers = {}): Item[] {
  const anyPositive = (instrument.items || []).some(item => {
    const value = answers?.[item.id];
    return isValidAnswer(item, value) && value > 0;
  });
  return (instrument.extraItems || []).filter(item => item.showWhen !== 'anyPositive' || anyPositive);
}

export function sanitizeInstrumentAnswers(instrument: Instrument, answers: Answers = {}): Record<string, number> {
  const clean: Record<string, number> = {};
  for (const item of [...(instrument.items || []), ...visibleExtraItems(instrument, answers)]) {
    const value = answers?.[item.id];
    if (isValidAnswer(item, value)) clean[item.id] = value;
  }
  return clean;
}

export function buildApplicationPayload(instrument: Instrument, answers: Answers, note: unknown = '') {
  const clean = sanitizeInstrumentAnswers(instrument, answers);
  const result = scoreInstrument(instrument, clean);
  if (!result.complete) {
    throw new Error(`Responda as ${result.total} perguntas para salvar (faltam ${result.total - result.answered}).`);
  }
  const trimmedNote = String(note || '').trim().slice(0, INSTRUMENT_NOTE_MAX);
  return {
    answers: clean,
    result: {
      score: result.score,
      bandId: result.band?.id || null,
      bandLabel: result.band?.label || null,
      ...(result.subscales ? {
        subscales: result.subscales.map(subscale => ({
          id: subscale.id,
          label: subscale.label,
          score: subscale.score,
          bandId: subscale.band?.id || null,
          bandLabel: subscale.band?.label || null,
        })),
      } : {}),
      riskItems: result.riskItems,
    },
    ...(trimmedNote ? { note: trimmedNote } : {}),
  };
}
