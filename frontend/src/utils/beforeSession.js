// ============================================================
// Coluna da esquerda da sala online (prévia C de 20/10/2026 e abas da
// prévia A de 21/10/2026): Resumo (o que mudou desde a última evolução),
// Escalas e Evoluções, para consulta rápida sem sair da chamada.
// Evolução aqui é só leitura: escrever e corrigir continuam na tela
// Evoluções. Lembra, nunca decide.
// ============================================================

import { getInstrument } from '../data/clinicalInstruments';
import {
  applicationDates,
  formatInstrumentDate,
  formatScore,
  reapplyStatus,
  scoreTrend,
  scoreViews,
  validApplications,
} from '../components/instruments/instrumentFormat';
import { mergeEvolutionHistory } from './evolutionHistory';

const SOURCE_LABELS = {
  area_do_paciente: 'Área do Paciente',
  consultorio: 'Consultório',
};

const TREND_LABELS = {
  up: '▲ subiu',
  down: '▼ desceu',
  same: '= igual',
};

// Reaplicações mostradas no cartão; as mais antigas viram "+N".
const SHOWN_REAPPLIED = 2;

/**
 * Nota de uma aplicação como a tela Escalas mostra: total com faixa, ou
 * uma nota por subescala (DASS-21), nunca uma subescala com cara de total.
 */
export function scoreSummary(instrument, result) {
  const views = scoreViews(instrument);
  const reads = views.map(view => ({ view, ...view.read(result) }));
  const total = reads[0]?.view.id === 'total' || reads.length === 1 ? reads[0] : null;
  return {
    total: total ? { score: total.score, text: formatScore(total.score), bandLabel: total.bandLabel || '' } : null,
    parts: total ? [] : reads.map(item => ({
      id: item.view.id,
      short: item.view.short,
      label: item.view.label,
      text: formatScore(item.score),
      bandLabel: item.bandLabel || '',
    })),
  };
}

function scoreText(summary) {
  if (summary.total) return summary.total.bandLabel ? `${summary.total.text} · ${summary.total.bandLabel}` : summary.total.text;
  return summary.parts.map(part => `${part.short} ${part.text}`).join(' · ');
}

function groupByInstrument(applications) {
  const byInstrument = new Map();
  for (const application of validApplications(applications || [])) {
    const list = byInstrument.get(application.instrumentId) || [];
    list.push(application);
    byInstrument.set(application.instrumentId, list);
  }
  for (const list of byInstrument.values()) {
    list.sort((a, b) => Date.parse(b.appliedAt) - Date.parse(a.appliedAt));
  }
  return byInstrument;
}

/**
 * Escalas respondidas desde `since` (ISO; null = todas), uma linha por
 * escala com a aplicação mais nova: nota, faixa e a direção em relação à
 * aplicação anterior da mesma escala.
 */
export function summarizeScalesSince(applications, since = null) {
  const sinceTime = since ? Date.parse(since) : -Infinity;
  const rows = [];
  for (const [instrumentId, list] of groupByInstrument(applications)) {
    const [latest, previous] = list;
    if (!(Date.parse(latest.appliedAt) > sinceTime)) continue;
    const instrument = getInstrument(instrumentId, latest.instrumentVersion);
    if (!instrument) continue;
    const current = scoreSummary(instrument, latest.result);
    const before = previous ? scoreSummary(instrument, previous.result) : null;
    const trend = current.total && before?.total ? scoreTrend(current.total.score, before.total.score) : null;
    rows.push({
      id: latest.id,
      instrumentId,
      name: instrument.shortName,
      score: current.total ? current.total.text : scoreText(current),
      bandLabel: current.total?.bandLabel || '',
      trend: trend ? TREND_LABELS[trend.direction] : '',
      trendLabel: trend?.label || '',
      appliedAt: latest.appliedAt,
      when: `${SOURCE_LABELS[latest.source] || 'Aplicada'} · ${formatInstrumentDate(latest.appliedAt, { short: true })}`,
    });
  }
  return rows.sort((a, b) => Date.parse(b.appliedAt) - Date.parse(a.appliedAt));
}

/**
 * Cartões da aba Escalas: o mesmo que o cartão fechado da tela Escalas
 * (nota, faixa, seta, linha pequena, datas e quando reaplicar), da escala
 * aplicada mais recentemente para a mais antiga.
 */
export function scaleCards(applications, now = new Date()) {
  const cards = [];
  for (const [instrumentId, list] of groupByInstrument(applications)) {
    const [latest, previous] = list;
    const instrument = getInstrument(instrumentId, latest.instrumentVersion);
    if (!instrument) continue;
    const current = scoreSummary(instrument, latest.result);
    const before = previous ? scoreSummary(instrument, previous.result) : null;
    const trend = current.total && before?.total ? scoreTrend(current.total.score, before.total.score) : null;
    const dates = applicationDates(list);
    const reapplied = dates.reapplied.slice(-SHOWN_REAPPLIED);
    const views = scoreViews(instrument);
    const reapply = reapplyStatus(latest.appliedAt, instrument.reapplyAfterDays, now);
    cards.push({
      id: instrumentId,
      name: instrument.shortName,
      total: current.total,
      parts: current.parts,
      noBands: Boolean(instrument.noBands),
      trend: trend ? TREND_LABELS[trend.direction] : '',
      trendLabel: trend?.label || '',
      // Linha pequena só com nota total (na DASS-21 seria de uma subescala sem dizer qual).
      spark: views[0]?.id === 'total' || views.length === 1
        ? {
          values: list.slice().reverse().map(app => views[0].read(app.result).score).filter(value => typeof value === 'number'),
          min: views[0].scoring?.min ?? 0,
          max: views[0].scoring?.max ?? 0,
        }
        : null,
      first: formatInstrumentDate(dates.first),
      reapplied: reapplied.map(date => formatInstrumentDate(date)),
      hiddenReapplied: Math.max(0, dates.reapplied.length - reapplied.length),
      count: dates.count,
      source: SOURCE_LABELS[latest.source] || '',
      reapplyFrom: reapply.tooSoon ? formatInstrumentDate(reapply.availableFrom) : '',
      appliedAt: latest.appliedAt,
    });
  }
  return cards.sort((a, b) => Date.parse(b.appliedAt) - Date.parse(a.appliedAt));
}

/** Pontos da linha pequena, no quadro de 100 × 28 (margem de 2 em volta). */
export function sparkPoints(spark) {
  if (!spark || spark.values.length < 2) return '';
  const span = spark.max - spark.min || 1;
  const step = 96 / (spark.values.length - 1);
  return spark.values
    .map(value => Math.min(spark.max, Math.max(spark.min, value)))
    .map((value, index) => `${Math.round(2 + index * step)},${Math.round(26 - ((value - spark.min) / span) * 24)}`)
    .join(' ');
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

// Campos da evolução da Psicologia, com os rótulos do formulário
// (components/psychology/PsychologyEvolucao.jsx).
const EVOLUTION_FIELDS = [
  ['temas', 'Temas trabalhados na sessão'],
  ['intervencoes', 'Intervenções registradas'],
  ['resposta', 'Resposta percebida'],
  ['riscoReavaliado', 'Risco reavaliado / conduta'],
  ['acordos', 'Acordos da sessão'],
  ['proximosPassos', 'Próximos passos'],
  ['obs', 'Observações'],
];

const ATTENDANCE_LABELS = {
  attended: 'Atendido',
  no_show: 'Não compareceu',
  excused: 'Cancelado pelo paciente',
};

/**
 * Evoluções deste paciente na área (as mesmas que o histórico da tela
 * Evoluções mostra, pela mesma RPC), da mais nova para a mais antiga,
 * para ler na sala. Só leitura.
 */
export function evolutionEntries(rows) {
  return mergeEvolutionHistory([], rows || [])
    .slice()
    .reverse()
    .map(entry => {
      const absent = entry.attendanceStatus && entry.attendanceStatus !== 'attended';
      const text = value => (typeof value === 'string' ? value.trim() : '');
      return {
        id: entry.id,
        date: formatInstrumentDate(entry.atendimentoEm),
        status: ATTENDANCE_LABELS[entry.attendanceStatus] || 'Atendido',
        absent: Boolean(absent),
        note: absent ? text(entry.observacao) || text(entry.obs) : '',
        fields: absent ? [] : EVOLUTION_FIELDS
          .map(([key, label]) => ({ key, label, value: text(entry[key]) }))
          .filter(field => field.value),
      };
    });
}
