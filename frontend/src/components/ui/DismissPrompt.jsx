import { useEffect, useRef } from 'react';

// Pergunta que aparece quando Esc/clique fora tentam fechar um formulário
// com algo já digitado (useDismiss com guardUnsaved). Nunca descarta
// sozinho: o foco vai para "Continuar editando".
export function DismissPrompt({ dismiss }) {
  const keepRef = useRef(null);
  const visible = Boolean(dismiss?.confirmingDiscard);

  useEffect(() => {
    if (visible) keepRef.current?.focus();
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="dismiss-prompt" role="alert">
      <p>
        <b>Tem informação preenchida que ainda não foi salva.</b>
        <span>Fechar agora descarta o que foi digitado.</span>
      </p>
      <div className="dismiss-prompt-actions">
        <button ref={keepRef} type="button" className="dismiss-prompt-keep" onClick={dismiss.keepEditing}>
          Continuar editando
        </button>
        <button type="button" className="dismiss-prompt-discard" onClick={dismiss.discard}>
          Descartar e fechar
        </button>
      </div>
    </div>
  );
}

export default DismissPrompt;
