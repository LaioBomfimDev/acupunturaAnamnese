export const POINT_PAGE_LANGUAGE = 'pt-BR';

const NON_PT_BR_SOURCE_NOTICE = 'Fonte original mantida para curadoria; o conteudo clinico aguarda sintese pt-BR revisada.';

function normalizeLanguage(value) {
  return String(value || '')
    .trim()
    .replace('_', '-')
    .toLowerCase();
}

function pickLanguagePolicy(item = {}) {
  return item.pointPageLanguagePolicy
    || item.languagePolicy
    || item.enrichment?.languagePolicy
    || item.enrichment?.pointPageLanguagePolicy
    || null;
}

export function isPtBrLanguage(value) {
  const normalized = normalizeLanguage(value);
  return normalized === 'pt-br' || normalized === 'pt' || normalized === 'por';
}

export function isPointPageContentAllowed(item = {}) {
  const policy = pickLanguagePolicy(item);
  if (!policy) return true;

  const originalLanguage = policy.originalLanguage || item.originalLanguage || item.sourceLanguage;
  const pointPageLanguage = policy.pointPageLanguage || policy.targetLanguage || item.pointPageLanguage;
  const hasReviewedPtBrSynthesis = Boolean(
    policy.ptBrReviewed
    || policy.hasReviewedPtBrSynthesis
    || item.hasReviewedPtBrSynthesis,
  );
  const rawOriginalBlocked = policy.allowRawOriginalInPointPages === false
    || policy.rawOriginalAllowedInPointPages === false;

  if (rawOriginalBlocked && originalLanguage && !isPtBrLanguage(originalLanguage) && !hasReviewedPtBrSynthesis) {
    return false;
  }

  if (pointPageLanguage && !isPtBrLanguage(pointPageLanguage) && !hasReviewedPtBrSynthesis) {
    return false;
  }

  return true;
}

export function getPointPageLanguageNotice(item = {}) {
  return isPointPageContentAllowed(item) ? '' : NON_PT_BR_SOURCE_NOTICE;
}
