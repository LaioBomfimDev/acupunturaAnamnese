// Camada canônica de sistematização dos mapas.
//
// Cada ponto dos meridianos recebe uma região anatômica canônica (padrão WHO)
// e cada região define em quais mapas do app o ponto pode aparecer, em ordem
// de preferência. Essa tabela é a fonte única usada para:
// - rotear rascunhos automáticos (corpo inteiro) para o mapa segmentado certo;
// - sinalizar coordenadas incompatíveis com a região (review_map_mismatch);
// - validar todo o conjunto de localizações em testes de regressão.

import { normalizePointCode } from './aliases';

// Região → mapas aceitos (primeiro = preferido).
export const REGION_MAPS = {
  face: ['body_front'],
  head_top: ['body_front', 'body_back'],
  head_side: ['body_front', 'body_back'],
  head_back: ['body_back'],
  neck_front: ['body_front'],
  neck_side: ['body_front', 'body_back'],
  neck_back: ['body_back'],
  shoulder_top: ['body_front', 'body_back'],
  shoulder_back: ['body_back'],
  chest: ['body_front'],
  abdomen: ['body_front'],
  upper_back: ['body_back'],
  lower_back: ['body_back'],
  sacrum: ['body_back'],
  perineum: ['body_front', 'body_back'],
  arm_front: ['body_front'],
  arm_lateral: ['body_front', 'body_back'],
  arm_back: ['body_back', 'body_front'],
  forearm_palmar: ['hands_palmar', 'body_front'],
  forearm_dorsal: ['hands_dorsal', 'body_front', 'body_back'],
  hand_palmar: ['hands_palmar'],
  hand_dorsal: ['hands_dorsal'],
  hip_lateral: ['legs_front', 'legs_back', 'body_front', 'body_back'],
  leg_front: ['legs_front', 'body_front'],
  leg_medial: ['legs_front', 'legs_back', 'body_front'],
  leg_lateral: ['legs_front', 'body_front'],
  leg_back: ['legs_back', 'body_back'],
  ankle_front: ['legs_front', 'feet_dorsal'],
  ankle_medial: ['feet_dorsal', 'legs_front'],
  ankle_lateral: ['feet_dorsal', 'legs_back', 'legs_front'],
  foot_dorsal: ['feet_dorsal'],
  foot_medial: ['feet_dorsal', 'feet_plantar'],
  foot_lateral: ['feet_dorsal', 'legs_back'],
  foot_plantar: ['feet_plantar'],
  ear: ['ear_lateral', 'ear_protocol'],
};

// Segmentos por meridiano: [primeiro ponto, último ponto, região].
// Cobertura completa dos 14 trajetos clássicos (localização padrão WHO).
const MERIDIAN_SEGMENTS = {
  LU: [
    [1, 2, 'chest'],
    [3, 6, 'arm_front'],
    [7, 9, 'forearm_palmar'],
    [10, 11, 'hand_palmar'],
  ],
  LI: [
    [1, 5, 'hand_dorsal'],
    [6, 10, 'forearm_dorsal'],
    [11, 16, 'arm_lateral'],
    [17, 18, 'neck_front'],
    [19, 20, 'face'],
  ],
  ST: [
    [1, 8, 'face'],
    [9, 12, 'neck_front'],
    [13, 18, 'chest'],
    [19, 30, 'abdomen'],
    [31, 40, 'leg_front'],
    [41, 41, 'ankle_front'],
    [42, 45, 'foot_dorsal'],
  ],
  SP: [
    [1, 4, 'foot_medial'],
    [5, 5, 'ankle_medial'],
    [6, 11, 'leg_medial'],
    [12, 16, 'abdomen'],
    [17, 21, 'chest'],
  ],
  HT: [
    [1, 3, 'arm_front'],
    [4, 7, 'forearm_palmar'],
    [8, 9, 'hand_palmar'],
  ],
  SI: [
    [1, 5, 'hand_dorsal'],
    [6, 8, 'forearm_dorsal'],
    [9, 15, 'shoulder_back'],
    [16, 17, 'neck_side'],
    [18, 19, 'face'],
  ],
  BL: [
    [1, 2, 'face'],
    [3, 7, 'head_top'],
    [8, 10, 'head_back'],
    [11, 21, 'upper_back'],
    [22, 30, 'lower_back'],
    [31, 35, 'sacrum'],
    [36, 40, 'leg_back'],
    [41, 46, 'upper_back'],
    [47, 52, 'lower_back'],
    [53, 54, 'sacrum'],
    [55, 59, 'leg_back'],
    [60, 62, 'ankle_lateral'],
    [63, 67, 'foot_lateral'],
  ],
  KI: [
    [1, 1, 'foot_plantar'],
    [2, 2, 'foot_medial'],
    [3, 6, 'ankle_medial'],
    [7, 10, 'leg_medial'],
    [11, 21, 'abdomen'],
    [22, 27, 'chest'],
  ],
  PC: [
    [1, 1, 'chest'],
    [2, 3, 'arm_front'],
    [4, 7, 'forearm_palmar'],
    [8, 9, 'hand_palmar'],
  ],
  TE: [
    [1, 4, 'hand_dorsal'],
    [5, 9, 'forearm_dorsal'],
    [10, 14, 'arm_lateral'],
    [15, 15, 'shoulder_top'],
    [16, 17, 'neck_side'],
    [18, 22, 'head_side'],
    [23, 23, 'face'],
  ],
  GB: [
    [1, 1, 'face'],
    [2, 12, 'head_side'],
    [13, 14, 'face'],
    [15, 19, 'head_top'],
    [20, 20, 'neck_back'],
    [21, 21, 'shoulder_top'],
    [22, 23, 'chest'],
    [24, 28, 'abdomen'],
    [29, 30, 'hip_lateral'],
    [31, 39, 'leg_lateral'],
    [40, 40, 'ankle_lateral'],
    [41, 44, 'foot_dorsal'],
  ],
  LR: [
    [1, 3, 'foot_dorsal'],
    [4, 4, 'ankle_medial'],
    [5, 12, 'leg_medial'],
    [13, 13, 'abdomen'],
    [14, 14, 'chest'],
  ],
  CV: [
    [1, 1, 'perineum'],
    [2, 14, 'abdomen'],
    [15, 22, 'chest'],
    [23, 24, 'neck_front'],
  ],
  GV: [
    [1, 2, 'sacrum'],
    [3, 5, 'lower_back'],
    [6, 13, 'upper_back'],
    [14, 16, 'neck_back'],
    [17, 19, 'head_back'],
    [20, 24, 'head_top'],
    [25, 28, 'face'],
  ],
};

// Pontos extras por grupo anatômico (EX-HN3 etc.).
const EXTRA_GROUP_REGIONS = {
  HN: 'face',
  B: 'upper_back',
  CA: 'abdomen',
  UE: 'hand_dorsal',
  LE: 'leg_front',
};

// Faixa vertical plausível (yPct) de cada região nas folhas de corpo inteiro
// usadas pelos rascunhos automáticos. Coordenadas fora da faixa indicam que o
// gerador colocou o ponto em outra parte do corpo: o rascunho é sinalizado
// para revisão em vez de ser reescalado para um lugar errado.
const BODY_SHEET_REGION_BANDS = {
  body_front: {
    face: [3, 26],
    head_top: [2, 20],
    head_side: [5, 22],
    neck_front: [12, 28],
    neck_side: [12, 28],
    shoulder_top: [22, 36],
    chest: [22, 44],
    abdomen: [34, 68],
    perineum: [56, 70],
    arm_front: [20, 66],
    arm_lateral: [20, 66],
    arm_back: [20, 66],
    forearm_palmar: [38, 66],
    forearm_dorsal: [38, 66],
    hand_palmar: [48, 70],
    hand_dorsal: [48, 70],
    hip_lateral: [52, 70],
    leg_front: [54, 100],
    leg_medial: [54, 100],
    leg_lateral: [54, 100],
    leg_back: [54, 100],
    ankle_front: [76, 100],
    ankle_medial: [76, 100],
    ankle_lateral: [76, 100],
    foot_dorsal: [80, 100],
    foot_medial: [80, 100],
    foot_lateral: [80, 100],
    foot_plantar: [80, 100],
  },
  body_back: {
    head_top: [2, 16],
    head_side: [4, 20],
    head_back: [5, 20],
    neck_back: [13, 27],
    neck_side: [12, 27],
    shoulder_top: [20, 34],
    shoulder_back: [20, 46],
    upper_back: [17, 50],
    lower_back: [42, 62],
    sacrum: [52, 70],
    perineum: [56, 72],
    arm_lateral: [20, 66],
    arm_back: [20, 66],
    forearm_dorsal: [38, 66],
    hand_dorsal: [48, 70],
    hip_lateral: [52, 70],
    leg_back: [54, 100],
    leg_medial: [54, 100],
    ankle_lateral: [76, 100],
    ankle_medial: [76, 100],
    foot_dorsal: [80, 100],
    foot_lateral: [80, 100],
    foot_plantar: [80, 100],
  },
};

export function parsePointCode(code) {
  const normalized = normalizePointCode(code);
  const extraMatch = normalized.match(/^EX-([A-Z]+)(\d+)$/);
  if (extraMatch) {
    return { meridian: 'EX', group: extraMatch[1], number: Number(extraMatch[2]) };
  }
  const match = normalized.match(/^([A-Z]+)(\d+)$/);
  if (!match) return null;
  return { meridian: match[1], number: Number(match[2]) };
}

export function getCanonicalRegion(code) {
  const raw = String(code || '');
  if (raw.startsWith('auricular:')) return 'ear';

  const parsed = parsePointCode(raw);
  if (!parsed) return null;

  if (parsed.meridian === 'EX') {
    return EXTRA_GROUP_REGIONS[parsed.group] || null;
  }

  const segments = MERIDIAN_SEGMENTS[parsed.meridian];
  if (!segments) return null;

  const segment = segments.find(([from, to]) => parsed.number >= from && parsed.number <= to);
  return segment ? segment[2] : null;
}

export function getAllowedMapIds(codeOrRegion) {
  const region = REGION_MAPS[codeOrRegion]
    ? codeOrRegion
    : getCanonicalRegion(codeOrRegion);
  return (region && REGION_MAPS[region]) || [];
}

export function getPreferredMapId(code) {
  return getAllowedMapIds(code)[0] || null;
}

// Pontos de linha mediana (Vaso Concepção, Vaso Governador e Yintang):
// nos mapas de corpo o x precisa ficar travado no eixo central.
export function isMidlinePoint(code) {
  const parsed = parsePointCode(code);
  if (!parsed) return false;
  if (parsed.meridian === 'CV' || parsed.meridian === 'GV') return true;
  return parsed.meridian === 'EX' && parsed.group === 'HN' && parsed.number === 3;
}

export function isPlausibleOnBodySheet(region, mapId, yPct) {
  const band = BODY_SHEET_REGION_BANDS[mapId]?.[region];
  if (!band) return true;
  const y = Number(yPct);
  if (!Number.isFinite(y)) return false;
  return y >= band[0] && y <= band[1];
}
