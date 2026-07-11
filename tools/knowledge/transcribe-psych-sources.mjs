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

async function buildFallbackWorksheet(pdfRoot, sourceKey, generatedAt) {
  const sourceRoot = path.join(pdfRoot, sourceKey);
  const reportPath = path.join(sourceRoot, 'ocr', 'validation-report.local.json');
  const transcriptPath = path.join(sourceRoot, 'ocr', 'transcript.local.json');
  if (!pathExists(reportPath)) throw new Error(`Relatorio de validacao nao encontrado para ${sourceKey}.`);
  if (!pathExists(transcriptPath)) throw new Error(`Transcript nao encontrado para ${sourceKey}.`);

  const report = await readJson(reportPath);
  const transcript = await readJson(transcriptPath);
  const pagesByNumber = new Map(transcript.pages.map(page => [page.page, page]));
  const selectedPages = report.pagesForFallback || [];
  const entries = selectedPages.map(page => {
    const transcriptPage = pagesByNumber.get(page.page) || {};
    return {
      sourceKey,
      pdfPage: page.page,
      currentMethod: page.method,
      currentConfidence: page.confidence,
      flags: page.flags,
      imageUrl: transcriptPage.imageUrl || null,
      currentSnippet: String(transcriptPage.text || '').slice(0, 900),
      status: 'pending_professional_or_vision_review',
      instruction: 'Reler a imagem da pagina e substituir apenas se a transcricao atual estiver ilegivel ou incompleta; nao resumir nem inventar.',
    };
  });

  const worksheet = {
    schemaVersion: 'psych-vision-fallback-worksheet.local.v1',
    generatedAt,
    source: report.source,
    policy: {
      status: 'review',
      requiresProfessionalAudit: true,
      clinicalActivation: 'none',
      note: 'Este arquivo e uma fila local para fallback de visao/humano. Este script nao chama LLM externo nem decide desempate automaticamente.',
    },
    counts: {
      pages: entries.length,
    },
    entries,
  };

  const outputPath = path.join(sourceRoot, 'ocr', 'vision-fallback-worksheet.local.json');
  await fs.writeFile(outputPath, `${JSON.stringify(worksheet, null, 2)}\n`, 'utf8');
  return { sourceKey, outputPath, counts: worksheet.counts };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pdfRoot = path.resolve(args.pdfRoot || defaultPdfRoot);
  const generatedAt = new Date().toISOString();
  const keys = await selectedSourceKeys(args, pdfRoot);
  if (!keys.length) throw new Error('Nenhuma fonte selecionada para fallback.');

  const results = [];
  for (const key of keys) {
    console.log(`[${key}] preparando worksheet de fallback`);
    results.push(await buildFallbackWorksheet(pdfRoot, key, generatedAt));
  }

  console.log(JSON.stringify({
    generatedAt,
    sources: results.map(result => ({
      key: result.sourceKey,
      worksheet: path.relative(projectRoot, result.outputPath),
      counts: result.counts,
    })),
  }, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
