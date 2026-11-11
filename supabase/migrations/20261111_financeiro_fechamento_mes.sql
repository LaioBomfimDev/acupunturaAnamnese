-- ============================================================
-- Financeiro: fechar o mês para o contador (11/11/2026, etapa 3)
--
-- Decisão da administradora (11/11/2026): o fechamento trava pela DATA
-- DO PAGAMENTO, que é o que o contador confere com o extrato do banco.
-- Mês fechado não recebe lançamento novo com dinheiro naquele mês:
--   * recebimento do paciente (finance_receipts.received_on);
--   * depósito da operadora (convenio_payments.received_on);
--   * saída paga (finance_expenses.paid_on), inclusive pagar depois uma
--     saída "a pagar" com data no mês fechado.
-- Pagamento atrasado de serviço de um mês fechado entra normalmente no
-- mês em que o dinheiro entrou. Anular continua possível (correção com
-- motivo); o relatório marca o que mudou depois do fechamento.
--
-- O fechamento guarda os totais do mês naquela hora (calculados aqui,
-- nunca pela tela). Reabrir pede motivo e fica no histórico; fechar de
-- novo cria outro registro. Só a administração fecha e reabre. Só fecha
-- mês que já terminou.
--
-- Reversão: DROP TRIGGER trg_*_closed_month nas três tabelas, as funções
-- finance_*_month e a tabela finance_month_closings.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.finance_month_closings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  month DATE NOT NULL CHECK (EXTRACT(DAY FROM month) = 1),
  closed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  closed_by UUID REFERENCES public.profiles(id),
  snapshot JSONB NOT NULL,
  reopened_at TIMESTAMPTZ,
  reopened_by UUID REFERENCES public.profiles(id),
  reopen_reason TEXT,
  CONSTRAINT finance_month_closings_reopen CHECK (
    (reopened_at IS NULL AND reopened_by IS NULL AND reopen_reason IS NULL)
    OR (reopened_at IS NOT NULL AND reopen_reason IS NOT NULL AND length(btrim(reopen_reason)) >= 3)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_month_closings_live
  ON public.finance_month_closings (clinic_id, month) WHERE reopened_at IS NULL;

ALTER TABLE public.finance_month_closings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS finance_month_closings_admin_read ON public.finance_month_closings;
CREATE POLICY finance_month_closings_admin_read ON public.finance_month_closings
  FOR SELECT TO authenticated USING (public.can_manage_finance(clinic_id));
REVOKE ALL ON public.finance_month_closings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.finance_month_closings TO authenticated;

-- Fechamento só muda para ser reaberto (uma vez); nunca se apaga.
CREATE OR REPLACE FUNCTION public.finance_guard_month_closings()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_reopen_cols TEXT[] := ARRAY['reopened_at', 'reopened_by', 'reopen_reason'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Fechamento não se apaga: reabra com motivo.' USING ERRCODE = '42501';
  END IF;
  IF OLD.reopened_at IS NULL AND NEW.reopened_at IS NOT NULL
     AND (to_jsonb(NEW) - v_reopen_cols) IS NOT DISTINCT FROM (to_jsonb(OLD) - v_reopen_cols) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Fechamento não se edita.' USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_finance_month_closings_guard ON public.finance_month_closings;
CREATE TRIGGER trg_finance_month_closings_guard
  BEFORE UPDATE OR DELETE ON public.finance_month_closings
  FOR EACH ROW EXECUTE FUNCTION public.finance_guard_month_closings();

-- ----------------------------------------------------------
-- Mês fechado barra dinheiro novo naquele mês
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finance_month_is_closed(p_clinic UUID, p_day DATE)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_day IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.finance_month_closings
    WHERE clinic_id = p_clinic
      AND month = date_trunc('month', p_day)::DATE
      AND reopened_at IS NULL
  );
$$;

REVOKE ALL ON FUNCTION public.finance_month_is_closed(UUID, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_month_is_closed(UUID, DATE) TO authenticated;

CREATE OR REPLACE FUNCTION public.finance_guard_closed_month()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day DATE;
BEGIN
  -- IF aninhado de propósito: cada tabela tem a sua coluna de data.
  IF TG_TABLE_NAME = 'finance_expenses' THEN
    IF TG_OP = 'INSERT' OR OLD.paid_on IS NULL THEN
      v_day := NEW.paid_on;
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    v_day := NEW.received_on;
  END IF;

  IF public.finance_month_is_closed(NEW.clinic_id, v_day) THEN
    RAISE EXCEPTION 'O mês de % está fechado para o contador: lance com uma data de um mês aberto ou reabra o mês (Financeiro → Relatório do contador).',
      to_char(v_day, 'MM/YYYY') USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.finance_guard_closed_month() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_finance_receipts_closed_month ON public.finance_receipts;
CREATE TRIGGER trg_finance_receipts_closed_month
  BEFORE INSERT ON public.finance_receipts
  FOR EACH ROW EXECUTE FUNCTION public.finance_guard_closed_month();

DROP TRIGGER IF EXISTS trg_finance_expenses_closed_month ON public.finance_expenses;
CREATE TRIGGER trg_finance_expenses_closed_month
  BEFORE INSERT OR UPDATE ON public.finance_expenses
  FOR EACH ROW EXECUTE FUNCTION public.finance_guard_closed_month();

DROP TRIGGER IF EXISTS trg_convenio_payments_closed_month ON public.convenio_payments;
CREATE TRIGGER trg_convenio_payments_closed_month
  BEFORE INSERT ON public.convenio_payments
  FOR EACH ROW EXECUTE FUNCTION public.finance_guard_closed_month();

-- ----------------------------------------------------------
-- Fechar e reabrir
-- ----------------------------------------------------------

-- Totais do mês pela data do pagamento, só o que vale (sem anulados).
CREATE OR REPLACE FUNCTION public.finance_month_snapshot(p_clinic UUID, p_month DATE)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH bounds AS (
    SELECT p_month AS first_day, (p_month + INTERVAL '1 month' - INTERVAL '1 day')::DATE AS last_day
  ),
  patients_in AS (
    SELECT COALESCE(sum(r.amount_cents), 0) AS cents, count(DISTINCT r.group_id) AS n
    FROM public.finance_receipts r, bounds b
    WHERE r.clinic_id = p_clinic AND r.voided_at IS NULL AND r.received_on BETWEEN b.first_day AND b.last_day
  ),
  operators_in AS (
    SELECT COALESCE(sum(c.amount_cents), 0) AS cents, count(*) AS n
    FROM public.convenio_payments c, bounds b
    WHERE c.clinic_id = p_clinic AND c.voided_at IS NULL AND c.received_on BETWEEN b.first_day AND b.last_day
  ),
  money_out AS (
    SELECT COALESCE(sum(e.amount_cents), 0) AS cents, count(*) AS n
    FROM public.finance_expenses e, bounds b
    WHERE e.clinic_id = p_clinic AND e.voided_at IS NULL AND NOT e.skipped
      AND e.paid_on BETWEEN b.first_day AND b.last_day
  )
  SELECT jsonb_build_object(
    'base', 'data_do_pagamento',
    'recebido_pacientes_centavos', p.cents,
    'recebimentos', p.n,
    'recebido_operadoras_centavos', o.cents,
    'depositos_operadoras', o.n,
    'entradas_centavos', p.cents + o.cents,
    'saidas_centavos', m.cents,
    'saidas', m.n,
    'resultado_centavos', p.cents + o.cents - m.cents
  )
  FROM patients_in p, operators_in o, money_out m;
$$;

REVOKE ALL ON FUNCTION public.finance_month_snapshot(UUID, DATE) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.finance_close_month(p_month DATE)
RETURNS public.finance_month_closings
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic UUID := public.finance_require_admin();
  v_month DATE := date_trunc('month', p_month)::DATE;
  v_row public.finance_month_closings%ROWTYPE;
BEGIN
  IF p_month IS NULL OR v_month >= date_trunc('month', public.finance_today())::DATE THEN
    RAISE EXCEPTION 'Só fecha mês que já terminou.' USING ERRCODE = '22023';
  END IF;
  IF public.finance_month_is_closed(v_clinic, v_month) THEN
    RAISE EXCEPTION 'Este mês já está fechado.' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.finance_month_closings (clinic_id, month, closed_by, snapshot)
  VALUES (v_clinic, v_month, auth.uid(), public.finance_month_snapshot(v_clinic, v_month))
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.finance_reopen_month(p_month DATE, p_reason TEXT)
RETURNS public.finance_month_closings
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic UUID := public.finance_require_admin();
  v_row public.finance_month_closings%ROWTYPE;
BEGIN
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'Diga o motivo para reabrir o mês.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.finance_month_closings
  SET reopened_at = timezone('utc', now()), reopened_by = auth.uid(), reopen_reason = btrim(p_reason)
  WHERE clinic_id = v_clinic AND month = date_trunc('month', p_month)::DATE AND reopened_at IS NULL
  RETURNING * INTO v_row;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Este mês não está fechado.' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_row;
END;
$$;

DO $$
DECLARE
  v_signature TEXT;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.finance_close_month(DATE)',
    'public.finance_reopen_month(DATE, TEXT)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', v_signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_signature);
  END LOOP;
END;
$$;

-- ----------------------------------------------------------
-- Verificação
-- ----------------------------------------------------------
SELECT
  to_regclass('public.finance_month_closings') IS NOT NULL AS fechamento_criado,
  to_regprocedure('public.finance_close_month(date)') IS NOT NULL AS fechar_criado,
  to_regprocedure('public.finance_reopen_month(date,text)') IS NOT NULL AS reabrir_criado,
  (SELECT count(*) FROM pg_trigger WHERE tgname IN ('trg_finance_receipts_closed_month', 'trg_finance_expenses_closed_month', 'trg_convenio_payments_closed_month')) = 3 AS tres_travas,
  NOT has_table_privilege('authenticated', 'public.finance_month_closings', 'INSERT') AS so_por_funcao,
  NOT has_function_privilege('authenticated', 'public.finance_month_snapshot(uuid,date)', 'EXECUTE') AS totais_so_no_banco;
