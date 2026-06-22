export const HERBAL_CURATION_DECISIONS_KEY = 'acup_herbal_plant_curation_decisions_v1';

export const HERBAL_RELEASE_STATUS = [
  { value: 'source_only', label: 'Somente fonte' },
  { value: 'curadoria_tecnica', label: 'Curadoria técnica' },
  { value: 'educativo_aprovado', label: 'Educativo aprovado' },
  { value: 'restrito_profissional', label: 'Restrito à profissional' },
  { value: 'bloqueado_risco', label: 'Bloqueado por risco' },
];

export const HERBAL_CURATION_FILTERS = [
  { id: 'all', label: 'Todas' },
  { id: 'pending', label: 'Sem decisão' },
  { id: 'source_only', label: 'Somente fonte' },
  { id: 'curadoria_tecnica', label: 'Técnica' },
  { id: 'educativo_aprovado', label: 'Aprovadas' },
  { id: 'restrito_profissional', label: 'Restritas' },
  { id: 'bloqueado_risco', label: 'Bloqueadas' },
];

const DEFAULT_SAFETY_REVIEW = {
  botanicalIdentityConfirmed: false,
  partUsedConfirmed: false,
  toxicologyReviewed: false,
  interactionsReviewed: false,
  vulnerableGroupsReviewed: false,
  sourceScopeConfirmed: false,
};

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeStatus(value) {
  return HERBAL_RELEASE_STATUS.some(item => item.value === value) ? value : 'source_only';
}

export function normalizeHerbalCurationDecision(value = {}) {
  const plantId = normalizeText(value.plantId || value.itemId || value.id);
  const safetyReview = {
    ...DEFAULT_SAFETY_REVIEW,
    ...(value.safetyReview || {}),
  };

  return {
    id: normalizeText(value.id) || `herbal:${plantId}`,
    plantId,
    status: normalizeStatus(value.status || value.contentReleaseStatus),
    contentType: value.contentType === 'alimento' ? 'alimento' : 'planta_medicinal',
    educationalSummary: normalizeText(value.educationalSummary),
    cautionSummary: normalizeText(value.cautionSummary),
    reviewNote: normalizeText(value.reviewNote),
    mtcAssociationNote: normalizeText(value.mtcAssociationNote),
    mtcAssociationSource: normalizeText(value.mtcAssociationSource),
    safetyReview: Object.fromEntries(
      Object.entries(safetyReview).map(([key, checked]) => [key, Boolean(checked)]),
    ),
    reviewedByRole: normalizeText(value.reviewedByRole),
    reviewedByLabel: normalizeText(value.reviewedByLabel),
    createdAt: value.createdAt || nowIso(),
    updatedAt: value.updatedAt || nowIso(),
  };
}

export function isHerbalPatientEligible(decision = {}) {
  const normalized = normalizeHerbalCurationDecision(decision);
  return normalized.status === 'educativo_aprovado'
    && Object.values(normalized.safetyReview).every(Boolean)
    && normalized.educationalSummary.length >= 20
    && normalized.cautionSummary.length >= 20;
}

export function validateHerbalCurationDecision(decision, plant = {}) {
  const normalized = normalizeHerbalCurationDecision(decision);
  const errors = [];
  const requiresNote = ['curadoria_tecnica', 'restrito_profissional', 'bloqueado_risco', 'educativo_aprovado'].includes(normalized.status);

  if (!normalized.plantId) errors.push('Identificação da planta obrigatória.');
  if (requiresNote && normalized.reviewNote.length < 12) {
    errors.push('Registre uma nota de curadoria com pelo menos 12 caracteres.');
  }

  if (normalized.status === 'educativo_aprovado') {
    const missingSafety = Object.entries(normalized.safetyReview)
      .filter(([, checked]) => !checked)
      .map(([key]) => key);
    if (missingSafety.length) {
      errors.push('Confirme todos os itens de segurança antes de aprovar conteúdo educativo.');
    }
    if (!plant?.sourceSections?.partsUsed?.text) {
      errors.push('Aprovação bloqueada: a parte utilizada precisa estar rastreável na fonte.');
    }
    if (!plant?.sourceSections?.toxicology?.text) {
      errors.push('Aprovação bloqueada: a toxicologia precisa estar registrada na fonte ou revisada em fonte complementar.');
    }
    if (normalized.educationalSummary.length < 20) {
      errors.push('Inclua uma síntese educativa interna com pelo menos 20 caracteres.');
    }
    if (normalized.cautionSummary.length < 20) {
      errors.push('Inclua cautelas revisadas com pelo menos 20 caracteres.');
    }
  }

  if (normalized.mtcAssociationNote && !normalized.mtcAssociationSource) {
    errors.push('Informe a fonte da associação MTC ou remova essa anotação.');
  }

  return { ok: errors.length === 0, errors, decision: normalized };
}

export function getLocalHerbalCurationDecisions() {
  if (typeof localStorage === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(HERBAL_CURATION_DECISIONS_KEY) || '[]');
    return Array.isArray(parsed)
      ? parsed.map(normalizeHerbalCurationDecision).filter(item => item.plantId)
      : [];
  } catch {
    return [];
  }
}

export function saveLocalHerbalCurationDecision(payload) {
  const current = getLocalHerbalCurationDecisions();
  const existing = current.find(item => item.plantId === payload.plantId);
  const decision = normalizeHerbalCurationDecision({
    ...existing,
    ...payload,
    createdAt: payload.createdAt || existing?.createdAt || nowIso(),
    updatedAt: nowIso(),
  });
  const next = [decision, ...current.filter(item => item.plantId !== decision.plantId)];
  localStorage.setItem(HERBAL_CURATION_DECISIONS_KEY, JSON.stringify(next));
  return decision;
}

export function removeLocalHerbalCurationDecision(plantId) {
  const next = getLocalHerbalCurationDecisions().filter(item => item.plantId !== plantId);
  localStorage.setItem(HERBAL_CURATION_DECISIONS_KEY, JSON.stringify(next));
}

export function materializeHerbalCurationRows(items = [], decisions = []) {
  const byPlantId = new Map(decisions.map(item => [item.plantId, normalizeHerbalCurationDecision(item)]));
  return items.map(plant => {
    const decision = byPlantId.get(plant.id) || null;
    const status = decision?.status || plant.contentReleaseStatus || 'source_only';
    return {
      ...plant,
      contentReleaseStatus: status,
      curationDecision: decision,
      patientEligible: decision ? isHerbalPatientEligible(decision) : false,
    };
  });
}

function searchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function filterHerbalCurationRows(rows = [], { query = '', filter = 'all', safety = 'all' } = {}) {
  const term = searchText(query).trim();
  return rows.filter(row => {
    const hasDecision = Boolean(row.curationDecision);
    if (filter === 'pending' && hasDecision) return false;
    if (filter !== 'all' && filter !== 'pending' && row.contentReleaseStatus !== filter) return false;
    if (safety === 'with_toxicology' && !row.sourceSections?.toxicology?.text) return false;
    if (safety === 'without_toxicology' && row.sourceSections?.toxicology?.text) return false;
    if (safety === 'with_indications' && !row.sourceSections?.traditionalIndications?.text) return false;
    if (!term) return true;

    return searchText([
      row.commonName,
      row.scientificNameSource,
      row.scientificNameLookup,
      row.botanicalFamily,
      row.sourceSections?.traditionalProperties?.text,
      row.sourceSections?.traditionalIndications?.text,
      row.sourceMentionedBodyTerms?.join(' '),
      row.curationDecision?.reviewNote,
      row.curationDecision?.educationalSummary,
    ].filter(Boolean).join(' ')).includes(term);
  });
}

export function summarizeHerbalCurationRows(rows = []) {
  const count = status => rows.filter(row => row.contentReleaseStatus === status).length;
  return {
    total: rows.length,
    pending: rows.filter(row => !row.curationDecision).length,
    sourceOnly: count('source_only'),
    technical: count('curadoria_tecnica'),
    approved: count('educativo_aprovado'),
    restricted: count('restrito_profissional'),
    blocked: count('bloqueado_risco'),
    patientEligible: rows.filter(row => row.patientEligible).length,
    withToxicology: rows.filter(row => Boolean(row.sourceSections?.toxicology?.text)).length,
  };
}

export function downloadHerbalCurationDecisions(filename = 'curadoria-interna-ervas.json') {
  const decisions = getLocalHerbalCurationDecisions();
  const envelope = {
    schemaVersion: 'sistema-acup-herbal-curation-decisions.v1',
    generatedAt: nowIso(),
    policy: {
      sourceOnlyByDefault: true,
      patientData: 'never',
      requiresProfessionalAudit: true,
    },
    decisions,
  };
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
