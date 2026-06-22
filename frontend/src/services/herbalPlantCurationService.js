import { fetchKnowledgeSourceJsonAsset } from './knowledgeSourceAssetService';
import {
  getLocalHerbalCurationDecisions,
  materializeHerbalCurationRows,
  saveLocalHerbalCurationDecision,
} from '../knowledge/herbalPlantCuration';

export const HERBAL_PLANT_CATALOG_ASSET_KEY = 'pdf-sources/ebook-ervas-medicinais/plant-catalog.local.json';
export const HERBAL_PLANT_CATALOG_URL = '/knowledge/source-assets/pdf-sources/ebook-ervas-medicinais/plant-catalog.local.json';

export async function loadHerbalPlantCurationPayload() {
  const catalog = await fetchKnowledgeSourceJsonAsset(
    HERBAL_PLANT_CATALOG_ASSET_KEY,
    HERBAL_PLANT_CATALOG_URL,
    { purpose: 'herbal-curation' },
  );
  const items = Array.isArray(catalog?.items) ? catalog.items : [];
  if (!items.length) throw new Error('Catálogo de plantas indisponível ou vazio.');
  const decisions = getLocalHerbalCurationDecisions();
  return {
    catalog,
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
