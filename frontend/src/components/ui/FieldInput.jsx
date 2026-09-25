import { useId } from 'react';

// Componente: Campo de formulário (input ou textarea)
//
// `guide` (opcional): perguntas de escuta mostradas ENTRE o rótulo e a
// caixa — a profissional lê, pergunta e só então escreve. Com guia, o
// rótulo deixa de envolver o controle (lista dentro de <label> não é
// HTML válido) e passa a apontar para ele por htmlFor.
export function FieldInput({ label, field, value, onChange, textarea = false, guide = null }) {
  const id = useId();
  const control = textarea ? (
    <textarea
      id={id}
      lang="pt-BR"
      spellCheck
      autoCorrect="on"
      autoCapitalize="sentences"
      value={value || ''}
      onChange={e => onChange(field, e.target.value)}
    />
  ) : (
    <input
      id={id}
      lang="pt-BR"
      spellCheck
      autoCorrect="on"
      autoCapitalize="sentences"
      value={value || ''}
      onChange={e => onChange(field, e.target.value)}
    />
  );

  if (guide) {
    return (
      <div className="field-block">
        <label htmlFor={id}>{label}</label>
        {guide}
        {control}
      </div>
    );
  }

  return (
    <label>
      {label}
      {control}
    </label>
  );
}
