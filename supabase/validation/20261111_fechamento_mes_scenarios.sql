-- ==========================================================
-- Validação de 20261111_financeiro_fechamento_mes.sql (BEGIN … ROLLBACK)
--
-- Cenários:
--   1. fechar o mês passado guarda os totais pela data do pagamento
--      (recebimento, saída paga; anulada fora);
--   2. não fecha o mês atual nem fecha duas vezes;
--   3. mês fechado barra: recebimento, saída paga, gasto rápido, conta
--      fixa paga e pagar depois uma saída "a pagar" com data nele; deixa
--      lançar "a pagar", pagar com data de hoje, receber hoje um serviço
--      do mês fechado e anular com motivo;
--   4. recepção não fecha, profissional não lê;
--   5. reabrir com motivo libera; reabrir de novo é recusado; fechar de
--      novo cria outro registro (histórico);
--   6. fechamento não se edita nem se apaga.
-- ==========================================================

BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('a7000000-0000-4000-8000-000000000001', 'admin.fecha@example.invalid'),
  ('a7000000-0000-4000-8000-000000000002', 'recepcao.fecha@example.invalid'),
  ('a7000000-0000-4000-8000-000000000003', 'prof.fecha@example.invalid')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.clinics (id, name) VALUES ('c7000000-0000-4000-8000-000000000001', 'Clínica Validação Fechamento');

INSERT INTO public.profiles (id, email, full_name, role, clinic_id, is_active, must_change_password, disciplines)
VALUES
  ('a7000000-0000-4000-8000-000000000001', 'admin.fecha@example.invalid', 'Admin Fecha', 'clinic_admin', 'c7000000-0000-4000-8000-000000000001', TRUE, FALSE, ARRAY['psicologia']),
  ('a7000000-0000-4000-8000-000000000002', 'recepcao.fecha@example.invalid', 'Recepção Fecha', 'receptionist', 'c7000000-0000-4000-8000-000000000001', TRUE, FALSE, ARRAY[]::TEXT[]),
  ('a7000000-0000-4000-8000-000000000003', 'prof.fecha@example.invalid', 'Profissional Fecha', 'therapist', 'c7000000-0000-4000-8000-000000000001', TRUE, FALSE, ARRAY['psicologia'])
ON CONFLICT (id) DO UPDATE SET
  role = EXCLUDED.role, clinic_id = EXCLUDED.clinic_id, is_active = TRUE,
  must_change_password = FALSE, disciplines = EXCLUDED.disciplines, mfa_required = FALSE;

INSERT INTO public.patients (id, therapist_id, clinic_id, name) VALUES
  ('b7000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000003', 'c7000000-0000-4000-8000-000000000001', 'Paciente Fecha');

INSERT INTO public.clinic_finance_settings (clinic_id, starts_on)
VALUES ('c7000000-0000-4000-8000-000000000001', date_trunc('month', public.finance_today())::DATE - 70);
INSERT INTO public.procedure_prices (clinic_id, discipline, appointment_type, professional_id, price_cents, active)
VALUES ('c7000000-0000-4000-8000-000000000001', 'psicologia', NULL, NULL, 20000, TRUE);
INSERT INTO public.finance_expense_categories (id, clinic_id, name, system_key, sort_order) VALUES
  ('d7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', 'Contas de consumo', NULL, 40);

-- Dia 10 do mês passado (o mês que vai ser fechado).
CREATE OR REPLACE FUNCTION pg_temp.last_month_day() RETURNS DATE LANGUAGE sql AS $$
  SELECT (date_trunc('month', public.finance_today()) - INTERVAL '1 month' + INTERVAL '9 days')::DATE;
$$;
CREATE OR REPLACE FUNCTION pg_temp.charge_of(p_appt UUID) RETURNS UUID LANGUAGE sql AS $$
  SELECT id FROM public.appointment_charges WHERE appointment_id = p_appt AND voided_at IS NULL;
$$;

INSERT INTO public.finance_recurring_expenses (id, clinic_id, description, category_id, amount_cents, frequency, day_of_month, starts_on)
VALUES ('e7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', 'Internet', 'd7000000-0000-4000-8000-000000000001', 12990, 'monthly', 10, pg_temp.last_month_day() - 40);

CREATE TEMP TABLE v_ids (name TEXT PRIMARY KEY, id UUID) ON COMMIT DROP;
GRANT ALL ON v_ids TO authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"a7000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', TRUE);

INSERT INTO public.appointments (id, patient_id, professional_id, discipline, appointment_type, starts_at, ends_at, status, kind)
VALUES ('17000000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000003', 'psicologia', 'session',
        (pg_temp.last_month_day() + time '09:00') AT TIME ZONE 'America/Sao_Paulo', (pg_temp.last_month_day() + time '09:50') AT TIME ZONE 'America/Sao_Paulo',
        'attended', 'appointment');

-- Lançamentos do mês passado, antes de fechar.
DO $$
DECLARE
  v_void public.finance_expenses%ROWTYPE;
BEGIN
  PERFORM public.finance_register_receipt('b7000000-0000-4000-8000-000000000001', pg_temp.last_month_day(),
    jsonb_build_array(jsonb_build_object('charge_id', pg_temp.charge_of('17000000-0000-4000-8000-000000000001'), 'amount_cents', 12000, 'method', 'pix')), NULL);
  PERFORM public.finance_settle_recurring('e7000000-0000-4000-8000-000000000001', pg_temp.last_month_day(), FALSE, 12990, pg_temp.last_month_day(), 'boleto', NULL);
  v_void := public.finance_register_expense('d7000000-0000-4000-8000-000000000001', 'Lançada errado', 5000, pg_temp.last_month_day(), 'pix', NULL, NULL, NULL, NULL);
  PERFORM public.finance_void_expense(v_void.id, 'lançada em dobro');
END $$;

-- ---------- 1. fechar guarda os totais ----------
DO $$
DECLARE
  v_row public.finance_month_closings%ROWTYPE;
BEGIN
  v_row := public.finance_close_month(pg_temp.last_month_day());
  IF v_row.month <> date_trunc('month', pg_temp.last_month_day())::DATE
     OR (v_row.snapshot ->> 'entradas_centavos')::INT <> 12000
     OR (v_row.snapshot ->> 'saidas_centavos')::INT <> 12990
     OR (v_row.snapshot ->> 'resultado_centavos')::INT <> -990
     OR v_row.snapshot ->> 'base' <> 'data_do_pagamento' THEN
    RAISE EXCEPTION 'cenário 1: fechamento errado (%)', v_row.snapshot;
  END IF;
END $$;

-- ---------- 2. não fecha mês atual nem duas vezes ----------
DO $$
BEGIN
  BEGIN
    PERFORM public.finance_close_month(public.finance_today());
    RAISE EXCEPTION 'cenário 2: fechou o mês atual';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.finance_close_month(pg_temp.last_month_day());
    RAISE EXCEPTION 'cenário 2: fechou duas vezes';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END $$;

-- ---------- 3. o que o mês fechado barra e o que deixa ----------
DO $$
DECLARE
  v_pending public.finance_expenses%ROWTYPE;
  v_paid public.finance_expenses%ROWTYPE;
BEGIN
  BEGIN
    PERFORM public.finance_register_receipt('b7000000-0000-4000-8000-000000000001', pg_temp.last_month_day() + 1,
      jsonb_build_array(jsonb_build_object('charge_id', pg_temp.charge_of('17000000-0000-4000-8000-000000000001'), 'amount_cents', 1000, 'method', 'pix')), NULL);
    RAISE EXCEPTION 'cenário 3: recebimento no mês fechado passou';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;
  END;
  BEGIN
    PERFORM public.finance_register_expense('d7000000-0000-4000-8000-000000000001', 'Água', 3000, pg_temp.last_month_day(), 'pix', NULL, NULL, NULL, NULL);
    RAISE EXCEPTION 'cenário 3: saída paga no mês fechado passou';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;
  END;
  BEGIN
    PERFORM public.finance_register_quick_expense('Lanche', 2000, pg_temp.last_month_day(), 'dinheiro', NULL);
    RAISE EXCEPTION 'cenário 3: gasto rápido no mês fechado passou';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;
  END;
  BEGIN
    PERFORM public.finance_settle_recurring('e7000000-0000-4000-8000-000000000001', pg_temp.last_month_day() - 30, FALSE, 12990, pg_temp.last_month_day() - 1, 'pix', NULL);
    RAISE EXCEPTION 'cenário 3: conta fixa paga no mês fechado passou';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;
  END;

  v_pending := public.finance_register_expense('d7000000-0000-4000-8000-000000000001', 'Pintura', 40000, NULL, NULL, public.finance_today() + 5, NULL, NULL, NULL);
  BEGIN
    PERFORM public.finance_pay_expense(v_pending.id, pg_temp.last_month_day(), 'pix');
    RAISE EXCEPTION 'cenário 3: pagar com data do mês fechado passou';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;
  END;
  v_paid := public.finance_pay_expense(v_pending.id, public.finance_today(), 'pix');
  IF v_paid.paid_on <> public.finance_today() THEN
    RAISE EXCEPTION 'cenário 3: pagar hoje não passou';
  END IF;

  -- Serviço do mês fechado, pago hoje: entra hoje.
  PERFORM public.finance_register_receipt('b7000000-0000-4000-8000-000000000001', public.finance_today(),
    jsonb_build_array(jsonb_build_object('charge_id', pg_temp.charge_of('17000000-0000-4000-8000-000000000001'), 'amount_cents', 8000, 'method', 'dinheiro')), NULL);

  -- Anular no mês fechado continua possível (correção com motivo).
  PERFORM public.finance_void_expense(
    (SELECT id FROM public.finance_expenses WHERE recurring_id = 'e7000000-0000-4000-8000-000000000001' AND voided_at IS NULL LIMIT 1),
    'boleto lançado com valor errado');
END $$;

-- ---------- 4. outros perfis ----------
SELECT set_config('request.jwt.claims', '{"sub":"a7000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}', TRUE);
DO $$
BEGIN
  BEGIN
    PERFORM public.finance_reopen_month(pg_temp.last_month_day(), 'recepção tentando');
    RAISE EXCEPTION 'cenário 4: recepção reabriu';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
SELECT set_config('request.jwt.claims', '{"sub":"a7000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}', TRUE);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.finance_month_closings) <> 0 THEN
    RAISE EXCEPTION 'cenário 4: profissional leu fechamentos';
  END IF;
  BEGIN
    PERFORM public.finance_close_month(pg_temp.last_month_day() - 40);
    RAISE EXCEPTION 'cenário 4: profissional fechou mês';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

-- ---------- 5. reabrir libera; histórico ----------
SELECT set_config('request.jwt.claims', '{"sub":"a7000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', TRUE);
DO $$
DECLARE
  v_row public.finance_month_closings%ROWTYPE;
BEGIN
  BEGIN
    PERFORM public.finance_reopen_month(pg_temp.last_month_day(), 'x');
    RAISE EXCEPTION 'cenário 5: reabriu sem motivo';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  v_row := public.finance_reopen_month(pg_temp.last_month_day(), 'contador pediu para lançar a conta de água');
  IF v_row.reopened_at IS NULL THEN
    RAISE EXCEPTION 'cenário 5: não reabriu';
  END IF;
  PERFORM public.finance_register_expense('d7000000-0000-4000-8000-000000000001', 'Água', 3000, pg_temp.last_month_day(), 'pix', NULL, NULL, NULL, NULL);
  BEGIN
    PERFORM public.finance_reopen_month(pg_temp.last_month_day(), 'de novo');
    RAISE EXCEPTION 'cenário 5: reabriu mês aberto';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
  v_row := public.finance_close_month(pg_temp.last_month_day());
  INSERT INTO v_ids VALUES ('fechamento', v_row.id);
  IF (SELECT count(*) FROM public.finance_month_closings WHERE month = date_trunc('month', pg_temp.last_month_day())::DATE) <> 2 THEN
    RAISE EXCEPTION 'cenário 5: histórico não ficou com os dois fechamentos';
  END IF;
  -- Água entrou; o conserto da internet anulado saiu.
  IF (v_row.snapshot ->> 'saidas_centavos')::INT <> 3000 THEN
    RAISE EXCEPTION 'cenário 5: novo fechamento com total errado (%)', v_row.snapshot;
  END IF;
END $$;

-- ---------- 6. não se edita nem se apaga ----------
RESET ROLE;
DO $$
BEGIN
  BEGIN
    UPDATE public.finance_month_closings SET snapshot = '{}'::JSONB WHERE id = (SELECT id FROM v_ids WHERE name = 'fechamento');
    RAISE EXCEPTION 'cenário 6: fechamento editado';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM public.finance_month_closings WHERE id = (SELECT id FROM v_ids WHERE name = 'fechamento');
    RAISE EXCEPTION 'cenário 6: fechamento apagado';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

SELECT 'fechamento do mês: 6 cenários passaram' AS resultado;

ROLLBACK;
