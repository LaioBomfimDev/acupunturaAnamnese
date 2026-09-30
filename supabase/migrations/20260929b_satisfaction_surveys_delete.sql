-- ==========================================================
-- Pesquisa de satisfação: administradora da clínica pode excluir
--
-- Por quê: antes de mandar pesquisas de verdade, a administradora gera
-- algumas de teste (e às vezes responde) — e elas ficavam para sempre
-- na aba da Gestão, contando no total, na taxa de resposta e na nota
-- média. 20260901_satisfaction_surveys.sql não dava DELETE a ninguém.
--
-- Quem: mesmo corte de appointments_delete — membro ativo da própria
-- instituição (can_manage_agenda) E administradora (is_clinic_admin) ou
-- super admin. Profissional e recepção não excluem: nota de atendimento
-- não pode sumir pela mão de quem foi avaliado.
--
-- O que acontece: a linha some de vez, com a nota e o comentário, se
-- houver (a tela avisa antes e pede a palavra "excluir"). O link já
-- enviado para de funcionar: a Edge Function satisfaction-survey não
-- acha o token e devolve a mesma mensagem genérica de link inválido.
-- UPDATE continua fechado — a resposta só é gravada pela Edge Function.
--
-- Reverter: DROP POLICY satisfaction_surveys_delete e
-- REVOKE DELETE ON public.satisfaction_surveys FROM authenticated.
-- ==========================================================

DROP POLICY IF EXISTS satisfaction_surveys_delete ON public.satisfaction_surveys;
CREATE POLICY satisfaction_surveys_delete ON public.satisfaction_surveys
  FOR DELETE TO authenticated
  USING (
    public.can_manage_agenda(clinic_id)
    AND (public.is_clinic_admin() OR public.is_super_admin())
  );

GRANT DELETE ON public.satisfaction_surveys TO authenticated;

-- ----------------------------------------------------------
-- Verificação
-- ----------------------------------------------------------
SELECT
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'satisfaction_surveys' AND policyname = 'satisfaction_surveys_delete'
  ) AS policy_delete_criada,
  has_table_privilege('authenticated', 'public.satisfaction_surveys', 'DELETE') AS authenticated_pode_excluir,
  NOT has_table_privilege('anon', 'public.satisfaction_surveys', 'DELETE') AS anon_bloqueado,
  -- UPDATE fechado por RLS (nenhuma policy), não por GRANT.
  NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'satisfaction_surveys' AND cmd IN ('UPDATE', 'ALL')
  ) AS update_segue_fechado;
