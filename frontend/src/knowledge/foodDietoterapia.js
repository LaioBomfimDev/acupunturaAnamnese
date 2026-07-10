// ============================================================
// foodDietoterapia — catálogo educativo de dietoterapia chinesa (alimentos)
//
// Trilha ALIMENTO (mais leve que a de ervas — ver docs/nutricao-ervas/
// 01-politica-de-liberacao-e-seguranca.md). Cada alimento traz a leitura
// tradicional da MTC descrita na fonte: energia (natureza térmica), sabor(es)
// e ação/afinidade em sistemas funcionais. NÃO é plano alimentar, cardápio,
// dieta nem prescrição. As associações são tradicionais da MTC, não
// diagnóstico biomédico.
//
// Fonte única: "Sistema Chinês de Curas Alimentares" (source_only no acervo).
// O catálogo é DERIVADO das monografias completas do livro (ver
// generated/foodMonographs.js): cada alimento traz energia, sabor(es) e órgãos
// lidos da "Descrição" da fonte, mais o conteúdo rico (indicações, aplicações
// com quantidades, relatórios clínicos e comentários) para a visão expandida.
//
// Status: `curadoria_tecnica` — extraído da fonte, uso educativo interno do
// profissional. NÃO é `educativo_aprovado` (depende do gate humano de curadoria)
// e não alimenta paciente/IA/protocolo automaticamente. O conteúdo rico é
// REFERÊNCIA do livro, não prescrição.
// ============================================================

import { FOOD_MONOGRAPHS } from './generated/foodMonographs.js';

export const FOOD_SOURCE = {
  key: 'sistema-chines-curas-alimentares',
  title: 'Sistema Chinês de Curas Alimentares',
};

export const FOOD_DISCLAIMER =
  'Conteúdo educativo de dietoterapia chinesa tradicional. Não é prescrição, plano alimentar, dieta nem substituto de avaliação nutricional ou médica. As associações entre alimentos, sabores, energias e sistemas funcionais são leitura tradicional da MTC, não diagnóstico biomédico.';

// Natureza térmica (energia) — como a fonte descreve o efeito no organismo.
export const FOOD_ENERGIES = {
  fria: { label: 'Fria', hint: 'tende a refrescar' },
  fresca: { label: 'Fresca', hint: 'refresca levemente' },
  neutra: { label: 'Neutra', hint: 'equilibrada' },
  morna: { label: 'Morna', hint: 'aquece levemente' },
  quente: { label: 'Quente', hint: 'tende a aquecer' },
};

export const FOOD_FLAVORS = {
  pungente: { label: 'Pungente', hint: 'promove circulação e transpiração' },
  doce: { label: 'Doce', hint: 'associado à digestão e ao fortalecimento' },
  azedo: { label: 'Azedo', hint: 'associado à contenção' },
  amargo: { label: 'Amargo', hint: 'associado a reduzir calor e umidade' },
  salgado: { label: 'Salgado', hint: 'associado a suavizar durezas' },
  suave: { label: 'Suave', hint: 'associado à drenagem de líquidos' },
};

// Sistemas funcionais da MTC (não são órgãos biomédicos).
export const FOOD_ORGANS = {
  baco: 'Baço (eixo digestivo, MTC)',
  estomago: 'Estômago (MTC)',
  pulmoes: 'Pulmão (MTC)',
  intestino_grosso: 'Intestino grosso (MTC)',
  intestino_delgado: 'Intestino delgado (MTC)',
  figado: 'Fígado (MTC)',
  vesicula: 'Vesícula biliar (MTC)',
  rins: 'Rim (MTC)',
  bexiga: 'Bexiga (MTC)',
  coracao: 'Coração (MTC)',
};

// Eixos educativos da consulta — agrupam os alimentos por tema seguro de
// conversa (síntese integrada, doc 00). Não são diagnósticos.
export const FOOD_AXES = {
  aquecer: { label: 'Aquecer (sensação de frio)', energies: ['morna', 'quente'] },
  refrescar: { label: 'Refrescar (sensação de calor)', energies: ['fria', 'fresca'] },
  digestao: { label: 'Digestão e regularidade', organs: ['baco', 'estomago', 'intestino_grosso'] },
};

// Cautela leve derivada da energia térmica — espelha o padrão manual anterior
// (a fonte associa alimentos quentes/frios ao agravamento de quadros opostos).
// Cautelas específicas por alimento seguem nos `comentarios` do próprio livro.
function energyCaution(energy) {
  if (energy === 'quente') return 'Energia quente: a fonte associa alimentos quentes ao agravamento de quadros de calor. Moderar em sensação de calor.';
  if (energy === 'fria') return 'Energia fria: a fonte a associa a quadros de calor; moderar em sensação de frio ou digestão fraca.';
  return '';
}

// Catálogo derivado das 160 monografias completas do livro. Mantém o formato
// usado por painel/curadoria (commonName, energy, flavors, organs, sourcePages)
// e anexa o conteúdo rico da fonte para a visão expandida. O texto rico
// (indications, aplicacoes, comentarios…) é REFERÊNCIA do livro, não prescrição,
// e nunca entra na frase educativa `describeFoodTradition`.
export const FOOD_CATALOG = FOOD_MONOGRAPHS.map(m => ({
  id: m.id,
  commonName: m.name,
  energy: m.energy,
  flavors: m.flavors || [],
  organs: m.organs || [],
  sourcePages: [m.page].filter(v => v != null),
  caution: energyCaution(m.energy),
  // conteúdo tradicional do livro (visão expandida / curadoria):
  chapter: m.chapter,
  indications: m.indications,
  descricao: m.descricao,
  aplicacoes: m.aplicacoes || [],
  relatoriosClinicos: m.relatoriosClinicos || [],
  experiencias: m.experiencias || [],
  comentarios: m.comentarios || [],
  needsReview: m.needsReview,
}));

function joinPt(list) {
  const parts = list.filter(Boolean);
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`;
}

/**
 * Frase educativa segura, composta a partir dos dados curados. Não inventa
 * indicação, dose nem prescrição — descreve a leitura tradicional da fonte.
 */
export function describeFoodTradition(food) {
  if (!food) return '';
  const energy = FOOD_ENERGIES[food.energy];
  const flavors = (food.flavors || []).map(f => FOOD_FLAVORS[f]?.label.toLowerCase()).filter(Boolean);
  const organs = (food.organs || []).map(o => FOOD_ORGANS[o]).filter(Boolean);

  const parts = [];
  if (energy) parts.push(`natureza ${energy.label.toLowerCase()}`);
  if (flavors.length) parts.push(`sabor ${joinPt(flavors)}`);
  const base = `Na dietoterapia chinesa descrita na fonte, associa-se a ${joinPt(parts)}.`;
  const organText = organs.length
    ? ` Ação tradicional relacionada a ${joinPt(organs)}.`
    : '';
  return `${base}${organText} Conteúdo educativo para conversar sobre hábitos alimentares; não é indicação, plano alimentar nem prescrição.`;
}

export function getFoodById(id) {
  return FOOD_CATALOG.find(food => food.id === id) || null;
}

export function getFoodsByEnergy(energy) {
  return FOOD_CATALOG.filter(food => food.energy === energy);
}

export function getFoodsByOrgan(organ) {
  return FOOD_CATALOG.filter(food => (food.organs || []).includes(organ));
}

export function getFoodsByFlavor(flavor) {
  return FOOD_CATALOG.filter(food => (food.flavors || []).includes(flavor));
}

/**
 * Alimentos de um eixo educativo (aquecer/refrescar/digestão). Ferramenta de
 * organização para a tela — nunca "coma X para o padrão Y".
 */
export function getFoodsByAxis(axisId) {
  const axis = FOOD_AXES[axisId];
  if (!axis) return [];
  if (axis.energies) return FOOD_CATALOG.filter(food => axis.energies.includes(food.energy));
  if (axis.organs) return FOOD_CATALOG.filter(food => (food.organs || []).some(o => axis.organs.includes(o)));
  return [];
}

export function summarizeFoodCatalog() {
  const byEnergy = {};
  for (const key of Object.keys(FOOD_ENERGIES)) byEnergy[key] = 0;
  for (const food of FOOD_CATALOG) byEnergy[food.energy] = (byEnergy[food.energy] || 0) + 1;
  return { total: FOOD_CATALOG.length, byEnergy };
}
