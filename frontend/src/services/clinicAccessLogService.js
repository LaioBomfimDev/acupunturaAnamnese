// ============================================================
// SERVICE: Log de acessos (login/logout) da instituição
// Migração: supabase/migrations/20260901_clinic_access_logs.sql
//
// Só leitura por aqui — quem grava é o próprio backend (Edge Functions
// login-with-identifier e log-logout, via service-role). O RPC já
// recusa quem não é admin desta clínica; não há gate a duplicar aqui.
// ============================================================

import { supabase, getAuthenticatedUser } from '../lib/supabase';

function isMissingAccessLogError(error) {
  const text = [error?.message, error?.details, error?.hint, error?.code]
    .filter(Boolean)
    .join(' ');
  return /clinic_list_access_logs|clinic_access_logs/.test(text)
    && /does not exist|schema cache|Could not find|PGRST202/i.test(text);
}

export async function listClinicAccessLogs({ limit = 100 } = {}) {
  const user = await getAuthenticatedUser();

  // Login local (dev fallback) nunca passa pelas Edge Functions que
  // gravam este log — não há o que mostrar.
  if (user?._isLocal) return [];

  const { data, error } = await supabase.rpc('clinic_list_access_logs', {
    p_limit: limit,
  });

  if (error) {
    if (isMissingAccessLogError(error)) {
      throw new Error(
        'Log de acessos ausente no banco. Aplique a migração ' +
        'supabase/migrations/20260901_clinic_access_logs.sql no Supabase.'
      );
    }
    throw new Error(error.message || 'Não foi possível carregar os acessos.');
  }

  return data || [];
}
