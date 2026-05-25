// ============================================================
// SERVICE: Fichas Clínicas — acesso via RPC (criptografado)
// Usa as funções PostgreSQL para nunca expor a chave de
// criptografia ao frontend.
// Quando o login é local (mock), armazena no localStorage.
// ============================================================

import { supabase, getAuthenticatedUser } from '../lib/supabase';

const LOCAL_RECORDS_KEY = 'acup_local_clinical_records';
const LOCAL_PATIENTS_KEY = 'acup_local_patients';

// ---------- helpers localStorage ----------

function getLocalRecords() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_RECORDS_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveLocalRecords(records) {
  localStorage.setItem(LOCAL_RECORDS_KEY, JSON.stringify(records));
}

function getLocalPatients() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_PATIENTS_KEY) || '[]');
  } catch {
    return [];
  }
}

function assertLocalPatientBelongsToUser(patientId, user) {
  const patient = getLocalPatients().find(p => p.id === patientId && p.therapist_id === user?.id);
  if (!patient) throw new Error('Paciente não encontrado.');
}

function localRecordBelongsToUser(record, user) {
  if (!record || !user?.id) return false;
  if (record.therapist_id) return record.therapist_id === user.id;

  return getLocalPatients().some(patient => (
    patient.id === record.patient_id && patient.therapist_id === user.id
  ));
}

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ---------- API pública ----------

/**
 * Salva uma nova ficha clínica criptografada.
 * @param {string} patientId - UUID do paciente
 * @param {string} recordType - Tipo: 'anamnesis', 'evolution', 'diagnosis', 'protocol', 'raciocinio', 'tongue', 'pulse'
 * @param {object} data - Dados clínicos (serão convertidos em JSON)
 * @returns {string} UUID da ficha criada
 */
export async function saveClinicalRecord(patientId, recordType, data) {
  const user = await getAuthenticatedUser();
  if (!user) throw new Error('Usuário não autenticado.');
  if (user?._isLocal) {
    assertLocalPatientBelongsToUser(patientId, user);
    const record = {
      id: generateUUID(),
      patient_id: patientId,
      therapist_id: user.id,
      record_type: recordType,
      sensitive_data: data,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const records = getLocalRecords();
    records.unshift(record);
    saveLocalRecords(records);
    return record.id;
  }

  const { data: recordId, error } = await supabase.rpc('insert_clinical_record', {
    p_patient_id: patientId,
    p_record_type: recordType,
    p_data: JSON.stringify(data),
  });

  if (error) throw error;
  if (!recordId) {
    throw new Error('Ficha clínica não foi criada. Verifique se o paciente pertence ao usuário autenticado.');
  }
  return recordId;
}

/**
 * Busca fichas clínicas de um paciente (descriptografadas pelo servidor).
 * @param {string} patientId - UUID do paciente
 * @param {string|null} recordType - Filtrar por tipo, ou null para todos
 * @returns {Array} Lista de fichas com dados descriptografados
 */
export async function getClinicalRecords(patientId, recordType = null) {
  const user = await getAuthenticatedUser();
  if (!user) throw new Error('Usuário não autenticado.');
  if (user?._isLocal) {
    assertLocalPatientBelongsToUser(patientId, user);
    let records = getLocalRecords().filter(r => (
      r.patient_id === patientId && localRecordBelongsToUser(r, user)
    ));
    if (recordType) {
      records = records.filter(r => r.record_type === recordType);
    }
    return records;
  }

  const { data, error } = await supabase.rpc('get_clinical_records', {
    p_patient_id: patientId,
    p_record_type: recordType,
  });

  if (error) throw error;

  // Parseia o JSON dos dados descriptografados
  return (data || []).map(record => ({
    ...record,
    sensitive_data: record.sensitive_data ? JSON.parse(record.sensitive_data) : null,
  }));
}

/**
 * Atualiza uma ficha clínica existente.
 * @param {string} recordId - UUID da ficha
 * @param {object} data - Novos dados clínicos
 */
export async function updateClinicalRecord(recordId, data) {
  const user = await getAuthenticatedUser();
  if (!user) throw new Error('Usuário não autenticado.');
  if (user?._isLocal) {
    const records = getLocalRecords();
    const idx = records.findIndex(r => r.id === recordId && localRecordBelongsToUser(r, user));
    if (idx !== -1) {
      records[idx].sensitive_data = data;
      records[idx].therapist_id = user.id;
      records[idx].updated_at = new Date().toISOString();
      saveLocalRecords(records);
    }
    return;
  }

  const { error } = await supabase.rpc('update_clinical_record', {
    p_record_id: recordId,
    p_data: JSON.stringify(data),
  });

  if (error) throw error;
}

/**
 * Remove uma ficha clínica.
 * @param {string} recordId - UUID da ficha
 */
export async function deleteClinicalRecord(recordId) {
  const user = await getAuthenticatedUser();
  if (!user) throw new Error('Usuário não autenticado.');
  if (user?._isLocal) {
    const records = getLocalRecords().filter(r => (
      r.id !== recordId || !localRecordBelongsToUser(r, user)
    ));
    saveLocalRecords(records);
    return;
  }

  const { error } = await supabase.rpc('delete_clinical_record', {
    p_record_id: recordId,
  });

  if (error) throw error;
}

/**
 * Busca a ficha mais recente de um tipo específico para um paciente.
 * Útil para carregar o estado mais atual ao abrir um módulo.
 * @param {string} patientId
 * @param {string} recordType
 * @returns {object|null} Dados da ficha ou null
 */
export async function getLatestRecord(patientId, recordType) {
  const records = await getClinicalRecords(patientId, recordType);
  return records.length > 0 ? records[0] : null;
}
