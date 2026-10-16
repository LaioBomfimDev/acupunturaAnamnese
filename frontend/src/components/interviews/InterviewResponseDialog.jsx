import { useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { useDismiss } from '../../hooks/useDismiss';
import { DismissPrompt } from '../ui/DismissPrompt';
import { getInterview } from '../../data/clinicalInterviews';
import { voidInterviewResponse } from '../../services/patientInterviewService';
import {
  ageAt,
  answeredSummary,
  buildInterviewRows,
  channelLabel,
  formatInterviewDate,
  respondentOf,
} from '../../utils/clinicalInterviews';
import { safeFileName } from '../../utils/patientForms';
import { PrintFooter, PrintLetterhead } from '../report/reportPrint';
import { paginateReportBody } from '../report/reportPagination';
import { buildReportAccentPalette, buildReportContactItems, getClinicLetterheadColor } from '../../utils/reportUtils';
import { exportStandardDocx } from '../panels/documentosDocx';
import { InterviewGlyph } from './InterviewGlyph';
import '../../styles/patientForms.css';

// ============================================================
// Uma entrevista respondida: quem respondeu, as respostas por parte e
// pergunta, e a saída no papel timbrado da clínica (imprimir / salvar
// PDF, ou Word). Sem nota: o destaque de "Frequentemente" e "Quase
// sempre" é só para a leitura; o filtro esconde o resto, não conta.
//
// A tela segue o visual da janela das escalas (ícones, número na cor
// da tela). O papel segue o padrão dos relatórios: preto e cinza, com o
// cabeçalho e o rodapé da instituição em todas as folhas.
//
// Não existe editar: entrevista errada se anula, com motivo, e continua
// na lista marcada.
// ============================================================

const DEFAULT_ACCENT = '#0E2A4A';
const TEXT = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e2e8f0';

function IdentityGrid({ items }) {
  return (
    <dl className="interview-identity">
      {items.filter(item => item.value).map(item => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function InterviewResponseDialog({ response, patient, profile, canVoid = false, onClose, onVoided }) {
  const interview = getInterview(response.interviewId);
  const [onlyFrequent, setOnlyFrequent] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [printDoc, setPrintDoc] = useState({ pages: [''], bodyHeightPx: null });
  const dismiss = useDismiss({ onClose, busy: saving || exporting, guardUnsaved: voiding });

  const sourceRef = useRef(null);
  const measureRef = useRef(null);
  const headerRef = useRef(null);
  const footerRef = useRef(null);

  const answers = response.answers || {};
  const rows = buildInterviewRows(response.questions, answers);
  const summary = answeredSummary(rows);
  const shownRows = onlyFrequent
    ? rows.filter((row, index) => (row.kind === 'answer'
      ? row.tone === 'frequent'
      : rows.slice(index + 1).find(next => next.kind === 'section' || next.tone === 'frequent')?.tone === 'frequent'))
    : rows;
  const person = respondentOf(response);
  const patientName = patient?.name || 'Paciente';
  const age = ageAt(patient?.birth_date, response.submittedAt);
  const answeredOn = formatInterviewDate(response.submittedAt);
  const shortName = interview?.shortName || response.title;
  const identity = [
    { label: 'Pessoa avaliada', value: patientName },
    { label: 'Idade', value: age !== null ? `${age} ${age === 1 ? 'ano' : 'anos'}` : '' },
    { label: 'Informante', value: person.name },
    { label: 'Parentesco/vínculo', value: person.relation },
    { label: 'Frequência de convivência', value: person.coexistence },
    { label: 'Data', value: answeredOn },
  ];

  const clinic = profile?.clinic || null;
  const clinicName = clinic?.name || profile?.clinic_name || 'Clínica';
  const clinicLogo = clinic?.logo_url || '';
  const clinicDetails = [clinic?.legal_name, clinic?.cnpj ? `CNPJ ${clinic.cnpj}` : null].filter(Boolean).join(' • ');
  const accentPalette = buildReportAccentPalette(getClinicLetterheadColor(clinic) || DEFAULT_ACCENT, DEFAULT_ACCENT);
  const contactItems = buildReportContactItems({ clinic, therapistProfile: profile });
  const watermarkEnabled = Boolean(clinicLogo) && clinic?.logo_watermark !== false;
  const letterheadProps = {
    clinicLogo,
    clinicMonogram: clinicName.trim().charAt(0).toUpperCase() || 'C',
    clinicName,
    clinicDetails,
    dateLabel: answeredOn,
    sessaoLabel: shortName,
    terapeuta: patientName,
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

  async function handleWord() {
    setExporting(true);
    setError('');
    try {
      const blob = await exportStandardDocx({
        html: sourceRef.current?.innerHTML || '',
        accent: accentPalette.accent,
        clinicName,
        clinicDetails,
        docTitle: shortName,
        terapeuta: patientName,
        dateLabel: answeredOn,
        contactLine: contactItems.map(item => item.value).filter(Boolean).join(' • '),
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${safeFileName(shortName)}-${safeFileName(patientName)}.docx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message || 'Não foi possível gerar o Word.');
    } finally {
      setExporting(false);
    }
  }

  async function handleVoid() {
    setSaving(true);
    setError('');
    try {
      await voidInterviewResponse({ id: response.id, reason });
      dismiss.markSaved();
      onVoided?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // Papel: preto e cinza, como os relatórios. Cada pergunta é um bloco
  // (a paginação corta entre perguntas, nunca no meio de uma).
  const printBody = (
    <>
      <h2 style={{ margin: '0 0 10px', color: TEXT, fontSize: 17, lineHeight: 1.3 }}>{response.title}</h2>
      {response.voidedAt && (
        <p style={{ margin: '0 0 10px', padding: '6px 10px', border: `1px solid ${TEXT}`, color: TEXT, fontSize: 12.5 }}>
          <b>ENTREVISTA ANULADA</b> em {formatInterviewDate(response.voidedAt)}. Motivo: {response.voidReason}
        </p>
      )}
      <table style={{ width: '100%', borderCollapse: 'collapse', margin: '0 0 12px', fontSize: 12.5 }}>
        <tbody>
          {identity.filter(item => item.value).map(item => (
            <tr key={item.label}>
              <td style={{ width: '34%', padding: '3px 8px 3px 0', color: MUTED, borderBottom: `1px solid ${LINE}` }}>{item.label}</td>
              <td style={{ padding: '3px 0', color: TEXT, fontWeight: 600, borderBottom: `1px solid ${LINE}` }}>{item.value}</td>
            </tr>
          ))}
          <tr>
            <td style={{ padding: '3px 8px 3px 0', color: MUTED }}>Forma</td>
            <td style={{ padding: '3px 0', color: TEXT }}>
              {response.channel === 'link' ? 'Respondida pelo link enviado pela clínica' : `Respondida no consultório, com ${response.createdByName}`}
            </td>
          </tr>
        </tbody>
      </table>
      {interview?.instructions && (
        <p style={{ margin: '0 0 12px', color: MUTED, fontSize: 11.5, lineHeight: 1.45 }}>
          <b>Instruções ao informante:</b> {interview.instructions}
        </p>
      )}
      {rows.map(row => (row.kind === 'section' ? (
        <div key={row.id} style={{ margin: '14px 0 4px' }}>
          <h3 style={{ margin: 0, color: TEXT, fontSize: 13.5 }}>{row.label}</h3>
          {row.help && <p style={{ margin: 0, color: MUTED, fontSize: 11.5, fontStyle: 'italic' }}>{row.help}</p>}
        </div>
      ) : row.number ? (
        <div key={row.id} style={{ display: 'flex', gap: 12, padding: '4px 0', borderBottom: `1px solid ${LINE}`, fontSize: 12.5, lineHeight: 1.4 }}>
          <span style={{ flex: '1 1 auto', color: TEXT }}>{row.number}. {row.label}</span>
          <span style={{ flex: '0 0 30%', color: row.value ? TEXT : MUTED, fontWeight: row.value ? 700 : 400, textAlign: 'right' }}>
            {row.value || 'Sem resposta'}
          </span>
        </div>
      ) : (
        // Tamanho em cada parágrafo: o estilo da folha (.rpage-body p) não herda do bloco.
        <div key={row.id} style={{ padding: '4px 0', borderBottom: `1px solid ${LINE}` }}>
          <p style={{ margin: 0, color: MUTED, fontWeight: 600, fontSize: 12.5, lineHeight: 1.45 }}>{row.label}</p>
          <p style={{ margin: 0, color: row.value ? TEXT : MUTED, whiteSpace: 'pre-line', fontSize: 12.5, lineHeight: 1.45 }}>
            {row.value || 'Sem resposta'}
          </p>
        </div>
      )))}
      {interview?.technicalNote && (
        <p style={{ margin: '14px 0 0', color: MUTED, fontSize: 10.5, lineHeight: 1.45 }}>
          <b>Nota técnica:</b> {interview.technicalNote}
        </p>
      )}
    </>
  );

  const accentStyle = {
    '--clinic-accent': accentPalette.accent,
    '--clinic-accent-shade': accentPalette.shade,
    '--clinic-accent-soft': accentPalette.soft,
  };

  return (
    <div className="instrument-dialog-overlay" {...dismiss.backdropProps}>
      <div
        className="instrument-dialog interview-dialog forms-scope"
        role="dialog"
        aria-modal="true"
        aria-label={`${shortName} de ${patientName}`}
        {...dismiss.panelProps}
      >
        <div className="panel">
          <div className="panel-title instrument-dialog-head">
            <span className="instrument-dialog-title">
              <span className="instrument-dialog-icon"><InterviewGlyph name="interview" size={20} /></span>
              <span>
                {shortName}
                <small>{interview?.group || 'Entrevista'} · {summary.label} respondidas</small>
              </span>
            </span>
            <button type="button" className="instrument-dialog-close" aria-label="Fechar" onClick={onClose} disabled={saving}>×</button>
          </div>

          <div className="panel-body instrument-dialog-body">
            <DismissPrompt dismiss={dismiss} />
            <ul className="instrument-meta" aria-label="Sobre esta entrevista">
              <li><InterviewGlyph name="calendar" /> Respondida em <b>{answeredOn}</b></li>
              <li>
                <InterviewGlyph name={response.channel === 'link' ? 'send' : 'office'} />
                {channelLabel(response)}
              </li>
              <li>
                <InterviewGlyph name="person" />
                {response.channel === 'link' ? `Link de ${response.createdByName}` : `Registrada por ${response.createdByName}`}
              </li>
            </ul>

            {response.voidedAt && (
              <div className="alert alert-warning" role="status">
                Anulada em {formatInterviewDate(response.voidedAt)}
                {response.voidedByName ? ` por ${response.voidedByName}` : ''}. Motivo: {response.voidReason}
              </div>
            )}

            <IdentityGrid items={identity} />

            <div className="interview-filter" role="group" aria-label="Quais respostas mostrar">
              <button type="button" aria-pressed={!onlyFrequent} onClick={() => setOnlyFrequent(false)}>Todas as respostas</button>
              <button type="button" aria-pressed={onlyFrequent} onClick={() => setOnlyFrequent(true)}>Só “Frequentemente” e “Quase sempre”</button>
            </div>

            <section className="interview-answers" aria-label="Respostas">
              {shownRows.length === 0 && (
                <p className="small area-empty">Nenhuma resposta “Frequentemente” ou “Quase sempre”.</p>
              )}
              {shownRows.map(row => (row.kind === 'section' ? (
                <h3 key={row.id} className="interview-section-title">
                  {row.label}
                  {row.help && <small>{row.help}</small>}
                </h3>
              ) : (
                <div key={row.id} className={`interview-answer-row${row.long ? ' is-long' : ''}`} data-tone={row.tone}>
                  {row.number
                    ? <span className="instrument-answer-number" aria-hidden="true">{row.number}</span>
                    : <span className="interview-answer-dot" aria-hidden="true" />}
                  <span className="interview-answer-question">
                    {row.number && <span className="sr-only">{row.number}. </span>}
                    {row.label}
                  </span>
                  <span className="interview-answer-value">{row.value || 'Sem resposta'}</span>
                </div>
              )))}
            </section>

            {interview?.technicalNote && (
              <details className="instrument-about">
                <summary>Sobre a entrevista</summary>
                <p className="small">{interview.purpose}</p>
                <p className="small"><b>Nota técnica:</b> {interview.technicalNote}</p>
                <p className="small">{interview.source}.</p>
              </details>
            )}

            {error && <div className="alert" role="alert">{error}</div>}

            {voiding ? (
              <div className="instrument-void">
                <label className="field-block">
                  <span>Motivo da anulação</span>
                  <textarea
                    value={reason}
                    onChange={event => setReason(event.target.value)}
                    rows={2}
                    maxLength={500}
                    placeholder="Ex.: registrada no paciente errado"
                  />
                </label>
                <div className="instrument-actions">
                  <button type="button" className="primary-button" onClick={handleVoid} disabled={saving || reason.trim().length < 3}>
                    {saving ? 'Anulando…' : 'Anular entrevista'}
                  </button>
                  <button type="button" className="quiet-button" onClick={() => { setVoiding(false); setReason(''); }} disabled={saving}>
                    Voltar
                  </button>
                </div>
              </div>
            ) : (
              <div className="interview-dialog-foot">
                <p className="small">Sai no papel timbrado da instituição.</p>
                {canVoid && !response.voidedAt && (
                  <button type="button" className="quiet-button" onClick={() => setVoiding(true)}>Anular</button>
                )}
                <button type="button" className="quiet-button" onClick={handleWord} disabled={exporting}>
                  {exporting ? 'Gerando Word…' : 'Baixar Word'}
                </button>
                <button type="button" className="primary-button" onClick={handlePrint}>
                  Imprimir / salvar PDF
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {createPortal(
        <div className="pq-print-root" aria-hidden="true">
          <div className="report-print-pages" style={accentStyle}>
            <div className="rpage-measure-stage">
              <div ref={headerRef}><PrintLetterhead {...letterheadProps} /></div>
              <div ref={footerRef}><PrintFooter items={contactItems} clinicName={clinicName} /></div>
              <div ref={measureRef} className="rpage-body" />
              {/* Fonte do corpo (innerHTML já escapado pelo React): fica no
                  palco invisível para nunca sair sozinha no papel. */}
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
    </div>
  );
}

export default InterviewResponseDialog;
