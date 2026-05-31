export const KNOWLEDGE_TYPES = {
  ACUPOINT: 'acupoint',
  AURICULAR_POINT: 'auricular_point',
  PATTERN: 'pattern',
  TECHNIQUE: 'technique',
  SAFETY_RULE: 'safety_rule',
  REPORT_TEMPLATE: 'report_template',
  MAP_ASSET: 'map_asset',
};

export const APPROVAL_STATUS = {
  DRAFT: 'draft',
  REVIEW: 'review',
  APPROVED: 'approved',
  RETIRED: 'retired',
};

export const SOURCE_STATUS = {
  IMPORTED: 'imported',
  CURATED: 'curated',
  PROFESSIONAL_REVIEW: 'professional_review',
};

export const TECHNIQUES = {
  NEEDLE: 'agulha',
  LASER: 'laser',
  STIPER: 'stiper',
  MOXA: 'moxa',
  CUPPING: 'ventosa',
  ELECTRO: 'eletro',
  AURICULAR: 'auriculoterapia',
};

export function createApproval(status = APPROVAL_STATUS.DRAFT) {
  return {
    status,
    reviewedBy: null,
    reviewedAt: null,
    clinicalNote: '',
  };
}

export function createSource(id, label, status = SOURCE_STATUS.CURATED) {
  return {
    id,
    label,
    status,
    citation: label,
  };
}
