export const PROTOCOL_TECHNIQUES = ['Sistêmicos', 'Auriculoterapia', 'Laser', 'Moxa', 'Ventosa', 'Stiper', 'Eletro'];
export const DEFAULT_PROTOCOL_TECHNIQUE = 'Sistêmicos';

const POINT_OVERVIEW_TECHNIQUES = new Set(['Sistêmicos', 'Auriculoterapia']);
export const PROTOCOL_STANDALONE_TECHNIQUES = ['Laser', 'Moxa', 'Ventosa', 'Stiper', 'Eletro'];

export function normalizeProtocolTechniqueFilters(filters = []) {
  const allowed = new Set(PROTOCOL_TECHNIQUES);
  return [...new Set((filters || []).filter(filter => allowed.has(filter)))];
}

export function getActiveProtocolTechniqueFilter(filters = []) {
  const normalized = normalizeProtocolTechniqueFilters(filters);
  return normalized.length > 0 ? normalized[normalized.length - 1] : DEFAULT_PROTOCOL_TECHNIQUE;
}

export function selectProtocolTechniqueFilter(filters = [], technique) {
  if (!PROTOCOL_TECHNIQUES.includes(technique)) return [getActiveProtocolTechniqueFilter(filters)];
  return [technique];
}

export function hasProtocolTechniqueFilter(filters = []) {
  return PROTOCOL_TECHNIQUES.includes(getActiveProtocolTechniqueFilter(filters));
}

export function isProtocolTechniqueEnabled(filters, technique) {
  const activeFilter = getActiveProtocolTechniqueFilter(filters);
  return activeFilter === technique;
}

export function isProtocolPointOverviewEnabled(filters = []) {
  const activeFilter = getActiveProtocolTechniqueFilter(filters);
  return POINT_OVERVIEW_TECHNIQUES.has(activeFilter);
}

export function isProtocolSuggestionOriginEnabled(filters = [], origin = 'sistemico') {
  const activeFilter = getActiveProtocolTechniqueFilter(filters);
  return origin === 'auricular'
    ? activeFilter === 'Auriculoterapia'
    : activeFilter === 'Sistêmicos';
}
