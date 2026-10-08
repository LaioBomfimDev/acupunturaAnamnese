// ============================================================
// Área do Paciente — chamadas do lado do paciente (sem login)
//
// Só conversa com a Edge Function patient-portal. O token de sessão
// fica na memória da página e no sessionStorage da aba (some ao fechar
// a aba e vence em 4 horas no servidor); respostas nunca são guardadas
// no aparelho, só no servidor, a cada salvamento.
// ============================================================

import { supabase } from '../lib/supabase';

const SESSION_KEY = 'vitalis-area-do-paciente';

export class PortalError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'PortalError';
    Object.assign(this, details);
  }
}

async function readErrorBody(error) {
  if (typeof error?.context?.json !== 'function') return null;
  try {
    return await error.context.json();
  } catch {
    return null;
  }
}

export async function callPortal(body) {
  const { data, error } = await supabase.functions.invoke('patient-portal', { body });
  if (error) {
    const payload = await readErrorBody(error);
    const status = error.context?.status || 0;
    throw new PortalError(
      payload?.error || 'Sem conexão com a clínica agora. Confira a internet e tente de novo.',
      {
        status,
        offline: !payload,
        expired: Boolean(payload?.expired),
        locked: Boolean(payload?.locked),
        conflict: Boolean(payload?.conflict),
        closed: Boolean(payload?.closed),
        missing: Array.isArray(payload?.missing) ? payload.missing : [],
        retryAfterSeconds: payload?.retryAfterSeconds || 0,
      },
    );
  }
  if (data?.error) throw new PortalError(data.error);
  return data;
}

export function readStoredSession() {
  try {
    return window.sessionStorage.getItem(SESSION_KEY) || '';
  } catch {
    return '';
  }
}

export function storeSession(token) {
  try {
    if (token) window.sessionStorage.setItem(SESSION_KEY, token);
    else window.sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Aba privada sem storage: a sessão vale só enquanto a página estiver aberta.
  }
}

export function newSaveId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  // Navegador muito antigo: UUID v4 a partir de getRandomValues.
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
