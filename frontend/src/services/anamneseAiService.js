// ============================================================
// SERVICE: Sugestão de marcações a partir da anamnese (texto)
// Fase 1 da expansão de IA (ver roadmap-ia-expansao).
//
// Contrato único entre a UI e o motor de sugestão.
// `suggestAnamneseMarks` decide a implementação:
//  * usuário local (login fallback) → MOCK;
//  * usuário real → Edge Function `suggest-marks` (Gemini flash-lite).
//  * falha da função → erro explícito para a profissional.
//
// PRIVACIDADE: o texto é ANONIMIZADO aqui, no cliente, ANTES de sair —
// nome/CPF/telefone/datas viram marcadores. Ver utils/anonymize.js.
//
// A IA SUGERE marcações; só o que a profissional aceitar entra no checklist.
// ============================================================

import { supabase, getAuthenticatedUser } from '../lib/supabase';
import { anonymizeClinicalText } from '../utils/anonymize';
import { getAiFunctionErrorMessage, resolveAiRuntime } from './aiRuntime';

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
  ['atividadeFisica', 'Atividade física'],
  ['dorLocal', 'Localização da dor'],
  ['escalaDor', 'Escala de dor'],
  ['dorPeriodoReferencia', 'Período de referência da dor'],
  ['dorRepouso', 'Dor em repouso'],
  ['dorMovimento', 'Dor em movimento'],
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

// ----- MOCK (somente login local e testes) -----
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
  { re: /jato.*fraco|dificuldade.*urinar/i, group: 'urogenital', item: 'Jato urinário fraco', confidence: 0.78 },
  { re: /urin[ao].*noite|noctúria|nocturia/i, group: 'urogenital', item: 'Urinar à noite', confidence: 0.78 },
  { re: /disfunção erétil|disfuncao eretil|ereção|erecao|impotência|impotencia/i, group: 'urogenital', item: 'Alteração erétil', confidence: 0.82 },
  { re: /ejaculação|ejaculacao/i, group: 'urogenital', item: 'Alteração ejaculatória', confidence: 0.76 },
  { re: /varfarina|anticoagul|marevan|xarelto/i, group: 'seguranca', item: 'Anticoagulante', confidence: 0.88 },
  { re: /perda.*peso|emagrec.*sem.*querer/i, group: 'seguranca', item: 'Perda de peso não intencional', confidence: 0.82 },
  { re: /desmai|síncope|sincope/i, group: 'seguranca', item: 'Desmaio recente', confidence: 0.82 },
  { re: /queda.*recente|caiu.*recentemente/i, group: 'seguranca', item: 'Queda recente', confidence: 0.78 },
  { re: /trauma.*recente|acidente.*recente/i, group: 'seguranca', item: 'Trauma recente', confidence: 0.78 },
  { re: /coagul|sangramento.*fácil|sangramento.*facil/i, group: 'seguranca', item: 'Distúrbio de coagulação', confidence: 0.82 },
  { re: /câncer|cancer|neoplas/i, group: 'seguranca', item: 'Histórico de câncer', confidence: 0.78 },
  { re: /cirurgia.*recente|operad[oa].*recentemente/i, group: 'seguranca', item: 'Cirurgia recente', confidence: 0.8 },
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

/**
 * Lê o texto livre da anamnese e sugere marcações do checklist para revisão.
 *
 * @param {object} state - estado clínico da sessão (campos de texto livre)
 * @param {{ patientName?: string }} [context]
 * @param {{ getAuthenticatedUser?: Function, invoke?: Function }} [runtime]
 * @returns {Promise<{ modelVersion, analyzedAt, warning, suggestions }>}
 */
export async function suggestAnamneseMarks(state, context = {}, runtime) {
  const rawText = buildAnamneseText(state);
  if (!rawText.trim()) {
    throw new Error('Preencha a queixa ou observações antes de pedir sugestões.');
  }

  // Anonimização no cliente — o dado bruto nunca sai do browser.
  const text = anonymizeClinicalText(rawText, { patientName: context.patientName });

  const client = resolveAiRuntime(runtime, {
    getAuthenticatedUser,
    invoke: (...args) => supabase.functions.invoke(...args),
  });
  const user = await client.getAuthenticatedUser();
  if (user?._isLocal) {
    return mockSuggestAnamneseMarks(text);
  }

  const { data, error } = await client.invoke('suggest-marks', {
    body: { text },
  });

  if (error) {
    throw new Error(await getAiFunctionErrorMessage(error, 'Falha ao gerar sugestões.'));
  }
  if (!data || !Array.isArray(data.suggestions)) {
    throw new Error('A sugestão retornou um formato inesperado.');
  }
  return data;
}
