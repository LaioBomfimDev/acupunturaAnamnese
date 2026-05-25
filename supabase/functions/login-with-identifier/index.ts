import {
  corsHeaders,
  createAnonClient,
  createServiceClient,
  jsonResponse,
  normalizeEmail,
  normalizeUsername,
} from '../_shared/security.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Método não permitido.' }, 405);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const identifier = String(body.identifier || '').trim();
    const password = String(body.password || '');

    if (!identifier || !password) {
      return jsonResponse({ error: 'Usuário e senha são obrigatórios.' }, 400);
    }

    const supabaseAdmin = createServiceClient();
    const supabaseAuth = createAnonClient();
    const normalizedIdentifier = identifier.toLowerCase();
    let email = normalizeEmail(identifier);

    if (!normalizedIdentifier.includes('@')) {
      const username = normalizeUsername(identifier);
      const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('email,is_active')
        .eq('username', username)
        .maybeSingle();

      if (profileError) throw profileError;

      if (!profile?.email) {
        return jsonResponse({ error: 'Usuário ou senha incorretos.' }, 401);
      }

      if (profile.is_active !== true) {
        return jsonResponse({ error: 'Usuário suspenso.' }, 403);
      }

      email = profile.email;
    }

    const { data, error } = await supabaseAuth.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session || !data.user) {
      return jsonResponse({ error: 'Usuário ou senha incorretos.' }, 401);
    }

    return jsonResponse({
      session: data.session,
      user: data.user,
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Erro inesperado.' }, 500);
  }
});
