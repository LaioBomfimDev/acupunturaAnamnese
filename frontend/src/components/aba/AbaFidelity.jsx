import { useState } from 'react';
import { saveFidelity } from '../../services/abaService';
import { FIDELITY_SOURCES, QUALITY_MINIMUM, fidelityDraft, fidelityScore } from '../../utils/aba/quality.js';
import { AbaDialog } from './AbaDialog';
import { AbaIcon } from './AbaIcon';

// ============================================================
// Fidelidade de aplicação da sessão (Manual cap. 11/12), em duas fontes:
// a autoavaliação de quem atendeu e a revisão da supervisão do time. Sem
// ela, a regra de decisão não separa "a criança parou de responder" de
// "o procedimento foi mal aplicado". Trazido do Atlas (FidelitySection).
// ============================================================

export function FidelityScore({ value }) {
  if (value == null) return <strong className="aba-score">—</strong>;
  return <strong className={`aba-score${value < QUALITY_MINIMUM ? ' is-low' : ''}`}>{value}%</strong>;
}

/** Bloco dentro do detalhe da sessão: as duas notas e os botões de avaliar. */
export function FidelitySection({ session, data, onEdit }) {
  const userId = data.permissions.userId;
  const canSelf = session.therapistId === userId || data.permissions.isAdmin;
  const canSupervise = data.permissions.canSupervise;
  const saved = source => data.fidelity.find(entry => entry.sessionId === session.id && entry.source === source) || null;

  return (
    <div className="aba-fidelity">
      <div className="aba-section-head">
        <div><p className="aba-eyebrow">Fidelidade de aplicação</p><h3>O procedimento foi aplicado como planejado?</h3></div>
      </div>
      <div className="aba-fidelity-cards">
        {Object.entries(FIDELITY_SOURCES).map(([source, config]) => {
          const entry = saved(source);
          const allowed = source === 'autoavaliacao' ? canSelf : canSupervise;
          return (
            <article key={source}>
              <div>
                <span className="aba-tag">{config.short}</span>
                <small>{entry ? `${data.professionalName(entry.assessorId)} · ${entry.metCount} de ${entry.applicableCount} itens` : 'Ainda não avaliada'}</small>
              </div>
              <FidelityScore value={entry ? Math.round(entry.scorePercentage) : null} />
              {allowed && (
                <button type="button" className="quiet-button" onClick={() => onEdit(source, entry)}>
                  {entry ? 'Rever' : 'Avaliar'}
                </button>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}

export function FidelityDialog({ session, source, saved, onClose, onDone }) {
  const config = FIDELITY_SOURCES[source];
  const [items, setItems] = useState(() => fidelityDraft(source, saved));
  const [notes, setNotes] = useState(saved?.notes || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const score = fidelityScore(items);
  const changed = JSON.stringify(items) !== JSON.stringify(fidelityDraft(source, saved)) || notes !== (saved?.notes || '');

  const update = (key, patch) => setItems(current => current.map(item => {
    if (item.key !== key) return item;
    const next = { ...item, ...patch };
    return next.applicable ? next : { ...next, met: false };
  }));

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await saveFidelity(session.id, source, items, notes, saved?.revision ?? null);
      onDone();
    } catch (submitError) {
      setError(submitError.message);
      setSaving(false);
    }
  };

  return (
    <AbaDialog title={config.label} busy={saving} guardUnsaved={changed} onClose={onClose}>
      <p className="aba-muted">Toque nos itens cumpridos. O que não se aplicou nesta sessão fica fora da conta.</p>
      <div className="aba-fidelity-items">
        {items.map(item => (
          <div key={item.key} className={`aba-fidelity-item${item.applicable ? '' : ' is-na'}`}>
            <span>{item.label}</span>
            <div className="aba-chip-row">
              <button type="button" className="aba-chip" aria-pressed={item.met} disabled={!item.applicable} onClick={() => update(item.key, { met: !item.met })}>
                <AbaIcon name="check" /> Cumprido
              </button>
              <button type="button" className="aba-chip" aria-pressed={!item.applicable} onClick={() => update(item.key, { applicable: !item.applicable })}>
                Não se aplica
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="aba-fidelity-readout">
        <FidelityScore value={score.percentage} />
        <small>{score.met} de {score.applicable} {score.applicable === 1 ? 'item aplicável' : 'itens aplicáveis'} · mínimo {QUALITY_MINIMUM}%</small>
      </div>
      <label className="aba-field">Observação (opcional)
        <textarea rows={3} value={notes} onChange={event => setNotes(event.target.value)} />
      </label>
      {error && <p className="aba-error" role="alert">{error}</p>}
      <div className="aba-form-actions">
        <button type="button" className="quiet-button" disabled={saving} onClick={onClose}>Cancelar</button>
        <button type="button" className="primary-button" disabled={saving || score.applicable === 0} onClick={() => void submit()}>
          {saving ? 'Salvando...' : 'Salvar fidelidade'}
        </button>
      </div>
    </AbaDialog>
  );
}
