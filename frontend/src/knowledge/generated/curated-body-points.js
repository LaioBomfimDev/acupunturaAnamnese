// Generated automatically by scripts/build-curated-body-points.mjs
// Contains the 329 classic Chinese standard body acupoints imported and audited from KM-Agent
//
// Keep this file separate to avoid bloating knowledgeBase.js

import { APPROVAL_STATUS, KNOWLEDGE_TYPES, TECHNIQUES, createApproval, createSource } from '../schema';
import { getLocationsForPoint } from '../mapLocations';

const kmAgentSource = createSource('km-agent-acupoints', 'KM-Agent data/acupoints.csv', 'imported');

function rawAcupoint(data) {
  return {
    id: `acupoint:${data.code}`,
    type: KNOWLEDGE_TYPES.ACUPOINT,
    displayCode: data.code,
    category: 'ponto_sistemico',
    approval: createApproval(APPROVAL_STATUS.APPROVED),
    sources: [kmAgentSource],
    locations: getLocationsForPoint(data.code),
    techniques: [TECHNIQUES.NEEDLE, TECHNIQUES.LASER, TECHNIQUES.STIPER],
    ...data
  };
}

export const curatedAcupoints = [
  rawAcupoint({
      "code": "LU1",
      "names": {
          "pt": "Zhongfu",
          "en": "Zhongfu",
          "zh": "中府"
      },
      "meridian": {
          "code": "LU",
          "pt": "Pulmão",
          "en": "Lung"
      },
      "locationText": "Na região anterior do tórax, no mesmo nível de 1º espaço intercostal, lateral à fossa infraclavicular, 6 B-cun lateral à linha mediana anterior.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,5 a 1 cun",
      "actions": [
          "Regulates lung qi",
          "Stops tosse",
          "Stimulates lung qi descending",
          "Disperses plenitude torácica",
          "Stops dor"
      ],
      "indications": [
          "Tosse por padrão de excesso",
          "Sibilância",
          "Asma",
          "Plenitude torácica",
          "Dor toracica",
          "Dor no ombro",
          "Dor nas costas",
          "fleuma",
          "excesso de calor no aquecedor médio",
          "Vomito",
          "dificuldade de ingestão"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "LU2",
      "names": {
          "pt": "Yunmen",
          "en": "Yunmen",
          "zh": "雲門"
      },
      "meridian": {
          "code": "LU",
          "pt": "Pulmão",
          "en": "Lung"
      },
      "locationText": "Na região anterior do tórax, na depressão de fossa infraclavicular, medial a coracoids process de scapula, 6 B-cun lateral à linha mediana anterior. Nota 1: ST13, KI27, CV21 e LU2 are located on transverse linha along inferior border de clavicle.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun (不宜深刺, 刺太深時 氣逆)\n- Inserção oblíqua: 0,5 a 1 cun",
      "actions": [
          "Disperses plenitude torácica",
          "Stimulates lung qi descending",
          "Stops tosse"
      ],
      "indications": [
          "Tosse",
          "Asma",
          "Dor toracica",
          "Arm dor",
          "Dor no ombro",
          "Plenitude torácica"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "LU3",
      "names": {
          "pt": "Tianfu",
          "en": "Tianfu",
          "zh": "天府"
      },
      "meridian": {
          "code": "LU",
          "pt": "Pulmão",
          "en": "Lung"
      },
      "locationText": "On anterolateral face de arm, just lateral a border de biceps brachii muscle, 3 B-cun inferior a anterior axillary fold.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 1 a 1,5 cun",
      "actions": [
          "Clears lung heat",
          "Regulates lung qi"
      ],
      "indications": [
          "Asma",
          "Epistaxis",
          "Medial aspect of upper arm dor"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "LU4",
      "names": {
          "pt": "Xiabai",
          "en": "Xiabai",
          "zh": "俠白"
      },
      "meridian": {
          "code": "LU",
          "pt": "Pulmão",
          "en": "Lung"
      },
      "locationText": "On anterolateral face de arm, just lateral a border de biceps brachii muscle, 4 B-cun inferior a anterior axillary fold.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 1 a 1,5 cun",
      "actions": [
          "Regulates qi",
          "Regulates blood",
          "Relieves dor"
      ],
      "indications": [
          "Tosse",
          "Plenitude torácica",
          "Medial aspect of upper arm dor"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "LU5",
      "names": {
          "pt": "Chize",
          "en": "Chize",
          "zh": "尺澤"
      },
      "meridian": {
          "code": "LU",
          "pt": "Pulmão",
          "en": "Lung"
      },
      "locationText": "Na face anterior de elbow, at cubital crease, na depressão lateral a biceps brachii tendon.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,5 a 1 cun\n- 淺靜脈을 puntura para sangria",
      "actions": [
          "Clears lung heat",
          "Stimulates lung qi descending",
          "Expels lung fleuma",
          "Benefits bladder",
          "Relaxes sinews"
      ],
      "indications": [
          "Tosse",
          "Hemoptysis",
          "Afternoon fever",
          "Asma",
          "garganta inflamada",
          "Plenitude torácica",
          "Infantile convulsion",
          "Arm spasmodic dor",
          "Elbow spasmodic dor",
          "Mastitis"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "LU6",
      "names": {
          "pt": "Kongzui",
          "en": "Kongzui",
          "zh": "孔最"
      },
      "meridian": {
          "code": "LU",
          "pt": "Pulmão",
          "en": "Lung"
      },
      "locationText": "On anterolateral face de forearm, na linha que conecta LU5 a LU9, 7 B-cun superior a prega palmar do punho.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1 cun (留3呼)\n- Inserção oblíqua: 1 a 1,5 cun",
      "actions": [
          "Regulates lung qi",
          "Stimulates lung qi descending",
          "Clears heat",
          "Stops bleeding"
      ],
      "indications": [
          "Tosse",
          "Dor toracica",
          "Asma",
          "Hemoptysis",
          "garganta inflamada",
          "Arm spasmodic dor",
          "Elbow spasmodic dor"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "LU8",
      "names": {
          "pt": "Jingqu",
          "en": "Jingqu",
          "zh": "經渠"
      },
      "meridian": {
          "code": "LU",
          "pt": "Pulmão",
          "en": "Lung"
      },
      "locationText": "On anterolateral face de forearm, entre radial styloid process e radial artery, 1 B-cun superior a prega palmar do punho. Nota: 1 B-cun superior a LU9.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun\n- Inserção oblíqua: 0,5 a 0,7 cun\n- 刺鍼時 노동맥(radial artery)을 피하여 刺入",
      "actions": [
          "Diffuses lungs",
          "Downbears qi",
          "Courses wind",
          "Resolves exterior"
      ],
      "indications": [
          "Tosse",
          "Asma",
          "Fever",
          "Dor toracica",
          "garganta inflamada",
          "Wrist dor"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "LU10",
      "names": {
          "pt": "Yuji",
          "en": "Yuji",
          "zh": "魚際"
      },
      "meridian": {
          "code": "LU",
          "pt": "Pulmão",
          "en": "Lung"
      },
      "locationText": "On palm, radial a midpoint de first osso metacarpal, at border entre pele vermelha e branca.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,5 a 1 cun (鍼尖을 약간 斜em direção a하여 掌內로 刺入)",
      "actions": [
          "Clears lung heat",
          "Benefits throat"
      ],
      "indications": [
          "Tosse",
          "Hemoptysis",
          "garganta inflamada",
          "Voice loss",
          "Fever",
          "Feverish sensation on palm"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "LU11",
      "names": {
          "pt": "Shaoshang",
          "en": "Shaoshang",
          "zh": "少商"
      },
      "meridian": {
          "code": "LU",
          "pt": "Pulmão",
          "en": "Lung"
      },
      "locationText": "On polegar, radial a falange distal, 0.1 F-cun proximal-lateral a radial corner de polegar nail, at intersection de vertical linha de radial border e horizontal linha de base de polegar nail.",
      "needlingText": "- Inserção perpendicular: 0,1 a 0,2 cun\n- Inserção oblíqua: 0,1 a 0,3 cun (鍼尖을 superiormente em direção a em direção a 刺入)\n- agulha triangular em direção a 速刺해서 出血시키기도 한다.",
      "actions": [
          "Expels wind",
          "Stimulates lung qi dispersing",
          "Stimulates lung qi descending",
          "Benefits throat",
          "Opens orifices",
          "Promotes resuscitation"
      ],
      "indications": [
          "garganta inflamada",
          "Tosse",
          "Asma",
          "Epistaxis",
          "Fever",
          "Consciousness loss",
          "Mania",
          "Thumb spasmodic dor"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "LI1",
      "names": {
          "pt": "Shangyang",
          "en": "Shangyang",
          "zh": "商陽"
      },
      "meridian": {
          "code": "LI",
          "pt": "Intestino Grosso",
          "en": "Large Intestine"
      },
      "locationText": "On index finger, radial a falange distal, 0.1 F-cun proximal-lateral a radial corner de index fingernail, at intersection de vertical linha de radial border de fingernail e horizontal linha de base de index fingernail.",
      "needlingText": "- Inserção perpendicular: 0,1 a 0,2 cun\n- Inserção oblíqua: 0,1 a 0,3 cun\n- agulha triangular em direção a puntura para sangria",
      "actions": [
          "Clears heat",
          "Brightens eyes",
          "Benefits throat",
          "Calms mind",
          "Expels wind",
          "Scatters cold"
      ],
      "indications": [
          "Toothache",
          "garganta inflamada",
          "Submandibular region swelling",
          "Finger numbness",
          "Febrile diseases with anhidrosis",
          "Xerostomia",
          "Consciousness loss"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "LI2",
      "names": {
          "pt": "Erjian",
          "en": "Erjian",
          "zh": "二間"
      },
      "meridian": {
          "code": "LI",
          "pt": "Intestino Grosso",
          "en": "Large Intestine"
      },
      "locationText": "On index finger, na depressão distal a radial side de 2º metacarpophalangeal joint, at border entre pele vermelha e branca.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun (鍼尖을 노쪽에서 자쪽을 em direção a 刺入)\n- Inserção oblíqua: 0,2 a 0,3 cun",
      "actions": [
          "Clears heat",
          "Dissipates pathogenic heat",
          "Disinhibits throat"
      ],
      "indications": [
          "Blurred vision",
          "Epistaxis",
          "Toothache",
          "garganta inflamada",
          "doença febril",
          "Decreased saliva",
          "Dry mouth",
          "Xerostomia"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "LI3",
      "names": {
          "pt": "Sanjian",
          "en": "Sanjian",
          "zh": "三間"
      },
      "meridian": {
          "code": "LI",
          "pt": "Intestino Grosso",
          "en": "Large Intestine"
      },
      "locationText": "No dorso da mão, na depressão radial e proximal a 2º metacarpophalangeal joint.",
      "needlingText": "- 0,2 a 0,3 cun (鍼尖을 橈側에서 尺側을 em direção a 刺入)\n- Inserção oblíqua: 0,3 a 0,7 cun",
      "actions": [
          "Dispels exterior wind",
          "Clears heat",
          "Brightens eyes",
          "Benefits throat"
      ],
      "indications": [
          "Toothache",
          "Ophthalmalgia",
          "garganta inflamada",
          "Finger redness",
          "Finger swelling",
          "Dorsum of hand redness",
          "Dorsum of hand swelling"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "LI5",
      "names": {
          "pt": "Yangxi",
          "en": "Yangxi",
          "zh": "陽谿"
      },
      "meridian": {
          "code": "LI",
          "pt": "Intestino Grosso",
          "en": "Large Intestine"
      },
      "locationText": "On posterolateral face de wrist, at radial side de prega dorsal do punho, distal a radial styloid process, na depressão de anatomical snuffbox.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun (鍼尖을 손등의 노쪽에서 자쪽을 em direção a 刺入)\n- Inserção oblíqua: 0,3 a 0,7 cun",
      "actions": [
          "Expels wind",
          "Releases exterior",
          "Benefits throat",
          "Stops dor"
      ],
      "indications": [
          "Cefaleia",
          "Vermelhidão ocular",
          "Eye swelling",
          "Dor ocular",
          "Toothache",
          "garganta inflamada",
          "Wrist dor"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "LI6",
      "names": {
          "pt": "Pianli",
          "en": "Pianli",
          "zh": "偏歷"
      },
      "meridian": {
          "code": "LI",
          "pt": "Intestino Grosso",
          "en": "Large Intestine"
      },
      "locationText": "On posterolateral face de forearm, na linha que conecta LI5 a LI11, 3 B-cun superior a prega dorsal do punho.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,5 a 1 cun",
      "actions": [
          "Opens lung water passage"
      ],
      "indications": [
          "Vermelhidão ocular",
          "Zumbido",
          "surdez",
          "Epistaxis",
          "Arm dor",
          "Handache",
          "garganta inflamada",
          "Edema"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "LI7",
      "names": {
          "pt": "Wenliu",
          "en": "Wenliu",
          "zh": "溫溜"
      },
      "meridian": {
          "code": "LI",
          "pt": "Intestino Grosso",
          "en": "Large Intestine"
      },
      "locationText": "On posterolateral face de forearm, na linha que conecta LI5 a LI11, 5 B-cun superior a prega dorsal do punho.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1 cun\n- Inserção oblíqua: 1 a 1,5 cun",
      "actions": [
          "Clears heat",
          "Stops dor",
          "Expels wind",
          "Benefits throat"
      ],
      "indications": [
          "Cefaleia",
          "Face swelling",
          "garganta inflamada",
          "Borborigmo",
          "Dor abdominal",
          "Arm dor",
          "Dor no ombro"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "LI8",
      "names": {
          "pt": "Xialian",
          "en": "Xialian",
          "zh": "下廉"
      },
      "meridian": {
          "code": "LI",
          "pt": "Intestino Grosso",
          "en": "Large Intestine"
      },
      "locationText": "On posterolateral face de forearm, na linha que conecta LI5 a LI11, 4 B-cun inferior a cubital crease.",
      "needlingText": "- Inserção perpendicular: 0,5 a 0,8 cun\n- Inserção oblíqua: 1 a 2 cun",
      "actions": [
          "Dissipates wind",
          "Clears heat",
          "Frees channels",
          "Relieves dor"
      ],
      "indications": [
          "Dor abdominal",
          "Borborigmo",
          "Arm dor",
          "Elbow dor",
          "Upper limb motor impairment"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "LI9",
      "names": {
          "pt": "Shanglian",
          "en": "Shanglian",
          "zh": "上廉"
      },
      "meridian": {
          "code": "LI",
          "pt": "Intestino Grosso",
          "en": "Large Intestine"
      },
      "locationText": "On posterolateral face de forearm, na linha que conecta LI5 a LI11, 3 B-cun inferior a cubital crease.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1 cun\n- Inserção oblíqua: 1 a 2 cun",
      "actions": [
          "Courses channels",
          "Quickens connecting vessels",
          "Frees bowel qi"
      ],
      "indications": [
          "Arm dor",
          "Dor no ombro",
          "Upper limb motor impairment",
          "Arm numbness",
          "Hand numbness",
          "Borborigmo",
          "Dor abdominal"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "LI10",
      "names": {
          "pt": "Shousanli",
          "en": "Shousanli",
          "zh": "手三里"
      },
      "meridian": {
          "code": "LI",
          "pt": "Intestino Grosso",
          "en": "Large Intestine"
      },
      "locationText": "On posterolateral face de forearm, na linha que conecta LI5 a LI11, 2 B-cun inferior a cubital crease.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1,2 cun\n- Inserção oblíqua: 1 a 2 cun",
      "actions": [
          "Removes channel obstructions",
          "Tonifies qi"
      ],
      "indications": [
          "Dor abdominal",
          "Diarreia",
          "Toothache",
          "Cheek swelling",
          "Upper limb motor impairment",
          "Dor nas costas",
          "Dor no ombro"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "LI12",
      "names": {
          "pt": "Zhouliao",
          "en": "Zhouliao",
          "zh": "肘髎"
      },
      "meridian": {
          "code": "LI",
          "pt": "Intestino Grosso",
          "en": "Large Intestine"
      },
      "locationText": "On posterolateral face de elbow, superior a lateral epicondyle de humerus, anterior a lateral supraepicondylar ridge.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,7 cun\n- Inserção oblíqua: 1 a 1,5 cun",
      "actions": [
          "Courses channels",
          "Quickens connecting vessels",
          "Disinhibits joints"
      ],
      "indications": [
          "Dor",
          "Arm contracture",
          "Elbow contracture",
          "Arm numbness",
          "Elbow numbness"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "LI13",
      "names": {
          "pt": "Shouwuli",
          "en": "Shouwuli",
          "zh": "手五里"
      },
      "meridian": {
          "code": "LI",
          "pt": "Intestino Grosso",
          "en": "Large Intestine"
      },
      "locationText": "Na face lateral de arm, na linha que conecta LI11 a LI15, 3 B-cun superior a cubital crease.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun (혈관을 피하여 鍼尖을 臂外面에서 內側面을 em direção a 刺入)\n- Inserção oblíqua: 0,5 a 0,8 cun",
      "actions": [
          "Courses channels",
          "Quickens connecting vessels",
          "Disinhibits joints"
      ],
      "indications": [
          "Arm dor",
          "Elbow dor",
          "Arm contracture",
          "Elbow contracture",
          "Scrofula"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "LI14",
      "names": {
          "pt": "Binao",
          "en": "Binao",
          "zh": "臂臑"
      },
      "meridian": {
          "code": "LI",
          "pt": "Intestino Grosso",
          "en": "Large Intestine"
      },
      "locationText": "Na face lateral de arm, just anterior a border de deltoid muscle, 7 B-cun superior a LI11.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,7 cun\n- Inserção oblíqua: 1 a 1,5 cun\n- 眼疾患 치료시 上em direção a em direção a 三角筋中에 1 a 1,5 cun Inserção oblíqua\n- Inserção horizontal時 上腕骨前緣에서 後緣을 em direção a: 1 a 1,5 cun Inserção transfixante.\n- 肩臂痛 치료시 鍼尖을 superiormente em direção a 肩髃(LI15)를 em direção a 1 a 1,5 cun Inserção horizontal로 Inserção transfixante.",
      "actions": [
          "Removes channel obstructions",
          "Brightens eyes",
          "Resolves fleuma",
          "Disperses masses"
      ],
      "indications": [
          "Arm dor",
          "Dor no ombro",
          "Neck stiffness",
          "Scrofula"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "LI15",
      "names": {
          "pt": "Jianyu",
          "en": "Jianyu",
          "zh": "肩髃"
      },
      "meridian": {
          "code": "LI",
          "pt": "Intestino Grosso",
          "en": "Large Intestine"
      },
      "locationText": "No ombro girdle, na depressão entre anterior end de lateral border de acromion e greater tubercle de humerus.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1,2 cun\n- Inserção oblíqua: 0,7 a 1,5 cun",
      "actions": [
          "Benefits sinews",
          "Promotes qi circulation in channels",
          "Stops dor",
          "Expels wind"
      ],
      "indications": [
          "Dor no ombro",
          "Arm dor",
          "Motor impairment of upper extremity",
          "Rubella",
          "Scrofula"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "LI16",
      "names": {
          "pt": "Jugu",
          "en": "Jugu",
          "zh": "巨骨"
      },
      "meridian": {
          "code": "LI",
          "pt": "Intestino Grosso",
          "en": "Large Intestine"
      },
      "locationText": "No ombro girdle, na depressão entre acromial end de clavicle e spine de scapula.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,7 cun\n- Inserção oblíqua: 0,5 a 1 cun (鍼尖을 약간 外inferiormente em direção a em direção a 刺入)",
      "actions": [
          "Moves blood",
          "Removes channel obstructions",
          "Opens chest",
          "Subdues ascending rebellious qi",
          "Stimulates lung qi descending",
          "Benefits joints"
      ],
      "indications": [
          "Upper extremity motor impairment",
          "Upper extremity dor",
          "Dor nas costas",
          "Dor no ombro"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "LI17",
      "names": {
          "pt": "Tianding",
          "en": "Tianding",
          "zh": "天鼎"
      },
      "meridian": {
          "code": "LI",
          "pt": "Intestino Grosso",
          "en": "Large Intestine"
      },
      "locationText": "Na face anterior de neck, no mesmo nível de cricoid cartilage, just posterior a border de sternocleidomastoid muscle.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,5 a 1 cun",
      "actions": [
          "Disinhibits throat",
          "Clears lung qi"
      ],
      "indications": [
          "Voice sudden loss",
          "garganta inflamada",
          "Scrofula",
          "Goiter"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "LI18",
      "names": {
          "pt": "Futu",
          "en": "Futu",
          "zh": "扶突"
      },
      "meridian": {
          "code": "LI",
          "pt": "Intestino Grosso",
          "en": "Large Intestine"
      },
      "locationText": "Na face anterior de neck, no mesmo nível de superior border de thyroid cartilage, entre anterior e posterior borders de sternocleidomastoid muscle.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,5 a 1 cun",
      "actions": [
          "Benefits throat",
          "Relieves tosse",
          "Resolves fleuma",
          "Disperses masses"
      ],
      "indications": [
          "Tosse",
          "Asma",
          "garganta inflamada",
          "Voice sudden loss",
          "Scrofula",
          "Goiter"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "LI19",
      "names": {
          "pt": "Kouheliao",
          "en": "Kouheliao",
          "zh": "禾髎"
      },
      "meridian": {
          "code": "LI",
          "pt": "Intestino Grosso",
          "en": "Large Intestine"
      },
      "locationText": "Na face, no mesmo nível de midpoint de philtrum, inferior a lateral margin de nostril. Nota: 0,5 B-cun laterals a GV26. Remarks: Alternative location for LI19 – On face, no mesmo nível de junction de upper one third e lower two thirds de philtrum, inferior a lateral margin de nostril.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun\n- Inserção oblíqua: 0,3 a 0,5 cun",
      "actions": [
          "Diffuses lung qi",
          "Clears lung heat",
          "Clears nose",
          "Rouses spirit"
      ],
      "indications": [
          "Obstrução nasal",
          "Epistaxis",
          "Mouth deviation"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "ST1",
      "names": {
          "pt": "Chengqi",
          "en": "Chengqi",
          "zh": "承泣"
      },
      "meridian": {
          "code": "ST",
          "pt": "Estômago",
          "en": "Stomach"
      },
      "locationText": "Na face, entre eyeball e infraorbital margin, directly inferior a pupil.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun\n- 深刺할 때는 환자를 仰臥位에서 안구를 고정하게 한 후 눈확아래모서리를 ao longo de해 완만하게 1 a 1,5 cun 刺入하며 捻轉과 搗鍼하지 않도록 한다.\n- Inserção horizontal時(近視 치료)에는 內眼角을 em direção a Inserção transfixante한다.",
      "actions": [
          "Expels wind",
          "Brightens eyes",
          "Stops lacrimation"
      ],
      "indications": [
          "Vermelhidão ocular",
          "Dor ocular",
          "Eye swelling",
          "Lacrimation",
          "Night blindness",
          "Eyelid twitching",
          "Face paralysis"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "ST2",
      "names": {
          "pt": "Sibai",
          "en": "Sibai",
          "zh": "四白"
      },
      "meridian": {
          "code": "ST",
          "pt": "Estômago",
          "en": "Stomach"
      },
      "locationText": "Na face, in infraorbital foramen.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun\n- Inserção oblíqua: 0,3 a 0,5 cun",
      "actions": [
          "Expels wind",
          "Brightens eyes"
      ],
      "indications": [
          "Vermelhidão ocular",
          "Eye itching",
          "Dor ocular",
          "Face paralysis",
          "Eyelid twitching",
          "Face dor"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "ST3",
      "names": {
          "pt": "Juliao",
          "en": "Juliao",
          "zh": "巨髎"
      },
      "meridian": {
          "code": "ST",
          "pt": "Estômago",
          "en": "Stomach"
      },
      "locationText": "Na face, directly inferior a pupil, no mesmo nível de inferior border de ala de nose.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,5 a 1 cun",
      "actions": [
          "Expels wind",
          "Removes channel obstructions",
          "Relieves swelling"
      ],
      "indications": [
          "Face paralysis",
          "Eyelid twitching",
          "Epistaxis",
          "Toothache",
          "Cheek swelling",
          "Lip swelling"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "ST4",
      "names": {
          "pt": "Dicang",
          "en": "Dicang",
          "zh": "地倉"
      },
      "meridian": {
          "code": "ST",
          "pt": "Estômago",
          "en": "Stomach"
      },
      "locationText": "Na face, 0.4 F-cun lateral a angle de mouth.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção horizontal: 1 a 1,5 cun\n- 顔面神經麻痺 치료시 頰車(ST6)로 Inserção transfixante 1,5 a 2,5 cun\n- 三叉神經痛 치료시 迎香(LI20) em direção a Inserção transfixante 1 a 2 cun",
      "actions": [
          "Expels wind",
          "Removes channel obstructions",
          "Benefits tendons",
          "Benefits muscles"
      ],
      "indications": [
          "Mouth deviation",
          "Salivation",
          "Eyelid twitching"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "ST5",
      "names": {
          "pt": "Daying",
          "en": "Daying",
          "zh": "大迎"
      },
      "meridian": {
          "code": "ST",
          "pt": "Estômago",
          "en": "Stomach"
      },
      "locationText": "Na face, anterior a angle de mandible, na depressão anterior a masseter attachment, sobre facial artery.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun\n- Inserção oblíqua: 0,5 a 1 cun",
      "actions": [
          "Courses wind",
          "Quickens connecting vessels"
      ],
      "indications": [
          "Face paralysis",
          "Trismus",
          "Cheek swelling",
          "Face dor",
          "Toothache"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "ST6",
      "names": {
          "pt": "Jiache",
          "en": "Jiache",
          "zh": "頰"
      },
      "meridian": {
          "code": "ST",
          "pt": "Estômago",
          "en": "Stomach"
      },
      "locationText": "Na face, one fingerbreadth (middle finger) anterosuperior a angle de mandible.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,5 a 1 cun (깨물근경련 치료시 위쪽을 em direção a 刺入, 上‧下齒痛에는 上齒 및 下齒를 em direção a 刺入)",
      "actions": [
          "Expels wind",
          "Removes channel obstructions"
      ],
      "indications": [
          "Face paralysis",
          "Toothache",
          "Face swelling",
          "Cheek swelling",
          "Mumps",
          "Trismus"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "ST7",
      "names": {
          "pt": "Xiaguan",
          "en": "Xiaguan",
          "zh": "下關"
      },
      "meridian": {
          "code": "ST",
          "pt": "Estômago",
          "en": "Stomach"
      },
      "locationText": "Na face, na depressão entre midpoint de inferior border de zygomatic arch e mandibular notch.",
      "needlingText": "- 艾炷灸 3～5壯\n- 艾條灸 5 a 10 fen",
      "actions": [
          "Removes channel obstructions",
          "Benefits ears"
      ],
      "indications": [
          "surdez",
          "Zumbido",
          "Otorrhea",
          "Toothache",
          "Face paralysis",
          "Face dor",
          "Jaw motor impairment"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "ST8",
      "names": {
          "pt": "Touwei",
          "en": "Touwei",
          "zh": "頭維"
      },
      "meridian": {
          "code": "ST",
          "pt": "Estômago",
          "en": "Stomach"
      },
      "locationText": "Na cabeça, 0,5 B-cun directly superior a linha anterior do cabelo at corner de forehead, 4,5 B-cun lateral à linha mediana anterior.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun\n- Inserção oblíqua: 0,3 a 0,5 cun",
      "actions": [
          "Expels wind",
          "Relieves dor",
          "Brightens eyes",
          "Relieves tontura",
          "Clears heat"
      ],
      "indications": [
          "Cefaleia",
          "Vision blurring",
          "Ophthalmalgia",
          "Lacrimation"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "ST9",
      "names": {
          "pt": "Renying",
          "en": "Renying",
          "zh": "人迎"
      },
      "meridian": {
          "code": "ST",
          "pt": "Estômago",
          "en": "Stomach"
      },
      "locationText": "In anterior região de neck, no mesmo nível de superior border de thyroid cartilage, anterior a sternocleidomastoid muscle, sobre common carotid artery.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun (不宜過深刺 혹 禁刺)\n- Inserção oblíqua: 0,3 a 0,7 cun",
      "actions": [
          "Regulates qi",
          "Removes masses",
          "Benefits throat",
          "Relieves swelling"
      ],
      "indications": [
          "garganta inflamada",
          "Asma",
          "Goiter",
          "Tontura",
          "Face flush"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "ST10",
      "names": {
          "pt": "Shuitu",
          "en": "Shuitu",
          "zh": "水突"
      },
      "meridian": {
          "code": "ST",
          "pt": "Estômago",
          "en": "Stomach"
      },
      "locationText": "In anterior região de neck, no mesmo nível de cricoid cartilage, just anterior a border de sternocleidomastoid muscle.",
      "needlingText": "- Inserção oblíqua: 0,5 a 0,7 cun\n- Inserção perpendicular: 0,3 a 0,4 cun (外方에서 內側을 향하여 刺入)\n- 자침시 온목동맥을 피해야 한다.",
      "actions": [
          "Rectifies lung qi",
          "Disinhibits throat"
      ],
      "indications": [
          "garganta inflamada",
          "Asma",
          "Tosse"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "ST11",
      "names": {
          "pt": "Qishe",
          "en": "Qishe",
          "zh": "氣舍"
      },
      "meridian": {
          "code": "ST",
          "pt": "Estômago",
          "en": "Stomach"
      },
      "locationText": "In anterior região de neck, in lesser supraclavicular fossa, superior a sternal end de clavicle, na depressão entre sternal e clavicular heads de sternocleidomastoid muscle.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,3 a 0,5 cun",
      "actions": [
          "Courses qi",
          "Downbears counterflow"
      ],
      "indications": [
          "garganta inflamada",
          "Neck stiffness",
          "Dor cervical",
          "Asma",
          "Soluço",
          "Goiter"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "ST12",
      "names": {
          "pt": "Quepen",
          "en": "Quepen",
          "zh": "缺盆"
      },
      "meridian": {
          "code": "ST",
          "pt": "Estômago",
          "en": "Stomach"
      },
      "locationText": "In anterior região de neck, in greater supraclavicular fossa, 4 B-cun lateral à linha mediana anterior, na depressão superior a clavicle.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- 宜Inserção horizontal(直下에는 肺尖部가 있고, 바깥목동맥, 빗장밑동․정맥이 있어 刺鍼 em direção a 손상받는 것을 방지하기 위하여 Inserção horizontal한다.)\n- 不宜深刺(『鍼灸甲乙經』:“刺太深令人逆息”) ou 不可em direção a下Inserção perpendicular",
      "actions": [
          "Subdues rebellious qi"
      ],
      "indications": [
          "Tosse",
          "Asma",
          "garganta inflamada",
          "Supraclavicular fossa dor"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "ST13",
      "names": {
          "pt": "Qihu",
          "en": "Qihu",
          "zh": "氣戶"
      },
      "meridian": {
          "code": "ST",
          "pt": "Estômago",
          "en": "Stomach"
      },
      "locationText": "In anterior thoracic região, inferior a clavicle, 4 B-cun lateral à linha mediana anterior.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun\n- Inserção oblíqua: 0,3 a 0,5 cun\n- 不宜深刺 (첫째～여섯째 갈비뼈사이의 胸部 內部에는 肺가 있으므로 深刺를 禁한다.)",
      "actions": [
          "Clears heat",
          "Loosens chest"
      ],
      "indications": [
          "Plenitude torácica",
          "Asma",
          "Tosse",
          "Soluço",
          "Hypochrondrium dor",
          "Dor toracica"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "ST14",
      "names": {
          "pt": "Kufang",
          "en": "Kufang",
          "zh": "庫房"
      },
      "meridian": {
          "code": "ST",
          "pt": "Estômago",
          "en": "Stomach"
      },
      "locationText": "In anterior thoracic região, in 1º espaço intercostal, 4 B-cun lateral à linha mediana anterior.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun\n- Inserção oblíqua: 0,3 a 0,5 cun\n- 不宜深刺",
      "actions": [
          "Rectifies qi",
          "Loosens chest"
      ],
      "indications": [
          "Fullness sensation",
          "Dor toracica",
          "Tosse"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "ST15",
      "names": {
          "pt": "Wuyi",
          "en": "Wuyi",
          "zh": "屋翳"
      },
      "meridian": {
          "code": "ST",
          "pt": "Estômago",
          "en": "Stomach"
      },
      "locationText": "In anterior thoracic região, in second intercostal space, 4 B-cun lateral à linha mediana anterior.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun (不宜深刺)\n- Inserção oblíqua: 0,3 a 0,5 cun",
      "actions": [
          "Courses wind",
          "Relieves dor"
      ],
      "indications": [
          "Costal dor",
          "Dor toracica",
          "Costal fullness",
          "Plenitude torácica",
          "Tosse",
          "Asma",
          "Mastitis"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "ST16",
      "names": {
          "pt": "Yingchuang",
          "en": "Yingchuang",
          "zh": "膺窓"
      },
      "meridian": {
          "code": "ST",
          "pt": "Estômago",
          "en": "Stomach"
      },
      "locationText": "In anterior thoracic região, in third intercostal space, 4 B-cun lateral à linha mediana anterior.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun (不可深刺)\n- Inserção oblíqua: 0,3 a 0,5 cun",
      "actions": [
          "Clears heat",
          "Resolves depression",
          "Relieves dor",
          "Disperses swelling"
      ],
      "indications": [
          "Hypochrondrium dor",
          "Dor toracica",
          "Hypochrondrium fullness",
          "Plenitude torácica",
          "Tosse",
          "Asma",
          "Mastitis"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "ST17",
      "names": {
          "pt": "Ruzhong",
          "en": "Ruzhong",
          "zh": "乳中"
      },
      "meridian": {
          "code": "ST",
          "pt": "Estômago",
          "en": "Stomach"
      },
      "locationText": "In anterior thoracic região, at centre de nipple.",
      "needlingText": "- contraindicação de agulhamento (『鍼灸甲乙經』)",
      "actions": [
          "regular fluxo energético"
      ],
      "indications": [
          "sob avaliação clínica"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "ST18",
      "names": {
          "pt": "Rugen",
          "en": "Rugen",
          "zh": "乳根"
      },
      "meridian": {
          "code": "ST",
          "pt": "Estômago",
          "en": "Stomach"
      },
      "locationText": "In anterior thoracic região, in fifth intercostal space, 4 B-cun lateral à linha mediana anterior.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun\n- Inserção oblíqua: 0,3 a 0,5 cun\n- Inserção horizontal: 0,5 a 1 cun",
      "actions": [
          "Regulates stomach qi",
          "Regulates breasts",
          "Regulates lactation",
          "Dispels stagnation"
      ],
      "indications": [
          "Dor toracica",
          "Tosse",
          "Asma",
          "Mastitis",
          "Insufficient lactation"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "ST19",
      "names": {
          "pt": "Burong",
          "en": "Burong",
          "zh": "容"
      },
      "meridian": {
          "code": "ST",
          "pt": "Estômago",
          "en": "Stomach"
      },
      "locationText": "On upper abdomen, 6 B-cun superior a centre de umbilicus, 2 B-cun lateral à linha mediana anterior.",
      "needlingText": "- Inserção perpendicular: 0,5 a 0,8 cun\n- Inserção oblíqua: 0,5 a 1 cun",
      "actions": [
          "Regulates center",
          "Harmonizes stomach"
      ],
      "indications": [
          "distensão abdominal",
          "Vomito",
          "Dor gástrica",
          "Anorexia"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "ST20",
      "names": {
          "pt": "Chengman",
          "en": "Chengman",
          "zh": "承滿"
      },
      "meridian": {
          "code": "ST",
          "pt": "Estômago",
          "en": "Stomach"
      },
      "locationText": "On upper abdomen, 5 B-cun superior a centre de umbilicus, 2 B-cun lateral à linha mediana anterior. Nota: ST20 is 5 B-cun superior a ST25, 1 B-cun inferior a St19, 2 B-cun lateral a CV13.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1 cun\n- Inserção oblíqua: 0,5 a 1,5 cun",
      "actions": [
          "Harmonizes stomach",
          "Rectifies qi"
      ],
      "indications": [
          "Dor gástrica",
          "distensão abdominal",
          "Vomito",
          "Anorexia"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "ST21",
      "names": {
          "pt": "Liangmen",
          "en": "Liangmen",
          "zh": "門"
      },
      "meridian": {
          "code": "ST",
          "pt": "Estômago",
          "en": "Stomach"
      },
      "locationText": "On upper abdomen, 4 B-cun superior a centre de umbilicus, 2 B-cun lateral à linha mediana anterior. Nota: ST21 is 4 B-cun superior a ST25, 1 B-cun inferior a St20, 2 B-cun lateral a CV12.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1 cun\n- Inserção oblíqua: 0,8 a 1,5 cun",
      "actions": [
          "Regulates stomach",
          "Subdues rebellious qi",
          "Stops vômito",
          "Relieves dor"
      ],
      "indications": [
          "Dor gástrica",
          "Vomito",
          "Anorexia",
          "distensão abdominal",
          "Diarreia"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "ST22",
      "names": {
          "pt": "Guanmen",
          "en": "Guanmen",
          "zh": "關門"
      },
      "meridian": {
          "code": "ST",
          "pt": "Estômago",
          "en": "Stomach"
      },
      "locationText": "On upper abdomen, 3 B-cun superior a centre de umbilicus, 2 B-cun lateral à linha mediana anterior. Nota: ST22 is located at same level e lateral a KI18 e CV11.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1 cun\n- Inserção oblíqua: 0,8 a 1,5 cun",
      "actions": [
          "Regulates stomach",
          "Regulates intestines"
      ],
      "indications": [
          "Dor abdominal",
          "distensão abdominal",
          "Anorexia",
          "Borborigmo",
          "Diarreia",
          "Edema"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "ST23",
      "names": {
          "pt": "Taiyi",
          "en": "Taiyi",
          "zh": "太乙"
      },
      "meridian": {
          "code": "ST",
          "pt": "Estômago",
          "en": "Stomach"
      },
      "locationText": "On upper abdomen, 2 B-cun superior a centre de umbilicus, 2 B-cun lateral à linha mediana anterior. Nota: ST23 is located at same level e lateral a KI17 e CV10.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1 cun\n- Inserção oblíqua: 0,8 a 1,5 cun",
      "actions": [
          "Clears heart",
          "Quiets spirit",
          "Fortifies spleen",
          "Harmonizes center"
      ],
      "indications": [
          "Dor gástrica",
          "Irritability",
          "Mania",
          "Indigestion"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "ST24",
      "names": {
          "pt": "Huaroumen",
          "en": "Huaroumen",
          "zh": "滑肉門"
      },
      "meridian": {
          "code": "ST",
          "pt": "Estômago",
          "en": "Stomach"
      },
      "locationText": "On upper abdomen, 1 B-cun superior a centre de umbilicus, 2 B-cun lateral à linha mediana anterior. Nota: ST24 is at same level e lateral a CV9.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1 cun\n- Inserção oblíqua: 0,8 a 1,5 cun",
      "actions": [
          "Quiets spirit",
          "Stabilizes disposition",
          "Regulates stomach",
          "Harmonizes stomach",
          "Regulates intestines",
          "Harmonizes intestines"
      ],
      "indications": [
          "Dor gástrica",
          "Vomito",
          "Mania"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "ST26",
      "names": {
          "pt": "Wailing",
          "en": "Wailing",
          "zh": "外陵"
      },
      "meridian": {
          "code": "ST",
          "pt": "Estômago",
          "en": "Stomach"
      },
      "locationText": "On lower abdomen, 1 B-cun inferior a centre de umbilicus, 2 B-cun lateral à linha mediana anterior. Nota: ST26 is at same level e lateral a KI15 e CV7.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1 cun\n- Inserção oblíqua: 0,8 a 1,5 cun",
      "actions": [
          "Dissipates cold",
          "Relieves dor",
          "Rectifies qi"
      ],
      "indications": [
          "Dor abdominal",
          "Hernia",
          "Dismenorreia"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "ST27",
      "names": {
          "pt": "Daju",
          "en": "Daju",
          "zh": "大巨"
      },
      "meridian": {
          "code": "ST",
          "pt": "Estômago",
          "en": "Stomach"
      },
      "locationText": "On lower abdomen, 2 B-cun inferior a centre de umbilicus, 2 B-cun lateral à linha mediana anterior. Nota: ST27 is at same level e lateral a KI14 e CV5.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1 cun\n- Inserção oblíqua: 0,8 a 1,5 cun\n- 오른쪽 穴에는 盲腸이 있어 주로 왼쪽 穴을 사용한다.",
      "actions": [
          "Regulates stomach qi"
      ],
      "indications": [
          "Lower abdominal distensiodysuria",
          "Hernia",
          "emissão seminal",
          "Premature ejaculation"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "ST28",
      "names": {
          "pt": "Shuidao",
          "en": "Shuidao",
          "zh": "水道"
      },
      "meridian": {
          "code": "ST",
          "pt": "Estômago",
          "en": "Stomach"
      },
      "locationText": "On lower abdomen, 3 B-cun inferior a centre de umbilicus, 2 B-cun lateral à linha mediana anterior. Nota: ST28 is 3 B-cun inferior a ST25, 1 B-cun inferior a St27, 2 B-cun lateral a CV4.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1 cun\n- Inserção oblíqua: 0,8 a 1,5 cun",
      "actions": [
          "Benefits urination",
          "Opens water passages",
          "Benefits urination difficulty"
      ],
      "indications": [
          "Lower distensão abdominal",
          "Urine retention",
          "Edema",
          "Hernia",
          "Dismenorreia",
          "Sterility"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "ST29",
      "names": {
          "pt": "Guilai",
          "en": "Guilai",
          "zh": "歸來"
      },
      "meridian": {
          "code": "ST",
          "pt": "Estômago",
          "en": "Stomach"
      },
      "locationText": "On lower abdomen, 4 B-cun inferior a centre de umbilicus, 2 B-cun lateral à linha mediana anterior. Nota: ST29 is 4 B-cun inferior a ST25, 1 B-cun inferior a ST28, 2 B-cun lateral a CV3.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1 cun\n- Inserção oblíqua: 0,9 a 1,5 cun\n- Inserção horizontal時는 鍼尖을 恥骨結合을 em direção a: 1,5 a 2 cun 刺入",
      "actions": [
          "Relieves blood stagnation"
      ],
      "indications": [
          "Dor abdominal",
          "Hernia",
          "Dismenorreia",
          "menstruação irregular",
          "Amenorrhea",
          "Leukorrhea",
          "Uterus prolapse"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "ST30",
      "names": {
          "pt": "Qichong",
          "en": "Qichong",
          "zh": "氣衝"
      },
      "meridian": {
          "code": "ST",
          "pt": "Estômago",
          "en": "Stomach"
      },
      "locationText": "In groin região, no mesmo nível de superior border de pubic symphysis, 2 B-cun lateral à linha mediana anterior, sobre femoral artery. Nota: ST30 is 5 B-cun inferior a ST25, 2 B-cun lateral a CV2.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,5 a 1 cun (鍼尖을 外陰部로 em direção a 刺入한다. 자침시 동맥을 피하여 출혈되지 않도록 한다.)",
      "actions": [
          "Regulates stomach qi",
          "Regulates penetrating vessels",
          "Promotes essence",
          "Tonifies nourishment",
          "Regulates blood"
      ],
      "indications": [
          "Dor abdominal",
          "Borborigmo",
          "Hernia",
          "External genitalia dor",
          "External genitalia swelling",
          "Impotence",
          "Dismenorreia",
          "menstruação irregular"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "ST31",
      "names": {
          "pt": "Biguan",
          "en": "Biguan",
          "zh": "髀關"
      },
      "meridian": {
          "code": "ST",
          "pt": "Estômago",
          "en": "Stomach"
      },
      "locationText": "Na face anterior de thigh, na depressão among three muscles: proximal portion de rectus femoris muscle, sartorius muscle e tensor fasciae latae muscle.",
      "needlingText": "- Inserção perpendicular: 0,8 a 1,5 cun\n- Inserção oblíqua: 1,5 cun～2 cun",
      "actions": [
          "Removes channel obstructions"
      ],
      "indications": [
          "Thigh dor",
          "Muscular atrophy",
          "Motor impairment",
          "Low extremity dor",
          "Low extremity numbness"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "ST32",
      "names": {
          "pt": "Futu",
          "en": "Futu",
          "zh": "伏兎"
      },
      "meridian": {
          "code": "ST",
          "pt": "Estômago",
          "en": "Stomach"
      },
      "locationText": "On anterolateral face de thigh, on linha que conecta lateral end de base de patella com anterior superior iliac spine, 6 B-cun superior a base de patella.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1 cun\n- Inserção oblíqua: 1,5 cun～2 cun",
      "actions": [
          "Removes channel obstructions",
          "Expels wind heat"
      ],
      "indications": [
          "Iliac region dor",
          "Lumbar dor",
          "Knee coldness",
          "Low extremity dor",
          "Low extremity motor impairment",
          "Paralysis",
          "Beriberi"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "ST33",
      "names": {
          "pt": "Yinshi",
          "en": "Yinshi",
          "zh": "陰市"
      },
      "meridian": {
          "code": "ST",
          "pt": "Estômago",
          "en": "Stomach"
      },
      "locationText": "On anterolateral face de thigh, lateral a rectus femoris tendon, 3 B-cun superior a base de patella.",
      "needlingText": "- Inserção perpendicular: 0,5 a 0,7 cun\n- Inserção oblíqua: 0,7 a 1 cun",
      "actions": [
          "Courses wind",
          "Dissipates cold",
          "Frees channels",
          "Quickens connecting vessels",
          "Disinhibits joints"
      ],
      "indications": [
          "Leg numbness",
          "Leg soreness",
          "Knee numbness",
          "Knee soreness",
          "Knee motor impairment",
          "Leg motor impairment",
          "Low extremity motor impairment"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "ST34",
      "names": {
          "pt": "Liangqiu",
          "en": "Liangqiu",
          "zh": "丘"
      },
      "meridian": {
          "code": "ST",
          "pt": "Estômago",
          "en": "Stomach"
      },
      "locationText": "On anterolateral face de thigh, entre vastus lateralis muscle e lateral border de rectus femoris tendon, 2 B-cun superior a base de patella.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1 cun\n- Inserção oblíqua: 1 a 1,5 cun",
      "actions": [
          "Subdues rebellious stomach qi",
          "Removes channel obstructions",
          "Expels damp",
          "Expels wind"
      ],
      "indications": [
          "Knee numbness",
          "Dor no joelho",
          "Dor gástrica",
          "Mastitis",
          "Low extremity motor impairment"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "ST35",
      "names": {
          "pt": "Dubi",
          "en": "Dubi",
          "zh": "犢鼻"
      },
      "meridian": {
          "code": "ST",
          "pt": "Estômago",
          "en": "Stomach"
      },
      "locationText": "Na face anterior de knee, na depressão lateral a patellar ligament. Nota: When knee is flexed, ST35 is located na depressão lateral e inferior a patella.",
      "needlingText": "- 0,3 a 0,5 cun Inserção perpendicular\n- 內膝眼쪽 em direção a 2 a 2,5 cun Inserção transfixante",
      "actions": [
          "Invigorates channels",
          "Relieves swelling",
          "Stops dor"
      ],
      "indications": [
          "Dor",
          "Knee motor impairment",
          "Knee numbness",
          "Beriberi"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "ST37",
      "names": {
          "pt": "Shangjuxu",
          "en": "Shangjuxu",
          "zh": "上巨虛"
      },
      "meridian": {
          "code": "ST",
          "pt": "Estômago",
          "en": "Stomach"
      },
      "locationText": "Na face anterior da perna, na linha que conecta ST35 a ST41, 6 B-cun inferior a ST35.",
      "needlingText": "- 0,5 a 1,5 cun Inserção perpendicular\n- Inserção oblíqua: 1 a 2 cun",
      "actions": [
          "Regulates stomach function",
          "Regulates intestines function",
          "Eliminates damp heat",
          "Dispels food retention",
          "Calms asma"
      ],
      "indications": [
          "distensão abdominal",
          "Dor abdominal",
          "Borborigmo",
          "Diarreia",
          "Dysentery",
          "Constipacao",
          "Enteritiris",
          "Paralysis due to stroke",
          "Beriberi"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "ST38",
      "names": {
          "pt": "Tiaokou",
          "en": "Tiaokou",
          "zh": "條口"
      },
      "meridian": {
          "code": "ST",
          "pt": "Estômago",
          "en": "Stomach"
      },
      "locationText": "Na face anterior da perna, na linha que conecta ST35 a ST41, 8 B-cun inferior a ST35.",
      "needlingText": "- 0,5 a 1 cun Inserção perpendicular\n- Inserção oblíqua: 1 a 1,5 cun",
      "actions": [
          "Removes channel obstructions"
      ],
      "indications": [
          "Knee numbness",
          "Leg numbness",
          "Leg dor",
          "Dor no joelho",
          "Leg soreness",
          "Knee soreness",
          "Shoulder motor impairment",
          "Shoulder weakness",
          "Dor abdominal"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "ST39",
      "names": {
          "pt": "Xiajuxu",
          "en": "Xiajuxu",
          "zh": "下巨虛"
      },
      "meridian": {
          "code": "ST",
          "pt": "Estômago",
          "en": "Stomach"
      },
      "locationText": "Na face anterior da perna, na linha que conecta ST35 a ST41, 9 B-cun inferior a ST35.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1 cun\n- Inserção oblíqua: 1 a 1,5 cun",
      "actions": [
          "Regulates stomach function",
          "Regulates intestines function",
          "Eliminates damp heat",
          "Eliminates wind damp",
          "Stops dor"
      ],
      "indications": [
          "Lower abdominal dor",
          "Backache refer to testis",
          "Mastitis",
          "Low extremity paralysis",
          "Low extremity numbness"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "ST41",
      "names": {
          "pt": "Jiexi",
          "en": "Jiexi",
          "zh": "解谿"
      },
      "meridian": {
          "code": "ST",
          "pt": "Estômago",
          "en": "Stomach"
      },
      "locationText": "Na face anterior de ankle, na depressão at centre de front surface de ankle joint, entre tendons de extensor hallucis longus e extensor digitorum longus.",
      "needlingText": "- 鍼尖을 足根部로 향하여 0,3 a 0,8 cun Inserção perpendicular",
      "actions": [
          "Removes channel obstructions",
          "Eliminates wind",
          "Clears heat",
          "Clears mind",
          "Brightens eyes"
      ],
      "indications": [
          "Ankle joint dor",
          "Muscular atrophy",
          "Low extremity motor impairment",
          "Low extremity paralysis",
          "Low extremity dor",
          "Epilepsy",
          "Cefaleia",
          "Vertigem",
          "Tontura",
          "distensão abdominal",
          "Constipacao"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "ST42",
      "names": {
          "pt": "Chongyang",
          "en": "Chongyang",
          "zh": "衝陽"
      },
      "meridian": {
          "code": "ST",
          "pt": "Estômago",
          "en": "Stomach"
      },
      "locationText": "No dorso do pé, at joint de base de second metatarsal bone e intermediate cuneiform bone, sobre a artéria dorsal do pé.",
      "needlingText": "- 足背動靜脈을 피하여 鍼尖을 足背에서 足底를 em direção a 0,2 a 0,3 cun Inserção perpendicular",
      "actions": [
          "Tonifies stomach",
          "Tonifies spleen",
          "Calms mind",
          "Removes channel obstructions"
      ],
      "indications": [
          "Upper teeth dor",
          "Dorsum of foot redness",
          "Dorsum of foot swelling",
          "Face paralysis",
          "Foot motor impairment",
          "Foot muscular atrophy"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "ST43",
      "names": {
          "pt": "Xiangu",
          "en": "Xiangu",
          "zh": "陷谷"
      },
      "meridian": {
          "code": "ST",
          "pt": "Estômago",
          "en": "Stomach"
      },
      "locationText": "No dorso do pé, entre second e third ossos metatarsais, na depressão proximal a second metatarsophalangeal joint.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,5 a 1 cun",
      "actions": [
          "Eliminates wind",
          "Eliminates heat",
          "Removes channel obstructions"
      ],
      "indications": [
          "General edema",
          "Face edema",
          "Dor abdominal",
          "Borborigmo",
          "Dorsum of foot swelling",
          "Dorsum of foot dor"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "ST44",
      "names": {
          "pt": "Neiting",
          "en": "Neiting",
          "zh": "內庭"
      },
      "meridian": {
          "code": "ST",
          "pt": "Estômago",
          "en": "Stomach"
      },
      "locationText": "No dorso do pé, entre second e third dedos do pé, posterior a margem interdigital, at border entre pele vermelha e branca.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,4 cun\n- Inserção oblíqua: 0,3 a 0,8 cun (鍼尖을 上em direção a하여 刺入)",
      "actions": [
          "Clears heat",
          "Eliminates fullness",
          "Regulates qi",
          "Stops dor",
          "Promotes digestion",
          "Eliminates wind"
      ],
      "indications": [
          "Toothache",
          "Face dor",
          "Mouth deviation",
          "garganta inflamada",
          "Epistaxis",
          "Dor gástrica",
          "Acid regurgitation",
          "distensão abdominal",
          "Diarreia",
          "Dysentery",
          "Constipacao",
          "Dorsum of foot swelling",
          "Dorsum of foot dor",
          "doença febril"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "ST45",
      "names": {
          "pt": "Lidui",
          "en": "Lidui",
          "zh": "厲兌"
      },
      "meridian": {
          "code": "ST",
          "pt": "Estômago",
          "en": "Stomach"
      },
      "locationText": "On second toe, lateral a falange distal, 0.1 F-cun proximallateral a lateral corner de second toenail, at intersection de vertical linha de lateral border e horizontal linha de base de second toenail.",
      "needlingText": "- Inserção perpendicular: 0,1 a 0,2 cun\n- Inserção oblíqua: 0,1 a 0,2 cun",
      "actions": [
          "Calms mind",
          "Brightens eyes",
          "Clears heart",
          "Relieves food retention"
      ],
      "indications": [
          "Face swelling",
          "Mouth deviation",
          "Epistaxis",
          "Toothache",
          "Hoarse voice",
          "garganta inflamada",
          "distensão abdominal",
          "Foot coldness",
          "Leg coldness",
          "doença febril",
          "Dream-disturbed sleep",
          "Mania"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "SP1",
      "names": {
          "pt": "Yinbai",
          "en": "Yinbai",
          "zh": "隱白"
      },
      "meridian": {
          "code": "SP",
          "pt": "Baço",
          "en": "Spleen"
      },
      "locationText": "No halux, medial a falange distal, 0.1 F-cun proximal-medial a medial corner de toenail, at intersection de vertical linha de medial border e horizontal linha de base da unha do halux.",
      "needlingText": "- Inserção perpendicular: 0,1 a 0,2 cun\n- Inserção oblíqua: 0,1 a 0,3 cun (鍼尖을 上em direção a하여 刺入)\n- agulha triangular em direção a puntura para sangria",
      "actions": [
          "Strengthens spleen",
          "Regulates blood",
          "Calms wind"
      ],
      "indications": [
          "distensão abdominal",
          "Bloody stool",
          "Menorrhagia",
          "sangramento uterino",
          "Mental disorder",
          "Dream-disturbed sleep",
          "Convulsion"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "SP2",
      "names": {
          "pt": "Dadu",
          "en": "Dadu",
          "zh": "大都"
      },
      "meridian": {
          "code": "SP",
          "pt": "Baço",
          "en": "Spleen"
      },
      "locationText": "No halux, na depressão distal a 1º metatarsophalangeal joint, at border entre pele vermelha e branca.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun\n- Inserção oblíqua: 0,3 a 0,5 cun",
      "actions": [
          "Strengthens spleen",
          "Promotes digestion",
          "Clears heat"
      ],
      "indications": [
          "distensão abdominal",
          "Dor gástrica",
          "Constipacao",
          "Febrile diseases with anhidrosis"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "SP4",
      "names": {
          "pt": "Gongsun",
          "en": "Gongsun",
          "zh": "公孫"
      },
      "meridian": {
          "code": "SP",
          "pt": "Baço",
          "en": "Spleen"
      },
      "locationText": "Na face medial de foot, anteroinferior a base de 1º metatarsal bone, at border entre pele vermelha e branca.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1 cun\n- Inserção oblíqua: 1 a 1,5 cun\n- 湧泉을 em direção a 1,5 a 2 cun Inserção transfixante",
      "actions": [
          "Tonifies stomach",
          "Tonifies spleen",
          "Regulates chong channels",
          "Stops bleeding",
          "Dispels fullness",
          "Pacifies stomach",
          "Removes obstructions",
          "Regulates menses"
      ],
      "indications": [
          "Dor gástrica",
          "Vomito",
          "distensão abdominal",
          "Dor abdominal",
          "Diarreia",
          "Dysentery",
          "Borborigmo"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "SP5",
      "names": {
          "pt": "Shangqiu",
          "en": "Shangqiu",
          "zh": "商丘"
      },
      "meridian": {
          "code": "SP",
          "pt": "Baço",
          "en": "Spleen"
      },
      "locationText": "Na face medial de foot, anteroinferior a maleolo medial, na depressão midway entre tuberosity de navicular bone e prominence de maleolo medial. Nota 1: SP5 is located posterior a LR4 e anterior a KI6.",
      "needlingText": "- 0,3 a 0,5 cun Inserção perpendicular를 하거나\n- 鍼尖을 解谿(ST41)를 em direção a 1 a 1,5 cun Inserção horizontal",
      "actions": [
          "Strengthens stomach",
          "Strengthens spleen",
          "Resolves damp"
      ],
      "indications": [
          "distensão abdominal",
          "Constipacao",
          "Diarreia",
          "Borborigmo",
          "Tongue stiffness",
          "Tongue dor",
          "Ankle dor",
          "Foot dor",
          "Hemorrhoids"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "SP7",
      "names": {
          "pt": "Lougu",
          "en": "Lougu",
          "zh": "谷"
      },
      "meridian": {
          "code": "SP",
          "pt": "Baço",
          "en": "Spleen"
      },
      "locationText": "On tibial face de leg, posterior a medial border de tibia, 6 B-cun superior a prominence de maleolo medial.",
      "needlingText": "- 0,5 a 1 cun Inserção perpendicular\n- Inserção oblíqua: 1 a 1,5 cun",
      "actions": [
          "Fortifies spleen",
          "Harmonizes stomach",
          "Disinhibits damp",
          "Disperses swelling",
          "Frees channels",
          "Quickens connecting vessels",
          "Regulates qi",
          "Regulates blood"
      ],
      "indications": [
          "distensão abdominal",
          "Borborigmo",
          "Knee coldness",
          "Leg coldness",
          "Leg paralysis",
          "Knee paralysis",
          "Leg numbness",
          "Knee numbness"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "SP8",
      "names": {
          "pt": "Diji",
          "en": "Diji",
          "zh": "地機"
      },
      "meridian": {
          "code": "SP",
          "pt": "Baço",
          "en": "Spleen"
      },
      "locationText": "On tibial face de leg, posterior a medial border de tibia, 3 B-cun inferior a SP9. Nota: SP8 is located at junction de upper 1/3 e lower 2/3 de linha que conecta apex de patella com prominence de maleolo medial.",
      "needlingText": "- 0,5 a 1 cun Inserção perpendicular\n- Inserção oblíqua: 1 a 2 cun",
      "actions": [
          "Removes channel obstructions",
          "Regulates qi",
          "Regulates blood",
          "Regulates uterus",
          "Stops dor"
      ],
      "indications": [
          "distensão abdominal",
          "Dor abdominal",
          "Diarreia",
          "Edema",
          "Dysuria",
          "Nocturnal emission",
          "menstruação irregular",
          "Dismenorreia"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "SP11",
      "names": {
          "pt": "Jimen",
          "en": "Jimen",
          "zh": "箕門"
      },
      "meridian": {
          "code": "SP",
          "pt": "Baço",
          "en": "Spleen"
      },
      "locationText": "Na face medial de thigh, at junction de upper 1/3 e lower 2/3 de linha que conecta medial end de base de patella com SP12, entre sartorius muscle e adductor longus muscle, sobre femoral artery.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun (動脈을 피하여 刺鍼)\n- Inserção oblíqua: 0,5 a 0,8 cun\n- 不可深刺",
      "actions": [
          "Clears head",
          "Promotes free flow through waterway"
      ],
      "indications": [
          "Dysuria",
          "Enuresis",
          "Inguinal region swelling",
          "Inguinal region dor",
          "Muscular atrophy",
          "Low extremity motor impairment",
          "Low extremity paralysis",
          "Low extremity dor"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "SP12",
      "names": {
          "pt": "Chongmen",
          "en": "Chongmen",
          "zh": "衝門"
      },
      "meridian": {
          "code": "SP",
          "pt": "Baço",
          "en": "Spleen"
      },
      "locationText": "In groin região, at inguinal crease, lateral a femoral artery.",
      "needlingText": "- Inserção perpendicular: 0,5 a 0,7 cun (動脈을 피하여 刺鍼)\n- Inserção oblíqua: 0,5 a 1 cun",
      "actions": [
          "Removes channel obstructions",
          "Tonifies yin"
      ],
      "indications": [
          "Dor abdominal",
          "Hernia",
          "Dysuria"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "SP13",
      "names": {
          "pt": "Fushe",
          "en": "Fushe",
          "zh": "府舍"
      },
      "meridian": {
          "code": "SP",
          "pt": "Baço",
          "en": "Spleen"
      },
      "locationText": "On lower abdomen, 4,3 B-cun inferior a center de umbilicus, 4 B-cun lateral à linha mediana anterior.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1 cun\n- Inserção oblíqua: 0,5 a 1 cun",
      "actions": [
          "Regulates qi dynamic",
          "Soothes liver",
          "Relieves dor"
      ],
      "indications": [
          "Lower abdominal dor",
          "Hernia"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "SP14",
      "names": {
          "pt": "Fujie",
          "en": "Fujie",
          "zh": "腹結"
      },
      "meridian": {
          "code": "SP",
          "pt": "Baço",
          "en": "Spleen"
      },
      "locationText": "On lower abdomen, 1,3 B-cun inferior a center de umbilicus, 4 B-cun lateral à linha mediana anterior.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1 cun\n- Inserção oblíqua: 0,5 a 1 cun",
      "actions": [
          "Warms center",
          "Dissipates cold",
          "Rectifies qi",
          "Downbears counterflow"
      ],
      "indications": [
          "Umbilical dor",
          "distensão abdominal",
          "Hernia",
          "Diarreia",
          "Constipacao"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "SP15",
      "names": {
          "pt": "Daheng",
          "en": "Daheng",
          "zh": "大橫"
      },
      "meridian": {
          "code": "SP",
          "pt": "Baço",
          "en": "Spleen"
      },
      "locationText": "On upper abdomen, 4 B-cun lateral a center de umbilicus. Nota: At same level e lateral a ST25, KI16 e CV8.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1 cun\n- Inserção oblíqua: 0,7 a 1,5 cun\n- Inserção horizontal: 2 a 2,5 cun\n- 蛔蟲症 치료시는 臍中을 em direção a Inserção horizontal한다.",
      "actions": [
          "Strengthens spleen",
          "Strengthens limbs",
          "Resolves damp",
          "Regulates qi",
          "Stops dor",
          "Promotes large intestine function"
      ],
      "indications": [
          "distensão abdominal",
          "Dor abdominal",
          "Diarreia",
          "Dysentery",
          "Constipacao"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "SP16",
      "names": {
          "pt": "Fuai",
          "en": "Fuai",
          "zh": "腹哀"
      },
      "meridian": {
          "code": "SP",
          "pt": "Baço",
          "en": "Spleen"
      },
      "locationText": "On upper abdomen, 3 B-cun superior a center de umbilicus, 4 B-cun lateral à linha mediana anterior. Nota: 3 B-cun superior a SP15, no mesmo nível de CV11.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1 cun\n- Inserção oblíqua: 0,7 a 1 cun",
      "actions": [
          "Clears heat",
          "Disinhibits damp",
          "Frees bowel qi"
      ],
      "indications": [
          "Dor abdominal",
          "Indigestion",
          "Constipacao",
          "Dysentery"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "SP17",
      "names": {
          "pt": "Shidou",
          "en": "Shidou",
          "zh": "食竇"
      },
      "meridian": {
          "code": "SP",
          "pt": "Baço",
          "en": "Spleen"
      },
      "locationText": "In anterior thoracic região, in 5o intercostal space, 6 B-cun lateral à linha mediana anterior. Nota: SP17, ST18, e KI22 are located along curve de 5o intercostal space.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun (不宜深刺)\n- Inserção oblíqua: 0,3 a 0,4 cun",
      "actions": [
          "Rectifies qi",
          "Disinhibits water",
          "Courses triple burner"
      ],
      "indications": [
          "Dor no hipocôndrio",
          "Dor toracica",
          "Hypochondrium fullness",
          "Plenitude torácica"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "SP18",
      "names": {
          "pt": "Tianxi",
          "en": "Tianxi",
          "zh": "天谿"
      },
      "meridian": {
          "code": "SP",
          "pt": "Baço",
          "en": "Spleen"
      },
      "locationText": "In anterior thoracic região, in 4o intercostal space, 6 B-cun lateral à linha mediana anterior. Nota: SP18, ST17, e KI23 are located along curve de 4o intercostal space.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun (不宜深刺)\n- Inserção oblíqua: 0,3 a 0,5 cun",
      "actions": [
          "Loosens chest",
          "Rectifies qi",
          "Downbears counterflow",
          "Suppresses tosse"
      ],
      "indications": [
          "Dor no hipocôndrio",
          "Dor toracica",
          "Hypochondrium fullness",
          "Plenitude torácica",
          "Tosse",
          "Soluço",
          "Mastitis",
          "Insufficient lactation"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "SP19",
      "names": {
          "pt": "Xiongxiang",
          "en": "Xiongxiang",
          "zh": "胸鄕"
      },
      "meridian": {
          "code": "SP",
          "pt": "Baço",
          "en": "Spleen"
      },
      "locationText": "In anterior thoracic região, in 3º intercostal space, 6 B-cun lateral à linha mediana anterior. Nota: SP19, ST16, e KI24 are located along curve de 3º intercostal space.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun (不宜深刺)\n- Inserção oblíqua: 0,3 a 0,5 cun",
      "actions": [
          "Diffuses lung qi",
          "Downbears lung qi",
          "Suppresses tosse",
          "Stabilizes dyspnea"
      ],
      "indications": [
          "Dor no hipocôndrio",
          "Dor toracica",
          "Hypochondrium fullness",
          "Plenitude torácica"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "SP20",
      "names": {
          "pt": "Zhourong",
          "en": "Zhourong",
          "zh": "周榮"
      },
      "meridian": {
          "code": "SP",
          "pt": "Baço",
          "en": "Spleen"
      },
      "locationText": "In anterior thoracic região, in 2º intercostal space, 6 B-cun lateral à linha mediana anterior. Nota: SP20, ST15, e KI25 are located along curve de 2º intercostal space.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,4 cun\n- Inserção oblíqua: 0,3 a 0,5 cun",
      "actions": [
          "Diffuses lung qi",
          "Downbears lung qi",
          "Suppresses tosse",
          "Stabilizes dyspnea"
      ],
      "indications": [
          "Hypochondrium fullness",
          "Plenitude torácica",
          "Tosse",
          "Soluço"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "SP21",
      "names": {
          "pt": "Dabao",
          "en": "Dabao",
          "zh": "大包"
      },
      "meridian": {
          "code": "SP",
          "pt": "Baço",
          "en": "Spleen"
      },
      "locationText": "In lateral thoracic região, in 6o intercostal space, on midaxillary linha.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun (不宜深刺)\n- Inserção oblíqua: 0,3 a 0,4 cun",
      "actions": [
          "Moves blood"
      ],
      "indications": [
          "Dor no hipocôndrio",
          "Dor toracica",
          "Asma",
          "General body weakness",
          "General dor"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "HT1",
      "names": {
          "pt": "Jiquan",
          "en": "Jiquan",
          "zh": "極泉"
      },
      "meridian": {
          "code": "HT",
          "pt": "Coração",
          "en": "Heart"
      },
      "locationText": "In axilla, no centro de axillary fossa, sobre axillary artery.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,5 cun (上em direção a하여 겨드랑이로 em direção a)\n- 혈관, 신경을 찌르지 않도록 주의한다.",
      "actions": [
          "Nourishes heart yin",
          "Clears empty heat"
      ],
      "indications": [
          "Cardiac dor",
          "Costal dor",
          "Scrofula",
          "Arm cold dor",
          "Elbow cold dor",
          "Throat dryness"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "HT2",
      "names": {
          "pt": "Qingling",
          "en": "Qingling",
          "zh": "靑靈"
      },
      "meridian": {
          "code": "HT",
          "pt": "Coração",
          "en": "Heart"
      },
      "locationText": "Na face medial de arm, just medial a biceps brachii muscle, 3 B-cun superior a cubital crease.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun (臂內側에서 外側 em direção a )\n- Inserção oblíqua: 0,5 a 1 cun",
      "actions": [
          "Frees channels",
          "Quickens connecting vessels",
          "Regulates qi",
          "Regulates blood"
      ],
      "indications": [
          "Dor no hipocôndrio",
          "Cardiac dor",
          "Arm dor",
          "Dor no ombro"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "HT3",
      "names": {
          "pt": "Shaohai",
          "en": "Shaohai",
          "zh": "少海"
      },
      "meridian": {
          "code": "HT",
          "pt": "Coração",
          "en": "Heart"
      },
      "locationText": "On anteromedial face de elbow, just anterior a medial epicondyle de humerus, no mesmo nível de cubital crease.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,8 cun\n- Inserção oblíqua: 0,5 a 1 cun",
      "actions": [
          "Removes channel obstructions",
          "Calms mind",
          "Clears heat"
      ],
      "indications": [
          "Cardiac dor",
          "Arm numbness",
          "Hand numbness",
          "Arm spasmodic dor",
          "Hand spasmodic dor",
          "Hand tremor",
          "Scrofula",
          "Dor no hipocôndrio",
          "Axilla dor"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "HT4",
      "names": {
          "pt": "Lingdao",
          "en": "Lingdao",
          "zh": "道"
      },
      "meridian": {
          "code": "HT",
          "pt": "Coração",
          "en": "Heart"
      },
      "locationText": "On anteromedial face de forearm, just radial a flexor carpi ulnaris tendon, 1,5 B-cun proximal à prega palmar do punho.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,5 cun\n- Inserção oblíqua: 0,5 a 0,8 cun",
      "actions": [
          "Removes channel obstructions"
      ],
      "indications": [
          "Cardiac dor",
          "Arm spasmodic dor",
          "Elbow spasmodic dor",
          "Voice sudden loss"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "HT5",
      "names": {
          "pt": "Tongli",
          "en": "Tongli",
          "zh": "通里"
      },
      "meridian": {
          "code": "HT",
          "pt": "Coração",
          "en": "Heart"
      },
      "locationText": "On anteromedial face de forearm, radial a flexor carpi ulnaris tendon, 1 B-cun proximal à prega palmar do punho.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,5 a 1 cun",
      "actions": [
          "Calms mind",
          "Tonifies heart qi",
          "Opens into tongue",
          "Benefits bladder"
      ],
      "indications": [
          "Palpitação",
          "Tontura",
          "Vision blurring",
          "garganta inflamada",
          "Voice sudden loss",
          "Aphasia",
          "Tongue stiffness",
          "Stuttering",
          "Elbow dor",
          "Wrist dor"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "HT6",
      "names": {
          "pt": "Yinxi",
          "en": "Yinxi",
          "zh": "陰郄"
      },
      "meridian": {
          "code": "HT",
          "pt": "Coração",
          "en": "Heart"
      },
      "locationText": "On anteromedial face de firearm, radial a flexor carpi ulnaris tendon, 0,5 B-cun proximal à prega palmar do punho.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,5 a 1 cun",
      "actions": [
          "Nourishes heart yin",
          "Clears heat",
          "Stops sweating",
          "Calms mind"
      ],
      "indications": [
          "Cardiac dor",
          "Hysteria",
          "Night sweat",
          "Hemoptysis",
          "Epistaxis",
          "Voice sudden loss"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "HT8",
      "names": {
          "pt": "Shaofu",
          "en": "Shaofu",
          "zh": "少府"
      },
      "meridian": {
          "code": "HT",
          "pt": "Coração",
          "en": "Heart"
      },
      "locationText": "On palm de hand, na depressão entre fourth e fifth ossos metacarpais, proximal a fifth metacarpophalangeal joint. Nota: no mesmo nível de PC8.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun(鍼尖을 손바닥에서 손등을 em direção a 刺入)\n- Inserção oblíqua: 0,3 a 0,5 cun",
      "actions": [
          "Clears heart fire",
          "Clears empty heat",
          "Clears fleuma fire",
          "Calms mind"
      ],
      "indications": [
          "Palpitação",
          "Dor toracica",
          "Little finger spasmodic dor",
          "Palm feverish sensation",
          "Enuresis",
          "Dysuria",
          "External genitalia pruritus"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "HT9",
      "names": {
          "pt": "Shaochong",
          "en": "Shaochong",
          "zh": "少衝"
      },
      "meridian": {
          "code": "HT",
          "pt": "Coração",
          "en": "Heart"
      },
      "locationText": "On little finger, radial a falange distal, 0.1 F-cun proximal-lateral a radial corner de little fingernail, at intersection de vertical linha de radial border de nail e horizontal linha de base de little fingernail.",
      "needlingText": "- Inserção perpendicular: 0,1 a 0,2 cun\n- Inserção oblíqua: 0,2 a 0,3 cun\n- agulha triangular em direção a puntura para sangria",
      "actions": [
          "Clears heat",
          "Subdues wind",
          "Opens heart orifices",
          "Relieves fullness",
          "Restores consciousness"
      ],
      "indications": [
          "Palpitação",
          "Cardiac dor",
          "Dor no hipocôndrio",
          "Dor toracica",
          "Mania",
          "doença febril",
          "Consciousness loss"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "SI1",
      "names": {
          "pt": "Shaoze",
          "en": "Shaoze",
          "zh": "少澤"
      },
      "meridian": {
          "code": "SI",
          "pt": "Intestino Delgado",
          "en": "Small Intestine"
      },
      "locationText": "On little finger, ulnar a falange distal, 0.1 F-cun proximal-medial a ulnar corner de little fingernail, at intersection de vertical linha de ulnar border de nail e horizontal linha de base de little fingernail.",
      "needlingText": "- Inserção perpendicular: 0,1 a 0,2 cun\n- Inserção oblíqua: 0,2 a 0,3 cun (약간 上em direção a)\n- agulha triangular em direção a puntura para sangria",
      "actions": [
          "Expels wind heat",
          "Subdues wind",
          "Opens orifices",
          "Removes channel obstructions",
          "Promotes lactation"
      ],
      "indications": [
          "Cefaleia",
          "doença febril",
          "Consciousness loss",
          "Insufficient lactation",
          "garganta inflamada",
          "Vermelhidão ocular",
          "Cornea cloudiness"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "SI2",
      "names": {
          "pt": "Qiangu",
          "en": "Qiangu",
          "zh": "前谷"
      },
      "meridian": {
          "code": "SI",
          "pt": "Intestino Delgado",
          "en": "Small Intestine"
      },
      "locationText": "On little finger, na depressão distal a ulnar side de fifth metacarpophalangeal joint, at border entre pele vermelha e branca.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun\n- Inserção oblíqua: 0,3 a 0,5 cun",
      "actions": [
          "Clears heat"
      ],
      "indications": [
          "Finger numbness",
          "doença febril",
          "Zumbido",
          "Cefaleia",
          "Reddish urine"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "SI3",
      "names": {
          "pt": "Houxi",
          "en": "Houxi",
          "zh": "後谿"
      },
      "meridian": {
          "code": "SI",
          "pt": "Intestino Delgado",
          "en": "Small Intestine"
      },
      "locationText": "No dorso da mão, na depressão proximal a ulnar side de fifth metacarpophalangeal joint, at border entre pele vermelha e branca.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1 cun\n- Inserção oblíqua: 0,5 a 2 cun (주먹을 쥐고 中手骨을 ao longo de해 外側에서 前內方 em direção a )\n- 手指痙攣 치료시 合谷을 em direção a 1,5 a 2 cun Inserção transfixante",
      "actions": [
          "Eliminates interior wind",
          "Expels exterior wind",
          "Benefits sinews",
          "Resolves damp",
          "Resolves jaundice",
          "Clears mind"
      ],
      "indications": [
          "Dor cervical",
          "Neck stiffness",
          "Zumbido",
          "surdez",
          "garganta inflamada",
          "Mania",
          "Malaria",
          "Acute lumbar sprain",
          "Night sweat",
          "doença febril",
          "Finger numbness",
          "Finger contracture",
          "Elbow dor",
          "Dor no ombro"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "SI4",
      "names": {
          "pt": "Wangu",
          "en": "Wangu",
          "zh": "腕骨"
      },
      "meridian": {
          "code": "SI",
          "pt": "Intestino Delgado",
          "en": "Small Intestine"
      },
      "locationText": "On posteromedial face de wrist, na depressão entre base de fifth osso metacarpal e triquetrum bone, at border entre pele vermelha e branca.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,5 a 1 cun",
      "actions": [
          "Removes channel obstructions",
          "Eliminates damp heat"
      ],
      "indications": [
          "Febrile diseases with anhidrosis",
          "Cefaleia",
          "Neck stiffness",
          "Finger contracture",
          "Wrist dor",
          "Jaundice"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "SI5",
      "names": {
          "pt": "Yanggu",
          "en": "Yanggu",
          "zh": "陽谷"
      },
      "meridian": {
          "code": "SI",
          "pt": "Intestino Delgado",
          "en": "Small Intestine"
      },
      "locationText": "On posteromedial face de wrist, na depressão entre triquetrum bone e ulnar styloid process.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,4 cun\n- Inserção oblíqua: 0,3 a 0,5 cun",
      "actions": [
          "Clears mind",
          "Removes channel obstructions",
          "Expels exterior damp heat"
      ],
      "indications": [
          "Submandibular region swelling",
          "Neck swelling",
          "Wrist dor",
          "Hand dor",
          "doença febril"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "SI6",
      "names": {
          "pt": "Yanglao",
          "en": "Yanglao",
          "zh": "養老"
      },
      "meridian": {
          "code": "SI",
          "pt": "Intestino Delgado",
          "en": "Small Intestine"
      },
      "locationText": "On posteromedial face de forearm, na depressão radial a head de ulnar bone, 1 B-cun proximal à prega dorsal do punho.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 1 a 1,5 cun (內關(PC6)을 em direção a 刺入)",
      "actions": [
          "Benefits sinews",
          "Brightens eyes",
          "Removes channel obstructions"
      ],
      "indications": [
          "Vision blurring",
          "Dor no ombro",
          "Arm dor",
          "Elbow dor"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "SI7",
      "names": {
          "pt": "Zhizheng",
          "en": "Zhizheng",
          "zh": "支正"
      },
      "meridian": {
          "code": "SI",
          "pt": "Intestino Delgado",
          "en": "Small Intestine"
      },
      "locationText": "On posteromedial face de forearm, entre medial border de ulnar bone e flexor carpi ulnaris muscle, 5 B-cun proximal à prega dorsal do punho.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,3 a 0,5 cun",
      "actions": [
          "Removes channel obstructions",
          "Calms mind"
      ],
      "indications": [
          "Neck stiffness",
          "Cefaleia",
          "Tontura",
          "Finger spasmodic dor",
          "Elbow spasmodic dor",
          "doença febril",
          "Mania"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "SI8",
      "names": {
          "pt": "Xiaohai",
          "en": "Xiaohai",
          "zh": "小海"
      },
      "meridian": {
          "code": "SI",
          "pt": "Intestino Delgado",
          "en": "Small Intestine"
      },
      "locationText": "On posteromedial face de elbow, na depressão entre olecranon e medial epicondyle de humerus bone.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,5 cun\n- Inserção oblíqua: 0,3 a 0,7 cun",
      "actions": [
          "Resolves damp heat",
          "Removes channel obstructions",
          "Calms mind"
      ],
      "indications": [
          "Cefaleia",
          "Cheek swelling",
          "Nape dor",
          "Dor no ombro",
          "Elbow dor",
          "Arm dor",
          "Epilepsy"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "SI9",
      "names": {
          "pt": "Jianzhen",
          "en": "Jianzhen",
          "zh": "肩貞"
      },
      "meridian": {
          "code": "SI",
          "pt": "Intestino Delgado",
          "en": "Small Intestine"
      },
      "locationText": "No ombro girdle, posteroinferior a shoulder joint, 1 B-cun superior a posterior end de axillary fold.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1 cun\n- Inserção oblíqua: 0,5 a 1,5 cun",
      "actions": [
          "Courses wind",
          "Quickens connecting vessels",
          "Dissipates dor",
          "Binds dor",
          "Relieves dor"
      ],
      "indications": [
          "Scapular region dor",
          "Arm motor impairment",
          "Hand motor impairment"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "SI10",
      "names": {
          "pt": "Naoshu",
          "en": "Naoshu",
          "zh": "臑兪"
      },
      "meridian": {
          "code": "SI",
          "pt": "Intestino Delgado",
          "en": "Small Intestine"
      },
      "locationText": "No ombro girdle, superior a posterior end de axillary fold, na depressão inferior a spine de scapula.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1 cun\n- Inserção oblíqua: 1 a 2 cun (약간 前inferiormente em direção a )",
      "actions": [
          "Quickens blood",
          "Frees connecting vessels",
          "Soothes sinews",
          "Dissipates binds"
      ],
      "indications": [
          "Shoulder swelling",
          "Arm weakness",
          "Shoulder weakness",
          "Arm dor",
          "Dor no ombro"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "SI11",
      "names": {
          "pt": "Tianzong",
          "en": "Tianzong",
          "zh": "天宗"
      },
      "meridian": {
          "code": "SI",
          "pt": "Intestino Delgado",
          "en": "Small Intestine"
      },
      "locationText": "In scapular região, na depressão entre upper one third e lower two thirds de linha que conecta midpoint de spine de scapula com inferior angle de scapula.",
      "needlingText": "- Inserção perpendicular: 0,5 cun\n- Inserção oblíqua: 0,5 a 1 cun (주위를 em direção a서)",
      "actions": [
          "Resolves tai yang channel pathogens",
          "Diffuses chest qi stagnation",
          "Diffuses lateral costal region qi stagnation"
      ],
      "indications": [
          "Scapular region dor",
          "Lateroposterior aspect of elbow dor",
          "Lateroposterior aspect of arm dor",
          "Asma"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "SI12",
      "names": {
          "pt": "Bingfeng",
          "en": "Bingfeng",
          "zh": "秉風"
      },
      "meridian": {
          "code": "SI",
          "pt": "Intestino Delgado",
          "en": "Small Intestine"
      },
      "locationText": "In scapular região, in supraspinatous fossa, superior a midpoint de spine de scapula.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,5 a 0,7 cun",
      "actions": [
          "Frees channels",
          "Quickens connecting vessels"
      ],
      "indications": [
          "Scapular region dor",
          "Upper extremity dor",
          "Upper extremity numbness",
          "Arm motor impairment",
          "Shoulder motor impairment"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "SI13",
      "names": {
          "pt": "Quyuan",
          "en": "Quyuan",
          "zh": "曲垣"
      },
      "meridian": {
          "code": "SI",
          "pt": "Intestino Delgado",
          "en": "Small Intestine"
      },
      "locationText": "In scapular região, na depressão superior a medial end de spine de scapula. Nota: SI13 is located no ponto medio de linha que conecta SI10 com spinous process de second thoracic vertebra (T2).",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,5 a 0,8 cun",
      "actions": [
          "Soothes sinews",
          "Quickens blood"
      ],
      "indications": [
          "Scapular region stiffness",
          "Scapular region dor"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "SI14",
      "names": {
          "pt": "Jianwaishu",
          "en": "Jianwaishu",
          "zh": "肩外兪"
      },
      "meridian": {
          "code": "SI",
          "pt": "Intestino Delgado",
          "en": "Small Intestine"
      },
      "locationText": "In upper back região, no mesmo nível de inferior border de spinous process de first thoracic vertebra (T1), 3 B-cun lateral a linha mediana posterior.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,5 a 0,7 cun",
      "actions": [
          "Courses wind",
          "Quickens connecting vessels",
          "Warms channels",
          "Dissipates cold"
      ],
      "indications": [
          "Dor nas costas",
          "Dor no ombro",
          "Neck stiffness",
          "Dor cervical"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "SI15",
      "names": {
          "pt": "Jianzhongshu",
          "en": "Jianzhongshu",
          "zh": "肩中兪"
      },
      "meridian": {
          "code": "SI",
          "pt": "Intestino Delgado",
          "en": "Small Intestine"
      },
      "locationText": "In upper back região, no mesmo nível de inferior border de spinous process de seventh cervical vertebra (C7), 2 B-cun lateral a linha mediana posterior.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,5 a 0,8 cun",
      "actions": [
          "Diffuses lungs",
          "Clears heat",
          "Transforms fleuma",
          "Brightens eyes"
      ],
      "indications": [
          "Tosse",
          "Asma",
          "Dor nas costas",
          "Dor no ombro",
          "Hemoptysis"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "SI16",
      "names": {
          "pt": "Tianchuang",
          "en": "Tianchuang",
          "zh": "天窓"
      },
      "meridian": {
          "code": "SI",
          "pt": "Intestino Delgado",
          "en": "Small Intestine"
      },
      "locationText": "In anterior região de neck, posterior a sternocleidomastoid muscle, no mesmo nível de superior border de thyroid cartilage.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,5 a 0,8 cun",
      "actions": [
          "Dispels wind",
          "Quickens connecting vessels",
          "Quiets spirit",
          "Nourishes heart"
      ],
      "indications": [
          "garganta inflamada",
          "Voice sudden loss",
          "surdez",
          "Zumbido",
          "Dor cervical",
          "Neck stiffness"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "SI17",
      "names": {
          "pt": "Tianrong",
          "en": "Tianrong",
          "zh": "天容"
      },
      "meridian": {
          "code": "SI",
          "pt": "Intestino Delgado",
          "en": "Small Intestine"
      },
      "locationText": "In anterior região de neck, posterior a angle de mandible, na depressão anterior a sternocleidomastoid muscle.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,5 a 1,5 cun (舌根部로 em direção a)",
      "actions": [
          "Resolves damp heat",
          "Expels fire poison",
          "Removes channel obstructions"
      ],
      "indications": [
          "surdez",
          "Zumbido",
          "garganta inflamada",
          "Cheek swelling",
          "Foreigh body sensation in the throat",
          "Goiter"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "SI18",
      "names": {
          "pt": "Quanliao",
          "en": "Quanliao",
          "zh": "顴髎"
      },
      "meridian": {
          "code": "SI",
          "pt": "Intestino Delgado",
          "en": "Small Intestine"
      },
      "locationText": "Na face, inferior a zygomatic bone, na depressão directly inferior a outer canthus de eye.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun\n- Inserção oblíqua: 0,5 a 1 cun (inferiormente em direção a em direção a)\n- contraindicação de agulhamento灸 (『醫學入門』)\n- 刺二分禁灸 (『類經圖翼』)",
      "actions": [
          "Expels wind",
          "Relieves dor"
      ],
      "indications": [
          "Face paralysis",
          "Eyelid twitching",
          "Face dor",
          "Toothache",
          "Cheek swelling",
          "Yellowish sclera"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "SI19",
      "names": {
          "pt": "Tinggong",
          "en": "Tinggong",
          "zh": "聽宮"
      },
      "meridian": {
          "code": "SI",
          "pt": "Intestino Delgado",
          "en": "Small Intestine"
      },
      "locationText": "Na face, na depressão entre anterior border de center de tragus e posterior border de condylar process de mandible.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,5 a 1 cun (입을 벌리고 약간 下部로 향하여)",
      "actions": [
          "Benefits ears"
      ],
      "indications": [
          "surdez",
          "Zumbido",
          "Otorrhea",
          "Mandibular joint motor impairment",
          "Toothache"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "BL1",
      "names": {
          "pt": "Jingming",
          "en": "Jingming",
          "zh": "睛明"
      },
      "meridian": {
          "code": "BL",
          "pt": "Bexiga",
          "en": "Bladder"
      },
      "locationText": "Na face, na depressão entre superomedial parts de inner canthus de eye e medial wall de orbit.",
      "needlingText": "- Inserção perpendicular: 0,1 a 0,3 cun (不宜深刺)\n- Inserção oblíqua: 0,3 a 0,7 cun",
      "actions": [
          "Expels wind",
          "Clears heat",
          "Brightens eyes",
          "Stops dor",
          "Stops itching",
          "Stops lacrimation"
      ],
      "indications": [
          "Vermelhidão ocular",
          "Dor ocular",
          "Eye swelling",
          "Canthus itching",
          "Lacrimation",
          "Night blindness",
          "Color blindess",
          "Vision blurring"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "BL2",
      "names": {
          "pt": "Cuanzhu",
          "en": "Cuanzhu",
          "zh": "攢竹"
      },
      "meridian": {
          "code": "BL",
          "pt": "Bexiga",
          "en": "Bladder"
      },
      "locationText": "Na cabeça, na depressão at medial end de eyebrow.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- agulha triangular em direção a puntura para sangria\n- 眼疾患 치료시 鍼尖을 下em direção a하여 睛明(BL1)이나 外方의 絲竹空(TE23) em direção a 斜Inserção transfixante 0,5 a 1 cun",
      "actions": [
          "Expels wind",
          "Brightens eyes",
          "Soothes liver",
          "Removes channel obstructions",
          "Stops dor"
      ],
      "indications": [
          "Cefaleia",
          "Vision failing",
          "Vision blurring",
          "Supraorbital region dor",
          "Lacrimation",
          "Vermelhidão ocular",
          "Dor ocular",
          "Eye swelling",
          "Eyelid twitching",
          "Glaucoma"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "BL3",
      "names": {
          "pt": "Meichong",
          "en": "Meichong",
          "zh": "眉衝"
      },
      "meridian": {
          "code": "BL",
          "pt": "Bexiga",
          "en": "Bladder"
      },
      "locationText": "Na cabeça, superior a frontal notch, 0,5 B-cun superior a linha anterior do cabelo.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun\n- Inserção oblíqua: 0,3 a 0,5 cun (鍼尖을 superiormente ou 外方 em direção a 향하고 피부를 ao longo de하여 Inserção horizontal)",
      "actions": [
          "Dispels wind",
          "Clears heat",
          "Brightens eyes"
      ],
      "indications": [
          "Cefaleia",
          "Giddiness",
          "Epilepsy",
          "Obstrução nasal"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "BL4",
      "names": {
          "pt": "Qucha",
          "en": "Qucha",
          "zh": "曲差"
      },
      "meridian": {
          "code": "BL",
          "pt": "Bexiga",
          "en": "Bladder"
      },
      "locationText": "Na cabeça, 0,5 B-cun superior a linha anterior do cabelo, 1,5 B-cun lateral à linha mediana anterior.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun\n- Inserção oblíqua(Inserção horizontal): 0,3 a 0,5 cun",
      "actions": [
          "Discharges heat",
          "Opens portals",
          "Clears head",
          "Brightens eyes"
      ],
      "indications": [
          "Cefaleia",
          "Obstrução nasal",
          "Epistaxis",
          "Vision failing",
          "Vision blurring"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "BL5",
      "names": {
          "pt": "Wuchu",
          "en": "Wuchu",
          "zh": "五處"
      },
      "meridian": {
          "code": "BL",
          "pt": "Bexiga",
          "en": "Bladder"
      },
      "locationText": "Na cabeça, 1 B-cun superior a linha anterior do cabelo, 1,5 B-cun lateral à linha mediana anterior. Nota: 0,5 B-cun superior a BL4, no mesmo nível de GV23.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun\n- Inserção oblíqua: 0,3 a 0,5 cun\n- Inserção horizontal時는 鍼尖을 em direção a上 ou em direção a下하여 subcutaneo를 ao longo de하여: 0,3 a 0,5 cun 刺入",
      "actions": [
          "Subdues interior wind",
          "Restores consciousness"
      ],
      "indications": [
          "Cefaleia",
          "Vision blurring",
          "Epilepsy",
          "Convulsion"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "BL6",
      "names": {
          "pt": "Chengguang",
          "en": "Chengguang",
          "zh": "承光"
      },
      "meridian": {
          "code": "BL",
          "pt": "Bexiga",
          "en": "Bladder"
      },
      "locationText": "Na cabeça, 2,5 B-cun superior a linha anterior do cabelo, 1,5 B-cun lateral à linha mediana anterior. Nota: 1,5 B-cun superior a BL5. 2 B-cun superior a BL4.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun\n- Inserção oblíqua: 0,3 a 0,5 cun (ao longo de皮刺)",
      "actions": [
          "Clears heat",
          "Eliminates vexation",
          "Brithens eyes",
          "Opens portals"
      ],
      "indications": [
          "Cefaleia",
          "Vision blurring",
          "Obstrução nasal"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "BL7",
      "names": {
          "pt": "Tongtian",
          "en": "Tongtian",
          "zh": "通天"
      },
      "meridian": {
          "code": "BL",
          "pt": "Bexiga",
          "en": "Bladder"
      },
      "locationText": "Na cabeça, 4 B-cun superior a linha anterior do cabelo, 1,5 B-cun lateral à linha mediana anterior. Nota: Midway entre BL6 e BL8.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun\n- Inserção oblíqua: 0,3 a 0,5 cun (ao longo de皮刺)",
      "actions": [
          "Subdues wind",
          "Clears nose",
          "Brightens eyes",
          "Stops convulsions",
          "Opens orifices"
      ],
      "indications": [
          "Cefaleia",
          "Giddiness",
          "Obstrução nasal",
          "Epistaxis",
          "Rhinorrhea"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "BL8",
      "names": {
          "pt": "Luoque",
          "en": "Luoque",
          "zh": "絡却"
      },
      "meridian": {
          "code": "BL",
          "pt": "Bexiga",
          "en": "Bladder"
      },
      "locationText": "Na cabeça, 5,5 B-cun superior a linha anterior do cabelo, 1,5 B-cun lateral à linha mediana anterior. Nota: 0,5 B-cun posterior e 1,5 B-cun lateral a GV20.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun\n- Inserção oblíqua: 0,3 a 0,5 cun (ao longo de皮刺)",
      "actions": [
          "Dissipates wind",
          "Clears heat",
          "Clears head",
          "Brightens eyes"
      ],
      "indications": [
          "Tontura",
          "Vision blurring",
          "Zumbido",
          "Mania"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "BL9",
      "names": {
          "pt": "Yuzhen",
          "en": "Yuzhen",
          "zh": "玉枕"
      },
      "meridian": {
          "code": "BL",
          "pt": "Bexiga",
          "en": "Bladder"
      },
      "locationText": "Na cabeça, no mesmo nível de superior border de external occipital protuberance, e 1,3 B-cun lateral a linha mediana posterior.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun\n- Inserção oblíqua: 0,3 a 0,5 cun (下로 향하고 피부를 ao longo de하여 刺入)",
      "actions": [
          "Dispels wind",
          "Quickens connecting vessels",
          "Frees portals",
          "Brightens eyes"
      ],
      "indications": [
          "Dor cervical",
          "Cefaleia",
          "Tontura",
          "Ophthalmalgia",
          "Obstrução nasal"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "BL10",
      "names": {
          "pt": "Tianzhu",
          "en": "Tianzhu",
          "zh": "天柱"
      },
      "meridian": {
          "code": "BL",
          "pt": "Bexiga",
          "en": "Bladder"
      },
      "locationText": "In posterior região de neck, no mesmo nível de superior border de spinous process de second cervical vertebra (C2), na depressão lateral a trapezius muscle.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,5 a 1 cun",
      "actions": [
          "Expels wind",
          "Clears brain",
          "Opens orifices",
          "Soothes sinews",
          "Removes channel obstructions",
          "Brightens eyes",
          "Invigorates lower back"
      ],
      "indications": [
          "Cefaleia",
          "Obstrução nasal",
          "garganta inflamada",
          "Neck stiffness",
          "Dor nas costas",
          "Dor no ombro"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "BL11",
      "names": {
          "pt": "Dazhu",
          "en": "Dazhu",
          "zh": "大杼"
      },
      "meridian": {
          "code": "BL",
          "pt": "Bexiga",
          "en": "Bladder"
      },
      "locationText": "In upper back região, no mesmo nível de inferior border de spinous process de first thoracic vertebra (T1), 1,5 B-cun lateral a linha mediana posterior.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,5 a 1 cun (斜inferiormente ou 椎體 方em direção a)",
      "actions": [
          "Nourishes blood",
          "Expels wind",
          "Strengthens bones",
          "Soothes sinews",
          "Releases exterior"
      ],
      "indications": [
          "Cefaleia",
          "Dor nas costas",
          "Dor cervical",
          "Scapular region soreness",
          "Scapular region dor",
          "Tosse",
          "Fever",
          "Neck stiffness"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "BL12",
      "names": {
          "pt": "Fengmen",
          "en": "Fengmen",
          "zh": "風門"
      },
      "meridian": {
          "code": "BL",
          "pt": "Bexiga",
          "en": "Bladder"
      },
      "locationText": "In upper back região, no mesmo nível de inferior border de spinous process de second thoracic vertebra (T2), 1.5 B- cun lateral a linha mediana posterior.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,5 a 1 cun (약간 비스듬히 척추를 em direção a)",
      "actions": [
          "Expels exterior wind",
          "Prevents exterior wind",
          "Releases exterior",
          "Stimulates lung dispersing function",
          "Regulates nutritive qi",
          "Regulates defensive qi"
      ],
      "indications": [
          "Common cold",
          "Tosse",
          "Cefaleia",
          "Fever",
          "Neck stiffness",
          "Backache"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "BL14",
      "names": {
          "pt": "Jueyinshu",
          "en": "Jueyinshu",
          "zh": "厥陰兪"
      },
      "meridian": {
          "code": "BL",
          "pt": "Bexiga",
          "en": "Bladder"
      },
      "locationText": "In upper back região, no mesmo nível de inferior border de spinous process de fourth thoracic vertebra (T4), 1,5 B-cun lateral a linha mediana posterior.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,5 a 1 cun (척추를 em direção a 30° superiormente이나 下斜方 em direção a )",
      "actions": [
          "Regulates heart"
      ],
      "indications": [
          "Tosse",
          "Cardiac dor",
          "Palpitação",
          "Opressão torácica",
          "Vomito"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "BL15",
      "names": {
          "pt": "Xinshu",
          "en": "Xinshu",
          "zh": "心兪"
      },
      "meridian": {
          "code": "BL",
          "pt": "Bexiga",
          "en": "Bladder"
      },
      "locationText": "In upper back região, no mesmo nível de inferior border de spinous process de fifth thoracic vertebra (T5), 1,5 B-cun lateral a linha mediana posterior.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 1,5 cun (척추를 em direção a 30°superiormente이나 斜inferiormente em direção a )\n- Inserção horizontal하여 위에서 아래로 筋層을 뚫고: 1 a 2 cun Inserção transfixante",
      "actions": [
          "Calms mind",
          "Clears heat",
          "Stimulates brain",
          "Invigorates blood",
          "Nourishes heart"
      ],
      "indications": [
          "Cardiac dor",
          "Panic",
          "Memory loss",
          "Palpitação",
          "Tosse",
          "Blood spitting",
          "Nocturnal emission",
          "Night sweat",
          "Mania",
          "Epilepsy"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "BL16",
      "names": {
          "pt": "Dushu",
          "en": "Dushu",
          "zh": "督兪"
      },
      "meridian": {
          "code": "BL",
          "pt": "Bexiga",
          "en": "Bladder"
      },
      "locationText": "In upper back região, level com inferior border de spinous process de sixth thoracic vertebra (T6), 1,5 B-cun lateral a linha mediana posterior.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,5 a 1 cun (척추를 em direção a 30°superiormente이나 斜inferiormente em direção a )\n- Inserção horizontal하여 위에서 아래로 筋層을 뚫고: 1 a 2 cun Inserção transfixante",
      "actions": [
          "Regulates heart",
          "Invigorates blood"
      ],
      "indications": [
          "Cardiac dor",
          "Dor abdominal"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "BL17",
      "names": {
          "pt": "Geshu",
          "en": "Geshu",
          "zh": "膈兪"
      },
      "meridian": {
          "code": "BL",
          "pt": "Bexiga",
          "en": "Bladder"
      },
      "locationText": "In upper back região, no mesmo nível de inferior border de spinous process de seventh thoracic vertebra (T7), 1,5 B-cun lateral a linha mediana posterior. Nota: inferior angle de scapula is no mesmo nível de spinous process de seventh thoracic vertebra.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,5 a 1 cun (척추를 em direção a 30°superiormente이나 斜inferiormente em direção a )\n- Inserção horizontal하여 위에서 아래로 筋層을 뚫고: 1 a 2 cun Inserção transfixante",
      "actions": [
          "Nourishes blood",
          "Invigorates blood",
          "Opens chest",
          "Removes diaphragm obstructions",
          "Tonifies qi",
          "Tonifies blood",
          "Clears heat",
          "Calms mind",
          "Pacifies stomach qi"
      ],
      "indications": [
          "Vomito",
          "Soluço",
          "Belching",
          "Swallow difficulty",
          "Asma",
          "Tosse",
          "Blood spitting",
          "Afternoon fever",
          "Night sweat",
          "Measles"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "BL18",
      "names": {
          "pt": "Ganshu",
          "en": "Ganshu",
          "zh": "肝兪"
      },
      "meridian": {
          "code": "BL",
          "pt": "Bexiga",
          "en": "Bladder"
      },
      "locationText": "In upper back região, no mesmo nível de inferior border de spinous process de ninth thoracic vertebra (T9), 1,5 B-cun lateral a linha mediana posterior.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,5 a 1 cun (척추를 em direção a 30°superiormente이나 斜inferiormente em direção a )\n- Inserção horizontal하여 위에서 아래로 筋層을 뚫고: 1 a 2 cun Inserção transfixante",
      "actions": [
          "Benefits liver",
          "Benefits gallbladder",
          "Resolves damp heat",
          "Moves stagnant qi",
          "Benefits eyes",
          "Eliminates wind"
      ],
      "indications": [
          "Jaundice",
          "Dor no hipocôndrio",
          "Vermelhidão ocular",
          "Vision blurring",
          "Night blindness",
          "Mental disorder",
          "Epilepsy",
          "Backache",
          "Blood spitting",
          "Epistaxis"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "BL19",
      "names": {
          "pt": "Danshu",
          "en": "Danshu",
          "zh": "膽兪"
      },
      "meridian": {
          "code": "BL",
          "pt": "Bexiga",
          "en": "Bladder"
      },
      "locationText": "In upper back região, no mesmo nível de inferior border de spinous process de tenth thoracic vertebra (T10), 1,5 B-cun lateral a linha mediana posterior.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,3 a 1 cun (척추를 em direção a 30°superiormente이나 斜inferiormente em direção a )\n- Inserção horizontal하여 위에서 아래로 筋層을 뚫고: 1 a 2 cun Inserção transfixante",
      "actions": [
          "Resolves liver damp heat",
          "Resolves gallbladder damp heat",
          "Pacifies stomach",
          "Relaxes diaphragm"
      ],
      "indications": [
          "Jaundice",
          "Mouth bitter taste",
          "Dor no hipocôndrio",
          "Dor toracica",
          "Pulmonary tuberculosis",
          "Afternoon fever"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "BL21",
      "names": {
          "pt": "Weishu",
          "en": "Weishu",
          "zh": "胃兪"
      },
      "meridian": {
          "code": "BL",
          "pt": "Bexiga",
          "en": "Bladder"
      },
      "locationText": "In upper back região, no mesmo nível de inferior border de spinous process de 12º thoracic vertebra (T12), 1,5 B-cun lateral a linha mediana posterior.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,5 a 1 cun (척추를 em direção a 30°superiormente이나 斜inferiormente em direção a )\n- Inserção horizontal하여 위에서 아래로 筋層을 뚫고: 1 a 2 cun Inserção transfixante",
      "actions": [
          "Regulates stomach qi",
          "Tonifies stomach qi",
          "Resolves damp",
          "Pacifies stomach",
          "Relieves food retention"
      ],
      "indications": [
          "Epigastric dor",
          "Dor no hipocôndrio",
          "Dor toracica",
          "Anorexia",
          "distensão abdominal",
          "Borborigmo",
          "Diarreia",
          "Nausea",
          "Vomito"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "BL22",
      "names": {
          "pt": "Sanjiaoshu",
          "en": "Sanjiaoshu",
          "zh": "三焦兪"
      },
      "meridian": {
          "code": "BL",
          "pt": "Bexiga",
          "en": "Bladder"
      },
      "locationText": "In lumbar região, no mesmo nível de inferior border de spinous process de first lumbar vertebra (L1), 1,5 B-cun lateral a linha mediana posterior.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,5 a 1 cun (척추를 em direção a 30°superiormente이나 斜inferiormente em direção a )\n- Inserção horizontal하여 위에서 아래로 筋層을 뚫고: 1 a 2 cun Inserção transfixante",
      "actions": [
          "Resolves damp",
          "Opens water passages",
          "Regulates fluid transformation"
      ],
      "indications": [
          "Borborigmo",
          "distensão abdominal",
          "Indigestion",
          "Vomito",
          "Diarreia",
          "Dysentery",
          "Edema",
          "Low back stiffness",
          "Dor lombar"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "BL24",
      "names": {
          "pt": "Qihaishu",
          "en": "Qihaishu",
          "zh": "氣海兪"
      },
      "meridian": {
          "code": "BL",
          "pt": "Bexiga",
          "en": "Bladder"
      },
      "locationText": "In lumbar região, no mesmo nível de inferior border de spinous process de third lumbar vertebra (L3), 1,5 B-cun lateral a linha mediana posterior.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,5 a 1 cun (척추를 em direção a 30°superiormente이나 斜inferiormente em direção a )",
      "actions": [
          "Strengthens lower back",
          "Removes channel obstructions",
          "Regulates qi",
          "Regulates blood"
      ],
      "indications": [
          "Dor lombar",
          "menstruação irregular",
          "Dismenorreia",
          "Asma"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "BL25",
      "names": {
          "pt": "Dachangshu",
          "en": "Dachangshu",
          "zh": "大腸兪"
      },
      "meridian": {
          "code": "BL",
          "pt": "Bexiga",
          "en": "Bladder"
      },
      "locationText": "In lumbar região, no mesmo nível de inferior border de spinous process de fourth lumbar vertebra (L4), 1,5 B-cun lateral a linha mediana posterior.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1 cun\n- 1 a 2 cun (坐骨神經痛 치료시는 약간 外斜方 em direção a )\n- 薦腸關節炎에는 鍼尖을 下em direção a하여 小腸兪(BL27)로 Inserção transfixante",
      "actions": [
          "Promotes large intestine function",
          "Strengthens lower back",
          "Removes channel obstructions",
          "Relieves fullness",
          "Relieves swelling"
      ],
      "indications": [
          "Dor lombar",
          "Borborigmo",
          "distensão abdominal",
          "Diarreia",
          "Constipacao",
          "Dor",
          "Muscular atrophy",
          "Low extremity motor impairment",
          "Low extremity numbness",
          "Sciatica"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "BL26",
      "names": {
          "pt": "Guanyuanshu",
          "en": "Guanyuanshu",
          "zh": "關元兪"
      },
      "meridian": {
          "code": "BL",
          "pt": "Bexiga",
          "en": "Bladder"
      },
      "locationText": "In lumbar região, no mesmo nível de inferior border de spinous process de fifth lumbar vertebra (L5), 1,5 B-cun lateral a linha mediana posterior.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1 cun\n- Inserção oblíqua: 1 a 2 cun",
      "actions": [
          "Strengthens lower back",
          "Removes channel obstructions"
      ],
      "indications": [
          "Dor lombar",
          "distensão abdominal",
          "Diarreia",
          "Enuresis",
          "Sciatica",
          "Frequent urination"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "BL27",
      "names": {
          "pt": "Xiaochangshu",
          "en": "Xiaochangshu",
          "zh": "小腸兪"
      },
      "meridian": {
          "code": "BL",
          "pt": "Bexiga",
          "en": "Bladder"
      },
      "locationText": "In sacral região, no mesmo nível de first posterior sacral foramen, e 1,5 B-cun lateral a median sacral crest. Nota: no mesmo nível de BL31.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1 cun\n- Inserção oblíqua: 1 a 1,5 cun (薦腸關節尖이나 여자 생식기질환 치료시는 1 a 2 cun)",
      "actions": [
          "Promotes small intestine function",
          "Resolves damp",
          "Clears heat",
          "Benefits urination"
      ],
      "indications": [
          "Distension",
          "Lower abdominal dor",
          "Dysentery",
          "Nocturnal emission",
          "Hematuria",
          "Enuresis",
          "Morbid leukorrhea",
          "Lower back dor",
          "Sciatica"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "BL28",
      "names": {
          "pt": "Pangguangshu",
          "en": "Pangguangshu",
          "zh": "膀胱兪"
      },
      "meridian": {
          "code": "BL",
          "pt": "Bexiga",
          "en": "Bladder"
      },
      "locationText": "In sacral região, no mesmo nível de second posterior sacral foramen, e 1,5 B-cun lateral a median sacral crest. Nota: no mesmo nível de BL32.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1 cun\n- Inserção oblíqua: 1 a 1,5 cun",
      "actions": [
          "Regulates bladder",
          "Resolves damp",
          "Clears heat",
          "Stops dor",
          "Eliminates stagnation",
          "Opens lower burner water passages",
          "Strengthens loins"
      ],
      "indications": [
          "Urine retention",
          "Enuresis",
          "Frequent urination",
          "Diarreia",
          "Constipacao",
          "Dor lombar",
          "Low back stiffness"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "BL29",
      "names": {
          "pt": "Zhonglushu",
          "en": "Zhonglushu",
          "zh": "中膂兪"
      },
      "meridian": {
          "code": "BL",
          "pt": "Bexiga",
          "en": "Bladder"
      },
      "locationText": "In sacral região, no mesmo nível de third posterior sacral foramen, 1,5 B-cun lateral a median sacral crest. Nota: no mesmo nível de BL33.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1 cun\n- Inserção oblíqua: 0,7 a 1 cun",
      "actions": [
          "Strengthens lumbar spine",
          "Warms yang",
          "Dissipates cold"
      ],
      "indications": [
          "Dysentery",
          "Hernia",
          "Dor lombar",
          "Low back stiffness"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "BL30",
      "names": {
          "pt": "Baihuanshu",
          "en": "Baihuanshu",
          "zh": "白環兪"
      },
      "meridian": {
          "code": "BL",
          "pt": "Bexiga",
          "en": "Bladder"
      },
      "locationText": "In sacral região, no mesmo nível de fourth posterior sacral foramen, 1,5 B-cun lateral a median sacral crest. Nota: 1,5 B-cun lateral a sacral hiatus, no mesmo nível de BL34.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1 cun\n- Inserção oblíqua: 0,7 a 1 cun",
      "actions": [
          "Warms yang",
          "Regulates menses",
          "Courses channels",
          "Rectifies lower burner"
      ],
      "indications": [
          "Enuresis",
          "Dor due to hernia",
          "Morbid leukorrhea",
          "menstruação irregular",
          "Dysuria",
          "Cold sensation",
          "Dor lombar",
          "Constipacao",
          "Tenesmus",
          "Rectum prolapse"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "BL31",
      "names": {
          "pt": "Shangliao",
          "en": "Shangliao",
          "zh": "上髎"
      },
      "meridian": {
          "code": "BL",
          "pt": "Bexiga",
          "en": "Bladder"
      },
      "locationText": "In sacral região, in first posterior sacral foramen.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1,2 cun (刺入仙骨後孔內)",
      "actions": [
          "Regulates lower burner",
          "Tonifies elumbar region",
          "Tonifies knees",
          "Nourishes kidneys"
      ],
      "indications": [
          "Dor lombar",
          "Dysuria",
          "Constipacao",
          "menstruação irregular",
          "Morbid leukorrhea",
          "Uterus prolapse"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "BL32",
      "names": {
          "pt": "Ciliao",
          "en": "Ciliao",
          "zh": "次髎"
      },
      "meridian": {
          "code": "BL",
          "pt": "Bexiga",
          "en": "Bladder"
      },
      "locationText": "In sacral região, in second posterior sacral foramen.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1 cun (刺入仙骨後孔內)",
      "actions": [
          "Regulates lower burner",
          "Tonifies lumbar region",
          "Tonifies knees",
          "Nourishes kidneys"
      ],
      "indications": [
          "Dor lombar",
          "Hernia",
          "menstruação irregular",
          "Leukorrhea",
          "Dismenorreia",
          "Nocturnal emission",
          "Impotence",
          "Enuresis",
          "Dysuria",
          "Muscular atrophy",
          "Dor",
          "Low extremity motor impairment",
          "Low extremity numbness"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "BL33",
      "names": {
          "pt": "Zhongliao",
          "en": "Zhongliao",
          "zh": "中髎"
      },
      "meridian": {
          "code": "BL",
          "pt": "Bexiga",
          "en": "Bladder"
      },
      "locationText": "In sacral região, in third posterior sacral foramen.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1 cun (刺入仙骨後孔內)",
      "actions": [
          "Regulates lower burner",
          "Tonifies lumbar region",
          "Tonifies knees",
          "Nourishes kidneys"
      ],
      "indications": [
          "Dor lombar",
          "Constipacao",
          "Diarreia",
          "Dysuria",
          "menstruação irregular",
          "Morbid leukorrhea"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "BL34",
      "names": {
          "pt": "Xialiao",
          "en": "Xialiao",
          "zh": "下髎"
      },
      "meridian": {
          "code": "BL",
          "pt": "Bexiga",
          "en": "Bladder"
      },
      "locationText": "In sacral região, in fourth posterior sacral foramen.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1 cun (刺入仙骨後孔內)",
      "actions": [
          "Regulates lower burner",
          "Tonifies lumbar region",
          "Tonifies knees",
          "Nourishes kidneys"
      ],
      "indications": [
          "Dor lombar",
          "Lower abdominal dor",
          "Dysuria",
          "Constipacao",
          "Morbid leukorrhea"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "BL35",
      "names": {
          "pt": "Huiyang",
          "en": "Huiyang",
          "zh": "會陽"
      },
      "meridian": {
          "code": "BL",
          "pt": "Bexiga",
          "en": "Bladder"
      },
      "locationText": "In buttock região, 0,5 B-cun lateral a extremity de coccyx.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,8 cun",
      "actions": [
          "Clears lower burner damp heat",
          "Discharges lower burner damp heat"
      ],
      "indications": [
          "Dysentery",
          "Bloody stool",
          "Diarreia",
          "Hemorrhoids",
          "Impotence",
          "Morbid leukorrhea"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "BL36",
      "names": {
          "pt": "Chengfu",
          "en": "Chengfu",
          "zh": "承扶"
      },
      "meridian": {
          "code": "BL",
          "pt": "Bexiga",
          "en": "Bladder"
      },
      "locationText": "In buttock região, no ponto medio de gluteal fold.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1,5 cun",
      "actions": [
          "Soothes sinews",
          "Quickens connecting vessels"
      ],
      "indications": [
          "Gluteal dor",
          "Dor lombar",
          "Constipacao",
          "Muscular atrophy",
          "Dor",
          "Low extremity motor impairment",
          "Low extremity numbness"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "BL37",
      "names": {
          "pt": "Yinmen",
          "en": "Yinmen",
          "zh": "殷門"
      },
      "meridian": {
          "code": "BL",
          "pt": "Bexiga",
          "en": "Bladder"
      },
      "locationText": "Na face posterior de thigh, entre biceps femoris e semitendinosus muscles, 6 B-cun inferior a gluteal fold.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1,5 cun\n- Inserção oblíqua: 1 a 2 cun",
      "actions": [
          "Strengthens lumbar spine",
          "Soothes sinews",
          "Quickens connecting vessels",
          "Relieves dor"
      ],
      "indications": [
          "Thigh dor",
          "Dor lombar",
          "Muscular atrophy",
          "Low extremity dor",
          "Low extremity motor impairment",
          "Low extremity numbness",
          "Hemiplegia"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "BL38",
      "names": {
          "pt": "Fuxi",
          "en": "Fuxi",
          "zh": "浮郄"
      },
      "meridian": {
          "code": "BL",
          "pt": "Bexiga",
          "en": "Bladder"
      },
      "locationText": "Na face posterior de knee, just medial a biceps femoris tendon, 1 B-cun proximal a popliteal crease.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1 cun\n- Inserção oblíqua: 1 a 2 cun",
      "actions": [
          "Soothes sinews",
          "Quickens connecting vessels",
          "Quickens blood",
          "Relieves dor",
          "Clears lower burner",
          "Disinhibits lower burner"
      ],
      "indications": [
          "Femoral region numbness",
          "Gluteal numbness",
          "Contracture of tendon in popliteal fossa"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "BL39",
      "names": {
          "pt": "Weiyang",
          "en": "Weiyang",
          "zh": "委陽"
      },
      "meridian": {
          "code": "BL",
          "pt": "Bexiga",
          "en": "Bladder"
      },
      "locationText": "On posterolateral face de knee, just medial a biceps femoris tendon in popliteal crease. Nota: biceps femoris tendon is more prominent when knee is slightly flexed.",
      "needlingText": "- Inserção perpendicular: 0,3 a 1 cun\n- Inserção oblíqua: 1 a 2 cun",
      "actions": [
          "Opens lower burner water passages",
          "Stimulates fluid transformation",
          "Stimulates fluids excretion",
          "Benefits bladder"
      ],
      "indications": [
          "Dor lombar",
          "Low back stiffness",
          "Low abdomen fullness",
          "Low abdomen distension",
          "Edema",
          "Dysuria",
          "Foot cramp",
          "Leg cramp"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "BL40",
      "names": {
          "pt": "Weizhong",
          "en": "Weizhong",
          "zh": "委中"
      },
      "meridian": {
          "code": "BL",
          "pt": "Bexiga",
          "en": "Bladder"
      },
      "locationText": "Na face posterior de knee, no ponto medio de popliteal crease.",
      "needlingText": "- Inserção perpendicular: 0,6 a 1,5 cun\n- 急性腰部 捻挫時에는 agulha triangular em direção a puntura para sangria",
      "actions": [
          "Clears heat",
          "Resolves damp",
          "Relaxes sinews",
          "Removes channel obstructions",
          "Cools blood",
          "Eliminates blood stasis",
          "Clears summer heat"
      ],
      "indications": [
          "Dor lombar",
          "Hip joint motor impairment",
          "Contracture of tendon in popliteal fossa",
          "Muscular atrophy",
          "Low extremity dor",
          "Low extremity motor impairment",
          "Low extremity numbness",
          "Hemiplegia",
          "Dor abdominal",
          "Vomito",
          "Diarreia",
          "Erysipelas"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "BL41",
      "names": {
          "pt": "Fufen",
          "en": "Fufen",
          "zh": "附分"
      },
      "meridian": {
          "code": "BL",
          "pt": "Bexiga",
          "en": "Bladder"
      },
      "locationText": "In upper back região, no mesmo nível de inferior border de spinous process de second thoracic vertebra (T2), 3 B-cun lateral a linha mediana posterior. Nota: BL41 e BL12 are located no mesmo nível de inferior border de spinous process de second thoracic vertebra (T2).",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,5 a 0,8 cun (下斜方)",
      "actions": [
          "Courses wind",
          "Dissipates cold",
          "Soothes sinews",
          "Quickens connecting vessels"
      ],
      "indications": [
          "Dor no ombro",
          "Shoulder stiffness",
          "Neck stiffness",
          "Dor cervical",
          "Back stiffness",
          "Dor nas costas",
          "Arm numbness",
          "Elbow numbness"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "BL42",
      "names": {
          "pt": "Pohu",
          "en": "Pohu",
          "zh": "魄戶"
      },
      "meridian": {
          "code": "BL",
          "pt": "Bexiga",
          "en": "Bladder"
      },
      "locationText": "In upper back região, no mesmo nível de inferior border de spinous process de third thoracic vertebra (T3), 3 B-cun lateral a linha mediana posterior. Nota: BL42, BL13 e GV12 are located no mesmo nível de inferior border de third thoracic vertebra (T3).",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,5 a 1 cun (下斜方)",
      "actions": [
          "Stimulates lung qi descending",
          "Regulates qi",
          "Clears heat",
          "Stops tosse",
          "Stops asma",
          "Subdues rebellious qi"
      ],
      "indications": [
          "Pulmonary tuberculosis",
          "Hemoptysis",
          "Tosse",
          "Asma",
          "Neck stiffness",
          "Dor nas costas",
          "Dor no ombro"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "BL43",
      "names": {
          "pt": "Gaohuang",
          "en": "Gaohuang",
          "zh": "膏肓"
      },
      "meridian": {
          "code": "BL",
          "pt": "Bexiga",
          "en": "Bladder"
      },
      "locationText": "In upper back região, no mesmo nível de inferior border de spinous process de fourth thoracic vertebra (T4), 3 B-cun lateral a linha mediana posterior. Nota: BL43 e BL14 are located no mesmo nível de inferior border de spinous process de fourth thoracic vertebra (T4).",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,3 a 0,8 cun (背側에서 前外傍을 향하거나 肩胛骨下를 em direção a 자입)\n- 不宜深刺",
      "actions": [
          "Tonifies qi",
          "Strengthens deficiency",
          "Nourishes essence",
          "Nourishes lung yin",
          "Invigorates mind",
          "Stops tosse",
          "Calms asma"
      ],
      "indications": [
          "Pulmonary tuberculosis",
          "Tosse",
          "Asma",
          "Blood spitting",
          "Night sweat",
          "Poor memory",
          "Nocturnal emission"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "BL44",
      "names": {
          "pt": "Shentang",
          "en": "Shentang",
          "zh": "神堂"
      },
      "meridian": {
          "code": "BL",
          "pt": "Bexiga",
          "en": "Bladder"
      },
      "locationText": "In upper back região, no mesmo nível de inferior border de spinous process de fifth thoracic vertebra (T5), 3 B-cun lateral a linha mediana posterior. Nota: BL44, BL15 e GV11 are located no mesmo nível de inferior border de spinous process de fifth thoracic vertebra (T5).",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,5 a 0,8 cun (em direção a外Inserção oblíqua)",
      "actions": [
          "Loosens chest",
          "Rectifies qi",
          "Suppresses tosse",
          "Stabilizes dyspnea",
          "Soothes sinews",
          "Quickens connecting vessels"
      ],
      "indications": [
          "Asma",
          "Cardiac dor",
          "Palpitação",
          "Opressão torácica",
          "Tosse",
          "Dor nas costas",
          "Back stiffness"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "BL45",
      "names": {
          "pt": "Yixi",
          "en": "Yixi",
          "zh": "譩譆"
      },
      "meridian": {
          "code": "BL",
          "pt": "Bexiga",
          "en": "Bladder"
      },
      "locationText": "In upper back região, no mesmo nível de inferior border de spinous process de sixth thoracic vertebra (T6), 3 B-cun lateral a linha mediana posterior. Nota: BL45, BL16 e GV10 are located no mesmo nível de inferior border de spinous process de sixth thoracic vertebra (T6).",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,5 a 1 cun (em direção a外Inserção oblíqua)",
      "actions": [
          "Resolves exterior",
          "Clears heat",
          "Diffuses lungs",
          "Rectifies qi",
          "Frees channels",
          "Quickens connecting vessels"
      ],
      "indications": [
          "Tosse",
          "Asma",
          "Dor nas costas",
          "Dor no ombro"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "BL46",
      "names": {
          "pt": "Geguan",
          "en": "Geguan",
          "zh": "膈關"
      },
      "meridian": {
          "code": "BL",
          "pt": "Bexiga",
          "en": "Bladder"
      },
      "locationText": "In upper back região, no mesmo nível de inferior border de spinous process de seventh thoracic vertebra (T7), 3 B-cun lateral a linha mediana posterior. Nota: BL 46, BL17 e GV9 are located no mesmo nível de inferior border de spinous process de seventh thoracic vertebra (T7).",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,5 a 0,8 cun (em direção a下Inserção oblíqua)",
      "actions": [
          "Stops dysphagia",
          "Stops hiccups",
          "Stops vômito",
          "Stops belching",
          "Relieves back dor",
          "Relieves back stiffness"
      ],
      "indications": [
          "Dysphagia",
          "Soluço",
          "Vomito",
          "Belching",
          "Back stiffness",
          "Dor nas costas"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "BL47",
      "names": {
          "pt": "Hunmen",
          "en": "Hunmen",
          "zh": "魂門"
      },
      "meridian": {
          "code": "BL",
          "pt": "Bexiga",
          "en": "Bladder"
      },
      "locationText": "In upper back região, no mesmo nível de inferior border de spinous process de ninth thoracic vertebra (T9), 3 B-cun lateral a linha mediana posterior. Nota: BL47, BL18 e GV8 are located no mesmo nível de inferior border de spinous process de ninth thoracic vertebra (T9).",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,5 a 1 cun (em direção a下Inserção oblíqua)",
      "actions": [
          "Regulates liver qi",
          "Roots ethereal soul"
      ],
      "indications": [
          "Dor no hipocôndrio",
          "Dor toracica",
          "Dor nas costas",
          "Vomito",
          "Diarreia"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "BL48",
      "names": {
          "pt": "Yanggang",
          "en": "Yanggang",
          "zh": "陽綱"
      },
      "meridian": {
          "code": "BL",
          "pt": "Bexiga",
          "en": "Bladder"
      },
      "locationText": "In upper back região, no mesmo nível de inferior border de spinous process de tenth thoracic vertebra (T10), 3 B-cun lateral a linha mediana posterior. Nota: BL48, BL19 e GV7 are located no mesmo nível de inferior border de spinous process de tenth thoracic vertebra (T10).",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,5 a 1 cun (em direção a下Inserção oblíqua)",
      "actions": [
          "Clears gallbladder",
          "Clears stomach",
          "Transforms damp heat"
      ],
      "indications": [
          "Borborigmo",
          "Dor abdominal",
          "Diarreia",
          "Dor no hipocôndrio",
          "Jaundice"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "BL49",
      "names": {
          "pt": "Yishe",
          "en": "Yishe",
          "zh": "意舍"
      },
      "meridian": {
          "code": "BL",
          "pt": "Bexiga",
          "en": "Bladder"
      },
      "locationText": "In upper back região, no mesmo nível de inferior border de spinous process de 11º thoracic vertebra (T11), 3 B-cun lateral a linha mediana posterior. Nota: BL49, BL20 e GV6 are located no mesmo nível de inferior border de spinous process de 11º thoracic vertebra (T11).",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,5 a 1 cun (em direção a下Inserção oblíqua)",
      "actions": [
          "Tonifies spleen",
          "Stimulates memory",
          "Stimulates concentration"
      ],
      "indications": [
          "distensão abdominal",
          "Borborigmo",
          "Vomito",
          "Diarreia",
          "Swallow difficulty"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "BL50",
      "names": {
          "pt": "Weicang",
          "en": "Weicang",
          "zh": "胃倉"
      },
      "meridian": {
          "code": "BL",
          "pt": "Bexiga",
          "en": "Bladder"
      },
      "locationText": "In upper back região, no mesmo nível de inferior border de spinous process de 12º thoracic vertebra (T12), 3 B-cun lateral a linha mediana posterior. Nota: BL50 e BL21 are located no mesmo nível de inferior border de spinous process de 12º thoracic vertebra (T12).",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,6 cun\n- Inserção oblíqua: 0,5 a 1 cun (em direção a下Inserção oblíqua)",
      "actions": [
          "Harmonizes stomach",
          "Transforms damp",
          "Rectifies qi",
          "Disinhibits center"
      ],
      "indications": [
          "distensão abdominal",
          "Dor nas costas",
          "Epigastric dor",
          "Infantile indigestion"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "BL51",
      "names": {
          "pt": "Huangmen",
          "en": "Huangmen",
          "zh": "肓門"
      },
      "meridian": {
          "code": "BL",
          "pt": "Bexiga",
          "en": "Bladder"
      },
      "locationText": "In lumbar região, no mesmo nível de inferior border de spinous process de first lumbar vertebra (L1), 3 B-cun lateral a linha mediana posterior. Nota: BL51, BL22 e GV5 are located no mesmo nível de inferior border de spinous process de first lumbar vertebra (L1).",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,6 cun\n- Inserção oblíqua: 1 a 1,5 cun\n- 內部에 腎臟이 있으므로 禁深刺",
      "actions": [
          "Regulates triple burner",
          "Ensures smooth triple burner qi spread"
      ],
      "indications": [
          "Dor abdominal",
          "Constipacao",
          "Abdominal mass"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "BL52",
      "names": {
          "pt": "Zhishi",
          "en": "Zhishi",
          "zh": "志室"
      },
      "meridian": {
          "code": "BL",
          "pt": "Bexiga",
          "en": "Bladder"
      },
      "locationText": "In lumbar região, no mesmo nível de inferior border de spinous process de second lumbar vertebra (L2), 3 B-cun lateral a linha mediana posterior. Nota: BL52, BL23 e GV4 are located no mesmo nível de inferior border de spinous process de second lumbar vertebra (L2).",
      "needlingText": "- Inserção perpendicular: 0,5 a 1 cun (禁深刺)\n- Inserção oblíqua: 1 a 2 cun",
      "actions": [
          "Tonifies kidney",
          "Strengthens back",
          "Reinforces will power"
      ],
      "indications": [
          "Nocturnal emission",
          "Impotence",
          "Enuresis",
          "Frequent urination",
          "Dysuria",
          "menstruação irregular",
          "Dor no joelho",
          "Dor nas costas",
          "Edema"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "BL53",
      "names": {
          "pt": "Baohuang",
          "en": "Baohuang",
          "zh": "胞肓"
      },
      "meridian": {
          "code": "BL",
          "pt": "Bexiga",
          "en": "Bladder"
      },
      "locationText": "In buttock região, no mesmo nível de second posterior sacral foramen, 3 B-cun lateral a median sacral crest. Nota: BL53, BL28 e BL32 are located no mesmo nível de second posterior sacral foramen.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1,5 cun\n- Inserção oblíqua: 1 a 2 cun",
      "actions": [
          "Opens lower burner water passages",
          "Stimulates fluids transformation",
          "Stimulates fluids excretion"
      ],
      "indications": [
          "Borborigmo",
          "distensão abdominal",
          "Dor lombar",
          "Anuria"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "BL54",
      "names": {
          "pt": "Zhibian",
          "en": "Zhibian",
          "zh": "秩邊"
      },
      "meridian": {
          "code": "BL",
          "pt": "Bexiga",
          "en": "Bladder"
      },
      "locationText": "In buttock região, no mesmo nível de fourth posterior sacral foramen, 3 B-cun lateral a median sacral crest.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1,5 cun\n- Inserção oblíqua: 2 a 3 cun\n- 생식기질환 치료시는 내측을 em direção a 45°의 각도로 2 a 3 cun 刺入\n- 肛門疾患 치료시는 內inferiormente em direção a 약 45°의 각도로 2 a 3 cun 刺入",
      "actions": [
          "Relaxes sinews",
          "Invigorates blood",
          "Clears heat",
          "Removes channel obstructions"
      ],
      "indications": [
          "Lumbosacral region dor",
          "Muscular atrophy",
          "Low extremity motor impairment",
          "Dysuria",
          "Swelling around external genitalia",
          "Hemorrhoids",
          "Constipacao",
          "Beriberi"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "BL55",
      "names": {
          "pt": "Heyang",
          "en": "Heyang",
          "zh": "合陽"
      },
      "meridian": {
          "code": "BL",
          "pt": "Bexiga",
          "en": "Bladder"
      },
      "locationText": "Na face posterior de leg, entre lateral head e medial head de gastrocnemius muscle, 2 B-cun distal a popliteal crease.",
      "needlingText": "- 0,5 a 1 cun Inserção perpendicular\n- Inserção oblíqua: 1 a 2 cun",
      "actions": [
          "Strengthens lumbus",
          "Boosts kidney",
          "Soothes sinews",
          "Quickens connecting vessels",
          "Regulates penetrating vessels",
          "Regulates conception vessels"
      ],
      "indications": [
          "Dor lombar",
          "Low extremity paralysis",
          "Low extremity dor"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "BL56",
      "names": {
          "pt": "Chengjin",
          "en": "Chengjin",
          "zh": "承筋"
      },
      "meridian": {
          "code": "BL",
          "pt": "Bexiga",
          "en": "Bladder"
      },
      "locationText": "Na face posterior de leg, entre two muscle bellies de gastrocnemius muscle, 5 B-cun distal a popliteal crease. Nota: Midway entre BL55 e BL57.",
      "needlingText": "- 0,3 a 1 cun Inserção perpendicular\n- 「鍼灸大成」에는 contraindicação de agulhamento em direção a 되어있으니 신중히 자침.",
      "actions": [
          "Soothes sinews",
          "Quickens connecting vessels"
      ],
      "indications": [
          "Muscle gastrocnemius spasm",
          "Hemorrhoids",
          "Acute low back dor"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "BL57",
      "names": {
          "pt": "Chengshan",
          "en": "Chengshan",
          "zh": "承山"
      },
      "meridian": {
          "code": "BL",
          "pt": "Bexiga",
          "en": "Bladder"
      },
      "locationText": "Na face posterior de leg, at connecting point de calcaneal tendon com two muscle bellies de gastrocnemius muscle.",
      "needlingText": "- 0,5 a 1,5 cun Inserção perpendicular\n- Inserção oblíqua: 1 a 2 cun",
      "actions": [
          "Relaxes sinews",
          "Invigorates blood",
          "Clears heat",
          "Removes channel obstructions"
      ],
      "indications": [
          "Dor lombar",
          "Gastrocnemius spasm",
          "Hemorrhoids",
          "Constipacao",
          "Beriberi"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "BL58",
      "names": {
          "pt": "Feiyang",
          "en": "Feiyang",
          "zh": "飛揚"
      },
      "meridian": {
          "code": "BL",
          "pt": "Bexiga",
          "en": "Bladder"
      },
      "locationText": "On posterolateral face de leg, entre inferior border de lateral head de gastrocnemius muscle e calcaneal tendon, no mesmo nível de 7 B-cun proximal a BL60.",
      "needlingText": "- 0,5 a 1,2 cun Inserção perpendicular\n- Inserção oblíqua: 1 a 2 cun",
      "actions": [
          "Removes channel obstructions",
          "Strengthens kidney"
      ],
      "indications": [
          "Cefaleia",
          "Vision blurring",
          "Obstrução nasal",
          "Epistaxis",
          "Dor nas costas",
          "Hemorrhoids",
          "Leg weakness"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "BL59",
      "names": {
          "pt": "Fuyang",
          "en": "Fuyang",
          "zh": "跗陽"
      },
      "meridian": {
          "code": "BL",
          "pt": "Bexiga",
          "en": "Bladder"
      },
      "locationText": "On posterolateral face de leg, entre fibula e calcaneal tendon, no mesmo nível de 3 B-cun proximal a BL60.",
      "needlingText": "- 0,3 a 1 cun Inserção perpendicular\n- Inserção oblíqua: 1 a 2 cun",
      "actions": [
          "Removes channel obstructions",
          "Invigorates yang qiao mai vessel",
          "Strengthens back"
      ],
      "indications": [
          "Head heavy sensation",
          "Cefaleia",
          "Dor lombar",
          "External malleolus swelling",
          "External malleolus redness",
          "Low extremity paralysis"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "BL60",
      "names": {
          "pt": "Kunlun",
          "en": "Kunlun",
          "zh": "崑崙"
      },
      "meridian": {
          "code": "BL",
          "pt": "Bexiga",
          "en": "Bladder"
      },
      "locationText": "On posterolateral face de ankle, na depressão entre prominence de maleolo lateral e calcaneal tendon.",
      "needlingText": "- 0,3 a 0,5 cun Inserção perpendicular\n- 下肢麻痺 치료시 鍼尖을 太谿(KI3)를 em direção a 1 a 1,5 cun Inserção transfixante\n- 임신부에는 자침을 금하는 자리이니 신중을 기해야 함.",
      "actions": [
          "Expels wind",
          "Removes channel obstructions",
          "Relaxes sinews",
          "Clears heat",
          "Invigorates blood",
          "Strengthens back"
      ],
      "indications": [
          "Cefaleia",
          "Vision blurring",
          "Neck stiffness",
          "Epistaxis",
          "Dor no ombro",
          "Arm dor",
          "Dor nas costas",
          "Heel dor",
          "Heel swelling",
          "Difficult labor",
          "Epilepsy"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "BL61",
      "names": {
          "pt": "Pucan (pushen)",
          "en": "Pucan (pushen)",
          "zh": "僕"
      },
      "meridian": {
          "code": "BL",
          "pt": "Bexiga",
          "en": "Bladder"
      },
      "locationText": "Na face lateral de foot, distal a BL60, lateral a calcaneus, at border entre pele vermelha e branca.",
      "needlingText": "- 0,3 a 0,5 cun Inserção perpendicular ou Inserção oblíqua를 함.",
      "actions": [
          "Frees channels",
          "Quickens connecting vessels",
          "Disperses swelling",
          "Relieves dor"
      ],
      "indications": [
          "Low extremity weakness",
          "Low extremity muscular atrophy",
          "Heel dor"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "BL62",
      "names": {
          "pt": "Shenmai",
          "en": "Shenmai",
          "zh": "申脈"
      },
      "meridian": {
          "code": "BL",
          "pt": "Bexiga",
          "en": "Bladder"
      },
      "locationText": "Na face lateral de foot, directly inferior a prominence de maleolo lateral, na depressão entre inferior border de maleolo lateral e calcaneus. Nota: corresponding medial acupuncture point a BL 62 is KI6.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,4 cun\n- Inserção oblíqua: 0,3 a 0,5 cun (鍼尖을 下em direção a하여 刺入)",
      "actions": [
          "Removes channel obstructions",
          "Benefits eyes",
          "Relaxes sinews",
          "Opens yang qiao mai vessel",
          "Clears mind",
          "Eliminates interior wind"
      ],
      "indications": [
          "Epilepsy",
          "Mania",
          "Cefaleia",
          "Tontura",
          "Insonia",
          "Backache",
          "Leg dor"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "BL63",
      "names": {
          "pt": "Jinmen",
          "en": "Jinmen",
          "zh": "門"
      },
      "meridian": {
          "code": "BL",
          "pt": "Bexiga",
          "en": "Bladder"
      },
      "locationText": "No dorso do pé, distal a anterior border de maleolo lateral, posterior a tuberosity de fifth metatarsal bone, na depressão inferior a cuboid bone.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,5 a 0,7 cun",
      "actions": [
          "Soothes sinews",
          "Quickens connecting vessels",
          "Opens portals",
          "Quiets spirit"
      ],
      "indications": [
          "Heat",
          "Dor",
          "Mania",
          "Epilepsy",
          "Infantile convulsion",
          "Backache",
          "External malleolus dor",
          "Low extremity dor",
          "Low extremity motor impairment"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "BL64",
      "names": {
          "pt": "Jinggu",
          "en": "Jinggu",
          "zh": "京骨"
      },
      "meridian": {
          "code": "BL",
          "pt": "Bexiga",
          "en": "Bladder"
      },
      "locationText": "Na face lateral de foot, distal a tuberosity de fifth metatarsal bone, at border entre pele vermelha e branca.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,3 a 0,5 cun (em direção a內inferiormente)",
      "actions": [
          "Frees channels",
          "Quickens connecting vessels",
          "Quiets heart",
          "Quiets spirit",
          "Dissipates wind",
          "Clears heat"
      ],
      "indications": [
          "Heat",
          "Chill",
          "Interior wind",
          "Mood instability",
          "Brain uncomfortable feeling",
          "Back weakness",
          "Cefaleia",
          "Neck stiffness",
          "Thigh dor",
          "Dor lombar",
          "Epilepsy"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "BL65",
      "names": {
          "pt": "Shugu",
          "en": "Shugu",
          "zh": "束骨"
      },
      "meridian": {
          "code": "BL",
          "pt": "Bexiga",
          "en": "Bladder"
      },
      "locationText": "Na face lateral de foot, na depressão proximal a fifth metatarsophalangeal joint, at border entre pele vermelha e branca.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun\n- Inserção oblíqua: 0,3 a 0,5 cun",
      "actions": [
          "Removes channel obstructions",
          "Clears heat",
          "Eliminates wind"
      ],
      "indications": [
          "Mania",
          "Cefaleia",
          "Neck stiffness",
          "Vision blurring",
          "Backache",
          "Low extremity dor"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "BL66",
      "names": {
          "pt": "Zutonggu",
          "en": "Zutonggu",
          "zh": "足通谷"
      },
      "meridian": {
          "code": "BL",
          "pt": "Bexiga",
          "en": "Bladder"
      },
      "locationText": "On little toe, na depressão distal e lateral a fifth metatarsophalangeal joint, at border entre pele vermelha e branca.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun\n- Inserção oblíqua: 0,3 a 0,5 cun",
      "actions": [
          "Clears heat",
          "Removes channel obstructions",
          "Eliminates wind"
      ],
      "indications": [
          "Cefaleia",
          "Neck stiffness",
          "Vision blurring",
          "Epistaxis",
          "Mania"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "BL67",
      "names": {
          "pt": "Zhiyin",
          "en": "Zhiyin",
          "zh": "至陰"
      },
      "meridian": {
          "code": "BL",
          "pt": "Bexiga",
          "en": "Bladder"
      },
      "locationText": "On little toe, lateral a falange distal, 0.1 F-cun proximal a canto lateral da unha do halux.",
      "needlingText": "- Inserção perpendicular: 0,1 a 0,2 cun\n- Inserção oblíqua: 0,2 a 0,3 cun",
      "actions": [
          "Eliminates wind",
          "Removes channel obstructions",
          "Invigorates blood",
          "Clears eyes"
      ],
      "indications": [
          "Cefaleia",
          "Obstrução nasal",
          "Epistaxis",
          "Ophthalmalgia",
          "Fetus malposition",
          "Difficult labor",
          "Afterbirth retention",
          "Burning feet"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "KI1",
      "names": {
          "pt": "Yongquan",
          "en": "Yongquan",
          "zh": "湧泉"
      },
      "meridian": {
          "code": "KI",
          "pt": "Rim",
          "en": "Kidney"
      },
      "locationText": "On sole de foot, in deepest depression de sole when dedos do pé are flexed.",
      "needlingText": "- 0,3 a 0,5 cun Inserção perpendicular",
      "actions": [
          "Tonifies yin",
          "Clears heat",
          "Subdues wind",
          "Subdues empty heat",
          "Calms mind",
          "Restores consciousness",
          "Clears brain"
      ],
      "indications": [
          "Cefaleia",
          "Vision blurring",
          "Tontura",
          "garganta inflamada",
          "Tongue dryness",
          "Voice loss",
          "Dysuria",
          "Infantile convulsion",
          "Sole feverish sensation",
          "Consciousness loss"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "KI2",
      "names": {
          "pt": "Rangu",
          "en": "Rangu",
          "zh": "然谷"
      },
      "meridian": {
          "code": "KI",
          "pt": "Rim",
          "en": "Kidney"
      },
      "locationText": "Na face medial de foot, inferior a tuberosity de navicular bone, at border entre pele vermelha e branca.",
      "needlingText": "- 0,3 a 0,5 cun Inserção perpendicular\n- Inserção oblíqua: 0,5 a 1 cun",
      "actions": [
          "Clears empty heat",
          "Cools blood",
          "Invigorates yin qiao mai vessel"
      ],
      "indications": [
          "Pruritus vulva",
          "Uterus prolapse",
          "menstruação irregular",
          "Nocturnal emission",
          "Hemoptysis",
          "Thirst",
          "Diarreia",
          "Odrsum of foot swelling",
          "Odrsum of foot dor",
          "Acute infantile omphalitis"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "KI4",
      "names": {
          "pt": "Dazhong",
          "en": "Dazhong",
          "zh": "大鐘"
      },
      "meridian": {
          "code": "KI",
          "pt": "Rim",
          "en": "Kidney"
      },
      "locationText": "Na face medial de foot, posteroinferior a maleolo medial, superior a calcaneus, na depressão anterior a medial attachment de calcaneal tendon.",
      "needlingText": "- 0,2 a 0,3 cun Inserção perpendicular\n- Inserção oblíqua: 0,3 a 0,5 cun",
      "actions": [
          "Strengthens back",
          "Lifts spirit"
      ],
      "indications": [
          "Blood spitting",
          "Asma",
          "Dor lombar",
          "Low back stiffness",
          "Dysuria",
          "Constipacao",
          "Heel dor",
          "Dementia"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "KI5",
      "names": {
          "pt": "Shuiquan",
          "en": "Shuiquan",
          "zh": "水泉"
      },
      "meridian": {
          "code": "KI",
          "pt": "Rim",
          "en": "Kidney"
      },
      "locationText": "Na face medial de foot, 1 B-cun interior a KI3, na depressão anterior a calcaneal tuberosity.",
      "needlingText": "- 0,1 a 0,3 cun Inserção perpendicular\n- Inserção oblíqua: 0,3 a 0,5 cun",
      "actions": [
          "Benefits urination",
          "Promotes blood circulation",
          "Stops abdominal dor",
          "Regulates uterus"
      ],
      "indications": [
          "Amenorrhea",
          "menstruação irregular",
          "Dismenorreia",
          "Uterus prolapse",
          "Dysuria",
          "Vision blurring"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "KI8",
      "names": {
          "pt": "Jiaoxin",
          "en": "Jiaoxin",
          "zh": "交信"
      },
      "meridian": {
          "code": "KI",
          "pt": "Rim",
          "en": "Kidney"
      },
      "locationText": "Na face medial de leg, na depressão posterior a medial border de tibia, 2 B-cun superior a prominence de maleolo medial.",
      "needlingText": "- 0,3 a 0,5 cun Inserção perpendicular\n- Inserção oblíqua: 0,5 a 1 cun",
      "actions": [
          "Removes channel obstructions",
          "Stops abdominal dor",
          "Removes masses",
          "Regulates menses"
      ],
      "indications": [
          "menstruação irregular",
          "Dismenorreia",
          "sangramento uterino",
          "Uterus prolapse",
          "Diarreia",
          "Constipacao",
          "Testis swelling",
          "Testis dor"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "KI9",
      "names": {
          "pt": "Zhubin",
          "en": "Zhubin",
          "zh": "築賓"
      },
      "meridian": {
          "code": "KI",
          "pt": "Rim",
          "en": "Kidney"
      },
      "locationText": "On posteromedial face de leg, entre soleus muscle e calcaneal tendon, 5 B-cun superior a prominence de maleolo medial.",
      "needlingText": "- 0,3 a 0,8 cun Inserção perpendicular\n- Inserção oblíqua: 1 a 2 cun",
      "actions": [
          "Calms mind",
          "Tonifies kidney yin",
          "Opens chest",
          "Regulates yin wei mai vessel"
      ],
      "indications": [
          "Mental disorder",
          "Low leg dor",
          "Foot dor",
          "Hernia"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "KI10",
      "names": {
          "pt": "Yingu",
          "en": "Yingu",
          "zh": "陰谷"
      },
      "meridian": {
          "code": "KI",
          "pt": "Rim",
          "en": "Kidney"
      },
      "locationText": "On posteromedial face de knee, just lateral a semitendinosus tendon, in popliteal crease.",
      "needlingText": "- 0,5 a 1 cun Inserção perpendicular\n- Inserção oblíqua: 1 a 2 cun",
      "actions": [
          "Expels dampness",
          "Tonifies kidney yin"
      ],
      "indications": [
          "Impotence",
          "Hernia",
          "sangramento uterino",
          "Dysuria",
          "Popliteal fossa dor",
          "Dor no joelho",
          "Mental disorder"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "KI11",
      "names": {
          "pt": "Henggu",
          "en": "Henggu",
          "zh": "橫骨"
      },
      "meridian": {
          "code": "KI",
          "pt": "Rim",
          "en": "Kidney"
      },
      "locationText": "On lower abdomen, 5 B-cun inferior a centre de umbilicus, 0,5 B-cun lateral à linha mediana anterior.",
      "needlingText": "- Inserção perpendicular: 0,5 a 0,8 cun\n- Inserção oblíqua: 0,5 a 1 cun",
      "actions": [
          "Boosts stomach",
          "Disinhibits damp"
      ],
      "indications": [
          "Low abdomen dor",
          "Low abdomen fullness",
          "Dysuria",
          "Enuresis",
          "Nocturnal emission",
          "Impotence",
          "Genital dor"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "KI12",
      "names": {
          "pt": "Dahe",
          "en": "Dahe",
          "zh": "大赫"
      },
      "meridian": {
          "code": "KI",
          "pt": "Rim",
          "en": "Kidney"
      },
      "locationText": "On lower abdomen, 4 B-cun inferior a centre de umbilicus, 0,5 B-cun lateral à linha mediana anterior.",
      "needlingText": "- Inserção perpendicular: 0,5 a 0,8 cun\n- Inserção oblíqua: 0,5 a 1 cun",
      "actions": [
          "Supplements kidney qi",
          "Regulates penetrating vessels",
          "Regulates conception vessels"
      ],
      "indications": [
          "Nocturnal emission",
          "Impotence",
          "Morbid leukorrhea",
          "External genital dor",
          "Uterus prolapse"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "KI13",
      "names": {
          "pt": "Qixue",
          "en": "Qixue",
          "zh": "氣穴"
      },
      "meridian": {
          "code": "KI",
          "pt": "Rim",
          "en": "Kidney"
      },
      "locationText": "On lower abdomen, 3 B-cun inferior a center de umbilicus, 0,5 B-cun lateral à linha mediana anterior.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1 cun\n- Inserção oblíqua: 0,5 a 1 cun",
      "actions": [
          "Tonifies kidney",
          "Tonifies essence",
          "Removes channel obstructions"
      ],
      "indications": [
          "menstruação irregular",
          "Dismenorreia",
          "Dysuria",
          "Dor abdominal",
          "Diarreia"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "KI14",
      "names": {
          "pt": "Siman",
          "en": "Siman",
          "zh": "四滿"
      },
      "meridian": {
          "code": "KI",
          "pt": "Rim",
          "en": "Kidney"
      },
      "locationText": "On lower abdomen, 2 B-cun inferior a center de umbilicus, 0,5 B-cun lateral à linha mediana anterior.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1 cun\n- Inserção oblíqua: 0,5 a 1 cun",
      "actions": [
          "Supplements kidney qi",
          "Regulates penetrating vessels",
          "Regulates conception vessels",
          "Promotes free flow through waterway"
      ],
      "indications": [
          "distensão abdominal",
          "Dor abdominal",
          "Diarreia",
          "Nocturnal emission",
          "menstruação irregular",
          "Dismenorreia",
          "Postpartum abdominal dor"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "KI15",
      "names": {
          "pt": "Zhongzhu",
          "en": "Zhongzhu",
          "zh": "中注"
      },
      "meridian": {
          "code": "KI",
          "pt": "Rim",
          "en": "Kidney"
      },
      "locationText": "On lower abdomen, 1 B-cun inferior a center de umbilicus, 0,5 B-cun lateral à linha mediana anterior.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1 cun\n- Inserção oblíqua: 0,5 a 1 cun",
      "actions": [
          "Nourishes kidney channels",
          "Regulates penetrating vessels",
          "Regulates conception vessels",
          "Disinhibits lower burner"
      ],
      "indications": [
          "menstruação irregular",
          "Dor abdominal",
          "Constipacao"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "KI16",
      "names": {
          "pt": "Huangshu",
          "en": "Huangshu",
          "zh": "肓兪"
      },
      "meridian": {
          "code": "KI",
          "pt": "Rim",
          "en": "Kidney"
      },
      "locationText": "On upper abdomen, 0,5 B-cun lateral a center de umbilicus.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1 cun\n- Inserção oblíqua: 0,5 a 1 cun",
      "actions": [
          "Removes channel obstructions",
          "Tonifies kidneys",
          "Benefits heart"
      ],
      "indications": [
          "distensão abdominal",
          "Dor abdominal",
          "Vomito",
          "Constipacao",
          "Diarreia"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "KI17",
      "names": {
          "pt": "Shangqu",
          "en": "Shangqu",
          "zh": "商曲"
      },
      "meridian": {
          "code": "KI",
          "pt": "Rim",
          "en": "Kidney"
      },
      "locationText": "On upper abdomen, 2 B-cun superior a center de umbilicus, 0,5 B-cun lateral à linha mediana anterior.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1 cun\n- Inserção oblíqua: 0,5 a 1 cun",
      "actions": [
          "Fortifies spleen",
          "Disinhibits damp",
          "Soothes sinews",
          "Quickens connecting vessels"
      ],
      "indications": [
          "Dor abdominal",
          "Diarreia",
          "Constipacao"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "KI18",
      "names": {
          "pt": "Shiguan",
          "en": "Shiguan",
          "zh": "石關"
      },
      "meridian": {
          "code": "KI",
          "pt": "Rim",
          "en": "Kidney"
      },
      "locationText": "On upper abdomen, 3 B-cun superior a center de umbilicus, 0,5 B-cun lateral à linha mediana anterior.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1 cun\n- Inserção oblíqua: 0,5 a 1 cun",
      "actions": [
          "Fortifies center",
          "Harmonizes stomach",
          "Frees intestines",
          "Abducts stagnation"
      ],
      "indications": [
          "Vomito",
          "Dor abdominal",
          "Constipacao",
          "Postpartum abdominal dor",
          "Sterility"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "KI19",
      "names": {
          "pt": "Yindu",
          "en": "Yindu",
          "zh": "陰都"
      },
      "meridian": {
          "code": "KI",
          "pt": "Rim",
          "en": "Kidney"
      },
      "locationText": "On upper abdomen, 4 B-cun superior a center de umbilicus, 0,5 B-cun lateral à linha mediana anterior.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1 cun\n- Inserção oblíqua: 0,5 a 1 cun",
      "actions": [
          "Fortifies spleen",
          "Harmonizes stomach",
          "Regulates qi",
          "Frees abdominal qi",
          "Regulates penetrating vessels",
          "Regulates conception vessels"
      ],
      "indications": [
          "Borborigmo",
          "Dor abdominal",
          "Epigastric dor",
          "Constipacao",
          "Vomito"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "KI20",
      "names": {
          "pt": "Futonggu",
          "en": "Futonggu",
          "zh": "腹痛谷"
      },
      "meridian": {
          "code": "KI",
          "pt": "Rim",
          "en": "Kidney"
      },
      "locationText": "On upper abdomen, 5 B-cun superior a center de umbilicus, 0,5 B-cun lateral à linha mediana anterior.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,8 cun\n- Inserção oblíqua: 0,5 a 1 cun",
      "actions": [
          "Fortifies spleen",
          "Harmonizes stomach",
          "Loosens chest",
          "Rectifies qi"
      ],
      "indications": [
          "distensão abdominal",
          "Dor abdominal",
          "Vomito",
          "Indigestion"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "KI21",
      "names": {
          "pt": "Youmen",
          "en": "Youmen",
          "zh": "幽門"
      },
      "meridian": {
          "code": "KI",
          "pt": "Rim",
          "en": "Kidney"
      },
      "locationText": "On upper abdomen, 6 B-cun superior a center de umbilicus, 0,5 B-cun lateral à linha mediana anterior.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,7 cun (禁深刺)\n- Inserção oblíqua: 0,3 a 0,8 cun",
      "actions": [
          "Courses liver",
          "Rectifies qi",
          "Fortifies spleen",
          "Harmonizes stomach",
          "Clears abdominal heat"
      ],
      "indications": [
          "distensão abdominal",
          "Dor abdominal",
          "Indigestion",
          "Vomito",
          "Diarreia",
          "Nausea",
          "Morning sickness"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "KI22",
      "names": {
          "pt": "Bulang",
          "en": "Bulang",
          "zh": "步廊"
      },
      "meridian": {
          "code": "KI",
          "pt": "Rim",
          "en": "Kidney"
      },
      "locationText": "In anterior thoracic região, in 5o intercostal space, 2 B-cun lateral à linha mediana anterior.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun\n- Inserção oblíqua: 0,3 a 0,5 cun",
      "actions": [
          "Diffuses lungs",
          "Suppresses tosse",
          "Downbears bounterflow",
          "Stops vômito"
      ],
      "indications": [
          "Tosse",
          "Asma",
          "Hypochondrium fullness",
          "Plenitude torácica",
          "Hypochondrium distension",
          "Chest distension",
          "Vomito",
          "Anorexia"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "KI23",
      "names": {
          "pt": "Shenfeng",
          "en": "Shenfeng",
          "zh": "神封"
      },
      "meridian": {
          "code": "KI",
          "pt": "Rim",
          "en": "Kidney"
      },
      "locationText": "In anterior thoracic região, in 4o intercostal space, 2 B-cun lateral à linha mediana anterior.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,4 cun\n- Inserção oblíqua: 0,3 a 0,5 cun",
      "actions": [
          "Tonifies kidneys",
          "Calms mind"
      ],
      "indications": [
          "Tosse",
          "Asma",
          "Hypochondrium fullness",
          "Plenitude torácica",
          "Mastitis"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "KI24",
      "names": {
          "pt": "Lingxu",
          "en": "Lingxu",
          "zh": "墟"
      },
      "meridian": {
          "code": "KI",
          "pt": "Rim",
          "en": "Kidney"
      },
      "locationText": "In anterior thoracic região, in 3º intercostal space, 2 B-cun lateral à linha mediana anterior.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,4 cun (不可深刺)\n- Inserção oblíqua: 0,3 a 0,5 cun",
      "actions": [
          "Tonifies kidneys",
          "Calms mind"
      ],
      "indications": [
          "Tosse",
          "Asma",
          "Hypochondrium fullness",
          "Plenitude torácica",
          "Mastitis"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "KI25",
      "names": {
          "pt": "Shencang",
          "en": "Shencang",
          "zh": "神藏"
      },
      "meridian": {
          "code": "KI",
          "pt": "Rim",
          "en": "Kidney"
      },
      "locationText": "In anterior thoracic região, in 2º intercostal space, 2 B-cun lateral à linha mediana anterior.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,4 cun (不可深刺)\n- Inserção oblíqua: 0,3 a 0,5 cun",
      "actions": [
          "Tonifies kidneys",
          "Calms mind"
      ],
      "indications": [
          "Tosse",
          "Asma",
          "Dor toracica"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "KI26",
      "names": {
          "pt": "Yuzhong",
          "en": "Yuzhong",
          "zh": "彧中"
      },
      "meridian": {
          "code": "KI",
          "pt": "Rim",
          "en": "Kidney"
      },
      "locationText": "In anterior thoracic região, in 1º espaço intercostal, 2 B-cun lateral à linha mediana anterior.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,4 cun (不可深刺)\n- Inserção oblíqua: 0,3 a 0,5 cun",
      "actions": [
          "Loosens chest",
          "Promotes qi smooth flow",
          "Calms dyspnea",
          "Relieves tosse"
      ],
      "indications": [
          "Tosse",
          "Asma",
          "Fleuma accumulation",
          "Hypochondrium fullness",
          "Plenitude torácica"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "KI27",
      "names": {
          "pt": "Shufu",
          "en": "Shufu",
          "zh": "兪府"
      },
      "meridian": {
          "code": "KI",
          "pt": "Rim",
          "en": "Kidney"
      },
      "locationText": "In anterior thoracic região, just inferior a clavicle, 2 B-cun lateral à linha mediana anterior.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,4 cun (不可深刺)\n- Inserção oblíqua: 0,3 a 0,5 cun",
      "actions": [
          "Stimulates kidney function of reception of qi",
          "Subdues rebellious qi",
          "Stops tosse",
          "Calms asma",
          "Resolves fleuma"
      ],
      "indications": [
          "Tosse",
          "Asma",
          "Dor toracica"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "PC1",
      "names": {
          "pt": "Tianchi",
          "en": "Tianchi",
          "zh": "天池"
      },
      "meridian": {
          "code": "PC",
          "pt": "Pericárdio",
          "en": "Pericardium"
      },
      "locationText": "In anterior thoracic região, in fourth intercostal space, 5 B-cun lateral à linha mediana anterior.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun (不宜深刺)\n- Inserção oblíqua: 0,3 a 0,5 cun (外傍 em direção a em direção a Inserção oblíqua)",
      "actions": [
          "Opens chest",
          "Rectifies qi",
          "Suppresses tosse",
          "Calms dyspnea",
          "Diffuses lungs",
          "Clears heat"
      ],
      "indications": [
          "Chest suffocating sensation",
          "Dor no hipocôndrio",
          "Axillary region dor",
          "Axillary region swelling"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "PC2",
      "names": {
          "pt": "Tianquan",
          "en": "Tianquan",
          "zh": "天泉"
      },
      "meridian": {
          "code": "PC",
          "pt": "Pericárdio",
          "en": "Pericardium"
      },
      "locationText": "Na face anterior de arm, entre long head e short head de biceps brachii muscle, 2 B-cun distal a anterior axillary fold.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,5 a 0,7 cun",
      "actions": [
          "Opens chest",
          "Rectifies qi",
          "Nourishes heart",
          "Calms spirit",
          "Quickens blood",
          "Transforms stasis",
          "Relieves dor"
      ],
      "indications": [
          "Cardiac dor",
          "Hypochondrium distension",
          "Tosse",
          "Dor toracica",
          "Dor nas costas",
          "Medical aspect of arm dor"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "PC3",
      "names": {
          "pt": "Quze",
          "en": "Quze",
          "zh": "曲澤"
      },
      "meridian": {
          "code": "PC",
          "pt": "Pericárdio",
          "en": "Pericardium"
      },
      "locationText": "Na face anterior de elbow, at cubital crease, na depressão medial a biceps brachii tendon.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1 cun(不宜深刺)\n- Inserção oblíqua: 0,5 a 1 cun\n- agulha triangular em direção a puntura para sangria (특히 中暑, 霍亂 등의 急性胃腸病 치료시)",
      "actions": [
          "Pacifies stomach",
          "Clears heat",
          "Cools blood",
          "Expels fire poison",
          "Opens orifices",
          "Stops convulsions",
          "Moves blood",
          "Dispels stasis",
          "Calms mind"
      ],
      "indications": [
          "Cardiac dor",
          "Palpitação",
          "doença febril",
          "Irritability",
          "Dor de estômago",
          "Vomito",
          "Arm dor",
          "Elbow dor",
          "Arm tremor",
          "Hand tremor"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "PC4",
      "names": {
          "pt": "Ximen",
          "en": "Ximen",
          "zh": "郄門"
      },
      "meridian": {
          "code": "PC",
          "pt": "Pericárdio",
          "en": "Pericardium"
      },
      "locationText": "Na face anterior do antebraço, entre os tendões do palmar longo e do flexor radial do carpo, 5 B-cun proximal à prega palmar do punho.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1 cun\n- Inserção oblíqua: 0,5 a 1 cun",
      "actions": [
          "Removes channel obstructions",
          "Stops dor",
          "Calms heart",
          "Opens chest",
          "Regulates blood",
          "Cools blood",
          "Strengthens mind"
      ],
      "indications": [
          "Cardiac dor",
          "Palpitação",
          "Epistaxis",
          "Hematemesis",
          "Hemoptysis",
          "Dor toracica",
          "Furuncle",
          "Epilepsy"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "PC5",
      "names": {
          "pt": "Jianshi",
          "en": "Jianshi",
          "zh": "間使"
      },
      "meridian": {
          "code": "PC",
          "pt": "Pericárdio",
          "en": "Pericardium"
      },
      "locationText": "Na face anterior do antebraço, entre os tendões do palmar longo e do flexor radial do carpo, 3 B-cun proximal à prega palmar do punho.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1 cun\n- Inserção oblíqua: 1 a 1,5 cun\n- 軀幹疾患 치료시는 약간 橈骨側 em direção a 上em direção a하여 1 a 1,5 cun Inserção oblíqua",
      "actions": [
          "Resolves heart fleuma",
          "Regulates heart qi",
          "Opens chest",
          "Regulates stomach",
          "Regulates heat"
      ],
      "indications": [
          "Cardiac dor",
          "Palpitação",
          "Dor de estômago",
          "Vomito",
          "doença febril",
          "Irritability",
          "Malaria",
          "Mental disorder",
          "Epilepsy",
          "Axilla swelling",
          "Arm contracture",
          "Elbow contracture"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "PC7",
      "names": {
          "pt": "Daling",
          "en": "Daling",
          "zh": "大陵"
      },
      "meridian": {
          "code": "PC",
          "pt": "Pericárdio",
          "en": "Pericardium"
      },
      "locationText": "Na face anterior de wrist, entre tendons de palmaris longus e flexor carpi radialis, on prega palmar do punho.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,5 a 0,8 cun",
      "actions": [
          "Calms mind",
          "Clears heat"
      ],
      "indications": [
          "Cardiac dor",
          "Palpitação",
          "Dor de estômago",
          "Vomito",
          "Mental disorder",
          "Epilepsy",
          "Opressão torácica",
          "Dor no hipocôndrio",
          "Convulsion",
          "Insonia",
          "Irritability",
          "Foul breath"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "PC8",
      "names": {
          "pt": "Laogong",
          "en": "Laogong",
          "zh": "宮"
      },
      "meridian": {
          "code": "PC",
          "pt": "Pericárdio",
          "en": "Pericardium"
      },
      "locationText": "On palm de hand, na depressão entre second e third ossos metacarpais, proximal a metacarpophalangeal joints. Remarks: Alternative location de PC8 – On palm de hand, na depressão, entre third e fourth ossos metacarpais, proximal a metacarpophalangeal joints.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun (손바닥에서 손등을 em direção a 刺入)\n- Inserção oblíqua: 0,5 a 0,5 cun",
      "actions": [
          "Clears heart fire",
          "Calms mind"
      ],
      "indications": [
          "Cardiac dor",
          "Mental disorder",
          "Epilepsy",
          "Gastritis",
          "Foul breath",
          "Foot fungus infection",
          "Hand fungus infection",
          "Vomito",
          "Nausea"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "PC9",
      "names": {
          "pt": "Zhongchong",
          "en": "Zhongchong",
          "zh": "中衝"
      },
      "meridian": {
          "code": "PC",
          "pt": "Pericárdio",
          "en": "Pericardium"
      },
      "locationText": "On middle finger, at centre de tip de middle finger. Remarks: Alternative location for PC9 – On middle finger, 0.1 F-cun proximal a radial corner de middle fingernail, at intersection de vertical linha de radial side de nail e horizontal linha de base de fingernail.",
      "needlingText": "- Inserção perpendicular: 0,1 a 0,2 cun\n- agulha triangular em direção a puntura para sangria\n- 禁灸 (『醫學入門』)",
      "actions": [
          "Clears heat",
          "Restores consciousness",
          "Expels wind"
      ],
      "indications": [
          "Cardiac dor",
          "Palpitação",
          "Consciousness loss",
          "Aphasia",
          "Tongue swelling",
          "Tongue stiffness",
          "doença febril",
          "Heat stroke",
          "Convulsion",
          "Palm feverish sensation"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "TE1",
      "names": {
          "pt": "Guanchong",
          "en": "Guanchong",
          "zh": "關衝"
      },
      "meridian": {
          "code": "TE",
          "pt": "Triplo Aquecedor",
          "en": "Triple Energizer"
      },
      "locationText": "On ring finger, ulnar a falange distal, 0.1 F-cun proximal a ulnar corner de fingernail, at intersection de vertical linha de ulnar side de nail e horizontal linha de base de fingernail.",
      "needlingText": "- Inserção perpendicular: 0,1 a 0,2 cun\n- Inserção oblíqua: 0,2 a 0,3 cun\n- agulha triangular em direção a puntura para sangria",
      "actions": [
          "Clears heat",
          "Expels wind",
          "Invigorates blood",
          "Restores consciousness",
          "Stops convulsions"
      ],
      "indications": [
          "Cefaleia",
          "Vermelhidão ocular",
          "garganta inflamada",
          "Tongue stiffness",
          "doença febril",
          "Irritability"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "TE2",
      "names": {
          "pt": "Yemen",
          "en": "Yemen",
          "zh": "液門"
      },
      "meridian": {
          "code": "TE",
          "pt": "Triplo Aquecedor",
          "en": "Triple Energizer"
      },
      "locationText": "No dorso da mão, na depressão superior a margem interdigital entre ring e little dedos da mão, at border entre pele vermelha e branca.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,3 a 0,5 cun",
      "actions": [
          "Clears heat",
          "Expels wind",
          "Benefits ears",
          "Removes channel obstructions"
      ],
      "indications": [
          "Cefaleia",
          "Vermelhidão ocular",
          "Sudden surdez",
          "garganta inflamada",
          "Malaria",
          "Arm dor"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "TE3",
      "names": {
          "pt": "Zhongzhu",
          "en": "Zhongzhu",
          "zh": "中渚"
      },
      "meridian": {
          "code": "TE",
          "pt": "Triplo Aquecedor",
          "en": "Triple Energizer"
      },
      "locationText": "No dorso da mão, entre 4o e 5o ossos metacarpais, na depressão proximal a 4o metacarpophalangeal joint.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,5 a 1 cun (손목을 em direção a)",
      "actions": [
          "Clears heat",
          "Expels wind",
          "Benefits ears",
          "Lifts mind",
          "Removes channel obstructions",
          "Regulates qi"
      ],
      "indications": [
          "Cefaleia",
          "Vermelhidão ocular",
          "surdez",
          "Zumbido",
          "garganta inflamada",
          "doença febril",
          "Arm dor",
          "Elbow dor",
          "Finger motor impairment"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "TE4",
      "names": {
          "pt": "Yangchi",
          "en": "Yangchi",
          "zh": "陽池"
      },
      "meridian": {
          "code": "TE",
          "pt": "Triplo Aquecedor",
          "en": "Triple Energizer"
      },
      "locationText": "Na face posterior de wrist, na depressão ulnar a extensor digitorum tendon, on prega dorsal do punho. Nota 1: no mesmo nível de LI5 e SI5.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,3 a 0,5 cun",
      "actions": [
          "Relaxes sinews",
          "Removes channel obstructions",
          "Clears heat",
          "Regulates stomach",
          "Promotes fluids transformation",
          "Benefits original qi",
          "Tonifies penetrating vessels",
          "Tonifies directing vessels"
      ],
      "indications": [
          "Arm dor",
          "Wrist dor",
          "Dor no ombro",
          "Malaria",
          "surdez",
          "Thirst"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "TE6",
      "names": {
          "pt": "Zhigou",
          "en": "Zhigou",
          "zh": "支溝"
      },
      "meridian": {
          "code": "TE",
          "pt": "Triplo Aquecedor",
          "en": "Triple Energizer"
      },
      "locationText": "Na face posterior do antebraço, midpoint de interosseous space entre radius e ulna, 3 B-cun proximal à prega dorsal do punho.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1 cun\n- Inserção oblíqua: 1 a 1,5 cun",
      "actions": [
          "Regulates qi",
          "Removes channel obstructions",
          "Removes large intestine obstruction",
          "Clears heat",
          "Expels wind"
      ],
      "indications": [
          "Zumbido",
          "surdez",
          "Dor no hipocôndrio",
          "Vomito",
          "Constipacao",
          "doença febril",
          "Back heavy sensation",
          "Shoulder heavy sensation",
          "Dor nas costas",
          "Dor no ombro",
          "Voice sudden hoarseness"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "TE7",
      "names": {
          "pt": "Huizong",
          "en": "Huizong",
          "zh": "會宗"
      },
      "meridian": {
          "code": "TE",
          "pt": "Triplo Aquecedor",
          "en": "Triple Energizer"
      },
      "locationText": "Na face posterior do antebraço, just radial a ulna, 3 B-cun proximal à prega dorsal do punho.",
      "needlingText": "- Inserção perpendicular: 0,5 a 0,9 cun\n- Inserção oblíqua: 0,5 a 1 cun",
      "actions": [
          "Removes channel obstructions",
          "Benefits eyes",
          "Benefits ears",
          "Stops dor"
      ],
      "indications": [
          "surdez",
          "Ear dor",
          "Epilepsy",
          "Arm dor"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "TE8",
      "names": {
          "pt": "Sanyangluo",
          "en": "Sanyangluo",
          "zh": "三陽絡"
      },
      "meridian": {
          "code": "TE",
          "pt": "Triplo Aquecedor",
          "en": "Triple Energizer"
      },
      "locationText": "Na face posterior do antebraço, midpoint de interosseous space entre radius e ulna, 4 B-cun proximal à prega dorsal do punho.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1 cun\n- Inserção oblíqua: 0,8 a 1,5 cun (深刺時에는 郄門(PC4)을 em direção a 2 a 3 cun 刺入)\n- 不可刺 (「鍼灸甲乙經」)",
      "actions": [
          "Clears heat",
          "Removes channel obstructions"
      ],
      "indications": [
          "surdez",
          "Voice sudden hoarseness",
          "Dor no hipocôndrio",
          "Dor toracica",
          "Arm dor",
          "Hand dor",
          "Toothache"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "TE9",
      "names": {
          "pt": "Sidu",
          "en": "Sidu",
          "zh": "四瀆"
      },
      "meridian": {
          "code": "TE",
          "pt": "Triplo Aquecedor",
          "en": "Triple Energizer"
      },
      "locationText": "Na face posterior do antebraço, midpoint de interosseous space entre radius e ulna, 5 B-cun distal a prominence de olecranon.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1 cun\n- Inserção oblíqua: 0,5 a 1 cun",
      "actions": [
          "Courses channels",
          "Quickens connecting vessels",
          "Frees waterways",
          "Regulates waterways",
          "Disinhibits throat",
          "Opens portals"
      ],
      "indications": [
          "surdez",
          "Toothache",
          "Enxaqueca",
          "Voice sudden hoarseness",
          "Forearm dor"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "TE10",
      "names": {
          "pt": "Tianjing",
          "en": "Tianjing",
          "zh": "天井"
      },
      "meridian": {
          "code": "TE",
          "pt": "Triplo Aquecedor",
          "en": "Triple Energizer"
      },
      "locationText": "Na face posterior de elbow, na depressão 1 B-cun proximal a prominence de olecranon.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,5 a 1 cun",
      "actions": [
          "Relaxes tendons",
          "Resolves damp",
          "Resolves fleuma",
          "Dispels masses",
          "Clears heat",
          "Dispels stagnation",
          "Regulates nutritive qi",
          "Regulates defensive qi"
      ],
      "indications": [
          "Enxaqueca",
          "Dor cervical",
          "Arm dor",
          "Dor no ombro",
          "Epilepsy",
          "Scrofula",
          "Goiter"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "TE11",
      "names": {
          "pt": "Qinglengyuan",
          "en": "Qinglengyuan",
          "zh": "淸淵"
      },
      "meridian": {
          "code": "TE",
          "pt": "Triplo Aquecedor",
          "en": "Triple Energizer"
      },
      "locationText": "Na face posterior de arm, on linha que conecta prominence de olecranon com acromial angle, 2 B-cun proximal a prominence de olecranon.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,5 a 1 cun",
      "actions": [
          "Frees channels",
          "Frees connecting vessels",
          "Clears heat",
          "Drains fire"
      ],
      "indications": [
          "Arm dor",
          "Dor no ombro",
          "Arm motor impairment",
          "Shoulder motor impairment",
          "Enxaqueca"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "TE12",
      "names": {
          "pt": "Xiaoluo",
          "en": "Xiaoluo",
          "zh": "消濼"
      },
      "meridian": {
          "code": "TE",
          "pt": "Triplo Aquecedor",
          "en": "Triple Energizer"
      },
      "locationText": "Na face posterior de arm, on linha que conecta prominence de olecranon com acromial angle, 5 B-cun proximal a prominence de olecranon.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,7 cun\n- Inserção oblíqua: 0,5 a 1 cun",
      "actions": [
          "Courses channels",
          "Quickens connecting vessels",
          "Moves qi",
          "Clears depressed heat",
          "Drains depressed heat"
      ],
      "indications": [
          "Cefaleia",
          "Neck stiffness",
          "Arm dor",
          "Arm motor impairment"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "TE13",
      "names": {
          "pt": "Naohui",
          "en": "Naohui",
          "zh": "臑會"
      },
      "meridian": {
          "code": "TE",
          "pt": "Triplo Aquecedor",
          "en": "Triple Energizer"
      },
      "locationText": "Na face posterior de arm, posteroinferior a border de deltoid muscle, 3 B-cun inferior a acromial angle.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1 cun\n- Inserção oblíqua: 0,5 a 1 cun",
      "actions": [
          "Clears pathogenic heat",
          "Discharges pathogenic heat",
          "Frees channels",
          "Frees connecting vessels",
          "Disinhibits joints"
      ],
      "indications": [
          "Goiter",
          "Arm dor",
          "Dor no ombro"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "TE14",
      "names": {
          "pt": "Jianliao",
          "en": "Jianliao",
          "zh": "肩髎"
      },
      "meridian": {
          "code": "TE",
          "pt": "Triplo Aquecedor",
          "en": "Triple Energizer"
      },
      "locationText": "No ombro girdle, na depressão entre acromial angle e greater tubercle de humerus.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1 cun\n- Inserção oblíqua: 1 a 2 cun\n- 肩關節炎 치료시는 어깨관절을 外轉시켜 어깨뼈봉우리와 위팔뼈큰결절 사이를 ao longo de해서 極泉(HT1)을 em direção a 1,5 a 2 cun Inserção perpendicular, ou 極泉(HT1)까지 Inserção transfixante하거나, 아래쪽 em direção a 비스듬히 2 a 3 cun Inserção oblíqua한다.",
      "actions": [
          "Dispels wind",
          "Overcomes damp",
          "Moves qi",
          "Quickens blood",
          "Relieves dor"
      ],
      "indications": [
          "Upper arm motor impairment",
          "Shoulder motor impairment",
          "Upper arm dor",
          "Dor no ombro"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "TE15",
      "names": {
          "pt": "Tianliao",
          "en": "Tianliao",
          "zh": "天髎"
      },
      "meridian": {
          "code": "TE",
          "pt": "Triplo Aquecedor",
          "en": "Triple Energizer"
      },
      "locationText": "In scapular região, na depressão superior a superior angle de scapula.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun (肩胛棘의 방향 em direção a 偏em direção a하여 刺入, 不宜深刺)\n- Inserção oblíqua: 0,5 a 0,8 cun",
      "actions": [
          "Dispels wind",
          "Eliminates damp",
          "Frees channels",
          "Quickens connecting vessels",
          "Relieves dor"
      ],
      "indications": [
          "Elbow dor",
          "Dor no ombro",
          "Neck stiffness"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "TE16",
      "names": {
          "pt": "Tianyou",
          "en": "Tianyou",
          "zh": "天牖"
      },
      "meridian": {
          "code": "TE",
          "pt": "Triplo Aquecedor",
          "en": "Triple Energizer"
      },
      "locationText": "In anterior região de neck, no mesmo nível de angle de mandible, na depressão posterior a sternocleidomastoid muscle.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun (不宜深刺)\n- Inserção oblíqua: 0,5 a 0,8 cun",
      "actions": [
          "Clears heat",
          "Drains fire",
          "Dispels wind",
          "Eliminates damp",
          "Reduces swelling",
          "Stops dor",
          "Frees channels",
          "Quickens connecting vessels"
      ],
      "indications": [
          "Cefaleia",
          "Neck stiffness",
          "Face swelling",
          "Vision blurring",
          "Sudden surdez"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "TE17",
      "names": {
          "pt": "Yifeng",
          "en": "Yifeng",
          "zh": "翳風"
      },
      "meridian": {
          "code": "TE",
          "pt": "Triplo Aquecedor",
          "en": "Triple Energizer"
      },
      "locationText": "In anterior região de neck, posterior a ear lobe, na depressão anterior a inferior end de mastoid process.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1 cun\n- Inserção oblíqua: 1 a 1,5 cun",
      "actions": [
          "Expels wind",
          "Benefits ears"
      ],
      "indications": [
          "Zumbido",
          "surdez",
          "Otorrhea",
          "Face paralysis",
          "Toothache",
          "Cheek swelling",
          "Scrofula",
          "Trismus"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "TE18",
      "names": {
          "pt": "Chimai (qimai)",
          "en": "Chimai (qimai)",
          "zh": "瘈脈"
      },
      "meridian": {
          "code": "TE",
          "pt": "Triplo Aquecedor",
          "en": "Triple Energizer"
      },
      "locationText": "Na cabeça, at center de mastoid process, at junction de upper 2/3 e lower 1/3 de curved linha de TE17 a TE20.",
      "needlingText": "- Inserção perpendicular: 0,1 a 0,2 cun\n- Inserção oblíqua: 0,5 a 1 cun\n- puntura para sangria",
      "actions": [
          "Clears heat",
          "Resolves tetany",
          "Quickens connecting vessels",
          "Relieves dor",
          "Opens portals"
      ],
      "indications": [
          "Cefaleia",
          "Zumbido",
          "surdez",
          "Infantile convulsion"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "TE19",
      "names": {
          "pt": "Luxi",
          "en": "Luxi",
          "zh": "顱息"
      },
      "meridian": {
          "code": "TE",
          "pt": "Triplo Aquecedor",
          "en": "Triple Energizer"
      },
      "locationText": "Na cabeça, at junction de upper 1/3 e lower 2/3 de curved linha de TE17 a TE20.",
      "needlingText": "- Inserção perpendicular: 0,1 a 0,2 cun\n- Inserção oblíqua: 0,1 a 0,3 cun (0,1 cun 刺入한 후 後方을 em direção a 0,5 cun Inserção oblíqua하기도 한다)",
      "actions": [
          "Courses wind",
          "Quickens connecting vessels",
          "Frees channels",
          "Relieves dor",
          "Quiets spirit",
          "Settles fright"
      ],
      "indications": [
          "Cefaleia",
          "Zumbido",
          "surdez",
          "Infantile convulsion"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "TE20",
      "names": {
          "pt": "Jiaosun",
          "en": "Jiaosun",
          "zh": "角孫"
      },
      "meridian": {
          "code": "TE",
          "pt": "Triplo Aquecedor",
          "en": "Triple Energizer"
      },
      "locationText": "Na cabeça, just superior a auricular apex.",
      "needlingText": "- Inserção perpendicular: 0,1 a 0,2 cun\n- Inserção oblíqua: 0,1 a 0,3 cun",
      "actions": [
          "Clears head",
          "Brightens eyes",
          "Courses wind",
          "Quickens connecting vessels"
      ],
      "indications": [
          "Zumbido",
          "Vermelhidão ocular",
          "Eye swelling",
          "Dor ocular",
          "Gum swelling",
          "Toothache",
          "Parotitis"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "TE21",
      "names": {
          "pt": "Ermen",
          "en": "Ermen",
          "zh": "耳門"
      },
      "meridian": {
          "code": "TE",
          "pt": "Triplo Aquecedor",
          "en": "Triple Energizer"
      },
      "locationText": "Na face, na depressão entre supratragic notch e condylar process de mandible.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1,0 cun\n- Técnica recomendada de acordo com avaliação clínica local.",
      "actions": [
          "Courses channels",
          "Quickens connecting vessels",
          "Opens portals",
          "Boosts hearing"
      ],
      "indications": [
          "Zumbido",
          "surdez",
          "Otorrhea",
          "Toothache",
          "Lip stiffness"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "TE22",
      "names": {
          "pt": "Erheliao",
          "en": "Erheliao",
          "zh": "和髎"
      },
      "meridian": {
          "code": "TE",
          "pt": "Triplo Aquecedor",
          "en": "Triple Energizer"
      },
      "locationText": "Na cabeça, posterior a temple hairline, anterior a auricular root, posterior a superficial temporal artery.",
      "needlingText": "- Inserção perpendicular: 0,1 a 0,2 cun\n- Inserção oblíqua: 0,3 a 0,5 cun",
      "actions": [
          "Dispels wind",
          "Frees connecting vessels",
          "Opens portals"
      ],
      "indications": [
          "Enxaqueca",
          "Zumbido",
          "Lockjaw"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "TE23",
      "names": {
          "pt": "Sizhukong",
          "en": "Sizhukong",
          "zh": "絲竹空"
      },
      "meridian": {
          "code": "TE",
          "pt": "Triplo Aquecedor",
          "en": "Triple Energizer"
      },
      "locationText": "Na cabeça, na depressão at lateral end de eyebrow. Nota: TE23 is superior a GB1.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun\n- Inserção oblíqua: 0,3 a 1 cun (subcutaneo를 ao longo de하여 後方 em direção a )\n- Inserção horizontal時 後方 ou 魚腰를 em direção a subcutaneo를 ao longo de하여: 0,5 a 1 cun 刺入\n- 刺出血 (頭風*, 偏頭痛 치료시)",
      "actions": [
          "Expels wind",
          "Brightens eyes",
          "Stops dor"
      ],
      "indications": [
          "Cefaleia",
          "Dor ocular",
          "Vermelhidão ocular",
          "Vision blurring",
          "Eyelind twitch",
          "Toothache",
          "Face paralysis"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "GB1",
      "names": {
          "pt": "Tongziliao",
          "en": "Tongziliao",
          "zh": "瞳子髎"
      },
      "meridian": {
          "code": "GB",
          "pt": "Vesícula Biliar",
          "en": "Gallbladder"
      },
      "locationText": "Na cabeça, na depressão, 0,5 B-cun lateral a outer canthus de eye.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun\n- Inserção oblíqua: 0,3 a 0,5 cun\n- Inserção horizontal: 0,5 a 1 cun (太陽을 em direção a 刺入)",
      "actions": [
          "Expels wind heat",
          "Clears fire",
          "Brightens eyes"
      ],
      "indications": [
          "Cefaleia",
          "Dor ocular",
          "Vermelhidão ocular",
          "Vision failing",
          "Lacrimation",
          "Mouth deviation",
          "Eye deviation"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "GB2",
      "names": {
          "pt": "Tinghui",
          "en": "Tinghui",
          "zh": "聽會"
      },
      "meridian": {
          "code": "GB",
          "pt": "Vesícula Biliar",
          "en": "Gallbladder"
      },
      "locationText": "Na face, na depressão entre intertragic notch e condylar process de mandible.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,5 a 0,7 cun\n- 입을 벌리고 약간 後斜方 em direção a 1 a 1,5 cun 刺入하기도 한다.",
      "actions": [
          "Removes channel obstructions",
          "Benefits ears",
          "Expels exterior wind"
      ],
      "indications": [
          "surdez",
          "Zumbido",
          "Toothache",
          "Temperomandibular joint motor impairment",
          "Mumps",
          "Mouth deviation",
          "Eye deviation"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "GB3",
      "names": {
          "pt": "Shangguan",
          "en": "Shangguan",
          "zh": "上關"
      },
      "meridian": {
          "code": "GB",
          "pt": "Vesícula Biliar",
          "en": "Gallbladder"
      },
      "locationText": "Na cabeça, na depressão superior a midpoint de zygomatic arch.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun\n- Inserção oblíqua: 0,3 a 0,5 cun",
      "actions": [
          "Frees channels",
          "Quickens connecting",
          "Boosts hearing"
      ],
      "indications": [
          "Cefaleia",
          "surdez",
          "Zumbido",
          "Diplacusis",
          "Mouth deviation",
          "Eye deviation",
          "Toothache"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "GB4",
      "names": {
          "pt": "Hanyan",
          "en": "Hanyan",
          "zh": "頷厭"
      },
      "meridian": {
          "code": "GB",
          "pt": "Vesícula Biliar",
          "en": "Gallbladder"
      },
      "locationText": "Na cabeça, at junction de upper one fourth e lower three fourths de curved linha de ST8 a GB7.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun\n- Inserção oblíqua: 0,3 a 0,5 cun (아래를 향하여 ao longo de皮刺)",
      "actions": [
          "Courses wind",
          "Quickens connecting vessels",
          "Clears heat",
          "Settles fright",
          "Relieves dor"
      ],
      "indications": [
          "Enxaqueca",
          "Vertigem",
          "Zumbido",
          "Outer canthus dor",
          "Toothache",
          "Convulsion",
          "Epilepsy"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "GB5",
      "names": {
          "pt": "Xuanlu",
          "en": "Xuanlu",
          "zh": "懸顱"
      },
      "meridian": {
          "code": "GB",
          "pt": "Vesícula Biliar",
          "en": "Gallbladder"
      },
      "locationText": "Na cabeça, no ponto medio de curved linha de ST8 a GB7.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun\n- Inserção oblíqua: 0,3 a 0,5 cun (뒤를 향하여 ao longo de皮刺)",
      "actions": [
          "Courses wind",
          "Quickens connecting vessels",
          "Disperses swelling",
          "Relieves dor"
      ],
      "indications": [
          "Enxaqueca",
          "Outer canthus dor",
          "Face swelling"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "GB6",
      "names": {
          "pt": "Xuanli",
          "en": "Xuanli",
          "zh": "懸釐"
      },
      "meridian": {
          "code": "GB",
          "pt": "Vesícula Biliar",
          "en": "Gallbladder"
      },
      "locationText": "Na cabeça, at junction de upper three fourths e lower one fourth de curved linha de ST8 a GB7.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun\n- Inserção oblíqua: 0,3 a 0,5 cun (뒤를 향하여 ao longo de皮刺)",
      "actions": [
          "Removes channel obstructions",
          "Benefits ears"
      ],
      "indications": [
          "Enxaqueca",
          "Outer canthus dor",
          "Zumbido",
          "Frequent sneezing"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "GB7",
      "names": {
          "pt": "Qubin",
          "en": "Qubin",
          "zh": "曲鬢"
      },
      "meridian": {
          "code": "GB",
          "pt": "Vesícula Biliar",
          "en": "Gallbladder"
      },
      "locationText": "Na cabeça, at junction de vertical linha de posterior border de temple hairline e horizontal linha de apex de auricle.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun\n- Inserção oblíqua: 0,3 a 0,5 cun",
      "actions": [
          "Clears heat",
          "Disperses swelling",
          "Extinguishes wind",
          "Relieves dor"
      ],
      "indications": [
          "Cefaleia",
          "Cheek swelling",
          "Trismus",
          "Temporal region dor",
          "Infantile convulsion"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "GB8",
      "names": {
          "pt": "Shuaigu",
          "en": "Shuaigu",
          "zh": "率谷"
      },
      "meridian": {
          "code": "GB",
          "pt": "Vesícula Biliar",
          "en": "Gallbladder"
      },
      "locationText": "Na cabeça, directly superior a auricular apex, 1,5 B-cun superior a temporal hairline.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun\n- Inserção oblíqua: 0,3 a 0,5 cun (ao longo de皮刺)",
      "actions": [
          "Removes channel obstructions",
          "Benefits ears"
      ],
      "indications": [
          "Enxaqueca",
          "Vertigem",
          "Vomito",
          "Infantile convulsion"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "GB9",
      "names": {
          "pt": "Tianchong",
          "en": "Tianchong",
          "zh": "天衝"
      },
      "meridian": {
          "code": "GB",
          "pt": "Vesícula Biliar",
          "en": "Gallbladder"
      },
      "locationText": "Na cabeça, directly superior a posterior border de auricular root, 2 B-cun superior a hairline.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun\n- Inserção oblíqua: 0,3 a 0,5 cun (ao longo de皮刺)",
      "actions": [
          "Removes channel obstructions",
          "Subdues rising qi",
          "Eliminates interior wind",
          "Calms spasms",
          "Calms mind"
      ],
      "indications": [
          "Cefaleia",
          "Epilepsy",
          "Gum dor",
          "Gum swelling",
          "Convulsion"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "GB10",
      "names": {
          "pt": "Fubai",
          "en": "Fubai",
          "zh": "浮白"
      },
      "meridian": {
          "code": "GB",
          "pt": "Vesícula Biliar",
          "en": "Gallbladder"
      },
      "locationText": "Na cabeça, posterosuperior a mastoid process, at junction de upper one third e lower two thirds de curved linha de GB9 a GB12.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun\n- Inserção oblíqua: 0,3 a 0,5 cun (ao longo de皮刺)",
      "actions": [
          "Courses liver",
          "Disinhibits liver",
          "Courses gallbladder",
          "Disinhibits gallbladder",
          "Dissipates wind",
          "Frees connecting vessels"
      ],
      "indications": [
          "Cefaleia",
          "surdez",
          "Zumbido"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "GB11",
      "names": {
          "pt": "Touqiaoyin",
          "en": "Touqiaoyin",
          "zh": "頭竅陰"
      },
      "meridian": {
          "code": "GB",
          "pt": "Vesícula Biliar",
          "en": "Gallbladder"
      },
      "locationText": "Na cabeça, posterior e superior a mastoid process, at junction de upper two thirds e lower one third de curved linha de GB9 a GB12.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun\n- Inserção oblíqua: 0,3 a 0,5 cun (ao longo de皮刺)",
      "actions": [
          "Clears heat",
          "Disinhibits gallbladder damp heat",
          "Frees ears",
          "Disinhibits throat"
      ],
      "indications": [
          "Dor cervical",
          "Cefaleia",
          "Zumbido",
          "surdez",
          "Ear dor"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "GB12",
      "names": {
          "pt": "Wangu",
          "en": "Wangu",
          "zh": "完骨"
      },
      "meridian": {
          "code": "GB",
          "pt": "Vesícula Biliar",
          "en": "Gallbladder"
      },
      "locationText": "In anterior região de neck, na depressão posteroinferior a mastoid process.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun\n- Inserção oblíqua: 0,3 a 0,5 cun (ao longo de皮刺)",
      "actions": [
          "Eliminates wind",
          "Calms spasms",
          "Subdues rising qi",
          "Calms mind"
      ],
      "indications": [
          "Cefaleia",
          "Insonia",
          "Cheek swelling",
          "Retro-auricular dor",
          "Mouth deviation",
          "Eye deviation",
          "Toothache"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "GB13",
      "names": {
          "pt": "Benshen",
          "en": "Benshen",
          "zh": "本神"
      },
      "meridian": {
          "code": "GB",
          "pt": "Vesícula Biliar",
          "en": "Gallbladder"
      },
      "locationText": "Na cabeça, 0,5 B-cun superior a linha anterior do cabelo, 3 B-cun lateral à linha mediana anterior.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun\n- Inserção oblíqua: 0,3 a 0,5 cun (뒤를 향하여 ao longo de皮刺)",
      "actions": [
          "Eliminates wind",
          "Gathers essence",
          "Clears brain"
      ],
      "indications": [
          "Cefaleia",
          "Insonia",
          "Vertigem",
          "Epilepsy"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "GB14",
      "names": {
          "pt": "Yangbai",
          "en": "Yangbai",
          "zh": "陽白"
      },
      "meridian": {
          "code": "GB",
          "pt": "Vesícula Biliar",
          "en": "Gallbladder"
      },
      "locationText": "Na cabeça, 1 B-cun superior a eye brow, directly superior a centre de pupil.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun\n- Inserção oblíqua: 0,3 a 0,5 cun (뒤를 향하여 ao longo de皮刺)\n- Inserção horizontal하여 魚腰로 Inserção transfixante: 0,3 a 0,5 cun (위에서 아래로 subcutaneo部를 ao longo de하여 刺入)",
      "actions": [
          "Eliminates exterior wind",
          "Subdues rising qi"
      ],
      "indications": [
          "Frontal region cefaleia",
          "Orbital ridge dor",
          "Dor ocular",
          "Vertigem",
          "Eyelid twitching",
          "Eyelid ptosis",
          "Lacrimation"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "GB15",
      "names": {
          "pt": "Toulinqi",
          "en": "Toulinqi",
          "zh": "頭泣"
      },
      "meridian": {
          "code": "GB",
          "pt": "Vesícula Biliar",
          "en": "Gallbladder"
      },
      "locationText": "Na cabeça, 0,5 B-cun within linha anterior do cabelo, directly superior a centre de pupil.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun\n- Inserção oblíqua: 0,3 a 0,5 cun (위를 향하여 ao longo de皮刺)\n- agulha triangular em direção a puntura para sangria",
      "actions": [
          "Regulates mind",
          "Balances emotions",
          "Clears brain",
          "Brightens eyes",
          "Frees nose"
      ],
      "indications": [
          "Cefaleia",
          "Vertigem",
          "Lacrimation",
          "Outer canthus dor",
          "Rhinorrhea",
          "Obstrução nasal",
          "Manic depression"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "GB16",
      "names": {
          "pt": "Muchuang",
          "en": "Muchuang",
          "zh": "目窓"
      },
      "meridian": {
          "code": "GB",
          "pt": "Vesícula Biliar",
          "en": "Gallbladder"
      },
      "locationText": "Na cabeça, 1,5 B-cun within linha anterior do cabelo, directly superior a centre de pupil. Nota: GB16 is 1 B-cun superior a GB15.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun\n- Inserção oblíqua: 0,3 a 0,5 cun (뒤를 향하여 ao longo de皮刺)\n- agulha triangular em direção a puntura para sangria",
      "actions": [
          "Courses channels",
          "Courses connecting vessels",
          "Clears head",
          "Brightens eyes"
      ],
      "indications": [
          "Cefaleia",
          "Vertigem",
          "Dor ocular",
          "Vermelhidão ocular",
          "Obstrução nasal"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "GB17",
      "names": {
          "pt": "Zhengying",
          "en": "Zhengying",
          "zh": "正營"
      },
      "meridian": {
          "code": "GB",
          "pt": "Vesícula Biliar",
          "en": "Gallbladder"
      },
      "locationText": "Na cabeça, 2,5 B-cun within linha anterior do cabelo, directly superior a centre de pupil. Nota: GB17 is 2 B-cun superior a GB15.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun\n- Inserção oblíqua: 0,3 a 0,5 cun (뒤를 향하여 ao longo de皮刺)",
      "actions": [
          "Clears heat",
          "Drains gallbladder",
          "Soothes sinews",
          "Quickens connecting vessels"
      ],
      "indications": [
          "Enxaqueca",
          "Vertigem"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "GB18",
      "names": {
          "pt": "Chengling",
          "en": "Chengling",
          "zh": "承靈"
      },
      "meridian": {
          "code": "GB",
          "pt": "Vesícula Biliar",
          "en": "Gallbladder"
      },
      "locationText": "Na cabeça, 4 B-cun within linha anterior do cabelo, directly superior a centre de pupil. Nota: GB18 is 1,5 B-cun posterior a GB17, no mesmo nível de BL7.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun\n- Inserção oblíqua: 0,3 a 0,5 cun (뒤를 향하여 ao longo de皮刺)",
      "actions": [
          "Calms mind",
          "Clears brain",
          "Drains heat",
          "Diffuses lungs",
          "Frees portals"
      ],
      "indications": [
          "Cefaleia",
          "Vertigem",
          "Epistaxis",
          "Rhinorrhea",
          "Dementia",
          "Obsessive thought"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "GB19",
      "names": {
          "pt": "Naokong",
          "en": "Naokong",
          "zh": "腦空"
      },
      "meridian": {
          "code": "GB",
          "pt": "Vesícula Biliar",
          "en": "Gallbladder"
      },
      "locationText": "Na cabeça, no mesmo nível de superior border de external occipital protuberance, directly superior a GB20. Nota: GB19 is no mesmo nível de GV17 e BL9.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun\n- Inserção oblíqua: 0,3 a 0,5 cun (뒤를 향하여 ao longo de皮刺)",
      "actions": [
          "Clears gallbladder",
          "Drains fire",
          "Soothes sinews",
          "Quickens connecting vessels",
          "Rouses brain",
          "Frees portals"
      ],
      "indications": [
          "Cefaleia",
          "Neck stiffness",
          "Vertigem",
          "Dor ocular",
          "Zumbido",
          "Epilepsy"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "GB22",
      "names": {
          "pt": "Yuanye",
          "en": "Yuanye",
          "zh": "淵腋"
      },
      "meridian": {
          "code": "GB",
          "pt": "Vesícula Biliar",
          "en": "Gallbladder"
      },
      "locationText": "In lateral thoracic região, in fourth intercostal space, on midaxillary linha.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun (不宜深刺)\n- Inserção oblíqua: 0,3 a 0,5 cun",
      "actions": [
          "Loosens chest",
          "Normalizes qi",
          "Soothes sinews",
          "Quickens connecting vessels"
      ],
      "indications": [
          "Plenitude torácica",
          "Axillary region swelling",
          "Dor no hipocôndrio",
          "Arm motor impairment",
          "Arm dor"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "GB23",
      "names": {
          "pt": "Zhejin",
          "en": "Zhejin",
          "zh": "輒筋"
      },
      "meridian": {
          "code": "GB",
          "pt": "Vesícula Biliar",
          "en": "Gallbladder"
      },
      "locationText": "In lateral thoracic região, in fourth intercostal space, 1 B-cun anterior a midaxillary linha.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun (不宜深刺)\n- Inserção oblíqua: 0,3 a 0,5 cun",
      "actions": [
          "Courses liver",
          "Rectifies qi",
          "Calms dyspnea",
          "Downbears counterflow"
      ],
      "indications": [
          "Plenitude torácica",
          "Dor no hipocôndrio",
          "Asma"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "GB24",
      "names": {
          "pt": "Riyue",
          "en": "Riyue",
          "zh": "日月"
      },
      "meridian": {
          "code": "GB",
          "pt": "Vesícula Biliar",
          "en": "Gallbladder"
      },
      "locationText": "In anterior thoracic região, in seventh intercostal space, 4 B-cun lateral à linha mediana anterior.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun (不宜深刺)\n- Inserção oblíqua: 0,3 a 0,5 cun",
      "actions": [
          "Resolves damp heat",
          "Promotes gallbladder function",
          "Promotes liver function"
      ],
      "indications": [
          "Dor no hipocôndrio",
          "Vomito",
          "Acid regurgitation",
          "Soluço",
          "Jaundice",
          "Mastitis"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "GB25",
      "names": {
          "pt": "Jingmen",
          "en": "Jingmen",
          "zh": "京門"
      },
      "meridian": {
          "code": "GB",
          "pt": "Vesícula Biliar",
          "en": "Gallbladder"
      },
      "locationText": "On lateral abdomen, inferior a free extremity de 12º rib.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun (不宜深刺)\n- Inserção oblíqua: 0,5 a 1 cun",
      "actions": [
          "Diagnoses kidney problems"
      ],
      "indications": [
          "distensão abdominal",
          "Borborigmo",
          "Diarreia",
          "Dor no hipocôndrio",
          "Lumbar dor"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "GB26",
      "names": {
          "pt": "Daimai",
          "en": "Daimai",
          "zh": "帶脈"
      },
      "meridian": {
          "code": "GB",
          "pt": "Vesícula Biliar",
          "en": "Gallbladder"
      },
      "locationText": "On lateral abdomen, inferior a free extremity de 11º rib, no mesmo nível de centre de umbilicus.",
      "needlingText": "- Inserção perpendicular: 0,5 a 0,8 cun\n- Inserção oblíqua: 0,5 a 1 cun",
      "actions": [
          "Regulates uterus",
          "Resolves damp heat",
          "Regulates girdle vessel"
      ],
      "indications": [
          "menstruação irregular",
          "Amenorrhea",
          "Leukorrhea",
          "Dor abdominal",
          "Hernia",
          "Dor no hipocôndrio",
          "Lumbar dor"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "GB27",
      "names": {
          "pt": "Wushu",
          "en": "Wushu",
          "zh": "五樞"
      },
      "meridian": {
          "code": "GB",
          "pt": "Vesícula Biliar",
          "en": "Gallbladder"
      },
      "locationText": "On lower abdomen, 3 B-cun inferior a centre de umbilicus, medial a anterior superior iliac spine. Nota: GB27 is 3 B-cun inferior a GB26, no mesmo nível de CV4.",
      "needlingText": "- Inserção perpendicular: 0,5 a 0,8 cun\n- Inserção oblíqua: 0,5 a 1 cun",
      "actions": [
          "Strengthens lumbar",
          "Boosts kidneys",
          "Courses liver",
          "Rectifies qi",
          "Treats vaginal discharge"
      ],
      "indications": [
          "Leukorrhea",
          "Low abdomen dor",
          "Lumbar dor",
          "Hernia",
          "Constipacao"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "GB28",
      "names": {
          "pt": "Weidao",
          "en": "Weidao",
          "zh": "維道"
      },
      "meridian": {
          "code": "GB",
          "pt": "Vesícula Biliar",
          "en": "Gallbladder"
      },
      "locationText": "On lower abdomen, 0,5 B-cun medioinferior a anterior superior iliac spine. Nota: GB28 is 0,5 B-cun medioinferior a GB27.",
      "needlingText": "- Inserção perpendicular: 0,8 a 1,2 cun\n- Técnica recomendada de acordo com avaliação clínica local.",
      "actions": [
          "Courses stagnant qi",
          "Rectifies two intestines",
          "Leashes girdle vessel"
      ],
      "indications": [
          "Leukorrhea",
          "Low abdomen dor",
          "Hernia",
          "Uterus prolapse"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "GB29",
      "names": {
          "pt": "Juliao",
          "en": "Juliao",
          "zh": "居髎"
      },
      "meridian": {
          "code": "GB",
          "pt": "Vesícula Biliar",
          "en": "Gallbladder"
      },
      "locationText": "In buttock região, midpoint de linha que conecta anterior superior iliac spine e prominence de greater trochanter.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1 cun\n- Inserção oblíqua: 2 a 3 cun (股關節로 em direção a 刺入)",
      "actions": [
          "Removes channel obstructions"
      ],
      "indications": [
          "Lumbar numbness",
          "Thigh numbness",
          "Lumbar dor",
          "Thigh dor",
          "Paralysis",
          "Low limb muscular atrophy"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "GB30",
      "names": {
          "pt": "Huantiao",
          "en": "Huantiao",
          "zh": "環跳"
      },
      "meridian": {
          "code": "GB",
          "pt": "Vesícula Biliar",
          "en": "Gallbladder"
      },
      "locationText": "In buttock região, at junction de lateral one third e medial two thirds de linha que conecta prominence de greater trochanter com sacral hiatus. Remarks: Alternative location for GB30 - in buttock região, at junction de lateral one third e medial two thirds de distance entre prominence de greater trochanter e anterior superior iliac spine.",
      "needlingText": "- Inserção perpendicular: 1 a 2 cun ou 2 a 3 cun\n- Inserção oblíqua: 1 a 3 cun",
      "actions": [
          "Removes channel obstructions",
          "Tonifies qi",
          "Tonifies blood",
          "Resolves damp heat"
      ],
      "indications": [
          "Thigh dor",
          "Lumbar dor",
          "Low limb muscular atrophy",
          "Hemiplegia"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "GB31",
      "names": {
          "pt": "Fengshi",
          "en": "Fengshi",
          "zh": "風市"
      },
      "meridian": {
          "code": "GB",
          "pt": "Vesícula Biliar",
          "en": "Gallbladder"
      },
      "locationText": "Na face lateral de thigh, na depressão posterior a iliotibial band where tip de middle finger rests, when standing up com arms hanging alongside thigh.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1,5 cun\n- Inserção oblíqua: 0,7 a 1,5 cun",
      "actions": [
          "Expels wind",
          "Relaxes sinews",
          "Strengthens bones",
          "Relieves itching"
      ],
      "indications": [
          "Lumbar sore",
          "Thigh soreness",
          "Lumbar dor",
          "Thigh dor",
          "Low limb paralysis",
          "Beriberi",
          "General pruritus"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "GB32",
      "names": {
          "pt": "Zhongdu",
          "en": "Zhongdu",
          "zh": "中瀆"
      },
      "meridian": {
          "code": "GB",
          "pt": "Vesícula Biliar",
          "en": "Gallbladder"
      },
      "locationText": "Na face lateral de thigh, posterior a iliotibial band, 7 B-cun superior a popliteal crease.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1 cun\n- Inserção oblíqua: 0,5 a 1 cun",
      "actions": [
          "Soothes sinews",
          "Quickens connecting vessels",
          "Expels wind",
          "Dissipates cold"
      ],
      "indications": [
          "Knee soreness",
          "Thigh soreness",
          "Dor no joelho",
          "Thigh dor",
          "Low limb weakness",
          "Low limb numbness",
          "Hemiplegia"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "GB33",
      "names": {
          "pt": "Xiyangguan",
          "en": "Xiyangguan",
          "zh": "膝陽關"
      },
      "meridian": {
          "code": "GB",
          "pt": "Vesícula Biliar",
          "en": "Gallbladder"
      },
      "locationText": "Na face lateral de knee, na depressão entre biceps femoris tendon e iliotibial band, posterior e proximal a lateral epicondyle de femur.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,3 a 0,8 cun",
      "actions": [
          "Dispels wind",
          "Dissipates cold",
          "Soothes sinews",
          "Quickens connecting vessels",
          "Relieves dor"
      ],
      "indications": [
          "Dor no joelho",
          "Knee swelling",
          "Contracture of tendon in popliteal fossa",
          "Leg numbness"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "GB35",
      "names": {
          "pt": "Yangjiao",
          "en": "Yangjiao",
          "zh": "陽交"
      },
      "meridian": {
          "code": "GB",
          "pt": "Vesícula Biliar",
          "en": "Gallbladder"
      },
      "locationText": "On fibular face de leg, posterior a fibula, 7 B-cun proximal a prominence de maleolo lateral.",
      "needlingText": "- 0,3 a 0,8 cun Inserção perpendicular\n- Inserção oblíqua: 0,5 a 1 cun",
      "actions": [
          "Relaxes sinews",
          "Removes channel obstructions",
          "Stops dor"
      ],
      "indications": [
          "Hypochondrium fullness",
          "Plenitude torácica",
          "Muscular atrophy",
          "Leg paralysis"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "GB36",
      "names": {
          "pt": "Waiqiu",
          "en": "Waiqiu",
          "zh": "外丘"
      },
      "meridian": {
          "code": "GB",
          "pt": "Vesícula Biliar",
          "en": "Gallbladder"
      },
      "locationText": "On fibular face de leg, anterior a fibula, 7 B-cun proximal a prominence de maleolo lateral.",
      "needlingText": "- 0,3 a 0,8 cun Inserção perpendicular\n- Inserção oblíqua: 0,5 a 1,5 cun",
      "actions": [
          "Removes channel obstructions",
          "Stops dor"
      ],
      "indications": [
          "Dor cervical",
          "Dor toracica",
          "Dor no hipocôndrio",
          "Thigh dor",
          "Fever",
          "Chill",
          "Rabies"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "GB37",
      "names": {
          "pt": "Guangming",
          "en": "Guangming",
          "zh": "光明"
      },
      "meridian": {
          "code": "GB",
          "pt": "Vesícula Biliar",
          "en": "Gallbladder"
      },
      "locationText": "On fibular face de leg, anterior a fibula, 5 B-cun proximal a prominence de maleolo lateral.",
      "needlingText": "- 0,5 a 0,9 cun Inserção perpendicular\n- Inserção oblíqua: 0,7 a 1 cun",
      "actions": [
          "Brightens eyes",
          "Expels wind",
          "Clears heat",
          "Conducts fire downwards"
      ],
      "indications": [
          "Dor no joelho",
          "Muscular atrophy",
          "Low extremity dor",
          "Low extremity motor impairment",
          "Vision blurring",
          "Ophthalmalgia",
          "Night blindness",
          "Breast distending dor"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "GB38",
      "names": {
          "pt": "Yangfu",
          "en": "Yangfu",
          "zh": "陽輔"
      },
      "meridian": {
          "code": "GB",
          "pt": "Vesícula Biliar",
          "en": "Gallbladder"
      },
      "locationText": "On fibular face de leg, anterior a fibula, 4 B-cun proximal a prominence de maleolo lateral.",
      "needlingText": "- 0,3 a 0,7 cun Inserção perpendicular\n- Inserção oblíqua: 0,5 a 1 cun",
      "actions": [
          "Subdues liver yang",
          "Clears heat",
          "Resolves damp heat"
      ],
      "indications": [
          "Enxaqueca",
          "Outer canthus dor",
          "Axillary region dor",
          "Scrofula",
          "Llumbar dor",
          "Dor toracica",
          "Dor no hipocôndrio",
          "Lateral aspect of low extremity dor",
          "Malaria"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "GB39",
      "names": {
          "pt": "Xuanzhong",
          "en": "Xuanzhong",
          "zh": "懸鍾"
      },
      "meridian": {
          "code": "GB",
          "pt": "Vesícula Biliar",
          "en": "Gallbladder"
      },
      "locationText": "On fibular face de leg, anterior a fibula, 3 B-cun proximal a prominence de maleolo lateral.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,5 a 1 cun\n- 三陰交로 em direção a 0,5 a 1,5 cun Inserção transfixante",
      "actions": [
          "Benefits essence",
          "Nourishes marrow",
          "Eliminates wind",
          "Strengthens sinews",
          "Strengthens bones",
          "Clears damp heat",
          "Cools damp heat",
          "Benefits liver",
          "Benefits gallbladder"
      ],
      "indications": [
          "Apoplexy",
          "Hemiplegia",
          "Dor cervical",
          "distensão abdominal",
          "Dor no hipocôndrio",
          "Low limb muscular atrophy",
          "Leg spastic dor",
          "Beriberi"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "GB40",
      "names": {
          "pt": "Qiuxu",
          "en": "Qiuxu",
          "zh": "丘墟"
      },
      "meridian": {
          "code": "GB",
          "pt": "Vesícula Biliar",
          "en": "Gallbladder"
      },
      "locationText": "On anterolateral face de ankle, na depressão lateral a extensor digitorum longus tendon, anterior e distal a maleolo lateral.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,5 a 1 cun (足內踝下緣을 em direção a 刺入)",
      "actions": [
          "Promotes liver qi smooth flow"
      ],
      "indications": [
          "Dor cervical",
          "Axillary region swelling",
          "Dor no hipocôndrio",
          "Vomito",
          "Acid regurgitation",
          "Low limb muscular atrophy",
          "Malaria",
          "External malleolus swelling",
          "External malleolus dor"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "GB41",
      "names": {
          "pt": "Zulinqi",
          "en": "Zulinqi",
          "zh": "足泣"
      },
      "meridian": {
          "code": "GB",
          "pt": "Vesícula Biliar",
          "en": "Gallbladder"
      },
      "locationText": "No dorso do pé, distal a junction de bases de fourth e fifth ossos metatarsais, na depressão lateral a fifth extensor digitorum longus tendon.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,3 a 0,5 cun",
      "actions": [
          "Resolves damp heat",
          "Promotes liver qi smooth flow",
          "Regulates girdle vessel"
      ],
      "indications": [
          "Cefaleia",
          "Vertigem",
          "Outer canthus dor",
          "Scrofula",
          "Dor no hipocôndrio",
          "Breast distending dor",
          "menstruação irregular",
          "Dorsum of foot dor",
          "Dorsum of foot swelling",
          "Toe dor",
          "Toe swelling"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "GB42",
      "names": {
          "pt": "Diwuhui",
          "en": "Diwuhui",
          "zh": "地五會"
      },
      "meridian": {
          "code": "GB",
          "pt": "Vesícula Biliar",
          "en": "Gallbladder"
      },
      "locationText": "No dorso do pé, entre fourth e fifth ossos metatarsais, na depressão proximal a fourth metatarsophalangeal joint.",
      "needlingText": "- Inserção perpendicular: 0,1 a 0,4 cun\n- Inserção oblíqua: 0,3 a 0,5 cun",
      "actions": [
          "Clears liver",
          "Drains gallbladder",
          "Brightens eyes",
          "Sharpens hearing"
      ],
      "indications": [
          "Canthus dor",
          "Zumbido",
          "Breast distending dor",
          "Dorsum of foot swelling",
          "Dorsum of foot dor"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "GB43",
      "names": {
          "pt": "Xiaxi",
          "en": "Xiaxi",
          "zh": "俠谿"
      },
      "meridian": {
          "code": "GB",
          "pt": "Vesícula Biliar",
          "en": "Gallbladder"
      },
      "locationText": "No dorso do pé, entre fourth e fifth dedos do pé, proximal a margem interdigital, at border entre pele vermelha e branca.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun\n- Inserção oblíqua: 0,3 a 0,5 cun",
      "actions": [
          "Subdues liver yang",
          "Benefits ears",
          "Resolves damp heat"
      ],
      "indications": [
          "Cefaleia",
          "Tontura",
          "Vertigem",
          "Outer canthus dor",
          "Zumbido",
          "surdez",
          "Cheek swelling",
          "Dor no hipocôndrio",
          "Breast distending dor",
          "doença febril"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "GB44",
      "names": {
          "pt": "Zuqiaoyin",
          "en": "Zuqiaoyin",
          "zh": "足竅陰"
      },
      "meridian": {
          "code": "GB",
          "pt": "Vesícula Biliar",
          "en": "Gallbladder"
      },
      "locationText": "On fourth toe, lateral a falange distal, 0.1 F-cun proximal a canto lateral da unha do halux, at intersection de vertical linha de lateral side de nail e horizontal linha de base de fourth toenail.",
      "needlingText": "- Inserção perpendicular: 0,1 a 0,2 cun\n- Inserção oblíqua: 0,1 a 0,2 cun",
      "actions": [
          "Subdues liver yang",
          "Benefits eyes",
          "Calms mind"
      ],
      "indications": [
          "Enxaqueca",
          "surdez",
          "Zumbido",
          "Ophthalmalgia",
          "Dream-disturbed sleep",
          "doença febril"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "LR1",
      "names": {
          "pt": "Dadun",
          "en": "Dadun",
          "zh": "大敦"
      },
      "meridian": {
          "code": "LR",
          "pt": "Fígado",
          "en": "Liver"
      },
      "locationText": "No halux, lateral a falange distal, 0.1 F-cun proximal a canto lateral da unha do halux, at intersection de vertical linha de lateral side de nail e horizontal linha de base da unha do halux.",
      "needlingText": "- Inserção perpendicular: 0,1 a 0,2 cun\n- Inserção oblíqua: 0,1 a 0,2 cun\n- agulha triangular em direção a puntura para sangria",
      "actions": [
          "Regulates menses",
          "Resolves damp heat",
          "Promotes liver qi smooth flow",
          "Restores consciousness"
      ],
      "indications": [
          "Hernia",
          "Enuresis",
          "sangramento uterino",
          "Uterus prolapse",
          "Epilepsy"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "LR2",
      "names": {
          "pt": "Xingjian",
          "en": "Xingjian",
          "zh": "行間"
      },
      "meridian": {
          "code": "LR",
          "pt": "Fígado",
          "en": "Liver"
      },
      "locationText": "No dorso do pé, entre o 1º e o 2º dedos do pé, proximal a margem interdigital, at border entre pele vermelha e branca.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun\n- Inserção oblíqua: 0,5 a 1 cun",
      "actions": [
          "Clears liver fire",
          "Subdues liver yang",
          "Cools blood",
          "Subdues interior wind"
      ],
      "indications": [
          "Liver fire",
          "Liver yang",
          "Blood heat",
          "Interior wind"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "LR4",
      "names": {
          "pt": "Zhongfeng",
          "en": "Zhongfeng",
          "zh": "中封"
      },
      "meridian": {
          "code": "LR",
          "pt": "Fígado",
          "en": "Liver"
      },
      "locationText": "Na face anteromedial do tornozelo, na depressão medial a tendão do tibial anterior, anterior a maleolo medial. Nota: LR4 is located midway entre SP5 e ST41.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,5 a 1 cun",
      "actions": [
          "Promotes liver qi smooth flow"
      ],
      "indications": [
          "Hernia",
          "External genital dor",
          "Nocturnal emission",
          "Urine retention",
          "Hypochondrium distend dor"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "LR5",
      "names": {
          "pt": "Ligou",
          "en": "Ligou",
          "zh": "蠡溝"
      },
      "meridian": {
          "code": "LR",
          "pt": "Fígado",
          "en": "Liver"
      },
      "locationText": "Na face anteromedial da perna, at center de medial border (surface) de tibia, 5 B-cun proximal a prominence de maleolo medial. Nota: LR5 is located no mesmo nível de upper 2/3 e lower 1/3 de linha que conecta apex de patella com prominence de maleolo medial, at center de medial border (surface) de tibia, no mesmo nível de KI9.",
      "needlingText": "- 0,3 a 0,5 cun Inserção perpendicular를 하거나\n- 脛骨 뒷면을 따라 0,5 a 1 cun Inserção oblíqua를 하며 특히\n- 軀幹疾患에는 脛骨 뒷면을 따라 위쪽 em direção a 1,5 a 2 cun Inserção oblíqua",
      "actions": [
          "Promotes liver qi smooth flow",
          "Resolves damp heat"
      ],
      "indications": [
          "Urine retention",
          "Enuresis",
          "Hernia",
          "menstruação irregular",
          "Leukorrhea",
          "Pruritus vulva",
          "Leg atrophy",
          "Leg weakness"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "LR6",
      "names": {
          "pt": "Zhongdu",
          "en": "Zhongdu",
          "zh": "中都"
      },
      "meridian": {
          "code": "LR",
          "pt": "Fígado",
          "en": "Liver"
      },
      "locationText": "Na face anteromedial da perna, at center de medial border (surface) de tibia, 7 B-cun proximal a prominence de maleolo medial. Nota: LR6 is located 0,5 B-cun inferior a midpoint de linha que conecta apex de patella com prominence de maleolo medial, at center de medial border (surface) de tibia.",
      "needlingText": "- 0,3 a 0,5 cun Inserção perpendicular\n- 1 a 1,5 cun Inserção oblíqua",
      "actions": [
          "Removes channel obstructions",
          "Promotes liver qi smooth flow",
          "Stops dor"
      ],
      "indications": [
          "Dor no hipocôndrio",
          "Dor abdominal",
          "Diarreia",
          "Hernia",
          "sangramento uterino",
          "Prolonged lochia"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "LR7",
      "names": {
          "pt": "Xiguan",
          "en": "Xiguan",
          "zh": "膝關"
      },
      "meridian": {
          "code": "LR",
          "pt": "Fígado",
          "en": "Liver"
      },
      "locationText": "On tibial face de leg, inferior a medial condyle de tibia, 1 B-cun posterior a SP9.",
      "needlingText": "- 0,3 a 0,6 cun Inserção perpendicular\n- Inserção oblíqua: 1 a 1,5 cun",
      "actions": [
          "Frees channels",
          "Frees connecting vessels",
          "Disinhibits joints",
          "Dispels wind",
          "Relieves dor"
      ],
      "indications": [
          "Dor no joelho",
          "Inner knee dor"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "LR8",
      "names": {
          "pt": "Ququan",
          "en": "Ququan",
          "zh": "曲泉"
      },
      "meridian": {
          "code": "LR",
          "pt": "Fígado",
          "en": "Liver"
      },
      "locationText": "Na face medial de knee, na depressão medial a tendons de semitendinosus e semimembranosus muscles, at medial end de popliteal crease. Nota: com knee flexed, LR8 is located na depressão medial a most prominent tendon on medial end de popliteal crease.",
      "needlingText": "- 0,3 a 0,8 cun Inserção perpendicular\n- Inserção oblíqua: 1 a 1,5 cun",
      "actions": [
          "regular fluxo energético"
      ],
      "indications": [
          "Uterus prolapse",
          "Low abdomen dor",
          "Urine retention",
          "Nocturnal emission",
          "External genital dor",
          "Pruritus vulva",
          "Medial aspect of knee dor",
          "Medial aspect of thigh dor"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "LR9",
      "names": {
          "pt": "Yinbao",
          "en": "Yinbao",
          "zh": "陰包"
      },
      "meridian": {
          "code": "LR",
          "pt": "Fígado",
          "en": "Liver"
      },
      "locationText": "Na face medial de thigh, entre gracilis e sartorius muscles, 4 B-cun proximal a base de patella.",
      "needlingText": "- Inserção perpendicular: 0,5 a 0,7 cun\n- Inserção oblíqua: 1,5 a 2 cun",
      "actions": [
          "Courses liver",
          "Rectifies qi",
          "Adjusts penetrating vessels",
          "Adjusts conception vessels",
          "Clears lower burner",
          "Disinhibits lower burner"
      ],
      "indications": [
          "Lumbosacral region dor",
          "Low abdomen dor",
          "Enuresis",
          "Urine retention",
          "menstruação irregular"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "LR10",
      "names": {
          "pt": "Zuwuli",
          "en": "Zuwuli",
          "zh": "足五里"
      },
      "meridian": {
          "code": "LR",
          "pt": "Fígado",
          "en": "Liver"
      },
      "locationText": "Na face medial de thigh, 3 B-cun distal a ST30, sobre artery.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1 cun\n- Inserção oblíqua: 0,5 a 1,5 cun",
      "actions": [
          "Soothes sinews",
          "Quickens connecting vessels",
          "Clears lower burner damp heat",
          "Disinhibits lower burner damp heat"
      ],
      "indications": [
          "Low abdomen fullness",
          "Lower distensão abdominal",
          "Urine retention"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "LR11",
      "names": {
          "pt": "Yinlian",
          "en": "Yinlian",
          "zh": "陰廉"
      },
      "meridian": {
          "code": "LR",
          "pt": "Fígado",
          "en": "Liver"
      },
      "locationText": "Na face medial de thigh, 2 B-cun distal a ST30.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,7 cun\n- Inserção oblíqua: 0,5 a 1 cun",
      "actions": [
          "Soothes sinews",
          "Quickens connecting vessels",
          "Regulates penetrating vessels",
          "Regulates conception vessels"
      ],
      "indications": [
          "menstruação irregular",
          "Leukorrhea",
          "Low abdomen dor",
          "Leg dor",
          "Thigh dor"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "LR12",
      "names": {
          "pt": "Jimai",
          "en": "Jimai",
          "zh": "急脈"
      },
      "meridian": {
          "code": "LR",
          "pt": "Fígado",
          "en": "Liver"
      },
      "locationText": "In groin região, no mesmo nível de superior border de pubic symphysis, e 2,5 B-cun lateral à linha mediana anterior.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,5 a 1 cun (血管을 피하여 신중히 刺入)",
      "actions": [
          "Frees channels",
          "Dissipates cold"
      ],
      "indications": [
          "Low abdomen dor",
          "Hernia",
          "External genital dor"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "LR13",
      "names": {
          "pt": "Zhangmen",
          "en": "Zhangmen",
          "zh": "章門"
      },
      "meridian": {
          "code": "LR",
          "pt": "Fígado",
          "en": "Liver"
      },
      "locationText": "On lateral abdomen, inferior a free extremity de 11º rib.",
      "needlingText": "- Inserção perpendicular: 0,5 a 0,8 cun (不宜深刺)\n- Inserção oblíqua: 0,8 a 1 cun",
      "actions": [
          "Promotes liver qi smooth flow",
          "Relieves food retention",
          "Benefits stomach",
          "Benefits spleen"
      ],
      "indications": [
          "distensão abdominal",
          "Borborigmo",
          "Dor no hipocôndrio",
          "Vomito",
          "Diarreia",
          "Indigestion"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "LR14",
      "names": {
          "pt": "Qimen",
          "en": "Qimen",
          "zh": "期門"
      },
      "meridian": {
          "code": "LR",
          "pt": "Fígado",
          "en": "Liver"
      },
      "locationText": "In anterior thoracic região, in 6o intercostal space, 4 B-cun lateral à linha mediana anterior.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun (不宜深刺)\n- Inserção oblíqua: 0,5 a 0,8 cun\n- 주의 : 深刺하면 안 된다. 本穴의 右側은 肝臟, 左側은 脾inferiormente에 있어, 모두 위쪽 em direção a 深刺할 수 없다. 病人의 肌肉의 厚薄에 따라 손 em direção a 완만히 눌러 刺入하고 “候氣爲先, 得氣爲度”에 도달하면 그친다.",
      "actions": [
          "Promotes liver qi smooth flow",
          "Benefits stomach",
          "Cools blood"
      ],
      "indications": [
          "Dor no hipocôndrio",
          "distensão abdominal",
          "Soluço",
          "Acid regurgitation",
          "Mastitis",
          "Depression",
          "doença febril"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "CV1",
      "names": {
          "pt": "Huiyin",
          "en": "Huiyin",
          "zh": "會陰"
      },
      "meridian": {
          "code": "CV",
          "pt": "Vaso Concepção",
          "en": "Conception Vessel"
      },
      "locationText": "In perineal região, no ponto medio de linha que conecta anus com posterior border de scrotum in males e posterior commissure de labium majoris in females.",
      "needlingText": "- Inserção perpendicular: 0,3 a 1 cun (鍼灸甲乙經 : 2 cun)\n- contraindicação de agulhamento (鍼灸大成)",
      "actions": [
          "Nourishes yin",
          "Benefits essence",
          "Promotes resuscitation",
          "Resolves damp heat"
      ],
      "indications": [
          "Vaginitis",
          "Urine retention",
          "Hemorrhoids",
          "Nocturnal emission",
          "Enuresis",
          "menstruação irregular",
          "Mental disorder"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "CV2",
      "names": {
          "pt": "Qugu",
          "en": "Qugu",
          "zh": "曲骨"
      },
      "meridian": {
          "code": "CV",
          "pt": "Vaso Concepção",
          "en": "Conception Vessel"
      },
      "locationText": "On lower abdomen, superior a pubic symphysis, sobre a linha mediana anterior.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1 cun\n- 孕婦不宜鍼 (『鍼灸大成』 : “不宜鍼”)",
      "actions": [
          "Warms yang",
          "Supplements kidney",
          "Regulates menses",
          "Stops vaginal discharge"
      ],
      "indications": [
          "Urine dribbling",
          "Urine retention",
          "Enuresis",
          "Nocturnal emission",
          "Impotence",
          "Morbid leukorrhea",
          "menstruação irregular",
          "Dismenorreia",
          "Hernia"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "CV3",
      "names": {
          "pt": "Zhongji",
          "en": "Zhongji",
          "zh": "中極"
      },
      "meridian": {
          "code": "CV",
          "pt": "Vaso Concepção",
          "en": "Conception Vessel"
      },
      "locationText": "On lower abdomen, 4 B-cun inferior a centre de umbilicus, sobre a linha mediana anterior.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1 cun",
      "actions": [
          "Resolves damp heat",
          "Promotes qi transformation bladder function",
          "Clears heat"
      ],
      "indications": [
          "Enuresis",
          "Nocturnal emission",
          "Impotence",
          "Hernia",
          "sangramento uterino",
          "menstruação irregular",
          "Dismenorreia",
          "Morbid leukorrhea",
          "Frequent urination",
          "Urine retention",
          "Low abdomen dor",
          "Uterus prolapse",
          "Vaginitis"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "CV5",
      "names": {
          "pt": "Shimen",
          "en": "Shimen",
          "zh": "石門"
      },
      "meridian": {
          "code": "CV",
          "pt": "Vaso Concepção",
          "en": "Conception Vessel"
      },
      "locationText": "On lower abdomen, 2 B-cun inferior a centre de umbilicus, sobre a linha mediana anterior.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1 cun\n- Inserção oblíqua: 0,8 a 1,2 cun\n- 婦人contraindicação de agulhamento禁灸",
      "actions": [
          "Strengthens original qi",
          "Promotes fluid transformation",
          "Promotes fluids excretion",
          "Opens water passages"
      ],
      "indications": [
          "Dor abdominal",
          "Diarreia",
          "Edema",
          "Hernia",
          "Anuria",
          "Enuresis",
          "sangramento uterino",
          "Amenorrhea",
          "Morbid leukorrhea",
          "Postpartum hemorrhage"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "CV7",
      "names": {
          "pt": "Yinjiao",
          "en": "Yinjiao",
          "zh": "陰交"
      },
      "meridian": {
          "code": "CV",
          "pt": "Vaso Concepção",
          "en": "Conception Vessel"
      },
      "locationText": "On lower abdomen, 1 B-cun inferior a centre de umbilicus, sobre a linha mediana anterior.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1 cun\n- Inserção oblíqua: 0,8 a 1,2 cun",
      "actions": [
          "Nourishes yin",
          "Regulates uterus",
          "Regulates penetrating vessels"
      ],
      "indications": [
          "distensão abdominal",
          "Edema",
          "Hernia",
          "menstruação irregular",
          "sangramento uterino",
          "Morbid leukorrhea",
          "Pruritus vulva",
          "Postpartum hemorrhage",
          "Umbilical dor"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "CV8",
      "names": {
          "pt": "Shenque",
          "en": "Shenque",
          "zh": "神闕"
      },
      "meridian": {
          "code": "CV",
          "pt": "Vaso Concepção",
          "en": "Conception Vessel"
      },
      "locationText": "On upper abdomen, no centro de umbilicus.",
      "needlingText": "- contraindicação de agulhamento穴",
      "actions": [
          "Rescues yang",
          "Strengthens spleen",
          "Tonifies original qi",
          "Warms original yang",
          "Frees original yang",
          "Opens portals",
          "Restores consciousness",
          "Moves gastrointestinal qi",
          "Transforms cold damp accumulating stagnations"
      ],
      "indications": [
          "Dor abdominal",
          "Borborigmo",
          "Flaccid type apoplexy",
          "Rectal prolapse",
          "Unchecked diarreia"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "CV9",
      "names": {
          "pt": "Shuifen",
          "en": "Shuifen",
          "zh": "水分"
      },
      "meridian": {
          "code": "CV",
          "pt": "Vaso Concepção",
          "en": "Conception Vessel"
      },
      "locationText": "On upper abdomen, 1 B-cun superior a centre de umbilicus, sobre a linha mediana anterior.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1 cun\n- Inserção oblíqua: 0,8 a 1,2 cun\n- 水病者 contraindicação de agulhamento, 宜灸",
      "actions": [
          "Moves spleen",
          "Disinhibits water damp"
      ],
      "indications": [
          "Fluid transformation inadequate"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "CV10",
      "names": {
          "pt": "Xiawan",
          "en": "Xiawan",
          "zh": "下脘"
      },
      "meridian": {
          "code": "CV",
          "pt": "Vaso Concepção",
          "en": "Conception Vessel"
      },
      "locationText": "On upper abdomen, 2 B-cun superior a centre de umbilicus, sobre a linha mediana anterior.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1 cun\n- Inserção oblíqua: 0,8 a 1,2 cun",
      "actions": [
          "Promotes stomach qi descending",
          "Relieves food stagnation",
          "Tonifies spleen"
      ],
      "indications": [
          "Epigastric dor",
          "Dor abdominal",
          "Borborigmo",
          "Indigestion",
          "Vomito",
          "Diarreia"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "CV11",
      "names": {
          "pt": "Jianli",
          "en": "Jianli",
          "zh": "建里"
      },
      "meridian": {
          "code": "CV",
          "pt": "Vaso Concepção",
          "en": "Conception Vessel"
      },
      "locationText": "On upper abdomen, 3 B-cun superior a centre de umbilicus, sobre a linha mediana anterior.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1 cun\n- Inserção oblíqua: 0,8 a 1,2 cun",
      "actions": [
          "Promotes stomach rotting",
          "Promotes stomach ripening",
          "Stimulates stomach qi descending"
      ],
      "indications": [
          "Dor de estômago",
          "Vomito",
          "Edema",
          "distensão abdominal",
          "Borborigmo",
          "Anorexia"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "CV13",
      "names": {
          "pt": "Shangwan",
          "en": "Shangwan",
          "zh": "上脘"
      },
      "meridian": {
          "code": "CV",
          "pt": "Vaso Concepção",
          "en": "Conception Vessel"
      },
      "locationText": "On upper abdomen, 5 B-cun superior a centre de umbilicus, sobre a linha mediana anterior.",
      "needlingText": "- Inserção perpendicular: 0,5 a 1 cun\n- Inserção oblíqua: 0,8 a 1,2 cun",
      "actions": [
          "Subdues rebellious stomach qi"
      ],
      "indications": [
          "Dor de estômago",
          "distensão abdominal",
          "Nausea",
          "Vomito",
          "Epilepsy",
          "Insonia"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "CV14",
      "names": {
          "pt": "Juque",
          "en": "Juque",
          "zh": "巨闕"
      },
      "meridian": {
          "code": "CV",
          "pt": "Vaso Concepção",
          "en": "Conception Vessel"
      },
      "locationText": "On upper abdomen, 6 B-cun superior a centre de umbilicus, sobre a linha mediana anterior.",
      "needlingText": "- Inserção perpendicular: 4 a 8 fen (不宜深刺)\n- Inserção oblíqua: 0,5 a 1 cun",
      "actions": [
          "Subdues rebellious stomach qi",
          "Calms mind",
          "Clears heart"
      ],
      "indications": [
          "Dor toracica",
          "Cardiac dor",
          "Nausea",
          "Acid regurgitation",
          "Swallow difficulty",
          "Vomito",
          "Mental disorder",
          "Epilepsy",
          "Palpitação"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "CV15",
      "names": {
          "pt": "Jiuwei",
          "en": "Jiuwei",
          "zh": "鳩尾"
      },
      "meridian": {
          "code": "CV",
          "pt": "Vaso Concepção",
          "en": "Conception Vessel"
      },
      "locationText": "On upper abdomen, 1 B-cun inferior a xiphisternal junction, sobre a linha mediana anterior.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,5 a 1 cun (약간 em direção a下)\n- contraindicação de agulhamento (鍼灸甲乙經)\n- 不宜深刺 (深刺하여 腹腔이나 胸腔까지 刺入해서는 안 된다.)",
      "actions": [
          "Calms mind",
          "Benefits original qi"
      ],
      "indications": [
          "Dor toracica",
          "Cardiac dor",
          "Nausea",
          "Mental disorder",
          "Epilepsy",
          "Palpitação",
          "Swallow difficulty",
          "Abdomen skin itching"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "CV16",
      "names": {
          "pt": "Zhongting",
          "en": "Zhongting",
          "zh": "中庭"
      },
      "meridian": {
          "code": "CV",
          "pt": "Vaso Concepção",
          "en": "Conception Vessel"
      },
      "locationText": "In anterior thoracic região, no ponto medio de xiphisternal junction, sobre a linha mediana anterior.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun\n- Inserção oblíqua: 0,3 a 0,5 cun (inferiormente em direção a em direção a subcutaneo를 ao longo de해 刺入)",
      "actions": [
          "Loosens chest",
          "Rectifies qi",
          "Downbears counterflow",
          "Harmonizes center"
      ],
      "indications": [
          "Intercostal region fullness",
          "Plenitude torácica",
          "Intercostal region distension",
          "Chest distension",
          "Soluço",
          "Nausea",
          "Anorexia"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "CV18",
      "names": {
          "pt": "Yutang",
          "en": "Yutang",
          "zh": "玉堂"
      },
      "meridian": {
          "code": "CV",
          "pt": "Vaso Concepção",
          "en": "Conception Vessel"
      },
      "locationText": "In anterior thoracic região, no mesmo nível de 3º intercostals space, sobre a linha mediana anterior.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun\n- Inserção oblíqua: 0,3 a 0,5 cun (inferiormente em direção a em direção a subcutaneo를 ao longo de해 刺入)",
      "actions": [
          "Loosens chest",
          "Rectifies qi",
          "Suppresses tosse",
          "Dispels fleuma"
      ],
      "indications": [
          "Dor toracica",
          "Tosse",
          "Asma",
          "Vomito"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "CV19",
      "names": {
          "pt": "Zigong",
          "en": "Zigong",
          "zh": "紫宮"
      },
      "meridian": {
          "code": "CV",
          "pt": "Vaso Concepção",
          "en": "Conception Vessel"
      },
      "locationText": "In anterior thoracic região, no mesmo nível de 2º intercostal space, sobre a linha mediana anterior.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun\n- Inserção oblíqua: 0,3 a 0,5 cun (inferiormente em direção a em direção a subcutaneo를 ao longo de해 刺入)",
      "actions": [
          "Loosens chest",
          "Rectifies qi",
          "Suppresses tosse",
          "Disinhibits throat"
      ],
      "indications": [
          "Dor toracica",
          "Tosse",
          "Asma"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "CV20",
      "names": {
          "pt": "Huagai",
          "en": "Huagai",
          "zh": "華蓋"
      },
      "meridian": {
          "code": "CV",
          "pt": "Vaso Concepção",
          "en": "Conception Vessel"
      },
      "locationText": "In anterior thoracic região, no mesmo nível de 1º intercostals space, sobre a linha mediana anterior.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun\n- Inserção oblíqua: 0,3 a 0,5 cun (inferiormente em direção a em direção a subcutaneo를 ao longo de해 刺入)",
      "actions": [
          "Loosens chest",
          "Disinhibits diaphragm",
          "Clears lungs",
          "Stops tosse"
      ],
      "indications": [
          "Intercostal region dor",
          "Dor toracica",
          "Intercostal region fullness",
          "Plenitude torácica",
          "Tosse",
          "Asma"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "CV21",
      "names": {
          "pt": "Xuanji",
          "en": "Xuanji",
          "zh": "璇璣"
      },
      "meridian": {
          "code": "CV",
          "pt": "Vaso Concepção",
          "en": "Conception Vessel"
      },
      "locationText": "In anterior thoracic região, 1 B-cun inferior a suprasternal fossa, sobre a linha mediana anterior. Nota: CV21 is located 1 B-cun inferior a CV22.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun\n- Inserção oblíqua: 0,3 a 0,5 cun (inferiormente em direção a em direção a subcutaneo를 ao longo de해 刺入)",
      "actions": [
          "Loosens chest",
          "Rectifies qi",
          "Suppresses tosse",
          "Downbears counterflow"
      ],
      "indications": [
          "Dor toracica",
          "Tosse",
          "Asma"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "CV22",
      "names": {
          "pt": "Tiantu",
          "en": "Tiantu",
          "zh": "天突"
      },
      "meridian": {
          "code": "CV",
          "pt": "Vaso Concepção",
          "en": "Conception Vessel"
      },
      "locationText": "In anterior região de neck, no centro de suprasternal fossa, sobre a linha mediana anterior.",
      "needlingText": "- Inserção horizontal : 먼저 Inserção perpendicular로 0,2 a 0,3 cun 刺入한 후 다시 아래로 em direção a Inserção horizontal로 바꾸어 胸骨柄 後 氣管 前緣을 ao longo de해서 0,7 a 1 cun 刺入\n- Inserção perpendicular: 0,3 a 0,5 cun (深刺하여 氣管을 刺傷하지 말아야 한다)",
      "actions": [
          "Stimulates lung qi descending",
          "Resolves fleuma",
          "Clears heat",
          "Stops tosse",
          "Benefits throat",
          "Soothes asma"
      ],
      "indications": [
          "Asma",
          "Tosse",
          "garganta inflamada",
          "Dry throat",
          "Soluço",
          "Voice sudden hoarseness",
          "Swallow difficulty",
          "Goiter"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "CV23",
      "names": {
          "pt": "Lianquan",
          "en": "Lianquan",
          "zh": "廉泉"
      },
      "meridian": {
          "code": "CV",
          "pt": "Vaso Concepção",
          "en": "Conception Vessel"
      },
      "locationText": "In anterior região de neck, superior a superior border de thyroid cartilage, na depressão superior a hyoid bone, sobre a linha mediana anterior.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun\n- Inserção oblíqua: 0,5 a 1 cun (약간 superiormente em direção a 舌根部를 em direção a 刺入)",
      "actions": [
          "Dispels interior wind",
          "Promotes speech",
          "Clears fire",
          "Resolves fleuma",
          "Subdues rebellious qi"
      ],
      "indications": [
          "Subglossal region dor",
          "Subglossal region swelling",
          "Salivation",
          "Glossoplegia",
          "Aphasia",
          "Tongue stiffness",
          "Apoplexy",
          "Voice sudden hoarseness",
          "Swallow difficulty"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "CV24",
      "names": {
          "pt": "Chengjiang",
          "en": "Chengjiang",
          "zh": "承漿"
      },
      "meridian": {
          "code": "CV",
          "pt": "Vaso Concepção",
          "en": "Conception Vessel"
      },
      "locationText": "Na face, na depressão no centro de mentolabial sulcus.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun\n- Inserção oblíqua: 0,3 a 0,5 cun (前inferiormente에서 後superiormente을 em direção a 刺入)",
      "actions": [
          "Expels exterior wind"
      ],
      "indications": [
          "Face puffiness",
          "Gum swelling",
          "Toothache",
          "Salivation",
          "Mental disorder",
          "Mouth deviation",
          "Eye deviation"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "GV1",
      "names": {
          "pt": "Changqiang",
          "en": "Changqiang",
          "zh": "長强"
      },
      "meridian": {
          "code": "GV",
          "pt": "Vaso Governador",
          "en": "Governor Vessel"
      },
      "locationText": "In perineal região, inferior a coccyx, midway entre tip de coccyx e anus.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 1 a 1,5 cun (superiormente em direção a 향하여 尾骨과 直腸사이를 平行 em direção a 刺入)",
      "actions": [
          "Regulates governing vessels",
          "Regulates directing vessels",
          "Resolves damp heat",
          "Calms mind"
      ],
      "indications": [
          "Diarreia",
          "Bloody stool",
          "Hemorrhoids",
          "Rectum prolapse",
          "Constipacao",
          "Dor lombar",
          "Epilepsy"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "GV2",
      "names": {
          "pt": "Yaoshu",
          "en": "Yaoshu",
          "zh": "腰兪"
      },
      "meridian": {
          "code": "GV",
          "pt": "Vaso Governador",
          "en": "Governor Vessel"
      },
      "locationText": "In sacral região, at sacral hiatus, on linha mediana posterior.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,5 a 1 cun (위로 em direção a)",
      "actions": [
          "Extinguishes interior wind",
          "Calms spasms",
          "Calms convulsions",
          "Strengthens lower back"
      ],
      "indications": [
          "menstruação irregular",
          "Low back stiffness",
          "Dor lombar",
          "Hemorrhoids",
          "Low extremity muscular atrophy",
          "Epilepsy"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "GV3",
      "names": {
          "pt": "Yaoyangguan",
          "en": "Yaoyangguan",
          "zh": "腰陽關"
      },
      "meridian": {
          "code": "GV",
          "pt": "Vaso Governador",
          "en": "Governor Vessel"
      },
      "locationText": "In lumbar região, na depressão inferior a spinous process de 4o lumbar vertebra (L4), on linha mediana posterior.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,5 a 1 cun (약간 上em direção a)",
      "actions": [
          "Strengthens lower back",
          "Tonifies yang",
          "Strengthens legs"
      ],
      "indications": [
          "menstruação irregular",
          "Nocturnal emission",
          "Impotence",
          "Lumbosacral region dor",
          "Muscular atrophy",
          "Motor impairment",
          "Low extremity numbness",
          "Low extremity dor",
          "Epilepsy"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "GV5",
      "names": {
          "pt": "Xuanshu",
          "en": "Xuanshu",
          "zh": "懸樞"
      },
      "meridian": {
          "code": "GV",
          "pt": "Vaso Governador",
          "en": "Governor Vessel"
      },
      "locationText": "In lumbar região, na depressão inferior a spinous process de 1º lumbar vertebra (L1), on linha mediana posterior.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,5 a 1,5 cun (약간 上em direção a)",
      "actions": [
          "Fortifies spleen",
          "Harmonizes stomach",
          "Strengthens lumbar",
          "Strengthens knees"
      ],
      "indications": [
          "Low back stiffness",
          "Dor lombar",
          "Diarreia",
          "Indigestion"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "GV6",
      "names": {
          "pt": "Jizhong",
          "en": "Jizhong",
          "zh": "脊中"
      },
      "meridian": {
          "code": "GV",
          "pt": "Vaso Governador",
          "en": "Governor Vessel"
      },
      "locationText": "In upper back região, na depressão inferior a spinous process de 11º thoracic vertebra (T11), on linha mediana posterior.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,5 a 1 cun (약간 上em direção a)",
      "actions": [
          "Fortifies spleen",
          "Disinhibits damp",
          "Supplements kidney",
          "Stems desertion",
          "Strengthens lumbar"
      ],
      "indications": [
          "Epigastric dor",
          "Diarreia",
          "Jaundice epilepsy",
          "Dor nas costas",
          "Back stiffness"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "GV7",
      "names": {
          "pt": "Zhongshu",
          "en": "Zhongshu",
          "zh": "中樞"
      },
      "meridian": {
          "code": "GV",
          "pt": "Vaso Governador",
          "en": "Governor Vessel"
      },
      "locationText": "In upper back região, na depressão inferior a spinous process de 10o thoracic vertebra (T10), on linha mediana posterior.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,5 a 1 cun (약간 上em direção a)",
      "actions": [
          "Supplements kidneys",
          "Strengthens lumbar",
          "Harmonizes stomach",
          "Relieves dor"
      ],
      "indications": [
          "Epigastric dor",
          "Dor lombar",
          "Back stiffness"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "GV8",
      "names": {
          "pt": "Jinsuo",
          "en": "Jinsuo",
          "zh": "筋縮"
      },
      "meridian": {
          "code": "GV",
          "pt": "Vaso Governador",
          "en": "Governor Vessel"
      },
      "locationText": "In upper back região, na depressão inferior a spinous process de 9o thoracic vertebra (T9), on linha mediana posterior.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,5 a 1 cun (약간 上em direção a)",
      "actions": [
          "Relaxes sinews",
          "Eliminates interior wind"
      ],
      "indications": [
          "Epilepsy",
          "Back stiffness",
          "Dor gástrica"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "GV9",
      "names": {
          "pt": "Zhiyang",
          "en": "Zhiyang",
          "zh": "至陽"
      },
      "meridian": {
          "code": "GV",
          "pt": "Vaso Governador",
          "en": "Governor Vessel"
      },
      "locationText": "In upper back região, na depressão inferior a spinous process de 7o thoracic vertebra (T7), on linha mediana posterior.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,7 a 1 cun (약간 上em direção a)",
      "actions": [
          "Regulates liver",
          "Regulates gallbladder",
          "Moves qi",
          "Opens chest",
          "Opens diaphragm",
          "Resolves damp heat"
      ],
      "indications": [
          "Jaundice",
          "Tosse",
          "Asma",
          "Back stiffness",
          "Dor nas costas",
          "Dor toracica"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "GV10",
      "names": {
          "pt": "Lingtai",
          "en": "Lingtai",
          "zh": "臺"
      },
      "meridian": {
          "code": "GV",
          "pt": "Vaso Governador",
          "en": "Governor Vessel"
      },
      "locationText": "In upper back região, na depressão inferior a spinous process de 6o thoracic vertebra (T6), on linha mediana posterior.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,5 a 1 cun (약간 上em direção a)",
      "actions": [
          "Diffuses lungs",
          "Suppresses tosse",
          "Frees channels",
          "Quickens connecting vessels"
      ],
      "indications": [
          "Tosse",
          "Asma",
          "Furuncle",
          "Dor nas costas",
          "Neck stiffness"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "GV11",
      "names": {
          "pt": "Shendao",
          "en": "Shendao",
          "zh": "神道"
      },
      "meridian": {
          "code": "GV",
          "pt": "Vaso Governador",
          "en": "Governor Vessel"
      },
      "locationText": "In upper back região, na depressão inferior a spinous process de 5o thoracic vertebra (T5), on linha mediana posterior.",
      "needlingText": "- Inserção oblíqua direcionada para cima: 0,5 a 1,0 cun\n- Técnica recomendada de acordo com avaliação clínica local.",
      "actions": [
          "Regulates heart",
          "Calms mind"
      ],
      "indications": [
          "Poor memory",
          "Ansiedade",
          "Palpitação",
          "Back stiffness",
          "Dor nas costas",
          "Tosse",
          "Cardiac dor"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "GV12",
      "names": {
          "pt": "Shenzhu",
          "en": "Shenzhu",
          "zh": "身柱"
      },
      "meridian": {
          "code": "GV",
          "pt": "Vaso Governador",
          "en": "Governor Vessel"
      },
      "locationText": "In upper back região, na depressão inferior a spinous process de 3º thoracic vertebra (T3), on linha mediana posterior.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,5 a 1 cun (鍼尖을 약간 上em direção a하여 刺入)",
      "actions": [
          "Eliminates interior wind",
          "Calms spasms",
          "Tonifies lung qi",
          "Strengthens body"
      ],
      "indications": [
          "Tosse",
          "Asma",
          "Epilepsy",
          "Back stiffness",
          "Dor nas costas",
          "Furuncle"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "GV13",
      "names": {
          "pt": "Taodao",
          "en": "Taodao",
          "zh": "陶道"
      },
      "meridian": {
          "code": "GV",
          "pt": "Vaso Governador",
          "en": "Governor Vessel"
      },
      "locationText": "In upper back região, na depressão inferior a spinous process de 1º thoracic vertebra (T1), on linha mediana posterior.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,5 a 1 cun (약간 上em direção a)",
      "actions": [
          "Clears heat",
          "Releases exterior",
          "Regulates lesser yang"
      ],
      "indications": [
          "Back stiffness",
          "Cefaleia",
          "Malaria",
          "doença febril"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "GV15",
      "names": {
          "pt": "Yamen",
          "en": "Yamen",
          "zh": "瘂門"
      },
      "meridian": {
          "code": "GV",
          "pt": "Vaso Governador",
          "en": "Governor Vessel"
      },
      "locationText": "In posterior região de neck, na depressão superior a spinous process de 2º cervical vertebra (C2), on linha mediana posterior.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,5 a 1 cun (口部와 耳垂의 水平位를 기준 em direção a 刺入)\n- 不宜深刺 (深部에 延髓가 있으므로 不可深刺)",
      "actions": [
          "Clears mind",
          "Stimulates speech"
      ],
      "indications": [
          "Mental disorder",
          "Epilepsy",
          "Mute",
          "surdez",
          "Voice sudden hoarseness",
          "Apoplexy",
          "Aphasia",
          "Tongue stiffness",
          "Occipital cefaleia",
          "Neck stiffness"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "GV16",
      "names": {
          "pt": "Fengfu",
          "en": "Fengfu",
          "zh": "風府"
      },
      "meridian": {
          "code": "GV",
          "pt": "Vaso Governador",
          "en": "Governor Vessel"
      },
      "locationText": "In posterior região de neck, directly inferior a external occipital protuberance, na depressão entre trapezius muscles.",
      "needlingText": "- Inserção perpendicular: 0,3 a 0,5 cun\n- Inserção oblíqua: 0,5 a 0,8 cun\n- 不宜深刺 (深部에 延髓가 있으므로 不可深刺)",
      "actions": [
          "Eliminates wind",
          "Clears mind",
          "Benefits brain"
      ],
      "indications": [
          "Cefaleia",
          "Neck stiffness",
          "Vision blurring",
          "Epistaxis",
          "garganta inflamada",
          "Post-apoplexy",
          "Aphasia",
          "Hemiplegia",
          "Mental disorder"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "GV17",
      "names": {
          "pt": "Naohu",
          "en": "Naohu",
          "zh": "腦戶"
      },
      "meridian": {
          "code": "GV",
          "pt": "Vaso Governador",
          "en": "Governor Vessel"
      },
      "locationText": "Na cabeça, na depressão superior a external occipital protuberance. Nota: GV17 is located na depressão at intersection de 2 imaginary lines: vertical linha de linha mediana posterior e horizontal linha de superior border de external occipital protuberance, no mesmo nível de BL9 (玉枕).",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun\n- Inserção oblíqua: 0,5 a 0,8 cun (피부를 따라 刺入하며, 玉枕(BL9) em direção a Inserção transfixante하여도 좋다.)",
      "actions": [
          "Eliminates wind",
          "Benefits brain",
          "Clears mind"
      ],
      "indications": [
          "Epilepsy",
          "Tontura",
          "Neck stiffness",
          "Dor cervical"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "GV18",
      "names": {
          "pt": "Qiangjian",
          "en": "Qiangjian",
          "zh": "强間"
      },
      "meridian": {
          "code": "GV",
          "pt": "Vaso Governador",
          "en": "Governor Vessel"
      },
      "locationText": "Na cabeça, 4 B-cun superior a linha posterior do cabelo, on linha mediana posterior. Nota: GV18 is located na depressão 1,5 B-cun superior a GV17.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun\n- Inserção oblíqua: 0,5 a 1 cun (鍼尖을 ao longo de皮하여 刺入, 絡却(BL8) em direção a Inserção transfixante하여도 좋다)",
      "actions": [
          "Calms liver",
          "Extinguishes wind",
          "Soothes sinews",
          "Quickens connecting vessels"
      ],
      "indications": [
          "Cefaleia",
          "Neck stiffness",
          "Vision blurring",
          "Mania"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "GV19",
      "names": {
          "pt": "Houding",
          "en": "Houding",
          "zh": "後頂"
      },
      "meridian": {
          "code": "GV",
          "pt": "Vaso Governador",
          "en": "Governor Vessel"
      },
      "locationText": "Na cabeça, 5,5 B-cun superior a linha posterior do cabelo, on linha mediana posterior. Nota: GV19 is located 1,5 B-cun posterior a GV20.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun\n- Inserção oblíqua: 0,5 a 0,8 cun (鍼尖을 ao longo de皮하여 刺入)",
      "actions": [
          "Calms mind"
      ],
      "indications": [
          "Cefaleia",
          "Vertigem",
          "Epilepsy",
          "Mania"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "GV21",
      "names": {
          "pt": "Qianding",
          "en": "Qianding",
          "zh": "前頂"
      },
      "meridian": {
          "code": "GV",
          "pt": "Vaso Governador",
          "en": "Governor Vessel"
      },
      "locationText": "Na cabeça, 3,5 B-cun superior a linha anterior do cabelo, sobre a linha mediana anterior. Nota: GV21 is located no ponto medio de linha que conecta GV20 e GV22.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun\n- Inserção oblíqua: 0,5 a 0,8 cun (承光(BL6)이나 目窓(GB16) em direção a subcutaneo를 ao longo de하여 橫Inserção transfixante해도 좋다)",
      "actions": [
          "Extinguishes wind",
          "Relieves tetany",
          "Frees connecting vessels",
          "Disperses swelling",
          "Stabilizes spirit"
      ],
      "indications": [
          "Epilepsy",
          "Tontura",
          "Vision blurring",
          "Vertical cefaleia",
          "Rhinorrhea"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "GV22",
      "names": {
          "pt": "Xinhui",
          "en": "Xinhui",
          "zh": "顖會"
      },
      "meridian": {
          "code": "GV",
          "pt": "Vaso Governador",
          "en": "Governor Vessel"
      },
      "locationText": "Na cabeça, 2 B-cun superior a linha anterior do cabelo, sobre a linha mediana anterior.",
      "needlingText": "- 刺 0,2 a 0,3 cun\n- Inserção oblíqua: 0,5 a 0,8 cun (鍼尖을 ao longo de皮하여 刺入)\n- 顖門이 닫히지 않은 小兒는 contraindicação de agulhamento",
      "actions": [
          "Calms liver",
          "Extinguishes wind",
          "Opens portals",
          "Settles fright"
      ],
      "indications": [
          "Cefaleia",
          "Vision blurring",
          "Rhinorrhea",
          "Infantile convulsion"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "GV23",
      "names": {
          "pt": "Shangxing",
          "en": "Shangxing",
          "zh": "上星"
      },
      "meridian": {
          "code": "GV",
          "pt": "Vaso Governador",
          "en": "Governor Vessel"
      },
      "locationText": "Na cabeça, 1 B-cun superior a linha anterior do cabelo, sobre a linha mediana anterior.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun\n- Inserção oblíqua: 0,5 a 0,8 cun (鍼尖을 ao longo de皮하여 刺入)\n- agulha triangular em direção a puntura para sangria",
      "actions": [
          "Opens nose"
      ],
      "indications": [
          "Cefaleia",
          "Ophthalmalgia",
          "Epistaxis",
          "Rhinorrhea",
          "Mental disorder"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "GV24",
      "names": {
          "pt": "Shenting",
          "en": "Shenting",
          "zh": "神庭"
      },
      "meridian": {
          "code": "GV",
          "pt": "Vaso Governador",
          "en": "Governor Vessel"
      },
      "locationText": "Na cabeça, 0,5 B-cun superior a linha anterior do cabelo, sobre a linha mediana anterior.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun\n- Inserção oblíqua: 0,5 a 0,8 cun (鍼尖을 ao longo de皮하여 刺入)",
      "actions": [
          "Calms mind"
      ],
      "indications": [
          "Epilepsy",
          "Ansiedade",
          "Vertigem",
          "Palpitação",
          "Insonia",
          "Cefaleia",
          "Rhinorrhea"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "GV25",
      "names": {
          "pt": "Suliao",
          "en": "Suliao",
          "zh": "素髎"
      },
      "meridian": {
          "code": "GV",
          "pt": "Vaso Governador",
          "en": "Governor Vessel"
      },
      "locationText": "Na face, at tip de nose.",
      "needlingText": "- Inserção perpendicular: 0,1 a 0,2 cun\n- Inserção oblíqua: 0,2 a 0,3 cun (鼻尖端에서 斜superiormente em direção a 刺入)\n- agulha triangular em direção a puntura para sangria",
      "actions": [
          "Discharges heat",
          "Opens portals",
          "Returns yang",
          "Stems counterflow"
      ],
      "indications": [
          "Consciousness loss",
          "Obstrução nasal",
          "Epistaxis",
          "Rhinorrhea",
          "Rosacea"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "GV26",
      "names": {
          "pt": "Shuigou",
          "en": "Shuigou",
          "zh": "水溝"
      },
      "meridian": {
          "code": "GV",
          "pt": "Vaso Governador",
          "en": "Governor Vessel"
      },
      "locationText": "Na face, no ponto medio de philtrum midline. Remarks: Alternative location for GV26 – At junction de upper 1/3 e lower 2/3 de philtrum midline.",
      "needlingText": "- Inserção perpendicular: 0,2 a 0,3 cun\n- Inserção oblíqua: 0,3 a 0,5 cun (鍼尖을 약간 下에서 superiormente을 em direção a 刺入)\n- agulha triangular em direção a 流涎症 치료시는 鼻中隔을 em direção a 刺入했다가 subcutaneo까지 退鍼하여 다시 laterolateral의 鼻翼을 em direção a 刺入",
      "actions": [
          "Promotes resuscitation",
          "Benefits lumbar spine"
      ],
      "indications": [
          "Mental disorder",
          "Epilepsy",
          "Hysteria",
          "Infantile convulsion",
          "Coma",
          "Mouth deviation",
          "Apoplexy-faint",
          "Trismus",
          "Face puffinesss",
          "Lower back dor",
          "Low back stiffness"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "GV27",
      "names": {
          "pt": "Duiduan",
          "en": "Duiduan",
          "zh": "兌端"
      },
      "meridian": {
          "code": "GV",
          "pt": "Vaso Governador",
          "en": "Governor Vessel"
      },
      "locationText": "Na face, no ponto medio de tubercle de upper lip.",
      "needlingText": "- Inserção perpendicular: 0,1 a 0,3 cun\n- Inserção oblíqua: 0,2 a 0,3 cun",
      "actions": [
          "Nourishes yin",
          "Clears heat",
          "Relieves dor",
          "Quiets spirit"
      ],
      "indications": [
          "Mental disorder",
          "Lip twitching",
          "Lip stiffness",
          "Gum dor",
          "Gum swelling"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  }),
  rawAcupoint({
      "code": "GV28",
      "names": {
          "pt": "Yinjiao",
          "en": "Yinjiao",
          "zh": "齦交"
      },
      "meridian": {
          "code": "GV",
          "pt": "Vaso Governador",
          "en": "Governor Vessel"
      },
      "locationText": "Na face, at junction de frenulum de upper lip com upper gum.",
      "needlingText": "- Inserção perpendicular: 0,1 a 0,2 cun\n- Inserção oblíqua: 0,1 a 0,3 cun (鍼尖을 上em direção a하여 刺入)\n- agulha triangular em direção a puntura para sangria",
      "actions": [
          "Diffuses lungs",
          "Frees portals",
          "Clears heat",
          "Drains fire",
          "Brightens eyes",
          "Relieves itching"
      ],
      "indications": [
          "Mental disorder",
          "Gum dor",
          "Gum swelling",
          "Rhinorrhea"
      ],
      "cautions": [],
      "relatedPatterns": [],
      "relatedSymptoms": [],
      "approvalStatus": "APPROVED",
      "officialChinese": true
  })
];
