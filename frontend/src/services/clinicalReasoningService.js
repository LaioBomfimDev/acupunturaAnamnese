// ============================================================
// SERVICE: Raciocínio clínico assistido por IA (camada sobre o motor)
// Fase 2 da expansão de IA (ver roadmap-ia-expansao).
//
// Contrato único entre a UI (rail "IA Assistente") e o motor de raciocínio.
// `deepenClinicalReasoning` monta o caso a partir do estado + síntese
// determinística, ANONIMIZA o texto livre e decide a implementação:
//  * usuário local → MOCK;
//  * usuário real → Edge Function `clinical-reasoning` (Gemini flash);
//  * função indisponível/sem chave → mock com aviso.
//
// SOB DEMANDA (botão), nunca ao vivo. A IA explica/enriquece o motor
// determinístico; nunca diagnóstico/conduta final.
// ============================================================

import { supabase, getAuthenticatedUser } from '../lib/supabase';
import { anonymizeClinicalText } from '../utils/anonymize';
import { getSelectedItems, getPulseQualityItems } from '../utils/analyzer';

export const REASONING_MOCK_VERSION = 'mock-0.1';

export const REASONING_DISCLAIMER =
  'Raciocínio assistivo sobre a hipótese do motor. Conferência e decisão são da profissional. ' +
  'O texto da anamnese é anonimizado antes de ir à IA.';

// Sinais selecionados por origem, em rótulos (sem PII), para dar contexto.
function collectSignals(selectedMap) {
  const tongue = [
    ...getSelectedItems(selectedMap, 'lingua'),
    ...getSelectedItems(selectedMap, 'regioesLingua'),
    ...Object.keys(selectedMap)
      .filter(k => k.startsWith('linguaOrgao:') && selectedMap[k])
      .map(k => k.split(':').slice(1).join(' ')),
  ];
  const symptoms = ['sintomas', 'digestao', 'sono', 'dor', 'gineco', 'fezes']
    .flatMap(g => getSelectedItems(selectedMap, g));
  const anamnese = ['queixaEstruturada', 'historico', 'substanciasUso', 'clima', 'oito', 'substancias']
    .flatMap(g => getSelectedItems(selectedMap, g));

  return {
    'língua': tongue,
    pulso: getPulseQualityItems(selectedMap),
    'emoções': getSelectedItems(selectedMap, 'emocoes'),
    sintomas: symptoms,
    seguranca: getSelectedItems(selectedMap, 'seguranca'),
    anamnese,
  };
}

/**
 * Monta o caso clínico enviado à IA: hipótese do motor + sinais (rótulos) +
 * texto livre ANONIMIZADO. Não inclui nenhum identificador direto.
 */
export function buildClinicalCase(state, selectedMap, synthesis, { patientName } = {}) {
  const rawText = [
    state?.queixa && `Queixa principal: ${state.queixa}`,
    state?.historia && `História: ${state.historia}`,
    state?.obsSonoEmocoes && `Sono/emoções: ${state.obsSonoEmocoes}`,
    state?.obsDigestao && `Digestão: ${state.obsDigestao}`,
    state?.obsDor && `Dor: ${state.obsDor}`,
    state?.medicacoes && `Medicações/diagnósticos: ${state.medicacoes}`,
  ].filter(Boolean).join('\n');

  const signals = collectSignals(selectedMap);

  return {
    hypothesis: {
      primary: synthesis?.primaryName || null,
      primaryPercent: synthesis?.primaryPercent ?? 0,
      differential: synthesis?.differential || null,
      isOpenDifferential: Boolean(synthesis?.isOpenDifferential),
      confidence: synthesis?.confidence?.level || 'Baixa',
      confidenceReason: synthesis?.confidence?.reason || '',
    },
    topPatterns: (synthesis?.graded || [])
      .filter(p => p.score > 0)
      .slice(0, 4)
      .map(p => ({
        name: p.name,
        score: p.score,
        terms: [...new Set((p.hits || []).map(h => h.term))],
      })),
    signals,
    anamneseText: anonymizeClinicalText(rawText, { patientName }),
  };
}

// Quão "preenchido" está o caso — usado pela UI para habilitar o botão.
export function caseHasEvidence(state, selectedMap, synthesis) {
  if (synthesis?.primaryPercent > 0) return true;
  const c = buildClinicalCase(state, selectedMap, synthesis, {});
  if (c.anamneseText.trim()) return true;
  return Object.values(c.signals).some(arr => arr.length > 0);
}

// ----- MOCK (login local e testes) -----
export function mockDeepenClinicalReasoning(clinicalCase) {
  const primary = clinicalCase?.hypothesis?.primary;
  const diff = clinicalCase?.hypothesis?.differential;
  const segur = clinicalCase?.signals?.seguranca || [];
  const terms = (clinicalCase?.topPatterns?.[0]?.terms || []).slice(0, 4);

  return new Promise(resolve => {
    setTimeout(() => {
      resolve({
        modelVersion: REASONING_MOCK_VERSION,
        analyzedAt: new Date().toISOString(),
        interpretation: primary
          ? `A hipótese de ${primary} é sustentada por: ${terms.join(', ') || 'sinais do caso'}. (Leitura simulada.)`
          : 'Sem hipótese consolidada — preencha mais sinais. (Leitura simulada.)',
        differentialReasoning: diff
          ? `Para separar de ${diff.name}, confira língua e pulso. (Simulado.)`
          : null,
        redFlags: segur.map(s => ({ sign: s, action: 'Avaliar antes de aplicar a técnica.' })),
        contradictions: [],
        questions: ['Há quanto tempo a queixa começou?', 'O que piora e o que melhora?'],
      });
    }, 700);
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
 * Aprofunda o raciocínio sobre o caso atual com IA (sob demanda).
 *
 * @param {object} state
 * @param {object} selectedMap
 * @param {object} synthesis - saída de assistantSynthesis
 * @param {{ patientName?: string }} [context]
 * @returns {Promise<{ modelVersion, analyzedAt, interpretation, differentialReasoning, redFlags, contradictions, questions }>}
 */
export async function deepenClinicalReasoning(state, selectedMap, synthesis, context = {}) {
  const clinicalCase = buildClinicalCase(state, selectedMap, synthesis, context);

  const hasContent = clinicalCase.anamneseText.trim()
    || Object.values(clinicalCase.signals).some(arr => arr.length > 0);
  if (!hasContent) {
    throw new Error('Preencha sinais ou texto da anamnese antes de aprofundar.');
  }

  const user = await getAuthenticatedUser();
  if (user?._isLocal) {
    return mockDeepenClinicalReasoning(clinicalCase);
  }

  const { data, error } = await supabase.functions.invoke('clinical-reasoning', {
    body: { case: clinicalCase },
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
      const result = await mockDeepenClinicalReasoning(clinicalCase);
      return {
        ...result,
        warning: 'Raciocínio simulado — a IA de raciocínio ainda não está ativa neste servidor.',
      };
    }
    throw new Error(msg || 'Falha ao aprofundar o raciocínio.');
  }
  if (!data || typeof data.interpretation !== 'string') {
    throw new Error('O raciocínio retornou um formato inesperado.');
  }
  return data;
}
