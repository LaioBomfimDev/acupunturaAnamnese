import { useId } from 'react';
import {
  LIMITS,
  OTHER_LABEL,
  OTHER_SUFFIX,
  OTHER_VALUE,
  optionsOf,
  scaleRange,
} from '../../utils/patientForms';

// ============================================================
// Uma pergunta, do jeito que o paciente responde (Área do Paciente e
// pré-visualização da administração). Escolha vira botão grande; texto
// só onde a pergunta pede. `onChange(patch)` devolve só as chaves que
// mudaram — `undefined` apaga a resposta.
// ============================================================

function Heading({ as: Tag, question, number, htmlFor }) {
  return (
    <Tag className={Tag === 'legend' ? undefined : 'pq-question-label'} htmlFor={htmlFor}>
      {number ? <span className="pq-number">{number}.</span> : null}
      {question.label || 'Pergunta sem texto'}
      {question.required && <span className="pq-required">(obrigatória)</span>}
    </Tag>
  );
}

function parseNumber(text) {
  const normalized = String(text || '').trim().replace(/\./g, '').replace(',', '.');
  if (!normalized) return undefined;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : undefined;
}

export function PatientFormQuestion({ question, answers, onChange, number = null, missing = false, disabled = false }) {
  const id = useId();
  const value = answers?.[question.id];
  const otherKey = `${question.id}${OTHER_SUFFIX}`;
  const otherText = answers?.[otherKey] || '';
  const help = question.help ? <p className="pq-help">{question.help}</p> : null;
  const missingNote = missing ? <p className="pq-missing-note">Responda esta pergunta.</p> : null;

  if (question.type === 'yes_no' || question.type === 'single') {
    const options = optionsOf(question);
    const pills = question.type === 'yes_no';
    const withOther = question.type === 'single' && question.allowOther;
    return (
      <fieldset className="pq-question" data-missing={missing || undefined}>
        <Heading as="legend" question={question} number={number} />
        {help}
        <div className={pills ? 'pq-pills' : 'pq-options'}>
          {options.map(option => (
            <label key={option} className="pq-option">
              <input
                type="radio"
                name={id}
                value={option}
                checked={value === option}
                disabled={disabled}
                onChange={() => onChange({ [question.id]: option, [otherKey]: undefined })}
              />
              {option}
            </label>
          ))}
          {withOther && (
            <label className="pq-option">
              <input
                type="radio"
                name={id}
                value={OTHER_VALUE}
                checked={value === OTHER_VALUE}
                disabled={disabled}
                onChange={() => onChange({ [question.id]: OTHER_VALUE })}
              />
              {OTHER_LABEL}
            </label>
          )}
        </div>
        {withOther && value === OTHER_VALUE && (
          <input
            className="pq-input pq-other"
            aria-label={`${question.label || 'Pergunta'}: outro, qual?`}
            placeholder="Qual?"
            value={otherText}
            maxLength={LIMITS.shortTextMax}
            disabled={disabled}
            onChange={event => onChange({ [otherKey]: event.target.value })}
          />
        )}
        {missingNote}
      </fieldset>
    );
  }

  if (question.type === 'multiple') {
    const options = optionsOf(question);
    const picked = Array.isArray(value) ? value : [];
    const toggle = option => {
      const next = picked.includes(option) ? picked.filter(item => item !== option) : [...picked, option];
      const patch = { [question.id]: next.length ? next : undefined };
      if (option === OTHER_VALUE && !next.includes(OTHER_VALUE)) patch[otherKey] = undefined;
      onChange(patch);
    };
    return (
      <fieldset className="pq-question" data-missing={missing || undefined}>
        <Heading as="legend" question={question} number={number} />
        {help || <p className="pq-help">Pode marcar mais de uma.</p>}
        <div className="pq-options">
          {options.map(option => (
            <label key={option} className="pq-option">
              <input
                type="checkbox"
                checked={picked.includes(option)}
                disabled={disabled}
                onChange={() => toggle(option)}
              />
              {option}
            </label>
          ))}
          {question.allowOther && (
            <label className="pq-option">
              <input
                type="checkbox"
                checked={picked.includes(OTHER_VALUE)}
                disabled={disabled}
                onChange={() => toggle(OTHER_VALUE)}
              />
              {OTHER_LABEL}
            </label>
          )}
        </div>
        {question.allowOther && picked.includes(OTHER_VALUE) && (
          <input
            className="pq-input pq-other"
            aria-label={`${question.label || 'Pergunta'}: outro, qual?`}
            placeholder="Qual?"
            value={otherText}
            maxLength={LIMITS.shortTextMax}
            disabled={disabled}
            onChange={event => onChange({ [otherKey]: event.target.value })}
          />
        )}
        {missingNote}
      </fieldset>
    );
  }

  if (question.type === 'scale') {
    const { min, max } = scaleRange(question);
    const steps = Array.from({ length: max - min + 1 }, (_, index) => min + index);
    const minLabel = question.scale?.minLabel;
    const maxLabel = question.scale?.maxLabel;
    return (
      <fieldset className="pq-question" data-missing={missing || undefined}>
        <Heading as="legend" question={question} number={number} />
        {help}
        <div className="pq-scale">
          {steps.map(step => (
            <label key={step} className="pq-option">
              <input
                type="radio"
                name={id}
                value={step}
                checked={value === step}
                disabled={disabled}
                aria-label={`${step} de ${max}`}
                onChange={() => onChange({ [question.id]: step })}
              />
              {step}
            </label>
          ))}
        </div>
        {(minLabel || maxLabel) && (
          <div className="pq-scale-ends" aria-hidden="true">
            <span>{minLabel ? `${min} = ${minLabel}` : ''}</span>
            <span>{maxLabel ? `${max} = ${maxLabel}` : ''}</span>
          </div>
        )}
        {missingNote}
      </fieldset>
    );
  }

  const inputId = `${id}-campo`;
  let field;
  if (question.type === 'long_text') {
    const text = typeof value === 'string' ? value : '';
    field = (
      <>
        <textarea
          id={inputId}
          className="pq-textarea"
          value={text}
          maxLength={LIMITS.longTextMax}
          disabled={disabled}
          onChange={event => onChange({ [question.id]: event.target.value || undefined })}
        />
        {text.length > LIMITS.longTextMax * 0.8 && (
          <span className="pq-counter">{text.length}/{LIMITS.longTextMax}</span>
        )}
      </>
    );
  } else if (question.type === 'date') {
    field = (
      <input
        id={inputId}
        type="date"
        className="pq-input"
        value={typeof value === 'string' ? value : ''}
        disabled={disabled}
        onChange={event => onChange({ [question.id]: event.target.value || undefined })}
      />
    );
  } else if (question.type === 'number') {
    field = (
      <input
        id={inputId}
        className="pq-input"
        inputMode="decimal"
        defaultValue={typeof value === 'number' ? String(value).replace('.', ',') : ''}
        disabled={disabled}
        onChange={event => onChange({ [question.id]: parseNumber(event.target.value) })}
      />
    );
  } else {
    field = (
      <input
        id={inputId}
        className="pq-input"
        value={typeof value === 'string' ? value : ''}
        maxLength={LIMITS.shortTextMax}
        disabled={disabled}
        onChange={event => onChange({ [question.id]: event.target.value || undefined })}
      />
    );
  }

  return (
    <div className="pq-question" data-missing={missing || undefined}>
      <Heading as="label" question={question} number={number} htmlFor={inputId} />
      {help}
      {field}
      {missingNote}
    </div>
  );
}

export default PatientFormQuestion;
