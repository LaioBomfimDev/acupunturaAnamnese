-- ============================================================
-- CLÍNICAS: cadastro institucional + vínculo com profissionais
-- Usado pelo papel timbrado dos relatórios (nome, CNPJ, endereço
-- e cor da marca) e pela relação paciente → profissional → clínica.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.clinics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  legal_name TEXT,
  cnpj TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  brand_color TEXT NOT NULL DEFAULT '#0E2A4A',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_clinic_id ON public.profiles(clinic_id);

-- updated_at automático
CREATE OR REPLACE FUNCTION public.set_clinics_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clinics_updated_at ON public.clinics;
CREATE TRIGGER trg_clinics_updated_at
  BEFORE UPDATE ON public.clinics
  FOR EACH ROW EXECUTE FUNCTION public.set_clinics_updated_at();

-- ============================================================
-- RLS: qualquer usuário autenticado lê (precisa para o relatório);
-- somente super admin cria/edita/remove.
-- ============================================================

ALTER TABLE public.clinics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clinics_select_authenticated ON public.clinics;
CREATE POLICY clinics_select_authenticated ON public.clinics
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS clinics_admin_insert ON public.clinics;
CREATE POLICY clinics_admin_insert ON public.clinics
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS clinics_admin_update ON public.clinics;
CREATE POLICY clinics_admin_update ON public.clinics
  FOR UPDATE TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS clinics_admin_delete ON public.clinics;
CREATE POLICY clinics_admin_delete ON public.clinics
  FOR DELETE TO authenticated
  USING (public.is_super_admin(auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinics TO authenticated;

-- ============================================================
-- RPC: vincular profissional a uma clínica (somente super admin)
-- ============================================================

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
    RAISE EXCEPTION 'Acesso negado: apenas super administradores.';
  END IF;

  UPDATE public.profiles
  SET clinic_id = p_clinic_id,
      updated_at = NOW()
  WHERE id = p_profile_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_profile_clinic(UUID, UUID) TO authenticated;
