// ============================================================
// "Pede atenção" do menu das áreas (opção C, 10/10/2026)
//
// Bloco no topo do menu lateral com o que precisa de ação para o
// paciente aberto, cada linha um atalho para a parte certa; o menu
// repete um ponto da mesma cor no item. Três tons, do mais forte ao
// mais fraco:
//   risk  → alerta de risco ainda não visto (vermelho);
//   open  → pergunta em aberto, falta responder (âmbar);
//   todo  → parte incompleta (cinza).
// Aqui só se monta o que cada área já sabe; nada decide conduta: o
// bloco lembra, quem atende decide.
// ============================================================

import { summarizeRoute } from './formRoute.js';

export const ATTENTION_TONES = ['risk', 'open', 'todo'];

export const ATTENTION_TONE_LABELS = {
  risk: 'risco não visto',
  open: 'em aberto',
  todo: 'incompleto',
};

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

function shortDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

/**
 * Alertas de risco ainda não vistos deste paciente nesta área
 * (list_my_instrument_risk_alerts, os mesmos da tela inicial).
 * `alerts === null` = não deu para conferir: avisa em vez de calar.
 */
export function riskAttention(alerts, { patientId, discipline, tab, instrumentLabel = id => id }) {
  if (alerts === null) {
    return [{
      id: 'risk-unchecked',
      tone: 'todo',
      title: 'Não deu para conferir os alertas de risco',
      hint: `Abra ${tab} para ver as aplicações`,
      tab,
    }];
  }
  const mine = (alerts || []).filter(alert => alert.patientId === patientId && alert.discipline === discipline);
  if (!mine.length) return [];
  const names = [...new Set(mine.map(alert => instrumentLabel(alert.instrumentId)))];
  const fromHome = mine.some(alert => alert.source === 'area_do_paciente');
  const latest = mine.map(alert => alert.appliedAt).filter(Boolean).sort().pop();
  return [{
    id: 'risk',
    tone: 'risk',
    title: mine.length === 1
      ? `Risco não visto no ${names[0]}`
      : `${mine.length} alertas de risco não vistos`,
    // Curto: a lateral tem 268px. "Escalas · em casa, 09/10".
    hint: `${tab}${latest ? ` · ${fromHome ? 'em casa, ' : ''}${shortDate(latest)}` : ''}`,
    tab,
  }];
}

/** Perguntas complementares sem resposta (session.complementaryQuestions). */
export function openQuestionsAttention(questions, { tab }) {
  const list = Array.isArray(questions) ? questions : [];
  const open = list.filter(item => !String(item?.answer || '').trim()).length;
  if (!open) return [];
  return [{
    id: 'open-questions',
    tone: 'open',
    title: `${plural(open, 'pergunta', 'perguntas')} em aberto`,
    hint: tab,
    tab,
  }];
}

/**
 * Parte com roteiro incompleto (utils/formRoute): "Faltam 14 itens da
 * anamnese". `route === null` = percurso ainda não escolhido.
 */
export function routeAttention(route, { id, tab, partLabel, chooseHint = '', chooseTab = tab }) {
  if (route === null) {
    if (!chooseHint) return [];
    return [{ id: `${id}-choose`, tone: 'todo', title: chooseHint, hint: chooseTab, tab: chooseTab }];
  }
  const { done, total } = summarizeRoute(route);
  if (!total || done >= total) return [];
  const missing = total - done;
  return [{
    id,
    tone: 'todo',
    title: `${missing === 1 ? 'Falta 1 item' : `Faltam ${missing} itens`} ${partLabel}`,
    hint: `${tab} · ${done} de ${total}`,
    tab,
  }];
}

/** Junta as listas na ordem dos tons (risco primeiro). */
export function sortAttention(...lists) {
  return lists
    .flat()
    .filter(Boolean)
    .sort((a, b) => ATTENTION_TONES.indexOf(a.tone) - ATTENTION_TONES.indexOf(b.tone));
}

/** Tom mais forte de cada aba, para o ponto ao lado do nome no menu. */
export function attentionTonesByTab(items) {
  const tones = {};
  for (const item of items || []) {
    const current = tones[item.tab];
    if (!current || ATTENTION_TONES.indexOf(item.tone) < ATTENTION_TONES.indexOf(current)) {
      tones[item.tab] = item.tone;
    }
  }
  return tones;
}
