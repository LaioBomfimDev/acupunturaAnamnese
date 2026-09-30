// ============================================================
// Pesquisa de satisfação na Gestão: recorte por semana/mês e textos
// da exclusão. Cálculo puro (sem React, sem Supabase, sem Date.now()
// escondido), testado em tests/regression/gestao-surveys.test.mjs.
//
// A data que conta é a do ENVIO (created_at), a mesma do card: uma
// pesquisa enviada em setembro e respondida em outubro fica em
// setembro. Semana começa no domingo, como no resto da agenda
// (presetToRange em gestaoDashboard.js).
// ============================================================

import { MONTH_LABELS } from './agenda';

export const SURVEY_PERIOD_MODES = [
  { id: 'week', label: 'Semana' },
  { id: 'month', label: 'Mês' },
  { id: 'all', label: 'Tudo' },
];

/** Intervalo [start, end) do período que contém `anchor`; null em "Tudo". */
export function surveyPeriodRange(mode, anchor) {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const day = anchor.getDate();
  if (mode === 'week') {
    const start = new Date(year, month, day - anchor.getDay());
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
    return { start, end };
  }
  if (mode === 'month') {
    return { start: new Date(year, month, 1), end: new Date(year, month + 1, 1) };
  }
  return null;
}

/** Anda `step` semanas/meses. Mês vai sempre pro dia 1: 31/jan + 1 não pula março. */
export function shiftSurveyPeriod(mode, anchor, step) {
  if (mode === 'week') {
    return new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + 7 * step);
  }
  if (mode === 'month') return new Date(anchor.getFullYear(), anchor.getMonth() + step, 1);
  return anchor;
}

function twoDigits(value) {
  return String(value).padStart(2, '0');
}

export function surveyPeriodLabel(mode, anchor) {
  const range = surveyPeriodRange(mode, anchor);
  if (!range) return 'Todas as pesquisas';
  if (mode === 'month') {
    return `${MONTH_LABELS[range.start.getMonth()]} de ${range.start.getFullYear()}`;
  }
  const first = range.start;
  const last = new Date(range.end.getFullYear(), range.end.getMonth(), range.end.getDate() - 1);
  const sameYear = first.getFullYear() === last.getFullYear();
  const firstText = `${twoDigits(first.getDate())}/${twoDigits(first.getMonth() + 1)}${sameYear ? '' : `/${first.getFullYear()}`}`;
  const lastText = `${twoDigits(last.getDate())}/${twoDigits(last.getMonth() + 1)}/${last.getFullYear()}`;
  return `${firstText} a ${lastText}`;
}

/** Período atual ou futuro não tem "próximo": não existe pesquisa enviada lá. */
export function canAdvanceSurveyPeriod(mode, anchor, today) {
  const range = surveyPeriodRange(mode, anchor);
  return Boolean(range) && range.end.getTime() <= today.getTime();
}

export function isInSurveyPeriod(iso, range) {
  if (!range) return true;
  const time = new Date(iso).getTime();
  return time >= range.start.getTime() && time < range.end.getTime();
}

export function surveyStats(surveys) {
  const responded = surveys.filter(item => item.responded_at);
  const rate = surveys.length ? responded.length / surveys.length : 0;
  const avg = responded.length
    ? responded.reduce((sum, item) => sum + item.rating, 0) / responded.length
    : 0;
  return { total: surveys.length, responded: responded.length, rate, avg };
}

function pesquisas(count) {
  return count === 1 ? '1 pesquisa' : `${count} pesquisas`;
}

/**
 * Textos da confirmação de exclusão. Quando alguma já tem nota do
 * paciente, o aviso diz quantas e que a nota e o comentário vão junto
 * (e saem da nota média) — pedido da administradora, que exclui as
 * pesquisas de teste antes de mandar as de verdade.
 */
export function surveyDeletionSummary(surveys) {
  const count = surveys.length;
  const rated = surveys.filter(item => item.responded_at).length;
  let ratedWarning = '';
  if (rated > 0) {
    const plural = rated > 1;
    const who = count === 1
      ? 'O paciente já respondeu esta pesquisa.'
      : rated === count
        ? `Todas as ${count} já têm nota do paciente.`
        : `${rated} ${plural ? 'delas já têm' : 'delas já tem'} nota do paciente.`;
    const what = plural
      ? 'As notas e os comentários serão apagados junto e deixam de contar na nota média.'
      : 'A nota e o comentário serão apagados junto e deixam de contar na nota média.';
    ratedWarning = `${who} ${what}`;
  }
  return {
    count,
    rated,
    title: `Excluir ${pesquisas(count)}?`,
    ratedWarning,
  };
}

export function surveyDeletedMessage(count) {
  return count === 1 ? '1 pesquisa excluída.' : `${count} pesquisas excluídas.`;
}

export function surveySelectionLabel(count) {
  if (!count) return 'Selecionar todas';
  return count === 1 ? '1 selecionada' : `${count} selecionadas`;
}
