import { useState } from 'react';
import { useDismiss } from '../../hooks/useDismiss';
import { DismissPrompt } from '../ui/DismissPrompt';
import { voidInstrumentApplication } from '../../services/patientInstrumentService';
import { riskMessages } from '../../utils/instrumentScoring';
import { formatInstrumentDate, formatScore, namedInstrument, pointsLabel, scoreViews, scoringSummary } from './instrumentFormat';

// ============================================================
// Uma aplicação aberta: resultado, respostas e observação.
// Quem aplicou pode anular com motivo (a linha continua no histórico,
// marcada). Não existe editar: aplicação errada se anula e se aplica de
// novo, para o registro mostrar o que aconteceu.
//
// Visual (10/10/2026): a nota sai na cor da tela (da clínica, ou a
// pessoal quando a clínica libera) com a régua das faixas do instrumento
// marcando onde ela caiu; cada resposta mostra os pontos em bolinhas.
// Cor só nos elementos principais (nota, faixa marcada, número da
// pergunta, bolinha marcada); vermelho só no risco.
// ============================================================

// Ícones de traço (24px, currentColor), como os da Agenda.
const GLYPHS = {
  scale: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4.5V3h6v1.5" />
      <path d="M8.5 10h7M8.5 13.5h7M8.5 17h4" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" />
    </>
  ),
  home: (
    <>
      <path d="M4 11 12 4l8 7" />
      <path d="M6 9.5V20h12V9.5" />
      <path d="M10 20v-5h4v5" />
    </>
  ),
  office: (
    <>
      <circle cx="12" cy="7.5" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </>
  ),
  send: <path d="M21 3 10 14M21 3l-7 18-4-7-7-4 18-7z" />,
  risk: (
    <>
      <path d="M12 3.5 2.8 19.5h18.4L12 3.5z" />
      <path d="M12 10v4.5M12 17.2v.3" />
    </>
  ),
  list: <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />,
  note: (
    <>
      <path d="M4 20h4L19 9l-4-4L4 16v4z" />
      <path d="m13.5 6.5 4 4" />
    </>
  ),
  voided: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m6 6 12 12" />
    </>
  ),
};

function Glyph({ name, size = 16 }) {
  return (
    <svg
      className="instrument-glyph"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {GLYPHS[name]}
    </svg>
  );
}

function optionLabel(item, value) {
  return item?.options?.find(option => option.value === value)?.label || '—';
}

function optionMax(item) {
  const values = (item?.options || []).map(option => option.value).filter(value => typeof value === 'number');
  return values.length ? Math.max(...values) : 0;
}

function bandRange(band) {
  return band.min === band.max ? pointsLabel(band.min) : `${formatScore(band.min)} a ${formatScore(band.max)} pontos`;
}

/**
 * Régua do instrumento: uma faixa por trecho, do tamanho dela na escala,
 * e a nota marcada. Sem nomes dentro dos trechos (faixa estreita não
 * caberia); a faixa marcada é dita embaixo, com o intervalo dela.
 */
export function BandMeter({ view, score, bandLabel }) {
  const min = view.scoring?.min ?? 0;
  const max = view.scoring?.max ?? 0;
  const span = max - min;
  const bands = Array.isArray(view.bands) ? view.bands : [];
  if (!(span > 0) || !bands.length) return null;
  const active = typeof score === 'number' ? bands.find(band => score >= band.min && score <= band.max) : null;
  const marker = typeof score === 'number' ? Math.min(100, Math.max(0, ((score - min) / span) * 100)) : null;
  const description = active
    ? `${pointsLabel(score)} de ${max}, faixa ${active.label} (${bandRange(active)})`
    : `Escala de ${formatScore(min)} a ${formatScore(max)} pontos`;

  return (
    <div className="instrument-meter">
      <div className="instrument-meter-track" role="img" aria-label={description}>
        {bands.map(band => (
          <span
            key={band.id}
            className={`instrument-meter-band${band === active ? ' is-active' : ''}`}
            style={{ flexGrow: band.max - band.min + (view.scoring?.step || 1) }}
            title={`${band.label}: ${bandRange(band)}`}
          />
        ))}
        {marker !== null && <span className="instrument-meter-marker" style={{ left: `${marker}%` }} />}
      </div>
      <div className="instrument-meter-scale" aria-hidden="true">
        <span>{formatScore(min)}</span>
        <span>{formatScore(max)}</span>
      </div>
      {active && bandLabel && (
        <p className="small instrument-meter-caption">
          Faixa <b>{bandLabel}</b>: {bandRange(active)}.
        </p>
      )}
    </div>
  );
}

// "Ansiedade (GAD-2)" vira "ansiedade (GAD-2)": a sigla continua maiúscula.
const lowerFirst = text => text.charAt(0).toLowerCase() + text.slice(1);

function ScoreBlock({ view, result }) {
  const value = view.read(result);
  const max = view.scoring?.max;
  // Escala sem ponto de corte clínico (Rosenberg) não tem faixa nenhuma.
  const noBandText = view.bands?.length ? 'Sem faixa' : 'Sem faixas clínicas';
  return (
    <section className="instrument-score-card" aria-label={view.label ? `Nota de ${lowerFirst(view.label)}` : 'Nota'}>
      {view.label && <h3 className="instrument-score-card-title">{view.label}</h3>}
      <div className="instrument-score-line">
        <span className="instrument-score-value">{formatScore(value.score)}</span>
        <span className="instrument-score-unit">
          {value.score == null ? '' : Math.abs(value.score) === 1 ? 'ponto' : 'pontos'}
          {typeof max === 'number' && value.score != null ? ` de ${max}` : ''}
        </span>
        <span className="instrument-band-chip">{value.bandLabel || noBandText}</span>
      </div>
      <BandMeter view={view} score={value.score} bandLabel={value.bandLabel} />
    </section>
  );
}

function PointDots({ value, max }) {
  if (!(max > 0)) return null;
  return (
    <span className="instrument-dots" aria-hidden="true">
      {Array.from({ length: max }, (_, index) => (
        <span key={index} className={`instrument-dot${typeof value === 'number' && index < value ? ' is-on' : ''}`} />
      ))}
    </span>
  );
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
  const fromHome = application.source === 'area_do_paciente';
  const appliedOn = formatInstrumentDate(application.appliedAt);

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
            <span className="instrument-dialog-title">
              <span className="instrument-dialog-icon"><Glyph name="scale" size={20} /></span>
              <span>
                <span id={titleId}>{instrument.shortName} · {appliedOn}</span>
                {instrument.measures && <small>{instrument.measures}</small>}
              </span>
            </span>
            <button type="button" className="instrument-dialog-close" aria-label="Fechar" onClick={onClose} disabled={saving}>×</button>
          </div>
          <div className="panel-body instrument-dialog-body">
            <DismissPrompt dismiss={dismiss} />

            <ul className="instrument-meta" aria-label="Sobre esta aplicação">
              <li><Glyph name="calendar" />{appliedOn}</li>
              {fromHome ? (
                <>
                  <li><Glyph name="home" />Respondida pelo paciente na Área do Paciente</li>
                  <li><Glyph name="send" />Enviada por {application.appliedByName}</li>
                </>
              ) : (
                <li><Glyph name="office" />Aplicada por {application.appliedByName}</li>
              )}
            </ul>

            {application.voidedAt && (
              <div className="alert alert-warning instrument-dialog-alert">
                <Glyph name="voided" size={18} />
                <span>
                  <b>Aplicação anulada</b> por {application.voidedByName || 'quem aplicou'} em {formatInstrumentDate(application.voidedAt)}.
                  {application.voidReason && <> Motivo: {application.voidReason}</>}
                </span>
              </div>
            )}

            <div className={`instrument-scores${views.length > 1 ? ' instrument-scores--many' : ''}`}>
              {views.length > 1 ? (
                <ul className="instrument-subscales" aria-label={`Notas ${namedInstrument(instrument, 'de')}`}>
                  {views.map(view => (
                    <li key={view.id}><ScoreBlock view={view} result={result} /></li>
                  ))}
                </ul>
              ) : (
                <ScoreBlock view={views[0]} result={result} />
              )}
            </div>

            {risks.map(risk => (
              <div key={risk.itemId} className="alert instrument-risk instrument-dialog-alert">
                <Glyph name="risk" size={18} />
                <span>{risk.message}</span>
              </div>
            ))}

            <section className="instrument-answers" aria-labelledby={`${titleId}-answers`}>
              <h3 className="instrument-section-title" id={`${titleId}-answers`}>
                <Glyph name="list" />Respostas
                <span className="instrument-section-count">
                  {instrument.items.length} {instrument.items.length === 1 ? 'pergunta' : 'perguntas'}
                </span>
              </h3>
              <ol className="instrument-answer-list">
                {instrument.items.map((item, index) => {
                  const value = application.answers[item.id];
                  return (
                    <li key={item.id}>
                      <span className="instrument-answer-number" aria-hidden="true">{index + 1}</span>
                      <span className="instrument-answer-body">
                        <span className="instrument-answer-question">{item.text}</span>
                        <span className="instrument-answer">
                          <b>{optionLabel(item, value)}</b>
                          <PointDots value={value} max={optionMax(item)} />
                          <span className="small">{typeof value === 'number' ? pointsLabel(value) : ''}</span>
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ol>
              {scoringSummary(instrument, result) && (
                <p className="small instrument-sum">{scoringSummary(instrument, result)}</p>
              )}
            </section>

            {extraItems.map(item => (
              <p key={item.id} className="small instrument-extra-answer">
                {item.text} <b>{optionLabel(item, application.answers[item.id])}</b>
              </p>
            ))}

            {application.note && (
              <p className="instrument-note-text"><Glyph name="note" /><span><b>Observação:</b> {application.note}</span></p>
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
