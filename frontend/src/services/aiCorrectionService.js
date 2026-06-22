// ============================================================
// SERVICE: Correções da IA — o loop de ensino (lado cliente)
//
// Toda saída de IA pode ser corrigida pela profissional. A correção é
// CONHECIMENTO CLÍNICO (não prontuário): o texto é ANONIMIZADO aqui, no
// cliente, antes de sair. Guardamos em ai_corrections (Supabase) ou em
// localStorage (login local).
//
// Propagação (decidida com o usuário):
//  * a autora usa as próprias correções na hora (mesmo em revisão);
//  * para todas, só após aprovação da SuperAdm.
// A regra é aplicada na injeção dentro das Edge Functions
// (_shared/corrections.ts). Aqui só registramos/listamos/curamos.
// ============================================================

import { supabase, getAuthenticatedUser } from '../lib/supabase';
import { anonymizeClinicalText, looksLikeContainsPII } from '../utils/anonymize';

export const AI_SURFACES = {
  TONGUE: 'tongue',
  ANAMNESE_MARKS: 'anamnese_marks',
  CLINICAL_REASONING: 'clinical_reasoning',
  NARRATIVE: 'narrative',
  LIBRARY_QA: 'library_qa',
};

export const AI_SURFACE_LABELS = {
  tongue: 'Língua',
  anamnese_marks: 'Sugestões da anamnese',
  clinical_reasoning: 'Raciocínio clínico (IA Assistente)',
  narrative: 'Relatório / Evolução',
  library_qa: 'Biblioteca',
};

export const CORRECTION_STATUS_LABELS = {
  pending: 'em revisão',
  approved: 'aprovada',
  rejected: 'reprovada',
};

const LOCAL_KEY = 'acup.ai.corrections.v1';
const VALID_SURFACES = new Set(Object.values(AI_SURFACES));
const VALID_STATUS = new Set(['pending', 'approved', 'rejected']);
const MAX_LEN = 4000;

function clampText(value) {
  return String(value || '').trim().slice(0, MAX_LEN);
}

function generateId() {
  return `corr-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// ----- localStorage (login local e fallback de testes) -----
function getLocalCorrections() {
  if (typeof localStorage === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setLocalCorrections(list) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
}

function saveLocalCorrection(row) {
  const list = getLocalCorrections();
  setLocalCorrections([row, ...list.filter(item => item.id !== row.id)]);
  return row;
}

function authorLabelFromUser(user) {
  return (
    user?.user_metadata?.full_name
    || user?.user_metadata?.name
    || user?.full_name
    || user?.email
    || 'Profissional'
  );
}

/**
 * Registra uma correção da profissional sobre uma saída de IA.
 * Anonimiza o texto antes de sair. Login local → localStorage; real → Supabase.
 *
 * @param {{surface,modelVersion,contextSnapshot,aiOutput,correctionText,correctionStructured,reason}} input
 * @param {{patientName?:string}} [context]
 * @returns {Promise<object>} a correção registrada
 */
export async function submitAiCorrection(input, context = {}) {
  const surface = input?.surface;
  if (!VALID_SURFACES.has(surface)) {
    throw new Error('Superfície de IA inválida para correção.');
  }
  const correctionText = anonymizeClinicalText(clampText(input.correctionText), {
    patientName: context.patientName,
  });
  if (!correctionText) {
    throw new Error('Escreva a versão correta para ensinar a IA.');
  }
  const reason = input.reason
    ? anonymizeClinicalText(clampText(input.reason), { patientName: context.patientName })
    : null;

  const user = await getAuthenticatedUser();
  const base = {
    surface,
    model_version: input.modelVersion || null,
    context_snapshot: input.contextSnapshot || {},
    ai_output: input.aiOutput || {},
    correction_text: correctionText,
    correction_structured: input.correctionStructured || null,
    reason,
  };

  if (user?._isLocal) {
    return saveLocalCorrection({
      ...base,
      id: generateId(),
      approval_status: 'pending',
      author_id: user.id || 'local',
      author_label: authorLabelFromUser(user),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      _isLocal: true,
    });
  }

  const { data, error } = await supabase
    .from('ai_corrections')
    .insert({
      ...base,
      author_id: user.id,
      author_label: authorLabelFromUser(user),
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message || 'Não foi possível registrar a correção.');
  }
  return data;
}

/**
 * Lista as correções da própria profissional (opcionalmente por superfície).
 */
export async function listMyCorrections(surface) {
  const user = await getAuthenticatedUser();
  if (user?._isLocal) {
    return getLocalCorrections().filter(row => !surface || row.surface === surface);
  }

  let query = supabase
    .from('ai_corrections')
    .select('*')
    .eq('author_id', user.id)
    .order('created_at', { ascending: false });
  if (surface) query = query.eq('surface', surface);

  const { data, error } = await query;
  if (error) throw new Error(error.message || 'Falha ao carregar suas correções.');
  return data || [];
}

/**
 * Lista correções para curadoria (SuperAdm vê tudo via RLS).
 * @param {{surface?:string, status?:string}} [filters]
 */
export async function listCorrectionsForReview({ surface, status } = {}) {
  const user = await getAuthenticatedUser();
  if (user?._isLocal) {
    return getLocalCorrections().filter(row =>
      (!surface || row.surface === surface) && (!status || row.approval_status === status));
  }

  let query = supabase
    .from('ai_corrections')
    .select('*')
    .order('created_at', { ascending: false });
  if (surface) query = query.eq('surface', surface);
  if (status) query = query.eq('approval_status', status);

  const { data, error } = await query;
  if (error) throw new Error(error.message || 'Falha ao carregar a fila de correções.');
  return data || [];
}

/**
 * Aprova/reprova/repõe em revisão (SuperAdm). Aprovada → vale para todas.
 */
export async function setCorrectionStatus(id, status) {
  if (!VALID_STATUS.has(status)) throw new Error('Status de correção inválido.');
  const user = await getAuthenticatedUser();

  if (user?._isLocal) {
    const list = getLocalCorrections();
    const next = list.map(row => (row.id === id
      ? { ...row, approval_status: status, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() }
      : row));
    setLocalCorrections(next);
    return next.find(row => row.id === id) || null;
  }

  const { data, error } = await supabase
    .from('ai_corrections')
    .update({
      approval_status: status,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message || 'Não foi possível atualizar a correção.');
  return data;
}

// Reexporta para a UI avisar se ainda há algo que parece identificador.
export { looksLikeContainsPII };
