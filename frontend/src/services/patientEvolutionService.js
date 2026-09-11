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
 *
 * `idempotencyKey` é opcional, mas recomendado no registro avulso: um
 * retry de rede depois de "Adicionar sessão" reenvia a mesma chave e o
 * servidor devolve o registro já criado em vez de duplicar a sessão
 * (ver 20260911_patient_evolutions_hardening.sql). Quem chama deve
 * gerar a chave uma vez por tentativa de salvar e só trocar depois de
 * um sucesso — reaproveitar a cada chamada anula a proteção.
 */
export async function insertPatientEvolution({
  patientId,
  discipline,
  data,
  appointmentId = null,
  atendimentoEm = null,
  idempotencyKey = null,
}) {
  const user = await getAuthenticatedUser();
  if (!user) throw new Error('Usuário não autenticado.');
  if (!patientId) throw new Error('Paciente é obrigatório.');
  if (data === undefined || data === null) throw new Error('Conteúdo da evolução é obrigatório.');

  if (LOCAL_DEVELOPMENT_MODE && user._isLocal) {
    const patient = getLocalPatients().find(p => p.id === patientId && p.therapist_id === user.id);
    if (!patient) throw new Error('Paciente não encontrado.');

    const evolutions = getLocalEvolutions();

    if (idempotencyKey) {
      const replay = evolutions.find(item => item.therapist_id === user.id && item.idempotency_key === idempotencyKey);
      if (replay) {
        return {
          id: replay.id,
          atendimento_em: replay.atendimento_em,
          registrado_em: replay.registrado_em,
          attendance_status: replay.attendance_status,
          revision: replay.revision,
        };
      }
    }

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
      revision: 1,
      idempotency_key: idempotencyKey,
    };
    evolutions.push(record);
    saveLocalEvolutions(evolutions);
    return {
      id: record.id,
      atendimento_em: record.atendimento_em,
      registrado_em: record.registrado_em,
      attendance_status: record.attendance_status,
      revision: record.revision,
    };
  }

  const { data: response, error } = await supabase.rpc('insert_patient_evolution', {
    p_patient_id: patientId,
    p_discipline: discipline,
    p_data: typeof data === 'string' ? data : JSON.stringify(data),
    p_appointment_id: appointmentId,
    p_atendimento_em: atendimentoEm,
    p_idempotency_key: idempotencyKey,
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
 *
 * `expectedRevision` é obrigatório: compare-and-swap contra correção
 * concorrente (duas pessoas — ou duas abas — corrigindo a mesma sessão
 * ao mesmo tempo). Quem chama pega a revisão de `listPatientEvolutions`
 * (campo `revision` de cada linha); se o servidor responder com
 * ERRCODE 40001, a revisão mudou desde a leitura — recarregar antes de
 * tentar de novo, não reenviar cegamente.
 */
export async function updatePatientEvolution(evolutionId, data, expectedRevision) {
  const user = await getAuthenticatedUser();
  if (!user) throw new Error('Usuário não autenticado.');
  if (data === undefined || data === null) throw new Error('Conteúdo da evolução é obrigatório.');
  if (expectedRevision === undefined || expectedRevision === null) {
    throw new Error('Revisão esperada é obrigatória para corrigir a evolução.');
  }

  if (LOCAL_DEVELOPMENT_MODE && user._isLocal) {
    const evolutions = getLocalEvolutions();
    const index = evolutions.findIndex(item => item.id === evolutionId && item.therapist_id === user.id);
    if (index < 0) throw new Error('Acesso negado: evolução não pertence ao profissional autenticado.');
    if ((evolutions[index].revision || 1) !== expectedRevision) {
      throw new Error(
        `Conflito de revisão: esperado ${expectedRevision}, atual ${evolutions[index].revision || 1}. `
        + 'Alguém corrigiu esta evolução antes de você. Recarregue e aplique sua correção de novo.',
      );
    }
    const nextRevision = (evolutions[index].revision || 1) + 1;
    evolutions[index] = {
      ...evolutions[index], conteudo: data, updated_at: new Date().toISOString(), revision: nextRevision,
    };
    saveLocalEvolutions(evolutions);
    return { id: evolutionId, revision: nextRevision, updated_at: evolutions[index].updated_at };
  }

  const { data: response, error } = await supabase.rpc('update_patient_evolution', {
    p_evolution_id: evolutionId,
    p_data: typeof data === 'string' ? data : JSON.stringify(data),
    p_expected_revision: expectedRevision,
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
 * servidor), ordenadas pela data do atendimento. Cada linha traz
 * `revision`, usada por updatePatientEvolution para compare-and-swap.
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
      // Registros locais salvos antes da revisão existir (20260911)
      // não têm o campo — sem isso, a primeira correção mandaria
      // expectedRevision undefined pro compare-and-swap.
      .map(item => ({ ...item, revision: item.revision || 1 }))
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
