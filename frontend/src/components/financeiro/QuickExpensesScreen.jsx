import { useEffect, useState } from 'react';
import { listQuickExpenses } from '../../services/financeiroService';
import { listClinicMembers } from '../../services/clinicMembersService';
import { formatBRL, formatShortDay, methodLabel, monthOf, shiftMonth, todayInClinic } from '../../utils/finance';
import { ExpenseReceiptDialog } from './PurchaseReceipt';
import { QuickExpenseForm } from './QuickExpenseForm';
import '../../styles/gestao.css';
import '../../styles/financeiro.css';

// ============================================================
// Gastos rápidos da recepção (20261110b): a recepção lança o gasto e vê
// os gastos rápidos de toda a equipe, sem o resto do Financeiro. Anular
// é só da administração (Financeiro → Contas do mês).
// ============================================================

export function QuickExpensesScreen({ profile }) {
  const [today] = useState(() => todayInClinic());
  const [month, setMonth] = useState(() => monthOf(todayInClinic()));
  // Linhas de qual mês e recarga: trocou o mês, mostra "Carregando…" até chegar.
  const [loaded, setLoaded] = useState({ key: '', rows: [] });
  const [members, setMembers] = useState([]);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [receipt, setReceipt] = useState(null);

  useEffect(() => {
    let cancelled = false;
    listClinicMembers()
      .then(list => { if (!cancelled) setMembers((list || []).filter(member => member.is_active !== false)); })
      .catch(() => { if (!cancelled) setMembers([]); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const key = `${month.key}:${reloadKey}`;
    listQuickExpenses(month.from, month.to)
      .then(list => { if (!cancelled) { setLoaded({ key, rows: list }); setError(''); } })
      .catch(err => { if (!cancelled) { setLoaded({ key, rows: [] }); setError(err.message || 'Não foi possível carregar os gastos.'); } });
    return () => { cancelled = true; };
  }, [month, reloadKey]);

  const rows = loaded.key === `${month.key}:${reloadKey}` ? loaded.rows : null;

  const live = (rows || []).filter(row => !row.voided_at);
  const total = live.reduce((sum, row) => sum + row.amount_cents, 0);
  const isCurrent = today >= month.from && today <= month.to;

  return (
    <div className="gt fin fin-quick-screen">
      <div className="fin-quick-screen-head">
        <div>
          <h2 className="fin-quick-screen-title">Gastos rápidos</h2>
          <p className="fin-hint">Água, lanche, almoço do time, um conserto: lance o gasto e o comprovante sai com número, no papel timbrado.</p>
        </div>
        <div className="gt-period-nav" role="group" aria-label="Mês">
          <button type="button" className="gt-period-arrow" aria-label="Mês anterior" onClick={() => setMonth(current => shiftMonth(current, -1))}>‹</button>
          <span className="gt-period-label fin-month">{month.label.charAt(0).toUpperCase() + month.label.slice(1)}</span>
          <button type="button" className="gt-period-arrow" aria-label="Próximo mês" onClick={() => setMonth(current => shiftMonth(current, 1))}>›</button>
        </div>
      </div>

      <div className="fin-bills-body">
        <div className="fin-quick-feed">
          <h3 className="fin-quick-title">
            {month.label.charAt(0).toUpperCase() + month.label.slice(1)} <span className="fin-num">· {formatBRL(total)}</span>
          </h3>
          {error && <p className="gt-notice gt-notice-error" role="alert">{error}</p>}
          {rows === null ? <p className="gt-empty">Carregando…</p> : rows.length === 0 ? <p className="gt-empty">Nenhum gasto rápido neste mês.</p> : (
            <ul className="fin-quick-list">
              {rows.map(row => (
                <li key={row.id} className={row.voided_at ? 'fin-quick-item fin-quick-item--void' : 'fin-quick-item'}>
                  <b>{row.description}</b>
                  <span className="fin-num fin-quick-value">{formatBRL(row.amount_cents)}</span>
                  <span className="fin-quick-meta">
                    {formatShortDay(row.paid_on)}
                    {row.paid_by_name ? ` · pagou ${row.paid_by_name}` : ''}
                    {` · ${methodLabel(row.method)}`}
                    {row.recorded_by_name && row.recorded_by_name !== row.paid_by_name ? ` · lançou ${row.recorded_by_name}` : ''}
                    {row.voided_at ? ` · anulado: ${row.void_reason}` : ''}
                  </span>
                  <span className="fin-quick-actions">
                    <button type="button" className="fin-link" onClick={() => setReceipt(row)}>Comprovante Nº {row.receipt_number}</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="fin-hint">Lançou errado? Peça à administração para anular: o comprovante fica guardado, marcado como anulado.</p>
        </div>

        <aside className="fin-bills-side">
          {isCurrent ? (
            <QuickExpenseForm
              today={today}
              members={members}
              selfId={profile?.id}
              idPrefix="rec-quick"
              onSaved={row => { setReloadKey(key => key + 1); setReceipt({ ...row, paid_by_name: members.find(member => member.id === row.paid_by)?.full_name || '', recorded_by_name: profile?.full_name || '' }); }}
            />
          ) : (
            <p className="fin-hint">Para lançar, volte ao mês atual.</p>
          )}
        </aside>
      </div>

      {receipt && <ExpenseReceiptDialog fin={{ profile }} expense={receipt} onClose={() => setReceipt(null)} />}
    </div>
  );
}

export default QuickExpensesScreen;
