-- ============================================================
-- Financeiro: Contas do mês e gasto rápido (10/11/2026, opção A)
--
-- Pedido da administradora: recibo para todo dinheiro que sai, gasto
-- avulso (água, lanche, almoço do time, conserto) lançado em segundos,
-- sem categoria, também pela recepção, e conta fixa com valor previsto
-- que muda todo mês (luz, água).
--
--  1. Formas de pagamento da saída ganham Transferência e Boleto (só na
--     saída; recebimento do paciente segue como estava).
--  2. Saída fixa ganha amount_varies: com valor, o valor é uma previsão;
--     sem valor, "muda todo mês" como antes.
--  3. Toda saída paga ganha número de comprovante de despesa na mesma
--     sequência das compras (finance_receipt_counters, AAAA-000123),
--     dado por gatilho na hora em que vira paga, na mesma transação: sem
--     buraco e sem repetir. Saída paga antes desta migration fica sem
--     número (não se reescreve dinheiro lançado).
--  4. Gasto rápido (is_quick): descrição livre, categoria interna
--     "Gastos avulsos" (system_key 'avulsa', escondida da escolha),
--     lançado pela administração ou pela recepção
--     (finance_register_quick_expense) e listado para as duas
--     (finance_list_quick_expenses). Anular segue só da administração.
--
-- Reversão: DROP FUNCTION public.finance_register_quick_expense(TEXT, INTEGER, DATE, TEXT, UUID);
--   DROP FUNCTION public.finance_list_quick_expenses(DATE, DATE);
--   DROP TRIGGER trg_finance_expenses_receipt_number ON public.finance_expenses;
--   as colunas novas só têm dados depois do primeiro uso.
-- ============================================================

-- ----------------------------------------------------------
-- 1. Formas de pagamento da saída
-- ----------------------------------------------------------
DO $$
DECLARE
  v_name TEXT;
BEGIN
  FOR v_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.finance_expenses'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%cartao_debito%'
  LOOP
    EXECUTE format('ALTER TABLE public.finance_expenses DROP CONSTRAINT %I', v_name);
  END LOOP;
END;
$$;

ALTER TABLE public.finance_expenses
  ADD CONSTRAINT finance_expenses_method_check CHECK (
    method IS NULL OR method IN ('pix', 'dinheiro', 'cartao_debito', 'cartao_credito', 'transferencia', 'boleto', 'outro')
  );

-- ----------------------------------------------------------
-- 2. Saída fixa com valor previsto
-- ----------------------------------------------------------
ALTER TABLE public.finance_recurring_expenses
  ADD COLUMN IF NOT EXISTS amount_varies BOOLEAN NOT NULL DEFAULT FALSE;

-- Saída fixa que já existia sem valor é a de "muda todo mês".
UPDATE public.finance_recurring_expenses SET amount_varies = TRUE WHERE amount_cents IS NULL AND NOT amount_varies;

-- ----------------------------------------------------------
-- 3. Categoria interna do gasto rápido
-- ----------------------------------------------------------
DO $$
DECLARE
  v_name TEXT;
BEGIN
  FOR v_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.finance_expense_categories'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%salarios%'
  LOOP
    EXECUTE format('ALTER TABLE public.finance_expense_categories DROP CONSTRAINT %I', v_name);
  END LOOP;
END;
$$;

ALTER TABLE public.finance_expense_categories
  ADD CONSTRAINT finance_expense_categories_system_key_check CHECK (
    system_key IS NULL OR system_key IN ('repasse', 'salarios', 'avulsa')
  );

-- ----------------------------------------------------------
-- 4. Gasto rápido e número de comprovante em toda saída paga
-- ----------------------------------------------------------
ALTER TABLE public.finance_expenses
  ADD COLUMN IF NOT EXISTS is_quick BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.finance_expenses DROP CONSTRAINT IF EXISTS finance_expenses_purchase_receipt;
ALTER TABLE public.finance_expenses DROP CONSTRAINT IF EXISTS finance_expenses_receipt;
ALTER TABLE public.finance_expenses
  ADD CONSTRAINT finance_expenses_receipt CHECK (
    (receipt_number IS NULL OR (receipt_number ~ '^[0-9]{4}-[0-9]{6}$' AND paid_on IS NOT NULL))
    AND (NOT is_purchase OR (receipt_number IS NOT NULL AND recurring_id IS NULL))
    AND (NOT is_quick OR (receipt_number IS NOT NULL AND paid_on IS NOT NULL AND recurring_id IS NULL AND NOT is_purchase))
  );

-- Próximo número do comprovante de despesa. A linha do contador trava até
-- o fim da transação: lançamento que falha não gasta número.
CREATE OR REPLACE FUNCTION public.finance_next_expense_receipt(p_clinic UUID)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year INTEGER := EXTRACT(YEAR FROM public.finance_today())::INTEGER;
  v_next INTEGER;
BEGIN
  INSERT INTO public.finance_receipt_counters AS c (clinic_id, year, last_number)
  VALUES (p_clinic, v_year, 1)
  ON CONFLICT ON CONSTRAINT finance_receipt_counters_pkey
  DO UPDATE SET last_number = c.last_number + 1
  RETURNING c.last_number INTO v_next;
  RETURN v_year::TEXT || '-' || lpad(v_next::TEXT, 6, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.finance_next_expense_receipt(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.finance_expense_receipt_number()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.paid_on IS NOT NULL AND NOT NEW.skipped AND NEW.receipt_number IS NULL
     AND NEW.voided_at IS NULL
     AND (TG_OP = 'INSERT' OR OLD.paid_on IS NULL) THEN
    NEW.receipt_number := public.finance_next_expense_receipt(NEW.clinic_id);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.finance_expense_receipt_number() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_finance_expenses_receipt_number ON public.finance_expenses;
CREATE TRIGGER trg_finance_expenses_receipt_number
  BEFORE INSERT OR UPDATE ON public.finance_expenses
  FOR EACH ROW EXECUTE FUNCTION public.finance_expense_receipt_number();

-- Guarda do dinheiro (20261023), igual, com o número do comprovante entre
-- o que pode mudar na hora de pagar uma saída "a pagar" (o gatilho acima
-- dá o número nesse momento; a ordem dos gatilhos não importa mais).
CREATE OR REPLACE FUNCTION public.finance_guard_money_rows()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_void_cols TEXT[] := ARRAY['voided_at', 'voided_by', 'void_reason'];
  v_pay_cols TEXT[] := ARRAY['paid_on', 'method', 'paid_by', 'receipt_number'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Lançamento de dinheiro não se apaga: anule com motivo.' USING ERRCODE = '42501';
  END IF;

  IF OLD.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'Lançamento anulado não muda mais.' USING ERRCODE = '42501';
  END IF;

  IF NEW.voided_at IS NOT NULL THEN
    IF NEW.void_reason IS NULL OR length(btrim(NEW.void_reason)) < 3 THEN
      RAISE EXCEPTION 'Diga o motivo da anulação.' USING ERRCODE = '23514';
    END IF;
    IF (to_jsonb(NEW) - v_void_cols) IS DISTINCT FROM (to_jsonb(OLD) - v_void_cols) THEN
      RAISE EXCEPTION 'Ao anular, nada além da anulação muda.' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- IF aninhado de propósito: recebimento não tem skipped/paid_on, e o
  -- PL/pgSQL não garante parar no primeiro AND falso.
  IF TG_TABLE_NAME = 'finance_expenses' THEN
    IF NOT OLD.skipped AND OLD.paid_on IS NULL AND NEW.paid_on IS NOT NULL AND OLD.receipt_number IS NULL THEN
      IF (to_jsonb(NEW) - v_pay_cols) IS DISTINCT FROM (to_jsonb(OLD) - v_pay_cols) THEN
        RAISE EXCEPTION 'Ao pagar, só a data e a forma de pagamento mudam.' USING ERRCODE = '42501';
      END IF;
      RETURN NEW;
    END IF;
  END IF;

  RAISE EXCEPTION 'Valor e data de lançamento não se editam: anule e lance de novo.' USING ERRCODE = '42501';
END;
$$;

-- ----------------------------------------------------------
-- 5. Quem lança gasto rápido: administração ou recepção da instituição
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finance_require_quick()
RETURNS UUID
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic UUID := public.user_clinic_id(auth.uid());
BEGIN
  IF v_clinic IS NULL
     OR NOT (public.can_manage_finance(v_clinic)
             OR (public.is_receptionist(auth.uid()) AND public.can_manage_agenda(v_clinic))) THEN
    RAISE EXCEPTION 'Só a administração e a recepção lançam gasto rápido.' USING ERRCODE = '42501';
  END IF;
  RETURN v_clinic;
END;
$$;

REVOKE ALL ON FUNCTION public.finance_require_quick() FROM PUBLIC, anon, authenticated;

-- Categoria interna "Gastos avulsos": acha, adota a de mesmo nome ou cria.
CREATE OR REPLACE FUNCTION public.finance_quick_category(p_clinic UUID)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id FROM public.finance_expense_categories
  WHERE clinic_id = p_clinic AND system_key = 'avulsa';
  IF FOUND THEN
    RETURN v_id;
  END IF;

  UPDATE public.finance_expense_categories
  SET system_key = 'avulsa', active = TRUE
  WHERE clinic_id = p_clinic AND name = 'Gastos avulsos' AND system_key IS NULL
  RETURNING id INTO v_id;
  IF FOUND THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.finance_expense_categories (clinic_id, name, system_key, sort_order)
  VALUES (p_clinic, 'Gastos avulsos', 'avulsa', 75)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.finance_quick_category(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.finance_register_quick_expense(
  p_description TEXT,
  p_amount_cents INTEGER,
  p_paid_on DATE,
  p_method TEXT,
  p_paid_by UUID
)
RETURNS public.finance_expenses
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic UUID := public.finance_require_quick();
  v_text TEXT := btrim(COALESCE(p_description, ''));
  v_payer UUID := COALESCE(p_paid_by, auth.uid());
  v_row public.finance_expenses%ROWTYPE;
BEGIN
  IF length(v_text) < 2 OR length(v_text) > 120 THEN
    RAISE EXCEPTION 'Escreva o que foi o gasto (até 120 letras).' USING ERRCODE = '22023';
  END IF;
  IF p_amount_cents IS NULL OR p_amount_cents <= 0 OR p_amount_cents > 100000000 THEN
    RAISE EXCEPTION 'Informe o valor do gasto.' USING ERRCODE = '22023';
  END IF;
  IF p_paid_on IS NULL OR p_paid_on > public.finance_today() THEN
    RAISE EXCEPTION 'A data do gasto é hoje ou antes.' USING ERRCODE = '22023';
  END IF;
  IF p_method IS NULL OR p_method NOT IN ('pix', 'dinheiro', 'cartao_debito', 'cartao_credito', 'transferencia', 'boleto', 'outro') THEN
    RAISE EXCEPTION 'Escolha como foi pago.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_payer AND clinic_id = v_clinic AND is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'Quem pagou tem de ser da equipe desta instituição.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.finance_expenses (
    clinic_id, category_id, description, amount_cents, paid_on, method,
    recorded_by, paid_by, is_quick
  ) VALUES (
    v_clinic, public.finance_quick_category(v_clinic), v_text, p_amount_cents, p_paid_on, p_method,
    auth.uid(), v_payer, TRUE
  )
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.finance_register_quick_expense(TEXT, INTEGER, DATE, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_register_quick_expense(TEXT, INTEGER, DATE, TEXT, UUID) TO authenticated;

-- Gastos rápidos de um período (no máximo um ano), para a administração
-- e a recepção. Só o gasto rápido: o resto do financeiro segue fechado
-- para a recepção.
CREATE OR REPLACE FUNCTION public.finance_list_quick_expenses(p_from DATE, p_to DATE)
RETURNS TABLE (
  expense_id UUID,
  paid_on DATE,
  description TEXT,
  amount_cents INTEGER,
  method TEXT,
  receipt_number TEXT,
  paid_by UUID,
  paid_by_name TEXT,
  recorded_by_name TEXT,
  created_at TIMESTAMPTZ,
  voided_at TIMESTAMPTZ,
  void_reason TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_clinic UUID := public.finance_require_quick();
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from > 366 THEN
    RAISE EXCEPTION 'Período inválido (no máximo um ano).' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    e.id,
    e.paid_on,
    e.description,
    e.amount_cents,
    e.method,
    e.receipt_number,
    e.paid_by,
    payer.full_name,
    writer.full_name,
    e.created_at,
    e.voided_at,
    e.void_reason
  FROM public.finance_expenses e
  LEFT JOIN public.profiles payer ON payer.id = e.paid_by
  LEFT JOIN public.profiles writer ON writer.id = e.recorded_by
  WHERE e.clinic_id = v_clinic
    AND e.is_quick
    AND e.paid_on BETWEEN p_from AND p_to
  ORDER BY e.paid_on DESC, e.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.finance_list_quick_expenses(DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_list_quick_expenses(DATE, DATE) TO authenticated;

-- ----------------------------------------------------------
-- Verificação
-- ----------------------------------------------------------
SELECT
  to_regprocedure('public.finance_register_quick_expense(text,integer,date,text,uuid)') IS NOT NULL AS gasto_rapido_criado,
  to_regprocedure('public.finance_list_quick_expenses(date,date)') IS NOT NULL AS lista_criada,
  NOT has_function_privilege('authenticated', 'public.finance_next_expense_receipt(uuid)', 'EXECUTE') AS numero_so_por_gatilho,
  NOT has_function_privilege('anon', 'public.finance_register_quick_expense(text,integer,date,text,uuid)', 'EXECUTE') AS anon_bloqueado,
  NOT has_table_privilege('authenticated', 'public.finance_expenses', 'INSERT') AS saida_so_por_funcao,
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_finance_expenses_receipt_number') AS gatilho_do_numero;
