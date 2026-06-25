import { useRef, useState } from 'react';
import { Panel } from '../ui/Panel';
import { draftReport, REPORT_AI_DISCLAIMER } from '../../services/reportAiService';
import { AiCorrectionButton } from '../ui/AiCorrectionButton';
import { AI_SURFACES } from '../../services/aiCorrectionService';
import { buildPointEvidence, buildProtocolSummary, buildReferenceList } from '../../knowledge/reportFragments';
import { summarizeRehabilitation, formatOptionalMetric } from '../../services/rehabilitationService';
import {
  buildReportAccentPalette,
  buildReportContactItems,
  formatRegisteredSessionCount,
  getReportSessionInfo,
} from '../../utils/reportUtils';
import { isAiDraftPendingReview } from '../../utils/reportAiReview';

/* ── helpers ─────────────────────────────────────────────── */
function today() {
  return new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

function shortDate() {
  return new Date().toLocaleDateString('pt-BR');
}

// Remove scripts, atributos de evento e URLs javascript: do HTML
// editado antes de renderizar/persistir (conteúdo vem do próprio
// profissional via contentEditable, mas é persistido na sessão).
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

// Escapa o texto da IA antes de virar HTML do relatório (sanitizado de novo na renderização).
function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

function InlineRow({ label, value, fallback = 'Aguardando dados.' }) {
  return (
    <p style={{ margin: '14px 0', lineHeight: 1.65, fontSize: 16 }}>
      <b>{label}:</b> {value || fallback}
    </p>
  );
}

// Texto factual de uma medida funcional: valor atual (1 avaliação) ou
// primeira → última com a variação bruta. Sem rótulo de melhora/piora.
function rehabMetricText(metric, single) {
  if (single) return `${metric.label}: ${formatOptionalMetric(metric.ultimo, metric.suffix)}`;
  const range = `${formatOptionalMetric(metric.primeiro, metric.suffix)} → ${formatOptionalMetric(metric.ultimo, metric.suffix)}`;
  const delta = metric.delta !== null ? ` (Δ ${metric.delta > 0 ? '+' : ''}${metric.delta}${metric.suffix})` : '';
  return `${range ? `${metric.label}: ${range}` : ''}${delta}`;
}

function ReportContactIcon({ type }) {
  if (type === 'address') {
    return (
      <span className="report-contact-icon address" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M12 21s7-6.1 7-12A7 7 0 1 0 5 9c0 5.9 7 12 7 12Z" />
          <circle cx="12" cy="9" r="2.4" />
        </svg>
      </span>
    );
  }

  if (type === 'email') {
    return (
      <span className="report-contact-icon email" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M3.5 6.2h17a.8.8 0 0 1 .8.8v10a.8.8 0 0 1-.8.8h-17a.8.8 0 0 1-.8-.8V7a.8.8 0 0 1 .8-.8Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M3.4 7 12 13l8.6-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }

  return (
    <span className="report-contact-icon phone" aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        <path d="M8.8 7.2c-.2 0-.5.1-.7.4-.3.4-.7.9-.7 1.8 0 1 .7 2.1 1 2.5.2.3 1.8 2.9 4.5 4 2.2.8 2.7.7 3.2.6.5-.1 1.4-.6 1.6-1.2.2-.6.2-1.1.1-1.2-.1-.2-.3-.2-.6-.4l-1.6-.8c-.3-.1-.5-.1-.7.2l-.7.9c-.1.2-.3.2-.6.1-.3-.1-1.1-.4-2-1.2-.8-.7-1.3-1.5-1.5-1.8-.1-.3 0-.4.1-.6l.4-.5c.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.7-1.6c-.2-.4-.4-.4-.7-.4h-.6Z" />
      </svg>
    </span>
  );
}

function ReportContactFooter({ items, clinicName }) {
  return (
    <footer className="report-print-footer" aria-label="Contato da clínica">
      <span className="report-contact-segments" aria-hidden="true" />
      <div className="report-contact-list">
        {items.map(item => (
          <div className="report-contact-item" key={item.id}>
            <ReportContactIcon type={item.id} />
            <div className="report-contact-text">
              <span>{item.label}</span>
              <b>{item.value}</b>
            </div>
          </div>
        ))}
      </div>
      <div className="report-contact-baseline" aria-hidden="true">
        <span className="report-contact-baseline-name">{clinicName}</span>
        <span className="report-contact-bar" />
      </div>
    </footer>
  );
}

const MODOS = ['Resumo clínico', 'Relatório profissional', 'Orientação ao paciente'];
const DEFAULT_ACCENT = '#0E2A4A';

export function Relatorio({ state, analysis, selectedPatient, therapistProfile, onUpdate }) {
  const [modo, setModo] = useState('Resumo clínico');
  const [editing, setEditing] = useState(false);
  const [draftHtml, setDraftHtml] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const reportBodyRef = useRef(null);
  const editableRef = useRef(null);
  const { main, detail, protocol, safety, safetyAlerts = [] } = analysis;

  const nome    = selectedPatient?.name || state.nome || 'Paciente não informado';
  const idade   = state.idade ? `${state.idade} anos` : 'idade não informada';
  const queixa  = state.queixa;
  const historia= state.historia;
  const terapeuta = therapistProfile?.full_name || state.terapeuta || 'Terapeuta';
  const therapistSpecialty = therapistProfile?.specialty || 'Acupuntura e MTC';
  const therapistRegistration = therapistProfile?.professional_registration || '';
  const therapistEmail = therapistProfile?.email || '';
  const evolucoes = Array.isArray(state.evolucoes) ? state.evolucoes : [];
  const ultimaEvolucao = evolucoes[evolucoes.length - 1];
  const rehab = summarizeRehabilitation(state.reabilitacao);
  const rehabSingle = rehab?.total === 1;

  // Dados institucionais: clínica cadastrada > campo livre do perfil > padrão
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

  // A avaliação inicial conta como 1º encontro; o primeiro registro de evolução
  // corresponde ao relatório da 2ª sessão.
  const {
    registeredSessionCount,
    reportSessionNumber,
    label: sessaoLabel,
  } = getReportSessionInfo(evolucoes);

  const protocolSummary = buildProtocolSummary(protocol);
  const pointEvidence = buildPointEvidence(protocol);
  const references = buildReferenceList(protocol);
  const safetyMessages = [
    ...(safety || []),
    ...safetyAlerts.map(alert => alert.message),
  ];

  // Texto editado manualmente (persistido na sessão por modo de relatório)
  const edits = state.relatorioEdits || {};
  const editedEntry = edits[modo];
  const sanitizedEditedHtml = editedEntry ? sanitizeHtml(editedEntry.html) : '';
  const aiDraftPendingReview = isAiDraftPendingReview(editedEntry);

  function startEditing() {
    // Parte do texto editado salvo ou do HTML gerado renderizado no momento
    setDraftHtml(editedEntry?.html ?? sanitizeHtml(reportBodyRef.current?.innerHTML || ''));
    setEditing(true);
  }

  function saveEditing() {
    const html = sanitizeHtml(editableRef.current?.innerHTML || '');
    const editedAt = new Date().toISOString();
    onUpdate?.('relatorioEdits', {
      ...edits,
      [modo]: {
        html,
        editedAt,
        aiDraft: Boolean(editedEntry?.aiDraft),
        modelVersion: editedEntry?.modelVersion,
        // Salvar uma edição é uma ação explícita de revisão profissional.
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
    onUpdate?.('relatorioEdits', next);
  }

  function changeModo(m) {
    if (editing) return;
    setModo(m);
  }

  function confirmAiDraftReview() {
    if (!editedEntry?.aiDraft) return;
    onUpdate?.('relatorioEdits', {
      ...edits,
      [modo]: { ...editedEntry, aiReviewedAt: new Date().toISOString() },
    });
  }

  function handlePrint() {
    if (aiDraftPendingReview) {
      setAiError('Confirme a revisão profissional do rascunho de IA antes de imprimir ou gerar o PDF.');
      return;
    }
    window.print();
  }

  // Monta os dados estruturados (sem nome do paciente) e pede o rascunho à IA.
  // O resultado entra no buffer de edição do modo atual, para revisão.
  async function handleAiDraft() {
    setAiError(null);
    setAiLoading(true);
    try {
      const reportData = {
        modo,
        idade: state.idade || '',
        queixa, historia,
        hipotese: main,
        raiz: detail?.root, manifestacao: detail?.manifestation,
        oitoPrincipios: detail?.eight, cincoElementos: detail?.elements,
        principioTerapeutico: protocol?.goal,
        protocolo: protocolSummary,
        pontos: pointEvidence,
        referencias: references,
        evolucao: {
          numeroSessao: reportSessionNumber,
          ultima: ultimaEvolucao
            ? { data: ultimaEvolucao.data, dor: ultimaEvolucao.dor, sono: ultimaEvolucao.sono, ansiedade: ultimaEvolucao.ansiedade }
            : null,
        },
        seguranca: safetyMessages,
        reabilitacao: rehab
          ? {
              total: rehab.total,
              periodo: { de: rehab.primeira.data, ate: rehab.ultima.data },
              objetivoFuncional: rehab.objetivoFuncional,
              medidas: rehab.metricas.map(m => ({ medida: m.label, primeiro: m.primeiro, ultimo: m.ultimo })),
            }
          : null,
      };
      const res = await draftReport(modo, reportData, { patientName: nome });
      const html = res.paragraphs.map(p => `<p>${escapeHtml(p)}</p>`).join('');
      onUpdate?.('relatorioEdits', {
        ...edits,
        [modo]: {
          html,
          editedAt: new Date().toISOString(),
          aiDraft: true,
          aiReviewedAt: null,
          modelVersion: res.modelVersion,
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
      {modo === 'Resumo clínico' && (
        <>
          <h2 style={{ margin: '0 0 24px', textTransform: 'uppercase', color: 'var(--navy)' }}>RESUMO CLÍNICO INTERNO</h2>
          <InlineRow label="Paciente" value={`${nome}.`} fallback="não informado." />
          <InlineRow label="Sessão" value={`${sessaoLabel}${registeredSessionCount > 0 ? ` (${formatRegisteredSessionCount(registeredSessionCount)})` : ''}.`} />
          <InlineRow label="Queixa" value={queixa ? `${queixa}.` : ''} fallback="não preenchida." />
          <InlineRow label="Hipótese atual" value={main ? `${main}.` : ''} />
          <InlineRow label="Princípio terapêutico" value={protocol?.goal} fallback="Preencha os dados para gerar raciocínio terapêutico." />
          <InlineRow label="Conduta" value="manter acompanhamento e ajustar protocolo conforme resposta clínica." />
          {rehab && (
            <InlineRow
              label="Reabilitação funcional"
              value={`${rehab.total} avaliação(ões) registrada(s); última em ${rehab.ultima.data}.`}
            />
          )}
        </>
      )}

      {modo === 'Relatório profissional' && (
        <>
          <h2 style={{ margin: '0 0 8px', textTransform: 'uppercase', color: 'var(--navy)' }}>RELATÓRIO DE AVALIAÇÃO ENERGÉTICA INTEGRATIVA</h2>
          <p style={{ textAlign: 'center', margin: '0 0 24px', color: '#64748b', fontSize: 13 }}>
            Medicina Tradicional Chinesa • Acupuntura • {clinicName}
          </p>

          <InlineRow label="1. Identificação" value={`${nome}, ${idade}.`} />
          <InlineRow label="2. Queixa principal" value={queixa ? `${queixa}.` : ''} fallback="Não preenchida." />
          <InlineRow label="3. História clínica" value={historia ? `${historia}.` : ''} fallback="Não preenchida." />

          <p style={{ margin: '14px 0', lineHeight: 1.65, fontSize: 16 }}>
            <b>4. Integração semiológica:</b> foram considerados sintomas, emoções, clima, língua, pulso bilateral por posição/órgão, Oito Princípios, Cinco Movimentos e substâncias fundamentais.
          </p>

          <InlineRow label="5. Hipótese energética" value={main ? `${main}.` : ''} />
          <InlineRow label="5.1. Padrão raiz" value={detail.root ? `${detail.root}.` : ''} />
          <InlineRow label="5.2. Manifestação" value={detail.manifestation ? `${detail.manifestation}.` : ''} />
          <InlineRow label="6. Oito Princípios" value={detail.eight ? `${detail.eight}.` : ''} fallback="Aguardando classificação." />
          <InlineRow label="7. Correlação pelos 5 Elementos" value={detail.elements ? `${detail.elements}.` : ''} fallback="Aguardando leitura." />
          <InlineRow label="8. Princípio terapêutico" value={protocol.goal} fallback="Preencha os dados para gerar raciocínio terapêutico." />

          <p style={{ margin: '14px 0', lineHeight: 1.65, fontSize: 16 }}>
            <b>9. Protocolo sugerido:</b> sistêmicos: {protocolSummary.body}; auriculoterapia: {protocolSummary.ear}; moxa: {protocolSummary.moxa}; laser/eletro: {protocolSummary.laser}.
          </p>

          {pointEvidence.length > 0 && (
            <p style={{ margin: '14px 0', lineHeight: 1.65, fontSize: 16 }}>
              <b>9.1. Justificativa dos pontos:</b> {pointEvidence.join(' ')}
            </p>
          )}

          <p style={{ margin: '14px 0', lineHeight: 1.65, fontSize: 16 }}>
            <b>10. Evolução longitudinal:</b> relatório emitido {reportSessionNumber === 0 ? 'na avaliação inicial, antes da primeira sessão registrada' : `após a ${reportSessionNumber}ª sessão`}.
            {ultimaEvolucao
              ? ` Última sessão em ${ultimaEvolucao.data}: dor ${ultimaEvolucao.dor || 'não informada'}, sono ${ultimaEvolucao.sono || 'não informado'}, ansiedade ${ultimaEvolucao.ansiedade || 'não informada'}.`
              : ' Sem registros evolutivos.'}
          </p>
          {rehab && (
            <p style={{ margin: '14px 0', lineHeight: 1.65, fontSize: 16 }}>
              <b>10.1. Reabilitação funcional:</b> {rehab.total} avaliação(ões) {rehabSingle ? 'registrada' : `entre ${rehab.primeira.data} e ${rehab.ultima.data}`}.
              {rehab.metricas.length > 0 && ` ${rehab.metricas.map(m => rehabMetricText(m, rehabSingle)).join('; ')}.`}
              {rehab.objetivoFuncional && ` Objetivo funcional: ${rehab.objetivoFuncional}.`}
              {' '}Medidas registradas para acompanhamento; a leitura clínica cabe ao profissional.
            </p>
          )}
          <p style={{ margin: '14px 0', lineHeight: 1.65, fontSize: 16 }}>
            <b>11. Observação técnica:</b> as hipóteses constituem apoio ao raciocínio clínico e devem ser validadas pelo profissional responsável.
          </p>

          {references.length > 0 && (
            <p style={{ margin: '14px 0', lineHeight: 1.65, fontSize: 16 }}>
              <b>12. Fontes consultadas pela Biblioteca Viva:</b> {references.join('; ')}.
            </p>
          )}

          {/* Assinatura */}
          <p style={{ textAlign: 'right', marginTop: 40, lineHeight: 1.8 }}>
            <b>{terapeuta}</b><br />
            {clinicName} — {therapistSpecialty}<br />
            {therapistRegistration && <><span>{therapistRegistration}</span><br /></>}
            {therapistEmail && <><span>{therapistEmail}</span><br /></>}
            <span style={{ fontSize: 12, color: '#94a3b8' }}>{today()}</span>
          </p>
        </>
      )}

      {modo === 'Orientação ao paciente' && (
        <>
          <h2 style={{ margin: '0 0 24px', textTransform: 'uppercase', color: 'var(--navy)' }}>ORIENTAÇÃO AO PACIENTE</h2>

          <p style={{ margin: '16px 0', lineHeight: 1.65, fontSize: 16 }}>
            Paciente, sua avaliação energética foi organizada a partir da anamnese, observação de língua, pulso e sintomas relatados.
            {reportSessionNumber > 0 && ` Você está na ${reportSessionNumber}ª sessão de acompanhamento.`}
          </p>
          <p style={{ margin: '16px 0', lineHeight: 1.65, fontSize: 16 }}>
            O objetivo inicial do cuidado é: <b>{protocol?.goal ? `${protocol.goal}.` : 'Preencha os dados para gerar raciocínio terapêutico.'}</b>
          </p>
          <p style={{ margin: '16px 0', lineHeight: 1.65, fontSize: 16 }}>
            Ao longo das sessões, serão acompanhados sono, dor, ansiedade, energia, intestino e humor, para que o tratamento seja ajustado de forma segura e individualizada.
          </p>
          <p style={{ margin: '16px 0', lineHeight: 1.65, fontSize: 16 }}>
            É importante comunicar qualquer mudança, reação, piora, medicação nova ou intercorrência clínica.
          </p>
        </>
      )}
    </>
  );

  return (
    <Panel title="Relatório">

      {/* ── barra de controles (não imprime) ──────────────── */}
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

      {/* ── alerta de segurança ───────────────────────────── */}
      {safetyMessages.length > 0 && (
        <div className="alert no-print" style={{ marginBottom: 16 }}>
          <b>⚠ Atenção clínica:</b> {safetyMessages.join(' • ')}
        </div>
      )}

      {clinicLoadError && (
        <div className="alert no-print" style={{ marginBottom: 16 }}>
          Os dados institucionais da clínica não puderam ser carregados. O relatório está usando o cadastro básico do perfil.
        </div>
      )}

      {/* ── aviso de texto editado / rascunho de IA ───────── */}
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
              surface={AI_SURFACES.NARRATIVE}
              aiOutput={{ mode: modo, html: editedEntry.html }}
              contextSnapshot={{ reportMode: modo }}
              modelVersion={editedEntry.modelVersion}
              patientName={nome}
              summary={String(editedEntry.html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}
              label="✎ Corrigir o texto"
            />
          )}
        </div>
      )}

      {aiError && <div className="alert no-print" style={{ marginBottom: 16 }}>{aiError}</div>}

      {/* ╔═══════════════════════════════════════════════════╗ */}
      {/* ║               CORPO DO RELATÓRIO                 ║ */}
      {/* ╚═══════════════════════════════════════════════════╝ */}
      <div
        className={`report${editing ? ' report-editing' : ''}`}
        style={{
          '--clinic-accent': accentPalette.accent,
          '--clinic-accent-shade': accentPalette.shade,
          '--clinic-accent-soft': accentPalette.soft,
        }}
      >
        {/* Estrutura em tabela: thead (cabeçalho) e tfoot (rodapé) são
            repetidos pelo navegador no topo/pé de TODAS as páginas e têm o
            espaço reservado, então o texto flui para a próxima página entre
            eles, sem cobrir a assinatura nem virar "cabeçalho" da página de
            baixo. Cabeçalho e rodapé fixos por página. */}
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

      {/* ── botões finais (não imprime) ────────────────────── */}
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
            <button className="tag" onClick={handleAiDraft} disabled={aiLoading} title={REPORT_AI_DISCLAIMER}>
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
