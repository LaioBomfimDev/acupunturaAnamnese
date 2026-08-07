// ============================================================
// SERVICE: Fichas Clínicas — acesso via RPC (criptografado)
// Usa as funções PostgreSQL para nunca expor a chave de
// criptografia ao frontend.
// Quando o login é local (mock), armazena no localStorage.
// ============================================================

import { supabase, getAuthenticatedUser } from '../lib/supabase';
import { LOCAL_DEVELOPMENT_MODE } from '../lib/localDevelopmentMode';

const LOCAL_RECORDS_KEY = 'acup_local_clinical_records';
const LOCAL_PATIENTS_KEY = 'acup_local_patients';

export const CLINICAL_SESSION_HARDENING_MIGRATION_HINT =
  'Persistência clínica versionada ausente no banco. Aplique a migração de hardening ' +
  '20260723 antes de publicar esta versão do frontend.';

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

function isMissingVersionedPersistenceRpc(error) {
  const text = [error?.message, error?.details, error?.hint, error?.code]
    .filter(Boolean)
    .join(' ');
  return /upsert_clinical_session|upsert_versioned_clinical_record|get_latest_clinical_record/.test(text)
    && /does not exist|schema cache|Could not find|PGRST202/i.test(text);
}

function parseSensitiveData(record) {
  if (!record || typeof record.sensitive_data !== 'string') return record;
  try {
    return { ...record, sensitive_data: JSON.parse(record.sensitive_data) };
  } catch {
    throw new Error('O servidor retornou uma ficha clínica em formato inválido.');
  }
}

function clinicalConflictError() {
  const error = new Error(
    'Esta ficha foi alterada em outra aba ou dispositivo. Recarregue o paciente antes de salvar novamente.',
  );
  error.code = 'CLINICAL_REVISION_CONFLICT';
  return error;
}

// ---------- API pública ----------

/**
 * Busca fichas clínicas de um paciente (descriptografadas pelo servidor).
 * @param {string} patientId - UUID do paciente
 * @param {string|null} recordType - Filtrar por tipo, ou null para todos
 * @returns {Array} Lista de fichas com dados descriptografados
 */
export async function getClinicalRecords(patientId, recordType = null) {
  const user = await getAuthenticatedUser();
  if (!user) throw new Error('Usuário não autenticado.');
  if (LOCAL_DEVELOPMENT_MODE && user?._isLocal) {
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
 * Cria ou atualiza atomicamente um registro clínico versionado.
 *
 * O servidor compara `expectedRevision`, deduplica `idempotencyKey` e
 * devolve a nova revisão. Não há fallback para as RPCs antigas: publicar
 * o frontend antes da migração reabriria a condição de corrida corrigida.
 */
export async function upsertVersionedClinicalRecord(patientId, recordType, data, {
  discipline = 'acupuntura',
  expectedRevision = 0,
  idempotencyKey,
} = {}) {
  const user = await getAuthenticatedUser();
  if (!user) throw new Error('Usuário não autenticado.');
  if (!idempotencyKey) throw new Error('Chave de idempotência obrigatória.');
  if (!['full_session', 'psi_anamnese', 'psi_neuro_avaliacao'].includes(recordType)) {
    throw new Error('Tipo de registro não habilitado para persistência versionada.');
  }

  if (LOCAL_DEVELOPMENT_MODE && user._isLocal) {
    assertLocalPatientBelongsToUser(patientId, user);
    const records = getLocalRecords();
    const index = records.findIndex(record => (
      record.patient_id === patientId
      && record.record_type === recordType
      && (record.discipline || 'acupuntura') === discipline
      && localRecordBelongsToUser(record, user)
    ));
    const current = index >= 0 ? records[index] : null;

    if (current?.last_idempotency_key === idempotencyKey) {
      return {
        id: current.id,
        revision: Number(current.revision) || 1,
        updated_at: current.updated_at,
        replayed: true,
      };
    }

    const currentRevision = current ? (Number(current.revision) || 1) : 0;
    if (currentRevision !== Number(expectedRevision || 0)) {
      throw clinicalConflictError();
    }

    const updatedAt = new Date().toISOString();
    const next = {
      ...(current || {}),
      id: current?.id || generateUUID(),
      patient_id: patientId,
      therapist_id: user.id,
      record_type: recordType,
      discipline,
      sensitive_data: data,
      revision: currentRevision + 1,
      last_idempotency_key: idempotencyKey,
      created_at: current?.created_at || updatedAt,
      updated_at: updatedAt,
    };
    if (index >= 0) records[index] = next;
    else records.unshift(next);
    saveLocalRecords(records);
    return {
      id: next.id,
      revision: next.revision,
      updated_at: next.updated_at,
      replayed: false,
    };
  }

  const { data: response, error } = await supabase.rpc('upsert_versioned_clinical_record', {
    p_patient_id: patientId,
    p_record_type: recordType,
    p_data: JSON.stringify(data),
    p_expected_revision: Number(expectedRevision || 0),
    p_idempotency_key: idempotencyKey,
    p_discipline: discipline,
  });

  if (error) {
    if (isMissingVersionedPersistenceRpc(error)) {
      throw new Error(CLINICAL_SESSION_HARDENING_MIGRATION_HINT);
    }
    if (error.code === '40001' || /revis[aã]o|revision|conflito/i.test(error.message || '')) {
      throw clinicalConflictError();
    }
    throw error;
  }

  const record = Array.isArray(response) ? response[0] : response;
  if (!record?.id || !Number.isFinite(Number(record.revision))) {
    throw new Error('O servidor não confirmou a revisão da sessão clínica.');
  }
  return {
    id: record.id,
    revision: Number(record.revision),
    updated_at: record.updated_at,
    replayed: Boolean(record.replayed),
  };
}

export function upsertClinicalSession(patientId, data, options = {}) {
  return upsertVersionedClinicalRecord(
    patientId,
    'full_session',
    data,
    options,
  );
}

/**
 * Busca a ficha mais recente de um tipo específico para um paciente.
 * Útil para carregar o estado mais atual ao abrir um módulo.
 * @param {string} patientId
 * @param {string} recordType
 * @returns {object|null} Dados da ficha ou null
 */
export async function getLatestRecord(patientId, recordType, discipline = null) {
  const user = await getAuthenticatedUser();
  if (!user) throw new Error('Usuário não autenticado.');

  if (LOCAL_DEVELOPMENT_MODE && user._isLocal) {
    const records = await getClinicalRecords(patientId, recordType);
    const filtered = discipline
      ? records.filter(record => (record.discipline || 'acupuntura') === discipline)
      : records;
    return filtered.length > 0 ? {
      ...filtered[0],
      revision: Number(filtered[0].revision) || 1,
    } : null;
  }

  const { data, error } = await supabase.rpc('get_latest_clinical_record', {
    p_patient_id: patientId,
    p_record_type: recordType,
    p_discipline: discipline,
  });
  if (error) {
    if (isMissingVersionedPersistenceRpc(error)) {
      throw new Error(CLINICAL_SESSION_HARDENING_MIGRATION_HINT);
    }
    throw error;
  }

  const record = Array.isArray(data) ? data[0] : data;
  return record ? parseSensitiveData({
    ...record,
    revision: Number(record.revision) || 1,
  }) : null;
}
