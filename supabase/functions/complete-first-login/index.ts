import {
  corsHeaders,
  createServiceClient,
  getCallerProfile,
  jsonResponse,
  validateStrongPassword,
  writeAuditLog,
} from '../_shared/security.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Método não permitido.' }, 405);
  }

  try {
    const supabaseAdmin = createServiceClient();
    const caller = await getCallerProfile(req, supabaseAdmin);

    if ('error' in caller) {
      return jsonResponse({ error: caller.error }, caller.status);
    }

    if (caller.profile.is_active !== true) {
      return jsonResponse({ error: 'Usuário suspenso.' }, 403);
    }

    if (caller.profile.must_change_password !== true) {
      return jsonResponse({ ok: true, changed: false });
    }

    const body = await req.json().catch(() => ({}));
    const password = String(body.password || '');
    const confirmPassword = String(body.confirmPassword || '');

    if (password !== confirmPassword) {
      return jsonResponse({ error: 'A confirmação da senha não confere.' }, 400);
    }

    const passwordProblems = validateStrongPassword(password, [
      caller.profile.email,
      caller.profile.username,
      caller.profile.full_name,
    ]);

    if (passwordProblems.length > 0) {
      return jsonResponse({ error: passwordProblems[0], details: passwordProblems }, 400);
    }

    const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(
      caller.user.id,
      { password }
    );

    if (updateAuthError) {
      return jsonResponse({ error: updateAuthError.message }, 400);
    }

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        must_change_password: false,
        password_changed_at: new Date().toISOString(),
      })
      .eq('id', caller.user.id);

    if (profileError) {
      return jsonResponse({ error: profileError.message }, 500);
    }

    await writeAuditLog(supabaseAdmin, {
      actorId: caller.user.id,
      targetId: caller.user.id,
      action: 'first_login_password_changed',
      details: {
        email: caller.profile.email,
        username: caller.profile.username,
      },
    });

    return jsonResponse({ ok: true, changed: true });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Erro inesperado.' }, 500);
  }
});
