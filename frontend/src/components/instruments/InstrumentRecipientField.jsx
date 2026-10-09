import { areaLabel, recipientSentence } from '../../utils/instrumentRecipients';
import '../../styles/instruments.css';

// ============================================================
// Responsável claro antes de enviar uma escala para casa (20261012).
// Usado no envio da ficha (Área do Paciente) e no da aba Escalas, com a
// escolha de hooks/useInstrumentRecipients.js (useRecipientChoice).
//   ResponsibleSelect — "Responsável na Psicologia" (só a administração,
//                       com o paciente matriculado na área);
//   RecipientNote     — para quem vão a nota e o alerta, ou por que o
//                       envio não sai.
// ============================================================

export function ResponsibleSelect({ plan, value, onChange, discipline, id, variant = 'forms', disabled = false }) {
  if (!plan.canChoose) return null;
  const label = `Responsável na ${areaLabel(discipline)}`;
  const select = (
    <select
      id={id}
      className={variant === 'gestao' ? 'gt-input' : undefined}
      value={value}
      onChange={event => onChange(event.target.value)}
      disabled={disabled}
      required
    >
      <option value="">Escolha quem atende</option>
      {plan.options.map(option => (
        <option key={option.id} value={option.id}>{option.name}</option>
      ))}
    </select>
  );
  if (variant === 'gestao') {
    return (
      <label className="gt-field gt-field--grow" htmlFor={id}>
        {label}
        {select}
      </label>
    );
  }
  return (
    <label className="field-block instrument-responsible" htmlFor={id}>
      <span>{label}</span>
      {select}
    </label>
  );
}

export function RecipientNote({ recipients, plan, viewerId = null, className = 'small' }) {
  if (recipients.loading && !recipients.info) {
    return <p className={`${className} instrument-recipient-note`} role="status">Conferindo quem recebe o resultado…</p>;
  }
  if (recipients.error) {
    return (
      <p className={`${className} instrument-recipient-note`} role="status">
        Não deu para conferir quem recebe o resultado ({recipients.error}). O envio confere de novo e avisa se faltar o responsável.
      </p>
    );
  }
  const sentence = recipientSentence(plan.receivers, viewerId);
  return (
    <div className="instrument-recipient-note" aria-live="polite">
      {sentence && (
        <p className={className}>
          {sentence}
          {plan.changesFrom ? ` O responsável deixa de ser ${plan.changesFrom}.` : ''}
          {' '}A administração também vê o resultado.
        </p>
      )}
      {plan.canChoose && (
        <p className={className}>
          Quem você escolher fica como responsável do paciente nesta área (aparece na ficha, aba Matrículas).
        </p>
      )}
      {!plan.canSend && plan.blockedReason && (
        <p className={`${className} instrument-recipient-block`} role="status">{plan.blockedReason}</p>
      )}
    </div>
  );
}
