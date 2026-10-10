import '../../styles/folderTabs.css';

// ============================================================
// Abas de pasta (opção C, 10/10/2026): troca entre as partes de uma tela
// (Evoluções: Escrever | Ver; Importáveis: Formulários | Envios e
// respostas). Cada aba diz quanto tem do outro lado antes de abrir: o
// número grande na frente, o nome e uma linha de resumo. A aba aberta
// se cola na linha de baixo, como pasta.
//
// `number` vazio (ainda carregando ou sem dado) mostra um traço, nunca
// zero: zero é informação, e diria que não há nada.
// ============================================================

export function FolderTabs({ label, options, value, onChange }) {
  return (
    <div className="folder-tabs no-print" role="group" aria-label={label}>
      {options.map(option => (
        <button
          key={option.id}
          type="button"
          className="folder-tab"
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
        >
          <span className="folder-tab-number" aria-hidden={option.number == null ? 'true' : undefined}>
            {option.number ?? '–'}
          </span>
          <span className="folder-tab-text">
            <span className="folder-tab-title">{option.label}</span>
            {option.hint && (
              <span className={`folder-tab-hint${option.alert ? ' folder-tab-hint--alert' : ''}`}>
                {option.alert && <i aria-hidden="true" />}
                {option.hint}
              </span>
            )}
          </span>
        </button>
      ))}
    </div>
  );
}
