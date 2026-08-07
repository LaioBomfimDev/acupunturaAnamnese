import {
  assertEdgeAccess,
  assertSuperAdmin,
  createCorsContext,
  createServiceClient,
  getCallerProfile,
  validateStrongPassword,
  writeAuditLog,
} from '../_shared/security.ts';
import { enforceEdgeRateLimit } from '../_shared/rateLimit.ts';

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
    const supabaseAdmin = createServiceClient();
    const caller = await getCallerProfile(req, supabaseAdmin);

    if ('error' in caller) {
      return jsonResponse({ error: caller.error }, caller.status);
    }

    const access = assertEdgeAccess(caller.profile, caller.claims);
    if (!access.allowed) return jsonResponse({ error: access.error }, access.status);
    if (!assertSuperAdmin(caller.profile)) {
      return jsonResponse({ error: 'Apenas SuperAdm ativo pode redefinir senha temporária.' }, 403);
    }

    const rateLimitResponse = await enforceEdgeRateLimit({
      supabaseAdmin,
      subjectId: caller.user.id,
      functionName: 'super-admin-reset-password',
      jsonResponse,
    });
    if (rateLimitResponse) return rateLimitResponse;

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

    const passwordProblems = validateStrongPassword(temporaryPassword, [
      targetProfile.email,
      targetProfile.username,
      targetProfile.full_name,
    ]);
    if (passwordProblems.length > 0) {
      return jsonResponse({ error: passwordProblems[0] }, 400);
    }

    // Ordem fail-closed: o gate é fechado antes de alterar a credencial.
    // Se o Auth falhar depois, o usuário continua bloqueado para dados
    // clínicos até o SuperAdm repetir a operação; nunca fica com senha
    // temporária ativa sem must_change_password.
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        must_change_password: true,
        password_changed_at: null,
      })
      .eq('id', profileId);

    if (profileError) {
      return jsonResponse({ error: 'Não foi possível preparar a redefinição com segurança.' }, 500);
    }

    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(profileId, {
      password: temporaryPassword,
    });

    if (authError) {
      return jsonResponse({
        error: 'A credencial não foi alterada. O acesso clínico ficou bloqueado; tente novamente.',
      }, 502);
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
  } catch {
    return jsonResponse({ error: 'Não foi possível redefinir a senha temporária.' }, 500);
  }
});
