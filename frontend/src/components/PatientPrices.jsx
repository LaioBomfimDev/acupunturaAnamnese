import { useEffect, useState } from 'react';
import { listClinicPrices, listPatientPrices, savePatientPrice } from '../services/financeiroService';
import { DISCIPLINES, getDiscipline } from '../data/disciplines';
import { financeServiceLabel, financeServicesForArea } from '../utils/financeServices';
import { formatBRL, parseBRLInput, resolvePrice } from '../utils/finance';

// ============================================================
// Valor combinado do paciente (11/11/2026): a clínica faz promoção e
// acerta um valor com o paciente (Psicologia é R$ 150, mas fulano paga
// R$ 130). O valor entra sozinho quando o atendimento vira Atendido,
// antes da tabela da área (banco: finance_patient_price, 20261111b).
//
// Só a administração vê e grava este bloco, como o preço de convênio:
// preço de paciente não é dado de cadastro que a equipe inteira lê. A
// ficha só monta o bloco quando isClinicAdmin.
//
// Não se apaga: o combinado que acabou fica desativado, com o histórico.
// ============================================================

const EMPTY = { discipline: '', appointment_type: '', amount: '', note: '' };

/** O que a tabela da instituição cobra hoje pela área e pelo serviço. */
function tablePrice(prices, discipline, type) {
  if (!discipline) return null;
  const institution = (prices || []).filter(row => !row.professional_id && row.active !== false);
  return resolvePrice(institution, { discipline, type: type || 'session' }).cents;
}

function PriceForm({ prices, patientId, onDone, onSaved }) {
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = patch => setForm(value => ({ ...value, ...patch }));
  const cents = parseBRLInput(form.amount);
  const services = form.discipline ? financeServicesForArea(form.discipline) : [];
  const table = tablePrice(prices, form.discipline, form.appointment_type);
  const valid = form.discipline && cents != null && cents >= 0;

  async function save(event) {
    event.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError('');
    try {
      await savePatientPrice({
        patient_id: patientId,
        discipline: form.discipline,
        appointment_type: form.appointment_type || null,
        price_cents: cents,
        note: form.note.trim() || null,
        active: true,
      });
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form className="pf-price-form" onSubmit={save}>
      <div className="cp-form-grid">
        <label className="cp-field">Área
          <select className="cp-input" value={form.discipline} onChange={event => set({ discipline: event.target.value, appointment_type: '' })} required>
            <option value="">Escolha a área</option>
            {DISCIPLINES.map(area => <option key={area.id} value={area.id}>{area.label}</option>)}
          </select>
        </label>
        <label className="cp-field">Serviço
          <select className="cp-input" value={form.appointment_type} onChange={event => set({ appointment_type: event.target.value })} disabled={!form.discipline}>
            <option value="">Todos os serviços da área</option>
            {services.map(service => <option key={service.id} value={service.id}>{service.label}</option>)}
          </select>
        </label>
        <label className="cp-field">Valor que este paciente paga
          <input
            className="cp-input"
            inputMode="decimal"
            autoComplete="off"
            placeholder="Ex.: 130"
            value={form.amount}
            onChange={event => set({ amount: event.target.value })}
            required
          />
        </label>
        <label className="cp-field">Por quê (opcional)
          <input className="cp-input" maxLength={200} placeholder="Ex.: promoção de novembro" value={form.note} onChange={event => set({ note: event.target.value })} />
        </label>
      </div>
      {table != null && (
        <p className="small">
          A tabela da instituição cobra {formatBRL(table)}
          {cents != null && cents !== table ? ` · combinado: ${formatBRL(cents)}` : ''}.
        </p>
      )}
      {form.amount.trim() && cents == null && <p className="cp-notice cp-notice-error" role="alert">Valor inválido. Escreva assim: 130 ou 130,50.</p>}
      {error && <p className="cp-notice cp-notice-error" role="alert">{error}</p>}
      <div className="pf-price-actions">
        <button type="button" className="cp-btn cp-btn--sm" onClick={onDone} disabled={busy}>Cancelar</button>
        <button type="submit" className="cp-btn cp-btn--sm cp-btn--primary" disabled={!valid || busy}>{busy ? 'Salvando…' : 'Salvar valor'}</button>
      </div>
    </form>
  );
}

export function PatientPrices({ patientId }) {
  const [state, setState] = useState({ status: 'loading', rows: [], prices: [], error: '' });
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [rowError, setRowError] = useState('');

  async function load() {
    const [rows, prices] = await Promise.all([listPatientPrices(patientId), listClinicPrices()]);
    setState({ status: 'ready', rows, prices, error: '' });
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([listPatientPrices(patientId), listClinicPrices()])
      .then(([rows, prices]) => { if (!cancelled) setState({ status: 'ready', rows, prices, error: '' }); })
      .catch(err => { if (!cancelled) setState(current => ({ ...current, status: 'error', error: err.message })); });
    return () => { cancelled = true; };
  }, [patientId]);

  async function toggle(row) {
    setBusyId(row.id);
    setRowError('');
    try {
      await savePatientPrice({ id: row.id, active: !row.active });
      await load();
    } catch (err) {
      setRowError(err.message);
    } finally {
      setBusyId('');
    }
  }

  const { rows, prices } = state;
  const live = rows.filter(row => row.active);
  const off = rows.filter(row => !row.active);

  return (
    <section className="pf-card pf-prices" aria-label="Valor combinado">
      <div className="pf-coverage-head">
        <h4>Valor combinado</h4>
        {state.status === 'ready' && !adding && (
          <button type="button" className="cp-btn cp-btn--sm" onClick={() => setAdding(true)}>+ Acrescentar valor</button>
        )}
      </div>

      {state.status === 'loading' && <p className="small">Carregando os valores…</p>}
      {state.status === 'error' && <p className="cp-notice cp-notice-error" role="alert">{state.error}</p>}

      {state.status === 'ready' && live.length === 0 && !adding && (
        <p className="small">Este paciente paga a tabela da instituição. Acrescente um valor só se ele tiver um combinado diferente.</p>
      )}

      {live.length > 0 && (
        <ul className="pf-price-list">
          {live.map(row => {
            const table = tablePrice(prices, row.discipline, row.appointment_type);
            return (
              <li key={row.id} className="pf-price-row">
                <div>
                  <b>{formatBRL(row.price_cents)}</b>
                  <span className="small">
                    {getDiscipline(row.discipline)?.label || row.discipline}
                    {' · '}
                    {row.appointment_type ? financeServiceLabel(row.discipline, row.appointment_type) : 'todos os serviços da área'}
                    {table != null && table !== row.price_cents ? ` · tabela ${formatBRL(table)}` : ''}
                    {row.note ? ` · ${row.note}` : ''}
                  </span>
                </div>
                <button type="button" className="cp-btn cp-btn--sm" disabled={busyId === row.id} onClick={() => toggle(row)}>
                  {busyId === row.id ? 'Salvando…' : 'Desativar'}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {adding && <PriceForm prices={prices} patientId={patientId} onDone={() => setAdding(false)} onSaved={() => { setAdding(false); load().catch(err => setRowError(err.message)); }} />}
      {rowError && <p className="cp-notice cp-notice-error" role="alert">{rowError}</p>}

      {live.length > 0 && (
        <p className="small pf-price-note">
          Vale para o atendimento avulso, do próximo em diante: cobrança já gravada não muda.
          Pacote tem total próprio e convênio usa o preço da operadora.
        </p>
      )}

      {off.length > 0 && (
        <p className="small">
          Desativados: {off.map(row => `${formatBRL(row.price_cents)} em ${getDiscipline(row.discipline)?.label || row.discipline}`).join(', ')}.
        </p>
      )}
    </section>
  );
}
