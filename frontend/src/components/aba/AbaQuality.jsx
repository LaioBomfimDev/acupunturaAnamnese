import { useState } from 'react';
import { saveIoa } from '../../services/abaService';
import {
  IOA_METHODS,
  QUALITY_MINIMUM,
  ioaAgreement,
  ioaMethod,
  summarizeFidelity,
  summarizeIoa,
} from '../../utils/aba/quality.js';
import { AbaDialog } from './AbaDialog';
import { FidelityDialog, FidelityScore } from './AbaFidelity';
import { AbaIcon } from './AbaIcon';

// ============================================================
// Qualidade da coleta do paciente: fidelidade de aplicação sessão a
// sessão e concordância entre observadores (IOA). Fidelidade baixa ou
// IOA abaixo do mínimo viram alerta (aba_refresh_alerts). Trazido do
// Atlas (FidelitySection + IoaPanel), aqui no paciente.
// ============================================================

const dateLabel = value => (value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') : '—');
const today = () => new Date().toLocaleDateString('en-CA');

function IoaDialog({ data, patientId, onClose, onDone }) {
  const sessions = data.sessions
    .filter(session => session.status !== 'em_andamento')
    .sort((left, right) => (right.startAt || 0) - (left.startAt || 0))
    .slice(0, 60);
  const programs = data.programs.filter(program => !program.archivedAt);
  const [form, setForm] = useState({
    method: 'tentativa_por_tentativa',
    primaryValue: '',
    secondaryValue: '',
    sessionId: '',
    programId: '',
    secondaryObserverId: '',
    observedOn: today(),
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const method = ioaMethod(form.method);
  const preview = ioaAgreement(form.method, form.primaryValue, form.secondaryValue);
  const set = patch => setForm(current => ({ ...current, ...patch }));
  const started = form.primaryValue !== '' || form.secondaryValue !== '' || form.notes.trim() !== '';

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await saveIoa(patientId, {
        ...form,
        primaryValue: Number(form.primaryValue),
        secondaryValue: Number(form.secondaryValue),
        observedOn: form.sessionId ? null : form.observedOn,
      });
      onDone();
    } catch (submitError) {
      setError(submitError.message);
      setSaving(false);
    }
  };

  return (
    <AbaDialog title="Registrar concordância (IOA)" busy={saving} guardUnsaved={started} onClose={onClose}>
      <p className="aba-muted">Dois observadores registram a mesma coisa sem combinar. Os dois números ficam guardados e a concordância é calculada pelo método.</p>
      <div className="aba-field">Método
        <div className="aba-chip-row">
          {IOA_METHODS.map(item => (
            <button key={item.value} type="button" className="aba-chip" aria-pressed={form.method === item.value} onClick={() => set({ method: item.value })}>
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div className="aba-form-grid">
        <label className="aba-field">{method.primaryLabel}
          <input type="number" min="0" step="any" inputMode="decimal" value={form.primaryValue} onChange={event => set({ primaryValue: event.target.value })} />
        </label>
        <label className="aba-field">{method.secondaryLabel}
          <input type="number" min="0" step="any" inputMode="decimal" value={form.secondaryValue} onChange={event => set({ secondaryValue: event.target.value })} />
        </label>
        <label className="aba-field">Sessão (opcional)
          <select value={form.sessionId} onChange={event => set({ sessionId: event.target.value })}>
            <option value="">Sem sessão vinculada</option>
            {sessions.map(session => (
              <option key={session.id} value={session.id}>{dateLabel(session.date)} · {data.professionalName(session.therapistId)}</option>
            ))}
          </select>
        </label>
        {!form.sessionId && (
          <label className="aba-field">Data da observação
            <input type="date" max={today()} value={form.observedOn} onChange={event => set({ observedOn: event.target.value })} />
          </label>
        )}
        <label className="aba-field">Programa (opcional)
          <select value={form.programId} onChange={event => set({ programId: event.target.value })}>
            <option value="">Sem programa vinculado</option>
            {programs.map(program => <option key={program.id} value={program.id}>{program.name}</option>)}
          </select>
        </label>
        <label className="aba-field">Segundo observador (opcional)
          <select value={form.secondaryObserverId} onChange={event => set({ secondaryObserverId: event.target.value })}>
            <option value="">Não informado</option>
            {data.professionals.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
          </select>
        </label>
      </div>
      <div className="aba-fidelity-readout">
        <FidelityScore value={preview.value == null ? null : Math.round(preview.value)} />
        <small>{preview.error || `Concordância calculada · mínimo ${QUALITY_MINIMUM}%`}</small>
      </div>
      <label className="aba-field">Observação (opcional)
        <textarea rows={2} value={form.notes} onChange={event => set({ notes: event.target.value })} />
      </label>
      {error && <p className="aba-error" role="alert">{error}</p>}
      <div className="aba-form-actions">
        <button type="button" className="quiet-button" disabled={saving} onClick={onClose}>Cancelar</button>
        <button type="button" className="primary-button" disabled={saving || preview.value == null} onClick={() => void submit()}>
          {saving ? 'Registrando...' : 'Registrar IOA'}
        </button>
      </div>
    </AbaDialog>
  );
}

export function AbaQuality({ data, patientId, onChanged }) {
  const [dialog, setDialog] = useState(null);
  const userId = data.permissions.userId;
  const canSupervise = data.permissions.canSupervise;
  const fidelity = summarizeFidelity(data.fidelity);
  const ioa = summarizeIoa(data.ioa);
  const sessions = data.sessions
    .filter(session => session.status !== 'em_andamento')
    .sort((left, right) => (right.startAt || 0) - (left.startAt || 0));
  const saved = (sessionId, source) => data.fidelity.find(entry => entry.sessionId === sessionId && entry.source === source) || null;
  const programName = id => data.programs.find(program => program.id === id)?.name || '';
  const done = () => {
    setDialog(null);
    onChanged?.();
  };

  const fidelityCell = (session, source) => {
    const entry = saved(session.id, source);
    const allowed = source === 'autoavaliacao'
      ? session.therapistId === userId || data.permissions.isAdmin
      : canSupervise;
    return (
      <div className="aba-quality-cell">
        <FidelityScore value={entry ? Math.round(entry.scorePercentage) : null} />
        {allowed && (
          <button type="button" className="quiet-button" onClick={() => setDialog({ type: 'fidelity', session, source, saved: entry })}>
            {entry ? 'Rever' : 'Avaliar'}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="aba-page">
      <div className="aba-page-head">
        <div>
          <p className="aba-eyebrow">Qualidade da coleta</p>
          <h2>Fidelidade e concordância</h2>
          <p className="aba-muted">Antes de concluir que a criança não está aprendendo, confira se o procedimento foi aplicado como planejado e se dois observadores registram igual. Mínimo {QUALITY_MINIMUM}%.</p>
        </div>
      </div>

      <div className="aba-quality-summary">
        <section className="aba-card">
          <p className="aba-eyebrow">Fidelidade da supervisão</p>
          <FidelityScore value={fidelity.supervisionMean} />
          <small className="aba-muted">
            {fidelity.supervisionCount
              ? `Média de ${fidelity.supervisionCount === 1 ? '1 sessão' : `${fidelity.supervisionCount} sessões`}${fidelity.belowMinimum ? ` · ${fidelity.belowMinimum} abaixo do mínimo` : ''}`
              : 'Nenhuma sessão avaliada pela supervisão'}
          </small>
        </section>
        <section className="aba-card">
          <p className="aba-eyebrow">Autoavaliação</p>
          <FidelityScore value={fidelity.selfMean} />
          <small className="aba-muted">{fidelity.selfCount ? `Média de ${fidelity.selfCount === 1 ? '1 sessão' : `${fidelity.selfCount} sessões`}` : 'Nenhuma autoavaliação ainda'}</small>
        </section>
        <section className="aba-card">
          <p className="aba-eyebrow">Concordância (IOA)</p>
          <FidelityScore value={ioa.mean} />
          <small className="aba-muted">
            {ioa.count
              ? `Média de ${ioa.count === 1 ? '1 registro' : `${ioa.count} registros`}${ioa.belowMinimum ? ` · ${ioa.belowMinimum} abaixo do mínimo` : ''}`
              : 'Nenhum registro de concordância'}
          </small>
        </section>
      </div>

      <section className="aba-card">
        <div className="aba-section-head">
          <div><p className="aba-eyebrow">Por sessão</p><h3>Fidelidade de aplicação</h3></div>
        </div>
        {sessions.length ? (
          <div className="aba-table-wrap">
            <table className="aba-table aba-quality-table">
              <thead><tr><th>Data</th><th>Terapeuta</th><th>Autoavaliação</th><th>Supervisão</th></tr></thead>
              <tbody>
                {sessions.map(session => (
                  <tr key={session.id}>
                    <td>{dateLabel(session.date)}</td>
                    <td>{data.professionalName(session.therapistId)}</td>
                    <td data-label="Autoavaliação">{fidelityCell(session, 'autoavaliacao')}</td>
                    <td data-label="Supervisão">{fidelityCell(session, 'supervisao')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="aba-empty">Nenhuma sessão finalizada ainda.</p>}
      </section>

      <section className="aba-card">
        <div className="aba-section-head">
          <div><p className="aba-eyebrow">Dois observadores</p><h3>Concordância entre observadores (IOA)</h3></div>
          {canSupervise && (
            <button type="button" className="primary-button" onClick={() => setDialog({ type: 'ioa' })}>
              <AbaIcon name="plus" /> Registrar IOA
            </button>
          )}
        </div>
        {data.ioa.length ? (
          <div className="aba-ioa-list">
            {data.ioa.map(record => (
              <article key={record.id}>
                <div>
                  <span className="aba-tag">{ioaMethod(record.method).label}</span>
                  <strong>{dateLabel(record.observedOn)}{record.programId ? ` · ${programName(record.programId)}` : ''}</strong>
                  <small>
                    {ioaMethod(record.method).primaryLabel}: {record.primaryValue} · {ioaMethod(record.method).secondaryLabel}: {record.secondaryValue}
                    {record.secondaryObserverId ? ` · 2º observador: ${data.professionalName(record.secondaryObserverId)}` : ''}
                  </small>
                  {record.notes && <small>{record.notes}</small>}
                </div>
                <FidelityScore value={Math.round(record.agreementPercentage)} />
              </article>
            ))}
          </div>
        ) : (
          <p className="aba-empty">{canSupervise ? 'Nenhum registro ainda. Registre quando um segundo observador acompanhar a coleta.' : 'Nenhum registro ainda. Quem registra é a supervisão do time.'}</p>
        )}
      </section>

      {dialog?.type === 'fidelity' && (
        <FidelityDialog session={dialog.session} source={dialog.source} saved={dialog.saved} onClose={() => setDialog(null)} onDone={done} />
      )}
      {dialog?.type === 'ioa' && <IoaDialog data={data} patientId={patientId} onClose={() => setDialog(null)} onDone={done} />}
    </div>
  );
}

export default AbaQuality;
