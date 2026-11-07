import { useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { PrintFooter, PrintLetterhead } from '../report/reportPrint';
import { paginateReportBody } from '../report/reportPagination';
import { buildReportAccentPalette, buildReportContactItems, getClinicLetterheadColor } from '../../utils/reportUtils';
import {
  formatBRL,
  formatDay,
  methodLabel,
  payeeName,
  purchaseItemTotal,
  quantityToText,
  todayInClinic,
} from '../../utils/finance';
import { DialogShell } from './FinanceDialogs';
import '../../styles/patientForms.css';

// ============================================================
// Recibo interno de uma compra (06/11/2026): comprovante da própria
// instituição, numerado, no papel timbrado. Sem valor fiscal, e o
// papel diz isso. Compra anulada continua existindo, marcada ANULADO.
// Mesmo desenho de impressão das entrevistas (palco invisível, fonte do
// corpo medida e paginada, portal no <body>).
// ============================================================

const DEFAULT_ACCENT = '#0E2A4A';
const TEXT = '#0f172a';
const MUTED = '#64748b';
const LINE = '#cbd5e1';

function itemRows(items) {
  return items.map(item => ({
    key: item.id || item.position,
    description: item.description,
    quantity: quantityToText(Math.round(Number(item.quantity) * 1000)),
    unit: formatBRL(item.unit_cents),
    total: formatBRL(item.total_cents ?? purchaseItemTotal({ quantityThousandths: Math.round(Number(item.quantity) * 1000), unitCents: item.unit_cents })),
  }));
}

export function PurchaseReceiptDialog({ fin, expense, items, onClose }) {
  const [printDoc, setPrintDoc] = useState({ pages: [''], bodyHeightPx: null });
  const sourceRef = useRef(null);
  const measureRef = useRef(null);
  const headerRef = useRef(null);
  const footerRef = useRef(null);

  const profile = fin.profile || null;
  const clinic = profile?.clinic || null;
  const clinicName = clinic?.name || profile?.clinic_name || 'Clínica';
  const clinicLogo = clinic?.logo_url || '';
  const clinicDetails = [clinic?.legal_name, clinic?.cnpj ? `CNPJ ${clinic.cnpj}` : null].filter(Boolean).join(' • ');
  const accentPalette = buildReportAccentPalette(getClinicLetterheadColor(clinic) || DEFAULT_ACCENT, DEFAULT_ACCENT);
  const contactItems = buildReportContactItems({ clinic, therapistProfile: profile });
  const watermarkEnabled = Boolean(clinicLogo) && clinic?.logo_watermark !== false;
  const accentStyle = {
    '--clinic-accent': accentPalette.accent,
    '--clinic-accent-shade': accentPalette.shade,
    '--clinic-accent-soft': accentPalette.soft,
  };

  const rows = itemRows(items);
  const voided = Boolean(expense.voided_at);
  const category = fin.categoriesById.get(expense.category_id)?.name || 'Sem categoria';
  const buyer = payeeName({ professionalId: expense.professional_id, personId: expense.person_id }, { membersById: fin.membersById, peopleById: fin.peopleById });
  const registeredOn = expense.created_at ? formatDay(todayInClinic(new Date(expense.created_at))) : '';
  const details = [
    { label: 'Data da compra', value: formatDay(expense.paid_on) },
    { label: 'Categoria', value: category },
    { label: 'Forma de pagamento', value: methodLabel(expense.method) },
    { label: 'Comprado por', value: buyer },
    { label: 'Registrado em', value: registeredOn },
    { label: 'Observação', value: expense.note || '' },
  ].filter(item => item.value);

  const letterheadProps = {
    clinicLogo,
    clinicMonogram: clinicName.trim().charAt(0).toUpperCase() || 'C',
    clinicName,
    clinicDetails,
    dateLabel: formatDay(expense.paid_on),
    sessaoLabel: `Recibo ${expense.receipt_number}`,
    terapeuta: 'Comprovante interno',
  };

  function handlePrint() {
    const html = sourceRef.current?.innerHTML || '';
    const doc = paginateReportBody(html, {
      stage: measureRef.current,
      header: headerRef.current,
      footer: footerRef.current,
    });
    flushSync(() => setPrintDoc(doc));
    document.body.classList.add('pq-printing');
    try {
      window.print();
    } finally {
      document.body.classList.remove('pq-printing');
    }
  }

  const cell = { padding: '5px 6px', borderBottom: `1px solid ${LINE}`, verticalAlign: 'top' };
  const printBody = (
    <>
      <h2 style={{ margin: '0 0 10px', color: TEXT, fontSize: 17, lineHeight: 1.3 }}>Recibo de compra Nº {expense.receipt_number}</h2>
      {voided && (
        <p style={{ margin: '0 0 10px', padding: '6px 10px', border: `1px solid ${TEXT}`, color: TEXT, fontSize: 12.5 }}>
          <b>RECIBO ANULADO</b> em {formatDay(todayInClinic(new Date(expense.voided_at)))}. Motivo: {expense.void_reason}
        </p>
      )}
      <table style={{ width: '100%', borderCollapse: 'collapse', margin: '0 0 12px', fontSize: 12.5 }}>
        <tbody>
          {details.map(item => (
            <tr key={item.label}>
              <td style={{ ...cell, width: '32%', color: MUTED }}>{item.label}</td>
              <td style={{ ...cell, color: TEXT }}>{item.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <table style={{ width: '100%', borderCollapse: 'collapse', margin: '0 0 10px', fontSize: 12.5 }}>
        <thead>
          <tr>
            <th style={{ ...cell, textAlign: 'left', color: MUTED }}>Item</th>
            <th style={{ ...cell, textAlign: 'right', color: MUTED }}>Qtd.</th>
            <th style={{ ...cell, textAlign: 'right', color: MUTED }}>Valor</th>
            <th style={{ ...cell, textAlign: 'right', color: MUTED }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.key}>
              <td style={{ ...cell, color: TEXT }}>{row.description}</td>
              <td style={{ ...cell, textAlign: 'right', color: TEXT }}>{row.quantity}</td>
              <td style={{ ...cell, textAlign: 'right', color: TEXT }}>{row.unit}</td>
              <td style={{ ...cell, textAlign: 'right', color: TEXT }}>{row.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ margin: '0 0 14px', textAlign: 'right', color: TEXT, fontSize: 15 }}>
        <b>Total: {formatBRL(expense.amount_cents)}</b>
      </p>
      <p style={{ margin: 0, color: MUTED, fontSize: 11.5 }}>
        Comprovante interno de {clinicName}, para controle de despesas. Não tem valor fiscal e não substitui nota fiscal.
      </p>
    </>
  );

  return (
    <DialogShell
      title={`Recibo Nº ${expense.receipt_number}`}
      onClose={onClose}
      guard={false}
      footer={(
        <>
          <button type="button" className="gt-btn" onClick={onClose}>Fechar</button>
          <button type="button" className="gt-btn gt-btn--primary" onClick={handlePrint}>Imprimir / salvar PDF</button>
        </>
      )}
    >
      {voided && <p className="gt-notice gt-notice-error" role="status">Recibo anulado: {expense.void_reason}</p>}
      <dl className="fin-receipt-details">
        {details.map(item => (
          <div key={item.label}>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
      <div className="fin-list">
        {rows.map(row => (
          <div key={row.key} className="fin-row">
            <div className="fin-row-main">
              <b>{row.description}</b>
              <span>{row.quantity} × {row.unit}</span>
            </div>
            <b className="fin-num fin-amount">{row.total}</b>
          </div>
        ))}
      </div>
      <p className="fin-receipt-total">Total <b className="fin-num">{formatBRL(expense.amount_cents)}</b></p>
      <p className="fin-hint">Comprovante interno, sem valor fiscal.</p>

      {createPortal(
        <div className="pq-print-root" aria-hidden="true">
          <div className="report-print-pages" style={accentStyle}>
            <div className="rpage-measure-stage">
              <div ref={headerRef}><PrintLetterhead {...letterheadProps} /></div>
              <div ref={footerRef}><PrintFooter items={contactItems} clinicName={clinicName} /></div>
              <div ref={measureRef} className="rpage-body" />
              <div ref={sourceRef}>{printBody}</div>
            </div>
            {printDoc.pages.map((html, index) => (
              <section className="rpage" key={index}>
                {watermarkEnabled && (
                  <div className="rpage-watermark" aria-hidden="true"><img src={clinicLogo} alt="" /></div>
                )}
                <PrintLetterhead {...letterheadProps} />
                <div
                  className="rpage-body"
                  style={printDoc.bodyHeightPx ? { height: printDoc.bodyHeightPx } : undefined}
                  dangerouslySetInnerHTML={{ __html: html }}
                />
                <div className="rpage-footer">
                  <PrintFooter items={contactItems} clinicName={clinicName} />
                </div>
              </section>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </DialogShell>
  );
}
