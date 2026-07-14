// ============================================================
// SERVICE: IA da anamnese de Psicologia (Fase 5)
//
// Duas superfícies, mesmo desenho do MTC:
//  * suggestPsychologyMarks — texto → sugestões do vocabulário psi
//    (Edge Function psych-suggest-marks; surface psych_marks);
//  * generatePsychologyReading — sessão estruturada → LEITURA
//    DIAGNÓSTICA EM RASCUNHO (Edge Function psych-reading;
//    surface psych_reading).
//
// Usuário local (login fallback) → MOCK determinístico; usuário
// real → Edge Function; falha → erro explícito.
//
// PRIVACIDADE: todo texto é ANONIMIZADO aqui, no cliente, ANTES de
// sair — nome/CPF/telefone/datas viram marcadores (utils/anonymize).
//
// A IA sugere e redige RASCUNHO; a profissional decide e pode
// Corrigir (loop de ensino — ai_corrections).
// ============================================================

import { supabase, getAuthenticatedUser } from '../lib/supabase';
import { anonymizeClinicalText } from '../utils/anonymize';
import { getAiFunctionErrorMessage, resolveAiRuntime } from './aiRuntime';
import { confidenceBand } from './anamneseAiService';
import {
  PSYCHOLOGY_CHECKLIST_SECTIONS,
  PSYCHOLOGY_AXES,
  PSYCHOLOGY_RISK_GROUP,
  psychologyRiskChecklist,
  getPsychologySelected,
  getPsychologyTextFields,
} from '../data/psychologyAnamnese';

export { confidenceBand };

export const PSYCHOLOGY_AI_MOCK_VERSION = 'mock-psi-0.1';

export const PSYCHOLOGY_AI_DISCLAIMER =
  'Sugestões assistivas a partir do texto, para conferência. Só o que você confirmar entra na ficha. '
  + 'O texto é anonimizado (nome, CPF, telefone, datas) antes de ir à IA.';

export const PSYCHOLOGY_READING_DISCLAIMER =
  'Leitura preliminar em RASCUNHO, gerada pela IA para a sua revisão. '
  + 'Não é diagnóstico nem conduta: confira, ajuste e corrija — a decisão clínica é sempre sua.';

// Monta o texto clínico rotulado a partir da sessão de Psi.
export function buildPsychologyText(session) {
  if (!session) return '';
  const parts = getPsychologyTextFields(session.intakeProfile)
    .map(({ id, label }) => {
      const value = String(session.fields?.[id] || '').trim();
      return value ? `${label}: ${value}` : '';
    })
    .filter(Boolean);
  for (const axis of PSYCHOLOGY_AXES) {
    const note = String(session.axisNotes?.[axis.id] || '').trim();
    if (note) parts.push(`${axis.label} (eixo): ${note}`);
  }
  const risk = String(session.riskNotes || '').trim();
  if (risk) parts.push(`Anotações de risco/conduta: ${risk}`);
  return parts.join('\n');
}

// ----- MOCKS (somente login local e testes) -----
// Palavras-chave simples contra o catálogo psi, para demonstração útil
// offline. Não é o motor real — determinístico e propositalmente raso.
const MOCK_KEYWORDS = [
  { re: /suicíd|suicid|não quero mais viver|nao quero mais viver|tirar a própria vida|tirar a propria vida|não vale.*viver|nao vale.*viver|tentativa|já tentou|ja tentou/i, group: PSYCHOLOGY_RISK_GROUP, item: 'Ideação e comportamento suicida', confidence: 0.9 },
  { re: /autoles|se corta|se machuca|se machucar|cortes|queimadura/i, group: PSYCHOLOGY_RISK_GROUP, item: 'Autolesão não suicida', confidence: 0.85 },
  { re: /agredir|agress|bater em|machucar (?:o|a|outra)/i, group: PSYCHOLOGY_RISK_GROUP, item: 'Risco a terceiros / heteroagressividade', confidence: 0.7 },
  { re: /violência|violencia|abuso|negligên|negligen|apanha|estupro|assédio|assedio/i, group: PSYCHOLOGY_RISK_GROUP, item: 'Violência, abuso ou negligência', confidence: 0.7 },
  { re: /crise aguda|surto|descompensa|alucina|ouço vozes|ouco vozes|dissocia|fora da realidade/i, group: PSYCHOLOGY_RISK_GROUP, item: 'Sinais de crise aguda', confidence: 0.7 },
  { re: /triste|tristeza|deprimid/i, group: 'psiHumor', item: 'Tristeza persistente', confidence: 0.75 },
  { re: /sem prazer|nada anima|anedonia|perdeu o interesse/i, group: 'psiHumor', item: 'Perda de prazer (anedonia)', confidence: 0.72 },
  { re: /irrita|nervos|raiva/i, group: 'psiHumor', item: 'Irritabilidade', confidence: 0.7 },
  { re: /autoestima|se sente incapaz|não presta|nao presta/i, group: 'psiHumor', item: 'Baixa autoestima', confidence: 0.65 },
  { re: /chora|choro/i, group: 'psiHumor', item: 'Choro frequente', confidence: 0.68 },
  { re: /desesperança|desesperanca|sem saída|sem saida|nada vai mudar/i, group: 'psiHumor', item: 'Desesperança', confidence: 0.66 },
  { re: /pânico|panico/i, group: 'psiAnsiedade', item: 'Crises de pânico', confidence: 0.85 },
  { re: /preocupa/i, group: 'psiAnsiedade', item: 'Preocupação excessiva', confidence: 0.72 },
  { re: /ruminação|ruminacao|pensamento acelerado|não paro de pensar|nao paro de pensar/i, group: 'psiAnsiedade', item: 'Pensamento acelerado / ruminação', confidence: 0.7 },
  { re: /evita|deixou de sair|não sai mais|nao sai mais/i, group: 'psiAnsiedade', item: 'Evitação de situações', confidence: 0.6 },
  { re: /taquicardia|coração acelerado|coracao acelerado|sudorese|falta de ar/i, group: 'psiAnsiedade', item: 'Sintomas físicos (taquicardia, sudorese)', confidence: 0.7 },
  { re: /insônia|insonia|não durmo|nao durmo|dificuldade.*dormir/i, group: 'psiSono', item: 'Dificuldade para iniciar sono', confidence: 0.8 },
  { re: /pesadelo/i, group: 'psiSono', item: 'Pesadelos', confidence: 0.75 },
  { re: /apetite|parou de comer|comendo demais|sem fome/i, group: 'psiAlimentacao', item: 'Redução do apetite', confidence: 0.55 },
  { re: /compulsão alimentar|compulsao alimentar|come escondido|come demais/i, group: 'psiAlimentacao', item: 'Compulsão alimentar', confidence: 0.6 },
  { re: /esquec|memória|memoria|concentr|desatento|desatenta/i, group: 'psiCognicao', item: 'Dificuldade de atenção / concentração', confidence: 0.6 },
  { re: /trauma|revive|flashback|hipervigil/i, group: 'psiTrauma', item: 'Exposição a evento traumático', confidence: 0.62 },
  { re: /isolad|isolamento|se afastou/i, group: 'psiFuncionamento', item: 'Isolamento social', confidence: 0.72 },
  { re: /trabalho|estudo|faculdade|escola/i, group: 'psiFuncionamento', item: 'Prejuízo no trabalho/estudo', confidence: 0.5 },
  { re: /álcool|alcool|bebida|bebendo/i, group: 'psiSubstancias', item: 'Álcool', confidence: 0.75 },
  { re: /maconha|cannabis/i, group: 'psiSubstancias', item: 'Maconha', confidence: 0.8 },
  { re: /cigarro|tabaco|fumando/i, group: 'psiSubstancias', item: 'Tabaco', confidence: 0.72 },
];

export function mockSuggestPsychologyMarks(text) {
  const suggestions = [];
  const seen = new Set();
  for (const { re, group, item, confidence } of MOCK_KEYWORDS) {
    if (re.test(text)) {
      const key = `${group}:${item}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // Rótulo simulado: afirmação forte (confiança alta) → sustentado;
      // indício → investigar. Risco sempre "investigar" (conferência humana).
      const kind = group !== PSYCHOLOGY_RISK_GROUP && confidence >= 0.75 ? 'sustentado' : 'investigar';
      suggestions.push({ group, item, kind, confidence, rationale: 'Sinal identificado no texto (simulado).' });
    }
  }
  // Risco primeiro — mesma garantia da Edge Function real.
  suggestions.sort((a, b) => Number(b.group === PSYCHOLOGY_RISK_GROUP) - Number(a.group === PSYCHOLOGY_RISK_GROUP));
  return new Promise(resolve => {
    setTimeout(() => {
      resolve({
        modelVersion: PSYCHOLOGY_AI_MOCK_VERSION,
        analyzedAt: new Date().toISOString(),
        warning: suggestions.length ? null : 'Nenhum sinal reconhecido pelo motor simulado neste texto.',
        suggestions,
      });
    }, 700);
  });
}

export function mockPsychologyReading(psychologyCase) {
  const selected = psychologyCase?.selected || {};
  const riskItems = Array.isArray(selected[PSYCHOLOGY_RISK_GROUP]) ? selected[PSYCHOLOGY_RISK_GROUP] : [];
  const nonRiskGroups = Object.entries(selected).filter(([group]) => group !== PSYCHOLOGY_RISK_GROUP);
  const markedLabels = nonRiskGroups.flatMap(([, items]) => items).slice(0, 6);

  const riskAlerts = riskItems.map(sign => ({
    sign,
    note: 'Sinal de risco marcado na anamnese — merece atenção prioritária na sua avaliação (simulado).',
  }));

  const hypotheses = markedLabels.length
    ? [{
        name: `Quadro compatível com os sinais marcados (${markedLabels.slice(0, 3).join(', ')})`,
        confidence: 0.45,
        basis: `Sinais marcados na anamnese: ${markedLabels.join(', ')} (leitura simulada).`,
      }]
    : [];

  return new Promise(resolve => {
    setTimeout(() => {
      resolve({
        modelVersion: PSYCHOLOGY_AI_MOCK_VERSION,
        analyzedAt: new Date().toISOString(),
        overview: riskAlerts.length
          ? `Atenção: há ${riskAlerts.length} sinal(is) de risco marcado(s) — confira antes de qualquer outra leitura. `
            + 'No mais, esta é uma leitura simulada gerada a partir dos itens marcados, apenas para demonstração offline.'
          : 'Leitura simulada gerada a partir dos itens marcados, apenas para demonstração offline. '
            + 'No ambiente real, a IA redige uma visão geral ancorada nos dados da anamnese.',
        hypotheses,
        riskAlerts,
        questions: ['Desde quando os sinais principais estão presentes?', 'Houve evento recente que intensificou o quadro?'],
        cautions: ['Motor simulado (login local): a leitura real usa IA com os dados completos da anamnese.'],
      });
    }, 900);
  });
}

/**
 * Lê o texto livre da anamnese de Psi e sugere marcações do vocabulário
 * para revisão (aceitar/ignorar). Nada entra sozinho no checklist.
 */
export async function suggestPsychologyMarks(session, context = {}, runtime) {
  const rawText = buildPsychologyText(session);
  if (!rawText.trim()) {
    throw new Error('Preencha a demanda ou observações antes de pedir sugestões.');
  }

  // Anonimização no cliente — o dado bruto nunca sai do browser.
  const text = anonymizeClinicalText(rawText, { patientName: context.patientName });

  const client = resolveAiRuntime(runtime, {
    getAuthenticatedUser,
    invoke: (...args) => supabase.functions.invoke(...args),
  });
  const user = await client.getAuthenticatedUser();
  if (user?._isLocal) {
    return mockSuggestPsychologyMarks(text);
  }

  const { data, error } = await client.invoke('psych-suggest-marks', {
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

// Monta o caso estruturado e anonimizado enviado à leitura da IA.
export function buildPsychologyCase(session, context = {}) {
  const anonymize = value =>
    anonymizeClinicalText(String(value || ''), { patientName: context.patientName });

  const fields = getPsychologyTextFields(session.intakeProfile)
    .map(({ id, label }) => {
      const text = String(session.fields?.[id] || '').trim();
      if (!text) return null;
      const informant = session.fieldInformants?.[id] || null;
      return {
        id,
        label,
        text: anonymize(text),
        informant: informant
          ? { type: informant.type || '', name: anonymize(informant.name || '') }
          : null,
      };
    })
    .filter(Boolean);

  const selected = {};
  for (const section of PSYCHOLOGY_CHECKLIST_SECTIONS) {
    const items = getPsychologySelected(session.selectedMap, section.group);
    if (items.length) selected[section.group] = items;
  }
  const riskItems = getPsychologySelected(session.selectedMap, PSYCHOLOGY_RISK_GROUP)
    .filter(item => psychologyRiskChecklist.includes(item));
  if (riskItems.length) selected[PSYCHOLOGY_RISK_GROUP] = riskItems;

  const axes = PSYCHOLOGY_AXES
    .map(axis => {
      const text = String(session.axisNotes?.[axis.id] || '').trim();
      return text ? { id: axis.id, label: axis.label, framework: axis.framework, text: anonymize(text) } : null;
    })
    .filter(Boolean);

  const riskNotes = String(session.riskNotes || '').trim();

  return {
    intakeProfile: session.intakeProfile || null,
    fields,
    axes,
    selected,
    riskNotes: riskNotes ? anonymize(riskNotes) : '',
  };
}

/**
 * Gera a LEITURA DIAGNÓSTICA EM RASCUNHO da anamnese de Psi.
 * Sempre exibida como rascunho revisável — nunca vira registro sozinha.
 */
export async function generatePsychologyReading(session, context = {}, runtime) {
  const psychologyCase = buildPsychologyCase(session, context);
  if (!psychologyCase.fields.length && !psychologyCase.axes.length && !Object.keys(psychologyCase.selected).length) {
    throw new Error('Preencha a anamnese (texto, eixos ou marcações) antes de gerar a leitura.');
  }

  const client = resolveAiRuntime(runtime, {
    getAuthenticatedUser,
    invoke: (...args) => supabase.functions.invoke(...args),
  });
  const user = await client.getAuthenticatedUser();
  if (user?._isLocal) {
    return mockPsychologyReading(psychologyCase);
  }

  const { data, error } = await client.invoke('psych-reading', {
    body: { case: psychologyCase },
  });

  if (error) {
    throw new Error(await getAiFunctionErrorMessage(error, 'Falha ao gerar a leitura.'));
  }
  if (!data || typeof data.overview !== 'string') {
    throw new Error('A leitura retornou um formato inesperado.');
  }
  return data;
}

function anonymizeDeep(value, patientName) {
  if (typeof value === 'string') return anonymizeClinicalText(value, { patientName });
  if (Array.isArray(value)) return value.map(item => anonymizeDeep(item, patientName));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, anonymizeDeep(item, patientName)]));
  }
  return value;
}

export function buildNeuropsychologyReportCase(evaluation, context = {}) {
  return anonymizeDeep({
    referral: evaluation?.referral || {},
    instruments: Array.isArray(evaluation?.instruments) ? evaluation.instruments : [],
    sessions: Array.isArray(evaluation?.sessions) ? evaluation.sessions : [],
    integration: evaluation?.integration || {},
  }, context.patientName);
}

export async function generateNeuropsychologyReport(evaluation, context = {}, runtime) {
  const reportCase = buildNeuropsychologyReportCase(evaluation, context);
  const hasContent = Object.values(reportCase.referral || {}).some(Boolean)
    || reportCase.sessions.some(session => session.observations || session.partialResults)
    || Object.values(reportCase.integration || {}).some(Boolean);
  if (!hasContent) throw new Error('Preencha dados da avaliação antes de gerar o relatório.');

  const client = resolveAiRuntime(runtime, {
    getAuthenticatedUser,
    invoke: (...args) => supabase.functions.invoke(...args),
  });
  const user = await client.getAuthenticatedUser();
  if (user?._isLocal) {
    const integration = reportCase.integration || {};
    return {
      modelVersion: 'mock-psi-report-0.1',
      sections: [
        { heading: 'Histórico e demanda', content: reportCase.referral.reason || 'Demanda ainda não registrada.' },
        { heading: 'Procedimentos', content: integration.procedures || `${reportCase.instruments.length} instrumento(s)/procedimento(s) planejado(s).` },
        { heading: 'Observações e resultados', content: integration.resultsSummary || integration.clinicalObservations || 'Integração ainda não preenchida.' },
        { heading: 'Considerações profissionais', content: integration.professionalConclusion || 'Conclusão ainda em revisão profissional.' },
      ],
    };
  }

  const { data, error } = await client.invoke('psych-report', {
    body: { kind: 'avaliacao_neuropsicologica', case: reportCase },
  });
  if (error) {
    throw new Error(await getAiFunctionErrorMessage(error, 'Falha ao gerar o rascunho do relatório.'));
  }
  if (!data || !Array.isArray(data.sections)) {
    throw new Error('O relatório retornou um formato inesperado.');
  }
  return data;
}
