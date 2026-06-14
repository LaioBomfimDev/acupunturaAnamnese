import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const atlasDir = path.join(root, 'frontend', '.local-source-assets', 'atlas-ednea');
const pdfDir = path.join(root, 'frontend', '.local-source-assets', 'pdf-sources');

const deepPath = path.join(atlasDir, 'deep-curated-reviews.json');
const sourceDraftsPath = path.join(pdfDir, 'source-review-drafts.local.json');
const sourceLinksPath = path.join(pdfDir, 'source-candidate-links.local.json');
const sourceIndexPath = path.join(pdfDir, 'source-index.local.json');
const auditPath = path.join(pdfDir, 'medium-confidence-prefill-audit.local.json');

const PT_BR_SOURCE_KEYS = new Set([
  'ednea-garcia-guia-ilustrado-referencia',
  'scavone-manual-auriculoterapia',
  'livro-acupuntura-auricular',
]);

const TABLE_TERMS = [
  'n/nome',
  'n2/nome',
  'nq/nome',
  'localizacao',
  'anatomia',
  'metodo',
  'sensacao',
  'precaucoes',
  'moxabustao',
  'caracteristicas',
];

const MERIDIAN_PAGE_TERMS = {
  LU: ['pulmao', 'taiyin da mao', 'canal do pulmao'],
  LI: ['intestino grosso', 'yangming da mao', 'canal do intestino grosso'],
  ST: ['estomago', 'yangming do pe', 'canal do estomago'],
  SP: ['baco', 'taiyin do pe', 'canal do baco'],
  HT: ['coracao', 'shaoyin da mao', 'canal do coracao'],
  SI: ['intestino delgado', 'taiyang da mao', 'canal do intestino delgado'],
  BL: ['bexiga', 'taiyang do pe', 'canal da bexiga'],
  KI: ['rim', 'shaoyin do pe', 'canal do rim'],
  PC: ['pericardio', 'jueyin da mao', 'canal do pericardio'],
  TE: ['sanjiao', 'triplo aquecedor', 'shaoyang da mao'],
  GB: ['vesicula biliar', 'shaoyang do pe', 'canal da vesicula biliar'],
  LR: ['figado', 'jueyin do pe', 'canal do figado'],
  CV: ['concepcao', 'ren mai', 'vaso concepcao'],
  GV: ['governador', 'du mai', 'vaso governador'],
};

const PREFIX_ALIASES = {
  LU: ['P'],
  LI: ['IG'],
  ST: ['E'],
  SP: ['BP'],
  HT: ['C'],
  SI: ['ID'],
  BL: ['B'],
  KI: ['R'],
  PC: ['PC', 'CS'],
  TE: ['SJ', 'TA'],
  GB: ['VB'],
  LR: ['F'],
  CV: ['Ren', 'VC'],
  GV: ['Du', 'VG'],
};

const pageTextCache = new Map();

function stripDiacritics(text) {
  return String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeText(text) {
  return stripDiacritics(text).toLowerCase().replace(/\s+/g, ' ').trim();
}

function compactCode(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function asArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value) return [];
  return String(value).split(',').map(item => item.trim()).filter(Boolean);
}

function parsePointCode(code) {
  const match = String(code || '').toUpperCase().match(/^([A-Z]+)(\d+)$/);
  if (!match) return null;
  return { prefix: match[1], number: match[2] };
}

function buildCodeAliases(review) {
  const parsed = parsePointCode(review.code || review.displayCode);
  if (!parsed) return unique([review.code, review.displayCode]);

  const aliases = [review.code, review.displayCode];
  for (const prefix of [parsed.prefix, ...(PREFIX_ALIASES[parsed.prefix] || [])]) {
    aliases.push(`${prefix}${parsed.number}`);
    aliases.push(`${prefix}-${parsed.number}`);
    aliases.push(`${prefix} ${parsed.number}`);
  }
  return unique(aliases);
}

function cleanSnippet(text) {
  return String(text || '')
    .replace(/\u0000/g, '')
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildTermCandidates(review, link) {
  const terms = [
    review.code,
    review.displayCode,
    review.atlasName,
    review.orientalNames?.pinyin,
    review.orientalNames?.english,
    review.orientalNames?.meaningPtBr,
    review.names?.pt,
    review.names?.en,
    review.names?.pinyin,
    review.names?.zh,
    ...asArray(review.aliases),
    ...(link?.matchedTerms || []).map(term => term.value),
  ];

  return unique(terms.map(cleanSnippet).filter(term => term && term.length <= 60));
}

function termRegex(term) {
  const normalized = normalizeText(term);
  if (!normalized) return null;
  return new RegExp(escapeRegex(normalized).replace(/[\s-]+/g, '[\\s-]*'), 'i');
}

function bestSnippetFromPage(pageText, review, link) {
  const cleaned = cleanSnippet(pageText);
  if (!cleaned) return cleanSnippet(link?.snippet || '');

  const normalized = normalizeText(cleaned);
  const terms = buildTermCandidates(review, link);
  let bestIndex = -1;

  for (const term of terms) {
    const regex = termRegex(term);
    if (!regex) continue;
    const match = regex.exec(normalized);
    if (match && (bestIndex === -1 || match.index < bestIndex)) bestIndex = match.index;
  }

  if (bestIndex < 0) {
    const fallback = cleanSnippet(link?.snippet || '');
    return fallback || cleaned.slice(0, 420);
  }

  const start = Math.max(0, bestIndex - 180);
  const end = Math.min(cleaned.length, bestIndex + 420);
  return cleaned.slice(start, end).trim();
}

async function readPageText(sourceKey, pdfPage) {
  const cacheKey = `${sourceKey}:${pdfPage}`;
  if (pageTextCache.has(cacheKey)) return pageTextCache.get(cacheKey);

  const page = String(pdfPage).padStart(3, '0');
  const sourceRoot = path.join(pdfDir, sourceKey);
  const candidates = [
    path.join(sourceRoot, `text/page-${page}.txt`),
    path.join(sourceRoot, `ocr/page-${page}.txt`),
  ];

  for (const file of candidates) {
    try {
      const text = await fs.readFile(file, 'utf8');
      if (cleanSnippet(text)) {
        pageTextCache.set(cacheKey, text);
        return text;
      }
    } catch {
      // Optional OCR/text files are expected to be missing for some pages.
    }
  }

  pageTextCache.set(cacheKey, '');
  return '';
}

function pageContainsTerm(pageText, term) {
  const regex = termRegex(term);
  return Boolean(regex?.test(normalizeText(pageText)));
}

function buildMatchedTermsFromPage(pageText, review) {
  const matched = [];
  for (const alias of buildCodeAliases(review)) {
    if (pageContainsTerm(pageText, alias)) {
      matched.push({
        value: alias,
        type: alias === review.displayCode ? 'display_code' : 'code_alias',
        confidence: 0.9,
      });
    }
  }

  for (const name of [
    review.orientalNames?.pinyin,
    review.orientalNames?.english,
    review.names?.pinyin,
    review.names?.pt,
    review.atlasName,
  ]) {
    if (name && pageContainsTerm(pageText, name)) {
      matched.push({ value: name, type: 'name', confidence: 0.68 });
    }
  }

  return unique(matched.map(term => JSON.stringify(term))).map(item => JSON.parse(item));
}

async function buildFallbackLinksForReview(review, sourceMeta) {
  const source = sourceMeta.get('ednea-garcia-guia-ilustrado-referencia');
  if (!source?.pageCount) return [];

  const links = [];
  for (let pdfPage = 1; pdfPage <= source.pageCount; pdfPage += 1) {
    const pageText = await readPageText(source.key, pdfPage);
    if (!pageText) continue;
    const matchedTerms = buildMatchedTermsFromPage(pageText, review);
    if (!matchedTerms.length) continue;

    const hasName = matchedTerms.some(term => term.type === 'name');
    const hasCode = matchedTerms.some(term => term.type === 'display_code' || term.type === 'code_alias');
    if (!hasName && !hasCode) continue;

    links.push({
      id: `fallback:${review.code}:${source.key}:p${String(pdfPage).padStart(3, '0')}`,
      status: 'review',
      targetType: 'acupoint',
      code: review.code,
      displayCode: review.displayCode || review.code,
      title: review.title || `${review.code}`,
      source: {
        key: source.key,
        title: source.title,
        sourceType: source.sourceType,
        originalLanguage: source.originalLanguage,
      },
      page: {
        pdfPage,
        imageUrl: `/knowledge/source-assets/pdf-sources/${source.key}/pages/page-${String(pdfPage).padStart(3, '0')}.webp`,
        textFile: `text/page-${String(pdfPage).padStart(3, '0')}.txt`,
        ocrFile: '',
        languageHint: 'pt-BR',
      },
      snippet: bestSnippetFromPage(pageText, review, { matchedTerms }),
      matchedTerms,
      confidence: hasName && hasCode ? 0.9 : hasName ? 0.74 : 0.72,
      confidenceLabel: hasName && hasCode ? 'high' : 'medium',
      languagePolicy: {
        pointPageLanguage: 'pt-BR',
        originalLanguage: 'pt-BR',
        allowRawOriginalInPointPages: false,
        ptBrReviewed: false,
        pointPageEligibleAfterReview: true,
        requiresPtBrSynthesis: false,
        requiresProfessionalAudit: true,
      },
    });
  }
  return links;
}

function scoreLink({ link, pageText, review }) {
  const normalizedPage = normalizeText(pageText || link.snippet || '');
  const matchedTerms = link.matchedTerms || [];
  let score = Math.round((Number(link.confidence) || 0) * 100);

  if (PT_BR_SOURCE_KEYS.has(link.source?.key)) score += 20;
  if (link.source?.key === 'ednea-garcia-guia-ilustrado-referencia') score += 14;
  if (matchedTerms.some(term => term.type === 'name')) score += 30;
  if (matchedTerms.some(term => term.type === 'display_code')) score += 12;
  if (matchedTerms.some(term => term.type === 'code_alias')) score += 10;

  const compactPage = normalizedPage.replace(/[^a-z0-9]/g, '');
  const code = compactCode(review.displayCode || review.code).toLowerCase();
  const pinyin = normalizeText(review.orientalNames?.pinyin || review.names?.pinyin || '');

  if (code && compactPage.includes(code)) score += 14;
  if (pinyin && normalizedPage.includes(pinyin)) score += 18;

  const tableHits = TABLE_TERMS.filter(term => normalizedPage.includes(term)).length;
  score += Math.min(30, tableHits * 5);
  if (tableHits >= 4) score += 70;
  if (cleanSnippet(pageText).length < 1000 && tableHits < 3) score -= 70;

  const ownMeridianTerms = MERIDIAN_PAGE_TERMS[review.meridianCode] || [];
  const ownMeridianHit = ownMeridianTerms.some(term => normalizedPage.includes(term));
  if (ownMeridianHit) score += 42;

  const otherMeridianHit = Object.entries(MERIDIAN_PAGE_TERMS)
    .filter(([code]) => code !== review.meridianCode)
    .some(([, terms]) => terms.some(term => normalizedPage.includes(term)));
  if (otherMeridianHit && !ownMeridianHit) score -= 48;

  if (/\b(cun|depressao|face|regiao|linha|tendao|maleolo|intercostal|vertebra|metatarso|metodo|agulha|insercao)\b/i.test(normalizedPage)) {
    score += 16;
  }

  if (/\b(ponto\s+(shu|jing|ying|yuan|luo|he)|movimento|canal\s+(do|da)|caracteristicas)\b/i.test(normalizedPage)) {
    score += 10;
  }

  const candidateSnippet = cleanSnippet(bestSnippetFromPage(pageText, review, link));
  if (/associacoes\s+ilustrativas/i.test(normalizedPage) && tableHits < 2) score -= 22;
  if (/por\s+meio\s+do|podera\s+atingir|se\s+a\s+agulha\s+for\s+inserida/i.test(normalizeText(candidateSnippet))) score -= 58;
  if ((link.page?.pdfPage || 0) < 10 && tableHits < 3) score -= 60;
  if (link.languagePolicy?.requiresPtBrSynthesis) score -= 100;

  return score;
}

function formatSourceReference({ link, snippet, score, legacyRefs }) {
  const atlasRef = legacyRefs?.[0] || null;

  return {
    sourceKey: link.source.key,
    sourceTitle: link.source.title,
    originalLanguage: link.source.originalLanguage,
    sourceIngestionDate: '2026-06-06',
    sourceType: link.source.sourceType,
    pdfPage: link.page.pdfPage,
    printedPage: null,
    printedPageStatus: 'not_detected_in_ingested_pdf_text',
    atlasCrossReference: atlasRef ? {
      source: atlasRef.source,
      printedPages: atlasRef.page || [],
      pdfPages: atlasRef.pdfPage || [],
      note: atlasRef.note || '',
    } : null,
    imageUrl: link.page.imageUrl,
    textFile: link.page.textFile || '',
    ocrFile: link.page.ocrFile || '',
    confidence: link.confidenceLabel,
    confidenceScore: Number(link.confidence || 0),
    selectionScore: score,
    matchedTerms: (link.matchedTerms || []).map(term => ({
      value: term.value,
      type: term.type,
      confidence: term.confidence,
    })),
    snippet,
    requiresPtBrSynthesis: false,
    requiresProfessionalAudit: true,
    status: 'review',
  };
}

function makePrefillMetadata({ generatedAt, refs, links }) {
  return {
    status: 'pending_atlas_review',
    generatedAt,
    generatedFrom: 'prefill-medium-pdf-review-drafts.mjs',
    sourceIngestionDate: '2026-06-06',
    localOnly: true,
    publishesToBundle: false,
    approvalMode: 'none',
    requiresProfessionalAudit: true,
    confidence: 'medium',
    productionStatus: 'review_needed',
    fieldsPrefilled: [
      'sourceReferences',
      'locationText',
      'actions',
      'indications',
      'cautions',
      'techniques',
      'needling',
    ],
    ptBrSourceKeys: unique(refs.map(ref => ref.sourceKey)),
    sourceReferenceCount: refs.length,
    candidateLinkCount: links.length,
    primaryPdfPage: refs[0]?.pdfPage || null,
    primarySourceTitle: refs[0]?.sourceTitle || '',
    notes: [
      'Rascunho local criado para fila de confianca media da Biblioteca Viva.',
      'Campos clinicos vieram da curadoria profunda local e foram vinculados a evidencias dos PDFs pt-BR ingeridos em 2026-06-06.',
      'Nao e aprovacao profissional, nao migra para Supabase e nao entra no bundle principal.',
    ],
  };
}

function relativeForAudit(filePath) {
  return path.relative(root, filePath).replace(/\\/g, '/');
}

async function main() {
  const generatedAt = new Date().toISOString();
  const deepPayload = JSON.parse(await fs.readFile(deepPath, 'utf8'));
  const deepReviews = deepPayload.reviews || deepPayload;
  const sourceDraftsPayload = JSON.parse(await fs.readFile(sourceDraftsPath, 'utf8'));
  const sourceDrafts = sourceDraftsPayload.reviews || [];
  const linksPayload = JSON.parse(await fs.readFile(sourceLinksPath, 'utf8'));
  const allLinks = linksPayload.links || [];
  const sourceIndex = JSON.parse(await fs.readFile(sourceIndexPath, 'utf8'));
  const sourceMeta = new Map((sourceIndex.sources || []).map(source => [source.key, source]));

  const mediumReviews = deepReviews.filter(review => review.enrichment?.confidence === 'medium');
  const mediumCodes = new Set(mediumReviews.map(review => String(review.code).toUpperCase()));
  const linksByCode = new Map();

  for (const link of allLinks) {
    const code = String(link.code || '').toUpperCase();
    if (!mediumCodes.has(code)) continue;
    if (!PT_BR_SOURCE_KEYS.has(link.source?.key)) continue;
    if (link.languagePolicy?.requiresPtBrSynthesis) continue;
    if (!linksByCode.has(code)) linksByCode.set(code, []);
    linksByCode.get(code).push(link);
  }

  const auditItems = [];
  const enrichedByCode = new Map();

  for (const review of mediumReviews) {
    const code = String(review.code).toUpperCase();
    const links = linksByCode.get(code) || [];
    const fallbackLinks = await buildFallbackLinksForReview(review, sourceMeta);
    const seenLinkPages = new Set(links.map(link => `${link.source?.key}:${link.page?.pdfPage}`));
    for (const fallbackLink of fallbackLinks) {
      const key = `${fallbackLink.source?.key}:${fallbackLink.page?.pdfPage}`;
      if (seenLinkPages.has(key)) continue;
      seenLinkPages.add(key);
      links.push(fallbackLink);
    }
    const scored = [];

    for (const link of links) {
      const pageText = await readPageText(link.source.key, link.page.pdfPage);
      const score = scoreLink({ link, pageText, review });
      const snippet = bestSnippetFromPage(pageText, review, link).slice(0, 520);
      scored.push({ link, score, snippet });
    }

    scored.sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if ((right.link.confidence || 0) !== (left.link.confidence || 0)) {
        return (right.link.confidence || 0) - (left.link.confidence || 0);
      }
      return (left.link.page?.pdfPage || 0) - (right.link.page?.pdfPage || 0);
    });

    const refs = scored.slice(0, 6).map(item => formatSourceReference({
      link: item.link,
      snippet: item.snippet,
      score: item.score,
      legacyRefs: review.enrichment?.atlasReference || [],
    }));
    const prefill = makePrefillMetadata({ generatedAt, refs, links });
    const primarySourceTitle = refs[0]?.sourceTitle || review.source || 'Biblioteca Viva - PDFs pt-BR';

    const enriched = {
      ...review,
      status: 'pending_atlas_review',
      approvalMode: 'none',
      requiresProfessionalAudit: true,
      source: `${primarySourceTitle} + curadoria profunda local`,
      sourceReferences: refs,
      pdfSourceReferences: refs,
      pdfSourcePrefill: prefill,
      languagePolicy: {
        pointPageLanguage: 'pt-BR',
        allowRawOriginalInPointPages: false,
        ptBrReviewed: false,
        preliminaryPtBrTranslation: false,
        pointPageEligibleAfterReview: true,
        requiresPtBrSynthesis: false,
        requiresProfessionalAudit: true,
      },
      enrichment: {
        ...(review.enrichment || {}),
        confidence: 'medium',
        productionStatus: 'review_needed',
        pdfSourcePrefill: prefill,
        requiresProfessionalAudit: true,
      },
      clinicalNote: [
        review.clinicalNote,
        `Pre-preenchido localmente em ${generatedAt.slice(0, 10)} com PDFs pt-BR ingeridos em 2026-06-06; manter em pending_atlas_review e revisar profissionalmente antes de qualquer aprovacao/migracao.`,
      ].filter(Boolean).join(' '),
      updatedAt: generatedAt,
    };

    enrichedByCode.set(code, enriched);

    auditItems.push({
      code,
      displayCode: review.displayCode,
      statusBefore: review.status,
      statusAfter: enriched.status,
      sourceReferenceCount: refs.length,
      ptBrSources: unique(refs.map(ref => ref.sourceKey)),
      primary: refs[0] ? {
        sourceKey: refs[0].sourceKey,
        pdfPage: refs[0].pdfPage,
        printedPage: refs[0].printedPage,
        printedPageStatus: refs[0].printedPageStatus,
        atlasCrossReference: refs[0].atlasCrossReference,
        selectionScore: refs[0].selectionScore,
        matchedTerms: refs[0].matchedTerms,
        snippet: refs[0].snippet,
      } : null,
      fields: {
        locationText: Boolean(cleanSnippet(enriched.locationText)),
        actions: asArray(enriched.actions).length,
        indications: asArray(enriched.indications).length,
        cautions: asArray(enriched.cautions).length,
        techniques: asArray(enriched.techniques).length,
        needling: Boolean(cleanSnippet(enriched.needling)),
      },
      requiresProfessionalAudit: enriched.requiresProfessionalAudit === true,
    });
  }

  const nextDeepReviews = deepReviews.map(review => (
    enrichedByCode.get(String(review.code || '').toUpperCase()) || review
  ));
  const nextDeepPayload = Array.isArray(deepPayload)
    ? nextDeepReviews
    : {
        ...deepPayload,
        generatedAt,
        counts: {
          ...(deepPayload.counts || {}),
          mediumConfidencePdfPrefilled: enrichedByCode.size,
        },
        reviews: nextDeepReviews,
      };

  const nextSourceDrafts = sourceDrafts.map(draft => {
    const enriched = enrichedByCode.get(String(draft.code || '').toUpperCase());
    if (!enriched) return draft;

    const refs = enriched.pdfSourceReferences || [];
    return {
      ...draft,
      status: 'pending_atlas_review',
      approvalMode: 'none',
      requiresProfessionalAudit: true,
      source: 'Biblioteca Viva - PDFs pt-BR 2026-06-06 + curadoria profunda local',
      title: enriched.title || draft.title,
      meridianCode: enriched.meridianCode || draft.meridianCode,
      meridian: enriched.meridian || draft.meridian,
      locationText: enriched.locationText,
      actions: asArray(enriched.actions),
      indications: asArray(enriched.indications),
      cautions: asArray(enriched.cautions),
      relatedPatterns: asArray(enriched.relatedPatterns),
      techniques: asArray(enriched.techniques),
      needling: enriched.needling,
      clinicalNote: enriched.clinicalNote,
      sourceReferences: refs,
      pdfSourceReferences: refs,
      pdfSourcePrefill: enriched.pdfSourcePrefill,
      languagePolicy: enriched.languagePolicy,
      updatedAt: generatedAt,
    };
  });

  const nextSourceDraftsPayload = {
    ...sourceDraftsPayload,
    generatedAt,
    counts: {
      ...(sourceDraftsPayload.counts || {}),
      mediumConfidencePdfPrefilled: enrichedByCode.size,
      automaticClinicalApprovals: 0,
    },
    policy: {
      ...(sourceDraftsPayload.policy || {}),
      mediumConfidencePrefill: 'local_only_pending_atlas_review_requires_professional_audit',
      sourceIngestionDate: '2026-06-06',
    },
    reviews: nextSourceDrafts,
  };

  const audit = {
    schemaVersion: 'medium-confidence-pdf-prefill-audit.v1',
    generatedAt,
    sourceIngestionDate: '2026-06-06',
    status: 'local_only_review_queue_prefill',
    approvalMode: 'none',
    requiresProfessionalAudit: true,
    publishesToBundle: false,
    inputs: {
      deepCuratedReviews: relativeForAudit(deepPath),
      sourceReviewDrafts: relativeForAudit(sourceDraftsPath),
      sourceCandidateLinks: relativeForAudit(sourceLinksPath),
      sourceIndex: relativeForAudit(sourceIndexPath),
    },
    eligiblePtBrSources: [...PT_BR_SOURCE_KEYS].map(key => {
      const source = sourceMeta.get(key) || {};
      return {
        key,
        title: source.title || key,
        originalLanguage: source.originalLanguage || 'pt-BR',
        pageCount: source.pageCount || null,
        pointPageEligibleAfterReview: source.policy?.pointPageEligibleAfterReview !== false,
      };
    }),
    counts: {
      requestedMediumQueue: 90,
      mediumFound: mediumReviews.length,
      prefilled: enrichedByCode.size,
      missingPtBrEvidence: auditItems.filter(item => !item.sourceReferenceCount).map(item => item.code),
      withLocationPtBr: auditItems.filter(item => item.fields.locationText).length,
      withActions: auditItems.filter(item => item.fields.actions > 0).length,
      withIndications: auditItems.filter(item => item.fields.indications > 0).length,
      withCautions: auditItems.filter(item => item.fields.cautions > 0).length,
      withTechniques: auditItems.filter(item => item.fields.techniques > 0).length,
      withNeedling: auditItems.filter(item => item.fields.needling).length,
      requiresProfessionalAuditTrue: auditItems.filter(item => item.requiresProfessionalAudit).length,
    },
    items: auditItems,
  };

  await fs.writeFile(deepPath, `${JSON.stringify(nextDeepPayload, null, 2)}\n`, 'utf8');
  await fs.writeFile(sourceDraftsPath, `${JSON.stringify(nextSourceDraftsPayload, null, 2)}\n`, 'utf8');
  await fs.writeFile(auditPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');

  return {
    generatedAt,
    mediumFound: mediumReviews.length,
    prefilled: enrichedByCode.size,
    deepPath: relativeForAudit(deepPath),
    sourceDraftsPath: relativeForAudit(sourceDraftsPath),
    auditPath: relativeForAudit(auditPath),
    missingPtBrEvidence: audit.counts.missingPtBrEvidence,
  };
}

main()
  .then(result => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
