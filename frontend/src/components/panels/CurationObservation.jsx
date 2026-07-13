// ============================================================
// Caixa "Sugerir correção ao SuperAdm" (abas ainda sem edição direta)
//
// Nas abas cuja curadoria estruturada ainda não foi ligada ao modo propor,
// a revisora descreve a correção (o que muda e por quê) + referência do
// item. Vira uma proposta na fila; o SuperAdm lê e aplica na aba real —
// ele é o gate final. Nada é aplicado automaticamente por aqui.
// ============================================================

import { useState } from 'react';
import { submitCurationProposal } from '../../services/curationProposalService';

// Cada aba mapeia para um tipo válido da fila (CHECK de curation_proposals)
// e um substantivo para os rótulos.
const OBSERVATION_BY_SECTION = {
  knowledge: { type: 'point_review', noun: 'ponto ou conteúdo da Biblioteca' },
  'pdf-sources': { type: 'point_review', noun: 'ponto ou fonte de PDF' },
  'herbal-curation': { type: 'herb', noun: 'erva' },
  'food-curation': { type: 'food', noun: 'alimento' },
  'ai-instructions': { type: 'ai_instruction', noun: 'instrução da IA' },
  'ai-corrections': { type: 'ai_correction', noun: 'correção da IA' },
  maps: { type: 'map_coordinate', noun: 'ponto no mapa' },
};

export function CurationObservation({ section, actor }) {
  const config = OBSERVATION_BY_SECTION[section];
  const [ref, setRef] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  if (!config) return null;

  async function handleSend() {
    if (!note.trim()) {
      setMessage('Descreva a correção antes de enviar.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      await submitCurationProposal({
        type: config.type,
        targetRef: ref.trim(),
        payload: { kind: 'observation', section, ref: ref.trim(), note: note.trim() },
        note: note.trim(),
        proposerName: actor?.label || '',
      });
      setNote('');
      setRef('');
      setMessage('Enviado! Sua correção foi para o SuperAdm.');
    } catch (err) {
      setMessage(err?.message || 'Não foi possível enviar. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="box"
      style={{ background: '#f8fafc', border: '1px solid var(--line)', borderRadius: 16, padding: 20 }}
    >
      <div className="start-panel-head" style={{ marginBottom: 12 }}>
        <div>
          <p className="small">Sugerir correção</p>
          <h2>Enviar ao SuperAdm</h2>
        </div>
      </div>

      {message && (
        <div className={/não foi|antes de/i.test(message) ? 'inline-error' : 'inline-success'} style={{ marginBottom: 12 }}>
          {message}
        </div>
      )}

      <label style={{ display: 'block', marginBottom: 12 }}>
        <span className="small" style={{ display: 'block', marginBottom: 4, color: 'var(--navy)', fontWeight: 700 }}>
          Qual {config.noun}? (opcional)
        </span>
        <input
          className="admin-search"
          style={{ width: '100%' }}
          value={ref}
          onChange={event => setRef(event.target.value)}
          placeholder={`Ex.: código ou nome do ${config.noun}`}
        />
      </label>

      <label style={{ display: 'block', marginBottom: 14 }}>
        <span className="small" style={{ display: 'block', marginBottom: 4, color: 'var(--navy)', fontWeight: 700 }}>
          O que deve mudar?
        </span>
        <textarea
          value={note}
          onChange={event => setNote(event.target.value)}
          placeholder="Descreva o que está errado e como deveria ser."
          rows={5}
          style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid var(--line)', font: 'inherit', resize: 'vertical' }}
        />
      </label>

      <button
        className="primary-button"
        type="button"
        onClick={handleSend}
        disabled={busy}
        style={{ fontSize: 15, padding: '12px 22px', borderRadius: 12, fontWeight: 700 }}
      >
        {busy ? 'Enviando...' : 'Enviar ao SuperAdm'}
      </button>
    </section>
  );
}
