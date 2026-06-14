// ============================================================
// SERVICE: Perguntas à Biblioteca Viva com IA (RAG)
// Fase 4 da expansão de IA (ver roadmap-ia-expansao).
//
// `rankLibraryCards` recupera localmente (sobreposição de termos) os
// cards mais relevantes — barato, sem vetores. `askLibrary` monta o
// contexto e chama a Edge Function `library-qa` para a resposta
// ancorada. Sem dado de paciente (é base de conhecimento).
// ============================================================

import { supabase, getAuthenticatedUser } from '../lib/supabase';

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

async function functionErrorMessage(error, fallback) {
  if (typeof error?.context?.json === 'function') {
    try {
      const body = await error.context.json();
      if (body?.error) return body.error;
    } catch { /* corpo não-JSON */ }
  }
  return error?.message || fallback;
}

/**
 * Pergunta à Biblioteca: recupera localmente + responde com IA.
 * @param {string} question
 * @param {Array} cards - allCards da Biblioteca
 * @returns {Promise<{ modelVersion, answer, citations, insufficient, usedCount }>}
 */
export async function askLibrary(question, cards) {
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

  const user = await getAuthenticatedUser();
  if (user?._isLocal) {
    return { ...(await mockAskLibrary(q, topCards)), usedCount: topCards.length };
  }

  const { data, error } = await supabase.functions.invoke('library-qa', {
    body: { question: q, context: topCards.map(toContext) },
  });

  if (error) {
    const msg = await functionErrorMessage(error, '');
    const isMockable =
      !msg ||
      msg.includes('Failed to send') ||
      msg.includes('fetch') ||
      msg.includes('not found') ||
      msg.includes('GEMINI_API_KEY') ||
      msg.includes('não configurada');
    if (isMockable) {
      const result = await mockAskLibrary(q, topCards);
      return { ...result, usedCount: topCards.length, warning: 'Resposta simulada — a IA da Biblioteca ainda não está ativa neste servidor.' };
    }
    throw new Error(msg || 'Falha ao consultar a Biblioteca.');
  }
  if (!data || typeof data.answer !== 'string') {
    throw new Error('A consulta retornou um formato inesperado.');
  }
  return { ...data, usedCount: topCards.length };
}
