import { useRef, useState } from 'react';
import { Panel } from '../ui/Panel';
import { AiCorrectionButton } from '../ui/AiCorrectionButton';
import { AI_SURFACES } from '../../services/aiCorrectionService';
import { generateNeuropsychologyReport } from '../../services/psychologyAiService';

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
  const reportRef = useRef(null);
  const [editing, setEditing] = useState(false);
  const [draftHtml, setDraftHtml] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const visibleHtml = report.html ? sanitizeHtml(report.html) : buildDeterministicHtml(evaluation);
  const pendingReview = Boolean(report.aiDraft && !report.reviewedAt);

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
    window.print();
  }

  return (
    <Panel title="Relatório da avaliação neuropsicológica">
      <div className="alert psi-draft-banner no-print">
        <b>Fluxo protegido.</b> Primeiro entram os dados estruturados; depois a IA reorganiza o texto.
        A versão gerada fica bloqueada para impressão até revisão explícita da profissional.
      </div>
      {error && <div className="alert no-print">{error}</div>}
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

      <div className="report report-screen-only psi-neuro-report">
        <header className="report-letterhead">
          <div className="report-letterhead-main">
            <p className="app-eyebrow">{therapistProfile?.clinic?.name || therapistProfile?.clinic_name || 'Clínica'}</p>
            <h1>RELATÓRIO DE AVALIAÇÃO NEUROPSICOLÓGICA</h1>
            <p><b>Paciente:</b> {selectedPatient?.name || 'Não informado'}</p>
          </div>
        </header>
        {editing ? (
          <div
            ref={editorRef}
            className="report-body"
            contentEditable
            suppressContentEditableWarning
            dangerouslySetInnerHTML={{ __html: draftHtml }}
          />
        ) : (
          <div ref={reportRef} className="report-body" dangerouslySetInnerHTML={{ __html: visibleHtml }} />
        )}
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
