type ActiveKnowledgeReview = {
  entity_id?: string;
  entity_key?: string;
  entity_type?: string;
  entity_title?: string;
  entity_code?: string;
  version?: number;
  payload?: Record<string, unknown>;
  source_ids?: string[];
};

export type PublishedFoodKnowledge = {
  entityId: string;
  version: number;
  title: string;
  summary: string;
  traditionalAssociations: string;
  safety: string;
  evidenceNote: string;
  sourceIds: string[];
  provenanceId: string;
};

const FOOD_ENTITY_TYPES = new Set([
  'food',
  'alimento',
  'dietoterapia_food',
  'dietoterapia_alimento',
]);

const HERB_MARKERS = new Set([
  'herb',
  'erva',
  'planta',
  'planta_medicinal',
  'fitoterapico',
  'fitoterápico',
]);

export const SAFE_FOOD_RESEARCH_MODES = new Set([
  'visao_geral',
  'mtc',
  'seguranca',
]);

function normalize(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function text(value: unknown, maximum = 2400) {
  return typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim().slice(0, maximum)
    : '';
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function releaseStatus(payload: Record<string, unknown>) {
  const decision = object(payload.curationDecision);
  return normalize(
    payload.contentReleaseStatus
    || payload.content_release_status
    || decision.status,
  );
}

function contentType(payload: Record<string, unknown>) {
  const decision = object(payload.curationDecision);
  return normalize(
    payload.contentType
    || payload.content_type
    || payload.itemType
    || decision.contentType,
  );
}

function foodReview(payload: Record<string, unknown>) {
  const decision = object(payload.curationDecision);
  return object(
    payload.foodReview
    || payload.foodSafetyReview
    || payload.review
    || decision.review,
  );
}

function isProfessionallyPublished(payload: Record<string, unknown>) {
  const professionalReview = object(payload.professionalReview);
  return payload.requiresProfessionalAudit === false
    && payload.approvalMode === 'server_professional'
    && professionalReview.decision === 'approved'
    && text(professionalReview.attestationId, 200).length > 0;
}

function exactFoodNameMatches(
  review: ActiveKnowledgeReview,
  payload: Record<string, unknown>,
  requestedName: string,
) {
  const names = [
    review.entity_title,
    review.entity_code,
    payload.commonName,
    payload.title,
    payload.name,
  ].map(normalize).filter(Boolean);
  return names.includes(normalize(requestedName));
}

function contextFromReview(
  review: ActiveKnowledgeReview,
  requestedName: string,
): PublishedFoodKnowledge | null {
  const payload = object(review.payload);
  const reviewFlags = foodReview(payload);
  const entityType = normalize(review.entity_type);

  if (!FOOD_ENTITY_TYPES.has(entityType)) return null;
  if (releaseStatus(payload) !== 'educativo_aprovado') return null;
  if (contentType(payload) !== 'alimento') return null;
  if (!isProfessionallyPublished(payload)) return null;
  if (
    reviewFlags.sourceConfirmed !== true
    || reviewFlags.languageReviewed !== true
    || reviewFlags.cautionsReviewed !== true
  ) {
    return null;
  }
  if (!exactFoodNameMatches(review, payload, requestedName)) return null;

  const entityId = text(review.entity_id, 100);
  const version = Number(review.version);
  const title = text(
    review.entity_title || payload.commonName || payload.title,
    200,
  );
  const summary = text(
    payload.educationalSummary || payload.summary,
  );
  const traditionalAssociations = text(
    payload.mtcAssociationNote
    || payload.traditionalAssociations
    || payload.tradition,
  );
  const safety = text(
    payload.cautionSummary
    || payload.caution
    || payload.safety,
  );
  const evidenceNote = text(
    payload.evidenceNote || payload.evidenceLevel,
    500,
  );

  if (
    !entityId
    || !Number.isInteger(version)
    || version < 1
    || !title
    || summary.length < 20
    || safety.length < 12
  ) {
    return null;
  }
  if (containsProhibitedFoodGuidance({
    summary,
    traditionalAssociations,
    safety,
    evidenceNote,
  })) {
    return null;
  }

  return {
    entityId,
    version,
    title,
    summary,
    traditionalAssociations,
    safety,
    evidenceNote,
    sourceIds: Array.isArray(review.source_ids)
      ? review.source_ids.map(value => text(value, 100)).filter(Boolean)
      : [],
    provenanceId: `${entityId}@${version}`,
  };
}

export function selectPublishedFoodKnowledge(
  reviews: unknown,
  requestedName: string,
  limit = 4,
) {
  if (!Array.isArray(reviews)) return [];
  return reviews
    .map(review => contextFromReview(
      object(review) as ActiveKnowledgeReview,
      requestedName,
    ))
    .filter((item): item is PublishedFoodKnowledge => Boolean(item))
    .slice(0, Math.max(1, Math.min(limit, 8)));
}

export function isExplicitHerbRequest(body: unknown) {
  const request = object(body);
  const item = object(request.food);
  return [
    request.itemType,
    request.contentType,
    request.kind,
    item.itemType,
    item.contentType,
    item.kind,
  ].some(value => HERB_MARKERS.has(normalize(value)));
}

export function isSafeFoodName(value: unknown) {
  const candidate = String(value || '').trim();
  return candidate.length >= 2
    && candidate.length <= 120
    && /^[\p{L}\p{M}0-9 .,'’()/-]+$/u.test(candidate);
}

const PROHIBITED_GUIDANCE_PATTERNS = [
  /\breceitas?\b/i,
  /\b(?:modo de preparo|preparar|prepare|preparo|prepara[cç][aã]o)\b/i,
  /\bingredientes?\s*:/i,
  /\b(?:dose|dosagem|posologia)\b/i,
  /\b(?:card[aá]pio|plano alimentar|por[cç][oõ]es?)\b/i,
  /\b(?:ferva|misture|bata|cozinhe|deixe em infus[aã]o)\b/i,
  /\b(?:ch[aá]|infus[aã]o|decoc[cç][aã]o|extrato|c[aá]psulas?)\b/i,
  /\b\d+(?:[.,]\d+)?\s*(?:mg|g|ml|gotas?|colheres?|x[ií]caras?|c[aá]psulas?)\b/i,
  /\b(?:uma|duas|tr[eê]s|meia)\s+(?:gotas?|colheres?|x[ií]caras?|c[aá]psulas?)\b/i,
  /\b(?:tomar|ingerir|consumir|usar)\s+(?:uma|duas|tr[eê]s|\d+)\b/i,
  /\b(?:uma|duas|tr[eê]s|\d+)\s+vezes?\s+ao\s+dia\b/i,
  /\b(?:diariamente|por dia|antes das refei[cç][oõ]es)\b/i,
];

export function containsProhibitedFoodGuidance(value: unknown) {
  const serialized = typeof value === 'string'
    ? value
    : JSON.stringify(value || {});
  return PROHIBITED_GUIDANCE_PATTERNS.some(pattern => pattern.test(serialized));
}

export function renderPublishedFoodContext(
  items: PublishedFoodKnowledge[],
) {
  const published: Array<Record<string, unknown>> = [];
  let serializedSize = 2;

  for (const [index, item] of items.entries()) {
    const candidate = {
      id: `A${index + 1}`,
      versionId: item.provenanceId,
      title: item.title,
      educationalSummary: item.summary,
      traditionalAssociations: item.traditionalAssociations || undefined,
      reviewedCautions: item.safety,
      evidenceNote: item.evidenceNote || undefined,
      sourceIds: item.sourceIds,
    };
    const serialized = JSON.stringify(candidate);
    if (serializedSize + serialized.length + 1 > 12_000) break;
    published.push(candidate);
    serializedSize += serialized.length + 1;
  }

  return JSON.stringify(published);
}
