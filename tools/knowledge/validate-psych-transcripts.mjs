import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { selectedSourceKeys } from './clean-psych-text.mjs';

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

function pathExists(filePath) {
  return fsSync.existsSync(filePath);
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

function countMatches(text, pattern) {
  return [...String(text || '').matchAll(pattern)].length;
}

function languageSignal(text) {
  const value = String(text || '').toLowerCase();
  return {
    pt: countMatches(value, /\b(de|da|do|das|dos|para|com|em|uma|que|por|avaliacao|transtorno|paciente|desenvolvimento)\b/giu),
    en: countMatches(value, /\b(the|and|of|in|with|assessment|disorder|patient|development|criteria|section)\b/giu),
    es: countMatches(value, /\b(el|la|los|las|del|con|sin|trastorno|paciente|desarrollo|criterios)\b/giu),
  };
}

function suspiciousTokenRatio(text) {
  const tokens = String(text || '').match(/\b[\p{L}\p{N}][\p{L}\p{N}'-]{2,}\b/gu) || [];
  if (!tokens.length) return 0;
  const suspicious = tokens.filter(token => {
    if (/^[A-Z]?\d+[A-Z]?(?:[.-]\d+)?$/u.test(token)) return false;
    if (/^\d+[A-Z]+\d*$/u.test(token)) return false;
    return /\p{Ll}\d\p{Ll}|\p{Ll}\d$|^\d\p{Ll}/u.test(token)
      || /[�□■]/u.test(token)
      || /[^\p{L}\p{N}'-]/u.test(token);
  }).length;
  return suspicious / tokens.length;
}

function validatePage(page) {
  const cleaningNotes = (page.flags || []).filter(flag => String(flag).startsWith('ruido removido:'));
  const flags = (page.flags || []).filter(flag => !String(flag).startsWith('ruido removido:'));
  const text = String(page.text || '');
  const charCount = text.length;
  const benignSkipped = page.status === 'skipped'
    && flags.some(flag => String(flag).includes('pagina em branco ou separador'));

  if (benignSkipped) {
    return {
      page: page.page,
      method: page.method,
      status: 'ok',
      charCount,
      confidence: page.confidence,
      cleaningNotes,
      flags: [...new Set(flags)],
    };
  }

  if (page.status !== 'ok') flags.push(`status ${page.status}`);
  if (!text.trim()) flags.push('sem texto para validar');
  if (charCount > 0 && charCount < 60) flags.push('texto muito curto');
  if (page.confidence !== null && page.confidence !== undefined && page.confidence < 0.9) {
    flags.push('confidence < 0.9');
  }
  if (/\p{Ll}\d\p{Ll}/u.test(text)) flags.push('digito no meio de palavra');
  if (/(?:\b\p{L}\b\s+){6,}\b\p{L}\b/gu.test(text)) flags.push('sequencia de letras soltas');
  if (/\p{L}-\s+\p{Ll}/u.test(text)) flags.push('hifen de quebra de linha nao resolvido');

  const suspiciousRatio = suspiciousTokenRatio(text);
  if (suspiciousRatio > 0.08) {
    flags.push(`taxa de tokens suspeitos ${(suspiciousRatio * 100).toFixed(0)}%`);
  }

  const language = languageSignal(text);
  if (language.en > Math.max(language.pt, language.es) * 1.3 && language.en > 10) {
    flags.push('mudanca brusca de idioma: ingles');
  }
  if (language.es > Math.max(language.pt, language.en) * 1.3 && language.es > 10) {
    flags.push('mudanca brusca de idioma: espanhol');
  }

  return {
    page: page.page,
    method: page.method,
    status: flags.length ? 'flagged' : 'ok',
    charCount,
    confidence: page.confidence,
    cleaningNotes,
    flags: [...new Set(flags)],
  };
}

function buildReport(transcript, validations, generatedAt) {
  const flaggedPages = validations.filter(page => page.status === 'flagged');
  const fallbackQualityPattern = /sem texto|texto muito curto|confidence|tokens suspeitos|digito|letras soltas|hifen|status image_only|status low_confidence/u;
  const pagesForFallback = flaggedPages.filter(page => {
    return page.flags.some(flag => fallbackQualityPattern.test(flag));
  });
  const methodCounts = validations.reduce((counts, page) => {
    counts[page.method] = (counts[page.method] || 0) + 1;
    return counts;
  }, {});

  return {
    schemaVersion: 'psych-validation-report.local.v1',
    generatedAt,
    source: transcript.source,
    counts: {
      pages: validations.length,
      okPages: validations.length - flaggedPages.length,
      flaggedPages: flaggedPages.length,
      fallbackCandidatePages: pagesForFallback.length,
      flaggedPercent: validations.length ? Math.round((flaggedPages.length / validations.length) * 10000) / 100 : 0,
      methods: methodCounts,
    },
    deterministicRules: [
      'status diferente de ok',
      'texto ausente ou muito curto',
      'confidence < 0.9',
      'digito no meio de palavra',
      'sequencia de letras soltas',
      'hifen de quebra de linha nao resolvido',
      'taxa de tokens suspeitos acima de 8%',
      'mudanca brusca de idioma',
    ],
    flaggedPages,
    pagesForFallback,
  };
}

async function validateSource(pdfRoot, sourceKey, generatedAt) {
  const sourceRoot = path.join(pdfRoot, sourceKey);
  const transcriptPath = path.join(sourceRoot, 'ocr', 'transcript.local.json');
  if (!pathExists(transcriptPath)) {
    throw new Error(`Transcript nao encontrado para ${sourceKey}: ${transcriptPath}`);
  }

  const transcript = await readJson(transcriptPath);
  const validations = transcript.pages.map(validatePage);
  const report = buildReport(transcript, validations, generatedAt);
  const outputPath = path.join(sourceRoot, 'ocr', 'validation-report.local.json');
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return { sourceKey, outputPath, counts: report.counts };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pdfRoot = path.resolve(args.pdfRoot || defaultPdfRoot);
  const generatedAt = new Date().toISOString();
  const keys = await selectedSourceKeys(args, pdfRoot);
  if (!keys.length) throw new Error('Nenhuma fonte selecionada para validacao.');

  const results = [];
  for (const key of keys) {
    console.log(`[${key}] validando transcript`);
    results.push(await validateSource(pdfRoot, key, generatedAt));
  }

  console.log(JSON.stringify({
    generatedAt,
    sources: results.map(result => ({
      key: result.sourceKey,
      report: path.relative(projectRoot, result.outputPath),
      counts: result.counts,
    })),
  }, null, 2));
}

export {
  suspiciousTokenRatio,
  validatePage,
};

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
