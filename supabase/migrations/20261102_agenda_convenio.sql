-- ==========================================================
-- Agenda com particular ou convênio (02/11/2026)
-- REQUER: 20261023_financeiro_etapa1.sql (finance_charge_appointment,
-- finance_adjust_charge), 20261024_appointment_package_info.sql e
-- 20261031_convenios_fase1.sql (patient_coverages, can_edit_patient_registry,
-- código TUSS em convenio_procedure_prices).
--
-- Escolha da administradora: banco A (uma cobrança só, com "quem paga")
-- + tela A (campo "Como paga" logo abaixo de Paciente).
--
-- O que muda:
--  * appointments ganha coverage_id (carteira do paciente). Gatilho
--    confere: convênio exige operadora; operadora da mesma clínica;
--    carteira do mesmo paciente, da mesma clínica e da mesma operadora.
--  * appointment_charges ganha quem paga (payer 'patient' | 'convenio'),
--    a operadora, a carteira e o código do procedimento (tabela, código,
--    termo) copiados no dia em que o atendimento vira Atendido.
--  * finance_charge_appointment (recriada a partir de 20261023, a mais
--    nova; 20261024 não a recria): atendimento de convênio grava o preço
--    da operadora (o tipo vence o padrão da área: finance_convenio_price
--    ↔ resolveConvenioPrice em utils/convenio.js), não gasta sessão de
--    pacote particular e, sem preço cadastrado, grava price_cents NULL
--    ("sem valor" para a administração resolver).
--  * Repasse: finance_charge_payout é o ponto ÚNICO da decisão. Hoje
--    convênio usa a mesma regra do particular sobre o valor da operadora
--    (decisão pendente da administradora; trocar só ali).
--  * Mudar quem paga num atendimento já Atendido refaz a cobrança, se
--    ainda não tem pagamento; com pagamento, barra.
--  * convenio_price_check: quem edita o cadastro sabe se a operadora tem
--    preço para a área e o código TUSS; o valor só a administração.
--  * appointment_package_info (recriada a partir de 20261024): atendimento
--    de convênio não mostra pacote particular.
--
-- Exclusão de paciente: nenhuma tabela nova com patient_id.
-- appointment_charges segue KEPT_ON_PURPOSE; as colunas novas apontam
-- para patient_coverages com ON DELETE SET NULL, então a exclusão
-- aprovada (que apaga patient_coverages) continua passando.
--
-- Reverter: recriar finance_charge_appointment e finance_adjust_charge de
-- 20261023, appointment_package_info de 20261024, DROP dos gatilhos e
-- funções novas e das colunas novas.
-- ==========================================================

DO $requires$
BEGIN
  IF to_regclass('public.patient_coverages') IS NULL
     OR to_regclass('public.appointment_charges') IS NULL
     OR to_regprocedure('public.can_edit_patient_registry(uuid, uuid)') IS NULL
     OR to_regprocedure('public.appointment_package_info(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Aplique antes 20261023, 20261024 e 20261031.';
  END IF;
  -- Nenhum agendamento de convênio sem operadora: o gatilho novo exige.
  IF EXISTS (SELECT 1 FROM public.appointments WHERE billing_type = 'convenio' AND convenio_id IS NULL) THEN
    RAISE EXCEPTION 'Há agendamento de convênio sem operadora: corrigir antes.';
  END IF;
END;
$requires$;

-- ----------------------------------------------------------
-- 1. Agendamento: carteira do paciente
-- ----------------------------------------------------------
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS coverage_id UUID REFERENCES public.patient_coverages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_coverage
  ON public.appointments (coverage_id) WHERE coverage_id IS NOT NULL;

-- Particular não leva carteira (o par de appointments_billing_convenio_shape).
ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_billing_coverage_shape;
ALTER TABLE public.appointments ADD CONSTRAINT appointments_billing_coverage_shape
  CHECK (billing_type = 'convenio' OR coverage_id IS NULL);

CREATE OR REPLACE FUNCTION public.appointments_payer_check()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coverage public.patient_coverages%ROWTYPE;
BEGIN
  IF NEW.billing_type IS DISTINCT FROM 'convenio' THEN
    RETURN NEW;
  END IF;

  IF NEW.kind IS DISTINCT FROM 'appointment' OR NEW.patient_id IS NULL THEN
    RAISE EXCEPTION 'convenio_sem_paciente: bloqueio de horário não tem convênio.' USING ERRCODE = '22023';
  END IF;
  IF NEW.convenio_id IS NULL THEN
    RAISE EXCEPTION 'convenio_sem_operadora: atendimento de convênio precisa da operadora.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clinic_convenios c WHERE c.id = NEW.convenio_id AND c.clinic_id = NEW.clinic_id
  ) THEN
    RAISE EXCEPTION 'convenio_de_outra_clinica' USING ERRCODE = '22023';
  END IF;

  IF NEW.coverage_id IS NOT NULL THEN
    SELECT * INTO v_coverage FROM public.patient_coverages cv WHERE cv.id = NEW.coverage_id;
    IF NOT FOUND OR v_coverage.patient_id IS DISTINCT FROM NEW.patient_id
       OR v_coverage.clinic_id IS DISTINCT FROM NEW.clinic_id THEN
      RAISE EXCEPTION 'carteira_de_outro_paciente' USING ERRCODE = '22023';
    END IF;
    IF v_coverage.convenio_id IS DISTINCT FROM NEW.convenio_id THEN
      RAISE EXCEPTION 'carteira_de_outra_operadora' USING ERRCODE = '22023';
    END IF;
    -- Carteira desativada não entra em agendamento novo; o que já
    -- estava gravado com ela segue valendo.
    IF NOT v_coverage.active
       AND (TG_OP = 'INSERT' OR OLD.coverage_id IS DISTINCT FROM NEW.coverage_id) THEN
      RAISE EXCEPTION 'carteira_desativada' USING ERRCODE = '22023';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.appointments_payer_check() FROM PUBLIC, anon, authenticated;

-- Nome depois de trg_appointments_defaults (ordem alfabética): clinic_id
-- já vem preenchido quando este roda.
DROP TRIGGER IF EXISTS trg_appointments_payer_check ON public.appointments;
CREATE TRIGGER trg_appointments_payer_check
  BEFORE INSERT OR UPDATE OF billing_type, convenio_id, coverage_id, patient_id, kind ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.appointments_payer_check();

-- ----------------------------------------------------------
-- 2. Cobrança: quem paga
-- ----------------------------------------------------------
ALTER TABLE public.appointment_charges
  ADD COLUMN IF NOT EXISTS payer TEXT NOT NULL DEFAULT 'patient',
  ADD COLUMN IF NOT EXISTS convenio_id UUID REFERENCES public.clinic_convenios(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS coverage_id UUID REFERENCES public.patient_coverages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tuss_table TEXT,
  ADD COLUMN IF NOT EXISTS tuss_code TEXT,
  ADD COLUMN IF NOT EXISTS tuss_term TEXT;

ALTER TABLE public.appointment_charges DROP CONSTRAINT IF EXISTS appointment_charges_payer_check;
ALTER TABLE public.appointment_charges ADD CONSTRAINT appointment_charges_payer_check
  CHECK (payer IN ('patient', 'convenio'));

-- Um ramo por tipo, com IS NOT NULL explícito (§9 do AGENTS.md: num
-- CHECK, NULL ~ '...' dá desconhecido e a linha passaria).
--   paciente: nada de operadora, carteira nem código.
--   convênio: operadora obrigatória; código só com a tabela dele;
--             restante de pacote nunca é de convênio.
ALTER TABLE public.appointment_charges DROP CONSTRAINT IF EXISTS appointment_charges_payer_shape;
ALTER TABLE public.appointment_charges ADD CONSTRAINT appointment_charges_payer_shape CHECK (
  (payer = 'patient'
    AND convenio_id IS NULL AND coverage_id IS NULL
    AND tuss_table IS NULL AND tuss_code IS NULL AND tuss_term IS NULL)
  OR (payer = 'convenio'
    AND convenio_id IS NOT NULL
    AND source = 'appointment'
    AND package_id IS NULL
    AND (tuss_code IS NULL OR (tuss_table IS NOT NULL AND tuss_table IN ('22', '00'))))
);

CREATE INDEX IF NOT EXISTS idx_appointment_charges_convenio
  ON public.appointment_charges (convenio_id) WHERE convenio_id IS NOT NULL;

-- ----------------------------------------------------------
-- 3. Preço da operadora: o tipo vence o padrão da área
-- Espelho na tela: resolveConvenioPrice (utils/convenio.js). Mudou um,
-- muda o outro.
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finance_convenio_price(
  p_convenio UUID,
  p_discipline TEXT,
  p_type TEXT
)
RETURNS SETOF public.convenio_procedure_prices
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cp.*
  FROM public.convenio_procedure_prices cp
  WHERE cp.convenio_id = p_convenio
    AND cp.discipline = p_discipline
    AND (cp.appointment_type IS NULL OR cp.appointment_type = p_type)
  ORDER BY (cp.appointment_type IS NULL)
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.finance_convenio_price(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------
-- 4. Repasse: ponto ÚNICO da decisão
--
-- DECISÃO PENDENTE da administradora (02/11/2026): no atendimento de
-- convênio, o repasse de quem atende usa, por ora, a MESMA regra do
-- particular (finance_payout_rules: %, valor fixo, salário ou nada),
-- calculada sobre o valor da operadora. Sem preço da operadora, o %
-- dá 0 até a administração definir o valor. Para trocar a regra (ex.:
-- % próprio de convênio, ou repasse só quando a operadora pagar), mude
-- só o ramo de p_payer = 'convenio' abaixo.
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finance_charge_payout(
  p_clinic UUID,
  p_professional UUID,
  p_discipline TEXT,
  p_type TEXT,
  p_price INTEGER,
  p_payer TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_payer = 'convenio' THEN
    -- Regra provisória: igual ao particular, sobre o valor da operadora.
    RETURN public.finance_payout_for(p_clinic, p_professional, p_discipline, p_type, p_price);
  END IF;
  RETURN public.finance_payout_for(p_clinic, p_professional, p_discipline, p_type, p_price);
END;
$$;

REVOKE ALL ON FUNCTION public.finance_charge_payout(UUID, UUID, TEXT, TEXT, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------
-- 5. Cobrança do atendimento (recriada a partir de 20261023)
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finance_charge_appointment(p_appointment UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_appt public.appointments%ROWTYPE;
  v_settings public.clinic_finance_settings%ROWTYPE;
  v_charge public.appointment_charges%ROWTYPE;
  v_package public.patient_packages%ROWTYPE;
  v_cprice public.convenio_procedure_prices%ROWTYPE;
  v_day DATE;
  v_done INTEGER := 0;
  v_used INTEGER := 0;
  v_remaining INTEGER;
  v_left INTEGER;
  v_price INTEGER;
  v_payout INTEGER;
  v_package_id UUID := NULL;
  v_session INTEGER := NULL;
  v_payer TEXT := 'patient';
  v_convenio UUID := NULL;
  v_coverage UUID := NULL;
  v_tuss_table TEXT := NULL;
  v_tuss_code TEXT := NULL;
  v_tuss_term TEXT := NULL;
BEGIN
  SELECT * INTO v_appt FROM public.appointments WHERE id = p_appointment;
  IF NOT FOUND OR v_appt.kind IS DISTINCT FROM 'appointment' OR v_appt.patient_id IS NULL
     OR v_appt.status IS DISTINCT FROM 'attended' THEN
    RETURN;
  END IF;

  SELECT * INTO v_settings FROM public.clinic_finance_settings WHERE clinic_id = v_appt.clinic_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_day := (v_appt.starts_at AT TIME ZONE 'America/Sao_Paulo')::date;
  IF v_day < v_settings.starts_on THEN
    RETURN;
  END IF;

  SELECT * INTO v_charge FROM public.appointment_charges WHERE appointment_id = p_appointment FOR UPDATE;
  IF FOUND AND v_charge.voided_at IS NULL THEN
    RETURN;
  END IF;

  IF v_appt.billing_type = 'convenio' AND v_appt.convenio_id IS NOT NULL THEN
    -- Convênio: preço da operadora, código do procedimento copiado, e
    -- nenhum pacote particular é gasto. Sem preço, price_cents NULL.
    v_payer := 'convenio';
    v_convenio := v_appt.convenio_id;
    v_coverage := v_appt.coverage_id;
    SELECT * INTO v_cprice
    FROM public.finance_convenio_price(v_appt.convenio_id, v_appt.discipline, v_appt.appointment_type);
    IF FOUND THEN
      v_price := v_cprice.price_cents;
      IF v_cprice.tuss_code IS NOT NULL THEN
        v_tuss_table := v_cprice.tuss_table;
        v_tuss_code := v_cprice.tuss_code;
        v_tuss_term := v_cprice.tuss_term;
      END IF;
    ELSE
      v_price := NULL;
    END IF;
  ELSE
    SELECT * INTO v_package
    FROM public.patient_packages p
    WHERE p.clinic_id = v_appt.clinic_id
      AND p.patient_id = v_appt.patient_id
      AND p.discipline = v_appt.discipline
      AND p.status = 'active'
      AND p.sold_on <= v_day
      AND (p.professional_id IS NULL OR p.professional_id = v_appt.professional_id)
      AND (cardinality(p.appointment_types) = 0 OR v_appt.appointment_type = ANY (p.appointment_types))
    ORDER BY p.sold_on, p.created_at
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
      SELECT count(*), COALESCE(sum(c.price_cents), 0)
        INTO v_done, v_used
      FROM public.appointment_charges c
      WHERE c.package_id = v_package.id AND c.voided_at IS NULL;

      IF v_done < v_package.sessions_planned THEN
        -- Parte da sessão = o que falta do valor ÷ as sessões que faltam na
        -- previsão. A última prevista leva o resto: a soma fecha no total.
        v_remaining := v_package.total_cents - v_package.discount_cents - v_used;
        v_left := v_package.sessions_planned - v_done;
        v_price := CASE
          WHEN v_remaining <= 0 THEN 0
          WHEN v_left <= 1 THEN v_remaining
          ELSE v_remaining / v_left
        END;
        v_package_id := v_package.id;
        v_session := v_done + 1;
      ELSIF v_package.over_plan = 'free' THEN
        -- Passou do previsto num valor fechado: a sessão não cobra.
        v_price := 0;
        v_package_id := v_package.id;
        v_session := v_done + 1;
      END IF;
    END IF;

    IF v_package_id IS NULL THEN
      v_price := public.finance_resolve_price(v_appt.clinic_id, v_appt.discipline, v_appt.appointment_type, v_appt.professional_id);
    END IF;
  END IF;

  v_payout := public.finance_charge_payout(v_appt.clinic_id, v_appt.professional_id, v_appt.discipline, v_appt.appointment_type, v_price, v_payer);

  IF v_charge.id IS NOT NULL THEN
    UPDATE public.appointment_charges
    SET patient_id = v_appt.patient_id,
        professional_id = v_appt.professional_id,
        discipline = v_appt.discipline,
        appointment_type = v_appt.appointment_type,
        service_on = v_day,
        package_id = v_package_id,
        session_number = v_session,
        price_cents = v_price,
        payout_cents = v_payout,
        payer = v_payer,
        convenio_id = v_convenio,
        coverage_id = v_coverage,
        tuss_table = v_tuss_table,
        tuss_code = v_tuss_code,
        tuss_term = v_tuss_term,
        adjusted_at = NULL,
        adjusted_by = NULL,
        adjust_reason = NULL,
        voided_at = NULL,
        void_reason = NULL
    WHERE id = v_charge.id;
  ELSE
    INSERT INTO public.appointment_charges (
      clinic_id, appointment_id, patient_id, professional_id, discipline, appointment_type,
      service_on, source, package_id, session_number, price_cents, payout_cents,
      payer, convenio_id, coverage_id, tuss_table, tuss_code, tuss_term
    ) VALUES (
      v_appt.clinic_id, v_appt.id, v_appt.patient_id, v_appt.professional_id, v_appt.discipline, v_appt.appointment_type,
      v_day, 'appointment', v_package_id, v_session, v_price, v_payout,
      v_payer, v_convenio, v_coverage, v_tuss_table, v_tuss_code, v_tuss_term
    );
  END IF;

  -- Pacote de sessões contadas fecha sozinho na última sessão.
  IF v_package_id IS NOT NULL AND v_package.kind = 'counted' AND v_session >= v_package.sessions_planned THEN
    UPDATE public.patient_packages
    SET status = 'completed', close_action = 'auto', closed_at = timezone('utc', now())
    WHERE id = v_package_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.finance_charge_appointment(UUID) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------
-- 6. Ajuste de valor (recriada a partir de 20261023): repasse pelo
--    mesmo ponto único da decisão.
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finance_adjust_charge(p_charge UUID, p_price_cents INTEGER, p_reason TEXT)
RETURNS public.appointment_charges
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic UUID := public.finance_require_admin();
  v_charge public.appointment_charges%ROWTYPE;
  v_paid INTEGER;
BEGIN
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'Diga o motivo do ajuste.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_charge FROM public.appointment_charges WHERE id = p_charge AND clinic_id = v_clinic FOR UPDATE;
  IF NOT FOUND OR v_charge.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'Atendimento não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF v_charge.package_id IS NOT NULL THEN
    RAISE EXCEPTION 'Sessão de pacote não muda de valor: mude a previsão ou encerre o pacote.' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(sum(amount_cents), 0) INTO v_paid
  FROM public.finance_receipts WHERE charge_id = p_charge AND voided_at IS NULL;

  IF p_price_cents IS NULL OR p_price_cents < v_paid THEN
    RAISE EXCEPTION 'O valor não pode ficar abaixo do que já foi pago.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.appointment_charges
  SET price_cents = p_price_cents,
      payout_cents = public.finance_charge_payout(v_clinic, professional_id, discipline, appointment_type, p_price_cents, payer),
      adjusted_at = timezone('utc', now()),
      adjusted_by = auth.uid(),
      adjust_reason = btrim(p_reason)
  WHERE id = p_charge
  RETURNING * INTO v_charge;
  RETURN v_charge;
END;
$$;

-- ----------------------------------------------------------
-- 7. Mudou quem paga num atendimento já Atendido: refaz a cobrança
--
-- Sem isto, atendimento marcado como Atendido e só depois corrigido para
-- convênio continuava cobrando o paciente. Com pagamento lançado, barra:
-- primeiro se anula o pagamento no Financeiro. Trocar só a carteira
-- (mesma operadora) atualiza a cópia da cobrança.
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finance_on_appointment_billing()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.kind IS DISTINCT FROM 'appointment' OR NEW.patient_id IS NULL
     OR OLD.status IS DISTINCT FROM 'attended' OR NEW.status IS DISTINCT FROM 'attended' THEN
    RETURN NULL;
  END IF;

  -- Exclusão de paciente aprovada (apaga a carteira, que vira NULL aqui).
  IF EXISTS (
    SELECT 1 FROM public.patient_deletion_requests d
    WHERE d.patient_id = NEW.patient_id AND d.status = 'approved'
  ) THEN
    RETURN NULL;
  END IF;

  IF OLD.billing_type IS DISTINCT FROM NEW.billing_type OR OLD.convenio_id IS DISTINCT FROM NEW.convenio_id THEN
    IF EXISTS (
      SELECT 1
      FROM public.appointment_charges c
      JOIN public.finance_receipts r ON r.charge_id = c.id AND r.voided_at IS NULL
      WHERE c.appointment_id = NEW.id
    ) THEN
      RAISE EXCEPTION 'appointment_has_payment: este atendimento tem pagamento registrado. Anule o pagamento no Financeiro antes de mudar quem paga.'
        USING ERRCODE = '23503';
    END IF;
    PERFORM public.finance_void_appointment_charge(NEW.id, 'Mudou quem paga o atendimento.');
    PERFORM public.finance_charge_appointment(NEW.id);
  ELSIF OLD.coverage_id IS DISTINCT FROM NEW.coverage_id THEN
    UPDATE public.appointment_charges
    SET coverage_id = NEW.coverage_id
    WHERE appointment_id = NEW.id AND voided_at IS NULL AND payer = 'convenio';
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.finance_on_appointment_billing() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_appointments_finance_billing ON public.appointments;
CREATE TRIGGER trg_appointments_finance_billing
  AFTER UPDATE OF billing_type, convenio_id, coverage_id ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.finance_on_appointment_billing();

-- ----------------------------------------------------------
-- 8. A Agenda pergunta se a operadora tem preço
--
-- O preço da operadora é só da administração (RLS de 20260908/20261031).
-- Quem marca o atendimento (cadastro da clínica) precisa saber se a
-- operadora tem preço para a área, para avisar antes. O valor só sai
-- para a administração (can_manage_finance).
-- Nomes de saída em português: não colidem com as colunas da tabela.
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.convenio_price_check(
  p_convenio UUID,
  p_discipline TEXT,
  p_type TEXT DEFAULT NULL
)
RETURNS TABLE (
  tem_preco BOOLEAN,
  do_tipo BOOLEAN,
  tabela TEXT,
  codigo TEXT,
  termo TEXT,
  valor_centavos INTEGER
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic UUID;
  v_price public.convenio_procedure_prices%ROWTYPE;
BEGIN
  SELECT c.clinic_id INTO v_clinic FROM public.clinic_convenios c WHERE c.id = p_convenio;
  IF v_clinic IS NULL OR NOT public.can_edit_patient_registry(v_clinic) THEN
    RAISE EXCEPTION 'Operadora não encontrada nesta instituição.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_price FROM public.finance_convenio_price(p_convenio, p_discipline, NULLIF(p_type, ''));
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, FALSE, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::INTEGER;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    TRUE,
    v_price.appointment_type IS NOT NULL,
    v_price.tuss_table,
    v_price.tuss_code,
    v_price.tuss_term,
    CASE WHEN public.can_manage_finance(v_clinic) THEN v_price.price_cents ELSE NULL END;
END;
$$;

REVOKE ALL ON FUNCTION public.convenio_price_check(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.convenio_price_check(UUID, TEXT, TEXT) TO authenticated;

-- ----------------------------------------------------------
-- 9. "Sessão 3 de 10" (recriada a partir de 20261024): convênio não
--    gasta pacote particular, então não mostra pacote.
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.appointment_package_info(p_appointment UUID)
RETURNS TABLE (
  pacote TEXT,
  tipo TEXT,
  sessao INTEGER,
  previstas INTEGER,
  feitas INTEGER
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_appt public.appointments%ROWTYPE;
  v_charge public.appointment_charges%ROWTYPE;
  v_package public.patient_packages%ROWTYPE;
  v_day DATE;
BEGIN
  SELECT * INTO v_appt FROM public.appointments a WHERE a.id = p_appointment;
  IF NOT FOUND OR v_appt.kind IS DISTINCT FROM 'appointment' OR v_appt.patient_id IS NULL
     OR NOT public.can_manage_agenda(v_appt.clinic_id) THEN
    RETURN;
  END IF;

  SELECT * INTO v_charge FROM public.appointment_charges c
  WHERE c.appointment_id = p_appointment AND c.voided_at IS NULL;

  IF FOUND THEN
    IF v_charge.package_id IS NULL THEN
      RETURN;
    END IF;
    SELECT * INTO v_package FROM public.patient_packages p WHERE p.id = v_charge.package_id;
    RETURN QUERY SELECT v_package.name, v_package.kind, v_charge.session_number, v_package.sessions_planned,
      (SELECT count(*)::INTEGER FROM public.appointment_charges c
       WHERE c.package_id = v_package.id AND c.voided_at IS NULL AND c.source = 'appointment');
    RETURN;
  END IF;

  -- Falta e cancelamento não gastam sessão: não mostram pacote.
  IF v_appt.status IN ('cancelled', 'no_show', 'excused') THEN
    RETURN;
  END IF;

  -- Convênio não gasta pacote particular (finance_charge_appointment).
  IF v_appt.billing_type = 'convenio' THEN
    RETURN;
  END IF;

  v_day := (v_appt.starts_at AT TIME ZONE 'America/Sao_Paulo')::date;
  SELECT * INTO v_package
  FROM public.patient_packages p
  WHERE p.clinic_id = v_appt.clinic_id
    AND p.patient_id = v_appt.patient_id
    AND p.discipline = v_appt.discipline
    AND p.status = 'active'
    AND p.sold_on <= v_day
    AND (p.professional_id IS NULL OR p.professional_id = v_appt.professional_id)
    AND (cardinality(p.appointment_types) = 0 OR v_appt.appointment_type = ANY (p.appointment_types))
  ORDER BY p.sold_on, p.created_at
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY SELECT v_package.name, v_package.kind, NULL::INTEGER, v_package.sessions_planned,
    (SELECT count(*)::INTEGER FROM public.appointment_charges c
     WHERE c.package_id = v_package.id AND c.voided_at IS NULL AND c.source = 'appointment');
END;
$$;

REVOKE ALL ON FUNCTION public.appointment_package_info(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.appointment_package_info(UUID) TO authenticated;

-- ----------------------------------------------------------
-- 10. Conferência
-- ----------------------------------------------------------
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'appointments' AND column_name = 'coverage_id') AS agenda_tem_carteira,
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'appointment_charges' AND column_name = 'payer') AS cobranca_tem_quem_paga,
  to_regprocedure('public.convenio_price_check(uuid, text, text)') IS NOT NULL AS conferencia_de_preco,
  has_function_privilege('authenticated', 'public.convenio_price_check(uuid, text, text)', 'EXECUTE') AS equipe_confere_preco,
  NOT has_function_privilege('anon', 'public.convenio_price_check(uuid, text, text)', 'EXECUTE') AS anon_bloqueado,
  NOT has_function_privilege('authenticated', 'public.finance_convenio_price(uuid, text, text)', 'EXECUTE') AS preco_cru_fechado,
  position('finance_charge_payout' IN pg_get_functiondef('public.finance_charge_appointment(uuid)'::regprocedure)) > 0 AS repasse_ponto_unico;
