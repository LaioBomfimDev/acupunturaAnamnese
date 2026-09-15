// ============================================================
// Diagnóstico leve de deslogamentos inesperados (relato: "sistema
// desloga sem explicação"). Grava só metadados de evento — nunca
// tokens — num anel no localStorage para inspecionar depois via
// DevTools: JSON.parse(localStorage.getItem('vitalis_auth_diag_log')).
// Remover quando o caso for resolvido/confirmado.
// ============================================================

const LOG_KEY = 'vitalis_auth_diag_log';
const MAX_ENTRIES = 60;
const TAB_ID = Math.random().toString(36).slice(2, 8);

function readLog() {
  try {
    const raw = globalThis.localStorage?.getItem(LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeEntry(entry) {
  try {
    const entries = readLog();
    entries.push({ t: new Date().toISOString(), tab: TAB_ID, ...entry });
    while (entries.length > MAX_ENTRIES) entries.shift();
    globalThis.localStorage?.setItem(LOG_KEY, JSON.stringify(entries));
  } catch {
    // diagnóstico nunca deve quebrar o app
  }
}

export function recordAuthEvent(source, event, session, extra = {}) {
  writeEntry({
    source,
    event: event || null,
    hasSession: Boolean(session),
    expiresAt: session?.expires_at ?? null,
    userIdTail: session?.user?.id ? String(session.user.id).slice(-6) : null,
    visibility: typeof document !== 'undefined' ? document.visibilityState : null,
    online: typeof navigator !== 'undefined' ? navigator.onLine : null,
    ...extra,
  });
}

export function recordAuthError(source, error) {
  writeEntry({
    source,
    errorMessage: error?.message || String(error),
    errorStatus: error?.status ?? error?.code ?? null,
    visibility: typeof document !== 'undefined' ? document.visibilityState : null,
    online: typeof navigator !== 'undefined' ? navigator.onLine : null,
  });
}

export function readAuthDiagnostics() {
  return readLog();
}
