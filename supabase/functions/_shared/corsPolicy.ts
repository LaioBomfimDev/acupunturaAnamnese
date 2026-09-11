// Portas fixas em .claude/launch.json — várias sessões de dev rodam em
// paralelo neste projeto, então cada uma pode cair numa porta diferente
// quando a padrão (5173) já está ocupada por outra sessão.
export const DEFAULT_LOCAL_CORS_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'http://localhost:5182',
  'http://127.0.0.1:5182',
] as const;

export type CorsDecision = {
  allowed: boolean;
  origin: string | null;
  reason?: 'invalid_configuration' | 'invalid_origin' | 'origin_not_allowed';
};

function isLoopbackHostname(hostname: string) {
  return hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '[::1]';
}

function normalizeConfiguredOrigin(
  rawOrigin: string,
  allowLocalHttp = false,
) {
  const candidate = rawOrigin.trim();
  if (!candidate || candidate === '*') return null;

  try {
    const url = new URL(candidate);
    if (
      (
        url.protocol !== 'https:'
        && !(
          allowLocalHttp
          && url.protocol === 'http:'
          && isLoopbackHostname(url.hostname)
        )
      )
      || url.username
      || url.password
      || url.search
      || url.hash
      || (url.pathname !== '/' && url.pathname !== '')
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function parseCorsAllowedOrigins(
  rawAllowedOrigins?: string | null,
  allowDefaultLocalOrigins = false,
) {
  const configuredEntries = String(rawAllowedOrigins || '')
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean);
  const normalizedEntries = configuredEntries.map(origin =>
    normalizeConfiguredOrigin(origin, allowDefaultLocalOrigins));

  if (normalizedEntries.some(origin => !origin)) {
    throw new Error('CORS_ALLOWED_ORIGINS contém origem inválida.');
  }

  const origins = normalizedEntries as string[];
  if (allowDefaultLocalOrigins) origins.push(...DEFAULT_LOCAL_CORS_ORIGINS);
  return [...new Set(origins)];
}

export function resolveCorsDecision(
  requestOrigin?: string | null,
  rawAllowedOrigins?: string | null,
  allowDefaultLocalOrigins = false,
): CorsDecision {
  const origin = String(requestOrigin || '').trim();

  // Requisições servidor-a-servidor não enviam Origin e não estão sujeitas a
  // CORS. Autenticação/autorização continuam obrigatórias no handler.
  if (!origin) return { allowed: true, origin: null };

  let allowedOrigins: string[];
  try {
    allowedOrigins = parseCorsAllowedOrigins(
      rawAllowedOrigins,
      allowDefaultLocalOrigins,
    );
  } catch {
    return { allowed: false, origin: null, reason: 'invalid_configuration' };
  }

  const normalizedOrigin = normalizeConfiguredOrigin(
    origin,
    allowDefaultLocalOrigins,
  );
  if (!normalizedOrigin || normalizedOrigin !== origin) {
    return { allowed: false, origin: null, reason: 'invalid_origin' };
  }
  if (!allowedOrigins.includes(normalizedOrigin)) {
    return { allowed: false, origin: null, reason: 'origin_not_allowed' };
  }

  return { allowed: true, origin: normalizedOrigin };
}
