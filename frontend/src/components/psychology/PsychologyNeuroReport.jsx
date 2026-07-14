import { useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Panel } from '../ui/Panel';
import { AiCorrectionButton } from '../ui/AiCorrectionButton';
import { AI_SURFACES } from '../../services/aiCorrectionService';
import { generateNeuropsychologyReport } from '../../services/psychologyAiService';
import { buildReportAccentPalette, buildReportContactItems } from '../../utils/reportUtils';
import {
  PrintFooter,
  PrintLetterhead,
  ReportContactFooter,
} from '../report/reportPrint';
import { paginateReportBody } from '../report/reportPagination';

const DEFAULT_ACCENT = '#0E2A4A';

function shortDate() {
  return new Date().toLocaleDateString('pt-BR');
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char]));
}

function sanitizeHtml(html) {
  const doc = new DOMParser().parseFromString(`<div>${html || ''}</div>`, 'text/html');
  doc.querySelectorAll('script,style,iframe,object,embed,link,meta').forEach(element => element.remove());
  doc.querySelectorAll('*').forEach(element => {
    [...element.attributes].forEach(attribute => {
      if (attribute.name.toLowerCase().startsWith('on')) element.removeAttribute(attribute.name);
    });
  });
  return doc.body.firstChild?.innerHTML || '';
}

function buildDeterministicHtml(evaluation) {
  const completed = (evaluation.sessions || []).filter(session =>
    session.status === 'concluida' || session.observations || session.partialResults);
  const instruments = (evaluation.instruments || []).filter(item => item.name);
  const integration = evaluation.integration || {};
  const blocks = [
    ['1. Histórico e demanda', evaluation.referral?.reason || 'Pendente de preenchimento profissional.'],
    ['2. Procedimentos', integration.procedures || instruments.map(item => item.name).join('; ') || 'Pendente de preenchimento profissional.'],
    ['3. Observações clínicas e evolução', integration.clinicalObservations || completed.map(session => `Sessão ${session.number}: ${session.observations || session.purpose}`).join(' ') || 'Pendente de preenchimento profissional.'],
    ['4. Resultados', integration.resultsSummary || instruments.map(item => item.professionalInterpretation).filter(Boolean).join(' ') || 'Pendente de revisão profissional.'],
    ['5. Análise integrativa', [integration.convergences, integration.divergences, integration.workingHypotheses].filter(Boolean).join(' ') || 'Pendente de revisão profissional.'],
    ['6. Considerações profissionais', integration.professionalConclusion || 'Pendente de conclusão profissional.'],
    ['7. Limitações', integration.limitations || 'Pendente de revisão profissional.'],
  ];
  return blocks.map(([heading, content]) => `<h3>${escapeHtml(heading)}</h3><p>${escapeHtml(content)}</p>`).join('');
}

export function PsychologyNeuroReport({ evaluation, selectedPatient, therapistProfile, onChange }) {
  const report = evaluation.report || {};
  const editorRef = useRef(null);
  const reportBodyRef = useRef(null);
  const printMeasureRef = useRef(null);
  const printHeaderMeasureRef = useRef(null);
  const printFooterMeasureRef = useRef(null);
  const [printDoc, setPrintDoc] = useState({ pages: [''], bodyHeightPx: null });
  const [editing, setEditing] = useState(false);
  const [draftHtml, setDraftHtml] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const visibleHtml = report.html ? sanitizeHtml(report.html) : buildDeterministicHtml(evaluation);
  const pendingReview = Boolean(report.aiDraft && !report.reviewedAt);

  const terapeuta = therapistProfile?.full_name || 'Profissional';

  // Dados institucionais da clínica: mesma fonte e mesmo papel timbrado
  // (logo, marca d'água, rodapé de contato) das demais impressões.
  const clinic = therapistProfile?.clinic || null;
  const clinicName = clinic?.name || therapistProfile?.clinic_name || 'Reability';
  const clinicLogo = clinic?.logo_url || '';
  const clinicMonogram = clinicName.trim().charAt(0).toUpperCase() || 'R';
  const accentColor = clinic?.brand_color || DEFAULT_ACCENT;
  const accentPalette = buildReportAccentPalette(accentColor, DEFAULT_ACCENT);
  const clinicDetails = [
    clinic?.legal_name,
    clinic?.cnpj ? `CNPJ ${clinic.cnpj}` : null,
  ].filter(Boolean).join(' • ');
  const contactItems = buildReportContactItems({ clinic, therapistProfile });
  const clinicLoadError = therapistProfile?.clinicLoadError;
  const watermarkEnabled = Boolean(clinicLogo) && clinic?.logo_watermark !== false;
  const accentStyle = {
    '--clinic-accent': accentPalette.accent,
    '--clinic-accent-shade': accentPalette.shade,
    '--clinic-accent-soft': accentPalette.soft,
  };

  const sessaoLabel = 'Avaliação neuropsicológica';
  const bodyHeadingHtml =
    `<h2 style="margin:0 0 8px;text-transform:uppercase;color:var(--navy)">Relatório de avaliação neuropsicológica</h2>`
    + `<p style="margin:0 0 24px;font-size:16px"><b>Paciente:</b> ${escapeHtml(selectedPatient?.name || 'Não informado')}</p>`;

  function updateReport(next) {
    onChange({ ...evaluation, report: next });
  }

  async function generateDraft() {
    setError(null);
    setLoading(true);
    try {
      const result = await generateNeuropsychologyReport(evaluation, { patientName: selectedPatient?.name });
      const html = result.sections
        .map(section => `<h3>${escapeHtml(section.heading)}</h3><p>${escapeHtml(section.content)}</p>`)
        .join('');
      updateReport({
        ...report,
        html,
        aiDraft: true,
        reviewedAt: null,
        generatedAt: new Date().toISOString(),
        modelVersion: result.modelVersion,
      });
    } catch (err) {
      setError(err.message || 'Falha ao gerar o rascunho.');
    } finally {
      setLoading(false);
    }
  }

  function startEditing() {
    setDraftHtml(visibleHtml);
    setEditing(true);
  }

  function saveEditing() {
    const html = sanitizeHtml(editorRef.current?.innerHTML || '');
    updateReport({
      ...report,
      html,
      aiDraft: Boolean(report.aiDraft),
      reviewedAt: new Date().toISOString(),
      editedAt: new Date().toISOString(),
    });
    setEditing(false);
  }

  function confirmReview() {
    updateReport({ ...report, reviewedAt: new Date().toISOString() });
  }

  function printReport() {
    if (pendingReview) {
      setError('Revise ou confirme o rascunho de IA antes de imprimir.');
      return;
    }
    const html = reportBodyRef.current?.innerHTML || '';
    const doc = paginateReportBody(html, {
      stage: printMeasureRef.current,
      header: printHeaderMeasureRef.current,
      footer: printFooterMeasureRef.current,
    });
    flushSync(() => setPrintDoc(doc));
    window.print();
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
          <span>{sessaoLabel}</span>
          <span>{terapeuta}</span>
        </div>
      </div>
      <span className="report-letterhead-rule" aria-hidden="true" />
    </header>
  );

  return (
    <Panel title="Relatório da avaliação neuropsicológica">
      <div className="alert psi-draft-banner no-print">
        <b>Fluxo protegido.</b> Primeiro entram os dados estruturados; depois a IA reorganiza o texto.
        A versão gerada fica bloqueada para impressão até revisão explícita da profissional.
      </div>
      {error && <div className="alert no-print">{error}</div>}
      {clinicLoadError && (
        <div className="alert no-print">
          Os dados institucionais da clínica não puderam ser carregados. O relatório está usando o cadastro básico do perfil.
        </div>
      )}
      {pendingReview && (
        <div className="report-edited-banner no-print">
          <span>Rascunho gerado por IA pendente de revisão.</span>
          <button type="button" className="tag" onClick={confirmReview}>Confirmar revisão profissional</button>
          <AiCorrectionButton
            surface={AI_SURFACES.PSYCH_READING}
            aiOutput={{ kind: 'avaliacao_neuropsicologica', html: report.html }}
            contextSnapshot={{ reportKind: 'avaliacao_neuropsicologica' }}
            modelVersion={report.modelVersion}
            patientName={selectedPatient?.name}
            summary={String(report.html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}
            label="Corrigir redação da IA"
          />
        </div>
      )}

      <div
        className={`report report-screen-only psi-neuro-report${editing ? ' report-editing' : ''}`}
        style={accentStyle}
      >
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
                <div className="report-body" ref={reportBodyRef}>
                  <div dangerouslySetInnerHTML={{ __html: bodyHeadingHtml }} />
                  {editing ? (
                    <div
                      ref={editorRef}
                      contentEditable
                      suppressContentEditableWarning
                      dangerouslySetInnerHTML={{ __html: draftHtml }}
                    />
                  ) : (
                    <div dangerouslySetInnerHTML={{ __html: visibleHtml }} />
                  )}
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="report-print-pages" style={accentStyle} aria-hidden="true">
        <div className="rpage-measure-stage">
          <div ref={printHeaderMeasureRef}>
            <PrintLetterhead
              clinicLogo={clinicLogo}
              clinicMonogram={clinicMonogram}
              clinicName={clinicName}
              clinicDetails={clinicDetails}
              dateLabel={shortDate()}
              sessaoLabel={sessaoLabel}
              terapeuta={terapeuta}
            />
          </div>
          <div ref={printFooterMeasureRef}>
            <PrintFooter items={contactItems} clinicName={clinicName} />
          </div>
          <div ref={printMeasureRef} className="rpage-body" />
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
              sessaoLabel={sessaoLabel}
              terapeuta={terapeuta}
            />
            <div
              className="rpage-body"
              style={printDoc.bodyHeightPx ? { height: printDoc.bodyHeightPx } : undefined}
              dangerouslySetInnerHTML={{ __html: html }}
            />
            <PrintFooter items={contactItems} clinicName={clinicName} />
          </section>
        ))}
      </div>

      <div className="report-actions no-print">
        {editing ? (
          <>
            <button type="button" className="primary-button" onClick={saveEditing}>Salvar edição e marcar como revisado</button>
            <button type="button" className="tag" onClick={() => setEditing(false)}>Cancelar</button>
          </>
        ) : (
          <>
            <button type="button" className="primary-button" onClick={printReport} disabled={pendingReview}>Imprimir / PDF</button>
            <button type="button" className="tag" onClick={generateDraft} disabled={loading}>{loading ? 'Gerando…' : '✦ Gerar rascunho com IA'}</button>
            <button type="button" className="tag" onClick={startEditing}>✏️ Editar relatório</button>
          </>
        )}
      </div>
    </Panel>
  );
}
