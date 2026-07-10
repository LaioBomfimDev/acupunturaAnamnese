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
const defaultWorksheetPath = path.join(projectRoot, 'docs', 'herbal-curation-worksheet.json');

const SOURCE_KEY = 'ebook-ervas-medicinais';
const SEED_ORIGIN = 'technical_triage_from_source';
const WORKSHEET_ORIGIN = 'worksheet_preload_for_professional_review';
const WORKSHEET_SOURCE = 'docs/herbal-curation-worksheet.json';

const STATUS_LABEL = {
  educativo_aprovado: 'educativo aprovado',
  restrito_profissional: 'restrito à profissional',
  source_only: 'somente fonte',
  curadoria_tecnica: 'curadoria técnica',
  bloqueado_risco: 'bloqueado por risco',
};

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

function safetyReviewFromWorksheet(entry) {
  const safety = entry?.safetyReadiness || {};
  return {
    botanicalIdentityConfirmed: Boolean(safety.botanicalIdentityConfirmed),
    partUsedConfirmed: Boolean(safety.partUsedConfirmed),
    toxicologyReviewed: Boolean(safety.toxicologyReviewed),
    interactionsReviewed: Boolean(safety.interactionsReviewed),
    vulnerableGroupsReviewed: Boolean(safety.vulnerableGroupsReviewed),
    sourceScopeConfirmed: Boolean(safety.sourceScopeConfirmed),
  };
}

function decisionFromWorksheetEntry(plant, entry, generatedAt) {
  const proposedStatus = entry?.suggestedStatus === 'educativo_aprovado'
    ? 'educativo_aprovado'
    : 'restrito_profissional';
  const proposedLabel = STATUS_LABEL[proposedStatus] || proposedStatus;
  const note = entry.reviewNote
    ? ` Nota do worksheet: ${entry.reviewNote}`
    : '';

  return {
    id: `seed:worksheet:${plant.id}`,
    plantId: plant.id,
    status: 'curadoria_tecnica',
    proposedStatus,
    contentType: 'planta_medicinal',
    decisionOrigin: WORKSHEET_ORIGIN,
    approvalMode: 'local_only',
    requiresProfessionalAudit: true,
    preloadSource: WORKSHEET_SOURCE,
    worksheetTier: entry.tier || null,
    educationalSummary: entry.educationalSummary || '',
    cautionSummary: entry.cautionSummary || '',
    reviewNote: `Pré-carga local do worksheet para revisão profissional. Status proposto: ${proposedLabel}. Conferir os 6 checks de segurança antes de qualquer aprovação.${note}`,
    safetyReview: safetyReviewFromWorksheet(entry),
    reviewedByRole: 'worksheet_preload',
    reviewedByLabel: 'Pré-carga local do worksheet',
    createdAt: generatedAt,
    updatedAt: generatedAt,
  };
}

export function buildHerbalCurationSeed(catalog, {
  generatedAt = new Date().toISOString(),
  worksheet = null,
} = {}) {
  const items = Array.isArray(catalog?.items) ? catalog.items : [];
  if (!items.length) throw new Error('Catálogo de plantas vazio.');

  const worksheetEntries = Array.isArray(worksheet?.entries) ? worksheet.entries : [];
  const worksheetByPlantId = new Map(worksheetEntries.map(entry => [entry.plantId, entry]));

  const decisions = items.map(plant => {
    const worksheetEntry = worksheetByPlantId.get(plant.id);
    return worksheetEntry
      ? decisionFromWorksheetEntry(plant, worksheetEntry, generatedAt)
      : decisionForPlant(plant, generatedAt);
  });
  const restrictedProfessional = decisions.filter(item => item.status === 'restrito_profissional').length;
  const sourceOnly = decisions.filter(item => item.status === 'source_only').length;
  const technicalCuration = decisions.filter(item => item.status === 'curadoria_tecnica').length;
  const worksheetPreloaded = decisions.filter(item => item.decisionOrigin === WORKSHEET_ORIGIN).length;
  const worksheetProposedEducational = decisions.filter(item => item.proposedStatus === 'educativo_aprovado').length;
  const worksheetProposedRestricted = decisions.filter(item => item.proposedStatus === 'restrito_profissional').length;
  return {
    schemaVersion: 'sistema-acup-herbal-curation-seed.v1',
    generatedAt,
    source: {
      key: SOURCE_KEY,
      catalogAssetKey: 'pdf-sources/ebook-ervas-medicinais/plant-catalog.local.json',
    },
    policy: {
      decisionOrigin: SEED_ORIGIN,
      worksheetDecisionOrigin: WORKSHEET_ORIGIN,
      worksheetSource: WORKSHEET_SOURCE,
      approvalMode: 'local_only',
      requiresProfessionalAudit: true,
      automaticPatientEligibility: false,
      rule: 'Com trecho de toxicologia na fonte: restrito_profissional. Sem trecho estruturado: source_only. Entradas do worksheet entram apenas como curadoria_tecnica com proposedStatus e pré-preenchimento local; não publicam ao paciente.',
    },
    counts: {
      total: decisions.length,
      restrictedProfessional,
      sourceOnly,
      technicalCuration,
      educationalApproved: 0,
      worksheetPreloaded,
      worksheetProposedEducational,
      worksheetProposedRestricted,
    },
    decisions,
  };
}

export async function writeHerbalCurationSeed({
  catalogPath = defaultCatalogPath,
  worksheetPath = defaultWorksheetPath,
  outputPath = defaultOutputPath,
  generatedAt,
} = {}) {
  const [catalog, worksheet] = await Promise.all([
    fs.readFile(catalogPath, 'utf8').then(JSON.parse),
    fs.readFile(worksheetPath, 'utf8').then(JSON.parse),
  ]);
  const seed = buildHerbalCurationSeed(catalog, { generatedAt, worksheet });
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(seed, null, 2)}\n`, 'utf8');
  return { outputPath, seed };
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const { outputPath, seed } = await writeHerbalCurationSeed();
  console.log(`Triagem-semente criada: ${seed.counts.total} plantas (${seed.counts.restrictedProfessional} restritas, ${seed.counts.sourceOnly} somente fonte, ${seed.counts.worksheetPreloaded} pré-carregadas do worksheet).`);
  console.log(outputPath);
}
