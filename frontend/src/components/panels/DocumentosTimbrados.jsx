import { useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Panel } from '../ui/Panel';
import { buildReportAccentPalette, buildReportContactItems } from '../../utils/reportUtils';
import { PrintFooter, PrintLetterhead, ReportContactFooter } from '../report/reportPrint';
import { paginateReportBody } from '../report/reportPagination';
import { convertDocxToStandardHtml, describeUnsupportedFile, exportStandardDocx, isDocxFile } from './documentosDocx';

const DEFAULT_ACCENT = '#0E2A4A';

function shortDate() {
  return new Date().toLocaleDateString('pt-BR');
}

// Aba Documentos: qualquer profissional da clínica sobe um Word (.docx)
// e recebe o mesmo documento no papel timbrado da clínica logada, com a
// prévia idêntica à dos relatórios (Imprimir / salvar como PDF).
// A conversão acontece inteira no navegador — o arquivo não sai da máquina.
export function DocumentosTimbrados({ therapistProfile }) {
  const [docHtml, setDocHtml] = useState('');
  const [docTitle, setDocTitle] = useState('');
  const [fileName, setFileName] = useState('');
  const [notice, setNotice] = useState(null);
  const [converting, setConverting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [printDoc, setPrintDoc] = useState({ pages: [''], bodyHeightPx: null });
  const fileInputRef = useRef(null);
  const printMeasureRef = useRef(null);
  const printHeaderMeasureRef = useRef(null);
  const printFooterMeasureRef = useRef(null);

  const terapeuta = therapistProfile?.full_name || 'Profissional';
  const clinic = therapistProfile?.clinic || null;
  const clinicName = clinic?.name || therapistProfile?.clinic_name || 'Reability';
  const clinicLogo = clinic?.logo_url || '';
  const clinicMonogram = clinicName.trim().charAt(0).toUpperCase() || 'R';
  const accentPalette = buildReportAccentPalette(clinic?.brand_color || DEFAULT_ACCENT, DEFAULT_ACCENT);
  const clinicDetails = [
    clinic?.legal_name,
    clinic?.cnpj ? `CNPJ ${clinic.cnpj}` : null,
  ].filter(Boolean).join(' • ');
  const contactItems = buildReportContactItems({ clinic, therapistProfile });
  const watermarkEnabled = Boolean(clinicLogo) && clinic?.logo_watermark !== false;
  const accentStyle = {
    '--clinic-accent': accentPalette.accent,
    '--clinic-accent-shade': accentPalette.shade,
    '--clinic-accent-soft': accentPalette.soft,
  };

  const headerTitle = docTitle.trim() || 'Documento da clínica';

  async function handleFile(file) {
    if (!file) return;
    setNotice(null);

    if (!isDocxFile(file.name)) {
      setNotice({ type: 'info', text: describeUnsupportedFile(file.name) });
      return;
    }

    setConverting(true);
    try {
      const buffer = await file.arrayBuffer();
      const { html } = await convertDocxToStandardHtml(buffer);
      setDocHtml(html);
      setFileName(file.name);
      if (!docTitle.trim()) {
        setDocTitle(file.name.replace(/\.docx$/i, '').replace(/[-_]+/g, ' ').trim());
      }
    } catch (err) {
      setNotice({ type: 'error', text: err?.message || 'Não foi possível ler este arquivo.' });
    } finally {
      setConverting(false);
    }
  }

  function handleDrop(event) {
    event.preventDefault();
    setDragOver(false);
    handleFile(event.dataTransfer?.files?.[0]);
  }

  function handlePrint() {
    const doc = paginateReportBody(docHtml, {
      stage: printMeasureRef.current,
      header: printHeaderMeasureRef.current,
      footer: printFooterMeasureRef.current,
    });
    flushSync(() => setPrintDoc(doc));
    window.print();
  }

  // Baixa o documento padronizado como .docx editável (cabeçalho e
  // rodapé da clínica viram header/footer reais do Word).
  async function handleDownloadDocx() {
    setNotice(null);
    setExporting(true);
    try {
      const blob = await exportStandardDocx({
        html: docHtml,
        accent: accentPalette.accent,
        clinicName,
        clinicDetails,
        docTitle: headerTitle,
        terapeuta,
        dateLabel: shortDate(),
        contactLine: contactItems.map(item => item.value).filter(Boolean).join(' • '),
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${headerTitle.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'documento'}.docx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setNotice({ type: 'error', text: err?.message || 'Não foi possível gerar o arquivo Word.' });
    } finally {
      setExporting(false);
    }
  }

  function clearDocument() {
    setDocHtml('');
    setFileName('');
    setDocTitle('');
    setNotice(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const letterhead = (
    <header className="report-letterhead">
      <div className="report-letterhead-top">
        <div className="report-letterhead-brand">
          {clinicLogo
            ? <img className="report-logo" src={clinicLogo} alt={`Logo ${clinicName}`} />
            : <span className="report-logo report-logo-monogram" aria-hidden="true">{clinicMonogram}</span>}
          <div className="report-letterhead-main">
            <h1>{clinicName}</h1>
            {clinicDetails && <small>{clinicDetails}</small>}
          </div>
        </div>
        <div className="report-letterhead-meta">
          <b>{shortDate()}</b>
          <span>{headerTitle}</span>
          <span>{terapeuta}</span>
        </div>
      </div>
      <span className="report-letterhead-rule" aria-hidden="true" />
    </header>
  );

  return (
    <Panel title="Documentos timbrados">
      {/* ── entrada do arquivo (não imprime) ─────────────────── */}
      <div className="doc-upload no-print">
        <div
          className={`doc-dropzone${dragOver ? ' doc-dropzone-over' : ''}`}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <p><b>Arraste um arquivo Word (.docx) aqui</b></p>
          <p className="small">O documento sai no papel timbrado de {clinicName}. O arquivo não é enviado para nenhum servidor.</p>
          <button
            type="button"
            className="tag"
            onClick={() => fileInputRef.current?.click()}
            disabled={converting}
          >
            {converting ? 'Convertendo…' : 'Escolher arquivo'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".docx"
            style={{ display: 'none' }}
            onChange={e => handleFile(e.target.files?.[0])}
          />
        </div>

        {notice && (
          <div className={notice.type === 'error' ? 'alert' : 'doc-note'}>
            {notice.text}
          </div>
        )}

        {docHtml && (
          <div className="doc-controls">
            <label>
              Título do documento (aparece no cabeçalho)
              <input
                value={docTitle}
                onChange={e => setDocTitle(e.target.value)}
                placeholder="Ex.: Laudo neuropsicológico"
              />
            </label>
            <span className="small">Arquivo: {fileName}</span>
          </div>
        )}
      </div>

      {/* ── prévia timbrada em tela (mesmo shell do Relatório) ── */}
      {docHtml && (
        <div className="report report-screen-only" style={accentStyle}>
          <table className="report-sheet">
            <thead className="report-sheet-head">
              <tr>
                <td className="report-sheet-cell report-sheet-cell-head">
                  <span className="report-topband" aria-hidden="true" />
                  {letterhead}
                </td>
              </tr>
            </thead>
            <tfoot className="report-sheet-foot">
              <tr>
                <td className="report-sheet-cell report-sheet-cell-foot">
                  <ReportContactFooter items={contactItems} clinicName={clinicName} />
                </td>
              </tr>
            </tfoot>
            <tbody>
              <tr>
                <td className="report-sheet-cell report-sheet-cell-body">
                  <div className="report-body doc-body" dangerouslySetInnerHTML={{ __html: docHtml }} />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Folhas reais de impressão: mesma infra do Relatório
          (reportPagination corta o corpo em folhas de altura fixa). */}
      <div className="report-print-pages" style={accentStyle} aria-hidden="true">
        <div className="rpage-measure-stage">
          <div ref={printHeaderMeasureRef}>
            <PrintLetterhead
              clinicLogo={clinicLogo}
              clinicMonogram={clinicMonogram}
              clinicName={clinicName}
              clinicDetails={clinicDetails}
              dateLabel={shortDate()}
              sessaoLabel={headerTitle}
              terapeuta={terapeuta}
            />
          </div>
          <div ref={printFooterMeasureRef}>
            <PrintFooter items={contactItems} clinicName={clinicName} />
          </div>
          <div ref={printMeasureRef} className="rpage-body doc-body" />
        </div>

        {printDoc.pages.map((html, index) => (
          <section className="rpage" key={index}>
            {watermarkEnabled && (
              <div className="rpage-watermark" aria-hidden="true">
                <img src={clinicLogo} alt="" />
              </div>
            )}
            <PrintLetterhead
              clinicLogo={clinicLogo}
              clinicMonogram={clinicMonogram}
              clinicName={clinicName}
              clinicDetails={clinicDetails}
              dateLabel={shortDate()}
              sessaoLabel={headerTitle}
              terapeuta={terapeuta}
            />
            <div
              className="rpage-body doc-body"
              style={printDoc.bodyHeightPx ? { height: printDoc.bodyHeightPx } : undefined}
              dangerouslySetInnerHTML={{ __html: html }}
            />
            <div className="rpage-footer">
              <PrintFooter items={contactItems} clinicName={clinicName} />
            </div>
          </section>
        ))}
      </div>

      {/* ── ações (não imprime) ─────────────────────────────── */}
      {docHtml && (
        <div className="report-actions no-print">
          <button className="primary-button" onClick={handlePrint}>Imprimir / PDF</button>
          <button className="tag" onClick={handleDownloadDocx} disabled={exporting}>
            {exporting ? 'Gerando…' : '⬇ Baixar Word (.docx)'}
          </button>
          <button className="tag" onClick={clearDocument}>Trocar arquivo</button>
        </div>
      )}
    </Panel>
  );
}
