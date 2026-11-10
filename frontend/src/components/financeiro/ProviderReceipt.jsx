import { useState } from 'react';
import { issueProviderReceipt, signProviderReceipt, voidProviderReceipt } from '../../services/financeiroService';
import {
  formatBRL,
  formatDay,
  formatPersonDocument,
  methodLabel,
  monthOf,
  payeeName,
  placeFromAddress,
  todayInClinic,
} from '../../utils/finance';
import { DialogShell, VoidDialog } from './FinanceDialogs';
import { usePrintSheet } from './usePrintSheet';
import { liveProviderReceipt, providerNumber, providerSheetProps } from '../../utils/financeReceipts';

// ============================================================
// Recibo de pagamento ao prestador (20261110c, modelo 07 da clínica).
// Sai à mão de uma saída já paga: terapeuta, diarista, autônomo, quem
// fez o conserto. Número próprio do prestador. Quem recebeu assina no
// papel; aqui só se marca "assinado". Emitido não se edita: anula com
// motivo e emite outro, com número novo.
// ============================================================

function defaultsFor(fin, expense) {
  const lookups = { membersById: fin.membersById, peopleById: fin.peopleById };
  const name = payeeName({ professionalId: expense.professional_id, personId: null }, lookups)
    || (expense.person_id ? fin.peopleById.get(expense.person_id)?.name : '') || '';
  const billing = expense.professional_id
    ? (fin.conv?.billing || []).find(row => row.professional_id === expense.professional_id)
    : null;
  const reference = expense.occurrence_on || expense.paid_on;
  return {
    name,
    document: billing?.cpf ? formatPersonDocument(billing.cpf) : '',
    services: expense.description,
    period: monthOf(reference).label,
    place: placeFromAddress(fin.profile?.clinic?.address),
  };
}

export function ProviderReceiptDialog({ fin, expense, onClose }) {
  const live = liveProviderReceipt(fin, expense.id);
  const voidedOnes = (fin.data.providerReceipts || []).filter(row => row.expense_id === expense.id && row.voided_at);
  const [form, setForm] = useState(() => defaultsFor(fin, expense));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [voiding, setVoiding] = useState(false);
  const sheet = usePrintSheet();
  const set = patch => setForm(value => ({ ...value, ...patch }));
  const valid = form.name.trim().length >= 2 && form.services.trim().length >= 2;

  async function run(action, message) {
    setBusy(true);
    setError('');
    try {
      const row = await action();
      fin.notify(message(row));
      fin.reload();
      return row;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function issue() {
    const row = await run(() => issueProviderReceipt({
      expenseId: expense.id,
      providerName: form.name.trim(),
      providerDocument: form.document,
      services: form.services.trim(),
      period: form.period.trim(),
      place: form.place.trim(),
    }), saved => `Recibo do prestador Nº ${providerNumber(saved.number)} emitido.`);
    if (row) sheet.print(async () => providerSheetProps(fin.profile, row));
  }

  return (
    <DialogShell
      title={live ? `Recibo do prestador Nº ${providerNumber(live.number)}` : 'Recibo de pagamento ao prestador'}
      onClose={onClose}
      busy={busy}
      guard={!live}
      footer={live ? (
        <>
          <button type="button" className="gt-btn" onClick={() => setVoiding(true)} disabled={busy}>Anular recibo</button>
          {!live.signed_at && (
            <button type="button" className="gt-btn" disabled={busy}
              onClick={() => run(() => signProviderReceipt(live.id), () => `Recibo Nº ${providerNumber(live.number)} marcado como assinado.`)}>
              Marcar como assinado
            </button>
          )}
          <button type="button" className="gt-btn gt-btn--primary" onClick={() => sheet.print(async () => providerSheetProps(fin.profile, live))}>Imprimir / salvar PDF</button>
        </>
      ) : (
        <>
          <button type="button" className="gt-btn" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="button" className="gt-btn gt-btn--primary" onClick={issue} disabled={!valid || busy}>{busy ? 'Emitindo…' : 'Emitir e imprimir'}</button>
        </>
      )}
    >
      <p className="fin-dialog-text">
        {expense.description}: {formatBRL(expense.amount_cents)}, pago em {formatDay(expense.paid_on)} por {methodLabel(expense.method).toLocaleLowerCase('pt-BR')}.
      </p>

      {live ? (
        <>
          <dl className="fin-receipt-details">
            <div><dt>Prestador(a)</dt><dd>{live.provider_name}</dd></div>
            {live.provider_document && <div><dt>CPF/CNPJ</dt><dd>{formatPersonDocument(live.provider_document)}</dd></div>}
            <div><dt>Serviço(s)</dt><dd>{live.services}</dd></div>
            {live.period_text && <div><dt>Período</dt><dd>{live.period_text}</dd></div>}
            <div><dt>Emitido em</dt><dd>{formatDay(live.issued_on)}</dd></div>
            <div>
              <dt>Assinatura</dt>
              <dd>{live.signed_at ? `assinado (marcado em ${formatDay(todayInClinic(new Date(live.signed_at)))})` : 'falta assinar'}</dd>
            </div>
          </dl>
          {!live.signed_at && (
            <p className="fin-hint">Imprima, peça a assinatura de quem recebeu, guarde o papel na pasta pelo número e marque como assinado.</p>
          )}
        </>
      ) : (
        <div className="fin-grid-2">
          <label className="gt-field" htmlFor="prov-name">
            Prestador(a)
            <input id="prov-name" className="gt-select" maxLength={120} value={form.name} onChange={event => set({ name: event.target.value })} placeholder="Nome de quem recebeu" />
          </label>
          <label className="gt-field" htmlFor="prov-doc">
            CPF ou CNPJ (opcional)
            <input id="prov-doc" className="gt-select" maxLength={20} value={form.document} onChange={event => set({ document: event.target.value })} />
          </label>
          <label className="gt-field fin-receipt-span" htmlFor="prov-services">
            Serviço(s) prestado(s)
            <input id="prov-services" className="gt-select" maxLength={300} value={form.services} onChange={event => set({ services: event.target.value })} />
          </label>
          <label className="gt-field" htmlFor="prov-period">
            Período de referência
            <input id="prov-period" className="gt-select" maxLength={120} value={form.period} onChange={event => set({ period: event.target.value })} />
          </label>
          <label className="gt-field" htmlFor="prov-place">
            Local (cidade/UF)
            <input id="prov-place" className="gt-select" maxLength={60} value={form.place} onChange={event => set({ place: event.target.value })} placeholder="Ex.: Catu/BA" />
          </label>
        </div>
      )}

      {!live && <p className="fin-hint">Valor, forma e data do pagamento vêm da saída. Depois de emitido, o recibo não muda: se algo sair errado, anule e emita outro.</p>}
      {voidedOnes.length > 0 && (
        <p className="fin-hint">Anulado{voidedOnes.length > 1 ? 's' : ''}: {voidedOnes.map(row => `Nº ${providerNumber(row.number)} (${row.void_reason})`).join(', ')}.</p>
      )}
      {(error || sheet.error) && <p className="gt-notice gt-notice-error" role="alert">{error || sheet.error}</p>}

      {voiding && live && (
        <VoidDialog
          title={`Anular recibo Nº ${providerNumber(live.number)}`}
          description="O recibo fica guardado, marcado como anulado, e o número não volta. Depois você pode emitir outro para esta saída."
          onClose={() => setVoiding(false)}
          onConfirm={async reason => {
            await voidProviderReceipt(live.id, reason);
            fin.notify(`Recibo Nº ${providerNumber(live.number)} anulado.`);
            fin.reload();
            setVoiding(false);
          }}
        />
      )}
      {sheet.portal}
    </DialogShell>
  );
}
