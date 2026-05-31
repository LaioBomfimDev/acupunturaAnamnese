import { KNOWLEDGE_TYPES } from './schema';
import { acupoints, auricularPoints, knowledgeEntities, patternDefinitions, staticKnowledge, techniqueKnowledge } from './knowledgeBase';

const CATEGORY_BY_TYPE = {
  [KNOWLEDGE_TYPES.PATTERN]: 'Síndrome',
  [KNOWLEDGE_TYPES.ACUPOINT]: 'Ponto',
  [KNOWLEDGE_TYPES.AURICULAR_POINT]: 'Aurículo',
  [KNOWLEDGE_TYPES.TECHNIQUE]: 'Técnica',
  [KNOWLEDGE_TYPES.SAFETY_RULE]: 'Segurança',
  [KNOWLEDGE_TYPES.REPORT_TEMPLATE]: 'Relatório',
  [KNOWLEDGE_TYPES.MAP_ASSET]: 'Mapa',
};

function asSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function pointToCard(point) {
  const name = point.names?.pt || point.names?.en || point.displayCode;
  return {
    id: point.id,
    cat: 'Ponto',
    title: `${point.displayCode} — ${name}`,
    tags: [
      point.displayCode,
      point.code,
      point.meridian?.pt,
      ...(point.actions || []),
      ...(point.indications || []),
      ...(point.relatedPatterns || []),
    ].filter(Boolean).join(', '),
    source: (point.sources || []).map(source => source.label).join(' + ') || 'Biblioteca Viva',
    txt: [
      point.locationText,
      point.actions?.length ? `Funções: ${point.actions.join(', ')}.` : '',
      point.indications?.length ? `Indicações: ${point.indications.join(', ')}.` : '',
      point.cautions?.length ? `Cautelas: ${point.cautions.join(', ')}.` : '',
    ].filter(Boolean).join(' '),
    entity: point,
  };
}

function auricularToCard(point) {
  return {
    id: point.id,
    cat: 'Aurículo',
    title: `Aurículo — ${point.name}`,
    tags: [...(point.actions || []), ...(point.indications || []), ...(point.relatedPatterns || [])].join(', '),
    source: (point.sources || []).map(source => source.label).join(' + ') || 'Biblioteca Viva',
    txt: [
      point.actions?.length ? `Funções: ${point.actions.join(', ')}.` : '',
      point.indications?.length ? `Indicações: ${point.indications.join(', ')}.` : '',
    ].filter(Boolean).join(' '),
    entity: point,
  };
}

function patternToCard(pattern) {
  return {
    id: `pattern:${pattern.name}`,
    cat: 'Síndrome',
    title: pattern.name,
    tags: pattern.tags?.join(', ') || '',
    source: 'Base clínica MTC + revisão profissional',
    txt: [
      pattern.detail?.manifestation,
      pattern.detail?.root,
      pattern.protocol?.goal ? `Princípio: ${pattern.protocol.goal}` : '',
      pattern.detail?.question ? `Pergunta-chave: ${pattern.detail.question}` : '',
    ].filter(Boolean).join(' '),
    entity: pattern,
  };
}

function techniqueToCard(technique) {
  return {
    id: technique.id,
    cat: 'Técnica',
    title: technique.name,
    tags: technique.tags?.join(', ') || '',
    source: (technique.sources || []).map(source => source.label).join(' + ') || 'Biblioteca Viva',
    txt: [
      technique.summary,
      technique.cautions?.length ? `Cautelas: ${technique.cautions.join(', ')}.` : '',
    ].filter(Boolean).join(' '),
    entity: technique,
  };
}

function staticToCard(item) {
  return {
    id: item.id,
    cat: CATEGORY_BY_TYPE[item.type] || 'Biblioteca',
    title: item.name,
    tags: item.tags?.join(', ') || '',
    source: (item.sources || []).map(source => source.label).join(' + ') || 'Biblioteca Viva',
    txt: item.summary,
    entity: item,
  };
}

export const knowledgeCards = [
  ...Object.values(patternDefinitions).map(patternToCard),
  ...acupoints.map(pointToCard),
  ...auricularPoints.map(auricularToCard),
  ...techniqueKnowledge.map(techniqueToCard),
  ...staticKnowledge.map(staticToCard),
];

export function getKnowledgeCategories() {
  return [...new Set(knowledgeCards.map(item => item.cat))];
}

export function searchKnowledge({ query = '', category = 'Todos' } = {}) {
  const normalizedQuery = asSearchText(query);
  return knowledgeCards.filter(item => {
    const categoryMatches = category === 'Todos' || item.cat === category;
    if (!categoryMatches) return false;
    if (!normalizedQuery) return true;

    const haystack = asSearchText([
      item.title,
      item.txt,
      item.tags,
      item.source,
      item.entity?.code,
      item.entity?.displayCode,
    ].join(' '));

    return haystack.includes(normalizedQuery);
  });
}

export function getKnowledgeStats() {
  return {
    total: knowledgeEntities.length,
    acupoints: acupoints.length,
    auricular: auricularPoints.length,
    patterns: Object.keys(patternDefinitions).length,
    techniques: techniqueKnowledge.length,
  };
}
