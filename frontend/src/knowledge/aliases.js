const explicitAliases = {
  E36: 'ST36',
  ST36: 'ST36',
  BP6: 'SP6',
  SP6: 'SP6',
  BP9: 'SP9',
  SP9: 'SP9',
  BP3: 'SP3',
  SP3: 'SP3',
  VC12: 'CV12',
  CV12: 'CV12',
  VC6: 'CV6',
  CV6: 'CV6',
  VG20: 'GV20',
  GV20: 'GV20',
  C7: 'HT7',
  HT7: 'HT7',
  CS6: 'PC6',
  PC6: 'PC6',
  F3: 'LR3',
  LR3: 'LR3',
  VB20: 'GB20',
  GB20: 'GB20',
  VB34: 'GB34',
  GB34: 'GB34',
  R3: 'KI3',
  KI3: 'KI3',
  IG4: 'LI4',
  LI4: 'LI4',
  IG11: 'LI11',
  LI11: 'LI11',
  TA5: 'TE5',
  TE5: 'TE5',
  YINTANG: 'EX-HN3',
  'EX-HN3': 'EX-HN3',
  TAIYANG: 'EX-HN5',
  'EX-HN5': 'EX-HN5',
};

export const canonicalToDisplay = {
  ST36: 'E36',
  SP6: 'BP6',
  SP9: 'BP9',
  SP3: 'BP3',
  CV12: 'VC12',
  CV6: 'VC6',
  GV20: 'VG20',
  HT7: 'C7',
  PC6: 'PC6',
  LR3: 'F3',
  GB20: 'VB20',
  GB34: 'VB34',
  KI3: 'R3',
  LI4: 'IG4',
  LI11: 'IG11',
  TE5: 'TA5',
  'EX-HN3': 'Yintang',
};

export function normalizePointCode(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const upper = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, '');

  if (explicitAliases[upper]) return explicitAliases[upper];

  const match = upper.match(/^([A-Z]+)(\d+)$/);
  if (!match) return raw;

  const [, prefix, number] = match;
  const prefixMap = {
    E: 'ST',
    BP: 'SP',
    VC: 'CV',
    VG: 'GV',
    C: 'HT',
    CS: 'PC',
    F: 'LR',
    VB: 'GB',
    R: 'KI',
    IG: 'LI',
    TA: 'TE',
  };

  return `${prefixMap[prefix] || prefix}${number}`;
}

export function displayPointCode(value) {
  const canonical = normalizePointCode(value);
  return canonicalToDisplay[canonical] || canonical || value;
}

export function pointCodeMatches(value, candidate) {
  return normalizePointCode(value) === normalizePointCode(candidate);
}
