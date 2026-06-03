import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');

const INPUT_CANDIDATES = path.join(projectRoot, 'docs', 'km-agent-ednea-production-candidates.json');
const OUTPUT_DIR = path.join(projectRoot, 'frontend', 'public', 'knowledge', 'source-assets', 'atlas-ednea');
const OUTPUT_INDEX = path.join(OUTPUT_DIR, 'source-index.json');

function toArray(value) {
  return Array.isArray(value) ? value.filter(item => item !== null && item !== undefined) : [];
}

function formatReferenceLabel(atlas) {
  if (!atlas?.reference) return 'Atlas Ednea Martins';
  return `Atlas Ednea Martins, ${atlas.reference}`;
}

function buildSourceItem(candidate) {
  const atlas = candidate.atlas || {};
  const reviewInputs = candidate.reviewInputs || {};
  const pdfPages = toArray(atlas.pdfPages);

  return {
    code: candidate.code || reviewInputs.code || '',
    displayCode: reviewInputs.displayCode || candidate.code || '',
    atlasCode: candidate.atlasCode || '',
    title: atlas.title || reviewInputs.title || '',
    sourceKey: atlas.sourceKey || 'atlas-ednea-martins',
    sourceTitle: atlas.source || 'Atlas da Ednea Martins',
    printedPages: toArray(atlas.printedPages),
    pdfPages,
    referenceLabel: formatReferenceLabel(atlas),
    status: candidate.status || 'review_needed',
    confidence: candidate.confidence || 'low',
    reviewRequired: candidate.requiresHumanReview !== false,
    textAvailable: Boolean(atlas.sectionText),
    imageAvailable: false,
    imageUrls: pdfPages.map(page => ({
      pdfPage: page,
      url: null,
      status: 'not_rendered',
    })),
  };
}

const raw = await fs.readFile(INPUT_CANDIDATES, 'utf8');
const data = JSON.parse(raw);
const candidates = Array.isArray(data.candidates) ? data.candidates : [];
const items = candidates
  .map(buildSourceItem)
  .filter(item => item.code)
  .sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true }));

const output = {
  schemaVersion: 'atlas-source-index.v1',
  generatedAt: new Date().toISOString(),
  assetMode: 'metadata_only',
  source: {
    key: 'atlas-ednea-martins',
    title: 'Atlas dos Pontos de Acupuntura: Guia de Localizacao',
    author: 'Ednea Martins',
    note: 'Manifesto publico leve para curadoria; paginas renderizadas devem ser carregadas sob demanda em fluxo protegido.',
  },
  counts: {
    total: items.length,
    referenced: items.filter(item => item.status === 'atlas_referenced_candidate').length,
    withPdfPages: items.filter(item => item.pdfPages.length > 0).length,
    withImages: items.filter(item => item.imageAvailable).length,
  },
  items,
};

await fs.mkdir(OUTPUT_DIR, { recursive: true });
await fs.writeFile(OUTPUT_INDEX, `${JSON.stringify(output, null, 2)}\n`);

console.log(`Atlas source index written: ${path.relative(projectRoot, OUTPUT_INDEX)}`);
console.log(`Items: ${items.length}`);
