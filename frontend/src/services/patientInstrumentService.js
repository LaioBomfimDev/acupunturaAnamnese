// ============================================================
// SERVICE: Escalas aplicadas ao paciente
// Migração: supabase/migrations/20261008_patient_instruments.sql
//
// Tudo passa pelas RPCs: a tabela não tem leitura direta. Quem vê e quem
// aplica é decidido no banco (can_use_patient_instruments): quem atende o
// paciente na disciplina (atendimento na Agenda ou responsável pela
// matrícula), ativo e da mesma clínica.
// Sem fallback local: escala é dado clínico (AGENTS.md §9).
// ============================================================

import { supabase } from '../lib/supabase';
import { buildApplicationPayload } from '../utils/instrumentScoring';

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

export { newIdempotencyKey };
