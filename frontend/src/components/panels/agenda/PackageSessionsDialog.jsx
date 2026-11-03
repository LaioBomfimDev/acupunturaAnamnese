import { useEffect, useMemo, useState } from 'react';
import { useDismiss } from '../../../hooks/useDismiss';
import { listSeriesSessions } from '../../../services/appointmentService';
import { seriesKindOf, seriesLabelOf, rescheduledLabel } from '../../../utils/agendaSettings';
import {
  PACKAGE_SESSIONS_FINANCE_NOTE,
  PACKAGE_SESSIONS_TITLE,
  packageSessionsNote,
  packageSessionsTiles,
  sessionStatusLabel,
  sessionWhen,
  summarizePackageSessions,
} from '../../../utils/agendaPackageSessions';
import { ScreenHelp } from '../../ui/ScreenHelp';
import { AGENDA_HELP } from '../../../data/screenHelp';

// ============================================================
// "Sessões do pacote" (prévia A, 03/11/2026): janela com o pacote
// inteiro, aberta do detalhe do atendimento. No computador fica no meio
// da tela; no celular e no tablet o .ag-dialog-* já vira painel de baixo.
// Tocar numa sessão fecha a janela e leva a Agenda até ela (onOpenSession).
// As linhas vêm do banco (listSeriesSessions), nunca do estado da tela.
// ============================================================

export default function PackageSessionsDialog({
  appointment,
  subtitle = '',
  agendaSettings,
  onClose,
  onOpenSession,
}) {
  const groupId = appointment?.recurrence_group_id || null;
  const [state, setState] = useState({ groupId: null, rows: [], error: '' });
  const dismiss = useDismiss({ onClose });

  useEffect(() => {
    if (!groupId) return undefined;
    let cancelled = false;
    listSeriesSessions(groupId)
      .then(rows => { if (!cancelled) setState({ groupId, rows, error: '' }); })
      .catch(err => {
        if (!cancelled) setState({ groupId, rows: [], error: err.message || 'Não foi possível ler as sessões do pacote.' });
      });
    return () => { cancelled = true; };
  }, [groupId]);

  const loading = state.groupId !== groupId;
  const now = useMemo(() => new Date(), []);
  const summary = useMemo(
    () => summarizePackageSessions(state.rows, { currentId: appointment?.id, now }),
    [state.rows, appointment?.id, now],
  );
  const note = packageSessionsNote(summary, { currentStatus: appointment?.status });

  return (
    <div className="ag-dialog-overlay" role="dialog" aria-modal="true" aria-label={PACKAGE_SESSIONS_TITLE} {...dismiss.backdropProps}>
      <div className="ag-dialog-panel agpk-panel" {...dismiss.panelProps}>
        <div className="ag-dialog-head">
          <div className="agpk-head-text">
            <h3 className="ag-dialog-title">{PACKAGE_SESSIONS_TITLE}</h3>
            {subtitle && <p className="agpk-subtitle">{subtitle}</p>}
          </div>
          <div className="agpk-head-actions">
            <ScreenHelp topic={AGENDA_HELP.pacote} />
            <button type="button" className="ag-chip-btn" onClick={onClose} aria-label="Fechar">×</button>
          </div>
        </div>

        <div className="ag-dialog-body">
          {loading ? (
            <p className="ag-note" role="status">Lendo as sessões do pacote…</p>
          ) : state.error ? (
            <div className="ag-alert" role="alert">{state.error}</div>
          ) : summary.items.length === 0 ? (
            <p className="ag-empty">Nenhuma sessão deste pacote encontrada.</p>
          ) : (
            <>
              <div className="agpk-tiles">
                {packageSessionsTiles(summary).map(tile => (
                  <div key={tile.id} className={`agpk-tile${tile.id === 'remaining' ? ' agpk-tile--main' : ''}`}>
                    <b>{tile.value}</b>
                    <span>{tile.label}</span>
                  </div>
                ))}
              </div>

              <div className="agpk-bar" aria-hidden="true">
                {summary.items.map(item => (
                  <i key={item.id} data-status={item.status} className={item.isCurrent ? 'is-current' : undefined} />
                ))}
              </div>

              {note && <p className="ag-note">{note}</p>}

              <ul className="agpk-list">
                {summary.items.map(item => {
                  const when = sessionWhen(item.row.starts_at, now);
                  const extras = [
                    item.isCurrent ? 'Esta sessão' : '',
                    seriesKindOf(item.row) === 'one-off'
                      ? `${seriesLabelOf('one-off', agendaSettings)}: ${rescheduledLabel(item.row).replace(/^R/, 'r') || 'remarcada só desta vez'}`
                      : '',
                    item.pastWithoutOutcome ? 'Já passou: falta marcar o resultado' : '',
                  ].filter(Boolean);
                  return (
                    <li key={item.id} className={item.isCurrent ? 'is-current' : undefined}>
                      <button
                        type="button"
                        className="agpk-row"
                        onClick={() => onOpenSession?.(item.row)}
                        aria-current={item.isCurrent ? 'true' : undefined}
                      >
                        <span className="agpk-num">{item.number ?? '–'}</span>
                        <span className="agpk-when">
                          <b>{when.day}</b> · {when.time}
                          {extras.length > 0 && <small>{extras.join(' · ')}</small>}
                        </span>
                        <span className="agpk-status" data-status={item.status}>{sessionStatusLabel(item.status)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>

              <p className="agpk-finance">{PACKAGE_SESSIONS_FINANCE_NOTE}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
