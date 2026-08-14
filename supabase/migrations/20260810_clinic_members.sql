-- ==========================================================
-- Membros da instituição (leitura de colegas)
-- REQUER: 20260612_clinics, 20260616_professional_type,
--         20260707_profile_disciplines e 20260809_appointments.
--
-- Problema que resolve: a política de `profiles` do schema inicial é
-- "cada perfil vê apenas a si mesmo". Isso torna impossível a agenda de
-- recepção — não dá para escolher o profissional se a tela não consegue
-- listar os colegas da casa. É o bloqueador nº 1 do módulo de gestão
-- (docs/plano-agenda-gestao-clinica.md, Fase 0).
--
-- Por que FUNÇÃO e não VIEW: uma view com `security_invoker = true`
-- herdaria a RLS de `profiles` e devolveria só a própria linha (inútil);
-- uma view sem isso vira "security definer view", que expõe a tabela
-- inteira e some do radar de auditoria. A função abaixo é explícita:
-- devolve uma lista fechada de colunas ADMINISTRATIVAS e nada mais.
--
-- O que NÃO é exposto, de propósito: e-mail, telefone, documento,
-- registro profissional, must_change_password. Para montar a agenda
-- basta saber quem é, o que faz e se está ativo.
-- ==========================================================

DROP FUNCTION IF EXISTS public.list_clinic_members(UUID);

CREATE OR REPLACE FUNCTION public.list_clinic_members(p_clinic UUID DEFAULT NULL)
RETURNS TABLE (
  id UUID,
  full_name TEXT,
  profession TEXT,
  role TEXT,
  disciplines TEXT[],
  is_active BOOLEAN
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic UUID := COALESCE(p_clinic, public.user_clinic_id(auth.uid()));
BEGIN
  -- Sem instituição não há colegas: perfil solto devolve lista vazia em
  -- vez de erro, para a agenda continuar abrindo.
  IF v_clinic IS NULL THEN
    RETURN;
  END IF;

  -- O gate é o mesmo da agenda: membro ATIVO da instituição, com senha
  -- já trocada. Super admin enxerga qualquer casa (suporte).
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
    p.is_active
  FROM public.profiles p
  WHERE p.clinic_id = v_clinic
    AND p.is_active IS TRUE
  ORDER BY COALESCE(NULLIF(TRIM(p.full_name), ''), 'zzz'), p.id;
END;
$$;

-- PUBLIC vem ANTES de anon de propósito. O Postgres concede EXECUTE a
-- PUBLIC automaticamente ao criar a função, e `anon` herda dessa
-- concessão: revogar só de `anon` não tira nada, e
-- has_function_privilege('anon', ...) continua devolvendo true.
-- Foi assim que a verificação desta migração pegou o furo na primeira
-- aplicação (2026-08-12). Padrão correto do projeto, já usado em
-- 20260723_clinical_data_hardening.sql: revogar de PUBLIC e de anon.
REVOKE ALL ON FUNCTION public.list_clinic_members(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_clinic_members(UUID) TO authenticated;

-- Mesmo furo em can_manage_agenda, criada em 20260809 com o padrão
-- antigo. Corrigida aqui para não exigir uma migração só por causa de
-- uma linha — reaplicar este arquivo conserta as duas.
REVOKE ALL ON FUNCTION public.can_manage_agenda(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_agenda(UUID, UUID) TO authenticated;

-- ----------------------------------------------------------
-- Verificação
-- ----------------------------------------------------------
SELECT
  to_regprocedure('public.list_clinic_members(uuid)') IS NOT NULL AS funcao_criada,
  has_function_privilege('authenticated', 'public.list_clinic_members(uuid)', 'EXECUTE') AS authenticated_pode_executar,
  NOT has_function_privilege('anon', 'public.list_clinic_members(uuid)', 'EXECUTE') AS anon_bloqueado,
  NOT has_function_privilege('anon', 'public.can_manage_agenda(uuid,uuid)', 'EXECUTE') AS anon_bloqueado_na_agenda;
