// ============================================================
// SERVICE: Entrevistas clínicas do paciente (aba Entrevistas)
// Migração: supabase/migrations/20261016_clinical_interviews.sql
//
// Tudo passa pelas RPCs: a tabela não tem leitura direta. Aplica, envia
// o link e lê quem atende o paciente na área e a administração da
// clínica (can_use_patient_interviews, a mesma regra das escalas).
// Sem fallback local: entrevista é dado clínico (AGENTS.md §9).
// ============================================================

import { supabase } from '../lib/supabase';
import { buildInterviewQuestions } from '../data/clinicalInterviews';
import { computeProgress, sanitizeAnswers } from '../utils/patientForms';
import { newSaveId } from './patientPortalPublic';

export const PATIENT_INTERVIEWS_MIGRATION_HINT =
  'As entrevistas ainda não existem no banco. Aplique a migração '
  + 'supabase/migrations/20261016_clinical_interviews.sql no Supabase.';

export function isMissingInterviewsSchema(error) {
  const text = [error?.message, error?.details, error?.hint, error?.code].filter(Boolean).join(' ');
  return /interview/.test(text) && /does not exist|schema cache|Could not find|PGRST202/i.test(text);
}

function fail(error, fallback) {
  if (isMissingInterviewsSchema(error)) throw new Error(PATIENT_INTERVIEWS_MIGRATION_HINT);
  throw new Error(error?.message || fallback);
}

/** Linha da RPC → objeto da tela. */
export function mapInterviewRow(row) {
  return {
    id: row.result_id,
    interviewId: row.result_interview_id,
    interviewVersion: Number(row.result_interview_version) || 1,
    title: row.result_title || '',
    questions: Array.isArray(row.result_questions) ? row.result_questions : [],
    channel: row.result_channel,
    recipientLabel: row.result_recipient_label || '',
    status: row.result_status,
    progress: Number(row.result_progress) || 0,
    answers: row.result_answers && typeof row.result_answers === 'object' ? row.result_answers : null,
    linkExpiresAt: row.result_link_expires_at || null,
    createdAt: row.result_created_at,
    startedAt: row.result_started_at || null,
    submittedAt: row.result_submitted_at || null,
    cancelledAt: row.result_cancelled_at || null,
    createdById: row.result_created_by,
    createdByName: row.result_created_by_name || 'Profissional',
    voidedAt: row.result_voided_at || null,
    voidedByName: row.result_voided_by_name || '',
    voidReason: row.result_void_reason || '',
  };
}

export async function listPatientInterviews({ patientId, discipline }) {
  if (!patientId || !discipline) return [];
  const { data, error } = await supabase.rpc('list_patient_interviews', {
    p_patient_id: patientId,
    p_discipline: discipline,
  });
  if (error) fail(error, 'Não foi possível carregar as entrevistas.');
  return (data || []).map(mapInterviewRow);
}

/**
 * Entrevista respondida no consultório. `saveId` vem de quem chama e se
 * repete num retry do mesmo salvamento, para o banco não duplicar.
 */
export async function recordInterviewAnswers({ patientId, discipline, interview, answers, saveId = newSaveId() }) {
  if (!patientId) throw new Error('Escolha o paciente.');
  const questions = buildInterviewQuestions(interview);
  // Mesma limpeza que a Edge Function faz no link: só resposta que existe na pergunta.
  const clean = sanitizeAnswers(questions, answers);
  const { data, error } = await supabase.rpc('record_interview_answers', {
    p_patient_id: patientId,
    p_discipline: discipline,
    p_interview_id: interview.id,
    p_interview_version: interview.version,
    p_title: interview.title,
    p_questions: questions,
    p_answers: clean,
    p_progress: computeProgress(questions, clean),
    p_save_id: saveId,
  });
  if (error) fail(error, 'Não foi possível salvar a entrevista.');
  return data;
}

/** Cria o link de quem responde. O token volta só aqui e em getInterviewLink. */
export async function sendInterviewLink({ patientId, discipline, interview, recipientLabel, validDays }) {
  if (!patientId) throw new Error('Escolha o paciente.');
  const label = String(recipientLabel || '').trim();
  if (!label) throw new Error('Diga para quem é o link (por exemplo: Mãe, Esposa, Professora Ana).');
  const { data, error } = await supabase.rpc('send_interview_link', {
    p_patient_id: patientId,
    p_discipline: discipline,
    p_interview_id: interview.id,
    p_interview_version: interview.version,
    p_title: interview.title,
    p_questions: buildInterviewQuestions(interview),
    p_recipient_label: label,
    p_valid_days: validDays,
  });
  if (error) fail(error, 'Não foi possível criar o link.');
  const row = Array.isArray(data) ? data[0] : data;
  return { id: row?.result_id || null, token: row?.result_token || '', expiresAt: row?.result_expires_at || null };
}

export async function getInterviewLink(responseId) {
  const { data, error } = await supabase.rpc('get_interview_link', { p_response_id: responseId });
  if (error) fail(error, 'Não foi possível copiar o link.');
  return String(data || '');
}

export async function cancelInterviewLink(responseId) {
  const { error } = await supabase.rpc('cancel_interview_link', { p_response_id: responseId });
  if (error) fail(error, 'Não foi possível cancelar o link.');
}

export async function voidInterviewResponse({ id, reason }) {
  const text = String(reason || '').trim();
  if (text.length < 3) throw new Error('Escreva o motivo da anulação.');
  const { error } = await supabase.rpc('void_interview_response', { p_response_id: id, p_reason: text });
  if (error) fail(error, 'Não foi possível anular a entrevista.');
}
