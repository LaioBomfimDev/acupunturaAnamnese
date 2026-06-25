// ============================================================
// SERVICE: Rascunho de relatório e resumo de evolução por IA
// Fase 3 da expansão de IA (ver roadmap-ia-expansao).
//
// `draftReport`        — rascunho do relatório no modo atual.
// `summarizeEvolution` — resumo da trajetória entre sessões.
//
// Ambos ANONIMIZAM o texto livre e NÃO enviam o nome do paciente
// (a IA fala "o paciente"). Usuário local → mock; sessão real → Edge
// Function `draft-narrative`; indisponibilidade é exibida como erro.
//
// Saída: rascunho para REVISÃO da profissional, nunca conduta final.
// ============================================================

import { supabase, getAuthenticatedUser } from '../lib/supabase';
import { anonymizeClinicalText } from '../utils/anonymize';
import { getAiFunctionErrorMessage, resolveAiRuntime } from './aiRuntime';

export const REPORT_AI_MOCK_VERSION = 'mock-0.1';

export const REPORT_AI_DISCLAIMER =
  'Rascunho gerado por IA a partir dos dados do sistema. Revise e ajuste antes de usar. ' +
  'O texto é anonimizado e o nome do paciente não é enviado à IA.';

// Anonimiza os campos de texto livre de um objeto (mantém o resto).
function anonymizeFields(obj, fields, patientName) {
  const out = { ...obj };
  for (const f of fields) {
    if (typeof out[f] === 'string' && out[f]) {
      out[f] = anonymizeClinicalText(out[f], { patientName });
    }
  }
  return out;
}

// ----- MOCK -----
function mockParagraphs(lines) {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve({
        modelVersion: REPORT_AI_MOCK_VERSION,
        analyzedAt: new Date().toISOString(),
        paragraphs: lines,
      });
    }, 700);
  });
}

export function mockDraftReport(mode, reportData) {
  return mockParagraphs([
    `(Rascunho simulado — ${mode}.)`,
    reportData.hipotese
      ? `Hipótese energética em avaliação: ${reportData.hipotese}.`
      : 'Hipótese ainda não consolidada a partir dos dados disponíveis.',
    reportData.principioTerapeutico
      ? `Princípio terapêutico: ${reportData.principioTerapeutico}.`
      : 'Princípio terapêutico a definir conforme a evolução.',
  ]);
}

export function mockSummarizeEvolution(sessions) {
  const list = Array.isArray(sessions) ? sessions : [];
  const first = list[0] || {}, last = list[list.length - 1] || {};
  return mockParagraphs([
    `(Resumo simulado de ${list.length} sessão(ões).)`,
    list.length >= 2
      ? `Comparando a 1ª e a última sessão: dor ${first.dor ?? '—'}→${last.dor ?? '—'}, sono ${first.sono ?? '—'}→${last.sono ?? '—'}.`
      : 'Apenas uma sessão registrada — leitura ainda preliminar.',
  ]);
}

async function callDraftNarrative({ kind, mode, payload }, mockFn, runtime) {
  const client = resolveAiRuntime(runtime, {
    getAuthenticatedUser,
    invoke: (...args) => supabase.functions.invoke(...args),
  });
  const user = await client.getAuthenticatedUser();
  if (user?._isLocal) return mockFn();

  const { data, error } = await client.invoke('draft-narrative', {
    body: { kind, mode, payload },
  });

  if (error) {
    throw new Error(await getAiFunctionErrorMessage(error, 'Falha ao gerar o rascunho.'));
  }
  if (!data || !Array.isArray(data.paragraphs)) {
    throw new Error('A geração retornou um formato inesperado.');
  }
  return data;
}

/**
 * Gera o rascunho do relatório no modo informado.
 * @param {string} mode - 'Resumo clínico' | 'Relatório profissional' | 'Orientação ao paciente'
 * @param {object} reportData - campos estruturados do relatório
 * @param {{ patientName?: string }} [context]
 * @param {{ getAuthenticatedUser?: Function, invoke?: Function }} [runtime]
 */
export async function draftReport(mode, reportData, context = {}, runtime) {
  const payload = anonymizeFields(reportData, ['queixa', 'historia'], context.patientName);

  return callDraftNarrative(
    { kind: 'report', mode, payload },
    () => mockDraftReport(mode, reportData),
    runtime,
  );
}

/**
 * Resume a trajetória do paciente entre sessões.
 * @param {Array} sessions - state.evolucoes
 * @param {{ patientName?: string }} [context]
 * @param {{ getAuthenticatedUser?: Function, invoke?: Function }} [runtime]
 */
export async function summarizeEvolution(sessions, context = {}, runtime) {
  const list = Array.isArray(sessions) ? sessions : [];
  if (list.length < 1) {
    throw new Error('Registre ao menos uma sessão para resumir a evolução.');
  }

  // Só os campos úteis, com texto livre anonimizado.
  const payload = {
    sessions: list.map(s => anonymizeFields(
      {
        sessao: s.sessao,
        dor: s.dor, sono: s.sono, ansiedade: s.ansiedade,
        energia: s.energia, intestino: s.intestino, humor: s.humor,
        hipotese: s.dx,
        protocolo: s.protocolo,
        intercorrencia: s.intercorrencia,
        obs: s.obs,
        resposta: s.resposta,
      },
      ['protocolo', 'intercorrencia', 'obs', 'resposta'],
      context.patientName,
    )),
  };

  return callDraftNarrative(
    { kind: 'evolution', payload },
    () => mockSummarizeEvolution(list),
    runtime,
  );
}
