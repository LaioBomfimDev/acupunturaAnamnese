// ============================================================
// Base curável da anamnese de Psicologia (leitura)
//
// Lê os grupos semeados em `psych_curation_items` (risco / eixos /
// checklist / perguntas). A RLS já garante que só super admin e revisora
// de psicologia enxergam. Nada aqui é conteúdo final: são candidatos
// (trechos de fonte protegida) que a psicóloga aprova/edita/rejeita.
// ============================================================

import { supabase } from '../lib/supabase';

const TABLE = 'psych_curation_items';

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

/**
 * Carrega os itens de curadoria de psicologia, agrupados por kind.
 * Risco vem primeiro (segurança), depois eixos, checklist e perguntas.
 */
export async function loadPsychCurationItems() {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('discipline', 'psicologia')
    .order('kind', { ascending: true })
    .order('total_candidates', { ascending: false });

  if (error) throw error;

  const order = { risk: 0, axis: 1, checklist: 2, question: 3 };
  const grouped = { risk: [], axis: [], checklist: [], question: [] };
  for (const row of data || []) {
    if (grouped[row.kind]) grouped[row.kind].push(row);
  }
  return {
    grouped,
    kinds: Object.keys(grouped)
      .filter(k => grouped[k].length > 0)
      .sort((a, b) => (order[a] ?? 9) - (order[b] ?? 9)),
    total: (data || []).length,
  };
}
