import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');
const defaultPdfRoot = path.join(projectRoot, 'frontend', '.local-source-assets', 'pdf-sources');

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

function pathExists(filePath) {
  return fsSync.existsSync(filePath);
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function readOptionalText(filePath) {
  if (!filePath || !pathExists(filePath)) return '';
  return fs.readFile(filePath, 'utf8');
}

function normalizeLocalPath(root, relativePath) {
  if (!relativePath) return null;
  return path.join(root, String(relativePath).replaceAll('/', path.sep));
}

async function loadAvailableSourceKeys(pdfRoot) {
  const indexPath = path.join(pdfRoot, 'source-index.local.json');
  if (!pathExists(indexPath)) return [];
  const index = await readJson(indexPath);
  return (index.sources || [])
    .filter(source => source.knowledgeDomain === 'psicologia')
    .map(source => source.key);
}

async function selectedSourceKeys(args, pdfRoot) {
  const explicit = splitArg(args.source || args.sources);
  if (explicit.length && !explicit.includes('all')) return explicit;
  const keys = await loadAvailableSourceKeys(pdfRoot);
  if (keys.length) return keys;
  return (await fs.readdir(pdfRoot, { withFileTypes: true }))
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .filter(key => pathExists(path.join(pdfRoot, key, 'manifest.json')));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function cleanText(rawText) {
  const removedNoise = [];
  let text = String(rawText || '').normalize('NFC');

  const machineTranslatedPattern = /\bMachine Translated by Google\b/gi;
  if (machineTranslatedPattern.test(text)) {
    removedNoise.push('machine_translated_by_google');
    text = text.replace(machineTranslatedPattern, ' ');
  }

  text = text
    .replace(/\u00ad/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/\ufb00/g, 'ff')
    .replace(/\ufb01/g, 'fi')
    .replace(/\ufb02/g, 'fl')
    .replace(/\ufb03/g, 'ffi')
    .replace(/\ufb04/g, 'ffl')
    .replace(/(\p{L})-\s*\n\s*(\p{Ll})/gu, '$1$2')
    .replace(/(\p{L})-\s{1,3}(\p{Ll}{2,})/gu, '$1$2')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([([{])\s+/g, '$1')
    .replace(/\s+([)\]}])/g, '$1')
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { text, removedNoise };
}

function uppercaseRatio(text) {
  const letters = [...String(text || '').matchAll(/\p{L}/gu)].map(match => match[0]);
  if (!letters.length) return 0;
  const upper = letters.filter(letter => letter === letter.toLocaleUpperCase('pt-BR')).length;
  return upper / letters.length;
}

function extractHeadings(text) {
  const headings = [];
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  const prefix = normalized.replace(/^\d+\s+/, '').slice(0, 160).trim();
  if (prefix.length >= 8 && prefix.length <= 140 && uppercaseRatio(prefix) > 0.72) {
    headings.push(prefix);
  }

  const patterns = [
    /\b(?:CAP[IÍ]TULO|PARTE|SE[CÇ][AÃ]O)\s+[0-9IVXLCDM]+[^.!?]{0,110}/giu,
    /\b\d+(?:\.\d+){0,3}\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][^.!?]{8,110}/gu,
  ];

  for (const pattern of patterns) {
    for (const match of normalized.matchAll(pattern)) {
      const heading = match[0].trim();
      if (heading.length >= 8 && heading.length <= 140) headings.push(heading);
      if (headings.length >= 5) break;
    }
  }

  return unique(headings).slice(0, 5);
}

function pageFileName(page, extension) {
  return `page-${String(page).padStart(3, '0')}.${extension}`;
}

async function readPageSourceText(sourceRoot, pageIndex) {
  const extractionPath = normalizeLocalPath(sourceRoot, pageIndex.extraction?.file);
  const embeddedText = await readOptionalText(extractionPath);
  const ocrPath = normalizeLocalPath(sourceRoot, pageIndex.ocr?.file)
    || path.join(sourceRoot, 'ocr', pageFileName(pageIndex.pageNumber, 'txt'));
  const ocrText = await readOptionalText(ocrPath);

  if (embeddedText.trim().length >= 60 || !ocrText.trim()) {
    return {
      method: embeddedText.trim() ? 'embedded-text' : 'none',
      text: embeddedText,
      confidence: embeddedText.trim() ? 1 : 0,
      sourceFile: pageIndex.extraction?.file || null,
    };
  }

  const rawConfidence = pageIndex.ocr?.confidence;
  return {
    method: pageIndex.ocr?.method ? `ocr-${pageIndex.ocr.method}` : 'ocr-tesseract',
    text: ocrText,
    confidence: Number.isFinite(rawConfidence) ? Math.round(rawConfidence) / 100 : null,
    sourceFile: pageIndex.ocr?.file || path.posix.join('ocr', pageFileName(pageIndex.pageNumber, 'txt')),
  };
}

async function cleanSource(pdfRoot, sourceKey, generatedAt) {
  const sourceRoot = path.join(pdfRoot, sourceKey);
  const manifestPath = path.join(sourceRoot, 'manifest.json');
  if (!pathExists(manifestPath)) {
    throw new Error(`Manifesto nao encontrado para ${sourceKey}: ${manifestPath}`);
  }

  const manifest = await readJson(manifestPath);
  const pages = [];
  const methodCounts = {};
  let removedNoiseCount = 0;

  for (const pageIndex of manifest.pages || []) {
    const sourceText = await readPageSourceText(sourceRoot, pageIndex);
    const cleaned = cleanText(sourceText.text);
    removedNoiseCount += cleaned.removedNoise.length;
    const flags = [...cleaned.removedNoise.map(flag => `ruido removido: ${flag}`)];
    let status = 'ok';

    if (!cleaned.text) {
      status = 'skipped';
      flags.push('pagina em branco ou separador sem texto');
    } else if (cleaned.text.length < 12 && /^[\d\s.ivxlcdm:-]+$/iu.test(cleaned.text)) {
      status = 'skipped';
      flags.push('pagina em branco ou separador sem texto');
    } else if (sourceText.confidence !== null && sourceText.confidence < 0.9) {
      status = 'low_confidence';
      flags.push('confidence < 0.9');
    }

    methodCounts[sourceText.method] = (methodCounts[sourceText.method] || 0) + 1;
    pages.push({
      page: pageIndex.pageNumber,
      method: sourceText.method,
      status,
      text: cleaned.text,
      headings: extractHeadings(cleaned.text),
      confidence: sourceText.confidence,
      flags,
      passes: sourceText.method.startsWith('ocr-') ? 1 : sourceText.method === 'embedded-text' ? 1 : 0,
      sourceFile: sourceText.sourceFile,
      imageUrl: pageIndex.image?.publicUrl || null,
    });
  }

  const transcript = {
    schemaVersion: 'psych-transcript.local.v1',
    generatedAt,
    source: {
      key: manifest.source.key,
      title: manifest.source.title,
      authors: manifest.source.authors,
      originalLanguage: manifest.source.originalLanguage,
      knowledgeDomain: manifest.source.knowledgeDomain,
      curationTarget: manifest.source.curationTarget,
      candidateExtractionPolicy: manifest.source.candidateExtractionPolicy,
      pageCount: manifest.pageCount,
    },
    policy: {
      status: 'review',
      discipline: 'psicologia',
      requiresProfessionalAudit: true,
      clinicalActivation: 'none',
      rule: 'Transcricao local para curadoria; nao publicar nem ativar sem revisao profissional.',
    },
    counts: {
      pages: pages.length,
      ok: pages.filter(page => page.status === 'ok').length,
      lowConfidence: pages.filter(page => page.status === 'low_confidence').length,
      imageOnly: pages.filter(page => page.status === 'image_only').length,
      skipped: pages.filter(page => page.status === 'skipped').length,
      removedNoise: removedNoiseCount,
      methods: methodCounts,
    },
    pages,
  };

  const ocrDir = path.join(sourceRoot, 'ocr');
  await fs.mkdir(ocrDir, { recursive: true });
  const outputPath = path.join(ocrDir, 'transcript.local.json');
  await fs.writeFile(outputPath, `${JSON.stringify(transcript, null, 2)}\n`, 'utf8');
  return { sourceKey, outputPath, counts: transcript.counts };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pdfRoot = path.resolve(args.pdfRoot || defaultPdfRoot);
  const generatedAt = new Date().toISOString();
  const keys = await selectedSourceKeys(args, pdfRoot);
  if (!keys.length) throw new Error('Nenhuma fonte selecionada para limpeza.');

  const results = [];
  for (const key of keys) {
    console.log(`[${key}] limpando transcript`);
    results.push(await cleanSource(pdfRoot, key, generatedAt));
  }

  console.log(JSON.stringify({
    generatedAt,
    sources: results.map(result => ({
      key: result.sourceKey,
      transcript: path.relative(projectRoot, result.outputPath),
      counts: result.counts,
    })),
  }, null, 2));
}

export {
  cleanText,
  extractHeadings,
  selectedSourceKeys,
};

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
