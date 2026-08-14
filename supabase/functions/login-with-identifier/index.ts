import {
  createCorsContext,
  createAnonClient,
  createServiceClient,
  normalizeEmail,
  normalizeUsername,
} from '../_shared/security.ts';
import { enforceEdgeRateLimit } from '../_shared/rateLimit.ts';
import { readClinicalJsonBody } from '../_shared/clinicalPayload.ts';

const GENERIC_LOGIN_ERROR = 'Usuário ou senha incorretos.';
const MAX_IDENTIFIER_LENGTH = 320;
const MAX_PASSWORD_LENGTH = 1024;
const TEMPORARY_PASSWORD_TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function deriveOpaqueRateLimitSubject(
  namespace: string,
  normalizedIdentifier: string,
) {
  const digest = new Uint8Array(
    await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(
        `sistema-acup:login-rate-limit:${namespace}:${normalizedIdentifier}`,
      ),
    ),
  );
  const uuidBytes = digest.slice(0, 16);
  uuidBytes[6] = ((uuidBytes[6] || 0) & 0x0f) | 0x50;
  uuidBytes[8] = ((uuidBytes[8] || 0) & 0x3f) | 0x80;
  const hex = Array.from(uuidBytes, (byte) =>
    byte.toString(16).padStart(2, '0')).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

Deno.serve(async (req) => {
  const cors = createCorsContext(req);
  if (!cors.allowed) return cors.rejectResponse();
  const { headers: corsHeaders, jsonResponse } = cors;

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Método não permitido.' }, 405);
  }

  try {
    const body = await readClinicalJsonBody(req, 2_048).catch(() => ({}));
    const identifier = String(body.identifier || '').trim();
    const password = String(body.password || '');

    if (
      !identifier
      || !password
      || identifier.length > MAX_IDENTIFIER_LENGTH
      || password.length > MAX_PASSWORD_LENGTH
    ) {
      return jsonResponse({ error: 'Usuário e senha são obrigatórios.' }, 400);
    }

    const supabaseAdmin = createServiceClient();
    const supabaseAuth = createAnonClient();
    const normalizedIdentifier = identifier.toLowerCase();
    const usesEmail = normalizedIdentifier.includes('@');
    const lookupColumn = usesEmail ? 'email' : 'username';
    const lookupValue = usesEmail
      ? normalizeEmail(identifier)
      : normalizeUsername(identifier);

    // Primeiro bucket: independe da existência/status da conta, portanto
    // identificadores inexistentes e suspensos também consomem limite.
    const identifierSubjectId = await deriveOpaqueRateLimitSubject(
      lookupColumn,
      lookupValue,
    );
    const identifierRateLimitResponse = await enforceEdgeRateLimit({
      supabaseAdmin,
      subjectId: identifierSubjectId,
      functionName: 'login-identifier-lookup',
      jsonResponse,
    });
    if (identifierRateLimitResponse) return identifierRateLimitResponse;

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id,email,is_active,must_change_password,temporary_password_set_at')
      .eq(lookupColumn, lookupValue)
      .maybeSingle();

    if (profileError) throw profileError;

    // Segundo bucket: consolida username/e-mail no UUID real quando a conta
    // existe. Para ausentes usa outro UUID opaco, mantendo o mesmo fluxo.
    const accountSubjectId = profile?.id || await deriveOpaqueRateLimitSubject(
      'unresolved-account',
      `${lookupColumn}:${lookupValue}`,
    );
    const accountRateLimitResponse = await enforceEdgeRateLimit({
      supabaseAdmin,
      subjectId: accountSubjectId,
      functionName: 'login-with-identifier',
      jsonResponse,
    });
    if (accountRateLimitResponse) return accountRateLimitResponse;

    // Sempre chama signInWithPassword, mesmo para conta inexistente/inativa
    // (com um e-mail-isca em domínio reservado a inválido, RFC 2606). Um
    // identificador ruim retornar imediatamente, sem essa chamada, criava
    // um oráculo de tempo: resposta rápida = conta não existe/suspensa,
    // resposta lenta = conta existe e a senha está errada. Chamando sempre,
    // as duas trilhas fazem o mesmo trabalho de rede antes de decidir.
    const profileValid = Boolean(profile?.id && profile.email && profile.is_active === true);
    const authEmail = profileValid
      ? profile.email
      : `no-such-account+${accountSubjectId}@login-decoy.invalid`;

    const { data, error } = await supabaseAuth.auth.signInWithPassword({
      email: authEmail,
      password,
    });

    if (!profileValid || error || !data.session || !data.user) {
      return jsonResponse({ error: GENERIC_LOGIN_ERROR }, 401);
    }

    // Senha temporária vencida: a credencial é válida, mas parada demais
    // sem troca. Revoga a sessão que acabou de ser criada e recusa —
    // só chega aqui quem já provou conhecer a senha certa, então não abre
    // canal novo de enumeração de conta.
    if (profile.must_change_password === true && profile.temporary_password_set_at) {
      const issuedAt = new Date(profile.temporary_password_set_at).getTime();
      if (Number.isFinite(issuedAt) && Date.now() - issuedAt > TEMPORARY_PASSWORD_TTL_MS) {
        await supabaseAdmin.auth.admin.signOut(data.session.access_token, 'global').catch(() => undefined);
        return jsonResponse({
          error: 'Sua senha temporária expirou. Peça ao SuperAdm uma nova redefinição.',
        }, 401);
      }
    }

    return jsonResponse({
      session: data.session,
      user: data.user,
    });
  } catch {
    return jsonResponse({ error: 'Não foi possível concluir o acesso.' }, 500);
  }
});
