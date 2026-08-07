// ============================================================
// SHARED: Cliente Vertex AI (Gemini enterprise)
// Autentica via conta de serviço do Google Cloud (OAuth2) e chama
// o endpoint generateContent da Vertex. Substitui a chave do AI Studio.
//
// Por que Vertex e não AI Studio: conformidade clínica/LGPD — Vertex
// NÃO usa os dados para treinar modelo, permite DPA e residência de
// dados por região. Ver roadmap-ia-expansao.
//
// Segredos (Supabase):
//  * GCP_SERVICE_ACCOUNT_JSON — JSON inteiro da conta de serviço
//    (contém client_email, private_key, project_id). NUNCA logar.
//  * GCP_LOCATION — região obrigatória (ex.: southamerica-east1).
//  * GCP_ALLOWED_LOCATIONS — allowlist CSV opcional. Sem ela, somente
//    southamerica-east1 é aceita para manter residência de dados no Brasil.
//
// O corpo da requisição (contents/systemInstruction/generationConfig/
// responseSchema) é IDÊNTICO ao do AI Studio — só muda endpoint + auth.
// ============================================================

import { createCorrelationId, logOperationalEvent } from './observability.ts';
import {
  fetchWithDeadlineAndRetry,
  ReliableFetchError,
  type ReliableFetchRetryEvent,
  resolveVertexLocation,
  VertexConfigurationError,
} from './vertexReliability.ts';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
const DEFAULT_TOKEN_TIMEOUT_MS = 10_000;
const DEFAULT_TOKEN_MAX_ATTEMPTS = 3;
const DEFAULT_VERTEX_TIMEOUT_MS = 45_000;
const DEFAULT_RETRY_BASE_MS = 300;

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

let cachedSA: ServiceAccount | null = null;
let cachedToken: { token: string; expiresAt: number } | null = null;

function getServiceAccount(): ServiceAccount {
  if (cachedSA) return cachedSA;
  const raw = Deno.env.get('GCP_SERVICE_ACCOUNT_JSON');
  if (!raw) throw new Error('IA não configurada no servidor (GCP_SERVICE_ACCOUNT_JSON ausente).');
  const sa = JSON.parse(raw) as ServiceAccount;
  if (!sa.client_email || !sa.private_key || !sa.project_id) {
    throw new Error('Conta de serviço inválida (faltam campos).');
  }
  cachedSA = sa;
  return sa;
}

export function getLocation(): string {
  return resolveVertexLocation(
    Deno.env.get('GCP_LOCATION'),
    Deno.env.get('GCP_ALLOWED_LOCATIONS'),
  );
}

function boundedIntegerEnv(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const raw = Deno.env.get(name);
  const parsed = Number(raw);
  if (!raw || !Number.isInteger(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

function onProviderRetry(
  operation: string,
  correlationId: string,
) {
  return (event: ReliableFetchRetryEvent) => {
    logOperationalEvent('warn', 'vertex_upstream_retry', {
      correlationId,
      operation,
      attempt: event.attempt,
      maxAttempts: event.maxAttempts,
      status: event.status,
      reason: event.reason,
      delayMs: event.delayMs,
    });
  };
}

export function getVertexConfigurationIssue(): string | null {
  try {
    getServiceAccount();
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    return /GCP_SERVICE_ACCOUNT_JSON ausente/i.test(message)
      ? 'IA não configurada no servidor (conta de serviço Vertex ausente).'
      : 'Conta de serviço Vertex inválida ou incompleta.';
  }

  try {
    getLocation();
    return null;
  } catch (error) {
    if (error instanceof VertexConfigurationError) return error.message;
    return 'Configuração de região da Vertex AI inválida.';
  }
}

// base64url de uma string ou bytes (sem padding).
function base64url(input: string | Uint8Array): string {
  let bin = '';
  if (typeof input === 'string') {
    bin = btoa(unescape(encodeURIComponent(input)));
  } else {
    let s = '';
    for (let i = 0; i < input.length; i++) s += String.fromCharCode(input[i]);
    bin = btoa(s);
  }
  return bin.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Importa a chave privada PEM (PKCS8) da conta de serviço para assinar RS256.
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const body = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s+/g, '');
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

// Cria e assina um JWT para o fluxo OAuth2 jwt-bearer.
async function createSignedJwt(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: sa.client_email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const key = await importPrivateKey(sa.private_key);
  const sig = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    key,
    new TextEncoder().encode(unsigned),
  );
  return `${unsigned}.${base64url(new Uint8Array(sig))}`;
}

// Token de acesso, com cache em memória até pouco antes de expirar.
async function getAccessToken(correlationId: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt > now + 60) return cachedToken.token;

  const sa = getServiceAccount();
  const jwt = await createSignedJwt(sa);
  const timeoutMs = boundedIntegerEnv(
    'GCP_TOKEN_TIMEOUT_MS',
    DEFAULT_TOKEN_TIMEOUT_MS,
    1_000,
    30_000,
  );
  const maxAttempts = boundedIntegerEnv(
    'GCP_TOKEN_MAX_ATTEMPTS',
    DEFAULT_TOKEN_MAX_ATTEMPTS,
    1,
    3,
  );
  let resp: Response;

  try {
    resp = await fetchWithDeadlineAndRetry(
      TOKEN_URL,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion: jwt,
        }),
      },
      {
        correlationId,
        timeoutMs,
        maxAttempts,
        retryBaseMs: boundedIntegerEnv(
          'VERTEX_RETRY_BASE_MS',
          DEFAULT_RETRY_BASE_MS,
          100,
          5_000,
        ),
        retryOnNetworkError: true,
        onRetry: onProviderRetry('vertex_oauth_token', correlationId),
      },
    );
  } catch (error) {
    const reason = error instanceof ReliableFetchError
      ? error.reason
      : 'unexpected_error';
    logOperationalEvent('error', 'vertex_upstream_failed', {
      correlationId,
      operation: 'vertex_oauth_token',
      reason,
      timeoutMs,
    });
    throw new Error(`Falha ao autenticar na Vertex AI. Referência: ${correlationId}.`);
  }

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.access_token) {
    // Mensagem genérica — não vaza a chave nem o JWT.
    logOperationalEvent('error', 'vertex_upstream_failed', {
      correlationId,
      operation: 'vertex_oauth_token',
      status: resp.status,
      reason: 'invalid_response',
    });
    throw new Error(`Falha ao autenticar na Vertex AI. Referência: ${correlationId}.`);
  }
  cachedToken = {
    token: data.access_token,
    expiresAt: now + (Number(data.expires_in) || 3600),
  };
  return cachedToken.token;
}

/**
 * Chama generateContent de um modelo Gemini na Vertex AI.
 * @param model ex.: 'gemini-2.5-flash' | 'gemini-2.5-flash-lite'
 * @param body corpo idêntico ao do AI Studio (contents, systemInstruction, generationConfig…)
 * @returns a Response do fetch (o chamador checa .ok e faz .json())
 */
export async function vertexGenerateContent(model: string, body: unknown): Promise<Response> {
  const correlationId = createCorrelationId();
  const sa = getServiceAccount();
  const location = getLocation();
  const token = await getAccessToken(correlationId);
  const host = location === 'global'
    ? 'aiplatform.googleapis.com'
    : `${location}-aiplatform.googleapis.com`;
  const url = `https://${host}/v1/projects/${sa.project_id}/locations/${location}/publishers/google/models/${model}:generateContent`;
  const timeoutMs = boundedIntegerEnv(
    'VERTEX_REQUEST_TIMEOUT_MS',
    DEFAULT_VERTEX_TIMEOUT_MS,
    5_000,
    60_000,
  );
  // generateContent é um POST não idempotente: um timeout ou 5xx pode ocorrer
  // depois de a geração ter sido aceita. Uma única tentativa evita resposta e
  // cobrança duplicadas; o chamador pode iniciar uma nova solicitação explícita.
  const maxAttempts = 1;
  let response: Response;

  try {
    response = await fetchWithDeadlineAndRetry(
      url,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
      {
        correlationId,
        timeoutMs,
        maxAttempts,
        retryBaseMs: boundedIntegerEnv(
          'VERTEX_RETRY_BASE_MS',
          DEFAULT_RETRY_BASE_MS,
          100,
          5_000,
        ),
        // Uma falha de rede pode ocorrer depois do provedor aceitar o POST.
        // Não repetir nesse caso evita geração/cobrança duplicada.
        retryOnNetworkError: false,
        onRetry: onProviderRetry('vertex_generate_content', correlationId),
      },
    );
  } catch (error) {
    const reason = error instanceof ReliableFetchError
      ? error.reason
      : 'unexpected_error';
    logOperationalEvent('error', 'vertex_upstream_failed', {
      correlationId,
      operation: 'vertex_generate_content',
      reason,
      timeoutMs,
    });
    throw new Error(`Falha ao consultar a Vertex AI. Referência: ${correlationId}.`);
  }

  if (!response.ok) {
    logOperationalEvent('error', 'vertex_upstream_failed', {
      correlationId,
      operation: 'vertex_generate_content',
      status: response.status,
      reason: 'http_status',
    });
  }

  return response;
}

// Indica se a IA está configurada (para checagem rápida nas funções).
export function isVertexConfigured(): boolean {
  return getVertexConfigurationIssue() === null;
}
