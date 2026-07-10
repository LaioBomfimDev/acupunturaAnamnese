// ============================================================
// foodPatternLinking — liga os PADRÕES da síntese ao vivo (assistantSynthesis)
// aos alimentos da fonte de dietoterapia. É a camada que "instrui sem prescrever":
// mostra ONDE a leitura tradicional da fonte associa um alimento ao sistema/
// natureza do quadro, com checagem de temperatura para NUNCA sugerir algo que a
// tradição consideraria contrário (ex.: alimento frio num padrão de frio).
//
// Não é recomendação, plano alimentar nem prescrição. Só reorganiza o catálogo
// já curado (foodDietoterapia) à luz do padrão hipotético — sempre atrás do gate
// de confiança e do gate humano de curadoria. Ver docs/plano-dietoterapia.md,
// docs/nutricao-ervas/ e AGENTS.md §8/§11.
// ============================================================

import { FOOD_CATALOG, FOOD_ENERGIES, FOOD_FLAVORS, FOOD_ORGANS } from './foodDietoterapia.js';

export const FOOD_LINK_DISCLAIMER =
  'Sugestão educativa da fonte, não prescrição. A fonte associa estes alimentos ao sistema/natureza do padrão hipotético; requer julgamento clínico e revisão humana. Não é plano alimentar nem indicação automática ao paciente.';

// Direção dietética tradicional por padrão MTC — os nomes batem com PATTERN_KEYWORDS
// de utils/analyzer.js. Para cada padrão: sistemas funcionais afins (`organs`),
// energias térmicas coerentes (`prefer`), energias contrárias que a tradição
// evitaria (`avoid`) e sabores afins (`flavors`, só realce, nunca filtro).
// Direções conservadoras: `avoid` só lista o extremo claramente oposto, para
// excluir o que agravaria sem esvaziar a lista.
export const PATTERN_FOOD_TARGETS = {
  'Ascensão do Yang do Fígado': {
    organs: ['figado', 'rins'], prefer: ['fresca', 'fria', 'neutra'], avoid: ['quente'],
    flavors: ['azedo', 'amargo'],
    direction: 'acalmar e refrescar o Fígado (natureza fresca/neutra)',
  },
  'Qi do Fígado invadindo Baço/Estômago': {
    organs: ['figado', 'baco', 'estomago'], prefer: ['neutra', 'morna'], avoid: [],
    flavors: ['pungente'],
    direction: 'mover o Qi e harmonizar a digestão (natureza neutra/morna)',
  },
  'Umidade-Calor': {
    organs: ['baco', 'estomago'], prefer: ['fresca', 'fria', 'neutra'], avoid: ['quente'],
    flavors: ['amargo', 'suave'],
    direction: 'drenar umidade e refrescar (natureza fresca/neutra)',
  },
  'Deficiência de Qi do Baço': {
    organs: ['baco', 'estomago'], prefer: ['morna', 'neutra'], avoid: ['fria'],
    flavors: ['doce'],
    direction: 'aquecer levemente e fortalecer a digestão (natureza morna/neutra)',
  },
  'Agitação do Shen por Calor': {
    organs: ['coracao'], prefer: ['fresca', 'fria', 'neutra'], avoid: ['quente'],
    flavors: [],
    direction: 'acalmar e refrescar o Coração (natureza fresca/neutra)',
  },
  'Deficiência de Yin do Rim': {
    organs: ['rins'], prefer: ['fresca', 'neutra'], avoid: ['quente'],
    flavors: ['doce', 'salgado'],
    direction: 'nutrir o Yin sem aquecer (natureza fresca/neutra)',
  },
  'Deficiência de Yang do Rim': {
    organs: ['rins', 'baco'], prefer: ['morna', 'quente'], avoid: ['fria', 'fresca'],
    flavors: ['pungente', 'doce'],
    direction: 'aquecer e tonificar o Yang (natureza morna/quente)',
  },
  'Deficiência de Xue do Fígado': {
    organs: ['figado', 'baco'], prefer: ['morna', 'neutra'], avoid: [],
    flavors: ['doce'],
    direction: 'nutrir o Sangue (natureza morna/neutra)',
  },
  'Estagnação de Xue': {
    organs: ['figado'], prefer: ['morna', 'quente'], avoid: ['fria'],
    flavors: ['pungente'],
    direction: 'mover o Sangue (natureza morna/quente)',
  },
  'Deficiência de Qi do Pulmão': {
    organs: ['pulmoes', 'baco'], prefer: ['morna', 'neutra'], avoid: ['fria'],
    flavors: ['doce'],
    direction: 'tonificar o Qi do Pulmão (natureza morna/neutra)',
  },
};

const CONFIDENCE_RANK = { Baixa: 0, Moderada: 1, Alta: 2 };

export function getPatternTarget(name) {
  return PATTERN_FOOD_TARGETS[name] || null;
}

function joinPt(list) {
  const parts = list.filter(Boolean);
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`;
}

function organLabel(key) {
  // Rótulo curto (sem o sufixo "(MTC)") para caber na frase da razão.
  return String(FOOD_ORGANS[key] || key).replace(/\s*\(.*\)$/, '');
}

// Constrói a linha de um alimento candidato: por que ele aparece e a cautela dele.
function annotateFood(food, target) {
  const organsMatched = (food.organs || []).filter(o => target.organs.includes(o));
  const flavorsMatched = (food.flavors || []).filter(f => target.flavors.includes(f));
  const energyKnown = Boolean(food.energy);
  const aligned = energyKnown && target.prefer.includes(food.energy);
  const energyMeta = FOOD_ENERGIES[food.energy];

  const orgText = `Afeta ${joinPt(organsMatched.map(organLabel))}.`;
  const energyText = energyKnown
    ? ` Natureza ${energyMeta?.label?.toLowerCase() || food.energy}${aligned ? ' — coerente com a direção sugerida' : ''}.`
    : ' Natureza não informada na fonte.';
  const flavorText = flavorsMatched.length
    ? ` Sabor ${joinPt(flavorsMatched.map(f => FOOD_FLAVORS[f]?.label.toLowerCase() || f))} afim.`
    : '';

  return {
    id: food.id,
    commonName: food.commonName,
    energy: food.energy,
    energyLabel: energyMeta?.label || null,
    organsMatched,
    flavorsMatched,
    aligned,
    energyKnown,
    rationale: `${orgText}${energyText}${flavorText}`,
    caution: food.caution || '',
    sourcePages: food.sourcePages || [],
  };
}

// Seleciona e ordena os alimentos coerentes com um alvo. EXCLUI os de energia
// contrária (o "preste atenção na temperatura": não sugere alimento que
// agravaria) e os bloqueados pela curadoria. Alinhados vêm primeiro.
function selectFoodsForTarget(target, { maxPerPattern, isBlocked }) {
  const matches = FOOD_CATALOG.filter(food => {
    if (isBlocked(food.id)) return false;
    const affectsOrgan = (food.organs || []).some(o => target.organs.includes(o));
    if (!affectsOrgan) return false;
    // Energia contrária = fora (segurança térmica). Energia desconhecida passa,
    // mas é sinalizada na razão para a profissional conferir na fonte.
    if (food.energy && target.avoid.includes(food.energy)) return false;
    return true;
  }).map(food => annotateFood(food, target));

  matches.sort((a, b) => {
    if (a.aligned !== b.aligned) return a.aligned ? -1 : 1;
    if (a.flavorsMatched.length !== b.flavorsMatched.length) return b.flavorsMatched.length - a.flavorsMatched.length;
    if (a.energyKnown !== b.energyKnown) return a.energyKnown ? -1 : 1;
    return a.commonName.localeCompare(b.commonName, 'pt');
  });

  return typeof maxPerPattern === 'number' ? matches.slice(0, maxPerPattern) : matches;
}

/**
 * Liga a síntese ao vivo a alimentos da fonte. Só produz sugestões quando a
 * confiança atinge o mínimo (gate) e o padrão tem alvo dietético conhecido —
 * abaixo disso devolve `gated: true` com o motivo, sem inventar indicação.
 *
 * @param {object} synthesis  saída de assistantSynthesis(state, selectedMap)
 * @param {object} [options]
 * @param {'Baixa'|'Moderada'|'Alta'} [options.minConfidence='Moderada']
 * @param {number} [options.maxPerPattern=8]
 * @param {(foodId:string)=>boolean} [options.isBlocked]  esconde bloqueados da curadoria
 * @returns {{gated:boolean, gateReason:string, patterns:Array, disclaimer:string}}
 */
export function linkFoodsToSynthesis(synthesis, options = {}) {
  const {
    minConfidence = 'Moderada',
    maxPerPattern = 8,
    isBlocked = () => false,
  } = options;

  const empty = (gateReason) => ({ gated: true, gateReason, patterns: [], disclaimer: FOOD_LINK_DISCLAIMER });

  if (!synthesis || !synthesis.primaryName || synthesis.primaryName === 'Aguardando dados') {
    return empty('Sem dados suficientes na síntese para ligar alimentos.');
  }

  const level = synthesis.confidence?.level || 'Baixa';
  if ((CONFIDENCE_RANK[level] ?? 0) < (CONFIDENCE_RANK[minConfidence] ?? 1)) {
    return empty(
      `Confiança ${level.toLowerCase()}: evidência insuficiente para sugerir alimentos com segurança. `
      + 'Complete língua, pulso e anamnese para firmar o padrão.',
    );
  }

  // Padrões a ligar: o principal e, quando o diferencial está aberto, também ele —
  // porque clinicamente as duas hipóteses seguem vivas.
  const chosen = [];
  const primaryTarget = getPatternTarget(synthesis.primaryName);
  if (primaryTarget) {
    chosen.push({ name: synthesis.primaryName, percent: synthesis.primaryPercent ?? 0, role: 'primary', target: primaryTarget });
  }
  if (synthesis.isOpenDifferential && synthesis.differential?.name) {
    const diffTarget = getPatternTarget(synthesis.differential.name);
    if (diffTarget) {
      chosen.push({ name: synthesis.differential.name, percent: synthesis.differential.percent ?? 0, role: 'differential', target: diffTarget });
    }
  }

  if (chosen.length === 0) {
    return empty(`Sem mapa dietético para o padrão "${synthesis.primaryName}".`);
  }

  const patterns = chosen.map(entry => ({
    name: entry.name,
    role: entry.role,
    percent: entry.percent,
    confidence: level,
    directionText: entry.target.direction,
    foods: selectFoodsForTarget(entry.target, { maxPerPattern, isBlocked }),
  }));

  return { gated: false, gateReason: '', patterns, disclaimer: FOOD_LINK_DISCLAIMER };
}
