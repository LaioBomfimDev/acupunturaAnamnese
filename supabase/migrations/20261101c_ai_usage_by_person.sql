-- ==========================================================
-- IA: gasto por pessoa e por ação, para o SuperAdm (31/10/2026)
-- REQUER: 20261030_ai_usage.sql, 20261030b_ai_usage_superadmin.sql
--
-- Pedido da administradora: o SuperAdm vê cada ação de IA do mês, de
-- quem foi, de qual instituição, qual função e quantos tokens; o
-- dinheiro (em dólar e em real) é conta da tela, com a mesma tabela de
-- preços. Continua sem conteúdo nenhum: só quem, quando, qual função e
-- quanto texto.
-- ==========================================================

CREATE OR REPLACE FUNCTION public.superadmin_ai_usage_events(p_month DATE DEFAULT NULL, p_limit INTEGER DEFAULT 3000)
RETURNS TABLE (
  quando TIMESTAMPTZ,
  pessoa_id UUID,
  pessoa TEXT,
  papel TEXT,
  clinica_id UUID,
  clinica TEXT,
  funcao TEXT,
  modelo TEXT,
  entrada INTEGER,
  saida INTEGER,
  raciocinio INTEGER
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
    RAISE EXCEPTION 'Só o SuperAdm vê o uso de IA por pessoa.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT e.created_at, e.user_id, p.full_name, p.role, e.clinic_id, c.name,
           e.function_name, e.model, e.input_tokens, e.output_tokens, e.thinking_tokens
    FROM public.ai_usage_events e
    LEFT JOIN public.profiles p ON p.id = e.user_id
    LEFT JOIN public.clinics c ON c.id = e.clinic_id
    WHERE e.created_at >= v_from AND e.created_at < v_to
    ORDER BY e.created_at DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 3000), 1), 10000);
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_ai_usage_events(DATE, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.superadmin_ai_usage_events(DATE, INTEGER) TO authenticated;
