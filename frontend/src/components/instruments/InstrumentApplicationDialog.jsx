import { useState } from 'react';
import { useDismiss } from '../../hooks/useDismiss';
import { DismissPrompt } from '../ui/DismissPrompt';
import { voidInstrumentApplication } from '../../services/patientInstrumentService';
import { riskMessages } from '../../utils/instrumentScoring';
import { formatInstrumentDate, namedInstrument, pointsLabel, scoreViews } from './instrumentFormat';

// ============================================================
// Uma aplicação aberta: resultado, respostas e observação.
// Quem aplicou pode anular com motivo (a linha continua no histórico,
// marcada). Não existe editar: aplicação errada se anula e se aplica de
// novo, para o registro mostrar o que aconteceu.
// ============================================================

function optionLabel(item, value) {
  return item?.options?.find(option => option.value === value)?.label || '—';
}

function answerPoints(value) {
  return typeof value === 'number' ? pointsLabel(value) : '';
}

export function InstrumentApplicationDialog({ application, instrument, canVoid, onClose, onVoided }) {
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const dismiss = useDismiss({ onClose, busy: saving, guardUnsaved: true });

  const result = application.result || {};
  const views = scoreViews(instrument);
  const risks = riskMessages(instrument, result.riskItems || [], { source: application.source });
  const extraItems = (instrument.extraItems || []).filter(item => application.answers[item.id] !== undefined);
  const titleId = `instrument-application-${application.id}`;

  async function confirmVoid() {
    setError('');
    setSaving(true);
    try {
      await voidInstrumentApplication({ id: application.id, reason });
      dismiss.markSaved();
      onVoided?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="instrument-dialog-overlay" {...dismiss.backdropProps}>
      <div
        className="instrument-dialog forms-scope"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        {...dismiss.panelProps}
      >
        <div className="panel">
          <div className="panel-title instrument-dialog-head">
            <span id={titleId}>
              {instrument.shortName} · {formatInstrumentDate(application.appliedAt)}
            </span>
            <button type="button" className="instrument-dialog-close" aria-label="Fechar" onClick={onClose} disabled={saving}>×</button>
          </div>
          <div className="panel-body instrument-dialog-body">
            <DismissPrompt dismiss={dismiss} />

            {application.voidedAt && (
              <div className="alert alert-warning">
                <b>Aplicação anulada</b> por {application.voidedByName || 'quem aplicou'} em {formatInstrumentDate(application.voidedAt)}.
                {application.voidReason && <> Motivo: {application.voidReason}</>}
              </div>
            )}

            <div className="instrument-result">
              {views.length === 1 ? (
                <>
                  <span className="instrument-score">{typeof result.score === 'number' ? pointsLabel(result.score) : '—'}</span>
                  <span>Faixa do instrumento: <b>{result.bandLabel || '—'}</b></span>
                </>
              ) : (
                <ul className="instrument-subscales" aria-label={`Notas ${namedInstrument(instrument, 'de')}`}>
                  {views.map(view => {
                    const value = view.read(result);
                    return (
                      <li key={view.id}>
                        <span className="instrument-subscale-label">{view.label}</span>
                        <span className="instrument-subscale-score">{value.score == null ? '—' : pointsLabel(value.score)}</span>
                        <span>Faixa: <b>{value.bandLabel || '—'}</b></span>
                      </li>
                    );
                  })}
                </ul>
              )}
              <span className="small">
                {application.source === 'area_do_paciente'
                  ? `Respondida pelo paciente na Área do Paciente em ${formatInstrumentDate(application.appliedAt)} (enviada por ${application.appliedByName}).`
                  : `Aplicada por ${application.appliedByName} em ${formatInstrumentDate(application.appliedAt)}.`}
              </span>
            </div>

            {risks.map(risk => (
              <div key={risk.itemId} className="alert instrument-risk">{risk.message}</div>
            ))}

            <ol className="instrument-answer-list">
              {instrument.items.map(item => {
                const value = application.answers[item.id];
                return (
                  <li key={item.id}>
                    <span>{item.text}</span>
                    <span className="instrument-answer">
                      <b>{optionLabel(item, value)}</b>
                      <span className="small">{answerPoints(value)}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
            {views.length === 1 && typeof result.score === 'number' && (
              <p className="small instrument-sum">Soma das {instrument.items.length} perguntas: {pointsLabel(result.score)}.</p>
            )}
            {views.length > 1 && (
              <p className="small instrument-sum">
                Cada nota soma as {views[0].itemCount} perguntas da subescala e multiplica por {instrument.scoring.multiplier || 1}, como no manual.
              </p>
            )}

            {extraItems.map(item => (
              <p key={item.id} className="small instrument-extra-answer">
                {item.text} <b>{optionLabel(item, application.answers[item.id])}</b>
              </p>
            ))}

            {application.note && (
              <p className="instrument-note-text"><b>Observação:</b> {application.note}</p>
            )}

            {canVoid && !application.voidedAt && (
              voiding ? (
                <div className="instrument-void">
                  <label className="field-block">
                    <span>Por que anular esta aplicação?</span>
                    <textarea
                      id={`${titleId}-reason`}
                      rows={2}
                      maxLength={500}
                      value={reason}
                      placeholder="Ex.: aplicada no paciente errado; respostas trocadas."
                      onChange={event => setReason(event.target.value)}
                    />
                  </label>
                  {error && <div className="alert" role="alert">{error}</div>}
                  <div className="instrument-actions">
                    <button
                      type="button"
                      className="primary-button"
                      onClick={confirmVoid}
                      disabled={saving || reason.trim().length < 3}
                    >
                      {saving ? 'Anulando…' : 'Confirmar anulação'}
                    </button>
                    <button type="button" className="quiet-button" onClick={() => { setVoiding(false); setReason(''); }} disabled={saving}>
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="instrument-actions">
                  <button type="button" className="quiet-button" onClick={() => setVoiding(true)}>Anular aplicação</button>
                  <span className="small">A aplicação continua no histórico, marcada como anulada.</span>
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
