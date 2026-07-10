import { displayPointCode, normalizePointCode } from './aliases';
import {
  getAuricularPoint,
  getKnowledgeSourceLabels,
  getPointByCode,
  getPointLabel,
} from './knowledgeBase';
import {
  getPointPageLanguageNotice,
  isPointPageContentAllowed,
} from './sourceLanguagePolicy';
import { isClinicallyActiveKnowledgeReview } from './reviewSourcePolicy';

const LIST_SPLITTERS = {
  actions: /(?:\s*•\s*|\.\s*,\s*|;\s*|\.\s+(?=[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ]))/u,
  indications: /(?:\s*•\s*|[,;]\s*|\.\s+(?=[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ]))/u,
  sentence: /(?:\s*•\s*|\.\s*,\s*|;\s*|\.\s+(?=[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ]))/u,
  generic: /(?:\s*•\s*|[,;]\s*)/u,
};

const OCR_TEXT_FIXES = [
  [/\btubcrosidadc\b/gi, 'tuberosidade'],
  [/\bmastóidoo\b/gi, 'mastóideo'],
  [/\bcstcmoclcidomastóideo\b/gi, 'esternocleidomastóideo'],
  [/\bestemocleidomastóideo\b/gi, 'esternocleidomastóideo'],
  [/\bponLos\b/g, 'pontos'],
  [/\bSegu\.indo\b/g, 'Seguindo'],
  [/\bbemicrania\b/gi, 'hemicrania'],
  [/\bvenigem\b/gi, 'vertigem'],
  [/\bconjuntÍV'd\b/g, 'conjuntiva'],
  [/\binfant\s+il\b/gi, 'infantil'],
  [/\bSlienting\b/g, 'Shenting'],
  [/\bhorizontal\s+j\s+que\b/gi, 'horizontal que'],
  [/\be0,5\b/g, 'e 0,5'],
  [/\bposr\.?:\s*terior\b/gi, 'posterior'],
  [/\s+ob\s+!;;(?=\s+linha\b)/gi, ''],
  [/\bYang\s+V\s+ei\b/g, 'Yang Wei'],
  [/\bconsciêocia\b/gi, 'consciência'],
  [/\bAcrõmlo\s+CV\s+li\s+CANA\s+L\s+0\[\s*,?\s*/g, ''],
  [/\bDeadrnan\b/g, 'Deadman'],
  [/\b0,\s*\.?\s*5\b/g, '0,5'],
  [/\ban\s+teriormente\b/gi, 'anteriormente'],
  [/\b1;\s*l\.?\s+cun\b/gi, '1,5 cun'],
  [/\btomo\?\.elo\b/gi, 'tornozelo'],
  [/\bpema\b/gi, 'perna'],
  [/\bhemíplegia\b/gi, 'hemiplegia'],
  [/\bs[íi]\s+ndrome\b/gi, 'síndrome'],
  [/\bcu\s+n\b/gi, 'cun'],
  [/\bYanglinquan\b/g, 'Yanglingquan'],
  [/D11bí/g, 'Dubi'],
  [/\bpare\s+ia\b/gi, 'patela'],
  [/\bf'êmur\b/gi, 'fêmur'],
  [/^\s*ace lateral\b/i, 'Face lateral'],
  [/([.;]\s*)ace lateral\b/gi, '$1Face lateral'],
  [/\bpopUtea\b/g, 'poplítea'],
  [/\bintumcscimento\b/gi, 'intumescimento'],
  [/í[l1]\s+exionar/gi, 'flexionar'],
  [/\besten-\s*6:\s*der\b/gi, 'estender'],
  [/^\s*lizar quatro dedos\b/gi, 'Localizar quatro dedos'],
  [/\bfTbula\b/g, 'fíbula'],
  [/\bf\s+orta\s+lece\b/gi, 'fortalece'],
  [/\bcontratur\.i\.\./gi, 'contratura'],
  [/\bcontratura,\s+de\s+pescoço\b/gi, 'contratura de pescoço'],
  [/\bri\s+nites\b/gi, 'rinites'],
  [/\bdistensão\/\s*ill\s+dor\b/gi, 'distensão/dor'],
  [/\btoráci-:\s*,?\s*ca\b/gi, 'torácica'],
  [/\bbemarológica\b/gi, 'hematológica'],
  [/\b1\s+c\s+1111\s+aci\s+ma\b/gi, '1 cun acima'],
  [/\bmdsculos\b/gi, 'músculos'],
  [/\bpares-\.*\s*tesias\b/gi, 'parestesias'],
  [/\bob\s*S:\s*/g, ''],
  [/\bneurol\s*óg\s*ica\b/gi, 'neurológica'],
  [/\bLent\s*ame\s*nt\s*e\b/gi, 'Lentamente'],
  [/\bRedu\s+za\s+fe\s+bre\b/gi, 'Reduz a febre'],
  [/\bcon\s+vu\s+lsões\b/gi, 'convulsões'],
  [/^\s*l,\s*febre\b/gi, 'febre'],
  [/([.;]\s*)l,\s*febre\b/gi, '$1febre'],
  [/\blontura\b/gi, 'tontura'],
  [/^\s*liuiç\s+ã-0\s+O,5\b/gi, '0,5'],
  [/\bO,5\b/g, '0,5'],
  [/\bShenniet1\b/g, 'Shenmen'],
  [/\bloc\s+ali\s+zação\b/gi, 'localização'],
  [/\btoma-se\b/gi, 'torna-se'],
  [/\bCon1ção\b/g, 'Coração'],
  [/\bfuncionai\s+s\b/gi, 'funcionais'],
  [/\bpalpitaçã\s+o\b/gi, 'palpitação'],
  [/\bsudoresc\b/gi, 'sudorese'],
  [/\btonsilitc\b/gi, 'tonsilite'],
  [/\bbematêmese\b/gi, 'hematêmese'],
  [/\bneurasteaia\b/gi, 'neurastenia'],
  [/\ba0,5\b/g, 'a 0,5'],
  [/\b0,5\s+a\)\s*Cllfl\b/g, '0,5 a 1 cun'],
  [/\bCllfl\b/g, 'cun'],
  [/\bTV\s+e\s+V\b/g, 'IV e V'],
  [/\bmetatarsais\s+JJ\s+e\s+rn\b/gi, 'metatarsais II e III'],
  [/\btrans\s+ição\b/gi, 'transição'],
  [/\bintermação,\s*l\s+convulsão\b/gi, 'intermação, convulsão'],
  [/\bdorde\s+garganta\b/gi, 'dor de garganta'],
  [/\bespasmo\s+s\/\s*paralisia\b/gi, 'espasmos/paralisia'],
  [/\bnos::,\s*i\s+pés\b/gi, 'nos pés'],
  [/\.\.\s*&,\s*/g, ''],
  [/\bhipcnensão\b/gi, 'hipertensão'],
  [/\bepileps\s+ia\b/gi, 'epilepsia'],
  [/\.\s+[A-Z]$/g, '.'],
  [/\banteroinferio\s+nn\s+e\s+nte\b/gi, 'anteroinferiormente'],
  [/\bdeprcs\.\.;ão\b/gi, 'depressão'],
  [/\bintr\.i-articular\b/gi, 'intra-articular'],
  [/\biafcrior\b/gi, 'inferior'],
  [/\bGongs1111\b/g, 'Gongsun'],
  [/\bQidoJiao\b/g, 'Qi do Jiao'],
  [/\b00,\s*/g, ''],
  [/\s*remove\s+"'\s+a\s+Umidade\.:::\s*s,\s*Elimina\b/gi, ' remove a Umidade. Elimina'],
  [/^\s*ro,\s*/gi, ''],
  [/([.;]\s*)ro,\s*/gi, '$1'],
  [/\bmiocardile\b/gi, 'miocardite'],
  [/\bdor\s*\/co\s+ngestão\b/gi, 'dor/congestão'],
  [/\bcnurese\b/gi, 'enurese'],
  [/\bcolo\s+ração\b/gi, 'coloração'],
  [/\bhipo\s+cô\s+ndrio\s+s\b/gi, 'hipocôndrios'],
  [/\bhe\s*-\s*patite\b/gi, 'hepatite'],
  [/\bvertigen\s+s\b/gi, 'vertigens'],
  [/\bneurile\s+sacra!/gi, 'neurite sacral'],
  [/\bafccções\b/gi, 'afecções'],
  [/\boculares\.congestão\b/gi, 'oculares, congestão'],
  [/\bh\s+ér\s+nia\b/gi, 'hérnia'],
  [/\bfa\s+cial\b/gi, 'facial'],
  [/\bpardlisia\b/gi, 'paralisia'],
  [/\bconvu\s+lsão\b/gi, 'convulsão'],
  [/dist\\1rbios/gi, 'distúrbios'],
  [/\bson\s+o\b/gi, 'sono'],
  [/\bCa\s+nal\b/g, 'Canal'],
  [/\bmlisculos\b/gi, 'músculos'],
  [/\bmlisculo\b/gi, 'músculo'],
  [/\bmõsculos\b/gi, 'músculos'],
  [/\bmõsculo\b/gi, 'músculo'],
  [/\bafecçõcs\b/gi, 'afecções'],
  [/\bepistaxc\b/gi, 'epistaxe'],
  [/\bc1\s*m\b/gi, 'cun'],
  [/\ba2cu\s*n\b/gi, 'a 2 cun'],
  [/\ba2cun\b/gi, 'a 2 cun'],
  [/\bO\$\s+a\b/g, '0,5 a'],
  [/\b([0-9]),([0-9])\s*am\b/gi, '$1,$2 cun'],
  [/\b1a\s+1,5\s*cun\b/gi, '1 a 1,5 cun'],
  [/\bTon\s*ifi\s*ca\b/g, 'Tonifica'],
  [/\bton\s*ifi\s*ca\b/g, 'tonifica'],
  [/\bToni\s+fica\b/gi, 'Tonifica'],
  [/\bTonilica\b/gi, 'Tonifica'],
  [/\bdifund\s+ee\s+regula\b/gi, 'difunde e regula'],
  [/\bDi\s+spersa\b/g, 'Dispersa'],
  [/\bgastri\s+te\b/gi, 'gastrite'],
  [/\bingestã\s+o\b/gi, 'ingestão'],
  [/\bdi\s+senteria\b/gi, 'disenteria'],
  [/\bestufa1nentofdor\/diste\s+ns\s+ão\s+abdon1inal\b/gi, 'estufamento/dor/distensão abdominal'],
  [/\bccrebrovascular\b/gi, 'cerebrovascular'],
  [/\bd\s+istú\s+rbios\b/gi, 'distúrbios'],
  [/\bconvul\s+sões\b/gi, 'convulsões'],
  [/&tômago/gi, 'Estômago'],
  [/\bl\s+a\s+2\s+cun\b/gi, '1 a 2 cun'],
  [/\bdi\s+sme\s+norrcia\b/gi, 'dismenorreia'],
  [/\bfrequên\s+cia\b/gi, 'frequência'],
  [/\bHuxo\b/g, 'fluxo'],
  [/\boJíao\b/g, 'o Jiao'],
  [/\bIn\s+fe\s+rior\b/g, 'Inferior'],
  [/Qí/g, 'Qi'],
  [/\biltero\b/gi, 'útero'],
  [/\bNo\s+ta\b/g, 'Nota'],
  [/\boa\s+linha\b/gi, 'na linha'],
  [/\blo\s+calização\b/gi, 'localização'],
  [/\bNota\s+tk\s+localiwção\b/gi, 'Nota de localização'],
  [/\bCap\.\s*l\b/g, 'Cap. 1'],
  [/,([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ])/g, ', $1'],
  [/,([a-zà-ú])/g, ', $1'],
  [/\bestemocostal\b/gi, 'esternocostal'],
  [/\bcst?e?mocostal\b/gi, 'esternocostal'],
  [/\bcstcmocostal\b/gi, 'esternocostal'],
  [/\bcostel\s+as\b/gi, 'costelas'],
  [/\bsó\)jda\b/gi, 'sólida'],
  [/\bdizern\b/gi, 'dizem'],
  [/\blocaliz\.c\b/gi, 'localize'],
  [/\be\s+liminando\b/gi, 'eliminando'],
  [/\btór\.ix\b/gi, 'tórax'],
  [/\bpalpitaçõe\s+s\b/gi, 'palpitações'],
  [/\ba\s+l\s+cun\b/gi, 'a 1 cun'],
  [/\bvô\s+rnito\b/gi, 'vômito'],
  [/\bRe11\s+Mai\b/g, 'Ren Mai'],
  [/\bda\s+s\s+cordas\b/gi, 'das cordas'],
  [/\bvocai\s+s\b/gi, 'vocais'],
  [/\ba\.\s*1\s*ivia\b/gi, 'alivia'],
  [/\bperpend\.icular\b/gi, 'perpendicular'],
  [/\bpenetrar(?=\d)/gi, 'penetrar '],
  [/\b0\.([0-9])\b/g, '0,$1'],
  [/\bBiJiar\b/g, 'Biliar'],
  [/\barticuJações\b/g, 'articulações'],
  [/\bExempl-0s\b/g, 'Exemplos'],
  [/\blG-/g, 'IG-'],
  [/\b1G-34\b/g, 'VB-34'],
  [/,([A-Z]{1,3}-\d+)/g, ', $1'],
  [/\bRen-\s+/g, 'Ren-'],
  [/\bIG-\s+/g, 'IG-'],
  [/:([a-zà-ú])/g, ': $1'],
  [/^\s*ionadas ao\b/gi, 'relacionadas ao'],
  [/([.;]\s*)ionadas ao\b/gi, '$1relacionadas ao'],
  [/\belimi\s+na\b/gi, 'elimina'],
  [/\bVesícula\s+Bilia\b/g, 'Vesícula Biliar'],
  [/\(H\s+e\)/g, '(He)'],
  [/\bHu\s+i\b/g, 'Hui'],
  [/\besquizofre-::?\s*h\s+nia\b/gi, 'esquizofrenia'],
  [/\b1\s+nemória\s+S:\s+fraca\b/gi, 'memória fraca'],
  [/ãnus/gi, 'ânus'],
  [/\bN\s+eiguan\b/g, 'Neiguan'],
  [/\bF\s+ec\s+hadura\b/g, 'Fechadura'],
  [/\bmúscu\s+los\b/gi, 'músculos'],
  [/\banéria\b/gi, 'artéria'],
  [/^\s*istema cardiovascular\b/i, 'sistema cardiovascular'],
  [/([,;]\s*)istema cardiovascular\b/gi, '$1sistema cardiovascular'],
  [/\bcardfaca\b/gi, 'cardíaca'],
  [/\bpericarditc\b/gi, 'pericardite'],
  [/\btó-\s*,?\s*rax\b/gi, 'tórax'],
  [/\bhipocôodrio\b/gi, 'hipocôndrio'],
  [/\bepiga5tralgia\b/gi, 'epigastralgia'],
  [/\bhematêmcsc\b/gi, 'hematêmese'],
  [/\bbipertireoidismo\b/gi, 'hipertireoidismo'],
  [/\bhistcrcctomia\b/gi, 'histerectomia'],
  [/\bWaig11an\b/g, 'Waiguan'],
  [/\btrat\s+ar\b/gi, 'tratar'],
  [/\bou\s+l\s+a\b/gi, 'ou 1 a'],
  [/\bpalela\b/gi, 'patela'],
  [/\bco\s+nexão\b/gi, 'conexão'],
  [/\bEstômagoehannonÍ7\.ao\s*QidoJiaoMédio\b/g, 'Estômago e harmoniza o Qi do Jiao Médio'],
  [/\bQidoJiaoMédio\b/g, 'Qi do Jiao Médio'],
  [/\bAcómulo\b/g, 'Acúmulo'],
  [/\(\s*X1\s*\)/g, '(Xi)'],
  [/\bB-\s*35\s*\(Dubi\)/g, 'E-35 (Dubi)'],
  [/\b7íaokou\b/g, 'Tiaokou'],
  [/\bexte\s+nsor\b/gi, 'extensor'],
  [/\bmrugem\b/gi, 'margem'],
  [/\buôia\b/gi, 'tíbia'],
  [/\bSlu111\.\s*r\b/g, 'Shen'],
  [/\bpatogênico\.:6\b/gi, 'patogênico'],
  [/\bEs\s+tômago\b/g, 'Estômago'],
  [/\bu\s+CD\s+u\s+CD\b/g, ''],
  [/\binseição\b/gi, 'inserção'],
  [/\baitila\b/gi, 'axila'],
  [/\binserçãooblíquaemdireçãoaoeotovelo\b/gi, 'inserção oblíqua em direção ao cotovelo'],
  [/\bperpendicular direto\b/gi, 'perpendicular direta'],
  [/\bRCN\s+MAi\s*\(\s*\)\s*\d{2,4}\b/g, ''],
  [/\btendões\.\s+VI\b/g, 'tendões.'],
  [/\bFa\s+ce\b/g, 'Face'],
  [/\bfa\s+ce\b/g, 'face'],
  [/\bYa11g\s*ch[1t]\b/gi, 'Yangchi'],
  [/\bNeigua11\b/g, 'Neiguan'],
  [/\bepioôndilo\b/gi, 'epicôndilo'],
  [/\be\s+nue\s+rádio\b/gi, 'entre rádio'],
  [/\bHarmoni\s+za\b/g, 'Harmoniza'],
  [/\bharmoni\s+za\b/g, 'harmoniza'],
  [/\bRe\s+laxa\b/g, 'Relaxa'],
  [/\bre\s+laxa\b/g, 'relaxa'],
  [/\biridocicUte\b/gi, 'iridociclite'],
  [/\bretioite\b/gi, 'retinite'],
  [/\bne\s*\.\s*rvo\b/gi, 'nervo'],
  [/\bconjuntivit\s+e\b/gi, 'conjuntivite'],
  [/\bepidêm\.ica\b/gi, 'epidêmica'],
  [/\banralgias\b/gi, 'artralgias'],
  [/\btranstornos\s+1\s+notores\b/gi, 'transtornos motores'],
  [/\barticulações\/\s+paralisia\b/gi, 'articulações, paralisia'],
  [/\bbraço\.\s+dor torácica\b/gi, 'braço, dor torácica'],
  [/\be\s+nxaqueca\b/gi, 'enxaqueca'],
  [/\brin\s+ite\b/gi, 'rinite'],
  [/\bdes\s+maios\b/gi, 'desmaios'],
  [/\bes\s+te\s+ponto\b/gi, 'este ponto'],
  [/^\s*lização\s+(?=[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ])/g, ''],
  [/\bd\s+edo\b/g, 'dedo'],
  [/\bD\s+edo\b/g, 'Dedo'],
  [/\bu\s+ma\b/g, 'uma'],
  [/\bU\s+ma\b/g, 'Uma'],
  [/\bo\s+ri\s*fícios\b/gi, 'orifícios'],
  [/\bs\s+índromes\b/gi, 'síndromes'],
  [/\bYa\s*n\s*g\b/g, 'Yang'],
  [/\bVento\s*-\s*F\s*rio\b/g, 'Vento-Frio'],
  [/\bR\s*eg\s*u\s*l\s*ari[il]a\b/g, 'Regulariza'],
  [/\bR\s*eg\s*u\s*l\s*ariia\b/g, 'Regulariza'],
  [/\btranstor-\s*nos\b/gi, 'transtornos'],
  [/\bdoenças\s+['°]+\s*cerebrais\b/gi, 'doenças cerebrais'],
  [/\batrofia\s+'l'\s+do\b/gi, 'atrofia do'],
  [/\bNota de localizacao:\s*(?:lir\.ação|li\s*wção)\s+/gi, 'Nota de localizacao: '],
  [/\bNota de localizacao:\s*lização\s+/gi, 'Nota de localizacao: '],
  [/\bNota de localização:\s*lização\s+/gi, 'Nota de localização: '],
  [/\bNota de localizacao:/g, 'Nota de localização:'],
  [/\bexten\s+sor\b/gi, 'extensor'],
  [/\baniculação\b/gi, 'articulação'],
  [/\bpartirdes-\s*ta\b/gi, 'partir desta'],
  [/\bproximai\s+s\b/gi, 'proximais'],
  [/\bcm\s+quatro\b/gi, 'em quatro'],
  [/\s*(?:CANAL\s+[OD]E\s+ENERGIA\s+DO\s+SAN(?:\s+JIAO)?\s*)?\]\s*\/\s*$/gi, ''],
  [/\s*(?:[-.]\s*)?\/(?:\s*\/|\s*[-.()]*)*$/g, ''],
];

function isPlaceholderItem(value) {
  return /^(Funções\/ações não confirmadas|Indicações não confirmadas|Padrões MTC não inferidos|Não aplicável:|Técnica não localizada)/i.test(String(value || ''));
}

function cleanClinicalText(value) {
  if (typeof value !== 'string') return value;
  let text = value;

  for (const [pattern, replacement] of OCR_TEXT_FIXES) {
    text = text.replace(pattern, replacement);
  }

  return text
    .replace(/([A-Za-zÀ-ú])-\s+([a-zà-ú])/g, '$1$2')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/,\s*(?:\.\s*,?\s*)+/g, ', ')
    .replace(/\.\s*,\s*/g, '. ')
    .replace(/,\s*,+/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function cleanListItem(value) {
  return cleanClinicalText(String(value || ''))
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/^[,.;:\s]+|[,.;:\s]+$/g, '')
    .trim();
}

function asList(value, mode = 'generic') {
  if (Array.isArray(value)) return value.flatMap(item => asList(item, mode));
  if (!value) return [];

  const text = cleanListItem(value);
  if (!text) return [];
  if (isPlaceholderItem(text)) return [text];

  const splitter = LIST_SPLITTERS[mode] || LIST_SPLITTERS.generic;
  return text
    .split(splitter)
    .map(cleanListItem)
    .filter(Boolean);
}

function asClinicalList(value, mode = 'generic') {
  return asList(value, mode).filter(item => !isPlaceholderItem(item));
}

function reviewMatchesPoint(review, pointKey) {
  const normalized = normalizePointCode(pointKey);
  return normalizePointCode(review?.code) === normalized || normalizePointCode(review?.displayCode) === normalized;
}

function findApprovedReview(pointKey, reviews = []) {
  return (reviews || []).find(review => {
    return isClinicallyActiveKnowledgeReview(review) && reviewMatchesPoint(review, pointKey);
  }) || null;
}

// Completa a referencia do Atlas (indice visual) com a pagina do proprio review
// quando o indice nao tiver (ex.: pontos extra como Yintang/Taiyang), para que a
// citacao "livro + pagina" apareca sempre que a pagina existir.
function mergeAtlasReference(atlasReference, review) {
  const reviewAtlas = Array.isArray(review?.enrichment?.atlasReference)
    ? review.enrichment.atlasReference[0]
    : null;
  if (!atlasReference && !reviewAtlas) return atlasReference || null;

  const merged = atlasReference ? { ...atlasReference } : {};
  if (!merged.printedPages?.length && reviewAtlas?.page?.length) merged.printedPages = reviewAtlas.page;
  if (!merged.pdfPages?.length && reviewAtlas?.pdfPage?.length) merged.pdfPages = reviewAtlas.pdfPage;
  if (!merged.referenceLabel) merged.referenceLabel = reviewAtlas?.source || 'Atlas Ednea Martins';
  return merged;
}

function buildFromReview(review, patternName, atlasReferenceParam) {
  const atlasReference = mergeAtlasReference(atlasReferenceParam, review);
  const normalized = normalizePointCode(review.code || review.displayCode);
  const displayCode = review.displayCode || displayPointCode(normalized);
  const canShowClinicalContent = isPointPageContentAllowed(review);
  const languageNotice = getPointPageLanguageNotice(review);
  const actions = canShowClinicalContent ? asClinicalList(review.actions, 'actions') : [];
  const relatedPatterns = canShowClinicalContent ? asClinicalList(review.relatedPatterns, 'sentence') : [];
  const isHighConfidenceApproval = review.approvalMethod === 'bulk_high_confidence_operator_request';
  const dataOrigin = !canShowClinicalContent
    ? 'Biblioteca Viva (aguardando pt-BR)'
    : isHighConfidenceApproval
      ? 'Biblioteca Viva (alta confiança)'
      : 'Biblioteca Viva';

  return {
    code: normalized,
    displayCode,
    name: canShowClinicalContent
      ? cleanClinicalText(review.title || `${displayCode} - Ponto revisado`)
      : `${displayCode} - Conteudo em curadoria pt-BR`,
    meridian: review.meridian || review.meridianCode || '',
    locationText: canShowClinicalContent ? cleanClinicalText(review.locationText || '') : '',
    actions,
    indications: canShowClinicalContent ? asClinicalList(review.indications, 'indications') : [],
    cautions: canShowClinicalContent ? asClinicalList(review.cautions) : [],
    relatedPatterns,
    techniques: canShowClinicalContent ? asClinicalList(review.techniques) : [],
    needling: canShowClinicalContent && !isPlaceholderItem(review.needling) ? cleanClinicalText(review.needling || '') : '',
    clinicalNote: canShowClinicalContent ? cleanClinicalText(review.clinicalNote || '') : languageNotice,
    languagePolicyNotice: languageNotice,
    why: !canShowClinicalContent
      ? `${displayCode} tem fonte vinculada, mas a ficha clinica aguarda sintese pt-BR revisada.`
      : patternName && relatedPatterns.includes(patternName)
      ? `${displayCode} foi aprovado na Biblioteca Viva e se relaciona com ${patternName}.`
      : `${displayCode} foi aprovado na Biblioteca Viva para consulta clínica.`,
    sources: [
      review.source || 'Biblioteca Viva',
      ...(atlasReference?.referenceLabel ? [atlasReference.referenceLabel] : []),
    ].filter(Boolean),
    reviewStatus: review.status,
    dataOrigin,
    updatedAt: review.updatedAt || review.createdAt || '',
    atlasReference,
  };
}

function buildFromBodyPoint(point, patternName, atlasReference) {
  const displayCode = point.displayCode || displayPointCode(point.code);
  const actions = point.actions || [];

  return {
    code: point.code,
    displayCode,
    name: `${displayCode} — ${point.names?.pt || point.names?.en || displayCode}`,
    meridian: point.meridian?.pt || '',
    locationText: point.locationText || '',
    actions,
    indications: point.indications || [],
    cautions: point.cautions || [],
    relatedPatterns: point.relatedPatterns || [],
    techniques: point.techniques || [],
    needling: point.needling || '',
    clinicalNote: '',
    why: point.relatedPatterns?.includes(patternName)
      ? `${displayCode} se relaciona com ${patternName} por suas funções: ${actions.slice(0, 3).join(', ')}.`
      : 'Ponto curado como apoio ao princípio terapêutico do protocolo.',
    sources: [
      ...getKnowledgeSourceLabels(point),
      ...(atlasReference?.referenceLabel ? [atlasReference.referenceLabel] : []),
    ],
    reviewStatus: point.approval?.status || 'review',
    dataOrigin: 'Base curada',
    updatedAt: '',
    atlasReference,
  };
}

function buildFromAuricularPoint(point, patternName) {
  const actions = point.actions || [];
  return {
    code: point.code,
    displayCode: point.name,
    name: `Aurículo — ${point.name}`,
    meridian: 'Auriculoterapia',
    locationText: point.locationText || '',
    actions,
    indications: point.indications || [],
    cautions: [],
    relatedPatterns: point.relatedPatterns || [],
    techniques: ['auriculoterapia'],
    needling: '',
    clinicalNote: '',
    why: point.relatedPatterns?.includes(patternName)
      ? `${point.name} apoia ${patternName} por ${actions.slice(0, 2).join(', ')}.`
      : 'Ponto auricular complementar ao raciocínio energético.',
    sources: getKnowledgeSourceLabels(point),
    reviewStatus: point.approval?.status || 'review',
    dataOrigin: 'Base curada',
    updatedAt: '',
    atlasReference: null,
  };
}

export function buildPointDetail({ pointKey, patternName, reviews = [], atlasReference = null } = {}) {
  const approvedReview = findApprovedReview(pointKey, reviews);
  if (approvedReview) return buildFromReview(approvedReview, patternName, atlasReference);

  const bodyPoint = getPointByCode(pointKey);
  if (bodyPoint) return buildFromBodyPoint(bodyPoint, patternName, atlasReference);

  const auricularPoint = getAuricularPoint(pointKey);
  if (auricularPoint) return buildFromAuricularPoint(auricularPoint, patternName);

  const normalized = normalizePointCode(pointKey);
  return {
    code: normalized,
    displayCode: displayPointCode(normalized),
    name: getPointLabel(pointKey),
    meridian: '',
    locationText: '',
    actions: [],
    indications: [],
    cautions: [],
    relatedPatterns: [],
    techniques: [],
    needling: '',
    clinicalNote: '',
    why: 'Informação completa depende de revisão na Biblioteca Viva.',
    sources: atlasReference?.referenceLabel ? [atlasReference.referenceLabel] : [],
    reviewStatus: 'review_needed',
    dataOrigin: 'Pendente',
    updatedAt: '',
    atlasReference,
  };
}
