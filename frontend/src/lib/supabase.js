// ============================================================
// Cliente Supabase — ponto central único de conexão
// Usado por AuthContext, services e qualquer componente que
// precise acessar o banco.
// ============================================================

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '⚠️ Supabase URL ou Anon Key não configurados. Verifique o arquivo .env.local.'
  );
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');

/**
 * Retorna o usuário autenticado — seja via Supabase real ou via login local (mock).
 * Deve ser usado pelos services em vez de supabase.auth.getUser() diretamente.
 */
export async function getAuthenticatedUser() {
  // 1. Verifica se há um usuário local (fallback de login)
  const LOCAL_USER_KEY = 'acup_local_user';
  const savedLocal = localStorage.getItem(LOCAL_USER_KEY);
  if (savedLocal) {
    try {
      return JSON.parse(savedLocal);
    } catch { /* ignora JSON inválido */ }
  }

  // 2. Consulta o Supabase
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

