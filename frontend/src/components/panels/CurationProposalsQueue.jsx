// ============================================================
// Fila de propostas de curadoria (visão do SuperAdm)
//
// Mostra o que a Acupunturista Revisora propôs. Aprovar reproduz o
// payload no caminho de aprovação local que já existe (override de
// ponto comum / decisão de conhecimento da anamnese) ANTES de marcar a
// proposta como aprovada — se a aplicação falhar, o status não muda.
// ============================================================
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState } from 'react';
import { listCurationProposals, decideCurationProposal } from '../../services/curationProposalService';
import { addCommonlyUsedOverride } from '../../knowledge/commonlyUsedOverrides';
import { saveAnamneseKnowledgeDecision } from '../../services/anamneseKnowledgeCurationService';

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
  // Tipos ainda sem replay automático: apenas registra a decisão.
  throw new Error('Este tipo de proposta ainda precisa ser aplicado manualmente na aba correspondente.');
}

export function CurationProposalsQueue() {
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busyId, setBusyId] = useState('');

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
      applyProposal(proposal);
      await decideCurationProposal(proposal.id, 'approved');
      setMessage(isObservation(proposal)
        ? 'Marcada como aplicada. Lembre de aplicar a correção na aba correspondente.'
        : `Proposta aprovada e aplicada: ${TYPE_LABELS[proposal.type] || proposal.type}.`);
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
      await decideCurationProposal(proposal.id, 'rejected');
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
          <span className="small">Enviadas pela acupunturista revisora; aprovar aplica localmente.</span>
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
                    disabled={busyId === proposal.id}
                    style={{ background: '#e6f4ea', color: '#137333', borderColor: '#137333', cursor: 'pointer' }}
                  >
                    {busyId === proposal.id ? 'Salvando...' : isObservation(proposal) ? 'Marcar como aplicada' : 'Aprovar'}
                  </button>
                  <button
                    className="tag"
                    type="button"
                    onClick={() => handleReject(proposal)}
                    disabled={busyId === proposal.id}
                  >
                    Rejeitar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
