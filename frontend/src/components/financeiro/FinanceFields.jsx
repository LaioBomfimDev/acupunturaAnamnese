import { getDiscipline } from '../../data/disciplines';
import { PAYMENT_METHODS, daysBetween, formatShortDay } from '../../utils/finance';

// Peças pequenas repetidas nas partes do Financeiro.

export function MethodPicker({ value, onChange, label = 'Forma de pagamento' }) {
  return (
    <div className="fin-choices" role="group" aria-label={label}>
      {PAYMENT_METHODS.map(method => (
        <button
          key={method.id}
          type="button"
          className="fin-choice"
          aria-pressed={value === method.id}
          onClick={() => onChange(method.id)}
        >
          {method.label}
        </button>
      ))}
    </div>
  );
}

/** Campo de dinheiro: a pessoa digita "150" ou "133,33". */
export function MoneyInput({ id, value, onChange, placeholder = '0', ariaLabel, disabled = false }) {
  return (
    <span className="fin-money-input">
      <span aria-hidden="true">R$</span>
      <input
        id={id}
        className="gt-select"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        disabled={disabled}
        onChange={event => onChange(event.target.value)}
      />
    </span>
  );
}

export function AreaTag({ discipline }) {
  const area = getDiscipline(discipline);
  return (
    <span className="fin-area">
      <i style={{ background: `var(--r1-discipline-${discipline}, var(--r1-border))` }} aria-hidden="true" />
      {area?.label || 'Outra área'}
    </span>
  );
}

/** "há 9 dias" (em atraso), "hoje" ou "vence 30/10". */
export function DueTag({ dueOn, today, paidLabel = null }) {
  if (paidLabel) return <span className="gt-badge gt-badge-success">{paidLabel}</span>;
  if (dueOn < today) {
    const days = daysBetween(dueOn, today);
    return <span className="gt-badge gt-badge-pending">há {days} {days === 1 ? 'dia' : 'dias'}</span>;
  }
  if (dueOn === today) return <span className="gt-badge gt-badge-neutral">hoje</span>;
  return <span className="gt-badge gt-badge-neutral">vence {formatShortDay(dueOn)}</span>;
}

export function EmptyNote({ children }) {
  return <p className="gt-empty">{children}</p>;
}
