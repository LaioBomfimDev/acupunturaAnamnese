import { useState } from 'react';
import { PREFERENCES, REINFORCER_CATEGORIES } from '../../utils/aba/mapping.js';
import { reviewBehavior, saveBehavior, saveReinforcer } from '../../services/abaService';
import { AbaDialog } from './AbaDialog';
import { AbaIcon } from './AbaIcon';

// ============================================================
// Repertório do paciente: reforçadores (preferências) e comportamentos
// interferentes (definição operacional, hipótese funcional e orientação
// de segurança). Qualquer pessoa do time cadastra; comportamento cadastrado
// por terapeuta entra como "revisão pendente" até a supervisão aprovar.
// Hipótese funcional + plano de segurança é o que libera procedimento
// restrito no programa.
// ============================================================

const BEHAVIOR_MEASURES = ['Frequência', 'Duração', 'Latência', 'Intensidade'];
const INTENSITY_SCALE = Array.from({ length: 11 }, (_, value) => String(value));

function ReinforcerForm({ initial, patientId, onClose, onSaved }) {
  const [form, setForm] = useState(() => initial || { name: '', category: 'Social', initialPreference: 'Alta', notes: '', active: true });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const submit = async () => {
    if (!form.name.trim()) { setError('Dê um nome ao reforçador.'); return; }
    setSaving(true);
    setError(null);
    try {
      await saveReinforcer(patientId, { ...form, name: form.name.trim() });
      onSaved();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <AbaDialog title={initial ? `Editar reforçador · ${initial.name}` : 'Novo reforçador'} busy={saving} guardUnsaved onClose={onClose}>
      <label className="aba-field">Nome
        <input value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} />
      </label>
      <div className="aba-quick-field">
        <span className="aba-chip-label">Categoria</span>
        <div className="aba-chip-row">
          {REINFORCER_CATEGORIES.map(category => (
            <button key={category} type="button" className="aba-chip" aria-pressed={form.category === category} onClick={() => setForm(current => ({ ...current, category }))}>{category}</button>
          ))}
        </div>
      </div>
      <div className="aba-quick-field">
        <span className="aba-chip-label">Preferência inicial</span>
        <div className="aba-chip-row">
          {PREFERENCES.map(preference => (
            <button key={preference} type="button" className="aba-chip" aria-pressed={form.initialPreference === preference} onClick={() => setForm(current => ({ ...current, initialPreference: preference }))}>{preference}</button>
          ))}
        </div>
      </div>
      <label className="aba-field">Observações
        <textarea rows={3} value={form.notes} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))} />
      </label>
      {initial && (
        <button type="button" className="aba-chip aba-chip--wide" aria-pressed={!form.active} onClick={() => setForm(current => ({ ...current, active: !current.active }))}>
          {form.active ? 'Em uso' : 'Fora de uso (não aparece na coleta)'}
        </button>
      )}
      {error && <p className="aba-error" role="alert">{error}</p>}
      <div className="aba-form-actions">
        <button type="button" className="quiet-button" disabled={saving} onClick={onClose}>Cancelar</button>
        <button type="button" className="primary-button" disabled={saving} onClick={() => void submit()}>{saving ? 'Salvando...' : 'Salvar'}</button>
      </div>
    </AbaDialog>
  );
}

function BehaviorForm({ initial, patientId, onClose, onSaved }) {
  const [form, setForm] = useState(() => initial || {
    name: '', measure: 'Frequência', habitualIntensity: '', operationalDefinition: '',
    functionalHypothesis: '', safetyGuidance: '', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = patch => setForm(current => ({ ...current, ...patch }));
  const submit = async () => {
    if (!form.name.trim() || !form.operationalDefinition.trim()) {
      setError('Nome e definição operacional são obrigatórios.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveBehavior(patientId, form);
      onSaved();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <AbaDialog title={initial ? `Editar comportamento · ${initial.name}` : 'Novo comportamento interferente'} wide busy={saving} guardUnsaved onClose={onClose}>
      <div className="aba-form-grid">
        <label className="aba-field">Nome
          <input value={form.name} onChange={event => set({ name: event.target.value })} />
        </label>
        <div className="aba-field">
          <span className="aba-chip-label">Medida</span>
          <div className="aba-chip-row">
            {BEHAVIOR_MEASURES.map(measure => (
              <button key={measure} type="button" className="aba-chip" aria-pressed={form.measure === measure} onClick={() => set({ measure })}>{measure}</button>
            ))}
          </div>
        </div>
        <label className="aba-field is-full">Definição operacional
          <textarea rows={3} value={form.operationalDefinition} onChange={event => set({ operationalDefinition: event.target.value })} />
        </label>
        <label className="aba-field">Intensidade habitual (0 a 10)
          <select value={form.habitualIntensity} onChange={event => set({ habitualIntensity: event.target.value })}>
            <option value="">Não avaliada</option>
            {INTENSITY_SCALE.map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="aba-field">Hipótese funcional
          <input value={form.functionalHypothesis} placeholder="Acesso, atenção, fuga ou automática" onChange={event => set({ functionalHypothesis: event.target.value })} />
        </label>
        <label className="aba-field is-full">Orientação de segurança
          <textarea rows={3} value={form.safetyGuidance} onChange={event => set({ safetyGuidance: event.target.value })} />
          <small className="aba-hint">Hipótese funcional e orientação de segurança preenchidas liberam um procedimento restrito no programa (com o parecer da supervisão).</small>
        </label>
        <label className="aba-field is-full">Observações
          <textarea rows={2} value={form.notes} onChange={event => set({ notes: event.target.value })} />
        </label>
      </div>
      {error && <p className="aba-error" role="alert">{error}</p>}
      <div className="aba-form-actions">
        <button type="button" className="quiet-button" disabled={saving} onClick={onClose}>Cancelar</button>
        <button type="button" className="primary-button" disabled={saving} onClick={() => void submit()}>{saving ? 'Salvando...' : 'Salvar'}</button>
      </div>
    </AbaDialog>
  );
}

export function AbaRepertoire({ data, onChanged }) {
  const [dialog, setDialog] = useState(null);
  const [error, setError] = useState(null);
  const canSupervise = data.permissions.canSupervise;
  const userId = data.permissions.userId;

  const done = () => { setDialog(null); onChanged?.(); };
  const decide = async (behavior, decision) => {
    setError(null);
    try {
      await reviewBehavior(behavior.id, decision);
      onChanged?.();
    } catch (reviewError) {
      setError(reviewError.message);
    }
  };

  return (
    <div className="aba-page">
      <div className="aba-page-head">
        <div>
          <p className="aba-eyebrow">Repertório</p>
          <h2>Reforçadores e comportamentos</h2>
          <p className="aba-muted">É o que aparece nos botões da coleta: os reforçadores para registrar a entrega e os comportamentos para o registro ABC.</p>
        </div>
      </div>
      {error && <p className="aba-error" role="alert">{error}</p>}
      <div className="aba-two-columns">
        <section className="aba-card">
          <div className="aba-section-head">
            <div><p className="aba-eyebrow">Preferências</p><h3>Reforçadores</h3></div>
            <button type="button" className="quiet-button" onClick={() => setDialog({ type: 'reinforcer' })}><AbaIcon name="plus" /> Adicionar</button>
          </div>
          <div className="aba-program-list">
            {data.reinforcers.map(reinforcer => (
              <article key={reinforcer.id} className={reinforcer.active ? '' : 'is-archived'}>
                <div>
                  <span className="aba-tag">{reinforcer.category} · preferência {reinforcer.initialPreference.toLowerCase()}</span>
                  <h4>{reinforcer.name}</h4>
                  {reinforcer.notes && <p>{reinforcer.notes}</p>}
                </div>
                <div className="aba-program-actions">
                  <span className="aba-status">{reinforcer.active ? 'Em uso' : 'Fora de uso'}</span>
                  {(canSupervise || reinforcer.createdBy === userId) && (
                    <button type="button" className="quiet-button" aria-label={`Editar ${reinforcer.name}`} onClick={() => setDialog({ type: 'reinforcer', item: reinforcer })}><AbaIcon name="pencil" /></button>
                  )}
                </div>
              </article>
            ))}
            {!data.reinforcers.length && <p className="aba-empty">Nenhum reforçador cadastrado.</p>}
          </div>
        </section>

        <section className="aba-card">
          <div className="aba-section-head">
            <div><p className="aba-eyebrow">Definição operacional</p><h3>Comportamentos interferentes</h3></div>
            <button type="button" className="quiet-button" onClick={() => setDialog({ type: 'behavior' })}><AbaIcon name="plus" /> Adicionar</button>
          </div>
          <div className="aba-program-list">
            {data.behaviors.map(behavior => (
              <article key={behavior.id} className={behavior.status === 'inactive' ? 'is-archived' : ''}>
                <div>
                  <span className="aba-tag">{behavior.measure}{behavior.habitualIntensity ? ` · intensidade ${behavior.habitualIntensity}` : ''}</span>
                  <h4>{behavior.name}</h4>
                  <p>{behavior.operationalDefinition}</p>
                  {behavior.functionalHypothesis && <small>Hipótese: {behavior.functionalHypothesis}</small>}
                  {behavior.safetyGuidance && <small>Segurança: {behavior.safetyGuidance}</small>}
                </div>
                <div className="aba-program-actions">
                  {behavior.status === 'pending_review' && <span className="aba-status aba-status--pending_review">Revisão pendente</span>}
                  {behavior.status === 'inactive' && <span className="aba-status">Inativo</span>}
                  {canSupervise && behavior.status === 'pending_review' && (
                    <button type="button" className="primary-button" onClick={() => void decide(behavior, 'approved')}>Aprovar</button>
                  )}
                  {canSupervise && behavior.status === 'approved' && (
                    <button type="button" className="quiet-button" onClick={() => void decide(behavior, 'inactive')}>Inativar</button>
                  )}
                  {(canSupervise || (behavior.createdBy === userId && behavior.status === 'pending_review')) && (
                    <button type="button" className="quiet-button" aria-label={`Editar ${behavior.name}`} onClick={() => setDialog({ type: 'behavior', item: behavior })}><AbaIcon name="pencil" /></button>
                  )}
                </div>
              </article>
            ))}
            {!data.behaviors.length && <p className="aba-empty">Nenhum comportamento cadastrado.</p>}
          </div>
        </section>
      </div>

      {dialog?.type === 'reinforcer' && <ReinforcerForm initial={dialog.item} patientId={data.patientId} onClose={() => setDialog(null)} onSaved={done} />}
      {dialog?.type === 'behavior' && <BehaviorForm initial={dialog.item} patientId={data.patientId} onClose={() => setDialog(null)} onSaved={done} />}
    </div>
  );
}

export default AbaRepertoire;
