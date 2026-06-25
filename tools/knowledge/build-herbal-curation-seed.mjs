import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');
const defaultCatalogPath = path.join(
  projectRoot,
  'frontend',
  '.local-source-assets',
  'pdf-sources',
  'ebook-ervas-medicinais',
  'plant-catalog.local.json',
);
const defaultOutputPath = path.join(
  projectRoot,
  'frontend',
  '.local-source-assets',
  'pdf-sources',
  'ebook-ervas-medicinais',
  'herbal-curation-seed-decisions.local.json',
);

const SOURCE_KEY = 'ebook-ervas-medicinais';
const SEED_ORIGIN = 'technical_triage_from_source';

function decisionForPlant(plant, generatedAt) {
  const hasToxicology = Boolean(plant?.sourceSections?.toxicology?.text);
  return {
    id: `seed:${plant.id}`,
    plantId: plant.id,
    status: hasToxicology ? 'restrito_profissional' : 'source_only',
    contentType: 'planta_medicinal',
    decisionOrigin: SEED_ORIGIN,
    approvalMode: 'local_only',
    requiresProfessionalAudit: true,
    reviewNote: hasToxicology
      ? 'A fonte contém trecho de toxicologia. Restrito à avaliação individual até auditoria profissional de contraindicações, interações e grupos vulneráveis.'
      : 'Sem trecho de toxicologia estruturado nesta fonte. Mantido como somente fonte até auditoria profissional de contraindicações, interações e grupos vulneráveis.',
    reviewedByRole: 'technical_triage',
    reviewedByLabel: 'Triagem técnica da fonte',
    createdAt: generatedAt,
    updatedAt: generatedAt,
  };
}

export function buildHerbalCurationSeed(catalog, { generatedAt = new Date().toISOString() } = {}) {
  const items = Array.isArray(catalog?.items) ? catalog.items : [];
  if (!items.length) throw new Error('Catálogo de plantas vazio.');

  const decisions = items.map(plant => decisionForPlant(plant, generatedAt));
  const restrictedProfessional = decisions.filter(item => item.status === 'restrito_profissional').length;
  return {
    schemaVersion: 'sistema-acup-herbal-curation-seed.v1',
    generatedAt,
    source: {
      key: SOURCE_KEY,
      catalogAssetKey: 'pdf-sources/ebook-ervas-medicinais/plant-catalog.local.json',
    },
    policy: {
      decisionOrigin: SEED_ORIGIN,
      approvalMode: 'local_only',
      requiresProfessionalAudit: true,
      automaticPatientEligibility: false,
      rule: 'Com trecho de toxicologia na fonte: restrito_profissional. Sem trecho estruturado: source_only.',
    },
    counts: {
      total: decisions.length,
      restrictedProfessional,
      sourceOnly: decisions.length - restrictedProfessional,
      educationalApproved: 0,
    },
    decisions,
  };
}

export async function writeHerbalCurationSeed({
  catalogPath = defaultCatalogPath,
  outputPath = defaultOutputPath,
  generatedAt,
} = {}) {
  const catalog = JSON.parse(await fs.readFile(catalogPath, 'utf8'));
  const seed = buildHerbalCurationSeed(catalog, { generatedAt });
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(seed, null, 2)}\n`, 'utf8');
  return { outputPath, seed };
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const { outputPath, seed } = await writeHerbalCurationSeed();
  console.log(`Triagem-semente criada: ${seed.counts.total} plantas (${seed.counts.restrictedProfessional} restritas, ${seed.counts.sourceOnly} somente fonte).`);
  console.log(outputPath);
}
