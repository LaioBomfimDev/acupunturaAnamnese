-- ==========================================================
-- Revogação de sessões após troca/reset de senha (auditoria de
-- segurança 2026-08-11, achado A2)
--
-- supabase-js não expõe um "invalidar todas as sessões deste user_id"
-- no Admin API (GoTrueAdminApi.signOut exige o JWT da própria sessão,
-- não serve para revogar de fora). O mecanismo real de revogação no
-- GoTrue é a tabela auth.sessions/auth.refresh_tokens: apagar as linhas
-- do usuário impede qualquer refresh futuro. Isso NÃO derruba
-- instantaneamente um access token de curta duração já emitido e ainda
-- não expirado (JWT é validado por assinatura, sem round-trip ao
-- GoTrue a cada request) — fecha a reutilização por refresh, que é o
-- vetor prático (sessão "esquecida"/roubada sobrevivendo à troca de
-- senha). Best-effort e defensivo: erro aqui nunca deve impedir a
-- troca de senha em si, que já aconteceu quando esta função é chamada.
-- ==========================================================

CREATE OR REPLACE FUNCTION public.revoke_user_sessions(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $revoke_user_sessions$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Acesso negado: revoke_user_sessions só pode ser chamada pelo servidor.'
      USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  BEGIN
    DELETE FROM auth.sessions WHERE user_id = p_user_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'revoke_user_sessions: falha ao limpar auth.sessions para %: %', p_user_id, SQLERRM;
  END;

  BEGIN
    DELETE FROM auth.refresh_tokens WHERE user_id = p_user_id::text;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'revoke_user_sessions: falha ao limpar auth.refresh_tokens para %: %', p_user_id, SQLERRM;
  END;
END;
$revoke_user_sessions$;

REVOKE ALL ON FUNCTION public.revoke_user_sessions(UUID) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------
-- Verificação
-- ----------------------------------------------------------
SELECT
  to_regprocedure('public.revoke_user_sessions(uuid)') IS NOT NULL AS funcao_criada,
  NOT has_function_privilege('authenticated', 'public.revoke_user_sessions(uuid)', 'EXECUTE') AS authenticated_bloqueado,
  NOT has_function_privilege('anon', 'public.revoke_user_sessions(uuid)', 'EXECUTE') AS anon_bloqueado;
