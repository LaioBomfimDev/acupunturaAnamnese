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

export function useAbaUnsavedGuard() {
  const editors = useRef(new Map());
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null);
  const register = useCallback((id, changed, saving, remove = false) => {
    if (remove) editors.current.delete(id);
    else editors.current.set(id, { dirty: Boolean(changed), busy: Boolean(saving) });
    const entries = [...editors.current.values()];
    setDirty(entries.some(entry => entry.dirty));
    setBusy(entries.some(entry => entry.busy));
  }, []);
  const navigate = useCallback(action => {
    const entries = [...editors.current.values()];
    if (entries.some(entry => entry.busy)) return;
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
  return { register, navigate, prompt: pending ? (
    <AbaDialog title="Sair sem salvar?" onClose={keepEditing} busy={busy}>
      <DismissPrompt discardLabel="Descartar e sair" dismiss={{ confirmingDiscard: true, keepEditing, discard }} />
    </AbaDialog>
  ) : null };
}
