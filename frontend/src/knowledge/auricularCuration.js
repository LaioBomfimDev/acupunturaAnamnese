import { normalizePointCode } from './aliases';
import { commonlyUsedAuricularPoints, commonlyUsedMapFilterCodes } from './commonlyUsedPoints';
import { auricularPdfPoints, auricularPdfSource } from './generated/auricular-pdf-points';
import { APPROVAL_STATUS } from './schema';

export const AURICULAR_CURATION_STATUS = {
  LOCAL_ANCHOR_REVIEW: 'review_local_anchor',
  SOURCE_COORDINATE_REVIEW: 'review_source_coordinate',
  SOURCE_REVIEW: 'review_source_linked',
  COMPLEMENTARY_SOURCE_REVIEW: 'review_complementary_source',
  MISSING_COORDINATE_REVIEW: 'review_missing_coordinate',
};

const commonBySlug = new Map(
  commonlyUsedAuricularPoints.map(point => [point.auricularSlug, point]),
);

const localVisualAnchorSlugs = new Set([
  'shen-men',
  'subcortex',
  'figado',
  'baco',
  'estomago',
  'rim',
  'endocrino',
  'ansiedade',
  'coracao',
  'sono',
  'fome',
]);

// Pontos prioritários presentes na base clínica, mas sem coordenada que possa
// ser vinculada com segurança à fonte auricular atual.
const unlocatedCommonPoints = [
  {
    slug: 'utero',
    name: 'Útero',
    note: 'A fonte registra "Genitais internos / Útero"; a equivalência com o slug clínico Útero ainda precisa de revisão profissional.',
  },
  {
    slug: 'ovario',
    name: 'Ovário',
    note: 'A fonte atual não fornece equivalência unívoca para o slug clínico Ovário.',
  },
  {
    slug: 'depressao',
    name: 'Depressão',
    note: 'Ponto funcional de escola; sem coordenada vinculada de forma rastreável na fonte atual.',
  },
  {
    slug: 'insonia',
    name: 'Insônia',
    note: 'Não deve ser confundido com o ponto local Sono sem revisão profissional da equivalência.',
  },
  {
    slug: 'occipital',
    name: 'Occipital',
    note: 'A fonte cita Occipital menor, que não é equivalente automaticamente ao slug clínico Occipital.',
  },
  {
    slug: 'fronte',
    name: 'Fronte',
    note: 'A prancha contém regiões anatômicas frontais, sem equivalência pontual confirmada para este slug.',
  },
  {
    slug: 'talamo',
    name: 'Tálamo',
    note: 'Sem ponto correspondente confirmado na fonte auricular atual.',
  },
];

function buildPdfCuration(point) {
  const common = commonBySlug.get(point.slug);
  const localAnchor = localVisualAnchorSlugs.has(point.slug);
  const hasCoordinate = Number.isFinite(point.map?.xPct) && Number.isFinite(point.map?.yPct);

  return {
    code: `auricular:${point.slug}`,
    slug: point.slug,
    name: point.name,
    commonPriority: Boolean(common),
    officialChinese: point.officialChinese === true,
    approvalStatus: APPROVAL_STATUS.REVIEW,
    requiresProfessionalAudit: true,
    source: auricularPdfSource,
    sourcePage: point.sourcePage || null,
    coordinateConfidence: point.map?.confidence || 'low',
    mapVisibility: common && hasCoordinate ? 'default_common' : 'all_only',
    curationStatus: common
      ? (localAnchor
        ? AURICULAR_CURATION_STATUS.LOCAL_ANCHOR_REVIEW
        : AURICULAR_CURATION_STATUS.SOURCE_COORDINATE_REVIEW)
      : (point.officialChinese
        ? AURICULAR_CURATION_STATUS.SOURCE_REVIEW
        : AURICULAR_CURATION_STATUS.COMPLEMENTARY_SOURCE_REVIEW),
  };
}

function buildUnlocatedCommonCuration(point) {
  return {
    code: `auricular:${point.slug}`,
    slug: point.slug,
    name: point.name,
    commonPriority: true,
    officialChinese: false,
    approvalStatus: APPROVAL_STATUS.REVIEW,
    requiresProfessionalAudit: true,
    source: {
      id: 'base-clinica-mtc',
      label: 'Base clínica MTC local',
      status: 'curated',
    },
    sourcePage: null,
    coordinateConfidence: 'blocked',
    mapVisibility: 'hidden_until_coordinate_review',
    curationStatus: AURICULAR_CURATION_STATUS.MISSING_COORDINATE_REVIEW,
    curationNote: point.note,
  };
}

export const auricularCurationRecords = [
  ...auricularPdfPoints.map(buildPdfCuration),
  ...unlocatedCommonPoints.map(buildUnlocatedCommonCuration),
];

const curationByCode = new Map(
  auricularCurationRecords.map(record => [record.code, record]),
);

export const auricularCurationSummary = {
  total: auricularCurationRecords.length,
  sourceRecords: auricularPdfPoints.length,
  commonPriority: commonlyUsedAuricularPoints.length,
  commonMapReady: auricularCurationRecords.filter(record => record.mapVisibility === 'default_common').length,
  commonAwaitingCoordinates: auricularCurationRecords.filter(
    record => record.mapVisibility === 'hidden_until_coordinate_review',
  ).length,
};

export function getAuricularCuration(codeOrSlug) {
  const raw = String(codeOrSlug || '').trim().toLowerCase();
  if (!raw) return null;
  const code = raw.startsWith('auricular:') ? raw : `auricular:${raw}`;
  return curationByCode.get(code) || null;
}

// O modo padrão do mapa privilegia pontos comuns que também tenham uma
// localização vinculada à fonte. O restante permanece acessível em "Todos".
export function isDefaultCommonMapLocationCode(code) {
  const raw = String(code || '').trim();
  if (!raw) return false;
  if (raw.toLowerCase().startsWith('auricular:')) {
    return getAuricularCuration(raw)?.mapVisibility === 'default_common';
  }
  return commonlyUsedMapFilterCodes.has(normalizePointCode(raw));
}
