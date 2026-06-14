// ============================================================
// SERVICE: Sugestão de marcações a partir da anamnese (texto)
// Fase 1 da expansão de IA (ver roadmap-ia-expansao).
//
// Contrato único entre a UI e o motor de sugestão.
// `suggestAnamneseMarks` decide a implementação:
//  * usuário local (login fallback) → MOCK;
//  * usuário real → Edge Function `suggest-marks` (Gemini flash-lite).
//  * se a função estiver indisponível/sem chave → mock com aviso.
//
// PRIVACIDADE: o texto é ANONIMIZADO aqui, no cliente, ANTES de sair —
// nome/CPF/telefone/datas viram marcadores. Ver utils/anonymize.js.
//
// A IA SUGERE marcações; só o que a profissional aceitar entra no checklist.
// ============================================================

import { supabase, getAuthenticatedUser } from '../lib/supabase';
import { anonymizeClinicalText } from '../utils/anonymize';

export const ANAMNESE_AI_MOCK_VERSION = 'mock-0.1';

export const ANAMNESE_AI_DISCLAIMER =
  'Sugestões assistivas a partir do texto. Só o que você aceitar marca o checklist. ' +
  'O texto é anonimizado (nome, CPF, telefone, datas) antes de ir à IA.';

// Faixas de confiança — idênticas ao módulo Língua, para consistência visual.
export function confidenceBand(confidence) {
  if (confidence >= 0.8) return { label: 'alta', level: 'high' };
  if (confidence >= 0.6) return { label: 'média', level: 'medium' };
  return { label: 'baixa', level: 'low' };
}

// Campos de texto livre da anamnese que alimentam a sugestão, rotulados
// para dar contexto ao modelo (e ao mock).
const TEXT_FIELDS = [
  ['queixa', 'Queixa principal'],
  ['historia', 'História da queixa'],
  ['obsSonoEmocoes', 'Observações de sono/emoções'],
  ['obsDigestao', 'Observações digestivas'],
  ['obsDor', 'Observações de dor'],
  ['medicacoes', 'Medicações / diagnósticos prévios'],
  ['dorLocal', 'Localização da dor'],
  ['escalaDor', 'Escala de dor'],
  ['agua', 'Consumo de água'],
];

// Monta o texto clínico rotulado a partir do estado da sessão.
export function buildAnamneseText(state) {
  if (!state) return '';
  return TEXT_FIELDS
    .map(([field, label]) => {
      const value = String(state[field] || '').trim();
      return value ? `${label}: ${value}` : '';
    })
    .filter(Boolean)
    .join('\n');
}

// ----- MOCK (login local e testes) -----
// Casa palavras-chave simples contra o catálogo para uma demonstração útil
// mesmo offline. Não é o motor real — é determinístico e propositalmente raso.
const MOCK_KEYWORDS = [
  { re: /ansiedade|ansios/i, group: 'emocoes', item: 'Ansiedade/agitação mental', confidence: 0.78 },
  { re: /irrita|raiva|nervos/i, group: 'emocoes', item: 'Raiva/irritabilidade', confidence: 0.74 },
  { re: /insônia|insonia|não durmo|dificuldade.*dormir|dificuldade.*sono/i, group: 'sono', item: 'Dificuldade para iniciar sono', confidence: 0.8 },
  { re: /acord.*3h|acord.*madrugada|3 da manhã|3h/i, group: 'sono', item: 'Acorda entre 3h-5h', confidence: 0.6 },
  { re: /refluxo|azia/i, group: 'digestao', item: 'Refluxo/azia', confidence: 0.82 },
  { re: /constipa|preso|intestino preso/i, group: 'fezes', item: 'Constipação', confidence: 0.76 },
  { re: /estress|estress|piora.*estress/i, group: 'queixaEstruturada', item: 'Piora ao estresse', confidence: 0.7 },
  { re: /crônic|cronic|anos|há muito/i, group: 'queixaEstruturada', item: 'Quadro crônico', confidence: 0.55 },
  { re: /frio|gela/i, group: 'clima', item: 'Piora com frio', confidence: 0.5 },
  { re: /grávid|gravid|gestante|gestação/i, group: 'seguranca', item: 'Gestação', confidence: 0.9 },
  { re: /varfarina|anticoagul|marevan|xarelto/i, group: 'seguranca', item: 'Anticoagulante', confidence: 0.88 },
  { re: /café|cafeína|cafeina/i, group: 'substanciasUso', item: 'Cafeína', confidence: 0.6 },
];

export function mockSuggestAnamneseMarks(text) {
  const suggestions = [];
  const seen = new Set();
  for (const { re, group, item, confidence } of MOCK_KEYWORDS) {
    if (re.test(text)) {
      const key = `${group}:${item}`;
      if (seen.has(key)) continue;
      seen.add(key);
      suggestions.push({ group, item, confidence, rationale: 'Sinal identificado no texto (simulado).' });
    }
  }
  return new Promise(resolve => {
    setTimeout(() => {
      resolve({
        modelVersion: ANAMNESE_AI_MOCK_VERSION,
        analyzedAt: new Date().toISOString(),
        warning: suggestions.length ? null : 'Nenhum sinal reconhecido pelo motor simulado neste texto.',
        suggestions,
      });
    }, 700);
  });
}

// Extrai a mensagem de erro do corpo da resposta da Edge Function
async function functionErrorMessage(error, fallback) {
  if (typeof error?.context?.json === 'function') {
    try {
      const body = await error.context.json();
      if (body?.error) return body.error;
    } catch { /* corpo não-JSON — usa fallback */ }
  }
  return error?.message || fallback;
}

/**
 * Lê o texto livre da anamnese e sugere marcações do checklist para revisão.
 *
 * @param {object} state - estado clínico da sessão (campos de texto livre)
 * @param {{ patientName?: string }} [context]
 * @returns {Promise<{ modelVersion, analyzedAt, warning, suggestions }>}
 */
export async function suggestAnamneseMarks(state, context = {}) {
  const rawText = buildAnamneseText(state);
  if (!rawText.trim()) {
    throw new Error('Preencha a queixa ou observações antes de pedir sugestões.');
  }

  // Anonimização no cliente — o dado bruto nunca sai do browser.
  const text = anonymizeClinicalText(rawText, { patientName: context.patientName });

  const user = await getAuthenticatedUser();
  if (user?._isLocal) {
    return mockSuggestAnamneseMarks(text);
  }

  const { data, error } = await supabase.functions.invoke('suggest-marks', {
    body: { text },
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
      const result = await mockSuggestAnamneseMarks(text);
      return {
        ...result,
        warning: 'Sugestões simuladas — a IA de anamnese ainda não está ativa neste servidor.',
      };
    }
    throw new Error(msg || 'Falha ao gerar sugestões.');
  }
  if (!data || !Array.isArray(data.suggestions)) {
    throw new Error('A sugestão retornou um formato inesperado.');
  }
  return data;
}
