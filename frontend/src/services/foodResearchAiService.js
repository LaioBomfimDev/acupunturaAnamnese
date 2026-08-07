// ============================================================
// SERVICE: Pesquisa de alimento/planta com IA (Dietoterapia)
//
// A profissional escolhe um MODO educativo (visão geral, leitura MTC ou
// cautelas) e a IA responde por TÓPICOS FIXOS sobre o alimento publicado
// selecionado — não é prompt genérico "fale sobre X". O roteiro de tópicos e
// os trilhos de segurança vivem na Edge Function `food-research`; aqui só
// listamos os modos (rótulos da UI), montamos o payload curado e chamamos.
//
// É PESQUISA/estudo da profissional, não prescrição nem conteúdo do paciente.
// Sem dado de paciente. O mock só existe para o login local e os testes.
// ============================================================

import { supabase, getAuthenticatedUser } from '../lib/supabase';
import { getAiFunctionErrorMessage, resolveAiRuntime } from './aiRuntime';

export const FOOD_RESEARCH_MOCK_VERSION = 'mock-0.1';

export const FOOD_RESEARCH_DISCLAIMER =
  'Síntese educativa gerada somente a partir de publicação profissional aprovada no servidor. Não é prescrição, plano alimentar, cardápio, receita nem orientação individual.';

// Modos de pesquisa. O roteiro de tópicos de cada um está na Edge Function;
// aqui ficam só os metadados de UI. Não há objetivo personalizado: isso
// poderia transformar educação geral em orientação individual.
export const FOOD_RESEARCH_MODES = [
  {
    id: 'visao_geral',
    label: 'Visão geral educativa',
    hint: 'Síntese, limites da publicação e cautelas revisadas.',
    needsObjective: false,
  },
  {
    id: 'mtc',
    label: 'Associações tradicionais da MTC',
    hint: 'Associações publicadas entre alimento, sabores, movimentos e sistemas funcionais.',
    needsObjective: false,
  },
  {
    id: 'seguranca',
    label: 'Cautelas educativas revisadas',
    hint: 'Somente cautelas e grupos vulneráveis presentes na publicação aprovada.',
    needsObjective: false,
  },
];

const MODE_IDS = new Set(FOOD_RESEARCH_MODES.map(m => m.id));

export function getFoodResearchMode(modeId) {
  return FOOD_RESEARCH_MODES.find(m => m.id === modeId) || null;
}

// O navegador envia somente a chave de busca. Propriedades locais, cautelas e
// suposta curadoria nunca entram no prompt; o servidor recupera a publicação.
export function toFoodResearchPayload(food) {
  if (!food || typeof food !== 'object') return null;
  return { commonName: String(food.commonName || '').trim() };
}

// ----- MOCK -----
export function mockResearchFood(food, mode) {
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
            body: 'Resposta simulada. Ative a IA real para consultar somente publicações aprovadas no servidor.',
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
 * Pesquisa um alimento publicado por tópicos, no modo escolhido.
 * @param {object} food - item do FOOD_CATALOG
 * @param {string} modeId - id de FOOD_RESEARCH_MODES
 * @param {object} [_options] - reservado; nenhum objetivo clínico é enviado
 * @param {{ getAuthenticatedUser?: Function, invoke?: Function }} [runtime]
 * @returns {Promise<{ modelVersion, mode, food, sections, evidenceNote, safety, insufficient }>}
 */
export async function researchFood(food, modeId, _options = {}, runtime) {
  // Mantém compatibilidade com chamadas antigas sem encaminhar objetivo livre.
  void _options;
  const payload = toFoodResearchPayload(food);
  if (!payload?.commonName) {
    throw new Error('Selecione um alimento para pesquisar.');
  }
  if (!MODE_IDS.has(modeId)) {
    throw new Error('Escolha um tipo de pesquisa.');
  }
  const client = resolveAiRuntime(runtime, {
    getAuthenticatedUser,
    invoke: (...args) => supabase.functions.invoke(...args),
  });
  const user = await client.getAuthenticatedUser();
  if (user?._isLocal) {
    return mockResearchFood(food, modeId);
  }

  const { data, error } = await client.invoke('food-research', {
    body: { mode: modeId, name: payload.commonName },
  });

  if (error) {
    throw new Error(await getAiFunctionErrorMessage(error, 'Falha ao pesquisar o alimento.'));
  }
  if (!data || !Array.isArray(data.sections)) {
    throw new Error('A pesquisa retornou um formato inesperado.');
  }
  return data;
}
