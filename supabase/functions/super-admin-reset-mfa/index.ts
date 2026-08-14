import {
  assertEdgeAccess,
  assertSuperAdmin,
  createCorsContext,
  createServiceClient,
  getCallerProfile,
  writeAuditLog,
} from '../_shared/security.ts';
import { enforceEdgeRateLimit } from '../_shared/rateLimit.ts';
import { readClinicalJsonBody } from '../_shared/clinicalPayload.ts';
import {
  createCorrelationId,
  logOperationalEvent,
} from '../_shared/observability.ts';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

  const correlationId = createCorrelationId(
    req.headers.get('x-correlation-id'),
  );

  try {
    const supabaseAdmin = createServiceClient();
    const caller = await getCallerProfile(req, supabaseAdmin);
    if ('error' in caller) {
      return jsonResponse({ error: caller.error }, caller.status);
    }

    const access = assertEdgeAccess(caller.profile, caller.claims);
    if (!access.allowed) {
      return jsonResponse({ error: access.error }, access.status);
    }
    if (!assertSuperAdmin(caller.profile)) {
      return jsonResponse({
        error: 'Apenas SuperAdm ativo pode recuperar o segundo fator.',
      }, 403);
    }

    const rateLimitResponse = await enforceEdgeRateLimit({
      supabaseAdmin,
      subjectId: caller.user.id,
      functionName: 'super-admin-reset-mfa',
      jsonResponse,
    });
    if (rateLimitResponse) return rateLimitResponse;

    const body = await readClinicalJsonBody(req, 2_048).catch(() => ({}));
    const profileId = String(body.profileId || '').trim();
    const reason = String(body.reason || '').trim();

    if (!UUID_PATTERN.test(profileId)) {
      return jsonResponse({ error: 'Usuário alvo inválido.' }, 400);
    }
    if (profileId === caller.user.id) {
      return jsonResponse({
        error: 'O SuperAdm não pode remover o próprio segundo fator por este fluxo.',
      }, 400);
    }
    if (reason.length < 10 || reason.length > 500) {
      return jsonResponse({
        error: 'Registre uma justificativa de 10 a 500 caracteres.',
      }, 400);
    }

    const { data: target, error: targetError } = await supabaseAdmin
      .from('profiles')
      .select('id,role,is_active,mfa_required')
      .eq('id', profileId)
      .maybeSingle();

    if (targetError || !target) {
      return jsonResponse({ error: 'Usuário não encontrado.' }, 404);
    }
    if (target.role === 'super_admin') {
      return jsonResponse({
        error: 'A recuperação de outro SuperAdm exige procedimento externo de dupla conferência.',
      }, 400);
    }

    const auditAuthorized = await writeAuditLog(supabaseAdmin, {
      actorId: caller.user.id,
      targetId: profileId,
      action: 'mfa_recovery_authorized',
      details: { reason },
    });
    if (!auditAuthorized) {
      return jsonResponse({
        error: 'A recuperação foi bloqueada porque a autorização não pôde ser auditada.',
        referencia: correlationId,
      }, 503);
    }

    const { data: factorsData, error: factorsError } =
      await supabaseAdmin.auth.admin.mfa.listFactors({
        userId: profileId,
      });
    if (factorsError) {
      return jsonResponse({
        error: 'Não foi possível consultar os fatores; nenhuma exigência foi removida.',
        referencia: correlationId,
      }, 502);
    }

    const factors = factorsData?.factors || [];
    for (const factor of factors) {
      const { error: deleteError } =
        await supabaseAdmin.auth.admin.mfa.deleteFactor({
          userId: profileId,
          id: factor.id,
        });
      if (deleteError) {
        // Fail-closed: mfa_required continua true. O usuário permanece sem
        // acesso clínico até o SuperAdm repetir a recuperação.
        return jsonResponse({
          error: 'A remoção do fator não foi concluída; o acesso continua bloqueado.',
          referencia: correlationId,
        }, 502);
      }
    }

    await writeAuditLog(supabaseAdmin, {
      actorId: caller.user.id,
      targetId: profileId,
      action: 'mfa_recovery_completed',
      details: {
        removed_factors: factors.length,
        requirement_preserved: target.mfa_required === true,
      },
    });

    return jsonResponse({
      ok: true,
      removedFactors: factors.length,
      message: target.mfa_required
        ? 'Segundo fator removido. No próximo acesso, o usuário deverá cadastrar e verificar outro.'
        : 'Segundo fator removido.',
    });
  } catch {
    logOperationalEvent('error', 'mfa_recovery_failed', {
      correlationId,
      operation: 'mfa_recovery',
      reason: 'unexpected_failure',
    });
    return jsonResponse({
      error: 'Não foi possível concluir a recuperação do segundo fator.',
      referencia: correlationId,
    }, 500);
  }
});
