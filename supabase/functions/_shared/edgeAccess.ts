export type VerifiedAuthClaims = {
  aal: string | null;
};

type EdgeAccessProfile = {
  is_active?: boolean;
  must_change_password?: boolean;
  mfa_required?: boolean;
};

export type EdgeAccessDecision =
  | { allowed: true }
  | {
    allowed: false;
    status: 403;
    error: string;
    reason: 'inactive' | 'password_change_required' | 'mfa_required';
  };

/**
 * Decodifica somente claims de um JWT que já passou por auth.getUser(token).
 * Não use este parser como verificação de assinatura ou antes do getUser.
 */
export function decodeVerifiedAuthClaims(token: string): VerifiedAuthClaims {
  try {
    const encodedPayload = token.split('.')[1];
    if (!encodedPayload) return { aal: null };
    const normalized = encodedPayload.replace(/-/g, '+').replace(/_/g, '/');
    const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
    const bytes = Uint8Array.from(
      atob(`${normalized}${padding}`),
      character => character.charCodeAt(0),
    );
    const payload = JSON.parse(
      new TextDecoder().decode(bytes),
    ) as Record<string, unknown>;
    return {
      aal: typeof payload.aal === 'string' ? payload.aal : null,
    };
  } catch {
    return { aal: null };
  }
}

export function assertEdgeAccess(
  profile: EdgeAccessProfile,
  claims: VerifiedAuthClaims,
): EdgeAccessDecision {
  if (profile.is_active !== true) {
    return {
      allowed: false,
      status: 403,
      error: 'Usuário suspenso.',
      reason: 'inactive',
    };
  }
  if (profile.must_change_password === true) {
    return {
      allowed: false,
      status: 403,
      error: 'Troque a senha temporária antes de acessar esta função.',
      reason: 'password_change_required',
    };
  }
  if (profile.mfa_required === true && claims.aal !== 'aal2') {
    return {
      allowed: false,
      status: 403,
      error: 'Conclua a autenticação em dois fatores antes de acessar esta função.',
      reason: 'mfa_required',
    };
  }
  return { allowed: true };
}
