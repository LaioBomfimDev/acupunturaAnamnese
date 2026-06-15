import { translateMtcDraftText } from './mtcTranslation';

export const PDF_SOURCE_CANDIDATE_LINKS_ASSET_KEY = 'pdf-sources/source-candidate-links.local.json';
export const PDF_AURICULAR_CANDIDATE_LINKS_ASSET_KEY = 'pdf-sources/auricular-candidate-links.local.json';
export const PDF_SOURCE_REVIEW_DRAFTS_ASSET_KEY = 'pdf-sources/source-review-drafts.local.json';

export const PDF_SOURCE_CANDIDATE_LINKS_URL = '/knowledge/source-assets/pdf-sources/source-candidate-links.local.json';
export const PDF_AURICULAR_CANDIDATE_LINKS_URL = '/knowledge/source-assets/pdf-sources/auricular-candidate-links.local.json';
export const PDF_SOURCE_REVIEW_DRAFTS_URL = '/knowledge/source-assets/pdf-sources/source-review-drafts.local.json';

const FIELD_LABELS = {
  locationText: 'localizacao',
  actions: 'acoes',
  indications: 'indicacoes',
  cautions: 'cautelas',
  needling: 'tecnica',
};

function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function asArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value) return [];
  return String(value)
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function hasClinicalValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  return String(value || '').trim().length > 2;
}

export function isPtBrPdfSource(value) {
  const normalized = String(value || '')
    .trim()
    .replace('_', '-')
    .toLowerCase();
  return normalized === 'pt-br' || normalized === 'pt' || normalized === 'por';
}

export function percentFromCandidateConfidence(link = {}) {
  if (Number.isFinite(link.confidence)) return Math.round(clamp(link.confidence * 100, 35, 98));

  const label = String(link.confidenceLabel || link.confidence || '').toLowerCase();
  if (label === 'high') return 94;
  if (label === 'medium') return 78;
  if (label === 'low') return 58;
  return 50;
}

export function getMissingClinicalFields(review = {}) {
  return Object.entries(FIELD_LABELS)
    .filter(([field]) => !hasClinicalValue(review?.[field]))
    .map(([, label]) => label);
}

export function isPdfDraftUnanswered({ draft = {}, review = null } = {}) {
  if (!review) return true;
  if (review.status !== 'approved_local') return true;
  return getMissingClinicalFields(review).length > 0 && !draft.code?.startsWith('AA');
}

function translationReliabilityForLink(link = {}) {
  if (isPtBrPdfSource(link.source?.originalLanguage)) return 100;

  const translated = translateMtcDraftText(link.snippet || '');
  const glossaryScore = Math.min(14, translated.glossaryHits.length * 2);
  const unresolvedPenalty = Math.min(16, translated.unresolvedTerms.length * 4);
  const leftoverEnglishPenalty = /\b(the|and|with|point|points|location|function|disease)\b/i.test(translated.text) ? 6 : 0;
  return Math.round(clamp(70 + glossaryScore - unresolvedPenalty - leftoverEnglishPenalty, 58, 86));
}

export function translatePdfSnippetPtBr(link = {}) {
  if (isPtBrPdfSource(link.source?.originalLanguage)) {
    return {
      mode: 'original_pt_br',
      label: 'Trecho pt-BR da fonte',
      text: link.snippet || '',
      reliabilityPercent: 100,
      glossaryHits: [],
      unresolvedTerms: [],
    };
  }

  const translated = translateMtcDraftText(link.snippet || '');
  return {
    mode: 'preliminary_pt_br_translation',
    label: 'Traducao pt-BR preliminar',
    text: translated.text,
    reliabilityPercent: translationReliabilityForLink(link),
    glossaryHits: translated.glossaryHits,
    unresolvedTerms: translated.unresolvedTerms,
  };
}

export function calculateDraftReliability(draft = {}, links = []) {
  const relevantLinks = links.length ? links : (draft.sourceReferences || []).map(reference => ({
    ...reference,
    source: {
      key: reference.sourceKey,
      title: reference.sourceTitle,
      originalLanguage: reference.originalLanguage,
    },
    confidenceLabel: reference.confidence,
    snippet: reference.snippet,
  }));

  if (!relevantLinks.length) {
    return {
      pointLinkPercent: 0,
      translationPercent: 0,
      sourceLinkingPercent: 0,
      overallPercent: 0,
      sourceCount: 0,
      pageCount: 0,
      ptBrSourceCount: 0,
      nonPtBrSourceCount: 0,
    };
  }

  const sourceKeys = new Set();
  const pages = new Set();
  const ptBrSources = new Set();
  const nonPtBrSources = new Set();
  const confidencePercents = [];
  const translationPercents = [];

  for (const link of relevantLinks) {
    const sourceKey = link.source?.key || link.sourceKey || '';
    const page = link.page?.pdfPage || link.pdfPage || '';
    if (sourceKey) sourceKeys.add(sourceKey);
    if (sourceKey && page) pages.add(`${sourceKey}:${page}`);
    if (isPtBrPdfSource(link.source?.originalLanguage || link.originalLanguage)) {
      if (sourceKey) ptBrSources.add(sourceKey);
    } else if (sourceKey) {
      nonPtBrSources.add(sourceKey);
    }
    confidencePercents.push(percentFromCandidateConfidence(link));
    translationPercents.push(translationReliabilityForLink(link));
  }

  const sortedConfidence = confidencePercents.sort((left, right) => right - left);
  const pointLinkPercent = Math.round(
    sortedConfidence.slice(0, 5).reduce((sum, value) => sum + value, 0) / Math.min(5, sortedConfidence.length),
  );
  const translationPercent = Math.round(
    translationPercents.reduce((sum, value) => sum + value, 0) / translationPercents.length,
  );
  const sourceLinkingPercent = Math.round(clamp(
    42
      + Math.min(28, sourceKeys.size * 9)
      + Math.min(16, pages.size * 1.6)
      + (ptBrSources.size ? 12 : 0)
      + (draft.sourceCandidateCounts?.highConfidenceLinks ? 6 : 0)
      - (!ptBrSources.size && nonPtBrSources.size ? 12 : 0),
    35,
    98,
  ));
  const overallPercent = Math.round(
    (pointLinkPercent * 0.45) + (translationPercent * 0.25) + (sourceLinkingPercent * 0.3),
  );

  return {
    pointLinkPercent,
    translationPercent,
    sourceLinkingPercent,
    overallPercent,
    sourceCount: sourceKeys.size,
    pageCount: pages.size,
    ptBrSourceCount: ptBrSources.size,
    nonPtBrSourceCount: nonPtBrSources.size,
  };
}

function reviewMatchesCode(review, code) {
  return String(review?.code || review?.displayCode || '').toUpperCase() === String(code || '').toUpperCase();
}

function recordMatchesCode(record, code) {
  return String(record?.code || record?.displayCode || '').toUpperCase() === String(code || '').toUpperCase();
}

export function buildPdfLearningRows({
  drafts = [],
  links = [],
  auricularLinks = [],
  kmAgentRecords = [],
  reviews = [],
  curatedReviews = [],
  highConfidenceReviews = [],
} = {}) {
  const allLinks = [...links, ...auricularLinks];
  const linksByCode = new Map();
  for (const link of allLinks) {
    const code = link.code || link.displayCode;
    if (!code) continue;
    if (!linksByCode.has(code)) linksByCode.set(code, []);
    linksByCode.get(code).push(link);
  }

  return drafts.map(draft => {
    const code = draft.code || draft.displayCode;
    const draftLinks = linksByCode.get(code) || [];
    const localReview = reviews.find(review => reviewMatchesCode(review, code)) || null;
    const curatedReview = curatedReviews.find(review => reviewMatchesCode(review, code)) || null;
    const highConfidenceReview = highConfidenceReviews.find(review => reviewMatchesCode(review, code)) || null;
    const bestReview = localReview || highConfidenceReview || curatedReview || {};
    const kmAgentRecord = kmAgentRecords.find(record => recordMatchesCode(record, code)) || null;
    const missingFields = getMissingClinicalFields(bestReview);
    const reliability = calculateDraftReliability(draft, draftLinks);
    const targetKind = code?.startsWith('auricular:') || code?.startsWith('AA') ? 'auricular' : 'sistemico';

    return {
      draft,
      code,
      title: draft.title || kmAgentRecord?.titlePtBr || code,
      targetKind,
      links: draftLinks,
      kmAgentRecord,
      localReview,
      curatedReview,
      highConfidenceReview,
      bestReview,
      missingFields,
      unanswered: isPdfDraftUnanswered({ draft, review: bestReview }),
      blockedByLanguage: draftLinks.some(link => link.languagePolicy?.requiresPtBrSynthesis),
      reliability,
    };
  }).sort((left, right) => {
    if (left.unanswered !== right.unanswered) return left.unanswered ? -1 : 1;
    if (right.reliability.overallPercent !== left.reliability.overallPercent) {
      return right.reliability.overallPercent - left.reliability.overallPercent;
    }
    return left.code.localeCompare(right.code);
  });
}

export function filterPdfLearningRows(rows, { query = '', filter = 'unanswered' } = {}) {
  const term = String(query || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  return rows.filter(row => {
    if (filter === 'unanswered' && !row.unanswered) return false;
    if (filter === 'sistemico' && row.targetKind !== 'sistemico') return false;
    if (filter === 'auricular' && row.targetKind !== 'auricular') return false;
    if (filter === 'blocked' && !row.blockedByLanguage) return false;
    if (filter === 'high' && row.reliability.overallPercent < 85) return false;
    if (filter === 'saved' && !row.localReview) return false;

    if (!term) return true;
    return [
      row.code,
      row.title,
      row.targetKind,
      row.missingFields.join(' '),
      ...asArray(row.bestReview?.actions),
      ...asArray(row.bestReview?.indications),
    ].join(' ')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .includes(term);
  });
}

export function summarizePdfLearningRows(rows = []) {
  const total = rows.length;
  const unanswered = rows.filter(row => row.unanswered).length;
  const auricular = rows.filter(row => row.targetKind === 'auricular').length;
  const blocked = rows.filter(row => row.blockedByLanguage).length;
  const savedLocal = rows.filter(row => Boolean(row.localReview)).length;
  const average = total
    ? Math.round(rows.reduce((sum, row) => sum + row.reliability.overallPercent, 0) / total)
    : 0;

  return {
    total,
    unanswered,
    auricular,
    blocked,
    savedLocal,
    averageReliabilityPercent: average,
  };
}
