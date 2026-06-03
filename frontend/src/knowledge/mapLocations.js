import { normalizePointCode, displayPointCode } from './aliases';
import { highConfidenceMapLocations } from './generated/high-confidence-map-locations';

export const CALIBRATED_MAP_LOCATIONS_KEY = 'acup_living_library_map_locations_v1';

export const mapAssets = {
  body_front: {
    id: 'body_front',
    label: 'Corpo - frente',
    type: 'body',
    src: '/maps/body-front.webp',
    viewBox: { width: 100, height: 110 },
    coordinateSystem: 'svg-percent-calibrated',
    status: 'draft_visual_asset',
  },
  body_back: {
    id: 'body_back',
    label: 'Corpo - costas',
    type: 'body',
    src: '/maps/body-back.webp',
    viewBox: { width: 100, height: 110 },
    coordinateSystem: 'svg-percent-calibrated',
    status: 'draft_visual_asset',
  },
  feet_dorsal: {
    id: 'feet_dorsal',
    label: 'Pés - dorso',
    type: 'foot',
    src: '/maps/feet-dorsal.webp',
    viewBox: { width: 100, height: 100 },
    coordinateSystem: 'svg-percent-calibrated',
    status: 'draft_visual_asset',
  },
  hands_palmar: {
    id: 'hands_palmar',
    label: 'Mãos e punhos - palma',
    type: 'hand',
    src: '/maps/hands-palmar.webp',
    viewBox: { width: 100, height: 100 },
    coordinateSystem: 'svg-percent-calibrated',
    status: 'draft_visual_asset',
  },
  ear_lateral: {
    id: 'ear_lateral',
    label: 'Orelha - lateral',
    type: 'ear',
    src: '/maps/ear-lateral.webp',
    viewBox: { width: 100, height: 100 },
    coordinateSystem: 'svg-percent-calibrated',
    status: 'draft_visual_asset',
  },
  ear_protocol: {
    id: 'ear_protocol',
    label: 'Orelha - protocolo',
    type: 'ear',
    src: '/maps/ear-lateral.webp',
    viewBox: { width: 100, height: 100 },
    coordinateSystem: 'svg-percent-calibrated',
    status: 'draft_visual_asset',
  },
};

export const pointLocations = [
  { code: 'EX-HN3', mapId: 'body_front', view: 'anterior', xPct: 50, yPct: 18, approved: false, calibrationStatus: 'draft' },
  { code: 'GV20', mapId: 'body_front', view: 'anterior', xPct: 50, yPct: 9, approved: false, calibrationStatus: 'draft' },
  { code: 'GB20', mapId: 'body_front', view: 'anterior', xPct: 40, yPct: 20, approved: false, calibrationStatus: 'draft' },
  { code: 'LR3', mapId: 'body_front', view: 'anterior', xPct: 43, yPct: 96, approved: false, calibrationStatus: 'draft' },
  { code: 'GB34', mapId: 'body_front', view: 'anterior', xPct: 62, yPct: 74, approved: false, calibrationStatus: 'draft' },
  { code: 'TE5', mapId: 'body_front', view: 'anterior', xPct: 73, yPct: 53, approved: false, calibrationStatus: 'draft' },
  { code: 'LI4', mapId: 'body_front', view: 'anterior', xPct: 25, yPct: 59, approved: false, calibrationStatus: 'draft' },
  { code: 'KI3', mapId: 'body_front', view: 'anterior', xPct: 54, yPct: 95, approved: false, calibrationStatus: 'draft' },
  { code: 'PC6', mapId: 'body_front', view: 'anterior', xPct: 28, yPct: 55, approved: false, calibrationStatus: 'draft' },
  { code: 'CV12', mapId: 'body_front', view: 'anterior', xPct: 50, yPct: 43, approved: false, calibrationStatus: 'draft' },
  { code: 'ST36', mapId: 'body_front', view: 'anterior', xPct: 58, yPct: 79, approved: false, calibrationStatus: 'draft' },
  { code: 'SP6', mapId: 'body_front', view: 'anterior', xPct: 43, yPct: 88, approved: false, calibrationStatus: 'draft' },
  { code: 'SP9', mapId: 'body_front', view: 'anterior', xPct: 43, yPct: 78, approved: false, calibrationStatus: 'draft' },
  { code: 'ST40', mapId: 'body_front', view: 'anterior', xPct: 59, yPct: 84, approved: false, calibrationStatus: 'draft' },
  { code: 'LI11', mapId: 'body_front', view: 'anterior', xPct: 27, yPct: 45, approved: false, calibrationStatus: 'draft' },
  { code: 'HT7', mapId: 'body_front', view: 'anterior', xPct: 28, yPct: 56, approved: false, calibrationStatus: 'draft' },
  { code: 'CV6', mapId: 'body_front', view: 'anterior', xPct: 50, yPct: 56, approved: false, calibrationStatus: 'draft' },
  { code: 'SP3', mapId: 'body_front', view: 'anterior', xPct: 42, yPct: 96, approved: false, calibrationStatus: 'draft' },

  { code: 'GV20', mapId: 'body_back', view: 'posterior', xPct: 50, yPct: 7, approved: false, calibrationStatus: 'draft' },
  { code: 'GB20', mapId: 'body_back', view: 'posterior', xPct: 43, yPct: 18, approved: false, calibrationStatus: 'draft' },
  { code: 'GB34', mapId: 'body_back', view: 'posterior', xPct: 60, yPct: 74, approved: false, calibrationStatus: 'draft' },
  { code: 'KI3', mapId: 'body_back', view: 'posterior', xPct: 55, yPct: 96, approved: false, calibrationStatus: 'draft' },
  { code: 'SP6', mapId: 'body_back', view: 'posterior', xPct: 43, yPct: 88, approved: false, calibrationStatus: 'draft' },

  { code: 'LR3', mapId: 'feet_dorsal', view: 'dorsal', xPct: 39, yPct: 30, approved: false, calibrationStatus: 'draft' },
  { code: 'SP3', mapId: 'feet_dorsal', view: 'dorsal', xPct: 44, yPct: 43, approved: false, calibrationStatus: 'draft' },
  { code: 'KI3', mapId: 'feet_dorsal', view: 'dorsal', xPct: 39, yPct: 73, approved: false, calibrationStatus: 'draft' },
  { code: 'ST36', mapId: 'feet_dorsal', view: 'dorsal', xPct: 69, yPct: 87, approved: false, calibrationStatus: 'draft' },
  { code: 'ST40', mapId: 'feet_dorsal', view: 'dorsal', xPct: 66, yPct: 78, approved: false, calibrationStatus: 'draft' },
  { code: 'SP6', mapId: 'feet_dorsal', view: 'dorsal', xPct: 61, yPct: 70, approved: false, calibrationStatus: 'draft' },

  { code: 'LI4', mapId: 'hands_palmar', view: 'palmar', xPct: 68, yPct: 80, approved: false, calibrationStatus: 'draft' },
  { code: 'TE5', mapId: 'hands_palmar', view: 'palmar', xPct: 32, yPct: 49, approved: false, calibrationStatus: 'draft' },
  { code: 'PC6', mapId: 'hands_palmar', view: 'palmar', xPct: 31, yPct: 45, approved: false, calibrationStatus: 'draft' },
  { code: 'HT7', mapId: 'hands_palmar', view: 'palmar', xPct: 32, yPct: 55, approved: false, calibrationStatus: 'draft' },
  { code: 'LI11', mapId: 'hands_palmar', view: 'palmar', xPct: 30, yPct: 15, approved: false, calibrationStatus: 'draft' },

  { code: 'auricular:shen-men', label: 'Shen Men', mapId: 'ear_protocol', view: 'lateral', xPct: 56, yPct: 30, approved: true },
  { code: 'auricular:figado', label: 'Fígado', mapId: 'ear_protocol', view: 'lateral', xPct: 62, yPct: 47, approved: true },
  { code: 'auricular:subcortex', label: 'Subcórtex', mapId: 'ear_protocol', view: 'lateral', xPct: 52, yPct: 66, approved: true },
  { code: 'auricular:ansiedade', label: 'Ansiedade', mapId: 'ear_protocol', view: 'lateral', xPct: 38, yPct: 34, approved: true },
  { code: 'auricular:rim', label: 'Rim', mapId: 'ear_protocol', view: 'lateral', xPct: 45, yPct: 58, approved: true },
  { code: 'auricular:estomago', label: 'Estômago', mapId: 'ear_protocol', view: 'lateral', xPct: 62, yPct: 56, approved: true },
  { code: 'auricular:baco', label: 'Baço', mapId: 'ear_protocol', view: 'lateral', xPct: 55, yPct: 52, approved: true },
  { code: 'auricular:endocrino', label: 'Endócrino', mapId: 'ear_protocol', view: 'lateral', xPct: 50, yPct: 76, approved: true },
  { code: 'auricular:fome', label: 'Fome', mapId: 'ear_protocol', view: 'lateral', xPct: 70, yPct: 62, approved: true },
  { code: 'auricular:coracao', label: 'Coração', mapId: 'ear_protocol', view: 'lateral', xPct: 48, yPct: 48, approved: true },
  { code: 'auricular:sono', label: 'Sono', mapId: 'ear_protocol', view: 'lateral', xPct: 44, yPct: 30, approved: true },

  { code: 'auricular:shen-men', label: 'Shen Men', mapId: 'ear_lateral', view: 'lateral', xPct: 56, yPct: 30, approved: false, calibrationStatus: 'draft' },
  { code: 'auricular:figado', label: 'Fígado', mapId: 'ear_lateral', view: 'lateral', xPct: 62, yPct: 47, approved: false, calibrationStatus: 'draft' },
  { code: 'auricular:subcortex', label: 'Subcórtex', mapId: 'ear_lateral', view: 'lateral', xPct: 52, yPct: 66, approved: false, calibrationStatus: 'draft' },
  { code: 'auricular:ansiedade', label: 'Ansiedade', mapId: 'ear_lateral', view: 'lateral', xPct: 38, yPct: 34, approved: false, calibrationStatus: 'draft' },
  { code: 'auricular:rim', label: 'Rim', mapId: 'ear_lateral', view: 'lateral', xPct: 45, yPct: 58, approved: false, calibrationStatus: 'draft' },
  { code: 'auricular:estomago', label: 'Estômago', mapId: 'ear_lateral', view: 'lateral', xPct: 62, yPct: 56, approved: false, calibrationStatus: 'draft' },
  { code: 'auricular:baco', label: 'Baço', mapId: 'ear_lateral', view: 'lateral', xPct: 55, yPct: 52, approved: false, calibrationStatus: 'draft' },
  { code: 'auricular:endocrino', label: 'Endócrino', mapId: 'ear_lateral', view: 'lateral', xPct: 50, yPct: 76, approved: false, calibrationStatus: 'draft' },
  { code: 'auricular:fome', label: 'Fome', mapId: 'ear_lateral', view: 'lateral', xPct: 70, yPct: 62, approved: false, calibrationStatus: 'draft' },
  { code: 'auricular:coracao', label: 'Coração', mapId: 'ear_lateral', view: 'lateral', xPct: 48, yPct: 48, approved: false, calibrationStatus: 'draft' },
  { code: 'auricular:sono', label: 'Sono', mapId: 'ear_lateral', view: 'lateral', xPct: 44, yPct: 30, approved: false, calibrationStatus: 'draft' },
];

export const mapGroups = [
  {
    id: 'body',
    label: 'Corpo',
    maps: ['body_front', 'body_back'],
  },
  {
    id: 'microsystems',
    label: 'Microssistemas',
    maps: ['feet_dorsal', 'hands_palmar', 'ear_lateral'],
  },
];

export const calibrationPointOptions = [
  'ST36', 'SP6', 'SP9', 'SP3', 'ST40', 'LR3', 'KI3',
  'PC6', 'HT7', 'LI4', 'LI11', 'TE5',
  'CV12', 'CV6', 'GV20', 'GB20', 'GB34', 'EX-HN3',
  'Shen Men', 'Fígado', 'Subcórtex', 'Ansiedade', 'Rim', 'Estômago', 'Baço', 'Endócrino', 'Coração', 'Sono', 'Fome',
];

let cachedStoredRaw = null;
let cachedStoredLocations = null;
let cachedAllLocations = null;
let cachedPointLocationIndex = null;
let cachedStorageSignature = null;

export function getMapAsset(mapId) {
  return mapAssets[mapId] || null;
}

function locationIdentity(location) {
  const code = location.code?.startsWith('auricular:')
    ? location.code
    : normalizePointCode(location.code);
  return `${code}::${location.mapId}`;
}

function locationPointCode(location) {
  return location.code?.startsWith('auricular:')
    ? location.code
    : normalizePointCode(location.code);
}

function currentStorageSignature() {
  if (typeof localStorage === 'undefined') return 'server';
  return localStorage.getItem(CALIBRATED_MAP_LOCATIONS_KEY) || '[]';
}

function resetLocationCaches() {
  cachedAllLocations = null;
  cachedPointLocationIndex = null;
  cachedStorageSignature = null;
}

export function readStoredMapLocations() {
  if (typeof localStorage === 'undefined') return [];
  const raw = currentStorageSignature();
  if (raw === cachedStoredRaw && cachedStoredLocations) return cachedStoredLocations;

  try {
    const parsed = JSON.parse(raw);
    cachedStoredRaw = raw;
    cachedStoredLocations = Array.isArray(parsed) ? parsed : [];
    return cachedStoredLocations;
  } catch {
    cachedStoredRaw = raw;
    cachedStoredLocations = [];
    return [];
  }
}

export function writeStoredMapLocations(locations) {
  if (typeof localStorage === 'undefined') return;
  const raw = JSON.stringify(locations);
  localStorage.setItem(CALIBRATED_MAP_LOCATIONS_KEY, raw);
  cachedStoredRaw = raw;
  cachedStoredLocations = locations;
  resetLocationCaches();
}

export function upsertStoredMapLocation(location) {
  const stored = readStoredMapLocations();
  const nextLocation = {
    ...location,
    approved: false,
    calibrationStatus: 'local_draft',
    updatedAt: new Date().toISOString(),
  };
  const identity = locationIdentity(nextLocation);
  const next = [
    nextLocation,
    ...stored.filter(item => locationIdentity(item) !== identity),
  ];
  writeStoredMapLocations(next);
  return nextLocation;
}

export function getAllMapLocations() {
  const storageSignature = currentStorageSignature();
  if (cachedAllLocations && cachedStorageSignature === storageSignature) return cachedAllLocations;

  const stored = readStoredMapLocations();
  const storedIds = new Set(stored.map(locationIdentity));
  const mappedPointCodes = new Set([
    ...stored,
    ...pointLocations,
  ].map(locationPointCode));
  cachedAllLocations = [
    ...stored,
    ...pointLocations.filter(location => !storedIds.has(locationIdentity(location))),
    ...highConfidenceMapLocations.filter(location => {
      return !storedIds.has(locationIdentity(location)) && !mappedPointCodes.has(locationPointCode(location));
    }),
  ];
  cachedStorageSignature = storageSignature;
  cachedPointLocationIndex = null;
  return cachedAllLocations;
}

function getPointLocationIndex() {
  const storageSignature = currentStorageSignature();
  if (cachedPointLocationIndex && cachedStorageSignature === storageSignature) return cachedPointLocationIndex;

  const index = new Map();
  for (const location of getAllMapLocations()) {
    const keys = location.code?.startsWith('auricular:')
      ? [location.code.toLowerCase(), location.label?.toLowerCase()].filter(Boolean)
      : [normalizePointCode(location.code)];

    for (const key of keys) {
      const current = index.get(key) || [];
      current.push(location);
      index.set(key, current);
    }
  }

  cachedPointLocationIndex = index;
  return index;
}

export function getLocationsForPoint(codeOrLabel) {
  const normalized = normalizePointCode(codeOrLabel);
  const label = String(codeOrLabel || '').trim().toLowerCase();
  const index = getPointLocationIndex();
  const matches = index.get(normalized) || index.get(label) || [];

  return matches.map(location => ({
    ...location,
    label: location.label || displayPointCode(location.code),
  }));
}

export function getLocationsByMap(points, mapId) {
  return points
    .flatMap(point => getLocationsForPoint(point.code || point.label || point))
    .filter(location => location.mapId === mapId);
}
