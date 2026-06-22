import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

globalThis.DOMMatrix = class DOMMatrix {
  constructor() {
    this.a = 1;
    this.b = 0;
    this.c = 0;
    this.d = 1;
    this.e = 0;
    this.f = 0;
  }

  multiplySelf() { return this; }
  preMultiplySelf() { return this; }
  translateSelf() { return this; }
  scaleSelf() { return this; }
  invertSelf() { return this; }
};
globalThis.ImageData = class ImageData {};
globalThis.Path2D = class Path2D {};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');

const runtimeNodeModules = path.join(
  os.homedir(),
  '.cache',
  'codex-runtimes',
  'codex-primary-runtime',
  'dependencies',
  'node',
  'node_modules',
);
const pdfJsPath = pathToFileURL(path.join(runtimeNodeModules, 'pdfjs-dist', 'legacy', 'build', 'pdf.mjs')).href;
const pdfJsWorkerPath = path.join(runtimeNodeModules, 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.mjs');
const pdfJsStandardFontsUrl = pathToFileURL(path.join(runtimeNodeModules, 'pdfjs-dist', 'standard_fonts')).href;
const defaultOutputRoot = path.join(projectRoot, 'frontend', '.local-source-assets', 'pdf-sources');
const defaultSummaryPath = path.join(projectRoot, 'docs', 'pdf-source-ingestion-2026-06-05.md');
const defaultCatalogPath = path.join(defaultOutputRoot, 'source-catalog.local.json');
const defaultLocalOcrNodeModules = path.join(projectRoot, 'frontend', '.local-source-assets', 'pdf-ocr-node', 'node_modules');
const defaultOcrNodeModules = path.join(os.tmpdir(), 'sistema-acup-ocr', 'node_modules');
const REQUIRED_OCR_PACKAGES = [
  'tesseract.js',
  'tesseract.js-core',
  'regenerator-runtime',
];
const SOURCE_ONLY_CANDIDATE_POLICIES = new Set([
  'none',
  'skipacupointcandidates',
  'sourceonly',
  'sourceonlynopointcandidatescan',
]);

const SOURCE_DEFINITIONS = [
  {
    key: 'sumiko-ear-acupuncture-clinical-treatment',
    title: 'Ear Acupuncture Clinical Treatment',
    authors: ['Sumiko Knudsen'],
    originalLanguage: 'en',
    sourceType: 'auriculoterapia livro clinico',
    path: 'C:/Users/m/Downloads/Ear Acupuncture Clinical Treatment (Sumiko Knudsen) (z-library.sk, 1lib.sk, z-lib.sk).pdf',
    use: 'Fonte bruta de apoio para auriculoterapia; nao exibir texto original em ficha de ponto sem sintese pt-BR revisada.',
  },
  {
    key: 'scavone-manual-auriculoterapia',
    title: 'Manual de Auriculoterapia: Acupuntura Auricular Francesa e Chinesa',
    authors: ['Alessandra M. P. Scavone'],
    originalLanguage: 'pt-BR',
    sourceType: 'auriculoterapia manual',
    path: 'C:/Users/m/Downloads/Manual de Auriculoterapia Acupuntura Auricular Francesa e Chinesa (Scavone, Alessandra M. P.) (z-library.sk, 1lib.sk, z-lib.sk).pdf',
    use: 'Fonte pt-BR para curadoria auricular; ainda exige OCR limpo, trecho rastreavel e revisao profissional.',
  },
  {
    key: 'long-acupuncture-trials-risk-of-bias',
    title: 'Do acupuncture trials have lower risk of bias over the last five decades',
    authors: ['Youlin Long', 'Rui Chen', 'Qiong Guo', 'outros'],
    originalLanguage: 'en',
    sourceType: 'artigo metodologico',
    path: 'C:/Users/m/Downloads/Do acupuncture trials have lower risk of bias over the last five decades A methodological study of 4 715 randomized controlled… (Long, Youlin Chen, Rui Guo, Qiong Luo etc.) (z-library.sk, 1lib.sk, z-lib.sk).pdf',
    use: 'Fonte metodologica transversal; nao aprova ponto e nao entra em ficha de ponto sem sintese pt-BR.',
  },
  {
    key: 'huang-acupuncture-fibromyalgia-stroke-cohort',
    title: 'Acupuncture decreased the risk of stroke among patients with fibromyalgia in Taiwan',
    authors: ['Ming-Cheng Huang', 'Hung-Rong Yen', 'outros'],
    originalLanguage: 'en',
    sourceType: 'artigo de coorte',
    path: 'C:/Users/m/Downloads/Acupuncture decreased the risk of stroke among patients with fibromyalgia in Taiwan A nationwide matched cohort study (Huang, Ming-Cheng Yen, Hung-Rong Lin etc.) (z-library.sk, 1lib.sk, z-lib.sk).pdf',
    use: 'Fonte cientifica transversal; nao aprova ponto e nao entra em ficha de ponto sem sintese pt-BR.',
  },
  {
    key: 'ednea-garcia-guia-ilustrado-referencia',
    title: 'Pontos de Acupuntura: Guia Ilustrado de Referencia',
    authors: ['Ednea Martins', 'E. Garcia'],
    originalLanguage: 'pt-BR',
    sourceType: 'atlas de pontos sistemicos',
    path: 'C:/Users/m/Downloads/Ednea Martins; E. García - Pontos de Acupuntura - Guia Ilustrado de Referência.pdf',
    use: 'Fonte pt-BR para localizacao e conferencia visual; usar como rascunho ate revisao profissional.',
  },
  {
    key: 'livro-acupuntura-auricular',
    title: 'Livro Acupuntura Auricular',
    authors: [],
    originalLanguage: 'pt-BR',
    sourceType: 'auriculoterapia livro',
    path: 'C:/Users/m/Downloads/Livro-Acupuntura-Auricular.pdf',
    use: 'Fonte pt-BR para curadoria auricular; ainda exige OCR limpo, trecho rastreavel e revisao profissional.',
  },
];

const OPTIONAL_SOURCE_FIELDS = [
  'reference',
  'referenceCitation',
  'publicReferenceUrl',
  'licenseNote',
  'trustTier',
  'curationBatch',
  'knowledgeDomain',
  'curationTarget',
  'candidateExtractionPolicy',
  'intendedUse',
  'clinicalActivationPolicy',
  'notes',
];

function optionalSourceFields(source) {
  const fields = {};
  for (const field of OPTIONAL_SOURCE_FIELDS) {
    const value = source[field];
    if (value !== undefined && value !== null && value !== '') {
      fields[field] = value;
    }
  }
  return fields;
}

function normalizeAuthors(value) {
  if (Array.isArray(value)) {
    return value.map(author => String(author || '').trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value.split(';').map(author => author.trim()).filter(Boolean);
  }
  return [];
}

function normalizeSourceDefinition(source, { catalogDir = projectRoot, origin = 'inline', index = 0 } = {}) {
  const key = String(source.key || '').trim();
  const title = String(source.title || '').trim();
  const sourcePath = String(source.path || source.localPath || '').trim();

  if (!key) throw new Error(`Fonte sem key em ${origin}#${index + 1}.`);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(key)) {
    throw new Error(`Key invalida em ${origin}#${index + 1}: ${key}. Use slug em minusculas com hifens.`);
  }
  if (!title) throw new Error(`Fonte ${key} sem title em ${origin}.`);
  if (!sourcePath) throw new Error(`Fonte ${key} sem path em ${origin}.`);

  return {
    key,
    title,
    authors: normalizeAuthors(source.authors),
    originalLanguage: String(source.originalLanguage || 'unknown').trim() || 'unknown',
    sourceType: String(source.sourceType || 'fonte clinica').trim() || 'fonte clinica',
    path: path.isAbsolute(sourcePath) ? sourcePath : path.resolve(catalogDir, sourcePath),
    use: String(source.use || source.intendedUse || 'Fonte bruta para curadoria; exige revisao profissional antes de uso clinico.').trim(),
    ...optionalSourceFields(source),
  };
}

async function loadSourceCatalog(catalogPath) {
  const resolvedPath = path.resolve(String(catalogPath || defaultCatalogPath));
  const parsed = JSON.parse(await fs.readFile(resolvedPath, 'utf8'));
  const sources = Array.isArray(parsed) ? parsed : parsed.sources;
  if (!Array.isArray(sources)) {
    throw new Error(`Catalogo sem array sources: ${resolvedPath}`);
  }

  return sources.map((source, index) => normalizeSourceDefinition(source, {
    catalogDir: path.dirname(resolvedPath),
    origin: resolvedPath,
    index,
  }));
}

async function loadSourceDefinitions(args) {
  if (!args.catalog) {
    return SOURCE_DEFINITIONS.map((source, index) => normalizeSourceDefinition(source, {
      origin: 'SOURCE_DEFINITIONS',
      index,
    }));
  }

  const catalogPath = args.catalog === true ? defaultCatalogPath : args.catalog;
  const catalogSources = await loadSourceCatalog(catalogPath);
  if (!args.includeDefaultSources) return catalogSources;

  return [
    ...SOURCE_DEFINITIONS.map((source, index) => normalizeSourceDefinition(source, {
      origin: 'SOURCE_DEFINITIONS',
      index,
    })),
    ...catalogSources,
  ];
}

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

function splitArg(value) {
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function normalizeWhitespace(text) {
  return String(text || '')
    .replace(/\u0000/g, '')
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripDiacritics(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function languageKey(value) {
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

function sourceSkipsPointCandidateExtraction(source) {
  return SOURCE_ONLY_CANDIDATE_POLICIES.has(languageKey(
    source.candidateExtractionPolicy
      || source.pointCandidateExtraction
      || source.pointCandidatePolicy
      || '',
  ));
}

function isPtBrLanguage(value) {
  const key = languageKey(value);
  return key === 'ptbr' || key === 'pt' || key === 'por' || key === 'portugues';
}

function ocrLangForSource(source) {
  return isPtBrLanguage(source.originalLanguage) ? 'por' : 'eng';
}

function pageFileName(page, extension) {
  return `page-${String(page).padStart(3, '0')}.${extension}`;
}

function selectSources(args, sourceDefinitions = SOURCE_DEFINITIONS) {
  const wanted = splitArg(args.sources || args.source || 'all');
  if (!wanted.length || wanted.includes('all')) return sourceDefinitions;
  const wantedKeys = new Set(wanted.map(item => item.toLowerCase()));
  return sourceDefinitions.filter(source => wantedKeys.has(source.key.toLowerCase()));
}

function selectedPages(args, pageCount) {
  const explicit = splitArg(args.pages).map(Number).filter(Number.isFinite);
  const pages = explicit.length
    ? explicit
    : Array.from({ length: pageCount }, (_, index) => index + 1);
  const limit = Number(args.limit || 0);
  return limit > 0 ? pages.slice(0, limit) : pages;
}

async function pathExists(candidate) {
  try {
    await fs.access(candidate);
    return true;
  } catch {
    return false;
  }
}

async function findChrome(explicitPath) {
  const candidates = [
    explicitPath,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (await pathExists(candidate)) return candidate;
  }

  throw new Error('Chrome ou Edge nao encontrado. Informe --chrome com o caminho do executavel.');
}

function detectLanguageHint(text, fallback) {
  const value = String(text || '');
  const ptHits = (value.match(/\b(de|da|do|das|dos|para|com|em|ponto|auricular|acupuntura|tratamento|dor|localizacao|localização)\b/gi) || []).length;
  const enHits = (value.match(/\b(the|and|of|in|with|treatment|point|acupuncture|pain|ear|method|trial)\b/gi) || []).length;
  const esHits = (value.match(/\b(el|la|las|los|del|con|sin|tratamiento|puntos|dolor|láser|laser|rayo|piel|paciente|terapia|aguja|agujas)\b/gi) || []).length;
  if (esHits > Math.max(ptHits, enHits) * 1.2 && esHits > 4) return 'es';
  if (ptHits >= enHits * 1.5 && ptHits > 4) return 'pt-BR';
  if (enHits > ptHits * 1.5 && enHits > 4) return 'en';
  return fallback || 'unknown';
}

function pointPagePolicyForSource(source) {
  const sourceIsPtBr = isPtBrLanguage(source.originalLanguage);
  if (sourceSkipsPointCandidateExtraction(source)) {
    return {
      pointPageLanguage: 'pt-BR',
      originalLanguage: source.originalLanguage,
      allowRawOriginalInPointPages: false,
      ptBrReviewed: false,
      pointPageEligibleAfterReview: false,
      sourceOnly: true,
      requiresPtBrSynthesis: !sourceIsPtBr,
      requiresProfessionalAudit: true,
      rule: 'Fonte de dominio especifico preservada para curadoria/rastreamento; nao gera rascunho de ponto nem entra no scanner de pontos.',
    };
  }

  return {
    pointPageLanguage: 'pt-BR',
    originalLanguage: source.originalLanguage,
    allowRawOriginalInPointPages: false,
    ptBrReviewed: false,
    pointPageEligibleAfterReview: sourceIsPtBr,
    requiresPtBrSynthesis: !sourceIsPtBr,
    requiresProfessionalAudit: true,
    rule: sourceIsPtBr
      ? 'Texto pt-BR pode virar rascunho de ponto somente apos OCR limpo, trecho rastreavel e revisao profissional.'
      : 'Texto original estrangeiro fica restrito a fonte bruta; ficha de ponto exige sintese pt-BR revisada.',
  };
}

async function extractTextPages(pdfPath) {
  const pdfjsLib = await importPdfJsForTextExtraction();
  const data = new Uint8Array(await fs.readFile(pdfPath));
  const doc = await pdfjsLib.getDocument({
    data,
    disableWorker: true,
    standardFontDataUrl: `${pdfJsStandardFontsUrl}/`,
    verbosity: 0,
  }).promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const text = normalizeWhitespace(textContent.items.map(item => item.str).join(' '));
    pages.push({
      pageNumber,
      text,
      itemCount: textContent.items.length,
      charCount: text.length,
    });
  }

  return {
    pageCount: doc.numPages,
    pages,
  };
}

async function importPdfJsForTextExtraction() {
  const originalWarn = console.warn;
  console.warn = (...values) => {
    const message = values.map(value => String(value)).join(' ');
    if (message.includes('Cannot load "@napi-rs/canvas" package')) return;
    originalWarn(...values);
  };

  try {
    return await import(pdfJsPath);
  } finally {
    console.warn = originalWarn;
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

async function waitForEndpoint(url, attempts = 80) {
  for (let index = 0; index < attempts; index += 1) {
    try {
      return await getJson(url);
    } catch {
      await delay(250);
    }
  }
  throw new Error(`Timeout aguardando ${url}`);
}

function createCdpClient(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let nextId = 1;
    const pending = new Map();

    ws.onopen = () => {
      resolve({
        send(method, params = {}) {
          const id = nextId;
          nextId += 1;
          ws.send(JSON.stringify({ id, method, params }));
          return new Promise((res, rej) => pending.set(id, { res, rej }));
        },
        close() {
          ws.close();
        },
      });
    };

    ws.onerror = error => reject(error);
    ws.onmessage = event => {
      const message = JSON.parse(event.data);
      if (!message.id || !pending.has(message.id)) return;
      const { res, rej } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) {
        rej(new Error(message.error.message));
      } else {
        res(message.result);
      }
    };
  });
}

function renderHtml({ pdfUrl, pdfJsUrl, workerUrl }) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <style>
      html, body { margin: 0; background: #fff; }
      canvas { display: block; }
    </style>
  </head>
  <body>
    <canvas id="page"></canvas>
    <script type="module">
      try {
        const pdfjsLib = await import(${JSON.stringify(pdfJsUrl)});
        pdfjsLib.GlobalWorkerOptions.workerSrc = ${JSON.stringify(workerUrl)};
        const pdf = await pdfjsLib.getDocument({ url: ${JSON.stringify(pdfUrl)} }).promise;

        window.__renderSourcePage = async function renderSourcePage(pageNumber, scale, quality) {
          const page = await pdf.getPage(pageNumber);
          const viewport = page.getViewport({ scale });
          const canvas = document.getElementById('page');
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          document.documentElement.style.width = canvas.width + 'px';
          document.documentElement.style.height = canvas.height + 'px';
          document.body.style.width = canvas.width + 'px';
          document.body.style.height = canvas.height + 'px';
          const context = canvas.getContext('2d', { alpha: false });
          context.fillStyle = '#fff';
          context.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: context, viewport }).promise;

          return {
            width: canvas.width,
            height: canvas.height,
            dataUrl: canvas.toDataURL('image/webp', quality),
          };
        };

        window.__rendererReady = true;
      } catch (error) {
        window.__renderError = String(error && error.stack || error);
      }
    </script>
  </body>
</html>`;
}

async function waitForRenderer(client) {
  for (let attempt = 0; attempt < 160; attempt += 1) {
    const result = await client.send('Runtime.evaluate', {
      expression: '({ ready: !!window.__rendererReady, error: window.__renderError || null })',
      returnByValue: true,
    });
    const value = result.result.value;
    if (value.ready) return;
    if (value.error) throw new Error(value.error);
    await delay(250);
  }
  throw new Error('Timeout aguardando renderer do PDF.');
}

async function renderPage(client, options) {
  if (!options.force && await pathExists(options.outputPath)) {
    return {
      skipped: true,
      bytes: fsSync.statSync(options.outputPath).size,
    };
  }

  const evaluation = await client.send('Runtime.evaluate', {
    expression: `window.__renderSourcePage(${Number(options.page)}, ${Number(options.scale)}, ${Number(options.quality / 100)})`,
    awaitPromise: true,
    returnByValue: true,
  });

  if (evaluation.exceptionDetails) {
    throw new Error(evaluation.exceptionDetails.text || `Falha ao renderizar pagina PDF ${options.page}`);
  }

  const result = evaluation.result.value;
  const [, base64] = String(result.dataUrl || '').split(',');
  if (!base64) throw new Error(`Canvas nao retornou imagem para pagina PDF ${options.page}`);

  await fs.writeFile(options.outputPath, Buffer.from(base64, 'base64'));

  return {
    width: result.width,
    height: result.height,
    bytes: fsSync.statSync(options.outputPath).size,
  };
}

async function renderPagesForSource(source, pages, options) {
  if (options.renderMode === 'none') {
    return collectExistingRenderedPages(source, pages, options);
  }

  const chromePath = await findChrome(options.chrome);
  const tempRoot = path.join(os.tmpdir(), `pdf-source-render-${source.key}-${Date.now()}`);
  const userDataDir = path.join(tempRoot, 'chrome-profile');
  const htmlPath = path.join(tempRoot, 'render.html');
  const port = Number(options.port || 9451);
  const pdfUrl = pathToFileURL(source.path).href;
  const pdfJsUrl = pdfJsPath;
  const workerUrl = pathToFileURL(pdfJsWorkerPath).href;
  const rendered = new Map();

  await fs.mkdir(options.pagesDir, { recursive: true });
  await fs.mkdir(tempRoot, { recursive: true });

  const chrome = spawn(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--disable-web-security',
    '--allow-file-access-from-files',
    '--no-sandbox',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  try {
    await waitForEndpoint(`http://127.0.0.1:${port}/json/version`);
    const target = await getJson(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
    const client = await createCdpClient(target.webSocketDebuggerUrl);
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await fs.writeFile(htmlPath, renderHtml({ pdfUrl, pdfJsUrl, workerUrl }), 'utf8');
    await client.send('Page.navigate', { url: pathToFileURL(htmlPath).href });
    await waitForRenderer(client);

    for (const page of pages) {
      const outputPath = path.join(options.pagesDir, pageFileName(page, 'webp'));
      const pageResult = await renderPage(client, {
        page,
        scale: options.scale,
        quality: options.quality,
        force: options.force,
        outputPath,
      });
      rendered.set(page, {
        file: path.relative(options.sourceRoot, outputPath).replaceAll(path.sep, '/'),
        publicUrl: `/knowledge/source-assets/pdf-sources/${source.key}/pages/${pageFileName(page, 'webp')}`,
        ...pageResult,
      });
      if (page % 25 === 0 || page === pages.at(-1)) {
        console.log(`[${source.key}] rendered ${page}/${pages.at(-1)}`);
      }
    }

    client.close();
  } finally {
    chrome.kill();
    await delay(500);
    try {
      await fs.rm(tempRoot, { recursive: true, force: true });
    } catch (error) {
      console.warn(`Aviso: nao foi possivel limpar pasta temporaria agora (${error.code || error.message}).`);
    }
  }

  return rendered;
}

function collectExistingRenderedPages(source, pages, options) {
  const rendered = new Map();
  for (const page of pages) {
    const outputPath = path.join(options.pagesDir, pageFileName(page, 'webp'));
    if (!fsSync.existsSync(outputPath)) continue;
    rendered.set(page, {
      skipped: true,
      file: path.relative(options.sourceRoot, outputPath).replaceAll(path.sep, '/'),
      publicUrl: `/knowledge/source-assets/pdf-sources/${source.key}/pages/${pageFileName(page, 'webp')}`,
      bytes: fsSync.statSync(outputPath).size,
    });
  }
  return rendered;
}

function missingOcrPackages(nodeModules) {
  return REQUIRED_OCR_PACKAGES.filter(packageName => {
    return !fsSync.existsSync(path.join(nodeModules, packageName));
  });
}

function selectOcrNodeModules(candidates) {
  for (const candidate of candidates.filter(Boolean)) {
    if (!fsSync.existsSync(path.join(candidate, 'tesseract.js'))) continue;
    if (!missingOcrPackages(candidate).length) return candidate;
  }

  return null;
}

function findOcrNodeModules(args = {}) {
  return selectOcrNodeModules([
    args.ocrNodeModules,
    process.env.SISTEMA_ACUP_OCR_NODE_MODULES,
    defaultLocalOcrNodeModules,
    defaultOcrNodeModules,
    runtimeNodeModules,
  ]);
}

function resolveLangPath(nodeModules, lang) {
  const candidates = [
    path.join(nodeModules, '@tesseract.js-data', lang, '4.0.0_best_int'),
    path.join(nodeModules, '@tesseract.js-data', lang, '4.0.0'),
    path.join(nodeModules, '@tesseract.js-data', lang),
    path.join(nodeModules, 'tesseract.js', 'langs'),
  ];
  return candidates.find(candidate => fsSync.existsSync(candidate)) || null;
}

function loadTesseract(nodeModules) {
  const requireFromOcr = createRequire(path.join(nodeModules, 'package.json'));
  return requireFromOcr('tesseract.js');
}

async function createOcrWorker({ args, lang }) {
  const nodeModules = findOcrNodeModules(args);
  if (!nodeModules) {
    return {
      status: 'unavailable',
      reason: 'Runtime OCR incompleto. Instale localmente com npm install --prefix frontend/.local-source-assets/pdf-ocr-node tesseract.js tesseract.js-core regenerator-runtime @tesseract.js-data/por @tesseract.js-data/eng.',
    };
  }

  try {
    const tesseract = loadTesseract(nodeModules);
    const langPath = resolveLangPath(nodeModules, lang);
    const cachePath = path.join(os.tmpdir(), 'sistema-acup-ocr-cache');
    const worker = await tesseract.createWorker(lang, undefined, {
      cachePath,
      langPath: langPath || undefined,
    });
    return {
      status: 'ready',
      worker,
      nodeModules,
      langPath,
    };
  } catch (error) {
    return {
      status: 'unavailable',
      reason: error?.message || String(error),
    };
  }
}

function pageNeedsOcr(page, mode, minChars) {
  if (mode === 'none') return false;
  if (mode === 'all') return true;
  return page.charCount < minChars;
}

async function runOcrForSource(source, pages, renderedPages, options) {
  const ocrMode = options.ocrMode;
  if (ocrMode === 'none') {
    return { pages: collectExistingOcrPages(pages, options), status: 'skipped' };
  }

  const pagesToOcr = pages.filter(page => pageNeedsOcr(page, ocrMode, options.ocrMinChars));
  if (!pagesToOcr.length) return { pages: new Map(), status: 'not_needed' };

  const lang = ocrLangForSource(source);
  const workerState = await createOcrWorker({ args: options.args, lang });
  if (workerState.status !== 'ready') {
    return {
      pages: new Map(pagesToOcr.map(page => [page.pageNumber, {
        status: 'blocked',
        reason: workerState.reason,
      }])),
      status: 'blocked',
      reason: workerState.reason,
    };
  }

  await fs.mkdir(options.ocrDir, { recursive: true });
  const output = new Map();
  try {
    for (const page of pagesToOcr) {
      const imagePath = path.join(options.pagesDir, pageFileName(page.pageNumber, 'webp'));
      if (!fsSync.existsSync(imagePath)) {
        output.set(page.pageNumber, {
          status: 'blocked',
          reason: 'Imagem renderizada nao encontrada para OCR.',
        });
        continue;
      }

      const ocrPath = path.join(options.ocrDir, pageFileName(page.pageNumber, 'txt'));
      if (!options.force && fsSync.existsSync(ocrPath)) {
        const text = await fs.readFile(ocrPath, 'utf8');
        output.set(page.pageNumber, {
          status: 'cached',
          method: `tesseract-${lang}`,
          charCount: text.trim().length,
          file: path.relative(options.sourceRoot, ocrPath).replaceAll(path.sep, '/'),
        });
        continue;
      }

      const result = await workerState.worker.recognize(imagePath);
      const text = normalizeWhitespace(result.data?.text || '');
      await fs.writeFile(ocrPath, `${text}\n`, 'utf8');
      output.set(page.pageNumber, {
        status: 'done',
        method: `tesseract-${lang}`,
        confidence: result.data?.confidence || null,
        charCount: text.length,
        file: path.relative(options.sourceRoot, ocrPath).replaceAll(path.sep, '/'),
      });

      if (page.pageNumber % 10 === 0 || page.pageNumber === pagesToOcr.at(-1).pageNumber) {
        console.log(`[${source.key}] OCR ${page.pageNumber}/${pagesToOcr.at(-1).pageNumber}`);
      }
    }
  } finally {
    await workerState.worker.terminate();
  }

  return {
    pages: output,
    status: 'done',
    nodeModules: workerState.nodeModules,
    langPath: workerState.langPath,
  };
}

function collectExistingOcrPages(pages, options) {
  const cached = new Map();
  for (const page of pages) {
    const ocrPath = path.join(options.ocrDir, pageFileName(page.pageNumber, 'txt'));
    if (!fsSync.existsSync(ocrPath)) continue;
    const text = fsSync.readFileSync(ocrPath, 'utf8');
    cached.set(page.pageNumber, {
      status: 'cached',
      method: 'tesseract-cached',
      charCount: text.trim().length,
      file: path.relative(options.sourceRoot, ocrPath).replaceAll(path.sep, '/'),
    });
  }
  return cached;
}

async function writeTextPages(sourceRoot, pages) {
  const textDir = path.join(sourceRoot, 'text');
  await fs.mkdir(textDir, { recursive: true });
  for (const page of pages) {
    await fs.writeFile(path.join(textDir, pageFileName(page.pageNumber, 'txt')), `${page.text}\n`, 'utf8');
  }
}

function buildPageIndex({ source, page, rendered, ocr, textDir }) {
  const languageHint = detectLanguageHint(page.text, source.originalLanguage);
  const textFile = path.join(textDir, pageFileName(page.pageNumber, 'txt'));
  return {
    pageNumber: page.pageNumber,
    languageHint,
    extraction: {
      method: page.charCount > 0 ? 'pdf_text' : 'none',
      charCount: page.charCount,
      itemCount: page.itemCount,
      file: path.relative(path.dirname(textDir), textFile).replaceAll(path.sep, '/'),
    },
    ocr: ocr || {
      status: page.charCount > 0 ? 'not_needed_pdf_text_present' : 'not_requested',
    },
    image: rendered ? {
      status: rendered.skipped ? 'cached' : 'rendered',
      file: rendered.file,
      publicUrl: rendered.publicUrl,
      bytes: rendered.bytes,
      width: rendered.width || null,
      height: rendered.height || null,
    } : {
      status: 'not_rendered',
    },
    pointPagePolicy: pointPagePolicyForSource(source),
  };
}

function buildSourceManifest({ source, extracted, pageIndexes, generatedAt }) {
  const text = extracted.pages.map(page => page.text.slice(0, 1200)).join(' ');
  const sourceLanguageHint = detectLanguageHint(text, source.originalLanguage);
  const policy = pointPagePolicyForSource(source);

  return {
    schemaVersion: 'local-pdf-source.v1',
    generatedAt,
    source: {
      key: source.key,
      title: source.title,
      authors: source.authors,
      originalLanguage: source.originalLanguage,
      detectedLanguageHint: sourceLanguageHint,
      sourceType: source.sourceType,
      fileName: path.basename(source.path),
      localPath: source.path,
      use: source.use,
      ...optionalSourceFields(source),
    },
    pageCount: extracted.pageCount,
    counts: {
      pagesIndexed: pageIndexes.length,
      pagesWithPdfText: pageIndexes.filter(page => page.extraction.charCount > 0).length,
      pagesRendered: pageIndexes.filter(page => page.image.status === 'rendered' || page.image.status === 'cached').length,
      pagesOcrDone: pageIndexes.filter(page => page.ocr.status === 'done' || page.ocr.status === 'cached').length,
      pagesOcrBlocked: pageIndexes.filter(page => page.ocr.status === 'blocked').length,
      pagesPointPageEligibleAfterReview: policy.pointPageEligibleAfterReview ? pageIndexes.length : 0,
    },
    policy,
    pages: pageIndexes,
  };
}

async function ingestSource(source, args, outputRoot, generatedAt) {
  if (!await pathExists(source.path)) {
    throw new Error(`PDF nao encontrado: ${source.path}`);
  }

  const sourceRoot = path.join(outputRoot, source.key);
  const pagesDir = path.join(sourceRoot, 'pages');
  const ocrDir = path.join(sourceRoot, 'ocr');
  const textDir = path.join(sourceRoot, 'text');

  console.log(`[${source.key}] extraindo texto PDF`);
  const extracted = await extractTextPages(source.path);
  const pages = selectedPages(args, extracted.pageCount);
  const selectedPageSet = new Set(pages);
  const selectedTextPages = extracted.pages.filter(page => selectedPageSet.has(page.pageNumber));

  if (args.dryRun) {
    return {
      manifest: buildSourceManifest({
        source,
        extracted,
        pageIndexes: selectedTextPages.map(page => buildPageIndex({
          source,
          page,
          rendered: null,
          ocr: null,
          textDir,
        })),
        generatedAt,
      }),
      sourceRoot,
    };
  }

  await fs.mkdir(sourceRoot, { recursive: true });
  await writeTextPages(sourceRoot, selectedTextPages);

  const renderedPages = await renderPagesForSource(source, pages, {
    args,
    sourceRoot,
    pagesDir,
    renderMode: args.render || 'missing',
    force: Boolean(args.force),
    scale: Number(args.scale || 1.25),
    quality: Number(args.quality || 78),
    port: Number(args.port || 9451),
    chrome: args.chrome,
  });

  const ocrResult = await runOcrForSource(source, selectedTextPages, renderedPages, {
    args,
    sourceRoot,
    pagesDir,
    ocrDir,
    ocrMode: args.ocr || 'fallback',
    ocrMinChars: Number(args.ocrMinChars || 60),
    force: Boolean(args.force),
  });

  const pageIndexes = selectedTextPages.map(page => buildPageIndex({
    source,
    page,
    rendered: renderedPages.get(page.pageNumber),
    ocr: ocrResult.pages.get(page.pageNumber),
    textDir,
  }));
  const manifest = buildSourceManifest({ source, extracted, pageIndexes, generatedAt });

  await fs.writeFile(path.join(sourceRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return {
    manifest,
    sourceRoot,
  };
}

function aggregateIndex(results, outputRoot, generatedAt) {
  const sources = results.map(result => {
    const manifest = result.manifest;
    return {
      key: manifest.source.key,
      title: manifest.source.title,
      authors: manifest.source.authors,
      originalLanguage: manifest.source.originalLanguage,
      detectedLanguageHint: manifest.source.detectedLanguageHint,
      sourceType: manifest.source.sourceType,
      fileName: manifest.source.fileName,
      localPath: manifest.source.localPath,
      manifestUrl: `/knowledge/source-assets/pdf-sources/${manifest.source.key}/manifest.json`,
      pageCount: manifest.pageCount,
      counts: manifest.counts,
      policy: manifest.policy,
      ...optionalSourceFields(manifest.source),
    };
  });

  return {
    schemaVersion: 'local-pdf-sources-index.v1',
    generatedAt,
    assetMode: 'local_only_untracked',
    outputRoot,
    policy: {
      pointPagesLanguage: 'pt-BR',
      rawOriginalAllowedInPointPages: false,
      rule: 'Fontes podem ser extraidas, renderizadas e OCRizadas localmente; fichas de ponto so recebem conteudo pt-BR revisado e rastreavel.',
      requiresProfessionalAudit: true,
    },
    counts: {
      sources: sources.length,
      pages: sources.reduce((sum, source) => sum + source.pageCount, 0),
      pagesRendered: sources.reduce((sum, source) => sum + source.counts.pagesRendered, 0),
      pagesOcrDone: sources.reduce((sum, source) => sum + source.counts.pagesOcrDone, 0),
      nonPtBrSources: sources.filter(source => !isPtBrLanguage(source.originalLanguage)).length,
      ptBrSources: sources.filter(source => isPtBrLanguage(source.originalLanguage)).length,
    },
    sources,
  };
}

function summaryMarkdown(index) {
  const rows = index.sources.map(source => {
    const gate = source.policy.sourceOnly
      ? 'fonte de dominio especifico; fora do scanner de pontos'
      : source.policy.requiresPtBrSynthesis
      ? 'bloqueado para ficha ate sintese pt-BR'
      : 'elegivel como rascunho pt-BR apos revisao';
    return `| ${source.title} | ${source.originalLanguage} | ${source.pageCount} | ${source.counts.pagesRendered} | ${source.counts.pagesOcrDone} | ${gate} |`;
  }).join('\n');

  return `# Ingestao local de PDFs da Biblioteca Viva

Gerado em: ${index.generatedAt}

## Regra de idioma e dominio

- Conteudo clinico normalizado no app deve permanecer em pt-BR.
- Texto original em ingles/outro idioma fica apenas como fonte bruta local.
- Fonte nao-pt-BR so pode alimentar ficha de ponto depois de sintese pt-BR revisada, com trecho e pagina rastreaveis.
- Fonte marcada como dominio especifico/source-only fica fora do scanner de pontos.
- Todo item importado destes PDFs permanece em rascunho/revisao e exige auditoria profissional.

## Resultado

| Fonte | Idioma original | Paginas | Telas renderizadas | OCR concluido | Gate para uso |
| --- | --- | ---: | ---: | ---: | --- |
${rows}

## Arquivos locais

- Indice: \`frontend/.local-source-assets/pdf-sources/source-index.local.json\`
- Manifestos: \`frontend/.local-source-assets/pdf-sources/<fonte>/manifest.json\`
- Telas: \`frontend/.local-source-assets/pdf-sources/<fonte>/pages/page-###.webp\`
- Texto extraido: \`frontend/.local-source-assets/pdf-sources/<fonte>/text/page-###.txt\`
- OCR: \`frontend/.local-source-assets/pdf-sources/<fonte>/ocr/page-###.txt\`

Esses arquivos locais sao ignorados pelo Git e nao devem ser publicados no bundle principal.
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outputRoot = path.resolve(args.outputRoot || defaultOutputRoot);
  const summaryPath = path.resolve(args.summary || defaultSummaryPath);
  const generatedAt = new Date().toISOString();
  const sourceDefinitions = await loadSourceDefinitions(args);
  const sources = selectSources(args, sourceDefinitions);

  if (!sources.length) {
    throw new Error('Nenhuma fonte selecionada. Use --sources all ou uma lista de keys.');
  }

  await fs.mkdir(outputRoot, { recursive: true });
  const results = [];
  for (const source of sources) {
    results.push(await ingestSource(source, args, outputRoot, generatedAt));
  }

  const index = aggregateIndex(results, outputRoot, generatedAt);
  if (!args.dryRun) {
    await fs.writeFile(path.join(outputRoot, 'source-index.local.json'), `${JSON.stringify(index, null, 2)}\n`, 'utf8');
    await fs.writeFile(summaryPath, summaryMarkdown(index), 'utf8');
  }

  console.log(JSON.stringify({
    index: path.relative(projectRoot, path.join(outputRoot, 'source-index.local.json')),
    summary: path.relative(projectRoot, summaryPath),
    counts: index.counts,
  }, null, 2));
}

export {
  findOcrNodeModules,
  detectLanguageHint,
  importPdfJsForTextExtraction,
  loadSourceCatalog,
  loadSourceDefinitions,
  missingOcrPackages,
  normalizeSourceDefinition,
  selectOcrNodeModules,
  selectSources,
};

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
