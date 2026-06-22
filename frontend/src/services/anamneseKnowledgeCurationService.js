import { patternDefinitions } from '../knowledge/knowledgeBase';
import {
  APPROVED_KNOWLEDGE_ASSET_KEY,
  APPROVED_KNOWLEDGE_URL,
  FINDING_CANDIDATES_ASSET_KEY,
  FINDING_CANDIDATES_URL,
  PATTERN_CANDIDATES_ASSET_KEY,
  PATTERN_CANDIDATES_URL,
  PATTERN_NORMALIZATION_MAP_ASSET_KEY,
  PATTERN_NORMALIZATION_MAP_URL,
  QUESTION_CANDIDATES_ASSET_KEY,
  QUESTION_CANDIDATES_URL,
  buildApprovedKnowledgeEnvelope,
  buildPatternNormalizationMap,
  downloadJson,
  editableSnapshot,
  getLocalAnamneseKnowledgeDecisions,
  materializeKnowledgeCandidates,
  saveLocalAnamneseKnowledgeDecision,
  seedApprovedKnowledgeToDecisions,
  validateAnamneseKnowledgeApproval,
} from '../knowledge/anamneseKnowledgeCuration';
import { fetchKnowledgeSourceJsonAsset } from './knowledgeSourceAssetService';

async function fetchOptionalJson(assetKey, url, fallback) {
  try {
    return await fetchKnowledgeSourceJsonAsset(assetKey, url);
  } catch {
    return fallback;
  }
}

export async function loadAnamneseKnowledgeCurationPayload() {
  const [findingEnvelope, questionEnvelope, patternEnvelope] = await Promise.all([
    fetchKnowledgeSourceJsonAsset(FINDING_CANDIDATES_ASSET_KEY, FINDING_CANDIDATES_URL),
    fetchKnowledgeSourceJsonAsset(QUESTION_CANDIDATES_ASSET_KEY, QUESTION_CANDIDATES_URL),
    fetchKnowledgeSourceJsonAsset(PATTERN_CANDIDATES_ASSET_KEY, PATTERN_CANDIDATES_URL),
  ]);

  const findings = findingEnvelope.items || [];
  const questions = questionEnvelope.items || [];
  const patterns = patternEnvelope.items || [];
  const knownPatternNames = Object.keys(patternDefinitions);

  const normalizationMap = await fetchOptionalJson(
    PATTERN_NORMALIZATION_MAP_ASSET_KEY,
    PATTERN_NORMALIZATION_MAP_URL,
    null,
  ) || buildPatternNormalizationMap({ findings, patterns, knownPatternNames });

  const seedEnvelope = await fetchOptionalJson(
    APPROVED_KNOWLEDGE_ASSET_KEY,
    APPROVED_KNOWLEDGE_URL,
    { items: [] },
  );

  const localDecisions = getLocalAnamneseKnowledgeDecisions();
  const seedDecisions = seedApprovedKnowledgeToDecisions(seedEnvelope);
  const rows = materializeKnowledgeCandidates({
    findings,
    questions,
    patterns,
    normalizationMap,
    localDecisions,
    seedDecisions,
  });

  return {
    findings,
    questions,
    patterns,
    knownPatternNames,
    normalizationMap,
    seedEnvelope,
    seedDecisions,
    localDecisions,
    rows,
    counts: {
      findings: findingEnvelope.counts?.items || findings.length,
      questions: questionEnvelope.counts?.items || questions.length,
      patterns: patternEnvelope.counts?.items || patterns.length,
      normalizationHiddenNoise: normalizationMap.counts?.hiddenNoise || 0,
    },
  };
}

export function refreshAnamneseKnowledgeRows({ findings = [], questions = [], patterns = [], normalizationMap, seedDecisions = [] } = {}) {
  return materializeKnowledgeCandidates({
    findings,
    questions,
    patterns,
    normalizationMap,
    localDecisions: getLocalAnamneseKnowledgeDecisions(),
    seedDecisions,
  });
}

export function saveAnamneseKnowledgeDecision(candidate, status, actor = {}) {
  const now = new Date().toISOString();
  const payload = {
    candidateId: candidate.candidateId || candidate.id,
    type: candidate.type,
    status,
    edits: editableSnapshot(candidate),
    approvedByRole: actor.approvedByRole || actor.role || 'super_admin',
    approvedByLabel: actor.approvedByLabel || actor.label || 'SuperAdm',
    approvedAt: status === 'approved_local' ? now : '',
    rejectedAt: status === 'rejected' ? now : '',
  };

  return saveLocalAnamneseKnowledgeDecision(payload);
}

export function validateAnamneseKnowledgeCandidate(candidate, patternOptions) {
  return validateAnamneseKnowledgeApproval(candidate, {
    validPatterns: patternOptions.map(pattern => pattern.value || pattern),
  });
}

export function exportApprovedAnamneseKnowledge(candidates, decisions = getLocalAnamneseKnowledgeDecisions()) {
  const envelope = buildApprovedKnowledgeEnvelope({ candidates, decisions });
  downloadJson('approved-knowledge.local.json', envelope);
  return envelope;
}

export function exportPatternNormalizationMap(normalizationMap) {
  downloadJson('pattern-normalization-map.local.json', normalizationMap);
}
