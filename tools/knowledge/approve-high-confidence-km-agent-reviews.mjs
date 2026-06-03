import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const candidatesPath = path.join(root, 'docs', 'km-agent-ednea-production-candidates.json');
const reviewsPath = path.join(root, 'docs', 'km-agent-ednea-local-reviews.json');
const deepCuratedReviewsPath = path.join(root, 'frontend', '.local-source-assets', 'atlas-ednea', 'deep-curated-reviews.json');
const outputDir = path.join(root, 'frontend', '.local-source-assets', 'atlas-ednea');
const outputPath = path.join(outputDir, 'high-confidence-reviews.json');

const APPROVAL_METHOD = 'bulk_high_confidence_operator_request';
const APPROVAL_THRESHOLD = 'confidence high (>80%)';

function keyFor(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/^ACUPOINT:/, '')
    .replace(/[^A-Z0-9]/g, '');
}

function asArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value) return [];
  return [String(value).trim()].filter(Boolean);
}

function approvalNote(review, candidate, approvedAt) {
  const sourceReference = candidate?.atlas?.reference
    ? ` Fonte Atlas: ${candidate.atlas.reference}.`
    : '';
  const base = review.clinicalNote || '';
  const approval = `Aprovado localmente em ${approvedAt.slice(0, 10)} por solicitação explícita do operador, usando critério KM-Agent/Atlas de confiança alta (>80%).${sourceReference}`;
  const audit = 'Manter auditoria profissional final antes de migração para banco/produção; conferir ruídos de OCR, técnica e segurança clínica.';
  return [base, approval, audit].filter(Boolean).join(' ');
}

function buildApproval(review, candidate, approvedAt) {
  const code = review.code || candidate.code;
  return {
    ...review,
    id: `approved-high-${code}`,
    status: 'approved_local',
    approvalMethod: APPROVAL_METHOD,
    approvalThreshold: APPROVAL_THRESHOLD,
    approvalSource: 'KM-Agent + Atlas Ednea Martins',
    approvalMode: 'local_only',
    confidence: 'high',
    confidenceBand: APPROVAL_THRESHOLD,
    requiresProfessionalAudit: true,
    approvedAt,
    updatedAt: approvedAt,
    actions: asArray(review.actions),
    indications: asArray(review.indications),
    cautions: asArray(review.cautions),
    relatedPatterns: asArray(review.relatedPatterns),
    techniques: asArray(review.techniques),
    clinicalNote: approvalNote(review, candidate, approvedAt),
    enrichment: {
      ...(review.enrichment || {}),
      confidence: 'high',
      productionStatus: 'approved_local_by_threshold',
      approvalMethod: APPROVAL_METHOD,
      approvalThreshold: APPROVAL_THRESHOLD,
      requiresProfessionalAudit: true,
    },
  };
}

async function main() {
  const approvedAt = new Date().toISOString();
  const candidatesData = JSON.parse(await fs.readFile(candidatesPath, 'utf8'));
  let reviewSource = 'docs/km-agent-ednea-local-reviews.json';
  let sourceReviews = JSON.parse(await fs.readFile(reviewsPath, 'utf8'));
  try {
    const deepCuratedPayload = JSON.parse(await fs.readFile(deepCuratedReviewsPath, 'utf8'));
    if (Array.isArray(deepCuratedPayload.reviews)) {
      sourceReviews = deepCuratedPayload.reviews;
      reviewSource = 'frontend/.local-source-assets/atlas-ednea/deep-curated-reviews.json';
    }
  } catch {
    // Deep curation is optional; fall back to the Atlas local review export.
  }
  const reviewByCode = new Map(sourceReviews.map(review => [keyFor(review.code), review]));
  const reviewByDraftId = new Map(sourceReviews.map(review => [keyFor(review.sourceDraftId), review]));
  const highConfidenceCandidates = candidatesData.candidates.filter(candidate => candidate.confidence === 'high');

  const reviews = highConfidenceCandidates.map(candidate => {
    const review = reviewByDraftId.get(keyFor(candidate.sourceDraftId)) || reviewByCode.get(keyFor(candidate.code));
    if (!review) {
      throw new Error(`Missing local review for ${candidate.sourceDraftId || candidate.code}`);
    }
    return buildApproval(review, candidate, approvedAt);
  });

  const payload = {
    schemaVersion: 1,
    generatedAt: approvedAt,
    approvalMode: 'local_only',
    approvalMethod: APPROVAL_METHOD,
    threshold: APPROVAL_THRESHOLD,
    source: {
      candidates: 'docs/km-agent-ednea-production-candidates.json',
      reviews: reviewSource,
      primaryReference: 'Atlas dos Pontos de Acupuntura: Guia de Localizacao',
    },
    counts: {
      totalCandidates: candidatesData.candidates.length,
      approvedLocal: reviews.length,
      untouched: candidatesData.candidates.length - reviews.length,
    },
    reviews,
  };

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({
    output: path.relative(root, outputPath),
    approvedLocal: reviews.length,
    untouched: payload.counts.untouched,
    threshold: APPROVAL_THRESHOLD,
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
