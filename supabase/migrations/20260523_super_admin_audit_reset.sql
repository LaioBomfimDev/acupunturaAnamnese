-- ==========================================================
-- Auditoria do SuperAdm e suporte a reset de senha temporária
-- ==========================================================

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  target_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS admin_audit_logs_created_at_idx
ON public.admin_audit_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS admin_audit_logs_actor_id_idx
ON public.admin_audit_logs (actor_id);

CREATE INDEX IF NOT EXISTS admin_audit_logs_target_id_idx
ON public.admin_audit_logs (target_id);

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_audit_logs FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_audit_logs(p_limit INTEGER DEFAULT 60)
RETURNS TABLE (
  id UUID,
  actor_id UUID,
  actor_name TEXT,
  actor_email TEXT,
  target_id UUID,
  target_name TEXT,
  target_email TEXT,
  action TEXT,
  details JSONB,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $admin_list_audit_logs$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado: apenas SuperAdm ativo pode ver auditoria.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    l.id,
    l.actor_id,
    actor.full_name AS actor_name,
    actor.email AS actor_email,
    l.target_id,
    target_profile.full_name AS target_name,
    target_profile.email AS target_email,
    l.action,
    l.details,
    l.created_at
  FROM public.admin_audit_logs l
  LEFT JOIN public.profiles actor ON actor.id = l.actor_id
  LEFT JOIN public.profiles target_profile ON target_profile.id = l.target_id
  ORDER BY l.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 60), 1), 200);
END;
$admin_list_audit_logs$;

REVOKE EXECUTE ON FUNCTION public.admin_list_audit_logs(INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_list_audit_logs(INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_profile_active(
  p_profile_id UUID,
  p_is_active BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $admin_set_profile_active$
DECLARE
  v_actor_id UUID;
  v_previous_active BOOLEAN;
BEGIN
  v_actor_id := auth.uid();

  IF NOT public.is_super_admin(v_actor_id) THEN
    RAISE EXCEPTION 'Acesso negado: apenas SuperAdm ativo pode alterar status.'
      USING ERRCODE = '42501';
  END IF;

  IF p_profile_id = v_actor_id AND p_is_active IS FALSE THEN
    RAISE EXCEPTION 'O SuperAdm não pode suspender o próprio acesso.'
      USING ERRCODE = '22023';
  END IF;

  SELECT is_active
    INTO v_previous_active
  FROM public.profiles
  WHERE id = p_profile_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuário não encontrado.'
      USING ERRCODE = '02000';
  END IF;

  UPDATE public.profiles
  SET is_active = p_is_active
  WHERE id = p_profile_id;

  INSERT INTO public.admin_audit_logs (actor_id, target_id, action, details)
  VALUES (
    v_actor_id,
    p_profile_id,
    CASE WHEN p_is_active THEN 'profile_reactivated' ELSE 'profile_suspended' END,
    jsonb_build_object('previous_active', v_previous_active, 'next_active', p_is_active)
  );
END;
$admin_set_profile_active$;

GRANT EXECUTE ON FUNCTION public.admin_set_profile_active(UUID, BOOLEAN) TO authenticated;
