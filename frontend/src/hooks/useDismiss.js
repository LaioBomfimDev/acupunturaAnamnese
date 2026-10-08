import { useEffect, useEffectEvent, useId, useRef, useState } from 'react';
import { isDismissKey, isTopLayer, pushLayer, removeLayer } from '../utils/dismissLayers';

// ============================================================
// Fechar janela do jeito que a pessoa espera: Esc, clique fora ou o
// botão de fechar. Vale para todo diálogo/painel sobreposto do sistema
// (regra em AGENTS.md §7; teste em tests/regression/dismiss-overlays).
//
// - Esc fecha só a janela de cima (utils/dismissLayers.js).
// - Clique fora conta só quando o clique COMEÇA e TERMINA no fundo:
//   selecionar um texto dentro do painel e soltar o mouse fora não fecha.
// - `busy` (salvando/enviando) segura a janela aberta.
// - `guardUnsaved`: em formulário, Esc/clique fora com algo já digitado
//   não descarta calado — mostra <DismissPrompt> perguntando. O "Cancelar"
//   e o "×" continuam fechando direto: ali a intenção é explícita.
//
// Uso:
//   const dismiss = useDismiss({ open, onClose, busy: saving, guardUnsaved: true });
//   <div className="…-overlay" {...dismiss.backdropProps}>
//     <form className="…-panel" {...dismiss.panelProps}>
//       <DismissPrompt dismiss={dismiss} />
// Se a janela continua aberta depois de salvar, chame dismiss.markSaved().
// Editor que muda por botão (adicionar/remover/mover), não só digitando,
// passa `unsaved` com o estado dele: conta como algo digitado.
// ============================================================

export function useDismiss({ open = true, onClose, busy = false, guardUnsaved = false, unsaved = false } = {}) {
  const layerId = useId();
  const [dirty, setDirty] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  const pressStartedOnBackdrop = useRef(false);

  // Janela que continua montada entre aberturas (open=false/true) começa
  // limpa a cada vez: ajuste de estado no render, não em efeito.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) {
      setDirty(false);
      setConfirmingDiscard(false);
    }
  }

  function requestDismiss() {
    if (busy) return;
    if (guardUnsaved && (dirty || unsaved)) {
      setConfirmingDiscard(true);
      return;
    }
    onClose?.();
  }

  function discard() {
    setDirty(false);
    setConfirmingDiscard(false);
    onClose?.();
  }

  function keepEditing() {
    setConfirmingDiscard(false);
  }

  // Janela que continua aberta depois de salvar (ex.: painel do
  // profissional no SuperAdm) chama isto no sucesso: o que foi salvo não
  // é mais "não salvo".
  function markSaved() {
    setDirty(false);
    setConfirmingDiscard(false);
  }

  const handleEscape = useEffectEvent(() => {
    // Esc com a pergunta na tela = "continuar editando", nunca descartar.
    if (confirmingDiscard) {
      keepEditing();
      return;
    }
    requestDismiss();
  });

  useEffect(() => {
    if (!open) return undefined;
    pushLayer(layerId);

    function handleKeyDown(event) {
      if (!isDismissKey(event) || !isTopLayer(layerId)) return;
      event.preventDefault();
      handleEscape();
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      removeLayer(layerId);
    };
  }, [open, layerId]);

  const backdropProps = {
    onMouseDown(event) {
      pressStartedOnBackdrop.current = event.target === event.currentTarget;
    },
    onClick(event) {
      const startedOutside = pressStartedOnBackdrop.current;
      pressStartedOnBackdrop.current = false;
      if (startedOutside && event.target === event.currentTarget) requestDismiss();
    },
  };

  const panelProps = guardUnsaved
    ? { onInput: () => { if (!dirty) setDirty(true); } }
    : {};

  return {
    backdropProps,
    panelProps,
    confirmingDiscard,
    keepEditing,
    discard,
    markSaved,
    requestDismiss,
  };
}

export default useDismiss;
