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
export async function createRecordShare(patientId, { fromDiscipline, toDiscipline, scopes, note } = {}) {
  assertDiscipline(fromDiscipline, 'origem');
  assertDiscipline(toDiscipline, 'destino');
  if (fromDiscipline === toDiscipline) {
    throw new Error('Origem e destino não podem ser a mesma disciplina.');
  }
  const sharedScopes = normalizeSharedScopes(scopes);

  const user = await getAuthenticatedUser();
  if (!user) throw new Error('Usuário não autenticado.');

  if (user._isLocal) {
    const share = {
      id: `local-share-${Date.now()}`,
      patient_id: patientId,
      from_discipline: fromDiscipline,
      to_discipline: toDiscipline,
      shared_scopes: sharedScopes,
      shared_by: user.id,
      note: note || null,
      created_at: new Date().toISOString(),
      revoked_at: null,
    };
    saveLocalShares([share, ...getLocalShares()]);
    return share;
  }

  const { data, error } = await supabase
    .from('record_shares')
    .insert({
      patient_id: patientId,
      from_discipline: fromDiscipline,
      to_discipline: toDiscipline,
      shared_scopes: sharedScopes,
      note: note || null,
    })
    .select()
    .single();

  if (error) {
    if (isMissingShareSchemaError(error)) throw new Error(SHARE_MIGRATION_HINT);
    throw error;
  }
  return data;
}

/** Lista os compartilhamentos ATIVOS de um paciente. */
export async function listActiveShares(patientId) {
  const user = await getAuthenticatedUser();
  if (!user) throw new Error('Usuário não autenticado.');

  if (user._isLocal) {
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
  if (user._isLocal) {
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

  if (user._isLocal) {
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

/**
 * Lê a sessão compartilhada de um paciente (autorização no banco via
 * get_shared_session). Devolve o objeto de sessão mais recente ou null.
 */
export async function getSharedSession(patientId) {
  const user = await getAuthenticatedUser();
  if (!user) throw new Error('Usuário não autenticado.');

  if (user._isLocal) {
    try {
      const records = JSON.parse(localStorage.getItem('acup_local_clinical_records') || '[]');
      const record = records
        .filter(r => r.patient_id === patientId && r.record_type === 'full_session')
        .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))[0];
      return record ? record.sensitive_data : null;
    } catch {
      return null;
    }
  }

  const { data, error } = await supabase.rpc('get_shared_session', { p_patient_id: patientId });
  if (error) {
    if (isMissingShareSchemaError(error)) throw new Error(SHARE_MIGRATION_HINT);
    throw error;
  }
  const record = (data || [])[0];
  if (!record?.sensitive_data) return null;
  try {
    return JSON.parse(record.sensitive_data);
  } catch {
    return null;
  }
}
