// ============================================================
// SERVICE: Pesquisa de satisfação
// Migração: supabase/migrations/20260901_satisfaction_surveys.sql
//
// Criar/listar aqui passa por RLS normal (staff autenticado da
// clínica); excluir, só administradora da clínica
// (20260929b_satisfaction_surveys_delete.sql). A RESPOSTA do paciente não passa por este arquivo — vai
// direto para a Edge Function pública satisfaction-survey, chamada por
// SurveyPage.jsx sem sessão nenhuma.
// ============================================================

import { supabase, getAuthenticatedUser } from '../lib/supabase';

const SURVEY_COLUMNS =
  'id,patient_id,appointment_id,token,created_at,expires_at,responded_at,rating,comment';

// Com o profissional/disciplina embutidos (via appointment_id), dá pra
// filtrar quem está sendo comentado — sem isso a pesquisa só sabia o
// paciente, nunca por qual atendimento. RLS de appointments já libera
// leitura pra qualquer membro ativo da clínica (agenda compartilhada),
// então o embed não abre nada que a tela de Agenda já não mostrasse.
const SURVEY_COLUMNS_WITH_APPOINTMENT =
  `${SURVEY_COLUMNS},appointments(professional_id,discipline,starts_at)`;

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
    .select(SURVEY_COLUMNS_WITH_APPOINTMENT)
    .single();

  if (error) {
    if (isMissingSurveyTableError(error)) throw new Error(MIGRATION_HINT);
    throw new Error(error.message || 'Não foi possível gerar a pesquisa.');
  }

  return data;
}

function isMissingAppointmentEmbedError(error) {
  const text = [error?.message, error?.details, error?.hint, error?.code]
    .filter(Boolean)
    .join(' ');
  return /appointments/.test(text) && /schema cache|relationship|Could not find/i.test(text);
}

// `from`/`to` (ISO, `to` exclusivo) recortam pela data de envio — o
// filtro de semana/mês da Gestão. Sem eles, as mais recentes.
export async function listSatisfactionSurveys({ limit = 100, from = null, to = null } = {}) {
  const query = columns => {
    let request = supabase.from('satisfaction_surveys').select(columns);
    if (from) request = request.gte('created_at', from);
    if (to) request = request.lt('created_at', to);
    return request.order('created_at', { ascending: false }).limit(limit);
  };

  let { data, error } = await query(SURVEY_COLUMNS_WITH_APPOINTMENT);

  // Ambiente sem o vínculo appointment_id ainda populado/detectável
  // (banco mais antigo): cai pra lista sem profissional/disciplina em
  // vez de quebrar a aba inteira.
  if (error && isMissingAppointmentEmbedError(error)) {
    ({ data, error } = await query(SURVEY_COLUMNS));
  }

  if (error) {
    if (isMissingSurveyTableError(error)) throw new Error(MIGRATION_HINT);
    throw new Error(error.message || 'Não foi possível carregar as pesquisas.');
  }

  return data || [];
}

export const SURVEY_DELETE_MIGRATION_HINT =
  'Exclusão de pesquisa ainda não liberada no banco. Aplique a migração ' +
  'supabase/migrations/20260929b_satisfaction_surveys_delete.sql no Supabase.';

function isMissingDeleteGrantError(error) {
  const text = [error?.message, error?.details, error?.hint].filter(Boolean).join(' ');
  return error?.code === '42501' || /permission denied/i.test(text);
}

/**
 * Exclusão definitiva (só administradora da clínica, pela policy de
 * DELETE). Devolve os ids que o banco apagou de fato: RLS que barra
 * uma linha não dá erro, só deixa de apagá-la (é o que acontece antes
 * da migração, já que o GRANT padrão do Supabase existe e a policy
 * não) — quem chama compara com o que pediu em vez de supor que foi
 * tudo.
 */
export async function deleteSatisfactionSurveys(ids) {
  const uniqueIds = [...new Set((ids || []).filter(Boolean))];
  if (!uniqueIds.length) return [];

  const { data, error } = await supabase
    .from('satisfaction_surveys')
    .delete()
    .in('id', uniqueIds)
    .select('id');

  if (error) {
    if (isMissingDeleteGrantError(error)) throw new Error(SURVEY_DELETE_MIGRATION_HINT);
    throw new Error(error.message || 'Não foi possível excluir as pesquisas.');
  }

  return (data || []).map(row => row.id);
}

export function buildSurveyLink(token) {
  return `${window.location.origin}/pesquisa-satisfacao?token=${token}`;
}
