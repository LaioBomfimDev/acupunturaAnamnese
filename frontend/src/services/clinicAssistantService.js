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
  PATIENT_CONSULTAS,
  buildAttentionItems,
  createRefRegistry,
  firstNameOf,
  readAssistantAction,
  AGENDA_TYPE_LABELS,
  packagesNearEnd,
} from '../utils/clinicAssistant';

// FIN-3/6 e AG-3 (ACUP-025): marcador de resposta PROTEGIDA = "com dinheiro OU com
// paciente". O nome 'financeiro' fica por compatibilidade com as notas já gravadas
// (Corrigir guarda só a nota, só da autora, nunca aprovada).
export const PROTECTED_CORRECTION_KEY = 'financeiro';
const PROTECTED_TIPOS = ['financeiro', ...PATIENT_CONSULTAS];
const isProtected = item => PROTECTED_TIPOS.includes(item?.tipo);

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
  // ACUP-027: no máximo uma ação, limpa de novo aqui (lista fechada).
  const acao = readAssistantAction(data.acao, { team: equipe });
  return { answer: data.answer, links: Array.isArray(data.links) ? data.links : [], consulta: null, ...(acao ? { acao } : {}),
    ...(dados?.tipo === 'financeiro' || isProtected(dados) || dadosAnteriores.some(isProtected) || data.financeiro === true || (messages || []).some(message => message.financeiro === true) ? { financeiro: true } : {}) };
}

let teamCache = null;
// ACUP-027: ref → atendimento desta conversa, só na memória da aba (nunca vai ao prompt como id).
let conversationRefs = createRefRegistry();

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
export async function askAssistantWithTools({ messages, screen, profile, onStep = () => {}, invoke = undefined, tools = null, refs = conversationRefs }) {
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
        .then(() => runAssistantConsulta(pedido, { profile, team: teamCache, refs }))
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
  return results.some(isProtected) ? { ...reply, [PROTECTED_CORRECTION_KEY]: true } : reply;
}

/** Troca de conta: a equipe da próxima pessoa pode ser outra; os refs da conversa somem. */
export function resetAssistantTeam() {
  teamCache = null;
  conversationRefs = createRefRegistry();
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

// ============================================================
// ACUP-027 (AG-4, AG-10): prepara a ação no aparelho, a partir da tabela da
// conversa e do login, nunca do texto da IA. Nada é enviado nem gravado:
// devolve um link wa.me (a pessoa toca em Enviar) ou um rascunho para o
// "Novo agendamento" (a pessoa confere e salva).
// ============================================================
const ACTION_MISSING = 'Não encontrei esse atendimento nesta conversa. Peça de novo a agenda e a ação.';

function dayBounds(startsAt) {
  const date = new Date(startsAt);
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return { from: start.toISOString(), to: new Date(start.getTime() + 86_400_000 - 1).toISOString() };
}

export async function prepareAssistantAction(acao, { profile, refs = conversationRefs, deps = null } = {}) {
  const entry = refs.resolve(acao?.ref);
  if (!acao || !entry) return { kind: 'motivo', text: ACTION_MISSING };
  const load = deps || await (async () => {
    const [appointments, patientsService, members, settings, messages, whatsapp, types] = await Promise.all([
      import('./appointmentService'), import('./clinicPatientsService'), import('./clinicMembersService'),
      import('./agendaSettingsService'), import('../utils/agendaMessages'), import('../utils/whatsapp'), import('../utils/appointmentTypes'),
    ]);
    return {
      listPendingConfirmations: appointments.listPendingConfirmations,
      listClinicPatients: patientsService.listClinicPatients,
      listClinicMembers: members.listClinicMembers,
      loadAgendaSettings: settings.loadAgendaSettings,
      buildConfirmationMessage: messages.buildConfirmationMessage,
      buildWhatsAppLink: whatsapp.buildWhatsAppLink,
      isLikelyValidWhatsAppPhone: whatsapp.isLikelyValidWhatsAppPhone,
      appointmentTypes: types,
      origin: window.location.origin,
    };
  })();
  try {
    const patients = await load.listClinicPatients();
    const patient = patients.find(row => row.id === entry.patientId);
    if (!patient) return { kind: 'motivo', text: ACTION_MISSING };
    const first = firstNameOf(patient.name);

    if (acao.tipo === 'confirmacao') {
      const { from, to } = dayBounds(entry.startsAt);
      const pending = (await load.listPendingConfirmations({ from, to, professionalId: entry.professionalId }))
        .find(row => row.id === entry.appointmentId);
      if (!pending) return { kind: 'motivo', text: 'Este atendimento não está esperando confirmação.' };
      if (!pending.confirmation_token) return { kind: 'motivo', text: 'Este atendimento ainda não tem link de confirmação.' };
      if (!load.isLikelyValidWhatsAppPhone(patient.phone)) return { kind: 'motivo', text: `O cadastro de ${first} não tem um WhatsApp válido.` };
      const members = await load.listClinicMembers();
      const member = members.find(row => row.id === pending.professional_id);
      const settings = await load.loadAgendaSettings(profile?.clinic_id).catch(() => null);
      const message = load.buildConfirmationMessage({
        appointment: pending,
        patientName: patient.name,
        professionalName: member ? shortName(member.full_name) : 'o profissional',
        clinicName: profile?.clinic?.name || profile?.clinic_name || '',
        clinicAddress: profile?.clinic?.address || '',
        agendaSettings: settings?.settings || null,
        origin: load.origin,
      });
      return { kind: 'whatsapp', href: load.buildWhatsAppLink({ phone: patient.phone, message }), label: `Abrir o WhatsApp com a confirmação para ${first} (você toca em Enviar)` };
    }

    if (acao.tipo === 'novo_agendamento') {
      const members = await load.listClinicMembers();
      const member = acao.profissional ? members.find(row => shortName(row.full_name) === acao.profissional) : null;
      const { SERVICES_BY_AREA, APPOINTMENT_TYPES, isTypeAllowedInArea } = load.appointmentTypes;
      const byLabel = [...(SERVICES_BY_AREA[entry.discipline] || []), ...APPOINTMENT_TYPES].find(item => item.label === acao.tipo_atendimento);
      const type = byLabel && isTypeAllowedInArea(entry.discipline, byLabel.id) && AGENDA_TYPE_LABELS.includes(acao.tipo_atendimento) ? byLabel.id : '';
      const draft = {
        patientId: patient.id,
        // O campo Paciente mostra o texto da busca: o nome vai junto (fica no aparelho).
        patientName: patient.name,
        discipline: entry.discipline || '',
        professionalId: member?.id || '',
        date: acao.dia || '',
        time: acao.hora || '',
        appointmentType: type,
      };
      return { kind: 'agenda', draft, label: `Abrir Novo agendamento preenchido para ${first} (você confere e salva)` };
    }
    return { kind: 'motivo', text: ACTION_MISSING };
  } catch {
    return { kind: 'motivo', text: 'Não foi possível preparar a ação agora. Faça pela Agenda.' };
  }
}
