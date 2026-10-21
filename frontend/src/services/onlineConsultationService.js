// ============================================================
// Sala online — chamadas do lado de quem atende (com login)
//
// A Edge Function online-consultation confere quem é (JWT, conta ativa,
// senha, dois fatores) e se o atendimento é dela; o "Antes da sessão"
// sai das RPCs e tabelas de sempre, com a RLS de sempre.
// ============================================================

import { supabase } from '../lib/supabase';
import { callOnlineConsultation } from './onlineConsultationPublic';
import { listInstrumentApplications, listMyInstrumentRiskAlerts } from './patientInstrumentService';
import { listPatientEvolutions } from './patientEvolutionService';
import { evolutionEntries, riskAttention, scaleCards, summarizeScalesSince } from '../utils/beforeSession';

export function openOnlineRoom(appointmentId) {
  return callOnlineConsultation({ action: 'staff_open', appointmentId });
}

export function joinOnlineRoom(appointmentId) {
  return callOnlineConsultation({ action: 'staff_join', appointmentId });
}

/** Uso do mês na conta do Daily (participante-minuto). */
export function loadDailyUsage(appointmentId) {
  return callOnlineConsultation({ action: 'staff_usage', appointmentId });
}

/** Link pessoal do paciente (o mesmo da confirmação) e o telefone para o WhatsApp. */
export async function loadPatientLinkInfo(appointmentId, patientId) {
  const [appointment, patient] = await Promise.all([
    supabase.from('appointments').select('confirmation_token').eq('id', appointmentId).maybeSingle(),
    supabase.from('patients').select('phone').eq('id', patientId).maybeSingle(),
  ]);
  return {
    token: appointment.data?.confirmation_token || '',
    phone: patient.data?.phone || '',
  };
}

/**
 * Resumo e aba Escalas: a própria evolução mais nova deste paciente na
 * Psicologia (só a data), as escalas e os alertas de risco ainda não
 * vistos. Cada parte falha sozinha (o quadro mostra traço).
 */
export async function loadBeforeSession({ patientId, professionalId, discipline = 'psicologia' }) {
  const [evolution, applications, alerts] = await Promise.allSettled([
    supabase
      .from('patient_evolutions')
      .select('id,atendimento_em')
      .eq('patient_id', patientId)
      .eq('therapist_id', professionalId)
      .eq('discipline', discipline)
      .eq('attendance_status', 'attended')
      .order('atendimento_em', { ascending: false })
      .limit(1),
    listInstrumentApplications({ patientId, discipline }),
    listMyInstrumentRiskAlerts(),
  ]);

  const evolutionOk = evolution.status === 'fulfilled' && !evolution.value.error;
  const lastEvolutionAt = evolutionOk ? (evolution.value.data?.[0]?.atendimento_em || null) : null;

  return {
    lastEvolution: evolutionOk ? { at: lastEvolutionAt } : { error: true },
    scales: applications.status === 'fulfilled'
      ? { rows: summarizeScalesSince(applications.value, lastEvolutionAt), cards: scaleCards(applications.value) }
      : { error: true },
    attention: alerts.status === 'fulfilled'
      ? { rows: riskAttention(alerts.value, patientId) }
      : { error: true },
  };
}

/**
 * Aba Evoluções: só carrega quando a aba abre. As mesmas evoluções do
 * histórico da tela Evoluções (mesma RPC, mesmo acesso), só para ler:
 * escrever e corrigir ficam na tela Evoluções.
 */
export async function loadSessionEvolutions({ patientId, discipline = 'psicologia' }) {
  return evolutionEntries(await listPatientEvolutions(patientId, discipline));
}
