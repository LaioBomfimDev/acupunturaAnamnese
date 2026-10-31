import { useId } from 'react';
import { useDismiss } from '../../hooks/useDismiss';
import { DismissPrompt } from '../ui/DismissPrompt';

// Janela da área ABA. Fecha com Esc, clique fora e × (hooks/useDismiss,
// AGENTS.md §7); formulário com algo digitado pergunta antes de descartar.
// `busy` segura a janela enquanto salva.
export function AbaDialog({ title, onClose, busy = false, guardUnsaved = false, wide = false, children }) {
  const titleId = useId();
  const dismiss = useDismiss({ onClose, busy, guardUnsaved });

  return (
    <div className="aba-dialog-overlay" {...dismiss.backdropProps}>
      <div
        className={`aba-dialog forms-scope${wide ? ' aba-dialog--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        {...dismiss.panelProps}
      >
        <header className="aba-dialog-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="aba-dialog-close" aria-label="Fechar" onClick={onClose} disabled={busy}>×</button>
        </header>
        <div className="aba-dialog-body">
          <DismissPrompt dismiss={dismiss} />
          {children}
        </div>
      </div>
    </div>
  );
}

export default AbaDialog;
