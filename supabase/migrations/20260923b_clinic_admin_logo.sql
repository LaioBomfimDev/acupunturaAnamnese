-- ==========================================================
-- Logo da clínica pelo próprio clinic_admin (Gestão → Personalizar)
--
-- Mesmo desenho de clinic_admin_update_appearance (20260923): a
-- policy de UPDATE de clinics continua só do SuperAdm; esta RPC mexe
-- APENAS em logo_url + logo_watermark da PRÓPRIA instituição.
--
-- O logo é data URL na própria linha (20260614_clinic_logo). Pro
-- clinic_admin só aceitamos bitmap (PNG/JPEG/WEBP) em base64 — o
-- frontend rasteriza SVG antes de enviar — e com teto de tamanho, pra
-- ninguém inflar a linha de clinics nem subir SVG com conteúdo ativo.
-- ==========================================================

CREATE OR REPLACE FUNCTION public.clinic_admin_update_logo(
  p_logo_url TEXT,
  p_logo_watermark BOOLEAN DEFAULT TRUE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_clinic UUID := public.user_clinic_id(auth.uid());
  v_logo TEXT := NULLIF(TRIM(COALESCE(p_logo_url, '')), '');
BEGIN
  -- is_clinic_admin já exige conta ativa e senha trocada.
  IF NOT public.is_clinic_admin(v_actor_id) THEN
    RAISE EXCEPTION 'Acesso negado: só o administrador da clínica pode trocar o logo.'
      USING ERRCODE = '42501';
  END IF;

  IF v_clinic IS NULL THEN
    RAISE EXCEPTION 'Seu usuário não está vinculado a uma instituição.'
      USING ERRCODE = '42501';
  END IF;

  IF v_logo IS NOT NULL THEN
    IF length(v_logo) > 300000 THEN
      RAISE EXCEPTION 'Logo muito grande. Use uma imagem menor.' USING ERRCODE = '22023';
    END IF;
    IF v_logo !~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$' THEN
      RAISE EXCEPTION 'Formato de logo inválido. Envie PNG, JPG ou WEBP.' USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE public.clinics
  SET logo_url = v_logo,
      logo_watermark = COALESCE(p_logo_watermark, TRUE)
  WHERE id = v_clinic;
END;
$$;

REVOKE ALL ON FUNCTION public.clinic_admin_update_logo(TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clinic_admin_update_logo(TEXT, BOOLEAN) TO authenticated;

-- ----------------------------------------------------------
-- Verificação
-- ----------------------------------------------------------
SELECT
  to_regprocedure('public.clinic_admin_update_logo(text,boolean)') IS NOT NULL AS rpc_criada,
  has_function_privilege('authenticated', 'public.clinic_admin_update_logo(text,boolean)', 'EXECUTE') AS authenticated_pode_executar,
  NOT has_function_privilege('anon', 'public.clinic_admin_update_logo(text,boolean)', 'EXECUTE') AS anon_bloqueado;
