import { displayPointCode, normalizePointCode } from '../aliases';

export function mapKmAgentAcupoint(row) {
  const code = normalizePointCode(row.entity_id || row.code || row.who_code);
  const displayCode = displayPointCode(code);

  return {
    id: `acupoint:${code}`,
    type: 'acupoint',
    code,
    displayCode,
    category: row.category || 'acupoint',
    names: {
      ko: row.name_ko || '',
      zh: row.name_zh || '',
      en: row.name_en || row.pinyin || '',
    },
    meridian: {
      code: row.meridian_code || '',
      en: row.meridian || row.meridian_en || '',
    },
    locationText: {
      en: row.location_en || row.location || '',
    },
    needling: row.needling || '',
    method: row.method || '',
    source: 'km-agent/data/acupoints.csv',
    approval: { status: 'draft', reviewedBy: null, reviewedAt: null },
    rag: {
      document: [
        code,
        displayCode,
        row.name_ko,
        row.name_zh,
        row.name_en || row.pinyin,
        row.meridian_code ? `meridian: ${row.meridian_code}` : '',
        row.location_en ? `location: ${row.location_en}` : '',
        row.needling ? `needling: ${row.needling}` : '',
      ].filter(Boolean).join(' | '),
    },
  };
}
