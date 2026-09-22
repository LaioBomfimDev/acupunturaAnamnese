-- ==========================================================
-- clinic_financial_summary escondia pagamento de colega sem erro
--
-- Achado (auditoria das ~20 migrations com CREATE POLICY que também
-- referenciam public.profiles, disparada pelo bug de
-- 20260922b_appointments_professional_check_fix.sql). Nenhuma outra
-- policy tinha o antipadrão original (EXISTS cru contra profiles
-- dentro de CREATE POLICY), mas esta function tem a MESMA causa raiz
-- em outro formato: clinic_financial_summary (20260908_financeiro_
-- backend.sql) é LANGUAGE sql STABLE sem SECURITY DEFINER — roda com
-- o privilégio de quem chama, de propósito, pra deixar a RLS de
-- appointment_payments/procedure_prices filtrar a clínica sozinha. O
-- problema é o `JOIN public.profiles pr ON pr.id = a.professional_id`
-- dentro dela: esse JOIN também herda "Profiles select self or super
-- admin" (auth.uid() = id OR is_super_admin()). Pra um clinic_admin
-- (não super_admin) chamando o resumo, o JOIN só bate quando
-- a.professional_id == o próprio clinic_admin — pagamento de QUALQUER
-- colega desaparece da consulta, sem erro nenhum (INNER JOIN sem
-- match = linha sumida, não RAISE EXCEPTION).
--
-- Reproduzido com INSERT real (rollback): um clinic_admin ativo,
-- chamando clinic_financial_summary logo após um pagamento real ser
-- gravado para um agendamento de um COLEGA da mesma clínica, recebe
-- zero linhas — dinheiro recebido pela clínica some do relatório
-- financeiro sem qualquer indício de erro.
--
-- Fix: em vez de fazer o resumo inteiro SECURITY DEFINER (o que
-- exigiria reimplementar manualmente o isolamento por clínica que
-- hoje vem de graça da RLS de appointment_payments/procedure_prices —
-- risco de abrir um BOLA novo), isola só a leitura do nome do
-- profissional num helper SECURITY DEFINER estreito, mesmo padrão de
-- profile_in_clinic (20260922b).
-- ==========================================================

CREATE OR REPLACE FUNCTION public.profile_full_name(p_profile_id UUID)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT full_name FROM public.profiles WHERE id = p_profile_id;
$$;

REVOKE ALL ON FUNCTION public.profile_full_name(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.profile_full_name(UUID) TO authenticated;

-- Reaplica exatamente a forma vigente (20260908_financeiro_backend.sql)
-- trocando só o JOIN cru contra profiles pelo helper SECURITY DEFINER.
-- clinic_id continua sem parâmetro próprio: o isolamento por clínica
-- segue vindo da RLS de appointment_payments/procedure_prices, intacta.
CREATE OR REPLACE FUNCTION public.clinic_financial_summary(
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ,
  p_professional UUID DEFAULT NULL
)
RETURNS TABLE (
  professional_id UUID,
  professional_name TEXT,
  discipline TEXT,
  payment_method TEXT,
  received_cents BIGINT,
  repasse_cents BIGINT
)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT
    a.professional_id,
    public.profile_full_name(a.professional_id) AS professional_name,
    a.discipline,
    ap.payment_method,
    SUM(ap.amount_cents)::BIGINT AS received_cents,
    SUM(ROUND(ap.amount_cents * COALESCE(pp.repasse_percent, 0) / 100.0))::BIGINT AS repasse_cents
  FROM public.appointment_payments ap
  JOIN public.appointments a ON a.id = ap.appointment_id
  LEFT JOIN LATERAL (
    SELECT pp2.repasse_percent
    FROM public.procedure_prices pp2
    WHERE pp2.clinic_id = a.clinic_id
      AND pp2.discipline = a.discipline
      AND (pp2.appointment_type = a.appointment_type OR pp2.appointment_type IS NULL)
    ORDER BY (pp2.appointment_type IS NULL) ASC
    LIMIT 1
  ) pp ON TRUE
  WHERE ap.paid_at >= p_from
    AND ap.paid_at < p_to
    AND (p_professional IS NULL OR a.professional_id = p_professional)
  GROUP BY a.professional_id, public.profile_full_name(a.professional_id), a.discipline, ap.payment_method;
$$;

REVOKE ALL ON FUNCTION public.clinic_financial_summary(TIMESTAMPTZ, TIMESTAMPTZ, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clinic_financial_summary(TIMESTAMPTZ, TIMESTAMPTZ, UUID) TO authenticated;

-- ----------------------------------------------------------
-- Verificação
-- ----------------------------------------------------------
SELECT
  to_regprocedure('public.profile_full_name(uuid)') IS NOT NULL AS funcao_criada,
  has_function_privilege('authenticated', 'public.profile_full_name(uuid)', 'EXECUTE') AS authenticated_pode_executar,
  NOT has_function_privilege('anon', 'public.profile_full_name(uuid)', 'EXECUTE') AS anon_bloqueado,
  pg_get_functiondef('public.clinic_financial_summary(timestamptz,timestamptz,uuid)'::regprocedure)
    NOT LIKE '%JOIN public.profiles%' AS sem_join_cru_em_profiles,
  pg_get_functiondef('public.clinic_financial_summary(timestamptz,timestamptz,uuid)'::regprocedure)
    LIKE '%profile_full_name(a.professional_id)%' AS usa_helper_security_definer;
