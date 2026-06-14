const CJK_CLUSTER_RE = /[\u1100-\u11ff\u3130-\u318f\u3400-\u9fff\uac00-\ud7af]+/g;

const DIRECT_REPLACEMENTS = [
  ['直刺', 'insercao perpendicular'],
  ['斜刺', 'insercao obliqua'],
  ['横刺', 'insercao transversal'],
  ['橫刺', 'insercao transversal'],
  ['平刺', 'insercao horizontal'],
  ['可灸', 'moxa permitida'],
  ['禁灸', 'moxa contraindicada'],
  ['禁针', 'agulhamento contraindicado'],
  ['禁針', 'agulhamento contraindicado'],
  ['자침', 'agulhamento'],
  ['직자', 'insercao perpendicular'],
  ['사자', 'insercao obliqua'],
  ['횡자', 'insercao transversal'],
  ['평자', 'insercao horizontal'],
  ['침', 'agulha'],
  ['뜸', 'moxa'],
  ['금침', 'agulhamento contraindicado'],
  ['금구', 'moxa contraindicada'],
];

const CONTROLLED_GLOSSARY = [
  [/\bperpendicular insertion\b/gi, 'insercao perpendicular'],
  [/\boblique insertion\b/gi, 'insercao obliqua'],
  [/\btransverse insertion\b/gi, 'insercao transversal'],
  [/\bhorizontal insertion\b/gi, 'insercao horizontal'],
  [/\bsubcutaneous insertion\b/gi, 'insercao subcutanea'],
  [/\bneedling method\b/gi, 'metodo de agulhamento'],
  [/\bneedling\b/gi, 'agulhamento'],
  [/\binsertion\b/gi, 'insercao'],
  [/\binsert\b/gi, 'inserir'],
  [/\bneedle\b/gi, 'agulha'],
  [/\bpuncture\b/gi, 'punção'],
  [/\bprick\b/gi, 'punção superficial'],
  [/\bbleeding\b/gi, 'sangria'],
  [/\bmoxibustion\b/gi, 'moxabustão'],
  [/\bmoxa\b/gi, 'moxa'],
  [/\bcauterization\b/gi, 'cauterizacao'],
  [/\bcontraindicated\b/gi, 'contraindicado'],
  [/\bcaution\b/gi, 'cautela'],
  [/\bavoid\b/gi, 'evitar'],
  [/\bdirected toward\b/gi, 'direcionada para'],
  [/\btowards?\b/gi, 'em direcao a'],
  [/\bdeep\b/gi, 'profundo'],
  [/\bshallow\b/gi, 'superficial'],
  [/\bOn the lower abdomen\b/gi, 'Na regiao inferior do abdome'],
  [/\bOn lower abdomen\b/gi, 'Na regiao inferior do abdome'],
  [/\bOn the upper abdomen\b/gi, 'Na regiao superior do abdome'],
  [/\bOn upper abdomen\b/gi, 'Na regiao superior do abdome'],
  [/\bOn the abdomen\b/gi, 'No abdome'],
  [/\bOn abdomen\b/gi, 'No abdome'],
  [/\bOn the chest\b/gi, 'No torax'],
  [/\bOn chest\b/gi, 'No torax'],
  [/\bpoints on the\b/gi, 'pontos na regiao da'],
  [/\bpoints on\b/gi, 'pontos em'],
  [/\bauricular points\b/gi, 'pontos auriculares'],
  [/\bear points\b/gi, 'pontos auriculares'],
  [/\bapplicable disease\b/gi, 'doencas aplicaveis'],
  [/\blocation\b/gi, 'localizacao'],
  [/\bfunction\b/gi, 'funcao'],
  [/\bposterior surface of the auricle\b/gi, 'superficie posterior do pavilhao auricular'],
  [/\bposterior surface\b/gi, 'superficie posterior'],
  [/\bauricle\b/gi, 'pavilhao auricular'],
  [/\bearlobe\b/gi, 'lobulo da orelha'],
  [/\bantihelix\b/gi, 'anti-helice'],
  [/\banti-helix\b/gi, 'anti-helice'],
  [/\bhelix\b/gi, 'helice'],
  [/\bscapha\b/gi, 'fossa escafoide'],
  [/\btragus\b/gi, 'trago'],
  [/\bantitragus\b/gi, 'antitrago'],
  [/\banti-tragus\b/gi, 'antitrago'],
  [/\bconcha\b/gi, 'concha'],
  [/\btriangular fossa\b/gi, 'fossa triangular'],
  [/\bintertragic notch\b/gi, 'incisura intertragica'],
  [/\bsuperior crus\b/gi, 'ramo superior'],
  [/\binferior crus\b/gi, 'ramo inferior'],
  [/\bshen men\b/gi, 'Shen Men'],
  [/\bshenmen\b/gi, 'Shenmen'],
  [/\bOn the back\b/gi, 'No dorso'],
  [/\bOn back\b/gi, 'No dorso'],
  [/\bOn the head\b/gi, 'Na cabeca'],
  [/\bOn head\b/gi, 'Na cabeca'],
  [/\bOn the face\b/gi, 'Na face'],
  [/\bOn face\b/gi, 'Na face'],
  [/\bOn the anterior aspect\b/gi, 'Na face anterior'],
  [/\bOn anterior aspect\b/gi, 'Na face anterior'],
  [/\bOn the posterior aspect\b/gi, 'Na face posterior'],
  [/\bOn posterior aspect\b/gi, 'Na face posterior'],
  [/\banterolateral aspect\b/gi, 'face anterolateral'],
  [/\bposterolateral aspect\b/gi, 'face posterolateral'],
  [/\banterior aspect\b/gi, 'face anterior'],
  [/\bposterior aspect\b/gi, 'face posterior'],
  [/\blower abdomen\b/gi, 'abdome inferior'],
  [/\bupper abdomen\b/gi, 'abdome superior'],
  [/\bcentre of the umbilicus\b/gi, 'centro do umbigo'],
  [/\bcenter of the umbilicus\b/gi, 'centro do umbigo'],
  [/\bcentre de umbilicus\b/gi, 'centro do umbigo'],
  [/\bcenter de umbilicus\b/gi, 'centro do umbigo'],
  [/\bumbilicus\b/gi, 'umbigo'],
  [/\banterior median line\b/gi, 'linha mediana anterior'],
  [/\bposterior median line\b/gi, 'linha mediana posterior'],
  [/\bmidline\b/gi, 'linha mediana'],
  [/\binferior to\b/gi, 'inferior a'],
  [/\bsuperior to\b/gi, 'superior a'],
  [/\blateral to\b/gi, 'lateral a'],
  [/\bmedial to\b/gi, 'medial a'],
  [/\banterior to\b/gi, 'anterior a'],
  [/\bposterior to\b/gi, 'posterior a'],
  [/\bin the depression\b/gi, 'na depressao'],
  [/\bdepression\b/gi, 'depressao'],
  [/\bbetween\b/gi, 'entre'],
  [/\bamong\b/gi, 'entre'],
  [/\bproximal portion\b/gi, 'porcao proximal'],
  [/\bdistal\b/gi, 'distal'],
  [/\bproximal\b/gi, 'proximal'],
  [/\blateral end\b/gi, 'extremidade lateral'],
  [/\bmedial end\b/gi, 'extremidade medial'],
  [/\bbase of the patella\b/gi, 'base da patela'],
  [/\bbase de patella\b/gi, 'base da patela'],
  [/\bpatella\b/gi, 'patela'],
  [/\bfibula\b/gi, 'fibula'],
  [/\btibia\b/gi, 'tibia'],
  [/\bmalleolus\b/gi, 'maleolo'],
  [/\bankle\b/gi, 'tornozelo'],
  [/\bwrist\b/gi, 'punho'],
  [/\bmetacarpal\b/gi, 'metacarpal'],
  [/\bmetatarsal\b/gi, 'metatarsal'],
  [/\btoe\b/gi, 'dedo do pe'],
  [/\bfinger\b/gi, 'dedo da mao'],
  [/\bnail\b/gi, 'unha'],
  [/\bradial\b/gi, 'radial'],
  [/\bulnar\b/gi, 'ulnar'],
  [/\bdorsal\b/gi, 'dorsal'],
  [/\bpalmar\b/gi, 'palmar'],
  [/\bplantar\b/gi, 'plantar'],
  [/\bmedial border\b/gi, 'borda medial'],
  [/\blateral border\b/gi, 'borda lateral'],
  [/\bmedial side\b/gi, 'lado medial'],
  [/\blateral side\b/gi, 'lado lateral'],
  [/\bon the line connecting\b/gi, 'na linha que conecta'],
  [/\bline connecting\b/gi, 'linha que conecta'],
  [/\brectus femoris muscle\b/gi, 'musculo reto femoral'],
  [/\bsartorius muscle\b/gi, 'musculo sartorio'],
  [/\btensor fasciae latae muscle\b/gi, 'musculo tensor da fascia lata'],
  [/\bvastus lateralis muscle\b/gi, 'musculo vasto lateral'],
  [/\bmuscle\b/gi, 'musculo'],
  [/\btendon\b/gi, 'tendao'],
  [/\bligament\b/gi, 'ligamento'],
  [/\bjoint\b/gi, 'articulacao'],
  [/\byuan qi\b/gi, 'Yuan Qi'],
  [/\bwei qi\b/gi, 'Wei Qi'],
  [/\bying qi\b/gi, 'Ying Qi'],
  [/\bqi\b/gi, 'Qi'],
  [/\bshen\b/gi, 'Shen'],
  [/\bxue\b/gi, 'Xue'],
  [/\byin\b/gi, 'Yin'],
  [/\byang\b/gi, 'Yang'],
  [/\bjing\b/gi, 'Jing'],
  [/\bjiao\b/gi, 'Jiao'],
  [/\bwind\b/gi, 'Vento'],
  [/\bcold\b/gi, 'Frio'],
  [/\bheat\b/gi, 'Calor'],
  [/\bdampness\b/gi, 'Umidade'],
  [/\bdamp\b/gi, 'Umidade'],
  [/\bphlegm\b/gi, 'Fleuma'],
  [/\bstagnation\b/gi, 'estagnacao'],
  [/\bdeficiency\b/gi, 'deficiencia'],
  [/\bexcess\b/gi, 'excesso'],
];

function uniqueBySource(items) {
  const seen = new Set();
  return items.filter(item => {
    const key = `${item.source}=>${item.ptBr}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function cleanPtBrTranslation(text) {
  return String(text || '')
    .replace(/\bOn\b/g, 'Em')
    .replace(/\bon\b/g, 'em')
    .replace(/\bis at same level\b/gi, 'esta no mesmo nivel')
    .replace(/\bis\b/gi, 'esta')
    .replace(/\band\b/gi, 'e')
    .replace(/\bthe\b/gi, '')
    .replace(/\ba centre\b/gi, 'ao centro')
    .replace(/\bde centro do umbigo\b/gi, 'do centro do umbigo')
    .replace(/\binferior a centro do umbigo\b/gi, 'inferior ao centro do umbigo')
    .replace(/\bsuperior a centro do umbigo\b/gi, 'superior ao centro do umbigo')
    .replace(/\binferior a o\b/gi, 'inferior ao')
    .replace(/\bsuperior a o\b/gi, 'superior ao')
    .replace(/\blateral a linha mediana anterior\b/gi, 'lateral a linha mediana anterior')
    .replace(/\blateral a linha mediana posterior\b/gi, 'lateral a linha mediana posterior')
    .replace(/\bmedial a linha mediana anterior\b/gi, 'medial a linha mediana anterior')
    .replace(/\bmedial a linha mediana posterior\b/gi, 'medial a linha mediana posterior')
    .replace(/\bporcao proximal de\b/gi, 'porcao proximal do')
    .replace(/\bde musculo\b/gi, 'do musculo')
    .replace(/\bde base da patela\b/gi, 'da base da patela')
    .replace(/\bde linha mediana\b/gi, 'da linha mediana')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/([,.;:])(?=\S)/g, '$1 ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function translateMtcDraftText(value = '') {
  let text = String(value || '');
  const glossaryHits = [];

  for (const [source, target] of DIRECT_REPLACEMENTS) {
    if (text.includes(source)) {
      glossaryHits.push({ source, ptBr: target });
      text = text.split(source).join(target);
    }
  }

  for (const [pattern, replacement] of CONTROLLED_GLOSSARY) {
    text = text.replace(pattern, match => {
      glossaryHits.push({ source: match, ptBr: replacement });
      return replacement;
    });
  }

  const unresolvedTerms = [];
  text = text.replace(CJK_CLUSTER_RE, match => {
    unresolvedTerms.push(match);
    return 'termo oriental pendente de traducao segura';
  });

  return {
    text: cleanPtBrTranslation(text),
    glossaryHits: uniqueBySource(glossaryHits),
    unresolvedTerms: [...new Set(unresolvedTerms)],
  };
}

export function translateMtcDraftTextValue(value = '') {
  return translateMtcDraftText(value).text;
}

export function getMtcDraftTranslationMeta(values = []) {
  const chunks = Array.isArray(values) ? values : [values];
  const translated = chunks.map(value => translateMtcDraftText(value));

  return {
    glossaryHits: uniqueBySource(translated.flatMap(item => item.glossaryHits)),
    unresolvedTerms: [...new Set(translated.flatMap(item => item.unresolvedTerms))],
  };
}
