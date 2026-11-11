import { useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { PrintFooter, PrintLetterhead } from '../report/reportPrint';
import { paginateReportBody } from '../report/reportPagination';
import { buildReportAccentPalette, buildReportContactItems, getClinicLetterheadColor } from '../../utils/reportUtils';
import { formatPersonDocument } from '../../utils/finance';
import '../../styles/patientForms.css';

// ============================================================
// Documento longo no papel timbrado (relatório do contador, comparação
// de meses): o corpo é medido num palco invisível e quebrado em folhas
// (paginateReportBody, tabela dividida por linha com o cabeçalho
// repetido), no portal do <body> com pq-printing, como o recibo de
// compra e as entrevistas. Cor da clínica só no timbrado.
// ============================================================

const DEFAULT_ACCENT = '#0E2A4A';

/** letterhead: { dateLabel, kindLabel }. print(body) abre a impressão. */
export function useLetterheadPrint(profile) {
  const [job, setJob] = useState(null);
  const sourceRef = useRef(null);
  const measureRef = useRef(null);
  const headerRef = useRef(null);
  const footerRef = useRef(null);

  const clinic = profile?.clinic || null;
  const clinicName = clinic?.name || profile?.clinic_name || 'Clínica';
  const logo = clinic?.logo_url || '';
  const watermark = Boolean(logo) && clinic?.logo_watermark !== false;
  const cnpj = clinic?.cnpj ? formatPersonDocument(clinic.cnpj) : '';
  const palette = buildReportAccentPalette(getClinicLetterheadColor(clinic) || DEFAULT_ACCENT, DEFAULT_ACCENT);
  const contactItems = buildReportContactItems({ clinic, therapistProfile: profile });

  function print(body, letterhead) {
    flushSync(() => setJob({ body, letterhead, pages: null, bodyHeightPx: null }));
    const doc = paginateReportBody(sourceRef.current?.innerHTML || '', {
      stage: measureRef.current,
      header: headerRef.current,
      footer: footerRef.current,
    });
    flushSync(() => setJob(current => ({ ...current, pages: doc.pages, bodyHeightPx: doc.bodyHeightPx })));
    document.body.classList.add('pq-printing');
    try {
      window.print();
    } finally {
      document.body.classList.remove('pq-printing');
      setJob(null);
    }
  }

  const head = job ? (
    <PrintLetterhead
      clinicLogo={logo}
      clinicMonogram={clinicName.trim().charAt(0).toUpperCase() || 'C'}
      clinicName={clinicName}
      clinicDetails={[clinic?.legal_name, cnpj ? `CNPJ ${cnpj}` : null].filter(Boolean).join(' • ')}
      dateLabel={job.letterhead.dateLabel}
      sessaoLabel={job.letterhead.kindLabel}
      terapeuta={clinicName}
    />
  ) : null;

  const portal = job ? createPortal(
    <div className="pq-print-root" aria-hidden="true">
      <div className="report-print-pages" style={{ '--clinic-accent': palette.accent, '--clinic-accent-shade': palette.shade, '--clinic-accent-soft': palette.soft }}>
        <div className="rpage-measure-stage">
          <div ref={headerRef}>{head}</div>
          <div ref={footerRef}><PrintFooter items={contactItems} clinicName={clinicName} /></div>
          <div ref={measureRef} className="rpage-body" />
          <div ref={sourceRef}>{job.body}</div>
        </div>
        {(job.pages || []).map((html, index) => (
          <section className="rpage" key={index}>
            {watermark && <div className="rpage-watermark" aria-hidden="true"><img src={logo} alt="" /></div>}
            {head}
            <div
              className="rpage-body fin-report-print"
              style={job.bodyHeightPx ? { height: job.bodyHeightPx } : undefined}
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
  ) : null;

  return { print, portal };
}
