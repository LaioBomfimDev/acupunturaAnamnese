// ============================================================
// SERVICE: Gerenciamento de pacientes
// CRUD completo — usa Supabase quando autenticado de verdade,
// ou localStorage quando o login é local (mock/fallback).
// ============================================================

import { supabase, getAuthenticatedUser } from '../lib/supabase';
import { LOCAL_DEVELOPMENT_MODE } from '../lib/localDevelopmentMode';

const LOCAL_PATIENTS_KEY = 'acup_local_patients';
const PATIENT_SELECT_COLUMNS =
  'id,therapist_id,name,phone,birth_date,age,archived_at,created_at,clinic_id,image_consent,image_consent_at,cpf';

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
    .order('created_at', { ascending: false })
    .limit(2000);

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

/** Só dígitos, no máximo 11 — pontuação é assunto de exibição, não de dado. */
export function normalizeCpf(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 11);
}

export function formatCpf(value) {
  const digits = normalizeCpf(value);
  if (digits.length !== 11) return value || '';
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

/**
 * Algoritmo padrão dos dois dígitos verificadores do CPF. Recusa também
 * sequências de um dígito só (000.000.000-00 etc.) — matematicamente
 * "válidas" pelo cálculo, mas nunca um CPF real.
 */
export function isValidCpf(value) {
  const digits = normalizeCpf(value);
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;

  function checkDigit(base) {
    let sum = 0;
    let weight = base.length + 1;
    for (const char of base) {
      sum += Number(char) * weight;
      weight -= 1;
    }
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  }

  const base = digits.slice(0, 9);
  const d1 = checkDigit(base);
  const d2 = checkDigit(base + d1);
  return digits === `${base}${d1}${d2}`;
}

export function assertCanFallbackWithoutPatientAge(error, age) {
  if (!isMissingColumnError(error) || !hasSubmittedAge(age)) return;
  throw new Error(
    'Não foi possível salvar a idade do paciente porque a coluna age não está disponível no banco. ' +
    'Execute a migration supabase/migrations/20260522_patient_age_archive.sql antes de cadastrar idade.'
  );
}

/**
 * Consentimento é dado LGPD, não campo decorativo: se a pessoa marcou o
 * checkbox e o banco não tem onde guardar isso, silenciar seria pior do
 * que quebrar — o cadastro seguiria sem a marcação e ninguém perceberia.
 */
export function assertCanFallbackWithoutImageConsent(error, imageConsent) {
  if (!isMissingColumnError(error) || imageConsent !== true) return;
  throw new Error(
    'Não foi possível salvar o consentimento de uso de imagem porque as colunas image_consent/' +
    'image_consent_at não estão disponíveis no banco. Execute a migration ' +
    'supabase/migrations/20260901_patient_image_consent.sql antes de marcar o consentimento.'
  );
}

/**
 * Mesma lógica de assertCanFallbackWithoutImageConsent: CPF digitado que
 * some silenciosamente é pior do que quebrar na hora, porque a tela de
 * Pacientes da instituição passou a exigir esse campo.
 */
export function assertCanFallbackWithoutCpf(error, normalizedCpf) {
  if (!isMissingColumnError(error) || !normalizedCpf) return;
  throw new Error(
    'Não foi possível salvar o CPF porque a coluna cpf não está disponível no banco. ' +
    'Execute a migration supabase/migrations/20260901_patient_cpf.sql antes de cadastrar o CPF.'
  );
}

/**
 * CPF vazio é válido (documento nem sempre está em mãos no cadastro);
 * CPF preenchido e incorreto não é — silenciar um dígito errado é pior
 * do que recusar na hora, porque ninguém mais vai conferir depois.
 */
function assertValidCpfIfProvided(cpf) {
  if (cpf === undefined || cpf === null || String(cpf).trim() === '') return null;
  const normalized = normalizeCpf(cpf);
  if (!isValidCpf(normalized)) throw new Error('CPF inválido. Confira os números digitados.');
  return normalized;
}

export async function createPatient({ name, phone, birthDate, age, imageConsent, cpf }) {
  const user = await getAuthenticatedUser();
  if (!user) throw new Error('Usuário não autenticado.');
  const normalizedAge = normalizeAge(age);
  const normalizedCpf = assertValidCpfIfProvided(cpf);
  const consentGiven = imageConsent === true;
  const consentAt = consentGiven ? new Date().toISOString() : null;

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
      image_consent: consentGiven,
      image_consent_at: consentAt,
      cpf: normalizedCpf,
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
    image_consent: consentGiven,
    image_consent_at: consentAt,
    cpf: normalizedCpf,
  };
  if (hasSubmittedAge(age)) payload.age = normalizedAge;

  let { data, error } = await supabase
    .from('patients')
    .insert(payload)
    .select(PATIENT_SELECT_COLUMNS)
    .single();

  if (error && isMissingColumnError(error)) {
    assertCanFallbackWithoutPatientAge(error, age);
    assertCanFallbackWithoutImageConsent(error, imageConsent);
    assertCanFallbackWithoutCpf(error, normalizedCpf);
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
  const normalizedCpf = updates.cpf !== undefined ? assertValidCpfIfProvided(updates.cpf) : undefined;

  if (LOCAL_DEVELOPMENT_MODE && user?._isLocal) {
    const patients = getLocalPatients();
    const idx = patients.findIndex(p => p.id === patientId && p.therapist_id === user.id);
    if (idx === -1) throw new Error('Paciente não encontrado.');
    if (updates.name !== undefined) patients[idx].name = updates.name;
    if (updates.phone !== undefined) patients[idx].phone = updates.phone;
    if (updates.birthDate !== undefined) patients[idx].birth_date = updates.birthDate;
    if (updates.age !== undefined) patients[idx].age = normalizeAge(updates.age);
    if (updates.archivedAt !== undefined) patients[idx].archived_at = updates.archivedAt;
    if (updates.cpf !== undefined) patients[idx].cpf = normalizedCpf;
    if (updates.imageConsent !== undefined) {
      const consentGiven = updates.imageConsent === true;
      patients[idx].image_consent = consentGiven;
      patients[idx].image_consent_at = consentGiven ? new Date().toISOString() : null;
    }
    saveLocalPatients(patients);
    return patients[idx];
  }

  const payload = {};
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.phone !== undefined) payload.phone = updates.phone;
  if (updates.birthDate !== undefined) payload.birth_date = updates.birthDate;
  if (updates.age !== undefined) payload.age = normalizeAge(updates.age);
  if (updates.archivedAt !== undefined) payload.archived_at = updates.archivedAt;
  if (updates.cpf !== undefined) payload.cpf = normalizedCpf;
  if (updates.imageConsent !== undefined) {
    const consentGiven = updates.imageConsent === true;
    payload.image_consent = consentGiven;
    payload.image_consent_at = consentGiven ? new Date().toISOString() : null;
  }

  let { data, error } = await supabase
    .from('patients')
    .update(payload)
    .eq('id', patientId)
    .eq('therapist_id', user.id)
    .select(PATIENT_SELECT_COLUMNS)
    .single();

  if (error && isMissingColumnError(error)) {
    assertCanFallbackWithoutPatientAge(error, updates.age);
    assertCanFallbackWithoutImageConsent(error, updates.imageConsent);
    assertCanFallbackWithoutCpf(error, normalizedCpf);
    const fallbackPayload = { ...payload };
    delete fallbackPayload.age;
    delete fallbackPayload.archived_at;
    delete fallbackPayload.image_consent;
    delete fallbackPayload.image_consent_at;
    delete fallbackPayload.cpf;
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
