import { useDismiss } from '../../../hooks/useDismiss';

// ============================================================
// Alcance de cancelar/excluir numa sessão de pacote (20/11/2026): a
// pessoa escolhe entre "só esta sessão" e "esta e as próximas" ANTES de
// qualquer coisa acontecer. "Só esta" vem primeiro e é o que o Enter/foco
// inicial alcança; o alcance maior nunca é o padrão. Janela do mesmo
// desenho de "Sessões do pacote" (.ag-dialog-*).
// ============================================================

export default function SessionScopeDialog({ title, text, options, busy = false, onChoose, onClose }) {
  const dismiss = useDismiss({ onClose, busy });

  return (
    <div className="ag-dialog-overlay" role="dialog" aria-modal="true" aria-label={title} {...dismiss.backdropProps}>
      <div className="ag-dialog-panel ag-scope-panel" {...dismiss.panelProps}>
        <div className="ag-dialog-head">
          <h3 className="ag-dialog-title">{title}</h3>
          <button type="button" className="ag-chip-btn" onClick={onClose} aria-label="Fechar" disabled={busy}>×</button>
        </div>
        <div className="ag-dialog-body">
          {text && <p className="ag-note">{text}</p>}
          <div className="ag-scope-options">
            {options.map((option, index) => (
              <button
                key={option.id}
                type="button"
                className={`ag-btn${option.danger ? ' ag-btn--danger' : ''}`}
                onClick={() => onChoose(option.id)}
                disabled={busy}
                autoFocus={index === 0}
              >
                <b>{option.label}</b>
                {option.description && <small>{option.description}</small>}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
