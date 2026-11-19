import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { AbaDialog } from './AbaDialog';
import { DismissPrompt } from '../ui/DismissPrompt';

export const AbaUnsavedContext = createContext(null);

// Só guarda sinalizadores. Texto clínico permanece no estado de cada editor.
export function useAbaUnsaved(dirty, busy = false) {
  const register = useContext(AbaUnsavedContext);
  const id = useId();
  useLayoutEffect(() => { register?.(id, typeof dirty === 'function' ? dirty() : dirty, busy); });
  useLayoutEffect(() => () => register?.(id, false, false, true), [register, id]);
}

// ACUP-015: texto da pergunta de saída que diz o que acontece.
export const ABA_LEAVE_CONSEQUENCE = 'Se sair agora, o que foi digitado e ainda não foi salvo se perde. Para guardar, escolha Continuar editando e salve.';
export const ABA_SAVING_NOTICE = 'Salvando… Espere terminar para sair.';

export function useAbaUnsavedGuard() {
  const editors = useRef(new Map());
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null);
  // ACUP-015: sair durante a gravação avisa "Salvando…" em vez de não fazer nada calado.
  const [blockedWhileSaving, setBlockedWhileSaving] = useState(false);
  const register = useCallback((id, changed, saving, remove = false) => {
    if (remove) editors.current.delete(id);
    else editors.current.set(id, { dirty: Boolean(changed), busy: Boolean(saving) });
    const entries = [...editors.current.values()];
    setDirty(entries.some(entry => entry.dirty));
    const anySaving = entries.some(entry => entry.busy);
    setBusy(anySaving);
    if (!anySaving) setBlockedWhileSaving(false);
  }, []);
  const navigate = useCallback(action => {
    const entries = [...editors.current.values()];
    if (entries.some(entry => entry.busy)) {
      setBlockedWhileSaving(true);
      return;
    }
    if (entries.some(entry => entry.dirty)) setPending(() => action);
    else action();
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const keepEditing = () => setPending(null);
  const discard = () => {
    if (busy || !pending) return;
    setPending(null);
    pending();
  };
  const savingNotice = blockedWhileSaving && busy
    ? <p className="aba-saving-notice" role="status">{ABA_SAVING_NOTICE}</p>
    : null;
  return { register, navigate, prompt: pending ? (
    <AbaDialog title="Sair sem salvar?" onClose={keepEditing} busy={busy}>
      <DismissPrompt discardLabel="Descartar e sair" consequence={ABA_LEAVE_CONSEQUENCE} dismiss={{ confirmingDiscard: true, keepEditing, discard }} />
    </AbaDialog>
  ) : savingNotice };
}
