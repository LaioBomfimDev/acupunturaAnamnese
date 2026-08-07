import { createCorrelationId, logOperationalEvent } from './observability.ts';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FUNCTION_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;

type RateLimitClient = {
  rpc: (
    functionName: string,
    parameters: Record<string, unknown>,
  ) => Promise<{
    data?: unknown;
    error?: {
      code?: unknown;
    } | null;
  }>;
};

export type PersistentRateLimitInput = {
  subjectId: string;
  functionName: string;
  windowSeconds: number;
  limit: number;
};

export type PersistentRateLimitDecision = {
  allowed: boolean;
  status: 200 | 429 | 503;
  remaining: number;
  retryAfterSeconds: number;
  resetAt: string | null;
  reason?: 'limit_exceeded' | 'invalid_input' | 'storage_unavailable' | 'invalid_response';
};

type JsonResponder = (
  body: unknown,
  status?: number,
  additionalHeaders?: Record<string, string>,
) => Response;

type EnvironmentReader = (name: string) => string | undefined;

type EnforceEdgeRateLimitInput = {
  supabaseAdmin: unknown;
  subjectId: string;
  functionName: string;
  jsonResponse: JsonResponder;
  readEnvironment?: EnvironmentReader;
};

const DEFAULT_WINDOW_SECONDS = 60;
const DEFAULT_MAX_REQUESTS = 20;

function safeErrorCode(error: unknown) {
  if (!error || typeof error !== 'object' || !('code' in error)) return undefined;
  const code = String((error as { code?: unknown }).code || '').trim();
  return /^[A-Za-z0-9._:-]{1,96}$/.test(code) ? code : undefined;
}

function blocked(
  reason: PersistentRateLimitDecision['reason'],
  status: 429 | 503,
  retryAfterSeconds = 0,
): PersistentRateLimitDecision {
  return {
    allowed: false,
    status,
    remaining: 0,
    retryAfterSeconds,
    resetAt: null,
    reason,
  };
}

function parseRpcData(data: unknown) {
  const candidate = Array.isArray(data) ? data[0] : data;
  if (!candidate || typeof candidate !== 'object') return null;

  const record = candidate as Record<string, unknown>;
  const allowed = record.allowed;
  const remaining = Number(record.remaining);
  const retryAfterSeconds = Number(record.retry_after_seconds);
  const resetAt = record.reset_at === null || record.reset_at === undefined
    ? null
    : String(record.reset_at);

  if (
    typeof allowed !== 'boolean'
    || !Number.isInteger(remaining)
    || remaining < 0
    || !Number.isInteger(retryAfterSeconds)
    || retryAfterSeconds < 0
    || (resetAt !== null && !Number.isFinite(Date.parse(resetAt)))
  ) {
    return null;
  }

  return { allowed, remaining, retryAfterSeconds, resetAt };
}

function parseConfiguredInteger(
  raw: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    return null;
  }
  return parsed;
}

export function resolveEdgeRateLimitConfig(
  functionName: string,
  readEnvironment: EnvironmentReader,
) {
  if (!FUNCTION_NAME_PATTERN.test(functionName)) return null;

  const functionKey = functionName.toUpperCase().replace(/-/g, '_');
  const globalWindow = readEnvironment('EDGE_RATE_LIMIT_WINDOW_SECONDS');
  const globalLimit = readEnvironment('EDGE_RATE_LIMIT_MAX_REQUESTS');
  const functionWindow = readEnvironment(
    `EDGE_RATE_LIMIT_${functionKey}_WINDOW_SECONDS`,
  );
  const functionLimit = readEnvironment(
    `EDGE_RATE_LIMIT_${functionKey}_MAX_REQUESTS`,
  );
  const windowSeconds = parseConfiguredInteger(
    functionWindow ?? globalWindow,
    DEFAULT_WINDOW_SECONDS,
    1,
    86_400,
  );
  const limit = parseConfiguredInteger(
    functionLimit ?? globalLimit,
    DEFAULT_MAX_REQUESTS,
    1,
    10_000,
  );

  return windowSeconds === null || limit === null
    ? null
    : { windowSeconds, limit };
}

/**
 * Consome rate limit persistente e atômico via RPC.
 *
 * Este helper nunca usa memória do isolate. Falha de RPC, contrato ausente ou
 * resposta inválida bloqueiam a operação (503), evitando bypass silencioso.
 */
export async function consumePersistentRateLimit(
  supabaseAdmin: unknown,
  input: PersistentRateLimitInput,
): Promise<PersistentRateLimitDecision> {
  const correlationId = createCorrelationId();
  const validInput = UUID_PATTERN.test(input.subjectId)
    && FUNCTION_NAME_PATTERN.test(input.functionName)
    && Number.isInteger(input.windowSeconds)
    && input.windowSeconds >= 1
    && input.windowSeconds <= 86_400
    && Number.isInteger(input.limit)
    && input.limit >= 1
    && input.limit <= 10_000;

  if (!validInput) {
    logOperationalEvent('error', 'edge_rate_limit_failed', {
      correlationId,
      operation: 'consume_edge_rate_limit',
      reason: 'invalid_input',
    });
    return blocked('invalid_input', 503);
  }

  try {
    const result = await (supabaseAdmin as RateLimitClient).rpc(
      'consume_edge_rate_limit',
      {
        p_subject_id: input.subjectId,
        p_function_name: input.functionName,
        p_window_seconds: input.windowSeconds,
        p_limit: input.limit,
      },
    );

    if (result?.error) {
      logOperationalEvent('error', 'edge_rate_limit_failed', {
        correlationId,
        operation: 'consume_edge_rate_limit',
        reason: 'storage_unavailable',
        errorCode: safeErrorCode(result.error),
      });
      return blocked('storage_unavailable', 503);
    }

    const decision = parseRpcData(result?.data);
    if (!decision) {
      logOperationalEvent('error', 'edge_rate_limit_failed', {
        correlationId,
        operation: 'consume_edge_rate_limit',
        reason: 'invalid_response',
      });
      return blocked('invalid_response', 503);
    }
    if (!decision.allowed) {
      return {
        ...decision,
        allowed: false,
        status: 429,
        reason: 'limit_exceeded',
      };
    }

    return {
      ...decision,
      allowed: true,
      status: 200,
    };
  } catch (error) {
    logOperationalEvent('error', 'edge_rate_limit_failed', {
      correlationId,
      operation: 'consume_edge_rate_limit',
      reason: 'storage_unavailable',
      errorCode: safeErrorCode(error),
    });
    return blocked('storage_unavailable', 503);
  }
}

/**
 * Enforcement compartilhado para handlers HTTP.
 *
 * Retorna null quando a chamada pode continuar; em excesso retorna 429 com
 * Retry-After e, se a configuração/RPC falhar, retorna 503 fail-closed.
 */
export async function enforceEdgeRateLimit(
  input: EnforceEdgeRateLimitInput,
): Promise<Response | null> {
  const readEnvironment = input.readEnvironment
    || ((name: string) => Deno.env.get(name));
  const config = resolveEdgeRateLimitConfig(
    input.functionName,
    readEnvironment,
  );

  if (!config) {
    logOperationalEvent('error', 'edge_rate_limit_failed', {
      correlationId: createCorrelationId(),
      operation: 'consume_edge_rate_limit',
      reason: 'invalid_config',
    });
    return input.jsonResponse(
      { error: 'Limite de uso não configurado corretamente no servidor.' },
      503,
    );
  }

  const decision = await consumePersistentRateLimit(
    input.supabaseAdmin,
    {
      subjectId: input.subjectId,
      functionName: input.functionName,
      windowSeconds: config.windowSeconds,
      limit: config.limit,
    },
  );

  if (decision.allowed) return null;
  if (decision.status === 429) {
    const retryAfterSeconds = Math.max(1, decision.retryAfterSeconds);
    return input.jsonResponse(
      {
        error: 'Muitas solicitações. Aguarde antes de tentar novamente.',
        retryAfterSeconds,
      },
      429,
      { 'Retry-After': String(retryAfterSeconds) },
    );
  }

  return input.jsonResponse(
    { error: 'Limite de uso temporariamente indisponível.' },
    503,
  );
}
