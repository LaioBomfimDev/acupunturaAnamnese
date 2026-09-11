// ============================================================
// SERVICE: Anexos do paciente (PDF/imagem) — Supabase Storage
// Bucket privado `patient-attachments`, caminho
// `clinic_id/patient_id/timestamp-nome`, RLS por clínica (ver
// migration 20260910_patient_attachments.sql).
//
// Visualizar é aberto à clínica inteira (mesma regra do cadastro);
// enviar/remover é restrito a clinic_admin/super_admin — a ação
// acontece fora do atendimento, feita pela administração da clínica.
// ============================================================

import { supabase, getAuthenticatedUser } from '../lib/supabase';
import { LOCAL_DEVELOPMENT_MODE } from '../lib/localDevelopmentMode';

export const PATIENT_ATTACHMENTS_BUCKET = 'patient-attachments';
const SIGNED_URL_TTL_SECONDS = 60 * 60;

function isMissingAttachmentsSchemaError(error) {
  const text = [error?.message, error?.details, error?.hint, error?.code]
    .filter(Boolean)
    .join(' ');
  return /patient_attachments/.test(text) && /does not exist|schema cache|Could not find/i.test(text);
}

function buildAttachmentPath(clinicId, patientId, fileName) {
  const safeName = String(fileName || 'arquivo').replace(/[^\w.-]+/g, '_');
  return `${clinicId}/${patientId}/${Date.now()}-${safeName}`;
}

/**
 * Lista os anexos de um paciente, mais recentes primeiro.
 */
export async function listPatientAttachments(patientId) {
  if (!patientId) return [];
  const user = await getAuthenticatedUser();
  if (!user) throw new Error('Usuário não autenticado.');
  if (LOCAL_DEVELOPMENT_MODE && user._isLocal) return [];

  const { data, error } = await supabase
    .from('patient_attachments')
    .select('id,patient_id,clinic_id,uploaded_by,file_path,file_name,mime_type,size_bytes,created_at')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false });

  if (error) {
    if (isMissingAttachmentsSchemaError(error)) return [];
    throw new Error(error.message || 'Não foi possível carregar os anexos.');
  }
  return data || [];
}

/**
 * Envia um anexo (PDF/imagem) — só clinic_admin/super_admin (RLS garante).
 */
export async function uploadPatientAttachment({ patientId, clinicId, file }) {
  const user = await getAuthenticatedUser();
  if (!user) throw new Error('Usuário não autenticado.');
  if (!patientId || !clinicId) throw new Error('Paciente e clínica são obrigatórios.');
  if (!file) throw new Error('Selecione um arquivo.');

  if (LOCAL_DEVELOPMENT_MODE && user._isLocal) {
    throw new Error('Upload de anexos não está disponível no login local.');
  }

  const path = buildAttachmentPath(clinicId, patientId, file.name);
  const { error: uploadError } = await supabase.storage
    .from(PATIENT_ATTACHMENTS_BUCKET)
    .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });

  if (uploadError) throw new Error(`Falha ao enviar o arquivo: ${uploadError.message}`);

  const { data, error } = await supabase
    .from('patient_attachments')
    .insert({
      patient_id: patientId,
      clinic_id: clinicId,
      uploaded_by: user.id,
      file_path: path,
      file_name: file.name,
      mime_type: file.type || 'application/octet-stream',
      size_bytes: file.size || null,
    })
    .select()
    .single();

  if (error) {
    // Metadado falhou depois do upload ter ido — remove o arquivo órfão
    // pra não deixar um anexo invisível ocupando espaço no bucket.
    await supabase.storage.from(PATIENT_ATTACHMENTS_BUCKET).remove([path]);
    if (isMissingAttachmentsSchemaError(error)) {
      throw new Error('Estrutura de anexos ausente no banco. Aplique a migração 20260910_patient_attachments.sql.');
    }
    throw new Error(error.message || 'Não foi possível registrar o anexo.');
  }
  return data;
}

/**
 * URL assinada de curta duração para abrir/baixar um anexo.
 */
export async function getPatientAttachmentUrl(filePath) {
  if (!filePath) return null;
  const { data, error } = await supabase.storage
    .from(PATIENT_ATTACHMENTS_BUCKET)
    .createSignedUrl(filePath, SIGNED_URL_TTL_SECONDS);

  if (error) {
    console.error('Erro ao gerar URL assinada do anexo:', error);
    return null;
  }
  return data?.signedUrl || null;
}

/**
 * Remove um anexo (metadado + arquivo) — só clinic_admin/super_admin (RLS garante).
 */
export async function deletePatientAttachment(attachment) {
  if (!attachment?.id) return;
  const { error } = await supabase.from('patient_attachments').delete().eq('id', attachment.id);
  if (error) throw new Error(error.message || 'Não foi possível remover o anexo.');
  if (attachment.file_path) {
    await supabase.storage.from(PATIENT_ATTACHMENTS_BUCKET).remove([attachment.file_path]);
  }
}
