import { useEffect, useState } from 'react';
import { listAlerts, manageAlert, refreshAlerts } from '../../services/abaService';
import {
  alertPriorityLabel,
  alertStatusLabel,
  alertTargetTab,
  alertTypeLabel,
  countOpenAlerts,
} from '../../utils/aba/quality.js';
import { AbaDialog } from './AbaDialog';
import { AbaIcon } from './AbaIcon';

// ============================================================
// Alertas ABA: o que pede atenção nos pacientes que a pessoa atende
// (critério atingido, baixa evolução, risco sem revisão, fidelidade e
// concordância baixas…). As regras rodam no banco (aba_refresh_alerts) e
// o alerta some sozinho quando a condição passa. Quem lidera o time pode
// dispensar e reabrir. Trazido do Atlas (ClinicalAlert), só a parte ABA.
// ============================================================

const DISMISS_REASONS = [
  'Já tratado com a equipe',
  'Esperado no plano da criança',
  'Dado registrado errado, será corrigido',
];

const dateTime = value => (value
  ? new Date(value).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  : '—');

export function AlertCard({ alert, showPatient = true, onOpen, onDismiss, onReopen }) {
  return (
    <article className={`aba-alert aba-alert--${alert.priority}${alert.status === 'open' ? '' : ' is-closed'}`}>
      <div className="aba-alert-body">
        <div className="aba-alert-tags">
          <span className={`aba-alert-priority aba-alert-priority--${alert.priority}`}>{alertPriorityLabel(alert.priority)}</span>
          <span className="aba-tag">{alertTypeLabel(alert.type)}</span>
          {alert.status !== 'open' && <span className="aba-tag">{alertStatusLabel(alert.status)}</span>}
        </div>
        {showPatient && <strong>{alert.patientName}</strong>}
        <p>{alert.message}</p>
        <small className="aba-muted">
          Desde {dateTime(alert.firstDetectedAt)}
          {alert.assignedName ? ` · com ${alert.assignedName}` : ''}
          {alert.occurrenceCount > 1 ? ` · voltou ${alert.occurrenceCount - 1 === 1 ? '1 vez' : `${alert.occurrenceCount - 1} vezes`}` : ''}
        </small>
        {alert.status === 'dismissed' && (
          <small className="aba-muted">Dispensado por {alert.decidedName || 'supervisão'}{alert.decisionNote ? `: ${alert.decisionNote}` : ''}</small>
        )}
      </div>
      <div className="aba-alert-actions">
        {onOpen && <button type="button" className="quiet-button" onClick={() => onOpen(alert)}>Abrir</button>}
        {alert.canManage && alert.status === 'open' && onDismiss && (
          <button type="button" className="quiet-button" onClick={() => onDismiss(alert)}>Dispensar</button>
        )}
        {alert.canManage && alert.status === 'dismissed' && onReopen && (
          <button type="button" className="quiet-button" onClick={() => onReopen(alert)}>Reabrir</button>
        )}
      </div>
    </article>
  );
}

export function DismissAlertDialog({ alert, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await manageAlert(alert, 'dismiss', reason);
      onDone();
    } catch (submitError) {
      setError(submitError.message);
      setSaving(false);
    }
  };

  return (
    <AbaDialog title="Dispensar alerta" busy={saving} guardUnsaved={reason.trim() !== ''} onClose={onClose}>
      <p><strong>{alertTypeLabel(alert.type)}</strong> · {alert.patientName}</p>
      <p className="aba-muted">{alert.message}</p>
      <div className="aba-field">Motivo (opcional)
        <div className="aba-chip-row">
          {DISMISS_REASONS.map(option => (
            <button key={option} type="button" className="aba-chip" aria-pressed={reason === option} onClick={() => setReason(current => (current === option ? '' : option))}>
              {option}
            </button>
          ))}
        </div>
        <textarea rows={2} value={reason} onChange={event => setReason(event.target.value)} />
      </div>
      <p className="aba-muted">Se a condição passar e voltar depois, o alerta reabre sozinho.</p>
      {error && <p className="aba-error" role="alert">{error}</p>}
      <div className="aba-form-actions">
        <button type="button" className="quiet-button" disabled={saving} onClick={onClose}>Cancelar</button>
        <button type="button" className="primary-button" disabled={saving} onClick={() => void submit()}>
          {saving ? 'Dispensando...' : 'Dispensar'}
        </button>
      </div>
    </AbaDialog>
  );
}

export function AbaAlerts({ userId, onOpenAlert }) {
  const [alerts, setAlerts] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [includeClosed, setIncludeClosed] = useState(false);
  const [onlyMine, setOnlyMine] = useState(false);
  const [dismissing, setDismissing] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [forceRefresh, setForceRefresh] = useState(false);

  useEffect(() => {
    let alive = true;
    refreshAlerts(forceRefresh)
      .catch(() => null)
      .then(() => listAlerts({ includeClosed }))
      .then(rows => {
        if (!alive) return;
        setAlerts(rows);
        setStatus('ready');
      })
      .catch(loadError => {
        if (!alive) return;
        setError(loadError.message);
        setStatus('error');
      });
    return () => { alive = false; };
  }, [includeClosed, reloadKey, forceRefresh]);

  const reload = (force = false) => {
    setStatus('loading');
    setForceRefresh(force);
    setReloadKey(key => key + 1);
  };

  const reopen = async alert => {
    try {
      await manageAlert(alert, 'reopen');
      reload();
    } catch (reopenError) {
      setError(reopenError.message);
    }
  };

  const visible = onlyMine ? alerts.filter(alert => alert.assignedTo === userId) : alerts;
  const counts = countOpenAlerts(visible);

  return (
    <div className="aba-page">
      <div className="aba-page-head">
        <div>
          <p className="aba-eyebrow">Equipe</p>
          <h2>Alertas ABA</h2>
          <p className="aba-muted">O que pede atenção nos pacientes que você atende. O alerta some sozinho quando a situação se resolve.</p>
        </div>
        <button type="button" className="quiet-button" disabled={status === 'loading'} onClick={() => reload(true)}>
          <AbaIcon name="reset" /> {status === 'loading' ? 'Atualizando...' : 'Atualizar agora'}
        </button>
      </div>

      <section className="aba-card aba-alert-summary">
        <div><strong>{counts.total}</strong><small>{counts.total === 1 ? 'aberto' : 'abertos'}</small></div>
        <div className="is-critical"><strong>{counts.critica}</strong><small>{counts.critica === 1 ? 'crítico' : 'críticos'}</small></div>
        <div className="is-high"><strong>{counts.alta}</strong><small>alta</small></div>
        <div><strong>{counts.media}</strong><small>média</small></div>
        <div className="aba-chip-row">
          <button type="button" className="aba-chip" aria-pressed={onlyMine} onClick={() => setOnlyMine(current => !current)}>Só comigo</button>
          <button type="button" className="aba-chip" aria-pressed={includeClosed} onClick={() => { setStatus('loading'); setIncludeClosed(current => !current); }}>
            Mostrar dispensados e resolvidos
          </button>
        </div>
      </section>

      {error && <p className="aba-error" role="alert">{error}</p>}
      {status === 'loading' && !alerts.length && <p className="aba-muted">Carregando os alertas...</p>}
      {status !== 'loading' && !visible.length && !error && (
        <section className="aba-card"><p className="aba-empty">Nenhum alerta {includeClosed ? 'nos últimos 30 dias' : 'aberto'}{onlyMine ? ' com você' : ''}.</p></section>
      )}

      <div className="aba-alert-list">
        {visible.map(alert => (
          <AlertCard
            key={alert.id}
            alert={alert}
            onOpen={item => onOpenAlert(item.patientId, alertTargetTab(item.type), item.sessionId)}
            onDismiss={setDismissing}
            onReopen={item => void reopen(item)}
          />
        ))}
      </div>

      {dismissing && (
        <DismissAlertDialog
          alert={dismissing}
          onClose={() => setDismissing(null)}
          onDone={() => { setDismissing(null); reload(); }}
        />
      )}
    </div>
  );
}

export default AbaAlerts;
