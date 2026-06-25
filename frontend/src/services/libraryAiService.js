// ============================================================
// SERVICE: Perguntas à Biblioteca Viva com IA (RAG)
// Fase 4 da expansão de IA (ver roadmap-ia-expansao).
//
// `rankLibraryCards` recupera localmente (sobreposição de termos) os
// cards mais relevantes — barato, sem vetores. `askLibrary` monta o
// contexto e chama a Edge Function `library-qa` para a resposta
// ancorada. Sem dado de paciente (é base de conhecimento). O mock só
// existe para o login local de demonstração e para os testes.
// ============================================================

import { supabase, getAuthenticatedUser } from '../lib/supabase';
import { getAiFunctionErrorMessage, resolveAiRuntime } from './aiRuntime';

export const LIBRARY_AI_MOCK_VERSION = 'mock-0.1';

export const LIBRARY_AI_DISCLAIMER =
  'Resposta gerada a partir da Biblioteca Viva. Apoio à consulta/estudo, não conduta automática.';

// Stopwords pt-BR comuns que não ajudam na recuperação.
const STOPWORDS = new Set([
  'que', 'qual', 'quais', 'como', 'para', 'com', 'sem', 'dos', 'das', 'uma', 'uns',
  'por', 'pra', 'são', 'ser', 'tem', 'the', 'and', 'meu', 'minha', 'seu', 'sua',
  'onde', 'quando', 'porque', 'sobre', 'mais', 'menos', 'pode', 'usar', 'usado',
  'serve', 'indicado', 'indicada', 'ponto', 'pontos',
]);

function normalize(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function tokenize(text) {
  return normalize(text)
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 3 && !STOPWORDS.has(t));
}

const CONFIDENCE_BOOST = { high: 0.6, medium: 0.2, low: 0 };

/**
 * Recupera os cards mais relevantes para a pergunta.
 * Score = sobreposição de termos (título pesa mais) + boost de confiança.
 * @param {string} question
 * @param {Array} cards - allCards da Biblioteca ({ title, txt, tags, source, cat, confidence })
 * @param {number} [limit=10]
 * @returns {Array} subconjunto de cards ordenado por relevância (score > 0)
 */
export function rankLibraryCards(question, cards, limit = 10) {
  const terms = [...new Set(tokenize(question))];
  if (terms.length === 0 || !Array.isArray(cards)) return [];

  const scored = cards.map(card => {
    const title = normalize(card.title);
    const tags = normalize(card.tags);
    const body = normalize([card.txt, card.source].join(' '));
    let score = 0;
    for (const t of terms) {
      if (title.includes(t)) score += 3;
      else if (tags.includes(t)) score += 2;
      else if (body.includes(t)) score += 1;
    }
    if (score > 0) score += CONFIDENCE_BOOST[card.confidence] ?? 0;
    return { card, score };
  });

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.card);
}

// Reduz um card ao contexto enviado à IA (sem campos de UI).
function toContext(card) {
  return {
    title: card.title,
    cat: card.cat,
    confidence: card.confidence,
    source: card.source,
    text: card.txt,
  };
}

// ----- MOCK -----
export function mockAskLibrary(question, topCards) {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve({
        modelVersion: LIBRARY_AI_MOCK_VERSION,
        analyzedAt: new Date().toISOString(),
        answer: topCards.length
          ? `(Resposta simulada.) Encontrei ${topCards.length} item(ns) relacionados a "${question}" na Biblioteca. Ative a IA real para uma resposta sintetizada.`
          : 'Nenhum item da Biblioteca corresponde à pergunta.',
        citations: topCards.slice(0, 3).map(c => c.title),
        insufficient: topCards.length === 0,
      });
    }, 600);
  });
}

/**
 * Pergunta à Biblioteca: recupera localmente + responde com IA.
 * @param {string} question
 * @param {Array} cards - allCards da Biblioteca
 * @param {{ getAuthenticatedUser?: Function, invoke?: Function }} [runtime]
 * @returns {Promise<{ modelVersion, answer, citations, insufficient, usedCount }>}
 */
export async function askLibrary(question, cards, runtime) {
  const q = String(question || '').trim();
  if (!q) {
    throw new Error('Digite uma pergunta para consultar a Biblioteca.');
  }

  const topCards = rankLibraryCards(q, cards, 10);

  // Sem matches: não gasta IA — responde direto.
  if (topCards.length === 0) {
    return {
      modelVersion: 'local',
      analyzedAt: new Date().toISOString(),
      answer: 'Não encontrei itens na Biblioteca para essa pergunta. Tente outros termos (ex.: nome do ponto, sintoma, síndrome).',
      citations: [],
      insufficient: true,
      usedCount: 0,
    };
  }

  const client = resolveAiRuntime(runtime, {
    getAuthenticatedUser,
    invoke: (...args) => supabase.functions.invoke(...args),
  });
  const user = await client.getAuthenticatedUser();
  if (user?._isLocal) {
    return { ...(await mockAskLibrary(q, topCards)), usedCount: topCards.length };
  }

  const { data, error } = await client.invoke('library-qa', {
    body: { question: q, context: topCards.map(toContext) },
  });

  if (error) {
    throw new Error(await getAiFunctionErrorMessage(error, 'Falha ao consultar a Biblioteca.'));
  }
  if (!data || typeof data.answer !== 'string') {
    throw new Error('A consulta retornou um formato inesperado.');
  }
  return { ...data, usedCount: topCards.length };
}
