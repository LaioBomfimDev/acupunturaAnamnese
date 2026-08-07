type OperationalLogLevel = 'info' | 'warn' | 'error';

type OperationalLogFields = {
  correlationId?: string;
  operation?: string;
  attempt?: number;
  maxAttempts?: number;
  status?: number;
  reason?: string;
  delayMs?: number;
  timeoutMs?: number;
  action?: string;
  errorCode?: string;
};

const CORRELATION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,96}$/;
const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9._:-]{1,96}$/;

export function createCorrelationId(candidate?: string | null) {
  const normalized = String(candidate || '').trim();
  return CORRELATION_ID_PATTERN.test(normalized)
    ? normalized
    : crypto.randomUUID();
}

function safeIdentifier(value: unknown) {
  const normalized = String(value || '').trim();
  return SAFE_IDENTIFIER_PATTERN.test(normalized) ? normalized : undefined;
}

/**
 * Log operacional deliberadamente restrito.
 *
 * Nunca inclua objetos de erro, payloads, prompts, respostas, cabeçalhos,
 * tokens, e-mails, IDs de usuário/paciente ou detalhes da auditoria.
 */
export function logOperationalEvent(
  level: OperationalLogLevel,
  event: string,
  fields: OperationalLogFields = {},
) {
  const safeEvent = safeIdentifier(event) || 'operational_event';
  const record: Record<string, string | number> = {
    timestamp: new Date().toISOString(),
    event: safeEvent,
  };

  const correlationId = safeIdentifier(fields.correlationId);
  const operation = safeIdentifier(fields.operation);
  const reason = safeIdentifier(fields.reason);
  const action = safeIdentifier(fields.action);
  const errorCode = safeIdentifier(fields.errorCode);

  if (correlationId) record.correlationId = correlationId;
  if (operation) record.operation = operation;
  if (reason) record.reason = reason;
  if (action) record.action = action;
  if (errorCode) record.errorCode = errorCode;

  for (const key of ['attempt', 'maxAttempts', 'status', 'delayMs', 'timeoutMs'] as const) {
    const value = fields[key];
    if (Number.isFinite(value)) record[key] = Number(value);
  }

  const line = JSON.stringify(record);
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.info(line);
  }
}
