-- ==========================================================
-- Log de acessos (login/logout) por instituição
--
-- Tabela NOVA e isolada, não reaproveita admin_audit_logs: aquela já
-- passou por hardening dedicado (imutabilidade, auditoria 2026-08-11) e
-- é escopo exclusivo de ações de SuperAdm, sem coluna de clínica — mexer
-- nela para caber login/logout de qualquer perfil arriscaria regressão
-- num lugar que já foi endurecido. Aqui é módulo próprio, mesmo espírito
-- do comentário em 20260809_appointments.sql ("cada um com o seu
-- escopo").
--
-- Mesmo padrão de admin_audit_logs: RLS ligada, GRANT nenhum para
-- anon/authenticated — grava só quem tem client de service-role (Edge
-- Function), lê só via RPC SECURITY DEFINER com o próprio gate dentro.
-- Trigger de imutabilidade reaproveita a função já existente (nenhuma
-- lógica nova, mesmo texto de erro do log administrativo).
-- ==========================================================

CREATE TABLE IF NOT EXISTS public.clinic_access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('login', 'logout')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_clinic_access_logs_clinic_created
  ON public.clinic_access_logs (clinic_id, created_at DESC);

ALTER TABLE public.clinic_access_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.clinic_access_logs FROM anon, authenticated;

DROP TRIGGER IF EXISTS clinic_access_logs_reject_mutation
  ON public.clinic_access_logs;
CREATE TRIGGER clinic_access_logs_reject_mutation
  BEFORE UPDATE OR DELETE
  ON public.clinic_access_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_immutable_clinical_log_mutation();

-- ----------------------------------------------------------
-- Leitura: só admin da própria clínica (ou SuperAdm)
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clinic_list_access_logs(p_limit INTEGER DEFAULT 100)
RETURNS TABLE (
  id UUID,
  actor_id UUID,
  actor_name TEXT,
  action TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $clinic_list_access_logs$
DECLARE
  v_clinic UUID := public.user_clinic_id(auth.uid());
BEGIN
  -- Sem instituição não há o que listar — devolve vazio, não erro,
  -- mesmo espírito de list_clinic_members.
  IF v_clinic IS NULL THEN
    RETURN;
  END IF;

  IF NOT (
    public.is_super_admin()
    OR (public.can_manage_agenda(v_clinic) AND public.is_clinic_admin())
  ) THEN
    RAISE EXCEPTION 'Acesso negado: apenas administrador desta instituição pode ver os acessos.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    l.id,
    l.actor_id,
    p.full_name AS actor_name,
    l.action,
    l.created_at
  FROM public.clinic_access_logs l
  LEFT JOIN public.profiles p ON p.id = l.actor_id
  WHERE l.clinic_id = v_clinic
  ORDER BY l.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);
END;
$clinic_list_access_logs$;

REVOKE ALL ON FUNCTION public.clinic_list_access_logs(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clinic_list_access_logs(INTEGER) TO authenticated;

-- ----------------------------------------------------------
-- Verificação
-- ----------------------------------------------------------
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'clinic_access_logs'
  ) AS tabela_criada,
  EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'clinic_access_logs_reject_mutation'
      AND tgrelid = 'public.clinic_access_logs'::regclass
      AND NOT tgisinternal
  ) AS trigger_criado,
  EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'clinic_list_access_logs'
  ) AS rpc_criada;
