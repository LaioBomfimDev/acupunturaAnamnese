import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createCallout, createTeam, loadTeams, manageCallout, setPatientTherapists, setTeamMember, setTeamPatient, updateTeam,
} from '../../services/abaService';
import { calloutStatusLabel } from '../../utils/aba/labels.js';
import { getProfession } from '../../data/professionalCouncils';
import { AbaDialog } from './AbaDialog';
import { AbaIcon } from './AbaIcon';

// ============================================================
// Times ABA (trazido do Atlas, TeamsPage). A administração cria o time e
// escolhe quem supervisiona; a supervisão monta o time (terapeutas e
// crianças) e convoca colega de outro time para uma criança — o acesso
// excepcional vale na hora ("um atendimento" encerra sozinho em 24h,
// "por período" vai até o fim informado). Quem decide é o banco.
// ============================================================

const toLocalInput = value => {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

const initials = name => String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join('').toUpperCase() || 'EQ';

export function AbaTeams() {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({});
  const viewed = useRef(new Set());
  const [openedAt] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    try {
      const next = await loadTeams();
      setState(next);
      setError(null);
      return next;
    } catch (loadError) {
      setError(loadError.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadTeams()
      .then(next => { if (!cancelled) { setState(next); setError(null); } })
      .catch(loadError => { if (!cancelled) setError(loadError.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Convocação aberta pela primeira vez: registra que o terapeuta viu.
  useEffect(() => {
    if (!state) return;
    const unseen = state.callouts.filter(callout => callout.therapistId === state.userId
      && callout.status === 'convocado' && !callout.viewedAt && !viewed.current.has(callout.id));
    if (!unseen.length) return;
    unseen.forEach(callout => viewed.current.add(callout.id));
    void Promise.all(unseen.map(callout => manageCallout(callout.id, 'visualizar'))).catch(() => undefined);
  }, [state]);

  if (loading && !state) return <div className="aba-page"><p className="aba-muted">Carregando os times...</p></div>;
  if (error && !state) return <div className="aba-page"><p className="aba-error" role="alert">{error}</p></div>;
  if (!state) return null;

  const { isAdmin, userId } = state;
  const teams = state.teams;
  const selectedTeam = teams.find(team => team.id === selectedTeamId) || teams[0] || null;
  const canManage = Boolean(selectedTeam && (isAdmin || selectedTeam.supervisorId === userId));
  const person = id => state.professionals.find(item => item.id === id);
  const personName = id => person(id)?.name || 'Profissional';
  const teamName = id => teams.find(team => team.id === id)?.name || 'outro time';

  const availableSupervisors = state.professionals.filter(item => !item.supervisedTeamId);
  const availableTherapists = state.professionals.filter(item => selectedTeam
    && item.id !== selectedTeam.supervisorId
    && !item.supervisedTeamId
    && item.memberTeamId !== selectedTeam.id
    && (isAdmin || !item.memberTeamId));
  const availablePatients = state.availablePatients.filter(patient => selectedTeam && patient.teamId !== selectedTeam.id && (isAdmin || !patient.teamId));
  const externalTherapists = state.professionals.filter(item => selectedTeam
    && item.id !== selectedTeam.supervisorId
    && !selectedTeam.memberIds.includes(item.id));
  const activeForMe = state.callouts.filter(callout => callout.therapistId === userId && ['convocado', 'aceito'].includes(callout.status));

  const run = async (action, success) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      await refresh();
      setDialog(null);
      setMessage(success);
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setBusy(false);
    }
  };

  const open = (type, initial = {}) => {
    setForm(initial);
    setError(null);
    setDialog(type);
  };

  const field = key => form[key] ?? '';
  const setField = (key, value) => setForm(current => ({ ...current, [key]: value }));

  return (
    <div className="aba-page">
      <div className="aba-page-head">
        <div>
          <p className="aba-eyebrow">Times</p>
          <h2>Times de atendimento</h2>
          <p className="aba-muted">Cada supervisão coordena um time. O prontuário ABA fica com o time da criança; quem é de fora só entra por convocação registrada.</p>
        </div>
        {isAdmin && <button type="button" className="primary-button" onClick={() => open('create')}><AbaIcon name="plus" /> Novo time</button>}
      </div>
      {message && <p className="aba-ok-banner" role="status">{message}</p>}
      {error && <p className="aba-error" role="alert">{error}</p>}

      {activeForMe.length > 0 && (
        <section className="aba-card aba-callout-inbox">
          <div>
            <p className="aba-eyebrow">Convocações</p>
            <h3>Você foi chamado para ajudar</h3>
            <p className="aba-muted">O acesso é só à criança indicada. Confirme antes, durante ou ao terminar.</p>
          </div>
          {activeForMe.map(callout => (
            <article key={callout.id}>
              <span className="aba-callout-pulse"><AbaIcon name="bell" size={18} /></span>
              <div>
                <strong>{callout.patientName}</strong>
                <small>{callout.requestedByName} · {callout.reason}</small>
                <span>{callout.kind === 'periodo' ? 'Apoio por período' : 'Um atendimento'} · {new Date(callout.startsAt).toLocaleString('pt-BR')}{callout.activeNow ? '' : ' · acesso encerrado'}</span>
              </div>
              <button type="button" className="primary-button" onClick={() => open('respond', { calloutId: callout.id, action: callout.status === 'aceito' ? 'concluir' : 'aceitar', moment: 'antes' })}>Registrar resposta</button>
            </article>
          ))}
        </section>
      )}

      <section className="aba-team-layout">
        <aside className="aba-team-switcher">
          <header><p className="aba-eyebrow">Times</p><strong>{teams.length} {teams.length === 1 ? 'time' : 'times'}</strong></header>
          {teams.map(team => (
            <button key={team.id} type="button" aria-pressed={selectedTeam?.id === team.id} onClick={() => setSelectedTeamId(team.id)}>
              <span className="aba-avatar">{initials(personName(team.supervisorId))}</span>
              <span>
                <strong>{team.name}</strong>
                <small>{personName(team.supervisorId)}</small>
                <em>{team.memberIds.length} {team.memberIds.length === 1 ? 'terapeuta' : 'terapeutas'} · {team.patients.length} {team.patients.length === 1 ? 'criança' : 'crianças'}</em>
              </span>
            </button>
          ))}
          {!teams.length && <p className="aba-empty">{isAdmin ? 'Nenhum time criado ainda.' : 'Você ainda não está num time.'}</p>}
        </aside>

        {selectedTeam && (
          <div className="aba-team-board">
            <header className="aba-team-hero">
              <div>
                <p className="aba-eyebrow">{selectedTeam.supervisorId === userId ? 'Time sob sua supervisão' : isAdmin ? 'Time da clínica' : 'Meu time'}</p>
                <h3>{selectedTeam.name}</h3>
                <p>Supervisão: <strong>{personName(selectedTeam.supervisorId)}</strong></p>
              </div>
              {canManage && (
                <div className="aba-button-row">
                  {isAdmin && <button type="button" className="quiet-button" onClick={() => open('edit-team', { name: selectedTeam.name, supervisorId: selectedTeam.supervisorId })}><AbaIcon name="pencil" /> Time</button>}
                  <button type="button" className="quiet-button" onClick={() => open('therapist')}><AbaIcon name="plus" /> Terapeuta</button>
                  <button type="button" className="quiet-button" onClick={() => open('patient')}><AbaIcon name="plus" /> Criança</button>
                  <button
                    type="button"
                    className="primary-button"
                    disabled={!selectedTeam.patients.length || !externalTherapists.length}
                    onClick={() => open('callout', { kind: 'atendimento', startsAt: toLocalInput(openedAt) })}
                  >
                    <AbaIcon name="users" /> Convocar apoio
                  </button>
                </div>
              )}
            </header>
            <div className="aba-team-columns">
              <section>
                <div className="aba-section-head"><div><p className="aba-eyebrow">Equipe</p><h4>Terapeutas</h4></div><span className="aba-pill">{selectedTeam.memberIds.length}</span></div>
                <div className="aba-team-people">
                  {selectedTeam.memberIds.map(id => (
                    <article key={id}>
                      <span className="aba-avatar">{initials(personName(id))}</span>
                      <div><strong>{personName(id)}</strong><small>{person(id)?.profession ? getProfession(person(id).profession).label : 'Terapeuta ABA'}</small></div>
                      {canManage && (
                        <button type="button" className="quiet-button" aria-label={`Tirar ${personName(id)} do time`} disabled={busy} onClick={() => void run(() => setTeamMember(selectedTeam.id, id, false), 'Terapeuta saiu do time.')}>
                          <AbaIcon name="close" />
                        </button>
                      )}
                    </article>
                  ))}
                  {!selectedTeam.memberIds.length && <p className="aba-empty">Adicione terapeutas ao time.</p>}
                </div>
              </section>
              <section>
                <div className="aba-section-head"><div><p className="aba-eyebrow">Carteira do time</p><h4>Crianças</h4></div><span className="aba-pill">{selectedTeam.patients.length}</span></div>
                <div className="aba-team-patients">
                  {selectedTeam.patients.map(patient => (
                    <article key={patient.id}>
                      <div className="aba-team-patient-top">
                        <span className="aba-avatar">{initials(patient.name)}</span>
                        <strong>{patient.name}</strong>
                        {canManage && (
                          <span className="aba-button-row">
                            <button type="button" className="quiet-button" aria-label={`Responsáveis por ${patient.name}`} onClick={() => open('assignment', { patientId: patient.id, therapistIds: patient.therapistIds })}><AbaIcon name="pencil" /></button>
                            <button type="button" className="quiet-button" aria-label={`Tirar ${patient.name} do time`} disabled={busy} onClick={() => void run(() => setTeamPatient(selectedTeam.id, patient.id, false), 'Criança saiu do time.')}><AbaIcon name="close" /></button>
                          </span>
                        )}
                      </div>
                      <div className="aba-team-patient-therapists">
                        {patient.therapistIds.map(id => <span key={id}>{personName(id)}</span>)}
                        {!patient.therapistIds.length && <em>Sem terapeuta específico</em>}
                      </div>
                    </article>
                  ))}
                  {!selectedTeam.patients.length && <p className="aba-empty">Vincule as crianças atendidas por este time.</p>}
                </div>
              </section>
            </div>
          </div>
        )}
      </section>

      {state.callouts.length > 0 && (
        <section className="aba-card">
          <div className="aba-section-head"><div><p className="aba-eyebrow">Histórico</p><h3>Convocações</h3></div><span className="aba-pill">{state.callouts.length}</span></div>
          <div className="aba-callout-history">
            {state.callouts.map(callout => {
              const canCancel = ['convocado', 'aceito'].includes(callout.status)
                && (isAdmin || callout.requestedBy === userId || teams.some(team => team.id === callout.teamId && team.supervisorId === userId));
              return (
                <article key={callout.id}>
                  <div>
                    <span className={`aba-status aba-callout-status--${callout.status}`}>{calloutStatusLabel(callout.status)}</span>
                    <strong>{callout.patientName}</strong>
                    <p>{callout.therapistName} · {callout.reason}</p>
                    <small>
                      Criada em {new Date(callout.createdAt).toLocaleString('pt-BR')} por {callout.requestedByName}
                      {callout.acceptanceMoment ? ` · aceite ${callout.acceptanceMoment} do atendimento` : ''}
                      {callout.response ? ` · ${callout.response}` : ''}
                    </small>
                  </div>
                  {canCancel && (
                    <button type="button" className="quiet-button" disabled={busy} onClick={() => open('cancel', { calloutId: callout.id })}>Cancelar</button>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}

      {dialog === 'create' && (
        <AbaDialog title="Criar novo time" busy={busy} onClose={() => setDialog(null)}>
          <label className="aba-field">Nome do time<input value={field('name')} placeholder="Ex.: Time Girassol" onChange={event => setField('name', event.target.value)} /></label>
          <label className="aba-field">Supervisão
            <select value={field('supervisorId')} onChange={event => setField('supervisorId', event.target.value)}>
              <option value="">Selecione</option>
              {availableSupervisors.map(item => <option key={item.id} value={item.id}>{item.name}{item.memberTeamId ? ` · hoje em ${teamName(item.memberTeamId)}` : ''}</option>)}
            </select>
            <small className="aba-hint">Só aparecem profissionais da clínica com a área ABA que ainda não coordenam um time.</small>
          </label>
          {error && <p className="aba-error" role="alert">{error}</p>}
          <div className="aba-form-actions">
            <button type="button" className="quiet-button" disabled={busy} onClick={() => setDialog(null)}>Cancelar</button>
            <button type="button" className="primary-button" disabled={busy || field('name').trim().length < 2 || !field('supervisorId')} onClick={() => void run(async () => {
              const id = await createTeam(field('name').trim(), field('supervisorId'));
              setSelectedTeamId(id);
            }, 'Time criado.')}>{busy ? 'Criando...' : 'Criar time'}</button>
          </div>
        </AbaDialog>
      )}

      {dialog === 'edit-team' && selectedTeam && (
        <AbaDialog title={`Time · ${selectedTeam.name}`} busy={busy} onClose={() => setDialog(null)}>
          <label className="aba-field">Nome<input value={field('name')} onChange={event => setField('name', event.target.value)} /></label>
          <label className="aba-field">Supervisão
            <select value={field('supervisorId')} onChange={event => setField('supervisorId', event.target.value)}>
              <option value={selectedTeam.supervisorId}>{personName(selectedTeam.supervisorId)} (atual)</option>
              {availableSupervisors.filter(item => item.id !== selectedTeam.supervisorId).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <small className="aba-hint">A nova supervisão passa a responder pelas crianças e terapeutas deste time.</small>
          </label>
          {error && <p className="aba-error" role="alert">{error}</p>}
          <div className="aba-form-actions">
            <button type="button" className="quiet-button" disabled={busy} onClick={() => open('archive-team')}>Encerrar time</button>
            <button type="button" className="primary-button" disabled={busy} onClick={() => void run(() => updateTeam(selectedTeam.id, {
              name: field('name').trim() || null,
              supervisorId: field('supervisorId') !== selectedTeam.supervisorId ? field('supervisorId') : null,
            }), 'Time atualizado.')}>Salvar</button>
          </div>
        </AbaDialog>
      )}

      {dialog === 'archive-team' && selectedTeam && (
        <AbaDialog title={`Encerrar ${selectedTeam.name}`} busy={busy} onClose={() => setDialog(null)}>
          <p>Os terapeutas e as crianças saem do time e ficam sem time até serem colocados em outro. As sessões e os programas continuam.</p>
          <div className="aba-form-actions">
            <button type="button" className="quiet-button" disabled={busy} onClick={() => setDialog(null)}>Voltar</button>
            <button type="button" className="primary-button aba-button-risk" disabled={busy} onClick={() => void run(async () => {
              await updateTeam(selectedTeam.id, { archive: true });
              setSelectedTeamId('');
            }, 'Time encerrado.')}>Encerrar time</button>
          </div>
        </AbaDialog>
      )}

      {dialog === 'therapist' && selectedTeam && (
        <AbaDialog title={`Adicionar terapeuta · ${selectedTeam.name}`} busy={busy} onClose={() => setDialog(null)}>
          <label className="aba-field">Terapeuta
            <select value={field('therapistId')} onChange={event => setField('therapistId', event.target.value)}>
              <option value="">Selecione</option>
              {availableTherapists.map(item => <option key={item.id} value={item.id}>{item.name}{item.memberTeamId ? ` · transferir de ${teamName(item.memberTeamId)}` : ''}</option>)}
            </select>
          </label>
          <p className="aba-note">Cada terapeuta fica em um time. Transferir de outro time é com a administração.</p>
          {error && <p className="aba-error" role="alert">{error}</p>}
          <div className="aba-form-actions">
            <button type="button" className="quiet-button" disabled={busy} onClick={() => setDialog(null)}>Cancelar</button>
            <button type="button" className="primary-button" disabled={busy || !field('therapistId')} onClick={() => void run(() => setTeamMember(selectedTeam.id, field('therapistId'), true), 'Terapeuta no time.')}>Adicionar</button>
          </div>
        </AbaDialog>
      )}

      {dialog === 'patient' && selectedTeam && (
        <AbaDialog title={`Adicionar criança · ${selectedTeam.name}`} busy={busy} onClose={() => setDialog(null)}>
          <label className="aba-field">Criança
            <select value={field('patientId')} onChange={event => setField('patientId', event.target.value)}>
              <option value="">Selecione</option>
              {availablePatients.map(patient => <option key={patient.id} value={patient.id}>{patient.name}{patient.teamId ? ` · transferir de ${teamName(patient.teamId)}` : ''}</option>)}
            </select>
            <small className="aba-hint">Aparecem as crianças matriculadas em ABA. Para trazer alguém novo, abra o paciente na tela inicial da área ABA.</small>
          </label>
          {error && <p className="aba-error" role="alert">{error}</p>}
          <div className="aba-form-actions">
            <button type="button" className="quiet-button" disabled={busy} onClick={() => setDialog(null)}>Cancelar</button>
            <button type="button" className="primary-button" disabled={busy || !field('patientId')} onClick={() => void run(() => setTeamPatient(selectedTeam.id, field('patientId'), true), 'Criança no time.')}>Adicionar</button>
          </div>
        </AbaDialog>
      )}

      {dialog === 'assignment' && selectedTeam && (
        <AbaDialog title={`Responsáveis · ${selectedTeam.patients.find(patient => patient.id === form.patientId)?.name || 'criança'}`} busy={busy} onClose={() => setDialog(null)}>
          <p className="aba-note">O time inteiro continua atendendo; aqui ficam os responsáveis diretos.</p>
          <div className="aba-chip-row">
            {selectedTeam.memberIds.map(id => (
              <button
                key={id}
                type="button"
                className="aba-chip"
                aria-pressed={(form.therapistIds || []).includes(id)}
                onClick={() => setField('therapistIds', (form.therapistIds || []).includes(id) ? form.therapistIds.filter(item => item !== id) : [...(form.therapistIds || []), id])}
              >
                {personName(id)}
              </button>
            ))}
          </div>
          {!selectedTeam.memberIds.length && <p className="aba-empty">O time ainda não tem terapeutas.</p>}
          {error && <p className="aba-error" role="alert">{error}</p>}
          <div className="aba-form-actions">
            <button type="button" className="quiet-button" disabled={busy} onClick={() => setDialog(null)}>Cancelar</button>
            <button type="button" className="primary-button" disabled={busy} onClick={() => void run(() => setPatientTherapists(form.patientId, form.therapistIds || []), 'Responsáveis atualizados.')}>Salvar</button>
          </div>
        </AbaDialog>
      )}

      {dialog === 'callout' && selectedTeam && (
        <AbaDialog title="Convocar terapeuta de outro time" busy={busy} guardUnsaved onClose={() => setDialog(null)}>
          <div className="aba-form-grid">
            <label className="aba-field">Criança
              <select value={field('patientId')} onChange={event => setField('patientId', event.target.value)}>
                <option value="">Selecione</option>
                {selectedTeam.patients.map(patient => <option key={patient.id} value={patient.id}>{patient.name}</option>)}
              </select>
            </label>
            <label className="aba-field">Terapeuta convidado
              <select value={field('therapistId')} onChange={event => setField('therapistId', event.target.value)}>
                <option value="">Selecione</option>
                {externalTherapists.map(item => <option key={item.id} value={item.id}>{item.name} · {item.memberTeamId ? teamName(item.memberTeamId) : 'sem time'}</option>)}
              </select>
            </label>
          </div>
          <div className="aba-chip-row" role="group" aria-label="Tipo">
            <button type="button" className="aba-chip" aria-pressed={field('kind') === 'atendimento'} onClick={() => setField('kind', 'atendimento')}>Um atendimento (24h)</button>
            <button type="button" className="aba-chip" aria-pressed={field('kind') === 'periodo'} onClick={() => setField('kind', 'periodo')}>Apoio por período</button>
          </div>
          <div className="aba-form-grid">
            <label className="aba-field">Início<input type="datetime-local" value={field('startsAt')} onChange={event => setField('startsAt', event.target.value)} /></label>
            {field('kind') === 'periodo' && <label className="aba-field">Fim do período<input type="datetime-local" value={field('endsAt')} onChange={event => setField('endsAt', event.target.value)} /></label>}
          </div>
          <label className="aba-field">Motivo do apoio
            <textarea rows={3} value={field('reason')} placeholder="Descreva objetivamente por que o apoio é necessário." onChange={event => setField('reason', event.target.value)} />
          </label>
          <p className="aba-note">O terapeuta recebe acesso só a esta criança assim que você enviar, sem aprovação de outra supervisão. “Um atendimento” encerra sozinho 24h depois do início; “por período” vale até o fim informado.</p>
          {error && <p className="aba-error" role="alert">{error}</p>}
          <div className="aba-form-actions">
            <button type="button" className="quiet-button" disabled={busy} onClick={() => setDialog(null)}>Cancelar</button>
            <button
              type="button"
              className="primary-button"
              disabled={busy || !field('patientId') || !field('therapistId') || field('reason').trim().length < 3 || (field('kind') === 'periodo' && !field('endsAt'))}
              onClick={() => void run(() => createCallout({
                patientId: field('patientId'),
                therapistId: field('therapistId'),
                kind: field('kind'),
                reason: field('reason').trim(),
                startsAt: field('startsAt') ? new Date(field('startsAt')).toISOString() : null,
                endsAt: field('kind') === 'periodo' && field('endsAt') ? new Date(field('endsAt')).toISOString() : null,
              }), 'Convocação enviada. O terapeuta já pode atender esta criança.')}
            >
              {busy ? 'Enviando...' : 'Enviar convocação'}
            </button>
          </div>
        </AbaDialog>
      )}

      {dialog === 'respond' && (
        <AbaDialog title="Registrar resposta à convocação" busy={busy} onClose={() => setDialog(null)}>
          <div className="aba-quick-field">
            <span className="aba-chip-label">O que aconteceu</span>
            <div className="aba-chip-row">
              {[['aceitar', 'Aceito / vou atender'], ['concluir', 'Atendimento realizado'], ['recusar', 'Não pude atender']].map(([value, label]) => (
                <button key={value} type="button" className="aba-chip" aria-pressed={field('action') === value} onClick={() => setField('action', value)}>{label}</button>
              ))}
            </div>
          </div>
          {field('action') !== 'recusar' && (
            <div className="aba-quick-field">
              <span className="aba-chip-label">Quando confirmou</span>
              <div className="aba-chip-row">
                {[['antes', 'Antes do atendimento'], ['durante', 'Durante'], ['depois', 'Ao final / depois']].map(([value, label]) => (
                  <button key={value} type="button" className="aba-chip" aria-pressed={field('moment') === value} onClick={() => setField('moment', value)}>{label}</button>
                ))}
              </div>
            </div>
          )}
          <label className="aba-field">Observação (opcional)<textarea rows={2} value={field('notes')} onChange={event => setField('notes', event.target.value)} /></label>
          {error && <p className="aba-error" role="alert">{error}</p>}
          <div className="aba-form-actions">
            <button type="button" className="quiet-button" disabled={busy} onClick={() => setDialog(null)}>Cancelar</button>
            <button type="button" className="primary-button" disabled={busy} onClick={() => void run(() => manageCallout(form.calloutId, field('action'), {
              moment: field('action') === 'recusar' ? null : field('moment'),
              notes: field('notes').trim() || null,
            }), 'Resposta registrada.')}>Registrar</button>
          </div>
        </AbaDialog>
      )}

      {dialog === 'cancel' && (
        <AbaDialog title="Cancelar convocação" busy={busy} onClose={() => setDialog(null)}>
          <p>O acesso excepcional do terapeuta a esta criança termina agora.</p>
          <label className="aba-field">Motivo (opcional)<input value={field('notes')} onChange={event => setField('notes', event.target.value)} /></label>
          <div className="aba-form-actions">
            <button type="button" className="quiet-button" disabled={busy} onClick={() => setDialog(null)}>Voltar</button>
            <button type="button" className="primary-button aba-button-risk" disabled={busy} onClick={() => void run(() => manageCallout(form.calloutId, 'cancelar', { notes: field('notes').trim() || null }), 'Convocação cancelada.')}>Cancelar convocação</button>
          </div>
        </AbaDialog>
      )}
    </div>
  );
}

export default AbaTeams;
