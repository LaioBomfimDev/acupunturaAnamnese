#!/usr/bin/env node
// Limpeza de ruido de OCR nos campos clinicos dos PONTOS COMUMENTE USADOS.
//
// Por que existe: os reviews do Atlas Ednea (high-confidence / deep-curated) foram
// extraidos por OCR e chegam com palavras quebradas, cabecalhos/rodapes de pagina
// injetados no meio do texto e numeros trocados. O modal de detalhe do ponto
// (PointReviewDialog) exibe esses campos crus. Esta ferramenta corrige o que e
// INEQUIVOCO (ruido sistematico + dicionario de OCR revisado a mao) e REGISTRA
// duvidas para auditoria do acupunturista, sem inventar conteudo clinico.
//
// Escopo: somente os codigos da categoria "Pontos comumente usados" e somente os
// campos de texto clinico. Mantem auditoria em review.ocrCleanup e gera worksheet
// de duvidas em docs/common-points-ocr-doubts.md.
//
// Uso:
//   node tools/knowledge/clean-common-points-ocr.mjs --dry   (so relatorio, nao grava)
//   node tools/knowledge/clean-common-points-ocr.mjs         (grava JSONs + worksheet)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const HIGH = path.join(ROOT, 'frontend/.local-source-assets/atlas-ednea/high-confidence-reviews.json');
const DEEP = path.join(ROOT, 'frontend/.local-source-assets/atlas-ednea/deep-curated-reviews.json');
const COMMON = path.join(ROOT, 'frontend/src/knowledge/commonlyUsedPoints.js');
const WORKSHEET = path.join(ROOT, 'docs/common-points-ocr-doubts.md');

const DRY = process.argv.includes('--dry');

const TEXT_FIELDS = ['locationText', 'actions', 'indications', 'cautions', 'relatedPatterns', 'needling', 'clinicalNote'];
const CLEAN_CLINICAL_SOURCES = new Set(['reocr_atlas', 'deep_curated_clean']);
const CLEAN_SOURCE_LABELS = {
  reocr_atlas: 'reocr_atlas — leitura direta/re-OCR manual do Atlas',
  deep_curated_clean: 'deep_curated_clean — curadoria profunda limpa equivalente',
};

function normCode(c) {
  return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function loadCommonCodes() {
  const src = fs.readFileSync(COMMON, 'utf8');
  const codes = [...src.matchAll(/code:\s*'([^']+)'/g)].map(m => m[1]);
  return new Set([...new Set(codes)].map(normCode));
}

// ── Regras sistematicas (ruido inequivoco, nao e conteudo clinico) ───────────
function stripRunningHeads(text) {
  let t = text;
  // Cabecalho/rodape de pagina injetado: "( TA/YANG DO PE ) - 361", "( ) - 285",
  // "CANAL DE ENERGIA DO CORACAO (SHAOYIN DA MAO) - 285", "( TA/ E ) - 383".
  // Opcionalmente precedido por um trecho em CAIXA ALTA (nome do canal).
  t = t.replace(/\s*(?:[A-ZÀ-Ú][A-ZÀ-Ú/]*(?:\s+[A-ZÀ-Ú/]+)*\s*)?\(\s*[^)]*\)\s*-\s*\d{2,4}\b/g, ' ');
  // Numero de pagina solto colado: " - 285" / " . 285" remanescente.
  // Preserva codigos de ponto com espaco no OCR, como "VB -34" ou "Ren -12".
  t = t.replace(/(\b[A-ZÀ-Ú][A-ZÀ-Úa-zà-ú]{0,3})?\s[-.]\s*\d{2,4}\b(?=\s|,|\.|$)/g, (m, code) => (code ? m : ' '));
  return t;
}

// Dicionario de correcoes de OCR revisadas a mao. Cada par e [regex, troca].
// Ordem importa. Mantido conservador: so trocas onde a leitura correta e clara
// pelo contexto. Trechos ambiguos NAO sao trocados aqui; viram duvida.
const WORD_FIXES = [
  // medidas (cun) e fracoes
  [/\bcufl\b/g, 'cun'],
  [/\bc\s*1\s*1?\s*1\b/g, 'cun'],
  [/\bc\s*1\s*1?\s*n\b/g, 'cun'],
  [/\bc\s*1m\b/g, 'cun'],
  [/\bc\s*11n\b/g, 'cun'],
  [/\bc\s+un\b/g, 'cun'],
  [/\bc\s+1m\b/g, 'cun'],
  [/([0-9])\s*[:.]\s*S\b/g, '$1,5'],        // 1:S -> 1,5 ; O:S tratado abaixo
  [/\bO\s*[:.]\s*S\b/g, '0,5'],
  [/\bl\s*[:.]\s*S\b/g, '1,5'],
  [/\bc1\s*m\b/gi, 'cun'],
  [/\ba2cu\s*n\b/gi, 'a 2 cun'],
  [/\ba2cun\b/gi, 'a 2 cun'],
  [/\bO\$\s+a\b/g, '0,5 a'],
  [/\b([0-9]),([0-9])\s*am\b/gi, '$1,$2 cun'],
  [/\b1a\s+1,5\s*cun\b/gi, '1 a 1,5 cun'],

  // "cm" usado como OCR de "em" (este atlas usa cun, nunca cm)
  [/\bcm\b/g, 'em'],

  // termos clinicos frequentes
  [/\bCa\s*l?\s*or\b/g, 'Calor'],
  [/\bca\s*l\s*or\b/g, 'calor'],
  [/\bPu\s*lm[íi]lo\b/gi, 'Pulmão'],
  [/\bPu\s*lm[ãa]o\b/gi, 'Pulmão'],
  [/\bm[li]lsculo\b/gi, 'músculo'],
  [/\bli1npcza\b/gi, 'limpeza'],
  [/\bMu\s*cosidade\b/g, 'Mucosidade'],
  [/\bmu\s*cosidade\b/g, 'mucosidade'],
  [/\blfngua\b/gi, 'língua'],
  [/\besclcr[óo]tica\b/gi, 'esclerótica'],
  [/\bAtencao\b/g, 'Atenção'],
  [/\bTraosfonna\b/g, 'Transforma'],
  [/\bcransfonna(ç|c)[ãa]o\b/gi, 'transformação'],
  [/\btransfonna(ç|c)[ãa]o\b/gi, 'transformação'],
  [/\bf\s*un\s*[çc][ãa]o\b/gi, 'função'],

  // Yin/Ying/Yuan
  [/\bYi11g\b/g, 'Ying'],
  [/\bYi11\b/g, 'Yin'],
  [/\bYt1an\b/g, 'Yuan'],

  // juncao de hifen de quebra de linha em palavras obvias
  [/patog[êe]-\s*nico/gi, 'patogênico'],
  [/pi-\s*siforme/gi, 'pisiforme'],
  [/para-\s*lisia/gi, 'paralisia'],

  // espacos espurios dentro de palavras comuns do atlas
  [/\bart\s*i\s*cu\s*la(ç|c)/gi, 'articula$1'],
  [/\bcirc\s*ul\s*a(ç|c)[ãa]o\b/gi, 'circulação'],
  [/\bSa\s+n\s*gue\b/g, 'Sangue'],
  [/\bsa\s+n\s*gue\b/g, 'sangue'],
  [/\bE\s*ne\s*r?\s*gia\b/g, 'Energia'],
  [/\ben\s*ergia\b/g, 'energia'],
  [/\bve\s*rt\s*ebral\b/gi, 'vertebral'],
  [/\bco\s+luna\b/gi, 'coluna'],
  [/\bs\s+uperficial\b/gi, 'superficial'],
  [/\bExt\s*er\s*ioriza\b/g, 'Exterioriza'],
  [/\bFo\s*rtalece\b/g, 'Fortalece'],
  [/\bpat\s*ogê\s*ni\s*co\b/gi, 'patogênico'],
  [/\bpatogê\s*ni\s*co\b/gi, 'patogênico'],
  [/\be?\s*x\s*ce\s*ssiva\b/gi, 'excessiva'],
  [/\bJ\s+iao\b/g, 'Jiao'],
  [/\bafecçõcs\b/gi, 'afecções'],
  [/\bhipocond[áa]aca\b/gi, 'hipocondríaca'],
  [/\bidoso\s+s\b/g, 'idosos'],
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
  [/\btubcrosidadc\b/gi, 'tuberosidade'],
  [/\bmastóidoo\b/gi, 'mastóideo'],
  [/\bcstcmoclcidomastóideo\b/gi, 'esternocleidomastóideo'],
  [/\bestemocleidomastóideo\b/gi, 'esternocleidomastóideo'],
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
  [/\bdes\s+maios\b/gi, 'desmaios'],
  [/\bes\s+te\s+ponto\b/gi, 'este ponto'],
  [/\bNota de localização este ponto\b/g, 'Nota de localização Este ponto'],
  [/^\s*lização\s+(?=[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ])/g, ''],
  [/\bd\s+edo\b/g, 'dedo'],
  [/\bD\s+edo\b/g, 'Dedo'],
  [/\bu\s+ma\b/g, 'uma'],
  [/\bU\s+ma\b/g, 'Uma'],
  [/\bs\s+índromes\b/gi, 'síndromes'],
  [/\bo\s+ri\s*fícios\b/gi, 'orifícios'],
  [/\bVento\s*-\s*F\s*rio\b/g, 'Vento-Frio'],
  [/\btranstor-\s*nos\b/gi, 'transtornos'],
  [/\batrofia\s+'l'\s+do\b/gi, 'atrofia do'],
  [/\bdoenças\s+['°]+\s*cerebrais\b/gi, 'doenças cerebrais'],
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

  // quarto lote de pontos comuns revisado contra o texto extraido do Atlas
  [/\bPonto\s+Mudo\s+([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][a-zà-ú]+)/g, 'Ponto Mu do $1'],
  [/\bEn\s+co\s+ntro\b/gi, 'Encontro'],
  [/\bCana\s+is\b/gi, 'Canais'],
  [/\bCana\s+l\b/gi, 'Canal'],
  [/\bManancia\s+l\b/gi, 'Manancial'],
  [/\blnt\s+es\s+ún\s+o\b/gi, 'Intestino'],
  [/\bYang\s+W\s+e\/\s+Mar\b/g, 'Yang Wei Mai'],
  [/\bExempÚ\s*s\b/g, 'Exemplos'],
  [/\btuberculose\.\s+IG$/g, 'tuberculose.'],
  [/\bmilscu\s+lo\b/gi, 'músculo'],
  [/\bYang111ing\b/g, 'Yangming'],
  [/(^|[.;]\s*)ical tuberculosa\b/gi, '$1Linfadenite cervical tuberculosa'],
  [/\bbemiplegia\b/gi, 'hemiplegia'],
  [/\bVente\s*-\s*Umidade\b/gi, 'Vento-Umidade'],
  [/\bdesequihôrio\b/gi, 'desequilíbrio'],
  [/\bhiper-\s*hidr<>\s*-\s*se\b/gi, 'hiperhidrose'],
  [/\bhiperhidr\s*-\s*se\b/gi, 'hiperhidrose'],
  [/\bJGl\s*9\b/g, 'IG-19'],
  [/\bcu\s+11\b/gi, 'cun'],
  [/\bobliqua\b/gi, 'oblíqua'],
  [/\bTraia\b/g, 'Trata'],
  [/\bepisraxe\b/gi, 'epistaxe'],
  [/\bramo\s+Il\b/g, 'ramo II'],
  [/\bl\s+cun\b/g, '1 cun'],
  [/\btcnar\b/gi, 'tenar'],
  [/\bencon-\s*t\s*rar\b/gi, 'encontrar'],
  [/\bencont\s+rar\b/gi, 'encontrar'],
  [/\bcent\s+ro\b/gi, 'centro'],
  [/\bPubnão\b/g, 'Pulmão'],
  [/\bh\s+emo\s+pt\s+ise\b/gi, 'hemoptise'],
  [/\bas\s+ma\b/gi, 'asma'],
  [/\btubercul\s+ose\b/gi, 'tuberculose'],
  [/\binOamação\b/gi, 'inflamação'],
  [/\blaringofaringit\s+e\b/gi, 'laringofaringite'],
  [/\bfe-\s*["'.:;]*\s*o\s+bre\b/gi, 'febre'],
  [/\bte-\s*[:;.]*\s*i?\.?\s*o+\s*o*ssinuvite\b/gi, 'tenossinovite'],
  [/\bloc\s+alir\.?açã\s*o\b/gi, 'localização'],
  [/\blo\s+cal\s+ização\b/gi, 'localização'],
  [/\bsit\s+ua-se\b/gi, 'situa-se'],
  [/\bPulmã\s+o\b/g, 'Pulmão'],
  [/\borillcios\b/gi, 'orifícios'],
  [/\bcronica\b/gi, 'crônica'],
  [/\bparotiditc\b/gi, 'parotidite'],
  [/\bp\s+icose\b/gi, 'psicose'],
  [/\biofantil\b/gi, 'infantil'],
  [/\bpard\b/gi, 'para'],
  [/\bpan1\b/gi, 'para'],
  [/\bnexor\b/gi, 'flexor'],
  [/\bShen\s+111\s+e11\b/g, 'Shenmen'],
  [/\bencontn1r\b/gi, 'encontrar'],
  [/\bCapí\s+tulo\b/g, 'Capítulo'],
  [/\bDesobst\.rui\b/g, 'Desobstrui'],
  [/\bloc\s+a\/ir\.ação\b/gi, 'localização'],
  [/\bin\s+-\s+tensa\b/gi, 'intensa'],
  [/\bRi\s+acho\b/g, 'Riacho'],
  [/\bYiwn\b/g, 'Yuan'],
  [/\blo\s+ngo\b/gi, 'longo'],
  [/\benlre\b/gi, 'entre'],
  [/\bmelacarpais\b/gi, 'metacarpais'],
  [/\bTI\s+em\b/g, 'II e III'],
  [/\bN\s+ola\b/g, 'Nota'],
  [/\bEs\s+te\b/g, 'Este'],
  [/\bconvulsõe\.s\b/gi, 'convulsões'],
  [/\bNota de localização este ponto\b/g, 'Nota de localização Este ponto'],
  [/^\s*ostal\b/i, 'Neuralgia intercostal'],
  [/([.;,]\s*)ostal\b/gi, '$1Neuralgia intercostal'],
  [/\bLristeza\b/g, 'tristeza'],
  [/\bde\s+l\s+controle\b/gi, 'de controle'],
  [/\bSuo\s+Si\b/g, 'Sun Si'],
  [/^\s*li1\.llçiio\b/i, 'Localização'],
  [/\bTonificaçiio\b/g, 'Tonificação'],
  [/\binfanti\s+s\b/gi, 'infantis'],
  [/\bda\s+s\s+mãos\b/gi, 'das mãos'],
  [/\bsa\s+ngria\b/gi, 'sangria'],
  [/\bagul\s+ha\s+Lriangu\s+lar\b/gi, 'agulha triangular'],
  [/\bton[üi]ica\b/gi, 'tonifica'],
  [/\bHannoniza\b/g, 'Harmoniza'],
  [/\bhannoniza\b/g, 'harmoniza'],
  [/(^|[.;]\s*)ema reprodutor\b/gi, '$1Afecções do sistema reprodutor'],
  [/\bmol\s+es\b/gi, 'moles'],
  [/\babdo1ne\b/gi, 'abdome'],
  [/\bepigástri-\.\s*o\s+co\b/gi, 'epigástrico'],
  [/\bespennatorreia\b/gi, 'espermatorreia'],
  [/\bparcstesia\b/gi, 'parestesia'],
  [/\bsudorcsc\b/gi, 'sudorese'],
  [/\b11\s+1edial\b/gi, 'medial'],
  [/\bmaJéolo\b/g, 'maléolo'],
  [/\bYinlinquan\b/g, 'Yinlingquan'],
  [/\blocali<\.11ção\b/gi, 'localização'],
  [/\bste ponto\b/gi, 'este ponto'],
  [/\b1a1,5\b/g, '1 a 1,5'],
  [/\bfonalecendo-o\b/gi, 'fortalecendo-o'],
  [/\bmeoorragia\b/gi, 'menorragia'],
  [/\bcombiflllfões\b/gi, 'combinações'],
  [/\bBa-\s+([0-9]+)\b/g, 'Ba-$1'],
  [/\b101nbalgia\b/g, 'lombalgia'],
  [/ílexionado/gi, 'flexionado'],
  [/\bHexionado\b/g, 'Flexionado'],
  [/\boôndilo\b/gi, 'côndilo'],
  [/\bsanório\b/gi, 'sartório'],
  [/\bYanglinquan\b/g, 'Yanglingquan'],
  [/\bdes\s+li\s+ze\b/gi, 'deslize'],
  [/\bascen-\s*dente1nente\b/gi, 'ascendentemente'],
  [/\bascendente1nente\b/gi, 'ascendentemente'],
  [/\be1\s+n\b/gi, 'em'],
  [/\bcôodilo\b/gi, 'côndilo'],
  [/\bIntestino\s+s\b/g, 'Intestinos'],
  [/\bJioo\b/g, 'Jiao'],
  [/\bremo~do\b/gi, 'removendo'],
  [/\bremo\s+do\s+a\s+Umidade\b/gi, 'removendo a Umidade'],
  [/\bnocuma\b/gi, 'noturna'],
  [/\bpu\s+s\b/gi, 'pus'],
  [/\bco1n\b/gi, 'com'],
  [/\barcrite\b/gi, 'artrite'],
  [/\bAgua\b/g, 'Água'],
  [/\bCanal\.\.,,/g, 'Canal.'],
  [/\.\s+p,\s+Importante\b/g, '. Importante'],
  [/\s*(?:'\s*){3}Ba-9\s+Ba\s*$/g, ''],
  [/\s+\/\s*(?:--\s*)?(?:IG|Ba|p)\s*$/g, ''],
  [/\.\s+(?:Ba|p)\s*$/g, '.'],
  [/\s+\/\s*(?:--\s*)?(?:IG|Ba|p)\s*(?=\|)/g, ' '],
  [/\s+(?:Ba|p)\s*(?=\|)/g, ''],
  [/\s+\d+\s+\d+\s*(?=\|)/g, ''],

  // quinto lote de pontos comuns revisado contra o texto extraido do Atlas
  [/\bChengq\s*1\b/g, 'Chengqi'],
  [/\blo\s+c\s+a\/ir\.ação\b/gi, 'localização'],
  [/\benco\s+ntram-?\s*se\b/gi, 'encontram-se'],
  [/\bof\s+tálmicas\b/gi, 'oftálmicas'],
  [/\bvcrCap\b/g, 'ver Cap'],
  [/\bponto\s+10\s+\(Q1wnliao\)/g, 'ponto ID-18 (Quanliao)'],
  [/\bQ1wnliao\b/g, 'Quanliao'],
  [/\bvis\s+ão\b/gi, 'visão'],
  [/(^|[.;]\s*)isia facial\b/gi, '$1Espasmo ou paralisia facial'],
  [/\bo\s+lhos\b/gi, 'olhos'],
  [/\bccratitc\b/gi, 'ceratite'],
  [/(^|[.;]\s*)s,\s+dor ocular\b/gi, '$1Afecções oculares, dor ocular'],
  [/\bverúcal\b/gi, 'vertical'],
  [/\blocaliztlção\b/gi, 'localização'],
  [/\bDesobslrui\b/g, 'Desobstrui'],
  [/\bme\s+lhora\b/gi, 'melhora'],
  [/\blacrimcjamento\b/gi, 'lacrimejamento'],
  [/\bcpistaxe\b/gi, 'epistaxe'],
  [/\binna-?\s*mação\b/gi, 'inflamação'],
  [/\bfaci-\s*1\s*ita\b/gi, 'facilita'],
  [/\bmelhor\.a\b/gi, 'melhora'],
  [/\bte1nporomandibular\b/gi, 'temporomandibular'],
  [/\btcmporomandibular\b/gi, 'temporomandibular'],
  [/\bAT\s+M\b/g, 'ATM'],
  [/\bFrio\s+c\s+limpa\b/gi, 'Frio e limpa'],
  [/\bMúsc\s+ul\s+o\b/g, 'Músculo'],
  [/\bmasscter\b/gi, 'masseter'],
  [/\bespasmos\s+c\s+dor\b/gi, 'espasmos e dor'],
  [/\bVe\s+sfcula\b/g, 'Vesícula'],
  [/^\s*1\s*nserção\b/i, 'Inserção'],
  [/\bO,\s*([0-9])\b/g, '0,$1'],
  [/\bDi\s+cang\b/g, 'Dicang'],
  [/\bea\s+borda\b/gi, 'e a borda'],
  [/\bmandlbula\b/gi, 'mandíbula'],
  [/\bYa11g111i11g\b/g, 'Yangming'],
  [/\bmass\s+et\s+er\b/gi, 'masseter'],
  [/\s*\(É\)\s*(?:-\s*)?\d+(?:\s+\d+)?,?\s*/g, ' '],
  [/\s*CANAL\s+O[EF]\s+ENERGIA\s+DO\s+EST[ÔO]MAGO\s*\([^)]*\)\s*-?\s*\d+(?:\s+\d+)?,?\s*/gi, ' '],
  [/\bnccrosante\b/gi, 'necrosante'],
  [/\bmas\s*-\s*seter\b/gi, 'masseter'],
  [/\bdesequiliôrio\b/gi, 'desequilíbrio'],
  [/\bla\s+l,5\s*cun\b/gi, '1 a 1,5 cun'],
  [/\bJiaclie\b/g, 'Jiache'],
  [/\bTinggo11g\b/g, 'Tinggong'],
  [/\bQua11\/iao\b/g, 'Quanliao'],
  [/\bdor\.{2,}:?\s*i,\s*/gi, 'dor. '],
  [/\s*",\s*":,\s*/g, ' '],
  [/\belimina\s+a\s+i,\s+estagnação\b/gi, 'elimina a estagnação'],
  [/(^|[.;]\s*)ca,\s+dilatação gástrica\b/gi, '$1Disfunção gástrica; dilatação gástrica'],
  [/\bOuxo\b/g, 'fluxo'],
  [/\bInferio\s+r\.\s+s:\s*'?\s*\.\.\s*l!ii\.+:2\s*'?\s*\.+\s*["']?\s*-\s*,\s*Regula\b/g, 'Inferior. Regula'],
  [/\bInferio\s+r\b/g, 'Inferior'],
  [/\bInferior\.\s+s:\s*'\.\.\s*l!ii\.+:2\s*'\.+\s*["']+\s*-\s*,\s*Regula\b/g, 'Inferior. Regula'],
  [/\bbaixo-\s+-ventre\b/gi, 'baixo-ventre'],
  [/^\s*lizar com o joelho\b/i, 'Localizar com o joelho'],
  [/\bnexionado\b/gi, 'flexionado'],
  [/\bfoc\s+inho\b/gi, 'focinho'],
  [/\bmed\.ial\b/gi, 'medial'],
  [/^\s*-a,\s*/g, ''],
  [/\bedema\.{2,}:,\s*!\),?\s*/gi, 'edema. '],
  [/\s*00\.\.\.\s*'?$/g, ''],
  [/(^|[.;]\s*)hos e suas partes moles\b/gi, '$1Doenças dos joelhos e suas partes moles'],
  [/\brutrite\b/gi, 'artrite'],
  [/\bExempl\.o\s+s\b/g, 'Exemplos'],
  [/\bco\s+mbinações\b/gi, 'combinações'],
  [/\bVB,\s*E-36\b/g, 'VB-34, E-36'],
  [/\bVB\s+-([0-9]+)\b/g, 'VB-$1'],
  [/\bJG-11\b/g, 'IG-11'],
  [/\s+Patela\s+E\s*$/g, ''],
  [/\bantcrolatcral\b/gi, 'anterolateral'],
  [/\ba\s+nt\s+erior\b/gi, 'anterior'],
  [/\banteri\s+or\b/gi, 'anterior'],
  [/\blntestinos\b/g, 'Intestinos'],
  [/(^|[.;]\s*)ato gastrintestinal\b/gi, '$1Distúrbios do trato gastrintestinal'],
  [/\bDisulrbios\b/gi, 'Distúrbios'],
  [/\bcpigastralgia\b/gi, 'epigastralgia'],
  [/\bcrabalbos\b/gi, 'trabalhos'],
  [/\b1a\s+2\s+cun\b/gi, '1 a 2 cun'],
  [/\bqu\s+atro\b/gi, 'quatro'],
  [/(^|[.;]\s*)abdominal,\s+hemiplegia\b/gi, '$1Dor e distensão abdominal; hemiplegia'],
  [/\bmc1\s+nbros\b/gi, 'membros'],
  [/\benteritc\b/gi, 'enterite'],
  [/\bdia\.rrcia\b/gi, 'diarreia'],
  [/\bdi\s+spneia\b/gi, 'dispneia'],
  [/\bEstimulálo\b/g, 'Estimulá-lo'],
  [/\bafccçõcs\b/gi, 'afecções'],
  [/\bCU\/1\b/g, 'cun'],
  [/\s+\/\s*E\s*$/g, ''],
  [/\s+\/\s*E\s*(?=\|)/g, ' '],
  [/\bB-4\s*1\s+\(Jiexi\)/g, 'E-41 (Jiexi)'],
  [/\bD11b1\b/g, 'Dubi'],
  [/\bante\s+ri\s+or\b/gi, 'anterior'],
  [/\blnvertido\b/g, 'Invertido'],
  [/(^|[.;]\s*)e crônica,\s+fraqueza\b/gi, '$1Enterites aguda e crônica, fraqueza'],
  [/\btranston1os\b/gi, 'transtornos'],
  [/\bescápu\s+las\b/gi, 'escápulas'],
  [/\bborboógmo\b/gi, 'borborigmo'],
  [/\bsangue\.anemia\b/gi, 'sangue, anemia'],
  [/\bla2c\s*11n\b/gi, '1 a 2 cun'],
  [/\s+\/\s*\\\),\s*$/g, ''],
  [/\bmanei\.ra\b/gi, 'maneira'],
  [/\bbálux\b/gi, 'hálux'],
  [/\bFonalccc\b/g, 'Fortalece'],
  [/\badjaccnte\b/gi, 'adjacente'],
  [/\bdescquillôrio\b/gi, 'desequilíbrio'],
  [/\brurofia\b/gi, 'atrofia'],
  [/\bdomembro\b/gi, 'do membro'],
  [/\bSha11gqí11\b/g, 'Shangqiu'],
  [/\ba\s+VB\s+\(Qiuxu\)/g, 'a VB-40 (Qiuxu)'],
  [/(^|[.;]\s*)cada superior\b/gi, '$1Odontalgia da arcada superior'],
  [/\btrigémeo\b/gi, 'trigêmeo'],
  [/\bcntcritcs\b/gi, 'enterites'],
  [/\bdo\s+es\s+tômago\b/gi, 'do estômago'],
  [/\brnúsculo\b/gi, 'músculo'],
  [/\bdiafragr\s+na\b/gi, 'diafragma'],
  [/\bcombinQfões\b/gi, 'combinações'],
  [/\be\s+7·\s*'?\s*nso,?\s*-\.\s*L\s+ma\.\s*/g, ''],
  [/\s*"\?,\s*VB\s+-41/g, ' VB-41'],
  [/\s*"\?,\s*VB-41/g, ' VB-41'],
  [/\bTD\s+-\s*18\b/g, 'TD-18'],
  [/\bgen-\s*:?\s*t\s*givitc\b/gi, 'gengivite'],
  [/\bCanal\.\.\s*',\s*Movimento\b/g, 'Canal. Movimento'],
  [/\s+1\s+1\s+E\b/g, ''],
  [/\blocaliuição\b/gi, 'localização'],
  [/^harmoniza\b/g, 'Harmoniza'],
  [/\bCalo\s+r\b/g, 'Calor'],
  [/(^|[.;]\s*)do,\s+edema facial\b/gi, '$1Edema generalizado, edema facial'],
  [/\bodo\s+ntalgia\b/gi, 'odontalgia'],
  [/\bepistax\s+c\b/gi, 'epistaxe'],
  [/\bbeparite\b/gi, 'hepatite'],
  [/\bafta\s+s\b/gi, 'aftas'],
  [/\bagu\s+lha\b/gi, 'agulha'],

  // sexto lote de pontos deep-curated revisado contra o texto extraido do Atlas
  [/\bLocaliuz\s*çã-?0\b/gi, 'Localização'],
  [/\bLoca\/ir\.a\s*ção\b/gi, 'Localização'],
  [/\bloc\s+ali\s+wç\s+ão\b/gi, 'localização'],
  [/\bloc\s+al\s+izilção\b/gi, 'localização'],
  [/\blo\s+caliuição\b/gi, 'localização'],
  [/\bpaço da articulação\b/gi, 'espaço da articulação'],
  [/\bFun\s+ções\s+ene\s+rg\s+éticas\b/gi, 'Funções energéticas'],
  [/\bF\s+unções energéticas\b/gi, 'Funções energéticas'],
  [/\bF\s*11\s*nções energéticas\b/gi, 'Funções energéticas'],
  [/\bFlln\s+çõe\s+s energéticas\b/gi, 'Funções energéticas'],
  [/\bF1'?nções energéticas\b/gi, 'Funções energéticas'],
  [/\bM\s+ão\b/g, 'Mão'],
  [/\bre\s+sfriado\b/gi, 'resfriado'],
  [/\btuberculo\s+se\b/gi, 'tuberculose'],
  [/\bodootalgia\b/gi, 'odontalgia'],
  [/\bmal\s+-estar\b/gi, 'mal-estar'],
  [/\bger\s+il\b/gi, 'geral'],
  [/\bger\.il\b/gi, 'geral'],
  [/\.\s+p,\s+Ponto\b/g, '. Ponto'],
  [/\bGao W11\b/g, 'Gao Wu'],
  [/\s*\(,\s*I\s*$/g, ''],
  [/\bI,\s*Deadman et al\./g, 'Deadman et al.'],
  [/\bDcadman\s+1ai\b/g, 'Deadman et al.'],
  [/\bp\.\s*l\s*17\b/g, 'p. 117'],
  [/\s*I,\s*Deadman et al\.\s*,?\s*2001\s*\(p\. 117\)\.\s*/g, ' '],
  [/\s*Deadman et al\.\s*,?\s*2001\s*\(p\. 117\)\.\s*/g, ' '],
  [/\bl11dic\s+ações\b/gi, 'Indicações'],
  [/\bd\s+or\b/gi, 'dor'],
  [/\bdcscquillbrio\b/gi, 'desequilíbrio'],
  [/\bhemoplise\b/gi, 'hemoptise'],
  [/\bsínfise\s+pdb\s*ica\b/gi, 'sínfise púbica'],
  [/\bpdbica\b/gi, 'púbica'],
  [/\bloscrção\b/gi, 'Inserção'],
  [/^\s*loscrção\b/i, 'Inserção'],
  [/\bM\s*étodo\s+loscrção\b/gi, 'Método Inserção'],
  [/\bJ\s+nserção\b/gi, 'Inserção'],
  [/\banérias\b/gi, 'artérias'],
  [/\bR\s+egu\s+la\b/gi, 'Regula'],
  [/\be\s+n\s+ergét\s+ica~?\b/gi, 'energética'],
  [/\bfunções energética\b/gi, 'funções energéticas'],
  [/\bCfwng\s+M\s+ai\b/g, 'Chong Mai'],
  [/\bQida\s+Be\s+xi\s+ga\b/g, 'Qi da Bexiga'],
  [/\bd\s+os\s+niú\s+sc\s+ulosedosteodões\b/gi, 'dos músculos e dos tendões'],
  [/\s*,?I,\s*(?:1\s+){2,}T(?:\s+1\s+1\s+T)*\s*1?\s*$/g, ''],
  [/(^|[.;]\s*)os reprodutores\b/gi, '$1Doenças dos órgãos reprodutores'],
  [/\btestíc\s+ul\s+os\b/gi, 'testículos'],
  [/\bu\s+ln\s+ar\b/gi, 'ulnar'],
  [/\bul\s+nar\b/gi, 'ulnar'],
  [/\bva\.scularízada\b/gi, 'vascularizada'],
  [/\buloar\b/gi, 'ulnar'],
  [/\bBexil!a\b/g, 'Bexiga'],
  [/\bhemarúria\b/gi, 'hematúria'],
  [/\bsangr\.imento\b/gi, 'sangramento'],
  [/\b1\s+íngua\b/gi, 'língua'],
  [/\bJ,2\s+CUfl\b/g, '1,2 cun'],
  [/\bJ,2\s+cun\b/g, '1,2 cun'],
  [/\bbe\s+ne\s+fi\s+cia\b/gi, 'beneficia'],
  [/\bo\s+om\s+bro\b/gi, 'o ombro'],
  [/\bom\s+bro\b/gi, 'ombro'],
  [/\bdo\s+s\s+tecidos\b/gi, 'dos tecidos'],
  [/\bEumpl\s+os\b/gi, 'Exemplos'],
  [/\bEumplo\s+s\b/gi, 'Exemplos'],
  [/\bLD\s+-\s*10\b/g, 'ID-10'],
  [/\bL\s+D-3\b/g, 'ID-3'],
  [/\bele\s+1r\s+oacupuntura\b/gi, 'eletroacupuntura'],
  [/\b01\s+nbro\b/g, 'ombro'],
  [/\bumeroescap\s+ul\s+ar\b/gi, 'umeroescapular'],
  [/\bdelto\s+l\s+de\b/gi, 'deltoide'],
  [/\bhipcr-hidrosc\b/gi, 'hiperhidrose'],
  [/\binftamação\b/gi, 'inflamação'],
  [/\s*!?\.\s*"?'\.\.o\.\s*r,?\s*-\s*l\.?\s*s:?,?\s*/g, ' '],
  [/\bSJ-\s+([0-9]+)\b/g, 'SJ-$1'],
  [/\bIG-\s+([0-9]+)\b/g, 'IG-$1'],
  [/\bB-\s+([0-9]+)\b/g, 'B-$1'],
  [/\bC-\s+([0-9]+)\b/g, 'C-$1'],
  [/\b(SJ|IG|ID|TD|Du|B|C|P|E|R|F|VB|Ba)\s*-\s*([0-9])\s+([0-9])\b/g, '$1-$2$3'],
  [/\b(SJ|IG|ID|TD|Du|B|C|P|E|R|F|VB|Ba)\s*-\s*([0-9]+)\b/g, '$1-$2'],
  [/\bE--([0-9]+)\b/g, 'E-$1'],
  [/\bDcsli:?\s*zc\b/gi, 'Deslize'],
  [/\bsiruada\b/gi, 'situada'],
  [/(^|[.;]\s*)sura da boca\b/gi, '$1Desvio da comissura da boca'],
  [/\bo\s+lh\s+os\b/gi, 'olhos'],
  [/\bgengivi\s+te\b/gi, 'gengivite'],
  [/\bcsclcrótica\b/gi, 'esclerótica'],
  [/\btrigêmco\b/gi, 'trigêmeo'],
  [/\bespasrno\b/gi, 'espasmo'],
  [/\bAuterocbe\b/g, 'Auteroche'],
  [/\bMu\s+sculares\b/g, 'Musculares'],
  [/\s+ID\s*$/g, ''],
  [/\bE4\s+\(Dicang\)/g, 'E-4 (Dicang)'],
  [/\bIG\s+\(Yingxia11g\)/g, 'IG-20 (Yingxiang)'],
  [/\bYingxia11g\b/g, 'Yingxiang'],
  [/^lize Du-/i, 'Localize Du-'],
  [/\bdepress\s+ão0,5\b/gi, 'depressão 0,5'],
  [/\bDu-16\(/g, 'Du-16 ('],
  [/\bce\s+faleia\b/gi, 'cefaleia'],
  [/\bvéni\s+ce\b/gi, 'vértice'],
  [/\bobs\s+trução\b/gi, 'obstrução'],
  [/\bd\s+is\s+túrbi\s+os\b/gi, 'distúrbios'],
  [/\bhi\s+steria\b/gi, 'histeria'],
  [/\bcon\s+ce\s+ntração\b/gi, 'concentração'],
  [/\bExen1plos\b/g, 'Exemplos'],
  [/\bcon1binações\b/gi, 'combinações'],
  [/\bP-1\s+1\b/g, 'P-11'],
  [/\blD\s+-3\b/g, 'ID-3'],
  [/\bJG-J\s*l\b/g, 'IG-11'],
  [/\bL1\s+1\s+o'l\.hen\b/g, 'Luozhen'],
  [/\bli\s+e\s+Ili\b/g, 'II e III'],
  [/\bforta\s+lece\b/gi, 'fortalece'],
  [/\bmú\s+sculos\b/gi, 'músculos'],
  [/\bcé\s+rebro\b/gi, 'cérebro'],

  // setimo lote de pontos deep-curated revisado contra o texto extraido do Atlas
  [/\bvértebra torácica UI,\s*1,5\b/gi, 'vértebra torácica III, 1,5'],
  [/\bTodos os pontos SIM Do W\.?\s*slo\b/g, 'Todos os pontos Shu Dorsais'],
  [/\bc\s+u11\b/gi, 'cun'],
  [/\bF\s+un\s+ções energéticas\b/gi, 'Funções energéticas'],
  [/\bFlln\s+ções energéticas\b/gi, 'Funções energéticas'],
  [/\bFu11ç\s*ões\s+e\s*11erg\s*éticas\b/gi, 'Funções energéticas'],
  [/\bQi\s+cio\s+Pulmão\b/g, 'Qi do Pulmão'],
  [/\bpatogênica\s+s\b/gi, 'patogênicas'],
  [/\bYing\s+Q1\b/g, 'Ying Qi'],
  [/\s*Bahr"?\s*ai\s+2007\s*\(p\.\s*212\)\.\s*/g, ' '],
  [/\bprocesso espinhoso de T 1\b/g, 'processo espinhoso de T I'],
  [/\bvértebra torácica m quando\b/gi, 'vértebra torácica VII quando'],
  [/\bse\s+nsação\b/gi, 'sensação'],
  [/\btorác\s+ica\b/gi, 'torácica'],
  [/\beruc\s+ta\s+ção\b/gi, 'eructação'],
  [/\bNota\s+tk\s+localização\b/gi, 'Nota de localização'],
  [/\bExemplos\s+tk\s+combinações\b/gi, 'Exemplos de combinações'],
  [/\bMétodb\b/g, 'Método'],
  [/\bl\s+a\s+l,\s*S\s+cun\b/g, '1 a 1,5 cun'],
  [/\bepigastnllgia\b/gi, 'epigastralgia'],
  [/\bbipocôndrio\b/gi, 'hipocôndrio'],
  [/\s*I\.+:\s*i\s*1\s*\(\s*$/g, ''],
  [/\bilfaca\b/gi, 'ilíaca'],
  [/\bpo\s+sterossupcrior\b/gi, 'posterossuperior'],
  [/\bposterossupcrior\b/gi, 'posterossuperior'],
  [/\bsac\s*ra!/gi, 'sacral'],
  [/\bsacr\.iis\b/gi, 'sacrais'],
  [/\bIombossacral\b/g, 'lombossacral'],
  [/\baba\.ixo\b/gi, 'abaixo'],
  [/\blinha\s+i\s+mediana\b/gi, 'linha mediana'],
  [/\bmínimo\s+gg\s+sobre\b/gi, 'mínimo sobre'],
  [/\bO\.o dedo\b/g, 'O dedo'],
  [/\bCada Uao\b/g, 'Cada forame'],
  [/\.\s*S;\s*$/g, '.'],
  [/\bmensuuação\b/gi, 'menstruação'],
  [/\bco\s+mbi11a\s+ções\b/gi, 'combinações'],
  [/\bEletroacupuoturaem\b/gi, 'Eletroacupuntura em'],
  [/\bRcn-\s*3\b/g, 'Ren-3'],
  [/\s*ijJ\s*-\s*J\s*'\.\s*Forame\s+saCl\(ll\s+ll\s+l\s*-\s*/g, ' '],
  [/\bte\s+nd\s+õe\s*s\b/gi, 'tendões'],
  [/ânu\s+s/gi, 'ânus'],
  [/\bna\s+s\s+fezes\b/gi, 'nas fezes'],
  [/\but\s+erino\b/gi, 'uterino'],
  [/\bMl\s+todo\b/g, 'Método'],
  [/\binfe\s+ri\s+ores\b/gi, 'inferiores'],
  [/\bpann1rrilha\b/gi, 'panturrilha'],
  [/\benerglticas\b/gi, 'energéticas'],
  [/\ba\.livia\b/gi, 'alivia'],
  [/\bespamos\b/gi, 'espasmos'],
  [/\bdcpressiio\b/gi, 'depressão'],
  [/\bOn posteromedial face de ankle, na depressão entre prominence de maleolo medial e calcaneal tendon\./g, 'Face posteromedial do tornozelo, na depressão entre a proeminência do maléolo medial e o tendão do calcâneo.'],
  [/\bodontaJgia\b/g, 'odontalgia'],
  [/\bsexua\s+l\b/gi, 'sexual'],
  [/\binch\s+aço\b/gi, 'inchaço'],
  [/\bh\s+cmopt\s+i\s+sc\b/gi, 'hemoptise'],
  [/\bsedc\b/gi, 'sede'],
  [/\bYlllln\b/g, 'Yuan'],
  [/\s*1\s+1,\s*R\s+i:\s+a\s+(?=Loc)/g, ' '],
  [/\bLoc\s+a\/ir\.a\s+ção\b/g, 'Localização'],
  [/\bloc\s+a\/ir\.a\s+ção\b/g, 'localização'],
  [/\bdi\s+stâ\s+ncia\b/gi, 'distância'],
  [/\bvasculari1\.\.ada\b/gi, 'vascularizada'],
  [/\bM\s+éto\s+do\b/g, 'Método'],
  [/\bene\s+rg\s+éticas\b/gi, 'energéticas'],
  [/\bK1111\/11n\b/g, 'Kunlun'],
  [/\bYtn\b/g, 'Yin'],
  [/\bAncor\.i\b/g, 'Ancora'],
  [/\bharmo-\.\s*n1zando\b/gi, 'harmonizando'],
  [/\bnos\s+S,?\s*idosos\b/gi, 'nos idosos'],
  [/\bExenip\/\s*\{\)S\b/g, 'Exemplos'],
  [/\b1n\s+enstruação\b/gi, 'menstruação'],
  [/\bsonolê\s+ncia\b/gi, 'sonolência'],
  [/\bepidérm\.ica\b/gi, 'epidérmica'],
  [/\bpolal\s+ciúria\b/gi, 'polaciúria'],
  [/["'!]+\s*insônia\b/g, 'insônia'],
  [/\bf!\s*tosse\b/gi, 'tosse'],
  [/\bR\)\(-\s*$/g, ''],

  // oitavo lote de pontos deep-curated revisado contra o texto extraido do Atlas
  [/\bc\s+lavícula\b/gi, 'clavícula'],
  [/\banrite\s+c\s+laviculoestemal\b/gi, 'artrite claviculoesternal'],
  [/\bNota\s+de\s+\/o\s+cal\s+iw\s+ção\b/gi, 'Nota de localização'],
  [/\bestimula Kidney Function Of Reception Of Qi\b/g, 'estimula a função de recepção do Qi do Rim'],
  [/\bF1111\s+ções\s+e11ergéticas:\s*í/g, 'Funções energéticas:'],
  [/\bI\s+11di\s+cações\b/g, 'Indicações'],
  [/\bRe\s+so\s+lve\b/g, 'Resolve'],
  [/\bR\s+im\b/g, 'Rim'],
  [/\bplcurisia\b/gi, 'pleurisia'],
  [/\bIn anterior região de neck, posterior a ear lobe, na depressão anterior a inferior end de mastoid process\./g, 'Na região anterior do pescoço, posterior ao lóbulo da orelha, na depressão anterior à extremidade inferior do processo mastoideo.'],
  [/\bVesícu\s+la\b/g, 'Vesícula'],
  [/\bVenio\b/g, 'Vento'],
  [/\bi,\s*j\.+\s*canto\b/gi, 'canto'],
  [/\bcombi\s+11\s+ações\b/gi, 'combinações'],
  [/\bsi\s+nusite\b/gi, 'sinusite'],
  [/\s*CANAL\s+OE\s+ENERGIA\s+DA\s+VESÍCULA\s+Bllt,?\s*VI\.?/g, ''],
  [/\b1\s+ncsn1as\b/g, 'mesmas'],
  [/\bFace\s+l\s+ater-\.?U\b/g, 'Face lateral'],
  [/\bjoe\s+lh\s+o\b/gi, 'joelho'],
  [/\btroca\s+nt\s+er\s+1\s+naior\b/gi, 'trocanter maior'],
  [/\bflbula\b/gi, 'fíbula'],
  [/\bcut\s+âneo\s+ge\s+neralizado\b/gi, 'cutâneo generalizado'],
  [/\banexit\s+e\b/gi, 'anexite'],
  [/\b1a2c\s*un\b/gi, '1 a 2 cun'],
  [/\bdo\s+r\b/gi, 'dor'],
  [/\bF\s+un\s+çõ\s+es\s+energéticas\b/gi, 'Funções energéticas'],
  [/\bex\s+temo\b/gi, 'externo'],
  [/\blinfoadenit\.c\b/gi, 'linfoadenite'],
  [/\bcolccistitc\b/gi, 'colecistite'],
  [/\bintcrcostalgia\b/gi, 'intercostalgia'],
  [/\bpleuósia\b/gi, 'pleurisia'],
  [/\bfonalecimento\b/gi, 'fortalecimento'],
  [/\bopa-\s*\$\s*cificação\b/gi, 'opacificação'],
  [/\bYi1an\b/g, 'Yuan'],
  [/\bmetatarsais\s+rv\s+e\s+v\b/gi, 'metatarsais IV e V'],
  [/\bNota\s+de\s+\/o\s+cfdiwção\b/gi, 'Nota de localização'],
  [/\bt\.endão\b/gi, 'tendão'],
  [/\burctritc\b/gi, 'uretrite'],
  [/\bespasmód\s+ica\b/gi, 'espasmódica'],
  [/\bdor\s+so\s+do\b/gi, 'dorso do'],
  [/\bsíndro\s+me\.+\s+da\b/gi, 'síndrome da'],
  [/\blombal-\s*S,?\s*gia\b/gi, 'lombalgia'],
  [/\bconjunlivite\b/gi, 'conjuntivite'],
  [/\bDai\s+M\s+ai\b/g, 'Dai Mai'],
  [/\b0,3\s+a0,8\b/g, '0,3 a 0,8'],
  [/\bcircu\s+la\s+o\s+Qi\b/gi, 'circula o Qi'],
  [/\bNota\s+de\s+\/o\s+c\s+a\/ir\.ação\b/gi, 'Nota de localização'],
  [/\bsegund\s+o\b/gi, 'segundo'],
  [/\bvenn\.\s*elha\b/gi, 'vermelha'],
  [/(^|[.;]\s*)il,\s*epilepsia\b/gi, '$1epilepsia'],
  [/\bure1rite\b/gi, 'uretrite'],
  [/\brurva\b/gi, 'turva'],
  [/\bnoruma\b/gi, 'noturna'],
  [/\beomissura\b/gi, 'comissura'],
  [/\bin\s+-\s*serção\b/gi, 'inserção'],
  [/\bsangramcnto\b/gi, 'sangramento'],
  [/\bDesobstru\s+i\b/gi, 'Desobstrui'],
  [/\bUmidade-\s*-Calor\b/gi, 'Umidade-Calor'],
  [/\bdislância\b/gi, 'distância'],
  [/\breiençllo\b/gi, 'retenção'],
  [/\bdislensão\b/gi, 'distensão'],
  [/\baoles\b/gi, 'antes'],
  [/\bvuJvar\b/gi, 'vulvar'],
  [/\blcucorreia\b/gi, 'leucorreia'],
  [/\bgargan1a\b/gi, 'garganta'],
  [/\be\s+ngolir\b/gi, 'engolir'],
  [/\bFunções\s+e\s+11\s+ergéticas\b/g, 'Funções energéticas'],
  [/\bR\s+emoveCalore\b/g, 'Remove Calor e'],
  [/\bFfgadoe\b/g, 'Fígado e'],

  // nono lote de pontos deep-curated revisado contra o texto extraido do Atlas
  [/\bsemitendín\s+eo\b/gi, 'semitendíneo'],
  [/\bCo\s+laterais\b/g, 'Colaterais'],
  [/\bR\s+ev\s+igora\b/g, 'Revigora'],
  [/\bJiao Inferior\.?\s*l,?\s*Tonifica\b/g, 'Jiao Inferior. Tonifica'],
  [/\bfunção\s+s,?\s+do\b/gi, 'função do'],
  [/\buteri\s+no\b/gi, 'uterino'],
  [/\bsem\s+in\s+al\b/gi, 'seminal'],
  [/\bimpot\s+l'\.!\s*ncia\b/gi, 'impotência'],
  [/\bleuc-0rreia\b/gi, 'leucorreia'],
  [/\bdis6-\s*ria\b/gi, 'disúria'],
  [/\ben\s+cerite\b/gi, 'enterite'],
  [/\bPonto\s+M\s+ar\b/g, 'Ponto Mar'],
  [/\bTonificaçiío\b/g, 'Tonificação'],
  [/\bnoturna,\s*gg\s+impotência\b/gi, 'noturna, impotência'],
  [/\binftexibilidade\b/gi, 'inflexibilidade'],
  [/\binfiamação\b/gi, 'inflamação'],
  [/\bda costas\b/gi, 'das costas'],
  [/\bdo::\s*l\.o\s+Rim\b/gi, 'do Rim'],
  [/\bliwç\s+ão\s+Linha\b/gi, 'Localização Linha'],
  [/\bdis\s+pneia\b/gi, 'dispneia'],
  [/\bhcmatêmese\b/gi, 'hematêmese'],
  [/\becarbú\s+nculos\b/gi, 'e carbúnculos'],
  [/\bcrô\s+ni\s+ca\b/gi, 'crônica'],
  [/\bvisuai\s+s\b/gi, 'visuais'],
  [/\bFllnções energéticas\b/g, 'Funções energéticas'],
  [/\bSlien\b/g, 'Shen'],
  [/\bcos\s+tas\b/gi, 'costas'],
  [/\bOn lower abdomen, 3 B-cun inferior a centre de umbilicus, sobre a linha mediana anterior\./g, 'No abdome inferior, 3 cun abaixo do centro da cicatriz umbilical, sobre a linha mediana anterior.'],
  [/\bpós-part\.\s*o\b/gi, 'pós-parto'],
  [/\btroto urinário\b/gi, 'trato urinário'],
  [/\bascaridfase\b/gi, 'ascaridíase'],
  [/\bsfndrome\b/gi, 'síndrome'],
  [/\bconibinações\b/gi, 'combinações'],
  [/\bpuerperdl\b/gi, 'puerperal'],
  [/\bHácida\b/g, 'flácida'],
  [/\bpo\s+li\s+úria\b/gi, 'poliúria'],
  [/\bsemi\s+nal\b/gi, 'seminal'],
  [/\s*1\s*\/\s*1\s*-\s*-,\s*1\s*Ren Li Ding,\s*1996\s*\(p\.\s*405\)\.\s*/g, ' '],
  [/\bponto\s+mé\s*-\s*dio\b/gi, 'ponto médio'],
  [/\bdor\s+e11\s+Mai\b/g, 'Ren Mai'],
  [/\bY11a11\s+Qi\b/g, 'Yuan Qi'],
  [/\bJiM\s+Inferior\b/g, 'Jiao Inferior'],
  [/\blntcstino\b/g, 'Intestino'],
  [/\s*REN\s+MAi\s+\{VASO\s+CONCCPÇAOJ?\s*\d+\s*.*$/g, ''],
  [/\baqueceodo\b/gi, 'aquecendo'],
  [/\bse\s+ão\s+de\s+plenjtude\b/gi, 'sensação de plenitude'],
  [/\bplenjtude\b/gi, 'plenitude'],
  [/\bfl\s+atulência\b/gi, 'flatulência'],
  [/\bparasitoscs\.\s*intestinais\b/gi, 'parasitoses intestinais'],
  [/\s*\/\s*l\s+1\.?/g, ''],
  [/\b2\s+c\s+1111\b/gi, '2 cun'],
  [/\bde\s+lo\s+ca\s+li\s+zação\b/gi, 'de localização'],
  [/\bM\s+ito\s+do\b/g, 'Método'],
  [/\benergiticas\b/gi, 'energéticas'],
  [/\bHrumoniza\b/g, 'Harmoniza'],
  [/\brcgulacpromoveo\b/gi, 'regula e promove o'],
  [/\bR\s+ed\s+ireciona\b/g, 'Redireciona'],
  [/\bgastr\.ilgia\b/gi, 'gastralgia'],
  [/\besrupor\b/gi, 'estupor'],
  [/\bdiafr\.igmático\b/gi, 'diafragmático'],
  [/\bLó\s+ra\.?x\b/gi, 'tórax'],
  [/\beslerno\b/gi, 'esterno'],
  [/\bmamilo\s+s\b/gi, 'mamilos'],
  [/\bcruzamenLo\b/gi, 'cruzamento'],
  [/\bhorizonlal\b/gi, 'horizontal'],
  [/\bin1ercos1al\b/gi, 'intercostal'],
  [/\bQi\s+Ln\s+vertido\b/g, 'Qi invertido'],
  [/\bhipodesenvolvimen10\b/gi, 'hipodesenvolvimento'],
  [/\bconslrição\b/gi, 'constrição'],
  [/\bpcricardite\b/gi, 'pericardite'],
  [/\bSa11\s+Jiao\b/g, 'San Jiao'],
  [/\bnLo\b/g, 'Luo'],

  // termos MTC/anatomicos recorrentes quebrados (leitura inequivoca pelo contexto)
  [/\bYa\s*n\s*g\b/g, 'Yang'],
  [/\bYa11g\b/g, 'Yang'],
  [/\bShe11\b/g, 'Shen'],
  [/\bm[lõ][li]sculos\b/gi, 'músculos'],
  [/\bm[lõ][li]sculo\b/gi, 'músculo'],
  [/\bm[õo]sculos\b/gi, 'músculos'],
  [/\bm[õo]sculo\b/gi, 'músculo'],
  [/\bo\s+u\b/g, 'ou'],
  [/\bCl\/?\s*1?1\b/g, 'cun'],
  [/\bM[úu]scu\s*lo\b/g, 'Músculo'],
  [/\bm[úu]scu\s*lo\b/g, 'músculo'],
  [/\borif?fcios\b/gi, 'orifícios'],
  [/\borif?fcio\b/gi, 'orifício'],
  [/\bfu\s*n[çc][ãa]o\b/gi, 'função'],
  [/\bInt\s+erno\b/g, 'Interno'],
  [/\bint\s+erno\b/g, 'interno'],
  [/\bVe\s+nto\b/g, 'Vento'],
  [/\bCo\s+ntrola\b/g, 'Controla'],
  [/\bco\s+ntralateral\b/g, 'contralateral'],
  [/\bSanJiao(e)?\b/g, (m, e) => (e ? 'San Jiao e' : 'San Jiao')],
  [/\bsitua\s*se\b/g, 'situa-se'],
  [/\bafec[çc]õ[ec]s\b/gi, 'afecções'],
  [/^afecções\b/g, 'Afecções'],
  [/(^|[.;]\s*)afecções do sistema reprodutor\b/g, '$1Afecções do sistema reprodutor'],
  [/\bepistax[ce]\b/gi, 'epistaxe'],
  [/\brinorr[ce]ia\b/gi, 'rinorreia'],
  [/\bamenorr[ce]ia\b/gi, 'amenorreia'],
  [/\bdismenorr[ce]ia\b/gi, 'dismenorreia'],
  [/\bDis\s+persa\b/g, 'Dispersa'],
  [/\bdis\s+persa\b/g, 'dispersa'],
  [/\bAcal\s+ma\b/g, 'Acalma'],
  [/\bacal\s+ma\b/g, 'acalma'],
  [/\bmen\s+te\b/g, 'mente'],
  [/\bmen\s+tal\b/g, 'mental'],
  [/\bmen\s+tais\b/g, 'mentais'],
  [/\bpa?\s*t\s*ogê\s*ni\s*co\b/gi, 'patogênico'],
  [/\blibe\s+rt?\s*a\b/g, 'liberta'],
  [/\bsurd\s+ez\b/gi, 'surdez'],
  [/\bcr\s+ian(ça|cas|ças)\b/gi, 'crian$1'],
  [/\bdepress\s+ão\b/gi, 'depressão'],
  [/\bri\s+nite\b/gi, 'rinite'],
  [/\brin\s+ite\b/gi, 'rinite'],
  [/\blí\s*n?\s*gu\s*a\b/gi, 'língua'],
  [/\bUmidade["'’]Calor\b/g, 'Umidade-Calor'],
  [/\bHannoni\d*\.*a\b/g, 'Harmoniza'],
  [/\bRegu\s+l\s*a(riza|riia)?\b/g, (m, s) => (s ? 'Regulariza' : 'Regula')],
  [/\bR\s*eg\s*u\s*l\s*ari[il]a\b/g, 'Regulariza'],

  // juncao de hifen de quebra de linha: "pro- blemas" -> "problemas"
  // (apenas quando o trecho apos o hifen comeca com minuscula = continuacao)
  [/([A-Za-zÀ-ú])-\s+([a-zà-ú])/g, '$1$2'],

  // simbolos de margem/figura injetados pelo OCR (nunca sao conteudo)
  [/[§•*°]/g, ' '],
  [/\s'\d'?(?=\s)/g, ' '],          // "'9", "'l'" soltos
  [/\s::?h\b/g, ' '],
  [/\s0{2,}\s/g, ' '],              // "00" solto entre espacos

  // normaliza espacos multiplos e pontuacao
  [/[ \t]{2,}/g, ' '],
  [/\s*\|\s*/g, ' | '],
  [/\(\s+/g, '('],
  [/\s+\)/g, ')'],
  [/\s+([,.;:])/g, '$1'],
  [/,\s*(?:\.\s*,?\s*)+/g, ', '],
  [/\.\s*,\s*/g, '. '],
  [/,\s*,+/g, ', '],
  [/\s*(?:[-.]\s*)?\/(?:\s*\/|\s*[-.()]*)*$/g, ''],
];

function applyWordFixes(text) {
  let t = text;
  for (const [re, rep] of WORD_FIXES) t = t.replace(re, rep);
  return t;
}

function cleanField(text) {
  if (typeof text !== 'string') return text;
  let t = text;
  t = stripRunningHeads(t);
  t = applyWordFixes(t);
  // limpa virgula/ponto inicial orfao (ex.: indications comecando com ", ...")
  t = t.replace(/^[\s,.;]+/, '');
  t = t.replace(/\s{2,}/g, ' ').trim();
  return t;
}

// Heuristica de DUVIDA: trechos que continuam suspeitos apos a limpeza.
// Nao alteramos esses; apenas registramos para o acupunturista revisar.
function collectDoubts(code, field, before, after) {
  const doubts = [];
  // palavras de 1-2 letras validas em PT (nao sinalizar como fragmento)
  const STOP = new Set(['a','o','e','à','á','é','ó','ou','de','do','da','em','no','na','ao','um','se','os','as','às','ar','ex','é','já','só','né','nó','lá','cá','pé','fé','má','vê','dá','há','eu','te','me','tu','ti','vi','li','lu','du','he','i','ma','mu','si','p','t','v','ba','wu','qi','ye','vu','ii','iii','iv','xi','tv']);
  const checks = [
    [/\b[a-zà-úA-ZÀ-Ú]*\d[a-zà-úA-ZÀ-Ú]+\b|\b[a-zà-úA-ZÀ-Ú]+\d[a-zà-úA-ZÀ-Ú]*\b/g, 'token com digito no meio de palavra'],
    [/\b[b-df-hj-np-tv-z]{4,}\b/gi, 'sequencia consonantal improvavel'],
    [/[$§•*°]|::?h/g, 'simbolo/ruido residual'],
    [/[a-zà-ú][A-ZÀ-Ú][a-zà-ú]/g, 'maiuscula no meio da palavra (OCR)'],
  ];
  // fragmentos intra-palavra: tokens de 1-2 letras (fora do dicionario) colados
  // a outra palavra geralmente sao palavras quebradas por espaco do OCR.
  const tokens = String(after).split(/[\s,.;:()]+/).filter(Boolean);
  const splitHits = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (/^[a-zà-ú]{1,2}$/i.test(t) && !STOP.has(t.toLowerCase())) {
      const next = tokens[i + 1] || '';
      const prev = tokens[i - 1] || '';
      splitHits.push(`…${prev ? prev + ' ' : ''}${t}${next ? ' ' + next : ''}…`);
    }
  }
  if (splitHits.length) doubts.push({ field, label: 'possivel palavra quebrada por espaco', samples: [...new Set(splitHits)].slice(0, 8) });
  for (const [re, label] of checks) {
    const hits = String(after).match(re);
    if (hits) doubts.push({ field, label, samples: [...new Set(hits)].slice(0, 6) });
  }
  return doubts;
}

function cleanReview(review) {
  const doubts = [];
  let changed = false;
  for (const field of TEXT_FIELDS) {
    const v = review[field];
    if (Array.isArray(v)) {
      const next = v.map(item => (typeof item === 'string' ? cleanField(item) : item));
      if (JSON.stringify(next) !== JSON.stringify(v)) changed = true;
      next.forEach((item, i) => {
        if (typeof item === 'string') doubts.push(...collectDoubts(review.code, `${field}[${i}]`, v[i], item));
      });
      review[field] = next;
    } else if (typeof v === 'string') {
      const next = cleanField(v);
      if (next !== v) changed = true;
      // clinicalNote e majoritariamente boilerplate de curadoria (sem acento por
      // design); nao sinalizar duvidas nele para nao afogar o sinal dos campos clinicos.
      if (field !== 'clinicalNote') doubts.push(...collectDoubts(review.code, field, v, next));
      review[field] = next;
    }
  }
  if (changed || doubts.length) {
    review.ocrCleanup = {
      tool: 'tools/knowledge/clean-common-points-ocr.mjs',
      at: new Date().toISOString().slice(0, 10),
      doubtCount: doubts.length,
    };
  }
  return { changed, doubts };
}

// Pontos cujo registro approved_local (high-confidence) tem OCR irrecuperavel,
// MAS existe uma curadoria LIMPA equivalente em deep-curated. Para esses, usamos
// o conteudo clinico limpo (acoes/indicacoes/localizacao/cautelas/agulhamento)
// em vez do OCR degradado. So pontos EXTRA do Atlas, onde o OCR e' o pior.
const PREFER_DEEP_CURATED = new Set(['EXHN3', 'EXHN5']);
const CLINICAL_FIELDS_TO_PREFER = ['locationText', 'actions', 'indications', 'cautions', 'relatedPatterns', 'needling'];

function buildDeepCleanMap() {
  const raw = JSON.parse(fs.readFileSync(DEEP, 'utf8'));
  const arr = Array.isArray(raw) ? raw : raw.reviews;
  const map = new Map();
  for (const r of arr) map.set(normCode(r.code), r);
  return map;
}

function shouldPreferDeepClean(review, code, deepCleanMap) {
  return Boolean(
    deepCleanMap
      && review.clinicalSource !== 'reocr_atlas'
      && PREFER_DEEP_CURATED.has(code)
      && deepCleanMap.has(code),
  );
}

function processFile(file, commonCodes, label, deepCleanMap = null) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const arr = Array.isArray(raw) ? raw : raw.reviews;
  const allDoubts = [];
  const cleanSourceResolutions = [];
  let touched = 0;
  for (const review of arr) {
    const code = normCode(review.code);
    if (!commonCodes.has(code)) continue;
    // Substitui conteudo OCR irrecuperavel pela curadoria limpa do deep-curated.
    if (shouldPreferDeepClean(review, code, deepCleanMap)) {
      const clean = deepCleanMap.get(code);
      for (const f of CLINICAL_FIELDS_TO_PREFER) {
        if (clean[f] != null) review[f] = JSON.parse(JSON.stringify(clean[f]));
      }
      review.clinicalSource = 'deep_curated_clean';
    }
    const { changed, doubts } = cleanReview(review);
    if (changed) touched++;
    // Pontos ja resolvidos por fonte limpa (re-OCR do Atlas ou curadoria deep limpa)
    // nao entram no worksheet de duvidas — o texto deles e' confiavel.
    const fromCleanSource = CLEAN_CLINICAL_SOURCES.has(review.clinicalSource);
    if (fromCleanSource) {
      review.ocrCleanup = {
        ...(review.ocrCleanup || {}),
        tool: 'tools/knowledge/clean-common-points-ocr.mjs',
        at: new Date().toISOString().slice(0, 10),
        doubtCount: 0,
        cleanSource: review.clinicalSource,
        residualDoubtCount: doubts.length,
      };
      cleanSourceResolutions.push({
        code: review.code,
        displayCode: review.displayCode,
        title: review.title,
        clinicalSource: review.clinicalSource,
        residualDoubtCount: doubts.length,
      });
    }
    if (doubts.length && !fromCleanSource) {
      allDoubts.push({ code: review.code, displayCode: review.displayCode, title: review.title, doubts });
    }
  }
  if (!DRY) fs.writeFileSync(file, JSON.stringify(raw, null, 2) + '\n');
  console.log(`${label}: ${touched} pontos limpos, ${allDoubts.length} com duvidas${DRY ? ' (dry-run)' : ''}`);
  return { doubts: allDoubts, cleanSourceResolutions };
}

function renderCleanSourceSection(cleanSourceResolutions) {
  const lines = [];
  lines.push('## Pontos retirados da planilha de dúvidas por fonte limpa');
  lines.push('');
  lines.push('Os pontos abaixo não aparecem na lista de dúvidas porque seus campos clínicos');
  lines.push('foram substituídos por uma fonte limpa rastreável. Isto não libera uso clínico');
  lines.push('automático: todos continuam exigindo auditoria profissional final.');
  lines.push('');

  if (!cleanSourceResolutions.length) {
    lines.push('- Nenhum ponto comum foi retirado por fonte limpa nesta geração.');
    lines.push('');
    return lines;
  }

  const sorted = [...cleanSourceResolutions].sort((a, b) => {
    const sourceOrder = String(a.clinicalSource).localeCompare(String(b.clinicalSource));
    if (sourceOrder !== 0) return sourceOrder;
    return normCode(a.code).localeCompare(normCode(b.code), 'pt-BR', { numeric: true });
  });
  const bySource = new Map();
  for (const entry of sorted) {
    const bucket = bySource.get(entry.clinicalSource) || [];
    bucket.push(entry);
    bySource.set(entry.clinicalSource, bucket);
  }

  for (const [source, entries] of bySource) {
    lines.push(`### ${CLEAN_SOURCE_LABELS[source] || source}`);
    lines.push('');
    for (const entry of entries) {
      const label = entry.displayCode || entry.code;
      const title = entry.title ? ` — ${entry.title}` : '';
      const residual = entry.residualDoubtCount
        ? ` (${entry.residualDoubtCount} ${entry.residualDoubtCount === 1 ? 'sinal residual ignorado' : 'sinais residuais ignorados'} por fonte limpa)`
        : '';
      lines.push(`- \`${label}\`${title}${residual}`);
    }
    lines.push('');
  }
  return lines;
}

function writeWorksheet(highDoubts, cleanSourceResolutions = []) {
  const lines = [];
  lines.push('# Pontos comuns — dúvidas de OCR para revisão profissional');
  lines.push('');
  lines.push('Gerado por `tools/knowledge/clean-common-points-ocr.mjs`. A limpeza automática');
  lines.push('corrigiu ruído inequívoco; os trechos abaixo permaneceram suspeitos e **não foram');
  lines.push('alterados** — exigem leitura do acupunturista contra o Atlas (nada foi inventado).');
  lines.push('');
  lines.push(...renderCleanSourceSection(cleanSourceResolutions));
  for (const entry of highDoubts) {
    lines.push(`## ${entry.displayCode || entry.code} — ${entry.title || ''}`);
    for (const d of entry.doubts) {
      lines.push(`- **${d.field}** (${d.label}): ${d.samples.map(s => `\`${s}\``).join(', ')}`);
    }
    lines.push('');
  }
  if (!DRY) fs.writeFileSync(WORKSHEET, lines.join('\n'));
  console.log(`worksheet: ${highDoubts.length} pontos com dúvidas -> docs/common-points-ocr-doubts.md`);
}

export { cleanField, stripRunningHeads, applyWordFixes, collectDoubts, renderCleanSourceSection, shouldPreferDeepClean };

function main() {
  const commonCodes = loadCommonCodes();
  const deepCleanMap = buildDeepCleanMap();
  const highResult = processFile(HIGH, commonCodes, 'high-confidence', deepCleanMap);
  processFile(DEEP, commonCodes, 'deep-curated');
  writeWorksheet(highResult.doubts, highResult.cleanSourceResolutions);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
