-- ============================================================
-- Áreas do profissional (12/11/2026, opção B escolhida pela administradora)
--
-- Problema encontrado em 12/11/2026: toda pessoa cadastrada nascia com
-- "acupuntura" nas áreas, mesmo sendo só nutricionista ou fisioterapeuta
-- (Laize de Santana: {acupuntura, nutricao}; Paulo Ricardo:
-- {acupuntura, fisioterapia}). Duas causas somadas:
--
--  1. normalize_profile_disciplines_not_null (20260723, refeita em
--     20260922d) injetava ARRAY['acupuntura'] sempre que disciplines
--     chegava NULL — e a criação de terapeuta manda NULL
--     (super-admin-create-user: `disciplines.length ? disciplines : null`).
--     Isso era herança da virada MTC → multidisciplinar, quando ninguém
--     podia perder o acesso que já tinha. Hoje só atrapalha.
--  2. Não existia NENHUMA tela nem RPC para corrigir depois: a lista de
--     áreas só aparecia ao criar, e só para clinic_admin. Por isso a
--     administradora "removia da ficha" e nada mudava — ela estava
--     editando a profissão, que não toca em disciplines.
--
-- O que esta migration faz:
--  * a normalização passa a dar só a área da profissão (ou NENHUMA área,
--    quando a profissão não mapeia). Nunca mais acupuntura automática;
--  * cria set_member_disciplines, para a administração da clínica ajustar
--    as áreas de quem já está cadastrado;
--  * corrige os dois cadastros citados. Denise Neves fica como está:
--    a acupuntura dela é de verdade (confirmado pela administradora em
--    12/11/2026).
--
-- NÃO mexe em quem já tem áreas gravadas além desses dois: tirar
-- acupuntura "de quem não é acupunturista" em massa pegaria a Denise.
--
-- Reverter: recriar a função como está em 20260922d, DROP da RPC nova, e
-- devolver 'acupuntura' aos dois perfis.
-- ============================================================

-- ----------------------------------------------------------
-- 1. Normalização sem acupuntura automática
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalize_profile_disciplines_not_null()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $normalize_profile_disciplines_not_null$
DECLARE
  v_profession_discipline TEXT;
BEGIN
  -- Recepção não atende: nunca herda área nem entra na agenda.
  IF NEW.role = 'receptionist' THEN
    NEW.disciplines := ARRAY[]::TEXT[];
    NEW.has_agenda := FALSE;
    RETURN NEW;
  END IF;

  -- Quem mandou a lista (inclusive vazia, de propósito) manda.
  IF NEW.disciplines IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_profession_discipline := CASE NEW.profession
    WHEN 'acupunturista' THEN 'acupuntura'
    WHEN 'fisioterapeuta' THEN 'fisioterapia'
    WHEN 'terapeuta_ocupacional' THEN 'fisioterapia'
    WHEN 'psicologo' THEN 'psicologia'
    WHEN 'nutricionista' THEN 'nutricao'
    ELSE NULL
  END;

  -- Só a área da profissão. Sem profissão mapeada, nasce SEM área: a
  -- administração escolhe depois em Gestão → Equipe. Antes caía em
  -- ARRAY['acupuntura'], que é o defeito que esta migration corrige.
  NEW.disciplines := CASE
    WHEN v_profession_discipline IS NULL THEN ARRAY[]::TEXT[]
    ELSE ARRAY[v_profession_discipline]::TEXT[]
  END;

  RETURN NEW;
END;
$normalize_profile_disciplines_not_null$;

REVOKE ALL ON FUNCTION public.normalize_profile_disciplines_not_null() FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------
-- 2. A administração ajusta as áreas de quem já está cadastrado
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_member_disciplines(
  p_profile_id UUID,
  p_disciplines TEXT[]
)
RETURNS TEXT[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $set_member_disciplines$
DECLARE
  v_actor_id UUID := auth.uid();
  v_actor_clinic UUID := public.user_clinic_id(auth.uid());
  v_target public.profiles%ROWTYPE;
  v_known TEXT[] := ARRAY['acupuntura', 'fisioterapia', 'psicologia', 'nutricao', 'neuropsicologia', 'aba'];
  v_clean TEXT[];
BEGIN
  IF NOT (public.is_clinic_admin(v_actor_id) OR public.is_super_admin(v_actor_id)) THEN
    RAISE EXCEPTION 'Acesso negado: só a administração da instituição altera as áreas.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_target FROM public.profiles WHERE id = p_profile_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuário não encontrado.' USING ERRCODE = '02000';
  END IF;

  IF NOT public.is_super_admin(v_actor_id) AND v_target.clinic_id IS DISTINCT FROM v_actor_clinic THEN
    RAISE EXCEPTION 'Só é possível alterar profissionais da própria instituição.'
      USING ERRCODE = '42501';
  END IF;

  IF v_target.role = 'receptionist' THEN
    RAISE EXCEPTION 'Recepção não atende paciente: não recebe área clínica.'
      USING ERRCODE = '42501';
  END IF;

  IF v_target.role = 'super_admin' THEN
    RAISE EXCEPTION 'Cadastro de SuperAdm não é alterado por esta função.'
      USING ERRCODE = '42501';
  END IF;

  -- Só o que existe, sem repetir, sempre na ordem fixa do catálogo (a
  -- tela mostra nessa ordem; não depende do que o aparelho mandou).
  SELECT coalesce(array_agg(d ORDER BY array_position(v_known, d)), ARRAY[]::TEXT[])
    INTO v_clean
  FROM (SELECT DISTINCT unnest(coalesce(p_disciplines, ARRAY[]::TEXT[])) AS d) s
  WHERE d = ANY (v_known);

  UPDATE public.profiles
  SET disciplines = v_clean,
      updated_at = timezone('utc'::text, now())
  WHERE id = p_profile_id;

  RETURN v_clean;
END;
$set_member_disciplines$;

REVOKE ALL ON FUNCTION public.set_member_disciplines(UUID, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_member_disciplines(UUID, TEXT[]) TO authenticated;

-- ----------------------------------------------------------
-- 3. Os dois cadastros errados (12/11/2026)
--    Por id, não por regra: a Denise tem acupuntura de verdade.
-- ----------------------------------------------------------
UPDATE public.profiles
SET disciplines = ARRAY['nutricao']::TEXT[],
    updated_at = timezone('utc'::text, now())
WHERE id = 'cd7cd287-9326-43e9-88c3-53428f7988d5'
  AND profession = 'nutricionista'
  AND disciplines @> ARRAY['acupuntura']::TEXT[];

UPDATE public.profiles
SET disciplines = ARRAY['fisioterapia']::TEXT[],
    updated_at = timezone('utc'::text, now())
WHERE id = '1bdd37c9-c791-47d7-bc21-9ae109f292a4'
  AND profession = 'fisioterapeuta'
  AND disciplines @> ARRAY['acupuntura']::TEXT[];

-- ----------------------------------------------------------
-- Verificação
-- ----------------------------------------------------------
SELECT
  (SELECT disciplines FROM public.profiles WHERE id = 'cd7cd287-9326-43e9-88c3-53428f7988d5')
    = ARRAY['nutricao']::TEXT[] AS laize_so_nutricao,
  (SELECT disciplines FROM public.profiles WHERE id = '1bdd37c9-c791-47d7-bc21-9ae109f292a4')
    = ARRAY['fisioterapia']::TEXT[] AS paulo_so_fisio,
  (SELECT disciplines @> ARRAY['acupuntura']::TEXT[] FROM public.profiles WHERE full_name ILIKE 'Denise%')
    AS denise_mantem_acupuntura,
  to_regprocedure('public.set_member_disciplines(uuid,text[])') IS NOT NULL AS rpc_existe,
  NOT has_function_privilege('anon', 'public.set_member_disciplines(uuid,text[])', 'EXECUTE') AS anon_fora;
