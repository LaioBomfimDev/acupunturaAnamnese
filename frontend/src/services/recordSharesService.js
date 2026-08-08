// ============================================================
// SERVICE: Compartilhamento de prontuário entre disciplinas (Fase 3)
// Plano: docs/plano-clinica-multidisciplinar.md
//
// "Enviar para outro profissional" = criar um record_share explícito,
// com os escopos escolhidos, revogável e auditável. A LEITURA do que
// foi compartilhado passa pela RPC get_shared_session (autorização no
// banco). Escrita clínica continua dona-somente (nada aqui a altera).
//
// Sem a migração 20260709 aplicada → erro EXPLÍCITO citando a migração.
// Login local (teste) usa localStorage.
// ============================================================

import { supabase, getAuthenticatedUser } from '../lib/supabase';
import { LOCAL_DEVELOPMENT_MODE } from '../lib/localDevelopmentMode';
import { DISCIPLINE_IDS } from '../data/disciplines';
import { normalizeSharedScopes } from '../data/shareScopes';

const LOCAL_SHARES_KEY = 'acup_local_record_shares';

export const SHARE_MIGRATION_HINT =
  'Estrutura de compartilhamento ausente no banco. Aplique a migração ' +
  'supabase/migrations/20260709_record_shares.sql no Supabase.';

export function isMissingShareSchemaError(error) {
  const text = [error?.message, error?.details, error?.hint, error?.code]
    .filter(Boolean)
    .join(' ');
  return /record_shares|get_shared_session/.test(text)
    && /does not exist|schema cache|Could not find/i.test(text);
}

function assertDiscipline(id, field) {
  if (!DISCIPLINE_IDS.includes(id)) {
    throw new Error(`Disciplina inválida em ${field}: ${id || '(vazia)'}.`);
  }
}

function getLocalShares() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_SHARES_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveLocalShares(shares) {
  localStorage.setItem(LOCAL_SHARES_KEY, JSON.stringify(shares));
}

// ---------- API pública ----------

/**
 * Compartilha (encaminha) a sessão de um paciente de uma disciplina
 * de origem para outra, com os escopos escolhidos. NÃO copia dados —
 * cria só a autorização de leitura.
 */
export async function createRecordShare(patientId, {
  fromDiscipline,
  toDiscipline,
  scopes,
  note,
  password,
  idempotencyKey,
} = {}) {
  assertDiscipline(fromDiscipline, 'origem');
  assertDiscipline(toDiscipline, 'destino');
  if (fromDiscipline === toDiscipline) {
    throw new Error('Origem e destino não podem ser a mesma disciplina.');
  }
  if (!password) throw new Error('Confirme sua senha para enviar.');
  if (!idempotencyKey) throw new Error('Identificador seguro do envio ausente.');
  const sharedScopes = normalizeSharedScopes(scopes);

  const user = await getAuthenticatedUser();
  if (!user) throw new Error('Usuário não autenticado.');

  if (LOCAL_DEVELOPMENT_MODE && user._isLocal) {
    const share = {
      id: `local-share-${Date.now()}`,
      patient_id: patientId,
      from_discipline: fromDiscipline,
      to_discipline: toDiscipline,
      shared_scopes: sharedScopes,
      shared_by: user.id,
      note: note || null,
      idempotency_key: idempotencyKey,
      created_at: new Date().toISOString(),
      revoked_at: null,
    };
    saveLocalShares([share, ...getLocalShares()]);
    return share;
  }

  const { data, error } = await supabase.functions.invoke('create-record-share', {
    body: {
      patientId,
      fromDiscipline,
      toDiscipline,
      scopes: sharedScopes,
      note: note || null,
      password,
      idempotencyKey,
    },
  });

  if (error) {
    if (isMissingShareSchemaError(error)) throw new Error(SHARE_MIGRATION_HINT);
    throw new Error(data?.error || 'Não foi possível confirmar e criar o compartilhamento.');
  }
  if (data?.error) throw new Error(data.error);
  if (!data?.share?.id) {
    throw new Error('O servidor não confirmou o compartilhamento.');
  }
  return data.share;
}

/** Lista os compartilhamentos ATIVOS de um paciente. */
export async function listActiveShares(patientId) {
  const user = await getAuthenticatedUser();
  if (!user) throw new Error('Usuário não autenticado.');

  if (LOCAL_DEVELOPMENT_MODE && user._isLocal) {
    return getLocalShares().filter(s => s.patient_id === patientId && !s.revoked_at);
  }

  const { data, error } = await supabase
    .from('record_shares')
    .select('id,patient_id,from_discipline,to_discipline,shared_scopes,note,created_at,revoked_at')
    .eq('patient_id', patientId)
    .is('revoked_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    if (isMissingShareSchemaError(error)) throw new Error(SHARE_MIGRATION_HINT);
    throw error;
  }
  return data || [];
}

/** Compartilhamentos ATIVOS de vários pacientes de uma vez (lista da clínica). */
export async function listActiveSharesForPatients(patientIds = []) {
  if (!patientIds.length) return {};
  const user = await getAuthenticatedUser();
  if (!user) throw new Error('Usuário não autenticado.');

  let rows;
  if (LOCAL_DEVELOPMENT_MODE && user._isLocal) {
    const ids = new Set(patientIds);
    rows = getLocalShares().filter(s => ids.has(s.patient_id) && !s.revoked_at);
  } else {
    const { data, error } = await supabase
      .from('record_shares')
      .select('id,patient_id,from_discipline,to_discipline,shared_scopes,note,created_at')
      .in('patient_id', patientIds)
      .is('revoked_at', null)
      .order('created_at', { ascending: false });
    if (error) {
      if (isMissingShareSchemaError(error)) throw new Error(SHARE_MIGRATION_HINT);
      throw error;
    }
    rows = data || [];
  }

  return rows.reduce((acc, share) => {
    (acc[share.patient_id] = acc[share.patient_id] || []).push(share);
    return acc;
  }, {});
}

/** Revoga um compartilhamento (não apaga — marca revoked_at). */
export async function revokeRecordShare(shareId) {
  const user = await getAuthenticatedUser();
  if (!user) throw new Error('Usuário não autenticado.');

  if (LOCAL_DEVELOPMENT_MODE && user._isLocal) {
    const shares = getLocalShares().map(s => (
      s.id === shareId ? { ...s, revoked_at: new Date().toISOString() } : s
    ));
    saveLocalShares(shares);
    return;
  }

  const { error } = await supabase
    .from('record_shares')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', shareId);

  if (error) {
    if (isMissingShareSchemaError(error)) throw new Error(SHARE_MIGRATION_HINT);
    throw error;
  }
}

function parseSharedPayload(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Lê os registros compartilhados de um paciente (autorização no banco,
 * via get_shared_session). Devolve UM registro por disciplina — o mais
 * recente de cada uma.
 *
 * A partir de 07/08/2026 a RPC devolve qualquer disciplina, não só a
 * sessão de acupuntura, e restringe ao que foi de fato encaminhado.
 * Registro sem `discipline` é de antes dessa migração: por definição é
 * acupuntura, que era a única que existia.
 *
 * @returns {Promise<Array<{id, recordType, discipline, updatedAt, data}>>}
 */
export async function getSharedRecords(patientId) {
  const user = await getAuthenticatedUser();
  if (!user) throw new Error('Usuário não autenticado.');

  let rows;
  if (LOCAL_DEVELOPMENT_MODE && user._isLocal) {
    rows = JSON.parse(localStorage.getItem('acup_local_clinical_records') || '[]')
      .filter(r => r.patient_id === patientId)
      .map(r => ({
        id: r.id,
        record_type: r.record_type,
        discipline: r.discipline,
        sensitive_data: r.sensitive_data,
        updated_at: r.updated_at,
      }));
  } else {
    const { data, error } = await supabase.rpc('get_shared_session', { p_patient_id: patientId });
    if (error) {
      if (isMissingShareSchemaError(error)) throw new Error(SHARE_MIGRATION_HINT);
      throw error;
    }
    rows = data || [];
  }

  const latestByDiscipline = new Map();
  for (const row of rows) {
    const data = parseSharedPayload(row.sensitive_data);
    if (!data) continue;
    const discipline = row.discipline || data.discipline || 'acupuntura';
    const current = latestByDiscipline.get(discipline);
    if (current && new Date(current.updatedAt) >= new Date(row.updated_at)) continue;
    latestByDiscipline.set(discipline, {
      id: row.id,
      recordType: row.record_type,
      discipline,
      updatedAt: row.updated_at,
      data,
    });
  }

  return [...latestByDiscipline.values()]
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}
