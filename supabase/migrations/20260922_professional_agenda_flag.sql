-- ==========================================================
-- Quem aparece na agenda como profissional
--
-- Problema: hoje TODO membro ativo da clínica (inclusive quem é só
-- administrativo, como um clinic_admin que não atende paciente) aparece
-- como opção de profissional no formulário de agendamento e nos chips
-- de filtro da Agenda. Um admin puro marcado sem querer como
-- profissional de uma sessão gera um agendamento que ninguém vai
-- atender de verdade.
--
-- Fix: campo has_agenda em profiles (default TRUE — não muda o
-- comportamento de ninguém hoje) + RPC pro clinic_admin da própria
-- instituição decidir, por pessoa, quem atende. SuperAdm mantém acesso
-- irrestrito (suporte).
-- ==========================================================

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS has_agenda BOOLEAN NOT NULL DEFAULT true;

-- ----------------------------------------------------------
-- list_clinic_members passa a devolver has_agenda — é o que a Agenda e
-- a nova aba de Gestão usam pra decidir quem entra nos chips/seletor.
-- ----------------------------------------------------------
DROP FUNCTION IF EXISTS public.list_clinic_members(UUID);

CREATE OR REPLACE FUNCTION public.list_clinic_members(p_clinic UUID DEFAULT NULL)
RETURNS TABLE (
  id UUID,
  full_name TEXT,
  profession TEXT,
  role TEXT,
  disciplines TEXT[],
  is_active BOOLEAN,
  has_agenda BOOLEAN
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic UUID := COALESCE(p_clinic, public.user_clinic_id(auth.uid()));
BEGIN
  IF v_clinic IS NULL THEN
    RETURN;
  END IF;

  IF NOT (public.can_manage_agenda(v_clinic) OR public.is_super_admin()) THEN
    RAISE EXCEPTION 'Sem permissão para listar a equipe desta instituição.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.full_name,
    p.profession,
    p.role,
    p.disciplines,
    p.is_active,
    p.has_agenda
  FROM public.profiles p
  WHERE p.clinic_id = v_clinic
    AND p.is_active IS TRUE
  ORDER BY COALESCE(NULLIF(TRIM(p.full_name), ''), 'zzz'), p.id;
END;
$$;

REVOKE ALL ON FUNCTION public.list_clinic_members(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_clinic_members(UUID) TO authenticated;

-- ----------------------------------------------------------
-- set_member_has_agenda: única forma de mudar o campo. `profiles` não
-- tem policy de UPDATE pra ninguém além de si mesmo — sem esta RPC o
-- clinic_admin não tem como alterar a linha de um colega (mesmo padrão
-- de admin_update_profile / admin_set_profile_role, mas escopado à
-- PRÓPRIA clínica em vez de exigir SuperAdm).
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_member_has_agenda(p_profile_id UUID, p_has_agenda BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_actor_clinic UUID := public.user_clinic_id(auth.uid());
  v_target public.profiles%ROWTYPE;
BEGIN
  IF NOT (public.is_clinic_admin(v_actor_id) OR public.is_super_admin(v_actor_id)) THEN
    RAISE EXCEPTION 'Acesso negado: só administrador da clínica pode definir quem atende.'
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

  UPDATE public.profiles
  SET has_agenda = p_has_agenda,
      updated_at = timezone('utc'::text, now())
  WHERE id = p_profile_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_member_has_agenda(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_member_has_agenda(UUID, BOOLEAN) TO authenticated;

-- ----------------------------------------------------------
-- Karen Karoline é clinic_admin sem atender paciente — foi o caso real
-- que motivou esta migração (aparecia como profissional por padrão e
-- puxava os agendamentos pra ela mesma).
-- ----------------------------------------------------------
UPDATE public.profiles
SET has_agenda = false
WHERE id = 'a57e3869-e608-4386-8987-45fcf05143a8'
  AND role = 'clinic_admin';

-- ----------------------------------------------------------
-- Verificação
-- ----------------------------------------------------------
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'has_agenda'
  ) AS coluna_criada,
  to_regprocedure('public.set_member_has_agenda(uuid,boolean)') IS NOT NULL AS rpc_criada,
  has_function_privilege('authenticated', 'public.set_member_has_agenda(uuid,boolean)', 'EXECUTE') AS authenticated_pode_executar,
  NOT has_function_privilege('anon', 'public.set_member_has_agenda(uuid,boolean)', 'EXECUTE') AS anon_bloqueado;
