import { useRef, useState } from 'react';
import { Panel } from '../ui/Panel';
import { recordInstrumentApplication, newIdempotencyKey } from '../../services/patientInstrumentService';
import { INSTRUMENT_NOTE_MAX, riskMessages, scoreInstrument, visibleExtraItems } from '../../utils/instrumentScoring';
import { appliedAtFromInput, daysAgoLabel, namedInstrument, reapplyStatus, todayInputValue } from './instrumentFormat';

const upperFirst = text => text.charAt(0).toUpperCase() + text.slice(1);

// ============================================================
// Aplicar uma escala no consultório: a profissional lê as perguntas ou
// passa o aparelho ao paciente. A nota não aparece enquanto ele
// responde (para não influenciar): sai no resultado, depois de salvar.
// O aviso de risco aparece na hora em que o item é marcado.
// A chave de idempotência nasce com o formulário e se repete se o
// salvamento falhar e for tentado de novo.
// ============================================================

function OptionGroup({ item, value, onChange, labelledBy }) {
  return (
    <div className="checkgrid instrument-options" role="radiogroup" aria-labelledby={labelledBy}>
      {item.options.map(option => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            className={`tag${selected ? ' active' : ''}`}
            onClick={() => onChange(selected ? undefined : option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function InstrumentApplyForm({ instrument, patientName, patientId, discipline, lastAppliedAt = null, onCancel, onSaved }) {
  const [answers, setAnswers] = useState({});
  const [note, setNote] = useState('');
  const [date, setDate] = useState(() => todayInputValue());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const idempotencyKeyRef = useRef(newIdempotencyKey());

  const result = scoreInstrument(instrument, answers);
  const risks = riskMessages(instrument, result.riskItems);
  const hasAnswers = Object.keys(answers).length > 0 || note.trim().length > 0;
  const missing = result.total - result.answered;
  const reapply = reapplyStatus(lastAppliedAt, instrument.reapplyAfterDays);

  function setAnswer(itemId, value) {
    setAnswers(prev => {
      const next = { ...prev };
      if (value === undefined) delete next[itemId];
      else next[itemId] = value;
      return next;
    });
    setError('');
  }

  function requestCancel() {
    if (hasAnswers) setConfirmingCancel(true);
    else onCancel();
  }

  async function handleSave() {
    setError('');
    const appliedAt = appliedAtFromInput(date);
    if (!appliedAt) {
      setError('Escolha a data da aplicação: hoje ou um dia que já passou.');
      return;
    }
    setSaving(true);
    try {
      const saved = await recordInstrumentApplication({
        patientId,
        discipline,
        instrument,
        answers,
        note,
        appliedAt,
        idempotencyKey: idempotencyKeyRef.current,
      });
      onSaved?.(saved);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const extraVisible = visibleExtraItems(instrument, answers);

  return (
    <Panel title={`Aplicando ${instrument.shortName}${patientName ? ` · ${patientName}` : ''}`}>
      <div className="instrument-apply">
        <p className="small area-intro">
          Leia cada pergunta para o paciente ou passe o aparelho para ele responder. A nota aparece depois de salvar.
        </p>
        {reapply.tooSoon && (
          <div className="alert alert-warning">
            A última aplicação foi {daysAgoLabel(reapply.daysSince)}. {upperFirst(namedInstrument(instrument))} pede pelo menos{' '}
            {instrument.reapplyAfterDays} dias entre aplicações para mostrar mudança. Dá para aplicar mesmo assim.
          </div>
        )}
        <p className="instrument-instructions">{instrument.instructions}</p>

        <ol className="instrument-questions">
          {instrument.items.map((item, index) => {
            const labelId = `instrument-${instrument.id}-${item.id}`;
            const itemRisk = risks.find(risk => risk.itemId === item.id);
            return (
              <li key={item.id} className="instrument-question">
                <p id={labelId}><b>{index + 1}.</b> {item.text}</p>
                <OptionGroup
                  item={item}
                  value={answers[item.id]}
                  labelledBy={labelId}
                  onChange={value => setAnswer(item.id, value)}
                />
                {itemRisk && <div className="alert instrument-risk" role="alert">{itemRisk.message}</div>}
              </li>
            );
          })}
        </ol>

        {extraVisible.map(item => {
          const labelId = `instrument-${instrument.id}-${item.id}`;
          return (
            <div key={item.id} className="instrument-question instrument-question--extra">
              <p id={labelId}>{item.text} <span className="small">(não entra na nota)</span></p>
              <OptionGroup
                item={item}
                value={answers[item.id]}
                labelledBy={labelId}
                onChange={value => setAnswer(item.id, value)}
              />
            </div>
          );
        })}

        <div className="instrument-apply-meta">
          <label className="field-block instrument-date">
            <span>Data da aplicação</span>
            <input
              id={`instrument-${instrument.id}-date`}
              type="date"
              value={date}
              max={todayInputValue()}
              onChange={event => setDate(event.target.value)}
            />
          </label>
          <label className="field-block instrument-note">
            <span>Observação (opcional)</span>
            <textarea
              id={`instrument-${instrument.id}-note`}
              rows={2}
              maxLength={INSTRUMENT_NOTE_MAX}
              value={note}
              placeholder="Ex.: respondida pelo paciente no tablet; aplicada por telefone."
              onChange={event => setNote(event.target.value)}
            />
          </label>
        </div>

        {error && <div className="alert" role="alert">{error}</div>}

        {confirmingCancel ? (
          <div className="instrument-confirm" role="group" aria-label="Descartar respostas">
            <p>Descartar as respostas desta aplicação?</p>
            <div className="instrument-actions">
              <button type="button" className="primary-button" onClick={onCancel}>Descartar</button>
              <button type="button" className="quiet-button" onClick={() => setConfirmingCancel(false)}>Continuar respondendo</button>
            </div>
          </div>
        ) : (
          <div className="instrument-actions">
            <button
              type="button"
              className="primary-button"
              onClick={handleSave}
              disabled={!result.complete || saving}
            >
              {saving ? 'Salvando…' : 'Salvar resultado'}
            </button>
            <button type="button" className="quiet-button" onClick={requestCancel} disabled={saving}>Cancelar</button>
            <span className="small instrument-progress" aria-live="polite">
              {result.complete
                ? `${result.total} de ${result.total} respondidas.`
                : `${result.answered} de ${result.total} respondidas · ${missing === 1 ? 'falta 1' : `faltam ${missing}`}.`}
            </span>
          </div>
        )}
      </div>
    </Panel>
  );
}
