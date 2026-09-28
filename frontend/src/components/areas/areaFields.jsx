// ============================================================
// Peças pequenas das abas próprias de Fisioterapia e Nutrição.
// Tudo veste o kit das fichas (styles/forms.css) — nada de cor aqui.
// ============================================================

/** Campo numérico curto com unidade (aceita vírgula decimal). */
export function MeasureInput({ label, unit, value, onChange, placeholder, inputMode = 'decimal' }) {
  return (
    <label className="measure-field">
      <span>{label}{unit ? <small> ({unit})</small> : null}</span>
      <input
        type="text"
        inputMode={inputMode}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={event => onChange(event.target.value)}
      />
    </label>
  );
}

export function TextInput({ label, value, onChange, placeholder }) {
  return (
    <label className="measure-field">
      <span>{label}</span>
      <input
        type="text"
        lang="pt-BR"
        spellCheck
        value={value ?? ''}
        placeholder={placeholder}
        onChange={event => onChange(event.target.value)}
      />
    </label>
  );
}

export function SelectInput({ label, value, onChange, options, placeholder }) {
  return (
    <label className="measure-field">
      <span>{label}</span>
      <select value={value ?? ''} onChange={event => onChange(event.target.value)}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>{optionLabel}</option>
        ))}
      </select>
    </label>
  );
}

export function EmptyNote({ children }) {
  return <p className="small area-empty">{children}</p>;
}
