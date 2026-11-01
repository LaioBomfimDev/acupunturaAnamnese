import { useState } from 'react';
import { acquisitionBreakdown } from '../../utils/aba/calculations.js';
import { phaseLabel, trialCode } from '../../utils/aba/catalog.js';
import { TRIAL_RESPONSE_CODES } from '../../utils/aba/mapping.js';
import { correctSession, reviewRisk, reviewSession } from '../../services/abaService';
import { AbaDialog } from './AbaDialog';
import { FidelityDialog, FidelitySection } from './AbaFidelity';
import { AbaIcon } from './AbaIcon';
import { responseColumnLabel, reviewActionLabel, reviewStatusLabel, sessionStatusLabel } from '../../utils/aba/labels.js';

// ============================================================
// Sessões do paciente: histórico, detalhe, revisão da supervisão
// (pedir correção / aprovar e assinar), correção pelo terapeuta e
// revisão das situações de risco e fidelidade de aplicação. Trazido do
// Atlas (SessionsPage).
// ============================================================

const dateLabel = session => new Date(`${session.date}T12:00:00`).toLocaleDateString('pt-BR');
const dateTime = value => (value ? new Date(value).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

function SessionDetail({ session, data, onClose, onRequestCorrection, onApprove, onCorrect, onReviewRisk, onFidelity }) {
  const canSupervise = data.permissions.canSupervise;
  const userId = data.permissions.userId;
  const awaitingSupervision = ['pending_review', 'corrected_pending_review'].includes(session.reviewStatus);
  const canCorrect = session.reviewStatus === 'correction_requested' && (canSupervise || session.therapistId === userId);

  return (
    <AbaDialog title={`Sessão de ${dateLabel(session)}`} wide onClose={onClose}>
      <div className="aba-session-detail">
        <div className="aba-review-summary">
          <span className={`aba-status aba-status--${session.reviewStatus}`}>{reviewStatusLabel(session.reviewStatus)}</span>
          <strong>{dateLabel(session)} · {session.location}</strong>
          <small>
            {sessionStatusLabel(session.status)} · {data.professionalName(session.therapistId)}
            {session.isGeneralizationProbe ? ' · Sonda de generalização' : ''}
          </small>
          <small className="aba-muted">
            Chegada: {session.arrivalState || '—'} · Saúde: {session.healthCondition || '—'} · Rotina: {session.routineChange || '—'} · Motivação: {session.apparentMotivation || '—'}
          </small>
        </div>

        {session.correctionReason && (
          <div className="aba-review-callout">
            <strong>Correção solicitada</strong>
            <p>{session.correctionReason}</p>
            {session.correctionDeadline && <small>Prazo: {dateTime(session.correctionDeadline)}</small>}
          </div>
        )}
        {session.correctionResponse && (
          <div className="aba-review-callout is-ok">
            <strong>Resposta da correção</strong>
            <p>{session.correctionResponse}</p>
          </div>
        )}

        <div className="aba-review-records">
          {session.records.map(record => {
            const program = data.programs.find(item => item.id === record.programId);
            return (
              <article key={record.programId}>
                <div>
                  <span className="aba-tag">{record.type === 'aquisicao' ? 'Aquisição' : 'Redução'} · {phaseLabel(record.phase)}</span>
                  <strong>{program?.name || 'Programa registrado'}</strong>
                </div>
                {record.type === 'aquisicao' ? (
                  <>
                    <p className="aba-trial-codes">
                      {record.trials.map((response, index) => (
                        <span key={index} className={response ? '' : 'is-empty'} title={response ? responseColumnLabel(response) : 'Em branco'}>
                          {response ? trialCode(response) : '—'}
                          {record.trialSeconds?.[index] ? <small>{record.trialSeconds[index]}s</small> : null}
                        </span>
                      ))}
                    </p>
                    <p className="aba-muted">
                      {acquisitionBreakdown([record]).independencePercentage ?? '—'}% de independência · {record.trials.filter(Boolean).length}/{record.trials.length} tentativas preenchidas
                    </p>
                  </>
                ) : (
                  <p>Valor registrado: {record.value} {program?.type === 'reducao' ? program.unit : ''}</p>
                )}
              </article>
            );
          })}
        </div>

        <div className="aba-review-notes"><small>Notas clínicas</small><p>{session.notes || 'Sem observações adicionais.'}</p></div>

        {session.behaviors.length > 0 && (
          <div className="aba-review-notes">
            <small>Registros ABC</small>
            <ul>
              {session.behaviors.map(event => (
                <li key={event.id}>
                  <strong>{data.behaviors.find(item => item.id === event.behaviorId)?.name || 'Comportamento'}</strong>
                  {' '}· {event.moment || '—'} · A: {event.antecedent} · C: {event.consequence} · conduta: {event.conduct}
                  {event.newBehavior ? ' · apresentação nova' : ''}
                </li>
              ))}
            </ul>
          </div>
        )}

        {session.incidents.length > 0 && (
          <div className="aba-review-notes is-risk">
            <small>Situações de risco</small>
            {session.incidents.map(incident => (
              <article key={incident.id} className="aba-risk-item">
                <div>
                  <strong>{incident.reason}{incident.severity ? ` · ${incident.severity}` : ''}</strong>
                  <p>{incident.identifiedRisk}</p>
                  <small>
                    Intervenção: {incident.interventionType || '—'} · {incident.durationMinutes} min
                    {incident.injury ? ` · lesão: ${incident.injury}` : ''}
                    {incident.guardianCommunication ? ` · responsável: ${incident.guardianCommunication}` : ''}
                  </small>
                  {incident.followUp && <small>Acompanhamento: {incident.followUp}</small>}
                  {incident.reviewed && <small className="aba-ok">Revisado pela supervisão{incident.reviewNote ? `: ${incident.reviewNote}` : ''}</small>}
                </div>
                {canSupervise && !incident.reviewed && (
                  <button type="button" className="quiet-button" onClick={() => onReviewRisk(incident)}>Marcar revisado</button>
                )}
              </article>
            ))}
          </div>
        )}

        {session.reviewHistory.length > 0 && (
          <div className="aba-review-timeline">
            <h3>Histórico da revisão</h3>
            {session.reviewHistory.map(event => (
              <article key={event.id}>
                <span aria-hidden="true" />
                <div>
                  <strong>{reviewActionLabel(event.action)}</strong>
                  <small>{data.professionalName(event.actorId)} · {dateTime(event.createdAt)}</small>
                  {event.notes && <p>{event.notes}</p>}
                </div>
              </article>
            ))}
          </div>
        )}

        {session.status !== 'em_andamento' && (
          <FidelitySection session={session} data={data} onEdit={(source, saved) => onFidelity(session, source, saved)} />
        )}

        {session.signedAt && (
          <div className="aba-signature-card">
            <AbaIcon name="shield" size={22} />
            <div>
              <strong>Assinatura eletrônica registrada</strong>
              <p>{session.signatureStatement}</p>
              <small>{data.professionalName(session.signedBy)} · {dateTime(session.signedAt)}</small>
            </div>
          </div>
        )}

        <div className="aba-form-actions">
          {canCorrect && <button type="button" className="primary-button" onClick={() => onCorrect(session)}>Abrir correção</button>}
          {canSupervise && awaitingSupervision && session.status !== 'em_andamento' && (
            <>
              <button type="button" className="quiet-button" onClick={() => onRequestCorrection(session)}>Solicitar correção</button>
              <button type="button" className="primary-button" onClick={() => onApprove(session)}><AbaIcon name="shield" /> Aprovar e assinar</button>
            </>
          )}
        </div>
      </div>
    </AbaDialog>
  );
}

function CorrectionDialog({ session, data, onClose, onDone }) {
  const [draft, setDraft] = useState(() => structuredClone(session));
  const [response, setResponse] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const setTrial = (programId, index, value) => setDraft(current => ({
    ...current,
    records: current.records.map(record => (record.programId === programId && record.type === 'aquisicao'
      ? { ...record, trials: record.trials.map((trial, position) => (position === index ? (value || null) : trial)) }
      : record)),
  }));
  const setSeconds = (programId, index, value) => setDraft(current => ({
    ...current,
    records: current.records.map(record => {
      if (record.programId !== programId || record.type !== 'aquisicao') return record;
      const base = record.trialSeconds ?? Array(record.trials.length).fill(null);
      return { ...record, trialSeconds: base.map((entry, position) => (position === index ? (value === '' ? null : Number(value)) : entry)) };
    }),
  }));

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await correctSession(draft, response.trim());
      onDone();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AbaDialog title="Corrigir sessão clínica" wide busy={saving} guardUnsaved onClose={onClose}>
      <div className="aba-correction">
        <div className="aba-review-callout">
          <strong>Solicitação da supervisão</strong>
          <p>{session.correctionReason}</p>
          {session.correctionDeadline && <small>Prazo: {dateTime(session.correctionDeadline)}</small>}
        </div>
        {draft.records.map(record => {
          const program = data.programs.find(item => item.id === record.programId);
          const measuresTime = Boolean(program?.timeMeasure && program.timeMeasure !== 'nenhuma');
          return (
            <fieldset key={record.programId} className="aba-correction-program">
              <legend>{program?.name || 'Programa'}</legend>
              {record.type === 'aquisicao' ? (
                <div className="aba-correction-trials">
                  {record.trials.map((response, index) => (
                    <label key={index} className="aba-field">
                      {program?.taskSteps?.[index] || `Tentativa ${index + 1}`}
                      <select value={response ?? ''} onChange={event => setTrial(record.programId, index, event.target.value)}>
                        <option value="">Não preenchida</option>
                        {TRIAL_RESPONSE_CODES.map(code => <option key={code} value={code}>{responseColumnLabel(code)} ({trialCode(code)})</option>)}
                      </select>
                      {measuresTime && (
                        <input
                          type="number"
                          min="0"
                          placeholder="segundos"
                          aria-label={`Segundos da tentativa ${index + 1}`}
                          value={record.trialSeconds?.[index] ?? ''}
                          onChange={event => setSeconds(record.programId, index, event.target.value)}
                        />
                      )}
                    </label>
                  ))}
                </div>
              ) : (
                <label className="aba-field">
                  Valor corrigido
                  <input
                    type="number"
                    min="0"
                    value={record.value}
                    onChange={event => setDraft(current => ({
                      ...current,
                      records: current.records.map(item => (item.programId === record.programId ? { ...item, value: Number(event.target.value) } : item)),
                    }))}
                  />
                </label>
              )}
            </fieldset>
          );
        })}
        <label className="aba-field">
          Notas clínicas atualizadas
          <textarea value={draft.notes} rows={4} onChange={event => setDraft(current => ({ ...current, notes: event.target.value }))} />
        </label>
        <label className="aba-field">
          Descreva o que foi corrigido
          <textarea value={response} rows={3} onChange={event => setResponse(event.target.value)} />
        </label>
        {error && <p className="aba-error" role="alert">{error}</p>}
        <div className="aba-form-actions">
          <button type="button" className="quiet-button" disabled={saving} onClick={onClose}>Cancelar</button>
          <button type="button" className="primary-button" disabled={saving || response.trim().length < 3} onClick={() => void submit()}>
            {saving ? 'Enviando correção...' : 'Enviar para nova revisão'}
          </button>
        </div>
      </div>
    </AbaDialog>
  );
}

function RequestCorrectionDialog({ session, data, onClose, onDone }) {
  const [hours, setHours] = useState(data.settings.correctionWindowHours);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await reviewSession(session.id, 'request_correction', { notes: notes.trim(), windowHours: Number(hours) });
      onDone();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AbaDialog title="Solicitar correção" busy={saving} guardUnsaved onClose={onClose}>
      <p className="aba-note">A sessão continua preservada. O terapeuta recebe uma versão editável dentro do prazo, e o que existia antes fica no histórico.</p>
      <label className="aba-field">Prazo (horas)
        <input type="number" min="1" max="168" value={hours} onChange={event => setHours(event.target.value)} />
      </label>
      <label className="aba-field">O que precisa ser corrigido
        <textarea rows={5} value={notes} onChange={event => setNotes(event.target.value)} />
      </label>
      {error && <p className="aba-error" role="alert">{error}</p>}
      <div className="aba-form-actions">
        <button type="button" className="quiet-button" disabled={saving} onClick={onClose}>Cancelar</button>
        <button type="button" className="primary-button" disabled={saving || notes.trim().length < 3} onClick={() => void submit()}>
          {saving ? 'Enviando...' : 'Solicitar correção'}
        </button>
      </div>
    </AbaDialog>
  );
}

function ApproveDialog({ session, onClose, onDone }) {
  const [notes, setNotes] = useState('');
  const [attested, setAttested] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await reviewSession(session.id, 'approve_and_sign', { notes: notes.trim() || null, attested });
      onDone();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AbaDialog title="Aprovar e assinar sessão" busy={saving} onClose={onClose}>
      <div className="aba-signature-card">
        <AbaIcon name="shield" size={24} />
        <div>
          <strong>Atesto eletrônico da supervisão</strong>
          <p>Seu nome, a data, a hora e a versão da sessão ficam registrados no histórico clínico.</p>
        </div>
      </div>
      <label className="aba-field">Parecer da revisão (opcional)
        <textarea rows={4} value={notes} onChange={event => setNotes(event.target.value)} />
      </label>
      <button type="button" className="aba-chip aba-chip--wide" aria-pressed={attested} onClick={() => setAttested(current => !current)}>
        <AbaIcon name="check" /> Atesto que revisei os registros clínicos e aprovo o conteúdo desta sessão
      </button>
      {error && <p className="aba-error" role="alert">{error}</p>}
      <div className="aba-form-actions">
        <button type="button" className="quiet-button" disabled={saving} onClick={onClose}>Cancelar</button>
        <button type="button" className="primary-button" disabled={saving || !attested} onClick={() => void submit()}>
          {saving ? 'Assinando...' : 'Aprovar e assinar'}
        </button>
      </div>
    </AbaDialog>
  );
}

function RiskReviewDialog({ incident, onClose, onDone }) {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await reviewRisk(incident.id, note.trim());
      onDone();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <AbaDialog title="Revisar situação de risco" busy={saving} onClose={onClose}>
      <p><strong>{incident.reason}</strong> — {incident.identifiedRisk}</p>
      <label className="aba-field">Conduta da supervisão (opcional)
        <textarea rows={3} value={note} onChange={event => setNote(event.target.value)} />
      </label>
      {error && <p className="aba-error" role="alert">{error}</p>}
      <div className="aba-form-actions">
        <button type="button" className="quiet-button" disabled={saving} onClick={onClose}>Cancelar</button>
        <button type="button" className="primary-button" disabled={saving} onClick={() => void submit()}>Marcar revisado</button>
      </div>
    </AbaDialog>
  );
}

export function AbaSessions({ data, onChanged, openSessionId = null }) {
  const sessions = data.sessions
    .filter(session => session.status !== 'em_andamento')
    .sort((left, right) => (right.startAt || 0) - (left.startAt || 0));
  const [selectedId, setSelectedId] = useState(openSessionId);
  const [dialog, setDialog] = useState(null);
  const selected = sessions.find(session => session.id === selectedId) || null;
  const canSupervise = data.permissions.canSupervise;
  const userId = data.permissions.userId;
  const pending = sessions.filter(session => (canSupervise
    ? ['pending_review', 'corrected_pending_review'].includes(session.reviewStatus)
    : session.reviewStatus === 'correction_requested' && session.therapistId === userId));

  const done = () => {
    setDialog(null);
    setSelectedId(null);
    onChanged?.();
  };

  return (
    <div className="aba-page">
      <div className="aba-page-head">
        <div>
          <p className="aba-eyebrow">Sessões</p>
          <h2>{canSupervise ? 'Coleta e revisão clínica' : 'Sessões registradas'}</h2>
          <p className="aba-muted">{canSupervise
            ? 'Revise, devolva para correção ou assine as sessões deste paciente.'
            : 'Abra uma sessão para ver os registros; correções pedidas pela supervisão aparecem no topo.'}</p>
        </div>
      </div>

      {pending.length > 0 && (
        <section className="aba-card">
          <div className="aba-section-head">
            <div><p className="aba-eyebrow">{canSupervise ? 'Fila da supervisão' : 'Pendências do terapeuta'}</p><h3>{canSupervise ? 'Aguardando decisão' : 'Correções solicitadas'}</h3></div>
            <span className="aba-pill">{pending.length}</span>
          </div>
          <div className="aba-review-grid">
            {pending.map(session => (
              <article key={session.id}>
                <div>
                  <span className={`aba-status aba-status--${session.reviewStatus}`}>{reviewStatusLabel(session.reviewStatus)}</span>
                  <h4>{dateLabel(session)} · {data.professionalName(session.therapistId)}</h4>
                  {session.correctionReason && <small>{session.correctionReason}</small>}
                </div>
                <button type="button" className="quiet-button" onClick={() => setSelectedId(session.id)}>Ver registros</button>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="aba-card">
        <div className="aba-section-head"><div><p className="aba-eyebrow">Histórico</p><h3>Sessões recentes</h3></div></div>
        {sessions.length ? (
          <div className="aba-table-wrap">
            <table className="aba-table">
              <thead><tr><th>Data</th><th>Terapeuta</th><th>Programas</th><th>Situação</th><th>Revisão</th><th aria-label="Ações" /></tr></thead>
              <tbody>
                {sessions.map(session => (
                  <tr key={session.id}>
                    <td>{dateLabel(session)}</td>
                    <td>{data.professionalName(session.therapistId)}</td>
                    <td>{session.records.length}</td>
                    <td>{sessionStatusLabel(session.status)}{session.incidents.length ? ' · risco' : ''}</td>
                    <td><span className={`aba-status aba-status--${session.reviewStatus}`}>{reviewStatusLabel(session.reviewStatus)}</span></td>
                    <td><button type="button" className="quiet-button" onClick={() => setSelectedId(session.id)}>Abrir</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="aba-empty">Nenhuma sessão finalizada ainda.</p>}
      </section>

      {selected && !dialog && (
        <SessionDetail
          session={selected}
          data={data}
          onClose={() => setSelectedId(null)}
          onRequestCorrection={session => setDialog({ type: 'request', session })}
          onApprove={session => setDialog({ type: 'approve', session })}
          onCorrect={session => setDialog({ type: 'correct', session })}
          onReviewRisk={incident => setDialog({ type: 'risk', incident })}
          onFidelity={(session, source, saved) => setDialog({ type: 'fidelity', session, source, saved })}
        />
      )}
      {dialog?.type === 'request' && <RequestCorrectionDialog session={dialog.session} data={data} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.type === 'approve' && <ApproveDialog session={dialog.session} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.type === 'correct' && <CorrectionDialog session={dialog.session} data={data} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.type === 'risk' && <RiskReviewDialog incident={dialog.incident} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.type === 'fidelity' && (
        <FidelityDialog
          session={dialog.session}
          source={dialog.source}
          saved={dialog.saved}
          onClose={() => setDialog(null)}
          onDone={() => { setDialog(null); onChanged?.(); }}
        />
      )}
    </div>
  );
}

export default AbaSessions;
