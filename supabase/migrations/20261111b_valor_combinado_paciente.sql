-- ============================================================
-- Financeiro: valor combinado por paciente (11/11/2026)
--
-- Pedido da administradora: a clínica faz promoção e acerta um valor
-- com o paciente (Psicologia é R$ 150, mas fulano paga R$ 130). Antes
-- só dava para corrigir cada cobrança depois, uma a uma.
--
-- Agora o paciente pode ter um valor combinado por ÁREA e, se a
-- administração quiser afinar, por SERVIÇO daquela área. O valor entra
-- sozinho quando o atendimento vira Atendido, antes da tabela da área.
--
-- Ordem do valor do atendimento particular, do mais específico ao mais
-- geral (decisão de 11/11/2026, caminho "valor fixo na ficha"):
--   paciente + serviço  >  paciente + área
--   >  tipo do profissional  >  tipo da instituição
--   >  padrão do profissional  >  padrão da instituição
--
-- O que NÃO muda:
--   * repasse: segue sobre o valor que o paciente pagou de verdade
--     (escolha dela em 11/11/2026), então a promoção é dividida entre a
--     clínica e quem atendeu. finance_charge_payout não foi tocada.
--   * convênio: quem manda é o preço da operadora, nunca o combinado.
--   * pacote: tem total próprio (com desconto próprio); sessão dentro
--     de pacote não usa o valor combinado.
--   * cobrança já gravada: não se recalcula. Valor novo vale do próximo
--     atendimento em diante.
--
-- Só a administração (can_manage_finance) lê e grava: preço de paciente
-- não é dado de cadastro que a equipe inteira vê, igual ao preço de
-- convênio. Nada se apaga: o combinado que acabou fica desativado.
--
-- finance_charge_appointment é recriada a partir da última versão
-- (20261110_neuro_avaliacao_valor_unico.sql), mudando só as duas linhas
-- que resolvem o valor.
--
-- Reversão: DROP TABLE public.patient_prices; DROP FUNCTION
-- public.finance_patient_price(UUID, UUID, TEXT, TEXT); e recriar
-- finance_charge_appointment a partir de 20261110.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.patient_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
  discipline TEXT NOT NULL CHECK (discipline IN ('acupuntura', 'fisioterapia', 'psicologia', 'nutricao', 'neuropsicologia')),
  -- NULL = vale para todos os serviços da área.
  appointment_type TEXT,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0 AND price_cents <= 100000000),
  -- Por que foi combinado (promoção, acordo); só a administração lê.
  note TEXT CHECK (note IS NULL OR length(note) <= 200),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT patient_prices_type_fits_area CHECK (public.appointment_type_fits_area(discipline, appointment_type))
);

-- Um combinado valendo por paciente, área e serviço (o da área inteira
-- entra como string vazia, senão dois NULL passariam pelo índice).
CREATE UNIQUE INDEX IF NOT EXISTS idx_patient_prices_scope_unique
  ON public.patient_prices (patient_id, discipline, COALESCE(appointment_type, '')) WHERE active;
CREATE INDEX IF NOT EXISTS idx_patient_prices_patient ON public.patient_prices (patient_id);

CREATE OR REPLACE FUNCTION public.patient_prices_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT p.clinic_id INTO NEW.clinic_id FROM public.patients p WHERE p.id = NEW.patient_id;
  IF NEW.clinic_id IS NULL THEN
    RAISE EXCEPTION 'Paciente de outra instituição.' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := auth.uid();
  ELSE
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
    -- Trocar o paciente de um combinado já gravado, nunca.
    NEW.patient_id := OLD.patient_id;
  END IF;
  NEW.note := NULLIF(btrim(COALESCE(NEW.note, '')), '');
  NEW.updated_at := timezone('utc', now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_patient_prices_defaults ON public.patient_prices;
CREATE TRIGGER trg_patient_prices_defaults
  BEFORE INSERT OR UPDATE ON public.patient_prices
  FOR EACH ROW EXECUTE FUNCTION public.patient_prices_defaults();

ALTER TABLE public.patient_prices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS patient_prices_select ON public.patient_prices;
CREATE POLICY patient_prices_select ON public.patient_prices
  FOR SELECT TO authenticated USING (public.can_manage_finance(clinic_id));
DROP POLICY IF EXISTS patient_prices_insert ON public.patient_prices;
CREATE POLICY patient_prices_insert ON public.patient_prices
  FOR INSERT TO authenticated WITH CHECK (public.can_manage_finance(clinic_id));
DROP POLICY IF EXISTS patient_prices_update ON public.patient_prices;
CREATE POLICY patient_prices_update ON public.patient_prices
  FOR UPDATE TO authenticated
  USING (public.can_manage_finance(clinic_id))
  WITH CHECK (public.can_manage_finance(clinic_id));
-- Sem DELETE: combinado que acabou fica desativado (active = false).

REVOKE ALL ON public.patient_prices FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.patient_prices TO authenticated;

-- ----------------------------------------------------------
-- O valor combinado deste paciente, ou NULL (aí vale a tabela da área).
-- Espelho na tela: patientPriceFor, em utils/finance.js.
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finance_patient_price(
  p_clinic UUID,
  p_patient UUID,
  p_discipline TEXT,
  p_type TEXT
)
RETURNS INTEGER
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pp.price_cents
  FROM public.patient_prices pp
  WHERE pp.clinic_id = p_clinic
    AND pp.patient_id = p_patient
    AND pp.discipline = p_discipline
    AND pp.active
    AND (pp.appointment_type IS NULL OR pp.appointment_type = p_type)
  -- Serviço escolhido vence o combinado da área inteira.
  ORDER BY (pp.appointment_type IS NULL)
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.finance_patient_price(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------
-- Cobrança do atendimento: igual à de 20261110, só o valor muda
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
      -- Valor combinado do paciente (20261111b) vence a tabela da area.
      v_assessment_price := COALESCE(
        public.finance_patient_price(v_appt.clinic_id, v_appt.patient_id, 'neuropsicologia', NULL),
        public.finance_resolve_price(v_appt.clinic_id, 'neuropsicologia', NULL, v_appt.professional_id));
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
      -- Valor combinado do paciente (20261111b) vence a tabela; sem ele,
      -- segue a ordem de sempre (tipo e profissional).
      v_price := COALESCE(
        public.finance_patient_price(v_appt.clinic_id, v_appt.patient_id, v_appt.discipline, v_appt.appointment_type),
        public.finance_resolve_price(v_appt.clinic_id, v_appt.discipline, v_appt.appointment_type, v_appt.professional_id));
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

-- ----------------------------------------------------------
-- Exclusão de paciente: patient_prices entra junto
--
-- Tabela nova com patient_id entra pelo nome no snapshot e no DELETE de
-- admin_decide_patient_deletion (AGENTS.md §9). Recriada a partir da
-- última versão (20261108d_aba_supervisao_formal.sql), só com as duas
-- linhas novas: patient_prices não tem filho e nada aponta para ela,
-- então sai junto do convênio do paciente.
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_decide_patient_deletion(
  p_request_id UUID,
  p_decision TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $admin_decide_patient_deletion$
DECLARE
  v_uid UUID := auth.uid();
  v_req public.patient_deletion_requests%ROWTYPE;
  v_snapshot JSONB;
BEGIN
  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Decisão inválida.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_req
  FROM public.patient_deletion_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada.' USING ERRCODE = 'P0002';
  END IF;

  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'Solicitação já foi decidida.' USING ERRCODE = '55000';
  END IF;

  IF v_uid IS NULL
     OR NOT (
       public.is_super_admin(v_uid)
       OR (public.is_clinic_admin(v_uid) AND v_req.clinic_id = public.user_clinic_id(v_uid))
     ) THEN
    RAISE EXCEPTION 'Acesso negado: somente administração da clínica decide.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.patient_deletion_requests
  SET status = p_decision,
      decided_by = v_uid,
      decided_at = pg_catalog.clock_timestamp()
  WHERE id = p_request_id;

  IF p_decision = 'rejected' THEN
    -- Volta a ficar visível normalmente: a exclusão foi negada.
    UPDATE public.patients
    SET archived_at = NULL
    WHERE id = v_req.patient_id;
    RETURN;
  END IF;

  PERFORM 1 FROM public.patients WHERE id=v_req.patient_id FOR UPDATE;
  -- Aprovado: snapshot completo antes de qualquer exclusão/limpeza.
  SELECT jsonb_build_object(
    'patient', (SELECT to_jsonb(p) FROM public.patients p WHERE p.id = v_req.patient_id),
    'clinical_records', (SELECT coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) FROM public.clinical_records r WHERE r.patient_id = v_req.patient_id),
    'patient_evolutions', (SELECT coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb) FROM public.patient_evolutions e WHERE e.patient_id = v_req.patient_id),
    'patient_instrument_applications', (SELECT coalesce(jsonb_agg(to_jsonb(ia)), '[]'::jsonb) FROM public.patient_instrument_applications ia WHERE ia.patient_id = v_req.patient_id),
    'patient_interview_responses', (SELECT coalesce(jsonb_agg(to_jsonb(ir) - 'link_token_hash' - 'link_token_encrypted'), '[]'::jsonb) FROM public.patient_interview_responses ir WHERE ir.patient_id = v_req.patient_id),
    'patient_form_assignments', (SELECT coalesce(jsonb_agg(to_jsonb(fa)), '[]'::jsonb) FROM public.patient_form_assignments fa WHERE fa.patient_id = v_req.patient_id),
    'patient_portal_access', (SELECT coalesce(jsonb_agg(to_jsonb(pa)), '[]'::jsonb) FROM public.patient_portal_access pa WHERE pa.patient_id = v_req.patient_id),
    'patient_consents', (SELECT coalesce(jsonb_agg(to_jsonb(pc)), '[]'::jsonb) FROM public.patient_consents pc WHERE pc.patient_id = v_req.patient_id),
    'patient_coverages', (SELECT coalesce(jsonb_agg(to_jsonb(cv)), '[]'::jsonb) FROM public.patient_coverages cv WHERE cv.patient_id = v_req.patient_id),
    'patient_prices', (SELECT coalesce(jsonb_agg(to_jsonb(pr)), '[]'::jsonb) FROM public.patient_prices pr WHERE pr.patient_id = v_req.patient_id),
    'patient_enrollments', (SELECT coalesce(jsonb_agg(to_jsonb(en)), '[]'::jsonb) FROM public.patient_enrollments en WHERE en.patient_id = v_req.patient_id),
    'appointments', (SELECT coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) FROM public.appointments a WHERE a.patient_id = v_req.patient_id),
    'record_shares', (SELECT coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) FROM public.record_shares s WHERE s.patient_id = v_req.patient_id),
    'aba_alerts', (SELECT coalesce(jsonb_agg(to_jsonb(aal)), '[]'::jsonb) FROM public.aba_alerts aal WHERE aal.patient_id = v_req.patient_id),
    'aba_ioa_records', (SELECT coalesce(jsonb_agg(to_jsonb(aio)), '[]'::jsonb) FROM public.aba_ioa_records aio WHERE aio.patient_id = v_req.patient_id),
    'aba_session_fidelity', (SELECT coalesce(jsonb_agg(to_jsonb(asf)), '[]'::jsonb) FROM public.aba_session_fidelity asf WHERE asf.patient_id = v_req.patient_id),
    'aba_session_reviews', (SELECT coalesce(jsonb_agg(to_jsonb(asr)), '[]'::jsonb) FROM public.aba_session_reviews asr WHERE asr.patient_id = v_req.patient_id),
    'aba_risk_incidents', (SELECT coalesce(jsonb_agg(to_jsonb(ari)), '[]'::jsonb) FROM public.aba_risk_incidents ari WHERE ari.patient_id = v_req.patient_id),
    'aba_behavior_events', (SELECT coalesce(jsonb_agg(to_jsonb(abe)), '[]'::jsonb) FROM public.aba_behavior_events abe WHERE abe.patient_id = v_req.patient_id),
    'aba_reinforcer_uses', (SELECT coalesce(jsonb_agg(to_jsonb(aru)), '[]'::jsonb) FROM public.aba_reinforcer_uses aru WHERE aru.patient_id = v_req.patient_id),
    'aba_session_pauses', (SELECT coalesce(jsonb_agg(to_jsonb(asp)), '[]'::jsonb) FROM public.aba_session_pauses asp WHERE asp.patient_id = v_req.patient_id),
    'aba_trial_records', (SELECT coalesce(jsonb_agg(to_jsonb(atr)), '[]'::jsonb) FROM public.aba_trial_records atr WHERE atr.patient_id = v_req.patient_id),
    'aba_reduction_measurements', (SELECT coalesce(jsonb_agg(to_jsonb(arm)), '[]'::jsonb) FROM public.aba_reduction_measurements arm WHERE arm.patient_id = v_req.patient_id),
    'aba_session_programs', (SELECT coalesce(jsonb_agg(to_jsonb(aspg)), '[]'::jsonb) FROM public.aba_session_programs aspg WHERE aspg.patient_id = v_req.patient_id),
    'aba_sessions', (SELECT coalesce(jsonb_agg(to_jsonb(ases)), '[]'::jsonb) FROM public.aba_sessions ases WHERE ases.patient_id = v_req.patient_id),
    'aba_supervision_records', (SELECT coalesce(jsonb_agg(to_jsonb(asup)), '[]'::jsonb) FROM public.aba_supervision_records asup WHERE asup.patient_id = v_req.patient_id),
    'aba_patient_profiles', (SELECT coalesce(jsonb_agg(to_jsonb(app)), '[]'::jsonb) FROM public.aba_patient_profiles app WHERE app.patient_id = v_req.patient_id),
    'aba_plan_versions', (SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM public.aba_plan_versions x WHERE x.patient_id = v_req.patient_id),
    'aba_program_revisions', (SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM public.aba_program_revisions x WHERE x.patient_id = v_req.patient_id),
    'aba_programs', (SELECT coalesce(jsonb_agg(to_jsonb(aprg)), '[]'::jsonb) FROM public.aba_programs aprg WHERE aprg.patient_id = v_req.patient_id),
    'aba_interfering_behaviors', (SELECT coalesce(jsonb_agg(to_jsonb(aib)), '[]'::jsonb) FROM public.aba_interfering_behaviors aib WHERE aib.patient_id = v_req.patient_id),
    'aba_reinforcers', (SELECT coalesce(jsonb_agg(to_jsonb(arf)), '[]'::jsonb) FROM public.aba_reinforcers arf WHERE arf.patient_id = v_req.patient_id),
    'aba_callouts', (SELECT coalesce(jsonb_agg(to_jsonb(aco)), '[]'::jsonb) FROM public.aba_callouts aco WHERE aco.patient_id = v_req.patient_id),
    'aba_patient_teams', (SELECT coalesce(jsonb_agg(to_jsonb(apt)), '[]'::jsonb) FROM public.aba_patient_teams apt WHERE apt.patient_id = v_req.patient_id),
    'patient_attachments', (SELECT coalesce(jsonb_agg(to_jsonb(at)), '[]'::jsonb) FROM public.patient_attachments at WHERE at.patient_id = v_req.patient_id)
  ) INTO v_snapshot;

  INSERT INTO patient_erasure_backup.snapshots (patient_id, request_id, erased_by, snapshot)
  VALUES (v_req.patient_id, p_request_id, v_uid, v_snapshot);

  UPDATE public.aba_supervision_records SET patient_id = NULL, agenda_encrypted = NULL, decisions_encrypted = NULL,
    void_reason_encrypted = CASE WHEN status = 'anulado' THEN public.aba_encrypt('Motivo removido na exclusão do paciente.') ELSE NULL END,
    revision = revision + 1 WHERE patient_id = v_req.patient_id;
  -- ABA (20261101b): filhas antes das mães; o programa sai antes do
  -- comportamento (procedimento restrito aponta para ele).
  -- 20261101c: alertas, IOA e fidelidade saem antes das sessões e programas.
  DELETE FROM public.aba_alerts WHERE patient_id = v_req.patient_id;
  DELETE FROM public.aba_ioa_records WHERE patient_id = v_req.patient_id;
  DELETE FROM public.aba_session_fidelity WHERE patient_id = v_req.patient_id;
  DELETE FROM public.aba_session_reviews WHERE patient_id = v_req.patient_id;
  DELETE FROM public.aba_risk_incidents WHERE patient_id = v_req.patient_id;
  DELETE FROM public.aba_behavior_events WHERE patient_id = v_req.patient_id;
  DELETE FROM public.aba_reinforcer_uses WHERE patient_id = v_req.patient_id;
  DELETE FROM public.aba_session_pauses WHERE patient_id = v_req.patient_id;
  DELETE FROM public.aba_trial_records WHERE patient_id = v_req.patient_id;
  DELETE FROM public.aba_reduction_measurements WHERE patient_id = v_req.patient_id;
  DELETE FROM public.aba_session_programs WHERE patient_id = v_req.patient_id;
  DELETE FROM public.aba_sessions WHERE patient_id = v_req.patient_id;
  DELETE FROM public.aba_patient_profiles WHERE patient_id = v_req.patient_id;
  DELETE FROM public.aba_plan_versions WHERE patient_id = v_req.patient_id;
  DELETE FROM public.aba_program_revisions WHERE patient_id = v_req.patient_id;
  DELETE FROM public.aba_programs WHERE patient_id = v_req.patient_id;
  DELETE FROM public.aba_interfering_behaviors WHERE patient_id = v_req.patient_id;
  DELETE FROM public.aba_reinforcers WHERE patient_id = v_req.patient_id;
  DELETE FROM public.aba_callouts WHERE patient_id = v_req.patient_id;
  DELETE FROM public.aba_patient_teams WHERE patient_id = v_req.patient_id;
  DELETE FROM public.patient_portal_sessions WHERE access_id IN (SELECT pa.id FROM public.patient_portal_access pa WHERE pa.patient_id = v_req.patient_id);
  DELETE FROM public.patient_portal_access WHERE patient_id = v_req.patient_id;
  DELETE FROM public.patient_form_assignments WHERE patient_id = v_req.patient_id;
  DELETE FROM public.patient_interview_responses WHERE patient_id = v_req.patient_id;
  DELETE FROM public.patient_consents WHERE patient_id = v_req.patient_id;
  DELETE FROM public.patient_coverages WHERE patient_id = v_req.patient_id;
  DELETE FROM public.patient_prices WHERE patient_id = v_req.patient_id;
  DELETE FROM public.patient_attachments WHERE patient_id = v_req.patient_id;
  DELETE FROM public.record_shares WHERE patient_id = v_req.patient_id;
  -- Evolução antes do agendamento: patient_evolutions.appointment_id é
  -- RESTRICT, e na ordem antiga a exclusão de quem tinha evolução parava aí.
  DELETE FROM public.patient_evolutions WHERE patient_id = v_req.patient_id;
  DELETE FROM public.appointments WHERE patient_id = v_req.patient_id;
  DELETE FROM public.patient_enrollments WHERE patient_id = v_req.patient_id;
  DELETE FROM public.patient_instrument_applications WHERE patient_id = v_req.patient_id;
  DELETE FROM public.clinical_records WHERE patient_id = v_req.patient_id;

  UPDATE public.patients
  SET name = '[Paciente removido]',
      phone = NULL,
      birth_date = NULL,
      age = NULL,
      cpf = NULL,
      nome_social = NULL,
      nome_mae = NULL,
      nome_pai = NULL,
      nome_conjuge = NULL,
      sexo_biologico = NULL,
      genero = NULL,
      responsavel_nome = NULL,
      responsavel_telefone = NULL,
      responsavel_cpf = NULL,
      convenio_nome = NULL,
      convenio_carteirinha = NULL,
      endereco_cep = NULL,
      endereco_logradouro = NULL,
      endereco_numero = NULL,
      endereco_complemento = NULL,
      endereco_bairro = NULL,
      endereco_cidade = NULL,
      endereco_uf = NULL,
      image_consent = FALSE,
      image_consent_at = NULL,
      has_pending = FALSE,
      observacoes = NULL,
      suspended_at = NULL,
      archived_at = COALESCE(archived_at, pg_catalog.clock_timestamp()),
      erased_at = pg_catalog.clock_timestamp()
  WHERE id = v_req.patient_id;

  UPDATE public.patient_deletion_requests
  SET status = 'executed',
      decided_by = v_uid,
      decided_at = pg_catalog.clock_timestamp()
  WHERE id = p_request_id;
END;
$admin_decide_patient_deletion$;

REVOKE ALL ON FUNCTION public.admin_decide_patient_deletion(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_decide_patient_deletion(UUID, TEXT, TEXT) TO authenticated;

-- ----------------------------------------------------------
-- Verificação
-- ----------------------------------------------------------
SELECT
  to_regclass('public.patient_prices') IS NOT NULL AS tabela_criada,
  to_regprocedure('public.finance_patient_price(uuid,uuid,text,text)') IS NOT NULL AS funcao_criada,
  NOT has_function_privilege('authenticated', 'public.finance_patient_price(uuid,uuid,text,text)', 'EXECUTE') AS valor_so_no_banco,
  NOT has_table_privilege('authenticated', 'public.patient_prices', 'DELETE') AS sem_apagar,
  has_table_privilege('authenticated', 'public.patient_prices', 'INSERT') AS administracao_grava,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'finance_charge_appointment') = 1 AS cobranca_recriada,
  (SELECT prosrc LIKE '%DELETE FROM public.patient_prices WHERE patient_id = v_req.patient_id;%'
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'admin_decide_patient_deletion') AS exclusao_leva_o_combinado;
