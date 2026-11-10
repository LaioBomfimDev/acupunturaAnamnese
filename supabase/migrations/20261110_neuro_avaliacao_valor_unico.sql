-- ==========================================================
-- Avaliação neuropsicológica com valor único (10/11/2026, caminho A)
--
-- Pedido da administradora: na Neuropsicologia a avaliação inteira tem um
-- valor só, não importa quantas sessões. A anamnese cobra, as sessões
-- (10 liberadas por padrão, dá para liberar mais) já ficam pagas e a
-- devolutiva finaliza.
--
-- Como: o primeiro atendimento de Neuropsicologia que vira Atendido sem
-- avaliação aberta abre um pacote kind = 'assessment' (pagamento "a cada
-- sessão", então o valor completo fica a receber nesse atendimento). Os
-- atendimentos seguintes entram no mesmo pacote com R$ 0; passar das
-- liberadas também não cobra. A Devolutiva Atendida encerra.
--   * Valor = "Valor da avaliação completa" da tela Valores (linha padrão
--     da Neuropsicologia em procedure_prices). Sem valor, nada muda.
--   * Liberadas = clinic_finance_settings.neuro_sessions_included (padrão
--     10); o pacote nasce com liberadas + 2 (anamnese e devolutiva).
--   * "Liberar mais" = finance_update_package_plan, que passa a aceitar
--     a avaliação.
--   * Transição: paciente com atendimento de Neuropsicologia cobrado fora
--     de pacote nos últimos 90 dias abre a avaliação com desconto total.
--   * Convênio segue sem pacote particular (nada muda).
--
-- finance_charge_appointment parte da última versão (20261102). Espelho:
-- packageShare em frontend/src/utils/finance.js (mudou um, muda o outro).
-- Validação: supabase/validation/20261110_neuro_avaliacao_scenarios.sql
-- ==========================================================

-- ----------------------------------------------------------
-- 1. Sessões liberadas por padrão
-- ----------------------------------------------------------
ALTER TABLE public.clinic_finance_settings
  ADD COLUMN IF NOT EXISTS neuro_sessions_included INTEGER NOT NULL DEFAULT 10;

ALTER TABLE public.clinic_finance_settings DROP CONSTRAINT IF EXISTS clinic_finance_settings_neuro_sessions;
ALTER TABLE public.clinic_finance_settings ADD CONSTRAINT clinic_finance_settings_neuro_sessions
  CHECK (neuro_sessions_included BETWEEN 1 AND 98);

-- ----------------------------------------------------------
-- 2. Pacote do tipo avaliação
-- ----------------------------------------------------------
-- A trava antiga de kind sai pelo conteúdo, nunca por nome adivinhado.
DO $$
DECLARE
  v_name TEXT;
BEGIN
  FOR v_name IN
    SELECT c.conname FROM pg_constraint c
    WHERE c.conrelid = 'public.patient_packages'::regclass AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) LIKE '%''counted''%'
  LOOP
    EXECUTE format('ALTER TABLE public.patient_packages DROP CONSTRAINT %I', v_name);
  END LOOP;
END;
$$;

ALTER TABLE public.patient_packages ADD CONSTRAINT patient_packages_kind_check
  CHECK (kind IN ('counted', 'closed', 'assessment'));

-- ----------------------------------------------------------
-- 3. Sessões liberadas: só a administração muda
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finance_set_neuro_sessions(p_sessions INTEGER)
RETURNS public.clinic_finance_settings
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic UUID := public.finance_require_admin();
  v_row public.clinic_finance_settings%ROWTYPE;
BEGIN
  IF p_sessions IS NULL OR p_sessions < 1 OR p_sessions > 98 THEN
    RAISE EXCEPTION 'Sessões liberadas: de 1 a 98.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.clinic_finance_settings
  SET neuro_sessions_included = p_sessions, updated_by = auth.uid(), updated_at = timezone('utc', now())
  WHERE clinic_id = v_clinic
  RETURNING * INTO v_row;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Defina primeiro o começo das contas do Financeiro.' USING ERRCODE = '22023';
  END IF;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.finance_set_neuro_sessions(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_set_neuro_sessions(INTEGER) TO authenticated;

-- ----------------------------------------------------------
-- 4. "Liberar mais sessões" usa a mudança de previsão
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finance_update_package_plan(p_package UUID, p_sessions_planned INTEGER)
RETURNS public.patient_packages
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic UUID := public.finance_require_admin();
  v_pkg public.patient_packages%ROWTYPE;
  v_done INTEGER;
BEGIN
  SELECT * INTO v_pkg FROM public.patient_packages WHERE id = p_package AND clinic_id = v_clinic FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pacote não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF v_pkg.status <> 'active' OR v_pkg.kind NOT IN ('closed', 'assessment') THEN
    RAISE EXCEPTION 'Só pacote de valor fechado ou avaliação em andamento muda a previsão de sessões.' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_done FROM public.appointment_charges
  WHERE package_id = p_package AND voided_at IS NULL AND source = 'appointment';

  IF p_sessions_planned IS NULL OR p_sessions_planned < GREATEST(v_done, 1) OR p_sessions_planned > 100 THEN
    RAISE EXCEPTION 'A previsão não pode ser menor que as % sessões já feitas.', v_done USING ERRCODE = '22023';
  END IF;

  UPDATE public.patient_packages SET sessions_planned = p_sessions_planned WHERE id = p_package
  RETURNING * INTO v_pkg;
  RETURN v_pkg;
END;
$$;
REVOKE ALL ON FUNCTION public.finance_update_package_plan(UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_update_package_plan(UUID, INTEGER) TO authenticated;

-- ----------------------------------------------------------
-- 5. Cobrança do atendimento (parte de 20261102_agenda_convenio.sql)
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
  v_found BOOLEAN := FALSE;
  v_assessment_price INTEGER;
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
    v_found := FOUND;

    -- Neuropsicologia (10/11/2026): a avaliação inteira tem um valor só.
    -- Sem avaliação aberta, o atendimento abre uma: o valor completo cai
    -- nele (a anamnese), as sessões liberadas saem sem valor e a
    -- devolutiva encerra. Sem valor da avaliação cadastrado, nada muda.
    IF NOT v_found AND v_appt.discipline = 'neuropsicologia' THEN
      v_assessment_price := public.finance_resolve_price(v_appt.clinic_id, 'neuropsicologia', NULL, v_appt.professional_id);
      IF v_assessment_price > 0 THEN
        -- Uma avaliação por paciente de cada vez, mesmo com dois
        -- atendimentos virando Atendido ao mesmo tempo.
        PERFORM 1 FROM public.patients WHERE id = v_appt.patient_id FOR UPDATE;
        SELECT * INTO v_package
        FROM public.patient_packages p
        WHERE p.clinic_id = v_appt.clinic_id
          AND p.patient_id = v_appt.patient_id
          AND p.discipline = 'neuropsicologia'
          AND p.status = 'active'
          AND p.sold_on <= v_day
          AND (p.professional_id IS NULL OR p.professional_id = v_appt.professional_id)
          AND (cardinality(p.appointment_types) = 0 OR v_appt.appointment_type = ANY (p.appointment_types))
        ORDER BY p.sold_on, p.created_at
        LIMIT 1
        FOR UPDATE;
        v_found := FOUND;

        IF NOT v_found THEN
          INSERT INTO public.patient_packages (
            clinic_id, patient_id, name, discipline, professional_id, kind,
            sessions_planned, total_cents, appointment_types, payment_plan, installments,
            over_plan, sold_on, discount_cents, note
          ) VALUES (
            v_appt.clinic_id, v_appt.patient_id, 'Avaliação neuropsicológica', 'neuropsicologia', NULL, 'assessment',
            v_settings.neuro_sessions_included + 2, v_assessment_price, '{}'::TEXT[], 'per_session', 1,
            'free', v_day,
            -- Transição: quem já vinha em avaliação antes do valor único
            -- (atendimento cobrado fora de pacote nos últimos 90 dias) não
            -- paga a avaliação de novo: ela abre com desconto total.
            CASE WHEN EXISTS (
              SELECT 1 FROM public.appointment_charges c
              WHERE c.clinic_id = v_appt.clinic_id
                AND c.patient_id = v_appt.patient_id
                AND c.discipline = 'neuropsicologia'
                AND c.source = 'appointment'
                AND c.package_id IS NULL
                AND c.voided_at IS NULL
                AND c.appointment_id IS DISTINCT FROM v_appt.id
                AND c.service_on BETWEEN v_day - 90 AND v_day
            ) THEN v_assessment_price ELSE 0 END,
            'Aberta sozinha no primeiro atendimento: anamnese + sessões liberadas + devolutiva.'
          )
          RETURNING * INTO v_package;
          v_found := TRUE;
        END IF;
      END IF;
    END IF;

    IF v_found THEN
      SELECT count(*), COALESCE(sum(c.price_cents), 0)
        INTO v_done, v_used
      FROM public.appointment_charges c
      WHERE c.package_id = v_package.id AND c.voided_at IS NULL;

      IF v_done < v_package.sessions_planned THEN
        -- Parte da sessão = o que falta do valor ÷ as sessões que faltam na
        -- previsão. A última prevista leva o resto: a soma fecha no total.
        -- Avaliação (assessment): o primeiro atendimento leva tudo.
        v_remaining := v_package.total_cents - v_package.discount_cents - v_used;
        v_left := v_package.sessions_planned - v_done;
        v_price := CASE
          WHEN v_remaining <= 0 THEN 0
          WHEN v_package.kind = 'assessment' THEN v_remaining
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

  -- Pacote de sessões contadas fecha sozinho na última sessão; a
  -- avaliação neuropsicológica fecha na devolutiva.
  IF v_package_id IS NOT NULL AND (
       (v_package.kind = 'counted' AND v_session >= v_package.sessions_planned)
    OR (v_package.kind = 'assessment' AND v_appt.appointment_type = 'feedback')
  ) THEN
    UPDATE public.patient_packages
    SET status = 'completed', close_action = 'auto', closed_at = timezone('utc', now())
    WHERE id = v_package_id;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.finance_charge_appointment(UUID) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------
-- 6. Conferência
-- ----------------------------------------------------------
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'clinic_finance_settings' AND column_name = 'neuro_sessions_included') AS tem_sessoes_liberadas,
  EXISTS (SELECT 1 FROM pg_constraint
          WHERE conname = 'patient_packages_kind_check' AND pg_get_constraintdef(oid) LIKE '%assessment%') AS pacote_aceita_avaliacao,
  position('assessment' IN pg_get_functiondef('public.finance_charge_appointment(uuid)'::regprocedure)) > 0 AS cobranca_conhece_avaliacao,
  has_function_privilege('authenticated', 'public.finance_set_neuro_sessions(integer)', 'EXECUTE') AS rpc_liberadas_ok;
