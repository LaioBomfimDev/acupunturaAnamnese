// ============================================================
// Resumo da Gestão (opção B, 10/10/2026): um quadro por aba com o
// número que mais importa nela, e o mesmo número ao lado do nome no
// menu. Aqui só a conta, sobre listas que os services já devolvem —
// o que entra em cada número é o mesmo critério da aba.
//
// Cada quadro devolve { value, line, tone }: `value` null = não deu
// para carregar (a tela mostra um traço, nunca zero), `tone` 'danger'
// (falta sem aviso), 'warning' (retorno atrasado) ou ''.
// ============================================================

import { isHeldOrScheduledAppointment } from './gestaoDashboard.js';
import { surveyPeriodRange } from './gestaoSurveys.js';
import { sendsTabSummary } from './patientForms.js';

export const SUMMARY_MISSED_DAYS = 30;
export const SUMMARY_RETURN_DAYS = 30;

function startOfDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** Intervalo único para buscar a Agenda uma vez só: o mês corrente e os últimos 30 dias. */
export function summaryAppointmentRange(now = new Date()) {
  const month = surveyPeriodRange('month', now);
  const missedFrom = startOfDay(now);
  missedFrom.setDate(missedFrom.getDate() - SUMMARY_MISSED_DAYS);
  const from = missedFrom < month.start ? missedFrom : month.start;
  return { from, to: month.end, month, missedFrom };
}

function monthName(now) {
  return new Date(now).toLocaleDateString('pt-BR', { month: 'long' });
}

function inRange(iso, start, end) {
  const date = new Date(iso);
  return date >= start && date < end;
}

function indicadoresTile(appointments, now) {
  if (!appointments) return { value: null, line: 'não deu para carregar a Agenda', tone: '' };
  const { month } = summaryAppointmentRange(now);
  const count = appointments
    .filter(item => isHeldOrScheduledAppointment(item) && inRange(item.starts_at, month.start, month.end))
    .length;
  return { value: count, line: `${count === 1 ? 'atendimento' : 'atendimentos'} em ${monthName(now)}, sem contar faltas`, tone: '' };
}

function faltososTile(appointments, now) {
  if (!appointments) return { value: null, line: 'não deu para carregar a Agenda', tone: '' };
  const { missedFrom } = summaryAppointmentRange(now);
  const missed = appointments.filter(item => (
    item.kind === 'appointment'
    && (item.status === 'no_show' || item.status === 'excused')
    && new Date(item.starts_at) >= missedFrom
    && new Date(item.starts_at) <= now
  ));
  const noShow = missed.filter(item => item.status === 'no_show').length;
  if (!missed.length) return { value: 0, line: `nenhuma falta nos últimos ${SUMMARY_MISSED_DAYS} dias`, tone: '' };
  return {
    value: missed.length,
    line: noShow
      ? `${noShow} sem aviso nos últimos ${SUMMARY_MISSED_DAYS} dias`
      : `todas com aviso, nos últimos ${SUMMARY_MISSED_DAYS} dias`,
    tone: noShow ? 'danger' : '',
  };
}

function retornosTile(returns) {
  if (!returns) return { value: null, line: 'não deu para carregar os retornos', tone: '' };
  const count = returns.length;
  return {
    value: count,
    line: count
      ? `há mais de ${SUMMARY_RETURN_DAYS} dias sem voltar`
      : `ninguém há mais de ${SUMMARY_RETURN_DAYS} dias sem voltar`,
    tone: count ? 'warning' : '',
  };
}

export function formatRating(avg) {
  return avg.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function pesquisaTile(surveys, now) {
  if (!surveys) return { value: null, line: 'não deu para carregar as pesquisas', tone: '' };
  const responded = surveys.filter(item => item.responded_at);
  const waiting = surveys.filter(item => (
    !item.responded_at && (!item.expires_at || new Date(item.expires_at) >= now)
  )).length;
  const waitingText = `${waiting} aguardando resposta`;
  if (!responded.length) {
    return { value: null, display: '–', line: `sem nota em ${monthName(now)} · ${waitingText}`, tone: '' };
  }
  const avg = responded.reduce((sum, item) => sum + Number(item.rating || 0), 0) / responded.length;
  return { value: avg, display: formatRating(avg), line: `nota média em ${monthName(now)} · ${waitingText}`, tone: '' };
}

function importaveisTile(assignments, now) {
  if (!assignments) return { value: null, line: 'não deu para carregar os envios', tone: '' };
  const summary = sendsTabSummary(assignments, now);
  return { value: summary.count, line: summary.count ? summary.hint : 'nenhum formulário enviado ainda', tone: '' };
}

function profissionaisTile(members) {
  if (!members) return { value: null, line: 'não deu para carregar a equipe', tone: '' };
  const attending = members.filter(member => member.has_agenda !== false).length;
  return { value: members.length, line: `${attending} ${attending === 1 ? 'atende' : 'atendem'} na Agenda`, tone: '' };
}

function acessosTile(logs, now) {
  if (!logs) return { value: null, line: 'não deu para carregar os acessos', tone: '' };
  const today = startOfDay(now);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const count = logs.filter(item => inRange(item.created_at, today, tomorrow)).length;
  return { value: count, line: count === 1 ? 'entrada no sistema hoje' : 'entradas no sistema hoje', tone: '' };
}

/**
 * Quadros do Resumo a partir das listas carregadas. Lista ausente
 * (`null`/`undefined`) = aquela busca falhou: só o quadro dela fica sem
 * número.
 */
export function buildGestaoSummary({
  appointments = null,
  returns = null,
  surveys = null,
  assignments = null,
  members = null,
  accessLogs = null,
  now = new Date(),
} = {}) {
  return {
    indicadores: indicadoresTile(appointments, now),
    faltosos: faltososTile(appointments, now),
    retornos: retornosTile(returns),
    pesquisa: pesquisaTile(surveys, now),
    importaveis: importaveisTile(assignments, now),
    profissionais: profissionaisTile(members),
    acessos: acessosTile(accessLogs, now),
    documentos: { value: null, display: '', line: 'Escrever no papel da instituição', tone: '' },
  };
}

/** Texto do número no quadro e no menu: traço quando não há número. */
export function summaryDisplay(tile) {
  if (!tile) return '–';
  if (tile.display !== undefined) return tile.display;
  return tile.value == null ? '–' : String(tile.value);
}
