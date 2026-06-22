import { displayPointCode, normalizePointCode } from './aliases';
import {
  getAuricularPoint,
  getKnowledgeSourceLabels,
  getPointByCode,
  getPointLabel,
} from './knowledgeBase';
import {
  getPointPageLanguageNotice,
  isPointPageContentAllowed,
} from './sourceLanguagePolicy';
import { isClinicallyActiveKnowledgeReview } from './reviewSourcePolicy';

function asList(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value) return [];
  return String(value)
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function isPlaceholderItem(value) {
  return /^(Funções\/ações não confirmadas|Indicações não confirmadas|Padrões MTC não inferidos|Não aplicável:|Técnica não localizada)/i.test(String(value || ''));
}

function asClinicalList(value) {
  return asList(value).filter(item => !isPlaceholderItem(item));
}

function reviewMatchesPoint(review, pointKey) {
  const normalized = normalizePointCode(pointKey);
  return normalizePointCode(review?.code) === normalized || normalizePointCode(review?.displayCode) === normalized;
}

function findApprovedReview(pointKey, reviews = []) {
  return (reviews || []).find(review => {
    return isClinicallyActiveKnowledgeReview(review) && reviewMatchesPoint(review, pointKey);
  }) || null;
}

function buildFromReview(review, patternName, atlasReference) {
  const normalized = normalizePointCode(review.code || review.displayCode);
  const displayCode = review.displayCode || displayPointCode(normalized);
  const canShowClinicalContent = isPointPageContentAllowed(review);
  const languageNotice = getPointPageLanguageNotice(review);
  const actions = canShowClinicalContent ? asClinicalList(review.actions) : [];
  const relatedPatterns = canShowClinicalContent ? asClinicalList(review.relatedPatterns) : [];
  const isHighConfidenceApproval = review.approvalMethod === 'bulk_high_confidence_operator_request';
  const dataOrigin = !canShowClinicalContent
    ? 'Biblioteca Viva (aguardando pt-BR)'
    : isHighConfidenceApproval
      ? 'Biblioteca Viva (alta confiança)'
      : 'Biblioteca Viva';

  return {
    code: normalized,
    displayCode,
    name: canShowClinicalContent
      ? review.title || `${displayCode} - Ponto revisado`
      : `${displayCode} - Conteudo em curadoria pt-BR`,
    meridian: review.meridian || review.meridianCode || '',
    locationText: canShowClinicalContent ? review.locationText || '' : '',
    actions,
    indications: canShowClinicalContent ? asClinicalList(review.indications) : [],
    cautions: canShowClinicalContent ? asClinicalList(review.cautions) : [],
    relatedPatterns,
    techniques: canShowClinicalContent ? asClinicalList(review.techniques) : [],
    needling: canShowClinicalContent && !isPlaceholderItem(review.needling) ? review.needling || '' : '',
    clinicalNote: canShowClinicalContent ? review.clinicalNote || '' : languageNotice,
    languagePolicyNotice: languageNotice,
    why: !canShowClinicalContent
      ? `${displayCode} tem fonte vinculada, mas a ficha clinica aguarda sintese pt-BR revisada.`
      : patternName && relatedPatterns.includes(patternName)
      ? `${displayCode} foi aprovado na Biblioteca Viva e se relaciona com ${patternName}.`
      : `${displayCode} foi aprovado na Biblioteca Viva para consulta clínica.`,
    sources: [
      review.source || 'Biblioteca Viva',
      ...(atlasReference?.referenceLabel ? [atlasReference.referenceLabel] : []),
    ].filter(Boolean),
    reviewStatus: review.status,
    dataOrigin,
    updatedAt: review.updatedAt || review.createdAt || '',
    atlasReference,
  };
}

function buildFromBodyPoint(point, patternName, atlasReference) {
  const displayCode = point.displayCode || displayPointCode(point.code);
  const actions = point.actions || [];

  return {
    code: point.code,
    displayCode,
    name: `${displayCode} — ${point.names?.pt || point.names?.en || displayCode}`,
    meridian: point.meridian?.pt || '',
    locationText: point.locationText || '',
    actions,
    indications: point.indications || [],
    cautions: point.cautions || [],
    relatedPatterns: point.relatedPatterns || [],
    techniques: point.techniques || [],
    needling: point.needling || '',
    clinicalNote: '',
    why: point.relatedPatterns?.includes(patternName)
      ? `${displayCode} se relaciona com ${patternName} por suas funções: ${actions.slice(0, 3).join(', ')}.`
      : 'Ponto curado como apoio ao princípio terapêutico do protocolo.',
    sources: [
      ...getKnowledgeSourceLabels(point),
      ...(atlasReference?.referenceLabel ? [atlasReference.referenceLabel] : []),
    ],
    reviewStatus: point.approval?.status || 'review',
    dataOrigin: 'Base curada',
    updatedAt: '',
    atlasReference,
  };
}

function buildFromAuricularPoint(point, patternName) {
  const actions = point.actions || [];
  return {
    code: point.code,
    displayCode: point.name,
    name: `Aurículo — ${point.name}`,
    meridian: 'Auriculoterapia',
    locationText: point.locationText || '',
    actions,
    indications: point.indications || [],
    cautions: [],
    relatedPatterns: point.relatedPatterns || [],
    techniques: ['auriculoterapia'],
    needling: '',
    clinicalNote: '',
    why: point.relatedPatterns?.includes(patternName)
      ? `${point.name} apoia ${patternName} por ${actions.slice(0, 2).join(', ')}.`
      : 'Ponto auricular complementar ao raciocínio energético.',
    sources: getKnowledgeSourceLabels(point),
    reviewStatus: point.approval?.status || 'review',
    dataOrigin: 'Base curada',
    updatedAt: '',
    atlasReference: null,
  };
}

export function buildPointDetail({ pointKey, patternName, reviews = [], atlasReference = null } = {}) {
  const approvedReview = findApprovedReview(pointKey, reviews);
  if (approvedReview) return buildFromReview(approvedReview, patternName, atlasReference);

  const bodyPoint = getPointByCode(pointKey);
  if (bodyPoint) return buildFromBodyPoint(bodyPoint, patternName, atlasReference);

  const auricularPoint = getAuricularPoint(pointKey);
  if (auricularPoint) return buildFromAuricularPoint(auricularPoint, patternName);

  const normalized = normalizePointCode(pointKey);
  return {
    code: normalized,
    displayCode: displayPointCode(normalized),
    name: getPointLabel(pointKey),
    meridian: '',
    locationText: '',
    actions: [],
    indications: [],
    cautions: [],
    relatedPatterns: [],
    techniques: [],
    needling: '',
    clinicalNote: '',
    why: 'Informação completa depende de revisão na Biblioteca Viva.',
    sources: atlasReference?.referenceLabel ? [atlasReference.referenceLabel] : [],
    reviewStatus: 'review_needed',
    dataOrigin: 'Pendente',
    updatedAt: '',
    atlasReference,
  };
}
