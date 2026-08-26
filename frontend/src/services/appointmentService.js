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
import { APPOINTMENT_STATUS_IDS, FREEING_STATUSES, findOverlap } from '../utils/agenda';

const LOCAL_APPOINTMENTS_KEY = 'acup_local_appointments';

const APPOINTMENT_COLUMNS =
  'id,clinic_id,patient_id,professional_id,discipline,starts_at,ends_at,status,note,cancellation_reason,'
  + 'kind,appointment_type,modality,block_type,room,confirmed_at,checked_in_at,recurrence_group_id,is_exception,exception_reason,'
  + 'created_by,created_at,updated_at';

// Espelha o CHECK appointments_kind_check da migração 20260810.
export const APPOINTMENT_KINDS = ['appointment', 'block'];

// Espelha appointments_modality_check (migração 20260818). Nulo é
// válido só para bloqueio — atendimento sempre escolhe um dos dois.
export const APPOINTMENT_MODALITIES = [
  { id: 'presencial', label: 'Presencial' },
  { id: 'online', label: 'Online' },
];

export const APPOINTMENT_MODALITY_IDS = APPOINTMENT_MODALITIES.map(item => item.id);

// Espelha appointments_type_check. Nulo é válido: nem toda clínica
// classifica o atendimento.
export const APPOINTMENT_TYPES = [
  { id: 'first_visit', label: 'Primeira vez' },
  { id: 'return', label: 'Retorno' },
  { id: 'evaluation', label: 'Avaliação' },
];

export const APPOINTMENT_TYPE_IDS = APPOINTMENT_TYPES.map(item => item.id);

// Espelha appointments_block_type_check (migração 20260823). Só se
// aplica a kind='block' — bloqueio não tem paciente nem disciplina,
// isto é só uma categoria dentro da hora reservada. Sem 'anamnese':
// aqui anamnese é sempre ligada a um paciente real, nunca é bloqueio.
export const APPOINTMENT_BLOCK_TYPES = [
  { id: 'reuniao', label: 'Reunião' },
  { id: 'entrevista', label: 'Entrevista' },
  { id: 'outro', label: 'Outro' },
];

export const APPOINTMENT_BLOCK_TYPE_IDS = APPOINTMENT_BLOCK_TYPES.map(item => item.id);

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
  const kind = input?.kind || 'appointment';
  if (!APPOINTMENT_KINDS.includes(kind)) {
    throw new Error(`Tipo de registro inválido: ${kind || '(vazio)'}.`);
  }

  // Bloqueio (almoço, reunião, férias) não tem paciente nem disciplina —
  // é hora reservada do profissional, não atendimento.
  if (kind === 'appointment') {
    if (!input?.patientId) throw new Error('Selecione o paciente.');
    if (!DISCIPLINE_IDS.includes(input?.discipline)) {
      throw new Error(`Disciplina inválida: ${input?.discipline || '(vazia)'}.`);
    }
  } else if (input?.patientId) {
    throw new Error('Bloqueio de horário não recebe paciente.');
  }

  if (!input?.professionalId) throw new Error('Selecione o profissional.');

  // Exceção sem motivo é ruído: daqui a um ano ninguém sabe por que
  // aquele sábado foi marcado. Espelha o CHECK appointments_exception_reason.
  if (input?.isException === true && !String(input?.exceptionReason || '').trim()) {
    throw new Error('Informe o motivo da exceção de horário.');
  }

  if (input?.appointmentType && !APPOINTMENT_TYPE_IDS.includes(input.appointmentType)) {
    throw new Error(`Tipo de atendimento inválido: ${input.appointmentType}.`);
  }

  if (kind === 'appointment' && input?.modality && !APPOINTMENT_MODALITY_IDS.includes(input.modality)) {
    throw new Error(`Modalidade inválida: ${input.modality}.`);
  }

  if (kind === 'block' && input?.blockType && !APPOINTMENT_BLOCK_TYPE_IDS.includes(input.blockType)) {
    throw new Error(`Categoria de bloqueio inválida: ${input.blockType}.`);
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

  const { data, error } = await query.order('starts_at', { ascending: true }).limit(2000);

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

  const kind = input.kind || 'appointment';

  const payload = {
    patient_id: kind === 'block' ? null : input.patientId,
    professional_id: input.professionalId,
    discipline: kind === 'block' ? null : input.discipline,
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
    status: input.status || 'scheduled',
    note: input.note?.trim() || null,
    kind,
    appointment_type: input.appointmentType || null,
    // Bloqueio não escolhe modalidade — não é atendimento. Atendimento
    // sem escolha explícita assume presencial, que é o caso comum de
    // uma clínica física.
    modality: kind === 'block' ? null : (input.modality || 'presencial'),
    // Espelho de modality: só bloqueio tem categoria, atendimento não.
    block_type: kind === 'block' ? (input.blockType || 'outro') : null,
    room: input.room?.trim() || null,
    recurrence_group_id: input.recurrenceGroupId || null,
    // Marcar fora da jornada é permitido; passar despercebido, não. Sem
    // este par a taxa de ocupação do dashboard mente.
    is_exception: input.isException === true,
    exception_reason: input.isException === true
      ? String(input.exceptionReason || '').trim()
      : null,
  };
  assertStatus(payload.status);

  // Só atendimento disputa horário. Bloqueio convive com tudo de
  // propósito: ele avisa, não barra (§6.1 do plano).
  if (knownAppointments && kind === 'appointment') {
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

/**
 * Marca presença: paciente chegou na clínica.
 *
 * Grava o instante E move o status para 'ready'. O instante é o que o
 * BI usa para medir espera; o status é o que a fila lê. Guardar só um
 * dos dois deixaria a recepção sem o tempo ou o dashboard sem o dado.
 *
 * `undo` desfaz — recepção erra de linha, e sem desfazer a correção
 * seria mudar o status na mão, deixando o carimbo de chegada mentindo.
 */
export async function checkInAppointment(id, { undo = false, at = null, runtime } = {}) {
  if (!id) throw new Error('Agendamento não informado.');

  const client = {
    getAuthenticatedUser: runtime?.getAuthenticatedUser || getAuthenticatedUser,
    from: runtime?.from || ((table) => supabase.from(table)),
  };

  const patch = undo
    ? { checked_in_at: null, status: 'scheduled' }
    : { checked_in_at: (at ? new Date(at) : new Date()).toISOString(), status: 'ready' };

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
    throw new Error(error.message || 'Não foi possível registrar a chegada.');
  }

  return data;
}

/**
 * Registra que o paciente confirmou a presença (telefone, WhatsApp).
 *
 * Não mexe no status: confirmar é sobre o contato, não sobre o
 * atendimento. Um confirmado pode faltar, e um não confirmado pode
 * aparecer — misturar os dois estragaria as duas informações.
 */
export async function confirmAppointment(id, { undo = false, at = null, runtime } = {}) {
  if (!id) throw new Error('Agendamento não informado.');

  const client = {
    getAuthenticatedUser: runtime?.getAuthenticatedUser || getAuthenticatedUser,
    from: runtime?.from || ((table) => supabase.from(table)),
  };

  const patch = { confirmed_at: undo ? null : (at ? new Date(at) : new Date()).toISOString() };
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
    throw new Error(error.message || 'Não foi possível registrar a confirmação.');
  }

  return data;
}

/**
 * Cria uma série (pacote de sessões) num grupo só.
 *
 * PARCIAL É DE PROPÓSITO: se a terceira sessão bate com um atendimento
 * já marcado, as outras nove continuam valendo. Recusar o pacote
 * inteiro por causa de uma data obrigaria a recepção a remontar tudo na
 * mão — e o conflito é resolvido remarcando aquela sessão.
 *
 * @param items [{ start: Date, end: Date, isException, reason }]
 * @returns { groupId, created: [], failed: [{ start, message }] }
 */
export async function createSeries(base, { items = [], runtime } = {}) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('A série precisa de pelo menos uma sessão.');
  }

  const groupId = runtime?.newGroupId
    ? runtime.newGroupId()
    : globalThis.crypto?.randomUUID?.();

  if (!groupId) throw new Error('Não foi possível identificar a série.');

  const created = [];
  const failed = [];
  // Serial de propósito: em paralelo, duas sessões do mesmo pacote
  // podem disputar o mesmo horário e a mensagem de erro sai trocada.
  for (const item of items) {
    try {
      const appointment = await createAppointment(
        {
          ...base,
          startsAt: item.start.toISOString(),
          endsAt: item.end.toISOString(),
          isException: item.isException === true,
          exceptionReason: item.reason,
          recurrenceGroupId: groupId,
        },
        { runtime },
      );
      created.push(appointment);
    } catch (error) {
      failed.push({ start: item.start, message: error.message || 'Falha ao criar a sessão.' });
    }
  }

  return { groupId, created, failed };
}

/**
 * Cancela as sessões de uma série a partir de uma data (inclusive).
 *
 * "Deste em diante" e não "a série toda" porque desistência no meio do
 * pacote é o caso real; apagar as sessões já atendidas destruiria o
 * histórico de que o BI depende.
 */
export async function cancelSeriesFrom(groupId, {
  fromIso,
  reason = null,
  runtime,
} = {}) {
  if (!groupId) throw new Error('Série não informada.');

  const from = new Date(fromIso);
  if (Number.isNaN(from.getTime())) throw new Error('Data inicial inválida.');

  const client = {
    getAuthenticatedUser: runtime?.getAuthenticatedUser || getAuthenticatedUser,
    from: runtime?.from || ((table) => supabase.from(table)),
  };

  const patch = { status: 'cancelled', cancellation_reason: reason?.trim() || null };
  const user = await client.getAuthenticatedUser();

  if (LOCAL_DEVELOPMENT_MODE && user?._isLocal) {
    const list = getLocalAppointments();
    const alvo = list.filter(item => (
      item.recurrence_group_id === groupId
      && new Date(item.starts_at) >= from
      && !FREEING_STATUSES.includes(item.status)
    ));
    alvo.forEach(item => Object.assign(item, patch, { updated_at: new Date().toISOString() }));
    saveLocalAppointments(list);
    return alvo;
  }

  const { data, error } = await client.from('appointments')
    .update(patch)
    .eq('recurrence_group_id', groupId)
    .gte('starts_at', from.toISOString())
    // Sessão já atendida não é "cancelada" retroativamente: o que
    // aconteceu, aconteceu.
    .eq('status', 'scheduled')
    .select(APPOINTMENT_COLUMNS);

  if (error) {
    if (isMissingAgendaSchemaError(error)) throw new Error(AGENDA_MIGRATION_HINT);
    throw new Error(error.message || 'Não foi possível cancelar as sessões.');
  }

  return data || [];
}

/**
 * Remarca (muda horário) mantendo o mesmo agendamento e seu histórico.
 *
 * A exceção é reavaliada no destino: mover de uma quarta às 9h para um
 * sábado precisa passar a valer como exceção, e mover de volta precisa
 * deixar de valer. Sem isso o registro mentiria depois da primeira
 * remarcação.
 */
export async function rescheduleAppointment(id, {
  startsAt,
  endsAt,
  isException = false,
  exceptionReason = null,
  runtime,
} = {}) {
  if (!id) throw new Error('Agendamento não informado.');

  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error('Horário inválido.');
  }
  if (end <= start) throw new Error('O término precisa ser depois do início.');
  if (isException === true && !String(exceptionReason || '').trim()) {
    throw new Error('Informe o motivo da exceção de horário.');
  }

  const client = {
    getAuthenticatedUser: runtime?.getAuthenticatedUser || getAuthenticatedUser,
    from: runtime?.from || ((table) => supabase.from(table)),
  };

  const user = await client.getAuthenticatedUser();
  const patch = {
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
    is_exception: isException === true,
    exception_reason: isException === true ? String(exceptionReason).trim() : null,
  };

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

/**
 * Edita os dados de um atendimento (área, tipo, modalidade, duração,
 * observação) ou de um bloqueio (categoria, observação) já criado. Só
 * recebe o que for informado — cada campo é opcional para o chamador
 * poder mandar só o que mudou.
 *
 * NÃO edita paciente nem profissional de propósito: trocar o paciente
 * de um horário já marcado mistura o histórico de duas pessoas na
 * mesma linha. Quem marcou errado cancela e cria de novo — é mais
 * lento, mas o registro de cada paciente fica limpo.
 *
 * `endsAt` (não `durationMinutes`) porque quem chama já tem o
 * `starts_at` atual em mãos e calcula o novo término; a função não
 * busca a linha antes de gravar, então não tem como derivar sozinha.
 */
export async function updateAppointmentDetails(id, {
  discipline,
  appointmentType,
  modality,
  blockType,
  endsAt,
  note,
  runtime,
} = {}) {
  if (!id) throw new Error('Agendamento não informado.');

  const patch = {};

  if (discipline !== undefined) {
    if (!DISCIPLINE_IDS.includes(discipline)) {
      throw new Error(`Disciplina inválida: ${discipline || '(vazia)'}.`);
    }
    patch.discipline = discipline;
  }

  if (blockType !== undefined) {
    if (blockType && !APPOINTMENT_BLOCK_TYPE_IDS.includes(blockType)) {
      throw new Error(`Categoria de bloqueio inválida: ${blockType}.`);
    }
    patch.block_type = blockType || 'outro';
  }

  if (appointmentType !== undefined) {
    if (appointmentType && !APPOINTMENT_TYPE_IDS.includes(appointmentType)) {
      throw new Error(`Tipo de atendimento inválido: ${appointmentType}.`);
    }
    patch.appointment_type = appointmentType || null;
  }

  if (modality !== undefined) {
    if (modality && !APPOINTMENT_MODALITY_IDS.includes(modality)) {
      throw new Error(`Modalidade inválida: ${modality}.`);
    }
    patch.modality = modality;
  }

  if (endsAt !== undefined) {
    const end = new Date(endsAt);
    if (Number.isNaN(end.getTime())) throw new Error('Término inválido.');
    patch.ends_at = end.toISOString();
  }

  if (note !== undefined) patch.note = note?.trim() || null;

  if (Object.keys(patch).length === 0) throw new Error('Nada para atualizar.');

  const client = {
    getAuthenticatedUser: runtime?.getAuthenticatedUser || getAuthenticatedUser,
    from: runtime?.from || ((table) => supabase.from(table)),
  };

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
    if (isOverlapError(error)) {
      throw new Error('Esse profissional já tem atendimento nesse horário.');
    }
    throw new Error(error.message || 'Não foi possível salvar as alterações.');
  }

  return data;
}
