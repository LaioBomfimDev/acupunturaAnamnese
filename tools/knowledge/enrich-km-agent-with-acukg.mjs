#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

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

const DISPLAY_ALIASES = {
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

const CLINICAL_TERM_PT_BR = new Map([
  ['Abdominal Pain', 'dor abdominal'],
  ['Anxiety', 'ansiedade'],
  ['Asthma', 'asma'],
  ['Back Pain', 'dor nas costas'],
  ['Borborygmus', 'borborigmo'],
  ['Chest Pain', 'dor toracica'],
  ['Chest Fullness', 'plenitude torácica'],
  ['Constipation', 'constipacao'],
  ['Cough', 'tosse'],
  ['Diarrhea', 'diarreia'],
  ['Dizziness', 'tontura'],
  ['Dysmenorrhea', 'dismenorreia'],
  ['Eye Pain', 'dor ocular'],
  ['Eye Redness', 'vermelhidão ocular'],
  ['Excess Type Cough', 'tosse por padrão de excesso'],
  ['Gastric Pain', 'dor gástrica'],
  ['Headache', 'cefaleia'],
  ['Hiccup', 'soluço'],
  ['Hypertension', 'hipertensao'],
  ['Hypochondrium Pain', 'dor no hipocôndrio'],
  ['Insomnia', 'insonia'],
  ['Knee Pain', 'dor no joelho'],
  ['Low Back Pain', 'dor lombar'],
  ['Migraine', 'enxaqueca'],
  ['Nausea', 'nausea'],
  ['Nasal Obstruction', 'obstrução nasal'],
  ['Neck Pain', 'dor cervical'],
  ['Pain', 'dor'],
  ['Palpitation', 'palpitação'],
  ['Shoulder Pain', 'dor no ombro'],
  ['Stomach Pain', 'dor de estômago'],
  ['Stuffy Chest', 'opressão torácica'],
  ['Stroke', 'AVC'],
  ['Tinnitus', 'zumbido'],
  ['Vertigo', 'vertigem'],
  ['Vomiting', 'vomito'],
  ['Wheezing', 'sibilância'],
]);

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (!current.startsWith('--')) continue;
    const key = current.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    if (row.length > 1 || row[0] !== '') rows.push(row);
    row = [];
  };

  const source = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      pushField();
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i += 1;
      pushField();
      pushRow();
      continue;
    }

    field += char;
  }

  pushField();
  pushRow();

  const header = (rows.shift() || []).map((name, index) => (name || `extra_${index}`).trim());
  return rows.map(values => Object.fromEntries(header.map((name, index) => [name, clean(values[index])])));
}

function readCsv(filePath) {
  return parseCsv(fs.readFileSync(filePath, 'utf8'));
}

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function uniq(values) {
  return [...new Set(values.map(value => clean(value)).filter(Boolean))];
}

function normalizeCode(value) {
  let code = clean(value).toUpperCase().replace(/[\s_-]+/g, '');
  code = code.replace(/^EXHN(?=\d)/, 'EX-HN');
  code = code.replace(/^EXB(?=\d)/, 'EX-B');
  code = code.replace(/^EXCA(?=\d)/, 'EX-CA');
  code = code.replace(/^EXLE(?=\d)/, 'EX-LE');
  code = code.replace(/^EXUE(?=\d)/, 'EX-UE');
  code = code.replace(/^LIV(?=\d)/, 'LR');
  code = code.replace(/^LV(?=\d)/, 'LR');
  code = code.replace(/^UB(?=\d)/, 'BL');
  code = code.replace(/^P(?=\d)/, 'PC');
  code = code.replace(/^(TW|TH|SJ)(?=\d)/, 'TE');
  return code;
}

function displayCode(code) {
  return DISPLAY_ALIASES[code] || code;
}

function addToMap(map, code, key, value) {
  const normalized = normalizeCode(code);
  if (!normalized) return;
  if (!map.has(normalized)) map.set(normalized, {});
  const bucket = map.get(normalized);
  if (!bucket[key]) bucket[key] = [];
  if (Array.isArray(value)) bucket[key].push(...value);
  else bucket[key].push(value);
}

function addRelation(map, code, key, row, fields) {
  const normalized = normalizeCode(code);
  if (!normalized) return;
  if (!map.has(normalized)) map.set(normalized, {});
  const bucket = map.get(normalized);
  if (!bucket[key]) bucket[key] = [];
  const item = {};
  for (const field of fields) item[field] = clean(row[field]);
  bucket[key].push(item);
}

function translateClinicalTerm(value) {
  const original = clean(value);
  if (!original) return null;
  const direct = CLINICAL_TERM_PT_BR.get(original);
  return {
    original,
    ptBrDraft: direct || original,
    translationStatus: direct ? 'controlled_dictionary' : 'not_translated',
  };
}

function replaceOrdered(text, replacements) {
  return replacements.reduce((next, [pattern, replacement]) => next.replace(pattern, replacement), text);
}

function translateLocation(text) {
  const original = clean(text);
  if (!original) {
    return {
      ptBr: '',
      source: 'km-agent',
      translationStatus: 'missing_source',
      confidence: 'none',
      reviewRequired: true,
    };
  }

  let ptBr = original;
  ptBr = replaceOrdered(ptBr, [
    [/\bbetween the tendons of the Palmaris longus and the flexor carpi radialis\b/gi, 'entre os tendões do palmar longo e do flexor radial do carpo'],
    [/\bradial to the midpoint of the 2nd metacarpal bone\b/gi, 'radial ao ponto médio do 2º osso metacarpal'],
    [/\bon the line connecting ([A-Z]+\d+) with ([A-Z]+\d+)/gi, 'na linha que conecta $1 a $2'],
    [/\bbetween the 1st and 2nd metatarsal bones\b/gi, 'entre o 1º e o 2º ossos metatarsais'],
    [/\bbetween the 1st and 2nd toes\b/gi, 'entre o 1º e o 2º dedos do pé'],
    [/\bjunction of the bases of the 2 bones\b/gi, 'junção das bases dos dois ossos'],
    [/\bover the dorsalis pedis artery\b/gi, 'sobre a artéria dorsal do pé'],
    [/\banterior hairline\b/gi, 'linha anterior do cabelo'],
    [/\bposterior hairline\b/gi, 'linha posterior do cabelo'],
    [/\bauricular apices\b/gi, 'ápices auriculares'],
    [/\bGV20 is located\b/g, 'GV20 localiza-se'],
    [/\bWhen the ears are folded\b/gi, 'quando as orelhas são dobradas'],
    [/^On the anterior thoracic region/i, 'Na regiao anterior do torax'],
    [/^On the anterior aspect of the leg/i, 'Na face anterior da perna'],
    [/^On the anteromedial aspect of the leg/i, 'Na face anteromedial da perna'],
    [/^On the anteromedial aspect of the ankle/i, 'Na face anteromedial do tornozelo'],
    [/^On the anterior aspect of the forearm/i, 'Na face anterior do antebraco'],
    [/^On the posterior aspect of the forearm/i, 'Na face posterior do antebraco'],
    [/^On the dorsum of the hand/i, 'No dorso da mao'],
    [/^On the dorsum of the foot/i, 'No dorso do pe'],
    [/^On the great toe/i, 'No halux'],
    [/^On the head/i, 'Na cabeca'],
    [/^On the face/i, 'Na face'],
    [/^On the neck/i, 'No pescoco'],
    [/^On the abdomen/i, 'No abdomen'],
    [/^On the chest/i, 'No torax'],
    [/^On the back/i, 'No dorso'],
    [/^On the lower back/i, 'Na regiao lombar'],
    [/^On the shoulder/i, 'No ombro'],
    [/^On the knee/i, 'No joelho'],
    [/^On the lateral aspect/i, 'Na face lateral'],
    [/^On the medial aspect/i, 'Na face medial'],
    [/^On the posterior aspect/i, 'Na face posterior'],
    [/^On the anterior aspect/i, 'Na face anterior'],
    [/^At the/i, 'No'],
    [/\bat the same level as\b/gi, 'no mesmo nivel de'],
    [/\blateral to\b/gi, 'lateral a'],
    [/\bmedial to\b/gi, 'medial a'],
    [/\bsuperior to\b/gi, 'superior a'],
    [/\binferior to\b/gi, 'inferior a'],
    [/\banterior to\b/gi, 'anterior a'],
    [/\bposterior to\b/gi, 'posterior a'],
    [/\bproximal to\b/gi, 'proximal a'],
    [/\bdistal to\b/gi, 'distal a'],
    [/\bbetween\b/gi, 'entre'],
    [/\bin the depression\b/gi, 'na depressao'],
    [/\bin the centre\b/gi, 'no centro'],
    [/\bin the center\b/gi, 'no centro'],
    [/\bat the midpoint\b/gi, 'no ponto medio'],
    [/\bat the border between\b/gi, 'na transicao entre'],
    [/\bthe anterior median line\b/gi, 'a linha mediana anterior'],
    [/\banterior median line\b/gi, 'linha mediana anterior'],
    [/\bposterior median line\b/gi, 'linha mediana posterior'],
    [/\bfirst intercostal space\b/gi, '1o espaco intercostal'],
    [/\b1st intercostal space\b/gi, '1o espaco intercostal'],
    [/\binfraclavicular fossa\b/gi, 'fossa infraclavicular'],
    [/\bpalmar wrist crease\b/gi, 'prega palmar do punho'],
    [/\bdorsal wrist crease\b/gi, 'prega dorsal do punho'],
    [/\bmetatarsal bones\b/gi, 'ossos metatarsais'],
    [/\bmetacarpal bone\b/gi, 'osso metacarpal'],
    [/\bmetacarpal bones\b/gi, 'ossos metacarpais'],
    [/\btoes\b/gi, 'dedos do pe'],
    [/\bfingers\b/gi, 'dedos da mao'],
    [/\bthumb\b/gi, 'polegar'],
    [/\bgreat toe\b/gi, 'halux'],
    [/\bweb margin\b/gi, 'margem interdigital'],
    [/\bred and white flesh\b/gi, 'pele vermelha e branca'],
    [/\bdistal phalanx\b/gi, 'falange distal'],
    [/\blateral corner of the toenail\b/gi, 'canto lateral da unha do halux'],
    [/\bbase of the toenail\b/gi, 'base da unha do halux'],
    [/\bdorsalis pedis artery\b/gi, 'arteria dorsal do pe'],
    [/\btibialis anterior tendon\b/gi, 'tendao do tibial anterior'],
    [/\bmedial malleolus\b/gi, 'maleolo medial'],
    [/\blateral malleolus\b/gi, 'maleolo lateral'],
    [/\bpalmaris longus tendon\b/gi, 'tendao do palmar longo'],
    [/\bflexor carpi radialis tendon\b/gi, 'tendao do flexor radial do carpo'],
    [/\bline connecting\b/gi, 'linha que conecta'],
    [/\bconnecting line\b/gi, 'linha que conecta'],
    [/\binferior\b/gi, 'inferior'],
    [/\bsuperior\b/gi, 'superior'],
    [/\blateral\b/gi, 'lateral'],
    [/\bmedial\b/gi, 'medial'],
    [/\banterior\b/gi, 'anterior'],
    [/\bposterior\b/gi, 'posterior'],
    [/\bproximal\b/gi, 'proximal'],
    [/\bdistal\b/gi, 'distal'],
    [/\bregion\b/gi, 'regiao'],
    [/\baspect\b/gi, 'face'],
    [/\bline\b/gi, 'linha'],
    [/\bNote\b/g, 'Nota'],
  ]);

  ptBr = ptBr
    .replace(/\b(\d+(?:\.\d+)?)\s*B-cun\b/g, (_, value) => `${value.replace('.', ',')} B-cun`)
    .replace(/\b(\d+)st\b/g, '$1o')
    .replace(/\b(\d+)nd\b/g, '$1o')
    .replace(/\b(\d+)rd\b/g, '$1o')
    .replace(/\b(\d+)th\b/g, '$1o')
    .replace(/\bthe\s+/gi, '')
    .replace(/\band\b/gi, 'e')
    .replace(/\bwith\b/gi, 'com')
    .replace(/\bfrom\b/gi, 'de')
    .replace(/\bto\b/gi, 'a')
    .replace(/\bover\b/gi, 'sobre')
    .replace(/\bon a linha/gi, 'sobre a linha')
    .replace(/\bon the linha/gi, 'sobre a linha')
    .replace(/\bon the /gi, 'sobre ')
    .replace(/\bof the /gi, 'da ')
    .replace(/\bof /gi, 'de ')
    .replace(/no mesmo nivel de o /gi, 'no mesmo nível do ')
    .replace(/no mesmo nivel de /gi, 'no mesmo nível de ')
    .replace(/lateral a a /gi, 'lateral à ')
    .replace(/lateral a fossa/gi, 'lateral à fossa')
    .replace(/proximal a prega/gi, 'proximal à prega')
    .replace(/distal a junção/gi, 'distal à junção')
    .replace(/proximal a a /gi, 'proximal à ')
    .replace(/distal a a /gi, 'distal à ')
    .replace(/superior a a /gi, 'superior à ')
    .replace(/inferior a a /gi, 'inferior à ')
    .replace(/linha de the/gi, 'linha de')
    .replace(/regiao/gi, 'região')
    .replace(/torax/gi, 'tórax')
    .replace(/antebraco/gi, 'antebraço')
    .replace(/cabeca/gi, 'cabeça')
    .replace(/pescoco/gi, 'pescoço')
    .replace(/pe\b/gi, 'pé')
    .replace(/mao\b/gi, 'mão')
    .replace(/depressao/gi, 'depressão')
    .replace(/transicao/gi, 'transição')
    .replace(/arteria/gi, 'artéria')
    .replace(/tendao/gi, 'tendão')
    .replace(/tendoes/gi, 'tendões')
    .replace(/punho/gi, 'punho')
    .replace(/espaco/gi, 'espaço')
    .replace(/1o/g, '1º')
    .replace(/2o/g, '2º')
    .replace(/3o/g, '3º')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    ptBr,
    source: 'km-agent.location_en',
    translationStatus: 'draft_controlled_translation',
    confidence: 'medium',
    reviewRequired: true,
  };
}

function convertCun(value) {
  return value.replace(/\d+(?:\.\d+)?/g, number => number.replace('.', ','));
}

function translateNeedling(text) {
  const original = String(text || '').replace(/\\n/g, '\n').replace(/\r\n/g, '\n').trim();
  if (!original) {
    return {
      ptBr: '',
      lines: [],
      source: 'km-agent',
      translationStatus: 'missing_source',
      unresolvedTerms: [],
      confidence: 'none',
      reviewRequired: true,
    };
  }

  const rawLines = original
    .split(/\r?\n+/)
    .map(line => line.replace(/^\s*[-•]\s*/, '').trim())
    .filter(Boolean);

  const lines = rawLines.map(line => {
    let next = line;
    next = next
      .replace(/直刺/g, 'Insercao perpendicular')
      .replace(/[斜斜]刺/g, 'Insercao obliqua')
      .replace(/[橫横]刺/g, 'Insercao horizontal')
      .replace(/平刺/g, 'Insercao horizontal')
      .replace(/透刺/g, 'Insercao transfixante')
      .replace(/點刺出血|点刺出血/g, 'puntura para sangria')
      .replace(/三稜鍼|三棱针/g, 'agulha triangular')
      .replace(/禁鍼/g, 'contraindicacao de agulhamento')
      .replace(/上方/g, 'superiormente')
      .replace(/下方/g, 'inferiormente')
      .replace(/前後/g, 'anteroposterior')
      .replace(/左右/g, 'laterolateral')
      .replace(/皮下/g, 'subcutaneo')
      .replace(/沿/g, 'ao longo de')
      .replace(/向/g, 'em direcao a')
      .replace(/또는/g, 'ou')
      .replace(/혹은/g, 'ou')
      .replace(/으로/g, ' em direcao a ')
      .replace(/향해/g, 'em direcao a')
      .replace(/하기도 함/g, ' também pode ser considerada')
      .replace(/임신부는 신중히 사용/g, 'usar com cautela em gestantes')
      .replace(/습관성유산 경험이 있는 임신부는/g, 'em gestantes com historico de abortamento recorrente:');

    next = next
      .replace(/(\d+(?:\.\d+)?)\s*～\s*(\d+(?:\.\d+)?)\s*寸/g, (_, from, to) => `${convertCun(from)} a ${convertCun(to)} cun`)
      .replace(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*寸/g, (_, from, to) => `${convertCun(from)} a ${convertCun(to)} cun`)
      .replace(/(\d+(?:\.\d+)?)\s*寸/g, (_, amount) => `${convertCun(amount)} cun`)
      .replace(/(\d+(?:\.\d+)?)\s*～\s*(\d+(?:\.\d+)?)\s*分/g, (_, from, to) => `${convertCun(from)} a ${convertCun(to)} fen`)
      .replace(/(\d+(?:\.\d+)?)\s*分/g, (_, amount) => `${convertCun(amount)} fen`);

    next = next.replace(/^(Insercao [^:]+?)\s+(\d)/, '$1: $2');
    next = next
      .replace(/Insercao/g, 'Inserção')
      .replace(/obliqua/g, 'oblíqua')
      .replace(/direcao/g, 'direção')
      .replace(/tambem/g, 'também')
      .replace(/contraindicacao/g, 'contraindicação')
      .replace(/\s+/g, ' ');
    return next.trim();
  });

  const unresolvedTerms = uniq(lines.flatMap(line => line.match(/[\u1100-\u11ff\u3130-\u318f\u3400-\u9fff\uac00-\ud7af]+/g) || []));

  return {
    ptBr: lines.map(line => `- ${line}`).join('\n'),
    lines,
    source: 'km-agent.needling',
    translationStatus: unresolvedTerms.length ? 'partial_controlled_translation' : 'draft_controlled_translation',
    unresolvedTerms,
    confidence: unresolvedTerms.length ? 'low' : 'medium',
    reviewRequired: true,
  };
}

function buildAcukgIndex(acukgDir) {
  const map = new Map();
  const csv = name => path.join(acukgDir, name);

  for (const row of readCsv(csv('Action_target.csv'))) {
    addRelation(map, row.Acupoint_Code, 'actionTargets', row, ['Relation', 'Action_Target']);
  }
  for (const row of readCsv(csv('Indication.csv'))) {
    addToMap(map, row.Acupoint_Code, 'indications', translateClinicalTerm(row.Indication));
  }
  for (const row of readCsv(csv('located_near.csv'))) {
    addRelation(map, row.Acupoint_Code, 'locatedNear', row, ['Relation', 'Anatomy', 'UBERON_code', 'SNOMED_CT_code']);
  }
  for (const row of readCsv(csv('part_of.csv'))) {
    addRelation(map, row.Acupoint_Code, 'partOf', row, ['Relation', 'Anatomy', 'UBERON_code', 'SNOMED_CT_code']);
  }
  for (const row of readCsv(csv('direction_of.csv'))) {
    addRelation(map, row.Acupoint_Code, 'directionOf', row, ['Relation', 'Anatomy', 'UBERON_code', 'SNOMED_CT_code']);
  }
  for (const row of readCsv(csv('distance_of.csv'))) {
    addRelation(map, row.Acupoint_Code, 'distanceOf', row, ['Relation', 'Anatomy', 'UBERON_code', 'SNOMED_CT_code']);
  }
  for (const row of readCsv(csv('near_acupoint.csv'))) {
    addToMap(map, row.Acupoint_Code, 'nearAcupoints', normalizeCode(row.Acupoint));
  }
  for (const row of readCsv(csv('PubMed.csv'))) {
    addRelation(map, row.Acupoint_Code, 'pubMed', row, ['Mesh_Term', 'Mesh_Id', 'PMID_freq', 'PMIDs']);
  }
  for (const row of readCsv(csv('clinicaltrial.csv'))) {
    addRelation(map, row.Acupoint_Code, 'clinicalTrials', row, ['Mesh_Term', 'Mesh_Id', 'NCT_freq', 'NCT_Ids']);
  }
  for (const row of readCsv(csv('Chinesename.csv'))) {
    addToMap(map, row.Acupoint_Code, 'chineseNames', row.Chinese_Name);
  }
  for (const row of readCsv(csv('Englishname.csv'))) {
    addToMap(map, row.Acupoint_Code, 'englishNames', row.English_Name);
  }
  for (const row of readCsv(csv('pinyinname.csv'))) {
    addToMap(map, row.Acupoint_Code, 'pinyinNames', row.Pinyin_Name);
  }

  return map;
}

function cleanAcukgBucket(bucket = {}) {
  return {
    names: {
      chinese: uniq(bucket.chineseNames || []),
      english: uniq(bucket.englishNames || []),
      pinyin: uniq(bucket.pinyinNames || []),
    },
    actionTargets: (bucket.actionTargets || []).map(item => ({
      relation: item.Relation,
      target: item.Action_Target,
      source: 'acukg.Action_target.csv',
      status: 'suggestion_unreviewed',
    })),
    indications: (bucket.indications || []).filter(Boolean).map(item => ({
      ...item,
      source: 'acukg.Indication.csv',
      status: 'suggestion_unreviewed',
    })),
    anatomy: {
      locatedNear: (bucket.locatedNear || []).map(item => ({ ...item, source: 'acukg.located_near.csv' })),
      partOf: (bucket.partOf || []).map(item => ({ ...item, source: 'acukg.part_of.csv' })),
      directionOf: (bucket.directionOf || []).map(item => ({ ...item, source: 'acukg.direction_of.csv' })),
      distanceOf: (bucket.distanceOf || []).map(item => ({ ...item, source: 'acukg.distance_of.csv' })),
      nearAcupoints: uniq(bucket.nearAcupoints || []),
    },
    evidence: {
      pubMed: (bucket.pubMed || []).map(item => ({ ...item, source: 'acukg.PubMed.csv' })),
      clinicalTrials: (bucket.clinicalTrials || []).map(item => ({ ...item, source: 'acukg.clinicaltrial.csv' })),
    },
  };
}

function summarizeAcukg(acukg) {
  const anatomyCount = Object.values(acukg.anatomy).reduce((sum, value) => (
    sum + (Array.isArray(value) ? value.length : 0)
  ), 0);
  return {
    hasMatch: true,
    actionTargetCount: acukg.actionTargets.length,
    indicationCount: acukg.indications.length,
    anatomyRelationCount: anatomyCount,
    pubMedCount: acukg.evidence.pubMed.length,
    clinicalTrialCount: acukg.evidence.clinicalTrials.length,
  };
}

function buildItem(row, acukgMap) {
  const code = normalizeCode(row.entity_id || row.code || row.who_code);
  const meridianCode = normalizeCode(row.meridian_code);
  const acukg = cleanAcukgBucket(acukgMap.get(code));
  const hasAcukg = Boolean(acukgMap.get(code));
  const location = translateLocation(row.location_en);
  const needling = translateNeedling(row.needling);
  const meridianPtBr = MERIDIANS_PT_BR[meridianCode] || meridianCode;

  return {
    id: `acupoint:${code}`,
    type: 'acupoint',
    code,
    displayCode: displayCode(code),
    titlePtBr: `${displayCode(code)} - Ponto do meridiano ${meridianPtBr}`,
    approvalStatus: 'draft',
    source: 'km-agent/data/acupoints.csv + AcuKG',
    metadata: {
      category: clean(row.category || 'acupoint'),
      meridianCode,
      meridian: clean(row.meridian),
      meridianPtBr,
    },
    names: {
      ko: clean(row.name_ko),
      zh: clean(row.name_zh),
      en: acukg.names.english[0] || '',
      pinyin: acukg.names.pinyin[0] || '',
      acukgChinese: acukg.names.chinese,
    },
    locationPreview: location.ptBr.slice(0, 280),
    needlingPreview: needling.ptBr.slice(0, 240),
    location: {
      originalEn: clean(row.location_en),
      originalKo: clean(row.location_ko),
      ...location,
    },
    needling: {
      original: clean(row.needling),
      ...needling,
    },
    acukg: hasAcukg ? acukg : null,
    acukgSummary: hasAcukg ? summarizeAcukg(acukg) : { hasMatch: false },
    review: {
      status: 'draft',
      locationText: 'translated_draft_needs_review',
      needling: 'translated_draft_needs_review',
      acukgSuggestions: hasAcukg ? 'available_unreviewed' : 'not_available',
      cautions: 'not_auto_filled',
      patterns: 'not_auto_filled',
    },
    provenance: [
      { field: 'location', source: 'km-agent.location_en', transform: location.translationStatus },
      { field: 'needling', source: 'km-agent.needling', transform: needling.translationStatus },
      ...(hasAcukg ? [{ field: 'relations', source: 'AcuKG CSV', transform: 'linked_by_who_code' }] : []),
    ],
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectRoot = path.resolve(args['project-root'] || process.cwd());
  const acukgDir = path.resolve(args['acukg-dir'] || path.join(projectRoot, 'tools', 'acukg-source', 'AcuKG'));
  const kmRawPath = path.resolve(args['km-raw'] || path.join(projectRoot, 'frontend', 'src', 'knowledge', 'generated', 'km-agent', 'acupoints.raw.json'));
  const outPath = path.resolve(args.out || path.join(projectRoot, 'frontend', 'src', 'knowledge', 'generated', 'km-agent', 'acupoints.enriched.json'));
  const publicOutPath = path.resolve(args['public-out'] || path.join(projectRoot, 'frontend', 'public', 'knowledge', 'km-agent', 'acupoints.enriched.json'));
  const reportPath = path.resolve(args.report || path.join(projectRoot, 'frontend', 'src', 'knowledge', 'generated', 'km-agent', 'acupoints.enrichment-report.json'));

  const kmRows = readJson(kmRawPath);
  const acukgMap = buildAcukgIndex(acukgDir);
  const enriched = kmRows.map(row => buildItem(row, acukgMap));
  const report = {
    generatedAt: new Date().toISOString(),
    kmAgentCount: kmRows.length,
    acukgMatchedCount: enriched.filter(item => item.acukgSummary.hasMatch).length,
    acukgUnmatchedCodes: enriched.filter(item => !item.acukgSummary.hasMatch).map(item => item.code),
    partialNeedlingTranslationCount: enriched.filter(item => item.needling.translationStatus === 'partial_controlled_translation').length,
    missingNeedlingCount: enriched.filter(item => item.needling.translationStatus === 'missing_source').length,
    missingLocationCount: enriched.filter(item => item.location.translationStatus === 'missing_source').length,
    safeguards: [
      'No AcuKG indication, action target, caution, or pattern is marked approved automatically.',
      'Location and needling pt-BR fields are controlled draft translations and require review.',
      'Cautions and related patterns are intentionally not auto-filled.',
    ],
  };

  writeJson(outPath, enriched);
  writeJson(publicOutPath, enriched);
  writeJson(reportPath, report);
  console.log(JSON.stringify(report, null, 2));
}

main();
