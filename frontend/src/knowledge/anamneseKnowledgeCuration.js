export const ANAMNESE_KNOWLEDGE_DECISIONS_KEY = 'acup.knowledge.anamnese.decisions.v1';

export const FINDING_CANDIDATES_ASSET_KEY = 'pdf-sources/knowledge/finding-candidates.local.json';
export const QUESTION_CANDIDATES_ASSET_KEY = 'pdf-sources/knowledge/question-candidates.local.json';
export const PATTERN_CANDIDATES_ASSET_KEY = 'pdf-sources/knowledge/pattern-candidates.local.json';
export const PATTERN_NORMALIZATION_MAP_ASSET_KEY = 'pdf-sources/knowledge/pattern-normalization-map.local.json';
export const APPROVED_KNOWLEDGE_ASSET_KEY = 'pdf-sources/knowledge/approved-knowledge.local.json';

export const FINDING_CANDIDATES_URL = '/knowledge/source-assets/pdf-sources/knowledge/finding-candidates.local.json';
export const QUESTION_CANDIDATES_URL = '/knowledge/source-assets/pdf-sources/knowledge/question-candidates.local.json';
export const PATTERN_CANDIDATES_URL = '/knowledge/source-assets/pdf-sources/knowledge/pattern-candidates.local.json';
export const PATTERN_NORMALIZATION_MAP_URL = '/knowledge/source-assets/pdf-sources/knowledge/pattern-normalization-map.local.json';
export const APPROVED_KNOWLEDGE_URL = '/knowledge/source-assets/pdf-sources/knowledge/approved-knowledge.local.json';

export const CANONICAL_PATTERN_NAMES = [
  'Ascensão do Yang do Fígado',
  'Qi do Fígado invadindo Baço/Estômago',
  'Umidade-Calor',
  'Deficiência de Qi do Baço',
  'Agitação do Shen por Calor',
  'Deficiência de Yin do Rim',
  'Deficiência de Yang do Rim',
  'Deficiência de Xue do Fígado',
  'Estagnação de Xue',
  'Deficiência de Qi do Pulmão',
];

export const KNOWLEDGE_FILTERS = [
  { id: 'unanswered', label: 'Não respondidos' },
  { id: 'high', label: 'Alta confiança' },
  { id: 'lingua', label: 'Língua' },
  { id: 'diagnostico', label: 'Diagnóstico' },
  { id: 'saved', label: 'Salvos' },
  { id: 'all', label: 'Todos' },
];

const MTC_TERMS = [
  'qi', 'xue', 'yin', 'yang', 'shen', 'jing',
  'baco', 'estomago', 'figado', 'vesicula', 'rim', 'rins', 'coracao', 'pulmao',
  'umidade', 'calor', 'frio', 'vento', 'fleuma', 'mucosidade', 'sangue',
  'estase', 'estagnacao', 'deficiencia', 'insuficiencia', 'deplecao',
  'retencao', 'bloqueio', 'invasao', 'aquecedor', 'triplo',
];

const NOISE_PATTERNS = [
  /\ba seguir\b/i,
  /\bpaciente normal\b/i,
  /\blingua em paciente normal\b/i,
  /\bindividuo sadio\b/i,
  /\bcasos normais?\b/i,
];

function stripDiacritics(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function normalizeKnowledgeText(text) {
  return stripDiacritics(text)
    .toLowerCase()
    .replace(/\u00ad/g, '')
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/[^a-z0-9+/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function singularizeToken(token) {
  if (token.length <= 4) return token;
  if (token.endsWith('oes')) return `${token.slice(0, -3)}ao`;
  if (token.endsWith('ais')) return `${token.slice(0, -3)}al`;
  if (token.endsWith('eis')) return `${token.slice(0, -3)}el`;
  if (token.endsWith('is')) return `${token.slice(0, -2)}il`;
  if (token.endsWith('s')) return token.slice(0, -1);
  return token;
}

export function normalizePatternDedupeKey(pattern) {
  const normalized = normalizeKnowledgeText(pattern)
    .replace(/\bmucosidade\s*-\s*calor\b/g, 'mucosidade calor')
    .replace(/\bumidade\s*-\s*calor\b/g, 'umidade calor')
    .replace(/\bcalor\s*-\s*umidade\b/g, 'umidade calor')
    .replace(/\babscessos?\b/g, 'abscesso')
    .replace(/\bintestinais\b/g, 'intestinal')
    .replace(/\bsanguine[ao]\b/g, 'sangue');

  return normalized
    .split(' ')
    .filter(Boolean)
    .map(singularizeToken)
    .join(' ');
}

function cleanPatternLabel(pattern) {
  return String(pattern || '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/[.。]+$/u, '')
    .trim();
}

function wordCount(text) {
  return normalizeKnowledgeText(text).split(' ').filter(Boolean).length;
}

function hasMtcTerm(pattern) {
  const normalized = normalizeKnowledgeText(pattern);
  return MTC_TERMS.some(term => normalized.includes(term));
}

export function detectPatternNoise(pattern) {
  const label = cleanPatternLabel(pattern);
  const normalized = normalizeKnowledgeText(label);
  if (!label) return { hidden: true, reason: 'nome vazio' };
  if (NOISE_PATTERNS.some(regex => regex.test(normalized))) {
    return { hidden: true, reason: 'frase de ruído clínico sem padrão acionável' };
  }
  if (wordCount(label) < 3 && !hasMtcTerm(label)) {
    return { hidden: true, reason: 'nome curto sem termo MTC discriminativo' };
  }
  return { hidden: false, reason: '' };
}

function canonicalPatternByHeuristic(pattern, knownPatternNames) {
  const known = new Set(knownPatternNames);
  const normalized = normalizeKnowledgeText(pattern).replace(/[-/]+/g, ' ');
  const has = value => normalized.includes(value);

  if (known.has('Umidade-Calor') && (has('umidade calor') || has('calor umidade'))) {
    return 'Umidade-Calor';
  }
  if (
    known.has('Deficiência de Qi do Baço')
    && has('baco')
    && (has('deficiencia') || has('deplecao') || has('insuficiencia') || has('debilidade') || has('inatividade'))
    && (has('qi') || has('energia') || has('umidade'))
  ) {
    return 'Deficiência de Qi do Baço';
  }
  if (known.has('Deficiência de Yin do Rim') && has('yin') && (has('rim') || has('rins'))) {
    return 'Deficiência de Yin do Rim';
  }
  if (known.has('Deficiência de Yang do Rim') && has('yang') && (has('rim') || has('rins'))) {
    return 'Deficiência de Yang do Rim';
  }
  if (known.has('Deficiência de Xue do Fígado') && has('figado') && (has('xue') || has('sangue'))) {
    return 'Deficiência de Xue do Fígado';
  }
  if (known.has('Estagnação de Xue') && (has('estase') || has('estagnacao') || has('coagulacao')) && (has('sangue') || has('xue'))) {
    return 'Estagnação de Xue';
  }
  if (known.has('Deficiência de Qi do Pulmão') && has('pulmao') && has('deficiencia') && has('qi')) {
    return 'Deficiência de Qi do Pulmão';
  }
  if (known.has('Agitação do Shen por Calor') && ((has('shen') && has('calor')) || (has('fogo') && has('coracao')))) {
    return 'Agitação do Shen por Calor';
  }
  if (known.has('Ascensão do Yang do Fígado') && has('ascensao') && has('yang') && has('figado')) {
    return 'Ascensão do Yang do Fígado';
  }
  if (known.has('Qi do Fígado invadindo Baço/Estômago') && has('qi') && has('figado') && (has('baco') || has('estomago'))) {
    return 'Qi do Fígado invadindo Baço/Estômago';
  }
  return '';
}

function chooseDedupeLabel(patterns) {
  const sorted = [...patterns]
    .map(cleanPatternLabel)
    .filter(Boolean)
    .sort((left, right) => {
      const leftHasMtc = hasMtcTerm(left) ? 0 : 1;
      const rightHasMtc = hasMtcTerm(right) ? 0 : 1;
      if (leftHasMtc !== rightHasMtc) return leftHasMtc - rightHasMtc;
      return left.length - right.length;
    });
  return sorted[0] || '';
}

function collectRawPatterns({ findings = [], patterns = [] } = {}) {
  const raw = [];
  for (const finding of findings) {
    for (const link of finding.patternLinks || []) {
      if (!link?.pattern) continue;
      raw.push({
        rawPattern: cleanPatternLabel(link.pattern),
        sourceLabel: cleanPatternLabel(link.rawPattern || link.sourceLabel || link.pattern),
        sourceItemId: finding.id,
        sourceType: 'finding',
        source: finding.source || null,
      });
    }
  }
  for (const pattern of patterns) {
    if (!pattern?.pattern) continue;
    raw.push({
      rawPattern: cleanPatternLabel(pattern.pattern),
      sourceLabel: cleanPatternLabel(pattern.rawPattern || pattern.sourceLabel || pattern.pattern),
      sourceItemId: pattern.id,
      sourceType: 'pattern',
      source: pattern.source || null,
    });
  }
  return raw;
}

export function buildPatternNormalizationMap({ findings = [], patterns = [], knownPatternNames = CANONICAL_PATTERN_NAMES } = {}) {
  const known = [...knownPatternNames].filter(Boolean);
  const knownByKey = new Map(known.map(name => [normalizePatternDedupeKey(name), name]));
  const rawEntries = collectRawPatterns({ findings, patterns });
  const groups = new Map();

  for (const entry of rawEntries) {
    const groupKey = normalizePatternDedupeKey(entry.rawPattern);
    if (!groupKey) continue;
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(entry);
  }

  const items = [];
  for (const [groupKey, entries] of groups.entries()) {
    const rawPatterns = [...new Set(entries.map(entry => entry.rawPattern))];
    const dedupeLabel = chooseDedupeLabel(rawPatterns);
    const exactCanonical = knownByKey.get(groupKey) || '';
    const heuristicCanonical = exactCanonical || canonicalPatternByHeuristic(dedupeLabel, known);
    const noise = detectPatternNoise(dedupeLabel);
    const canonicalPattern = noise.hidden ? '' : (heuristicCanonical || dedupeLabel);
    const status = noise.hidden
      ? 'hidden_noise'
      : heuristicCanonical
        ? 'mapped_canonical'
        : rawPatterns.length > 1
          ? 'deduped_candidate'
          : 'candidate';

    for (const rawPattern of rawPatterns) {
      items.push({
        rawPattern,
        sourceLabel: rawPattern,
        normalizedKey: normalizePatternDedupeKey(rawPattern),
        groupKey,
        canonicalPattern,
        canonicalSource: heuristicCanonical ? 'patternDefinitions' : 'candidate',
        status,
        hidden: noise.hidden,
        reason: noise.reason || (status === 'deduped_candidate' ? 'nome quase idêntico agrupado' : ''),
        duplicateOf: rawPattern === dedupeLabel ? '' : dedupeLabel,
        rawVariants: rawPatterns,
        sourceRefs: entries
          .filter(entry => entry.rawPattern === rawPattern)
          .slice(0, 12)
          .map(entry => ({
            sourceItemId: entry.sourceItemId,
            sourceType: entry.sourceType,
            sourceKey: entry.source?.key || '',
            pdfPage: entry.source?.pdfPage || '',
          })),
      });
    }
  }

  const byRawPattern = Object.fromEntries(items.map(item => [item.rawPattern, item]));
  const byNormalizedKey = Object.fromEntries(items.map(item => [item.normalizedKey, item]));

  return {
    schemaVersion: 'sistema-acup-pattern-normalization-map.v1',
    generatedAt: new Date().toISOString(),
    policy: {
      sourceLabelPreserved: true,
      rawPatternPreserved: true,
      hideNoiseBeforeApproval: true,
      rule: 'Mapeia nomes crus de padrao para patternDefinitions quando seguro, preserva rawPattern/sourceLabel e sinaliza ruido antes da curadoria.',
    },
    counts: {
      rawPatterns: items.length,
      groups: groups.size,
      mappedCanonical: items.filter(item => item.status === 'mapped_canonical').length,
      hiddenNoise: items.filter(item => item.hidden).length,
      dedupedCandidates: items.filter(item => item.status === 'deduped_candidate').length,
    },
    items: items.sort((left, right) => left.rawPattern.localeCompare(right.rawPattern, 'pt-BR')),
    byRawPattern,
    byNormalizedKey,
  };
}

function mapLookup(normalizationMap, pattern) {
  if (!normalizationMap) return null;
  const raw = cleanPatternLabel(pattern);
  return normalizationMap.byRawPattern?.[raw]
    || normalizationMap.byNormalizedKey?.[normalizePatternDedupeKey(raw)]
    || null;
}

export function normalizePatternLinks(patternLinks = [], normalizationMap) {
  return patternLinks.map(link => {
    const rawPattern = cleanPatternLabel(link.rawPattern || link.sourceLabel || link.pattern);
    const normalized = mapLookup(normalizationMap, rawPattern || link.pattern);
    if (!normalized) {
      return {
        ...link,
        rawPattern,
        sourceLabel: rawPattern,
        normalizationStatus: 'missing_map',
        hiddenByNormalization: false,
      };
    }

    return {
      ...link,
      pattern: normalized.hidden ? link.pattern : normalized.canonicalPattern,
      rawPattern,
      sourceLabel: normalized.sourceLabel || rawPattern,
      normalizationStatus: normalized.status,
      hiddenByNormalization: normalized.hidden,
      normalizationReason: normalized.reason,
      canonicalSource: normalized.canonicalSource,
    };
  });
}

export function normalizeCandidateItem(item, type, normalizationMap) {
  const candidate = {
    ...item,
    type,
    candidateId: item.id,
    originalStatus: item.status || 'review',
  };

  if (type === 'finding') {
    candidate.patternLinks = normalizePatternLinks(item.patternLinks || [], normalizationMap);
    candidate.hiddenPatternLinks = candidate.patternLinks.filter(link => link.hiddenByNormalization);
  }

  if (type === 'pattern') {
    const normalized = mapLookup(normalizationMap, item.pattern);
    candidate.rawPattern = item.rawPattern || item.pattern;
    candidate.sourceLabel = item.sourceLabel || item.pattern;
    candidate.normalization = normalized || null;
    candidate.hiddenByNormalization = Boolean(normalized?.hidden);
    if (normalized && !normalized.hidden) {
      candidate.pattern = normalized.canonicalPattern;
      candidate.normalizationStatus = normalized.status;
      candidate.normalizationReason = normalized.reason;
    }
  }

  return candidate;
}

function editableFieldsForType(candidate) {
  if (candidate.type === 'finding') {
    return ['label', 'aliases', 'checklistGroup', 'patternLinks'];
  }
  if (candidate.type === 'question') {
    return ['prompt', 'options', 'rationale', 'checklistGroup', 'linkedFindings'];
  }
  return ['pattern', 'tongueSigns', 'pulseSigns', 'symptoms', 'differentials'];
}

function pickEditableFields(candidate) {
  const edits = {};
  for (const field of editableFieldsForType(candidate)) {
    if (candidate[field] !== undefined) edits[field] = candidate[field];
  }
  return edits;
}

function normalizeDecision(decision) {
  const candidateId = decision?.candidateId || decision?.itemId || decision?.id || '';
  return {
    id: decision?.id || `decision:${candidateId}`,
    candidateId,
    type: decision?.type || '',
    status: decision?.status || 'review',
    edits: decision?.edits && typeof decision.edits === 'object' ? decision.edits : {},
    approvedByRole: decision?.approvedByRole || '',
    approvedByLabel: decision?.approvedByLabel || '',
    approvedAt: decision?.approvedAt || '',
    rejectedAt: decision?.rejectedAt || '',
    updatedAt: decision?.updatedAt || '',
    createdAt: decision?.createdAt || '',
  };
}

export function getLocalAnamneseKnowledgeDecisions() {
  if (typeof localStorage === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(ANAMNESE_KNOWLEDGE_DECISIONS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.map(normalizeDecision).filter(item => item.candidateId) : [];
  } catch {
    return [];
  }
}

export function saveLocalAnamneseKnowledgeDecision(payload) {
  const current = getLocalAnamneseKnowledgeDecisions();
  const now = new Date().toISOString();
  const decision = normalizeDecision({
    ...payload,
    id: payload.id || `decision:${payload.candidateId}`,
    createdAt: payload.createdAt || current.find(item => item.candidateId === payload.candidateId)?.createdAt || now,
    updatedAt: now,
  });

  const next = [
    decision,
    ...current.filter(item => item.candidateId !== decision.candidateId),
  ];
  localStorage.setItem(ANAMNESE_KNOWLEDGE_DECISIONS_KEY, JSON.stringify(next));
  return decision;
}

export function seedApprovedKnowledgeToDecisions(seedEnvelope) {
  const items = Array.isArray(seedEnvelope?.items) ? seedEnvelope.items : [];
  return items.map(item => normalizeDecision({
    id: `seed:${item.candidateId || item.id}`,
    candidateId: item.candidateId || item.id,
    type: item.type,
    status: item.status || 'approved_local',
    edits: pickEditableFields(item),
    approvedByRole: item.approvedByRole,
    approvedByLabel: item.approvedByLabel,
    approvedAt: item.approvedAt,
    updatedAt: item.updatedAt || item.approvedAt,
    createdAt: item.createdAt || item.approvedAt,
  })).filter(item => item.candidateId);
}

export function mergeDecisions(localDecisions = [], seedDecisions = []) {
  const merged = new Map();
  for (const decision of seedDecisions.map(normalizeDecision)) {
    if (decision.candidateId) merged.set(decision.candidateId, decision);
  }
  for (const decision of localDecisions.map(normalizeDecision)) {
    if (decision.candidateId) merged.set(decision.candidateId, decision);
  }
  return [...merged.values()];
}

export function applyDecision(candidate, decision) {
  if (!decision) return candidate;
  return {
    ...candidate,
    ...decision.edits,
    status: decision.status || candidate.status,
    localDecision: decision.id?.startsWith('seed:') ? null : decision,
    seedDecision: decision.id?.startsWith('seed:') ? decision : null,
  };
}

export function materializeKnowledgeCandidates({
  findings = [],
  questions = [],
  patterns = [],
  normalizationMap,
  localDecisions = [],
  seedDecisions = [],
} = {}) {
  const decisions = mergeDecisions(localDecisions, seedDecisions);
  const decisionByCandidateId = new Map(decisions.map(decision => [decision.candidateId, decision]));
  const candidates = [
    ...findings.map(item => normalizeCandidateItem(item, 'finding', normalizationMap)),
    ...questions.map(item => normalizeCandidateItem(item, 'question', normalizationMap)),
    ...patterns.map(item => normalizeCandidateItem(item, 'pattern', normalizationMap)),
  ];

  return candidates.map(candidate => applyDecision(candidate, decisionByCandidateId.get(candidate.candidateId)));
}

function candidateTitle(candidate) {
  return candidate.label || candidate.prompt || candidate.pattern || candidate.id || '';
}

export function sourceConfidencePercent(candidate) {
  if (candidate.extractionTier === 'A') return 92;
  if (candidate.extractionTier === 'B') return 72;
  if (candidate.source?.key === 'semiologia-da-lingua-completo') return 92;
  return 68;
}

export function summarizeAnamneseKnowledgeRows(rows = []) {
  return {
    total: rows.length,
    active: rows.filter(item => item.status !== 'rejected').length,
    pending: rows.filter(item => item.status === 'review' && !item.localDecision && !item.seedDecision).length,
    saved: rows.filter(item => item.localDecision || item.seedDecision).length,
    approved: rows.filter(item => item.status === 'approved_local').length,
    rejected: rows.filter(item => item.status === 'rejected').length,
    hiddenNoise: rows.filter(item => item.hiddenByNormalization).length,
  };
}

export function filterAnamneseKnowledgeRows(rows = [], { query = '', filter = 'unanswered' } = {}) {
  const term = normalizeKnowledgeText(query);
  return rows.filter(row => {
    if (filter === 'unanswered' && (row.status !== 'review' || row.localDecision || row.seedDecision)) return false;
    if (filter === 'high' && sourceConfidencePercent(row) < 85) return false;
    if (filter === 'lingua' && row.domain !== 'lingua' && row.type !== 'finding') return false;
    if (filter === 'diagnostico' && row.domain !== 'diagnostico' && row.type !== 'pattern') return false;
    if (filter === 'saved' && !row.localDecision && !row.seedDecision) return false;
    if (filter !== 'all' && row.status === 'rejected') return false;
    if (!term) return true;
    return normalizeKnowledgeText([
      candidateTitle(row),
      row.type,
      row.domain,
      row.checklistGroup,
      ...(row.aliases || []),
      ...(row.patternLinks || []).map(link => `${link.pattern} ${link.rawPattern || ''}`),
    ].join(' ')).includes(term);
  });
}

function hasResolvableSource(candidate) {
  const imageUrl = String(candidate.source?.imageUrl || '').trim();
  return Boolean(
    candidate.source?.key
      && candidate.source?.pdfPage
      && candidate.source?.snippet
      && imageUrl.startsWith('/knowledge/source-assets/')
      && /\.webp(?:$|\?)/i.test(imageUrl)
      && !imageUrl.includes('..'),
  );
}

function isPtBrCandidate(candidate) {
  const text = normalizeKnowledgeText([
    candidate.source?.snippet,
    candidate.label,
    candidate.prompt,
    candidate.pattern,
  ].join(' '));
  if (!text) return false;
  if (/[一-龯ぁ-んァ-ン]/u.test(String(candidate.source?.snippet || ''))) return false;
  const englishHits = (text.match(/\b(the|and|with|disease|patient|treatment|points)\b/g) || []).length;
  const ptHits = (text.match(/\b(de|da|do|com|para|lingua|saburra|deficiencia|umidade|calor)\b/g) || []).length;
  return ptHits >= englishHits;
}

export function validateAnamneseKnowledgeApproval(candidate, { validPatterns = [] } = {}) {
  const errors = [];
  const validPatternSet = new Set(validPatterns);

  if (!hasResolvableSource(candidate)) errors.push('Fonte visual/trecho rastreável obrigatório.');
  if (!isPtBrCandidate(candidate)) errors.push('Aprovação bloqueada: trecho precisa estar em pt-BR limpo.');

  if (candidate.type === 'finding') {
    if (!String(candidate.label || '').trim()) errors.push('Rótulo obrigatório.');
    const activeLinks = (candidate.patternLinks || []).filter(link => !link.hiddenByNormalization);
    if (activeLinks.length === 0) {
      errors.push('Informe ao menos um vínculo de padrão válido.');
    }
    if (activeLinks.some(link => !validPatternSet.has(link.pattern))) {
      errors.push('Há vínculo com padrão fora da lista curável.');
    }
  } else if (candidate.type === 'question') {
    if (!String(candidate.prompt || '').trim()) errors.push('Pergunta obrigatória.');
    if (!String(candidate.checklistGroup || '').trim()) errors.push('Grupo de checklist obrigatório.');
  } else if (candidate.type === 'pattern') {
    if (!String(candidate.pattern || '').trim()) errors.push('Nome do padrão obrigatório.');
    if (candidate.hiddenByNormalization) errors.push('Padrão sinalizado como ruído não pode ser aprovado.');
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

export function editableSnapshot(candidate) {
  return pickEditableFields(candidate);
}

export function materializeApprovedItem(candidate, decision) {
  const item = applyDecision(candidate, decision);
  return {
    ...editableSnapshot(item),
    id: item.id,
    candidateId: item.candidateId || item.id,
    type: item.type,
    status: item.status,
    domain: item.domain || '',
    isNew: Boolean(item.isNew),
    source: item.source,
    rawPattern: item.rawPattern || undefined,
    sourceLabel: item.sourceLabel || undefined,
    approvedByRole: decision.approvedByRole || '',
    approvedByLabel: decision.approvedByLabel || '',
    approvedAt: decision.approvedAt || '',
    rejectedAt: decision.rejectedAt || '',
    updatedAt: decision.updatedAt || '',
    requiresProfessionalAudit: true,
    generatedFrom: 'AnamneseKnowledgePanel',
  };
}

export function buildApprovedKnowledgeEnvelope({ candidates = [], decisions = [] } = {}) {
  const candidateById = new Map(candidates.map(candidate => [candidate.candidateId || candidate.id, candidate]));
  const items = decisions
    .filter(decision => ['approved_local', 'rejected', 'review'].includes(decision.status))
    .map(decision => {
      const candidate = candidateById.get(decision.candidateId);
      return candidate ? materializeApprovedItem(candidate, decision) : null;
    })
    .filter(Boolean)
    .sort((left, right) => String(left.candidateId).localeCompare(String(right.candidateId), 'pt-BR'));

  return {
    schemaVersion: 'sistema-acup-approved-anamnese-knowledge.v1',
    generatedAt: new Date().toISOString(),
    policy: {
      source: 'local_decisions_materialized_from_candidates',
      phase3ReadsOnly: 'approved_local',
      requiresProfessionalAudit: true,
      patientData: 'never',
    },
    counts: {
      items: items.length,
      approvedLocal: items.filter(item => item.status === 'approved_local').length,
      rejected: items.filter(item => item.status === 'rejected').length,
      review: items.filter(item => item.status === 'review').length,
    },
    items,
  };
}

export function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
