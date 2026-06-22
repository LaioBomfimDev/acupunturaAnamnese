// Coordenadas calibradas dos "Pontos comumente usados" (126 pontos corporais)
// para as NOVAS imagens de mapa unilaterais/meio-corpo.
//
// Contexto: as imagens em /maps foram trocadas por recortes unilaterais
// (meio tronco, uma perna, uma mão, um pé). As coordenadas antigas assumiam
// figuras bilaterais centralizadas e caíam em área branca ou no lado errado.
// Aqui cada ponto recebe UM único marcador (sem duplicar lados) posicionado
// sobre a anatomia visível da imagem correspondente.
//
// Regras de projeto:
// - O mapa (`mapId`) de cada ponto segue o roteamento anatômico canônico
//   (mapRouting.js / padrão WHO), não o rótulo `map` da curadoria clínica —
//   este último é apenas um agrupamento e contém pontos rotulados em mapas
//   anatomicamente impossíveis (ex.: LI10 em "Pernas", SP4 em "Mãos").
//   validateMapLocations() garante que todo mapId pertença à região do ponto.
// - Status `recalibrated_local_pending`: são estimativas visuais locais que
//   aguardam confirmação do acupunturista no próprio mapa (auditoria profissional).

import { normalizePointCode } from './aliases';
import { getAllowedMapIds } from './mapRouting';

const VIEW_BY_MAP = {
  body_front: 'anterior',
  body_back: 'posterior',
  legs_front: 'anterior',
  legs_back: 'posterior',
  feet_dorsal: 'dorsal',
  feet_plantar: 'plantar',
  hands_palmar: 'palmar',
  hands_dorsal: 'dorsal',
  body_full: 'anterior',
};

const RECALIBRATED = {
  approved: false,
  calibrationStatus: 'recalibrated_local_pending',
  coordinateConfidence: 'recalibrated_visual_estimate',
  sourceConfidence: 'local_visual_estimate',
  approvalMode: 'local_only',
  requiresProfessionalAudit: true,
  source: 'Recalibração visual local para mapas unilaterais (aguardando confirmação do acupunturista)',
};

const BODY_FULL_RECALIBRATED = {
  ...RECALIBRATED,
  calibrationStatus: 'body_full_projection_pending',
  coordinateConfidence: 'body_full_visual_projection',
  sourceConfidence: 'local_visual_projection',
  source: 'Projeção visual local para o mapa corporal inteiro (aguardando confirmação do acupunturista)',
};

// [code, mapId, xPct, yPct] — um marcador único por ponto.
const COMMON_BODY_COORDS = [
  // ── body_front (anterior; linha média anatômica ~x60; face ~x55) ──────────
  ['GV20', 'body_front', 56, 5],
  ['GV24', 'body_front', 56, 10],
  ['EX-HN3', 'body_front', 57, 17],
  ['GB15', 'body_front', 51, 11],
  ['GB13', 'body_front', 49, 13],
  ['GB8', 'body_front', 45, 16],
  ['EX-HN5', 'body_front', 47, 18],
  ['SI18', 'body_front', 50, 22],
  ['ST2', 'body_front', 52, 20],
  ['LI20', 'body_front', 54, 22],
  ['ST3', 'body_front', 53, 25],
  ['ST7', 'body_front', 47, 25],
  ['ST6', 'body_front', 50, 28],
  ['TE17', 'body_front', 44, 27],
  ['CV23', 'body_front', 59, 32],
  ['CV22', 'body_front', 60, 37],
  ['KI27', 'body_front', 54, 41],
  ['LU1', 'body_front', 44, 45],
  ['CV17', 'body_front', 60, 52],
  ['CV15', 'body_front', 60, 58],
  ['CV14', 'body_front', 60, 60],
  ['CV13', 'body_front', 60, 64],
  ['CV12', 'body_front', 60, 68],
  ['CV10', 'body_front', 60, 74],
  ['ST21', 'body_front', 52, 67],
  ['LI16', 'body_front', 42, 40],
  ['LI15', 'body_front', 35, 43],
  ['LI14', 'body_front', 33, 52],
  ['LI11', 'body_front', 27, 63],
  ['CV6', 'body_front', 60, 84],
  ['CV4', 'body_front', 60, 88],
  ['CV3', 'body_front', 60, 92],
  ['ST25', 'body_front', 52, 79],
  ['ST28', 'body_front', 52, 86],
  ['ST29', 'body_front', 52, 89],
  ['ST30', 'body_front', 52, 93],

  // ── body_back (posterior; coluna ilustrada ~x60; linha BL interna ~x55) ───
  ['GV16', 'body_back', 59, 22],
  ['GB20', 'body_back', 52, 23],
  ['BL10', 'body_back', 54, 25],
  ['GV14', 'body_back', 60, 36],
  ['GB21', 'body_back', 44, 33],
  ['SI10', 'body_back', 45, 41],
  ['TE14', 'body_back', 40, 40],
  ['BL11', 'body_back', 54, 40],
  ['BL12', 'body_back', 54, 42],
  ['GV12', 'body_back', 60, 44],
  ['SI9', 'body_back', 46, 44],
  ['BL13', 'body_back', 54, 45],
  ['SI11', 'body_back', 48, 48],
  ['BL15', 'body_back', 54, 49],
  ['BL17', 'body_back', 55, 53],
  ['BL18', 'body_back', 55, 57],
  ['BL20', 'body_back', 55, 60],
  ['BL21', 'body_back', 55, 62],
  ['BL22', 'body_back', 56, 64],
  ['BL23', 'body_back', 56, 67],
  ['GV4', 'body_back', 61, 67],
  ['BL24', 'body_back', 56, 69],
  ['BL25', 'body_back', 56, 72],
  ['BL26', 'body_back', 56, 74],
  ['BL27', 'body_back', 57, 77],
  ['BL28', 'body_back', 57, 79],
  ['BL31', 'body_back', 58, 80],
  ['BL32', 'body_back', 58, 82],
  ['BL33', 'body_back', 58, 84],
  ['BL34', 'body_back', 58, 86],
  ['BL54', 'body_back', 52, 87],

  // ── legs_front (uma perna, anterior; medial ~x43, lateral ~x58) ───────────
  ['ST34', 'legs_front', 56, 44],
  ['ST35', 'legs_front', 57, 49],
  ['ST36', 'legs_front', 56, 56],
  ['ST37', 'legs_front', 53, 63],
  ['ST39', 'legs_front', 52, 71],
  ['ST40', 'legs_front', 54, 66],
  ['SP10', 'legs_front', 43, 43],
  ['SP9', 'legs_front', 43, 54],
  ['SP8', 'legs_front', 43, 60],
  ['SP6', 'legs_front', 44, 82],
  ['LR8', 'legs_front', 44, 49],
  ['LR5', 'legs_front', 43, 73],
  ['KI7', 'legs_front', 44, 85],
  ['GB34', 'legs_front', 55, 55],
  ['GB39', 'legs_front', 52, 80],
  ['GB31', 'legs_front', 57, 38],
  ['GB33', 'legs_front', 59, 52],

  // ── legs_back (uma perna, posterior; nádega topo, poplíteo ~y57) ──────────
  ['GB30', 'legs_back', 40, 30],
  ['BL36', 'legs_back', 49, 31],
  ['BL37', 'legs_back', 49, 43],
  ['BL40', 'legs_back', 49, 57],
  ['BL56', 'legs_back', 48, 66],
  ['BL57', 'legs_back', 47, 72],
  ['BL58', 'legs_back', 49, 75],
  ['BL59', 'legs_back', 49, 82],
  ['BL60', 'legs_back', 48, 87],
  ['BL62', 'legs_back', 49, 89],

  // ── hands_palmar (antebraço+palma; polegar/radial=ESQUERDA, ulnar=direita) ─
  ['PC6', 'hands_palmar', 49, 56],
  ['PC7', 'hands_palmar', 49, 66],
  ['PC8', 'hands_palmar', 50, 78],
  ['PC9', 'hands_palmar', 52, 93],
  ['HT5', 'hands_palmar', 57, 60],
  ['HT6', 'hands_palmar', 58, 62],
  ['HT7', 'hands_palmar', 58, 66],
  ['HT8', 'hands_palmar', 58, 78],
  ['LU7', 'hands_palmar', 43, 56],
  ['LU9', 'hands_palmar', 41, 66],
  ['LU10', 'hands_palmar', 34, 74],
  ['LU11', 'hands_palmar', 28, 72],

  // ── hands_dorsal (antebraço+mão dorso; polegar=direita) ───────────────────
  ['LI4', 'hands_dorsal', 58, 78],
  ['LI5', 'hands_dorsal', 60, 68],
  ['LI10', 'hands_dorsal', 55, 16],
  ['TE3', 'hands_dorsal', 44, 82],
  ['TE5', 'hands_dorsal', 50, 56],
  ['SI3', 'hands_dorsal', 36, 76],

  // ── feet_dorsal (pé dorso; hálux/medial=DIREITA, lateral=ESQUERDA, tornozelo embaixo) ─
  ['LR3', 'feet_dorsal', 58, 40],
  ['LR2', 'feet_dorsal', 62, 20],
  ['ST44', 'feet_dorsal', 54, 22],
  ['ST45', 'feet_dorsal', 52, 12],
  ['ST41', 'feet_dorsal', 50, 62],
  ['GB40', 'feet_dorsal', 34, 64],
  ['GB41', 'feet_dorsal', 38, 38],
  ['KI3', 'feet_dorsal', 66, 72],
  ['KI6', 'feet_dorsal', 68, 78],
  ['BL67', 'feet_dorsal', 36, 16],

  // ── feet_plantar (planta; hálux/medial à ESQUERDA, calcanhar embaixo) ─────
  ['KI1', 'feet_plantar', 48, 33],
  ['KI2', 'feet_plantar', 36, 52],
  ['SP1', 'feet_plantar', 38, 10],
  ['SP4', 'feet_plantar', 34, 40],
];

function clampPct(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(100, Math.max(0, Number(numeric.toFixed(2))));
}

function scalePct(value, fromMin, fromMax, toMin, toMax) {
  const ratio = (Number(value) - fromMin) / (fromMax - fromMin);
  return clampPct(toMin + (ratio * (toMax - toMin)));
}

// Projeções calibradas para body-full.webp (corpo inteiro bilateral, vista anterior).
// Referências visuais: topo cabeça ~3%Y, queixo ~13%Y, ombros ~17%Y,
// mamilos ~25%Y, umbigo ~38%Y, virilha ~48%Y, joelhos ~68%Y,
// tornozelos ~90%Y, pés ~95%Y. Linha média X=50%, ombro ~30%/70%, mãos ~18%/82%.

function projectTorsoX(xPct) {
  // body_front/back: linha média ~x60 → body_full média x50; escala lateral ampla
  return clampPct(50 + ((Number(xPct) - 60) * 0.65));
}

function projectBodyFrontY(yPct) {
  // body_front: 0=topo cabeça→3%Y, 100=baixo abdome→48%Y
  return scalePct(yPct, 0, 100, 3, 48);
}

function projectBodyBackY(yPct) {
  // body_back: 0=topo cabeça→3%Y, 100=sacro/glúteo→50%Y
  return scalePct(yPct, 0, 100, 3, 50);
}

function projectLegX(xPct) {
  // legs: medial ~x43→50 body_full, lateral ~x58→42 (perna direita, espelhada)
  return clampPct(50 + ((Number(xPct) - 50) * 0.35));
}

function projectLegY(yPct) {
  // legs: topo coxa ~30→50%Y, tornozelo ~90→90%Y
  return scalePct(yPct, 25, 92, 50, 92);
}

function projectHandX(xPct) {
  // hands: projetar na mão direita ~x18-28
  return clampPct(22 + ((Number(xPct) - 50) * 0.2));
}

function projectHandY(yPct) {
  // hands: pulso ~14→42%Y, ponta dedos ~95→55%Y
  return scalePct(yPct, 10, 95, 40, 56);
}

function projectFootDorsalX(xPct) {
  // feet_dorsal: medial(RIGHT/high-x)→center(~48), lateral(LEFT/low-x)→outer(~40)
  return clampPct(44 + ((Number(xPct) - 50) * 0.14));
}

function projectFootPlantarX(xPct) {
  // feet_plantar: medial(LEFT/low-x)→center(~48), lateral(RIGHT/high-x)→outer(~40)
  // Espelhar: x baixo no plantar = medial = x alto no body_full (centro)
  return clampPct(44 + ((50 - Number(xPct)) * 0.14));
}

function projectFootY(yPct) {
  // feet: dedos ~10→96%Y, tornozelo ~80→90%Y no body_full
  return scalePct(yPct, 10, 80, 96, 90);
}

function projectToBodyFull([code, mapId, xPct, yPct]) {
  if (mapId === 'body_front') {
    return [code, projectTorsoX(xPct), projectBodyFrontY(yPct), mapId];
  }

  if (mapId === 'body_back') {
    return [code, projectTorsoX(xPct), projectBodyBackY(yPct), mapId];
  }

  if (mapId === 'legs_front' || mapId === 'legs_back') {
    return [code, projectLegX(xPct), projectLegY(yPct), mapId];
  }

  if (mapId === 'hands_palmar' || mapId === 'hands_dorsal') {
    return [code, projectHandX(xPct), projectHandY(yPct), mapId];
  }

  if (mapId === 'feet_dorsal') {
    return [code, projectFootDorsalX(xPct), projectFootY(yPct), mapId];
  }

  if (mapId === 'feet_plantar') {
    return [code, projectFootPlantarX(xPct), projectFootY(yPct), mapId];
  }

  return [code, xPct, yPct, mapId];
}

const COMMON_BODY_FULL_COORDS = COMMON_BODY_COORDS.map(projectToBodyFull);

export const commonlyUsedMapLocations = COMMON_BODY_COORDS.map(([code, mapId, xPct, yPct]) => ({
  code,
  mapId,
  view: VIEW_BY_MAP[mapId],
  xPct,
  yPct,
  ...RECALIBRATED,
}));

export const commonlyUsedBodyFullMapLocations = COMMON_BODY_FULL_COORDS.map(([code, xPct, yPct, projectedFromMapId]) => ({
  code,
  mapId: 'body_full',
  view: VIEW_BY_MAP.body_full,
  xPct,
  yPct,
  projectedFromMapId,
  overviewProjection: true,
  ...BODY_FULL_RECALIBRATED,
}));

// Conjunto de códigos normalizados cobertos por esta camada autoritativa.
// Usado por getAllMapLocations para suprimir marcadores bilaterais/legados
// (base e rascunhos gerados) dos mesmos pontos — garante UM marcador por ponto.
export const commonlyUsedMapLocationCodes = new Set(
  commonlyUsedMapLocations.map(location => normalizePointCode(location.code)),
);

// Sanidade em tempo de import: todo mapId precisa pertencer à região canônica
// do ponto, senão validateMapLocations() falharia com region_map_mismatch.
for (const location of commonlyUsedMapLocations) {
  const allowed = getAllowedMapIds(location.code);
  if (allowed.length && !allowed.includes(location.mapId)) {
    throw new Error(
      `commonlyUsedMapLocations: ${location.code} em ${location.mapId} fora da região permitida (${allowed.join(', ')})`,
    );
  }
}
