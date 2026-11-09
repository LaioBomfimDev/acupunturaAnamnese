import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { resolveCorsDecision } from './corsPolicy.ts';
import { decodeVerifiedAuthClaims } from './edgeAccess.ts';
export { assertEdgeAccess } from './edgeAccess.ts';
export { writeAuditLog } from './audit.ts';

const baseCorsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '600',
};

export function createCorsContext(req: Request) {
  const decision = resolveCorsDecision(
    req.headers.get('Origin'),
    Deno.env.get('CORS_ALLOWED_ORIGINS'),
    Deno.env.get('CORS_ALLOW_DEFAULT_LOCAL_ORIGINS') === 'true',
  );
  const headers: Record<string, string> = {
    ...baseCorsHeaders,
    Vary: 'Origin',
  };

  if (decision.allowed && decision.origin) {
    headers['Access-Control-Allow-Origin'] = decision.origin;
  }

  const jsonResponse = (
    body: unknown,
    status = 200,
    additionalHeaders: Record<string, string> = {},
  ) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        ...headers,
        ...additionalHeaders,
        'Content-Type': 'application/json',
      },
    });

  return {
    allowed: decision.allowed,
    headers,
    jsonResponse,
    rejectResponse: () =>
      jsonResponse(
        {
          error: decision.reason === 'invalid_configuration'
            ? 'CORS não configurado corretamente no servidor.'
            : 'Origem não permitida.',
        },
        decision.reason === 'invalid_configuration' ? 503 : 403,
      ),
  };
}

// Chaves novas do Supabase vêm como JSON {"nome": "sb_..."}. JSON inválido
// devolve vazio: o erro do JSON.parse cita o conteúdo e levaria a chave ao log.
function getNamedOrFirstKey(rawKeys: string | undefined, preferredName = 'default') {
  if (!rawKeys) return '';
  try {
    const keys = JSON.parse(rawKeys) as Record<string, string>;
    return keys[preferredName] || Object.values(keys)[0] || '';
  } catch {
    return '';
  }
}

export function createServiceClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  // Chave nova (sb_secret_) primeiro; a antiga (JWT service_role) só de
  // reserva, até as Legacy API keys serem desligadas (ACUP-022).
  const serviceRoleKey = getNamedOrFirstKey(Deno.env.get('SUPABASE_SECRET_KEYS'))
    || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Chave secreta do Supabase não configurada nas Edge Functions.');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function createAnonClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  // Chave nova (sb_publishable_) primeiro; a anon antiga só de reserva.
  const anonKey = getNamedOrFirstKey(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS'))
    || Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !anonKey) {
    throw new Error('Chave pública do Supabase não configurada nas Edge Functions.');
  }

  return createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function getCallerProfile(req: Request, supabaseAdmin: ReturnType<typeof createServiceClient>) {
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    return { error: 'Sessão ausente.', status: 401 as const };
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData.user) {
    return { error: 'Sessão inválida.', status: 401 as const };
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id,email,username,full_name,role,clinic_id,is_active,must_change_password,mfa_required')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return { error: 'Perfil não encontrado.', status: 403 as const };
  }

  // O payload só é decodificado após auth.getUser validar assinatura, expiração
  // e usuário. O parser local não é usado como verificador de JWT.
  const claims = decodeVerifiedAuthClaims(token);
  return { user: userData.user, profile, claims };
}

export function assertSuperAdmin(profile: { role?: string; is_active?: boolean; must_change_password?: boolean }) {
  return profile.role === 'super_admin'
    && profile.is_active === true
    && profile.must_change_password !== true;
}

export function assertClinicAdmin(profile: { role?: string; is_active?: boolean; must_change_password?: boolean }) {
  return profile.role === 'clinic_admin'
    && profile.is_active === true
    && profile.must_change_password !== true;
}

export function normalizeEmail(email: unknown) {
  return String(email || '').trim().toLowerCase();
}

export function normalizeUsername(username: unknown, email = '') {
  const raw = String(username || '').trim().toLowerCase()
    || String(email || '').split('@')[0]?.trim().toLowerCase();
  return raw.replace(/[^a-z0-9._-]/g, '');
}

export function validateUsername(username: string) {
  return /^[a-z0-9._-]{3,40}$/.test(username);
}

export function validateStrongPassword(password: string, context: string[] = []) {
  const problems: string[] = [];
  const lowerPassword = password.toLowerCase();
  const weakFragments = ['123456', '654321', 'password', 'senha', 'qwerty', 'admin', 'superadm'];

  if (password.length < 8) problems.push('A senha precisa ter pelo menos 8 caracteres.');
  if (!/[a-z]/.test(password)) problems.push('Inclua pelo menos uma letra minúscula.');
  if (!/[A-Z]/.test(password)) problems.push('Inclua pelo menos uma letra maiúscula.');
  if (!/[0-9]/.test(password)) problems.push('Inclua pelo menos um número.');
  if (weakFragments.some(fragment => lowerPassword.includes(fragment))) {
    problems.push('Evite sequências e termos fáceis de adivinhar.');
  }

  for (const item of context) {
    const normalized = String(item || '').trim().toLowerCase();
    if (normalized.length >= 4 && lowerPassword.includes(normalized)) {
      problems.push('A senha não pode conter dados do usuário.');
      break;
    }
  }

  return problems;
}
