// Componente: Campo de formulário (input ou textarea)
export function FieldInput({ label, field, value, onChange, textarea = false }) {
  return (
    <label>
      {label}
      {textarea ? (
        <textarea
          lang="pt-BR"
          spellCheck
          autoCorrect="on"
          autoCapitalize="sentences"
          value={value || ''}
          onChange={e => onChange(field, e.target.value)}
        />
      ) : (
        <input
          lang="pt-BR"
          spellCheck
          autoCorrect="on"
          autoCapitalize="sentences"
          value={value || ''}
          onChange={e => onChange(field, e.target.value)}
        />
      )}
    </label>
  );
}
