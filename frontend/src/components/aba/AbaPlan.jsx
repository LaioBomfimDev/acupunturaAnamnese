import { Fragment, useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import {
  approvePlan, listPlanVersions, planDraftIssue, planErrorMessage, planProgramCount,
  savePlanDraft, submitPlan, voidPlan,
} from '../../services/abaService';
import { newId, PROGRAM_STATUS_FROM_DB, MEASURE_FROM_DB } from '../../utils/aba/mapping.js';
import { collectionTypeLabel } from '../../utils/aba/catalog.js';
import { buildReportContactItems } from '../../utils/reportUtils';
import { useDismiss } from '../../hooks/useDismiss';
import { DismissPrompt } from '../ui/DismissPrompt';
import { HubBackButton } from '../HubNav';
import { PrintFooter, PrintLetterhead } from '../report/reportPrint';
import { paginateReportBody } from '../report/reportPagination';

const STATUS = { rascunho: 'Rascunho', em_revisao: 'Em revisão', aprovado: 'Aprovado vigente', substituido: 'Substituído', anulado: 'Anulado' };
const date = value => value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') : '—';
const instant = value => value ? new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const signature = plan => JSON.stringify([plan.programs, plan.summary, plan.review_due_on]);

function PlanOverlay({ title, onClose, busy, dirty = false, savedRevision = 0, children }) {
  const titleId = useId();
  const panel = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    panel.current?.querySelector('input, textarea, button')?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  function keepFocus(event) {
    if (event.key !== 'Tab') return;
    const controls = [...panel.current.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled)')];
    const target = event.shiftKey ? controls.at(-1) : controls[0];
    if ((!event.shiftKey && document.activeElement === controls.at(-1)) || (event.shiftKey && document.activeElement === controls[0])) {
      event.preventDefault(); target?.focus();
    }
  }
  const dismiss = useDismiss({ onClose, busy, guardUnsaved: true, unsaved: dirty });
  const [lastSaved, setLastSaved] = useState(savedRevision);
  if (savedRevision !== lastSaved) {
    setLastSaved(savedRevision);
    dismiss.markSaved();
  }
  return (
    <div className="aba-dialog-overlay" {...dismiss.backdropProps}>
      <section ref={panel} onKeyDown={keepFocus} className="aba-dialog aba-dialog--wide aba-plan-dialog forms-scope" role="dialog" aria-modal="true" aria-labelledby={titleId} {...dismiss.panelProps}>
        <header className="aba-dialog-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="aba-dialog-close" onClick={dismiss.requestDismiss} disabled={busy} aria-label="Fechar">×</button>
        </header>
        <div className="aba-dialog-body">
          <DismissPrompt dismiss={dismiss} />
          {children}
          <HubBackButton nested label="Voltar aos planos" onClick={dismiss.requestDismiss} />
        </div>
      </section>
    </div>
  );
}

function PlanEditor({ initial, patientId, data, onClose, onChanged }) {
  const [draft, setDraft] = useState(() => ({ ...initial, programs: initial.programs.map(item => ({ ...item })) }));
  const [saved, setSaved] = useState(() => signature(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const lock = useRef(false);
  const dirty = signature(draft) !== saved;
  const available = data.programs.filter(program => !program.archivedAt || draft.programs.some(item => item.program_id === program.id));
  const missing = draft.programs.filter(item => !data.programs.some(program => program.id === item.program_id));
  const set = patch => { setDraft(current => ({ ...current, ...patch })); setNotice(''); };

  function toggle(program, checked) {
    set({ programs: checked
      ? [...draft.programs.filter(item => item.program_id !== program.id), { program_id: program.id, revision: program.revision }]
      : draft.programs.filter(item => item.program_id !== program.id) });
  }

  async function save(event) {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setNotice('');
    try {
      await savePlanDraft(patientId, draft, newId());
      const next = { ...draft, revision: Number(draft.revision) + 1 };
      setDraft(next); setSaved(signature(next));
      setNotice('Rascunho salvo.');
      await onChanged();
    } catch (failure) { setError(planErrorMessage(failure)); }
    finally { lock.current = false; setBusy(false); }
  }

  async function send() {
    const issue = planDraftIssue(draft);
    if (issue) { setError(issue); return; }
    if (lock.current || dirty || !draft.revision) return;
    lock.current = true; setBusy(true); setError('');
    try {
      await submitPlan(patientId, draft, newId());
      onClose();
      await onChanged();
    } catch (failure) { setError(planErrorMessage(failure)); }
    finally { lock.current = false; setBusy(false); }
  }

  return (
    <PlanOverlay title={draft.version_no ? `Editar versão ${draft.version_no}` : 'Nova versão do plano'} onClose={onClose} busy={busy} dirty={dirty} savedRevision={draft.revision}>
      <form className="aba-plan-form" onSubmit={save}>
        <fieldset disabled={busy}>
          <legend>Programas do paciente · {planProgramCount(draft.programs.length)}</legend>
          {available.map(program => {
            const selected = draft.programs.find(item => item.program_id === program.id);
            return (
              <div className="aba-plan-choice" key={program.id}>
                <label>
                  <input type="checkbox" checked={Boolean(selected)} onChange={event => toggle(program, event.target.checked)} />
                  <span>{program.name}<small>Revisão {selected?.revision ?? program.revision}{program.archivedAt ? ' · Arquivado' : ''}</small></span>
                </label>
                {selected && Number(selected.revision) !== Number(program.revision) && (
                  <button type="button" className="quiet-button" onClick={() => toggle(program, true)}>Usar revisão atual ({program.revision})</button>
                )}
              </div>
            );
          })}
          {missing.map(item => (
            <label className="aba-plan-choice" key={item.program_id}>
              <input type="checkbox" checked onChange={() => set({ programs: draft.programs.filter(ref => ref.program_id !== item.program_id) })} />
              Programa da versão anterior · revisão {item.revision}
            </label>
          ))}
          {!available.length && !missing.length && <p className="aba-muted">Nenhum programa cadastrado. Peça à supervisão para cadastrar em Programas.</p>}
        </fieldset>
        <label>Resumo do plano
          <textarea rows={7} maxLength={12000} value={draft.summary} disabled={busy} onChange={event => set({ summary: event.target.value })} />
        </label>
        <label>Data de revisão
          <input type="date" value={draft.review_due_on} disabled={busy} onChange={event => set({ review_due_on: event.target.value })} />
        </label>
        {error && <p className="aba-error" role="alert">{error}</p>}
        {notice && <p className="aba-ok-banner" role="status">{notice}</p>}
        <div className="aba-button-row">
          <button type="submit" className="primary-button" disabled={busy}>{busy ? 'Aguarde…' : 'Salvar rascunho'}</button>
          <button type="button" className="quiet-button" disabled={busy || dirty || !draft.revision} onClick={send}>Enviar para revisão</button>
        </div>
        {(dirty || !draft.revision) && <p className="aba-hint">Salve o rascunho antes de enviar para revisão.</p>}
      </form>
    </PlanOverlay>
  );
}

function PlanConfirmation({ action, plan, patientId, onClose, onChanged }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const approving = action === 'approve';
  async function confirm(event) {
    event.preventDefault();
    if (lock.current) return;
    if (!approving && reason.trim().length < 10) { setError('Escreva um motivo com ao menos 10 caracteres.'); return; }
    lock.current = true; setBusy(true); setError('');
    try {
      if (approving) await approvePlan(patientId, plan, newId());
      else await voidPlan(patientId, plan, newId(), reason);
      onClose();
      await onChanged();
    } catch (failure) { setError(planErrorMessage(failure)); }
    finally { lock.current = false; setBusy(false); }
  }
  return (
    <PlanOverlay title={`${approving ? 'Aprovar' : 'Anular'} versão ${plan.version_no}`} onClose={onClose} busy={busy} dirty={Boolean(reason)}>
      <form className="aba-plan-form" onSubmit={confirm}>
        <p>{approving
          ? 'Ao aprovar, a versão aprovada anterior vira substituída na mesma transação. O conteúdo desta versão fica congelado.'
          : plan.status === 'aprovado'
            ? 'Ao anular este plano aprovado, o paciente fica sem plano vigente. O histórico será preservado.'
            : 'A versão será anulada e continuará no histórico, com o motivo registrado.'}</p>
        {!approving && <label>Motivo da anulação (ao menos 10 caracteres)
          <textarea rows={4} minLength={10} maxLength={4000} required value={reason} disabled={busy} onChange={event => setReason(event.target.value)} />
        </label>}
        {error && <p className="aba-error" role="alert">{error}</p>}
        <button type="submit" className="primary-button" disabled={busy}>{busy ? 'Aguarde…' : approving ? 'Confirmar aprovação' : 'Confirmar anulação'}</button>
      </form>
    </PlanOverlay>
  );
}

// Parágrafos pequenos permitem ao paginador compartilhar texto longo entre folhas.
// Corta só na quebra de linha da pessoa ou num espaço: cortar no meio da palavra
// separava "50%" em "5" e "0%" (tela e papel). Palavra sem espaço maior que o
// limite é a única que se divide.
const PARAGRAPH_LIMIT = 450;
function textChunks(value) {
  const chunks = [];
  for (const line of value.split(/\r?\n/)) {
    let rest = line;
    while (rest.length > PARAGRAPH_LIMIT) {
      const space = rest.lastIndexOf(' ', PARAGRAPH_LIMIT);
      const cut = space > 0 ? space : PARAGRAPH_LIMIT;
      chunks.push(rest.slice(0, cut));
      rest = rest.slice(space > 0 ? cut + 1 : cut);
    }
    chunks.push(rest);
  }
  return chunks;
}
function TextParagraphs({ text }) {
  const value = String(text || '');
  const chunks = value ? textChunks(value) : ['—'];
  // Linha em branco escrita pela pessoa continua ocupando espaço.
  return chunks.map((chunk, index) => <p className="aba-plan-text" key={index}>{chunk || ' '}</p>);
}

function FrozenPrograms({ plan }) {
  return (plan.program_snapshots || []).map(entry => {
    const snapshot = entry.snapshot || {};
    const definition = snapshot.definition || {};
    return (
      <Fragment key={`${entry.program_id}-${entry.revision}`}>
        <h3>{snapshot.name || 'Programa registrado'} · revisão {entry.revision}</h3>
        <p>{snapshot.type === 'aquisicao' ? 'Aquisição' : 'Redução'} · {PROGRAM_STATUS_FROM_DB[snapshot.status] || 'Fase registrada'} · {collectionTypeLabel(snapshot.collection_type)}</p>
        {snapshot.trial_count != null && <p>Tentativas: {snapshot.trial_count}</p>}
        {snapshot.measure && <p>Medida: {MEASURE_FROM_DB[snapshot.measure] || 'Registrada'} · unidade: {snapshot.unit || '—'}</p>}
        {snapshot.procedure && <p>Procedimento: {snapshot.procedure}</p>}
        {[
          ['objective', 'Objetivo'], ['target', 'Alvo'], ['criterion', 'Critério'],
          ['generalizationCriterion', 'Critério de generalização'], ['maintenanceCriterion', 'Critério de manutenção'],
          ['reductionCriterion', 'Critério de redução'], ['applicationCondition', 'Condição de aplicação'],
          ['correctResponseDefinition', 'Definição de resposta correta'], ['errorDefinition', 'Definição de erro'],
        ].filter(([field]) => definition[field]).map(([field, label]) => (
          <Fragment key={field}><h4>{label}</h4><TextParagraphs text={definition[field]} /></Fragment>
        ))}
        {entry.notes && <><h4>Observações do programa</h4><TextParagraphs text={entry.notes} /></>}
      </Fragment>
    );
  });
}

export function AbaPlanDocument({ plan, patient, professionalName }) {
  return (
    <>
      <h2>Plano terapêutico ABA — versão {plan.version_no}</h2>
      <p><strong>{STATUS[plan.status]}</strong> · {patient.name}</p>
      <p>Autoria: {professionalName(plan.authored_by)} · Envio para revisão: {instant(plan.submitted_at)}</p>
      <p>Aprovação: {professionalName(plan.approved_by)} · {instant(plan.approved_at)}</p>
      {plan.approval_statement && <TextParagraphs text={plan.approval_statement} />}
      <p>Revisão prevista: {date(plan.review_due_on)} · {planProgramCount(plan.programs?.length || 0)}</p>
      {plan.status === 'anulado' && <><h3>Motivo da anulação</h3><TextParagraphs text={plan.void_reason} /></>}
      <h3>Resumo do plano</h3><TextParagraphs text={plan.summary} />
      <FrozenPrograms plan={plan} />
    </>
  );
}

function PlanPrint({ plan, patient, profile, professionalName, onError }) {
  const [printing, setPrinting] = useState(false);
  const [doc, setDoc] = useState({ pages: [], bodyHeightPx: null });
  const source = useRef(null); const stage = useRef(null); const header = useRef(null); const footer = useRef(null);
  const clinic = profile?.clinic;
  const clinicName = clinic?.name || profile?.clinic_name || 'Clínica';
  const contactItems = buildReportContactItems({ clinic, therapistProfile: profile });
  const letterhead = <PrintLetterhead clinicLogo={clinic?.logo_url || ''} clinicMonogram={clinicName.charAt(0)} clinicName={clinicName}
    clinicDetails={[clinic?.legal_name, clinic?.cnpj ? `CNPJ ${clinic.cnpj}` : ''].filter(Boolean).join(' · ')}
    dateLabel={plan.approved_at ? new Date(plan.approved_at).toLocaleDateString('pt-BR') : '—'} sessaoLabel={`Plano ABA · versão ${plan.version_no}`} terapeuta={professionalName(plan.approved_by)} />;
  useEffect(() => {
    const done = () => setPrinting(false);
    window.addEventListener('afterprint', done);
    return () => window.removeEventListener('afterprint', done);
  }, []);
  function print() {
    try {
      flushSync(() => setPrinting(true));
      const next = paginateReportBody(source.current?.innerHTML || '', { stage: stage.current, header: header.current, footer: footer.current });
      flushSync(() => setDoc(next));
      window.print();
    } catch { setPrinting(false); onError('Não foi possível preparar a impressão do plano. Tente novamente.'); }
  }
  return (
    <>
      <button type="button" className="quiet-button" onClick={print}>Imprimir versão {plan.version_no}</button>
      {printing && createPortal(
        <div className="report-print-pages aba-report-print aba-plan-print" aria-hidden="true">
          <div className="rpage-measure-stage">
            <div ref={header}>{letterhead}</div>
            <div ref={footer}><PrintFooter items={contactItems} clinicName={clinicName} /></div>
            <div ref={stage} className="rpage-body aba-plan-print-body" />
          </div>
          <div ref={source} className="aba-report-source"><AbaPlanDocument plan={plan} patient={patient} professionalName={professionalName} /></div>
          {doc.pages.map((html, index) => <section className="rpage" key={index}>
            {letterhead}
            <div className="rpage-body aba-plan-print-body" style={doc.bodyHeightPx ? { height: doc.bodyHeightPx } : undefined} dangerouslySetInnerHTML={{ __html: html }} />
            <div className="rpage-footer"><PrintFooter items={contactItems} clinicName={clinicName} /></div>
          </section>)}
        </div>, document.body,
      )}
    </>
  );
}

export function AbaPlanVersionCard({ plan, canSupervise, professionalName, onEdit, onApprove, onVoid, children }) {
  return (
    <article className={`aba-card aba-plan-version${plan.status === 'aprovado' ? ' is-current' : ''}`}>
      <header className="aba-plan-version-head"><h3>Versão {plan.version_no}</h3><strong>{STATUS[plan.status] || 'Estado indisponível'}</strong></header>
      <p>{planProgramCount(plan.programs?.length || 0)} · Revisão prevista: {date(plan.review_due_on)}</p>
      <dl className="aba-plan-meta">
        <div><dt>Autoria</dt><dd>{professionalName(plan.authored_by)}</dd></div>
        <div><dt>Envio para revisão</dt><dd>{instant(plan.submitted_at)}</dd></div>
        <div><dt>Aprovação</dt><dd>{plan.approved_by ? professionalName(plan.approved_by) : '—'}</dd></div>
        <div><dt>Aprovado em</dt><dd>{instant(plan.approved_at)}</dd></div>
      </dl>
      {plan.status === 'anulado' && <p className="aba-note">Motivo da anulação: {plan.void_reason || '—'}</p>}
      <details><summary>Ler versão {plan.version_no}</summary><div className="aba-plan-reading"><TextParagraphs text={plan.summary} /><FrozenPrograms plan={plan} /></div></details>
      <div className="aba-button-row">
        {plan.status === 'rascunho' && <button type="button" className="quiet-button" onClick={() => onEdit(plan)}>Editar / enviar para revisão</button>}
        {canSupervise && plan.status === 'em_revisao' && <button type="button" className="primary-button" onClick={() => onApprove(plan)}>Aprovar</button>}
        {canSupervise && ['rascunho', 'em_revisao', 'aprovado'].includes(plan.status) && <button type="button" className="quiet-button" onClick={() => onVoid(plan)}>Anular</button>}
        {children}
      </div>
    </article>
  );
}

export function AbaPlan({ patient, data, profile }) {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editor, setEditor] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const request = useRef(0);
  const canSupervise = data.permissions.canSupervise;
  const load = useCallback(() => {
    const token = ++request.current;
    return listPlanVersions(patient.id).then(rows => {
      if (request.current === token) { setVersions(rows); setError(''); }
    }, failure => {
      if (request.current === token) { setVersions([]); setError(planErrorMessage(failure)); }
    }).finally(() => { if (request.current === token) setLoading(false); });
  }, [patient.id]);
  useEffect(() => { void load(); }, [load]);
  function reload() { setLoading(true); setError(''); return load(); }

  function create() {
    const approved = versions.find(plan => plan.status === 'aprovado');
    setEditor({ id: newId(), revision: 0, programs: approved?.programs || [], summary: approved?.summary || '', review_due_on: approved?.review_due_on || '' });
  }
  const editable = plan => ({ ...plan, summary: plan.summary || '', review_due_on: plan.review_due_on || '' });
  return (
    <div className="aba-page aba-plan-page">
      <header className="aba-page-head"><h2>Plano terapêutico</h2><div className="aba-button-row">
        <button type="button" className="quiet-button" disabled={loading || Boolean(editor) || Boolean(confirmation)} onClick={() => void reload()}>Recarregar planos</button>
        <button type="button" className="primary-button" disabled={loading || Boolean(error)} onClick={create}>Nova versão</button>
      </div></header>
      {error && <p className="aba-error" role="alert">{error}</p>}
      {loading ? <p className="aba-muted" role="status">Carregando planos…</p> : !error && (
        <div className="aba-plan-versions">
          {!versions.length && <p className="aba-empty">Nenhum plano registrado para este paciente.</p>}
          {versions.map(plan => <AbaPlanVersionCard key={plan.id} plan={plan} canSupervise={canSupervise} professionalName={data.professionalName}
            onEdit={value => setEditor(editable(value))} onApprove={value => setConfirmation({ action: 'approve', plan: value })} onVoid={value => setConfirmation({ action: 'void', plan: value })}>
            {['aprovado', 'substituido', 'anulado'].includes(plan.status) && <PlanPrint plan={plan} patient={patient} profile={profile} professionalName={data.professionalName} onError={setError} />}
          </AbaPlanVersionCard>)}
        </div>
      )}
      {editor && <PlanEditor key={editor.id} initial={editor} patientId={patient.id} data={data} onClose={() => setEditor(null)} onChanged={reload} />}
      {confirmation && canSupervise && <PlanConfirmation {...confirmation} patientId={patient.id} onClose={() => setConfirmation(null)} onChanged={reload} />}
    </div>
  );
}
