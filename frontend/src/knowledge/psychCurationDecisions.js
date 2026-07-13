export const PSYCH_CURATION_DECISIONS_KEY = 'acup_psych_curation_decisions_v1';

const TYPE_BY_KIND = Object.freeze({
  risk: 'anamnese_psic_risk',
  axis: 'anamnese_psic_axis',
  checklist: 'anamnese_psic_checklist',
  question: 'anamnese_psic_question',
});

const ALLOWED_DECISIONS = new Set(['approved_local', 'review', 'rejected', 'new']);

export function getLocalPsychCurationDecisions() {
  if (typeof localStorage === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(PSYCH_CURATION_DECISIONS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLocalPsychCurationDecision(decision) {
  if (typeof localStorage === 'undefined') {
    throw new Error('Armazenamento local indisponível para aplicar a curadoria de Psicologia.');
  }
  if (!decision?.id || !decision?.kind || !decision?.status) {
    throw new Error('Decisão de Psicologia incompleta.');
  }

  const current = getLocalPsychCurationDecisions();
  const next = [decision, ...current.filter(item => item.id !== decision.id)];
  localStorage.setItem(PSYCH_CURATION_DECISIONS_KEY, JSON.stringify(next));
  return decision;
}

/**
 * Reproduz localmente uma proposta que já passou pelo gate do SuperAdm.
 * Não publica no Supabase clínico nem ativa diagnóstico/scoring automático.
 */
export function applyPsychCurationProposal(proposal, actor = {}) {
  const payload = proposal?.payload || {};
  const kind = payload.kind;
  const decision = payload.decision;
  if (!TYPE_BY_KIND[kind] || TYPE_BY_KIND[kind] !== proposal?.type) {
    throw new Error('Tipo de proposta de Psicologia incompatível com o item.');
  }
  if (!ALLOWED_DECISIONS.has(decision)) {
    throw new Error('Decisão de Psicologia inválida.');
  }
  if (decision === 'new' && !payload.item?.label) {
    throw new Error('Novo item de Psicologia sem nome.');
  }
  if (decision !== 'new' && !proposal?.target_ref) {
    throw new Error('Proposta de Psicologia sem item de destino.');
  }

  const now = new Date().toISOString();
  const id = decision === 'new' ? `new:${proposal.id}` : proposal.target_ref;
  return saveLocalPsychCurationDecision({
    id,
    proposalId: proposal.id,
    kind,
    status: decision === 'new' ? 'approved_local' : decision,
    label: payload.label || payload.item?.label || '',
    wording: payload.wording || '',
    item: decision === 'new' ? payload.item : null,
    sources: Array.isArray(payload.sources) ? payload.sources : [],
    provenanceMode: decision === 'new' ? 'professional_authored' : 'protected_page_pointer',
    approvalMode: 'local_only',
    professionalReviewerId: proposal.proposer_id || '',
    professionalReviewerLabel: proposal.proposer_name || '',
    approvedByRole: actor.role || actor.approvedByRole || 'super_admin',
    approvedByLabel: actor.label || actor.approvedByLabel || 'SuperAdm',
    approvedAt: now,
    requiresProfessionalAudit: false,
  });
}
