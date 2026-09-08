import { useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Panel } from '../ui/Panel';
import { AiCorrectionButton } from '../ui/AiCorrectionButton';
import { AI_SURFACES } from '../../services/aiCorrectionService';
import {
  PSYCHOLOGY_READING_DISCLAIMER,
  generatePsychologyReading,
} from '../../services/psychologyAiService';
import {
  PSYCHOLOGY_AXES,
  PSYCHOLOGY_RISK_GROUP,
  getPsychologySelected,
  getPsychologyTextFields,
} from '../../data/psychologyAnamnese';
import { buildReportAccentPalette, buildReportContactItems } from '../../utils/reportUtils';
import { isAiDraftPendingReview } from '../../utils/reportAiReview';
import {
  PrintFooter,
  PrintLetterhead,
  ReportContactFooter,
} from '../report/reportPrint';
import { paginateReportBody } from '../report/reportPagination';
import { PSYCHOLOGY_INFORMANT_OPTIONS } from '../../data/psychologyIntakeProfiles';

// ============================================================
// Relatório de Psicologia. Mesmo papel timbrado, logo, marca d'água e
// paginação da Acup (infra compartilhada em components/report), com
// conteúdo psicológico vindo da sessão. Toda redação da IA nasce como
// RASCUNHO revisável e exige confirmação profissional antes de imprimir.
//
// Rodada 1: dois modos — "Registro interno" e "Relatório psicológico".
// Declaração e resumo de encaminhamento entram na Rodada 2, com a
// psicóloga. NUNCA fecha diagnóstico ou conduta automaticamente.
// ============================================================

function today() {
  return new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

function shortDate() {
  return new Date().toLocaleDateString('pt-BR');
}

function sanitizeHtml(html) {
  const doc = new DOMParser().parseFromString(`<div>${html || ''}</div>`, 'text/html');
  doc.querySelectorAll('script,style,iframe,object,embed,link,meta').forEach(el => el.remove());
  doc.querySelectorAll('*').forEach(el => {
    [...el.attributes].forEach(attr => {
      const name = attr.name.toLowerCase();
      const isEventHandler = name.startsWith('on');
      const isScriptUrl = ['href', 'src', 'xlink:href'].includes(name)
        && /^\s*javascript:/i.test(attr.value);
      if (isEventHandler || isScriptUrl) el.removeAttribute(attr.name);
    });
  });
  return doc.body.firstChild?.innerHTML || '';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

function InlineRow({ label, value, fallback = 'Não preenchido.' }) {
  return (
    <p style={{ margin: '14px 0', lineHeight: 1.65, fontSize: 16 }}>
      <b>{label}:</b> {value || fallback}
    </p>
  );
}

const MODOS = ['Registro interno', 'Relatório psicológico'];
const DEFAULT_ACCENT = '#0E2A4A';

export function PsychologyRelatorio({ session, evolucoes: evolucoesProp, selectedPatient, therapistProfile, onRelatorioChange }) {
  const [modo, setModo] = useState('Registro interno');
  const [editing, setEditing] = useState(false);
  const [draftHtml, setDraftHtml] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const reportBodyRef = useRef(null);
  const editableRef = useRef(null);
  const printMeasureRef = useRef(null);
  const printHeaderMeasureRef = useRef(null);
  const printFooterMeasureRef = useRef(null);
  const [printDoc, setPrintDoc] = useState({ pages: [''], bodyHeightPx: null });

  const nome = selectedPatient?.name || 'Paciente não informado';
  const terapeuta = therapistProfile?.full_name || 'Profissional';
  const therapistSpecialty = therapistProfile?.specialty || 'Psicologia';
  const therapistRegistration = therapistProfile?.professional_registration || '';
  const therapistEmail = therapistProfile?.email || '';

  // Conteúdo clínico vindo da sessão.
  const fields = getPsychologyTextFields(session.intakeProfile, session.contextModules)
    .map(f => ({ label: f.label, value: String(session.fields?.[f.id] || '').trim() }))
    .filter(f => f.value);
  const axes = PSYCHOLOGY_AXES
    .map(a => ({ label: a.label, value: String(session.axisNotes?.[a.id] || '').trim() }))
    .filter(a => a.value);
  const riskSigns = getPsychologySelected(session.selectedMap, PSYCHOLOGY_RISK_GROUP);
  const riskNotes = String(session.riskNotes || '').trim();
  // evolucoesProp já vem mesclada (legado + patient_evolutions) quando
  // PsychologyWorkspace passa — ver utils/evolutionHistory.
  const evolucoes = Array.isArray(evolucoesProp)
    ? evolucoesProp
    : (Array.isArray(session.evolucoes) ? session.evolucoes : []);
  const complementaryQuestions = Array.isArray(session.complementaryQuestions)
    ? session.complementaryQuestions.filter(item => String(item.question || '').trim())
    : [];
  const answeredComplementaryQuestions = complementaryQuestions
    .filter(item => String(item.answer || '').trim());
  const complementaryInformant = item => {
    const label = PSYCHOLOGY_INFORMANT_OPTIONS
      .find(option => option.id === item.informantType)?.label || '';
    return [label, String(item.informantName || '').trim()].filter(Boolean).join(' — ');
  };
  const sessaoLabel = evolucoes.length
    ? `${evolucoes.length} sessão(ões) registrada(s)`
    : 'Avaliação inicial';

  // Dados institucionais da clínica (idêntico à Acup).
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

  const edits = session.relatorio || {};
  const editedEntry = edits[modo];
  const sanitizedEditedHtml = editedEntry ? sanitizeHtml(editedEntry.html) : '';
  const aiDraftPendingReview = isAiDraftPendingReview(editedEntry);

  function persistEdits(next) {
    onRelatorioChange?.(next);
  }

  function startEditing() {
    setDraftHtml(editedEntry?.html ?? sanitizeHtml(reportBodyRef.current?.innerHTML || ''));
    setEditing(true);
  }

  function saveEditing() {
    const html = sanitizeHtml(editableRef.current?.innerHTML || '');
    const editedAt = new Date().toISOString();
    persistEdits({
      ...edits,
      [modo]: {
        html,
        editedAt,
        aiDraft: Boolean(editedEntry?.aiDraft),
        modelVersion: editedEntry?.modelVersion,
        aiReviewedAt: editedEntry?.aiDraft ? editedAt : editedEntry?.aiReviewedAt,
      },
    });
    setEditing(false);
  }

  function cancelEditing() {
    setEditing(false);
  }

  function restoreGenerated() {
    if (!window.confirm('Descartar o texto editado e voltar ao texto gerado automaticamente?')) return;
    const next = { ...edits };
    delete next[modo];
    persistEdits(next);
  }

  function changeModo(m) {
    if (editing) return;
    setModo(m);
  }

  function confirmAiDraftReview() {
    if (!editedEntry?.aiDraft) return;
    persistEdits({
      ...edits,
      [modo]: { ...editedEntry, aiReviewedAt: new Date().toISOString() },
    });
  }

  function handlePrint() {
    if (aiDraftPendingReview) {
      setAiError('Confirme a revisão profissional do rascunho de IA antes de imprimir ou gerar o PDF.');
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

  // Rascunho por IA: reusa a leitura da anamnese (psych-reading) como
  // texto-base do relatório. Nasce como rascunho pendente de revisão.
  async function handleAiDraft() {
    setAiError(null);
    setAiLoading(true);
    try {
      const reading = await generatePsychologyReading(session, { patientName: nome });
      const parts = [];
      if (reading.overview) parts.push(reading.overview);
      if (Array.isArray(reading.hypotheses) && reading.hypotheses.length) {
        parts.push(`Hipóteses de trabalho (não é diagnóstico): ${reading.hypotheses.map(h => h.name).join('; ')}.`);
      }
      // Pergunta apenas sugerida pela IA não entra no documento. O relatório
      // consome somente as perguntas que a profissional selecionou e respondeu.
      if (answeredComplementaryQuestions.length) {
        parts.push(`Informações complementares registradas: ${answeredComplementaryQuestions
          .map(item => `${item.question} — ${item.answer}${complementaryInformant(item) ? ` (${complementaryInformant(item)})` : ''}`)
          .join('; ')}.`);
      }
      const html = parts.map(p => `<p>${escapeHtml(p)}</p>`).join('');
      persistEdits({
        ...edits,
        [modo]: {
          html,
          editedAt: new Date().toISOString(),
          aiDraft: true,
          aiReviewedAt: null,
          modelVersion: reading.modelVersion,
        },
      });
    } catch (err) {
      setAiError(err.message || 'Falha ao gerar o rascunho.');
    } finally {
      setAiLoading(false);
    }
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

  const printFooter = <ReportContactFooter items={contactItems} clinicName={clinicName} />;

  const generatedBody = (
    <>
      {modo === 'Registro interno' && (
        <>
          <h2 style={{ margin: '0 0 24px', textTransform: 'uppercase', color: 'var(--navy)' }}>REGISTRO CLÍNICO INTERNO</h2>
          <InlineRow label="Paciente" value={`${nome}.`} fallback="não informado." />
          <InlineRow label="Momento" value={`${sessaoLabel}.`} />
          {fields.map(f => <InlineRow key={f.label} label={f.label} value={`${f.value}.`} />)}
          {axes.length > 0 && (
            <>
              <h3 style={{ margin: '18px 0 6px', color: 'var(--navy)', fontSize: 17 }}>Eixos de formulação</h3>
              {axes.map(a => <InlineRow key={a.label} label={a.label} value={`${a.value}.`} />)}
            </>
          )}
          {(riskSigns.length > 0 || riskNotes) && (
            <>
              <h3 style={{ margin: '18px 0 6px', color: '#b3261e', fontSize: 17 }}>Risco</h3>
              {riskSigns.length > 0 && <InlineRow label="Sinais marcados" value={`${riskSigns.join(', ')}.`} />}
              {riskNotes && <InlineRow label="Conduta anotada" value={`${riskNotes}.`} />}
            </>
          )}
          {complementaryQuestions.length > 0 && (
            <>
              <h3 style={{ margin: '18px 0 6px', color: 'var(--navy)', fontSize: 17 }}>Perguntas complementares</h3>
              {complementaryQuestions.map((item, index) => (
                <InlineRow
                  key={item.id || index}
                  label={`${index + 1}. ${item.question}`}
                  value={String(item.answer || '').trim()
                    ? `${item.answer}${complementaryInformant(item) ? ` — Informante: ${complementaryInformant(item)}` : ''}`
                    : 'Pendente de resposta.'}
                />
              ))}
            </>
          )}
        </>
      )}

      {modo === 'Relatório psicológico' && (
        <>
          <h2 style={{ margin: '0 0 8px', textTransform: 'uppercase', color: 'var(--navy)' }}>RELATÓRIO PSICOLÓGICO</h2>
          <p style={{ textAlign: 'center', margin: '0 0 24px', color: '#64748b', fontSize: 13 }}>
            {therapistSpecialty} • {clinicName}
          </p>

          <InlineRow label="1. Identificação" value={`${nome}.`} />
          {fields.map((f, i) => <InlineRow key={f.label} label={`${i + 2}. ${f.label}`} value={`${f.value}.`} />)}

          {axes.length > 0 && (
            <p style={{ margin: '14px 0', lineHeight: 1.65, fontSize: 16 }}>
              <b>Formulação por eixos:</b> {axes.map(a => `${a.label} — ${a.value}`).join('; ')}.
            </p>
          )}

          {riskSigns.length > 0 && (
            <p style={{ margin: '14px 0', lineHeight: 1.65, fontSize: 16 }}>
              <b>Avaliação de risco:</b> {riskSigns.join(', ')}.{riskNotes ? ` Conduta: ${riskNotes}.` : ''}
            </p>
          )}

          {answeredComplementaryQuestions.length > 0 && (
            <>
              <h3 style={{ margin: '18px 0 6px', color: 'var(--navy)', fontSize: 17 }}>Informações complementares</h3>
              {answeredComplementaryQuestions.map((item, index) => (
                <InlineRow
                  key={item.id || index}
                  label={item.question}
                  value={`${item.answer}${complementaryInformant(item) ? ` — Informante: ${complementaryInformant(item)}` : ''}`}
                />
              ))}
            </>
          )}

          <p style={{ margin: '14px 0', lineHeight: 1.65, fontSize: 16 }}>
            <b>Observação técnica:</b> este relatório organiza os dados registrados em atendimento e
            deve ser lido e validado pela profissional responsável. Não substitui avaliação
            diagnóstica formal.
          </p>

          <p style={{ textAlign: 'right', marginTop: 40, lineHeight: 1.8 }}>
            <b>{terapeuta}</b><br />
            {clinicName} — {therapistSpecialty}<br />
            {therapistRegistration && <><span>{therapistRegistration}</span><br /></>}
            {therapistEmail && <><span>{therapistEmail}</span><br /></>}
            <span style={{ fontSize: 12, color: '#94a3b8' }}>{today()}</span>
          </p>
        </>
      )}
    </>
  );

  return (
    <Panel title="Relatório — Psicologia">
      <div className="report-toolbar no-print">
        {MODOS.map(m => (
          <button
            key={m}
            className={`tag${modo === m ? ' active' : ''}`}
            onClick={() => changeModo(m)}
            disabled={editing && modo !== m}
          >
            {m}
          </button>
        ))}
      </div>

      <div className="alert no-print psi-draft-banner" style={{ marginBottom: 16 }}>
        <b>Documento provisório.</b> O conteúdo vem da anamnese ainda em validação; revise antes de emitir.
      </div>

      {clinicLoadError && (
        <div className="alert no-print" style={{ marginBottom: 16 }}>
          Os dados institucionais da clínica não puderam ser carregados. O relatório está usando o cadastro básico do perfil.
        </div>
      )}

      {editedEntry && !editing && (
        <div className="report-edited-banner no-print">
          <span>
            {editedEntry.aiDraft ? '✦ ' : '✏️ '}
            {editedEntry.aiDraft ? 'Rascunho gerado por IA' : 'Texto editado manualmente'} em {new Date(editedEntry.editedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}.
            {editedEntry.aiDraft
              ? aiDraftPendingReview
                ? ' Confirme a revisão profissional antes de imprimir.'
                : ' Revisão profissional confirmada.'
              : ' A impressão usa o texto editado.'}
          </span>
          <button className="tag" type="button" onClick={restoreGenerated}>
            Restaurar texto automático
          </button>
          {aiDraftPendingReview && (
            <button className="tag" type="button" onClick={confirmAiDraftReview}>
              Confirmar revisão profissional
            </button>
          )}
          {editedEntry.aiDraft && (
            <AiCorrectionButton
              surface={AI_SURFACES.PSYCH_READING}
              aiOutput={{ mode: modo, html: editedEntry.html }}
              contextSnapshot={{ reportMode: modo }}
              modelVersion={editedEntry.modelVersion}
              patientName={nome}
              summary={String(editedEntry.html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}
              label="Corrigir interpretação"
            />
          )}
        </div>
      )}

      {aiError && <div className="alert no-print" style={{ marginBottom: 16 }}>{aiError}</div>}

      <div
        className={`report report-screen-only${editing ? ' report-editing' : ''}`}
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
                {printFooter}
              </td>
            </tr>
          </tfoot>

          <tbody>
            <tr>
              <td className="report-sheet-cell report-sheet-cell-body">
                {editing ? (
                  <div
                    className="report-body"
                    ref={editableRef}
                    contentEditable
                    suppressContentEditableWarning
                    dangerouslySetInnerHTML={{ __html: draftHtml }}
                  />
                ) : editedEntry ? (
                  <div
                    className="report-body"
                    ref={reportBodyRef}
                    dangerouslySetInnerHTML={{ __html: sanitizedEditedHtml }}
                  />
                ) : (
                  <div className="report-body" ref={reportBodyRef}>
                    {generatedBody}
                  </div>
                )}
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
            <div className="rpage-footer">
              <PrintFooter items={contactItems} clinicName={clinicName} />
            </div>
          </section>
        ))}
      </div>

      <div className="report-actions no-print">
        {editing ? (
          <>
            <button className="primary-button" onClick={saveEditing}>Salvar edição</button>
            <button className="tag" onClick={cancelEditing}>Cancelar</button>
          </>
        ) : (
          <>
            <button
              className="primary-button"
              onClick={handlePrint}
              disabled={aiDraftPendingReview}
              title={aiDraftPendingReview ? 'Confirme a revisão profissional do rascunho de IA antes de imprimir.' : undefined}
            >
              Imprimir / PDF
            </button>
            <button className="tag" onClick={handleAiDraft} disabled={aiLoading} title={PSYCHOLOGY_READING_DISCLAIMER}>
              {aiLoading ? 'Gerando rascunho…' : '✦ Gerar rascunho com IA'}
            </button>
            <button className="tag" onClick={startEditing}>✏️ Editar relatório</button>
            <button className="tag" onClick={() => {
              const txt = reportBodyRef.current?.innerText || '';
              navigator.clipboard?.writeText(txt).then(() => alert('Copiado!'));
            }}>Copiar texto</button>
          </>
        )}
      </div>
    </Panel>
  );
}
