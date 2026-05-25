import {
  assertSuperAdmin,
  corsHeaders,
  createServiceClient,
  getCallerProfile,
  jsonResponse,
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

    if (!assertSuperAdmin(caller.profile)) {
      return jsonResponse({ error: 'Apenas SuperAdm ativo pode redefinir senha temporária.' }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const profileId = String(body.profileId || '').trim();
    const temporaryPassword = String(body.temporaryPassword || '');
    const confirmTemporaryPassword = String(body.confirmTemporaryPassword || '');

    if (!profileId) {
      return jsonResponse({ error: 'Usuário alvo não informado.' }, 400);
    }

    if (profileId === caller.user.id) {
      return jsonResponse({ error: 'O SuperAdm não pode redefinir a própria senha por este painel.' }, 400);
    }

    if (temporaryPassword !== confirmTemporaryPassword) {
      return jsonResponse({ error: 'A confirmação da senha temporária não confere.' }, 400);
    }

    if (temporaryPassword.length < 6) {
      return jsonResponse({ error: 'A senha temporária precisa ter pelo menos 6 caracteres.' }, 400);
    }

    const { data: targetProfile, error: targetError } = await supabaseAdmin
      .from('profiles')
      .select('id,email,username,full_name,is_active,role')
      .eq('id', profileId)
      .maybeSingle();

    if (targetError) throw targetError;
    if (!targetProfile) {
      return jsonResponse({ error: 'Usuário não encontrado.' }, 404);
    }

    if (targetProfile.role === 'super_admin') {
      return jsonResponse({ error: 'Senha de SuperAdm não deve ser redefinida por este fluxo.' }, 400);
    }

    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(profileId, {
      password: temporaryPassword,
    });

    if (authError) {
      return jsonResponse({ error: authError.message }, 400);
    }

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        must_change_password: true,
        password_changed_at: null,
      })
      .eq('id', profileId);

    if (profileError) {
      return jsonResponse({ error: profileError.message }, 500);
    }

    await writeAuditLog(supabaseAdmin, {
      actorId: caller.user.id,
      targetId: profileId,
      action: 'temporary_password_reset',
      details: {
        email: targetProfile.email,
        username: targetProfile.username,
      },
    });

    return jsonResponse({ ok: true });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Erro inesperado.' }, 500);
  }
});
