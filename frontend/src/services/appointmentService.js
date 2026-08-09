// ============================================================
// SERVICE: Agenda / agendamentos
// Migração: supabase/migrations/20260809_appointments.sql
//
// Agendamento é dado ADMINISTRATIVO (quem, quando, com quem). Nada aqui
// lê ou escreve prontuário — o registro clínico continua criptografado
// na sua própria tabela, com o seu próprio caminho de gravação.
//
// A autoridade sobre dupla marcação é o banco (constraint
// appointments_no_overlap). A checagem no cliente existe só para dar
// mensagem melhor antes da ida ao servidor.
//
// Sem a migração aplicada → erro EXPLÍCITO citando o arquivo.
// Login local (teste) usa localStorage.
// ============================================================

import { supabase, getAuthenticatedUser } from '../lib/supabase';
import { LOCAL_DEVELOPMENT_MODE } from '../lib/localDevelopmentMode';
import { DISCIPLINE_IDS } from '../data/disciplines';
import { APPOINTMENT_STATUS_IDS, findOverlap } from '../utils/agenda';

const LOCAL_APPOINTMENTS_KEY = 'acup_local_appointments';

const APPOINTMENT_COLUMNS =
  'id,clinic_id,patient_id,professional_id,discipline,starts_at,ends_at,status,note,cancellation_reason,created_by,created_at,updated_at';

export const AGENDA_MIGRATION_HINT =
  'Estrutura de agenda ausente no banco. Aplique a migração ' +
  'supabase/migrations/20260809_appointments.sql no Supabase.';

export function isMissingAgendaSchemaError(error) {
  const text = [error?.message, error?.details, error?.hint, error?.code]
    .filter(Boolean)
    .join(' ');
  return /appointments|can_manage_agenda/.test(text)
    && /does not exist|schema cache|Could not find/i.test(text);
}

/**
 * Traduz o erro da constraint de exclusão. O Postgres devolve algo como
 * 'conflicting key value violates exclusion constraint', que não diz
 * nada para quem está na recepção.
 */
export function isOverlapError(error) {
  const text = [error?.message, error?.details, error?.code].filter(Boolean).join(' ');
  return /appointments_no_overlap/.test(text) || error?.code === '23P01';
}

function assertValid(input) {
  if (!input?.patientId) throw new Error('Selecione o paciente.');
  if (!input?.professionalId) throw new Error('Selecione o profissional.');
  if (!DISCIPLINE_IDS.includes(input?.discipline)) {
    throw new Error(`Disciplina inválida: ${input?.discipline || '(vazia)'}.`);
  }

  const start = new Date(input?.startsAt);
  const end = new Date(input?.endsAt);
  if (Number.isNaN(start.getTime())) throw new Error('Início do atendimento inválido.');
  if (Number.isNaN(end.getTime())) throw new Error('Término do atendimento inválido.');
  if (end <= start) throw new Error('O término precisa ser depois do início.');

  return { start, end };
}

function assertStatus(status) {
  if (!APPOINTMENT_STATUS_IDS.includes(status)) {
    throw new Error(`Status de agendamento inválido: ${status || '(vazio)'}.`);
  }
}

// ---------- fallback local ----------

function getLocalAppointments() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_APPOINTMENTS_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveLocalAppointments(list) {
  localStorage.setItem(LOCAL_APPOINTMENTS_KEY, JSON.stringify(list));
}

// ---------- API pública ----------

/**
 * Agendamentos da instituição num intervalo. `from` e `to` são
 * instantes (ISO), não datas soltas: o calendário monta o intervalo do
 * mês visível no fuso local e manda pronto.
 */
export async function listAppointments({ from, to, professionalId = null, runtime } = {}) {
  const client = {
    getAuthenticatedUser: runtime?.getAuthenticatedUser || getAuthenticatedUser,
    from: runtime?.from || ((table) => supabase.from(table)),
  };

  const user = await client.getAuthenticatedUser();

  if (LOCAL_DEVELOPMENT_MODE && user?._isLocal) {
    const start = from ? new Date(from).getTime() : -Infinity;
    const end = to ? new Date(to).getTime() : Infinity;
    return getLocalAppointments()
      .filter(item => {
        const itemStart = new Date(item.starts_at).getTime();
        if (itemStart < start || itemStart > end) return false;
        return !professionalId || item.professional_id === professionalId;
      })
      .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  }

  let query = client.from('appointments').select(APPOINTMENT_COLUMNS);
  if (from) query = query.gte('starts_at', new Date(from).toISOString());
  if (to) query = query.lte('starts_at', new Date(to).toISOString());
  if (professionalId) query = query.eq('professional_id', professionalId);

  const { data, error } = await query.order('starts_at', { ascending: true });

  if (error) {
    if (isMissingAgendaSchemaError(error)) throw new Error(AGENDA_MIGRATION_HINT);
    throw new Error(error.message || 'Não foi possível carregar a agenda.');
  }

  return data || [];
}

/**
 * Cria um agendamento. `knownAppointments` é opcional e serve só para
 * avisar de conflito antes do round-trip; o banco continua decidindo.
 */
export async function createAppointment(input, { knownAppointments = null, runtime } = {}) {
  const { start, end } = assertValid(input);

  const client = {
    getAuthenticatedUser: runtime?.getAuthenticatedUser || getAuthenticatedUser,
    from: runtime?.from || ((table) => supabase.from(table)),
  };

  const payload = {
    patient_id: input.patientId,
    professional_id: input.professionalId,
    discipline: input.discipline,
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
    status: input.status || 'scheduled',
    note: input.note?.trim() || null,
  };
  assertStatus(payload.status);

  if (knownAppointments) {
    const conflict = findOverlap(knownAppointments, {
      ...payload,
      professional_id: payload.professional_id,
    });
    if (conflict) {
      throw new Error('Esse profissional já tem atendimento nesse horário.');
    }
  }

  const user = await client.getAuthenticatedUser();

  if (LOCAL_DEVELOPMENT_MODE && user?._isLocal) {
    const list = getLocalAppointments();
    const record = {
      ...payload,
      id: `local-${Date.now()}`,
      clinic_id: 'local-clinic',
      created_by: user.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      cancellation_reason: null,
    };
    list.push(record);
    saveLocalAppointments(list);
    return record;
  }

  const { data, error } = await client.from('appointments')
    .insert(payload)
    .select(APPOINTMENT_COLUMNS)
    .single();

  if (error) {
    if (isMissingAgendaSchemaError(error)) throw new Error(AGENDA_MIGRATION_HINT);
    if (isOverlapError(error)) {
      throw new Error('Esse profissional já tem atendimento nesse horário.');
    }
    throw new Error(error.message || 'Não foi possível criar o agendamento.');
  }

  return data;
}

/**
 * Muda o status. É o caminho normal de "cancelar": apagar destruiria o
 * histórico de que o BI depende, então cancelamento é estado, não
 * exclusão.
 */
export async function updateAppointmentStatus(id, status, { reason = null, runtime } = {}) {
  if (!id) throw new Error('Agendamento não informado.');
  assertStatus(status);

  const client = {
    getAuthenticatedUser: runtime?.getAuthenticatedUser || getAuthenticatedUser,
    from: runtime?.from || ((table) => supabase.from(table)),
  };

  const patch = { status };
  if (status === 'cancelled') patch.cancellation_reason = reason?.trim() || null;

  const user = await client.getAuthenticatedUser();

  if (LOCAL_DEVELOPMENT_MODE && user?._isLocal) {
    const list = getLocalAppointments();
    const found = list.find(item => item.id === id);
    if (!found) throw new Error('Agendamento não encontrado.');
    Object.assign(found, patch, { updated_at: new Date().toISOString() });
    saveLocalAppointments(list);
    return found;
  }

  const { data, error } = await client.from('appointments')
    .update(patch)
    .eq('id', id)
    .select(APPOINTMENT_COLUMNS)
    .single();

  if (error) {
    if (isMissingAgendaSchemaError(error)) throw new Error(AGENDA_MIGRATION_HINT);
    throw new Error(error.message || 'Não foi possível atualizar o agendamento.');
  }

  return data;
}

/** Remarca (muda horário) mantendo o mesmo agendamento e seu histórico. */
export async function rescheduleAppointment(id, { startsAt, endsAt, runtime } = {}) {
  if (!id) throw new Error('Agendamento não informado.');

  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error('Horário inválido.');
  }
  if (end <= start) throw new Error('O término precisa ser depois do início.');

  const client = {
    getAuthenticatedUser: runtime?.getAuthenticatedUser || getAuthenticatedUser,
    from: runtime?.from || ((table) => supabase.from(table)),
  };

  const user = await client.getAuthenticatedUser();
  const patch = { starts_at: start.toISOString(), ends_at: end.toISOString() };

  if (LOCAL_DEVELOPMENT_MODE && user?._isLocal) {
    const list = getLocalAppointments();
    const found = list.find(item => item.id === id);
    if (!found) throw new Error('Agendamento não encontrado.');
    Object.assign(found, patch, { updated_at: new Date().toISOString() });
    saveLocalAppointments(list);
    return found;
  }

  const { data, error } = await client.from('appointments')
    .update(patch)
    .eq('id', id)
    .select(APPOINTMENT_COLUMNS)
    .single();

  if (error) {
    if (isMissingAgendaSchemaError(error)) throw new Error(AGENDA_MIGRATION_HINT);
    if (isOverlapError(error)) {
      throw new Error('Esse profissional já tem atendimento nesse horário.');
    }
    throw new Error(error.message || 'Não foi possível remarcar.');
  }

  return data;
}
