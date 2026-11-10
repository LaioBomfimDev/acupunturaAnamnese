import { useState } from 'react';
import { registerPurchase } from '../../services/financeiroService';
import {
  formatBRL,
  parseBRLInput,
  parseQuantityInput,
  purchaseItemTotal,
} from '../../utils/finance';
import { MethodPicker, MoneyInput } from './FinanceFields';
import { DialogShell } from './FinanceDialogs';
import { PurchaseReceiptDialog } from './PurchaseReceipt';

// ============================================================
// Registrar compra (06/11/2026): água, almoço da equipe, material…
// Uma compra tem 1 a 50 itens e sai já paga; o recibo interno numerado
// vem logo depois de gravar. Não se edita: errou, anula e lança de novo.
// ============================================================

const MAX_ITEMS = 50;
let nextKey = 0;

function emptyItem() {
  nextKey += 1;
  return { key: nextKey, description: '', quantity: '1', unit: '' };
}

function parsedItem(item) {
  const quantityThousandths = parseQuantityInput(item.quantity);
  const unitCents = parseBRLInput(item.unit);
  const description = item.description.trim();
  const valid = Boolean(description) && description.length <= 120 && quantityThousandths !== null && unitCents !== null;
  return { description, quantityThousandths, unitCents, valid };
}

export function PurchaseDialog({ fin, onClose }) {
  const categories = fin.data.categories.filter(row => row.active && row.system_key !== 'avulsa');
  const [categoryId, setCategoryId] = useState(() => (categories.find(row => !row.system_key) || categories[0])?.id || '');
  const [paidOn, setPaidOn] = useState(fin.today);
  const [method, setMethod] = useState('pix');
  const [payee, setPayee] = useState('');
  const [note, setNote] = useState('');
  const [items, setItems] = useState(() => [emptyItem()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);

  const parsed = items.map(parsedItem);
  const total = parsed.reduce((sum, item) => sum + (item.valid ? purchaseItemTotal(item) : 0), 0);
  const valid = categoryId && paidOn && paidOn <= fin.today && parsed.every(item => item.valid) && total > 0;

  const update = (key, patch) => setItems(current => current.map(item => (item.key === key ? { ...item, ...patch } : item)));

  async function save() {
    setBusy(true);
    setError('');
    try {
      const row = await registerPurchase({
        categoryId,
        paidOn,
        method,
        professionalId: payee.startsWith('p:') ? payee.slice(2) : null,
        personId: payee.startsWith('x:') ? payee.slice(2) : null,
        note: note.trim(),
        items: parsed,
      });
      fin.notify(`Compra registrada: ${formatBRL(row.amount_cents)}, recibo Nº ${row.receipt_number}.`);
      fin.reload();
      setDone({
        expense: row,
        items: parsed.map((item, index) => ({
          position: index + 1,
          description: item.description,
          quantity: item.quantityThousandths / 1000,
          unit_cents: item.unitCents,
          total_cents: purchaseItemTotal(item),
        })),
      });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  if (done) return <PurchaseReceiptDialog fin={fin} expense={done.expense} items={done.items} onClose={onClose} />;

  return (
    <DialogShell
      title="Registrar compra"
      onClose={onClose}
      busy={busy}
      footer={(
        <>
          <button type="button" className="gt-btn" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="button" className="gt-btn gt-btn--primary" onClick={save} disabled={!valid || busy}>
            {busy ? 'Salvando…' : `Registrar ${total > 0 ? formatBRL(total) : ''}`.trim()}
          </button>
        </>
      )}
    >
      <fieldset className="fin-purchase-items">
        <legend>O que foi comprado</legend>
        {items.map((item, index) => {
          const line = parsed[index];
          return (
            <div key={item.key} className="fin-purchase-item">
              <label className="gt-field fin-purchase-desc" htmlFor={`fin-pu-desc-${item.key}`}>
                {index === 0 ? 'Item' : null}
                <input
                  id={`fin-pu-desc-${item.key}`}
                  className="gt-select"
                  aria-label={`Item ${index + 1}`}
                  value={item.description}
                  maxLength={120}
                  placeholder="Ex.: Galão de água 20 L"
                  onChange={event => update(item.key, { description: event.target.value })}
                />
              </label>
              <label className="gt-field fin-purchase-qty" htmlFor={`fin-pu-qty-${item.key}`}>
                {index === 0 ? 'Qtd.' : null}
                <input
                  id={`fin-pu-qty-${item.key}`}
                  className="gt-select"
                  inputMode="decimal"
                  autoComplete="off"
                  aria-label={`Quantidade do item ${index + 1}`}
                  value={item.quantity}
                  onChange={event => update(item.key, { quantity: event.target.value })}
                />
              </label>
              <label className="gt-field fin-purchase-unit" htmlFor={`fin-pu-unit-${item.key}`}>
                {index === 0 ? 'Valor de cada' : null}
                <MoneyInput id={`fin-pu-unit-${item.key}`} ariaLabel={`Valor de cada do item ${index + 1}`} value={item.unit} onChange={value => update(item.key, { unit: value })} />
              </label>
              <b className="fin-num fin-purchase-line" aria-label={`Total do item ${index + 1}`}>
                {line.valid ? formatBRL(purchaseItemTotal(line)) : '–'}
              </b>
              <button
                type="button"
                className="fin-link"
                disabled={items.length === 1 || busy}
                aria-label={`Tirar o item ${index + 1}`}
                onClick={() => setItems(current => current.filter(row => row.key !== item.key))}
              >
                Tirar
              </button>
            </div>
          );
        })}
        <div className="fin-purchase-foot">
          <button
            type="button"
            className="fin-link"
            disabled={items.length >= MAX_ITEMS || busy}
            onClick={() => setItems(current => [...current, emptyItem()])}
          >
            + Outro item
          </button>
          <span className="fin-purchase-total">Total <b className="fin-num">{formatBRL(total)}</b></span>
        </div>
      </fieldset>

      <div className="fin-grid-2">
        <label className="gt-field" htmlFor="fin-pu-category">
          Categoria
          <select id="fin-pu-category" className="gt-select" value={categoryId} onChange={event => setCategoryId(event.target.value)}>
            {categories.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
          </select>
        </label>
        <label className="gt-field" htmlFor="fin-pu-date">
          Data da compra
          <input id="fin-pu-date" type="date" className="gt-select" value={paidOn} max={fin.today} onChange={event => setPaidOn(event.target.value)} />
        </label>
      </div>
      <MethodPicker value={method} onChange={setMethod} />
      <label className="gt-field" htmlFor="fin-pu-payee">
        Quem comprou (opcional)
        <select id="fin-pu-payee" className="gt-select" value={payee} onChange={event => setPayee(event.target.value)}>
          <option value="">Ninguém da lista</option>
          <optgroup label="Equipe">
            {fin.data.members.filter(member => member.is_active !== false).map(member => <option key={member.id} value={`p:${member.id}`}>{member.full_name}</option>)}
          </optgroup>
          {fin.data.people.some(row => row.active) && (
            <optgroup label="Pessoas sem login">
              {fin.data.people.filter(row => row.active).map(row => <option key={row.id} value={`x:${row.id}`}>{row.name}{row.role_label ? ` · ${row.role_label}` : ''}</option>)}
            </optgroup>
          )}
        </select>
      </label>
      <label className="gt-field" htmlFor="fin-pu-note">
        Observação (opcional)
        <input id="fin-pu-note" className="gt-select" value={note} maxLength={500} onChange={event => setNote(event.target.value)} />
      </label>
      <p className="fin-hint">Depois de registrada a compra não se edita: se errar, anule em “Pagas” e registre de novo. O recibo é interno, sem valor fiscal.</p>
      {error && <p className="gt-notice gt-notice-error" role="alert">{error}</p>}
    </DialogShell>
  );
}
