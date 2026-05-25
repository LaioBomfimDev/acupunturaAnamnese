// Componente: Campo de formulário (input ou textarea)
export function FieldInput({ label, field, value, onChange, textarea = false }) {
  return (
    <label>
      {label}
      {textarea ? (
        <textarea
          value={value || ''}
          onChange={e => onChange(field, e.target.value)}
        />
      ) : (
        <input
          value={value || ''}
          onChange={e => onChange(field, e.target.value)}
        />
      )}
    </label>
  );
}
