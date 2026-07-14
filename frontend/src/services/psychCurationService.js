// ============================================================
// Base curável da anamnese de Psicologia (leitura)
//
// Lê os grupos semeados em `psych_curation_items` (risco / eixos /
// checklist / perguntas). A RLS já garante que só super admin e revisora
// de psicologia enxergam. Nada aqui é conteúdo final: são candidatos
// (trechos de fonte protegida) que a psicóloga aprova/edita/rejeita.
// ============================================================

import draft from '../data/psychAnamneseDraft.json';
import { getPsychAnamneseSources } from '../data/psychAnamneseProvenance';
import { getLocalPsychCurationDecisions } from '../knowledge/psychCurationDecisions';

// kind da base -> tipo de proposta na fila do SuperAdm.
export const PSYCH_PROPOSAL_TYPE = {
  risk: 'anamnese_psic_risk',
  axis: 'anamnese_psic_axis',
  checklist: 'anamnese_psic_checklist',
  question: 'anamnese_psic_question',
};

export const PSYCH_KIND_LABEL = {
  risk: 'Sinais de risco',
  axis: 'Eixos de raciocínio',
  checklist: 'Listas de marcação',
  question: 'Roteiro de anamnese',
};

// Explicação curta exibida junto aos seletores de tipo. Mantê-la aqui evita
// que o nome do botão e a legenda da curadoria contem histórias diferentes.
export const PSYCH_KIND_DESCRIPTION = {
  risk: 'Alertas prioritários para conferência profissional; o sistema não decide a conduta.',
  axis: 'Áreas amplas para organizar a investigação e as hipóteses de trabalho; não são diagnósticos.',
  checklist: 'Grupos de caixinhas para registrar rapidamente sinais relatados ou observados.',
  question: 'Perguntas que ajudam a investigar os temas durante a entrevista.',
};

// Rascunho curado (síntese pt-BR) empacotado no app — não é dado protegido,
// então não precisa de tabela/seed no Supabase. As propostas da revisora
// continuam indo para a fila curation_proposals.
function buildItems() {
  const items = [];
  (draft.risk || []).forEach((r, i) => items.push({
    id: `risk-${i}`, kind: 'risk', label: r.label, sources: getPsychAnamneseSources(`risk-${i}`),
    meta: { priority: r.priority, summary: r.summary, draft: r.draft, screening: r.screening, observe: r.observe, reminder: r.reminder },
  }));
  (draft.axis || []).forEach((a, i) => items.push({
    id: `axis-${i}`, kind: 'axis', label: a.label, sources: getPsychAnamneseSources(`axis-${i}`),
    meta: { framework: a.framework, summary: a.summary, draft: a.draft, explore: a.explore },
  }));
  (draft.checklist || []).forEach((c, i) => items.push({
    id: `checklist-${i}`, kind: 'checklist', label: c.label, sources: getPsychAnamneseSources(`checklist-${i}`),
    meta: { category: c.category, summary: c.summary, examples: c.examples },
  }));
  (draft.questionnaire || []).forEach((b, bi) => (b.questions || []).forEach((q, qi) => items.push({
    id: `question-${bi}-${qi}`, kind: 'question', label: q,
    sources: getPsychAnamneseSources(`question-${bi}-${qi}`, bi),
    meta: { block: b.block, draft: q },
  })));
  const decisions = getLocalPsychCurationDecisions();
  const byId = new Map(decisions.map(decision => [decision.id, decision]));
  const materialized = items.map(item => {
    const decision = byId.get(item.id);
    if (!decision) return { ...item, status: 'review' };
    return {
      ...item,
      status: decision.status,
      localDecision: decision,
      sources: decision.sources?.length ? decision.sources : item.sources,
      meta: {
        ...item.meta,
        draft: decision.wording || item.meta?.draft,
      },
    };
  });

  decisions.filter(decision => decision.id?.startsWith('new:')).forEach(decision => {
    const item = decision.item || {};
    materialized.push({
      id: decision.id,
      kind: decision.kind,
      label: item.label,
      status: decision.status,
      sources: decision.sources || [],
      provenanceMode: decision.provenanceMode,
      localDecision: decision,
      meta: { ...item, draft: item.draft || item.summary || item.label },
    });
  });

  return materialized;
}

/**
 * Itens de curadoria de psicologia, agrupados por kind.
 * Risco primeiro (segurança), depois eixos, listas e roteiro de perguntas.
 */
export async function loadPsychCurationItems() {
  const all = buildItems();
  const order = { risk: 0, axis: 1, checklist: 2, question: 3 };
  const grouped = { risk: [], axis: [], checklist: [], question: [] };
  for (const it of all) grouped[it.kind]?.push(it);
  return {
    grouped,
    kinds: Object.keys(grouped)
      .filter(k => grouped[k].length > 0)
      .sort((a, b) => (order[a] ?? 9) - (order[b] ?? 9)),
    total: all.length,
  };
}
