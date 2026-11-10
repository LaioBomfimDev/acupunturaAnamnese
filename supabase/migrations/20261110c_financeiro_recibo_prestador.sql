-- ============================================================
-- Financeiro: recibo de pagamento ao prestador (10/11/2026, etapa 2)
--
-- Modelo da clínica (07_Recibo_Pagamento_Prestador): quem recebeu da
-- clínica (terapeuta, diarista, autônomo, o encanador do conserto)
-- assina o recibo. Emitido à mão, a partir de uma saída já paga
-- (decisão da administradora: o repasse não gera recibo sozinho).
--
--  * Número próprio do prestador, sem buraco, na tabela de sequências
--    do comprovante do cliente (finance_sequences, kind 'provider'):
--    uma numeração por tipo, como pedido.
--  * O recibo guarda a própria cópia (nome, CPF/CNPJ, serviço, período,
--    valor, forma, data do pagamento, local): papel emitido não muda se
--    o cadastro mudar.
--  * Assinatura: só a marcação "assinado" (quem marcou e quando), sem
--    foto (decisão da administradora). O papel fica na pasta pelo número.
--  * Não se edita nem se apaga: anula com motivo e emite outro (número
--    novo). Uma saída tem no máximo um recibo de prestador valendo.
--
-- Reversão: DROP TABLE public.finance_provider_receipts (só tem dado
-- depois do primeiro uso) e as funções finance_*_provider_receipt.
-- ============================================================

-- ----------------------------------------------------------
-- 1. Sequência do prestador ao lado da do comprovante do cliente
-- ----------------------------------------------------------
DO $$
DECLARE
  v_name TEXT;
BEGIN
  FOR v_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.finance_sequences'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%voucher%'
  LOOP
    EXECUTE format('ALTER TABLE public.finance_sequences DROP CONSTRAINT %I', v_name);
  END LOOP;
END;
$$;

ALTER TABLE public.finance_sequences
  ADD CONSTRAINT finance_sequences_kind_check CHECK (kind IN ('voucher', 'provider'));

-- ----------------------------------------------------------
-- 2. Recibo do prestador
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.finance_provider_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  expense_id UUID NOT NULL REFERENCES public.finance_expenses(id) ON DELETE RESTRICT,
  number INTEGER NOT NULL CHECK (number > 0),
  provider_name TEXT NOT NULL CHECK (length(btrim(provider_name)) BETWEEN 2 AND 120),
  -- CPF (11 números) ou CNPJ (12 letras/números + 2 dígitos, alfanumérico desde 07/2026).
  provider_document TEXT CHECK (provider_document IS NULL OR provider_document ~ '^([0-9]{11}|[0-9A-Z]{12}[0-9]{2})$'),
  services TEXT NOT NULL CHECK (length(btrim(services)) BETWEEN 2 AND 300),
  period_text TEXT CHECK (period_text IS NULL OR length(period_text) <= 120),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  method TEXT NOT NULL,
  paid_on DATE NOT NULL,
  place_label TEXT CHECK (place_label IS NULL OR length(place_label) <= 60),
  issued_on DATE NOT NULL,
  signed_at TIMESTAMPTZ,
  signed_by UUID REFERENCES public.profiles(id),
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  voided_at TIMESTAMPTZ,
  voided_by UUID REFERENCES public.profiles(id),
  void_reason TEXT,
  CONSTRAINT finance_provider_receipts_number_unique UNIQUE (clinic_id, number),
  CONSTRAINT finance_provider_receipts_signed CHECK ((signed_at IS NULL) = (signed_by IS NULL)),
  CONSTRAINT finance_provider_receipts_void_reason CHECK ((voided_at IS NULL) = (void_reason IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_provider_receipts_live
  ON public.finance_provider_receipts (expense_id) WHERE voided_at IS NULL;

ALTER TABLE public.finance_provider_receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS finance_provider_receipts_admin_read ON public.finance_provider_receipts;
CREATE POLICY finance_provider_receipts_admin_read ON public.finance_provider_receipts
  FOR SELECT TO authenticated USING (public.can_manage_finance(clinic_id));
REVOKE ALL ON public.finance_provider_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.finance_provider_receipts TO authenticated;

-- Só muda para ser marcado como assinado (uma vez) ou anulado.
CREATE OR REPLACE FUNCTION public.finance_guard_provider_receipts()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_sign_cols TEXT[] := ARRAY['signed_at', 'signed_by'];
  v_void_cols TEXT[] := ARRAY['voided_at', 'voided_by', 'void_reason'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Recibo não se apaga: anule com motivo.' USING ERRCODE = '42501';
  END IF;
  IF OLD.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'Recibo anulado não muda mais.' USING ERRCODE = '42501';
  END IF;
  IF NEW.voided_at IS NOT NULL THEN
    IF (to_jsonb(NEW) - v_void_cols) IS DISTINCT FROM (to_jsonb(OLD) - v_void_cols) THEN
      RAISE EXCEPTION 'Ao anular, nada além da anulação muda.' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.signed_at IS NULL AND NEW.signed_at IS NOT NULL
     AND (to_jsonb(NEW) - v_sign_cols) IS NOT DISTINCT FROM (to_jsonb(OLD) - v_sign_cols) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Recibo emitido não se edita: anule e emita outro.' USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_finance_provider_receipts_guard ON public.finance_provider_receipts;
CREATE TRIGGER trg_finance_provider_receipts_guard
  BEFORE UPDATE OR DELETE ON public.finance_provider_receipts
  FOR EACH ROW EXECUTE FUNCTION public.finance_guard_provider_receipts();

-- ----------------------------------------------------------
-- 3. Emitir, marcar assinado, anular (só a administração)
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finance_issue_provider_receipt(
  p_expense UUID,
  p_provider_name TEXT,
  p_provider_document TEXT,
  p_services TEXT,
  p_period TEXT,
  p_place TEXT
)
RETURNS public.finance_provider_receipts
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic UUID := public.finance_require_admin();
  v_expense public.finance_expenses%ROWTYPE;
  v_doc TEXT := NULLIF(upper(regexp_replace(COALESCE(p_provider_document, ''), '[^0-9A-Za-z]', '', 'g')), '');
  v_number INTEGER;
  v_row public.finance_provider_receipts%ROWTYPE;
BEGIN
  SELECT * INTO v_expense FROM public.finance_expenses
  WHERE id = p_expense AND clinic_id = v_clinic
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Saída não encontrada.' USING ERRCODE = 'P0002';
  END IF;
  IF v_expense.voided_at IS NOT NULL OR v_expense.skipped OR v_expense.paid_on IS NULL THEN
    RAISE EXCEPTION 'Recibo de prestador só sai de saída paga e valendo.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.finance_provider_receipts WHERE expense_id = p_expense AND voided_at IS NULL) THEN
    RAISE EXCEPTION 'Esta saída já tem recibo de prestador. Anule o anterior para emitir outro.' USING ERRCODE = '23505';
  END IF;
  IF length(btrim(COALESCE(p_provider_name, ''))) < 2 THEN
    RAISE EXCEPTION 'Escreva o nome de quem recebeu.' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(COALESCE(p_services, ''))) < 2 THEN
    RAISE EXCEPTION 'Escreva o serviço prestado.' USING ERRCODE = '22023';
  END IF;
  IF v_doc IS NOT NULL AND v_doc !~ '^([0-9]{11}|[0-9A-Z]{12}[0-9]{2})$' THEN
    RAISE EXCEPTION 'CPF tem 11 números; CNPJ tem 14 caracteres.' USING ERRCODE = '22023';
  END IF;

  -- Confere tudo antes de gastar o número; a linha da sequência trava até o fim.
  INSERT INTO public.finance_sequences AS s (clinic_id, kind, last_value)
  VALUES (v_clinic, 'provider', 1)
  ON CONFLICT ON CONSTRAINT finance_sequences_pkey DO UPDATE SET last_value = s.last_value + 1
  RETURNING s.last_value INTO v_number;

  INSERT INTO public.finance_provider_receipts (
    clinic_id, expense_id, number, provider_name, provider_document, services, period_text,
    amount_cents, method, paid_on, place_label, issued_on, created_by
  ) VALUES (
    v_clinic, p_expense, v_number, btrim(p_provider_name), v_doc, btrim(p_services),
    NULLIF(btrim(COALESCE(p_period, '')), ''),
    v_expense.amount_cents, v_expense.method, v_expense.paid_on,
    NULLIF(btrim(COALESCE(p_place, '')), ''), public.finance_today(), auth.uid()
  )
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.finance_sign_provider_receipt(p_receipt UUID)
RETURNS public.finance_provider_receipts
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic UUID := public.finance_require_admin();
  v_row public.finance_provider_receipts%ROWTYPE;
BEGIN
  UPDATE public.finance_provider_receipts
  SET signed_at = timezone('utc', now()), signed_by = auth.uid()
  WHERE id = p_receipt AND clinic_id = v_clinic AND voided_at IS NULL AND signed_at IS NULL
  RETURNING * INTO v_row;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recibo não encontrado, anulado ou já marcado como assinado.' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.finance_void_provider_receipt(p_receipt UUID, p_reason TEXT)
RETURNS public.finance_provider_receipts
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic UUID := public.finance_require_admin();
  v_row public.finance_provider_receipts%ROWTYPE;
BEGIN
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'Diga o motivo da anulação.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.finance_provider_receipts
  SET voided_at = timezone('utc', now()), voided_by = auth.uid(), void_reason = btrim(p_reason)
  WHERE id = p_receipt AND clinic_id = v_clinic AND voided_at IS NULL
  RETURNING * INTO v_row;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recibo não encontrado ou já anulado.' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_row;
END;
$$;

DO $$
DECLARE
  v_signature TEXT;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.finance_issue_provider_receipt(UUID, TEXT, TEXT, TEXT, TEXT, TEXT)',
    'public.finance_sign_provider_receipt(UUID)',
    'public.finance_void_provider_receipt(UUID, TEXT)'
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
  to_regclass('public.finance_provider_receipts') IS NOT NULL AS recibo_criado,
  to_regprocedure('public.finance_issue_provider_receipt(uuid,text,text,text,text,text)') IS NOT NULL AS emitir_criado,
  to_regprocedure('public.finance_sign_provider_receipt(uuid)') IS NOT NULL AS assinar_criado,
  to_regprocedure('public.finance_void_provider_receipt(uuid,text)') IS NOT NULL AS anular_criado,
  NOT has_table_privilege('authenticated', 'public.finance_provider_receipts', 'INSERT') AS so_por_funcao,
  NOT has_function_privilege('anon', 'public.finance_issue_provider_receipt(uuid,text,text,text,text,text)', 'EXECUTE') AS anon_bloqueado;
