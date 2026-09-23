-- ==========================================================
-- Personalização da clínica pelo próprio clinic_admin
--
-- Problema: só o SuperAdm consegue trocar a cor da clínica (policy
-- clinics_admin_update exige is_super_admin). E a mesma cor serve pro
-- sistema E pro papel timbrado — a clínica não consegue, por exemplo,
-- usar rosa na interface e azul nos documentos.
--
-- Fix:
--   1. clinics.letterhead_color (NULL = timbrado segue brand_color, que
--      é o comportamento atual de todo mundo).
--   2. RPC clinic_admin_update_appearance: o clinic_admin altera SÓ as
--      duas cores da PRÓPRIA instituição. A policy de UPDATE da tabela
--      continua restrita ao SuperAdm — abrir a policy daria acesso a
--      nome/CNPJ/logo, e não é esse o pedido.
-- ==========================================================

ALTER TABLE public.clinics ADD COLUMN IF NOT EXISTS letterhead_color TEXT;

ALTER TABLE public.clinics DROP CONSTRAINT IF EXISTS clinics_letterhead_color_hex;
ALTER TABLE public.clinics
  ADD CONSTRAINT clinics_letterhead_color_hex
  CHECK (letterhead_color IS NULL OR letterhead_color ~ '^#[0-9A-Fa-f]{6}$');

CREATE OR REPLACE FUNCTION public.clinic_admin_update_appearance(
  p_brand_color TEXT,
  p_letterhead_color TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_clinic UUID := public.user_clinic_id(auth.uid());
  v_letterhead TEXT := NULLIF(TRIM(COALESCE(p_letterhead_color, '')), '');
BEGIN
  -- is_clinic_admin já exige conta ativa e senha trocada.
  IF NOT public.is_clinic_admin(v_actor_id) THEN
    RAISE EXCEPTION 'Acesso negado: só o administrador da clínica pode personalizar as cores.'
      USING ERRCODE = '42501';
  END IF;

  IF v_clinic IS NULL THEN
    RAISE EXCEPTION 'Seu usuário não está vinculado a uma instituição.'
      USING ERRCODE = '42501';
  END IF;

  IF p_brand_color IS NULL OR p_brand_color !~ '^#[0-9A-Fa-f]{6}$' THEN
    RAISE EXCEPTION 'Cor do sistema inválida.' USING ERRCODE = '22023';
  END IF;

  IF v_letterhead IS NOT NULL AND v_letterhead !~ '^#[0-9A-Fa-f]{6}$' THEN
    RAISE EXCEPTION 'Cor do papel timbrado inválida.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.clinics
  SET brand_color = UPPER(p_brand_color),
      letterhead_color = UPPER(v_letterhead)
  WHERE id = v_clinic;
END;
$$;

REVOKE ALL ON FUNCTION public.clinic_admin_update_appearance(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clinic_admin_update_appearance(TEXT, TEXT) TO authenticated;

-- ----------------------------------------------------------
-- Verificação
-- ----------------------------------------------------------
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clinics' AND column_name = 'letterhead_color'
  ) AS coluna_criada,
  to_regprocedure('public.clinic_admin_update_appearance(text,text)') IS NOT NULL AS rpc_criada,
  has_function_privilege('authenticated', 'public.clinic_admin_update_appearance(text,text)', 'EXECUTE') AS authenticated_pode_executar,
  NOT has_function_privilege('anon', 'public.clinic_admin_update_appearance(text,text)', 'EXECUTE') AS anon_bloqueado;
