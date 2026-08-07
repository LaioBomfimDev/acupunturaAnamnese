// ============================================================
// Fila de propostas de curadoria (Acupunturista Revisora → SuperAdm)
//
// A revisora trabalha em modo "propor": cada ação de curadoria vira
// um registro em `curation_proposals` (Supabase), visível ao SuperAdm
// em qualquer máquina. Ao aprovar, o SuperAdm reproduz o `payload` no
// caminho de aprovação local já existente (localStorage + export JSON).
//
// Tipos aceitos (espelham o CHECK de curation_proposals; ver migrações
// 20260713 / 20260714 / 20260715):
//   point_review | point_promote_common | anamnese_finding |
//   anamnese_question | anamnese_pattern | herb | food | ai_instruction |
//   ai_correction | map_coordinate | knowledge_review |
//   anamnese_psic_risk | anamnese_psic_axis | anamnese_psic_checklist |
//   anamnese_psic_question
// ============================================================

import { supabase } from '../lib/supabase';

const TABLE = 'curation_proposals';

/**
 * Registra uma proposta da revisora. proposer_id sai da sessão autenticada
 * (a RLS exige proposer_id = auth.uid()).
 */
export async function submitCurationProposal({ type, targetRef = '', payload = {}, note = '', proposerName = '' }) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const userId = userData?.user?.id;
  if (!userId) throw new Error('Sessão expirada. Entre novamente para propor curadoria.');

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      proposer_id: userId,
      proposer_name: proposerName || userData?.user?.user_metadata?.full_name || null,
      type,
      target_ref: targetRef || null,
      payload,
      note: note || null,
      status: 'proposed',
    })
    .select('id,created_at,type,target_ref,status')
    .single();

  if (error) throw error;
  return data;
}

/**
 * Lista propostas. SuperAdm vê todas; revisora vê só as próprias (RLS).
 */
export async function listCurationProposals({ status = 'proposed' } = {}) {
  let query = supabase
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/**
 * SuperAdm aprova ou rejeita. A aplicação do payload (replay no caminho
 * de aprovação local) é responsabilidade de quem chama, ANTES de marcar
 * como aprovado — assim status só muda quando a aplicação deu certo.
 */
export async function decideCurationProposal(id, decision, note = '') {
  if (!['approved', 'rejected'].includes(decision)) {
    throw new Error('Decisão inválida.');
  }

  const { data: userData } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from(TABLE)
    .update({
      status: decision,
      decided_by: userData?.user?.id || null,
      decided_at: new Date().toISOString(),
      decision_note: note || null,
    })
    .eq('id', id)
    .select('id,status,decided_at')
    .single();

  if (error) throw error;
  return data;
}

/**
 * Aprova uma proposta de Biblioteca Viva dentro de uma única transação
 * PostgreSQL: versão da entidade, decisão, auditoria e outbox são gravados
 * juntos. O banco mantém `review` quando faltar gate profissional.
 */
export async function approveKnowledgeCurationProposal(id, note = '') {
  const decisionNote = String(note || '').trim();
  if (decisionNote.length < 10) {
    throw new Error('Registre uma justificativa de pelo menos 10 caracteres.');
  }

  const { data, error } = await supabase.rpc('approve_knowledge_curation_proposal', {
    p_proposal_id: id,
    p_decision_note: decisionNote,
  });

  if (error) {
    const details = [error.message, error.details, error.hint, error.code]
      .filter(Boolean)
      .join(' ');
    if (
      /approve_knowledge_curation_proposal/.test(details)
      && /does not exist|schema cache|Could not find|PGRST202/i.test(details)
    ) {
      throw new Error(
        'Publicação central da Biblioteca ainda não foi ativada. Aplique a migração de hardening 20260723.',
      );
    }
    throw error;
  }

  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.proposal_id || !result?.entity_id) {
    throw new Error('O banco não confirmou a aplicação transacional da proposta.');
  }
  return result;
}

/**
 * Rejeita uma proposta de conhecimento em transação auditável. O UPDATE direto
 * permanece bloqueado para que payload, autoria e identidade não possam mudar.
 */
export async function rejectKnowledgeCurationProposal(id, note = '') {
  const decisionNote = String(note || '').trim();
  if (decisionNote.length < 10) {
    throw new Error('Registre uma justificativa de pelo menos 10 caracteres.');
  }

  const { data, error } = await supabase.rpc('reject_knowledge_curation_proposal', {
    p_proposal_id: id,
    p_decision_note: decisionNote,
  });
  if (error) {
    const details = [error.message, error.details, error.hint, error.code]
      .filter(Boolean)
      .join(' ');
    if (
      /reject_knowledge_curation_proposal/.test(details)
      && /does not exist|schema cache|Could not find|PGRST202/i.test(details)
    ) {
      throw new Error(
        'Rejeição auditável da Biblioteca ainda não foi ativada. Aplique a migração de hardening 20260723.',
      );
    }
    throw error;
  }

  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.proposal_id || result.status !== 'rejected') {
    throw new Error('O banco não confirmou a rejeição transacional da proposta.');
  }
  return result;
}

/**
 * Contagem de propostas pendentes (para badges no SuperAdm).
 */
export async function countPendingProposals() {
  const { count, error } = await supabase
    .from(TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('status', 'proposed');

  if (error) throw error;
  return count || 0;
}
