import { useState } from 'react';
import { registerQuickExpense } from '../../services/financeiroService';
import { EXPENSE_METHODS, formatBRL, parseBRLInput } from '../../utils/finance';
import { MoneyInput } from './FinanceFields';

// ============================================================
// Gasto rápido (20261110b): água, lanche, almoço do time, conserto.
// Sem categoria: a pessoa escreve o que foi. O banco grava já pago e dá
// o número do comprovante de despesa. O mesmo formulário serve à
// administração (Contas do mês) e à recepção (tela Gastos rápidos).
// ============================================================

/**
 * members: equipe ativa da instituição ({ id, full_name }) para "Quem pagou".
 * onSaved(row): a linha gravada, já com receipt_number.
 */
export function QuickExpenseForm({ today, members = [], selfId, idPrefix = 'fin-quick', onSaved }) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [paidOn, setPaidOn] = useState(today);
  const [paidBy, setPaidBy] = useState(selfId || '');
  const [method, setMethod] = useState('pix');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const cents = parseBRLInput(amount);
  const valid = description.trim().length >= 2 && cents > 0 && paidOn && paidOn <= today && method;
  const payers = members.some(member => member.id === selfId) || !selfId
    ? members
    : [{ id: selfId, full_name: 'Eu' }, ...members];

  async function submit(event) {
    event.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError('');
    setDone('');
    try {
      const row = await registerQuickExpense({
        description: description.trim(),
        amountCents: cents,
        paidOn,
        method,
        paidBy: paidBy || null,
      });
      setDone(`${row.description}: ${formatBRL(row.amount_cents)}, comprovante Nº ${row.receipt_number}.`);
      setDescription('');
      setAmount('');
      onSaved?.(row);
    } catch (err) {
      setError(err.message || 'Não foi possível lançar o gasto.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="fin-quick" onSubmit={submit} aria-labelledby={`${idPrefix}-title`}>
      <h3 id={`${idPrefix}-title`} className="fin-quick-title">Gasto rápido</h3>
      <label className="gt-field" htmlFor={`${idPrefix}-what`}>
        O que foi
        <input
          id={`${idPrefix}-what`}
          className="gt-select"
          maxLength={120}
          placeholder="Ex.: almoço do time, 2 galões de água"
          value={description}
          onChange={event => setDescription(event.target.value)}
        />
      </label>
      <div className="fin-quick-row">
        <label className="gt-field" htmlFor={`${idPrefix}-amount`}>
          Valor
          <MoneyInput id={`${idPrefix}-amount`} value={amount} onChange={setAmount} />
        </label>
        <label className="gt-field" htmlFor={`${idPrefix}-day`}>
          Dia
          <input id={`${idPrefix}-day`} type="date" className="gt-select" value={paidOn} max={today} onChange={event => setPaidOn(event.target.value)} />
        </label>
      </div>
      <div className="fin-quick-row">
        <label className="gt-field" htmlFor={`${idPrefix}-who`}>
          Quem pagou
          <select id={`${idPrefix}-who`} className="gt-select" value={paidBy} onChange={event => setPaidBy(event.target.value)}>
            {payers.map(member => <option key={member.id} value={member.id}>{member.full_name}</option>)}
          </select>
        </label>
        <label className="gt-field" htmlFor={`${idPrefix}-method`}>
          Como pagou
          <select id={`${idPrefix}-method`} className="gt-select" value={method} onChange={event => setMethod(event.target.value)}>
            {EXPENSE_METHODS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>
      </div>
      {error && <p className="gt-notice gt-notice-error" role="alert">{error}</p>}
      {done && <p className="gt-notice fin-flash" role="status">Lançado. {done}</p>}
      <button type="submit" className="gt-btn gt-btn--primary" disabled={!valid || busy}>
        {busy ? 'Lançando…' : 'Lançar e gerar comprovante'}
      </button>
    </form>
  );
}
