// ============================================================
// SERVICE: Pacientes da clínica + matrículas por disciplina
// Fase 2 do plano docs/plano-clinica-multidisciplinar.md.
//
// O paciente é UM (da clínica); "enviar para outra área" cria uma
// MATRÍCULA (patient_enrollments) — nunca copia/clona o paciente.
// Matrícula é metadado: quem é de outra disciplina vê o cadastro e
// que o paciente "está em atendimento" lá, nunca conteúdo clínico.
//
// Sem a migração 20260708 aplicada, as funções falham com erro
// EXPLÍCITO citando a migração (nada de fallback silencioso).
// Login local (teste) usa localStorage, como o patientService.
// ============================================================

import { supabase, getAuthenticatedUser } from '../lib/supabase';
import { LOCAL_DEVELOPMENT_MODE } from '../lib/localDevelopmentMode';
import { DISCIPLINE_IDS, getDiscipline } from '../data/disciplines';

const LOCAL_ENROLLMENTS_KEY = 'acup_local_patient_enrollments';
const LOCAL_PATIENTS_KEY = 'acup_local_patients';

export const ENROLLMENT_MIGRATION_HINT =
  'Estrutura de matrículas ausente no banco. Aplique a migração ' +
  'supabase/migrations/20260708_clinic_patients_enrollments.sql no Supabase.';

// Erro de schema desatualizado (tabela/coluna da Fase 2 inexistente).
export function isMissingEnrollmentSchemaError(error) {
  const text = [error?.message, error?.details, error?.hint, error?.code]
    .filter(Boolean)
    .join(' ');
  return /patient_enrollments|clinic_id/.test(text)
    && /does not exist|schema cache|Could not find/i.test(text);
}

export function assertValidDiscipline(disciplineId) {
  if (!DISCIPLINE_IDS.includes(disciplineId)) {
    throw new Error(`Disciplina inválida: ${disciplineId || '(vazia)'}.`);
  }
}

// Disciplinas em que o paciente ainda NÃO está matriculado.
export function missingDisciplines(enrollments = []) {
  const enrolled = new Set((enrollments || []).map(item => item.discipline));
  return DISCIPLINE_IDS.filter(id => !enrolled.has(id));
}

export function enrollmentStatusLabel(status) {
  return { active: 'em atendimento', paused: 'pausado', discharged: 'alta' }[status] || status;
}

// ---------- helpers localStorage (login local de teste) ----------

function getLocalEnrollments() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_ENROLLMENTS_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveLocalEnrollments(enrollments) {
  localStorage.setItem(LOCAL_ENROLLMENTS_KEY, JSON.stringify(enrollments));
}

function getLocalPatients() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_PATIENTS_KEY) || '[]');
  } catch {
    return [];
  }
}

// ---------- API pública ----------

/**
 * Lista os pacientes visíveis da clínica com as matrículas de cada um.
 * RLS decide o alcance: os próprios + os da clínica que compartilham
 * disciplina com o usuário (cadastro apenas — nunca conteúdo clínico).
 */
export async function listClinicPatients() {
  const user = await getAuthenticatedUser();
  if (!user) throw new Error('Usuário não autenticado.');

  if (LOCAL_DEVELOPMENT_MODE && user._isLocal) {
    const enrollments = getLocalEnrollments();
    return getLocalPatients()
      .filter(patient => !patient.archived_at)
      .map(patient => ({
        ...patient,
        enrollments: enrollments.filter(item => item.patient_id === patient.id),
      }));
  }

  const { data, error } = await supabase
    .from('patients')
    .select('id,name,phone,age,birth_date,archived_at,created_at,therapist_id,clinic_id,patient_enrollments(id,discipline,status,note,created_at)')
    .is('archived_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    if (isMissingEnrollmentSchemaError(error)) throw new Error(ENROLLMENT_MIGRATION_HINT);
    throw error;
  }

  return (data || [])
    .map(({ patient_enrollments: enrollments, ...patient }) => ({
      ...patient,
      enrollments: enrollments || [],
    }));
}

/**
 * Matricula o paciente em uma disciplina ("enviar para outra área").
 * NUNCA copia o paciente: cria só o vínculo. A nota é o texto de
 * encaminhamento (opcional). clinic_id/referred_by são preenchidos
 * por trigger no banco.
 */
export async function enrollPatient(patientId, disciplineId, { note } = {}) {
  assertValidDiscipline(disciplineId);
  const user = await getAuthenticatedUser();
  if (!user) throw new Error('Usuário não autenticado.');

  if (LOCAL_DEVELOPMENT_MODE && user._isLocal) {
    const enrollments = getLocalEnrollments();
    if (enrollments.some(item => item.patient_id === patientId && item.discipline === disciplineId)) {
      throw new Error(`Paciente já está na área de ${getDiscipline(disciplineId)?.label || disciplineId}.`);
    }
    const enrollment = {
      id: `local-enroll-${Date.now()}`,
      patient_id: patientId,
      discipline: disciplineId,
      status: 'active',
      note: note || null,
      referred_by: user.id,
      created_at: new Date().toISOString(),
    };
    saveLocalEnrollments([enrollment, ...enrollments]);
    return enrollment;
  }

  const { data, error } = await supabase
    .from('patient_enrollments')
    .insert({ patient_id: patientId, discipline: disciplineId, note: note || null })
    .select()
    .single();

  if (error) {
    if (isMissingEnrollmentSchemaError(error)) throw new Error(ENROLLMENT_MIGRATION_HINT);
    if (String(error.code) === '23505') {
      throw new Error(`Paciente já está na área de ${getDiscipline(disciplineId)?.label || disciplineId}.`);
    }
    throw error;
  }
  return data;
}

/**
 * Matrícula inicial ao cadastrar paciente (workspace ou tela da clínica).
 * Best-effort tolerante a migração pendente: o cadastro do paciente não
 * pode falhar por causa da matrícula — a pendência fica VISÍVEL na tela
 * de pacientes da clínica (chip "sem matrícula" + ação de matricular).
 */
export async function enrollPatientInitial(patientId, disciplineId) {
  try {
    return await enrollPatient(patientId, disciplineId);
  } catch (error) {
    console.warn('Matrícula inicial não criada:', error?.message || error);
    return null;
  }
}
