// ============================================================
// SERVICE: Evolução vinculada ao atendimento — acesso via RPC
// Migração: supabase/migrations/20260903_patient_evolutions.sql
//
// Diferente do JSON solto em clinical_records (state.evolucoes), aqui
// a data do atendimento vem do agendamento e é travada no servidor —
// ver comentário da migração para o porquê. Login local (teste) usa
// localStorage e replica as mesmas regras (senão o modo local mentiria
// sobre o comportamento real).
// ============================================================

import { supabase, getAuthenticatedUser } from '../lib/supabase';
import { LOCAL_DEVELOPMENT_MODE } from '../lib/localDevelopmentMode';

export const LOCAL_PATIENT_EVOLUTIONS_KEY = 'acup_local_patient_evolutions';
const LOCAL_APPOINTMENTS_KEY = 'acup_local_appointments';
const LOCAL_PATIENTS_KEY = 'acup_local_patients';

export const PATIENT_EVOLUTIONS_MIGRATION_HINT =
  'Estrutura de evolução vinculada ao atendimento ausente no banco. Aplique a migração ' +
  'supabase/migrations/20260903_patient_evolutions.sql no Supabase.';

export function isMissingPatientEvolutionsRpc(error) {
  const text = [error?.message, error?.details, error?.hint, error?.code]
    .filter(Boolean)
    .join(' ');
  return /insert_patient_evolution|update_patient_evolution|list_patient_evolutions|patient_evolutions/.test(text)
    && /does not exist|schema cache|Could not find|PGRST202/i.test(text);
}

// ---------- fallback local ----------

function getLocalEvolutions() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_PATIENT_EVOLUTIONS_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveLocalEvolutions(list) {
  localStorage.setItem(LOCAL_PATIENT_EVOLUTIONS_KEY, JSON.stringify(list));
}

function getLocalAppointments() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_APPOINTMENTS_KEY) || '[]');
  } catch {
    return [];
  }
}

function getLocalPatients() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_PATIENTS_KEY) || '[]');
  } catch {
    return [];
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
 * Registra uma evolução. Quando `appointmentId` é informado, a data/hora
 * do atendimento e o status (atendido/faltou/falta justificada) vêm do
 * agendamento — o que for passado em `atendimentoEm` é ignorado pelo
 * servidor nesse caso. Sem `appointmentId` (atendimento avulso), a data
 * é a informada, e o status é sempre "atendido".
 */
export async function insertPatientEvolution({
  patientId,
  discipline,
  data,
  appointmentId = null,
  atendimentoEm = null,
}) {
  const user = await getAuthenticatedUser();
  if (!user) throw new Error('Usuário não autenticado.');
  if (!patientId) throw new Error('Paciente é obrigatório.');
  if (data === undefined || data === null) throw new Error('Conteúdo da evolução é obrigatório.');

  if (LOCAL_DEVELOPMENT_MODE && user._isLocal) {
    const patient = getLocalPatients().find(p => p.id === patientId && p.therapist_id === user.id);
    if (!patient) throw new Error('Paciente não encontrado.');

    let resolvedAtendimentoEm = atendimentoEm;
    let attendanceStatus = 'attended';

    if (appointmentId) {
      const appointment = getLocalAppointments().find(a => a.id === appointmentId);
      if (!appointment) throw new Error('Agendamento não encontrado.');
      if (appointment.patient_id !== patientId || appointment.professional_id !== user.id) {
        throw new Error('Acesso negado: agendamento não pertence ao profissional autenticado para este paciente.');
      }
      if (!['attended', 'no_show', 'excused'].includes(appointment.status)) {
        throw new Error(
          'Só é possível registrar evolução para um agendamento concluído (atendido, falta ou falta justificada).',
        );
      }
      const evolutions = getLocalEvolutions();
      if (evolutions.some(item => item.appointment_id === appointmentId)) {
        throw new Error('Este agendamento já tem uma evolução registrada.');
      }
      resolvedAtendimentoEm = appointment.starts_at;
      attendanceStatus = appointment.status;
    } else {
      if (!atendimentoEm) throw new Error('Data do atendimento é obrigatória para registro avulso.');
      if (new Date(atendimentoEm).getTime() > Date.now()) {
        throw new Error('Data do atendimento não pode ser no futuro.');
      }
    }

    const now = new Date().toISOString();
    const record = {
      id: generateUUID(),
      patient_id: patientId,
      therapist_id: user.id,
      discipline,
      appointment_id: appointmentId,
      attendance_status: attendanceStatus,
      atendimento_em: resolvedAtendimentoEm,
      conteudo: data,
      registrado_em: now,
      created_at: now,
      updated_at: now,
    };
    const evolutions = getLocalEvolutions();
    evolutions.push(record);
    saveLocalEvolutions(evolutions);
    return {
      id: record.id,
      atendimento_em: record.atendimento_em,
      registrado_em: record.registrado_em,
      attendance_status: record.attendance_status,
    };
  }

  const { data: response, error } = await supabase.rpc('insert_patient_evolution', {
    p_patient_id: patientId,
    p_discipline: discipline,
    p_data: typeof data === 'string' ? data : JSON.stringify(data),
    p_appointment_id: appointmentId,
    p_atendimento_em: atendimentoEm,
  });

  if (error) {
    if (isMissingPatientEvolutionsRpc(error)) throw new Error(PATIENT_EVOLUTIONS_MIGRATION_HINT);
    throw new Error(error.message || 'Não foi possível registrar a evolução.');
  }

  const record = Array.isArray(response) ? response[0] : response;
  return record;
}

/**
 * Corrige o conteúdo de uma evolução já registrada. Data do atendimento
 * e data de registro nunca mudam — o servidor rejeita (ver migração).
 */
export async function updatePatientEvolution(evolutionId, data) {
  const user = await getAuthenticatedUser();
  if (!user) throw new Error('Usuário não autenticado.');
  if (data === undefined || data === null) throw new Error('Conteúdo da evolução é obrigatório.');

  if (LOCAL_DEVELOPMENT_MODE && user._isLocal) {
    const evolutions = getLocalEvolutions();
    const index = evolutions.findIndex(item => item.id === evolutionId && item.therapist_id === user.id);
    if (index < 0) throw new Error('Acesso negado: evolução não pertence ao profissional autenticado.');
    evolutions[index] = { ...evolutions[index], conteudo: data, updated_at: new Date().toISOString() };
    saveLocalEvolutions(evolutions);
    return { id: evolutionId, updated_at: evolutions[index].updated_at };
  }

  const { data: response, error } = await supabase.rpc('update_patient_evolution', {
    p_evolution_id: evolutionId,
    p_data: typeof data === 'string' ? data : JSON.stringify(data),
  });

  if (error) {
    if (isMissingPatientEvolutionsRpc(error)) throw new Error(PATIENT_EVOLUTIONS_MIGRATION_HINT);
    throw new Error(error.message || 'Não foi possível corrigir a evolução.');
  }

  const record = Array.isArray(response) ? response[0] : response;
  return record;
}

/**
 * Lista as evoluções de um paciente (conteúdo já descriptografado pelo
 * servidor), ordenadas pela data do atendimento.
 */
export async function listPatientEvolutions(patientId, discipline = null) {
  const user = await getAuthenticatedUser();
  if (!user) throw new Error('Usuário não autenticado.');
  if (!patientId) return [];

  if (LOCAL_DEVELOPMENT_MODE && user._isLocal) {
    return getLocalEvolutions()
      .filter(item => (
        item.patient_id === patientId
        && item.therapist_id === user.id
        && (!discipline || item.discipline === discipline)
      ))
      .sort((a, b) => new Date(a.atendimento_em) - new Date(b.atendimento_em));
  }

  const { data, error } = await supabase.rpc('list_patient_evolutions', {
    p_patient_id: patientId,
    p_discipline: discipline,
  });

  if (error) {
    if (isMissingPatientEvolutionsRpc(error)) throw new Error(PATIENT_EVOLUTIONS_MIGRATION_HINT);
    throw new Error(error.message || 'Não foi possível carregar as evoluções.');
  }

  return data || [];
}
