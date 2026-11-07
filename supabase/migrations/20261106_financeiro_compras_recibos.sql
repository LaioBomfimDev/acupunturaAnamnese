-- ============================================================
-- Financeiro: compras com itens e recibo interno numerado (06/11/2026)
--
-- Compra pequena (água, almoço da equipe, material) entra em
-- finance_expenses como saída já paga, com os itens em
-- finance_purchase_items e um número de recibo sem buraco por
-- instituição e ano (AAAA-000123). Comprovante interno, sem valor
-- fiscal. Como todo dinheiro lançado, não se edita nem se apaga: só
-- se anula com motivo (finance_void_expense, já existente).
--
-- Reversão: DROP FUNCTION public.finance_register_purchase(UUID, DATE, TEXT, UUID, UUID, TEXT, JSONB);
-- as tabelas e colunas novas só têm dados depois do primeiro uso.
-- ============================================================

ALTER TABLE public.finance_expenses
  ADD COLUMN IF NOT EXISTS is_purchase BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS receipt_number TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'finance_expenses_purchase_receipt') THEN
    ALTER TABLE public.finance_expenses
      ADD CONSTRAINT finance_expenses_purchase_receipt CHECK (
        (is_purchase AND receipt_number IS NOT NULL AND receipt_number ~ '^[0-9]{4}-[0-9]{6}$' AND paid_on IS NOT NULL AND recurring_id IS NULL)
        OR (NOT is_purchase AND receipt_number IS NULL)
      );
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_expenses_receipt_number
  ON public.finance_expenses (clinic_id, receipt_number) WHERE receipt_number IS NOT NULL;

-- ----------------------------------------------------------
-- Contador do número do recibo (um por instituição e ano)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.finance_receipt_counters (
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  year INTEGER NOT NULL CHECK (year BETWEEN 2000 AND 2999),
  last_number INTEGER NOT NULL DEFAULT 0 CHECK (last_number >= 0),
  CONSTRAINT finance_receipt_counters_pkey PRIMARY KEY (clinic_id, year)
);

ALTER TABLE public.finance_receipt_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.finance_receipt_counters FROM anon, authenticated;

-- ----------------------------------------------------------
-- Itens da compra
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.finance_purchase_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  expense_id UUID NOT NULL REFERENCES public.finance_expenses(id) ON DELETE RESTRICT,
  position INTEGER NOT NULL CHECK (position > 0),
  description TEXT NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 120),
  quantity NUMERIC(10, 3) NOT NULL CHECK (quantity > 0),
  unit_cents INTEGER NOT NULL CHECK (unit_cents >= 0),
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  CONSTRAINT finance_purchase_items_position UNIQUE (expense_id, position)
);

ALTER TABLE public.finance_purchase_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS finance_purchase_items_admin_read ON public.finance_purchase_items;
CREATE POLICY finance_purchase_items_admin_read ON public.finance_purchase_items
  FOR SELECT TO authenticated USING (public.can_manage_finance(clinic_id));
REVOKE ALL ON public.finance_purchase_items FROM anon, authenticated;
GRANT SELECT ON public.finance_purchase_items TO authenticated;

CREATE OR REPLACE FUNCTION public.finance_guard_purchase_items()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Item de compra não se edita nem se apaga: anule a compra com motivo.' USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_finance_purchase_items_guard ON public.finance_purchase_items;
CREATE TRIGGER trg_finance_purchase_items_guard
  BEFORE UPDATE OR DELETE ON public.finance_purchase_items
  FOR EACH ROW EXECUTE FUNCTION public.finance_guard_purchase_items();

-- ----------------------------------------------------------
-- Registrar a compra
--
-- p_items: [{ "description": "Água 20 L", "quantity": 2, "unit_cents": 1500 }]
-- Total do item = quantidade × valor, arredondado para o centavo (meio
-- para cima), a mesma conta de purchaseItemTotal em utils/finance.js.
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finance_register_purchase(
  p_category UUID,
  p_paid_on DATE,
  p_method TEXT,
  p_professional UUID,
  p_person UUID,
  p_note TEXT,
  p_items JSONB
)
RETURNS public.finance_expenses
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic UUID := public.finance_require_admin();
  v_row public.finance_expenses%ROWTYPE;
  v_count INTEGER;
  v_year INTEGER := EXTRACT(YEAR FROM public.finance_today())::INTEGER;
  v_next INTEGER;
  v_total BIGINT := 0;
  v_item RECORD;
  v_text TEXT;
  v_qty NUMERIC;
  v_unit NUMERIC;
  v_line BIGINT;
  v_first TEXT;
  v_summary TEXT;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Informe os itens da compra.' USING ERRCODE = '22023';
  END IF;
  v_count := jsonb_array_length(p_items);
  IF v_count < 1 OR v_count > 50 THEN
    RAISE EXCEPTION 'A compra tem de 1 a 50 itens.' USING ERRCODE = '22023';
  END IF;
  IF p_paid_on IS NULL OR p_paid_on > public.finance_today() THEN
    RAISE EXCEPTION 'A data da compra é hoje ou antes.' USING ERRCODE = '22023';
  END IF;
  IF p_method IS NULL OR p_method NOT IN ('pix', 'dinheiro', 'cartao_debito', 'cartao_credito', 'outro') THEN
    RAISE EXCEPTION 'Escolha a forma de pagamento.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.finance_expense_categories WHERE id = p_category AND clinic_id = v_clinic) THEN
    RAISE EXCEPTION 'Categoria de outra instituição.' USING ERRCODE = '42501';
  END IF;
  IF p_professional IS NOT NULL AND p_person IS NOT NULL THEN
    RAISE EXCEPTION 'Escolha só uma pessoa que comprou.' USING ERRCODE = '22023';
  END IF;
  IF p_professional IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_professional AND clinic_id = v_clinic) THEN
    RAISE EXCEPTION 'Profissional de outra instituição.' USING ERRCODE = '42501';
  END IF;
  IF p_person IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.finance_people WHERE id = p_person AND clinic_id = v_clinic) THEN
    RAISE EXCEPTION 'Pessoa de outra instituição.' USING ERRCODE = '42501';
  END IF;

  -- Confere todos os itens antes de gastar um número de recibo.
  FOR v_item IN SELECT value, ordinality FROM jsonb_array_elements(p_items) WITH ORDINALITY LOOP
    IF jsonb_typeof(v_item.value) <> 'object' THEN
      RAISE EXCEPTION 'Item % da compra está inválido.', v_item.ordinality USING ERRCODE = '22023';
    END IF;
    v_text := btrim(COALESCE(v_item.value ->> 'description', ''));
    IF length(v_text) < 1 OR length(v_text) > 120 THEN
      RAISE EXCEPTION 'Item %: descreva o que foi comprado (até 120 letras).', v_item.ordinality USING ERRCODE = '22023';
    END IF;
    IF COALESCE(v_item.value ->> 'quantity', '') !~ '^[0-9]{1,7}(\.[0-9]{1,3})?$'
       OR COALESCE(v_item.value ->> 'unit_cents', '') !~ '^[0-9]{1,9}$' THEN
      RAISE EXCEPTION 'Item %: quantidade ou valor inválido.', v_item.ordinality USING ERRCODE = '22023';
    END IF;
    v_qty := (v_item.value ->> 'quantity')::NUMERIC;
    v_unit := (v_item.value ->> 'unit_cents')::NUMERIC;
    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Item %: a quantidade tem de ser maior que zero.', v_item.ordinality USING ERRCODE = '22023';
    END IF;
    v_line := round(v_qty * v_unit)::BIGINT;
    IF v_line > 1000000000 THEN
      RAISE EXCEPTION 'Item %: valor alto demais.', v_item.ordinality USING ERRCODE = '22023';
    END IF;
    v_total := v_total + v_line;
  END LOOP;
  IF v_total <= 0 OR v_total > 1000000000 THEN
    RAISE EXCEPTION 'O total da compra tem de ser maior que zero.' USING ERRCODE = '22023';
  END IF;

  -- Número do recibo: a linha do contador trava até o fim da transação,
  -- então compra que falha não gasta número e duas compras não repetem.
  INSERT INTO public.finance_receipt_counters AS c (clinic_id, year, last_number)
  VALUES (v_clinic, v_year, 1)
  ON CONFLICT ON CONSTRAINT finance_receipt_counters_pkey
  DO UPDATE SET last_number = c.last_number + 1
  RETURNING c.last_number INTO v_next;

  v_first := btrim(p_items -> 0 ->> 'description');
  v_summary := CASE
    WHEN v_count = 1 THEN v_first
    ELSE left(v_first, 90) || ' + ' || (v_count - 1) || CASE WHEN v_count = 2 THEN ' item' ELSE ' itens' END
  END;

  INSERT INTO public.finance_expenses (
    clinic_id, category_id, description, professional_id, person_id, amount_cents,
    paid_on, method, note, recorded_by, paid_by, is_purchase, receipt_number
  ) VALUES (
    v_clinic, p_category, v_summary, p_professional, p_person, v_total::INTEGER,
    p_paid_on, p_method, NULLIF(btrim(COALESCE(p_note, '')), ''), auth.uid(), auth.uid(),
    TRUE, v_year::TEXT || '-' || lpad(v_next::TEXT, 6, '0')
  )
  RETURNING * INTO v_row;

  INSERT INTO public.finance_purchase_items (clinic_id, expense_id, position, description, quantity, unit_cents, total_cents)
  SELECT
    v_clinic,
    v_row.id,
    item.ordinality::INTEGER,
    btrim(item.value ->> 'description'),
    (item.value ->> 'quantity')::NUMERIC,
    (item.value ->> 'unit_cents')::INTEGER,
    round((item.value ->> 'quantity')::NUMERIC * (item.value ->> 'unit_cents')::NUMERIC)::INTEGER
  FROM jsonb_array_elements(p_items) WITH ORDINALITY AS item(value, ordinality);

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.finance_register_purchase(UUID, DATE, TEXT, UUID, UUID, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_register_purchase(UUID, DATE, TEXT, UUID, UUID, TEXT, JSONB) TO authenticated;

-- ----------------------------------------------------------
-- Verificação
-- ----------------------------------------------------------
SELECT
  to_regclass('public.finance_purchase_items') IS NOT NULL AS itens_criados,
  to_regclass('public.finance_receipt_counters') IS NOT NULL AS contador_criado,
  to_regprocedure('public.finance_register_purchase(uuid,date,text,uuid,uuid,text,jsonb)') IS NOT NULL AS funcao_criada,
  NOT has_table_privilege('authenticated', 'public.finance_purchase_items', 'INSERT') AS item_so_por_funcao,
  NOT has_table_privilege('authenticated', 'public.finance_receipt_counters', 'SELECT') AS contador_so_por_funcao;
