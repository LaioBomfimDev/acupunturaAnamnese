import { useEffect, useState } from 'react';
import {
  listConvenioChoices,
  listPatientCoverages,
  savePatientCoverage,
} from '../services/convenioService';
import { CARD_PATTERN, CNS_PATTERN, coverageExpired, onlyDigits } from '../utils/convenio';
import { formatDay, todayInClinic } from '../utils/finance';

// ============================================================
// Convênio do paciente (Fase 1 dos convênios, 31/10/2026): operadora,
// plano, carteira, validade e CNS, escolhidos das operadoras que a
// administração cadastrou em Financeiro → Operadoras. Quem edita o
// cadastro do paciente (administração, recepção, quem atende) grava.
// Não se apaga: convênio que acabou fica desativado, com o histórico.
// Os campos de texto antigos (convenio_nome / convenio_carteirinha)
// só aparecem como anotação, quando existirem.
// ============================================================

const EMPTY = { convenio_id: '', plan_id: '', card_number: '', card_valid_until: '', cns: '' };

function CoverageForm({ choices, coverage, patientId, onDone, onSaved }) {
  const [form, setForm] = useState(() => (coverage ? {
    convenio_id: coverage.convenio_id,
    plan_id: coverage.plan_id || '',
    card_number: coverage.card_number,
    card_valid_until: coverage.card_valid_until || '',
    cns: coverage.cns || '',
  } : EMPTY));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = patch => setForm(value => ({ ...value, ...patch }));
  const plans = choices.plans.filter(plan => plan.convenio_id === form.convenio_id);
  const cardOk = CARD_PATTERN.test(form.card_number.trim());
  const cnsDigits = onlyDigits(form.cns);
  const cnsOk = !cnsDigits || CNS_PATTERN.test(cnsDigits);
  const valid = form.convenio_id && cardOk && cnsOk;

  async function save(event) {
    event.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError('');
    try {
      await savePatientCoverage({
        ...(coverage ? { id: coverage.id } : { patient_id: patientId }),
        convenio_id: form.convenio_id,
        plan_id: form.plan_id || null,
        card_number: form.card_number.trim(),
        card_valid_until: form.card_valid_until || null,
        cns: cnsDigits,
      });
      await onSaved();
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="pf-coverage-form" onSubmit={save}>
      <div className="cp-form-grid">
        <label className="cp-field">Operadora
          <select className="cp-input" value={form.convenio_id} onChange={event => set({ convenio_id: event.target.value, plan_id: '' })} required>
            <option value="">Escolha</option>
            {choices.convenios.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
          </select>
        </label>
        <label className="cp-field">Plano
          <select className="cp-input" value={form.plan_id} onChange={event => set({ plan_id: event.target.value })} disabled={!plans.length}>
            <option value="">{plans.length ? 'Escolha' : 'Operadora sem planos'}</option>
            {plans.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
          </select>
        </label>
        <label className="cp-field">Número da carteira
          <input className="cp-input" maxLength={20} value={form.card_number} onChange={event => set({ card_number: event.target.value })} required />
        </label>
        <label className="cp-field">Validade da carteira
          <input className="cp-input" type="date" value={form.card_valid_until} onChange={event => set({ card_valid_until: event.target.value })} />
        </label>
        <label className="cp-field">Cartão Nacional de Saúde (CNS)
          <input className="cp-input" inputMode="numeric" maxLength={18} placeholder="opcional, 15 números" value={form.cns} onChange={event => set({ cns: event.target.value })} />
        </label>
      </div>
      {form.card_number.trim() && !cardOk && <p className="cp-notice cp-notice-warn">A carteira tem até 20 letras ou números.</p>}
      {!cnsOk && <p className="cp-notice cp-notice-warn">O CNS tem 15 números.</p>}
      {error && <p className="cp-notice cp-notice-error" role="alert">{error}</p>}
      <div className="pf-coverage-actions">
        <button type="button" className="cp-btn cp-btn--sm" onClick={onDone} disabled={busy}>Cancelar</button>
        <button type="submit" className="cp-btn cp-btn--sm cp-btn--primary" disabled={busy || !valid}>{busy ? 'Salvando…' : 'Salvar convênio'}</button>
      </div>
    </form>
  );
}

export function PatientCoverages({ patientId, legacyName = '', legacyCard = '' }) {
  const [state, setState] = useState({ status: 'loading', coverages: [], choices: { convenios: [], plans: [] }, error: '' });
  const [editing, setEditing] = useState(null);
  const [busyId, setBusyId] = useState('');
  const [rowError, setRowError] = useState('');
  const today = todayInClinic();

  async function load() {
    try {
      const [coverages, choices] = await Promise.all([listPatientCoverages(patientId), listConvenioChoices()]);
      setState({ status: 'ready', coverages, choices, error: '' });
    } catch (err) {
      setState(current => ({ ...current, status: 'error', error: err.message }));
    }
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([listPatientCoverages(patientId), listConvenioChoices()])
      .then(([coverages, choices]) => { if (!cancelled) setState({ status: 'ready', coverages, choices, error: '' }); })
      .catch(err => { if (!cancelled) setState(current => ({ ...current, status: 'error', error: err.message })); });
    return () => { cancelled = true; };
  }, [patientId]);

  async function toggle(coverage) {
    setBusyId(coverage.id);
    setRowError('');
    try {
      await savePatientCoverage({ id: coverage.id, active: !coverage.active });
      await load();
    } catch (err) {
      setRowError(err.message);
    } finally {
      setBusyId('');
    }
  }

  const { coverages, choices } = state;
  // Operadora desativada continua com o nome na linha do paciente.
  const names = new Map(choices.convenios.map(row => [row.id, row.name]));
  const planNames = new Map(choices.plans.map(row => [row.id, row.name]));
  const noOperators = state.status === 'ready' && choices.convenios.length === 0;

  return (
    <section className="pf-card pf-coverages" aria-label="Convênio">
      <div className="pf-coverage-head">
        <h4>Convênio</h4>
        {state.status === 'ready' && !noOperators && editing !== 'new' && (
          <button type="button" className="cp-btn cp-btn--sm" onClick={() => setEditing('new')}>+ Acrescentar convênio</button>
        )}
      </div>

      {state.status === 'loading' && <p className="small">Carregando o convênio…</p>}
      {state.status === 'error' && <p className="cp-notice cp-notice-error" role="alert">{state.error}</p>}
      {(legacyName || legacyCard) && (
        <p className="small pf-coverage-legacy">Anotado antes no cadastro: {[legacyName, legacyCard && `carteirinha ${legacyCard}`].filter(Boolean).join(' · ')}</p>
      )}
      {state.status === 'ready' && coverages.length === 0 && editing !== 'new' && (
        <p className="small">
          {noOperators
            ? 'Particular. Para cadastrar convênio, a administração cadastra a operadora antes, em Financeiro → Operadoras.'
            : 'Particular: nenhum convênio cadastrado.'}
        </p>
      )}

      {coverages.length > 0 && (
        <ul className="pf-coverage-list">
          {coverages.map(coverage => (editing?.id === coverage.id ? (
            <li key={coverage.id}>
              <CoverageForm choices={choices} coverage={coverage} patientId={patientId} onDone={() => setEditing(null)} onSaved={load} />
            </li>
          ) : (
            <li key={coverage.id} className={coverage.active ? '' : 'is-inactive'}>
              <div className="pf-coverage-main">
                <b>{names.get(coverage.convenio_id) || 'Operadora desativada'}{coverage.plan_id && planNames.get(coverage.plan_id) ? ` · ${planNames.get(coverage.plan_id)}` : ''}</b>
                <span>
                  Carteira {coverage.card_number}
                  {coverage.card_valid_until ? ` · válida até ${formatDay(coverage.card_valid_until)}` : ''}
                  {coverage.cns ? ` · CNS ${coverage.cns}` : ''}
                </span>
              </div>
              {!coverage.active
                ? <span className="cp-badge cp-badge-off">Desativado</span>
                : coverageExpired(coverage, today) && <span className="cp-badge pf-coverage-expired">Carteira vencida</span>}
              <span className="pf-coverage-actions">
                {coverage.active && <button type="button" className="cp-btn cp-btn--sm" onClick={() => setEditing(coverage)}>Mudar</button>}
                <button type="button" className="cp-btn cp-btn--sm" disabled={busyId === coverage.id} onClick={() => toggle(coverage)}>
                  {coverage.active ? 'Desativar' : 'Ativar'}
                </button>
              </span>
            </li>
          )))}
        </ul>
      )}
      {rowError && <p className="cp-notice cp-notice-error" role="alert">{rowError}</p>}
      {editing === 'new' && (
        <CoverageForm choices={choices} coverage={null} patientId={patientId} onDone={() => setEditing(null)} onSaved={load} />
      )}
    </section>
  );
}

export default PatientCoverages;
