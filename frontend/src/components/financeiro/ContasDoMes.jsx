import { useState } from 'react';
import { saveRecurring, voidExpense } from '../../services/financeiroService';
import {
  FIXED_BILL_TEMPLATE,
  daysBetween,
  formatBRL,
  formatShortDay,
  itemsOfPurchase,
  methodLabel,
  monthOf,
  parseBRLInput,
} from '../../utils/finance';
import { DialogShell, VoidDialog } from './FinanceDialogs';
import { EmptyNote, MoneyInput } from './FinanceFields';
import { PayForm } from './FinanceSaidas';
import { ExpenseReceiptDialog } from './PurchaseReceipt';
import { QuickExpenseForm } from './QuickExpenseForm';

// ============================================================
// Contas do mês (opção A, escolhida em 10/11/2026): cada conta do mês em
// cartão, agrupada pela situação (vencida, vence hoje, a vencer, paga,
// não houve), e o gasto rápido sempre à mão, à direita (no celular,
// embaixo). Conta pela data do serviço: a conta fixa entra no mês do
// vencimento. Toda saída paga tem comprovante de despesa numerado.
// ============================================================

const GROUPS = [
  { id: 'late', label: 'Vencida', plural: 'Vencidas', tone: 'late' },
  { id: 'today', label: 'Vence hoje', plural: 'Vencem hoje', tone: 'today' },
  { id: 'upcoming', label: 'A vencer', plural: 'A vencer', tone: 'next' },
  { id: 'paid', label: 'Paga', plural: 'Pagas', tone: 'ok' },
];

function plural(count, one, many) {
  return `${count} ${count === 1 ? one : many}`;
}

function cardLine(item, today) {
  if (item.status === 'paid') {
    const expense = item.expense;
    return `Paga ${formatShortDay(expense.paid_on)} · ${methodLabel(expense.method)}`;
  }
  const day = `dia ${formatShortDay(item.dueOn)}`;
  const planned = item.amountCents != null && item.varies ? 'previsto · ' : '';
  if (item.status === 'late') {
    const days = daysBetween(item.dueOn, today);
    return `${planned}venceu ${day.replace('dia ', '')}, há ${plural(days, 'dia', 'dias')}`;
  }
  return `${planned}${day}`;
}

function BillCard({ item, today, onPay, onReceipt }) {
  const paid = item.status === 'paid';
  return (
    <article className={`fin-bill fin-bill--${item.status}`}>
      <h4 className="fin-bill-name">{item.description}</h4>
      <p className="fin-bill-value fin-num">
        {item.amountCents != null ? formatBRL(item.amountCents) : 'valor muda'}
      </p>
      <p className="fin-bill-line">{cardLine(item, today)}</p>
      <div className="fin-bill-foot">
        {paid && item.expense?.receipt_number ? (
          <>
            <span className="fin-bill-receipt fin-num">Nº {item.expense.receipt_number}</span>
            <button type="button" className="gt-btn gt-btn--sm" onClick={() => onReceipt(item.expense)}>Comprovante</button>
          </>
        ) : paid ? (
          <span className="fin-bill-receipt">pago antes dos comprovantes</span>
        ) : (
          <>
            <span />
            <button
              type="button"
              className={`gt-btn gt-btn--sm${item.status === 'upcoming' ? '' : ' gt-btn--primary'}`}
              onClick={() => onPay(item)}
            >
              Pagar
            </button>
          </>
        )}
      </div>
    </article>
  );
}

/** Primeira vez: as contas da planilha da clínica, a administração põe valor e dia. */
function TemplateDialog({ fin, onClose }) {
  const existing = new Set(fin.data.recurring.map(row => row.description.trim().toLowerCase()));
  const [rows, setRows] = useState(() => FIXED_BILL_TEMPLATE
    .filter(row => !existing.has(row.name.toLowerCase()))
    .map(row => ({ ...row, on: !row.off, amount: '', day: '', varies: Boolean(row.varies) })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const chosen = rows.filter(row => row.on);
  const badDay = chosen.find(row => !(Number(row.day) >= 1 && Number(row.day) <= 31));
  const badAmount = chosen.find(row => row.amount.trim() && !(parseBRLInput(row.amount) > 0));
  const valid = chosen.length > 0 && !badDay && !badAmount;
  const set = (index, patch) => setRows(list => list.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  function categoryFor(name) {
    const active = fin.data.categories.filter(row => row.active && row.system_key !== 'avulsa');
    return (active.find(row => row.name === name) || active.find(row => !row.system_key) || active[0])?.id;
  }

  async function save() {
    setBusy(true);
    setError('');
    const startsOn = monthOf(fin.today).from;
    let saved = 0;
    try {
      for (const row of chosen) {
        const cents = parseBRLInput(row.amount);
        await saveRecurring({
          description: row.name,
          category_id: categoryFor(row.category),
          amount_cents: cents > 0 ? cents : null,
          amount_varies: row.varies || !(cents > 0),
          frequency: 'monthly',
          day_of_month: Number(row.day),
          weekday: null,
          starts_on: startsOn,
          active: true,
        });
        saved += 1;
      }
      fin.notify(`${plural(saved, 'conta fixa criada', 'contas fixas criadas')}.`);
      fin.reload();
      onClose();
    } catch (err) {
      setError(`${saved ? `${plural(saved, 'conta salva', 'contas salvas')}; ` : ''}${err.message}`);
      if (saved) fin.reload();
      setBusy(false);
    }
  }

  return (
    <DialogShell
      title="Contas fixas da planilha"
      onClose={onClose}
      busy={busy}
      footer={(
        <>
          <button type="button" className="gt-btn" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="button" className="gt-btn gt-btn--primary" onClick={save} disabled={!valid || busy}>
            {busy ? 'Salvando…' : `Criar ${plural(chosen.length, 'conta', 'contas')}`}
          </button>
        </>
      )}
    >
      <p className="fin-dialog-text">
        Marque as contas que a clínica paga todo mês e diga o dia do vencimento. O valor é opcional: em conta que muda (luz, água), ele vira a previsão e o valor certo entra na hora de pagar.
      </p>
      {rows.length === 0 ? <EmptyNote>Todas as contas da planilha já estão cadastradas.</EmptyNote> : (
        <div className="fin-template">
          {rows.map((row, index) => (
            <div key={row.name} className={`fin-template-row${row.on ? '' : ' fin-template-row--off'}`}>
              <label className="fin-toggle" htmlFor={`fin-tpl-on-${index}`}>
                <input id={`fin-tpl-on-${index}`} type="checkbox" checked={row.on} onChange={event => set(index, { on: event.target.checked })} />
                <b>{row.name}</b>
              </label>
              <MoneyInput id={`fin-tpl-amount-${index}`} ariaLabel={`Valor de ${row.name}`} value={row.amount} onChange={amount => set(index, { amount })} disabled={!row.on} placeholder="opcional" />
              <input
                id={`fin-tpl-day-${index}`}
                className="gt-select fin-small-input"
                inputMode="numeric"
                aria-label={`Dia do vencimento de ${row.name}`}
                placeholder="dia"
                value={row.day}
                disabled={!row.on}
                onChange={event => set(index, { day: event.target.value.replace(/\D/g, '').slice(0, 2) })}
              />
              <label className="fin-toggle" htmlFor={`fin-tpl-varies-${index}`}>
                <input id={`fin-tpl-varies-${index}`} type="checkbox" checked={row.varies} disabled={!row.on} onChange={event => set(index, { varies: event.target.checked })} />
                muda todo mês
              </label>
              {row.off && <small className="fin-template-note">Quem recebe por repasse já aparece em Equipe e repasses. Marque só se for valor fixo.</small>}
            </div>
          ))}
        </div>
      )}
      {badDay && <p className="fin-hint fin-hint--warn">Falta o dia do vencimento (1 a 31) de {badDay.name}.</p>}
      {badAmount && <p className="fin-hint fin-hint--warn">O valor de {badAmount.name} não está certo.</p>}
      {error && <p className="gt-notice gt-notice-error" role="alert">{error}</p>}
    </DialogShell>
  );
}

function PayDialog({ fin, item, onClose }) {
  return (
    <DialogShell title={`Pagar · ${item.description}`} onClose={onClose} guard={false} footer={null}>
      <p className="fin-dialog-text">
        Vencimento {formatShortDay(item.dueOn)}.
        {item.varies && item.amountCents != null ? ` Previsto ${formatBRL(item.amountCents)}: escreva o valor que veio na conta.` : ''}
        {item.varies && item.amountCents == null ? ' Escreva o valor que veio na conta.' : ''}
      </p>
      <PayForm fin={fin} item={item} onDone={onClose} />
      <p className="fin-hint">Ao pagar, sai o comprovante de despesa com número.</p>
    </DialogShell>
  );
}

export function ContasDoMes({ fin }) {
  const [paying, setPaying] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [voiding, setVoiding] = useState(null);
  const [templateOpen, setTemplateOpen] = useState(false);
  // Mesma conta do quadro do Resumo (FinanceiroScreen → buildMonthBills).
  const bills = fin.bills;
  const payouts = fin.payables.filter(item => item.kind === 'payout');
  const payoutCents = payouts.reduce((total, item) => total + item.amountCents, 0);
  const members = fin.data.members.filter(member => member.is_active !== false);
  const hasRecurring = fin.data.recurring.some(row => row.active !== false);
  const canQuick = fin.today >= fin.month.from;
  const memberName = id => fin.membersById.get(id)?.full_name || '';

  function openReceipt(expense) {
    setReceipt({
      ...expense,
      recorded_by_name: memberName(expense.recorded_by),
      items: expense.is_purchase ? itemsOfPurchase(fin.data.purchaseItems, expense.id) : [],
    });
  }

  return (
    <section className="fin-section fin-bills-screen">
      <p className="fin-basis">
        <span className="fin-basis-tag">Em teste</span>
        Conta pela data do serviço: a conta fixa entra no mês do vencimento, mesmo paga em outro mês; gasto rápido e compra, no dia em que foram pagos.
      </p>

      <div className="fin-bill-tiles">
        <div className="fin-bill-tile">
          <small>Contas fixas{bills.items.some(item => item.varies && item.status !== 'paid') ? ' (previsto)' : ''}</small>
          <b className="fin-num">{formatBRL(bills.fixedCents)}</b>
        </div>
        <div className="fin-bill-tile">
          <small>Gastos rápidos e compras</small>
          <b className="fin-num">{formatBRL(bills.quickCents)}</b>
        </div>
        <div className="fin-bill-tile">
          <small>Já pago</small>
          <b className="fin-num">{formatBRL(bills.paidCents)}</b>
        </div>
        <div className="fin-bill-tile fin-bill-tile--main">
          <small>Falta pagar</small>
          <b className="fin-num">{formatBRL(bills.openCents)}</b>
          {bills.openWithoutAmount > 0 && <span>+ {plural(bills.openWithoutAmount, 'conta', 'contas')} sem valor ainda</span>}
        </div>
      </div>
      <div className="fin-bill-progress">
        <span className="fin-num">{bills.paidPercent}% do mês pago</span>
        <div className="fin-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={bills.paidPercent} aria-label="Quanto do mês já foi pago">
          <i style={{ width: `${bills.paidPercent}%` }} />
        </div>
      </div>

      <div className="fin-bills-body">
        <div className="fin-bills-groups">
          {!hasRecurring && (
            <div className="fin-card fin-start">
              <h3>Comece pelas contas da planilha</h3>
              <p>Aluguel, energia, água, internet, contabilidade e as outras 12 da planilha da clínica: marque as que valem, diga o dia e o valor, e elas aparecem aqui todo mês.</p>
              <div className="fin-actions">
                <button type="button" className="gt-btn gt-btn--primary" onClick={() => setTemplateOpen(true)}>Usar a lista da planilha</button>
                <button type="button" className="gt-btn" onClick={() => fin.open('saidasfixas')}>Cadastrar uma por uma</button>
              </div>
            </div>
          )}

          {GROUPS.map(group => {
            const list = bills.groups[group.id];
            if (!list.length) return null;
            return (
              <section key={group.id} className="fin-bill-group" aria-label={group.plural}>
                <h3 className="fin-bill-group-head">
                  <span className={`fin-pill fin-pill--${group.tone}`}>{list.length === 1 ? group.label : group.plural}</span>
                  <span className="fin-num">{plural(list.length, 'conta', 'contas')} · {formatBRL(bills.groupCents[group.id])}</span>
                </h3>
                <div className="fin-bill-cards">
                  {list.map(item => (
                    <BillCard key={item.key} item={item} today={fin.today} onPay={setPaying} onReceipt={openReceipt} />
                  ))}
                </div>
              </section>
            );
          })}

          {bills.groups.skipped.length > 0 && (
            <section className="fin-bill-group" aria-label="Não houve este mês">
              <h3 className="fin-bill-group-head">
                <span className="fin-pill fin-pill--none">Não houve este mês</span>
                <span>{plural(bills.groups.skipped.length, 'conta', 'contas')}</span>
              </h3>
              <p className="fin-hint">{bills.groups.skipped.map(item => item.description).join(' · ')}</p>
            </section>
          )}

          {payouts.length > 0 && (
            <section className="fin-bill-group" aria-label="Repasses da equipe">
              <h3 className="fin-bill-group-head">
                <span className="fin-pill fin-pill--next">Repasses da equipe</span>
                <span className="fin-num">{plural(payouts.length, 'pessoa', 'pessoas')} · {formatBRL(payoutCents)} até agora</span>
              </h3>
              <p className="fin-hint">
                Repasse não entra nas contas acima: é pago em <button type="button" className="fin-link" onClick={() => fin.open('equipe')}>Equipe e repasses</button>.
              </p>
            </section>
          )}

          {hasRecurring && bills.items.length === 0 && <EmptyNote>Nenhuma conta fixa vence em {fin.month.label}.</EmptyNote>}

          {hasRecurring && (
            <div className="fin-actions">
              <button type="button" className="gt-btn gt-btn--sm" onClick={() => fin.open('saidasfixas')}>Cadastrar ou mudar conta fixa</button>
              <button type="button" className="gt-btn gt-btn--sm" onClick={() => setTemplateOpen(true)}>Contas da planilha</button>
            </div>
          )}
        </div>

        <aside className="fin-bills-side">
          {canQuick ? (
            <QuickExpenseForm
              key={fin.month.key}
              today={fin.today}
              members={members}
              selfId={fin.profile?.id}
              onSaved={row => { fin.notify(`Gasto lançado: ${row.description}, comprovante Nº ${row.receipt_number}.`); fin.reload(); openReceipt(row); }}
            />
          ) : (
            <p className="fin-hint">Gasto rápido só se lança até hoje: volte ao mês atual.</p>
          )}

          <div className="fin-quick-feed">
            <h3 className="fin-quick-title">
              Gastos rápidos e compras de {fin.month.label} <span className="fin-num">· {formatBRL(bills.quickCents)}</span>
            </h3>
            {bills.quick.length === 0 ? <p className="fin-hint">Nenhum ainda neste mês.</p> : (
              <ul className="fin-quick-list">
                {bills.quick.map(row => (
                  <li key={row.id} className={row.voided_at ? 'fin-quick-item fin-quick-item--void' : 'fin-quick-item'}>
                    <b>{row.description}</b>
                    <span className="fin-num fin-quick-value">{formatBRL(row.amount_cents)}</span>
                    <span className="fin-quick-meta">
                      {formatShortDay(row.paid_on)}
                      {row.is_purchase ? ' · compra' : memberName(row.paid_by) ? ` · ${memberName(row.paid_by)}` : ''}
                      {` · ${methodLabel(row.method)}`}
                      {row.voided_at ? ` · anulado: ${row.void_reason}` : ''}
                    </span>
                    <span className="fin-quick-actions">
                      <button type="button" className="fin-link" onClick={() => openReceipt(row)}>Nº {row.receipt_number}</button>
                      {!row.voided_at && <button type="button" className="fin-link" onClick={() => setVoiding(row)}>Anular</button>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>

      {paying && <PayDialog fin={fin} item={paying} onClose={() => setPaying(null)} />}
      {receipt && <ExpenseReceiptDialog fin={fin} expense={receipt} items={receipt.items} onClose={() => setReceipt(null)} />}
      {templateOpen && <TemplateDialog fin={fin} onClose={() => setTemplateOpen(false)} />}
      {voiding && (
        <VoidDialog
          title="Anular gasto"
          description={`${voiding.description}, ${formatBRL(voiding.amount_cents)}. O comprovante Nº ${voiding.receipt_number} continua guardado, marcado como anulado.`}
          onClose={() => setVoiding(null)}
          onConfirm={async reason => {
            await voidExpense(voiding.id, reason);
            fin.notify('Gasto anulado.');
            fin.reload();
            setVoiding(null);
          }}
        />
      )}
    </section>
  );
}

