import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');
const defaultTextDirectory = path.join(
  projectRoot,
  'frontend',
  '.local-source-assets',
  'pdf-sources',
  'ebook-ervas-medicinais',
  'text',
);
const defaultOutputPath = path.join(
  projectRoot,
  'frontend',
  '.local-source-assets',
  'pdf-sources',
  'ebook-ervas-medicinais',
  'plant-catalog.local.json',
);
const defaultMarkdownPath = path.join(
  projectRoot,
  'docs',
  'nutricao-ervas',
  'plantas-medicinais-wikipedia.md',
);

const ENTRY_PATTERN = /(?<name>[A-ZÀ-Ú][A-ZÀ-Ú0-9'’ -]{1,80}?)\s+NOME\s+CIENT[ÍI]FICO\s+(?<scientific>.+?)\s+FAM[ÍI]L(?:IA|A)\s+BOT[ÂA]NICA/gs;
const WIKIPEDIA_REQUEST_INTERVAL_MS = 750;
const WIKIPEDIA_RETRY_LIMIT = 4;
const WIKIPEDIA_BATCH_SIZE = 20;
const PAGE_MARKER = /<<<PDF_PAGE:(\d+)>>>/g;
const SECTION_DEFINITIONS = [
  { key: 'scientificName', pattern: /NOME\s+CIENT[ÍI]FICO/gi },
  { key: 'botanicalFamily', pattern: /FAM[ÍI]L(?:IA|A)\s+BOT[ÂA]NICA/gi },
  { key: 'synonyms', pattern: /SINON[ÍI]MIA/gi },
  { key: 'habitat', pattern: /HABITAT/gi },
  { key: 'phytology', pattern: /FITOLOGIA/gi },
  { key: 'soil', pattern: /SOLO/gi },
  { key: 'climate', pattern: /CLIMA/gi },
  { key: 'agrology', pattern: /AGROLOGIA/gi },
  { key: 'partsUsed', pattern: /PARTES\s+UTILIZADAS/gi },
  { key: 'phytochemistry', pattern: /FITOQU[ÍI]MICA/gi },
  { key: 'traditionalProperties', pattern: /PROPRIEDADES\s+ETNOTERAP[ÊE]UTICAS/gi },
  { key: 'traditionalIndications', pattern: /INDICA[ÇC][ÕO]ES/gi },
  { key: 'formsOfUse', pattern: /FORMAS\s+DE\s+USO/gi },
  { key: 'toxicology', pattern: /TOXICOLOGIA/gi },
  { key: 'otherProperties', pattern: /OUTRAS\s+PROPRIEDADES/gi },
];
const BODY_TERM_DEFINITIONS = [
  ['cerebro', /\bc[eé]rebro\b/i],
  ['coracao', /\bcora[çc][aã]o\b/i],
  ['estomago', /\best[oô]mago\b/i],
  ['figado', /\bf[ií]gado\b/i],
  ['intestinos', /\bintestinos?\b/i],
  ['pulmoes', /\bpulm[ãoões]+\b/i],
  ['rins', /\brins?\b/i],
  ['utero', /\b[uú]tero\b/i],
];

function normalizeWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeForComparison(value) {
  return normalizeWhitespace(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');
}

function slug(value) {
  return normalizeForComparison(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function displayCommonName(value) {
  const normalized = normalizeWhitespace(value).toLocaleLowerCase('pt-BR');
  return normalized ? normalized[0].toLocaleUpperCase('pt-BR') + normalized.slice(1) : '';
}

export function primaryScientificName(scientificName) {
  const text = normalizeWhitespace(scientificName)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // Corrige um espaco espurio de OCR sem alterar o valor preservado da fonte.
    .replace(/^A\s+diantum\b/, 'Adiantum');
  const match = text.match(/\b([A-Z][a-z]+)\s+([xX×]\s+)?([a-z][a-z-]+)/);
  if (!match) return '';
  return `${match[1]}${match[2] ? ' ×' : ''} ${match[3]}`;
}

function pageMarkedSource(pages) {
  const markers = [];
  let text = '';
  for (const page of [...pages].sort((left, right) => left.number - right.number)) {
    text += `\n<<<PDF_PAGE:${page.number}>>>\n`;
    markers.push({ number: page.number, textStart: text.length });
    text += String(page.text || '');
  }
  return { text, markers };
}

function cleanSourceSection(value) {
  return normalizeWhitespace(String(value || '').replace(PAGE_MARKER, ''));
}

function pagesForRange(markers, start, end) {
  const current = [...markers].reverse().find(marker => marker.textStart <= start);
  const pages = current ? [current.number] : [];
  for (const marker of markers) {
    if (marker.textStart > start && marker.textStart < end) pages.push(marker.number);
  }
  return [...new Set(pages)];
}

function sectionHeadings(segment) {
  const headings = [];
  for (const definition of SECTION_DEFINITIONS) {
    definition.pattern.lastIndex = 0;
    for (const match of segment.matchAll(definition.pattern)) {
      headings.push({
        key: definition.key,
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  }
  return headings.sort((left, right) => left.start - right.start);
}

function extractSourceSections(segment, segmentStart, markers) {
  const headings = sectionHeadings(segment);
  const sections = {};
  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    if (sections[heading.key]) continue;
    const next = headings.slice(index + 1).find(candidate => candidate.start > heading.start);
    const start = heading.end;
    const end = next ? next.start : segment.length;
    const text = cleanSourceSection(segment.slice(start, end));
    if (!text) continue;
    sections[heading.key] = {
      text,
      pdfPages: pagesForRange(markers, segmentStart + start, segmentStart + end),
    };
  }
  return sections;
}

function sourceMentionedBodyTerms(sections) {
  const text = [
    sections.traditionalProperties?.text,
    sections.traditionalIndications?.text,
    sections.toxicology?.text,
  ].filter(Boolean).join(' ');
  return BODY_TERM_DEFINITIONS
    .filter(([, pattern]) => pattern.test(text))
    .map(([id]) => id);
}

export function extractHerbalEntries(pages) {
  const { text, markers } = pageMarkedSource(pages);
  const matches = [...text.matchAll(ENTRY_PATTERN)];
  const entries = [];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const commonName = normalizeWhitespace(match.groups.name);
    const scientificNameSource = cleanSourceSection(match.groups.scientific);
    const scientificNameLookup = primaryScientificName(scientificNameSource);
    if (!commonName || !scientificNameSource || !scientificNameLookup) continue;

    const start = match.index;
    const end = matches[index + 1]?.index || text.length;
    const segment = text.slice(start, end);
    const sourceSections = extractSourceSections(segment, start, markers);
    const sourcePdfPages = pagesForRange(markers, start, end);

    entries.push({
      id: `${slug(commonName)}-${slug(scientificNameLookup)}-p${String(sourcePdfPages[0]).padStart(3, '0')}`,
      commonName,
      scientificNameSource,
      scientificNameLookup,
      botanicalFamily: sourceSections.botanicalFamily?.text || '',
      sourcePdfPages,
      sourceSections: {
        partsUsed: sourceSections.partsUsed || null,
        traditionalProperties: sourceSections.traditionalProperties || null,
        traditionalIndications: sourceSections.traditionalIndications || null,
        formsOfUse: sourceSections.formsOfUse || null,
        toxicology: sourceSections.toxicology || null,
      },
      sourceMentionedBodyTerms: sourceMentionedBodyTerms(sourceSections),
      traditionalMtcAssociations: [],
      traditionalMtcAssociationStatus: 'not_available_in_source',
      contentReleaseStatus: 'source_only',
    });
  }
  return entries;
}

export function buildWikipediaSearchUrl(query, language = 'pt') {
  const url = new URL(`https://${language}.wikipedia.org/w/index.php`);
  url.searchParams.set('search', query);
  return url.toString();
}

function wikipediaPageUrl(title, language = 'pt') {
  return `https://${language}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
}

function wait(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function retryAfterMilliseconds(response, attempt) {
  const retryAfterSeconds = Number(response.headers.get('retry-after'));
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return retryAfterSeconds * 1000;
  }
  return 3000 * (attempt + 1);
}

function resolveWikiAlias(value, aliases) {
  let current = value;
  const visited = new Set();
  while (aliases.has(current) && !visited.has(current)) {
    visited.add(current);
    current = aliases.get(current);
  }
  return current;
}

export function resolveWikipediaPage(payload, candidates) {
  const aliases = new Map();
  for (const item of payload?.query?.normalized || []) aliases.set(item.from, item.to);
  for (const item of payload?.query?.redirects || []) aliases.set(item.from, item.to);

  const pages = Object.values(payload?.query?.pages || {}).filter(page => !page.missing && page.title);
  for (const candidate of candidates) {
    const resolvedTitle = resolveWikiAlias(candidate, aliases);
    const page = pages.find(item => item.title === resolvedTitle);
    if (page) return page;
  }
  return null;
}

function titleCandidatesForEntry(entry) {
  return [entry.scientificNameLookup, displayCommonName(entry.commonName)]
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index);
}

function searchReference(entry, { checkedAt, note = '' } = {}) {
  return {
    wikipediaUrl: buildWikipediaSearchUrl(entry.scientificNameLookup),
    wikipediaTitle: '',
    wikipediaLanguage: 'pt',
    wikipediaStatus: 'search_required',
    wikipediaCheckedAt: checkedAt || new Date().toISOString(),
    ...(note ? { wikipediaLookupNote: note } : {}),
  };
}

async function fetchWikipediaPayload(titleCandidates, { fetchImpl = fetch } = {}) {
  const url = new URL('https://pt.wikipedia.org/w/api.php');
  url.searchParams.set('action', 'query');
  url.searchParams.set('format', 'json');
  url.searchParams.set('redirects', '1');
  url.searchParams.set('prop', 'info');
  url.searchParams.set('titles', titleCandidates.join('|'));

  let response = null;
  for (let attempt = 0; attempt < WIKIPEDIA_RETRY_LIMIT; attempt += 1) {
    try {
      response = await fetchImpl(url, {
        headers: { 'user-agent': 'SistemaAcupHerbalCatalog/1.0 (botanical-reference-only)' },
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      response = null;
    }
    if (!response) {
      if (attempt < WIKIPEDIA_RETRY_LIMIT - 1) await wait(3000 * (attempt + 1));
      continue;
    }
    if (response.ok || response.status !== 429) break;
    await wait(retryAfterMilliseconds(response, attempt));
  }

  if (!response?.ok) return null;
  return response.json();
}

async function fetchWikipediaReferences(entries, { fetchImpl = fetch } = {}) {
  const references = new Map();
  for (let start = 0; start < entries.length; start += WIKIPEDIA_BATCH_SIZE) {
    const batch = entries.slice(start, start + WIKIPEDIA_BATCH_SIZE);
    const candidates = [...new Set(batch.flatMap(titleCandidatesForEntry))];
    const checkedAt = new Date().toISOString();
    const payload = await fetchWikipediaPayload(candidates, { fetchImpl });

    for (const entry of batch) {
      const page = payload && resolveWikipediaPage(payload, titleCandidatesForEntry(entry));
      references.set(entry.id, page
        ? {
          wikipediaUrl: wikipediaPageUrl(page.title),
          wikipediaTitle: page.title,
          wikipediaLanguage: 'pt',
          wikipediaStatus: 'verified_exact_or_redirect',
          wikipediaCheckedAt: checkedAt,
        }
        : searchReference(entry, {
          checkedAt,
          note: payload ? '' : 'Consulta automatica indisponivel para este lote.',
        }));
    }

    if (start + WIKIPEDIA_BATCH_SIZE < entries.length) await wait(WIKIPEDIA_REQUEST_INTERVAL_MS);
  }
  return references;
}

function hasReusableWikipediaReference(item) {
  return item
    && item.wikipediaStatus === 'verified_exact_or_redirect'
    && item.wikipediaLanguage === 'pt'
    && /^https:\/\/pt\.wikipedia\.org\/wiki\//.test(item.wikipediaUrl || '');
}

async function loadExistingWikipediaReferences(outputPath) {
  try {
    const existing = JSON.parse(await fs.readFile(outputPath, 'utf8'));
    return new Map((existing.items || [])
      .filter(hasReusableWikipediaReference)
      .map(item => [item.id, {
        wikipediaUrl: item.wikipediaUrl,
        wikipediaTitle: item.wikipediaTitle,
        wikipediaLanguage: item.wikipediaLanguage,
        wikipediaStatus: item.wikipediaStatus,
        wikipediaCheckedAt: item.wikipediaCheckedAt,
      }]));
  } catch {
    return new Map();
  }
}

async function readSourcePages(textDirectory) {
  const files = (await fs.readdir(textDirectory))
    .filter(file => /^page-\d+\.txt$/i.test(file))
    .sort((left, right) => left.localeCompare(right, 'en'));
  return Promise.all(files.map(async file => ({
    number: Number(file.match(/\d+/)[0]),
    text: await fs.readFile(path.join(textDirectory, file), 'utf8'),
  })));
}

export function toMarkdown(catalog) {
  const rows = catalog.items.map(item => {
    const target = item.wikipediaUrl;
    const label = item.wikipediaStatus === 'verified_exact_or_redirect'
      ? 'pagina verificada'
      : 'pesquisar na Wikipedia';
    const fields = [
      item.sourceSections.partsUsed && 'partes usadas',
      item.sourceSections.traditionalProperties && 'propriedades',
      item.sourceSections.traditionalIndications && 'indicacoes',
      item.sourceSections.formsOfUse && 'formas de uso',
      item.sourceSections.toxicology && 'toxicologia',
    ].filter(Boolean).join(', ') || 'somente identificacao';
    return `| [${displayCommonName(item.commonName)}](${target}) | ${item.scientificNameSource} | ${item.sourcePdfPages.join(', ')} | ${fields} | ${label} |`;
  });

  return [
    '# Plantas medicinais: referencias e campos de estudo',
    '',
    'Catalogo extraido do `E-book Ervas Medicinais`. Cada ficha guarda nome popular, nome cientifico, familia botanica, paginas de origem e os trechos estruturados da fonte para partes usadas, propriedades etnoterapeuticas, indicacoes, formas de uso e toxicologia quando presentes.',
    '',
    '> Propriedades, indicacoes, formas de uso e termos corporais sao registros do que o livro afirma, nao validacao clinica. A Wikipedia e somente uma referencia de identificacao geral da planta. Nenhum desses campos orienta dose, preparo, combinacao ou indicacao ao paciente.',
    '',
    `- Fonte: \`${catalog.source.key}\`.`,
    `- Verbetes: ${catalog.items.length}.`,
    `- Paginas diretas verificadas: ${catalog.counts.verifiedExactOrRedirect}.`,
    `- Links de busca pendentes de revisao: ${catalog.counts.searchRequired}.`,
    `- Com partes usadas na fonte: ${catalog.counts.partsUsed}.`,
    `- Com propriedades tradicionais na fonte: ${catalog.counts.traditionalProperties}.`,
    `- Com indicacoes tradicionais na fonte: ${catalog.counts.traditionalIndications}.`,
    `- Com toxicologia na fonte: ${catalog.counts.toxicology}.`,
    `- Com associacao MTC direta nesta fonte: ${catalog.counts.traditionalMtcAssociations}.`,
    '- Status clinico de todos os itens: `source_only`.',
    '',
    '| Planta | Nome cientifico conforme fonte | Paginas PDF | Campos presentes | Wikipedia |',
    '| --- | --- | ---: | --- | --- |',
    ...rows,
    '',
  ].join('\n');
}

export async function buildCatalog({
  textDirectory = defaultTextDirectory,
  fetchImpl = fetch,
  existingWikipediaReferences = new Map(),
} = {}) {
  const pages = await readSourcePages(textDirectory);
  const rawItems = extractHerbalEntries(pages);
  const missingWikipediaReferences = rawItems.filter(item => !existingWikipediaReferences.has(item.id));
  const fetchedWikipediaReferences = await fetchWikipediaReferences(missingWikipediaReferences, { fetchImpl });
  const wikipediaReferences = new Map([...existingWikipediaReferences, ...fetchedWikipediaReferences]);
  const items = rawItems.map(entry => ({
    ...entry,
    ...wikipediaReferences.get(entry.id),
  }));
  const verifiedExactOrRedirect = items.filter(item => item.wikipediaStatus === 'verified_exact_or_redirect').length;
  const countWith = field => items.filter(item => Boolean(item.sourceSections[field])).length;

  return {
    schemaVersion: 'sistema-acup-herbal-plant-catalog.v1',
    generatedAt: new Date().toISOString(),
    source: {
      key: 'ebook-ervas-medicinais',
      assetKey: 'pdf-sources/ebook-ervas-medicinais/plant-catalog.local.json',
      contentReleaseStatus: 'source_only',
      scope: 'identificacao botanica e referencia geral; nao e fonte clinica nem prescricao',
    },
    fieldPolicy: {
      wikipediaUrl: 'Referencia de identificacao geral; nao usar como fonte de seguranca, dose, preparo, combinacao ou indicacao clinica.',
      wikipediaStatus: 'verified_exact_or_redirect significa que a API pt.wikipedia retornou pagina por titulo cientifico ou nome popular; search_required exige conferncia humana antes de assumir identidade botanica.',
      sourceSections: 'Transcricao rastreavel do que a fonte declara. Propriedades e indicacoes sao alegacoes tradicionais da fonte, nao validacao clinica nem regra de conduta.',
      sourceMentionedBodyTerms: 'Termos corporais localizados literalmente em propriedades, indicacoes ou toxicologia; nao representam diagnostico, evidencia ou associacao MTC.',
      traditionalMtcAssociations: 'Permanece vazio quando a fonte nao descreve associacao MTC rastreavel. Nunca inferir por nome popular, efeito ou semelhanca textual.',
    },
    counts: {
      total: items.length,
      verifiedExactOrRedirect,
      searchRequired: items.length - verifiedExactOrRedirect,
      partsUsed: countWith('partsUsed'),
      traditionalProperties: countWith('traditionalProperties'),
      traditionalIndications: countWith('traditionalIndications'),
      formsOfUse: countWith('formsOfUse'),
      toxicology: countWith('toxicology'),
      traditionalMtcAssociations: items.filter(item => item.traditionalMtcAssociations.length > 0).length,
    },
    items,
  };
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith('--')) continue;
    const key = value.slice(2);
    args[key] = argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[++index] : true;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outputPath = args.out ? path.resolve(args.out) : defaultOutputPath;
  const markdownPath = args.markdown ? path.resolve(args.markdown) : defaultMarkdownPath;
  const existingWikipediaReferences = args.refreshWikipedia
    ? new Map()
    : await loadExistingWikipediaReferences(outputPath);
  const catalog = await buildCatalog({
    textDirectory: args.text ? path.resolve(args.text) : defaultTextDirectory,
    existingWikipediaReferences,
  });
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.mkdir(path.dirname(markdownPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
  await fs.writeFile(markdownPath, toMarkdown(catalog), 'utf8');
  process.stdout.write(`${JSON.stringify({ outputPath, markdownPath, counts: catalog.counts }, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch(error => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
