import { createCorrelationId, logOperationalEvent } from './observability.ts';

type AuditPayload = {
  actorId?: string | null;
  targetId?: string | null;
  action: string;
  details?: Record<string, unknown>;
};

type AuditInsertResult = {
  error?: {
    code?: unknown;
  } | null;
};

type AuditClient = {
  from: (table: string) => {
    insert: (values: Record<string, unknown>) => Promise<AuditInsertResult>;
  };
};

function safeErrorCode(error: unknown) {
  if (!error || typeof error !== 'object' || !('code' in error)) return undefined;
  const code = String((error as { code?: unknown }).code || '').trim();
  return /^[A-Za-z0-9._:-]{1,96}$/.test(code) ? code : undefined;
}

/**
 * Auditoria é best effort: algumas chamadas ocorrem depois de uma mutação que
 * não pode ser revertida. O retorno booleano torna a falha observável sem
 * responder 500 e induzir o cliente a repetir a mutação concluída.
 */
export async function writeAuditLog(
  supabaseAdmin: unknown,
  payload: AuditPayload,
): Promise<boolean> {
  const correlationId = createCorrelationId();

  try {
    const result = await (supabaseAdmin as AuditClient)
      .from('admin_audit_logs')
      .insert({
        actor_id: payload.actorId || null,
        target_id: payload.targetId || null,
        action: payload.action,
        details: payload.details || {},
      });

    if (result?.error) {
      logOperationalEvent('error', 'admin_audit_write_failed', {
        correlationId,
        operation: 'admin_audit_insert',
        action: payload.action,
        reason: 'sdk_error',
        errorCode: safeErrorCode(result.error),
      });
      return false;
    }

    return true;
  } catch (error) {
    logOperationalEvent('error', 'admin_audit_write_failed', {
      correlationId,
      operation: 'admin_audit_insert',
      action: payload.action,
      reason: 'exception',
      errorCode: safeErrorCode(error),
    });
    return false;
  }
}

type ClinicAccessPayload = {
  clinicId: string;
  actorId: string;
  action: 'login' | 'logout';
};

/**
 * Log de login/logout por instituição (clinic_access_logs) — tabela
 * própria, não admin_audit_logs (ver comentário na migration). Mesmo
 * espírito best-effort: nunca deve derrubar o login nem o logout.
 */
export async function writeClinicAccessLog(
  supabaseAdmin: unknown,
  payload: ClinicAccessPayload,
): Promise<boolean> {
  const correlationId = createCorrelationId();

  try {
    const result = await (supabaseAdmin as AuditClient)
      .from('clinic_access_logs')
      .insert({
        clinic_id: payload.clinicId,
        actor_id: payload.actorId,
        action: payload.action,
      });

    if (result?.error) {
      logOperationalEvent('error', 'clinic_access_write_failed', {
        correlationId,
        operation: 'clinic_access_insert',
        action: payload.action,
        reason: 'sdk_error',
        errorCode: safeErrorCode(result.error),
      });
      return false;
    }

    return true;
  } catch (error) {
    logOperationalEvent('error', 'clinic_access_write_failed', {
      correlationId,
      operation: 'clinic_access_insert',
      action: payload.action,
      reason: 'exception',
      errorCode: safeErrorCode(error),
    });
    return false;
  }
}
