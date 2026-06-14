import { displayPointCode, normalizePointCode } from './aliases';
import {
  getMtcDraftTranslationMeta,
  translateMtcDraftTextValue,
} from './mtcTranslation';

export const KM_AGENT_DRAFT_INDEX_URL = '/knowledge/km-agent/acupoints.index.json';
export const KM_AGENT_ENRICHED_INDEX_URL = '/knowledge/km-agent/acupoints.enriched.json';

const PROTOCOL_POINT_NAMES_PT_BR = {
  ST36: 'Zusanli',
  SP6: 'Sanyinjiao',
  LR3: 'Taichong',
  LI4: 'Hegu',
  PC6: 'Neiguan',
  HT7: 'Shenmen',
  CV12: 'Zhongwan',
  GV20: 'Baihui',
  GB20: 'Fengchi',
  GB34: 'Yanglingquan',
  TE5: 'Waiguan',
  KI3: 'Taixi',
  SP9: 'Yinlingquan',
  ST40: 'Fenglong',
  LI11: 'Quchi',
  CV6: 'Qihai',
  SP3: 'Taibai',
  'EX-HN3': 'Yintang',
};

const MERIDIANS_PT_BR = {
  AA: 'Auriculoterapia',
  BL: 'Bexiga',
  CV: 'Vaso Concepção',
  'EX-B': 'Pontos extras das costas',
  'EX-CA': 'Pontos extras de tórax e abdome',
  'EX-HN': 'Pontos extras de cabeça e pescoço',
  'EX-LE': 'Pontos extras de membros inferiores',
  'EX-UE': 'Pontos extras de membros superiores',
  GB: 'Vesícula Biliar',
  GV: 'Vaso Governador',
  HT: 'Coração',
  KI: 'Rim',
  LI: 'Intestino Grosso',
  LR: 'Fígado',
  LU: 'Pulmão',
  PC: 'Pericárdio',
  SA: 'Anatomia de superfície',
  SI: 'Intestino Delgado',
  SP: 'Baço',
  ST: 'Estômago',
  TE: 'Triplo Aquecedor',
};

const NON_LATIN_SCRIPT_PATTERN = /[\u1100-\u11ff\u3130-\u318f\u3400-\u9fff]/;

export function getKmAgentDraftMeridianPtBr(item = {}) {
  if (item.metadata?.meridianPtBr) return item.metadata.meridianPtBr;
  const code = item.metadata?.meridianCode || item.meridianCode || item.meridian?.code || '';
  return MERIDIANS_PT_BR[code] || item.meridianPtBr || '';
}

export function getKmAgentDraftTitlePtBr(item = {}) {
  if (item.titlePtBr) return item.titlePtBr;
  const normalized = normalizePointCode(item.code || item.displayCode || '');
  const displayCode = item.displayCode || displayPointCode(normalized);
  const pointName = PROTOCOL_POINT_NAMES_PT_BR[normalized];
  const meridianName = getKmAgentDraftMeridianPtBr(item);

  if (pointName) {
    return meridianName
      ? `${displayCode} - ${pointName} (${meridianName})`
      : `${displayCode} - ${pointName}`;
  }

  if (meridianName) {
    return `${displayCode || normalized} - Ponto do meridiano ${meridianName}`;
  }

  return `${displayCode || normalized || 'Ponto'} - Ponto de acupuntura`;
}

export function titleNeedsPtBr(title = '') {
  return !title || NON_LATIN_SCRIPT_PATTERN.test(String(title));
}

export function getKmAgentDraftStats(items = []) {
  const meridians = new Set(items.map(item => item.metadata?.meridianCode).filter(Boolean));
  return {
    total: items.length,
    meridians: meridians.size,
    source: 'km-agent/data/acupoints.csv',
    approvalStatus: 'draft',
  };
}

export function findKmAgentDraftByCode(items, code) {
  const normalized = String(code || '').trim().toUpperCase();
  return (items || []).find(item => item.code === normalized || item.displayCode === normalized) || null;
}

export function getKmAgentLocationPtBr(item = {}) {
  return translateMtcDraftTextValue(item.location?.ptBr || item.locationPtBr || item.locationPreview || '');
}

export function getKmAgentNeedlingPtBr(item = {}) {
  return translateMtcDraftTextValue(item.needling?.ptBr || item.needlingPtBr || item.needlingPreview || '');
}

export function getKmAgentAutomaticTranslationMeta(item = {}) {
  return getMtcDraftTranslationMeta([
    item.location?.ptBr || item.locationPtBr || item.locationPreview || '',
    item.needling?.ptBr || item.needlingPtBr || item.needlingPreview || '',
  ]);
}

export function getKmAgentTranslationBadges(item = {}) {
  const badges = [];
  if (item.location?.translationStatus) {
    badges.push({
      label: item.location.translationStatus === 'draft_controlled_translation' ? 'Localização traduzida' : 'Localização parcial',
      tone: item.location.confidence === 'low' ? 'pending' : 'active',
    });
  }
  if (item.needling?.translationStatus) {
    badges.push({
      label: item.needling.translationStatus === 'partial_controlled_translation' ? 'Técnica parcial' : 'Técnica traduzida',
      tone: item.needling.confidence === 'low' ? 'pending' : 'active',
    });
  }
  if (item.acukgSummary?.hasMatch) {
    badges.push({
      label: `AcuKG ${item.acukgSummary.indicationCount || 0} indicações`,
      tone: 'pending',
    });
  }
  return badges;
}
