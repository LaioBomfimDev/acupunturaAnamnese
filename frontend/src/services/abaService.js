// ============================================================
// SERVICE: área ABA (programas, coleta, revisão, times).
// Migrações: supabase/migrations/20261101_aba_discipline.sql,
// 20261101b_aba_coleta.sql e 20261101c_aba_qualidade.sql (fidelidade, IOA
// e alertas).
//
// Tudo passa pelas RPCs aba_*: as tabelas não têm leitura direta. Quem vê
// e quem altera é decidido no banco (time, supervisão, convocação ativa,
// administração da clínica) — a tela só esconde botão que daria erro.
// Sem fallback local: coleta é dado clínico (AGENTS.md §9).
// ============================================================

import { supabase } from '../lib/supabase';
import {
  alertFromDb,
  behaviorToDb,
  correctionRecordsToDb,
  fidelityFromDb,
  ioaFromDb,
  patientDataFromDb,
  programFromDb,
  programToDb,
  reinforcerToDb,
  sessionFromDb,
  sessionToDb,
} from '../utils/aba/mapping.js';

export const ABA_MIGRATION_HINT =
  'A área ABA ainda não existe no banco. Aplique as migrações '
  + 'supabase/migrations/20261101_aba_discipline.sql, 20261101b_aba_coleta.sql e '
  + '20261101c_aba_qualidade.sql no Supabase.';

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
  if (error?.code === '22023') throw Object.assign(new Error(error.message || fallback), { code: '22023' });
  throw new Error(error?.message || fallback);
}

async function call(fn, args, fallback) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) fail(error, fallback);
  return data;
}

// ---------- paciente ----------

export async function loadAbaPatient(patientId) {
  const [bundle, quality] = await Promise.all([
    call('aba_get_patient_data', { p_patient_id: patientId }, 'Não foi possível carregar a área ABA do paciente.'),
    loadQuality(patientId),
  ]);
  return patientDataFromDb(bundle, quality);
}

// Fidelidade e IOA. Banco ainda sem a segunda etapa: a área continua
// funcionando, só sem esses dados (a coleta não depende deles).
async function loadQuality(patientId) {
  const { data, error } = await supabase.rpc('aba_get_patient_quality', { p_patient_id: patientId });
  if (error) {
    if (isMissingAbaSchema(error)) return null;
    fail(error, 'Não foi possível carregar a fidelidade e a concordância.');
  }
  return data;
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

// ---------- qualidade ----------

export async function saveFidelity(sessionId, source, items, notes, expectedRevision) {
  const row = await call('aba_save_fidelity', {
    p_session_id: sessionId,
    p_source: source,
    p_items: items.map(item => ({ key: item.key, met: item.met === true, applicable: item.applicable !== false })),
    p_notes: notes?.trim() || null,
    p_expected_revision: expectedRevision ?? null,
  }, 'Não foi possível salvar a fidelidade.');
  return fidelityFromDb(row);
}

export async function saveIoa(patientId, record) {
  const row = await call('aba_save_ioa', {
    p_patient_id: patientId,
    p_record: {
      method: record.method,
      primary_value: record.primaryValue,
      secondary_value: record.secondaryValue,
      session_id: record.sessionId || null,
      program_id: record.programId || null,
      secondary_observer_id: record.secondaryObserverId || null,
      observed_on: record.observedOn || null,
      notes: record.notes?.trim() || null,
    },
  }, 'Não foi possível registrar a concordância.');
  return ioaFromDb(row);
}

// ---------- alertas ----------

/** Recalcula as regras da clínica (o banco segura repetição em 2 minutos). */
export const refreshAlerts = (force = false) =>
  call('aba_refresh_alerts', { p_force: force }, 'Não foi possível atualizar os alertas.');

export async function listAlerts({ patientId = null, includeClosed = false } = {}) {
  const rows = await call('aba_list_alerts', { p_patient_id: patientId, p_include_closed: includeClosed }, 'Não foi possível carregar os alertas.');
  return (rows || []).map(alertFromDb);
}

export const manageAlert = (alert, action, note = null) =>
  call('aba_manage_alert', {
    p_alert_id: alert.id,
    p_action: action,
    p_note: note?.trim() || null,
    p_expected_revision: alert.revision,
  }, 'Não foi possível atualizar o alerta.');

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
// ---------- plano terapêutico versionado (ACUP-003) ----------

export function orderedPlanVersions(rows) {
  return [...(rows || [])].sort((left, right) => Number(right.version_no) - Number(left.version_no));
}

export function planProgramCount(count) {
  return `${count} ${count === 1 ? 'programa' : 'programas'}`;
}

export function planDraftIssue(plan) {
  if (!plan.programs?.length) return 'Escolha ao menos um programa antes de enviar para revisão.';
  if (!plan.summary?.trim()) return 'Preencha o resumo antes de enviar para revisão.';
  return '';
}

export function planErrorMessage(error) {
  if (error instanceof AbaConflictError || error?.code === '40001' || /alterado por outra pessoa/i.test(error?.message || '')) {
    return 'Este plano foi alterado por outra pessoa. Recarregue antes de continuar.';
  }
  if (error instanceof AbaAccessError || error?.code === '42501') {
    return 'Você não tem permissão para realizar esta ação neste paciente.';
  }
  if (error?.code === '23505' || /duplicate key|unique constraint/i.test(error?.message || '')) {
    return 'Esta ação ou versão já foi registrada. Recarregue os planos antes de continuar.';
  }
  // Mensagens de validação do contrato ABA são pt-BR; erro técnico continua oculto.
  if (error?.code === '22023' && /^(?:Plano |Informe |Paciente |Só |Os programas |O plano |Referência |Revisão |Programa |Cada programa |Envie |Anular |Texto )/u.test(error.message || '')) {
    return error.message;
  }
  // call() mantém o contrato das outras abas. Aqui nunca exibimos SQL/inglês.
  return 'Não foi possível concluir. Confira os dados do plano e tente novamente. Se persistir, peça ajuda à administração.';
}

export async function listPlanVersions(patientId) {
  const rows = await call('aba_list_plan_versions', { p_patient_id: patientId }, 'Não foi possível carregar os planos.');
  return orderedPlanVersions(rows);
}

export function savePlanDraft(patientId, plan, eventId) {
  return call('aba_save_plan_draft', {
    p_patient_id: patientId,
    p_plan: {
      id: plan.id,
      revision: plan.revision,
      client_event_id: eventId,
      programs: plan.programs.map(item => ({ program_id: item.program_id, revision: item.revision })),
      summary: plan.summary,
      review_due_on: plan.review_due_on || null,
    },
  }, 'Não foi possível salvar o rascunho do plano.');
}

export function submitPlan(patientId, plan, eventId) {
  return call('aba_submit_plan', { p_patient_id: patientId, p_plan_id: plan.id, p_revision: plan.revision, p_client_event_id: eventId }, 'Não foi possível enviar o plano para revisão.');
}

export function approvePlan(patientId, plan, eventId) {
  return call('aba_approve_plan', { p_patient_id: patientId, p_plan_id: plan.id, p_revision: plan.revision, p_client_event_id: eventId }, 'Não foi possível aprovar o plano.');
}

export function voidPlan(patientId, plan, eventId, reason) {
  return call('aba_void_plan', { p_patient_id: patientId, p_plan_id: plan.id, p_revision: plan.revision, p_client_event_id: eventId, p_reason: reason.trim() }, 'Não foi possível anular o plano.');
}
