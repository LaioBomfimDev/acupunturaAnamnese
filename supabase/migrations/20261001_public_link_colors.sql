-- ==========================================================
-- Cor dos links enviados ao paciente
--
-- Problema: as duas páginas públicas (confirmação de agendamento e
-- pesquisa de satisfação) vestem clinics.brand_color, a cor da TELA do
-- sistema. A instituição quer escolher a cor que o paciente vê em cada
-- link, separada da tela.
--
-- Fix:
--   1. clinics.confirmation_link_color e clinics.survey_link_color
--      (NULL = o link segue brand_color, que é o comportamento atual de
--      todo mundo). Lidas pelas Edge Functions confirm-appointment e
--      satisfaction-survey.
--   2. RPC clinic_admin_update_link_colors: o clinic_admin altera SÓ as
--      duas cores dos links da PRÓPRIA instituição. A policy de UPDATE
--      da tabela continua restrita ao SuperAdm — mesmo desenho de
--      clinic_admin_update_appearance (20260923).
--
-- Aditiva: nenhuma linha existente muda de significado.
-- ==========================================================

ALTER TABLE public.clinics ADD COLUMN IF NOT EXISTS confirmation_link_color TEXT;
ALTER TABLE public.clinics ADD COLUMN IF NOT EXISTS survey_link_color TEXT;

ALTER TABLE public.clinics DROP CONSTRAINT IF EXISTS clinics_confirmation_link_color_hex;
ALTER TABLE public.clinics
  ADD CONSTRAINT clinics_confirmation_link_color_hex
  CHECK (confirmation_link_color IS NULL OR confirmation_link_color ~ '^#[0-9A-Fa-f]{6}$');

ALTER TABLE public.clinics DROP CONSTRAINT IF EXISTS clinics_survey_link_color_hex;
ALTER TABLE public.clinics
  ADD CONSTRAINT clinics_survey_link_color_hex
  CHECK (survey_link_color IS NULL OR survey_link_color ~ '^#[0-9A-Fa-f]{6}$');

COMMENT ON COLUMN public.clinics.confirmation_link_color IS
  'Cor da página pública de confirmação de agendamento. NULL = segue brand_color.';
COMMENT ON COLUMN public.clinics.survey_link_color IS
  'Cor da página pública da pesquisa de satisfação. NULL = segue brand_color.';

CREATE OR REPLACE FUNCTION public.clinic_admin_update_link_colors(
  p_confirmation_color TEXT DEFAULT NULL,
  p_survey_color TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_clinic UUID := public.user_clinic_id(auth.uid());
  v_confirmation TEXT := NULLIF(TRIM(COALESCE(p_confirmation_color, '')), '');
  v_survey TEXT := NULLIF(TRIM(COALESCE(p_survey_color, '')), '');
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

  IF v_confirmation IS NOT NULL AND v_confirmation !~ '^#[0-9A-Fa-f]{6}$' THEN
    RAISE EXCEPTION 'Cor da confirmação de agendamento inválida.' USING ERRCODE = '22023';
  END IF;

  IF v_survey IS NOT NULL AND v_survey !~ '^#[0-9A-Fa-f]{6}$' THEN
    RAISE EXCEPTION 'Cor da pesquisa de satisfação inválida.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.clinics
  SET confirmation_link_color = UPPER(v_confirmation),
      survey_link_color = UPPER(v_survey)
  WHERE id = v_clinic;
END;
$$;

REVOKE ALL ON FUNCTION public.clinic_admin_update_link_colors(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clinic_admin_update_link_colors(TEXT, TEXT) TO authenticated;

-- ----------------------------------------------------------
-- Verificação
-- ----------------------------------------------------------
SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clinics'
      AND column_name IN ('confirmation_link_color', 'survey_link_color')) = 2 AS colunas_criadas,
  to_regprocedure('public.clinic_admin_update_link_colors(text,text)') IS NOT NULL AS rpc_criada,
  has_function_privilege('authenticated', 'public.clinic_admin_update_link_colors(text,text)', 'EXECUTE') AS authenticated_pode_executar,
  NOT has_function_privilege('anon', 'public.clinic_admin_update_link_colors(text,text)', 'EXECUTE') AS anon_bloqueado;
