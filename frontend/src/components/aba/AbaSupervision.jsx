import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  ackSupervision, listSupervisions, loadTeams, profileToday, saveSupervisionDraft, signSupervision,
  supervisionDraftIssue, supervisionErrorMessage, supervisionHours, supervisionTotals, voidSupervision,
} from '../../services/abaService';
import { useDismiss } from '../../hooks/useDismiss';
import { DismissPrompt } from '../ui/DismissPrompt';

const STATUS = { rascunho: 'Rascunho', assinado: 'Assinado', anulado: 'Anulado' };
const date = value => new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR');
const instant = value => value ? new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '—';
const archived = message => /^Paciente arquivado/u.test(message || '');

function SupervisionError({ message }) {
  const target = useRef(null);
  useEffect(() => { target.current?.focus(); }, [message]);
  return <p className="aba-error" role="alert" tabIndex={-1} ref={target}>{message}</p>;
}

function SupervisionOverlay({ title, onClose, busy, dirty = false, children }) {
  const id = useId();
  const panel = useRef(null);
  const dismiss = useDismiss({ onClose, busy, guardUnsaved: true, unsaved: dirty });
  useEffect(() => {
    const previous = document.activeElement;
    panel.current?.querySelector('input, select, textarea, button')?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  function keepFocus(event) {
    if (event.key !== 'Tab') return;
    const controls = [...panel.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)')];
    if ((!event.shiftKey && document.activeElement === controls.at(-1)) || (event.shiftKey && document.activeElement === controls[0])) {
      event.preventDefault(); (event.shiftKey ? controls.at(-1) : controls[0])?.focus();
    }
  }
  return <div className="aba-dialog-overlay" {...dismiss.backdropProps}>
    <section className="aba-dialog aba-dialog--wide forms-scope aba-supervision-dialog" role="dialog" aria-modal="true" aria-labelledby={id} ref={panel} onKeyDown={keepFocus} {...dismiss.panelProps}>
      <header className="aba-dialog-head"><h2 id={id}>{title}</h2><button type="button" className="aba-dialog-close" aria-label="Fechar" disabled={busy} onClick={dismiss.requestDismiss}>×</button></header>
      <div className="aba-dialog-body"><DismissPrompt dismiss={dismiss} />{children(dismiss.requestDismiss)}</div>
    </section>
  </div>;
}

export function SupervisionSummary({ records, personName }) {
  const totals = supervisionTotals(records);
  return <section className="aba-card aba-supervision-summary">
    <h3>Horas assinadas</h3>
    {totals.length ? <dl>{totals.map(total => <div key={total.supervisee_id}><dt>{personName(total.supervisee_id)}</dt><dd>{supervisionHours(total.duration_minutes)}</dd></div>)}</dl>
      : <p>0 horas</p>}
  </section>;
}

export function SupervisionCard({ record, teams, personName, onEdit, onAction, busy = false, error = '' }) {
  const canManage = teams && (teams.isAdmin || (teams.supervisedTeamId && teams.professionals.some(person => person.id === record.supervisee_id && person.memberTeamId === teams.supervisedTeamId)));
  const canSign = teams && (teams.isAdmin || teams.userId === record.supervisor_id);
  const canVoid = teams && (teams.isAdmin || teams.userId === record.signed_by);
  const canAck = teams && teams.userId === record.supervisee_id && !record.supervisee_ack_at;
  const blocked = busy || archived(error);
  return <article className="aba-card aba-supervision-record">
    <header className="aba-supervision-head"><div><span className="aba-tag">{STATUS[record.status]}</span><h3>{personName(record.supervisee_id)}</h3></div><strong>{supervisionHours(Number(record.duration_minutes))}</strong></header>
    <dl className="aba-supervision-meta">
      <div><dt>Data do encontro</dt><dd>{date(record.held_on)}</dd></div>
      <div><dt>Modalidade</dt><dd>{record.modality === 'grupo' ? 'Em grupo' : 'Individual'}</dd></div>
      <div><dt>Formato</dt><dd>{record.format === 'online' ? 'Online' : 'Presencial'}</dd></div>
      <div><dt>Registrado por</dt><dd>{personName(record.supervisor_id)}</dd></div>
      {record.signed_at && <div><dt>Assinatura</dt><dd>{personName(record.signed_by)} · {instant(record.signed_at)}</dd></div>}
      {record.supervisee_ack_at && <div><dt>Ciência registrada</dt><dd>{instant(record.supervisee_ack_at)}</dd></div>}
      {record.voided_at && <div><dt>Anulado por</dt><dd>{personName(record.voided_by)} · {instant(record.voided_at)}</dd></div>}
    </dl>
    {record.content_restricted ? <p className="aba-note">Pauta restrita. Você pode consultar os dados do encontro e as horas, mas não o paciente nem os textos desta reunião.</p>
      : <details className="aba-supervision-content"><summary>Ver registro</summary>
        <p className="aba-muted">{record.patient_id ? 'Encontro com paciente vinculado.' : 'Sem paciente vinculado.'}</p>
        <h4>Pauta</h4><p>{record.agenda || 'Não informada.'}</p>
        <h4>Decisões</h4><p>{record.decisions || 'Não informadas.'}</p>
        {record.status === 'anulado' && <><h4>Motivo da anulação</h4><p>{record.void_reason || 'Não informado.'}</p></>}
      </details>}
    {error && <p className="aba-error" role="alert">{error}</p>}
    <div className="aba-button-row">
      {record.status === 'rascunho' && canManage && !record.content_restricted && <button type="button" className="quiet-button" disabled={blocked} onClick={() => onEdit(record)}>Editar rascunho</button>}
      {record.status === 'rascunho' && canSign && <button type="button" className="primary-button" disabled={blocked || record.content_restricted} onClick={() => onAction(record, 'sign')}>Assinar</button>}
      {record.status === 'assinado' && canVoid && <button type="button" className="quiet-button" disabled={blocked || record.content_restricted} onClick={() => onAction(record, 'void')}>Anular</button>}
      {record.status === 'assinado' && canAck && <button type="button" className="primary-button" disabled={blocked} onClick={() => onAction(record, 'ack')}>Marcar ciência</button>}
    </div>
    {record.content_restricted && ((record.status === 'rascunho' && canSign) || (record.status === 'assinado' && canVoid)) && <p className="aba-muted">Assinar ou anular exige acesso de supervisão ao paciente; a pauta está restrita.</p>}
  </article>;
}

function SupervisionEditor({ initial, people, patients, onClose, onSaved, onRefresh }) {
  const [draft, setDraft] = useState(() => initial || {
    id: crypto.randomUUID(), revision: 0, supervisee_id: '', patient_id: null,
    held_on: profileToday(), duration_minutes: 60, modality: 'individual', format: 'presencial', agenda: '', decisions: '',
  });
  const [original] = useState(() => JSON.stringify(draft));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const lock = useRef(false);
  const set = patch => setDraft(current => ({ ...current, ...patch }));
  async function save(event) {
    event.preventDefault();
    if (lock.current || conflict || archived(error)) return;
    const issue = supervisionDraftIssue(draft);
    if (issue) { setError(issue); return; }
    lock.current = true; setBusy(true); setError('');
    try { await saveSupervisionDraft(draft, crypto.randomUUID()); await onSaved(); }
    catch (failure) { setError(supervisionErrorMessage(failure)); setConflict(failure.code === 'conflict' || failure.code === '40001'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <SupervisionOverlay title={initial ? 'Editar rascunho de supervisão' : 'Novo rascunho de supervisão'} onClose={onClose} busy={busy} dirty={JSON.stringify(draft) !== original}>
    {close => <form className="aba-supervision-form" autoComplete="off" onSubmit={save}>
      <fieldset disabled={busy}>
        <legend>Dados do encontro</legend>
        <div className="aba-supervision-fields">
          <label className="aba-field">Profissional supervisionado<select required value={draft.supervisee_id} onChange={event => set({ supervisee_id: event.target.value })}>
            <option value="">Selecione</option>{people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
          </select></label>
          <label className="aba-field">Paciente (opcional)<select value={draft.patient_id || ''} onChange={event => set({ patient_id: event.target.value || null })}>
            <option value="">Sem paciente vinculado</option>
            {draft.patient_id && !patients.some(patient => patient.id === draft.patient_id) && <option value={draft.patient_id}>Paciente vinculado ao registro</option>}
            {patients.map(patient => <option key={patient.id} value={patient.id}>{patient.name}</option>)}
          </select></label>
          <label className="aba-field">Data<input type="date" required max={profileToday()} value={draft.held_on} onChange={event => set({ held_on: event.target.value })} /></label>
          <label className="aba-field">Duração em minutos<input type="number" required min="1" max="600" step="1" value={draft.duration_minutes} onChange={event => set({ duration_minutes: event.target.value })} /></label>
          <label className="aba-field">Modalidade<select value={draft.modality} onChange={event => set({ modality: event.target.value })}><option value="individual">Individual</option><option value="grupo">Em grupo</option></select></label>
          <label className="aba-field">Formato<select value={draft.format} onChange={event => set({ format: event.target.value })}><option value="presencial">Presencial</option><option value="online">Online</option></select></label>
        </div>
      </fieldset>
      <label className="aba-field">Pauta<textarea rows={5} maxLength={12000} value={draft.agenda || ''} disabled={busy} onChange={event => set({ agenda: event.target.value })} /></label>
      <label className="aba-field">Decisões<textarea rows={5} maxLength={12000} value={draft.decisions || ''} disabled={busy} onChange={event => set({ decisions: event.target.value })} /></label>
      {error && <SupervisionError message={error} />}
      {conflict && <div className="aba-note"><p>O texto digitado permanece neste editor. Atualize a lista para conferir a versão atual; feche e reabra o registro quando decidir descartar este rascunho.</p><button type="button" className="quiet-button" onClick={() => void onRefresh()}>Atualizar lista</button></div>}
      <div className="aba-form-actions"><button type="button" className="quiet-button" disabled={busy} onClick={close}>Cancelar</button>
        <button type="submit" className="primary-button" disabled={busy || conflict || archived(error)}>{busy ? 'Salvando…' : 'Salvar rascunho'}</button></div>
    </form>}
  </SupervisionOverlay>;
}

function SupervisionConfirmation({ action, record, onClose, onConfirm, busy, error }) {
  const [reason, setReason] = useState('');
  const isVoid = action === 'void';
  return <SupervisionOverlay title={isVoid ? 'Anular supervisão' : 'Assinar supervisão'} onClose={onClose} busy={busy} dirty={Boolean(reason)}>
    {close => <form className="aba-supervision-form" onSubmit={event => { event.preventDefault(); void onConfirm(reason); }}>
      <p>{isVoid ? 'O registro continua no histórico como Anulado e sai da soma de horas assinadas.' : 'Depois de assinar, o registro não pode ser editado. Uma mudança exige anulação com motivo.'}</p>
      <p>Encontro de {date(record.held_on)} · {supervisionHours(Number(record.duration_minutes))}</p>
      {isVoid && <label className="aba-field">Motivo da anulação<textarea required minLength={10} maxLength={6000} rows={4} value={reason} disabled={busy} onChange={event => setReason(event.target.value)} /></label>}
      {error && <SupervisionError message={error} />}
      <div className="aba-form-actions"><button type="button" className="quiet-button" disabled={busy} onClick={close}>Cancelar</button>
        <button type="submit" className="primary-button" disabled={busy || archived(error) || (isVoid && reason.trim().length < 10)}>{isVoid ? 'Confirmar anulação' : 'Confirmar assinatura'}</button></div>
    </form>}
  </SupervisionOverlay>;
}

export function AbaSupervision() {
  const [bundle, setBundle] = useState(null);
  const [teams, setTeams] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [permissionError, setPermissionError] = useState('');
  const [notice, setNotice] = useState('');
  const [rowErrors, setRowErrors] = useState({});
  const [filter, setFilter] = useState('');
  const [editor, setEditor] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const request = useRef(0);
  const load = useCallback(async () => {
    const token = ++request.current;
    const [list, permissions] = await Promise.allSettled([listSupervisions(), loadTeams()]);
    if (token !== request.current) return;
    setBundle(list.status === 'fulfilled' ? list.value : null);
    setError(list.status === 'rejected' ? 'Não foi possível carregar as supervisões. Tente de novo.' : '');
    setTeams(permissions.status === 'fulfilled' ? permissions.value : null);
    setPermissionError(permissions.status === 'rejected' ? 'Não foi possível conferir as permissões. As ações estão indisponíveis até atualizar.' : '');
    setLoading(false);
  }, []);
  useEffect(() => { void load(); return () => { request.current += 1; }; }, [load]);
  const people = (teams?.professionals || []).filter(person => teams.isAdmin || (teams.supervisedTeamId && person.memberTeamId === teams.supervisedTeamId));
  const patients = [...new Map((teams?.teams || []).filter(team => teams.isAdmin || team.supervisorId === teams.userId).flatMap(team => team.patients).concat(teams?.isAdmin ? teams.availablePatients : []).map(patient => [patient.id, patient])).values()];
  const canCreate = Boolean(teams && (teams.isAdmin || teams.supervisedTeamId));
  const personName = id => teams?.userId === id ? 'Você' : teams?.professionals.find(person => person.id === id)?.name || 'Profissional não listado';
  const records = (bundle?.records || []).filter(record => !filter || record.supervisee_id === filter);
  const filterIds = [...new Set((bundle?.records || []).map(record => record.supervisee_id))];
  async function saved() { setEditor(null); setNotice('Rascunho salvo.'); await load(); }
  async function runAction(record, action, reason, eventId) {
    if (lock.current) return;
    if (action === 'void' && reason.trim().length < 10) return;
    lock.current = true; setBusy(true); setRowErrors(current => ({ ...current, [record.id]: '' }));
    try {
      if (action === 'sign') await signSupervision(record, eventId);
      else if (action === 'void') await voidSupervision(record, reason, eventId);
      else await ackSupervision(record, eventId);
      setConfirming(null); setNotice(action === 'ack' ? 'Ciência registrada.' : action === 'sign' ? 'Supervisão assinada.' : 'Supervisão anulada.');
      await load();
    } catch (failure) { setRowErrors(current => ({ ...current, [record.id]: supervisionErrorMessage(failure) })); }
    finally { lock.current = false; setBusy(false); }
  }
  function act(record, action) {
    if (lock.current) return;
    const eventId = crypto.randomUUID();
    if (action === 'ack') void runAction(record, action, '', eventId);
    else { setRowErrors(current => ({ ...current, [record.id]: '' })); setConfirming({ record, action, eventId }); }
  }
  return <div className="aba-page aba-supervision-page">
    <header className="aba-page-head"><div><p className="aba-eyebrow">Equipe</p><h2>Supervisão formal</h2></div>
      <div className="aba-button-row"><button type="button" className="quiet-button" disabled={busy || loading} onClick={() => { setLoading(true); setRowErrors({}); void load(); }}>Atualizar</button>
        {canCreate && !loading && bundle && <button type="button" className="primary-button" disabled={busy || !people.length} onClick={() => setEditor({ initial: null })}>Novo registro</button>}</div>
    </header>
    {notice && <p role="status">{notice}</p>}
    {permissionError && <p className="aba-error" role="alert">{permissionError}</p>}
    {loading ? <p role="status">Carregando supervisões…</p> : error ? <div className="aba-card"><p className="aba-error" role="alert">{error}</p><button type="button" className="quiet-button" onClick={() => { setLoading(true); void load(); }}>Tentar de novo</button></div> : bundle && <>
      <label className="aba-field aba-supervision-filter">Profissional supervisionado<select value={filter} onChange={event => setFilter(event.target.value)}><option value="">Todos os registros disponíveis</option>{filterIds.map(id => <option key={id} value={id}>{personName(id)}</option>)}</select></label>
      <SupervisionSummary records={records} personName={personName} />
      <div className="aba-supervision-list">{records.map(record => <SupervisionCard key={record.id} record={record} teams={teams} personName={personName} onEdit={value => setEditor({ initial: value })} onAction={act} busy={busy} error={rowErrors[record.id]} />)}</div>
      {!records.length && <p className="aba-empty">Nenhum registro de supervisão neste filtro.</p>}
    </>}
    {editor && <SupervisionEditor initial={editor.initial} people={people} patients={patients} onClose={() => setEditor(null)} onSaved={saved} onRefresh={load} />}
    {confirming && <SupervisionConfirmation action={confirming.action} record={confirming.record} busy={busy} error={rowErrors[confirming.record.id]}
      onClose={() => setConfirming(null)} onConfirm={reason => runAction(confirming.record, confirming.action, reason, confirming.eventId)} />}
  </div>;
}
