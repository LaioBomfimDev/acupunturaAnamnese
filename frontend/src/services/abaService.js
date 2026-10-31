// ============================================================
// SERVICE: área ABA (programas, coleta, revisão, times).
// Migrações: supabase/migrations/20261101_aba_discipline.sql e
// 20261101b_aba_coleta.sql.
//
// Tudo passa pelas RPCs aba_*: as tabelas não têm leitura direta. Quem vê
// e quem altera é decidido no banco (time, supervisão, convocação ativa,
// administração da clínica) — a tela só esconde botão que daria erro.
// Sem fallback local: coleta é dado clínico (AGENTS.md §9).
// ============================================================

import { supabase } from '../lib/supabase';
import {
  behaviorToDb,
  correctionRecordsToDb,
  patientDataFromDb,
  programFromDb,
  programToDb,
  reinforcerToDb,
  sessionFromDb,
  sessionToDb,
} from '../utils/aba/mapping.js';

export const ABA_MIGRATION_HINT =
  'A área ABA ainda não existe no banco. Aplique as migrações '
  + 'supabase/migrations/20261101_aba_discipline.sql e 20261101b_aba_coleta.sql no Supabase.';

export function isMissingAbaSchema(error) {
  const text = [error?.message, error?.details, error?.hint, error?.code].filter(Boolean).join(' ');
  return /aba_[a-z_]+/.test(text) && /does not exist|schema cache|Could not find|PGRST202/i.test(text);
}

/** Erro de "alterado por outra pessoa/aba": a tela recarrega em vez de insistir. */
export class AbaConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AbaConflictError';
    this.code = 'conflict';
  }
}

/** Paciente de outro time: não é falha, é a regra de acesso. */
export class AbaAccessError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AbaAccessError';
    this.code = 'no_access';
  }
}

function fail(error, fallback) {
  if (isMissingAbaSchema(error)) throw new Error(ABA_MIGRATION_HINT);
  if (error?.code === '40001') throw new AbaConflictError(error.message || fallback);
  if (error?.code === '42501') throw new AbaAccessError(error.message || fallback);
  throw new Error(error?.message || fallback);
}

async function call(fn, args, fallback) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) fail(error, fallback);
  return data;
}

// ---------- paciente ----------

export async function loadAbaPatient(patientId) {
  const bundle = await call('aba_get_patient_data', { p_patient_id: patientId }, 'Não foi possível carregar a área ABA do paciente.');
  return patientDataFromDb(bundle);
}

export async function saveProgram(patientId, program) {
  const row = await call('aba_save_program', {
    p_patient_id: patientId,
    p_program: programToDb(program),
  }, 'Não foi possível salvar o programa.');
  return programFromDb(row);
}

export async function updateProgramStatus(programId, { status = null, note = null, archive = false }) {
  const row = await call('aba_update_program_status', {
    p_program_id: programId,
    p_status: status,
    p_note: note,
    p_archive: archive,
  }, 'Não foi possível atualizar o programa.');
  return programFromDb(row);
}

export async function saveReinforcer(patientId, reinforcer) {
  return call('aba_save_reinforcer', {
    p_patient_id: patientId,
    p_reinforcer: reinforcerToDb(reinforcer),
  }, 'Não foi possível salvar o reforçador.');
}

export async function saveBehavior(patientId, behavior) {
  return call('aba_save_behavior', {
    p_patient_id: patientId,
    p_behavior: behaviorToDb(behavior),
  }, 'Não foi possível salvar o comportamento.');
}

export async function reviewBehavior(behaviorId, decision) {
  return call('aba_review_behavior', { p_behavior_id: behaviorId, p_decision: decision }, 'Não foi possível revisar o comportamento.');
}

// ---------- coleta ----------

/** Rascunho a cada toque e finalização: devolve { id, clientEventId, revision, status }. */
export async function saveSession(patientId, session) {
  const result = await call('aba_save_session', {
    p_patient_id: patientId,
    p_session: sessionToDb(session),
  }, 'Não foi possível salvar a coleta.');
  return {
    id: result.id,
    clientEventId: result.client_event_id,
    revision: Number(result.revision),
    status: result.status,
    reviewStatus: result.review_status,
  };
}

export async function discardSession(sessionId) {
  return call('aba_discard_session', { p_session_id: sessionId }, 'Não foi possível descartar a coleta.');
}

export async function reviewSession(sessionId, action, { notes = null, windowHours = null, attested = false } = {}) {
  const row = await call('aba_review_session', {
    p_session_id: sessionId,
    p_action: action,
    p_notes: notes,
    p_window_hours: windowHours,
    p_attested: attested,
  }, 'Não foi possível revisar a sessão.');
  return sessionFromDb(row);
}

export async function correctSession(session, response) {
  const row = await call('aba_correct_session', {
    p_session_id: session.id,
    p_revision: session.revision,
    p_records: correctionRecordsToDb(session.records),
    p_notes: session.notes || null,
    p_response: response,
  }, 'Não foi possível enviar a correção.');
  return sessionFromDb(row);
}

export async function reviewRisk(incidentId, note) {
  return call('aba_review_risk', { p_incident_id: incidentId, p_note: note || null }, 'Não foi possível revisar o registro de risco.');
}

export async function listReviewQueue() {
  const rows = await call('aba_list_review_queue', {}, 'Não foi possível carregar a fila de revisão.');
  return (rows || []).map(row => ({
    id: row.id,
    patientId: row.patient_id,
    patientName: row.patient_name || 'Paciente',
    therapistId: row.therapist_id,
    therapistName: row.therapist_name || 'Terapeuta',
    date: row.session_date,
    status: row.status,
    reviewStatus: row.review_status,
    correctionDeadline: row.correction_deadline ? Date.parse(row.correction_deadline) : undefined,
    correctionReason: row.correction_reason || '',
    forSupervision: row.for_supervision === true,
  }));
}

// ---------- times ----------

export async function loadTeams() {
  const data = await call('aba_get_teams', {}, 'Não foi possível carregar os times.');
  return {
    userId: data.user_id,
    isAdmin: data.is_admin === true,
    supervisedTeamId: data.supervised_team_id || null,
    memberTeamId: data.member_team_id || null,
    teams: (data.teams || []).map(team => ({
      id: team.id,
      name: team.name,
      supervisorId: team.supervisor_id,
      memberIds: team.member_ids || [],
      patients: (team.patients || []).map(patient => ({
        id: patient.id,
        name: patient.name,
        therapistIds: patient.therapist_ids || [],
      })),
    })),
    professionals: (data.professionals || []).map(person => ({
      id: person.id,
      name: person.full_name || 'Profissional',
      profession: person.profession || '',
      role: person.role || '',
      memberTeamId: person.member_team_id || null,
      supervisedTeamId: person.supervised_team_id || null,
    })),
    availablePatients: (data.available_patients || []).map(patient => ({
      id: patient.id,
      name: patient.name,
      teamId: patient.team_id || null,
    })),
    callouts: (data.callouts || []).map(callout => ({
      id: callout.id,
      patientId: callout.patient_id,
      patientName: callout.patient_name || 'Criança',
      therapistId: callout.therapist_id,
      therapistName: callout.therapist_name || 'Terapeuta',
      requestedBy: callout.requested_by,
      requestedByName: callout.requested_by_name || 'Supervisão',
      teamId: callout.team_id,
      kind: callout.kind,
      reason: callout.reason || '',
      startsAt: Date.parse(callout.starts_at),
      endsAt: callout.ends_at ? Date.parse(callout.ends_at) : undefined,
      status: callout.status,
      activeNow: callout.active_now === true,
      viewedAt: callout.viewed_at ? Date.parse(callout.viewed_at) : undefined,
      acceptanceMoment: callout.acceptance_moment || '',
      response: callout.response || '',
      createdAt: Date.parse(callout.created_at),
    })),
  };
}

export const createTeam = (name, supervisorId) =>
  call('aba_create_team', { p_name: name, p_supervisor_id: supervisorId }, 'Não foi possível criar o time.');

export const updateTeam = (teamId, { name = null, supervisorId = null, archive = false }) =>
  call('aba_update_team', { p_team_id: teamId, p_name: name, p_supervisor_id: supervisorId, p_archive: archive }, 'Não foi possível atualizar o time.');

export const setTeamMember = (teamId, therapistId, member) =>
  call('aba_set_team_member', { p_team_id: teamId, p_therapist_id: therapistId, p_member: member }, 'Não foi possível atualizar o time.');

export const setTeamPatient = (teamId, patientId, member) =>
  call('aba_set_team_patient', { p_team_id: teamId, p_patient_id: patientId, p_member: member }, 'Não foi possível atualizar o time.');

export const setPatientTherapists = (patientId, therapistIds) =>
  call('aba_set_patient_therapists', { p_patient_id: patientId, p_therapist_ids: therapistIds }, 'Não foi possível salvar os responsáveis.');

export const createCallout = ({ patientId, therapistId, kind, reason, startsAt, endsAt }) =>
  call('aba_create_callout', {
    p_patient_id: patientId,
    p_therapist_id: therapistId,
    p_kind: kind,
    p_reason: reason,
    p_starts_at: startsAt || null,
    p_ends_at: endsAt || null,
  }, 'Não foi possível enviar a convocação.');

export const manageCallout = (calloutId, action, { moment = null, notes = null } = {}) =>
  call('aba_manage_callout', { p_callout_id: calloutId, p_action: action, p_moment: moment, p_notes: notes }, 'Não foi possível registrar a resposta.');

export const saveAbaSettings = ({ defaultTrialCount, programBlockMinutes, pauseMinutes, correctionWindowHours }) =>
  call('aba_save_settings', {
    p_default_trial_count: defaultTrialCount,
    p_program_block_minutes: programBlockMinutes,
    p_pause_minutes: pauseMinutes,
    p_correction_window_hours: correctionWindowHours,
  }, 'Não foi possível salvar a configuração da coleta.');
