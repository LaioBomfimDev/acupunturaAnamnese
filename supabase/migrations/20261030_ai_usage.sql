-- ==========================================================
-- IA: registro de uso por chamada + teto do mês da instituição
-- (30/10/2026, etapa 1 da assistente)
--
-- Até aqui nenhuma chamada ao Gemini deixava rastro de quanto gastou:
-- o valor só aparecia na fatura do Google. Agora cada Edge Function
-- de IA grava uma linha por chamada com os tokens que a Vertex
-- informou (usageMetadata). Nenhum conteúdo: nem a pergunta, nem a
-- resposta, nem paciente. Só quem chamou, qual função, qual modelo e
-- quantos tokens.
--
-- Quem grava: só as Edge Functions (service role). Ninguém lê a tabela
-- direto: a administração vê o mês pela função ai_usage_month, já
-- somado por função e modelo. O custo em dólar é calculado na tela e na
-- Edge Function com a mesma tabela de preços (utils/aiUsage.js ↔
-- _shared/aiUsage.ts).
--
-- Teto: clinics.ai_monthly_limit_usd (padrão 20,00; NULL = sem teto).
-- Por enquanto só a assistente para quando o teto do mês é atingido;
-- as funções clínicas que já existem continuam, para não travar um
-- atendimento no meio.
-- ==========================================================

CREATE TABLE IF NOT EXISTS public.ai_usage_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  function_name TEXT NOT NULL CHECK (function_name ~ '^[a-z][a-z0-9-]{1,40}$'),
  model TEXT NOT NULL CHECK (model ~ '^[a-z0-9][a-z0-9.-]{1,59}$'),
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  thinking_tokens INTEGER NOT NULL DEFAULT 0 CHECK (thinking_tokens >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_events_clinic_month
  ON public.ai_usage_events (clinic_id, created_at);

-- Sem policy: o cliente não lê nem grava direto. A service role ignora a RLS.
ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ai_usage_events FROM PUBLIC, anon, authenticated;

ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS ai_monthly_limit_usd NUMERIC(8,2) DEFAULT 20.00
    CHECK (ai_monthly_limit_usd IS NULL OR (ai_monthly_limit_usd >= 0 AND ai_monthly_limit_usd <= 10000));

-- Início do mês no fuso da clínica, como o resto do sistema.
CREATE OR REPLACE FUNCTION public.ai_usage_month_start(p_month DATE)
RETURNS TIMESTAMPTZ
LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT (date_trunc('month', p_month)::timestamp AT TIME ZONE 'America/Sao_Paulo');
$$;

-- Soma do mês de uma instituição, por função e modelo. Só a service
-- role (a Edge Function confere o teto) e a função da administração abaixo.
CREATE OR REPLACE FUNCTION public.ai_usage_totals(p_clinic UUID, p_month DATE)
RETURNS TABLE (
  funcao TEXT,
  modelo TEXT,
  chamadas INTEGER,
  entrada BIGINT,
  saida BIGINT,
  raciocinio BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.function_name, e.model, count(*)::INTEGER,
         COALESCE(sum(e.input_tokens), 0)::BIGINT,
         COALESCE(sum(e.output_tokens), 0)::BIGINT,
         COALESCE(sum(e.thinking_tokens), 0)::BIGINT
  FROM public.ai_usage_events e
  WHERE e.clinic_id = p_clinic
    AND e.created_at >= public.ai_usage_month_start(p_month)
    AND e.created_at < public.ai_usage_month_start((date_trunc('month', p_month) + INTERVAL '1 month')::date)
  GROUP BY e.function_name, e.model
  ORDER BY e.function_name, e.model;
$$;

REVOKE ALL ON FUNCTION public.ai_usage_totals(UUID, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_usage_totals(UUID, DATE) TO service_role;

-- Quadro "IA do mês" (Gestão → Configurações): só a administração da
-- própria instituição. Devolve as somas e o teto; o dinheiro é conta da tela.
CREATE OR REPLACE FUNCTION public.ai_usage_month(p_month DATE DEFAULT NULL)
RETURNS TABLE (
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
  v_clinic UUID := public.user_clinic_id(auth.uid());
  v_month DATE := COALESCE(p_month, (timezone('America/Sao_Paulo', now()))::date);
  v_limit NUMERIC;
BEGIN
  IF v_clinic IS NULL OR NOT public.is_clinic_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Só a administração da instituição vê o uso da IA.' USING ERRCODE = '42501';
  END IF;

  SELECT c.ai_monthly_limit_usd INTO v_limit FROM public.clinics c WHERE c.id = v_clinic;

  RETURN QUERY
    SELECT t.funcao, t.modelo, t.chamadas, t.entrada, t.saida, t.raciocinio, v_limit
    FROM public.ai_usage_totals(v_clinic, v_month) t;

  -- Mês sem nenhuma chamada: uma linha vazia leva o teto para a tela.
  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::TEXT, NULL::TEXT, 0, 0::BIGINT, 0::BIGINT, 0::BIGINT, v_limit;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.ai_usage_month(DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_usage_month(DATE) TO authenticated;

-- Teto do mês: só a administração da própria instituição. NULL = sem teto.
CREATE OR REPLACE FUNCTION public.clinic_admin_set_ai_limit(p_usd NUMERIC)
RETURNS NUMERIC
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic UUID := public.user_clinic_id(auth.uid());
BEGIN
  IF v_clinic IS NULL OR NOT public.is_clinic_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Só a administração da instituição muda o teto da IA.' USING ERRCODE = '42501';
  END IF;
  IF p_usd IS NOT NULL AND (p_usd < 0 OR p_usd > 10000) THEN
    RAISE EXCEPTION 'Teto fora do intervalo (0 a 10.000 dólares).' USING ERRCODE = '22023';
  END IF;

  UPDATE public.clinics SET ai_monthly_limit_usd = round(p_usd, 2) WHERE id = v_clinic;
  RETURN round(p_usd, 2);
END;
$$;

REVOKE ALL ON FUNCTION public.clinic_admin_set_ai_limit(NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clinic_admin_set_ai_limit(NUMERIC) TO authenticated;
