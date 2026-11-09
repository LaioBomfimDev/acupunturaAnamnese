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
export async function askAssistant({ messages, screen, equipe = [], dados = undefined, dadosAnteriores = [], invoke = (...args) => supabase.functions.invoke(...args) }) {
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
      // ACUP-024: resultados das voltas anteriores, já limpos aqui; a Edge limpa de novo.
      ...(dados !== undefined && dadosAnteriores.length ? { dadosAnteriores } : {}),
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
    ...(dados?.tipo === 'financeiro' || dadosAnteriores.some(item => item?.tipo === 'financeiro') || data.financeiro === true || (messages || []).some(message => message.financeiro === true) ? { financeiro: true } : {}) };
}

let teamCache = null;

// ACUP-024 (AG-6): até 3 consultas por pergunta. Espelho de
// ASSISTANT_MAX_ROUNDS em supabase/functions/clinic-assistant/index.ts.
export const ASSISTANT_MAX_ROUNDS = 3;
export const ASSISTANT_ROUNDS_MESSAGE = 'A assistente faz no máximo 3 consultas por pergunta. Divida a pergunta em partes menores.';

// Mesmo tipo e mesmos filtros = mesma consulta (a ordem das chaves não importa).
function consultaKey(consulta) {
  const item = consulta && typeof consulta === 'object' ? consulta : {};
  return JSON.stringify(Object.keys(item).sort().map(key => [key, item[key]]));
}

/**
 * Pergunta à assistente. Quem decide se precisa de mais um dado é a IA,
 * uma `consulta` por vez; este aparelho busca com o login de quem
 * perguntou e pergunta de novo com os resultados (o mais novo em `dados`,
 * os anteriores em `dadosAnteriores`). Até ASSISTANT_MAX_ROUNDS voltas
 * (antes era uma volta só); a 4ª nunca é pedida. Consulta repetida reusa
 * o resultado já obtido, sem buscar de novo, e conta a volta. Consulta
 * que falha vira resultado com motivo, e as outras seguem.
 * `onStep(etapa, volta)` avisa a tela ("Consultando…").
 */
export async function askAssistantWithTools({ messages, screen, profile, onStep = () => {}, invoke = undefined, tools = null }) {
  const { loadAssistantTeam, runAssistantConsulta } = tools || await import('./assistantTools');
  if (!teamCache) teamCache = await loadAssistantTeam().catch(() => []);
  const equipe = teamCache.map(member => shortName(member.full_name));
  const ask = extra => askAssistant({ messages, screen, equipe, ...(invoke ? { invoke } : {}), ...extra });

  const results = [];
  const seen = new Map();
  let reply = await ask({});
  while (reply.consulta) {
    if (results.length >= ASSISTANT_MAX_ROUNDS) throw new Error(ASSISTANT_ROUNDS_MESSAGE);
    onStep('agenda', results.length + 1);
    const key = consultaKey(reply.consulta);
    let dados = seen.get(key);
    if (!dados) {
      const pedido = reply.consulta;
      dados = await Promise.resolve()
        .then(() => runAssistantConsulta(pedido, { profile, team: teamCache }))
        // Mantém os filtros do pedido (já limpos pela Edge): sem de/ate, o leitor
        // trocava o "erro" por "período inválido" e a IA pedia outro período (QA, 09/11/2026).
        .catch(() => ({ ...pedido, motivo: 'erro' }));
      seen.set(key, dados);
    }
    results.push(dados);
    onStep('thinking', results.length);
    reply = await ask({ dados: results[results.length - 1], dadosAnteriores: results.slice(0, -1) });
  }
  if (!reply.answer) throw new Error('A assistente não conseguiu responder com os dados da clínica agora.');
  return results.some(item => item?.tipo === 'financeiro') ? { ...reply, financeiro: true } : reply;
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
