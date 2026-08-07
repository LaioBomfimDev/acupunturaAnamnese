// ============================================================
// Fila de propostas de curadoria (visão do SuperAdm)
//
// Mostra o que a Acupunturista Revisora propôs. Conhecimento da
// Biblioteca é versionado transacionalmente no servidor; fluxos legados
// ainda explicitamente locais são aplicados antes de marcar a decisão.
// ============================================================
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState } from 'react';
import {
  approveKnowledgeCurationProposal,
  decideCurationProposal,
  listCurationProposals,
  rejectKnowledgeCurationProposal,
} from '../../services/curationProposalService';
import { addCommonlyUsedOverride } from '../../knowledge/commonlyUsedOverrides';
import { saveAnamneseKnowledgeDecision } from '../../services/anamneseKnowledgeCurationService';
import { saveLocalHerbalCurationDecision } from '../../knowledge/herbalPlantCuration';
import { saveLocalFoodCurationDecision } from '../../knowledge/foodDietoterapiaCuration';
import { applyPsychCurationProposal } from '../../knowledge/psychCurationDecisions';
import {
  getLocationIdentity,
  readStoredMapLocations,
  upsertStoredMapLocation,
  writeStoredMapLocations,
} from '../../knowledge/mapLocations';

const TYPE_LABELS = {
  point_review: 'Revisão de ponto',
  point_promote_common: 'Promover a comumente usado',
  anamnese_finding: 'Conhecimento da anamnese · achado',
  anamnese_question: 'Conhecimento da anamnese · pergunta',
  anamnese_pattern: 'Conhecimento da anamnese · padrão',
  herb: 'Curadoria de erva',
  food: 'Curadoria de alimento',
  ai_instruction: 'Instrução da IA',
  ai_correction: 'Correção da IA',
  map_coordinate: 'Coordenada de mapa',
  knowledge_review: 'Biblioteca Viva / Fontes PDF · ponto',
  anamnese_psic_risk: 'Psicologia · sinal de risco',
  anamnese_psic_axis: 'Psicologia · eixo de raciocínio',
  anamnese_psic_checklist: 'Psicologia · checklist',
  anamnese_psic_question: 'Psicologia · pergunta',
};

const SUPER_ADMIN_ACTOR = { approvedByRole: 'super_admin', approvedByLabel: 'SuperAdm' };

function formatDateTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function isObservation(proposal) {
  return proposal?.payload?.kind === 'observation';
}

function hasRequiredDecisionNote(proposal, decisionNotes) {
  return proposal.type !== 'knowledge_review'
    || String(decisionNotes[proposal.id] || '').trim().length >= 10;
}

// Reproduz o efeito da proposta no caminho de aprovação local existente.
function applyProposal(proposal) {
  const { type, payload } = proposal;
  // Correção por texto: o SuperAdm aplica manualmente na aba correspondente;
  // aprovar aqui só registra que foi tratada.
  if (payload?.kind === 'observation') {
    return;
  }
  if (type === 'point_promote_common') {
    const code = payload?.code || payload?.displayCode || proposal.target_ref;
    if (!code) throw new Error('Proposta sem código de ponto.');
    addCommonlyUsedOverride(code);
    return;
  }
  if (type === 'anamnese_finding' || type === 'anamnese_question' || type === 'anamnese_pattern') {
    const candidate = payload?.candidate;
    if (!candidate) throw new Error('Proposta sem candidato da anamnese.');
    const decision = payload?.decision || 'approved_local';
    saveAnamneseKnowledgeDecision(candidate, decision, SUPER_ADMIN_ACTOR);
    return;
  }
  if (type === 'herb') {
    const decision = payload?.decision;
    if (!decision) throw new Error('Proposta de erva sem decisão.');
    saveLocalHerbalCurationDecision(decision);
    return;
  }
  if (type === 'food') {
    const decision = payload?.decision;
    if (!decision) throw new Error('Proposta de alimento sem decisão.');
    saveLocalFoodCurationDecision(decision);
    return;
  }
  if (type === 'map_coordinate') {
    const location = payload?.location;
    if (!location) throw new Error('Proposta de coordenada sem posição.');
    const options = payload?.options || {};
    const stored = upsertStoredMapLocation(location, {
      actorRole: 'super_admin',
      actorLabel: 'SuperAdm',
      replaceLocationIdentity: options.replaceLocationIdentity || null,
      replacedFromMapId: options.replacedFromMapId || null,
    });
    // Se o ponto cruzou a linha média, a identidade (lado) muda: remove o
    // registro antigo para não duplicar marcador — espelha o confirmPendingMove.
    const oldIdentity = options.replaceLocationIdentity;
    if (oldIdentity) {
      const newIdentity = getLocationIdentity(stored);
      if (newIdentity !== oldIdentity) {
        const remaining = readStoredMapLocations()
          .filter(item => getLocationIdentity(item) !== oldIdentity);
        writeStoredMapLocations(remaining);
      }
    }
    return;
  }
  if (type.startsWith('anamnese_psic_')) {
    applyPsychCurationProposal(proposal, { role: 'super_admin', label: 'SuperAdm' });
    return;
  }
  // Tipos ainda sem replay automático: apenas registra a decisão.
  throw new Error('Este tipo de proposta ainda precisa ser aplicado manualmente na aba correspondente.');
}

export function CurationProposalsQueue() {
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busyId, setBusyId] = useState('');
  const [decisionNotes, setDecisionNotes] = useState({});

  async function load() {
    setLoading(true);
    setError('');
    try {
      setProposals(await listCurationProposals({ status: 'proposed' }));
    } catch (err) {
      setError(err?.message || 'Não foi possível carregar as propostas. A tabela já foi criada no Supabase?');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleApprove(proposal) {
    setBusyId(proposal.id);
    setMessage('');
    setError('');
    try {
      if (proposal.type === 'knowledge_review') {
        const applied = await approveKnowledgeCurationProposal(
          proposal.id,
          decisionNotes[proposal.id],
        );
        setMessage(
          applied.entity_approval_status === 'approved'
            ? 'Proposta versionada e publicada após gate profissional.'
            : 'Proposta versionada no servidor e mantida em revisão profissional.',
        );
      } else {
        applyProposal(proposal);
        await decideCurationProposal(proposal.id, 'approved');
        setMessage(isObservation(proposal)
          ? 'Marcada como aplicada. Lembre de aplicar a correção na aba correspondente.'
          : `Proposta aprovada e aplicada: ${TYPE_LABELS[proposal.type] || proposal.type}.`);
      }
      await load();
    } catch (err) {
      setError(err?.message || 'Não foi possível aprovar a proposta.');
    } finally {
      setBusyId('');
    }
  }

  async function handleReject(proposal) {
    setBusyId(proposal.id);
    setMessage('');
    setError('');
    try {
      if (proposal.type === 'knowledge_review') {
        await rejectKnowledgeCurationProposal(
          proposal.id,
          decisionNotes[proposal.id],
        );
      } else {
        await decideCurationProposal(proposal.id, 'rejected');
      }
      setMessage('Proposta rejeitada.');
      await load();
    } catch (err) {
      setError(err?.message || 'Não foi possível rejeitar a proposta.');
    } finally {
      setBusyId('');
    }
  }

  return (
    <section className="admin-users">
      <div className="start-panel-head">
        <div>
          <p className="small">Curadoria</p>
          <h2>Propostas da revisora</h2>
          <span className="small">Enviadas pela acupunturista revisora; a Biblioteca é versionada no servidor e só publica após gate profissional.</span>
        </div>
        <button className="quiet-button" type="button" onClick={load} disabled={loading}>Atualizar</button>
      </div>

      {error && <div className="inline-error" style={{ marginTop: 12 }}>{error}</div>}
      {message && <div className="inline-success" style={{ marginTop: 12 }}>{message}</div>}

      {loading ? (
        <div className="empty-state">Carregando propostas...</div>
      ) : proposals.length === 0 ? (
        <div className="empty-state">Nenhuma proposta pendente.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
          {proposals.map(proposal => (
            <div
              key={proposal.id}
              style={{
                background: 'white', border: '1px solid var(--line)', borderRadius: 12, padding: 14,
                display: 'flex', flexDirection: 'column', gap: 8,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                <div>
                  <b style={{ color: 'var(--navy)' }}>{TYPE_LABELS[proposal.type] || proposal.type}</b>
                  {isObservation(proposal) && (
                    <span className="tag" style={{ marginLeft: 8, color: '#8a6d00', borderColor: '#e0c66b', fontSize: 11 }}>
                      correção por texto · aplicar manualmente
                    </span>
                  )}
                  {proposal.target_ref ? <span style={{ marginLeft: 8, color: '#334155' }}>{proposal.target_ref}</span> : null}
                  <small style={{ display: 'block', color: '#64748b' }}>
                    {proposal.proposer_name || 'Revisora'} • {formatDateTime(proposal.created_at)}
                  </small>
                  {proposal.note ? <p style={{ margin: '6px 0 0', color: '#334155', fontSize: 13 }}>{proposal.note}</p> : null}
                </div>
                <div style={{ display: 'flex', gap: 8, whiteSpace: 'nowrap' }}>
                  <button
                    className="tag active"
                    type="button"
                    onClick={() => handleApprove(proposal)}
                    disabled={
                      busyId === proposal.id
                      || !hasRequiredDecisionNote(proposal, decisionNotes)
                    }
                    style={{ background: '#e6f4ea', color: '#137333', borderColor: '#137333', cursor: 'pointer' }}
                  >
                    {busyId === proposal.id ? 'Salvando...' : isObservation(proposal) ? 'Marcar como aplicada' : 'Aprovar'}
                  </button>
                  <button
                    className="tag"
                    type="button"
                    onClick={() => handleReject(proposal)}
                    disabled={
                      busyId === proposal.id
                      || !hasRequiredDecisionNote(proposal, decisionNotes)
                    }
                  >
                    Rejeitar
                  </button>
                </div>
              </div>
              {proposal.type === 'knowledge_review' && (
                <label>
                  Justificativa da decisão
                  <textarea
                    rows={2}
                    value={decisionNotes[proposal.id] || ''}
                    onChange={event => setDecisionNotes(current => ({
                      ...current,
                      [proposal.id]: event.target.value,
                    }))}
                    maxLength={4000}
                    placeholder="Registre o que foi conferido e por que aprovar ou rejeitar."
                  />
                  <small>
                    Obrigatória, com pelo menos 10 caracteres. Aprovação administrativa
                    não substitui o gate profissional registrado na proposta.
                  </small>
                </label>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
