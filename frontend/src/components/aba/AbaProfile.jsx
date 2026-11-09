import { useAbaUnsaved } from './AbaUnsavedContext';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getPatientProfile, savePatientProfile, profileDraftIssue, profileErrorMessage, profileToday,
  PROFILE_COMMUNICATION, PROFILE_SUPPORT,
} from '../../services/abaService';
import { newId } from '../../utils/aba/mapping.js';

export function AbaProfileView({ value, canSupervise, professionalName = () => '—', onEdit }) {
  if (!value) return (
    <section className="aba-card aba-profile">
      <h2>Perfil ABA</h2>
      <p>Ainda não há perfil ABA preenchido para este paciente.</p>
      {canSupervise && <button type="button" className="primary-button" onClick={onEdit}>Preencher perfil</button>}
    </section>
  );
  return (
    <section className="aba-card aba-profile">
      <header className="aba-profile-head">
        <h2>Perfil ABA</h2>
        {canSupervise && <button type="button" className="quiet-button" onClick={onEdit}>Editar perfil</button>}
      </header>
      {!canSupervise && <p className="aba-muted">Somente leitura. Apenas quem supervisiona pode alterar o perfil.</p>}
      <dl className="aba-profile-meta">
        <div><dt>Comunicação</dt><dd>{value.communication_mode?.length ? value.communication_mode.map(code => PROFILE_COMMUNICATION[code] || 'Não informado').join(', ') : 'Não informada'}</dd></div>
        <div><dt>Nível de suporte</dt><dd>{PROFILE_SUPPORT[value.support_level] || 'Não informado'}</dd></div>
      </dl>
      <h3>Diagnóstico do laudo</h3>
      {value.diagnosis ? <>
        <p className="aba-profile-text">{value.diagnosis.text}</p>
        <dl className="aba-profile-meta">
          <div><dt>Fonte do laudo</dt><dd>{value.diagnosis.source}</dd></div>
          <div><dt>Data do laudo</dt><dd>{new Date(`${value.diagnosis.issued_on}T12:00:00`).toLocaleDateString('pt-BR')}</dd></div>
        </dl>
      </> : <p>Não informado.</p>}
      <h3>Detalhes</h3>
      <p className="aba-profile-text">{value.details || 'Não informados.'}</p>
      <p className="aba-muted">Atualizado por {professionalName(value.updated_by)} · {value.updated_at ? new Date(value.updated_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '—'} · Revisão {value.revision}</p>
    </section>
  );
}

export function AbaProfileEditor({ initial, patientId, onSaved, onCancel }) {
  const [draft, setDraft] = useState(() => ({
    revision: initial?.revision ?? 0,
    communication_mode: [...(initial?.communication_mode || [])],
    support_level: initial?.support_level || 'nao_informado',
    diagnosis: { text: initial?.diagnosis?.text || '', source: initial?.diagnosis?.source || '', issued_on: initial?.diagnosis?.issued_on || '' },
    details: initial?.details || '',
  }));
  const original = useRef(JSON.stringify(draft));
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  useAbaUnsaved(() => JSON.stringify(draft) !== original.current, busy);
  const set = patch => setDraft(current => ({ ...current, ...patch }));
  const setDiagnosis = patch => setDraft(current => ({ ...current, diagnosis: { ...current.diagnosis, ...patch } }));

  function cancel() {
    if (lock.current) return;
    if (JSON.stringify(draft) !== original.current) { setDiscarding(true); return; }
    onCancel();
  }

  async function save(event) {
    event.preventDefault();
    if (lock.current || conflict) return;
    const issue = profileDraftIssue(draft);
    if (issue) { setError(issue); return; }
    lock.current = true; setBusy(true); setError('');
    try {
      await savePatientProfile(patientId, draft, newId());
      onSaved();
    } catch (failure) {
      setError(profileErrorMessage(failure));
      setConflict(failure.code === 'conflict' || failure.code === '40001');
    } finally { lock.current = false; setBusy(false); }
  }

  return (
    <section className="aba-card aba-profile">
      <h2>{initial ? 'Editar perfil ABA' : 'Preencher perfil ABA'}</h2>
      <form className="aba-profile-form forms-scope" autoComplete="off" onSubmit={save}>
        <fieldset disabled={busy || conflict}>
          <legend>Comunicação</legend>
          <div className="aba-profile-choices">
            {Object.entries(PROFILE_COMMUNICATION).map(([code, label]) => <label key={code}>
              <input type="checkbox" checked={draft.communication_mode.includes(code)} onChange={event => set({ communication_mode: event.target.checked ? [...draft.communication_mode, code] : draft.communication_mode.filter(value => value !== code) })} />{label}
            </label>)}
          </div>
          <label className="aba-field">Nível de suporte<select value={draft.support_level} onChange={event => set({ support_level: event.target.value })}>
            {Object.entries(PROFILE_SUPPORT).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
          </select></label>
        </fieldset>
        <fieldset disabled={busy || conflict}>
          <legend>Diagnóstico do laudo</legend>
          <label>Texto do laudo<textarea rows={5} maxLength={6000} autoComplete="off" value={draft.diagnosis.text} onChange={event => setDiagnosis({ text: event.target.value })} /></label>
          <div className="aba-profile-meta">
            <label>Fonte do laudo<input maxLength={1000} autoComplete="off" value={draft.diagnosis.source} onChange={event => setDiagnosis({ source: event.target.value })} /></label>
            <label>Data do laudo<input type="date" max={profileToday()} value={draft.diagnosis.issued_on} onChange={event => setDiagnosis({ issued_on: event.target.value })} /></label>
          </div>
        </fieldset>
        <fieldset disabled={busy || conflict}>
          <legend>Detalhes</legend>
          <label>Detalhes do perfil<textarea rows={5} maxLength={12000} value={draft.details} onChange={event => set({ details: event.target.value })} /></label>
        </fieldset>
        {error && <p className="aba-error" role="alert">{error}</p>}
        {discarding && <div role="alert">
          <p>Descartar as alterações não salvas do perfil?</p>
          <div className="aba-profile-actions">
            <button type="button" className="quiet-button" disabled={busy} onClick={onCancel}>Descartar alterações</button>
            <button type="button" className="quiet-button" disabled={busy} onClick={() => setDiscarding(false)}>Continuar editando</button>
          </div>
        </div>}
        <div className="aba-profile-actions">
          <button type="submit" className="primary-button" disabled={busy || conflict}>{busy ? 'Salvando…' : 'Salvar perfil'}</button>
          <button type="button" className="quiet-button" disabled={busy} onClick={cancel}>{conflict ? 'Descartar e recarregar' : 'Cancelar'}</button>
        </div>
      </form>
    </section>
  );
}

export function AbaProfile({ patient, data }) {
  const [value, setValue] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState('');
  const request = useRef(0);
  const canSupervise = data.permissions.canSupervise;
  const load = useCallback(() => {
    const token = ++request.current;
    return getPatientProfile(patient.id).then(next => {
      if (request.current === token) { setValue(next); setError(''); }
    }, failure => {
      if (request.current === token) { setValue(null); setError(profileErrorMessage(failure)); }
    }).finally(() => { if (request.current === token) setLoading(false); });
  }, [patient.id]);
  useEffect(() => { void load(); }, [load]);
  function reload() { setLoading(true); setEditing(false); void load(); }
  function saved() { setNotice('Perfil salvo.'); reload(); }

  if (loading) return <p role="status">Carregando perfil ABA…</p>;
  if (error) return <div className="aba-card"><p role="alert">{error}</p><button type="button" className="quiet-button" onClick={reload}>Recarregar perfil</button></div>;
  return <>
    {notice && <p role="status">{notice}</p>}
    {editing && canSupervise
      ? <AbaProfileEditor initial={value} patientId={patient.id} onSaved={saved} onCancel={reload} />
      : <AbaProfileView value={value} canSupervise={canSupervise} professionalName={data.professionalName} onEdit={() => { setNotice(''); setEditing(true); }} />}
  </>;
}
