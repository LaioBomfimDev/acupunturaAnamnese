export const DEFAULT_APPROVED_VERTEX_LOCATIONS = ['southamerica-east1'] as const;

const TRANSIENT_HTTP_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const LOCATION_PATTERN = /^(?:global|[a-z]+(?:-[a-z0-9]+)+[0-9])$/;

export type VertexConfigurationErrorCode =
  | 'location_missing'
  | 'allowed_locations_empty'
  | 'location_invalid'
  | 'location_not_approved';

export class VertexConfigurationError extends Error {
  code: VertexConfigurationErrorCode;

  constructor(code: VertexConfigurationErrorCode, message: string) {
    super(message);
    this.name = 'VertexConfigurationError';
    this.code = code;
  }
}

export function parseApprovedVertexLocations(rawAllowedLocations?: string | null) {
  if (rawAllowedLocations === undefined || rawAllowedLocations === null) {
    return [...DEFAULT_APPROVED_VERTEX_LOCATIONS];
  }

  return [...new Set(
    rawAllowedLocations
      .split(',')
      .map(location => location.trim().toLowerCase())
      .filter(Boolean),
  )];
}

export function resolveVertexLocation(
  rawLocation?: string | null,
  rawAllowedLocations?: string | null,
) {
  const location = String(rawLocation || '').trim().toLowerCase();
  if (!location) {
    throw new VertexConfigurationError(
      'location_missing',
      'Região da Vertex AI não configurada (GCP_LOCATION ausente).',
    );
  }
  if (!LOCATION_PATTERN.test(location)) {
    throw new VertexConfigurationError(
      'location_invalid',
      'Região da Vertex AI inválida.',
    );
  }

  const approvedLocations = parseApprovedVertexLocations(rawAllowedLocations);
  if (approvedLocations.length === 0) {
    throw new VertexConfigurationError(
      'allowed_locations_empty',
      'Lista de regiões aprovadas da Vertex AI está vazia.',
    );
  }
  if (approvedLocations.some(approvedLocation => !LOCATION_PATTERN.test(approvedLocation))) {
    throw new VertexConfigurationError(
      'location_invalid',
      'Lista de regiões aprovadas da Vertex AI contém valor inválido.',
    );
  }
  if (!approvedLocations.includes(location)) {
    throw new VertexConfigurationError(
      'location_not_approved',
      'Região da Vertex AI não aprovada para este ambiente.',
    );
  }

  return location;
}

export type ReliableFetchFailureReason =
  | 'timeout'
  | 'network_error'
  | 'cancelled'
  | 'unexpected_error';

export class ReliableFetchError extends Error {
  reason: ReliableFetchFailureReason;
  correlationId: string;

  constructor(reason: ReliableFetchFailureReason, correlationId: string) {
    super(`Falha de comunicação com serviço externo. Referência: ${correlationId}.`);
    this.name = 'ReliableFetchError';
    this.reason = reason;
    this.correlationId = correlationId;
  }
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type ReliableFetchRetryEvent = {
  attempt: number;
  maxAttempts: number;
  reason: 'http_status' | ReliableFetchFailureReason;
  delayMs: number;
  status?: number;
};

type ReliableFetchOptions = {
  correlationId: string;
  timeoutMs: number;
  maxAttempts: number;
  retryBaseMs?: number;
  retryOnNetworkError?: boolean;
  fetchImpl?: FetchLike;
  sleep?: (delayMs: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
  onRetry?: (event: ReliableFetchRetryEvent) => void;
};

function retryAfterMs(response: Response, now: () => number) {
  const raw = response.headers.get('Retry-After')?.trim();
  if (!raw) return 0;

  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000);
  }

  const retryDate = Date.parse(raw);
  return Number.isFinite(retryDate) ? Math.max(0, retryDate - now()) : 0;
}

function calculateRetryDelay(
  attempt: number,
  response: Response | null,
  retryBaseMs: number,
  random: () => number,
  now: () => number,
) {
  const exponentialDelay = retryBaseMs * (2 ** Math.max(0, attempt - 1));
  const jitter = Math.floor(Math.max(0, Math.min(1, random())) * retryBaseMs);
  const requestedDelay = response ? retryAfterMs(response, now) : 0;
  return Math.min(30_000, Math.max(exponentialDelay + jitter, requestedDelay));
}

async function fetchAttempt(
  input: RequestInfo | URL,
  init: RequestInit,
  fetchImpl: FetchLike,
  timeoutMs: number,
  correlationId: string,
) {
  const controller = new AbortController();
  const parentSignal = init.signal;
  let deadlineTriggered = false;

  const forwardAbort = () => controller.abort(parentSignal?.reason);
  if (parentSignal?.aborted) {
    forwardAbort();
  } else {
    parentSignal?.addEventListener('abort', forwardAbort, { once: true });
  }

  const deadline = setTimeout(() => {
    deadlineTriggered = true;
    controller.abort('deadline');
  }, timeoutMs);

  try {
    const response = await fetchImpl(input, { ...init, signal: controller.signal });
    // generateContent não é streaming. Bufferizar aqui mantém o deadline ativo
    // até o corpo completo chegar; fetch() isolado resolve já nos cabeçalhos.
    const responseBody = await response.arrayBuffer();
    const body = responseBody.byteLength === 0
      && [204, 205, 304].includes(response.status)
      ? null
      : responseBody;
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch (error) {
    let reason: ReliableFetchFailureReason;
    if (deadlineTriggered) {
      reason = 'timeout';
    } else if (parentSignal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
      reason = 'cancelled';
    } else if (error instanceof TypeError) {
      reason = 'network_error';
    } else {
      reason = 'unexpected_error';
    }
    throw new ReliableFetchError(reason, correlationId);
  } finally {
    clearTimeout(deadline);
    parentSignal?.removeEventListener('abort', forwardAbort);
  }
}

export async function fetchWithDeadlineAndRetry(
  input: RequestInfo | URL,
  init: RequestInit,
  options: ReliableFetchOptions,
) {
  const fetchImpl = options.fetchImpl || fetch;
  const sleep = options.sleep || ((delayMs: number) =>
    new Promise<void>(resolve => setTimeout(resolve, delayMs)));
  const random = options.random || Math.random;
  const now = options.now || Date.now;
  const retryBaseMs = Math.max(1, Math.round(options.retryBaseMs || 300));
  const maxAttempts = Math.max(1, Math.round(options.maxAttempts));
  const timeoutMs = Math.max(1, Math.round(options.timeoutMs));

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let response: Response;
    try {
      response = await fetchAttempt(
        input,
        init,
        fetchImpl,
        timeoutMs,
        options.correlationId,
      );
    } catch (error) {
      const reliableError = error instanceof ReliableFetchError
        ? error
        : new ReliableFetchError('unexpected_error', options.correlationId);
      const mayRetry = options.retryOnNetworkError === true
        && (reliableError.reason === 'timeout' || reliableError.reason === 'network_error')
        && attempt < maxAttempts;

      if (!mayRetry) throw reliableError;

      const delayMs = calculateRetryDelay(attempt, null, retryBaseMs, random, now);
      options.onRetry?.({
        attempt,
        maxAttempts,
        reason: reliableError.reason,
        delayMs,
      });
      await sleep(delayMs);
      continue;
    }

    const mayRetryStatus = TRANSIENT_HTTP_STATUSES.has(response.status)
      && attempt < maxAttempts;
    if (!mayRetryStatus) return response;

    if (response.body) {
      await response.body.cancel().catch(() => undefined);
    }
    const delayMs = calculateRetryDelay(attempt, response, retryBaseMs, random, now);
    options.onRetry?.({
      attempt,
      maxAttempts,
      reason: 'http_status',
      status: response.status,
      delayMs,
    });
    await sleep(delayMs);
  }

  throw new ReliableFetchError('unexpected_error', options.correlationId);
}
