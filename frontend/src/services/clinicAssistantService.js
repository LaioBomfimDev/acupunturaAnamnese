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
import { onlyEvolutionDisciplines } from '../utils/evolutionQueue';
import { buildReceivables, todayInClinic } from '../utils/finance';
import {
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
export async function askAssistant({ messages, screen, invoke = (...args) => supabase.functions.invoke(...args) }) {
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
    body: { messages: recent, screen: ASSISTANT_SCREENS.includes(screen) ? screen : 'inicio' },
  });
  if (error) {
    throw new Error(await getAiFunctionErrorMessage(error, 'A assistente não conseguiu responder agora.'));
  }
  if (!data || typeof data.answer !== 'string') {
    throw new Error('A assistente respondeu num formato inesperado.');
  }
  return { answer: data.answer, links: Array.isArray(data.links) ? data.links : [] };
}

function settledValue(result) {
  return result.status === 'fulfilled' ? result.value : null;
}

/** "Sua atenção hoje" do perfil, cada fonte por conta (allSettled). */
export async function loadAttention({ role, now = new Date() }) {
  const clinical = role !== 'reception';
  const admin = role === 'admin';
  const [risk, evolutions, finance] = await Promise.allSettled([
    clinical ? listMyInstrumentRiskAlerts() : Promise.resolve([]),
    clinical ? listAppointmentsAwaitingEvolution().then(onlyEvolutionDisciplines) : Promise.resolve([]),
    admin ? loadReceivablesData() : Promise.resolve(null),
  ]);
  const financeData = settledValue(finance);
  const receivables = financeData
    ? buildReceivables({ ...financeData, today: todayInClinic(now) }).items
    : null;
  return buildAttentionItems({
    role,
    riskAlerts: settledValue(risk),
    pendingEvolutions: settledValue(evolutions),
    receivables,
    nearEndPackages: financeData ? packagesNearEnd(financeData) : null,
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

/** Teto do mês em dólar; null = sem teto. */
export async function saveAiMonthlyLimit(usd) {
  const { data, error } = await supabase.rpc('clinic_admin_set_ai_limit', { p_usd: usd });
  if (error) throw new Error(error.message || 'Não foi possível salvar o teto.');
  return data;
}
