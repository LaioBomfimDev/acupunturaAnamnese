// ============================================================
// "Antes da sessão" da sala online (prévia C, 20/10/2026): o que mudou
// desde a última evolução, tirado do que o sistema já guarda. Sem texto
// clínico: data da evolução, nota e faixa das escalas e alerta de risco
// ainda não visto. Lembra, nunca decide.
// ============================================================

import { getInstrument } from '../data/clinicalInstruments';
import {
  formatInstrumentDate,
  formatScore,
  scoreTrend,
  scoreViews,
  validApplications,
} from '../components/instruments/instrumentFormat';

const SOURCE_LABELS = {
  area_do_paciente: 'Área do Paciente',
  consultorio: 'Consultório',
};

const TREND_LABELS = {
  up: '▲ subiu',
  down: '▼ desceu',
  same: '= igual',
};

function firstView(instrument, application) {
  const view = scoreViews(instrument)[0];
  return view ? view.read(application.result) : { score: null, bandLabel: null };
}

/**
 * Escalas respondidas desde `since` (ISO; null = todas), uma linha por
 * escala com a aplicação mais nova: nota, faixa e a direção em relação à
 * aplicação anterior da mesma escala.
 */
export function summarizeScalesSince(applications, since = null) {
  const sinceTime = since ? Date.parse(since) : -Infinity;
  const byInstrument = new Map();
  for (const application of validApplications(applications || [])) {
    const list = byInstrument.get(application.instrumentId) || [];
    list.push(application);
    byInstrument.set(application.instrumentId, list);
  }

  const rows = [];
  for (const [instrumentId, list] of byInstrument) {
    list.sort((a, b) => Date.parse(b.appliedAt) - Date.parse(a.appliedAt));
    const [latest, previous] = list;
    if (!(Date.parse(latest.appliedAt) > sinceTime)) continue;
    const instrument = getInstrument(instrumentId, latest.instrumentVersion);
    if (!instrument) continue;
    const current = firstView(instrument, latest);
    const before = previous ? firstView(instrument, previous) : null;
    const trend = before ? scoreTrend(current.score, before.score) : null;
    rows.push({
      id: latest.id,
      instrumentId,
      name: instrument.shortName,
      score: formatScore(current.score),
      bandLabel: current.bandLabel || '',
      trend: trend ? TREND_LABELS[trend.direction] : '',
      trendLabel: trend?.label || '',
      appliedAt: latest.appliedAt,
      when: `${SOURCE_LABELS[latest.source] || 'Aplicada'} · ${formatInstrumentDate(latest.appliedAt, { short: true })}`,
    });
  }
  return rows.sort((a, b) => Date.parse(b.appliedAt) - Date.parse(a.appliedAt));
}

/** Alertas de risco ainda não vistos deste paciente, na linguagem do "Pede atenção". */
export function riskAttention(alerts, patientId) {
  return (alerts || [])
    .filter(alert => alert.patientId === patientId)
    .map(alert => {
      const instrument = getInstrument(alert.instrumentId);
      const where = instrument
        ? `${instrument.article === 'a' ? 'na' : 'no'} ${instrument.shortName}`
        : 'numa escala';
      return {
        id: alert.applicationId,
        instrumentId: alert.instrumentId,
        label: `Risco ${where} ainda não visto (${formatInstrumentDate(alert.appliedAt, { short: true })})`,
      };
    });
}
