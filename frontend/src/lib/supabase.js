// ============================================================
// Cliente Supabase — ponto central único de conexão
// Usado por AuthContext, services e qualquer componente que
// precise acessar o banco.
// ============================================================

import { createClient } from '@supabase/supabase-js';
import {
  assertSupabasePublicConfig,
  validateSupabasePublicConfig,
} from './supabaseConfig';
import { readLocalAuthenticatedUser } from './localAuthStorage';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const LOCAL_AUTH_FALLBACK_ENABLED =
  import.meta.env.DEV
  && import.meta.env.VITE_ENABLE_LOCAL_AUTH_FALLBACK === 'true';

const publicConfig = validateSupabasePublicConfig({
  supabaseUrl,
  supabaseAnonKey,
  production: import.meta.env.PROD,
});

if (import.meta.env.PROD) {
  assertSupabasePublicConfig({
    supabaseUrl,
    supabaseAnonKey,
    production: true,
  }, 'Configuração obrigatória do frontend ausente ou insegura');
} else if (!publicConfig.ok) {
  console.warn(
    `Configuração Supabase incompleta em desenvolvimento: ${publicConfig.issues.join(' ')}`
  );
}

const clientUrl = publicConfig.urlValid
  ? publicConfig.url
  : 'http://127.0.0.1:54321';
const clientAnonKey = publicConfig.anonKeyValid
  ? publicConfig.anonKey
  : 'development-anon-key-not-for-production';

export const supabase = createClient(clientUrl, clientAnonKey);

/**
 * Retorna o usuário autenticado pelo Supabase ou, exclusivamente em
 * desenvolvimento com opt-in, pelo login local.
 * Deve ser usado pelos services em vez de supabase.auth.getUser() diretamente.
 */
export async function getAuthenticatedUser() {
  const localUser = readLocalAuthenticatedUser({
    enabled: LOCAL_AUTH_FALLBACK_ENABLED,
  });
  if (localUser) return localUser;

  const { data: { user } } = await supabase.auth.getUser();
  return user;
}
