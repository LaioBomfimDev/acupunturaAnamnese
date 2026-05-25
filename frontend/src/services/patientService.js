// ============================================================
// SERVICE: Gerenciamento de pacientes
// CRUD completo — usa Supabase quando autenticado de verdade,
// ou localStorage quando o login é local (mock/fallback).
// ============================================================

import { supabase, getAuthenticatedUser } from '../lib/supabase';

const LOCAL_PATIENTS_KEY = 'acup_local_patients';
const LOCAL_RECORDS_KEY = 'acup_local_clinical_records';

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

function deleteLocalClinicalRecords(patientId) {
  try {
    const records = JSON.parse(localStorage.getItem(LOCAL_RECORDS_KEY) || '[]');
    localStorage.setItem(
      LOCAL_RECORDS_KEY,
      JSON.stringify(records.filter(record => record.patient_id !== patientId))
    );
  } catch {
    localStorage.setItem(LOCAL_RECORDS_KEY, '[]');
  }
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
  if (user?._isLocal) {
    return getLocalPatientsForUser(user).filter(patient => !patient.archived_at);
  }

  const { data, error } = await supabase
    .from('patients')
    .select('*')
    .eq('therapist_id', user.id)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).filter(patient => !patient.archived_at);
}

/**
 * Busca um paciente pelo ID.
 */
export async function getPatient(patientId) {
  const user = await getAuthenticatedUser();
  if (!user) throw new Error('Usuário não autenticado.');
  if (user?._isLocal) {
    const p = getLocalPatientsForUser(user).find(p => p.id === patientId);
    if (!p) throw new Error('Paciente não encontrado.');
    return p;
  }

  const { data, error } = await supabase
    .from('patients')
    .select('*')
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
function isMissingColumnError(error) {
  return /column .* does not exist|schema cache|Could not find .* column/i.test(error?.message || '');
}

function normalizeAge(age) {
  if (age === undefined || age === null || age === '') return null;
  const parsed = Number.parseInt(age, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export async function createPatient({ name, phone, birthDate, age }) {
  const user = await getAuthenticatedUser();
  if (!user) throw new Error('Usuário não autenticado.');
  const normalizedAge = normalizeAge(age);

  if (user._isLocal) {
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
    age: normalizedAge,
  };

  let { data, error } = await supabase
    .from('patients')
    .insert(payload)
    .select()
    .single();

  if (error && isMissingColumnError(error)) {
    const { data: fallbackData, error: fallbackError } = await supabase
      .from('patients')
      .insert({
        therapist_id: user.id,
        name,
        phone: phone || null,
        birth_date: birthDate || null,
      })
      .select()
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
  if (user?._isLocal) {
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
    .select()
    .single();

  if (error && isMissingColumnError(error)) {
    const fallbackPayload = { ...payload };
    delete fallbackPayload.age;
    delete fallbackPayload.archived_at;
    const { data: fallbackData, error: fallbackError } = await supabase
      .from('patients')
      .update(fallbackPayload)
      .eq('id', patientId)
      .eq('therapist_id', user.id)
      .select()
      .single();
    data = fallbackData;
    error = fallbackError;
  }

  if (error) throw error;
  return data;
}

/**
 * Remove um paciente (cascata deleta todas as fichas clínicas).
 */
export async function deletePatient(patientId) {
  const user = await getAuthenticatedUser();
  if (!user) throw new Error('Usuário não autenticado.');
  if (user?._isLocal) {
    const patients = getLocalPatients();
    const patient = patients.find(p => p.id === patientId && p.therapist_id === user.id);
    if (!patient) throw new Error('Paciente não encontrado.');
    const nextPatients = patients.filter(p => p.id !== patientId);
    saveLocalPatients(nextPatients);
    deleteLocalClinicalRecords(patientId);
    return;
  }

  const { error } = await supabase
    .from('patients')
    .delete()
    .eq('id', patientId)
    .eq('therapist_id', user.id);

  if (error) throw error;
}
