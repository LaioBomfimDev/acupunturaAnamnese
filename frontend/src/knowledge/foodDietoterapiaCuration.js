// ============================================================
// foodDietoterapiaCuration — decisões de curadoria dos ALIMENTOS
//
// Trilha alimento é mais leve que a de ervas (sem toxicologia botânica), mas o
// gate humano continua: aprovar como `educativo_aprovado` exige revisão de
// linguagem, cautelas e fonte. Decisões locais exportáveis por `foodId`, sem
// duplicar texto de PDF. Espelha o padrão de herbalPlantCuration.js.
// ============================================================

import { FOOD_CATALOG, getFoodById } from './foodDietoterapia.js';

export const FOOD_CURATION_DECISIONS_KEY = 'acup_food_curation_decisions_v1';

export const FOOD_RELEASE_STATUS = [
  { value: 'source_only', label: 'Somente fonte' },
  { value: 'curadoria_tecnica', label: 'Curadoria técnica' },
  { value: 'educativo_aprovado', label: 'Educativo aprovado' },
  { value: 'restrito_profissional', label: 'Restrito à profissional' },
  { value: 'bloqueado_risco', label: 'Bloqueado por risco' },
];

export const FOOD_CURATION_FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'pending', label: 'Sem decisão' },
  { id: 'curadoria_tecnica', label: 'Técnica' },
  { id: 'educativo_aprovado', label: 'Aprovados' },
  { id: 'restrito_profissional', label: 'Restritos' },
  { id: 'bloqueado_risco', label: 'Bloqueados' },
];

// Status default do catálogo: revisado conceitualmente contra a fonte, uso
// interno — não aparece para paciente até o gate humano aprovar.
export const FOOD_DEFAULT_STATUS = 'curadoria_tecnica';

const DEFAULT_REVIEW = {
  sourceConfirmed: false,
  languageReviewed: false,
  cautionsReviewed: false,
};

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeStatus(value) {
  return FOOD_RELEASE_STATUS.some(item => item.value === value) ? value : FOOD_DEFAULT_STATUS;
}

export function normalizeFoodCurationDecision(value = {}) {
  const foodId = normalizeText(value.foodId || value.itemId || value.id);
  const review = { ...DEFAULT_REVIEW, ...(value.review || {}) };
  return {
    id: normalizeText(value.id) || `food:${foodId}`,
    foodId,
    status: normalizeStatus(value.status),
    cautionNote: normalizeText(value.cautionNote),
    reviewNote: normalizeText(value.reviewNote),
    review: Object.fromEntries(Object.entries(review).map(([k, v]) => [k, Boolean(v)])),
    reviewedByLabel: normalizeText(value.reviewedByLabel),
    createdAt: value.createdAt || nowIso(),
    updatedAt: value.updatedAt || nowIso(),
  };
}

export function isFoodPatientEligible(decision = {}) {
  const normalized = normalizeFoodCurationDecision(decision);
  return normalized.status === 'educativo_aprovado'
    && Object.values(normalized.review).every(Boolean)
    && normalized.reviewNote.length >= 12;
}

export function validateFoodCurationDecision(decision) {
  const normalized = normalizeFoodCurationDecision(decision);
  const errors = [];
  if (!normalized.foodId) errors.push('Identificação do alimento obrigatória.');
  if (!getFoodById(normalized.foodId)) errors.push('Alimento não encontrado no catálogo.');

  const requiresNote = ['educativo_aprovado', 'restrito_profissional', 'bloqueado_risco'].includes(normalized.status);
  if (requiresNote && normalized.reviewNote.length < 12) {
    errors.push('Registre uma nota de curadoria com pelo menos 12 caracteres.');
  }
  if (normalized.status === 'educativo_aprovado') {
    const missing = Object.entries(normalized.review).filter(([, v]) => !v);
    if (missing.length) errors.push('Confirme fonte, linguagem e cautelas antes de aprovar para exibição.');
  }
  return { ok: errors.length === 0, errors, decision: normalized };
}

export function getLocalFoodCurationDecisions() {
  if (typeof localStorage === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(FOOD_CURATION_DECISIONS_KEY) || '[]');
    return Array.isArray(parsed)
      ? parsed.map(normalizeFoodCurationDecision).filter(item => item.foodId)
      : [];
  } catch {
    return [];
  }
}

export function saveLocalFoodCurationDecision(payload) {
  const current = getLocalFoodCurationDecisions();
  const existing = current.find(item => item.foodId === payload.foodId);
  const decision = normalizeFoodCurationDecision({
    ...existing,
    ...payload,
    createdAt: payload.createdAt || existing?.createdAt || nowIso(),
    updatedAt: nowIso(),
  });
  const next = [decision, ...current.filter(item => item.foodId !== decision.foodId)];
  localStorage.setItem(FOOD_CURATION_DECISIONS_KEY, JSON.stringify(next));
  return decision;
}

export function removeLocalFoodCurationDecision(foodId) {
  const next = getLocalFoodCurationDecisions().filter(item => item.foodId !== foodId);
  localStorage.setItem(FOOD_CURATION_DECISIONS_KEY, JSON.stringify(next));
}

export function materializeFoodCurationRows(decisions = []) {
  const byFoodId = new Map(decisions.map(item => [item.foodId, normalizeFoodCurationDecision(item)]));
  return FOOD_CATALOG.map(food => {
    const decision = byFoodId.get(food.id) || null;
    const status = decision?.status || FOOD_DEFAULT_STATUS;
    return {
      ...food,
      contentReleaseStatus: status,
      curationDecision: decision,
      patientEligible: decision ? isFoodPatientEligible(decision) : false,
    };
  });
}

function searchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export function filterFoodCurationRows(rows = [], { query = '', filter = 'all' } = {}) {
  const term = searchText(query).trim();
  return rows.filter(row => {
    const hasDecision = Boolean(row.curationDecision);
    if (filter === 'pending' && hasDecision) return false;
    if (filter !== 'all' && filter !== 'pending' && row.contentReleaseStatus !== filter) return false;
    if (!term) return true;
    return searchText([row.commonName, row.curationDecision?.reviewNote].filter(Boolean).join(' ')).includes(term);
  });
}

export function summarizeFoodCurationRows(rows = []) {
  const count = status => rows.filter(row => row.contentReleaseStatus === status).length;
  return {
    total: rows.length,
    pending: rows.filter(row => !row.curationDecision).length,
    technical: count('curadoria_tecnica'),
    approved: count('educativo_aprovado'),
    restricted: count('restrito_profissional'),
    blocked: count('bloqueado_risco'),
    patientEligible: rows.filter(row => row.patientEligible).length,
  };
}

export function downloadFoodCurationDecisions({ filename = 'curadoria-interna-alimentos.json' } = {}) {
  const decisions = getLocalFoodCurationDecisions();
  const envelope = {
    schemaVersion: 'sistema-acup-food-curation-decisions.v1',
    generatedAt: nowIso(),
    policy: {
      defaultStatus: FOOD_DEFAULT_STATUS,
      patientData: 'never',
      requiresProfessionalAudit: true,
    },
    decisionCount: decisions.length,
    decisions,
  };
  if (typeof document === 'undefined') return envelope;
  const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return envelope;
}
