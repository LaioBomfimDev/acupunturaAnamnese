export const LOCAL_USER_KEY = 'acup_local_user';

export function clearLocalAuthenticatedUser(storage = globalThis.localStorage) {
  storage?.removeItem?.(LOCAL_USER_KEY);
}

export function readLocalAuthenticatedUser({
  storage = globalThis.localStorage,
  enabled = false,
} = {}) {
  const saved = storage?.getItem?.(LOCAL_USER_KEY);
  if (!saved) return null;

  if (!enabled) {
    clearLocalAuthenticatedUser(storage);
    return null;
  }

  try {
    const user = JSON.parse(saved);
    if (
      !user
      || user._isLocal !== true
      || !String(user.id || '').startsWith('local-')
    ) {
      clearLocalAuthenticatedUser(storage);
      return null;
    }
    return user;
  } catch {
    clearLocalAuthenticatedUser(storage);
    return null;
  }
}

export function storeLocalAuthenticatedUser(user, storage = globalThis.localStorage) {
  if (!user || user._isLocal !== true || !String(user.id || '').startsWith('local-')) {
    throw new Error('Usuário local inválido.');
  }
  storage?.setItem?.(LOCAL_USER_KEY, JSON.stringify(user));
}
