import {
  createCorsContext,
  createServiceClient,
  getCallerProfile,
  validateStrongPassword,
  writeAuditLog,
} from '../_shared/security.ts';
import { enforceEdgeRateLimit } from '../_shared/rateLimit.ts';
import { createCorrelationId, logOperationalEvent } from '../_shared/observability.ts';
import { readClinicalJsonBody } from '../_shared/clinicalPayload.ts';

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

    if (caller.profile.is_active !== true) {
      return jsonResponse({ error: 'Usuário suspenso.' }, 403);
    }

    if (caller.profile.must_change_password !== true) {
      return jsonResponse({ ok: true, changed: false });
    }

    const rateLimitResponse = await enforceEdgeRateLimit({
      supabaseAdmin,
      subjectId: caller.user.id,
      functionName: 'complete-first-login',
      jsonResponse,
    });
    if (rateLimitResponse) return rateLimitResponse;

    const body = await readClinicalJsonBody(req, 2_048).catch(() => ({}));
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
      const correlationId = createCorrelationId();
      logOperationalEvent('error', 'first_login_auth_update_failed', {
        correlationId,
        operation: 'complete-first-login',
      });
      return jsonResponse({
        error: 'Não foi possível concluir a troca de senha. Tente novamente.',
        referencia: correlationId,
      }, 400);
    }

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        must_change_password: false,
        password_changed_at: new Date().toISOString(),
      })
      .eq('id', caller.user.id);

    if (profileError) {
      const correlationId = createCorrelationId();
      logOperationalEvent('error', 'first_login_profile_update_failed', {
        correlationId,
        operation: 'complete-first-login',
      });
      return jsonResponse({
        error: 'A senha foi alterada, mas não foi possível liberar o acesso. Contate o SuperAdm.',
        referencia: correlationId,
      }, 500);
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

    // Best-effort: derruba sessões antigas (ex.: dispositivo esquecido
    // logado com a senha temporária). Nunca deve bloquear a resposta —
    // a senha já foi trocada com sucesso quando chegamos aqui.
    const { error: revokeError } = await supabaseAdmin.rpc('revoke_user_sessions', {
      p_user_id: caller.user.id,
    });
    if (revokeError) {
      logOperationalEvent('warn', 'first_login_session_revocation_failed', {
        operation: 'complete-first-login',
      });
    }

    return jsonResponse({ ok: true, changed: true });
  } catch {
    return jsonResponse({ error: 'Erro inesperado. Tente novamente.' }, 500);
  }
});
