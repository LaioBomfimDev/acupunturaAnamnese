import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { auricularPdfPoints } from '../../frontend/src/knowledge/generated/auricular-pdf-points.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');

const defaultPdfRoot = path.join(projectRoot, 'frontend', '.local-source-assets', 'pdf-sources');
const defaultIndexPath = path.join(defaultPdfRoot, 'source-index.local.json');
const defaultKmAgentPath = path.join(projectRoot, 'frontend', 'src', 'knowledge', 'generated', 'km-agent', 'acupoints.enriched.json');
const defaultLinksPath = path.join(defaultPdfRoot, 'source-candidate-links.local.json');
const defaultAuricularLinksPath = path.join(defaultPdfRoot, 'auricular-candidate-links.local.json');
const defaultDraftsPath = path.join(defaultPdfRoot, 'source-review-drafts.local.json');
const defaultSummaryPath = path.join(projectRoot, 'docs', 'pdf-source-learning-2026-06-05.md');

const PREFIX_ALIASES = {
  LU: ['P'],
  LI: ['IG'],
  ST: ['E'],
  SP: ['BP', 'Ba'],
  HT: ['C'],
  SI: ['ID'],
  BL: ['B'],
  KI: ['R'],
  PC: ['PC', 'CS', 'Pc'],
  TE: ['TA', 'SJ'],
  GB: ['VB'],
  LR: ['F'],
  CV: ['VC', 'Ren'],
  GV: ['VG', 'Du'],
};

const MERIDIAN_NAMES_PT_BR = {
  LU: ['pulmao', 'pulmonar'],
  LI: ['intestino grosso'],
  ST: ['estomago'],
  SP: ['baco'],
  HT: ['coracao'],
  SI: ['intestino delgado'],
  BL: ['bexiga'],
  KI: ['rim'],
  PC: ['pericardio'],
  TE: ['triplo aquecedor', 'sanjiao', 'sao jiao'],
  GB: ['vesicula biliar'],
  LR: ['figado'],
  CV: ['vaso concepcao', 'ren mai'],
  GV: ['vaso governador', 'du mai'],
};

const GENERIC_NAME_TERMS = new Set([
  'point',
  'ponto',
  'acupoint',
  'acupuncture',
  'acupuntura',
  'meridian',
  'meridiano',
  'central',
  'residence',
  'treasury',
]);

const AURICULAR_SOURCE_PATTERN = /auricul/i;
const ARTICLE_SOURCE_PATTERN = /artigo|coorte|metodologic|trial|bias/i;
const POINT_CANDIDATE_SKIP_POLICIES = new Set([
  'none',
  'skipacupointcandidates',
  'sourceonly',
  'sourceonlynopointcandidatescan',
]);
const MIN_CANDIDATE_TEXT_CHARACTERS = 160;
const MIN_CANDIDATE_WORDS = 18;
const MIN_CANDIDATE_LETTERS = 70;
const CONTENTS_HEADING_PATTERN = /\b(?:sumario|conteudo|indice|table of contents|contents|sommaire)\b/u;
const FORMAL_FRONT_MATTER_PATTERN = /\b(?:isbn|copyright|catalogacao na fonte|ficha catalografica|todos os direitos reservados|direitos reservados)\b/u;
const FRONT_MATTER_HEADING_PATTERN = /\b(?:dedicatoria|agradecimentos|prefacio|apresentacao|creditos editoriais|nota importante)\b/u;
const CLINICAL_CONTENT_PATTERN = /\b(?:localizacao|indicacoes|metodo|funcoes?|tecnica|anatomia|canal de energia|meridiano do)\b/u;
const CONTENTS_LISTING_PATTERN = /\b(?:parte|capitulo|pontos?|meridiano|canal|anatomia|protocolos?)\b/u;

const AURICULAR_PROTOCOL_CONCEPTS = [
  { target: 'AA1', label: 'Anatomia Auricular', aliases: ['anatomia auricular', 'helix', 'helice', 'anti-helice', 'antihelice', 'trago', 'antitrago', 'concha', 'lobulo', 'fossa triangular', 'fossa escafoide', 'raiz da helice'] },
  { target: 'AA2', label: 'Protocolo Auricular para Tabagismo', aliases: ['tabagismo', 'parar de fumar', 'fumante', 'fumo', 'cigarro', 'nicotina', 'smoking', 'tobacco'] },
  { target: 'AA3', label: 'Protocolo Auricular para Obesidade', aliases: ['obesidade', 'emagrecimento', 'perda de peso', 'compulsao alimentar', 'overeating', 'obesity', 'weight loss'] },
];

const AURICULAR_CONCEPTS = [
  ...auricularPdfPoints.map(point => ({
    target: `auricular:${point.slug}`,
    label: point.name,
    aliases: [point.name, ...(point.aliases || [])],
  })),
  ...AURICULAR_PROTOCOL_CONCEPTS,
];

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith('--')) continue;
    const key = value.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

function stripDiacritics(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function normalizeSearchText(text) {
  return stripDiacritics(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCompact(text) {
  return normalizeSearchText(text).replace(/[\s-]+/g, '');
}

export function sourceSkipsPointCandidateExtraction(source) {
  const policy = normalizeCompact(
    source.candidateExtractionPolicy
      || source.pointCandidateExtraction
      || source.pointCandidatePolicy
      || '',
  );
  return POINT_CANDIDATE_SKIP_POLICIES.has(policy);
}

function normalizeSpaces(text) {
  return String(text || '')
    .replace(/\u0000/g, '')
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isPtBrLanguage(value) {
  const key = normalizeCompact(value);
  return key === 'ptbr' || key === 'pt' || key === 'por' || key === 'portugues';
}

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function flexibleTermPattern(term) {
  const normalized = normalizeSearchText(term);
  const codeLike = normalized.match(/^([a-z]+(?:-[a-z]+)*)(?:[\s-]*)(\d+)$/);
  if (codeLike) {
    const [, prefix, number] = codeLike;
    return `${escapeRegex(prefix).replace(/-/g, '[\\s-]*')}[\\s-]*${escapeRegex(number)}`;
  }
  return escapeRegex(normalized).replace(/[\s-]+/g, '[\\s-]*');
}

export function compileTerm(term) {
  const normalized = normalizeSearchText(term.value || term);
  if (!normalized) return null;
  return {
    ...term,
    normalized,
    regex: new RegExp(`(^|[^\\p{L}\\p{N}])(${flexibleTermPattern(normalized)})(?=$|[^\\p{L}\\p{N}])`, 'giu'),
  };
}

export function findTermMatches(text, compiledTerms) {
  const normalizedText = normalizeSearchText(text);
  if (!normalizedText) return [];

  const matches = [];
  for (const term of compiledTerms) {
    term.regex.lastIndex = 0;
    const match = term.regex.exec(normalizedText);
    if (!match) continue;
    matches.push({
      value: term.value,
      normalized: term.normalized,
      type: term.type,
      confidence: term.confidence,
      targetCode: term.targetCode,
      targetType: term.targetType,
      targetLabel: term.targetLabel,
      index: Math.max(0, match.index + match[1].length),
    });
  }

  return matches;
}

function confidenceLabel(value) {
  if (value >= 0.9) return 'high';
  if (value >= 0.74) return 'medium';
  return 'low';
}

function pathExists(candidate) {
  return fsSync.existsSync(candidate);
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function readOptionalText(filePath) {
  if (!filePath || !pathExists(filePath)) return '';
  return fs.readFile(filePath, 'utf8');
}

function sourceRootForManifest(pdfRoot, sourceKey) {
  return path.join(pdfRoot, sourceKey);
}

function sourceIsAuricular(source) {
  return AURICULAR_SOURCE_PATTERN.test(`${source.sourceType || ''} ${source.title || ''}`);
}

function sourceIsArticle(source) {
  return ARTICLE_SOURCE_PATTERN.test(`${source.sourceType || ''} ${source.title || ''}`);
}

function languagePolicyForSource(source, policy = {}) {
  const originalLanguage = policy.originalLanguage || source.originalLanguage || 'unknown';
  const ptBr = isPtBrLanguage(originalLanguage);
  return {
    pointPageLanguage: 'pt-BR',
    originalLanguage,
    allowRawOriginalInPointPages: false,
    ptBrReviewed: false,
    pointPageEligibleAfterReview: ptBr,
    requiresPtBrSynthesis: !ptBr,
    requiresProfessionalAudit: true,
    canPopulatePointPageNow: false,
    reason: ptBr
      ? 'Fonte pt-BR conectada como evidencia candidata; ficha clinica exige revisao profissional antes de uso.'
      : 'Fonte nao-pt-BR conectada apenas como fonte bruta; ficha clinica exige sintese pt-BR revisada.',
  };
}

function parsePointCode(code) {
  const normalized = String(code || '').trim().toUpperCase();
  const match = normalized.match(/^(EX-[A-Z]+|[A-Z]+)(\d+)$/);
  if (!match) return null;
  return {
    code: normalized,
    meridianCode: match[1],
    number: Number(match[2]),
  };
}

function addUniqueTerm(terms, seen, value, type, confidence, meta = {}) {
  const normalized = normalizeCompact(value);
  if (!normalized || seen.has(`${type}:${normalized}`)) return;
  if (type.startsWith('name') && (normalized.length < 4 || GENERIC_NAME_TERMS.has(normalized))) return;
  seen.add(`${type}:${normalized}`);
  terms.push({
    value,
    type,
    confidence,
    ...meta,
  });
}

function splitNameTerms(value) {
  const text = String(value || '').replace(/[()]/g, ' ');
  return normalizeSpaces(text)
    .split(/[;,/|]+|\s+-\s+/)
    .map(item => normalizeSpaces(item))
    .filter(Boolean);
}

export function buildCandidateTermsForRecord(record) {
  const code = String(record.code || record.displayCode || '').trim().toUpperCase();
  const parsed = parsePointCode(code);
  const seen = new Set();
  const terms = [];
  const targetMeta = {
    targetCode: code,
    targetType: 'acupoint',
    targetLabel: record.titlePtBr || record.displayCode || code,
  };

  if (code) {
    addUniqueTerm(terms, seen, code, 'canonical_code', 0.96, targetMeta);
    if (parsed) addUniqueTerm(terms, seen, `${parsed.meridianCode}-${parsed.number}`, 'canonical_code', 0.94, targetMeta);
  }

  if (record.displayCode && record.displayCode !== code) {
    addUniqueTerm(terms, seen, record.displayCode, 'display_code', 0.93, targetMeta);
  }

  if (parsed) {
    for (const prefix of PREFIX_ALIASES[parsed.meridianCode] || []) {
      addUniqueTerm(terms, seen, `${prefix}${parsed.number}`, 'code_alias', 0.9, targetMeta);
      addUniqueTerm(terms, seen, `${prefix}-${parsed.number}`, 'code_alias', 0.92, targetMeta);
    }

    for (const meridianName of MERIDIAN_NAMES_PT_BR[parsed.meridianCode] || []) {
      addUniqueTerm(terms, seen, `${meridianName} ${parsed.number}`, 'meridian_name_code', 0.78, targetMeta);
    }
  }

  const nameValues = [
    record.names?.pinyin,
    record.names?.en,
    record.titlePtBr,
  ].filter(Boolean);

  for (const value of nameValues.flatMap(splitNameTerms)) {
    addUniqueTerm(terms, seen, value, 'name', 0.68, targetMeta);
  }

  return terms;
}

export function buildAuricularTerms() {
  const terms = [];
  const seen = new Set();
  for (const concept of AURICULAR_CONCEPTS) {
    const targetType = concept.target.startsWith('auricular:') ? 'auricular_point' : 'auricular_protocol';
    for (const alias of concept.aliases) {
      addUniqueTerm(terms, seen, alias, 'auricular_term', 0.86, {
        targetCode: concept.target,
        targetType,
        targetLabel: concept.label,
      });
    }
  }
  return terms;
}

function filterTermsForSource(terms, source) {
  const auricular = sourceIsAuricular(source);
  const article = sourceIsArticle(source);
  return terms.filter(term => {
    if (term.targetType !== 'acupoint') return true;
    if (auricular || article) return !term.type.startsWith('name');
    return true;
  });
}

function pickSnippet(text, index, size = 260) {
  const normalized = normalizeSpaces(text);
  if (!normalized) return '';
  const start = Math.max(0, Math.min(normalized.length - 1, index) - Math.floor(size * 0.35));
  const snippet = normalized.slice(start, start + size);
  return snippet
    .replace(/\s+/g, ' ')
    .replace(/^[,;:.()\]\s-]+/, '')
    .replace(/[,;:([-\s]+$/, '')
    .trim();
}

async function loadPageText(sourceRoot, page) {
  const extractionPath = page.extraction?.file ? path.join(sourceRoot, page.extraction.file) : '';
  const ocrPath = page.ocr?.file ? path.join(sourceRoot, page.ocr.file) : '';
  const [pdfText, ocrText] = await Promise.all([
    readOptionalText(extractionPath),
    readOptionalText(ocrPath),
  ]);
  return {
    pdfText,
    ocrText,
    rawText: `${pdfText}\n${ocrText}`,
    combinedText: normalizeSpaces(`${pdfText}\n${ocrText}`),
  };
}

function countMatches(text, pattern) {
  return [...String(text || '').matchAll(pattern)].length;
}

function isLowQualityCandidateText(rawText, normalizedText) {
  const letters = countMatches(rawText, /\p{L}/gu);
  const words = countMatches(normalizedText, /\p{L}{2,}/gu);
  return rawText.length < MIN_CANDIDATE_TEXT_CHARACTERS
    || letters < MIN_CANDIDATE_LETTERS
    || words < MIN_CANDIDATE_WORDS;
}

function sourceIdentityTerms(source) {
  const titleTerms = normalizeSearchText(source.title)
    .split(' ')
    .filter(term => term.length >= 4);
  const authorTerms = (source.authors || [])
    .flatMap(author => normalizeSearchText(author).split(' '))
    .filter(term => term.length >= 4);
  return [...new Set([...titleTerms, ...authorTerms])];
}

function isLikelyCoverPage(source, page, normalizedText) {
  if (page.pageNumber > 2 || CLINICAL_CONTENT_PATTERN.test(normalizedText)) return false;
  const identityTerms = sourceIdentityTerms(source);
  return identityTerms.length >= 2 && identityTerms.every(term => normalizedText.includes(term));
}

function isLikelyContentsContinuation(rawText, normalizedText) {
  const pageReferences = countMatches(rawText, /(?<!\p{L})\d{1,4}(?!\p{L})/gu);
  const sentenceEnds = countMatches(rawText, /[.!?](?=\s|$)/gu);
  return pageReferences >= 7
    && sentenceEnds <= 2
    && CONTENTS_LISTING_PATTERN.test(normalizedText);
}

function pageHeadingText(normalizedText) {
  return normalizedText.split(' ').slice(0, 16).join(' ');
}

export function getCandidatePageSkipReason({
  source,
  page,
  pageText,
  insideContents = false,
}) {
  const rawText = pageText.rawText || pageText.combinedText || '';
  const normalizedText = normalizeSearchText(rawText);
  const headingText = pageHeadingText(normalizedText);

  if (!normalizedText || isLowQualityCandidateText(rawText, normalizedText)) return 'texto_ilegivel_ou_insuficiente';
  if (CONTENTS_HEADING_PATTERN.test(headingText)) return 'sumario';
  if (insideContents && isLikelyContentsContinuation(rawText, normalizedText)) return 'sumario_continuacao';
  if (FORMAL_FRONT_MATTER_PATTERN.test(normalizedText) || FRONT_MATTER_HEADING_PATTERN.test(headingText)) return 'front_matter';
  if (isLikelyCoverPage(source, page, normalizedText)) return 'capa';
  return '';
}

function mergeEvidence(existing, next) {
  const bestConfidence = Math.max(existing.confidence, next.confidence);
  const termMap = new Map();
  for (const term of [...existing.matchedTerms, ...next.matchedTerms]) {
    termMap.set(`${term.type}:${normalizeCompact(term.value)}`, term);
  }

  return {
    ...existing,
    confidence: bestConfidence,
    confidenceLabel: confidenceLabel(bestConfidence),
    matchedTerms: [...termMap.values()]
      .sort((left, right) => right.confidence - left.confidence)
      .slice(0, 8),
  };
}

function candidateLinkKey(link) {
  return `${link.targetType}|${link.code}|${link.source.key}|${link.page.pdfPage}`;
}

function buildCandidateLink({ source, page, pageText, match, policy }) {
  const confidence = match.confidence;
  return {
    id: `${match.targetType}:${match.targetCode}:${source.key}:p${String(page.pageNumber).padStart(3, '0')}`,
    status: 'review',
    targetType: match.targetType,
    code: match.targetCode,
    displayCode: match.targetCode,
    title: match.targetLabel,
    source: {
      key: source.key,
      title: source.title,
      sourceType: source.sourceType,
      originalLanguage: source.originalLanguage,
    },
    page: {
      pdfPage: page.pageNumber,
      imageUrl: page.image?.publicUrl || '',
      textFile: page.extraction?.file || '',
      ocrFile: page.ocr?.file || '',
      languageHint: page.languageHint || source.detectedLanguageHint || source.originalLanguage,
    },
    snippet: pickSnippet(pageText.combinedText, match.index),
    matchedTerms: [{
      value: match.value,
      type: match.type,
      confidence: match.confidence,
    }],
    confidence,
    confidenceLabel: confidenceLabel(confidence),
    languagePolicy: policy,
    clinicalUse: {
      canPopulatePointPageNow: false,
      canBecomePtBrDraftAfterReview: policy.pointPageEligibleAfterReview,
      requiresPtBrSynthesis: policy.requiresPtBrSynthesis,
      requiresProfessionalAudit: true,
    },
  };
}

export async function buildCandidateLinksForPages({
  source,
  manifest,
  sourceRoot,
  compiledTerms,
  auricularCompiledTerms,
}) {
  const linksByKey = new Map();
  const auricularLinksByKey = new Map();
  let pagesScanned = 0;
  let pagesWithText = 0;
  let pagesSkippedAsNonContent = 0;
  let insideContents = false;

  const sourceTerms = filterTermsForSource(compiledTerms, manifest.source);
  const useAuricularTerms = sourceIsAuricular(manifest.source);
  const policy = languagePolicyForSource(manifest.source, manifest.policy);

  for (const page of manifest.pages || []) {
    pagesScanned += 1;
    const pageText = await loadPageText(sourceRoot, page);
    if (pageText.combinedText) pagesWithText += 1;

    const skipReason = getCandidatePageSkipReason({
      source: manifest.source || source,
      page,
      pageText,
      insideContents,
    });
    insideContents = skipReason === 'sumario' || skipReason === 'sumario_continuacao';
    if (skipReason) {
      pagesSkippedAsNonContent += 1;
      continue;
    }

    const pageTerms = findTermMatches(pageText.combinedText, sourceTerms);
    for (const match of pageTerms) {
      const link = buildCandidateLink({ source, page, pageText, match, policy });
      const key = candidateLinkKey(link);
      linksByKey.set(key, linksByKey.has(key) ? mergeEvidence(linksByKey.get(key), link) : link);
    }

    if (useAuricularTerms) {
      const auricularMatches = findTermMatches(pageText.combinedText, auricularCompiledTerms);
      for (const match of auricularMatches) {
        const link = buildCandidateLink({ source, page, pageText, match, policy });
        const key = candidateLinkKey(link);
        auricularLinksByKey.set(key, auricularLinksByKey.has(key) ? mergeEvidence(auricularLinksByKey.get(key), link) : link);
      }
    }
  }

  return {
    links: [...linksByKey.values()],
    auricularLinks: [...auricularLinksByKey.values()],
    stats: {
      sourceKey: source.key,
      pagesScanned,
      pagesWithText,
      pagesSkippedAsNonContent,
    },
  };
}

function sourceManifestPath(pdfRoot, source) {
  return path.join(pdfRoot, source.key, 'manifest.json');
}

function buildCompiledAcupointTerms(records) {
  return records
    .flatMap(buildCandidateTermsForRecord)
    .map(compileTerm)
    .filter(Boolean);
}

function sortLinks(links) {
  return links.sort((left, right) => {
    if (left.code !== right.code) return left.code.localeCompare(right.code);
    if (left.source.key !== right.source.key) return left.source.key.localeCompare(right.source.key);
    return left.page.pdfPage - right.page.pdfPage;
  });
}

function summarizeLinks(links) {
  const connectedCodes = new Set(links.map(link => link.code));
  const ptBrEligibleCodes = new Set(links.filter(link => link.languagePolicy.pointPageEligibleAfterReview).map(link => link.code));
  const synthesisBlockedCodes = new Set(links.filter(link => link.languagePolicy.requiresPtBrSynthesis).map(link => link.code));
  const highConfidenceCodes = new Set(links.filter(link => link.confidenceLabel === 'high').map(link => link.code));
  const bySource = {};
  const byConfidence = { high: 0, medium: 0, low: 0 };

  for (const link of links) {
    bySource[link.source.key] = (bySource[link.source.key] || 0) + 1;
    byConfidence[link.confidenceLabel] = (byConfidence[link.confidenceLabel] || 0) + 1;
  }

  return {
    links: links.length,
    connectedTargets: connectedCodes.size,
    ptBrEligibleTargets: ptBrEligibleCodes.size,
    targetsWithNonPtBrRawSource: synthesisBlockedCodes.size,
    highConfidenceTargets: highConfidenceCodes.size,
    byConfidence,
    bySource,
  };
}

function buildReviewDrafts(links) {
  const grouped = new Map();
  for (const link of links) {
    if (!grouped.has(link.code)) grouped.set(link.code, []);
    grouped.get(link.code).push(link);
  }

  return [...grouped.entries()].map(([code, pointLinks]) => {
    const sorted = [...pointLinks].sort((left, right) => {
      if (right.confidence !== left.confidence) return right.confidence - left.confidence;
      return left.page.pdfPage - right.page.pdfPage;
    });
    const hasPtBrSource = sorted.some(link => link.languagePolicy.pointPageEligibleAfterReview);
    return {
      id: `pdf-source-draft:${code}`,
      code,
      displayCode: sorted[0]?.displayCode || code,
      title: sorted[0]?.title || code,
      status: 'review',
      source: 'Biblioteca Viva - PDF source candidates',
      approvalMode: 'none',
      requiresProfessionalAudit: true,
      generatedFrom: 'connect-pdf-source-candidates.mjs',
      languagePolicy: {
        pointPageLanguage: 'pt-BR',
        allowRawOriginalInPointPages: false,
        ptBrReviewed: false,
        pointPageEligibleAfterReview: hasPtBrSource,
        requiresPtBrSynthesis: !hasPtBrSource,
        requiresProfessionalAudit: true,
      },
      sourceCandidateCounts: {
        links: pointLinks.length,
        sources: new Set(pointLinks.map(link => link.source.key)).size,
        highConfidenceLinks: pointLinks.filter(link => link.confidenceLabel === 'high').length,
      },
      sourceReferences: sorted.slice(0, 12).map(link => ({
        sourceKey: link.source.key,
        sourceTitle: link.source.title,
        originalLanguage: link.source.originalLanguage,
        pdfPage: link.page.pdfPage,
        imageUrl: link.page.imageUrl,
        confidence: link.confidenceLabel,
        matchedTerms: link.matchedTerms.map(term => term.value),
        snippet: link.snippet,
        requiresPtBrSynthesis: link.languagePolicy.requiresPtBrSynthesis,
      })),
    };
  }).sort((left, right) => left.code.localeCompare(right.code));
}

function skippedSourcesMarkdown(skippedSources) {
  if (!skippedSources.length) return '';
  const rows = skippedSources
    .map(source => `| ${source.key} | ${source.pageCount || 0} | ${source.reason} |`)
    .join('\n');

  return `
## Fontes fora do scanner de pontos

Estas fontes foram ingeridas como biblioteca/rastreamento, mas nao foram varridas
pelo conector de pontos para evitar candidatos falsos em dominios especificos.

| Fonte | Paginas | Motivo |
| --- | ---: | --- |
${rows}
`;
}

function summaryMarkdown({
  generatedAt,
  index,
  sourceSummary,
  auricularSummary,
  pageStats,
  links,
  auricularLinks,
  skippedSources = [],
}) {
  const scannedPages = pageStats.reduce((sum, item) => sum + item.pagesScanned, 0);
  const skippedNonContentPages = pageStats.reduce((sum, item) => sum + item.pagesSkippedAsNonContent, 0);
  const pageRows = pageStats.map(item => `| ${item.sourceKey} | ${item.pagesScanned} | ${item.pagesWithText} | ${item.pagesSkippedAsNonContent} |`).join('\n');
  const sourceRows = Object.entries(sourceSummary.bySource)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([sourceKey, count]) => `| ${sourceKey} | ${count} |`)
    .join('\n');
  const auricularRows = Object.entries(auricularSummary.bySource)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([sourceKey, count]) => `| ${sourceKey} | ${count} |`)
    .join('\n');

  return `# Aprendizado local de PDFs por pagina

Gerado em: ${generatedAt}

## Regra clinica

- ${scannedPages} paginas foram varridas pelo conector de pontos, dentro de ${index.counts.pages} paginas ingeridas de ${index.counts.sources} PDFs.
- ${skippedNonContentPages} paginas de capa, sumario, front matter ou texto insuficiente foram ignoradas antes de gerar candidatos.
- O resultado e evidencia candidata para curadoria, nao aprovacao clinica.
- Fichas de ponto permanecem em pt-BR; fonte nao-pt-BR exige sintese pt-BR revisada.
- Paginas/imagens continuam em \`frontend/.local-source-assets\`, fora do bundle principal.
${skippedSourcesMarkdown(skippedSources)}

## Cobertura de varredura

| Fonte | Paginas varridas | Paginas com texto/OCR | Paginas ignoradas |
| --- | ---: | ---: | ---: |
${pageRows}

## Pontos sistemicos/KM-Agent

- Links candidatos: ${sourceSummary.links}
- Pontos/registros conectados: ${sourceSummary.connectedTargets}
- Registros com fonte pt-BR elegivel para rascunho apos revisao: ${sourceSummary.ptBrEligibleTargets}
- Registros com alguma fonte nao-pt-BR bloqueada para ficha: ${sourceSummary.targetsWithNonPtBrRawSource}
- Registros com ao menos um link de alta confianca: ${sourceSummary.highConfidenceTargets}
- Validacoes/aprovacoes clinicas automaticas: 0

| Fonte | Links candidatos |
| --- | ---: |
${sourceRows}

## Auriculoterapia

- Links candidatos auriculares: ${auricularSummary.links}
- Alvos auriculares/protocolos conectados: ${auricularSummary.connectedTargets}
- Alvos com fonte pt-BR elegivel para rascunho apos revisao: ${auricularSummary.ptBrEligibleTargets}
- Alvos com alguma fonte nao-pt-BR bloqueada para ficha: ${auricularSummary.targetsWithNonPtBrRawSource}
- Validacoes/aprovacoes clinicas automaticas: 0

| Fonte auricular | Links candidatos |
| --- | ---: |
${auricularRows}

## Arquivos locais

- Links sistemicos: \`frontend/.local-source-assets/pdf-sources/source-candidate-links.local.json\`
- Links auriculares: \`frontend/.local-source-assets/pdf-sources/auricular-candidate-links.local.json\`
- Rascunhos de revisao: \`frontend/.local-source-assets/pdf-sources/source-review-drafts.local.json\`

## Observacao

As contagens representam conexoes por pagina/termo. Um ponto conectado ainda precisa de revisao humana para virar dado clinico aprovado.
`;
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function run(options = {}) {
  const pdfRoot = path.resolve(options.pdfRoot || defaultPdfRoot);
  const indexPath = path.resolve(options.index || defaultIndexPath);
  const kmAgentPath = path.resolve(options.kmAgent || defaultKmAgentPath);
  const linksPath = path.resolve(options.links || defaultLinksPath);
  const auricularLinksPath = path.resolve(options.auricularLinks || defaultAuricularLinksPath);
  const draftsPath = path.resolve(options.drafts || defaultDraftsPath);
  const summaryPath = path.resolve(options.summary || defaultSummaryPath);
  const generatedAt = new Date().toISOString();

  const [index, kmAgentRecords] = await Promise.all([
    readJson(indexPath),
    readJson(kmAgentPath),
  ]);
  const compiledTerms = buildCompiledAcupointTerms(kmAgentRecords);
  const auricularCompiledTerms = buildAuricularTerms().map(compileTerm).filter(Boolean);
  const allLinks = [];
  const allAuricularLinks = [];
  const pageStats = [];
  const skippedSources = [];

  for (const source of index.sources || []) {
    if (sourceSkipsPointCandidateExtraction(source)) {
      skippedSources.push({
        key: source.key,
        title: source.title,
        pageCount: source.pageCount,
        reason: 'candidateExtractionPolicy sem varredura de pontos',
      });
      continue;
    }

    const manifest = await readJson(sourceManifestPath(pdfRoot, source));
    const result = await buildCandidateLinksForPages({
      source,
      manifest,
      sourceRoot: sourceRootForManifest(pdfRoot, source.key),
      compiledTerms,
      auricularCompiledTerms,
    });
    allLinks.push(...result.links);
    allAuricularLinks.push(...result.auricularLinks);
    pageStats.push(result.stats);
  }

  const sortedLinks = sortLinks(allLinks);
  const sortedAuricularLinks = sortLinks(allAuricularLinks);
  const sourceSummary = summarizeLinks(sortedLinks);
  const auricularSummary = summarizeLinks(sortedAuricularLinks);
  const drafts = buildReviewDrafts([...sortedLinks, ...sortedAuricularLinks]);

  const policy = {
    pointPagesLanguage: 'pt-BR',
    rawOriginalAllowedInPointPages: false,
    candidatesAreClinicalApprovals: false,
    requiresProfessionalAudit: true,
  };

  const sourceOutput = {
    schemaVersion: 'pdf-source-candidate-links.v1',
    generatedAt,
    policy,
    counts: {
      ...sourceSummary,
      pagesScanned: pageStats.reduce((sum, item) => sum + item.pagesScanned, 0),
      pagesWithTextOrOcr: pageStats.reduce((sum, item) => sum + item.pagesWithText, 0),
      pagesSkippedAsNonContent: pageStats.reduce((sum, item) => sum + item.pagesSkippedAsNonContent, 0),
      automaticClinicalApprovals: 0,
    },
    links: sortedLinks,
  };

  const auricularOutput = {
    schemaVersion: 'pdf-auricular-candidate-links.v1',
    generatedAt,
    policy,
    counts: {
      ...auricularSummary,
      pagesScannedInAuricularSources: pageStats
        .filter(item => {
          const source = index.sources.find(candidate => candidate.key === item.sourceKey);
          return source && sourceIsAuricular(source);
        })
        .reduce((sum, item) => sum + item.pagesScanned, 0),
      pagesSkippedAsNonContent: pageStats.reduce((sum, item) => sum + item.pagesSkippedAsNonContent, 0),
      automaticClinicalApprovals: 0,
    },
    links: sortedAuricularLinks,
  };

  const draftsOutput = {
    schemaVersion: 'pdf-source-review-drafts.v1',
    generatedAt,
    policy,
    counts: {
      drafts: drafts.length,
      automaticClinicalApprovals: 0,
    },
    reviews: drafts,
  };

  await writeJson(linksPath, sourceOutput);
  await writeJson(auricularLinksPath, auricularOutput);
  await writeJson(draftsPath, draftsOutput);
  await fs.writeFile(summaryPath, summaryMarkdown({
    generatedAt,
    index,
    sourceSummary,
    auricularSummary,
    pageStats,
    links: sortedLinks,
    auricularLinks: sortedAuricularLinks,
    skippedSources,
  }), 'utf8');

  return {
    links: linksPath,
    auricularLinks: auricularLinksPath,
    drafts: draftsPath,
    summary: summaryPath,
    counts: {
      pagesScanned: sourceOutput.counts.pagesScanned,
      pagesSkippedAsNonContent: sourceOutput.counts.pagesSkippedAsNonContent,
      sourceLinks: sourceSummary.links,
      sourceTargets: sourceSummary.connectedTargets,
      auricularLinks: auricularSummary.links,
      auricularTargets: auricularSummary.connectedTargets,
      drafts: drafts.length,
      skippedSources: skippedSources.length,
      automaticClinicalApprovals: 0,
    },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await run(args);
  console.log(JSON.stringify({
    links: path.relative(projectRoot, result.links),
    auricularLinks: path.relative(projectRoot, result.auricularLinks),
    drafts: path.relative(projectRoot, result.drafts),
    summary: path.relative(projectRoot, result.summary),
    counts: result.counts,
  }, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
