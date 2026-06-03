import { getAllClinicalText, getSelectedItems } from '../utils/analyzer';
import { displayPointCode, normalizePointCode } from './aliases';
import { acupoints, getKnowledgeSourceLabels } from './knowledgeBase';

const EVIDENCE_RULES = [
  {
    id: 'head_tension',
    label: 'cabeça, tensão e ascensão',
    pattern: /cefaleia|enxaqueca|tontura|zumbido|dor cervical|rigidez|tens[aã]o|pulso tenso|em corda/i,
    pointTerms: ['cefaleia', 'enxaqueca', 'tontura', 'zumbido', 'dor cervical', 'tensão', 'rigidez', 'mover qi', 'regular yang'],
    weight: 5,
  },
  {
    id: 'shen_sleep',
    label: 'Shen, sono e ansiedade',
    pattern: /ansiedade|ins[oô]nia|palpita[cç][aã]o|agita[cç][aã]o|sonhos intensos|pesadelos|bruxismo|sono/i,
    pointTerms: ['ansiedade', 'insônia', 'palpitação', 'agitação', 'sono', 'shen', 'acalmar mente', 'regular shen'],
    weight: 5,
  },
  {
    id: 'digestive_middle',
    label: 'digestão e Aquecedor Médio',
    pattern: /refluxo|azia|n[aá]usea|distens[aã]o|gases|digest[aã]o|peso ap[oó]s comer|est[oô]mago|ba[cç]o/i,
    pointTerms: ['refluxo', 'azia', 'náusea', 'distensão', 'digestão', 'estômago', 'baço', 'aquecedor médio'],
    weight: 5,
  },
  {
    id: 'spleen_qi',
    label: 'Qi do Baço e energia',
    pattern: /fadiga|marcas de dentes|p[aá]lida|desejo por doce|rumina[cç][aã]o|sono n[aã]o reparador|energia|fezes amolecidas|tipo 6/i,
    pointTerms: ['fadiga', 'deficiência de qi', 'tonificar qi', 'fortalecer baço', 'vitalidade', 'digestão lenta', 'fezes amolecidas'],
    weight: 4,
  },
  {
    id: 'damp_heat',
    label: 'Umidade, Fleuma e Calor',
    pattern: /umidade|edema|saburra amarela|saburra espessa|saburra gordurosa|muco|odor forte|tipo 6|tipo 7|calor|problemas de pele/i,
    pointTerms: ['umidade', 'edema', 'fleuma', 'saburra', 'muco', 'peso', 'drenar umidade', 'limpar calor', 'pele'],
    weight: 4,
  },
  {
    id: 'pain_mobility',
    label: 'dor e mobilidade',
    pattern: /dor|pontada|queima[cç][aã]o|rigidez|formigamento|dorm[eê]ncia|irradia[cç][aã]o|lombar|cervical/i,
    pointTerms: ['dor', 'analgesia', 'rigidez', 'tensão', 'formigamento', 'lombalgia', 'tendões'],
    weight: 4,
  },
  {
    id: 'gyn_cycle',
    label: 'ciclo e Xue',
    pattern: /tpm|c[oó]lica|ciclo|fluxo|co[aá]gulos|endometriose|sop|menopausa|ondas de calor/i,
    pointTerms: ['tpm', 'cólicas', 'ginecológicas', 'regular xue', 'regular ciclo'],
    weight: 3,
  },
  {
    id: 'respiratory_surface',
    label: 'respiração, pele e superfície',
    pattern: /rinite|sinusite|tosse|asma|bronquite|dispneia|falta de ar|alergia|pele|prurido|garganta/i,
    pointTerms: ['rinite', 'sinusite', 'tosse', 'asma', 'bronquite', 'dispneia', 'pulmão', 'garganta', 'pele', 'alergia', 'prurido'],
    weight: 4,
  },
  {
    id: 'kidney_urinary',
    label: 'Rim, lombar e vias urinárias',
    pattern: /lombar|medo|rim|bexiga|urin[aá]ri|urina|reten[cç][aã]o urin[aá]ria|enurese|nict[uú]ria|edema|joelhos/i,
    pointTerms: ['lombalgia', 'rim', 'bexiga', 'urinária', 'urina', 'retenção urinária', 'enurese', 'edema', 'joelhos', 'medo'],
    weight: 4,
  },
  {
    id: 'blood_stasis',
    label: 'Xue, estase e circulação',
    pattern: /arroxeada|pet[eé]quias|co[aá]gulos|dor fixa|estase|sangue|xue|hemorragia|amenorreia/i,
    pointTerms: ['estase', 'sangue', 'xue', 'coágulos', 'hemorragia', 'amenorreia', 'menstruação', 'dor fixa', 'circulação'],
    weight: 4,
  },
  {
    id: 'external_climate',
    label: 'vento, frio, calor e clima',
    pattern: /vento|frio|calor|umidade|secura|febre|infec[cç][aã]o|in[ií]cio s[uú]bito|externo/i,
    pointTerms: ['vento', 'frio', 'calor', 'umidade', 'secura', 'febre', 'infecção', 'garganta', 'externo'],
    weight: 3,
  },
];

function toSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function includesAny(text, terms = []) {
  const normalized = toSearchText(text);
  return terms.some(term => normalized.includes(toSearchText(term)));
}

function pointSearchText(point) {
  return [
    point.code,
    point.displayCode,
    point.title,
    point.names?.pt,
    point.names?.en,
    point.meridian?.pt,
    point.meridian?.code,
    point.locationText,
    ...(point.actions || []),
    ...(point.indications || []),
    ...(point.relatedSymptoms || []),
    ...(point.relatedPatterns || []),
    ...(point.techniques || []),
  ].filter(Boolean).join(' ');
}

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

function reviewCode(review) {
  const raw = String(review?.code || review?.displayCode || review?.sourceDraftId || review?.id || '')
    .replace(/^acupoint:/i, '');
  return normalizePointCode(raw);
}

function isApprovedPointReview(review) {
  return review?.status === 'approved_local' && reviewCode(review);
}

function getReviewLabel(review, displayCode) {
  return review.title || `${displayCode} — Ponto aprovado na Biblioteca Viva`;
}

function reviewToPoint(review) {
  const code = reviewCode(review);
  if (!code) return null;

  const displayCode = review.displayCode || displayPointCode(code);
  const label = getReviewLabel(review, displayCode);
  const dataOrigin = review.approvalMethod === 'bulk_high_confidence_operator_request'
    ? 'Biblioteca Viva (alta confiança)'
    : 'Biblioteca Viva';

  return {
    id: `reviewed-acupoint:${code}`,
    code,
    displayCode,
    label,
    title: label,
    names: {
      pt: label,
      en: review.names?.en || '',
    },
    meridian: {
      code: review.meridianCode || '',
      pt: review.meridian || review.meridianCode || '',
    },
    locationText: review.locationText || '',
    actions: asClinicalList(review.actions),
    indications: asClinicalList(review.indications),
    cautions: asClinicalList(review.cautions),
    relatedPatterns: asClinicalList(review.relatedPatterns),
    relatedSymptoms: asClinicalList(review.relatedSymptoms),
    techniques: asClinicalList(review.techniques),
    sources: [{ label: review.source || dataOrigin }],
    reviewStatus: review.status,
    dataOrigin,
  };
}

export function buildRecommendationCandidates(knowledgeReviews = []) {
  const byCode = new Map();

  for (const point of acupoints) {
    byCode.set(point.code, point);
  }

  const approvedReviewCodes = new Set();
  for (const review of knowledgeReviews || []) {
    if (!isApprovedPointReview(review)) continue;
    const point = reviewToPoint(review);
    if (!point) continue;
    approvedReviewCodes.add(point.code);
    byCode.set(point.code, point);
  }

  return {
    candidates: [...byCode.values()],
    stats: {
      curatedPointCount: acupoints.length,
      approvedReviewCount: approvedReviewCodes.size,
      candidateCount: byCode.size,
    },
  };
}

function addReason(reasons, reason) {
  if (reason && !reasons.includes(reason)) reasons.push(reason);
}

function getSafetyFlags(state, selectedMap) {
  const safetyItems = getSelectedItems(selectedMap, 'seguranca');
  const historyItems = getSelectedItems(selectedMap, 'historico');
  const text = toSearchText([
    ...safetyItems,
    ...historyItems,
    state?.queixa,
    state?.historia,
    state?.medicacoes,
  ].join(' '));

  return {
    pregnancy: /gestacao|gravidez|gravida/.test(text),
    anticoagulant: /anticoagulante/.test(text),
    pacemaker: /marcapasso/.test(text),
    feverInfection: /febre|infeccao/.test(text),
    localWound: /feridas locais|ferida/.test(text),
  };
}

function getMatchedEvidence(clinicalText) {
  return EVIDENCE_RULES.filter(rule => rule.pattern.test(clinicalText));
}

function scorePoint({ point, analysis, evidence, safetyFlags }) {
  const text = pointSearchText(point);
  const mainPattern = analysis?.main || '';
  const protocolCodes = new Set((analysis?.protocol?.bodyCodes || []).map(normalizePointCode));
  const rankedPatterns = Array.isArray(analysis?.ranked) ? analysis.ranked : [];
  const reasons = [];
  const cautions = [];
  const matchedEvidence = [];
  let score = 0;

  if (protocolCodes.has(point.code)) {
    score += 7;
    addReason(reasons, 'protocolo base');
  }

  if ((point.relatedPatterns || []).includes(mainPattern)) {
    score += 7;
    addReason(reasons, `padrão principal: ${mainPattern}`);
  }

  for (const [patternName, patternScore] of rankedPatterns) {
    if (!patternScore || patternName === mainPattern) continue;
    if ((point.relatedPatterns || []).includes(patternName)) {
      score += Math.min(4, Math.ceil(patternScore / 2));
      addReason(reasons, `padrão associado: ${patternName}`);
    }
  }

  for (const rule of evidence) {
    if (includesAny(text, rule.pointTerms)) {
      score += rule.weight;
      matchedEvidence.push(rule.label);
      addReason(reasons, rule.label);
    }
  }

  const cautionText = toSearchText((point.cautions || []).join(' '));
  if (safetyFlags.pregnancy && /gestacao|gravidez|gravida/.test(cautionText)) {
    cautions.push('revisar gestação antes de usar');
    score -= 3;
  }
  if (safetyFlags.localWound && point.locations?.length) {
    cautions.push('verificar integridade local antes de estimular');
  }

  return {
    point: {
      code: point.code,
      displayCode: point.displayCode || displayPointCode(point.code),
      label: point.label || `${point.displayCode || displayPointCode(point.code)} — ${point.names?.pt || point.names?.en || point.code}`,
      meridian: point.meridian?.pt || '',
      techniques: point.techniques || [],
      sources: getKnowledgeSourceLabels(point),
      reviewStatus: point.reviewStatus || point.approval?.status || '',
      dataOrigin: point.dataOrigin || 'Base curada',
    },
    score,
    reasons,
    cautions,
    matchedEvidence,
  };
}

export function buildPointRecommendations({ state = {}, selectedMap = {}, analysis = {}, knowledgeReviews = [], limit = 8 } = {}) {
  const clinicalText = getAllClinicalText(state, selectedMap);
  const evidence = getMatchedEvidence(clinicalText);
  const safetyFlags = getSafetyFlags(state, selectedMap);
  const { candidates, stats } = buildRecommendationCandidates(knowledgeReviews);

  const recommendations = candidates
    .map(point => scorePoint({ point, analysis, evidence, safetyFlags }))
    .filter(item => item.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.point.displayCode.localeCompare(b.point.displayCode, 'pt-BR', { numeric: true });
    })
    .slice(0, limit);

  return {
    evidence: evidence.map(item => ({ id: item.id, label: item.label })),
    recommendations,
    safetyFlags,
    candidateStats: stats,
  };
}
