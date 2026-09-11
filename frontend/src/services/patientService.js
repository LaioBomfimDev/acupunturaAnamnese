// ============================================================
// SERVICE: Gerenciamento de pacientes
// CRUD completo — usa Supabase quando autenticado de verdade,
// ou localStorage quando o login é local (mock/fallback).
// ============================================================

import { supabase, getAuthenticatedUser } from '../lib/supabase';
import { LOCAL_DEVELOPMENT_MODE } from '../lib/localDevelopmentMode';

const LOCAL_PATIENTS_KEY = 'acup_local_patients';
const PATIENT_SELECT_COLUMNS =
  'id,therapist_id,name,phone,birth_date,age,archived_at,created_at,clinic_id,image_consent,image_consent_at,cpf,' +
  'nome_social,nome_mae,nome_pai,nome_conjuge,sexo_biologico,genero,' +
  'responsavel_nome,responsavel_telefone,responsavel_cpf,' +
  'convenio_nome,convenio_carteirinha,' +
  'endereco_cep,endereco_logradouro,endereco_numero,endereco_complemento,endereco_bairro,endereco_cidade,endereco_uf';

// Usado só no fallback de migração pendente (isMissingColumnError): não
// pode repetir PATIENT_SELECT_COLUMNS, senão o próprio re-select falha
// pela mesma coluna ausente que causou o fallback.
const LEGACY_PATIENT_SELECT_COLUMNS = 'id,therapist_id,name,phone,birth_date,created_at';

// Colunas do cadastro adicionadas em 20260910_patient_registration_open_clinic.sql —
// usado pra montar o payload de insert/update sem repetir a lista em cada função,
// e pra detectar de forma explícita quando a migração ainda não foi aplicada.
const REGISTRATION_FIELD_TO_COLUMN = {
  nomeSocial: 'nome_social',
  nomeMae: 'nome_mae',
  nomePai: 'nome_pai',
  nomeConjuge: 'nome_conjuge',
  sexoBiologico: 'sexo_biologico',
  genero: 'genero',
  responsavelNome: 'responsavel_nome',
  responsavelTelefone: 'responsavel_telefone',
  responsavelCpf: 'responsavel_cpf',
  convenioNome: 'convenio_nome',
  convenioCarteirinha: 'convenio_carteirinha',
  enderecoCep: 'endereco_cep',
  enderecoLogradouro: 'endereco_logradouro',
  enderecoNumero: 'endereco_numero',
  enderecoComplemento: 'endereco_complemento',
  enderecoBairro: 'endereco_bairro',
  enderecoCidade: 'endereco_cidade',
  enderecoUf: 'endereco_uf',
};

function buildRegistrationFieldsPayload(fields = {}) {
  const payload = {};
  for (const [key, column] of Object.entries(REGISTRATION_FIELD_TO_COLUMN)) {
    if (fields[key] !== undefined) payload[column] = fields[key] || null;
  }
  return payload;
}

/**
 * Idade calculada a partir da data de nascimento — fonte única usada
 * tanto pra exibir quanto pra decidir se o responsável é obrigatório.
 */
export function calculateAgeFromBirthDate(birthDate) {
  if (!birthDate) return null;
  const birth = new Date(`${birthDate}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const hasHadBirthdayThisYear =
    today.getMonth() > birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age >= 0 ? age : null;
}

export function isMinor(birthDate) {
  const age = calculateAgeFromBirthDate(birthDate);
  return age !== null && age < 18;
}

/**
 * Paciente menor de idade sem nome/telefone/CPF do responsável é um
 * cadastro incompleto que ninguém mais vai perceber depois — recusar na
 * hora é mais seguro do que silenciar (mesmo raciocínio de
 * assertCanFallbackWithoutImageConsent/assertCanFallbackWithoutCpf).
 */
export function assertResponsavelRequiredIfMinor(birthDate, responsavel = {}) {
  if (!isMinor(birthDate)) return;
  const { nome, telefone, cpf } = responsavel || {};
  if (!String(nome || '').trim() || !String(telefone || '').trim() || !String(cpf || '').trim()) {
    throw new Error(
      'Paciente menor de idade: informe nome, telefone e CPF do responsável.'
    );
  }
}

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
    const p = getLocalPatients().find(p => p.id === patientId);
    if (!p) throw new Error('Paciente não encontrado.');
    return p;
  }

  // Sem filtro por therapist_id: o cadastro é aberto à clínica inteira
  // (20260910_patient_registration_open_clinic.sql) — a RLS decide
  // quem pode ver este paciente, não o client.
  const { data, error } = await supabase
    .from('patients')
    .select(PATIENT_SELECT_COLUMNS)
    .eq('id', patientId)
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
 * Mesmo raciocínio: nome social, filiação, responsável, convênio e
 * endereço preenchidos que somem silenciosamente por falta da migração
 * são piores do que a tela quebrar na hora.
 */
export function assertCanFallbackWithoutRegistrationFields(error, registrationFields = {}) {
  if (!isMissingColumnError(error)) return;
  const hasAnyValue = Object.values(registrationFields).some(value => value !== null && value !== undefined);
  if (!hasAnyValue) return;
  throw new Error(
    'Não foi possível salvar os novos campos do cadastro (endereço, responsável, convênio etc.) ' +
    'porque as colunas ainda não estão disponíveis no banco. Execute a migration ' +
    'supabase/migrations/20260910_patient_registration_open_clinic.sql antes de preenchê-los.'
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

export async function createPatient({
  name, phone, birthDate, age, imageConsent, cpf,
  nomeSocial, nomeMae, nomePai, nomeConjuge, sexoBiologico, genero,
  responsavelNome, responsavelTelefone, responsavelCpf,
  convenioNome, convenioCarteirinha,
  enderecoCep, enderecoLogradouro, enderecoNumero, enderecoComplemento, enderecoBairro, enderecoCidade, enderecoUf,
}) {
  const user = await getAuthenticatedUser();
  if (!user) throw new Error('Usuário não autenticado.');
  const normalizedAge = normalizeAge(age !== undefined ? age : calculateAgeFromBirthDate(birthDate));
  const normalizedCpf = assertValidCpfIfProvided(cpf);
  const consentGiven = imageConsent === true;
  const consentAt = consentGiven ? new Date().toISOString() : null;
  assertResponsavelRequiredIfMinor(birthDate, { nome: responsavelNome, telefone: responsavelTelefone, cpf: responsavelCpf });
  const registrationFields = buildRegistrationFieldsPayload({
    nomeSocial, nomeMae, nomePai, nomeConjuge, sexoBiologico, genero,
    responsavelNome, responsavelTelefone, responsavelCpf,
    convenioNome, convenioCarteirinha,
    enderecoCep, enderecoLogradouro, enderecoNumero, enderecoComplemento, enderecoBairro, enderecoCidade, enderecoUf,
  });

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
      ...registrationFields,
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
    ...registrationFields,
  };
  if (hasSubmittedAge(age) || birthDate) payload.age = normalizedAge;

  let { data, error } = await supabase
    .from('patients')
    .insert(payload)
    .select(PATIENT_SELECT_COLUMNS)
    .single();

  if (error && isMissingColumnError(error)) {
    assertCanFallbackWithoutPatientAge(error, age);
    assertCanFallbackWithoutImageConsent(error, imageConsent);
    assertCanFallbackWithoutCpf(error, normalizedCpf);
    assertCanFallbackWithoutRegistrationFields(error, registrationFields);
    const { data: fallbackData, error: fallbackError } = await supabase
      .from('patients')
      .insert({
        therapist_id: user.id,
        name,
        phone: phone || null,
        birth_date: birthDate || null,
      })
      .select(LEGACY_PATIENT_SELECT_COLUMNS)
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
  if (updates.birthDate !== undefined || updates.responsavelNome !== undefined
    || updates.responsavelTelefone !== undefined || updates.responsavelCpf !== undefined) {
    assertResponsavelRequiredIfMinor(updates.birthDate, {
      nome: updates.responsavelNome,
      telefone: updates.responsavelTelefone,
      cpf: updates.responsavelCpf,
    });
  }
  const registrationFields = buildRegistrationFieldsPayload(updates);

  if (LOCAL_DEVELOPMENT_MODE && user?._isLocal) {
    const patients = getLocalPatients();
    const idx = patients.findIndex(p => p.id === patientId);
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
    Object.assign(patients[idx], registrationFields);
    saveLocalPatients(patients);
    return patients[idx];
  }

  const payload = { ...registrationFields };
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

  // Sem filtro por therapist_id: o cadastro é editável por qualquer
  // profissional ativo da clínica (20260910_patient_registration_open_clinic.sql)
  // — a RLS de UPDATE decide quem pode escrever, não o client.
  let { data, error } = await supabase
    .from('patients')
    .update(payload)
    .eq('id', patientId)
    .select(PATIENT_SELECT_COLUMNS)
    .single();

  if (error && isMissingColumnError(error)) {
    assertCanFallbackWithoutPatientAge(error, updates.age);
    assertCanFallbackWithoutImageConsent(error, updates.imageConsent);
    assertCanFallbackWithoutCpf(error, normalizedCpf);
    assertCanFallbackWithoutRegistrationFields(error, registrationFields);
    const fallbackPayload = { ...payload };
    delete fallbackPayload.age;
    delete fallbackPayload.archived_at;
    delete fallbackPayload.image_consent;
    delete fallbackPayload.image_consent_at;
    delete fallbackPayload.cpf;
    for (const column of Object.values(REGISTRATION_FIELD_TO_COLUMN)) delete fallbackPayload[column];
    const { data: fallbackData, error: fallbackError } = await supabase
      .from('patients')
      .update(fallbackPayload)
      .eq('id', patientId)
      .select(LEGACY_PATIENT_SELECT_COLUMNS)
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
