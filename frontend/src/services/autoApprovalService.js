/**
 * autoApprovalService.js
 * Gerencia a aprovação automática de pontos KM-Agent via correspondência com o Atlas Ednéa Martins.
 *
 * high-confidence:  approved_local automaticamente (entra no raciocínio clínico)
 * medium-confidence: pending_atlas_review (aparece na fila para revisão)
 * low-confidence:   draft_low (aparece na lista mas não entra no engine)
 *
 * requiresProfessionalAudit: true em todos — não migra para Supabase sem auditoria.
 */

import {
  getHighConfidenceKnowledgeReviews,
  getDeepCuratedKnowledgeReviews,
  getLocalKnowledgeReviews,
  saveLocalKnowledgeReview,
} from './knowledgeAdminService';
import {
  KM_AGENT_DRAFT_INDEX_URL,
  KM_AGENT_ENRICHED_INDEX_URL,
} from '../knowledge/kmAgentDrafts';

export const ATLAS_CONFIDENCE_LEVELS = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
};

export const APPROVAL_STATUSES = {
  APPROVED: 'approved_local',
  PENDING_MEDIUM: 'pending_atlas_review',
  PENDING_LOW: 'draft_low',
};

// ---------------------------------------------------------------------------
// Utilitários internos
// ---------------------------------------------------------------------------

function normalizeCode(value) {
  return String(value || '').toUpperCase().trim();
}

function draftCode(draft) {
  return normalizeCode(draft?.code || draft?.displayCode || draft?.id || '');
}

function reviewCode(review) {
  return normalizeCode(review?.code || review?.displayCode || review?.sourceDraftId || review?.id || '');
}

/**
 * Busca o índice KM-Agent, tentando primeiro o enriquecido e fazendo fallback para o básico.
 * @returns {Promise<object[]>}
 */
export async function fetchKmAgentDrafts() {
  if (typeof fetch === 'undefined') return [];

  async function tryUrl(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  }

  try {
    return await tryUrl(KM_AGENT_ENRICHED_INDEX_URL);
  } catch {
    try {
      return await tryUrl(KM_AGENT_DRAFT_INDEX_URL);
    } catch {
      return [];
    }
  }
}

// ---------------------------------------------------------------------------
// Classificação de candidatos
// ---------------------------------------------------------------------------

/**
 * Retorna candidatos à aprovação automática classificados por confiança.
 *
 * @returns {Promise<{
 *   high: object[],
 *   medium: object[],
 *   low: object[],
 *   skipped: object[],
 * }>}
 */
export async function getAutoApprovalCandidates() {
  const [drafts, highConfidenceReviews, deepCuratedReviews] = await Promise.all([
    fetchKmAgentDrafts(),
    getHighConfidenceKnowledgeReviews(),
    getDeepCuratedKnowledgeReviews(),
  ]);

  const localReviews = getLocalKnowledgeReviews();

  // Índices por código normalizado para lookup O(1)
  const highCodes = new Set(highConfidenceReviews.map(reviewCode));
  const curatedCodes = new Set(deepCuratedReviews.map(reviewCode));
  const localCodes = new Set(localReviews.map(reviewCode));

  const result = { high: [], medium: [], low: [], skipped: [] };

  for (const draft of drafts) {
    const code = draftCode(draft);
    if (!code) continue;

    // Revisado manualmente pelo usuário (localStorage) → ignorar na automação
    if (localCodes.has(code)) {
      result.skipped.push(draft);
      continue;
    }

    if (highCodes.has(code)) {
      // Já existe como approved_local no high-confidence
      result.high.push(draft);
    } else if (curatedCodes.has(code)) {
      // Existe no deep-curated mas não no high-confidence
      result.medium.push(draft);
    } else {
      result.low.push(draft);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Execução da aprovação automática
// ---------------------------------------------------------------------------

/**
 * Executa a aprovação automática dos candidatos.
 * - HIGH  → salva como approved_local
 * - MEDIUM → salva como pending_atlas_review
 * - LOW   → salva como draft_low
 *
 * @param {{ onProgress?: (info: object) => void }} options
 * @returns {Promise<{ approved: number, queued: number, flagged: number, errors: string[] }>}
 */
export async function runAutoApproval({ onProgress } = {}) {
  const candidates = await getAutoApprovalCandidates();
  const errors = [];
  let approved = 0;
  let queued = 0;
  let flagged = 0;

  const [highConfidenceReviews, deepCuratedReviews] = await Promise.all([
    getHighConfidenceKnowledgeReviews(),
    getDeepCuratedKnowledgeReviews(),
  ]);

  const highByCode = new Map(highConfidenceReviews.map(r => [reviewCode(r), r]));
  const curatedByCode = new Map(deepCuratedReviews.map(r => [reviewCode(r), r]));

  // Processar HIGH → approved_local
  for (const draft of candidates.high) {
    try {
      const code = draftCode(draft);
      const sourceReview = highByCode.get(code) || {};
      saveLocalKnowledgeReview({
        ...sourceReview,
        code,
        displayCode: draft.displayCode || draft.code,
        status: APPROVAL_STATUSES.APPROVED,
        approvalMethod: 'auto_high_confidence_atlas',
        requiresProfessionalAudit: true,
        approvalMode: 'local_only',
        sourceDraftId: draft.id || draft.code,
      });
      approved++;
      onProgress?.({ type: 'approved', code, total: candidates.high.length, done: approved });
    } catch (err) {
      errors.push(`HIGH ${draftCode(draft)}: ${err?.message || err}`);
    }
  }

  // Processar MEDIUM → pending_atlas_review
  for (const draft of candidates.medium) {
    try {
      const code = draftCode(draft);
      const sourceReview = curatedByCode.get(code) || {};
      saveLocalKnowledgeReview({
        ...sourceReview,
        code,
        displayCode: draft.displayCode || draft.code,
        status: APPROVAL_STATUSES.PENDING_MEDIUM,
        approvalMethod: 'auto_medium_confidence_atlas',
        requiresProfessionalAudit: true,
        approvalMode: 'local_only',
        sourceDraftId: draft.id || draft.code,
      });
      queued++;
      onProgress?.({ type: 'queued', code, total: candidates.medium.length, done: queued });
    } catch (err) {
      errors.push(`MEDIUM ${draftCode(draft)}: ${err?.message || err}`);
    }
  }

  // Processar LOW → draft_low (registra para visibilidade, sem entrar no engine)
  for (const draft of candidates.low) {
    try {
      const code = draftCode(draft);
      saveLocalKnowledgeReview({
        code,
        displayCode: draft.displayCode || draft.code,
        status: APPROVAL_STATUSES.PENDING_LOW,
        approvalMethod: 'auto_low_confidence',
        requiresProfessionalAudit: true,
        approvalMode: 'local_only',
        sourceDraftId: draft.id || draft.code,
      });
      flagged++;
      onProgress?.({ type: 'flagged', code, total: candidates.low.length, done: flagged });
    } catch (err) {
      errors.push(`LOW ${draftCode(draft)}: ${err?.message || err}`);
    }
  }

  return { approved, queued, flagged, errors };
}

// ---------------------------------------------------------------------------
// Estatísticas sem execução
// ---------------------------------------------------------------------------

/**
 * Retorna contagens de candidatos sem executar a aprovação.
 * @returns {Promise<{ high: number, medium: number, low: number, skipped: number, total: number }>}
 */
export async function getAutoApprovalStats() {
  const candidates = await getAutoApprovalCandidates();
  return {
    high: candidates.high.length,
    medium: candidates.medium.length,
    low: candidates.low.length,
    skipped: candidates.skipped.length,
    total: candidates.high.length + candidates.medium.length + candidates.low.length + candidates.skipped.length,
  };
}
