// Este módulo só entra no servidor Vite de desenvolvimento, atrás de
// import.meta.env.DEV + opt-in. Mesmo assim, credenciais nunca ficam no git:
// VITE_LOCAL_AUTH_USERS_JSON deve ser definido apenas no .env.local.

function loadLocalAdmins() {
  const raw = String(import.meta.env.VITE_LOCAL_AUTH_USERS_JSON || '').trim();
  if (!raw) {
    throw new Error(
      'Modo local habilitado sem VITE_LOCAL_AUTH_USERS_JSON no .env.local.',
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('VITE_LOCAL_AUTH_USERS_JSON não contém JSON válido.');
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('VITE_LOCAL_AUTH_USERS_JSON deve conter ao menos um usuário.');
  }

  const admins = new Map();
  for (const candidate of parsed) {
    const username = String(candidate?.username || '').trim().toLowerCase();
    const email = String(candidate?.email || '').trim().toLowerCase();
    const name = String(candidate?.name || '').trim();
    const password = String(candidate?.password || '');
    const strongPassword = (
      password.length >= 12
      && /[A-Z]/.test(password)
      && /[a-z]/.test(password)
      && /[0-9]/.test(password)
    );

    if (
      !/^[a-z0-9._-]{3,40}$/.test(username)
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      || !name
      || !strongPassword
      || admins.has(username)
    ) {
      throw new Error(
        'Usuário local inválido: use username único, e-mail, nome e senha forte com 12+ caracteres.',
      );
    }
    admins.set(username, Object.freeze({ email, name, password }));
  }
  return admins;
}

const LOCAL_ADMINS = loadLocalAdmins();

function findLocalAdmin(identifier) {
  const normalized = String(identifier || '').trim().toLowerCase();
  for (const [username, admin] of LOCAL_ADMINS) {
    if (username === normalized || admin.email === normalized) {
      return { username, admin };
    }
  }
  return null;
}

export function authenticateLocalUser(identifier, password) {
  const match = findLocalAdmin(identifier);
  if (!match || password !== match.admin.password) return null;
  return {
    username: match.username,
    email: match.admin.email,
    name: match.admin.name,
  };
}

export function verifyLocalUserPassword(user, password) {
  const username = String(user?.id || '').replace(/^local-/, '');
  return Boolean(LOCAL_ADMINS.get(username)?.password === password);
}

export function listLocalProfiles() {
  return [...LOCAL_ADMINS].map(([username, admin]) => ({
    id: `local-${username}`,
    full_name: admin.name,
    email: admin.email,
  }));
}
