// ============================================================
// SERVICE: assistente da clínica (30/10/2026, etapa 1).
//
// askAssistant manda as últimas mensagens e a tela atual para a Edge
// Function clinic-assistant. loadAttention conta "Sua atenção hoje" com
// as mesmas funções das telas, sem IA. O uso da IA do mês (Gestão) vem
// de ai_usage_month, já somado no banco.
// ============================================================

import { supabase } from '../lib/supabase';
import { getAiFunctionErrorMessage } from './aiRuntime';
import { listAppointmentsAwaitingEvolution } from './appointmentService';
import { listMyInstrumentRiskAlerts } from './patientInstrumentService';
import { loadReceivablesData } from './financeiroService';
import { operatorReceiptsFrom } from '../utils/tissXml';
import { onlyEvolutionDisciplines } from '../utils/evolutionQueue';
import { buildReceivables, todayInClinic } from '../utils/finance';
import { aiAlertFor, summarizeAiUsage } from '../utils/aiUsage';
import { shortName } from './clinicMembersService';
import {
  ASSISTANT_CONSULTAS,
  ASSISTANT_MAX_MESSAGE_CHARS,
  ASSISTANT_MAX_MESSAGES,
  ASSISTANT_SCREENS,
  buildAttentionItems,
  packagesNearEnd,
} from '../utils/clinicAssistant';

/**
 * Pergunta à assistente. `messages` = [{ role: 'user'|'assistant', text }],
 * a última da pessoa. Devolve { answer, links }.
 */
export async function askAssistant({ messages, screen, equipe = [], dados = undefined, invoke = (...args) => supabase.functions.invoke(...args) }) {
  const recent = (messages || [])
    .filter(message => message?.text?.trim())
    .slice(-ASSISTANT_MAX_MESSAGES)
    .map(message => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      text: message.text.trim().slice(0, ASSISTANT_MAX_MESSAGE_CHARS),
    }));
  // A conversa enviada sempre começa por uma pergunta da pessoa.
  while (recent.length && recent[0].role !== 'user') recent.shift();
  if (!recent.length || recent[recent.length - 1].role !== 'user') {
    throw new Error('Escreva uma pergunta.');
  }

  const { data, error } = await invoke('clinic-assistant', {
    body: {
      messages: recent,
      screen: ASSISTANT_SCREENS.includes(screen) ? screen : 'inicio',
      equipe,
      ...((messages || []).some(message => message.financeiro === true) ? { financeiroContexto: true } : {}),
      ...(dados === undefined ? {} : { dados }),
    },
  });
  if (error) {
    throw new Error(await getAiFunctionErrorMessage(error, 'A assistente não conseguiu responder agora.'));
  }
  if (data?.consulta && ASSISTANT_CONSULTAS.includes(data.consulta.tipo)) {
    return { answer: '', links: [], consulta: data.consulta };
  }
  if (!data || typeof data.answer !== 'string') {
    throw new Error('A assistente respondeu num formato inesperado.');
  }
  return { answer: data.answer, links: Array.isArray(data.links) ? data.links : [], consulta: null,
    ...(dados?.tipo === 'financeiro' || data.financeiro === true || (messages || []).some(message => message.financeiro === true) ? { financeiro: true } : {}) };
}

let teamCache = null;

/**
 * Pergunta à assistente e, se ela pedir uma consulta (horários vagos),
 * faz a consulta neste aparelho e pergunta de novo com o resultado. Uma
 * volta só. `onStep` avisa a tela ("Consultando a agenda…").
 */
export async function askAssistantWithTools({ messages, screen, profile, onStep = () => {} }) {
  const { loadAssistantTeam, runAssistantConsulta } = await import('./assistantTools');
  if (!teamCache) teamCache = await loadAssistantTeam().catch(() => []);
  const equipe = teamCache.map(member => shortName(member.full_name));

  const first = await askAssistant({ messages, screen, equipe });
  if (!first.consulta) return first;

  onStep('agenda');
  const dados = await runAssistantConsulta(first.consulta, { profile, team: teamCache });
  onStep('thinking');
  const second = await askAssistant({ messages, screen, equipe, dados });
  if (second.consulta || !second.answer) throw new Error('A assistente não conseguiu responder com a agenda agora.');
  return second;
}

/** Troca de conta: a equipe da próxima pessoa pode ser outra. */
export function resetAssistantTeam() {
  teamCache = null;
}

function settledValue(result) {
  return result.status === 'fulfilled' ? result.value : null;
}

/** "Sua atenção hoje" do perfil, cada fonte por conta (allSettled). */
export async function loadAttention({ role, now = new Date() }) {
  const clinical = role !== 'reception';
  const admin = role === 'admin';
  const [risk, evolutions, finance, aiUsage] = await Promise.allSettled([
    clinical ? listMyInstrumentRiskAlerts() : Promise.resolve([]),
    clinical ? listAppointmentsAwaitingEvolution().then(onlyEvolutionDisciplines) : Promise.resolve([]),
    admin ? loadReceivablesData() : Promise.resolve(null),
    admin ? loadAiUsageMonth() : Promise.resolve(null),
  ]);
  const aiRows = settledValue(aiUsage);
  const financeData = settledValue(finance);
  const receivables = financeData
    ? buildReceivables({
      ...financeData,
      // Dinheiro da operadora conta como recebido (Fase 2 do convênio).
      receipts: [...financeData.receipts, ...operatorReceiptsFrom(financeData.tissPaid)],
      today: todayInClinic(now),
    }).items
    : null;
  return buildAttentionItems({
    role,
    riskAlerts: settledValue(risk),
    pendingEvolutions: settledValue(evolutions),
    receivables,
    nearEndPackages: financeData ? packagesNearEnd(financeData) : null,
    aiAlert: admin ? (aiRows ? aiAlertFor(summarizeAiUsage(aiRows).limitShare) || false : null) : undefined,
  });
}

/** Uso da IA no mês (só a administração; o banco confere). */
export async function loadAiUsageMonth() {
  const { data, error } = await supabase.rpc('ai_usage_month');
  if (error) {
    if (/ai_usage_month/.test(error.message || '') && /does not exist|not find/i.test(error.message || '')) {
      throw new Error('O registro de uso da IA ainda não foi instalado no banco (migration 20261030_ai_usage).');
    }
    throw new Error(error.message || 'Não foi possível carregar o uso da IA.');
  }
  return data || [];
}

/** SuperAdm: uso do mês de todas as instituições (o banco confere o papel). */
export async function loadAiUsageOverview() {
  const { data, error } = await supabase.rpc('superadmin_ai_usage_overview');
  if (error) throw new Error(error.message || 'Não foi possível carregar o uso de IA das instituições.');
  return data || [];
}

/** SuperAdm: cada ação de IA do mês (quem, quando, função, tokens). */
export async function loadAiUsageEvents() {
  const { data, error } = await supabase.rpc('superadmin_ai_usage_events');
  if (error) throw new Error(error.message || 'Não foi possível carregar o uso de IA por pessoa.');
  return data || [];
}

/** SuperAdm: teto do mês de uma instituição em dólar; null = sem teto. */
export async function saveClinicAiLimit(clinicId, usd) {
  const { data, error } = await supabase.rpc('superadmin_set_ai_limit', { p_clinic: clinicId, p_usd: usd });
  if (error) throw new Error(error.message || 'Não foi possível salvar o teto.');
  return data;
}
