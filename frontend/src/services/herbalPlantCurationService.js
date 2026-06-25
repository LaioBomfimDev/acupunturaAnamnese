import { fetchKnowledgeSourceJsonAsset } from './knowledgeSourceAssetService';
import {
  getLocalHerbalCurationDecisions,
  materializeHerbalCurationRows,
  mergeHerbalCurationDecisions,
  saveLocalHerbalCurationDecision,
} from '../knowledge/herbalPlantCuration';

export const HERBAL_PLANT_CATALOG_ASSET_KEY = 'pdf-sources/ebook-ervas-medicinais/plant-catalog.local.json';
export const HERBAL_PLANT_CATALOG_URL = '/knowledge/source-assets/pdf-sources/ebook-ervas-medicinais/plant-catalog.local.json';
export const HERBAL_CURATION_SEED_ASSET_KEY = 'pdf-sources/ebook-ervas-medicinais/herbal-curation-seed-decisions.local.json';
export const HERBAL_CURATION_SEED_URL = '/knowledge/source-assets/pdf-sources/ebook-ervas-medicinais/herbal-curation-seed-decisions.local.json';

export async function loadHerbalPlantCurationPayload() {
  const [catalog, seedEnvelope] = await Promise.all([
    fetchKnowledgeSourceJsonAsset(
      HERBAL_PLANT_CATALOG_ASSET_KEY,
      HERBAL_PLANT_CATALOG_URL,
      { purpose: 'herbal-curation' },
    ),
    fetchKnowledgeSourceJsonAsset(
      HERBAL_CURATION_SEED_ASSET_KEY,
      HERBAL_CURATION_SEED_URL,
      { purpose: 'herbal-curation-seed' },
    ),
  ]);
  const items = Array.isArray(catalog?.items) ? catalog.items : [];
  if (!items.length) throw new Error('Catálogo de plantas indisponível ou vazio.');
  const seedDecisions = Array.isArray(seedEnvelope?.decisions) ? seedEnvelope.decisions : [];
  if (!seedDecisions.length) throw new Error('Triagem técnica de ervas indisponível ou vazia.');
  const { localDecisions, decisions, rows } = refreshHerbalPlantCurationRows(catalog, seedDecisions);
  return {
    catalog,
    seedDecisions,
    localDecisions,
    decisions,
    rows,
  };
}

export function refreshHerbalPlantCurationRows(catalog, seedDecisions = []) {
  const items = Array.isArray(catalog?.items) ? catalog.items : [];
  const localDecisions = getLocalHerbalCurationDecisions();
  const decisions = mergeHerbalCurationDecisions(seedDecisions, localDecisions);
  return {
    localDecisions,
    decisions,
    rows: materializeHerbalCurationRows(items, decisions),
  };
}

export function saveHerbalPlantCurationDecision(payload, plant) {
  const decision = saveLocalHerbalCurationDecision(payload);
  const decisions = getLocalHerbalCurationDecisions();
  return {
    decision,
    rows: materializeHerbalCurationRows([plant], decisions),
  };
}
