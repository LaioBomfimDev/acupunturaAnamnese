import { normalizePointCode, displayPointCode } from './aliases';
import {
  getAllowedMapIds,
  getCanonicalRegion,
  isMidlinePoint,
  isPlausibleOnBodySheet,
} from './mapRouting';
import { highConfidenceMapLocations } from './generated/high-confidence-map-locations';
import { mediumConfidenceMapLocations } from './generated/medium-confidence-map-locations';
import {
  auricularPdfLabelToCode,
  auricularPdfMapLocations,
  auricularPdfPoints,
} from './generated/auricular-pdf-points';
import {
  commonlyUsedBodyFullMapLocations,
  commonlyUsedMapLocations,
  commonlyUsedMapLocationCodes,
} from './commonlyUsedMapLocations';

export const CALIBRATED_MAP_LOCATIONS_KEY = 'acup_living_library_map_locations_v1';

export const LOCAL_THERAPIST_MAP_APPROVAL = {
  approved: true,
  calibrationStatus: 'approved_local_visual',
  coordinateConfidence: 'confirmed_visual_local',
  sourceConfidence: 'therapist_visual_confirmation',
  approvalMode: 'local_only',
  approvalMethod: 'therapist_map_coordinate_auto_approval',
  requiresProfessionalAudit: true,
  source: 'Ajuste visual local aprovado automaticamente por acupunturista no mapa',
};

export function buildLocalMapApproval(actorRole = 'therapist', actorLabel = 'acupunturista') {
  return {
    ...LOCAL_THERAPIST_MAP_APPROVAL,
    approvalMethod: `${actorRole}_map_coordinate_auto_approval`,
    source: `Ajuste visual local aprovado automaticamente por ${actorLabel} no mapa`,
  };
}

export const mapAssets = {
  body_front: {
    id: 'body_front',
    label: 'Torso e cabeça - frente',
    type: 'body',
    segment: 'torso_head',
    view: 'anterior',
    src: '/maps/body-front.webp',
    viewBox: { width: 100, height: 125 },
    coordinateSystem: 'svg-percent-calibrated',
    status: 'draft_visual_asset',
  },
  body_back: {
    id: 'body_back',
    label: 'Torso e cabeça - costas',
    type: 'body',
    segment: 'torso_head',
    view: 'posterior',
    src: '/maps/body-back.webp',
    viewBox: { width: 100, height: 125 },
    coordinateSystem: 'svg-percent-calibrated',
    status: 'draft_visual_asset',
  },
  legs_front: {
    id: 'legs_front',
    label: 'Pernas - frente',
    type: 'body',
    segment: 'legs',
    view: 'anterior',
    src: '/maps/legs-front.webp',
    viewBox: { width: 100, height: 125 },
    coordinateSystem: 'svg-percent-calibrated',
    status: 'draft_visual_asset',
  },
  legs_back: {
    id: 'legs_back',
    label: 'Pernas - costas',
    type: 'body',
    segment: 'legs',
    view: 'posterior',
    src: '/maps/legs-back.webp',
    viewBox: { width: 100, height: 125 },
    coordinateSystem: 'svg-percent-calibrated',
    status: 'draft_visual_asset',
  },
  feet_dorsal: {
    id: 'feet_dorsal',
    label: 'Pés - dorso',
    type: 'foot',
    segment: 'feet',
    view: 'dorsal',
    src: '/maps/feet-dorsal.webp',
    viewBox: { width: 100, height: 100 },
    coordinateSystem: 'svg-percent-calibrated',
    status: 'draft_visual_asset',
  },
  feet_plantar: {
    id: 'feet_plantar',
    label: 'Pés - planta',
    type: 'foot',
    segment: 'feet',
    view: 'plantar',
    src: '/maps/feet-plantar.webp',
    viewBox: { width: 100, height: 100 },
    coordinateSystem: 'svg-percent-calibrated',
    status: 'draft_visual_asset',
  },
  hands_palmar: {
    id: 'hands_palmar',
    label: 'Mãos e punhos - palma',
    type: 'hand',
    segment: 'hands_wrists',
    view: 'palmar',
    src: '/maps/hands-palmar.webp',
    viewBox: { width: 100, height: 100 },
    coordinateSystem: 'svg-percent-calibrated',
    status: 'draft_visual_asset',
  },
  hands_dorsal: {
    id: 'hands_dorsal',
    label: 'Mãos e punhos - dorso',
    type: 'hand',
    segment: 'hands_wrists',
    view: 'dorsal',
    src: '/maps/hands-dorsal.webp',
    viewBox: { width: 100, height: 100 },
    coordinateSystem: 'svg-percent-calibrated',
    status: 'draft_visual_asset',
  },
  body_full: {
    id: 'body_full',
    label: 'Corpo inteiro',
    type: 'body',
    segment: 'full_body',
    view: 'anterior',
    src: '/maps/body-full.webp',
    viewBox: { width: 100, height: 200 },
    coordinateSystem: 'svg-percent-calibrated',
    status: 'draft_visual_asset',
  },
  ear_lateral: {
    id: 'ear_lateral',
    label: 'Orelha - lateral',
    type: 'ear',
    segment: 'ear',
    view: 'lateral',
    src: '/maps/ear-lateral.webp',
    viewBox: { width: 100, height: 100 },
    coordinateSystem: 'svg-percent-calibrated',
    status: 'draft_visual_asset',
  },
  ear_protocol: {
    id: 'ear_protocol',
    label: 'Orelha - protocolo',
    type: 'ear',
    segment: 'ear',
    view: 'lateral',
    src: '/maps/ear-lateral.webp',
    viewBox: { width: 100, height: 100 },
    coordinateSystem: 'svg-percent-calibrated',
    status: 'draft_visual_asset',
  },
};

const approvedKmAtlasLocal = {
  approved: true,
  calibrationStatus: 'approved_local_visual',
  coordinateConfidence: 'confirmed_visual_local',
  sourceConfidence: 'confidence high (>80%)',
  approvalMode: 'local_only',
  requiresProfessionalAudit: true,
  source: 'KM-Agent + Atlas Ednea Martins + revisão visual local do mapa',
};

const approvedAtlasLocal = {
  ...approvedKmAtlasLocal,
  sourceConfidence: 'source_named_section',
  source: 'Atlas Ednea Martins + revisão visual local do mapa',
};

export const pointLocations = [
  { code: 'EX-HN3', mapId: 'body_front', view: 'anterior', xPct: 50, yPct: 21, ...approvedAtlasLocal },
  { code: 'GV20', mapId: 'body_front', view: 'anterior', xPct: 50, yPct: 8, ...approvedKmAtlasLocal },
  { code: 'CV12', mapId: 'body_front', view: 'anterior', xPct: 50, yPct: 70, ...approvedKmAtlasLocal },
  { code: 'CV6', mapId: 'body_front', view: 'anterior', xPct: 50, yPct: 88, ...approvedKmAtlasLocal },
  { code: 'LI11', mapId: 'body_front', view: 'anterior', xPct: 21, yPct: 73, ...approvedKmAtlasLocal },

  // --- Novos pontos — Fase 1 (body_front) ---
  { code: 'CV4', mapId: 'body_front', view: 'anterior', xPct: 50, yPct: 96, approved: false, calibrationStatus: 'draft' },
  { code: 'CV17', mapId: 'body_front', view: 'anterior', xPct: 50, yPct: 52, approved: false, calibrationStatus: 'draft' },
  { code: 'ST25', mapId: 'body_front', view: 'anterior', xPct: 43, yPct: 85, approved: false, calibrationStatus: 'draft' },
  { code: 'ST25', mapId: 'body_front', view: 'anterior', xPct: 57, yPct: 85, approved: false, calibrationStatus: 'draft' },
  { code: 'GB21', mapId: 'body_front', view: 'anterior', xPct: 32, yPct: 42, approved: false, calibrationStatus: 'draft' },
  { code: 'GB21', mapId: 'body_front', view: 'anterior', xPct: 68, yPct: 42, approved: false, calibrationStatus: 'draft' },
  { code: 'LI20', mapId: 'body_front', view: 'anterior', xPct: 46, yPct: 27, approved: false, calibrationStatus: 'draft' },
  { code: 'LI20', mapId: 'body_front', view: 'anterior', xPct: 54, yPct: 27, approved: false, calibrationStatus: 'draft' },

  { code: 'GV20', mapId: 'body_back', view: 'posterior', xPct: 50, yPct: 7, ...approvedKmAtlasLocal },
  { code: 'GB20', mapId: 'body_back', view: 'posterior', xPct: 43, yPct: 25, ...approvedKmAtlasLocal },

  // --- Novos pontos — Fase 1 (body_back) ---
  { code: 'BL13', mapId: 'body_back', view: 'posterior', xPct: 44, yPct: 43, approved: false, calibrationStatus: 'draft' },
  { code: 'BL13', mapId: 'body_back', view: 'posterior', xPct: 56, yPct: 43, approved: false, calibrationStatus: 'draft' },
  { code: 'BL20', mapId: 'body_back', view: 'posterior', xPct: 44, yPct: 64, approved: false, calibrationStatus: 'draft' },
  { code: 'BL20', mapId: 'body_back', view: 'posterior', xPct: 56, yPct: 64, approved: false, calibrationStatus: 'draft' },
  { code: 'BL23', mapId: 'body_back', view: 'posterior', xPct: 44, yPct: 74, approved: false, calibrationStatus: 'draft' },
  { code: 'BL23', mapId: 'body_back', view: 'posterior', xPct: 56, yPct: 74, approved: false, calibrationStatus: 'draft' },
  { code: 'GV4', mapId: 'body_back', view: 'posterior', xPct: 50, yPct: 74, approved: false, calibrationStatus: 'draft' },
  { code: 'GV14', mapId: 'body_back', view: 'posterior', xPct: 50, yPct: 36, approved: false, calibrationStatus: 'draft' },
  { code: 'GB21', mapId: 'body_back', view: 'posterior', xPct: 31, yPct: 36, approved: false, calibrationStatus: 'draft' },
  { code: 'GB21', mapId: 'body_back', view: 'posterior', xPct: 69, yPct: 36, approved: false, calibrationStatus: 'draft' },

  { code: 'GB34', mapId: 'legs_front', view: 'anterior', xPct: 62, yPct: 55, ...approvedKmAtlasLocal },
  { code: 'ST36', mapId: 'legs_front', view: 'anterior', xPct: 58, yPct: 62, ...approvedKmAtlasLocal },
  { code: 'SP6', mapId: 'legs_front', view: 'anterior', xPct: 43, yPct: 86, ...approvedKmAtlasLocal },
  { code: 'SP9', mapId: 'legs_front', view: 'anterior', xPct: 43, yPct: 55, ...approvedKmAtlasLocal },
  { code: 'ST40', mapId: 'legs_front', view: 'anterior', xPct: 59, yPct: 74, ...approvedKmAtlasLocal },

  // --- Novos pontos — Fase 1 (legs_front) ---
  { code: 'SP10', mapId: 'legs_front', view: 'anterior', xPct: 38, yPct: 43, approved: false, calibrationStatus: 'draft' },
  { code: 'SP10', mapId: 'legs_front', view: 'anterior', xPct: 62, yPct: 43, approved: false, calibrationStatus: 'draft' },
  { code: 'KI6', mapId: 'legs_front', view: 'anterior', xPct: 37, yPct: 90, approved: false, calibrationStatus: 'draft' },
  { code: 'KI6', mapId: 'legs_front', view: 'anterior', xPct: 63, yPct: 90, approved: false, calibrationStatus: 'draft' },
  { code: 'KI7', mapId: 'legs_front', view: 'anterior', xPct: 38, yPct: 84, approved: false, calibrationStatus: 'draft' },
  { code: 'KI7', mapId: 'legs_front', view: 'anterior', xPct: 62, yPct: 84, approved: false, calibrationStatus: 'draft' },

  { code: 'LR3', mapId: 'feet_dorsal', view: 'dorsal', xPct: 39, yPct: 30, approved: true, calibrationStatus: 'approved_local_visual', coordinateConfidence: 'confirmed_visual_local', sourceConfidence: 'confidence high (>80%)', approvalMode: 'local_only', requiresProfessionalAudit: true, source: 'KM-Agent + Atlas Ednea Martins + revisão visual local do mapa' },
  { code: 'SP3', mapId: 'feet_dorsal', view: 'dorsal', xPct: 44, yPct: 43, approved: true, calibrationStatus: 'approved_local_visual', coordinateConfidence: 'confirmed_visual_local', sourceConfidence: 'confidence high (>80%)', approvalMode: 'local_only', requiresProfessionalAudit: true, source: 'KM-Agent + Atlas Ednea Martins + revisão visual local do mapa' },
  { code: 'KI1', mapId: 'feet_plantar', view: 'plantar', xPct: 50, yPct: 33, approved: true, calibrationStatus: 'approved_local_visual', coordinateConfidence: 'confirmed_visual_local', sourceConfidence: 'source_named_section', approvalMode: 'local_only', requiresProfessionalAudit: true, source: 'Atlas Ednea Martins + revisão visual local do mapa' },
  { code: 'KI3', mapId: 'feet_dorsal', view: 'dorsal', xPct: 39, yPct: 73, approved: false, calibrationStatus: 'draft' },

  { code: 'PC6', mapId: 'hands_palmar', view: 'palmar', xPct: 31, yPct: 45, approved: true, calibrationStatus: 'approved_local_visual', coordinateConfidence: 'confirmed_visual_local', sourceConfidence: 'confidence high (>80%)', approvalMode: 'local_only', requiresProfessionalAudit: true, source: 'KM-Agent + Atlas Ednea Martins + revisão visual local do mapa' },
  { code: 'HT7', mapId: 'hands_palmar', view: 'palmar', xPct: 32, yPct: 55, approved: true, calibrationStatus: 'approved_local_visual', coordinateConfidence: 'confirmed_visual_local', sourceConfidence: 'confidence high (>80%)', approvalMode: 'local_only', requiresProfessionalAudit: true, source: 'KM-Agent + Atlas Ednea Martins + revisão visual local do mapa' },

  // --- Novos pontos — Fase 1 (hands_palmar) ---
  { code: 'LU7', mapId: 'hands_palmar', view: 'palmar', xPct: 35, yPct: 25, approved: false, calibrationStatus: 'draft' },
  { code: 'LU7', mapId: 'hands_palmar', view: 'palmar', xPct: 65, yPct: 25, approved: false, calibrationStatus: 'draft' },
  { code: 'LU9', mapId: 'hands_palmar', view: 'palmar', xPct: 33, yPct: 30, approved: false, calibrationStatus: 'draft' },
  { code: 'LU9', mapId: 'hands_palmar', view: 'palmar', xPct: 67, yPct: 30, approved: false, calibrationStatus: 'draft' },

  { code: 'LI4', mapId: 'hands_dorsal', view: 'dorsal', xPct: 68, yPct: 80, approved: false, calibrationStatus: 'draft' },
  { code: 'TE5', mapId: 'hands_dorsal', view: 'dorsal', xPct: 32, yPct: 49, approved: false, calibrationStatus: 'draft' },

  { code: 'auricular:shen-men', label: 'Shen Men', mapId: 'ear_protocol', view: 'lateral', xPct: 56, yPct: 30, approved: true, calibrationStatus: 'approved_local_visual', coordinateConfidence: 'confirmed_visual_local', sourceConfidence: 'local_protocol_anchor', approvalMode: 'local_only', requiresProfessionalAudit: true, source: 'Mapa auricular local aprovado no protocolo + revisão visual local do mapa' },
  { code: 'auricular:figado', label: 'Fígado', mapId: 'ear_protocol', view: 'lateral', xPct: 62, yPct: 47, approved: true, calibrationStatus: 'approved_local_visual', coordinateConfidence: 'confirmed_visual_local', sourceConfidence: 'local_protocol_anchor', approvalMode: 'local_only', requiresProfessionalAudit: true, source: 'Mapa auricular local aprovado no protocolo + revisão visual local do mapa' },
  { code: 'auricular:subcortex', label: 'Subcórtex', mapId: 'ear_protocol', view: 'lateral', xPct: 52, yPct: 66, approved: true, calibrationStatus: 'approved_local_visual', coordinateConfidence: 'confirmed_visual_local', sourceConfidence: 'local_protocol_anchor', approvalMode: 'local_only', requiresProfessionalAudit: true, source: 'Mapa auricular local aprovado no protocolo + revisão visual local do mapa' },
  { code: 'auricular:ansiedade', label: 'Ansiedade', mapId: 'ear_protocol', view: 'lateral', xPct: 38, yPct: 34, approved: true, calibrationStatus: 'approved_local_visual', coordinateConfidence: 'confirmed_visual_local', sourceConfidence: 'local_protocol_anchor', approvalMode: 'local_only', requiresProfessionalAudit: true, source: 'Mapa auricular local aprovado no protocolo + revisão visual local do mapa' },
  { code: 'auricular:rim', label: 'Rim', mapId: 'ear_protocol', view: 'lateral', xPct: 45, yPct: 58, approved: true, calibrationStatus: 'approved_local_visual', coordinateConfidence: 'confirmed_visual_local', sourceConfidence: 'local_protocol_anchor', approvalMode: 'local_only', requiresProfessionalAudit: true, source: 'Mapa auricular local aprovado no protocolo + revisão visual local do mapa' },
  { code: 'auricular:estomago', label: 'Estômago', mapId: 'ear_protocol', view: 'lateral', xPct: 62, yPct: 56, approved: true, calibrationStatus: 'approved_local_visual', coordinateConfidence: 'confirmed_visual_local', sourceConfidence: 'local_protocol_anchor', approvalMode: 'local_only', requiresProfessionalAudit: true, source: 'Mapa auricular local aprovado no protocolo + revisão visual local do mapa' },
  { code: 'auricular:baco', label: 'Baço', mapId: 'ear_protocol', view: 'lateral', xPct: 55, yPct: 52, approved: true, calibrationStatus: 'approved_local_visual', coordinateConfidence: 'confirmed_visual_local', sourceConfidence: 'local_protocol_anchor', approvalMode: 'local_only', requiresProfessionalAudit: true, source: 'Mapa auricular local aprovado no protocolo + revisão visual local do mapa' },
  { code: 'auricular:endocrino', label: 'Endócrino', mapId: 'ear_protocol', view: 'lateral', xPct: 50, yPct: 76, approved: true, calibrationStatus: 'approved_local_visual', coordinateConfidence: 'confirmed_visual_local', sourceConfidence: 'local_protocol_anchor', approvalMode: 'local_only', requiresProfessionalAudit: true, source: 'Mapa auricular local aprovado no protocolo + revisão visual local do mapa' },
  { code: 'auricular:fome', label: 'Fome', mapId: 'ear_protocol', view: 'lateral', xPct: 70, yPct: 62, approved: true, calibrationStatus: 'approved_local_visual', coordinateConfidence: 'confirmed_visual_local', sourceConfidence: 'local_protocol_anchor', approvalMode: 'local_only', requiresProfessionalAudit: true, source: 'Mapa auricular local aprovado no protocolo + revisão visual local do mapa' },
  { code: 'auricular:coracao', label: 'Coração', mapId: 'ear_protocol', view: 'lateral', xPct: 48, yPct: 48, approved: true, calibrationStatus: 'approved_local_visual', coordinateConfidence: 'confirmed_visual_local', sourceConfidence: 'local_protocol_anchor', approvalMode: 'local_only', requiresProfessionalAudit: true, source: 'Mapa auricular local aprovado no protocolo + revisão visual local do mapa' },
  { code: 'auricular:sono', label: 'Sono', mapId: 'ear_protocol', view: 'lateral', xPct: 44, yPct: 30, approved: true, calibrationStatus: 'approved_local_visual', coordinateConfidence: 'confirmed_visual_local', sourceConfidence: 'local_protocol_anchor', approvalMode: 'local_only', requiresProfessionalAudit: true, source: 'Mapa auricular local aprovado no protocolo + revisão visual local do mapa' },

  { code: 'auricular:shen-men', label: 'Shen Men', mapId: 'ear_lateral', view: 'lateral', xPct: 56, yPct: 30, approved: true, calibrationStatus: 'approved_local_visual', coordinateConfidence: 'confirmed_visual_local', sourceConfidence: 'local_protocol_anchor', approvalMode: 'local_only', requiresProfessionalAudit: true, source: 'Mapa auricular local aprovado no protocolo + revisão visual local do mapa' },
  { code: 'auricular:figado', label: 'Fígado', mapId: 'ear_lateral', view: 'lateral', xPct: 62, yPct: 47, approved: true, calibrationStatus: 'approved_local_visual', coordinateConfidence: 'confirmed_visual_local', sourceConfidence: 'local_protocol_anchor', approvalMode: 'local_only', requiresProfessionalAudit: true, source: 'Mapa auricular local aprovado no protocolo + revisão visual local do mapa' },
  { code: 'auricular:subcortex', label: 'Subcórtex', mapId: 'ear_lateral', view: 'lateral', xPct: 52, yPct: 66, approved: true, calibrationStatus: 'approved_local_visual', coordinateConfidence: 'confirmed_visual_local', sourceConfidence: 'local_protocol_anchor', approvalMode: 'local_only', requiresProfessionalAudit: true, source: 'Mapa auricular local aprovado no protocolo + revisão visual local do mapa' },
  { code: 'auricular:ansiedade', label: 'Ansiedade', mapId: 'ear_lateral', view: 'lateral', xPct: 38, yPct: 34, approved: true, calibrationStatus: 'approved_local_visual', coordinateConfidence: 'confirmed_visual_local', sourceConfidence: 'local_protocol_anchor', approvalMode: 'local_only', requiresProfessionalAudit: true, source: 'Mapa auricular local aprovado no protocolo + revisão visual local do mapa' },
  { code: 'auricular:rim', label: 'Rim', mapId: 'ear_lateral', view: 'lateral', xPct: 45, yPct: 58, approved: true, calibrationStatus: 'approved_local_visual', coordinateConfidence: 'confirmed_visual_local', sourceConfidence: 'local_protocol_anchor', approvalMode: 'local_only', requiresProfessionalAudit: true, source: 'Mapa auricular local aprovado no protocolo + revisão visual local do mapa' },
  { code: 'auricular:estomago', label: 'Estômago', mapId: 'ear_lateral', view: 'lateral', xPct: 62, yPct: 56, approved: true, calibrationStatus: 'approved_local_visual', coordinateConfidence: 'confirmed_visual_local', sourceConfidence: 'local_protocol_anchor', approvalMode: 'local_only', requiresProfessionalAudit: true, source: 'Mapa auricular local aprovado no protocolo + revisão visual local do mapa' },
  { code: 'auricular:baco', label: 'Baço', mapId: 'ear_lateral', view: 'lateral', xPct: 55, yPct: 52, approved: true, calibrationStatus: 'approved_local_visual', coordinateConfidence: 'confirmed_visual_local', sourceConfidence: 'local_protocol_anchor', approvalMode: 'local_only', requiresProfessionalAudit: true, source: 'Mapa auricular local aprovado no protocolo + revisão visual local do mapa' },
  { code: 'auricular:endocrino', label: 'Endócrino', mapId: 'ear_lateral', view: 'lateral', xPct: 50, yPct: 76, approved: true, calibrationStatus: 'approved_local_visual', coordinateConfidence: 'confirmed_visual_local', sourceConfidence: 'local_protocol_anchor', approvalMode: 'local_only', requiresProfessionalAudit: true, source: 'Mapa auricular local aprovado no protocolo + revisão visual local do mapa' },
  { code: 'auricular:fome', label: 'Fome', mapId: 'ear_lateral', view: 'lateral', xPct: 70, yPct: 62, approved: true, calibrationStatus: 'approved_local_visual', coordinateConfidence: 'confirmed_visual_local', sourceConfidence: 'local_protocol_anchor', approvalMode: 'local_only', requiresProfessionalAudit: true, source: 'Mapa auricular local aprovado no protocolo + revisão visual local do mapa' },
  { code: 'auricular:coracao', label: 'Coração', mapId: 'ear_lateral', view: 'lateral', xPct: 48, yPct: 48, approved: true, calibrationStatus: 'approved_local_visual', coordinateConfidence: 'confirmed_visual_local', sourceConfidence: 'local_protocol_anchor', approvalMode: 'local_only', requiresProfessionalAudit: true, source: 'Mapa auricular local aprovado no protocolo + revisão visual local do mapa' },
  { code: 'auricular:sono', label: 'Sono', mapId: 'ear_lateral', view: 'lateral', xPct: 44, yPct: 30, approved: true, calibrationStatus: 'approved_local_visual', coordinateConfidence: 'confirmed_visual_local', sourceConfidence: 'local_protocol_anchor', approvalMode: 'local_only', requiresProfessionalAudit: true, source: 'Mapa auricular local aprovado no protocolo + revisão visual local do mapa' },
];

export const mapGroups = [
  {
    id: 'full_body',
    label: 'Corpo inteiro',
    maps: ['body_full'],
  },
  {
    id: 'torso_head',
    label: 'Torso e cabeça',
    maps: ['body_front', 'body_back'],
  },
  {
    id: 'legs',
    label: 'Pernas',
    maps: ['legs_front', 'legs_back'],
  },
  {
    id: 'hands_wrists',
    label: 'Mãos e punhos',
    maps: ['hands_palmar', 'hands_dorsal'],
  },
  {
    id: 'feet',
    label: 'Pés',
    maps: ['feet_dorsal', 'feet_plantar'],
  },
  {
    id: 'ear',
    label: 'Auricular',
    maps: ['ear_lateral'],
  },
];

const auricularCalibrationPointOptions = [
  'Shen Men', 'Fígado', 'Subcórtex', 'Ansiedade', 'Rim', 'Estômago',
  'Baço', 'Endócrino', 'Coração', 'Sono', 'Fome',
];

export const auricularLabelToCode = {
  ...auricularPdfLabelToCode,
  'Shen Men': 'auricular:shen-men',
  Fígado: 'auricular:figado',
  Subcórtex: 'auricular:subcortex',
  Ansiedade: 'auricular:ansiedade',
  Rim: 'auricular:rim',
  Estômago: 'auricular:estomago',
  Baço: 'auricular:baco',
  Endócrino: 'auricular:endocrino',
  Coração: 'auricular:coracao',
  Sono: 'auricular:sono',
  Fome: 'auricular:fome',
};

const meridianSortOrder = {
  LU: 1,
  LI: 2,
  ST: 3,
  SP: 4,
  HT: 5,
  SI: 6,
  BL: 7,
  KI: 8,
  PC: 9,
  TE: 10,
  GB: 11,
  LR: 12,
  CV: 13,
  GV: 14,
  EX: 15,
};

function calibrationSortValue(option) {
  const normalized = normalizePointCode(option);
  const extraMatch = normalized.match(/^EX-([A-Z]+)(\d+)$/);
  if (extraMatch) {
    return [meridianSortOrder.EX, extraMatch[1], Number(extraMatch[2])];
  }

  const match = normalized.match(/^([A-Z]+)(\d+)$/);
  if (!match) {
    return [99, normalized, 0];
  }

  const [, meridian, number] = match;
  return [meridianSortOrder[meridian] || 90, meridian, Number(number)];
}

function compareCalibrationOptions(left, right) {
  const leftSort = calibrationSortValue(left);
  const rightSort = calibrationSortValue(right);

  for (let index = 0; index < leftSort.length; index += 1) {
    if (leftSort[index] < rightSort[index]) return -1;
    if (leftSort[index] > rightSort[index]) return 1;
  }

  return String(left).localeCompare(String(right));
}

function clampPct(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(100, Math.max(0, Number(numeric.toFixed(2))));
}

function scalePct(value, fromMin, fromMax, toMin, toMax) {
  const ratio = (value - fromMin) / (fromMax - fromMin);
  return clampPct(toMin + (ratio * (toMax - toMin)));
}

function rescaleBodyFrontY(yPct) {
  if (yPct <= 24) return clampPct(yPct + 4);
  return scalePct(yPct, 24, 64, 40, 96);
}

function rescaleBodyBackY(yPct) {
  if (yPct <= 20) return clampPct(yPct + 4);
  return scalePct(yPct, 20, 64, 28, 94);
}

function rescaleFrontLegY(yPct) {
  return scalePct(yPct, 60, 98, 18, 96);
}

function rescaleBackLegY(yPct) {
  return scalePct(yPct, 64, 98, 24, 96);
}

function rescaleHandY(yPct) {
  return scalePct(yPct, 42, 64, 18, 84);
}

function rescaleFootX(xPct) {
  return scalePct(xPct, 34, 66, 14, 86);
}

function rescaleFootY(yPct) {
  return scalePct(yPct, 84, 100, 14, 86);
}

// Mapas alcançáveis a partir de cada origem com transformação de coordenadas
// conhecida. Frente/costas não se misturam: ponto de face desenhado no mapa
// das costas (e vice-versa) não tem rota e fica sinalizado para revisão.
const SEGMENT_REACHABLE_MAPS = {
  body_front: ['body_front', 'legs_front', 'hands_palmar', 'hands_dorsal', 'feet_dorsal'],
  body_back: ['body_back', 'legs_back', 'hands_dorsal', 'feet_dorsal'],
  hands_palmar: ['hands_palmar', 'hands_dorsal'],
};

const MAP_MISMATCH_REVIEW = {
  reviewStatus: 'review_map_mismatch',
  mapMismatch: true,
};

function isBodySheet(mapId) {
  return mapId === 'body_front' || mapId === 'body_back';
}

function resolveSegmentedTarget(location) {
  const region = getCanonicalRegion(location.code);
  if (!region) return { mapId: location.mapId, mismatch: false };

  const allowed = getAllowedMapIds(region);
  if (!allowed.length) return { mapId: location.mapId, mismatch: false };

  // Coordenada incoerente com a região na folha de corpo inteiro:
  // não reescala para um lugar errado, sinaliza para recalibração humana.
  if (isBodySheet(location.mapId) && !isPlausibleOnBodySheet(region, location.mapId, location.yPct)) {
    return { mapId: location.mapId, mismatch: true };
  }

  const reachable = SEGMENT_REACHABLE_MAPS[location.mapId] || [location.mapId];
  const target = allowed.find(mapId => reachable.includes(mapId));
  if (!target) return { mapId: location.mapId, mismatch: true };

  return { mapId: target, mismatch: false };
}

function transformLocationForSegmentedMap(location) {
  const { mapId, mismatch } = resolveSegmentedTarget(location);

  if (mismatch) {
    return { ...location, ...MAP_MISMATCH_REVIEW };
  }

  const next = {
    ...location,
    mapId,
    view: mapAssets[mapId]?.view || location.view,
  };

  const fromBodySheet = isBodySheet(location.mapId);
  if (fromBodySheet && mapId === 'body_front') {
    next.yPct = rescaleBodyFrontY(location.yPct);
  } else if (fromBodySheet && mapId === 'body_back') {
    next.yPct = rescaleBodyBackY(location.yPct);
  } else if (fromBodySheet && mapId === 'legs_front') {
    next.yPct = rescaleFrontLegY(location.yPct);
  } else if (fromBodySheet && mapId === 'legs_back') {
    next.yPct = rescaleBackLegY(location.yPct);
  } else if (fromBodySheet && (mapId === 'hands_palmar' || mapId === 'hands_dorsal')) {
    next.yPct = rescaleHandY(location.yPct);
  } else if (fromBodySheet && (mapId === 'feet_dorsal' || mapId === 'feet_plantar')) {
    next.xPct = rescaleFootX(location.xPct);
    next.yPct = rescaleFootY(location.yPct);
  }

  if (isMidlinePoint(location.code) && isBodySheet(mapId)) {
    next.xPct = 50;
  }

  if (mapId !== location.mapId) {
    next.segmentedFromMapId = location.mapId;
  }

  return next;
}

const segmentedHighConfidenceMapLocations = highConfidenceMapLocations.map(location => ({
  ...transformLocationForSegmentedMap(location),
  calibrationStatus: location.calibrationStatus,
}));

const segmentedMediumConfidenceMapLocations = mediumConfidenceMapLocations.map(location => ({
  ...transformLocationForSegmentedMap(location),
  calibrationStatus: location.calibrationStatus,
}));

export const calibrationPointOptions = [
  ...new Set([
    ...pointLocations
      .filter(location => !location.code?.startsWith('auricular:'))
      .map(location => normalizePointCode(location.code))
      .filter(Boolean),
    ...commonlyUsedMapLocations
      .map(location => normalizePointCode(location.code))
      .filter(Boolean),
    ...commonlyUsedBodyFullMapLocations
      .map(location => normalizePointCode(location.code))
      .filter(Boolean),
    ...segmentedHighConfidenceMapLocations
      .map(location => normalizePointCode(location.code))
      .filter(Boolean),
    ...segmentedMediumConfidenceMapLocations
      .map(location => normalizePointCode(location.code))
      .filter(Boolean),
    ...auricularCalibrationPointOptions,
    ...auricularPdfPoints.map(point => point.name),
  ]),
].sort(compareCalibrationOptions);

let cachedStoredRaw = null;
let cachedStoredLocations = null;
let cachedAllLocations = null;
let cachedPointLocationIndex = null;
let cachedStorageSignature = null;

export function getMapAsset(mapId) {
  return mapAssets[mapId] || null;
}

// Lado do corpo a partir do x no mapa. Pontos bilaterais têm duas entradas
// (esquerda/direita) no mesmo mapa; a identidade precisa distinguir os lados
// para que calibrar um lado não apague o outro.
export function getLocationSide(location) {
  if (!location || isMidlinePoint(location.code)) return 'center';
  const x = Number(location.xPct);
  if (!Number.isFinite(x) || (x >= 48 && x <= 52)) return 'center';
  return x < 48 ? 'left' : 'right';
}

function locationIdentity(location) {
  const code = location.code?.startsWith('auricular:')
    ? location.code
    : normalizePointCode(location.code);
  return `${code}::${location.mapId}::${getLocationSide(location)}`;
}

export function getLocationIdentity(location) {
  return locationIdentity(location);
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

function normalizeStoredSegmentedLocation(location) {
  if (!location?.mapId || location.mapId?.startsWith('ear_')) return location;

  const segmented = transformLocationForSegmentedMap(location);
  if (segmented.mapId === location.mapId) return location;

  return {
    ...location,
    ...segmented,
    calibrationStatus: location.calibrationStatus || 'local_draft',
    legacyMapId: location.legacyMapId || location.mapId,
  };
}

export function readStoredMapLocations() {
  if (typeof localStorage === 'undefined') return [];
  const raw = currentStorageSignature();
  if (raw === cachedStoredRaw && cachedStoredLocations) return cachedStoredLocations;

  try {
    const parsed = JSON.parse(raw);
    cachedStoredRaw = raw;
    cachedStoredLocations = Array.isArray(parsed)
      ? parsed.map(normalizeStoredSegmentedLocation)
      : [];
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

export function upsertStoredMapLocation(location, options = {}) {
  const stored = readStoredMapLocations();
  const now = new Date().toISOString();
  const actorRole = options.actorRole || 'therapist';
  const actorLabel = options.actorLabel || 'acupunturista';
  const nextLocation = {
    ...location,
    ...buildLocalMapApproval(actorRole, actorLabel),
    approvedByRole: actorRole,
    approvedByLabel: actorLabel,
    approvedAt: now,
    calibratedAt: now,
    updatedAt: now,
  };
  const identity = locationIdentity(nextLocation);
  const pointCode = locationPointCode(nextLocation);
  const shouldReplaceByCode = commonlyUsedMapLocationCodes.has(pointCode);
  const nextCommonBucket = nextLocation.mapId === 'body_full' ? 'body_full' : 'segmented';
  const next = [
    nextLocation,
    ...stored.filter(item => {
      if (shouldReplaceByCode) {
        if (locationPointCode(item) !== pointCode) return true;
        const itemCommonBucket = item.mapId === 'body_full' ? 'body_full' : 'segmented';
        return itemCommonBucket !== nextCommonBucket;
      }
      return locationIdentity(item) !== identity;
    }),
  ];
  writeStoredMapLocations(next);
  return nextLocation;
}

function dedupeStoredCommonMapLocations(locations) {
  const seenCommonCodes = new Set();
  return locations.filter(location => {
    const pointCode = locationPointCode(location);
    if (!commonlyUsedMapLocationCodes.has(pointCode)) return true;
    const commonBucket = location.mapId === 'body_full' ? 'body_full' : 'segmented';
    const identity = `${pointCode}::${commonBucket}`;
    if (seenCommonCodes.has(identity)) return false;
    seenCommonCodes.add(identity);
    return true;
  });
}

export function getAllMapLocations() {
  const storageSignature = currentStorageSignature();
  if (cachedAllLocations && cachedStorageSignature === storageSignature) return cachedAllLocations;

  const stored = dedupeStoredCommonMapLocations(readStoredMapLocations());
  const storedIds = new Set(stored.map(locationIdentity));
  const storedCommonPointCodes = new Set(
    stored
      .filter(location => location.mapId !== 'body_full')
      .map(locationPointCode)
      .filter(code => commonlyUsedMapLocationCodes.has(code)),
  );
  const storedCommonBodyFullPointCodes = new Set(
    stored
      .filter(location => location.mapId === 'body_full')
      .map(locationPointCode)
      .filter(code => commonlyUsedMapLocationCodes.has(code)),
  );
  // Camada autoritativa dos 150 "Pontos comumente usados" nos mapas unilaterais:
  // um marcador único por ponto, calibrado às novas imagens. Suprime os
  // marcadores bilaterais/legados (base, rascunhos e locais antigos) dos
  // mesmos códigos.
  const commonlyUsed = commonlyUsedMapLocations.filter(location => {
    return !storedIds.has(locationIdentity(location))
      && !storedCommonPointCodes.has(locationPointCode(location));
  });
  const commonlyUsedBodyFull = commonlyUsedBodyFullMapLocations.filter(location => {
    return !storedIds.has(locationIdentity(location))
      && !storedCommonBodyFullPointCodes.has(locationPointCode(location));
  });
  const baseMappedPointCodes = new Set([
    ...stored,
    ...commonlyUsedMapLocations,
    ...pointLocations,
  ].map(locationPointCode));
  const highConfidenceDrafts = segmentedHighConfidenceMapLocations.filter(location => {
    return !storedIds.has(locationIdentity(location)) && !baseMappedPointCodes.has(locationPointCode(location));
  });
  const mappedPointCodes = new Set([
    ...baseMappedPointCodes,
    ...highConfidenceDrafts.map(locationPointCode),
  ]);
  const mediumConfidenceDrafts = segmentedMediumConfidenceMapLocations.filter(location => {
    return !storedIds.has(locationIdentity(location)) && !mappedPointCodes.has(locationPointCode(location));
  });
  const mappedWithMediumPointCodes = new Set([
    ...mappedPointCodes,
    ...mediumConfidenceDrafts.map(locationPointCode),
  ]);
  const auricularPdfDrafts = auricularPdfMapLocations.filter(location => {
    return !storedIds.has(locationIdentity(location)) && !mappedWithMediumPointCodes.has(locationPointCode(location));
  });
  cachedAllLocations = [
    ...stored,
    ...commonlyUsed,
    ...commonlyUsedBodyFull,
    ...pointLocations.filter(location => {
      return !storedIds.has(locationIdentity(location))
        && !commonlyUsedMapLocationCodes.has(locationPointCode(location));
    }),
    ...highConfidenceDrafts,
    ...mediumConfidenceDrafts,
    ...auricularPdfDrafts,
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

// Valida o conjunto completo de localizações contra a tabela canônica de
// regiões. Erros (severity 'error') indicam dado inconsistente; localizações
// sinalizadas com review_map_mismatch são aceitas como pendência de revisão.
export function validateMapLocations(locations = getAllMapLocations()) {
  const issues = [];
  const seenIdentities = new Set();
  const stats = { total: locations.length, approved: 0, flagged: 0 };

  for (const location of locations) {
    const code = locationPointCode(location);
    const asset = mapAssets[location.mapId];

    if (location.approved) stats.approved += 1;
    if (location.reviewStatus === 'review_map_mismatch') stats.flagged += 1;

    if (!asset) {
      issues.push({ severity: 'error', type: 'unknown_map', code, mapId: location.mapId });
      continue;
    }

    const x = Number(location.xPct);
    const y = Number(location.yPct);
    if (!(x >= 0 && x <= 100 && y >= 0 && y <= 100)) {
      issues.push({ severity: 'error', type: 'coordinate_out_of_range', code, mapId: location.mapId, xPct: location.xPct, yPct: location.yPct });
    }

    if (location.view && asset.view && location.view !== asset.view) {
      issues.push({ severity: 'error', type: 'view_mismatch', code, mapId: location.mapId, view: location.view, expected: asset.view });
    }

    const isAuricular = code.startsWith('auricular:');
    if (isAuricular !== (asset.type === 'ear')) {
      issues.push({ severity: 'error', type: 'ear_map_mismatch', code, mapId: location.mapId });
    }

    const region = getCanonicalRegion(code);
    const isOverviewProjection = location.mapId === 'body_full' && !isAuricular;
    if (region) {
      const allowed = getAllowedMapIds(region);
      if (allowed.length && !allowed.includes(location.mapId) && !isOverviewProjection && location.reviewStatus !== 'review_map_mismatch') {
        issues.push({ severity: 'error', type: 'region_map_mismatch', code, mapId: location.mapId, region, expected: allowed });
      }
    }

    const identity = locationIdentity(location);
    if (seenIdentities.has(identity)) {
      issues.push({ severity: 'warning', type: 'duplicate_identity', code, mapId: location.mapId, identity });
    }
    seenIdentities.add(identity);
  }

  return {
    issues,
    errors: issues.filter(issue => issue.severity === 'error'),
    stats,
  };
}
