// ============================================================
// SERVICE: Jornada de trabalho e feriados
// Migração: supabase/migrations/20260810_agenda_operacao.sql
//
// A jornada define o que é DENTRO DO NORMAL, não o que é permitido.
// Marcar fora dela continua possível — a tela avisa, pede confirmação
// dupla e grava a exceção (docs/plano-agenda-gestao-clinica.md §6.1).
//
// TIME é hora de parede local, tratada como texto 'HH:MM'. Nunca passe
// esses campos por new Date(): expediente é 08:00 no relógio da clínica,
// não um instante em UTC.
//
// Sem a migração aplicada → erro EXPLÍCITO citando o arquivo.
// ============================================================

import { supabase, getAuthenticatedUser } from '../lib/supabase';
import { LOCAL_DEVELOPMENT_MODE } from '../lib/localDevelopmentMode';
import { timeToMinutes } from '../utils/agendaExceptions';

const LOCAL_SCHEDULES_KEY = 'acup_local_professional_schedules';
const LOCAL_HOLIDAYS_KEY = 'acup_local_clinic_holidays';

const SCHEDULE_COLUMNS =
  'id,clinic_id,professional_id,weekday,starts_at,ends_at,break_starts_at,break_ends_at,slot_minutes,is_active';

const HOLIDAY_COLUMNS = 'id,clinic_id,day,name,is_working_day';

export const AGENDA_CONFIG_MIGRATION_HINT =
  'Estrutura de jornada/feriados ausente no banco. Aplique a migração ' +
  'supabase/migrations/20260810_agenda_operacao.sql no Supabase.';

export function isMissingAgendaConfigError(error) {
  const text = [error?.message, error?.details, error?.hint, error?.code]
    .filter(Boolean)
    .join(' ');
  return /professional_schedules|clinic_holidays/.test(text)
    && /does not exist|schema cache|Could not find/i.test(text);
}

/**
 * Valida a jornada antes de ir ao banco. Espelha os CHECKs da migração —
 * a mensagem daqui é para gente, a do Postgres é para log.
 */
export function assertValidSchedule(input) {
  const weekday = Number(input?.weekday);
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    throw new Error('Dia da semana inválido.');
  }

  const start = timeToMinutes(input?.startsAt);
  const end = timeToMinutes(input?.endsAt);
  if (start === null) throw new Error('Informe o início do expediente.');
  if (end === null) throw new Error('Informe o fim do expediente.');
  if (end <= start) throw new Error('O fim do expediente precisa ser depois do início.');

  const breakStart = input?.breakStartsAt ? timeToMinutes(input.breakStartsAt) : null;
  const breakEnd = input?.breakEndsAt ? timeToMinutes(input.breakEndsAt) : null;

  if ((breakStart === null) !== (breakEnd === null)) {
    throw new Error('Informe início e fim do intervalo, ou nenhum dos dois.');
  }
  if (breakStart !== null) {
    if (breakEnd <= breakStart) throw new Error('O fim do intervalo precisa ser depois do início.');
    if (breakStart < start || breakEnd > end) {
      throw new Error('O intervalo precisa estar dentro do expediente.');
    }
  }

  const slot = Number(input?.slotMinutes ?? 60);
  if (!Number.isInteger(slot) || slot < 5 || slot > 480) {
    throw new Error('Duração padrão do atendimento inválida.');
  }

  return { weekday, slot, breakStart, breakEnd };
}

// ---------- fallback local ----------

function readLocal(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch {
    return [];
  }
}

function writeLocal(key, list) {
  localStorage.setItem(key, JSON.stringify(list));
}

// ---------- API pública ----------

/** Jornada de um profissional (ou da equipe inteira, se omitido). */
export async function listProfessionalSchedules({ professionalId = null, runtime } = {}) {
  const client = {
    getAuthenticatedUser: runtime?.getAuthenticatedUser || getAuthenticatedUser,
    from: runtime?.from || ((table) => supabase.from(table)),
  };

  const user = await client.getAuthenticatedUser();

  if (LOCAL_DEVELOPMENT_MODE && user?._isLocal) {
    return readLocal(LOCAL_SCHEDULES_KEY)
      .filter(item => !professionalId || item.professional_id === professionalId);
  }

  let query = client.from('professional_schedules').select(SCHEDULE_COLUMNS);
  if (professionalId) query = query.eq('professional_id', professionalId);

  const { data, error } = await query
    .order('weekday', { ascending: true })
    .order('starts_at', { ascending: true });

  if (error) {
    if (isMissingAgendaConfigError(error)) throw new Error(AGENDA_CONFIG_MIGRATION_HINT);
    throw new Error(error.message || 'Não foi possível carregar a jornada.');
  }

  return data || [];
}

/** Cria ou atualiza uma faixa de jornada. */
export async function saveProfessionalSchedule(input, { runtime } = {}) {
  const { weekday, slot } = assertValidSchedule(input);
  if (!input?.professionalId) throw new Error('Selecione o profissional.');

  const client = {
    getAuthenticatedUser: runtime?.getAuthenticatedUser || getAuthenticatedUser,
    from: runtime?.from || ((table) => supabase.from(table)),
  };

  const payload = {
    professional_id: input.professionalId,
    weekday,
    starts_at: input.startsAt,
    ends_at: input.endsAt,
    break_starts_at: input.breakStartsAt || null,
    break_ends_at: input.breakEndsAt || null,
    slot_minutes: slot,
    is_active: input.isActive !== false,
  };

  const user = await client.getAuthenticatedUser();

  if (LOCAL_DEVELOPMENT_MODE && user?._isLocal) {
    const list = readLocal(LOCAL_SCHEDULES_KEY);
    const index = input.id ? list.findIndex(item => item.id === input.id) : -1;
    const record = {
      ...payload,
      id: input.id || `local-${Date.now()}`,
      clinic_id: 'local-clinic',
    };
    if (index >= 0) list[index] = record; else list.push(record);
    writeLocal(LOCAL_SCHEDULES_KEY, list);
    return record;
  }

  const table = client.from('professional_schedules');
  const query = input.id
    ? table.update(payload).eq('id', input.id)
    : table.insert(payload);

  const { data, error } = await query.select(SCHEDULE_COLUMNS).single();

  if (error) {
    if (isMissingAgendaConfigError(error)) throw new Error(AGENDA_CONFIG_MIGRATION_HINT);
    if (error.code === '23505') {
      throw new Error('Já existe uma faixa de jornada com esse dia e horário de início.');
    }
    throw new Error(error.message || 'Não foi possível salvar a jornada.');
  }

  return data;
}

export async function deleteProfessionalSchedule(id, { runtime } = {}) {
  if (!id) throw new Error('Faixa de jornada não informada.');

  const client = {
    getAuthenticatedUser: runtime?.getAuthenticatedUser || getAuthenticatedUser,
    from: runtime?.from || ((table) => supabase.from(table)),
  };

  const user = await client.getAuthenticatedUser();

  if (LOCAL_DEVELOPMENT_MODE && user?._isLocal) {
    writeLocal(LOCAL_SCHEDULES_KEY, readLocal(LOCAL_SCHEDULES_KEY).filter(item => item.id !== id));
    return true;
  }

  const { error } = await client.from('professional_schedules').delete().eq('id', id);

  if (error) {
    if (isMissingAgendaConfigError(error)) throw new Error(AGENDA_CONFIG_MIGRATION_HINT);
    throw new Error(error.message || 'Não foi possível remover a faixa de jornada.');
  }

  return true;
}

/**
 * Feriados no intervalo. `from`/`to` são datas puras 'YYYY-MM-DD' — dia
 * de calendário não é instante, e passar por ISO derruba a data um dia
 * para trás no Brasil.
 */
export async function listHolidays({ from = null, to = null, runtime } = {}) {
  const client = {
    getAuthenticatedUser: runtime?.getAuthenticatedUser || getAuthenticatedUser,
    from: runtime?.from || ((table) => supabase.from(table)),
  };

  const user = await client.getAuthenticatedUser();

  if (LOCAL_DEVELOPMENT_MODE && user?._isLocal) {
    return readLocal(LOCAL_HOLIDAYS_KEY).filter(item => {
      if (from && item.day < from) return false;
      if (to && item.day > to) return false;
      return true;
    });
  }

  let query = client.from('clinic_holidays').select(HOLIDAY_COLUMNS);
  if (from) query = query.gte('day', from);
  if (to) query = query.lte('day', to);

  const { data, error } = await query.order('day', { ascending: true });

  if (error) {
    if (isMissingAgendaConfigError(error)) throw new Error(AGENDA_CONFIG_MIGRATION_HINT);
    throw new Error(error.message || 'Não foi possível carregar os feriados.');
  }

  return data || [];
}

export async function saveHoliday({ id = null, day, name, isWorkingDay = false, runtime } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day || ''))) {
    throw new Error('Informe a data do feriado.');
  }
  if (!String(name || '').trim()) throw new Error('Informe o nome do feriado.');

  const client = {
    getAuthenticatedUser: runtime?.getAuthenticatedUser || getAuthenticatedUser,
    from: runtime?.from || ((table) => supabase.from(table)),
  };

  const payload = { day, name: name.trim(), is_working_day: isWorkingDay === true };
  const user = await client.getAuthenticatedUser();

  if (LOCAL_DEVELOPMENT_MODE && user?._isLocal) {
    const list = readLocal(LOCAL_HOLIDAYS_KEY);
    const index = id ? list.findIndex(item => item.id === id) : -1;
    const record = { ...payload, id: id || `local-${Date.now()}`, clinic_id: 'local-clinic' };
    if (index >= 0) list[index] = record; else list.push(record);
    writeLocal(LOCAL_HOLIDAYS_KEY, list);
    return record;
  }

  const table = client.from('clinic_holidays');
  const query = id ? table.update(payload).eq('id', id) : table.insert(payload);
  const { data, error } = await query.select(HOLIDAY_COLUMNS).single();

  if (error) {
    if (isMissingAgendaConfigError(error)) throw new Error(AGENDA_CONFIG_MIGRATION_HINT);
    if (error.code === '23505') throw new Error('Já existe um feriado cadastrado nessa data.');
    throw new Error(error.message || 'Não foi possível salvar o feriado.');
  }

  return data;
}
