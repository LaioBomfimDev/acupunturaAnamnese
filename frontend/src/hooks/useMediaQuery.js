import { useSyncExternalStore } from 'react';

function subscribe(query, callback) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mql = window.matchMedia(query);
  mql.addEventListener('change', callback);
  return () => mql.removeEventListener('change', callback);
}

function getSnapshot(query) {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(query).matches;
}

/**
 * Reage a uma media query em runtime (ex.: alternar layout mobile/desktop
 * sem recarregar a página). O app é SPA puro (main.jsx usa createRoot,
 * nunca hydrateRoot) — o guard de `window` aqui não é sobre SSR, é pra
 * não quebrar teste de agenda que renderiza componente via
 * ssrLoadModule+renderToStaticMarkup em Node puro, onde `window` não existe.
 */
export function useMediaQuery(query) {
  return useSyncExternalStore(
    callback => subscribe(query, callback),
    () => getSnapshot(query),
    () => false,
  );
}
