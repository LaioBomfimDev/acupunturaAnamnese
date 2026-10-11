-- ==========================================================
-- Cor da Área do Paciente (formulários e escalas)
-- REQUER: 20261001_public_link_colors (já aplicada).
--
-- Pedido da administradora (09/10/2026): a página onde o paciente
-- responde os formulários e as escalas entra na mesma escolha de
-- Gestão → Personalizar que a confirmação de agendamento e a pesquisa
-- de satisfação já têm: segue a cor da clínica ou uma cor própria.
--
-- Fix:
--   1. clinics.portal_link_color (NULL = segue brand_color, que é o
--      comportamento de hoje). Lida pela Edge Function patient-portal.
--   2. clinic_admin_update_link_colors ganha p_portal_color. A função é
--      a de 20261001 com a terceira cor; o novo parâmetro tem DEFAULT
--      NULL, então a tela antiga (duas cores) continua chamando.
--
-- Aditiva: nenhuma linha existente muda de significado.
-- Reverter: recriar clinic_admin_update_link_colors(TEXT, TEXT) a partir
-- de 20261001, DROP da versão de três parâmetros, DROP da coluna.
-- ==========================================================

DO $requires$
BEGIN
  IF to_regprocedure('public.clinic_admin_update_link_colors(text,text)') IS NULL
     AND to_regprocedure('public.clinic_admin_update_link_colors(text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'Aplique antes 20261001_public_link_colors.sql.';
  END IF;
END;
$requires$;

ALTER TABLE public.clinics ADD COLUMN IF NOT EXISTS portal_link_color TEXT;

ALTER TABLE public.clinics DROP CONSTRAINT IF EXISTS clinics_portal_link_color_hex;
ALTER TABLE public.clinics
  ADD CONSTRAINT clinics_portal_link_color_hex
  CHECK (portal_link_color IS NULL OR portal_link_color ~ '^#[0-9A-Fa-f]{6}$');

COMMENT ON COLUMN public.clinics.portal_link_color IS
  'Cor da Área do Paciente (formulários e escalas). NULL = segue brand_color.';

DROP FUNCTION IF EXISTS public.clinic_admin_update_link_colors(TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.clinic_admin_update_link_colors(
  p_confirmation_color TEXT DEFAULT NULL,
  p_survey_color TEXT DEFAULT NULL,
  p_portal_color TEXT DEFAULT NULL
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
  v_portal TEXT := NULLIF(TRIM(COALESCE(p_portal_color, '')), '');
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

  IF v_portal IS NOT NULL AND v_portal !~ '^#[0-9A-Fa-f]{6}$' THEN
    RAISE EXCEPTION 'Cor da Área do Paciente inválida.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.clinics
  SET confirmation_link_color = UPPER(v_confirmation),
      survey_link_color = UPPER(v_survey),
      portal_link_color = UPPER(v_portal)
  WHERE id = v_clinic;
END;
$$;

REVOKE ALL ON FUNCTION public.clinic_admin_update_link_colors(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clinic_admin_update_link_colors(TEXT, TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ----------------------------------------------------------
-- Verificação
-- ----------------------------------------------------------
SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clinics'
      AND column_name = 'portal_link_color') = 1 AS coluna_criada,
  to_regprocedure('public.clinic_admin_update_link_colors(text,text,text)') IS NOT NULL AS rpc_criada,
  to_regprocedure('public.clinic_admin_update_link_colors(text,text)') IS NULL AS sem_versao_antiga,
  has_function_privilege('authenticated', 'public.clinic_admin_update_link_colors(text,text,text)', 'EXECUTE') AS authenticated_pode_executar,
  NOT has_function_privilege('anon', 'public.clinic_admin_update_link_colors(text,text,text)', 'EXECUTE') AS anon_bloqueado;
