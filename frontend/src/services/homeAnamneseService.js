// ============================================================
// SERVICE: Anamnese para responder em casa (Área do Paciente)
// Migração: supabase/migrations/20261016c_home_anamnese.sql
//
// O envio leva só o modelo (id): as perguntas saem do banco
// (home_anamnese_templates), nunca daqui. Envia, lista e cancela quem
// atende o paciente na área e a administração; as respostas só voltam
// depois que o paciente envia. Sem fallback local: é dado clínico
// (AGENTS.md §9).
// ============================================================

import { supabase } from '../lib/supabase';

export const HOME_ANAMNESE_MIGRATION_HINT =
  'O envio da anamnese para casa ainda não existe no banco. Aplique a migração '
  + 'supabase/migrations/20261016c_home_anamnese.sql no Supabase.';

export function isMissingHomeAnamneseSchema(error) {
  const text = [error?.message, error?.details, error?.hint, error?.code].filter(Boolean).join(' ');
  return /anamnese_request|portal_send_anamnese|home_anamnese/.test(text)
    && /does not exist|schema cache|Could not find|PGRST202/i.test(text);
}

function fail(error, fallback) {
  if (isMissingHomeAnamneseSchema(error)) throw new Error(HOME_ANAMNESE_MIGRATION_HINT);
  throw new Error(error?.message || fallback);
}

/** Linha da RPC → objeto da tela. */
export function mapHomeAnamneseRow(row) {
  return {
    id: row.result_id,
    anamneseId: row.result_anamnese_id,
    anamneseVersion: Number(row.result_anamnese_version) || 1,
    title: row.result_title || '',
    status: row.result_status,
    progress: Number(row.result_progress) || 0,
    dueDate: row.result_due_date || null,
    sentAt: row.result_sent_at,
    submittedAt: row.result_submitted_at || null,
    cancelledAt: row.result_cancelled_at || null,
    sentByName: row.result_sent_by_name || '',
    questions: Array.isArray(row.result_questions) ? row.result_questions : [],
    answers: row.result_answers && typeof row.result_answers === 'object' ? row.result_answers : null,
  };
}

export async function listHomeAnamneseRequests({ patientId, discipline }) {
  if (!patientId || !discipline) return [];
  const { data, error } = await supabase.rpc('list_patient_anamnese_requests', {
    p_patient_id: patientId,
    p_discipline: discipline,
  });
  if (error) fail(error, 'Não foi possível carregar as anamneses enviadas para casa.');
  return (data || []).map(mapHomeAnamneseRow);
}

export async function sendHomeAnamnese({ patientId, anamneseId, dueDate = null }) {
  if (!patientId) throw new Error('Escolha o paciente.');
  const { data, error } = await supabase.rpc('portal_send_anamnese', {
    p_patient_id: patientId,
    p_anamnese_id: anamneseId,
    p_due_date: dueDate || null,
  });
  if (error) fail(error, 'Não foi possível enviar a anamnese.');
  return data;
}

export async function cancelHomeAnamnese(requestId) {
  const { error } = await supabase.rpc('cancel_patient_anamnese_request', { p_request_id: requestId });
  if (error) fail(error, 'Não foi possível cancelar o envio.');
}
