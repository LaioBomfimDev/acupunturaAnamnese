import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
const pdfJsPath = 'file:///C:/Users/m/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/pdfjs-dist/legacy/build/pdf.mjs';

const DEFAULT_PDF = 'C:/Users/m/Downloads/Ednea Martins - Atlas dos Pontos de Acupuntura - Guia de Localização (1).pdf';
const DEFAULT_OUTPUT = path.join(projectRoot, 'docs', 'ednea-atlas-pages.json');
const DEFAULT_TEXT_OUTPUT = path.join(projectRoot, 'docs', 'ednea-atlas-pages.txt');

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

function normalizeWhitespace(text) {
  return String(text || '')
    .replace(/\u0000/g, '')
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pdfPath = args.pdf || DEFAULT_PDF;
  const outputPath = path.resolve(args.output || DEFAULT_OUTPUT);
  const textOutputPath = path.resolve(args.textOutput || DEFAULT_TEXT_OUTPUT);

  const pdfjsLib = await import(pdfJsPath);
  const data = new Uint8Array(await fs.readFile(pdfPath));
  const doc = await pdfjsLib.getDocument({ data, disableWorker: true }).promise;
  const pages = [];
  const textLines = [];

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const text = normalizeWhitespace(textContent.items.map(item => item.str).join(' '));
    pages.push({
      pageNumber,
      text,
      itemCount: textContent.items.length,
    });
    textLines.push(`\n\n===== PDF_PAGE ${pageNumber} =====\n${text}`);

    if (pageNumber % 100 === 0) {
      console.log(`Extracted ${pageNumber}/${doc.numPages} pages`);
    }
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify({
    sourcePdf: pdfPath,
    extractedAt: new Date().toISOString(),
    pageCount: doc.numPages,
    pages,
  }, null, 2)}\n`, 'utf8');
  await fs.writeFile(textOutputPath, textLines.join(''), 'utf8');
  console.log(`Wrote ${doc.numPages} pages to ${outputPath}`);
  console.log(`Wrote text dump to ${textOutputPath}`);
}

await main();
