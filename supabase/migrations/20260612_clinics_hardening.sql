-- ============================================================
-- CLÍNICAS: hardening pós-migração inicial
-- - leitura restrita ao SuperAdm ou ao profissional vinculado;
-- - RPC de vínculo valida clínica antes de atualizar o perfil.
--
-- Esta migration é incremental porque 20260612_clinics.sql já foi
-- executada manualmente no Supabase.
-- ============================================================

DROP POLICY IF EXISTS clinics_select_authenticated ON public.clinics;
DROP POLICY IF EXISTS clinics_select_assigned_or_super_admin ON public.clinics;

CREATE POLICY clinics_select_assigned_or_super_admin ON public.clinics
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.clinic_id = clinics.id
        AND public.can_access_clinical_data(auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION public.admin_set_profile_clinic(
  p_profile_id UUID,
  p_clinic_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado: apenas super administradores.'
      USING ERRCODE = '42501';
  END IF;

  IF p_clinic_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.clinics c WHERE c.id = p_clinic_id) THEN
    RAISE EXCEPTION 'Clínica não encontrada.'
      USING ERRCODE = '23503';
  END IF;

  UPDATE public.profiles
  SET clinic_id = p_clinic_id,
      updated_at = NOW()
  WHERE id = p_profile_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_profile_clinic(UUID, UUID) TO authenticated;
