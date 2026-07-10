// ============================================================
// herbalIndicationLinking — LANE FITOTERÁPICA (paradigma próprio, AGENTS.md §8).
//
// Liga as queixas/sintomas da anamnese às ervas do catálogo fitoterápico
// OCIDENTAL por TEMA DE SINTOMA (digestivo, hepático, calmante, respiratório…),
// derivado do resumo JÁ CURADO de cada erva. NÃO usa energia/órgão MTC — a fonte
// das ervas não tem esse eixo e inventá-lo é proibido. É lane SEPARADA, nunca
// blendada na diferenciação MTC dos alimentos; instrui/indica onde a tradição
// popular associa, não prescreve.
//
// Segurança: os TEMAS saem do `educationalSummary` (linguagem segura da
// curadoria), nunca dos nomes de doença crus de `traditionalIndications` — assim
// nunca surge "erva X trata hepatite". O `worksheetSuggestedStatus` é só proposta
// de revisão: sem resolvedor de publicação explícito, nenhuma erva entra no
// resultado ao vivo.
// ============================================================

import { HERBAL_CATALOG, HERBAL_CATALOG_SOURCE } from './generated/herbalCatalog.js';

export const HERBAL_LINK_DISCLAIMER =
  'Leitura tradicional/popular da fitoterapia ocidental — lane própria, NÃO é leitura MTC nem prescrição. '
  + 'A fonte associa estas ervas ao TEMA da sua queixa; não indica uso, dose, preparo nem combinação. '
  + 'Cautelas, interações e populações de risco exigem avaliação profissional (gate humano).';

// Temas seguros de indicação. `summary` casa a erva a partir do resumo curado;
// `symptom` casa a queixa/anamnese do paciente. Palavras SEM acento (o texto é
// normalizado antes de casar). Nível de tema — nunca nome de doença.
export const HERBAL_THEMES = {
  digestivo: {
    label: 'Digestivo',
    summary: ['digest', 'gastric', 'gastr', 'estomag', 'intestin', 'colica', 'azia', 'nause', 'enjoo', 'acidez'],
    symptom: ['digest', 'estomag', 'gastr', 'azia', 'nause', 'enjoo', 'gases', 'flatul', 'empach', 'indigest', 'refluxo', 'colica', 'intestin', 'constipa', 'prisao de ventre', 'diarr', 'ma digestao'],
  },
  hepatico_biliar: {
    label: 'Hepático / biliar',
    summary: ['hepat', 'biliar', 'bile', 'figado', 'vesicul'],
    symptom: ['figado', 'hepat', 'biliar', 'vesicul', 'bile'],
  },
  calmante_sono: {
    label: 'Calmante / sono',
    summary: ['calmante', 'ansiolit', 'hipnot', 'sono'],
    symptom: ['ansied', 'ansios', 'insoni', 'sono', 'nervos', 'agita', 'estresse', 'tensao', 'irritab'],
  },
  respiratorio: {
    label: 'Respiratório',
    summary: ['respirator', 'tosse', 'broncodilatador', 'bronqui', 'resfriado', 'expectora', 'catarro'],
    symptom: ['tosse', 'catarro', 'gripe', 'resfriado', 'expectora', 'bronqui', 'respirator', 'pigarro', 'coriza', 'falta de ar', 'dispneia'],
  },
  garganta_mucosas: {
    label: 'Garganta / mucosas',
    summary: ['garganta', 'mucosas', 'boca', 'gargarej'],
    symptom: ['garganta', 'afta', 'gengiv', 'rouquid', 'faringe', 'amigdal'],
  },
  urinario: {
    label: 'Urinário',
    summary: ['urinar', 'diure'],
    symptom: ['urina', 'urinar', 'bexiga', 'cistite', 'disuria', 'miccao'],
  },
  pele: {
    label: 'Pele',
    summary: ['pele', 'dermat'],
    symptom: ['pele', 'dermat', 'coceira', 'eczema', 'acne', 'prurido'],
  },
  circulacao: {
    label: 'Circulação',
    summary: ['circula', 'frio nas extremidades'],
    symptom: ['circula', 'varizes', 'hemorroid', 'maos frias', 'pes frios', 'extremidades frias', 'ma circulacao'],
  },
  vitalidade_fadiga: {
    label: 'Vitalidade / cansaço',
    summary: ['cansaco'],
    symptom: ['cansaco', 'fadiga', 'exaust', 'cansad', 'sem disposicao'],
  },
};

const RELEASE_RANK = { source_only: 0, curadoria_tecnica: 1, restrito_profissional: 2, educativo_aprovado: 3 };

export function normalizeHerbText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function matchThemes(text, field) {
  const norm = normalizeHerbText(text);
  const ids = [];
  for (const [id, theme] of Object.entries(HERBAL_THEMES)) {
    if (theme[field].some(kw => norm.includes(kw))) ids.push(id);
  }
  return ids;
}

// Temas de uma erva — derivados só do resumo curado (linguagem segura).
export function getHerbThemes(herb) {
  return matchThemes(herb?.educationalSummary, 'summary');
}

// Temas presentes na queixa/anamnese do paciente.
export function getSymptomThemes(anamneseText) {
  return matchThemes(anamneseText, 'symptom');
}

// Catálogo anotado com os temas (uma vez).
export const HERBAL_CATALOG_THEMED = HERBAL_CATALOG.map(h => ({ ...h, themes: getHerbThemes(h) }));

/**
 * Liga a anamnese às ervas por tema de sintoma. Só entra na sugestão ao vivo a
 * erva cujo status atinge o mínimo (default `educativo_aprovado`) — as
 * `restrito_profissional` ficam fora do ao-vivo por decisão de curadoria.
 *
 * @param {string} anamneseText  queixa + sintomas do paciente (texto livre)
 * @param {object} [options]
 * @param {'restrito_profissional'|'educativo_aprovado'} [options.minStatus='educativo_aprovado']
 * @param {(herb:object)=>string} [options.resolveStatus]  status efetivo publicado; default = source_only
 * @param {(herbId:string)=>boolean} [options.isBlocked]   esconde bloqueados por risco
 * @param {number} [options.maxResults=12]
 * @returns {{hasInput:boolean, patientThemes:Array, matched:Array, disclaimer:string, source:object}}
 */
export function linkHerbsToSymptoms(anamneseText, options = {}) {
  const {
    minStatus = 'educativo_aprovado',
    resolveStatus = herb => herb.contentReleaseStatus || 'source_only',
    isBlocked = () => false,
    maxResults = 12,
  } = options;

  const patientThemeIds = getSymptomThemes(anamneseText);
  const patientThemes = patientThemeIds.map(id => ({ id, label: HERBAL_THEMES[id].label }));
  const hasInput = normalizeHerbText(anamneseText).trim().length > 0;

  if (patientThemeIds.length === 0) {
    return { hasInput, patientThemes: [], matched: [], disclaimer: HERBAL_LINK_DISCLAIMER, source: HERBAL_CATALOG_SOURCE };
  }

  const minRank = RELEASE_RANK[minStatus] ?? RELEASE_RANK.educativo_aprovado;
  const matched = HERBAL_CATALOG_THEMED
    .filter(herb => {
      if (isBlocked(herb.id)) return false;
      if ((RELEASE_RANK[resolveStatus(herb)] ?? 0) < minRank) return false;
      return herb.themes.some(t => patientThemeIds.includes(t));
    })
    .map(herb => {
      const matchedThemeIds = herb.themes.filter(t => patientThemeIds.includes(t));
      return {
        id: herb.id,
        commonName: herb.commonName,
        scientificName: herb.scientificName,
        tier: herb.tier,
        status: resolveStatus(herb),
        matchedThemes: matchedThemeIds.map(id => HERBAL_THEMES[id].label),
        allThemes: herb.themes.map(id => HERBAL_THEMES[id].label),
        educationalSummary: herb.educationalSummary,
        caution: herb.cautionSummary,
        sourcePages: herb.sourcePdfPages,
        evidence: 'Tradicional/popular (fitoterapia ocidental)',
        _matchCount: matchedThemeIds.length,
      };
    });

  matched.sort((a, b) => {
    if (a._matchCount !== b._matchCount) return b._matchCount - a._matchCount;
    return a.commonName.localeCompare(b.commonName, 'pt');
  });

  return {
    hasInput,
    patientThemes,
    matched: matched.slice(0, maxResults),
    disclaimer: HERBAL_LINK_DISCLAIMER,
    source: HERBAL_CATALOG_SOURCE,
  };
}
