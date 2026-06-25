// ============================================================
// SERVICE: Raciocínio clínico assistido por IA (camada sobre o motor)
// Fase 2 da expansão de IA (ver roadmap-ia-expansao).
//
// Contrato único entre a UI (rail "IA Assistente") e o motor de raciocínio.
// `deepenClinicalReasoning` monta o caso a partir do estado + síntese
// determinística, ANONIMIZA o texto livre e decide a implementação:
//  * usuário local → MOCK;
//  * usuário real → Edge Function `clinical-reasoning` (Gemini flash);
//  * falha da função → erro explícito para a profissional.
//
// SOB DEMANDA (botão), nunca ao vivo. A IA explica/enriquece o motor
// determinístico; nunca diagnóstico/conduta final.
// ============================================================

import { supabase, getAuthenticatedUser } from '../lib/supabase';
import { anonymizeClinicalText } from '../utils/anonymize';
import { getSelectedItems, getPulseQualityItems } from '../utils/analyzer';
import { rankLibraryCards } from './libraryAiService';
import { getAiFunctionErrorMessage, resolveAiRuntime } from './aiRuntime';
import { knowledgeCards } from '../knowledge/searchIndex';
import { docCorpusCards } from '../knowledge/generated/doc-corpus';

// Corpus curado para aterrar o raciocínio: padrões/pontos da base + chunks do
// repertório e das regras de língua. A IA passa a raciocinar A PARTIR daqui,
// não do conhecimento genérico do modelo.
const REASONING_KNOWLEDGE_CORPUS = [...docCorpusCards, ...knowledgeCards];
const REASONING_KNOWLEDGE_LIMIT = 6;
const REASONING_KNOWLEDGE_TEXT_CAP = 600;

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
  const symptoms = ['sintomas', 'digestao', 'sono', 'dor', 'gineco', 'urogenital', 'fezes']
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
 * Constrói a query de recuperação do caso: hipótese + diferencial + padrões do
 * motor + termos que os sustentam + rótulos de sinais. É o que liga o caso ao
 * conhecimento curado.
 */
export function buildReasoningKnowledgeQuery(clinicalCase) {
  const parts = [];
  if (clinicalCase?.hypothesis?.primary) parts.push(clinicalCase.hypothesis.primary);
  if (clinicalCase?.hypothesis?.differential?.name) parts.push(clinicalCase.hypothesis.differential.name);
  for (const pattern of clinicalCase?.topPatterns || []) {
    if (pattern.name) parts.push(pattern.name);
    for (const term of pattern.terms || []) parts.push(term);
  }
  for (const labels of Object.values(clinicalCase?.signals || {})) {
    for (const label of labels || []) parts.push(label);
  }
  return parts.join(' ');
}

/**
 * Recupera os trechos curados mais relevantes para o caso (repertório/regras +
 * padrões da base) — reduzidos ao essencial para enviar à IA como âncora.
 */
export function retrieveCaseKnowledge(
  clinicalCase,
  { corpus = REASONING_KNOWLEDGE_CORPUS, limit = REASONING_KNOWLEDGE_LIMIT } = {},
) {
  const query = buildReasoningKnowledgeQuery(clinicalCase);
  if (!query.trim()) return [];
  return rankLibraryCards(query, corpus, limit).map(card => ({
    title: card.title,
    cat: card.cat,
    confidence: card.confidence || 'high',
    source: card.source,
    text: String(card.txt || '').slice(0, REASONING_KNOWLEDGE_TEXT_CAP),
  }));
}

/**
 * Monta o caso clínico enviado à IA: hipótese do motor + sinais (rótulos) +
 * texto livre ANONIMIZADO + conhecimento curado recuperado. Sem identificador direto.
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

  const clinicalCase = {
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

  // Âncora curada: trechos do repertório/regras e padrões da base relevantes
  // ao caso, para a IA raciocinar a partir do material do sistema.
  clinicalCase.knowledgeContext = retrieveCaseKnowledge(clinicalCase);

  return clinicalCase;
}

// Quão "preenchido" está o caso — usado pela UI para habilitar o botão.
export function caseHasEvidence(state, selectedMap, synthesis) {
  if (synthesis?.primaryPercent > 0) return true;
  const c = buildClinicalCase(state, selectedMap, synthesis, {});
  if (c.anamneseText.trim()) return true;
  return Object.values(c.signals).some(arr => arr.length > 0);
}

// ----- MOCK (somente login local e testes) -----
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

/**
 * Aprofunda o raciocínio sobre o caso atual com IA (sob demanda).
 *
 * @param {object} state
 * @param {object} selectedMap
 * @param {object} synthesis - saída de assistantSynthesis
 * @param {{ patientName?: string }} [context]
 * @param {{ getAuthenticatedUser?: Function, invoke?: Function }} [runtime]
 * @returns {Promise<{ modelVersion, analyzedAt, interpretation, differentialReasoning, redFlags, contradictions, questions }>}
 */
export async function deepenClinicalReasoning(state, selectedMap, synthesis, context = {}, runtime) {
  const clinicalCase = buildClinicalCase(state, selectedMap, synthesis, context);

  const hasContent = clinicalCase.anamneseText.trim()
    || Object.values(clinicalCase.signals).some(arr => arr.length > 0);
  if (!hasContent) {
    throw new Error('Preencha sinais ou texto da anamnese antes de aprofundar.');
  }

  const client = resolveAiRuntime(runtime, {
    getAuthenticatedUser,
    invoke: (...args) => supabase.functions.invoke(...args),
  });
  const user = await client.getAuthenticatedUser();
  if (user?._isLocal) {
    return mockDeepenClinicalReasoning(clinicalCase);
  }

  const { data, error } = await client.invoke('clinical-reasoning', {
    body: { case: clinicalCase },
  });

  if (error) {
    throw new Error(await getAiFunctionErrorMessage(error, 'Falha ao aprofundar o raciocínio.'));
  }
  if (!data || typeof data.interpretation !== 'string') {
    throw new Error('O raciocínio retornou um formato inesperado.');
  }
  return data;
}
