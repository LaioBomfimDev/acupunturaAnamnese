-- ==========================================================
-- TTL para senha temporária de primeiro acesso (auditoria de
-- segurança 2026-08-11, achado M3)
--
-- Até aqui, uma senha temporária (must_change_password = true) definida
-- pelo SuperAdm valia para sempre até ser usada — sem expiração. Esta
-- migration guarda QUANDO a senha temporária foi definida
-- (temporary_password_set_at); a Edge Function login-with-identifier
-- passa a recusar login (e revogar a sessão recém-criada) se a senha
-- temporária tiver mais de 7 dias sem ter sido trocada.
--
-- Contas já pendentes hoje (must_change_password=true e sem timestamp)
-- ganham o relógio a partir de AGORA, não retroativamente — ninguém é
-- bloqueado no instante em que esta migration roda.
-- ==========================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS temporary_password_set_at TIMESTAMPTZ;

UPDATE public.profiles
SET temporary_password_set_at = timezone('utc'::text, now())
WHERE must_change_password IS TRUE
  AND temporary_password_set_at IS NULL;

-- ----------------------------------------------------------
-- Verificação
-- ----------------------------------------------------------
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'temporary_password_set_at'
  ) AS coluna_criada;
