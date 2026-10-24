import { useState } from 'react';
import { payExpense, settleRecurring, voidExpense } from '../../services/financeiroService';
import {
  baseRuleOf,
  centsToInput,
  describeRule,
  formatBRL,
  formatShortDay,
  inRange,
  methodLabel,
  parseBRLInput,
  payableMembers,
  payeeName,
} from '../../utils/finance';
import { DueTag, EmptyNote, MethodPicker, MoneyInput } from './FinanceFields';
import { ExpenseDialog, VoidDialog } from './FinanceDialogs';

// ============================================================
// Saídas: A pagar, Pagas e Equipe e repasses.
// ============================================================

function categoryName(fin, id) {
  return fin.categoriesById.get(id)?.name || 'Sem categoria';
}

/** Pagar um vencimento de saída fixa ou uma conta lançada "a pagar". */
function PayForm({ fin, item, onDone }) {
  const [amount, setAmount] = useState(centsToInput(item.amountCents));
  const [paidOn, setPaidOn] = useState(fin.today);
  const [method, setMethod] = useState('pix');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cents = item.kind === 'pending' ? item.amountCents : parseBRLInput(amount);
  const valid = cents > 0 && paidOn && paidOn <= fin.today;

  async function pay(skip = false) {
    setBusy(true);
    setError('');
    try {
      if (item.kind === 'pending') {
        await payExpense(item.expenseId, paidOn, method);
      } else {
        await settleRecurring({ recurringId: item.recurringId, occurrenceOn: item.occurrenceOn, skip, amountCents: cents, paidOn, method });
      }
      fin.notify(skip ? `${item.description} de ${formatShortDay(item.dueOn)} marcada como “não houve”.` : `${item.description} paga: ${formatBRL(cents)}.`);
      fin.reload();
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fin-payform">
      {item.kind !== 'pending' && (
        <label className="gt-field" htmlFor={`fin-pay-${item.key}`}>
          Valor pago
          <MoneyInput id={`fin-pay-${item.key}`} value={amount} onChange={setAmount} />
        </label>
      )}
      <label className="gt-field" htmlFor={`fin-pay-date-${item.key}`}>
        Paga em
        <input id={`fin-pay-date-${item.key}`} type="date" className="gt-select" value={paidOn} max={fin.today} onChange={event => setPaidOn(event.target.value)} />
      </label>
      <MethodPicker value={method} onChange={setMethod} />
      {error && <p className="gt-notice gt-notice-error" role="alert">{error}</p>}
      <div className="fin-actions">
        {item.kind === 'recurring' && (
          <button type="button" className="gt-btn gt-btn--sm" onClick={() => pay(true)} disabled={busy}>Não houve este vencimento</button>
        )}
        <button type="button" className="gt-btn gt-btn--sm" onClick={onDone} disabled={busy}>Fechar</button>
        <button type="button" className="gt-btn gt-btn--sm gt-btn--primary" onClick={() => pay(false)} disabled={!valid || busy}>
          {busy ? 'Salvando…' : `Pagar ${cents > 0 ? formatBRL(cents) : ''}`}
        </button>
      </div>
    </div>
  );
}

const PAYABLE_FILTERS = [
  { id: 'all', label: 'Tudo' },
  { id: 'late', label: 'Em atraso' },
  { id: 'payout', label: 'Repasses' },
  { id: 'bills', label: 'Contas' },
];

export function APagar({ fin }) {
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState('');
  const [expenseDialog, setExpenseDialog] = useState(null);
  const items = fin.payables.filter(item => item.kind === 'payout' || item.dueOn <= fin.month.to);
  const counts = {
    all: items.length,
    late: items.filter(item => item.late).length,
    payout: items.filter(item => item.kind === 'payout').length,
    bills: items.filter(item => item.kind !== 'payout').length,
  };
  const visible = items.filter(item => (filter === 'late' ? item.late
    : filter === 'payout' ? item.kind === 'payout'
      : filter === 'bills' ? item.kind !== 'payout' : true));
  const lookups = { membersById: fin.membersById, peopleById: fin.peopleById };

  function payPayout(item) {
    const name = fin.membersById.get(item.professionalId)?.full_name || 'Profissional';
    setExpenseDialog({
      title: `Pagar repasse · ${name}`,
      categoryId: fin.repasseCategory?.id,
      professionalId: item.professionalId,
      description: `Repasse · ${name}`,
      amountCents: item.amountCents,
    });
  }

  return (
    <section className="fin-section">
      <div className="fin-toolbar">
        <div className="fin-choices" role="group" aria-label="Mostrar">
          {PAYABLE_FILTERS.map(option => (
            <button key={option.id} type="button" className="fin-choice" aria-pressed={filter === option.id} onClick={() => setFilter(option.id)}>
              {option.label} <b className="fin-num">{counts[option.id]}</b>
            </button>
          ))}
        </div>
        <button type="button" className="gt-btn gt-btn--primary" onClick={() => setExpenseDialog({})}>+ Lançar saída</button>
      </div>
      <p className="fin-hint">Até o fim de {fin.month.label}. Saída fixa aparece sozinha no dia; repasse é o que cada profissional tem a receber até agora.</p>
      {visible.length === 0 ? <EmptyNote>{items.length ? 'Nada com esse filtro.' : 'Nada a pagar até o fim do mês.'}</EmptyNote> : (
        <div className="fin-list">
          {visible.map(item => (
            <div key={item.key} className={`fin-group${item.late ? ' fin-group--late' : ''}`}>
              <div className="fin-group-head">
                <div className="fin-row-main">
                  <b>{item.description}</b>
                  <span>
                    {item.kind === 'payout' ? 'Repasse de profissionais' : categoryName(fin, item.categoryId)}
                    {/* Saída fixa de pessoa já leva o nome na descrição. */}
                    {payeeName(item, lookups) && !item.description.includes(payeeName(item, lookups).split(' · ')[0]) ? ` · ${payeeName(item, lookups)}` : ''}
                    {item.kind === 'recurring' ? ' · saída fixa' : ''}
                  </span>
                </div>
                {item.kind === 'payout' ? <span className="gt-badge gt-badge-neutral">até agora</span> : <DueTag dueOn={item.dueOn} today={fin.today} />}
                <b className="fin-num fin-amount">{item.amountCents != null ? formatBRL(item.amountCents) : 'valor muda'}</b>
                {item.kind === 'payout' ? (
                  <button type="button" className="gt-btn gt-btn--sm gt-btn--primary" onClick={() => payPayout(item)}>Pagar repasse</button>
                ) : (
                  <button type="button" className={`gt-btn gt-btn--sm${open === item.key ? '' : ' gt-btn--primary'}`} aria-expanded={open === item.key} onClick={() => setOpen(current => (current === item.key ? '' : item.key))}>
                    {open === item.key ? 'Fechar' : 'Pagar'}
                  </button>
                )}
              </div>
              {open === item.key && <PayForm fin={fin} item={item} onDone={() => setOpen('')} />}
            </div>
          ))}
        </div>
      )}
      {expenseDialog && <ExpenseDialog fin={fin} preset={expenseDialog.title ? expenseDialog : null} onClose={() => setExpenseDialog(null)} />}
    </section>
  );
}

export function Pagas({ fin }) {
  const [showVoided, setShowVoided] = useState(false);
  const [voiding, setVoiding] = useState(null);
  const lookups = { membersById: fin.membersById, peopleById: fin.peopleById };
  const list = fin.data.expenses
    .filter(row => !row.skipped && row.paid_on && inRange(row.paid_on, fin.month) && (showVoided || !row.voided_at))
    .sort((a, b) => b.paid_on.localeCompare(a.paid_on));
  const byCategory = new Map();
  for (const row of list) {
    if (row.voided_at) continue;
    byCategory.set(row.category_id, (byCategory.get(row.category_id) || 0) + row.amount_cents);
  }

  return (
    <section className="fin-section">
      <div className="fin-toolbar">
        <div className="fin-totals">
          {[...byCategory.entries()].sort((a, b) => b[1] - a[1]).map(([id, cents]) => (
            <span key={id} className="fin-total-chip">{categoryName(fin, id)} <b className="fin-num">{formatBRL(cents)}</b></span>
          ))}
          {byCategory.size === 0 && <span className="fin-hint">Nada pago em {fin.month.label}.</span>}
        </div>
        <label className="fin-toggle" htmlFor="fin-show-voided-exp">
          <input id="fin-show-voided-exp" type="checkbox" checked={showVoided} onChange={event => setShowVoided(event.target.checked)} />
          Mostrar anuladas
        </label>
      </div>
      {list.length === 0 ? <EmptyNote>Nenhuma saída paga em {fin.month.label}.</EmptyNote> : (
        <div className="fin-list">
          {list.map(row => (
            <div key={row.id} className={`fin-row${row.voided_at ? ' fin-row--void' : ''}`}>
              <span className="fin-date">{formatShortDay(row.paid_on)}</span>
              <div className="fin-row-main">
                <b>{row.description}</b>
                <span>
                  {categoryName(fin, row.category_id)}
                  {payeeName({ professionalId: row.professional_id, personId: row.person_id }, lookups) ? ` · ${payeeName({ professionalId: row.professional_id, personId: row.person_id }, lookups)}` : ''}
                  {` · ${methodLabel(row.method)}`}
                </span>
                {row.voided_at && <span className="fin-void-reason">Anulada: {row.void_reason}</span>}
              </div>
              <b className="fin-num fin-amount">{formatBRL(row.amount_cents)}</b>
              {!row.voided_at && <button type="button" className="gt-btn gt-btn--sm" onClick={() => setVoiding(row)}>Anular</button>}
            </div>
          ))}
        </div>
      )}
      {voiding && (
        <VoidDialog
          title="Anular saída"
          description={`${voiding.description}, ${formatBRL(voiding.amount_cents)}. Se for saída fixa, o vencimento volta para “A pagar”.`}
          onClose={() => setVoiding(null)}
          onConfirm={async reason => {
            await voidExpense(voiding.id, reason);
            fin.notify('Saída anulada.');
            fin.reload();
            setVoiding(null);
          }}
        />
      )}
    </section>
  );
}

export function Equipe({ fin }) {
  const [expenseDialog, setExpenseDialog] = useState(null);
  const members = payableMembers(fin.data.members);
  const salaryFor = id => fin.data.recurring.find(row => row.professional_id === id && row.active !== false);
  const paidInMonth = ({ professionalId, personId }) => fin.data.expenses
    .filter(row => !row.voided_at && !row.skipped && row.paid_on && inRange(row.paid_on, fin.month)
      && (professionalId ? row.professional_id === professionalId : row.person_id === personId))
    .reduce((total, row) => total + row.amount_cents, 0);
  const basisText = fin.data.settings?.payout_basis === 'on_attendance'
    ? 'O repasse conta quando o atendimento acontece.'
    : 'O repasse conta quando o paciente paga: atendimento ainda não pago não entra no saldo.';

  return (
    <section className="fin-section">
      <p className="fin-hint">{basisText} O saldo junta todos os meses desde o início do financeiro, para nada se perder.</p>
      <div className="fin-table-scroll">
        <table className="fin-table fin-table--cards">
          <thead>
            <tr>
              <th scope="col">Pessoa</th>
              <th scope="col">Como recebe</th>
              <th scope="col" className="fin-num">Atendimentos</th>
              <th scope="col" className="fin-num">Gerado no mês</th>
              <th scope="col" className="fin-num">Pago no mês</th>
              <th scope="col" className="fin-num">Falta repassar</th>
              <th scope="col"><span className="fin-sr">Ação</span></th>
            </tr>
          </thead>
          <tbody>
            {members.map(member => {
              const base = baseRuleOf(fin.data.rules, member.id);
              const overrides = fin.data.rules.filter(row => row.professional_id === member.id && row !== base);
              const payout = fin.payouts.get(member.id);
              const salary = base?.mode === 'salary' ? salaryFor(member.id) : null;
              return (
                <tr key={member.id}>
                  <th scope="row">{member.full_name}</th>
                  <td data-label="Como recebe">
                    {describeRule(base, overrides)}
                    {salary && <small className="fin-cell-note">{formatBRL(salary.amount_cents)} · todo dia {salary.day_of_month}</small>}
                    {!base && (
                      <span className="fin-cell-note">
                        <button type="button" className="fin-link" onClick={() => fin.open('recebimento')}>Configurar</button>
                      </span>
                    )}
                  </td>
                  <td data-label="Atendimentos" className="fin-num">{payout?.monthCount || 0}</td>
                  <td data-label="Gerado no mês" className="fin-num">{formatBRL(payout?.monthGeneratedCents || 0)}</td>
                  <td data-label="Pago no mês" className="fin-num">{formatBRL(paidInMonth({ professionalId: member.id }))}</td>
                  <td data-label="Falta repassar" className="fin-num"><b>{formatBRL(Math.max(0, payout?.balanceCents || 0))}</b></td>
                  <td>
                    {(payout?.balanceCents || 0) > 0 && (
                      <button
                        type="button"
                        className="gt-btn gt-btn--sm gt-btn--primary"
                        onClick={() => setExpenseDialog({
                          title: `Pagar repasse · ${member.full_name}`,
                          categoryId: fin.repasseCategory?.id,
                          professionalId: member.id,
                          description: `Repasse · ${member.full_name}`,
                          amountCents: payout.balanceCents,
                        })}
                      >
                        Pagar repasse
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {fin.data.people.filter(row => row.active).map(person => (
              <tr key={person.id}>
                <th scope="row">{person.name}{person.role_label ? <small className="fin-cell-note">{person.role_label} · sem login</small> : <small className="fin-cell-note">sem login</small>}</th>
                <td data-label="Como recebe">{fin.data.recurring.filter(row => row.person_id === person.id && row.active !== false).map(row => `${formatBRL(row.amount_cents)} ${row.frequency === 'monthly' ? `todo dia ${row.day_of_month}` : 'por semana'}`).join(' · ') || 'Por serviço'}</td>
                <td data-label="Atendimentos" className="fin-num">–</td>
                <td data-label="Gerado no mês" className="fin-num">–</td>
                <td data-label="Pago no mês" className="fin-num">{formatBRL(paidInMonth({ personId: person.id }))}</td>
                <td data-label="Falta repassar" className="fin-num">–</td>
                <td>
                  <button type="button" className="gt-btn gt-btn--sm" onClick={() => setExpenseDialog({ title: `Pagar · ${person.name}`, categoryId: fin.salaryCategory?.id, personId: person.id, description: person.role_label ? `${person.role_label} · ${person.name}` : person.name })}>
                    Lançar pagamento
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {expenseDialog && <ExpenseDialog fin={fin} preset={expenseDialog} onClose={() => setExpenseDialog(null)} />}
    </section>
  );
}
