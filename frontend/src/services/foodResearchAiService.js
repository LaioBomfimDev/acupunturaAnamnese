// ============================================================
// SERVICE: Pesquisa de alimento/planta com IA (Dietoterapia)
//
// A profissional escolhe um MODO de pesquisa (visão medicinal, receitas,
// leitura MTC, segurança) e a IA responde por TÓPICOS FIXOS sobre o alimento
// selecionado — não é prompt genérico "fale sobre X". O roteiro de tópicos e
// os trilhos de segurança vivem na Edge Function `food-research`; aqui só
// listamos os modos (rótulos da UI), montamos o payload curado e chamamos.
//
// É PESQUISA/estudo da profissional, não prescrição nem conteúdo do paciente.
// Sem dado de paciente. O mock só existe para o login local e os testes.
// ============================================================

import { supabase, getAuthenticatedUser } from '../lib/supabase';
import { getAiFunctionErrorMessage, resolveAiRuntime } from './aiRuntime';
import { FOOD_ENERGIES, FOOD_FLAVORS, FOOD_ORGANS, describeFoodTradition } from '../knowledge/foodDietoterapia';

export const FOOD_RESEARCH_MOCK_VERSION = 'mock-0.1';

export const FOOD_RESEARCH_DISCLAIMER =
  'Pesquisa gerada por IA a partir de conhecimento geral — apoio ao estudo da profissional, não curada nem verificada, não é prescrição, plano alimentar nem conteúdo para o paciente. Confira antes de usar.';

// Modos de pesquisa. O roteiro de tópicos de cada um está na Edge Function;
// aqui ficam só os metadados de UI. `needsObjective` habilita o campo de
// objetivo (ex.: digestão, sono) para direcionar a busca.
export const FOOD_RESEARCH_MODES = [
  {
    id: 'visao_geral',
    label: 'Visão geral medicinal',
    hint: 'Nome científico, compostos ativos, usos tradicionais, evidência, formas de uso e cuidados.',
    needsObjective: false,
  },
  {
    id: 'receitas',
    label: 'Receitas tradicionais e funcionais',
    hint: 'Receitas com ingredientes, preparo, finalidade, origem, cuidados e nível de evidência.',
    needsObjective: true,
  },
  {
    id: 'mtc',
    label: 'Leitura energética (MTC)',
    hint: 'Natureza, sabor, tropismo, ações, movimento/estação e combinações clássicas.',
    needsObjective: false,
  },
  {
    id: 'seguranca',
    label: 'Segurança e interações',
    hint: 'Populações de risco, contraindicações, interações medicamentosas e sinais de alerta.',
    needsObjective: true,
  },
];

const MODE_IDS = new Set(FOOD_RESEARCH_MODES.map(m => m.id));

export function getFoodResearchMode(modeId) {
  return FOOD_RESEARCH_MODES.find(m => m.id === modeId) || null;
}

// Reduz o alimento curado ao contexto (rótulos legíveis) enviado à IA.
export function toFoodResearchPayload(food) {
  if (!food || typeof food !== 'object') return null;
  return {
    commonName: food.commonName,
    energyLabel: FOOD_ENERGIES[food.energy]?.label || '',
    flavors: (food.flavors || []).map(f => FOOD_FLAVORS[f]?.label).filter(Boolean),
    organs: (food.organs || []).map(o => FOOD_ORGANS[o]).filter(Boolean),
    tradition: describeFoodTradition(food),
    caution: food.caution || '',
  };
}

// ----- MOCK -----
export function mockResearchFood(food, mode, objective) {
  const modeMeta = getFoodResearchMode(mode);
  return new Promise(resolve => {
    setTimeout(() => {
      resolve({
        modelVersion: FOOD_RESEARCH_MOCK_VERSION,
        analyzedAt: new Date().toISOString(),
        mode,
        food: food?.commonName || '',
        sections: [
          {
            heading: `(Simulado) ${modeMeta?.label || 'Pesquisa'} — ${food?.commonName || ''}`,
            body: `Resposta simulada${objective ? ` (objetivo: ${objective})` : ''}. Ative a IA real para uma pesquisa por tópicos com nível de evidência.`,
          },
        ],
        evidenceNote: 'Simulação: sem avaliação de evidência.',
        safety: 'Simulação: confirme cuidados e interações na resposta real da IA.',
        insufficient: false,
      });
    }, 600);
  });
}

/**
 * Pesquisa um alimento/planta por tópicos, no modo escolhido.
 * @param {object} food - item do FOOD_CATALOG
 * @param {string} modeId - id de FOOD_RESEARCH_MODES
 * @param {{ objective?: string }} [options]
 * @param {{ getAuthenticatedUser?: Function, invoke?: Function }} [runtime]
 * @returns {Promise<{ modelVersion, mode, food, sections, evidenceNote, safety, insufficient }>}
 */
export async function researchFood(food, modeId, options = {}, runtime) {
  const payload = toFoodResearchPayload(food);
  if (!payload?.commonName) {
    throw new Error('Selecione um alimento para pesquisar.');
  }
  if (!MODE_IDS.has(modeId)) {
    throw new Error('Escolha um tipo de pesquisa.');
  }
  const objective = String(options.objective || '').trim().slice(0, 200);

  const client = resolveAiRuntime(runtime, {
    getAuthenticatedUser,
    invoke: (...args) => supabase.functions.invoke(...args),
  });
  const user = await client.getAuthenticatedUser();
  if (user?._isLocal) {
    return mockResearchFood(food, modeId, objective);
  }

  const { data, error } = await client.invoke('food-research', {
    body: { mode: modeId, food: payload, objective },
  });

  if (error) {
    throw new Error(await getAiFunctionErrorMessage(error, 'Falha ao pesquisar o alimento.'));
  }
  if (!data || !Array.isArray(data.sections)) {
    throw new Error('A pesquisa retornou um formato inesperado.');
  }
  return data;
}
