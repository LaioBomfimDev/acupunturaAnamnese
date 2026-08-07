type ActiveKnowledgeReview = {
  entity_id?: string;
  entity_key?: string;
  entity_type?: string;
  entity_title?: string;
  entity_code?: string;
  entity_tags?: string[];
  version?: number;
  payload?: Record<string, unknown>;
  source_ids?: string[];
  approved_at?: string;
};

type KnowledgeEntity = {
  id?: string;
  entity_key?: string;
  entity_type?: string;
  title?: string;
  code?: string;
  tags?: string[];
};

type KnowledgeSource = {
  id?: string;
  source_key?: string;
  title?: string;
  citation?: string;
};

export type ApprovedKnowledgeContext = {
  entityId: string;
  version: number;
  title: string;
  category: string;
  confidence: 'high' | 'medium' | 'low';
  source: string;
  text: string;
  provenanceId: string;
};

const STOPWORDS = new Set([
  'que', 'qual', 'quais', 'como', 'para', 'com', 'sem', 'dos', 'das', 'uma',
  'uns', 'por', 'pra', 'sao', 'ser', 'tem', 'onde', 'quando', 'porque', 'sobre',
  'mais', 'menos', 'pode', 'usar', 'usado', 'serve', 'indicado', 'indicada',
]);

const CLINICAL_PAYLOAD_FIELDS = [
  'summary',
  'description',
  'locationText',
  'actions',
  'indications',
  'cautions',
  'techniques',
  'needling',
  'clinicalNote',
  'text',
  'content',
  'relatedSymptoms',
  'safety',
];

function normalize(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function tokenize(value: unknown) {
  return [...new Set(
    normalize(value)
      .split(/[^a-z0-9]+/)
      .filter(token => token.length >= 3 && !STOPWORDS.has(token)),
  )];
}

function flattenClinicalValue(value: unknown, depth = 0): string[] {
  if (typeof value === 'string' || typeof value === 'number') {
    return [String(value).trim()].filter(Boolean);
  }
  if (Array.isArray(value)) {
    return value.flatMap(item => flattenClinicalValue(item, depth + 1));
  }
  if (value && typeof value === 'object' && depth < 2) {
    return Object.values(value).flatMap(item => flattenClinicalValue(item, depth + 1));
  }
  return [];
}

function payloadText(payload: Record<string, unknown>) {
  return CLINICAL_PAYLOAD_FIELDS
    .flatMap(field => flattenClinicalValue(payload[field]))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 2400);
}

function confidenceFor(payload: Record<string, unknown>): 'high' | 'medium' | 'low' {
  const value = normalize(payload.confidence || payload.confidenceLevel);
  if (value === 'high' || value === 'alta') return 'high';
  if (value === 'low' || value === 'baixa') return 'low';
  if (value === 'medium' || value === 'media') return 'medium';
  // Ausência de evidência nunca vira confiança alta por omissão.
  return 'low';
}

function scoreEntity(questionTerms: string[], entity: KnowledgeEntity, payload: Record<string, unknown>) {
  const title = normalize([entity.title, entity.code].filter(Boolean).join(' '));
  const tags = normalize((entity.tags || []).join(' '));
  const body = normalize(payloadText(payload));
  let score = 0;

  for (const term of questionTerms) {
    if (title.includes(term)) score += 5;
    else if (tags.includes(term)) score += 3;
    else if (body.includes(term)) score += 1;
  }
  return score;
}

function sourceLabel(
  sourceIds: string[],
  payload: Record<string, unknown>,
  sources: Map<string, KnowledgeSource>,
) {
  const registered = sourceIds
    .map(id => sources.get(id))
    .filter(Boolean)
    .map(source => source?.citation || source?.title || source?.source_key)
    .filter(Boolean);
  if (registered.length) return registered.join('; ').slice(0, 800);

  return String(
    payload.approvalSource
    || payload.sourceTitle
    || payload.source
    || 'Fonte aprovada sem rótulo',
  ).slice(0, 800);
}

/**
 * Recupera somente entidades aprovadas e apenas a versão marcada como corrente.
 * O cliente nunca escolhe nem injeta o contexto usado pelo modelo.
 */
export async function retrieveApprovedKnowledge(
  supabaseAdmin: {
    rpc: (
      functionName: string,
    ) => Promise<{ data: unknown; error: { message?: string } | null }>;
    from: (table: string) => {
      select: (columns: string) => {
        in?: (column: string, values: string[]) => Promise<{ data: unknown; error: { message?: string } | null }>;
      };
    };
  },
  question: string,
  limit = 12,
): Promise<ApprovedKnowledgeContext[]> {
  const terms = tokenize(question);
  if (!terms.length) return [];

  // A RPC é a única fonte da verdade para status corrente, gate profissional
  // e proveniência. A Edge usa service role, portanto não pode reconstruir
  // parcialmente essas regras consultando tabelas diretamente.
  const entitiesResult = await supabaseAdmin.rpc(
    'get_active_knowledge_reviews',
  );

  if (entitiesResult.error) {
    throw new Error('Não foi possível recuperar a base de conhecimento aprovada.');
  }

  const candidates = ((entitiesResult.data || []) as ActiveKnowledgeReview[])
    .map(review => {
      const payload = review.payload;
      if (!payload || typeof payload !== 'object') return null;
      const entity: KnowledgeEntity = {
        id: review.entity_id,
        entity_key: review.entity_key,
        entity_type: review.entity_type,
        title: review.entity_title,
        code: review.entity_code,
        tags: review.entity_tags,
      };
      const score = scoreEntity(terms, entity, payload);
      return score > 0 ? { entity, payload, score, review } : null;
    })
    .filter((item): item is {
      entity: KnowledgeEntity;
      payload: Record<string, unknown>;
      score: number;
      review: ActiveKnowledgeReview;
    } => Boolean(item))
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(1, Math.min(limit, 20)));

  const sourceIds = [...new Set(candidates.flatMap(item => item.review.source_ids || []))];
  const sources = new Map<string, KnowledgeSource>();
  if (sourceIds.length) {
    const sourceResult = await supabaseAdmin
      .from('knowledge_sources')
      .select('id,source_key,title,citation')
      .in?.('id', sourceIds);
    if (sourceResult?.error) {
      throw new Error('Não foi possível recuperar a proveniência do conhecimento aprovado.');
    }
    for (const source of (sourceResult?.data || []) as KnowledgeSource[]) {
      if (source.id) sources.set(source.id, source);
    }
  }

  return candidates.map(({ entity, payload, review }) => {
    const entityId = String(entity.id || '');
    const versionNumber = Number(review.version) || 1;
    return {
      entityId,
      version: versionNumber,
      title: String(entity.title || payload.title || entity.code || 'Item sem título').slice(0, 300),
      category: String(entity.entity_type || payload.category || 'Conhecimento').slice(0, 100),
      confidence: confidenceFor(payload),
      source: sourceLabel(review.source_ids || [], payload, sources),
      text: payloadText(payload),
      provenanceId: `${entityId}@${versionNumber}`,
    };
  }).filter(item => item.entityId && item.text);
}
