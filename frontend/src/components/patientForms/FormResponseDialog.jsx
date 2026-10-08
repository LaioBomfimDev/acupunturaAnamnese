import { useEffect, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { useDismiss } from '../../hooks/useDismiss';
import { assignmentStatus, formatAnswer, formatDueDate, isAnswerable, isQuestionVisible, safeFileName } from '../../utils/patientForms';
import { readAssignmentAnswers } from '../../services/patientPortalService';
import { PrintFooter, PrintLetterhead } from '../report/reportPrint';
import { paginateReportBody } from '../report/reportPagination';
import { buildReportAccentPalette, buildReportContactItems, getClinicLetterheadColor } from '../../utils/reportUtils';
import { exportStandardDocx } from '../panels/documentosDocx';
import '../../styles/patientForms.css';

// ============================================================
// Respostas de um formulário enviado, só para a administração. Abre as
// respostas decifradas (portal_admin_read_answers), mostra pergunta →
// resposta na ordem do formulário e sai em papel timbrado (imprimir /
// salvar PDF) ou em Word — o que a clínica fazia redigitando.
// ============================================================

const DEFAULT_ACCENT = '#0E2A4A';
const TEXT = '#0f172a';
const MUTED = '#64748b';

function formatDay(iso) {
  return iso ? new Date(iso).toLocaleDateString('pt-BR') : '';
}

/** Linhas na ordem do formulário: partes viram título, perguntas escondidas saem. */
function buildRows(questions, answers) {
  const byId = new Map((questions || []).map(question => [question.id, question]));
  const rows = [];
  for (const question of questions || []) {
    if (question.type === 'section') {
      rows.push({ kind: 'section', id: question.id, label: question.label || 'Parte' });
      continue;
    }
    if (!isAnswerable(question) || !isQuestionVisible(question, answers, byId)) continue;
    rows.push({ kind: 'answer', id: question.id, label: question.label || 'Pergunta sem texto', value: formatAnswer(question, answers) });
  }
  // Parte que ficou sem nenhuma pergunta visível não aparece.
  return rows.filter((row, index) => row.kind !== 'section' || rows[index + 1]?.kind === 'answer');
}

export function FormResponseDialog({ assignment, patient, profile, onClose }) {
  const [answers, setAnswers] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [printDoc, setPrintDoc] = useState({ pages: [''], bodyHeightPx: null });
  const dismiss = useDismiss({ onClose, busy: exporting });

  const sourceRef = useRef(null);
  const measureRef = useRef(null);
  const headerRef = useRef(null);
  const footerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    readAssignmentAnswers([assignment.id])
      .then(map => { if (!cancelled) setAnswers(map.get(assignment.id) || {}); })
      .catch(err => { if (!cancelled) setLoadError(err.message); });
    return () => { cancelled = true; };
  }, [assignment.id]);

  const patientName = patient?.name || 'Paciente';
  const status = assignmentStatus(assignment);
  const rows = answers ? buildRows(assignment.form_questions, answers) : [];
  const answeredCount = rows.filter(row => row.kind === 'answer' && row.value).length;
  const questionCount = rows.filter(row => row.kind === 'answer').length;

  const clinic = profile?.clinic || null;
  const clinicName = clinic?.name || profile?.clinic_name || 'Clínica';
  const clinicLogo = clinic?.logo_url || '';
  const clinicDetails = [clinic?.legal_name, clinic?.cnpj ? `CNPJ ${clinic.cnpj}` : null].filter(Boolean).join(' • ');
  const accentPalette = buildReportAccentPalette(getClinicLetterheadColor(clinic) || DEFAULT_ACCENT, DEFAULT_ACCENT);
  const contactItems = buildReportContactItems({ clinic, therapistProfile: profile });
  const watermarkEnabled = Boolean(clinicLogo) && clinic?.logo_watermark !== false;
  const dateLabel = formatDay(assignment.submitted_at || assignment.last_saved_at || assignment.created_at);
  const letterheadProps = {
    clinicLogo,
    clinicMonogram: clinicName.trim().charAt(0).toUpperCase() || 'C',
    clinicName,
    clinicDetails,
    dateLabel,
    sessaoLabel: assignment.form_title,
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
    setExportError('');
    try {
      const blob = await exportStandardDocx({
        html: sourceRef.current?.innerHTML || '',
        accent: accentPalette.accent,
        clinicName,
        clinicDetails,
        docTitle: assignment.form_title,
        terapeuta: patientName,
        dateLabel,
        contactLine: contactItems.map(item => item.value).filter(Boolean).join(' • '),
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${safeFileName(assignment.form_title)}-${safeFileName(patientName)}.docx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err.message || 'Não foi possível gerar o Word.');
    } finally {
      setExporting(false);
    }
  }

  // Corpo do papel: preto e cinza, como os relatórios; cada pergunta é
  // um bloco (a paginação corta entre perguntas, nunca no meio da folha).
  const printBody = (
    <>
      <h2 style={{ margin: '0 0 4px', color: TEXT, fontSize: 19 }}>{assignment.form_title}</h2>
      <p style={{ margin: '0 0 16px', color: MUTED, fontSize: 13 }}>
        Paciente: <b style={{ color: TEXT }}>{patientName}</b>
        {' · '}Enviado em {formatDay(assignment.created_at)}
        {assignment.submitted_at ? ` · Respondido em ${formatDay(assignment.submitted_at)}` : ' · Ainda não enviado pelo paciente'}
      </p>
      {rows.map(row => (row.kind === 'section' ? (
        <h3 key={row.id} style={{ margin: '18px 0 6px', color: TEXT, fontSize: 15, textTransform: 'uppercase' }}>{row.label}</h3>
      ) : (
        <div key={row.id} style={{ margin: '0 0 10px', fontSize: 14, lineHeight: 1.55 }}>
          <p style={{ margin: 0, color: MUTED, fontWeight: 600 }}>{row.label}</p>
          <p style={{ margin: 0, color: row.value ? TEXT : MUTED, whiteSpace: 'pre-line' }}>{row.value || 'Sem resposta'}</p>
        </div>
      )))}
    </>
  );

  const accentStyle = {
    '--clinic-accent': accentPalette.accent,
    '--clinic-accent-shade': accentPalette.shade,
    '--clinic-accent-soft': accentPalette.soft,
  };

  return (
    <div className="pq-overlay" role="dialog" aria-modal="true" aria-label={`Respostas de ${patientName}`} {...dismiss.backdropProps}>
      <div className="pq-panel pq-panel--narrow">
        <header className="pq-panel-head">
          <div>
            <h3>{assignment.form_title}</h3>
            <p>{patientName} · {status.label}</p>
          </div>
          <button type="button" className="pq-close" onClick={onClose} aria-label="Fechar">×</button>
        </header>

        <div className="pq-panel-body">
          <div className="pq-summary">
            <span>Enviado em <b>{formatDay(assignment.created_at)}</b></span>
            {assignment.due_date && <span>Prazo <b>{formatDueDate(assignment.due_date)}</b></span>}
            {assignment.submitted_at && <span>Respondido em <b>{formatDay(assignment.submitted_at)}</b></span>}
            {answers && <span><b>{answeredCount}</b> de {questionCount} respondidas</span>}
          </div>
          {assignment.status !== 'submitted' && answers && (
            <p className="gt-notice">O paciente ainda não enviou: estas são as respostas salvas até agora.</p>
          )}

          {loadError && <div className="gt-notice gt-notice-error" role="alert">{loadError}</div>}
          {!answers && !loadError && <p className="gt-empty">Abrindo as respostas…</p>}

          {answers && (
            <dl className="pq-answers">
              {rows.map(row => (row.kind === 'section' ? (
                <p key={row.id} className="pq-answers-section">{row.label}</p>
              ) : (
                <div key={row.id} className="pq-answer">
                  <dt>{row.label}</dt>
                  <dd className={row.value ? undefined : 'pq-answer-empty'}>{row.value || 'Sem resposta'}</dd>
                </div>
              )))}
            </dl>
          )}
          {exportError && <div className="gt-notice gt-notice-error" role="alert">{exportError}</div>}
        </div>

        <footer className="pq-panel-foot">
          <p className="pq-foot-note">Sai no papel timbrado da instituição.</p>
          <button type="button" className="gt-btn" onClick={handleWord} disabled={!answers || exporting}>
            {exporting ? 'Gerando Word…' : 'Baixar Word'}
          </button>
          <button type="button" className="gt-btn gt-btn--primary" onClick={handlePrint} disabled={!answers}>
            Imprimir / salvar PDF
          </button>
        </footer>
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

export default FormResponseDialog;
