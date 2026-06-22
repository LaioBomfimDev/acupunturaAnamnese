const TRUSTED_ATLAS_APPROVAL_METHODS = new Set([
  'atlas_extra_operator_request',
  'bulk_high_confidence_operator_request',
  'auto_high_confidence_atlas',
]);

const TRUSTED_ATLAS_PATTERN = /\b(atlas[-\s]*(ednea|ednéa)|atlas\s+da\s+edn(ea|éa)|atlas\s+dos\s+pontos\s+de\s+acupuntura|atlas\s+clinico\s+local|atlas\s+cl[ií]nico\s+local|edn(ea|éa)\s+martins)\b/i;

function textFromReferences(references = []) {
  if (!Array.isArray(references)) return '';
  return references.map(reference => [
    reference.sourceKey,
    reference.sourceTitle,
    reference.referenceLabel,
    reference.imageUrl,
    reference.assetKey,
  ].filter(Boolean).join(' ')).join(' ');
}

function reviewSourceText(review = {}) {
  return [
    review.id,
    review.sourceDraftId,
    review.source,
    review.approvalSource,
    review.sourceTitle,
    review.sourceKey,
    review.referenceLabel,
    review.clinicalNote,
    textFromReferences(review.sourceReferences),
  ].filter(Boolean).join(' ');
}

export function isTrustedAtlasKnowledgeReview(review = {}) {
  const approvalMethod = String(review.approvalMethod || '').trim();
  if (TRUSTED_ATLAS_APPROVAL_METHODS.has(approvalMethod)) return true;

  const sourceDraftId = String(review.sourceDraftId || '');
  const id = String(review.id || '');
  if (sourceDraftId.startsWith('atlas-extra:') || id.startsWith('approved-atlas')) return true;

  return TRUSTED_ATLAS_PATTERN.test(reviewSourceText(review));
}

function isBlankClinicalField(value) {
  const text = Array.isArray(value) ? value.filter(Boolean).join(' ') : (value == null ? '' : String(value));
  return text.replace(/[\s.,;:''"`~!|()\-]/g, '').trim().length === 0;
}

/**
 * Quarentena de qualidade: registros que NAO podem alimentar o raciocinio clinico
 * por terem conteudo atribuido ao ponto errado, OCR severo ou nucleo clinico vazio.
 *
 * Duas camadas de protecao:
 *  - anotacao: `dataQuality.blockedFromClinical` gravada por
 *    `tools/knowledge/audit-high-confidence-reviews.mjs`.
 *  - rede de seguranca em runtime: se faltar localizacao E acoes E indicacoes,
 *    o registro nao tem como ser usado clinicamente, mesmo sem a anotacao
 *    (protege caso o pacote seja regenerado sem passar pela auditoria).
 */
export function isQuarantinedKnowledgeReview(review = {}) {
  if (review?.dataQuality?.blockedFromClinical === true) return true;
  return (
    isBlankClinicalField(review?.locationText) &&
    isBlankClinicalField(review?.actions) &&
    isBlankClinicalField(review?.indications)
  );
}

export function isClinicallyActiveKnowledgeReview(review = {}) {
  return (
    review?.status === 'approved_local' &&
    isTrustedAtlasKnowledgeReview(review) &&
    !isQuarantinedKnowledgeReview(review)
  );
}

export function normalizeKnowledgeReviewForClinicalUse(review = {}) {
  if (!review) return review;

  // Quarentena de qualidade tem prioridade: bloqueia mesmo fontes Atlas confiaveis.
  if (review.status === 'approved_local' && isQuarantinedKnowledgeReview(review)) {
    return {
      ...review,
      status: 'review',
      previousStatus: 'approved_local',
      clinicalActivationBlocked: true,
      clinicalActivationReason:
        review?.dataQuality?.status === 'quarantine'
          ? 'Registro em quarentena pela auditoria de qualidade (conteudo atribuido ao ponto errado, OCR severo ou nucleo clinico vazio); exige curadoria humana.'
          : 'Nucleo clinico vazio (sem localizacao, acoes e indicacoes); exige curadoria humana antes de uso clinico.',
    };
  }

  if (review.status !== 'approved_local' || isTrustedAtlasKnowledgeReview(review)) {
    return review;
  }

  return {
    ...review,
    status: 'review',
    previousStatus: 'approved_local',
    clinicalActivationBlocked: true,
    clinicalActivationReason: 'Fonte mantida como rascunho separado; somente Atlas Ednea entra como aprovado clinico nesta fase.',
  };
}
