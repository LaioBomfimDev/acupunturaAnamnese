import { useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { Panel } from '../ui/Panel';
import { buildReportAccentPalette, buildReportContactItems, getClinicLetterheadColor } from '../../utils/reportUtils';
import { PrintFooter, PrintLetterhead, ReportContactFooter } from '../report/reportPrint';
import { paginateReportBody } from '../report/reportPagination';
import {
  convertDocxToStandardHtml,
  describeUnsupportedFile,
  exportStandardDocx,
  isDocxFile,
  normalizePastedContent,
  plainTextToHtml,
} from './documentosDocx';
import { DocEditorToolbar } from './DocEditorToolbar';
// Regra .pq-printing (só a folha imprime) mora no CSS dos formulários.
import '../../styles/patientForms.css';

const DEFAULT_ACCENT = '#0E2A4A';

const SOURCES = [
  { id: 'arquivo', label: 'Enviar arquivo Word' },
  { id: 'colar', label: 'Colar conteúdo' },
];

function shortDate() {
  return new Date().toLocaleDateString('pt-BR');
}

// Aba Documentos: qualquer profissional da clínica sobe um Word (.docx)
// ou cola/digita o conteúdo, e recebe o mesmo documento no papel timbrado
// da clínica logada, com a prévia idêntica à dos relatórios (Imprimir /
// salvar como PDF). Tudo acontece no navegador — nada sai da máquina.
export function DocumentosTimbrados({ therapistProfile }) {
  const [source, setSource] = useState('arquivo');
  const [docHtml, setDocHtml] = useState('');
  const [docTitle, setDocTitle] = useState('');
  const [fileName, setFileName] = useState('');
  const [notice, setNotice] = useState(null);
  const [converting, setConverting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [pasteEmpty, setPasteEmpty] = useState(true);
  const [printDoc, setPrintDoc] = useState({ pages: [''], bodyHeightPx: null });
  const fileInputRef = useRef(null);
  const pasteRef = useRef(null);
  const printMeasureRef = useRef(null);
  const printHeaderMeasureRef = useRef(null);
  const printFooterMeasureRef = useRef(null);

  const terapeuta = therapistProfile?.full_name || 'Profissional';
  const clinic = therapistProfile?.clinic || null;
  const clinicName = clinic?.name || therapistProfile?.clinic_name || 'Reability';
  const clinicLogo = clinic?.logo_url || '';
  const clinicMonogram = clinicName.trim().charAt(0).toUpperCase() || 'R';
  const accentPalette = buildReportAccentPalette(getClinicLetterheadColor(clinic) || DEFAULT_ACCENT, DEFAULT_ACCENT);
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
      // O Word abre direto no papel timbrado e também fica na caixa de
      // edição (escondida): "Editar conteúdo" corrige antes de imprimir.
      setEditorContent(html);
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

  // Colar: com formatação (Word, Google Docs, página) passa pela mesma
  // limpeza do .docx; sem formatação, vira parágrafos. Nunca entra HTML
  // cru do clipboard na área editável.
  function handlePaste(event) {
    const data = event.clipboardData;
    if (!data) return;
    event.preventDefault();
    const rich = data.getData('text/html');
    const html = rich ? normalizePastedContent(rich) : plainTextToHtml(data.getData('text/plain'));
    if (!html) return;
    document.execCommand('insertHTML', false, html);
    syncPasteEmpty();
  }

  function syncPasteEmpty() {
    const el = pasteRef.current;
    setPasteEmpty(!el || (!el.textContent.trim() && !el.querySelector('img,table')));
  }

  // A caixa é a mesma para o colado e para o Word: o conteúdo entra já
  // limpo (saída do normalizeImportedHtml), nunca HTML cru.
  function setEditorContent(html) {
    if (pasteRef.current) pasteRef.current.innerHTML = html || '';
    syncPasteEmpty();
  }

  function applyPastedContent() {
    setNotice(null);
    const html = normalizePastedContent(pasteRef.current?.innerHTML || '');
    if (!html) {
      setNotice({ type: 'info', text: 'Cole ou digite o conteúdo do documento antes de continuar.' });
      return;
    }
    setDocHtml(html);
  }

  function handlePrint() {
    const doc = paginateReportBody(docHtml, {
      stage: printMeasureRef.current,
      header: printHeaderMeasureRef.current,
      footer: printFooterMeasureRef.current,
    });
    flushSync(() => setPrintDoc(doc));
    // A folha mora num portal direto no <body>: durante a impressão só
    // ela aparece. Dentro da Gestão (layout em colunas) o navegador
    // ignorava a página A4 sem margem e cada folha virava duas.
    document.body.classList.add('pq-printing');
    try {
      window.print();
    } finally {
      document.body.classList.remove('pq-printing');
    }
  }

  // Baixa o documento padronizado como .docx editável, com o mesmo
  // timbrado do PDF (cabeçalho, rodapé e marca d'água reais do Word).
  async function handleDownloadDocx() {
    setNotice(null);
    setExporting(true);
    try {
      const blob = await exportStandardDocx({
        html: docHtml,
        palette: accentPalette,
        logoUrl: clinicLogo,
        watermark: watermarkEnabled,
        clinicName,
        clinicDetails,
        docTitle: headerTitle,
        terapeuta,
        dateLabel: shortDate(),
        contactItems,
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${headerTitle.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'documento'}.docx`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setNotice({ type: 'error', text: err?.message || 'Não foi possível gerar o arquivo Word.' });
    } finally {
      setExporting(false);
    }
  }

  function clearDocument() {
    setDocHtml('');
    setFileName('');
    setEditorContent('');
    setNotice(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  // Voltar a editar (colado ou Word): a caixa continua montada (só
  // escondida), então o texto segue lá.
  function editContent() {
    setDocHtml('');
    setNotice(null);
    setTimeout(() => pasteRef.current?.focus(), 0);
  }

  function chooseSource(id) {
    if (id === source) return;
    setSource(id);
    setDocHtml('');
    setFileName('');
    setEditorContent('');
    setNotice(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const isWordSource = source === 'arquivo';
  const editorHidden = Boolean(docHtml) || (isWordSource && !fileName);

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

  const letterheadProps = {
    clinicLogo,
    clinicMonogram,
    clinicName,
    clinicDetails,
    dateLabel: shortDate(),
    sessaoLabel: headerTitle,
    terapeuta,
  };

  return (
    <Panel title="Documentos timbrados">
      {/* ── entrada do conteúdo (não imprime) ─────────────────── */}
      <div className="doc-upload no-print">
        <div className="doc-source-toggle" role="group" aria-label="Como trazer o documento">
          {SOURCES.map(option => (
            <button
              key={option.id}
              type="button"
              aria-pressed={source === option.id}
              onClick={() => chooseSource(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>

        {isWordSource && !docHtml && !fileName && (
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
        )}

        {/* Caixa de edição única (colado e Word): sempre montada, só
            escondida, para o texto não se perder entre prévia e edição. */}
        <div className="doc-paste" hidden={editorHidden}>
          <span className="doc-paste-label" id="doc-paste-label">
            {isWordSource ? 'Edite o conteúdo do documento' : 'Cole ou digite o conteúdo do documento'}
          </span>
          <p className="small">
            {isWordSource
              ? `Arquivo: ${fileName}. As mudanças valem só para este documento timbrado; o arquivo no seu computador não muda.`
              : `Pode colar do Word, do Google Docs ou de um e-mail: negrito, listas e tabelas vêm junto, a cor e a fonte saem no padrão de ${clinicName}. Também pode ser só texto. Nada é enviado para nenhum servidor.`}
          </p>
          <div className="doc-editor">
            <DocEditorToolbar editorRef={pasteRef} onChange={syncPasteEmpty} />
            <div
              id="doc-paste-area"
              ref={pasteRef}
              className="doc-paste-area doc-body"
              contentEditable
              suppressContentEditableWarning
              role="textbox"
              aria-multiline="true"
              aria-labelledby="doc-paste-label"
              data-placeholder="Cole aqui (Ctrl+V) ou comece a digitar…"
              data-empty={pasteEmpty ? 'true' : 'false'}
              onPaste={handlePaste}
              onInput={syncPasteEmpty}
              // Enter abre <p> (com o espaço de parágrafo da folha), não <div>.
              onFocus={() => document.execCommand('defaultParagraphSeparator', false, 'p')}
            />
          </div>
          <div className="doc-paste-actions">
            {isWordSource && (
              <button type="button" className="tag" onClick={clearDocument}>Trocar arquivo</button>
            )}
            <button type="button" className="primary-button" onClick={applyPastedContent} disabled={pasteEmpty}>
              Ver no papel timbrado
            </button>
          </div>
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
            {fileName && <span className="small">Arquivo: {fileName}</span>}
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
          (reportPagination corta o corpo em folhas de altura fixa), num
          portal direto no <body> para nenhum layout em volta (grade da
          Gestão, lateral, barra) interferir na página do papel. */}
      {createPortal(
        <div className="pq-print-root" aria-hidden="true">
          <div className="report-print-pages" style={accentStyle}>
            <div className="rpage-measure-stage">
              <div ref={printHeaderMeasureRef}>
                <PrintLetterhead {...letterheadProps} />
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
                <PrintLetterhead {...letterheadProps} />
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
        </div>,
        document.body,
      )}

      {/* ── ações (não imprime) ─────────────────────────────── */}
      {docHtml && (
        <div className="report-actions no-print">
          <button className="primary-button" onClick={handlePrint}>Imprimir / PDF</button>
          <button className="tag" onClick={handleDownloadDocx} disabled={exporting}>
            {exporting ? 'Gerando…' : '⬇ Baixar Word (.docx)'}
          </button>
          <button className="tag" onClick={editContent}>Editar conteúdo</button>
          {isWordSource && <button className="tag" onClick={clearDocument}>Trocar arquivo</button>}
        </div>
      )}
    </Panel>
  );
}
