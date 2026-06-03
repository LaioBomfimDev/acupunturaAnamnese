import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const atlasPagesPath = path.join(root, 'docs', 'ednea-atlas-pages.json');
const candidatesPath = path.join(root, 'docs', 'km-agent-ednea-production-candidates.json');
const localReviewsPath = path.join(root, 'docs', 'km-agent-ednea-local-reviews.json');
const publicSourceIndexPath = path.join(root, 'frontend', 'public', 'knowledge', 'source-assets', 'atlas-ednea', 'source-index.json');
const localAtlasDir = path.join(root, 'frontend', '.local-source-assets', 'atlas-ednea');
const localSourceIndexPath = path.join(localAtlasDir, 'source-index.local.json');
const localPagesDir = path.join(localAtlasDir, 'pages');
const highConfidenceReviewsPath = path.join(localAtlasDir, 'high-confidence-reviews.json');
const auditJsonPath = path.join(root, 'docs', 'atlas-extra-local-audit.json');
const auditMdPath = path.join(root, 'docs', 'atlas-extra-local-audit.md');

const PDF_PAGE_OFFSET = 17;
const APPROVAL_METHOD = 'atlas_extra_operator_request';
const APPROVAL_THRESHOLD = 'atlas_extra_named_section_operator_approved';

const ATLAS_SOURCE = {
  source: 'Atlas da Ednea Martins',
  title: 'Atlas dos Pontos de Acupuntura: Guia de Localizacao',
  sourceKey: 'atlas-ednea-martins',
};

const GROUPS = {
  head: 'Pontos extras da cabeca e do pescoco',
  torso: 'Pontos extras de torax e abdome',
  back: 'Pontos extras de dorso e costas',
  upper: 'Pontos extras dos membros superiores',
  lower: 'Pontos extras dos membros inferiores',
};

const ATLAS_EXTRA_POINTS = [
  { atlasName: 'Sishencong', meaning: 'Brilho dos Quatro Espiritos', printedPage: 854, group: GROUPS.head, kmCode: 'EX-HN1' },
  { atlasName: 'Yintang', meaning: 'Palacio da Fronte', printedPage: 854, group: GROUPS.head, kmCode: 'EX-HN3', aliases: ['Yinta11g'] },
  { atlasName: 'Yuyao', meaning: 'Cintura do Peixe', printedPage: 854, group: GROUPS.head, kmCode: 'EX-HN4' },
  { atlasName: 'Qiuhou', meaning: 'Posterior no Bulbo do Olho', printedPage: 854, group: GROUPS.head, kmCode: 'EX-HN7' },
  { atlasName: 'Shangyingxiang', meaning: 'Drenar o Nariz', printedPage: 855, group: GROUPS.head, kmCode: 'EX-HN8', aliases: ['Bitong', 'Shangyingxiang ou Bitong', 'Shangyingxiang 011 Bitong'] },
  { atlasName: 'Erjian', meaning: 'Apice da Orelha', printedPage: 855, group: GROUPS.head, kmCode: 'EX-HN6' },
  { atlasName: 'Taiyang', meaning: 'Grande Yang', printedPage: 855, group: GROUPS.head, kmCode: 'EX-HN5', aliases: ['Taiyong', 'Tolyong'] },
  { atlasName: 'Yinming', meaning: 'Brilho nos Olhos', printedPage: 855, group: GROUPS.head, kmCode: 'EX-HN14', aliases: ['Yiming'] },
  { atlasName: 'Anmian', meaning: 'Sono Tranquilo', printedPage: 856, group: GROUPS.head },
  { atlasName: 'Bailao', meaning: 'Local de Cem Cansacos', printedPage: 856, group: GROUPS.head, kmCode: 'EX-HN15', aliases: ['Bai/ao'] },
  { atlasName: 'Chiqian', meaning: 'Em Frente da Lagoa', printedPage: 856, group: GROUPS.head },
  { atlasName: 'Chonggu', meaning: 'Osso Respeitado', printedPage: 856, group: GROUPS.head },
  { atlasName: 'Jianming', meaning: 'Fortalece o Brilho', printedPage: 857, group: GROUPS.head },
  { atlasName: 'Jianming n. 1', meaning: 'Fortalece o Brilho n. 1', printedPage: 857, group: GROUPS.head, aliases: ['Jianming n1', 'Jianming no 1', 'Jianming nº 1'] },
  { atlasName: 'Xiajingming', meaning: 'Abaixo do Jingming', printedPage: 857, group: GROUPS.head },
  { atlasName: 'Shangjingming', meaning: 'Acima do Jingming', printedPage: 857, group: GROUPS.head },
  { atlasName: 'Jianming n. 2', meaning: 'Fortalece o Brilho n. 2', printedPage: 858, group: GROUPS.head, aliases: ['Jianming n2', 'Jianming no 2', 'Jianming nº 2', 'Jianming n!l 2'] },
  { atlasName: 'Jianming n. 3', meaning: 'Fortalece o Brilho n. 3', printedPage: 858, group: GROUPS.head, aliases: ['Jianming n3', 'Jianming no 3', 'Jianming nº 3'] },
  { atlasName: 'Shangming', meaning: 'Brilho Superior', printedPage: 858, group: GROUPS.head },
  { atlasName: 'Waiming', meaning: 'Clareza da Regiao Externa', printedPage: 858, group: GROUPS.head },
  { atlasName: 'Qianzheng', meaning: 'Distensao Normal', printedPage: 859, group: GROUPS.head },
  { atlasName: 'Tingmin', meaning: 'Boa Sensibilidade', printedPage: 859, group: GROUPS.head, aliases: ['Tmgmin'] },
  { atlasName: 'Shanglianquan', meaning: 'Fonte de Agua Superior', printedPage: 859, group: GROUPS.head },
  { atlasName: 'Jingbi', meaning: 'Regiao Superior do Braco', printedPage: 859, group: GROUPS.head },
  { atlasName: 'Haiquan', meaning: 'Fonte de Agua do Mar', printedPage: 860, group: GROUPS.head, kmCode: 'EX-HN11', aliases: ['Haiq11an'] },
  { atlasName: 'Jinjin', meaning: 'Essencia Dourada', printedPage: 860, group: GROUPS.head, kmCode: 'EX-HN12' },
  { atlasName: 'Yuye', meaning: 'Liquido de Jade', printedPage: 860, group: GROUPS.head, kmCode: 'EX-HN13', aliases: ['l11ye'] },
  { atlasName: 'Jiachengjiang', meaning: 'Lateral a Chengjiang', printedPage: 860, group: GROUPS.head, aliases: ['Jiachengíiang'] },
  { atlasName: 'Shezhu', meaning: 'Pilar da Lingua', printedPage: 860, group: GROUPS.head },
  { atlasName: 'Yijing', meaning: 'Espermatorreia', printedPage: 861, group: GROUPS.torso },
  { atlasName: 'Weibao', meaning: 'Proteger o Povo', printedPage: 861, group: GROUPS.torso },
  { atlasName: 'Tituoxue', meaning: 'Levantamento', printedPage: 861, group: GROUPS.torso },
  { atlasName: 'Qimen extra', meaning: 'Porta do Qi', printedPage: 861, group: GROUPS.torso, aliases: ['Qimen'] },
  { atlasName: 'Sanjiaojiu', meaning: 'Tres Angulos da Moxa', printedPage: 862, group: GROUPS.torso },
  { atlasName: 'Weishangxue', meaning: 'Levantamento do Estomago', printedPage: 862, group: GROUPS.torso, aliases: ['Weishangx11e'] },
  { atlasName: 'Zigong', meaning: 'Utero', printedPage: 862, group: GROUPS.torso, kmCode: 'EX-CA1', aliases: ['Ligong'] },
  { atlasName: 'Yishu', meaning: 'Ponto Shu do Pancreas', printedPage: 863, group: GROUPS.back, kmCode: 'EX-B3', aliases: ['Yish11'] },
  { atlasName: 'Dingchuan', meaning: 'Acalmar a Dispneia', printedPage: 863, group: GROUPS.back, kmCode: 'EX-B1' },
  { atlasName: 'Kuiyangxue', meaning: 'Orificio da Ulcera', printedPage: 863, group: GROUPS.back },
  { atlasName: 'Xueyadian', meaning: 'Ponto da Pressao Sanguinea', printedPage: 863, group: GROUPS.back },
  { atlasName: 'Pigen', meaning: 'Eliminacao da Distensao', printedPage: 864, group: GROUPS.back, kmCode: 'EX-B4' },
  { atlasName: 'Shiqizhuixia', meaning: 'Ponto da Vertebra XVII', printedPage: 864, group: GROUPS.back, kmCode: 'EX-B8' },
  { atlasName: 'Yaoyan', meaning: 'Olho da Lombar', printedPage: 864, group: GROUPS.back, kmCode: 'EX-B7' },
  { atlasName: 'Yaoqi', meaning: 'Ponto Extraordinario Lombar', printedPage: 864, group: GROUPS.back, kmCode: 'EX-B9' },
  { atlasName: 'Huatuojiaji', meaning: 'Pontos Jiaji do Dr. Huatuo ou Pontos Paravertebrais', printedPage: 865, group: GROUPS.back, kmCode: 'EX-B2', aliases: ['Jiaji', 'Huatuojiaji ou Jiaji'] },
  { atlasName: 'Luozhen', meaning: 'Torcicolo', printedPage: 866, group: GROUPS.upper },
  { atlasName: 'Zhongkui', meaning: 'Dorso do Dedo', printedPage: 866, group: GROUPS.upper, kmCode: 'EX-UE4' },
  { atlasName: 'Zhongquan', meaning: 'Fontes Dorsais', printedPage: 866, group: GROUPS.upper, kmCode: 'EX-UE3' },
  { atlasName: 'Yaotongxue', meaning: 'Ponto da Dor Lombar', printedPage: 866, group: GROUPS.upper, kmCode: 'EX-UE7', aliases: ['Yao1ongx11e'] },
  { atlasName: 'Erbai', meaning: 'Dois Brancos', printedPage: 867, group: GROUPS.upper, kmCode: 'EX-UE2' },
  { atlasName: 'Sifeng', meaning: 'Quatro Pregas', printedPage: 867, group: GROUPS.upper, kmCode: 'EX-UE10' },
  { atlasName: 'Shixuan', meaning: 'Dez Difusoes', printedPage: 867, group: GROUPS.upper, kmCode: 'EX-UE11', aliases: ['Shi:a1an'] },
  { atlasName: 'Bichong', meaning: 'Meio do Antebraco', printedPage: 867, group: GROUPS.upper, aliases: ['Btchong', 'Bihong'] },
  { atlasName: 'Baxie', meaning: 'Oito Fatores Patogenicos', printedPage: 868, group: GROUPS.upper, kmCode: 'EX-UE9' },
  { atlasName: 'Jianneiling/Jianqian', meaning: 'Montanha Grande da Parte Interna do Ombro', printedPage: 868, group: GROUPS.upper, aliases: ['Jianneiling', 'Jianqian'] },
  { atlasName: 'Zhoujian', meaning: 'Ponta do Cotovelo', printedPage: 868, group: GROUPS.upper, kmCode: 'EX-UE1' },
  { atlasName: 'Bafeng', meaning: 'Oito Pontos de Vento', printedPage: 869, group: GROUPS.lower, kmCode: 'EX-LE10' },
  { atlasName: 'Genjin', meaning: 'Seguir Perto', printedPage: 869, group: GROUPS.lower },
  { atlasName: 'Genping', meaning: 'Seguir Lugar Plano', printedPage: 869, group: GROUPS.lower },
  { atlasName: 'Naoqing', meaning: 'Cerebro Limpo', printedPage: 869, group: GROUPS.lower },
  { atlasName: 'Heding', meaning: 'No Topo da Testa da Garca', printedPage: 870, group: GROUPS.lower, kmCode: 'EX-LE2' },
  { atlasName: 'Lanweixue', meaning: 'Ponto do Apendice', printedPage: 870, group: GROUPS.lower, kmCode: 'EX-LE7', aliases: ['Lanweixue', 'lanweixue'] },
  { atlasName: 'Xixia', meaning: 'Abaixo do Joelho', printedPage: 870, group: GROUPS.lower, aliases: ['Xi.tia'] },
  {
    atlasName: 'Xiyan',
    meaning: 'Olho do Joelho',
    printedPage: 870,
    group: GROUPS.lower,
    kmCode: 'EX-LE5',
    aliases: ['Xiya11'],
    kmMatches: [{
      code: 'EX-LE4',
      aliases: ['Neixiyan'],
      evidenceNote: 'A secao Xiyan do Atlas descreve o par medial/lateral do joelho; o ponto medial corresponde ao Neixiyan/EX-LE4 no KM-Agent.',
    }],
  },
  { atlasName: 'Jianxi', meaning: 'Abaixo do Joelho', printedPage: 871, group: GROUPS.lower },
  { atlasName: 'Maibu', meaning: 'Atravessar a Pe', printedPage: 871, group: GROUPS.lower, aliases: ['Maib11'] },
  { atlasName: 'Baichongwo', meaning: 'Cem Ninhos de Inseto', printedPage: 871, group: GROUPS.lower, kmCode: 'EX-LE3' },
  { atlasName: 'Siqiang', meaning: 'Fortalecedor dos Quatro Musculos', printedPage: 871, group: GROUPS.lower },
  { atlasName: 'Dannangxue', meaning: 'Ponto da Vesicula Biliar', printedPage: 872, group: GROUPS.lower, kmCode: 'EX-LE6' },
  { atlasName: 'Linghou', meaning: 'Proeminencia Posterior', printedPage: 872, group: GROUPS.lower, aliases: ['lingliou'] },
];

function normalizeSpaces(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.;,:])/g, '$1')
    .replace(/\s+-\s+/g, ' - ')
    .trim();
}

function stripDiacritics(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function keyFor(value) {
  return stripDiacritics(value)
    .trim()
    .toUpperCase()
    .replace(/^ACUPOINT:/, '')
    .replace(/[^A-Z0-9]/g, '');
}

function slugFor(value) {
  return stripDiacritics(value)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function compactForSearch(value) {
  return stripDiacritics(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function fuzzyPattern(alias) {
  const compact = compactForSearch(alias);
  if (!compact) return null;
  return new RegExp(compact.split('').map(escapeRegex).join('\\s*'), 'i');
}

function pointAliases(point) {
  const atlasNames = point.includeAtlasNameAlias === false ? [] : [point.atlasName];
  return [...new Set([...atlasNames, ...(point.aliases || [])].filter(Boolean))];
}

function pointKmMatches(point) {
  const matches = [];
  if (point.kmCode) matches.push({ code: point.kmCode, primary: true });
  for (const match of point.kmMatches || []) {
    if (match?.code) matches.push({ ...match, primary: false });
  }
  return matches;
}

function expandAtlasPoint(point) {
  const matches = pointKmMatches(point);
  if (!matches.length) return [point];

  return matches.map(match => ({
    ...point,
    kmCode: match.code,
    aliases: match.primary
      ? [...(point.aliases || []), ...(match.aliases || [])]
      : [...(match.aliases || [])],
    atlasLookupCode: match.atlasCode || (match.primary ? point.atlasName : match.aliases?.[0] || point.atlasName),
    includeAtlasNameAlias: match.primary,
    kmMatches: undefined,
    matchEvidenceNote: match.evidenceNote || '',
  }));
}

function atlasSectionKeyFor(point) {
  return `${point.printedPage}:${keyFor(point.atlasName)}`;
}

function findPointHeading(text, point) {
  const aliases = pointAliases(point);
  let best = null;

  for (const alias of aliases) {
    const literal = stripDiacritics(text).toLowerCase().indexOf(stripDiacritics(alias).toLowerCase());
    if (literal >= 0 && (!best || literal < best.index)) {
      best = { index: literal, alias, method: 'literal' };
    }

    const pattern = fuzzyPattern(alias);
    const match = pattern?.exec(text);
    if (match && (!best || match.index < best.index)) {
      best = { index: match.index, alias, method: 'fuzzy' };
    }
  }

  return best;
}

function splitList(text) {
  return normalizeSpaces(text)
    .split(/[;•]\s*/)
    .map(item => normalizeSpaces(item))
    .filter(value => value && value.length > 1)
    .slice(0, 12);
}

function cleanSection(text) {
  return normalizeSpaces(text)
    .replace(/^\/?\s*Loca[\p{L}\d\s/.,-]{0,28}?(?:cao|ção|liza|fao|afao|ilz)/iu, '')
    .replace(/^\/?\s*Locali?z?[\p{L}\d\s/.,-]{0,28}/iu, '')
    .replace(/^N\s*o?\s*t\s*a\s+de\s+loca[\p{L}\d\s/.,-]{0,34}/iu, '')
    .replace(/^M\s*[eé]\s*t\s*o\s*d\s*o\s*/i, '')
    .replace(/^M[ií1]\s*t\s*o\s*d\s*o\s*/i, '')
    .replace(/^Fun[\p{L}\d\sçõõeéêí]{0,34}/iu, '')
    .replace(/^[Il1J]\s*n\s*d\s*i\s*c[\p{L}\d\sçõôóãáéêí]{0,28}/iu, '')
    .replace(/^E\s*x[\p{L}\d\s/()]{0,34}\s+de\s+c\s*o\s*m\s*b\s*i\s*n\s*a[\p{L}\d\sçõôóãáéêí]{0,18}/iu, '')
    .replace(/APOSTILASMEDICINA@HOTMAIL\.COM.*$/i, '')
    .trim();
}

function findIndex(text, patterns, fromIndex = 0) {
  const slice = text.slice(fromIndex);
  for (const pattern of patterns) {
    const match = slice.match(pattern);
    if (match?.index !== undefined) {
      return {
        index: fromIndex + match.index,
        end: fromIndex + match.index + match[0].length,
      };
    }
  }
  return null;
}

function partBetween(text, startMatch, endMatches) {
  if (!startMatch) return '';
  let endIndex = text.length;
  for (const candidate of endMatches.filter(Boolean)) {
    if (candidate.index > startMatch.end && candidate.index < endIndex) {
      endIndex = candidate.index;
    }
  }
  return cleanSection(text.slice(startMatch.end, endIndex));
}

function parseFields(sectionText) {
  const location = findIndex(sectionText, [/Loca[\p{L}\d\s/.,-]{0,28}?(?:cao|ção|liza|fao|afao|ilz)/iu, /Loca/i]);
  const note = findIndex(sectionText, [/N\s*o?\s*t\s*a\s+de\s+loca/i], location?.end || 0);
  const method = findIndex(sectionText, [/M\s*[eé]\s*t\s*o\s*d\s*o/i, /M[ií1]\s*t\s*o\s*d\s*o/i], location?.end || 0);
  const functions = findIndex(sectionText, [/Fun[\p{L}\d\sçõõeéêí]{0,34}/iu], method?.end || 0);
  const indications = findIndex(sectionText, [/[Il1J]\s*n\s*d\s*i\s*c[\p{L}\d\sçõôóãáéêí]{0,28}/iu], functions?.end || 0);
  const examples = findIndex(sectionText, [/E\s*x[\p{L}\d\s/()]{0,34}\s+de\s+c\s*o\s*m\s*b\s*i\s*n\s*a/iu], indications?.end || 0);

  return {
    locationText: partBetween(sectionText, location, [note, method]),
    noteText: partBetween(sectionText, note, [method, functions, indications, examples]),
    methodText: partBetween(sectionText, method, [functions, indications, examples]),
    actions: splitList(partBetween(sectionText, functions, [indications, examples])),
    indications: splitList(partBetween(sectionText, indications, [examples])),
  };
}

function extractCautions(sectionText, locationText, methodText) {
  const text = normalizeSpaces(sectionText);
  const candidates = [];
  const anatomyText = `${locationText} ${methodText}`.toLowerCase();

  if (/(gravidez|gravida|gesta)/i.test(text)) {
    candidates.push('Revisar uso em gestacao antes de aplicar.');
  }
  if (/(orbita|orbital|olho|bulbo|nervo optico|canthus|canto interno)/i.test(anatomyText)) {
    candidates.push('Regiao ocular: revisar tecnica, profundidade e seguranca anatomica antes de aplicar.');
  }
  if (/(torax|tórax|intercostal|pulmao|pulmão|peitoral)/i.test(anatomyText)) {
    candidates.push('Regiao toracica: evitar insercao profunda e revisar risco anatomico.');
  }
  if (/(abdome|abdominal|pelve|pubica|umbilical|utero|útero)/i.test(anatomyText)) {
    candidates.push('Regiao abdominal/pelvica: revisar indicacao, profundidade e gestacao.');
  }

  return [...new Set(candidates)].slice(0, 4);
}

function renderedPageSet() {
  if (!fsSync.existsSync(localPagesDir)) return new Set();
  return new Set(
    fsSync.readdirSync(localPagesDir)
      .map(file => file.match(/^page-(\d+)\.webp$/)?.[1])
      .filter(Boolean)
      .map(Number),
  );
}

function pageFileName(page) {
  return `page-${String(page).padStart(3, '0')}.webp`;
}

function formatReferenceLabel(printedPages) {
  const pages = printedPages.length > 1 ? `${printedPages[0]}-${printedPages.at(-1)}` : printedPages[0];
  return `Atlas Ednea Martins, p. ${pages}`;
}

function imageUrls(pdfPages, renderedPages) {
  return pdfPages.map(pdfPage => {
    const page = Number(pdfPage);
    const rendered = renderedPages.has(page);
    return {
      pdfPage: page,
      url: rendered ? `/knowledge/source-assets/atlas-ednea/pages/${pageFileName(page)}` : null,
      status: rendered ? 'rendered_local' : 'not_rendered',
    };
  });
}

function outputCodeFor(point) {
  return point.kmCode || `ATLAS-EXTRA-${slugFor(point.atlasName)}`;
}

function sourceDraftIdFor(point) {
  return point.kmCode ? `acupoint:${point.kmCode}` : `atlas-extra:${slugFor(point.atlasName).toLowerCase()}`;
}

function sourceTitleFor(point) {
  return point.meaning
    ? `${point.atlasName} (${point.meaning})`
    : point.atlasName;
}

function titleFor(point, displayCode) {
  if (!point.kmCode) return sourceTitleFor(point);
  return `${displayCode} - ${sourceTitleFor(point)}`;
}

function truncate(value, max = 900) {
  const text = normalizeSpaces(value);
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trim()}...`;
}

function extractSections(atlasPages, points) {
  const byPdfPage = new Map();
  for (const point of points) {
    const pdfPage = point.printedPage + PDF_PAGE_OFFSET;
    if (!byPdfPage.has(pdfPage)) byPdfPage.set(pdfPage, []);
    byPdfPage.get(pdfPage).push(point);
  }

  const sections = new Map();
  for (const [pdfPage, pagePoints] of byPdfPage.entries()) {
    const text = atlasPages[pdfPage - 1]?.text || '';
    const starts = pagePoints.map(point => ({
      point,
      match: findPointHeading(text, point),
    }));

    for (const item of starts) {
      const start = item.match?.index ?? 0;
      const next = starts
        .map(candidate => candidate.match?.index)
        .filter(index => Number.isFinite(index) && index > start)
        .sort((a, b) => a - b)[0];
      const sectionText = normalizeSpaces(text.slice(start, next || text.length));
      sections.set(atlasSectionKeyFor(item.point), {
        sectionText,
        headingMatched: Boolean(item.match),
        headingAlias: item.match?.alias || '',
        headingMatchMethod: item.match?.method || 'page_fallback',
      });
    }
  }

  return sections;
}

function buildAtlasItem(point, renderedPages, section) {
  const code = outputCodeFor(point);
  const displayCode = point.kmCode || point.atlasName;
  const printedPages = [point.printedPage];
  const pdfPages = [point.printedPage + PDF_PAGE_OFFSET];
  const images = imageUrls(pdfPages, renderedPages);

  return {
    code,
    displayCode,
    atlasCode: point.atlasLookupCode || point.atlasName,
    title: titleFor(point, displayCode),
    aliases: pointAliases(point),
    sourceKey: ATLAS_SOURCE.sourceKey,
    sourceTitle: ATLAS_SOURCE.source,
    printedPages,
    pdfPages,
    referenceLabel: formatReferenceLabel(printedPages),
    status: 'atlas_extra_approved_local',
    confidence: section.headingMatched ? 'source_named_section' : 'source_page_reference',
    reviewRequired: true,
    textAvailable: Boolean(section.sectionText),
    imageAvailable: images.some(image => Boolean(image.url)),
    imageUrls: images,
    approvalMode: 'local_only',
    requiresProfessionalAudit: true,
    sectionSnippet: truncate(section.sectionText, 1200),
  };
}

function asArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value) return [];
  return [String(value).trim()].filter(Boolean);
}

function buildApproval(point, baseReview, section, fields, approvedAt) {
  const code = outputCodeFor(point);
  const displayCode = point.kmCode || point.atlasName;
  const printedPages = [point.printedPage];
  const pdfPages = [point.printedPage + PDF_PAGE_OFFSET];
  const sourceReference = {
    field: 'all',
    source: ATLAS_SOURCE.source,
    page: printedPages,
    pdfPage: pdfPages,
    note: `p. ${point.printedPage}`,
    atlasExtraName: point.atlasName,
    atlasMatchedCode: point.atlasLookupCode || point.atlasName,
    matchEvidence: point.matchEvidenceNote || undefined,
  };
  const locationText = fields.locationText || baseReview?.locationText || '';
  const methodText = fields.methodText || baseReview?.needling || '';
  const actions = fields.actions.length ? fields.actions : asArray(baseReview?.actions);
  const indications = fields.indications.length ? fields.indications : asArray(baseReview?.indications);
  const cautions = extractCautions(section.sectionText, locationText, methodText);
  const clinicalNote = [
    baseReview?.clinicalNote || '',
    `Fonte primaria: ${ATLAS_SOURCE.title}, p. ${point.printedPage}.`,
    section.headingMatched
      ? `Secao localizada por cabecalho do Atlas (${section.headingAlias}).`
      : 'Secao associada pela pagina do indice do Atlas; conferir OCR na auditoria.',
    point.matchEvidenceNote ? `Evidencia do vinculo: ${point.matchEvidenceNote}` : '',
    'Aprovado localmente por solicitacao explicita do operador para curadoria; manter auditoria profissional final antes de banco/producao.',
    fields.noteText ? `Nota de localizacao: ${fields.noteText}` : '',
  ].filter(Boolean).join(' ');

  return {
    ...(baseReview || {}),
    id: `approved-atlas-extra-${slugFor(code)}`,
    status: 'approved_local',
    type: 'acupoint',
    sourceDraftId: sourceDraftIdFor(point),
    code,
    displayCode,
    title: titleFor(point, displayCode),
    atlasName: point.atlasName,
    aliases: pointAliases(point),
    meridianCode: point.kmCode ? baseReview?.meridianCode || code.replace(/\d+$/, '') : 'ATLAS_EXTRA',
    meridian: baseReview?.meridian || point.group,
    locationText,
    actions,
    indications,
    cautions,
    relatedPatterns: asArray(baseReview?.relatedPatterns),
    techniques: asArray(baseReview?.techniques).length ? asArray(baseReview?.techniques) : ['agulha', 'moxa'],
    needling: methodText,
    clinicalNote,
    source: ATLAS_SOURCE.title,
    approvalMethod: APPROVAL_METHOD,
    approvalThreshold: APPROVAL_THRESHOLD,
    approvalSource: 'Atlas Ednea Martins',
    approvalMode: 'local_only',
    confidence: section.headingMatched ? 'source_named_section' : 'source_page_reference',
    requiresProfessionalAudit: true,
    approvedAt,
    updatedAt: approvedAt,
    createdAt: baseReview?.createdAt || approvedAt,
    enrichment: {
      ...(baseReview?.enrichment || {}),
      atlasReference: [sourceReference],
      confidence: section.headingMatched ? 'source_named_section' : 'source_page_reference',
      productionStatus: 'approved_local_by_operator_atlas_extra',
      approvalMethod: APPROVAL_METHOD,
      approvalThreshold: APPROVAL_THRESHOLD,
      approvalMode: 'local_only',
      requiresProfessionalAudit: true,
      atlasOnly: !point.kmCode,
      atlasMatchEvidence: point.matchEvidenceNote || undefined,
      atlasSectionSnippet: truncate(section.sectionText, 1200),
    },
  };
}

function refreshCounts(sourceIndex, items, renderedPages) {
  return {
    ...sourceIndex.counts,
    total: items.length,
    referenced: items.filter(item => item.status === 'atlas_referenced_candidate').length,
    withPdfPages: items.filter(item => (item.pdfPages || []).length > 0).length,
    withImages: items.filter(item => item.imageAvailable).length,
    renderedPages: renderedPages.size,
    atlasExtraApprovedLocal: items.filter(item => item.status === 'atlas_extra_approved_local').length,
  };
}

function sortItems(items) {
  return [...items].sort((a, b) => {
    const aExtra = a.code?.startsWith('ATLAS-EXTRA-') ? 1 : 0;
    const bExtra = b.code?.startsWith('ATLAS-EXTRA-') ? 1 : 0;
    if (aExtra !== bExtra) return aExtra - bExtra;
    return String(a.code || '').localeCompare(String(b.code || ''), 'en', { numeric: true });
  });
}

function reportMarkdown(audit) {
  const matchedRows = audit.matchedKmPoints
    .map(item => `- ${item.code}: ${item.atlasName} - Atlas p. ${item.printedPage}, PDF p. ${item.pdfPage}`)
    .join('\n');
  const atlasOnlyRows = audit.atlasOnlyPoints
    .map(item => `- ${item.code}: ${item.atlasName} - Atlas p. ${item.printedPage}, PDF p. ${item.pdfPage}`)
    .join('\n');
  const remainingRows = audit.remainingKmWithoutAtlasSource
    .map(item => `- ${item.code}: ${item.title}`)
    .join('\n');

  return `# Atlas Ednea - aprovacao local de pontos extras

Gerado em: ${audit.generatedAt}

## Resultado

- Pontos extras/novos encontrados no indice do Atlas: ${audit.counts.atlasExtraDefinitions}
- Associados a registros KM-Agent existentes com seguranca conservadora: ${audit.counts.matchedKmPoints}
- Novos registros locais criados a partir do Atlas: ${audit.counts.atlasOnlyPoints}
- Total aprovado localmente por este lote: ${audit.counts.approvedLocalAtlasExtra}
- Registros KM-Agent que continuam sem fonte Atlas segura: ${audit.counts.remainingKmWithoutAtlasSource}
- Paginas PDF de extras para renderizar/conferir: ${audit.pagesToRender.join(', ')}

## Regra de seguranca

Todos os registros deste lote ficam como \`approved_local\`, \`approvalMode: local_only\` e \`requiresProfessionalAudit: true\`.
Eles podem aparecer na Biblioteca Viva local e no popup de fonte, mas nao representam aprovacao profissional final nem migracao para Supabase/producao.

## Associados ao KM-Agent

${matchedRows || '- Nenhum.'}

## Novos locais do Atlas

${atlasOnlyRows || '- Nenhum.'}

## Ainda sem associacao segura no Atlas

${remainingRows || '- Nenhum.'}
`;
}

async function readJsonIfExists(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

async function main() {
  const approvedAt = new Date().toISOString();
  const [atlasPayload, candidatesPayload, localReviews, sourceIndex] = await Promise.all([
    fs.readFile(atlasPagesPath, 'utf8').then(JSON.parse),
    fs.readFile(candidatesPath, 'utf8').then(JSON.parse),
    fs.readFile(localReviewsPath, 'utf8').then(JSON.parse),
    readJsonIfExists(localSourceIndexPath, null).then(local => local || readJsonIfExists(publicSourceIndexPath, null)),
  ]);

  if (!sourceIndex?.items) {
    throw new Error('Indice de fonte do Atlas nao encontrado.');
  }

  const atlasPages = atlasPayload.pages || [];
  const renderedPages = renderedPageSet();
  const sections = extractSections(atlasPages, ATLAS_EXTRA_POINTS);
  const atlasPointVariants = ATLAS_EXTRA_POINTS.flatMap(expandAtlasPoint);
  const reviewsByCode = new Map(localReviews.map(review => [keyFor(review.code || review.displayCode), review]));
  const itemsByCode = new Map(sourceIndex.items.map(item => [keyFor(item.code), item]));

  const generatedSourceItems = [];
  const generatedReviews = [];

  for (const point of atlasPointVariants) {
    const code = outputCodeFor(point);
    const section = sections.get(atlasSectionKeyFor(point)) || { sectionText: '', headingMatched: false, headingAlias: '', headingMatchMethod: 'missing' };
    const fields = parseFields(section.sectionText);
    const baseReview = reviewsByCode.get(keyFor(point.kmCode || ''));

    generatedSourceItems.push(buildAtlasItem(point, renderedPages, section));
    generatedReviews.push(buildApproval(point, baseReview, section, fields, approvedAt));
  }

  for (const item of generatedSourceItems) {
    itemsByCode.set(keyFor(item.code), {
      ...(itemsByCode.get(keyFor(item.code)) || {}),
      ...item,
    });
  }

  const items = sortItems([...itemsByCode.values()]);
  const nextSourceIndex = {
    ...sourceIndex,
    schemaVersion: 'atlas-source-index.v1',
    generatedAt: approvedAt,
    assetMode: 'local_rendered_pages',
    source: {
      ...(sourceIndex.source || {}),
      key: ATLAS_SOURCE.sourceKey,
      title: ATLAS_SOURCE.title,
      note: 'Indice local com paginas renderizadas sob demanda e pontos extras aprovados apenas para curadoria local.',
    },
    counts: refreshCounts(sourceIndex, items, renderedPages),
    items,
  };

  const highPayload = await readJsonIfExists(highConfidenceReviewsPath, {
    schemaVersion: 1,
    generatedAt: approvedAt,
    approvalMode: 'local_only',
    reviews: [],
    counts: {},
  });
  const preservedReviews = (highPayload.reviews || []).filter(review => review.approvalMethod !== APPROVAL_METHOD);
  const reviewMap = new Map(preservedReviews.map(review => [keyFor(review.code || review.displayCode || review.id), review]));
  for (const review of generatedReviews) {
    reviewMap.set(keyFor(review.code || review.displayCode || review.id), review);
  }
  const nextReviews = [...reviewMap.values()].sort((a, b) => String(a.code || '').localeCompare(String(b.code || ''), 'en', { numeric: true }));
  const nextHighPayload = {
    ...highPayload,
    generatedAt: approvedAt,
    approvalMode: 'local_only',
    approvalMethod: highPayload.approvalMethod || 'mixed_local_approvals',
    source: {
      ...(highPayload.source || {}),
      atlasExtraApprovals: 'tools/knowledge/build-atlas-extra-local-approvals.mjs',
      primaryReference: ATLAS_SOURCE.title,
    },
    counts: {
      ...(highPayload.counts || {}),
      approvedLocal: nextReviews.filter(review => review.status === 'approved_local').length,
      atlasExtraApprovedLocal: generatedReviews.length,
      atlasExtraAtlasOnly: generatedReviews.filter(review => review.enrichment?.atlasOnly).length,
      atlasExtraMatchedKm: generatedReviews.filter(review => !review.enrichment?.atlasOnly).length,
    },
    reviews: nextReviews,
  };

  const generatedKmCodes = new Set(atlasPointVariants.filter(point => point.kmCode).map(point => keyFor(point.kmCode)));
  const remainingKmWithoutAtlasSource = (candidatesPayload.candidates || [])
    .filter(candidate => !(candidate.atlas?.pdfPages || []).length)
    .filter(candidate => !generatedKmCodes.has(keyFor(candidate.code || candidate.reviewInputs?.code)))
    .map(candidate => ({
      code: candidate.code || candidate.reviewInputs?.code || '',
      title: candidate.reviewInputs?.title || '',
      meridianCode: candidate.reviewInputs?.meridianCode || '',
    }))
    .sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true }));

  const pagesToRender = [...new Set(ATLAS_EXTRA_POINTS.map(point => point.printedPage + PDF_PAGE_OFFSET))].sort((a, b) => a - b);
  const matchedKmPoints = atlasPointVariants
    .filter(point => point.kmCode)
    .map(point => ({
      code: point.kmCode,
      atlasName: point.atlasName,
      printedPage: point.printedPage,
      pdfPage: point.printedPage + PDF_PAGE_OFFSET,
      matchEvidence: point.matchEvidenceNote || undefined,
    }));
  const atlasOnlyPoints = ATLAS_EXTRA_POINTS
    .filter(point => !point.kmCode)
    .map(point => ({
      code: outputCodeFor(point),
      atlasName: point.atlasName,
      printedPage: point.printedPage,
      pdfPage: point.printedPage + PDF_PAGE_OFFSET,
    }));

  const audit = {
    schemaVersion: 1,
    generatedAt: approvedAt,
    approvalMode: 'local_only',
    approvalMethod: APPROVAL_METHOD,
    counts: {
      atlasExtraDefinitions: ATLAS_EXTRA_POINTS.length,
      matchedKmPoints: matchedKmPoints.length,
      atlasOnlyPoints: atlasOnlyPoints.length,
      approvedLocalAtlasExtra: generatedReviews.length,
      remainingKmWithoutAtlasSource: remainingKmWithoutAtlasSource.length,
      sourceIndexItems: nextSourceIndex.items.length,
      sourceIndexWithImages: nextSourceIndex.counts.withImages,
    },
    pagesToRender,
    matchedKmPoints,
    atlasOnlyPoints,
    remainingKmWithoutAtlasSource,
  };

  await fs.mkdir(localAtlasDir, { recursive: true });
  await fs.writeFile(localSourceIndexPath, `${JSON.stringify(nextSourceIndex, null, 2)}\n`, 'utf8');
  await fs.writeFile(highConfidenceReviewsPath, `${JSON.stringify(nextHighPayload, null, 2)}\n`, 'utf8');
  await fs.writeFile(auditJsonPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
  await fs.writeFile(auditMdPath, reportMarkdown(audit), 'utf8');

  console.log(JSON.stringify({
    sourceIndex: path.relative(root, localSourceIndexPath),
    highConfidenceReviews: path.relative(root, highConfidenceReviewsPath),
    auditJson: path.relative(root, auditJsonPath),
    auditMarkdown: path.relative(root, auditMdPath),
    counts: audit.counts,
    pagesToRender,
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
