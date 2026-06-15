import { normalizePointCode } from './aliases';
import { fetchKnowledgeSourceJsonAsset } from '../services/knowledgeSourceAssetService';

export const ATLAS_EDNEA_SOURCE_INDEX_URL = '/knowledge/source-assets/atlas-ednea/source-index.json';
export const ATLAS_EDNEA_LOCAL_SOURCE_INDEX_ASSET_KEY = 'atlas-ednea/source-index.local.json';
export const ATLAS_EDNEA_LOCAL_SOURCE_INDEX_URL = '/knowledge/source-assets/atlas-ednea/source-index.local.json';

async function fetchSourceIndex(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export async function loadAtlasEdneaSourceIndex() {
  try {
    return await fetchKnowledgeSourceJsonAsset(
      ATLAS_EDNEA_LOCAL_SOURCE_INDEX_ASSET_KEY,
      ATLAS_EDNEA_LOCAL_SOURCE_INDEX_URL,
    );
  } catch {
    return fetchSourceIndex(ATLAS_EDNEA_SOURCE_INDEX_URL);
  }
}

function sourceLookupKey(value) {
  const normalized = normalizePointCode(value);
  return String(normalized || value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function itemLookupValues(item) {
  return [
    item.code,
    item.displayCode,
    item.atlasCode,
    item.title,
    ...(Array.isArray(item.aliases) ? item.aliases : []),
  ].filter(Boolean);
}

function uniqueLookupMatch(items, normalized, valuesForItem) {
  const matches = items.filter(item => {
    return valuesForItem(item).some(value => sourceLookupKey(value) === normalized);
  });

  const unique = new Map(matches.map(item => [sourceLookupKey(item.code || item.displayCode || item.title), item]));
  if (unique.size === 1) return { status: 'unique', item: [...unique.values()][0] };
  if (unique.size > 1) return { status: 'collision', item: null };
  return { status: 'none', item: null };
}

export function findAtlasEdneaSourceReference(sourceIndex, code) {
  const normalized = sourceLookupKey(code);
  const items = Array.isArray(sourceIndex?.items) ? sourceIndex.items : [];

  const strongMatch = uniqueLookupMatch(items, normalized, item => [
    item.code,
    item.displayCode,
    item.atlasCode,
  ].filter(Boolean));
  if (strongMatch.status === 'unique') return strongMatch.item;
  if (strongMatch.status === 'collision') return null;

  const aliasMatch = uniqueLookupMatch(items, normalized, item => (
    Array.isArray(item.aliases) ? item.aliases : []
  ));
  if (aliasMatch.status === 'unique') return aliasMatch.item;
  if (aliasMatch.status === 'collision') return null;

  const titleMatch = uniqueLookupMatch(items, normalized, item => itemLookupValues(item));
  if (titleMatch.status === 'unique') return titleMatch.item;
  return null;
}
