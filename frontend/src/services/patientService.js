// ============================================================
// SERVICE: Gerenciamento de pacientes
// CRUD completo — usa Supabase quando autenticado de verdade,
// ou localStorage quando o login é local (mock/fallback).
// ============================================================

import { supabase, getAuthenticatedUser } from '../lib/supabase';
import { LOCAL_DEVELOPMENT_MODE } from '../lib/localDevelopmentMode';

const LOCAL_PATIENTS_KEY = 'acup_local_patients';
const PATIENT_SELECT_COLUMNS =
  'id,therapist_id,name,phone,birth_date,age,archived_at,created_at,clinic_id';

// ---------- helpers localStorage ----------

function getLocalPatients() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_PATIENTS_KEY) || '[]');
  } catch {
    return [];
  }
}

function getLocalPatientsForUser(user) {
  if (!user?.id) return [];
  return getLocalPatients().filter(patient => patient.therapist_id === user.id);
}

function saveLocalPatients(patients) {
  localStorage.setItem(LOCAL_PATIENTS_KEY, JSON.stringify(patients));
}

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ---------- API pública ----------

/**
 * Lista todos os pacientes do terapeuta autenticado.
 * RLS garante que só os pacientes do terapeuta são retornados.
 */
export async function listPatients() {
  const user = await getAuthenticatedUser();
  if (!user) throw new Error('Usuário não autenticado.');
  if (LOCAL_DEVELOPMENT_MODE && user?._isLocal) {
    return getLocalPatientsForUser(user).filter(patient => !patient.archived_at);
  }

  const { data, error } = await supabase
    .from('patients')
    .select(PATIENT_SELECT_COLUMNS)
    .eq('therapist_id', user.id)
    .is('archived_at', null)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Busca um paciente pelo ID.
 */
export async function getPatient(patientId) {
  const user = await getAuthenticatedUser();
  if (!user) throw new Error('Usuário não autenticado.');
  if (LOCAL_DEVELOPMENT_MODE && user?._isLocal) {
    const p = getLocalPatientsForUser(user).find(p => p.id === patientId);
    if (!p) throw new Error('Paciente não encontrado.');
    return p;
  }

  const { data, error } = await supabase
    .from('patients')
    .select(PATIENT_SELECT_COLUMNS)
    .eq('id', patientId)
    .eq('therapist_id', user.id)
    .single();

  if (error) throw error;
  return data;
}

/**
 * Cria um novo paciente.
 * O therapist_id é preenchido automaticamente com o usuário autenticado.
 */
export function isMissingColumnError(error) {
  const text = [error?.message, error?.details, error?.hint, error?.code]
    .filter(Boolean)
    .join(' ');
  return /column .* does not exist|schema cache|Could not find .* column/i.test(text);
}

export function normalizeAge(age) {
  if (age === undefined || age === null || age === '') return null;
  const parsed = Number.parseInt(age, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function hasSubmittedAge(age) {
  return age !== undefined && age !== null && String(age).trim() !== '';
}

export function assertCanFallbackWithoutPatientAge(error, age) {
  if (!isMissingColumnError(error) || !hasSubmittedAge(age)) return;
  throw new Error(
    'Não foi possível salvar a idade do paciente porque a coluna age não está disponível no banco. ' +
    'Execute a migration supabase/migrations/20260522_patient_age_archive.sql antes de cadastrar idade.'
  );
}

export async function createPatient({ name, phone, birthDate, age }) {
  const user = await getAuthenticatedUser();
  if (!user) throw new Error('Usuário não autenticado.');
  const normalizedAge = normalizeAge(age);

  if (LOCAL_DEVELOPMENT_MODE && user._isLocal) {
    const newPatient = {
      id: generateUUID(),
      therapist_id: user.id,
      name,
      phone: phone || null,
      birth_date: birthDate || null,
      age: normalizedAge,
      archived_at: null,
      created_at: new Date().toISOString(),
    };
    const patients = getLocalPatients();
    patients.unshift(newPatient);
    saveLocalPatients(patients);
    return newPatient;
  }

  const payload = {
    therapist_id: user.id,
    name,
    phone: phone || null,
    birth_date: birthDate || null,
  };
  if (hasSubmittedAge(age)) payload.age = normalizedAge;

  let { data, error } = await supabase
    .from('patients')
    .insert(payload)
    .select(PATIENT_SELECT_COLUMNS)
    .single();

  if (error && isMissingColumnError(error)) {
    assertCanFallbackWithoutPatientAge(error, age);
    const { data: fallbackData, error: fallbackError } = await supabase
      .from('patients')
      .insert({
        therapist_id: user.id,
        name,
        phone: phone || null,
        birth_date: birthDate || null,
      })
      .select(PATIENT_SELECT_COLUMNS)
      .single();
    data = fallbackData;
    error = fallbackError;
  }

  if (error) throw error;
  return data;
}

/**
 * Atualiza dados de um paciente existente.
 */
export async function updatePatient(patientId, updates) {
  const user = await getAuthenticatedUser();
  if (!user) throw new Error('Usuário não autenticado.');
  if (LOCAL_DEVELOPMENT_MODE && user?._isLocal) {
    const patients = getLocalPatients();
    const idx = patients.findIndex(p => p.id === patientId && p.therapist_id === user.id);
    if (idx === -1) throw new Error('Paciente não encontrado.');
    if (updates.name !== undefined) patients[idx].name = updates.name;
    if (updates.phone !== undefined) patients[idx].phone = updates.phone;
    if (updates.birthDate !== undefined) patients[idx].birth_date = updates.birthDate;
    if (updates.age !== undefined) patients[idx].age = normalizeAge(updates.age);
    if (updates.archivedAt !== undefined) patients[idx].archived_at = updates.archivedAt;
    saveLocalPatients(patients);
    return patients[idx];
  }

  const payload = {};
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.phone !== undefined) payload.phone = updates.phone;
  if (updates.birthDate !== undefined) payload.birth_date = updates.birthDate;
  if (updates.age !== undefined) payload.age = normalizeAge(updates.age);
  if (updates.archivedAt !== undefined) payload.archived_at = updates.archivedAt;

  let { data, error } = await supabase
    .from('patients')
    .update(payload)
    .eq('id', patientId)
    .eq('therapist_id', user.id)
    .select(PATIENT_SELECT_COLUMNS)
    .single();

  if (error && isMissingColumnError(error)) {
    assertCanFallbackWithoutPatientAge(error, updates.age);
    const fallbackPayload = { ...payload };
    delete fallbackPayload.age;
    delete fallbackPayload.archived_at;
    const { data: fallbackData, error: fallbackError } = await supabase
      .from('patients')
      .update(fallbackPayload)
      .eq('id', patientId)
      .eq('therapist_id', user.id)
      .select(PATIENT_SELECT_COLUMNS)
      .single();
    data = fallbackData;
    error = fallbackError;
  }

  if (error) throw error;
  return data;
}

/**
 * Solicita exclusão administrativa e arquiva o paciente de forma recuperável.
 * A execução definitiva depende da política de retenção e nunca ocorre aqui.
 */
export async function deletePatient(
  patientId,
  reason = 'Solicitação de exclusão iniciada pelo profissional responsável.',
) {
  const user = await getAuthenticatedUser();
  if (!user) throw new Error('Usuário não autenticado.');
  if (LOCAL_DEVELOPMENT_MODE && user?._isLocal) {
    const patients = getLocalPatients();
    const index = patients.findIndex(p => p.id === patientId && p.therapist_id === user.id);
    if (index < 0) throw new Error('Paciente não encontrado.');
    const requestedAt = new Date().toISOString();
    patients[index] = { ...patients[index], archived_at: requestedAt };
    saveLocalPatients(patients);
    return {
      request_id: `local-deletion-request-${Date.now()}`,
      status: 'pending',
      requested_at: requestedAt,
    };
  }

  const { data, error } = await supabase.rpc('request_patient_deletion', {
    p_patient_id: patientId,
    p_reason: String(reason || '').trim().slice(0, 1000),
  });
  if (error) {
    const details = [error.message, error.details, error.hint, error.code]
      .filter(Boolean)
      .join(' ');
    if (
      /request_patient_deletion/.test(details)
      && /does not exist|schema cache|Could not find|PGRST202/i.test(details)
    ) {
      throw new Error(
        'Exclusão segura ainda não foi ativada. Aplique a migração de hardening 20260723.',
      );
    }
    throw error;
  }
  const request = Array.isArray(data) ? data[0] : data;
  if (!request?.request_id) {
    throw new Error('O banco não confirmou a solicitação de exclusão.');
  }
  return request;
}
