import { useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Panel } from '../ui/Panel';
import { getActiveTextFields, getProfile, getSelected } from '../../data/anamneseKit';
import { buildReportAccentPalette, buildReportContactItems } from '../../utils/reportUtils';
import {
  PrintFooter,
  PrintLetterhead,
  ReportContactFooter,
} from '../report/reportPrint';
import { paginateReportBody } from '../report/reportPagination';

// ============================================================
// Relatório genérico de disciplina. Mesmo papel timbrado, logo, marca
// d'água e paginação da Acupuntura e da Psicologia (infra compartilhada
// em components/report), com o conteúdo vindo da configuração.
//
// Dois modos, definidos por disciplina:
//  * "Registro interno" — a ficha inteira, para o prontuário;
//  * relatório externo — RESUMO. Documento que sai da clínica não
//    despeja a anamnese toda: leva queixa, formulação e conduta. Menos
//    dado sensível circulando é decisão de privacidade, não de layout.
//
// O texto gerado é editável e a edição manda na impressão. Nada aqui
// fecha diagnóstico.
// ============================================================

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

function InlineRow({ label, value, fallback = 'Não preenchido.' }) {
  return (
    <p style={{ margin: '14px 0', lineHeight: 1.65, fontSize: 16 }}>
      <b>{label}:</b> {value || fallback}
    </p>
  );
}

const DEFAULT_ACCENT = '#0E2A4A';

export function DisciplineRelatorio({ config, session, selectedPatient, therapistProfile, onRelatorioChange }) {
  const modes = config.report.modes;
  const [modeId, setModeId] = useState(modes[0].id);
  const [editing, setEditing] = useState(false);
  const [draftHtml, setDraftHtml] = useState('');
  const reportBodyRef = useRef(null);
  const editableRef = useRef(null);
  const printMeasureRef = useRef(null);
  const printHeaderMeasureRef = useRef(null);
  const printFooterMeasureRef = useRef(null);
  const [printDoc, setPrintDoc] = useState({ pages: [''], bodyHeightPx: null });

  const mode = modes.find(item => item.id === modeId) || modes[0];
  const nome = selectedPatient?.name || 'Paciente não informado';
  const terapeuta = therapistProfile?.full_name || 'Profissional';

  // ---- Conteúdo clínico vindo da sessão ----
  const profile = getProfile(config, session.intakeProfile);
  const activeFields = getActiveTextFields(config, session.intakeProfile, session.contextModules);
  const allFields = activeFields
    .map(field => ({ id: field.id, label: field.label, value: String(session.fields?.[field.id] || '').trim() }))
    .filter(field => field.value);
  const summaryFields = allFields
    .filter(field => config.report.summaryFieldIds.includes(field.id));
  const fields = mode.scope === 'summary' ? summaryFields : allFields;

  const axes = config.axes
    .map(axis => ({ label: axis.label, value: String(session.axisNotes?.[axis.id] || '').trim() }))
    .filter(axis => axis.value);
  const riskSigns = getSelected(session.selectedMap, config.riskGroup);
  const riskNotes = String(session.riskNotes || '').trim();
  const evolucoes = Array.isArray(session.evolucoes) ? session.evolucoes : [];
  const sessaoLabel = evolucoes.length
    ? `${evolucoes.length} sessão(ões) registrada(s)`
    : 'Avaliação inicial';

  // ---- Dados institucionais (idêntico às demais disciplinas) ----
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
  const editedEntry = edits[mode.id];
  const sanitizedEditedHtml = editedEntry ? sanitizeHtml(editedEntry.html) : '';

  function startEditing() {
    setDraftHtml(editedEntry?.html ?? sanitizeHtml(reportBodyRef.current?.innerHTML || ''));
    setEditing(true);
  }

  function saveEditing() {
    onRelatorioChange?.({
      ...edits,
      [mode.id]: { html: sanitizeHtml(editableRef.current?.innerHTML || ''), editedAt: new Date().toISOString() },
    });
    setEditing(false);
  }

  function restoreGenerated() {
    if (!window.confirm('Descartar o texto editado e voltar ao texto gerado automaticamente?')) return;
    const next = { ...edits };
    delete next[mode.id];
    onRelatorioChange?.(next);
  }

  function handlePrint() {
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

  const generatedBody = (
    <>
      <h2 style={{ margin: '0 0 24px', textTransform: 'uppercase', color: 'var(--navy)' }}>
        {mode.title}
      </h2>
      <InlineRow label="Paciente" value={`${nome}.`} fallback="não informado." />
      <InlineRow label="Percurso" value={profile ? `${profile.label}.` : ''} fallback="não definido." />
      <InlineRow label="Momento" value={`${sessaoLabel}.`} />

      {fields.map(field => <InlineRow key={field.id} label={field.label} value={`${field.value}.`} />)}

      {axes.length > 0 && (
        <>
          <h3 style={{ margin: '26px 0 10px', color: 'var(--navy)' }}>{config.axesTitle}</h3>
          {axes.map(axis => <InlineRow key={axis.label} label={axis.label} value={`${axis.value}.`} />)}
        </>
      )}

      {riskSigns.length > 0 && (
        <>
          <h3 style={{ margin: '26px 0 10px', color: '#b3261e' }}>{config.riskTitle}</h3>
          <InlineRow label="Sinais marcados" value={`${riskSigns.join('; ')}.`} />
          {/* A anotação de risco é detalhe do prontuário: não sai da clínica. */}
          {mode.scope === 'full' && riskNotes && (
            <InlineRow label="Conduta registrada" value={`${riskNotes}.`} />
          )}
        </>
      )}

      {mode.scope === 'full' && evolucoes.length > 0 && (
        <>
          <h3 style={{ margin: '26px 0 10px', color: 'var(--navy)' }}>Evolução registrada</h3>
          {evolucoes.map((evolucao, index) => (
            <InlineRow
              key={evolucao.id || index}
              label={`Sessão ${evolucao.sessao || index + 1}${evolucao.data ? ` — ${evolucao.data}` : ''}`}
              value={config.evolution.fields
                .map(field => String(evolucao[field.id] || '').trim())
                .filter(Boolean)
                .join(' ')}
              fallback="sem descrição registrada."
            />
          ))}
        </>
      )}

      {mode.scope === 'summary' && (
        <p style={{ margin: '26px 0 0', fontSize: 14, lineHeight: 1.6, color: '#475569' }}>
          {config.report.externalNotice}
        </p>
      )}
    </>
  );

  const printFooter = <ReportContactFooter items={contactItems} clinicName={clinicName} />;

  return (
    <Panel title={`Relatório — ${config.label}`}>
      <div className="report-mode-tabs no-print">
        {modes.map(item => (
          <button
            key={item.id}
            type="button"
            className={`tag${item.id === mode.id ? ' active' : ''}`}
            disabled={editing}
            onClick={() => setModeId(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="box no-print">
        <p className="small" style={{ margin: 0 }}>
          <b>Vocabulário em validação.</b> {config.draftNotice}
        </p>
      </div>

      {clinicLoadError && (
        <div className="alert no-print" style={{ marginBottom: 16 }}>
          Os dados institucionais da clínica não puderam ser carregados. O relatório está usando o
          cadastro básico do perfil.
        </div>
      )}

      {editedEntry && !editing && (
        <div className="report-edited-banner no-print">
          <span>
            ✏️ Texto editado manualmente em{' '}
            {new Date(editedEntry.editedAt).toLocaleString('pt-BR', {
              day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
            })}. A impressão usa o texto editado.
          </span>
          <button className="tag" type="button" onClick={restoreGenerated}>
            Restaurar texto automático
          </button>
        </div>
      )}

      <div className={`report report-screen-only${editing ? ' report-editing' : ''}`} style={accentStyle}>
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
              <td className="report-sheet-cell report-sheet-cell-foot">{printFooter}</td>
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
                  <div className="report-body" ref={reportBodyRef}>{generatedBody}</div>
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
            <button className="tag" onClick={() => setEditing(false)}>Cancelar</button>
          </>
        ) : (
          <>
            <button className="primary-button" onClick={handlePrint}>Imprimir / PDF</button>
            <button className="tag" onClick={startEditing}>Editar texto</button>
          </>
        )}
      </div>
    </Panel>
  );
}
