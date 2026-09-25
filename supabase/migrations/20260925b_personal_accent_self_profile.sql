-- ==========================================================
-- Cor da tela por profissional (com trava da instituição) e
-- ficha do próprio profissional (Gestão → Meu cadastro)
--
-- Pedido: o clinic_admin decide se a cor do sistema é FIXA para toda
-- a equipe ou se cada profissional pode escolher a cor da própria
-- tela; e todo profissional passa a conseguir corrigir os próprios
-- dados de cadastro sem depender do SuperAdm.
--
-- 1. clinics.personal_accent_allowed (FALSE = cor fixa, comportamento
--    atual de todo mundo; TRUE = cada um escolhe, a cor da clínica
--    vira só o padrão).
-- 2. profiles.accent_color (NULL = segue a cor da clínica). Vale só
--    para a TELA: documentos/papel timbrado continuam lendo a cor da
--    instituição (getClinicLetterheadColor).
-- 3. RPC clinic_admin_set_personal_accent: o clinic_admin liga/desliga
--    a escolha individual na PRÓPRIA instituição.
-- 4. RPC update_my_accent_color: a pessoa grava a cor da própria tela;
--    recusa quando a instituição travou a cor (voltar ao padrão, NULL,
--    é sempre permitido).
-- 5. RPC update_my_profile: a pessoa edita SÓ os próprios dados
--    pessoais (nome, telefone, documento, registro no conselho,
--    especialidades e endereço). Profissão, papel, clínica, áreas,
--    e-mail/login e observações internas ficam de fora: profissão
--    decide áreas liberadas quando `disciplines` está vazio (ver
--    resolveUserDisciplines), então não pode ser autoeditada.
--
-- profiles segue sem policy de UPDATE (REVOKE em 20260522): toda
-- escrita passa por RPC SECURITY DEFINER com lista fixa de colunas.
-- Reversível: DROP FUNCTION das três RPCs + DROP COLUMN das duas
-- colunas novas.
-- ==========================================================

ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS personal_accent_allowed BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.clinics.personal_accent_allowed IS
  'TRUE = cada profissional escolhe a cor da própria tela; FALSE = cor do sistema fixa para a equipe.';

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS accent_color TEXT;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_accent_color_hex;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_accent_color_hex
  CHECK (accent_color IS NULL OR accent_color ~ '^#[0-9A-Fa-f]{6}$');

COMMENT ON COLUMN public.profiles.accent_color IS
  'Cor da tela escolhida pela pessoa (NULL = segue a cor da clínica). Não afeta documentos.';

-- ----------------------------------------------------------
-- 3. Trava/liberação pela administração da clínica
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clinic_admin_set_personal_accent(p_allowed BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_clinic UUID := public.user_clinic_id(auth.uid());
BEGIN
  -- is_clinic_admin já exige conta ativa e senha trocada.
  IF NOT public.is_clinic_admin(v_actor_id) THEN
    RAISE EXCEPTION 'Acesso negado: só o administrador da clínica decide se a cor é fixa.'
      USING ERRCODE = '42501';
  END IF;

  IF v_clinic IS NULL THEN
    RAISE EXCEPTION 'Seu usuário não está vinculado a uma instituição.'
      USING ERRCODE = '42501';
  END IF;

  IF p_allowed IS NULL THEN
    RAISE EXCEPTION 'Informe se a cor é fixa ou livre.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.clinics
  SET personal_accent_allowed = p_allowed
  WHERE id = v_clinic;
END;
$$;

REVOKE ALL ON FUNCTION public.clinic_admin_set_personal_accent(BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clinic_admin_set_personal_accent(BOOLEAN) TO authenticated;

-- ----------------------------------------------------------
-- 4. Cor da própria tela
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_my_accent_color(p_color TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_clinic UUID;
  v_color TEXT := NULLIF(BTRIM(COALESCE(p_color, '')), '');
  v_allowed BOOLEAN;
BEGIN
  IF v_actor_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = v_actor_id
      AND p.is_active IS TRUE
      AND p.must_change_password IS NOT TRUE
  ) THEN
    RAISE EXCEPTION 'Acesso negado: conta inativa ou com troca de senha pendente.'
      USING ERRCODE = '42501';
  END IF;

  IF v_color IS NOT NULL AND v_color !~ '^#[0-9A-Fa-f]{6}$' THEN
    RAISE EXCEPTION 'Cor inválida.' USING ERRCODE = '22023';
  END IF;

  v_clinic := public.user_clinic_id(v_actor_id);

  -- Voltar à cor da clínica (NULL) é sempre permitido; escolher uma
  -- cor própria só quando a instituição liberou.
  IF v_color IS NOT NULL AND v_clinic IS NOT NULL THEN
    SELECT c.personal_accent_allowed
      INTO v_allowed
    FROM public.clinics c
    WHERE c.id = v_clinic;

    IF v_allowed IS NOT TRUE THEN
      RAISE EXCEPTION 'A instituição definiu uma cor fixa para toda a equipe.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  UPDATE public.profiles
  SET accent_color = UPPER(v_color)
  WHERE id = v_actor_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_my_accent_color(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_my_accent_color(TEXT) TO authenticated;

-- ----------------------------------------------------------
-- 5. Ficha do próprio profissional
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_my_profile(
  p_full_name TEXT,
  p_phone TEXT,
  p_document TEXT,
  p_professional_registration TEXT,
  p_specialty TEXT,
  p_endereco_cep TEXT,
  p_endereco_logradouro TEXT,
  p_endereco_numero TEXT,
  p_endereco_complemento TEXT,
  p_endereco_bairro TEXT,
  p_endereco_cidade TEXT,
  p_endereco_uf TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $update_my_profile$
DECLARE
  v_actor_id UUID := auth.uid();
  v_previous public.profiles%ROWTYPE;
  v_next public.profiles%ROWTYPE;
  v_uf TEXT := UPPER(NULLIF(BTRIM(COALESCE(p_endereco_uf, '')), ''));
  v_updated_fields TEXT[];
BEGIN
  SELECT *
    INTO v_previous
  FROM public.profiles
  WHERE id = v_actor_id;

  IF v_actor_id IS NULL
    OR NOT FOUND
    OR v_previous.is_active IS NOT TRUE
    OR v_previous.must_change_password IS TRUE THEN
    RAISE EXCEPTION 'Acesso negado: conta inativa ou com troca de senha pendente.'
      USING ERRCODE = '42501';
  END IF;

  IF NULLIF(BTRIM(p_full_name), '') IS NULL THEN
    RAISE EXCEPTION 'Informe o seu nome completo.' USING ERRCODE = '22023';
  END IF;

  IF length(BTRIM(p_full_name)) > 160
    OR length(COALESCE(p_phone, '')) > 40
    OR length(COALESCE(p_document, '')) > 40
    OR length(COALESCE(p_professional_registration, '')) > 60
    OR length(COALESCE(p_specialty, '')) > 600
    OR length(COALESCE(p_endereco_cep, '')) > 12
    OR length(COALESCE(p_endereco_logradouro, '')) > 200
    OR length(COALESCE(p_endereco_numero, '')) > 20
    OR length(COALESCE(p_endereco_complemento, '')) > 120
    OR length(COALESCE(p_endereco_bairro, '')) > 120
    OR length(COALESCE(p_endereco_cidade, '')) > 120 THEN
    RAISE EXCEPTION 'Algum campo passou do tamanho permitido.' USING ERRCODE = '22023';
  END IF;

  IF v_uf IS NOT NULL AND v_uf !~ '^[A-Z]{2}$' THEN
    RAISE EXCEPTION 'UF inválida.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles
  SET
    full_name = NULLIF(BTRIM(p_full_name), ''),
    phone = NULLIF(BTRIM(p_phone), ''),
    document = NULLIF(BTRIM(p_document), ''),
    professional_registration = NULLIF(BTRIM(p_professional_registration), ''),
    specialty = NULLIF(BTRIM(p_specialty), ''),
    endereco_cep = NULLIF(BTRIM(p_endereco_cep), ''),
    endereco_logradouro = NULLIF(BTRIM(p_endereco_logradouro), ''),
    endereco_numero = NULLIF(BTRIM(p_endereco_numero), ''),
    endereco_complemento = NULLIF(BTRIM(p_endereco_complemento), ''),
    endereco_bairro = NULLIF(BTRIM(p_endereco_bairro), ''),
    endereco_cidade = NULLIF(BTRIM(p_endereco_cidade), ''),
    endereco_uf = v_uf
  WHERE id = v_actor_id
  RETURNING * INTO v_next;

  v_updated_fields := ARRAY_REMOVE(ARRAY[
    CASE WHEN v_previous.full_name IS DISTINCT FROM v_next.full_name THEN 'full_name' END,
    CASE WHEN v_previous.phone IS DISTINCT FROM v_next.phone THEN 'phone' END,
    CASE WHEN v_previous.document IS DISTINCT FROM v_next.document THEN 'document' END,
    CASE WHEN v_previous.professional_registration IS DISTINCT FROM v_next.professional_registration THEN 'professional_registration' END,
    CASE WHEN v_previous.specialty IS DISTINCT FROM v_next.specialty THEN 'specialty' END,
    CASE WHEN v_previous.endereco_cep IS DISTINCT FROM v_next.endereco_cep
      OR v_previous.endereco_logradouro IS DISTINCT FROM v_next.endereco_logradouro
      OR v_previous.endereco_numero IS DISTINCT FROM v_next.endereco_numero
      OR v_previous.endereco_complemento IS DISTINCT FROM v_next.endereco_complemento
      OR v_previous.endereco_bairro IS DISTINCT FROM v_next.endereco_bairro
      OR v_previous.endereco_cidade IS DISTINCT FROM v_next.endereco_cidade
      OR v_previous.endereco_uf IS DISTINCT FROM v_next.endereco_uf THEN 'endereco' END
  ], NULL);

  -- Mesma trilha do admin_update_profile, com ação própria para dar
  -- pra distinguir no log quem corrigiu o próprio cadastro.
  IF COALESCE(ARRAY_LENGTH(v_updated_fields, 1), 0) > 0 THEN
    INSERT INTO public.admin_audit_logs (actor_id, target_id, action, details)
    VALUES (
      v_actor_id,
      v_actor_id,
      'profile_self_updated',
      jsonb_build_object('updated_fields', to_jsonb(v_updated_fields))
    );
  END IF;
END;
$update_my_profile$;

REVOKE ALL ON FUNCTION public.update_my_profile(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_my_profile(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- ----------------------------------------------------------
-- Verificação
-- ----------------------------------------------------------
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clinics' AND column_name = 'personal_accent_allowed'
  ) AS coluna_trava_criada,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'accent_color'
  ) AS coluna_cor_pessoal_criada,
  to_regprocedure('public.clinic_admin_set_personal_accent(boolean)') IS NOT NULL AS rpc_trava,
  to_regprocedure('public.update_my_accent_color(text)') IS NOT NULL AS rpc_cor_pessoal,
  to_regprocedure('public.update_my_profile(text,text,text,text,text,text,text,text,text,text,text,text)') IS NOT NULL AS rpc_ficha,
  NOT has_function_privilege('anon', 'public.update_my_profile(text,text,text,text,text,text,text,text,text,text,text,text)', 'EXECUTE') AS anon_bloqueado;
