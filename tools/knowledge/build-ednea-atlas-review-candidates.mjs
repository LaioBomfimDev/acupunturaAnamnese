import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');

const INPUT_REVIEWS = path.join(projectRoot, 'docs', 'km-agent-review-inputs.json');
const INPUT_ATLAS = path.join(projectRoot, 'docs', 'ednea-atlas-pages.json');
const OUTPUT_CANDIDATES = path.join(projectRoot, 'docs', 'km-agent-ednea-production-candidates.json');
const OUTPUT_LOCAL_REVIEWS = path.join(projectRoot, 'docs', 'km-agent-ednea-local-reviews.json');
const OUTPUT_SUMMARY = path.join(projectRoot, 'docs', 'km-agent-ednea-production-summary.md');

const ATLAS_SOURCE = {
  source: 'Atlas da Ednea Martins',
  title: 'Atlas dos Pontos de Acupuntura: Guia de Localizacao',
  sourceKey: 'atlas-ednea-martins',
};

const STANDARD_MERIDIANS = {
  LU: { atlasPrefix: 'P', printedStart: 52, count: 11, meridian: 'Pulmao' },
  LI: { atlasPrefix: 'IG', printedStart: 80, count: 20, meridian: 'Intestino Grosso' },
  ST: { atlasPrefix: 'E', printedStart: 128, count: 45, meridian: 'Estomago' },
  SP: { atlasPrefix: 'Ba', printedStart: 224, count: 21, meridian: 'Baco' },
  HT: { atlasPrefix: 'C', printedStart: 272, count: 9, meridian: 'Coracao' },
  SI: { atlasPrefix: 'ID', printedStart: 296, count: 19, meridian: 'Intestino Delgado' },
  BL: { atlasPrefix: 'B', printedStart: 340, count: 67, meridian: 'Bexiga' },
  KI: { atlasPrefix: 'R', printedStart: 480, count: 27, meridian: 'Rim' },
  PC: { atlasPrefix: 'Pc', printedStart: 540, count: 9, meridian: 'Pericardio' },
  TE: { atlasPrefix: 'SJ', printedStart: 564, count: 23, meridian: 'Triplo Aquecedor' },
  GB: { atlasPrefix: 'VB', printedStart: 618, count: 44, meridian: 'Vesicula Biliar' },
  LR: { atlasPrefix: 'F', printedStart: 712, count: 14, meridian: 'Figado' },
  CV: { atlasPrefix: 'Ren', printedStart: 744, count: 24, meridian: 'Vaso Concepcao' },
  GV: { atlasPrefix: 'Du', printedStart: 796, count: 28, meridian: 'Vaso Governador' },
};

const PDF_PAGE_OFFSET = 17;

function normalizeSpaces(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.;,:])/g, '$1')
    .replace(/\s+-\s+/g, ' - ')
    .trim();
}

function splitList(text) {
  return normalizeSpaces(text)
    .split(/[;•]\s*/)
    .map(value => normalizeSpaces(value))
    .filter(value => value && value.length > 1);
}

function cleanSection(text) {
  return normalizeSpaces(text)
    .replace(/^\/?\s*Loca[\p{L}\d\s/.,-]{0,24}?(?:ção|cao|çã-0|fão|afão)\s*/iu, '')
    .replace(/^\/?\s*Loca\s*/i, '')
    .replace(/^N\s*o?\s*t\s*a\s+de\s+loca[\p{L}\d\s/.,-]{0,28}(?:ção|cao|wç\s*ão|ali\s*wç\s*ão)?\s*/iu, '')
    .replace(/^M\s*[eé]\s*t\s*o\s*d\s*o\s*/i, '')
    .replace(/^Fun[\p{L}\d\sçõõeéêí]{0,28}energ[\p{L}\d\séêí]{0,16}\s*/iu, '')
    .replace(/^[Il1]\s*n\s*d\s*i\s*c[\p{L}\d\sçõôóãáéêí]{0,22}\s*/iu, '')
    .replace(/^E\s*x[\p{L}\d\s/()]{0,28}\s+de\s+c\s*o\s*m\s*b\s*i\s*n\s*a[\p{L}\d\sçõôóãáéêí]{0,16}\s*/iu, '')
    .replace(/APOSTILASMEDICINA@HOTMAIL\.COM.*$/i, '')
    .trim();
}

function findIndex(text, patterns, fromIndex = 0) {
  const slice = text.slice(fromIndex);
  for (const pattern of patterns) {
    const match = slice.match(pattern);
    if (match?.index !== undefined) {
      return {
        index: fromIndex + match.index,
        end: fromIndex + match.index + match[0].length,
        match: match[0],
      };
    }
  }
  return null;
}

function partBetween(text, startMatch, endMatches) {
  if (!startMatch) return '';
  let endIndex = text.length;
  for (const candidate of endMatches.filter(Boolean)) {
    if (candidate.index > startMatch.end && candidate.index < endIndex) {
      endIndex = candidate.index;
    }
  }
  return cleanSection(text.slice(startMatch.end, endIndex));
}

function getAtlasMeta(code) {
  const match = String(code || '').match(/^([A-Z]+)(\d+)$/);
  if (!match) return null;
  const [, meridianCode, rawNumber] = match;
  const config = STANDARD_MERIDIANS[meridianCode];
  if (!config) return null;
  const number = Number(rawNumber);
  if (!number || number > config.count) return null;
  const printedStart = config.printedStart + ((number - 1) * 2);
  const atlasCode = `${config.atlasPrefix}-${number}`;
  return {
    ...config,
    code,
    number,
    atlasCode,
    printedPages: [printedStart, printedStart + 1],
    pdfPages: [printedStart + PDF_PAGE_OFFSET, printedStart + PDF_PAGE_OFFSET + 1],
  };
}

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseTitle(sectionText, atlasCode, fallbackTitle) {
  const [prefix, number] = atlasCode.split('-');
  const titlePattern = new RegExp(`${escapeRegex(prefix)}\\s*-\\s*${escapeRegex(number)}\\s*\\(([^)]+)\\)\\s*-\\s*([^•\\n]+?)(?:\\s*•|\\s{2,}|$)`, 'i');
  const match = sectionText.match(titlePattern);
  if (!match) {
    return {
      title: fallbackTitle,
      pinyin: '',
      portugueseName: '',
    };
  }
  const pinyin = normalizeSpaces(match[1]);
  const portugueseName = normalizeSpaces(match[2]).replace(/\s+p\s*$/i, '');
  return {
    title: `${atlasCode} (${pinyin}) - ${portugueseName}`,
    pinyin,
    portugueseName,
  };
}

function parseCharacteristics(sectionText, title) {
  const titleIndex = sectionText.indexOf(title.split(' - ')[0]);
  const location = findIndex(sectionText, [/Loca/i], titleIndex >= 0 ? titleIndex : 0);
  const beforeLocation = location ? sectionText.slice(titleIndex >= 0 ? titleIndex : 0, location.index) : sectionText.slice(0, 700);
  return splitList(beforeLocation)
    .filter(item => /Ponto|Movimento|Importante|Comando|Estrela|Fonte|Conex/i.test(item))
    .map(item => item.replace(/^.*?\)\s*-\s*[^•]+/, '').trim())
    .filter(Boolean)
    .slice(0, 8);
}

function parseFields(sectionText) {
  const location = findIndex(sectionText, [
    /Loca[\p{L}\d\s/.,-]{0,24}?(?:ção|cao|çã-0|fão|afão)/iu,
    /Loca/i,
  ]);
  const note = findIndex(sectionText, [/N\s*o?\s*t\s*a\s+de\s+loca/i], location?.end || 0);
  const method = findIndex(sectionText, [/M\s*[eé]\s*t\s*o\s*d\s*o/i], location?.end || 0);
  const functions = findIndex(
    sectionText,
    [/Fun[\p{L}\d\sçõõeéêí]{0,28}energ[\p{L}\d\séêí]{0,16}/iu],
    method?.end || 0,
  );
  const indications = findIndex(
    sectionText,
    [/[Il1]\s*n\s*d\s*i\s*c[\p{L}\d\sçõôóãáéêí]{0,22}/iu],
    functions?.end || 0,
  );
  const examples = findIndex(
    sectionText,
    [/E\s*x[\p{L}\d\s/()]{0,28}\s+de\s+c\s*o\s*m\s*b\s*i\s*n\s*a/iu],
    indications?.end || 0,
  );

  const locationText = partBetween(sectionText, location, [note, method]);
  const methodText = partBetween(sectionText, method, [functions, indications, examples]);
  const actionsText = partBetween(sectionText, functions, [indications, examples]);
  const indicationsText = partBetween(sectionText, indications, [examples]);
  const noteText = partBetween(sectionText, note, [method, functions, indications, examples]);

  return {
    locationText,
    methodText,
    actions: splitList(actionsText),
    indications: splitList(indicationsText),
    noteText,
  };
}

function extractCautions(sectionText, locationText, methodText) {
  const text = normalizeSpaces(sectionText);
  const candidates = [];
  const explicitPatterns = [
    /Sua aplicação é proibida em grávidas\./i,
    /aplica\S*\s+proibida\s+em\s+grávidas\./i,
    /evitar[^.]{0,120}\./i,
    /precau\S+[^.]{0,140}\./i,
    /cuidado[^.]{0,140}\./i,
  ];

  for (const pattern of explicitPatterns) {
    const match = text.match(pattern);
    if (match) candidates.push(normalizeSpaces(match[0]));
  }

  const anatomyText = `${locationText} ${methodText}`.toLowerCase();
  if (/(tórax|torax|intercostal|supraclavicular|costela|peitoral|pulmão|pulmao)/i.test(anatomyText)) {
    candidates.push('Revisar profundidade e direcao da agulha pela proximidade da cavidade toracica; evitar insercao profunda.');
  }
  if (/(abdome|abdominal|umbigo|hipogastr|epigastr|pub)/i.test(anatomyText)) {
    candidates.push('Revisar profundidade e indicacao em regiao abdominal; avaliar gestacao e condicoes locais.');
  }
  if (/(artéria|arteria|veia|vascularizada)/i.test(text)) {
    candidates.push('Atencao a vasos locais descritos no Atlas.');
  }

  return [...new Set(candidates)].slice(0, 4);
}

function getSectionText(atlasPages, pdfPages) {
  return pdfPages
    .map(page => atlasPages[page - 1]?.text || '')
    .filter(Boolean)
    .join(' ');
}

function makeReview(item, atlasPages) {
  const review = item.reviewInputs || {};
  const meta = getAtlasMeta(review.code);

  if (!meta) {
    return {
      sourceDraftId: item.sourceDraftId,
      code: review.code,
      status: 'review_needed',
      reason: 'Ponto sem mapeamento direto para os 14 canais principais no Atlas.',
      reviewInputs: review,
      references: [],
      confidence: 'low',
      requiresHumanReview: true,
    };
  }

  const sectionText = getSectionText(atlasPages, meta.pdfPages);
  const titleInfo = parseTitle(sectionText, meta.atlasCode, review.title);
  const fields = parseFields(sectionText);
  const relatedPatterns = parseCharacteristics(sectionText, titleInfo.title);
  const cautions = extractCautions(sectionText, fields.locationText, fields.methodText);
  const completeFields = [
    fields.locationText,
    fields.methodText,
    fields.actions.length,
    fields.indications.length,
  ].filter(Boolean).length;

  const confidence = completeFields >= 4 ? 'high' : completeFields >= 2 ? 'medium' : 'low';
  const productionStatus = confidence === 'high' ? 'atlas_referenced_candidate' : 'review_needed';
  const printedReference = meta.printedPages[0] === meta.printedPages[1]
    ? `p. ${meta.printedPages[0]}`
    : `p. ${meta.printedPages[0]}-${meta.printedPages[1]}`;

  const reviewInputs = {
    ...review,
    title: titleInfo.title,
    meridianCode: review.meridianCode,
    meridian: review.meridian || meta.meridian,
    techniques: 'agulha, moxa, ventosa',
    locationText: fields.locationText || review.locationText || '',
    actions: fields.actions.join(', '),
    indications: fields.indications.join(', '),
    cautions: cautions.join(', '),
    relatedPatterns: relatedPatterns.join(', '),
    needling: fields.methodText || review.needling || '',
    clinicalNote: [
      `Fonte primaria: ${ATLAS_SOURCE.title}, ${printedReference}.`,
      fields.noteText ? `Nota de localizacao: ${fields.noteText}` : '',
      confidence !== 'high' ? 'Revisao humana obrigatoria: extracao automatica incompleta ou ruidosa.' : '',
    ].filter(Boolean).join(' '),
  };

  return {
    sourceDraftId: item.sourceDraftId,
    code: review.code,
    atlasCode: meta.atlasCode,
    status: productionStatus,
    reviewInputs,
    atlas: {
      ...ATLAS_SOURCE,
      printedPages: meta.printedPages,
      pdfPages: meta.pdfPages,
      reference: printedReference,
      title: titleInfo.title,
      pinyin: titleInfo.pinyin,
      portugueseName: titleInfo.portugueseName,
      sectionText,
    },
    parsed: fields,
    references: [
      {
        field: 'all',
        source: ATLAS_SOURCE.source,
        page: meta.printedPages,
        pdfPage: meta.pdfPages,
        note: printedReference,
      },
    ],
    confidence,
    requiresHumanReview: true,
  };
}

function toLocalReview(candidate) {
  const inputs = candidate.reviewInputs || {};
  return {
    id: `ednea-${inputs.code || candidate.sourceDraftId}`,
    status: candidate.status === 'atlas_referenced_candidate' ? 'review' : 'draft',
    type: 'acupoint',
    sourceDraftId: candidate.sourceDraftId,
    code: inputs.code || '',
    displayCode: inputs.displayCode || inputs.code || '',
    title: inputs.title || '',
    meridianCode: inputs.meridianCode || '',
    meridian: inputs.meridian || '',
    locationText: inputs.locationText || '',
    actions: splitList(inputs.actions || ''),
    indications: splitList(inputs.indications || ''),
    cautions: splitList(inputs.cautions || ''),
    relatedPatterns: splitList(inputs.relatedPatterns || ''),
    techniques: splitList(inputs.techniques || ''),
    needling: inputs.needling || '',
    clinicalNote: inputs.clinicalNote || '',
    source: ATLAS_SOURCE.title,
    enrichment: {
      atlasReference: candidate.references || [],
      confidence: candidate.confidence,
      productionStatus: candidate.status,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function summaryMarkdown(candidates) {
  const counts = candidates.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    acc[`confidence_${item.confidence}`] = (acc[`confidence_${item.confidence}`] || 0) + 1;
    return acc;
  }, {});
  const standard = candidates.filter(item => item.atlasCode).length;
  const extras = candidates.length - standard;
  const highByMeridian = {};
  for (const item of candidates) {
    const key = item.reviewInputs?.meridianCode || 'sem_meridiano';
    if (!highByMeridian[key]) highByMeridian[key] = { total: 0, high: 0, reviewNeeded: 0 };
    highByMeridian[key].total += 1;
    if (item.confidence === 'high') highByMeridian[key].high += 1;
    if (item.status === 'review_needed') highByMeridian[key].reviewNeeded += 1;
  }

  return `# KM-Agent + Atlas Ednea - resumo de producao

Fonte primaria usada: ${ATLAS_SOURCE.title}

## Resultado

- Total de rascunhos KM-Agent: ${candidates.length}
- Pontos dos 14 canais mapeados no Atlas: ${standard}
- Pontos extras/SA/AA sem mapeamento automatico: ${extras}
- Candidatos referenciados pelo Atlas: ${counts.atlas_referenced_candidate || 0}
- Itens ainda em revisao: ${counts.review_needed || 0}
- Confianca alta: ${counts.confidence_high || 0}
- Confianca media: ${counts.confidence_medium || 0}
- Confianca baixa: ${counts.confidence_low || 0}

## Por meridiano

${Object.entries(highByMeridian)
  .map(([key, value]) => `- ${key}: ${value.high}/${value.total} com confianca alta; ${value.reviewNeeded} ainda em revisao.`)
  .join('\n')}

## Arquivos gerados

- \`docs/km-agent-ednea-production-candidates.json\`: candidatos completos com texto do Atlas e referencias.
- \`docs/km-agent-ednea-local-reviews.json\`: formato proximo ao export de revisoes locais da tela.
- \`docs/ednea-atlas-pages.json\`: extracao paginada do PDF.

## Observacao clinica

Os itens com \`atlas_referenced_candidate\` tem fonte e pagina, mas permanecem com \`requiresHumanReview: true\`. A promocao final para \`approved\` deve ocorrer apenas apos revisao profissional ou criterio explicito do SuperAdm.
`;
}

const [reviewPayload, atlasPayload] = await Promise.all([
  fs.readFile(INPUT_REVIEWS, 'utf8').then(JSON.parse),
  fs.readFile(INPUT_ATLAS, 'utf8').then(JSON.parse),
]);

const atlasPages = atlasPayload.pages || [];
const candidates = reviewPayload.items.map(item => makeReview(item, atlasPages));
const localReviews = candidates.map(toLocalReview);

await fs.writeFile(OUTPUT_CANDIDATES, `${JSON.stringify({
  schemaVersion: 'km-agent-ednea-production-candidates.v1',
  generatedAt: new Date().toISOString(),
  source: ATLAS_SOURCE,
  candidates,
}, null, 2)}\n`, 'utf8');
await fs.writeFile(OUTPUT_LOCAL_REVIEWS, `${JSON.stringify(localReviews, null, 2)}\n`, 'utf8');
await fs.writeFile(OUTPUT_SUMMARY, summaryMarkdown(candidates), 'utf8');

console.log(`Wrote ${candidates.length} candidates to ${OUTPUT_CANDIDATES}`);
console.log(`Wrote local review export to ${OUTPUT_LOCAL_REVIEWS}`);
console.log(`Wrote summary to ${OUTPUT_SUMMARY}`);
