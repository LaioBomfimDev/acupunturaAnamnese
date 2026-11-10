// ============================================================
// Estado da assistente, um só para o app inteiro: a conversa continua
// igual no cartão da tela inicial e no painel das outras telas.
//
// O App publica em que tela a pessoa está (setAssistantScreen) e
// registra quem sabe trocar de tela (registerAssistantNavigator); os
// atalhos da assistente só pedem a troca. A conversa fica só na memória
// desta aba: sair, recarregar ou trocar de conta começa do zero.
// ============================================================

import { useSyncExternalStore } from 'react';

// O App importa este arquivo direto (tela atual, troca de tela); o
// serviço, que puxa Agenda, escalas e financeiro, só carrega quando a
// assistente aparece.
const loadService = () => import('../../services/clinicAssistantService');

const EMPTY_ATTENTION = { items: [], failed: [], loading: false, loaded: false };

let state = {
  screen: 'inicio',
  open: false,
  messages: [],
  draft: '',
  sending: false,
  // 'thinking' ou 'agenda' (consultando horários vagos), para a tela.
  sendingStep: 'thinking',
  // ACUP-024: volta da consulta (1 a 3), para "Consultando… 2 de 3".
  sendingRound: 0,
  error: '',
  attention: EMPTY_ATTENTION,
  attentionCollapsed: false,
};
const listeners = new Set();
let navigator = null;
let currentProfile = null;

/** Perfil de quem conversa: as consultas usam o login e a agenda dele. */
export function setAssistantProfile(profile) {
  currentProfile = profile || null;
}
let attentionRequest = 0;

function setState(patch) {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
  for (const listener of listeners) listener();
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAssistantState() {
  return useSyncExternalStore(subscribe, () => state);
}

export function setAssistantScreen(screen) {
  if (screen !== state.screen) setState({ screen });
}

export function setAssistantOpen(open) {
  setState({ open });
}

export function setAssistantDraft(draft) {
  setState({ draft });
}

export function toggleAttentionCollapsed() {
  setState(current => ({ attentionCollapsed: !current.attentionCollapsed }));
}

/** O App registra a troca de tela; devolve a função que desfaz. */
export function registerAssistantNavigator(handler) {
  navigator = handler;
  return () => {
    if (navigator === handler) navigator = null;
  };
}

/**
 * Abre a tela (e, na Gestão ou no Financeiro, a aba `section`) pedida por um atalho.
 * ACUP-027: `agendaDraft` abre o Novo agendamento preenchido (a pessoa confere e salva).
 */
export function openScreenFromAssistant(target, section = null, agendaDraft = null) {
  if (!navigator) return;
  setState({ open: false });
  navigator(target, section, agendaDraft);
}

/** ACUP-027: prepara a ação da resposta no aparelho (nada é enviado nem salvo). */
export async function prepareActionFromAssistant(acao) {
  const service = await loadService();
  return service.prepareAssistantAction(acao, { profile: currentProfile });
}

let attentionLoadedAt = 0;

/**
 * Recarrega "Sua atenção hoje" (a resposta mais nova vence). Com `maxAgeMs`,
 * só busca de novo se a última contagem for mais velha que isso: trocar
 * de tela não refaz a conta toda vez.
 */
export async function refreshAttention(role, { maxAgeMs = 0 } = {}) {
  if (maxAgeMs && (state.attention.loading || Date.now() - attentionLoadedAt < maxAgeMs)) return;
  const request = ++attentionRequest;
  attentionLoadedAt = Date.now();
  setState(current => ({ attention: { ...current.attention, loading: true } }));
  try {
    const { loadAttention } = await loadService();
    const result = await loadAttention({ role });
    if (request === attentionRequest) setState({ attention: { ...result, loading: false, loaded: true } });
  } catch {
    if (request === attentionRequest) {
      setState({ attention: { items: [], failed: ['tudo'], loading: false, loaded: true } });
    }
  }
}

export async function sendAssistantMessage(text) {
  const question = String(text ?? state.draft).trim();
  if (!question || state.sending) return;
  const messages = [...state.messages, { role: 'user', text: question }];
  setState({ messages, draft: '', sending: true, sendingStep: 'thinking', sendingRound: 0, error: '' });
  try {
    const { askAssistantWithTools } = await loadService();
    const reply = await askAssistantWithTools({
      messages,
      screen: state.screen,
      profile: currentProfile,
      onStep: (step, round = 0) => setState({ sendingStep: step, sendingRound: round }),
    });
    setState(current => ({
      messages: [...current.messages, { role: 'assistant', text: reply.answer, links: reply.links, ...(reply.financeiro === true ? { financeiro: true } : {}), ...(reply.acao ? { acao: reply.acao } : {}) }],
      sending: false,
    }));
  } catch (error) {
    // A pergunta volta para a caixa: nada do que a pessoa escreveu se perde.
    setState(current => ({
      messages: current.messages.slice(0, -1),
      draft: question,
      sending: false,
      error: error?.message || 'A assistente não conseguiu responder agora.',
    }));
  }
}

/** Troca de conta: começa do zero. */
export function resetAssistant() {
  attentionRequest += 1;
  attentionLoadedAt = 0;
  loadService().then(service => service.resetAssistantTeam()).catch(() => {});
  setState({ open: false, messages: [], draft: '', sending: false, error: '', attention: EMPTY_ATTENTION });
}
