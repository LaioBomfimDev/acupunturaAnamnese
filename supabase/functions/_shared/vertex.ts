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
//  * GCP_LOCATION — região (ex.: southamerica-east1, us-central1, global).
//
// O corpo da requisição (contents/systemInstruction/generationConfig/
// responseSchema) é IDÊNTICO ao do AI Studio — só muda endpoint + auth.
// ============================================================

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

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
  return Deno.env.get('GCP_LOCATION') || 'us-central1';
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
async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt > now + 60) return cachedToken.token;

  const sa = getServiceAccount();
  const jwt = await createSignedJwt(sa);
  const resp = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.access_token) {
    // Mensagem genérica — não vaza a chave nem o JWT.
    console.error('vertex token erro', resp.status);
    throw new Error('Falha ao autenticar na Vertex AI.');
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
  const sa = getServiceAccount();
  const location = getLocation();
  const token = await getAccessToken();
  const host = location === 'global'
    ? 'aiplatform.googleapis.com'
    : `${location}-aiplatform.googleapis.com`;
  const url = `https://${host}/v1/projects/${sa.project_id}/locations/${location}/publishers/google/models/${model}:generateContent`;

  return fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

// Indica se a IA está configurada (para checagem rápida nas funções).
export function isVertexConfigured(): boolean {
  return Boolean(Deno.env.get('GCP_SERVICE_ACCOUNT_JSON'));
}
