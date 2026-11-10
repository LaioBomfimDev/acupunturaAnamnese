import { PrintFooter, PrintLetterhead } from '../report/reportPrint';
import { buildReportAccentPalette, buildReportContactItems, getClinicLetterheadColor } from '../../utils/reportUtils';
import { amountInWords, formatBRLWithCents, formatDay, formatPersonDocument, placeAndDate } from '../../utils/finance';

// ============================================================
// Folha dos recibos no desenho dos modelos da clínica (10/11/2026):
// 07_Recibo_Pagamento_Prestador e 08_Recibo_Pagamento_Cliente. Papel
// timbrado (logo, faixas, rodapé, marca d'água), título em caixa alta,
// uma linha por campo, valor por extenso, forma de pagamento marcada,
// declaração, local e data, linha de assinatura e o CNPJ da clínica.
// Imprime pela folha só (body.fin-printing, portal .fin-print-root),
// como o comprovante do cliente já fazia.
// ============================================================

const DEFAULT_ACCENT = '#0E2A4A';

export function ClinicReceiptSheet({
  profile,
  kindLabel,
  title,
  number,
  issuedOn,
  fields,
  amountCents,
  methodLine,
  paidOn,
  declaration,
  place,
  signatureLabel,
  note = '',
  voided = null,
}) {
  const clinic = profile?.clinic || null;
  const clinicName = clinic?.name || profile?.clinic_name || 'Clínica';
  const palette = buildReportAccentPalette(getClinicLetterheadColor(clinic) || DEFAULT_ACCENT, DEFAULT_ACCENT);
  const cnpj = clinic?.cnpj ? formatPersonDocument(clinic.cnpj) : '';
  const details = [clinic?.legal_name, cnpj ? `CNPJ ${cnpj}` : null].filter(Boolean).join(' • ');
  const logo = clinic?.logo_url || '';
  const watermark = Boolean(logo) && clinic?.logo_watermark !== false;
  const lines = [
    { label: 'Recibo nº', value: number },
    { label: 'Data de emissão', value: formatDay(issuedOn) },
    ...fields,
    { label: 'Valor recebido', value: `${formatBRLWithCents(amountCents)} (${amountInWords(amountCents)})` },
    { label: 'Forma de pagamento', value: methodLine },
    { label: 'Data do pagamento', value: formatDay(paidOn) },
  ].filter(line => line.value);

  return (
    <div className="report-print-pages" style={{ '--clinic-accent': palette.accent, '--clinic-accent-shade': palette.shade, '--clinic-accent-soft': palette.soft }}>
      <section className="rpage">
        {watermark && <div className="rpage-watermark" aria-hidden="true"><img src={logo} alt="" /></div>}
        <PrintLetterhead
          clinicLogo={logo}
          clinicMonogram={clinicName.trim().charAt(0).toUpperCase() || 'C'}
          clinicName={clinicName}
          clinicDetails={details}
          dateLabel={formatDay(issuedOn)}
          sessaoLabel={kindLabel}
          terapeuta={clinicName}
        />
        <div className="rpage-body doc-body fin-voucher fin-receipt-model">
          <p className="fin-receipt-model-clinic">{clinicName.toLocaleUpperCase('pt-BR')}</p>
          <h2>{title.toLocaleUpperCase('pt-BR')}</h2>
          {voided && (
            <p className="fin-receipt-model-void"><b>RECIBO ANULADO</b> em {formatDay(voided.on)}. Motivo: {voided.reason}</p>
          )}
          {lines.map(line => (
            <p key={line.label}>{line.label}: <b>{line.value}</b></p>
          ))}
          <p>{declaration}</p>
          <p>{placeAndDate(place, issuedOn)}</p>
          <div className="fin-receipt-model-sign">
            <span />
            <p>{signatureLabel}</p>
          </div>
          <p>{clinicName}{cnpj ? ` | CNPJ: ${cnpj}` : ''}</p>
          {note && <p className="fin-voucher-nfse">{note}</p>}
        </div>
        <div className="rpage-footer">
          <PrintFooter items={buildReportContactItems({ clinic, therapistProfile: profile })} clinicName={clinicName} />
        </div>
      </section>
    </div>
  );
}
