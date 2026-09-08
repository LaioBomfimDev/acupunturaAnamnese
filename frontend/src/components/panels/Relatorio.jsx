import { useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Panel } from '../ui/Panel';
import { draftReport, REPORT_AI_DISCLAIMER } from '../../services/reportAiService';
import { AiCorrectionButton } from '../ui/AiCorrectionButton';
import { AI_SURFACES } from '../../services/aiCorrectionService';
import { buildPointEvidence, buildProtocolSummary, buildReferenceList } from '../../knowledge/reportFragments';
import { FOOD_CATALOG } from '../../knowledge/foodDietoterapia';
import { summarizeRehabilitation, formatOptionalMetric } from '../../services/rehabilitationService';
import {
  buildReportAccentPalette,
  buildReportContactItems,
  formatRegisteredSessionCount,
  getReportSessionInfo,
} from '../../utils/reportUtils';
import { isAiDraftPendingReview } from '../../utils/reportAiReview';
import {
  PrintFooter,
  PrintLetterhead,
  ReportContactFooter,
} from '../report/reportPrint';
import { paginateReportBody } from '../report/reportPagination';

// Rótulo de impressão para sessões que são falta, não atendimento —
// nunca mistura com os campos clínicos (dor/sono/ansiedade não fazem
// sentido pra uma sessão que não aconteceu).
const ATTENDANCE_REPORT_LABELS = {
  no_show: 'faltou',
  excused: 'faltou (com justificativa)',
};

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

// Opções do catálogo para o profissional escolher no relatório. Ervas do worksheet
// ficam fora até existir etapa explícita de publicação/retrieval revisada.
const DIETO_CATALOG_OPTIONS = [
  ...FOOD_CATALOG.map(f => ({ name: f.commonName, label: `${f.commonName} · alimento` })),
];

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

const MODOS = ['Resumo clínico', 'Relatório profissional', 'Orientação ao paciente'];
const DEFAULT_ACCENT = '#0E2A4A';

export function Relatorio({ state, evolucoes: evolucoesProp, analysis, selectedPatient, therapistProfile, onUpdate }) {
  const [modo, setModo] = useState('Resumo clínico');
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
  const [dietoDraft, setDietoDraft] = useState('');
  const { main, detail, protocol, safety, safetyAlerts = [] } = analysis;

  const nome    = selectedPatient?.name || state.nome || 'Paciente não informado';
  const idade   = state.idade ? `${state.idade} anos` : 'idade não informada';
  const queixa  = state.queixa;
  const historia= state.historia;
  const terapeuta = therapistProfile?.full_name || state.terapeuta || 'Terapeuta';
  const therapistSpecialty = therapistProfile?.specialty || 'Acupuntura e MTC';
  const therapistRegistration = therapistProfile?.professional_registration || '';
  const therapistEmail = therapistProfile?.email || '';
  // evolucoesProp já vem mesclada (legado + patient_evolutions, com a
  // data do atendimento travada no servidor) quando o App.jsx passa —
  // o fallback local cobre só quem ainda chama este componente sem o
  // prop (testes antigos, por exemplo).
  const evolucoes = Array.isArray(evolucoesProp)
    ? evolucoesProp
    : (Array.isArray(state.evolucoes) ? state.evolucoes : []);
  const ultimaEvolucao = evolucoes[evolucoes.length - 1];
  const ultimaEvolucaoFoiFalta = Boolean(ultimaEvolucao) && ultimaEvolucao.attendanceStatus
    && ultimaEvolucao.attendanceStatus !== 'attended';
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
  const watermarkEnabled = Boolean(clinicLogo) && clinic?.logo_watermark !== false;
  const accentStyle = {
    '--clinic-accent': accentPalette.accent,
    '--clinic-accent-shade': accentPalette.shade,
    '--clinic-accent-soft': accentPalette.soft,
  };

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

  // Dietoterapia no relatório: o profissional liga (select) e monta
  // uma lista simples nome + instruções de uso (texto dele, editável). Persistido
  // na sessão como modelo estruturado, separado das edições de texto por modo.
  const dieto = state.relatorioDietoterapia || { include: false, items: [] };
  const dietoItems = Array.isArray(dieto.items) ? dieto.items : [];
  const dietoActiveItems = dietoItems.filter(it => (it.name || '').trim());
  function updateDieto(next) { onUpdate?.('relatorioDietoterapia', next); }
  function setDietoInclude(include) { updateDieto({ ...dieto, include, items: dietoItems }); }
  function addDietoItem(name) {
    const n = String(name || '').trim();
    if (!n) return;
    updateDieto({ ...dieto, include: true, items: [...dietoItems, { id: `di-${Date.now()}-${Math.random().toString(16).slice(2)}`, name: n, instructions: '' }] });
  }
  function updateDietoItem(id, patch) {
    updateDieto({ ...dieto, items: dietoItems.map(it => (it.id === id ? { ...it, ...patch } : it)) });
  }
  function removeDietoItem(id) {
    updateDieto({ ...dieto, items: dietoItems.filter(it => it.id !== id) });
  }
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
    // Recorta o corpo do relatório em folhas de altura fixa antes de
    // imprimir, para o rodapé ficar sempre grudado no fundo de cada
    // página (ver comentário em paginateReportBody).
    const html = reportBodyRef.current?.innerHTML || '';
    const doc = paginateReportBody(html, {
      stage: printMeasureRef.current,
      header: printHeaderMeasureRef.current,
      footer: printFooterMeasureRef.current,
    });
    flushSync(() => setPrintDoc(doc));
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
            ? (ultimaEvolucaoFoiFalta
              ? { data: ultimaEvolucao.data, falta: ATTENDANCE_REPORT_LABELS[ultimaEvolucao.attendanceStatus] }
              : { data: ultimaEvolucao.data, dor: ultimaEvolucao.dor, sono: ultimaEvolucao.sono, ansiedade: ultimaEvolucao.ansiedade })
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

  // Seção de dietoterapia — só aparece se o profissional ligou e
  // preencheu itens. Simples: nome + instruções de uso escritas por ele.
  const dietoterapiaSection = dieto.include && dietoActiveItems.length > 0 ? (
    <div style={{ margin: '18px 0 0' }}>
      <h3 style={{ margin: '0 0 6px', color: 'var(--navy)', fontSize: 17 }}>Orientação alimentar</h3>
      <p style={{ margin: '0 0 10px', fontSize: 13, color: '#64748b' }}>
        Orientações individualizadas conforme avaliação do profissional. Suspenda e comunique em caso de reação; mantenha as medicações prescritas por seu médico.
      </p>
      {dietoActiveItems.map(it => (
        <p key={it.id} style={{ margin: '8px 0', lineHeight: 1.6, fontSize: 16 }}>
          <b>{it.name}</b>{(it.instructions || '').trim() ? ` — ${it.instructions.trim()}` : ''}
        </p>
      ))}
    </div>
  ) : null;

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
              ? (ultimaEvolucaoFoiFalta
                ? ` Último registro em ${ultimaEvolucao.data}: ${ATTENDANCE_REPORT_LABELS[ultimaEvolucao.attendanceStatus]}.`
                : ` Última sessão em ${ultimaEvolucao.data}: dor ${ultimaEvolucao.dor || 'não informada'}, sono ${ultimaEvolucao.sono || 'não informado'}, ansiedade ${ultimaEvolucao.ansiedade || 'não informada'}.`)
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

          {dietoterapiaSection}

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

          {dietoterapiaSection}
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

      {/* ── dietoterapia no relatório (não imprime) ── */}
      <div className="report-dieto-builder no-print box" style={{ margin: '0 0 16px', borderColor: '#2e7d5b', background: '#f2f8f4' }}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontWeight: 600, color: '#1e5c40' }}>
          Dietoterapia no relatório:
          <select
            value={dieto.include ? 'sim' : 'nao'}
            onChange={e => setDietoInclude(e.target.value === 'sim')}
            style={{ padding: '4px 8px', borderRadius: 8, border: '1px solid #8fc3aa' }}
          >
            <option value="nao">Não incluir</option>
            <option value="sim">Incluir no relatório</option>
          </select>
        </label>

        {dieto.include && (
          <div style={{ marginTop: 10 }}>
            <p className="small" style={{ margin: '0 0 8px', color: '#2f4f40' }}>
              Adicione alimentos curados e escreva a instrução de uso. Ervas só entram após publicação explícita; nada é prescrito automaticamente.
            </p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              <input
                list="dieto-catalog"
                value={dietoDraft}
                onChange={e => setDietoDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addDietoItem(dietoDraft); setDietoDraft(''); } }}
                placeholder="Nome do alimento…"
                style={{ flex: '1 1 240px', padding: '6px 10px', borderRadius: 8, border: '1px solid #8fc3aa' }}
              />
              <datalist id="dieto-catalog">
                {DIETO_CATALOG_OPTIONS.map(opt => <option key={opt.label} value={opt.name}>{opt.label}</option>)}
              </datalist>
              <button type="button" className="tag" onClick={() => { addDietoItem(dietoDraft); setDietoDraft(''); }}>
                + Adicionar
              </button>
            </div>

            {dietoItems.length === 0 ? (
              <p className="small" style={{ opacity: 0.7 }}>Nenhum item ainda.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {dietoItems.map(it => (
                  <div key={it.id} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <input
                      value={it.name}
                      onChange={e => updateDietoItem(it.id, { name: e.target.value })}
                      placeholder="Nome"
                      style={{ flex: '1 1 160px', padding: '6px 10px', borderRadius: 8, border: '1px solid #cbd5e1' }}
                    />
                    <input
                      value={it.instructions}
                      onChange={e => updateDietoItem(it.id, { instructions: e.target.value })}
                      placeholder="Instruções de uso (ex.: 1 xícara de chá após o almoço)"
                      style={{ flex: '2 1 280px', padding: '6px 10px', borderRadius: 8, border: '1px solid #cbd5e1' }}
                    />
                    <button type="button" className="tag" onClick={() => removeDietoItem(it.id)} title="Remover item">✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
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
        className={`report report-screen-only${editing ? ' report-editing' : ''}`}
        style={accentStyle}
      >
        {/* Estrutura em tabela: thead (cabeçalho) e tfoot (rodapé) repetem
            no topo/pé em TELA (visualização/edição contínua). Escondida
            na impressão — quem imprime é .report-print-pages, logo
            abaixo, que pagina de verdade em folhas de altura fixa. */}
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

      {/* Documento que efetivamente sai na impressão/PDF: folhas de altura
          fixa (.rpage), cabeçalho e marca d'água repetidos, rodapé sempre
          grudado no fundo de cada folha. Fica fora da tela até imprimir
          (ver .report-print-pages no CSS). */}
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
          {/* Mesma classe do corpo real: a medição usa exatamente a
              tipografia que a folha vai renderizar */}
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
