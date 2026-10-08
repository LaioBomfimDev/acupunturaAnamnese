// ============================================================
// SERVICE: Importáveis e Área do Paciente (lado da administração)
// Migração: supabase/migrations/20261006_patient_portal.sql
//
// Tudo aqui passa pela RLS de clinic_admin (can_manage_patient_portal):
// profissional e recepção não leem formulários, acessos nem respostas.
// O código de acesso nasce no banco (portal_ensure_access), nunca na
// tela. As respostas chegam decifradas só por portal_admin_read_answers.
// O lado do paciente não passa por aqui: ver patientPortalPublic.js.
// ============================================================

import { supabase } from '../lib/supabase';

const FORM_COLUMNS = 'id,clinic_id,title,description,questions,status,created_at,updated_at';
const ASSIGNMENT_COLUMNS =
  'id,patient_id,form_id,form_title,form_description,form_questions,due_date,status,progress,created_at,started_at,last_saved_at,submitted_at,cancelled_at';
const ACCESS_COLUMNS = 'id,patient_id,access_code,is_active,failed_attempts,locked_at,last_access_at,code_created_at,created_at';

export const PATIENT_PORTAL_MIGRATION_HINT =
  'A Área do Paciente ainda não existe no banco. Aplique a migração ' +
  'supabase/migrations/20261006_patient_portal.sql no Supabase.';

function isMissingSchemaError(error) {
  const text = [error?.message, error?.details, error?.hint, error?.code].filter(Boolean).join(' ');
  return /patient_forms|patient_form_assignments|patient_portal_access|portal_/.test(text)
    && /does not exist|schema cache|Could not find/i.test(text);
}

function fail(error, fallback) {
  if (isMissingSchemaError(error)) throw new Error(PATIENT_PORTAL_MIGRATION_HINT);
  throw new Error(error?.message || fallback);
}

// ---------- formulários ----------

export async function listPatientForms() {
  const { data, error } = await supabase
    .from('patient_forms')
    .select(FORM_COLUMNS)
    .order('updated_at', { ascending: false })
    .limit(300);
  if (error) fail(error, 'Não foi possível carregar os formulários.');
  return data || [];
}

export async function savePatientForm({ id = null, clinicId, title, description, questions, status }) {
  const payload = {
    title: String(title || '').trim(),
    description: String(description || '').trim() || null,
    questions,
    status,
  };

  if (id) {
    const { data, error } = await supabase
      .from('patient_forms')
      .update(payload)
      .eq('id', id)
      .select(FORM_COLUMNS)
      .maybeSingle();
    if (error) fail(error, 'Não foi possível salvar o formulário.');
    if (!data) throw new Error('O formulário não foi salvo: ele não existe mais ou você não tem permissão.');
    return data;
  }

  if (!clinicId) throw new Error('Instituição não identificada para salvar o formulário.');
  const { data, error } = await supabase
    .from('patient_forms')
    .insert({ ...payload, clinic_id: clinicId })
    .select(FORM_COLUMNS)
    .single();
  if (error) fail(error, 'Não foi possível criar o formulário.');
  return data;
}

/** Exclui e confere: a RLS barra sem erro, então conta o que saiu. */
export async function deletePatientForm(id) {
  const { data, error } = await supabase.from('patient_forms').delete().eq('id', id).select('id');
  if (error) fail(error, 'Não foi possível excluir o formulário.');
  if (!data?.length) throw new Error('Nenhum formulário foi excluído: ele não existe mais ou você não tem permissão.');
}

// ---------- envios ----------

export async function listAssignments({ patientId = null, limit = 500 } = {}) {
  let request = supabase.from('patient_form_assignments').select(ASSIGNMENT_COLUMNS);
  if (patientId) request = request.eq('patient_id', patientId);
  const { data, error } = await request.order('created_at', { ascending: false }).limit(limit);
  if (error) fail(error, 'Não foi possível carregar os envios.');
  return data || [];
}

export async function sendPatientForm({ patientId, formId, dueDate = null }) {
  if (!patientId) throw new Error('Escolha o paciente.');
  if (!formId) throw new Error('Escolha o formulário.');
  const { data, error } = await supabase.rpc('portal_send_form', {
    p_patient_id: patientId,
    p_form_id: formId,
    p_due_date: dueDate || null,
  });
  if (error) fail(error, 'Não foi possível enviar o formulário.');
  return data;
}

export async function cancelAssignment(assignmentId) {
  const { error } = await supabase.rpc('portal_cancel_assignment', { p_assignment_id: assignmentId });
  if (error) fail(error, 'Não foi possível cancelar o envio.');
}

/** Devolve quantos o banco apagou de fato (a RLS barra sem erro). */
export async function deleteAssignments(ids) {
  if (!ids?.length) return 0;
  const { data, error } = await supabase.from('patient_form_assignments').delete().in('id', ids).select('id');
  if (error) fail(error, 'Não foi possível excluir os envios.');
  return data?.length || 0;
}

/** Map id → respostas decifradas, só para a administração. */
export async function readAssignmentAnswers(ids) {
  const list = [...new Set(ids || [])].filter(Boolean);
  if (!list.length) return new Map();
  const result = new Map();
  for (let start = 0; start < list.length; start += 500) {
    const { data, error } = await supabase.rpc('portal_admin_read_answers', {
      p_assignment_ids: list.slice(start, start + 500),
    });
    if (error) fail(error, 'Não foi possível abrir as respostas.');
    for (const row of data || []) result.set(row.assignment_id, row.answers || {});
  }
  return result;
}

// ---------- acesso do paciente ----------

export async function getPatientAccess(patientId) {
  const { data, error } = await supabase
    .from('patient_portal_access')
    .select(ACCESS_COLUMNS)
    .eq('patient_id', patientId)
    .maybeSingle();
  if (error) fail(error, 'Não foi possível carregar o acesso do paciente.');
  return data || null;
}

async function accessRpc(name, params, fallback) {
  const { data, error } = await supabase.rpc(name, params);
  if (error) fail(error, fallback);
  return Array.isArray(data) ? data[0] || null : data;
}

export function ensurePatientAccess(patientId) {
  return accessRpc('portal_ensure_access', { p_patient_id: patientId }, 'Não foi possível criar o acesso.');
}

export function regenerateAccessCode(patientId) {
  return accessRpc('portal_regenerate_code', { p_patient_id: patientId }, 'Não foi possível gerar um novo código.');
}

export function setPatientAccessActive(patientId, active) {
  return accessRpc(
    'portal_set_access_active',
    { p_patient_id: patientId, p_active: Boolean(active) },
    active ? 'Não foi possível liberar o acesso.' : 'Não foi possível desativar o acesso.',
  );
}
