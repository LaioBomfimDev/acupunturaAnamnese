const CORRELATION_STORAGE_KEY = 'acup.telemetry.correlation.v1';

function createCorrelationId() {
  return globalThis.crypto?.randomUUID?.()
    || `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function getClientCorrelationId() {
  try {
    const current = sessionStorage.getItem(CORRELATION_STORAGE_KEY);
    if (current) return current;
    const created = createCorrelationId();
    sessionStorage.setItem(CORRELATION_STORAGE_KEY, created);
    return created;
  } catch {
    return createCorrelationId();
  }
}

function safeLocation() {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}${window.location.pathname}`;
}

export function sanitizeClientError(error, context = {}) {
  return {
    event: 'frontend_error',
    correlationId: getClientCorrelationId(),
    occurredAt: new Date().toISOString(),
    name: String(error?.name || 'Error').slice(0, 100),
    code: String(error?.code || 'UNCLASSIFIED_CLIENT_ERROR').slice(0, 120),
    location: safeLocation(),
    component: String(context.component || '').slice(0, 120),
    release: String(import.meta.env.VITE_APP_RELEASE || 'local').slice(0, 120),
  };
}

function reportingEndpoint() {
  const raw = String(import.meta.env.VITE_ERROR_REPORTING_ENDPOINT || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return '';
    return url.toString();
  } catch {
    return '';
  }
}

export function reportClientError(error, context = {}) {
  const event = sanitizeClientError(error, context);
  const endpoint = reportingEndpoint();

  // Nunca inclua estado React, payload clínico, usuário, paciente ou stack
  // completa. O identificador permite correlacionar o erro com logs seguros.
  console.error('[frontend_error]', event);
  if (endpoint && typeof fetch === 'function') {
    void fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
      keepalive: true,
    }).catch(() => undefined);
  }
  return event.correlationId;
}

export function installGlobalErrorTelemetry() {
  if (typeof window === 'undefined') return () => {};

  const onError = event => {
    reportClientError(event.error || new Error(event.message), { component: 'window.error' });
  };
  const onUnhandledRejection = event => {
    const error = event.reason instanceof Error
      ? event.reason
      : new Error('Promise rejeitada sem tratamento.');
    reportClientError(error, { component: 'window.unhandledrejection' });
  };

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onUnhandledRejection);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onUnhandledRejection);
  };
}
