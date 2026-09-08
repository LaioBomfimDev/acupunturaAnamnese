// ============================================================
// SERVICE: Pesquisa de satisfação
// Migração: supabase/migrations/20260901_satisfaction_surveys.sql
//
// Criar/listar aqui passa por RLS normal (staff autenticado da
// clínica). A RESPOSTA do paciente não passa por este arquivo — vai
// direto para a Edge Function pública satisfaction-survey, chamada por
// SurveyPage.jsx sem sessão nenhuma.
// ============================================================

import { supabase, getAuthenticatedUser } from '../lib/supabase';

const SURVEY_COLUMNS =
  'id,patient_id,appointment_id,token,created_at,expires_at,responded_at,rating,comment';

function isMissingSurveyTableError(error) {
  const text = [error?.message, error?.details, error?.hint, error?.code]
    .filter(Boolean)
    .join(' ');
  return /satisfaction_surveys/.test(text) && /does not exist|schema cache|Could not find/i.test(text);
}

const MIGRATION_HINT =
  'Pesquisa de satisfação ausente no banco. Aplique a migração ' +
  'supabase/migrations/20260901_satisfaction_surveys.sql no Supabase.';

export async function createSatisfactionSurvey({ patientId, appointmentId = null, clinicId }) {
  const user = await getAuthenticatedUser();
  if (!user) throw new Error('Usuário não autenticado.');
  if (!patientId) throw new Error('Selecione o paciente.');
  if (!clinicId) throw new Error('Clínica não identificada para gerar a pesquisa.');

  const { data, error } = await supabase
    .from('satisfaction_surveys')
    .insert({
      clinic_id: clinicId,
      patient_id: patientId,
      appointment_id: appointmentId,
      created_by: user.id,
    })
    .select(SURVEY_COLUMNS)
    .single();

  if (error) {
    if (isMissingSurveyTableError(error)) throw new Error(MIGRATION_HINT);
    throw new Error(error.message || 'Não foi possível gerar a pesquisa.');
  }

  return data;
}

export async function listSatisfactionSurveys({ limit = 100 } = {}) {
  const { data, error } = await supabase
    .from('satisfaction_surveys')
    .select(SURVEY_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingSurveyTableError(error)) throw new Error(MIGRATION_HINT);
    throw new Error(error.message || 'Não foi possível carregar as pesquisas.');
  }

  return data || [];
}

export function buildSurveyLink(token) {
  return `${window.location.origin}/pesquisa-satisfacao?token=${token}`;
}
