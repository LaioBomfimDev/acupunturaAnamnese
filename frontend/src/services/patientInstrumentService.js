// ============================================================
// SERVICE: Escalas aplicadas ao paciente
// Migração: supabase/migrations/20261008_patient_instruments.sql
//
// Tudo passa pelas RPCs: a tabela não tem leitura direta. Quem vê e quem
// aplica é decidido no banco: aplica quem atende o paciente na disciplina
// (atendimento na Agenda ou responsável da matrícula, can_use_patient_
// instruments); lê quem atende e a administração da clínica
// (can_read_patient_instruments, 20261012).
// Sem fallback local: escala é dado clínico (AGENTS.md §9).
// ============================================================

import { supabase } from '../lib/supabase';
import { buildApplicationPayload } from '../utils/instrumentScoring';
import { buildPortalQuestions } from '../utils/instrumentPortal';

export const PATIENT_INSTRUMENTS_MIGRATION_HINT =
  'As escalas ainda não existem no banco. Aplique a migração '
  + 'supabase/migrations/20261008_patient_instruments.sql no Supabase.';

export function isMissingInstrumentsSchema(error) {
  const text = [error?.message, error?.details, error?.hint, error?.code].filter(Boolean).join(' ');
  return /patient_instrument_application|can_use_patient_instruments/.test(text)
    && /does not exist|schema cache|Could not find|PGRST202/i.test(text);
}

function fail(error, fallback) {
  if (isMissingInstrumentsSchema(error)) throw new Error(PATIENT_INSTRUMENTS_MIGRATION_HINT);
  throw new Error(error?.message || fallback);
}

function newIdempotencyKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
    const random = (Math.random() * 16) | 0;
    return (char === 'x' ? random : (random & 0x3) | 0x8).toString(16);
  });
}

/** Linha da RPC → objeto da tela. */
export function mapApplicationRow(row) {
  const payload = row?.payload && typeof row.payload === 'object' ? row.payload : {};
  return {
    id: row.id,
    instrumentId: row.instrument_id,
    instrumentVersion: Number(row.instrument_version) || 1,
    appliedAt: row.applied_at,
    appliedById: row.applied_by,
    appliedByName: row.applied_by_name || 'Profissional',
    source: row.source,
    answers: payload.answers && typeof payload.answers === 'object' ? payload.answers : {},
    result: payload.result && typeof payload.result === 'object' ? payload.result : {},
    note: typeof payload.note === 'string' ? payload.note : '',
    createdAt: row.created_at,
    voidedAt: row.voided_at || null,
    voidedByName: row.voided_by_name || '',
    voidReason: row.void_reason || '',
    hasRisk: row.has_risk === true,
    riskAcknowledgedAt: row.risk_acknowledged_at || null,
    riskAcknowledgedByName: row.risk_acknowledged_by_name || '',
  };
}

export async function listInstrumentApplications({ patientId, discipline }) {
  if (!patientId || !discipline) return [];
  const { data, error } = await supabase.rpc('list_patient_instrument_applications', {
    p_patient_id: patientId,
    p_discipline: discipline,
  });
  if (error) fail(error, 'Não foi possível carregar as escalas.');
  return (data || []).map(mapApplicationRow);
}

/**
 * Grava uma aplicação completa. `idempotencyKey` vem de quem chama e se
 * repete num retry do mesmo salvamento, para o banco não duplicar.
 */
export async function recordInstrumentApplication({
  patientId,
  discipline,
  instrument,
  answers,
  note = '',
  appliedAt,
  idempotencyKey = newIdempotencyKey(),
}) {
  if (!patientId) throw new Error('Escolha o paciente.');
  const payload = buildApplicationPayload(instrument, answers, note);
  const { data, error } = await supabase.rpc('record_patient_instrument_application', {
    p_patient_id: patientId,
    p_discipline: discipline,
    p_instrument_id: instrument.id,
    p_instrument_version: instrument.version,
    p_applied_at: appliedAt,
    p_payload: payload,
    p_idempotency_key: idempotencyKey,
  });
  if (error) fail(error, 'Não foi possível salvar a escala.');
  const row = Array.isArray(data) ? data[0] : data;
  return { id: row?.id || null, replayed: Boolean(row?.replayed), payload };
}

export async function voidInstrumentApplication({ id, reason }) {
  const text = String(reason || '').trim();
  if (text.length < 3) throw new Error('Escreva o motivo da anulação.');
  const { error } = await supabase.rpc('void_patient_instrument_application', {
    p_application_id: id,
    p_reason: text,
  });
  if (error) fail(error, 'Não foi possível anular a aplicação.');
}

// ---------- etapa 2: escala respondida em casa (Área do Paciente) ----------

export const PATIENT_INSTRUMENTS_PORTAL_MIGRATION_HINT =
  'O envio de escalas para casa ainda não existe no banco. Aplique a migração '
  + 'supabase/migrations/20261011_patient_instruments_portal.sql no Supabase.';

function failPortal(error, fallback) {
  const text = [error?.message, error?.details, error?.hint, error?.code].filter(Boolean).join(' ');
  if (/portal_send_instrument|patient_instrument_request|instrument_risk/.test(text)
    && /does not exist|schema cache|Could not find|PGRST202/i.test(text)) {
    throw new Error(PATIENT_INSTRUMENTS_PORTAL_MIGRATION_HINT);
  }
  fail(error, fallback);
}

/** Nome neutro que o paciente vê na lista dele (sem "depressão" no título). */
export function patientFacingTitle(instrument) {
  return `Questionário ${instrument.shortName}`;
}

/**
 * `responsibleId`: quem a administração escolheu (ou confirmou) como
 * responsável do paciente na área. O banco grava na matrícula e só deixa
 * a administração mandar; quem atende e não é da administração manda sem.
 */
export async function sendInstrumentToPortal({ patientId, discipline, instrument, dueDate = null, responsibleId = null }) {
  if (!patientId) throw new Error('Escolha o paciente.');
  const { data, error } = await supabase.rpc('portal_send_instrument', {
    p_patient_id: patientId,
    p_discipline: discipline,
    p_instrument_id: instrument.id,
    p_instrument_version: instrument.version,
    p_title: patientFacingTitle(instrument),
    p_questions: buildPortalQuestions(instrument),
    p_due_date: dueDate || null,
    p_responsible: responsibleId || null,
  });
  if (error) failResponsible(error, 'Não foi possível enviar a escala.');
  return data;
}

// ---------- responsável claro: para quem vai o resultado ----------

export const INSTRUMENT_RESPONSIBLE_MIGRATION_HINT =
  'O responsável pelas escalas ainda não existe no banco. Aplique a migração '
  + 'supabase/migrations/20261012_instrument_result_responsible.sql no Supabase.';

function failResponsible(error, fallback) {
  const text = [error?.message, error?.details, error?.hint, error?.code].filter(Boolean).join(' ');
  if (/instrument_result_recipients|p_responsible|set_enrollment_responsible/.test(text)
    && /does not exist|schema cache|Could not find|PGRST202/i.test(text)) {
    throw new Error(INSTRUMENT_RESPONSIBLE_MIGRATION_HINT);
  }
  failPortal(error, fallback);
}

function mapPerson(person) {
  return person && person.id ? { id: person.id, name: person.name || 'Profissional' } : null;
}

/** Resposta de instrument_result_recipients → objeto da tela (utils/instrumentRecipients.js). */
export function mapRecipientsRow(row) {
  const data = row && typeof row === 'object' ? row : {};
  const responsible = mapPerson(data.responsible);
  return {
    enrollmentId: data.enrollment_id || null,
    enrollmentStatus: data.enrollment_status || null,
    responsible: responsible ? { ...responsible, receives: data.responsible.receives === true } : null,
    agenda: (Array.isArray(data.agenda) ? data.agenda : []).map(mapPerson).filter(Boolean),
    candidates: (Array.isArray(data.candidates) ? data.candidates : []).map(mapPerson).filter(Boolean),
    viewerAttends: data.viewer_attends === true,
    viewerIsAdmin: data.viewer_is_admin === true,
  };
}

/** Quem recebe a nota e o alerta desta área, e quem pode ser o responsável. */
export async function getInstrumentResultRecipients({ patientId, discipline }) {
  if (!patientId || !discipline) return null;
  const { data, error } = await supabase.rpc('instrument_result_recipients', {
    p_patient_id: patientId,
    p_discipline: discipline,
  });
  if (error) failResponsible(error, 'Não foi possível ver quem recebe o resultado.');
  return mapRecipientsRow(data);
}

export function mapRequestRow(row) {
  return {
    id: row.request_id,
    instrumentId: row.instrument_id,
    instrumentVersion: Number(row.instrument_version) || 1,
    status: row.request_status,
    progress: Number(row.progress) || 0,
    dueDate: row.due_date || null,
    sentAt: row.sent_at,
    submittedAt: row.submitted_at || null,
    cancelledAt: row.cancelled_at || null,
    sentByName: row.sent_by_name || '',
  };
}

export async function listInstrumentRequests({ patientId, discipline }) {
  if (!patientId || !discipline) return [];
  const { data, error } = await supabase.rpc('list_patient_instrument_requests', {
    p_patient_id: patientId,
    p_discipline: discipline,
  });
  if (error) failPortal(error, 'Não foi possível carregar os envios.');
  return (data || []).map(mapRequestRow);
}

export async function cancelInstrumentRequest(requestId) {
  const { error } = await supabase.rpc('cancel_patient_instrument_request', { p_request_id: requestId });
  if (error) failPortal(error, 'Não foi possível cancelar o envio.');
}

export async function acknowledgeInstrumentRisk(applicationId) {
  const { error } = await supabase.rpc('acknowledge_instrument_risk', { p_application_id: applicationId });
  if (error) failPortal(error, 'Não foi possível marcar o alerta como visto.');
}

/** Alertas de risco ainda não vistos de quem está logado (tela inicial). */
export async function listMyInstrumentRiskAlerts() {
  const { data, error } = await supabase.rpc('list_my_instrument_risk_alerts');
  if (error) failPortal(error, 'Não foi possível carregar os alertas.');
  return (data || []).map(row => ({
    applicationId: row.application_id,
    patientId: row.patient_id,
    patientName: row.patient_name || 'Paciente',
    instrumentId: row.instrument_id,
    discipline: row.discipline,
    appliedAt: row.applied_at,
    source: row.source,
  }));
}

export { newIdempotencyKey };
