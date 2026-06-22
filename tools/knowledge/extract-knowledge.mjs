import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { checklists } from '../../frontend/src/data/checklists.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');

const defaultPdfRoot = path.join(projectRoot, 'frontend', '.local-source-assets', 'pdf-sources');
const defaultIndexPath = path.join(defaultPdfRoot, 'source-index.local.json');
const defaultCatalogPath = path.join(defaultPdfRoot, 'source-catalog.local.json');
const defaultKnowledgeRoot = path.join(defaultPdfRoot, 'knowledge');
const defaultSummaryPath = path.join(projectRoot, 'docs', `pdf-source-learning-${new Date().toISOString().slice(0, 10)}-anamnese.md`);
const knowledgeBasePath = path.join(projectRoot, 'frontend', 'src', 'knowledge', 'knowledgeBase.js');

const GENERATED_FROM = 'extract-knowledge.mjs';
const STATUS_REVIEW = 'review';

const SOURCE_TIERS = new Map([
  ['semiologia-da-lingua-completo', 'A'],
  ['classico-81-dificuldades-ebramec', 'B'],
  ['diagnostico-medicina-chinesa-auteroche', 'B'],
  ['combinacoes-pontos-acupuntura-jeremy-ross', 'B'],
  ['microssistema-lingua', 'C'],
  ['atlas-guia-pratico-acupuntura-folcks', 'C'],
  ['atlas-acupuntura-chinesa-meridianos-colaterais-auteroche', 'C'],
]);

const TIER_C_REASONS = new Map([
  ['microssistema-lingua', 'fonte visual/imagem; adiada para visao-OCR'],
  ['atlas-guia-pratico-acupuntura-folcks', 'OCR ruidoso; fonte visual pendente'],
  ['atlas-acupuntura-chinesa-meridianos-colaterais-auteroche', 'OCR ruidoso; fonte visual pendente'],
]);

const CHECKLIST_GROUP_PRIORITY = [
  'lingua',
  'regioesLingua',
  'digestao',
  'sono',
  'dor',
  'clima',
  'emocoes',
  'fezes',
  'oito',
  'substancias',
  'sintomas',
  'queixaEstruturada',
  'historico',
  'gineco',
  'seguranca',
  'objetivos',
  'substanciasUso',
];

const TONGUE_TRIGGER_TERMS = [
  ['Pálida', /\b(p[aá]lida|branco-clara|clara)\b/iu],
  ['Vermelha', /\b(vermelha|vermelho-viva|vermelho-escura|vermelho-clara|avermelhada)\b/iu],
  ['Vermelho intenso', /\b(vermelho-viva|vermelho-escura|vermelho intenso)\b/iu],
  ['Arroxeada', /\b(arroxeada|roxa|roxo|roxo-azulada|roxo-clara|viol[aá]cea)\b/iu],
  ['Inchada', /\b(inchada|edemaciada|tamanho aumentado|aumentada)\b/iu],
  ['Fina', /\b(fina|magra|atrofiada|tamanho reduzido)\b/iu],
  ['Marcas de dentes', /\b(facetas dent[aá]rias|roda dentada|marcas de dentes)\b/iu],
  ['Rachaduras', /\b(rachaduras|fissuras|fissurada)\b/iu],
  ['Petéquias', /\b(pet[eé]quia|pet[eé]quias|mancha hemorr[aá]gica|co[aá]gulos sangu[iíí]neos?)\b/iu],
  ['Pontos vermelhos', /\b(pontos vermelhos?)\b/iu],
  ['Saburra branca', /\bsaburra\b[\s\S]{0,120}\b(branca|clara|esbranqui[cç]ada)\b/iu],
  ['Saburra amarela', /\bsaburra\b[\s\S]{0,120}\b(amarela|amarelada|amarelo-clara|amarelo-acinzentada)\b/iu],
  ['Saburra espessa', /\bsaburra\b[\s\S]{0,120}\b(espessa|grossa)\b/iu],
  ['Saburra gordurosa', /\bsaburra\b[\s\S]{0,120}\b(gordurosa|pegajosa|turva|aspecto sujo|bolorenta)\b/iu],
  ['Sem saburra', /\b(sem saburra|descamada|destacada|sem revestimento)\b/iu],
  ['Ressecada', /\b(ressecada|seca)\b/iu],
  ['Úmida', /\b([úu]mida|escorregadia|molhada)\b/iu],
  ['Tremor', /\b(tremor|tr[eê]mula)\b/iu],
  ['Desvio', /\b(desvio|desviada)\b/iu],
];

const SABURRA_TRAITS = [
  ['branca', /\b(branca|clara|esbranqui[cç]ada)\b/iu],
  ['amarela', /\b(amarela|amarelada|amarelo-clara|amarelo-acinzentada)\b/iu],
  ['preta', /\b(preta|negra|negro)\b/iu],
  ['cinza', /\b(cinza|acinzentada)\b/iu],
  ['fina', /\b(fina|transparente)\b/iu],
  ['espessa', /\b(espessa|grossa)\b/iu],
  ['pegajosa', /\b(pegajosa|turva|gordurosa|aspecto sujo|bolorenta)\b/iu],
  ['escorregadia', /\b(escorregadia)\b/iu],
  ['seca', /\b(seca|ressecada)\b/iu],
  ['úmida', /\b([úu]mida|brilhante)\b/iu],
  ['destacada', /\b(descamada|destacada|sem raiz)\b/iu],
];

const BODY_TRAITS = [
  ['pálida', /\b(p[aá]lida|branco-clara|clara)\b/iu],
  ['vermelha', /\b(vermelha|vermelho-viva|vermelho-escura|vermelho-clara|avermelhada)\b/iu],
  ['arroxeada', /\b(arroxeada|roxa|roxo|roxo-azulada|roxo-clara)\b/iu],
  ['inchada', /\b(inchada|edemaciada|tamanho aumentado|aumentada)\b/iu],
  ['fina', /\b(fina|magra|atrofiada|tamanho reduzido)\b/iu],
  ['com marcas de dentes', /\b(facetas dent[aá]rias|roda dentada|marcas de dentes)\b/iu],
  ['com fissuras', /\b(fissuras|rachaduras)\b/iu],
  ['com petéquias', /\b(pet[eé]quia|pet[eé]quias|mancha hemorr[aá]gica)\b/iu],
  ['com pontos vermelhos', /\b(pontos vermelhos?)\b/iu],
  ['úmida', /\b([úu]mida|brilhante|vi[cç]osa)\b/iu],
  ['seca', /\b(seca|ressecada)\b/iu],
  ['com desvio', /\b(desvio|desviada)\b/iu],
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
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCompact(text) {
  return normalizeSearchText(text).replace(/\s+/g, '');
}

function slugify(text, fallback = 'item') {
  const slug = normalizeSearchText(text)
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
}

function cleanSpaces(text) {
  return String(text || '')
    .replace(/\u0000/g, '')
    .replace(/\u00ad/g, '')
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizePdfText(text) {
  return cleanSpaces(String(text || '')
    .replace(/\uFB00/g, 'ff')
    .replace(/\uFB01/g, 'fi')
    .replace(/\uFB02/g, 'fl')
    .replace(/\uFB03/g, 'ffi')
    .replace(/\uFB04/g, 'ffl')
    .replace(/-\s*\n\s*/g, '')
    .replace(/\s*\n\s*/g, ' '));
}

function titleCaseFirst(text) {
  const value = cleanSpaces(text);
  if (!value) return value;
  return value.charAt(0).toLocaleUpperCase('pt-BR') + value.slice(1);
}

function cleanDiagnosisText(text) {
  const value = cleanSpaces(text);
  if (!value) return '';
  if (/^Neste exemplo\b/iu.test(value)) {
    return cleanSpaces(value.replace(/^Neste exemplo,?\s*(?:[oa]\s+paciente\s+)?(?:apresenta|apresentou)?\s*/iu, ''));
  }
  return cleanSpaces(value.replace(/\.\s*Neste exemplo\b[\s\S]*$/iu, ''));
}

function uniqueByNormalized(items) {
  const seen = new Set();
  const unique = [];
  for (const item of items) {
    const value = cleanSpaces(item);
    if (!value) continue;
    const key = normalizeSearchText(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(value);
  }
  return unique;
}

function truncateText(text, maxLength = 520) {
  const value = cleanSpaces(text);
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trim()}…`;
}

function padPage(number) {
  return String(Number(number || 0)).padStart(3, '0');
}

function pathExists(filePath) {
  return Boolean(filePath && fsSync.existsSync(filePath));
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function readOptionalJson(filePath, fallback) {
  if (!pathExists(filePath)) return fallback;
  return readJson(filePath);
}

async function readOptionalText(filePath) {
  if (!pathExists(filePath)) return '';
  return fs.readFile(filePath, 'utf8');
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function envelope(schemaVersion, policy, items) {
  return {
    schemaVersion,
    generatedAt: new Date().toISOString(),
    policy,
    counts: {
      items: items.length,
      review: items.filter(item => item.status === STATUS_REVIEW).length,
      requiresProfessionalAudit: items.filter(item => item.requiresProfessionalAudit !== false).length,
    },
    items,
  };
}

function sourceRootFor(pdfRoot, sourceKey) {
  return path.join(pdfRoot, sourceKey);
}

function pageTextPath(sourceRoot, page) {
  const extractionFile = page?.extraction?.file;
  if (extractionFile) return path.join(sourceRoot, extractionFile);
  const ocrFile = page?.ocr?.file;
  if (ocrFile) return path.join(sourceRoot, ocrFile);
  if (page?.pageNumber) return path.join(sourceRoot, 'text', `page-${padPage(page.pageNumber)}.txt`);
  return null;
}

function pageImageExists(sourceRoot, page) {
  const imageFile = page?.image?.file;
  if (!imageFile) return false;
  return pathExists(path.join(sourceRoot, imageFile));
}

function pageImageUrl(source, page) {
  return page?.image?.publicUrl
    || `/knowledge/source-assets/pdf-sources/${source.key}/pages/page-${padPage(page?.pageNumber)}.webp`;
}

function findSection(text, startRegex, endRegexes) {
  const source = String(text || '');
  const startMatch = startRegex.exec(source);
  if (!startMatch) return '';
  const rest = source.slice(startMatch.index + startMatch[0].length);
  let endIndex = rest.length;
  for (const endRegex of endRegexes) {
    const endMatch = endRegex.exec(rest);
    if (endMatch && endMatch.index < endIndex) {
      endIndex = endMatch.index;
    }
  }
  return cleanSpaces(rest.slice(0, endIndex));
}

function firstBoundaryIndex(text, regexes) {
  let boundary = -1;
  for (const regex of regexes) {
    const match = regex.exec(text);
    if (!match) continue;
    if (match.index <= 0) continue;
    if (boundary === -1 || match.index < boundary) boundary = match.index;
  }
  return boundary;
}

export function parseSemiologyTongueCasePage(rawText, pageNumber = null) {
  const text = normalizePdfText(rawText);
  const headerMatch = /^\s*L[ÍIíi]NG(?:U|UI)A\s+(\d{1,3})\s+/iu.exec(text);
  if (!headerMatch) return null;

  const caseNumber = Number(headerMatch[1]);
  const afterHeader = text.slice(headerMatch[0].length);
  const titleBoundary = firstBoundaryIndex(afterHeader, [
    /\s+ASPECTO\s+LINGUAL\b/iu,
    /\s+L[íi]ngua\s*[:\-–]\s*/iu,
    /\s+Saburra\s*[:\-–]\s*/iu,
    /\s+Principais\s+etiopatogeni(?:as|a)\s*[:\-–]?/iu,
    /\s+Diagn[oó]sticos?\s*:/iu,
  ]);
  const titleText = titleBoundary === -1 ? afterHeader : afterHeader.slice(0, titleBoundary);
  const label = titleCaseFirst(titleText.replace(/[.:-]+$/g, ''));

  const afterTitle = titleBoundary === -1 ? afterHeader : afterHeader.slice(titleBoundary);
  const aspect = findSection(afterTitle, /ASPECTO\s+LINGUAL\s*:?\s*/iu, [
    /\bSaburra\s*[:\-–]\s*/iu,
    /\bPrincipais\s+etiopatogeni(?:as|a)\s*[:\-–]?/iu,
    /\bDiagn[oó]sticos?\s*:/iu,
  ]) || findSection(afterTitle, /L[íi]ngua\s*[:\-–]\s*/iu, [
    /\bSaburra\s*[:\-–]\s*/iu,
    /\bPrincipais\s+etiopatogeni(?:as|a)\s*[:\-–]?/iu,
    /\bDiagn[oó]sticos?\s*:/iu,
  ]);

  const coating = findSection(text, /\bSaburra\s*[:\-–]\s*/iu, [
    /\bPrincipais\s+etiopatogeni(?:as|a)\s*[:\-–]?/iu,
    /\bDiagn[oó]sticos?\s*:/iu,
  ]);
  const etiopathogenesis = findSection(text, /\bPrincipais\s+etiopatogeni(?:as|a)\s*[:\-–]?\s*/iu, [
    /\bDiagn[oó]sticos?\s*:/iu,
  ]);
  const diagnosis = cleanDiagnosisText(findSection(text, /\bDiagn[oó]sticos?\s*:\s*/iu, [
    /\bComumente\s+vista\b/iu,
    /_{5,}/u,
  ]));
  const commonClinicalExamples = findSection(text, /\bComumente\s+vista\s+em\s+casos\s+de\s*/iu, [
    /\bL[ÍIíi]NGUA\s+\d{1,3}\b/iu,
    /_{5,}/u,
  ]);

  if (!label || !diagnosis) return null;

  return {
    caseNumber,
    pageNumber,
    label,
    aspect,
    coating,
    etiopathogenesis,
    diagnosis,
    commonClinicalExamples,
    rawText: text,
  };
}

function splitClinicalPhrases(text) {
  const normalized = cleanSpaces(text)
    .replace(/\be\s+etc\.?$/iu, '')
    .replace(/\betc\.?$/iu, '');

  return uniqueByNormalized(normalized
    .split(/\s*(?:,|;|\.\s+)\s*/u)
    .map(phrase => phrase.replace(/\s+etc\.?$/iu, '').replace(/[.。]+$/u, '').trim())
    .filter(phrase => phrase.length >= 4 && !/^comumente vista/iu.test(phrase)));
}

function canonicalKnownPatternName(phrase, knownPatternNames) {
  const normalized = normalizeSearchText(phrase);
  const compactKnown = new Map([...knownPatternNames].map(name => [normalizeSearchText(name), name]));
  if (compactKnown.has(normalized)) return compactKnown.get(normalized);

  const hasKnown = name => knownPatternNames.has(name);
  const matches = (pattern) => pattern.test(normalized);

  if (hasKnown('Umidade-Calor') && matches(/\bumidade\s+calor\b|\bcalor\s+umidade\b/)) {
    return 'Umidade-Calor';
  }
  if (hasKnown('Deficiência de Qi do Baço') && matches(/\b(deficiencia|debilidade|insuficiencia)\b.*\b(qi\s+do\s+)?baco\b|\bbaco\b.*\bdeficiencia\b/)) {
    return 'Deficiência de Qi do Baço';
  }
  if (hasKnown('Deficiência de Yang do Rim') && matches(/\bdeficiencia\b.*\byang\b.*\brins?\b|\byang\b.*\brins?\b/)) {
    return 'Deficiência de Yang do Rim';
  }
  if (hasKnown('Deficiência de Yin do Rim') && matches(/\bdeficiencia\b.*\byin\b.*\brins?\b|\byin\b.*\brins?\b/)) {
    return 'Deficiência de Yin do Rim';
  }
  if (hasKnown('Deficiência de Xue do Fígado') && matches(/\bdeficiencia\b.*\b(sangue|xue)\b.*\bfigado\b/)) {
    return 'Deficiência de Xue do Fígado';
  }
  if (hasKnown('Estagnação de Xue') && matches(/\b(estase|estagnacao|coagulacao)\b.*\b(sangue|sanguinea|xue)\b/)) {
    return 'Estagnação de Xue';
  }
  if (hasKnown('Deficiência de Qi do Pulmão') && matches(/\bdeficiencia\b.*\bqi\b.*\bpulmao\b/)) {
    return 'Deficiência de Qi do Pulmão';
  }
  if (hasKnown('Qi do Fígado invadindo Baço/Estômago') && matches(/\bqi\b.*\bfigado\b.*\b(baco|estomago)\b|\bfigado\b.*\binvadindo\b.*\b(baco|estomago)\b/)) {
    return 'Qi do Fígado invadindo Baço/Estômago';
  }
  if (hasKnown('Ascensão do Yang do Fígado') && matches(/\bascensao\b.*\byang\b.*\bfigado\b/)) {
    return 'Ascensão do Yang do Fígado';
  }
  if (hasKnown('Agitação do Shen por Calor') && matches(/\bshen\b.*\bcalor\b|\bcalor\b.*\bcanc?ais?\s+do\s+coracao\b|\bfogo\b.*\bcoracao\b/)) {
    return 'Agitação do Shen por Calor';
  }

  return null;
}

function candidatePatternName(phrase, knownPatternNames) {
  return canonicalKnownPatternName(phrase, knownPatternNames) || titleCaseFirst(phrase).replace(/[.。]+$/u, '').trim();
}

function patternLinksFromCase(parsedCase, knownPatternNames) {
  const phrases = splitClinicalPhrases(parsedCase.diagnosis);
  const sourceEvidence = truncateText(`Diagnóstico: ${parsedCase.diagnosis}`, 360);
  const links = [];
  const seen = new Set();

  for (const phrase of phrases) {
    const pattern = candidatePatternName(phrase, knownPatternNames);
    const key = normalizeSearchText(pattern);
    if (!pattern || seen.has(key)) continue;
    seen.add(key);
    links.push({
      pattern,
      weight: 3,
      polarity: '+',
      evidence: sourceEvidence,
    });
  }

  if (links.length > 0) return links;

  for (const phrase of splitClinicalPhrases(parsedCase.etiopathogenesis)) {
    const pattern = candidatePatternName(phrase, knownPatternNames);
    const key = normalizeSearchText(pattern);
    if (!pattern || seen.has(key)) continue;
    seen.add(key);
    links.push({
      pattern,
      weight: 2,
      polarity: '+',
      evidence: truncateText(`Principais etiopatogenias: ${parsedCase.etiopathogenesis}`, 360),
    });
  }

  return links;
}

function checklistMatchesForFinding(parsedCase) {
  const haystack = normalizeSearchText([
    parsedCase.label,
    parsedCase.aspect,
    parsedCase.coating,
  ].join(' '));

  const matches = [];
  for (const group of CHECKLIST_GROUP_PRIORITY) {
    for (const option of checklists[group] || []) {
      const optionKey = normalizeSearchText(option);
      if (!optionKey) continue;
      if (haystack.includes(optionKey)) {
        matches.push({ group, option });
      }
    }
  }

  for (const [option, regex] of TONGUE_TRIGGER_TERMS) {
    if (regex.test(`${parsedCase.label} ${parsedCase.aspect} ${parsedCase.coating}`)) {
      matches.push({ group: 'lingua', option });
    }
  }

  const byKey = new Map();
  for (const match of matches) {
    byKey.set(`${match.group}:${match.option}`, match);
  }
  return [...byKey.values()];
}

function nearestChecklistGroup(parsedCase) {
  const matches = checklistMatchesForFinding(parsedCase);
  if (matches.length === 0) return { checklistGroup: 'lingua', matches: [] };
  const first = matches.find(match => match.group === 'lingua') || matches[0];
  return { checklistGroup: first.group, matches };
}

function deriveTriggerAliases(parsedCase, checklistMatches) {
  const aliases = [parsedCase.label];
  const combined = `${parsedCase.label} ${parsedCase.aspect} ${parsedCase.coating}`;

  const bodyTraits = BODY_TRAITS
    .filter(([, regex]) => regex.test(`${parsedCase.label} ${parsedCase.aspect}`))
    .map(([term]) => term);
  if (bodyTraits.length > 0) aliases.push(`Língua ${bodyTraits.slice(0, 4).join(' ')}`);

  const saburraTraits = SABURRA_TRAITS
    .filter(([, regex]) => regex.test(parsedCase.coating))
    .map(([term]) => term);
  for (const trait of saburraTraits) {
    aliases.push(`Saburra ${trait}`);
  }
  if (saburraTraits.length > 1) aliases.push(`Saburra ${saburraTraits.slice(0, 4).join(' ')}`);

  for (const match of checklistMatches) {
    if (match.group === 'lingua') aliases.push(match.option);
  }

  if (/\brevestimento\b/iu.test(combined)) {
    aliases.push(parsedCase.label.replace(/\brevestimento\b/iu, 'saburra'));
  }

  return uniqueByNormalized(aliases).slice(0, 10);
}

function sourceForPage(source, page, parsedCase) {
  const sourceObject = {
    key: source.key,
    title: source.title,
    pdfPage: page.pageNumber,
    imageUrl: pageImageUrl(source, page),
    snippet: truncateText([
      parsedCase.label,
      parsedCase.aspect ? `Aspecto lingual: ${parsedCase.aspect}` : '',
      parsedCase.coating ? `Saburra: ${parsedCase.coating}` : '',
      parsedCase.diagnosis ? `Diagnóstico: ${parsedCase.diagnosis}` : '',
    ].filter(Boolean).join(' '), 620),
  };

  if (parsedCase.caseNumber) {
    sourceObject.printedCase = `Língua ${String(parsedCase.caseNumber).padStart(2, '0')}`;
  }
  return sourceObject;
}

function buildFindingCandidate({ source, page, parsedCase, knownPatternNames }) {
  const { checklistGroup, matches } = nearestChecklistGroup(parsedCase);
  const patternLinks = patternLinksFromCase(parsedCase, knownPatternNames);
  if (patternLinks.length === 0) return null;

  const aliases = deriveTriggerAliases(parsedCase, matches);
  const exactChecklistMatch = matches.some(match => normalizeSearchText(match.option) === normalizeSearchText(parsedCase.label));

  return {
    id: `finding:lingua:${String(parsedCase.caseNumber).padStart(3, '0')}-${slugify(parsedCase.label)}`,
    status: STATUS_REVIEW,
    domain: 'lingua',
    checklistGroup,
    label: parsedCase.label,
    aliases,
    isNew: !exactChecklistMatch,
    existingChecklistMatches: matches.map(match => `${match.group}:${match.option}`),
    patternLinks,
    source: sourceForPage(source, page, parsedCase),
    requiresProfessionalAudit: true,
    generatedFrom: GENERATED_FROM,
    extractionTier: 'A',
  };
}

function emptyPatternCandidate(pattern, knownPatternNames, source) {
  return {
    id: `pattern:${slugify(pattern)}`,
    status: STATUS_REVIEW,
    pattern,
    isNew: !knownPatternNames.has(pattern),
    tongueSigns: [],
    pulseSigns: [],
    symptoms: [],
    differentials: [],
    source,
    sources: [],
    requiresProfessionalAudit: true,
    generatedFrom: GENERATED_FROM,
  };
}

function mergePatternEvidence(patternMap, finding, knownPatternNames) {
  for (const link of finding.patternLinks || []) {
    const key = normalizeSearchText(link.pattern);
    if (!key) continue;
    const source = {
      ...finding.source,
      snippet: truncateText(link.evidence || finding.source?.snippet || '', 420),
    };
    const current = patternMap.get(key) || emptyPatternCandidate(link.pattern, knownPatternNames, source);
    current.tongueSigns = uniqueByNormalized([
      ...current.tongueSigns,
      finding.label,
      ...((finding.aliases || []).filter(alias => normalizeSearchText(alias).includes('lingua') || normalizeSearchText(alias).includes('saburra'))),
    ]).slice(0, 24);
    current.sources = uniqueSourceEntries([...current.sources, source]).slice(0, 20);
    current.source = current.source || source;
    patternMap.set(key, current);
  }
}

function uniqueSourceEntries(sources) {
  const map = new Map();
  for (const source of sources) {
    if (!source?.key || !source?.pdfPage) continue;
    map.set(`${source.key}:${source.pdfPage}:${normalizeSearchText(source.snippet).slice(0, 80)}`, source);
  }
  return [...map.values()];
}

function buildQuestionEnvelope() {
  return envelope('sistema-acup-knowledge-question-candidates.v1', extractionPolicy(), []);
}

function extractionPolicy() {
  return {
    clinicalActivation: 'review_only_until_professional_approval',
    status: STATUS_REVIEW,
    requiresProfessionalAudit: true,
    patientData: 'never',
    appRuntimeTouched: false,
    rule: 'Candidatos extraidos de fontes locais rastreaveis; nao ativar no app clinico sem curadoria humana.',
  };
}

function sourceQualityTier(source) {
  return SOURCE_TIERS.get(source.key) || null;
}

function selectedTierSet(args) {
  const raw = args.tiers || args.tier || 'A,B';
  return new Set(String(raw).split(',').map(value => value.trim().toUpperCase()).filter(Boolean));
}

function selectedSourceSet(args) {
  if (!args.source) return null;
  return new Set(String(args.source).split(',').map(value => value.trim()).filter(Boolean));
}

async function loadPatternNames(filePath = knowledgeBasePath) {
  const text = await fs.readFile(filePath, 'utf8');
  const start = text.indexOf('export const patternDefinitions = {');
  const end = text.indexOf('export const techniqueKnowledge', start);
  if (start === -1 || end === -1) {
    throw new Error(`Nao foi possivel localizar patternDefinitions em ${filePath}`);
  }
  const block = text.slice(start, end);
  const names = new Set();
  const regex = /^\s{2}'([^']+)':\s*\{/gmu;
  for (const match of block.matchAll(regex)) {
    names.add(match[1]);
  }
  return names;
}

async function loadSources({ indexPath = defaultIndexPath, catalogPath = defaultCatalogPath } = {}) {
  const index = await readJson(indexPath);
  const catalog = await readOptionalJson(catalogPath, { sources: [] });
  const catalogByKey = new Map((catalog.sources || []).map(source => [source.key, source]));
  return (index.sources || []).map(source => ({
    ...catalogByKey.get(source.key),
    ...source,
  }));
}

async function loadManifest(pdfRoot, source) {
  const manifestPath = path.join(sourceRootFor(pdfRoot, source.key), 'manifest.json');
  if (!pathExists(manifestPath)) return null;
  return readJson(manifestPath);
}

function pageHasUsableText(page, text) {
  const normalized = normalizePdfText(text);
  if (normalized.length < 180) return false;
  if ((normalized.match(/\uFFFD/g) || []).length > 2) return false;
  const letters = (normalized.match(/\p{L}/gu) || []).length;
  return letters / Math.max(1, normalized.length) > 0.45;
}

async function extractTierAFromSemiology({ source, manifest, sourceRoot, knownPatternNames }) {
  const findingsById = new Map();
  const patternsByName = new Map();
  const skippedPages = [];
  let pagesRead = 0;
  let casePages = 0;

  for (const page of manifest.pages || []) {
    const textPath = pageTextPath(sourceRoot, page);
    const rawText = await readOptionalText(textPath);
    if (!rawText.trim()) {
      skippedPages.push({ page: page.pageNumber, reason: 'sem texto extraido' });
      continue;
    }
    pagesRead += 1;

    const parsedCase = parseSemiologyTongueCasePage(rawText, page.pageNumber);
    if (!parsedCase) {
      skippedPages.push({ page: page.pageNumber, reason: 'pagina sem caso estruturado de lingua' });
      continue;
    }
    casePages += 1;

    if (!pageImageExists(sourceRoot, page)) {
      skippedPages.push({ page: page.pageNumber, reason: 'imagem webp de fonte ausente' });
      continue;
    }

    const finding = buildFindingCandidate({ source, page, parsedCase, knownPatternNames });
    if (!finding) {
      skippedPages.push({ page: page.pageNumber, reason: 'caso sem vinculo de padrao extraivel' });
      continue;
    }
    findingsById.set(finding.id, finding);
    mergePatternEvidence(patternsByName, finding, knownPatternNames);
  }

  return {
    findings: [...findingsById.values()],
    patterns: [...patternsByName.values()],
    audit: {
      sourceKey: source.key,
      sourceTitle: source.title,
      tier: 'A',
      action: 'deterministic_section_parser',
      pagesTotal: manifest.pages?.length || 0,
      pagesRead,
      casePages,
      findingsGenerated: findingsById.size,
      patternsGenerated: patternsByName.size,
      skippedPages,
      coveragePercent: casePages === 0 ? 0 : Number(((findingsById.size / casePages) * 100).toFixed(2)),
    },
  };
}

function buildLlmPrompt({ source, page, text }) {
  return [
    'Voce extrai candidatos clinicos estruturados para curadoria de anamnese em MTC.',
    'Extraia apenas o que esta explicitamente no texto. Nao invente. Use pt-BR. Responda somente JSON valido no schema pedido.',
    'Todo item deve ficar status "review" e requiresProfessionalAudit true.',
    `Fonte: ${source.title} (${source.key}), pagina PDF ${page.pageNumber}.`,
    'Schema de resposta: {"findings":[],"questions":[],"patterns":[]}.',
    'Cada finding deve conter: domain, checklistGroup, label, aliases, patternLinks.',
    'Cada question deve conter: checklistGroup, prompt, options, rationale, linkedFindings.',
    'Cada pattern deve conter: pattern, tongueSigns, pulseSigns, symptoms, differentials.',
    'Texto da pagina:',
    text,
  ].join('\n\n');
}

function llmResponseSchema() {
  const sourceLessObject = {
    type: 'object',
    additionalProperties: true,
    properties: {},
  };
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      findings: { type: 'array', items: sourceLessObject },
      questions: { type: 'array', items: sourceLessObject },
      patterns: { type: 'array', items: sourceLessObject },
    },
    required: ['findings', 'questions', 'patterns'],
  };
}

async function callOpenAiJson({ prompt, model }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY nao configurada.');
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: prompt,
      text: {
        format: {
          type: 'json_schema',
          name: 'knowledge_candidates',
          schema: llmResponseSchema(),
          strict: true,
        },
      },
    }),
  });
  if (!response.ok) {
    throw new Error(`OpenAI retornou HTTP ${response.status}: ${await response.text()}`);
  }
  const payload = await response.json();
  const outputText = payload.output_text
    || payload.output?.flatMap(item => item.content || []).map(content => content.text).filter(Boolean).join('\n')
    || '';
  return JSON.parse(outputText);
}

async function callGeminiJson({ prompt, model }) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY/GOOGLE_API_KEY nao configurada.');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: llmResponseSchema(),
      },
    }),
  });
  if (!response.ok) {
    throw new Error(`Gemini retornou HTTP ${response.status}: ${await response.text()}`);
  }
  const payload = await response.json();
  const outputText = payload.candidates?.[0]?.content?.parts?.map(part => part.text).filter(Boolean).join('\n') || '';
  return JSON.parse(outputText);
}

async function callProviderJson({ provider, prompt, model }) {
  if (provider === 'openai') return callOpenAiJson({ prompt, model: model || 'gpt-4.1-mini' });
  if (provider === 'gemini') return callGeminiJson({ prompt, model: model || 'gemini-1.5-flash' });
  throw new Error(`Provider nao suportado para chamada LLM: ${provider}`);
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function attachSourceToLlmCandidate(candidate, source, page, type) {
  const label = candidate.label || candidate.prompt || candidate.pattern || type;
  return {
    ...candidate,
    id: candidate.id || `${type}:${slugify(candidate.checklistGroup || candidate.domain || source.key)}:${slugify(label)}:${source.key}:p${padPage(page.pageNumber)}`,
    status: STATUS_REVIEW,
    source: {
      key: source.key,
      title: source.title,
      pdfPage: page.pageNumber,
      imageUrl: pageImageUrl(source, page),
      snippet: truncateText(candidate.source?.snippet || candidate.evidence || label, 620),
    },
    requiresProfessionalAudit: true,
    generatedFrom: GENERATED_FROM,
    extractionTier: 'B',
  };
}

function validateLlmCandidate(candidate, type) {
  if (!candidate || typeof candidate !== 'object') return `candidato ${type} invalido`;
  if (candidate.status !== STATUS_REVIEW) return `${type} sem status review`;
  if (candidate.requiresProfessionalAudit !== true) return `${type} sem auditoria profissional`;
  if (!candidate.source?.key || !candidate.source?.pdfPage || !candidate.source?.imageUrl || !candidate.source?.snippet) {
    return `${type} sem source completo`;
  }
  if (type === 'finding' && (!candidate.label || !Array.isArray(candidate.patternLinks))) return 'finding sem label/patternLinks';
  if (type === 'question' && (!candidate.prompt || !candidate.checklistGroup)) return 'question sem prompt/checklistGroup';
  if (type === 'pattern' && !candidate.pattern) return 'pattern sem nome';
  return null;
}

async function extractTierBWithProvider({ source, manifest, sourceRoot, provider, model, maxPages }) {
  const findings = [];
  const questions = [];
  const patterns = [];
  const skippedPages = [];
  const validationErrors = [];
  let pagesRead = 0;
  let preparedPages = 0;
  let calledPages = 0;

  for (const page of manifest.pages || []) {
    if (maxPages && preparedPages >= maxPages) break;
    const textPath = pageTextPath(sourceRoot, page);
    const rawText = await readOptionalText(textPath);
    const text = normalizePdfText(rawText);
    if (!pageHasUsableText(page, text)) {
      skippedPages.push({ page: page.pageNumber, reason: 'texto ausente, curto ou ruidoso' });
      continue;
    }
    if (!pageImageExists(sourceRoot, page)) {
      skippedPages.push({ page: page.pageNumber, reason: 'imagem webp de fonte ausente' });
      continue;
    }
    pagesRead += 1;
    preparedPages += 1;

    if (provider === 'none') {
      skippedPages.push({ page: page.pageNumber, reason: 'provider none: pagina validada, chamada LLM nao executada' });
      continue;
    }

    const prompt = buildLlmPrompt({ source, page, text: truncateText(text, 9000) });
    const result = await callProviderJson({ provider, prompt, model });
    calledPages += 1;

    for (const candidate of ensureArray(result.findings).map(item => attachSourceToLlmCandidate(item, source, page, 'finding'))) {
      const error = validateLlmCandidate(candidate, 'finding');
      if (error) validationErrors.push({ page: page.pageNumber, error });
      else findings.push(candidate);
    }
    for (const candidate of ensureArray(result.questions).map(item => attachSourceToLlmCandidate(item, source, page, 'question'))) {
      const error = validateLlmCandidate(candidate, 'question');
      if (error) validationErrors.push({ page: page.pageNumber, error });
      else questions.push(candidate);
    }
    for (const candidate of ensureArray(result.patterns).map(item => attachSourceToLlmCandidate(item, source, page, 'pattern'))) {
      const error = validateLlmCandidate(candidate, 'pattern');
      if (error) validationErrors.push({ page: page.pageNumber, error });
      else patterns.push(candidate);
    }
  }

  return {
    findings,
    questions,
    patterns,
    audit: {
      sourceKey: source.key,
      sourceTitle: source.title,
      tier: 'B',
      action: provider === 'none' ? 'dry_run_provider_none' : `llm_provider_${provider}`,
      provider,
      model: provider === 'none' ? null : model,
      pagesTotal: manifest.pages?.length || 0,
      pagesRead,
      preparedPages,
      calledPages,
      findingsGenerated: findings.length,
      questionsGenerated: questions.length,
      patternsGenerated: patterns.length,
      validationErrors,
      skippedPages,
      coveragePercent: preparedPages === 0 ? 0 : Number(((calledPages / preparedPages) * 100).toFixed(2)),
    },
  };
}

function uniqueCandidates(items) {
  const map = new Map();
  for (const item of items) {
    if (!item?.id) continue;
    map.set(item.id, item);
  }
  return [...map.values()].sort((a, b) => a.id.localeCompare(b.id, 'pt-BR'));
}

function validateFindingReferences(findings, patterns, knownPatternNames) {
  const candidatePatterns = new Set(patterns.map(pattern => pattern.pattern).filter(Boolean));
  const errors = [];
  for (const finding of findings) {
    if (finding.status !== STATUS_REVIEW) errors.push(`${finding.id}: status diferente de review`);
    if (finding.requiresProfessionalAudit !== true) errors.push(`${finding.id}: sem requiresProfessionalAudit`);
    if (!finding.source?.key || !finding.source?.pdfPage || !finding.source?.imageUrl || !finding.source?.snippet) {
      errors.push(`${finding.id}: source incompleto`);
    }
    for (const link of finding.patternLinks || []) {
      if (!knownPatternNames.has(link.pattern) && !candidatePatterns.has(link.pattern)) {
        errors.push(`${finding.id}: pattern orfao ${link.pattern}`);
      }
    }
  }
  return errors;
}

function canonicalizeFindingPatternLinks(findings, patterns, knownPatternNames) {
  const canonicalByNormalized = new Map();
  for (const pattern of knownPatternNames) {
    canonicalByNormalized.set(normalizeSearchText(pattern), pattern);
  }
  for (const pattern of patterns) {
    if (pattern?.pattern) {
      canonicalByNormalized.set(normalizeSearchText(pattern.pattern), pattern.pattern);
    }
  }

  for (const finding of findings) {
    for (const link of finding.patternLinks || []) {
      const canonical = canonicalByNormalized.get(normalizeSearchText(link.pattern));
      if (canonical) link.pattern = canonical;
    }
  }

  return findings;
}

async function writeSummary({ summaryPath, findingEnvelope, questionEnvelope, patternEnvelope, auditEnvelope, command }) {
  await fs.mkdir(path.dirname(summaryPath), { recursive: true });
  const audits = auditEnvelope.items;
  const tableRows = audits.map(item => (
    `| ${item.sourceKey} | ${item.tier || '-'} | ${item.action} | ${item.pagesRead || 0} | ${item.findingsGenerated || 0} | ${item.questionsGenerated || 0} | ${item.patternsGenerated || 0} | ${item.coveragePercent ?? 0}% |`
  ));
  const skippedTierC = audits
    .filter(item => item.tier === 'C')
    .map(item => `- ${item.sourceKey}: ${item.reason}`)
    .join('\n') || '- Nenhuma fonte Tier C catalogada.';

  const content = `# Aprendizado local de conhecimento para anamnese

Gerado em: ${auditEnvelope.generatedAt}

## Regra clinica

- Candidatos permanecem em \`review\` e exigem auditoria profissional.
- O app clinico nao foi alterado por este lote.
- Saidas locais ficam em \`frontend/.local-source-assets/pdf-sources/knowledge/\`.
- Fontes Tier C foram registradas como pendentes e nao geraram achado textual.
- Comando: \`${command}\`

## Contagens

| Tipo | Itens |
| --- | ---: |
| Achados clinicos | ${findingEnvelope.counts.items} |
| Perguntas de anamnese | ${questionEnvelope.counts.items} |
| Padroes/enriquecimentos | ${patternEnvelope.counts.items} |

## Cobertura por fonte

| Fonte | Tier | Acao | Paginas lidas | Achados | Perguntas | Padroes | Cobertura |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
${tableRows.join('\n')}

## Fontes visuais pendentes

${skippedTierC}

## Arquivos locais

- \`frontend/.local-source-assets/pdf-sources/knowledge/finding-candidates.local.json\`
- \`frontend/.local-source-assets/pdf-sources/knowledge/question-candidates.local.json\`
- \`frontend/.local-source-assets/pdf-sources/knowledge/pattern-candidates.local.json\`
- \`frontend/.local-source-assets/pdf-sources/knowledge/extract-knowledge-audit.local.json\`
`;

  await fs.writeFile(summaryPath, content, 'utf8');
}

export async function runExtraction(options = {}) {
  const args = {
    provider: 'none',
    pdfRoot: defaultPdfRoot,
    index: defaultIndexPath,
    catalog: defaultCatalogPath,
    outDir: defaultKnowledgeRoot,
    summary: defaultSummaryPath,
    ...options,
  };
  const provider = String(args.provider || 'none').toLowerCase();
  if (!['none', 'openai', 'gemini'].includes(provider)) {
    throw new Error(`Provider invalido: ${provider}. Use none, openai ou gemini.`);
  }

  const tiers = selectedTierSet(args);
  const sourceFilter = selectedSourceSet(args);
  const sources = await loadSources({ indexPath: args.index, catalogPath: args.catalog });
  const knownPatternNames = await loadPatternNames(args.knowledgeBase || knowledgeBasePath);
  const allFindings = [];
  const allQuestions = [];
  const allPatterns = [];
  const audits = [];
  const maxPages = args.maxPages ? Number(args.maxPages) : null;

  for (const source of sources) {
    if (sourceFilter && !sourceFilter.has(source.key)) continue;
    const tier = sourceQualityTier(source);

    if (tier === 'C') {
      audits.push({
        sourceKey: source.key,
        sourceTitle: source.title,
        tier: 'C',
        action: 'skipped_visual_pending',
        reason: TIER_C_REASONS.get(source.key) || 'fonte visual pendente',
        pagesTotal: source.pageCount || source.counts?.pagesIndexed || 0,
        pagesRead: 0,
        findingsGenerated: 0,
        questionsGenerated: 0,
        patternsGenerated: 0,
        coveragePercent: 0,
      });
      continue;
    }

    if (!tier || !tiers.has(tier)) {
      audits.push({
        sourceKey: source.key,
        sourceTitle: source.title,
        tier: tier || 'out_of_scope',
        action: 'skipped_not_selected',
        reason: tier ? `tier ${tier} nao selecionado` : 'fonte fora do escopo do extractor de anamnese',
        pagesTotal: source.pageCount || source.counts?.pagesIndexed || 0,
        pagesRead: 0,
        findingsGenerated: 0,
        questionsGenerated: 0,
        patternsGenerated: 0,
        coveragePercent: 0,
      });
      continue;
    }

    const manifest = await loadManifest(args.pdfRoot, source);
    if (!manifest) {
      audits.push({
        sourceKey: source.key,
        sourceTitle: source.title,
        tier,
        action: 'blocked_missing_manifest',
        reason: 'manifest.json ausente',
        pagesTotal: 0,
        pagesRead: 0,
        findingsGenerated: 0,
        questionsGenerated: 0,
        patternsGenerated: 0,
        coveragePercent: 0,
      });
      continue;
    }

    const sourceRoot = sourceRootFor(args.pdfRoot, source.key);
    if (tier === 'A') {
      const result = await extractTierAFromSemiology({ source, manifest, sourceRoot, knownPatternNames });
      allFindings.push(...result.findings);
      allPatterns.push(...result.patterns);
      audits.push({
        ...result.audit,
        questionsGenerated: 0,
      });
      continue;
    }

    if (tier === 'B') {
      const result = await extractTierBWithProvider({
        source,
        manifest,
        sourceRoot,
        provider,
        model: args.model,
        maxPages,
      });
      allFindings.push(...result.findings);
      allQuestions.push(...result.questions);
      allPatterns.push(...result.patterns);
      audits.push(result.audit);
    }
  }

  const findings = uniqueCandidates(allFindings);
  const questions = uniqueCandidates(allQuestions);
  const patterns = uniqueCandidates(allPatterns);
  canonicalizeFindingPatternLinks(findings, patterns, knownPatternNames);
  const validationErrors = validateFindingReferences(findings, patterns, knownPatternNames);

  const findingEnvelope = envelope('sistema-acup-knowledge-finding-candidates.v1', extractionPolicy(), findings);
  const questionEnvelope = envelope('sistema-acup-knowledge-question-candidates.v1', extractionPolicy(), questions);
  const patternEnvelope = envelope('sistema-acup-knowledge-pattern-candidates.v1', extractionPolicy(), patterns);
  const auditEnvelope = envelope('sistema-acup-extract-knowledge-audit.v1', extractionPolicy(), audits.map(audit => ({
    ...audit,
    status: STATUS_REVIEW,
    requiresProfessionalAudit: true,
    generatedFrom: GENERATED_FROM,
  })));
  auditEnvelope.validation = {
    patternReferenceErrors: validationErrors,
    appRuntimeTouched: false,
    provider,
  };

  if (validationErrors.length > 0) {
    throw new Error(`Validacao falhou: ${validationErrors.join('; ')}`);
  }

  await writeJson(path.join(args.outDir, 'finding-candidates.local.json'), findingEnvelope);
  await writeJson(path.join(args.outDir, 'question-candidates.local.json'), questionEnvelope);
  await writeJson(path.join(args.outDir, 'pattern-candidates.local.json'), patternEnvelope);
  await writeJson(path.join(args.outDir, 'extract-knowledge-audit.local.json'), auditEnvelope);

  if (args.summary !== false && args.summary !== 'false') {
    await writeSummary({
      summaryPath: args.summary,
      findingEnvelope,
      questionEnvelope,
      patternEnvelope,
      auditEnvelope,
      command: args.command || `node tools/knowledge/extract-knowledge.mjs --tiers ${[...tiers].join(',')} --provider ${provider}`,
    });
  }

  return {
    findingEnvelope,
    questionEnvelope,
    patternEnvelope,
    auditEnvelope,
    outputDir: args.outDir,
    summaryPath: args.summary,
  };
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const args = {
    ...parsed,
    provider: parsed.dryRun ? 'none' : (parsed.provider || 'none'),
    pdfRoot: parsed.pdfRoot || defaultPdfRoot,
    index: parsed.index || defaultIndexPath,
    catalog: parsed.catalog || defaultCatalogPath,
    outDir: parsed.outDir || defaultKnowledgeRoot,
    summary: parsed.summary === 'false' ? false : (parsed.summary || defaultSummaryPath),
    command: `node ${path.relative(projectRoot, __filename).replace(/\\/g, '/')} ${process.argv.slice(2).join(' ')}`.trim(),
  };

  const result = await runExtraction(args);
  const summary = {
    outputDir: path.relative(projectRoot, result.outputDir),
    summary: result.summaryPath ? path.relative(projectRoot, result.summaryPath) : null,
    findings: result.findingEnvelope.counts.items,
    questions: result.questionEnvelope.counts.items,
    patterns: result.patternEnvelope.counts.items,
    auditSources: result.auditEnvelope.counts.items,
    provider: result.auditEnvelope.validation.provider,
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

const isCli = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isCli) {
  main().catch(error => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}

export {
  buildFindingCandidate,
  buildQuestionEnvelope,
  candidatePatternName,
  extractTierAFromSemiology,
  patternLinksFromCase,
  validateFindingReferences,
};
