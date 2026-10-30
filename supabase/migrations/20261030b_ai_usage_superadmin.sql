-- ==========================================================
-- IA: o teto do mês passa a ser do SuperAdm (30/10/2026)
-- REQUER: 20261030_ai_usage.sql
--
-- Para vender o sistema a outras clínicas, quem paga a conta do Google
-- é a dona do sistema: o teto de IA de cada instituição é definido só
-- pelo SuperAdm. A administração da clínica continua vendo o gasto e o
-- teto (ai_usage_month), mas não muda mais.
--
-- O SuperAdm vê todas as instituições num quadro só, com o gasto por
-- função e modelo (o dinheiro é conta da tela, com a mesma tabela de
-- preços), e o uso sem instituição (o próprio SuperAdm).
-- ==========================================================

DROP FUNCTION IF EXISTS public.clinic_admin_set_ai_limit(NUMERIC);

CREATE OR REPLACE FUNCTION public.superadmin_ai_usage_overview(p_month DATE DEFAULT NULL)
RETURNS TABLE (
  clinica_id UUID,
  clinica TEXT,
  funcao TEXT,
  modelo TEXT,
  chamadas INTEGER,
  entrada BIGINT,
  saida BIGINT,
  raciocinio BIGINT,
  teto_usd NUMERIC
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month DATE := COALESCE(p_month, (timezone('America/Sao_Paulo', now()))::date);
  v_from TIMESTAMPTZ := public.ai_usage_month_start(v_month);
  v_to TIMESTAMPTZ := public.ai_usage_month_start((date_trunc('month', v_month) + INTERVAL '1 month')::date);
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Só o SuperAdm vê o uso de IA de todas as instituições.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    -- Toda instituição aparece, mesmo sem uso no mês (para ver e mudar o teto).
    SELECT c.id, c.name, u.function_name, u.model,
           COALESCE(u.calls, 0)::INTEGER, COALESCE(u.input, 0)::BIGINT,
           COALESCE(u.output, 0)::BIGINT, COALESCE(u.thinking, 0)::BIGINT,
           c.ai_monthly_limit_usd
    FROM public.clinics c
    LEFT JOIN LATERAL (
      SELECT e.function_name, e.model, count(*) AS calls,
             sum(e.input_tokens) AS input, sum(e.output_tokens) AS output, sum(e.thinking_tokens) AS thinking
      FROM public.ai_usage_events e
      WHERE e.clinic_id = c.id AND e.created_at >= v_from AND e.created_at < v_to
      GROUP BY e.function_name, e.model
    ) u ON TRUE
    UNION ALL
    -- Uso sem instituição (SuperAdm), sem teto.
    SELECT NULL::UUID, NULL::TEXT, e.function_name, e.model, count(*)::INTEGER,
           sum(e.input_tokens)::BIGINT, sum(e.output_tokens)::BIGINT, sum(e.thinking_tokens)::BIGINT,
           NULL::NUMERIC
    FROM public.ai_usage_events e
    WHERE e.clinic_id IS NULL AND e.created_at >= v_from AND e.created_at < v_to
    GROUP BY e.function_name, e.model;
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_ai_usage_overview(DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.superadmin_ai_usage_overview(DATE) TO authenticated;

-- Teto do mês de uma instituição: só o SuperAdm. NULL = sem teto.
CREATE OR REPLACE FUNCTION public.superadmin_set_ai_limit(p_clinic UUID, p_usd NUMERIC)
RETURNS NUMERIC
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Só o SuperAdm muda o teto de IA.' USING ERRCODE = '42501';
  END IF;
  IF p_usd IS NOT NULL AND (p_usd < 0 OR p_usd > 10000) THEN
    RAISE EXCEPTION 'Teto fora do intervalo (0 a 10.000 dólares).' USING ERRCODE = '22023';
  END IF;

  UPDATE public.clinics SET ai_monthly_limit_usd = round(p_usd, 2) WHERE id = p_clinic;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Instituição não encontrada.' USING ERRCODE = 'P0002';
  END IF;
  RETURN round(p_usd, 2);
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_set_ai_limit(UUID, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.superadmin_set_ai_limit(UUID, NUMERIC) TO authenticated;
