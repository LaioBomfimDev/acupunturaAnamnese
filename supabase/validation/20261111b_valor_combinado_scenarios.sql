-- ==========================================================
-- Validação de 20261111b_valor_combinado_paciente.sql (BEGIN … ROLLBACK)
--
-- Cenários:
--   1. sem combinado, a cobrança sai pela tabela da área (R$ 150);
--   2. combinado por área: o atendimento sai R$ 130 e o repasse cai
--      junto (50% de 130 = 65), que é a escolha de 11/11/2026;
--   3. combinado por serviço vence o da área inteira;
--   4. convênio ignora o combinado (manda o preço da operadora);
--   5. sessão dentro de pacote ignora o combinado (o pacote tem total);
--   6. cobrança já gravada não muda quando o combinado nasce depois;
--   7. desativar volta para a tabela; dois ativos no mesmo escopo não;
--   8. recepção e profissional não leem nem gravam; paciente de outra
--      instituição é recusado; serviço fora da área é recusado.
-- ==========================================================

BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('a8000000-0000-4000-8000-000000000001', 'admin.valor@example.invalid'),
  ('a8000000-0000-4000-8000-000000000002', 'recepcao.valor@example.invalid'),
  ('a8000000-0000-4000-8000-000000000003', 'psi.valor@example.invalid')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.clinics (id, name) VALUES
  ('c8000000-0000-4000-8000-000000000001', 'Clínica Validação Valor Combinado'),
  ('c8000000-0000-4000-8000-000000000002', 'Outra Clínica Valor');

INSERT INTO public.profiles (id, email, full_name, role, clinic_id, is_active, must_change_password, disciplines)
VALUES
  ('a8000000-0000-4000-8000-000000000001', 'admin.valor@example.invalid', 'Admin Valor', 'clinic_admin', 'c8000000-0000-4000-8000-000000000001', TRUE, FALSE, ARRAY['psicologia']),
  ('a8000000-0000-4000-8000-000000000002', 'recepcao.valor@example.invalid', 'Recepção Valor', 'receptionist', 'c8000000-0000-4000-8000-000000000001', TRUE, FALSE, ARRAY[]::TEXT[]),
  ('a8000000-0000-4000-8000-000000000003', 'psi.valor@example.invalid', 'Denise Valor', 'therapist', 'c8000000-0000-4000-8000-000000000001', TRUE, FALSE, ARRAY['psicologia'])
ON CONFLICT (id) DO UPDATE SET
  role = EXCLUDED.role, clinic_id = EXCLUDED.clinic_id, is_active = TRUE, full_name = EXCLUDED.full_name,
  must_change_password = FALSE, disciplines = EXCLUDED.disciplines, mfa_required = FALSE;

INSERT INTO public.patients (id, therapist_id, clinic_id, name) VALUES
  ('b8000000-0000-4000-8000-000000000001', 'a8000000-0000-4000-8000-000000000003', 'c8000000-0000-4000-8000-000000000001', 'Paciente Promoção'),
  ('b8000000-0000-4000-8000-000000000002', 'a8000000-0000-4000-8000-000000000003', 'c8000000-0000-4000-8000-000000000001', 'Paciente Cheio'),
  ('b8000000-0000-4000-8000-000000000003', 'a8000000-0000-4000-8000-000000000003', 'c8000000-0000-4000-8000-000000000002', 'Paciente de Outra');

INSERT INTO public.clinic_finance_settings (clinic_id, starts_on, payout_basis)
VALUES ('c8000000-0000-4000-8000-000000000001', public.finance_today() - 60, 'on_attendance');

-- Tabela da área: Psicologia R$ 150, avaliação R$ 250.
INSERT INTO public.procedure_prices (clinic_id, discipline, appointment_type, professional_id, price_cents, active) VALUES
  ('c8000000-0000-4000-8000-000000000001', 'psicologia', NULL, NULL, 15000, TRUE),
  ('c8000000-0000-4000-8000-000000000001', 'psicologia', 'evaluation', NULL, 25000, TRUE);

-- Denise recebe 50% do que entra.
INSERT INTO public.finance_payout_rules (clinic_id, professional_id, discipline, appointment_type, mode, percent)
VALUES ('c8000000-0000-4000-8000-000000000001', 'a8000000-0000-4000-8000-000000000003', NULL, NULL, 'percent', 50);

CREATE OR REPLACE FUNCTION pg_temp.atender(p_id UUID, p_patient UUID, p_type TEXT, p_day DATE, p_billing TEXT DEFAULT 'particular', p_convenio UUID DEFAULT NULL, p_coverage UUID DEFAULT NULL)
RETURNS VOID LANGUAGE sql AS $$
  INSERT INTO public.appointments (id, clinic_id, patient_id, professional_id, discipline, appointment_type, starts_at, ends_at, status, kind, billing_type, convenio_id, coverage_id)
  VALUES (p_id, 'c8000000-0000-4000-8000-000000000001', p_patient, 'a8000000-0000-4000-8000-000000000003', 'psicologia', p_type,
          (p_day + time '09:00') AT TIME ZONE 'America/Sao_Paulo', (p_day + time '09:50') AT TIME ZONE 'America/Sao_Paulo',
          'attended', 'appointment', p_billing, p_convenio, p_coverage);
$$;
CREATE OR REPLACE FUNCTION pg_temp.cobranca(p_appt UUID) RETURNS public.appointment_charges LANGUAGE sql AS $$
  SELECT * FROM public.appointment_charges WHERE appointment_id = p_appt AND voided_at IS NULL;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"a8000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', TRUE);

-- ---------- 1. sem combinado, vale a tabela ----------
DO $$
DECLARE c public.appointment_charges%ROWTYPE;
BEGIN
  PERFORM pg_temp.atender('18000000-0000-4000-8000-000000000001', 'b8000000-0000-4000-8000-000000000002', 'session', public.finance_today() - 10);
  c := pg_temp.cobranca('18000000-0000-4000-8000-000000000001');
  IF c.price_cents <> 15000 THEN
    RAISE EXCEPTION 'cenário 1: sem combinado devia sair 15000, saiu %', c.price_cents;
  END IF;
  IF c.payout_cents <> 7500 THEN
    RAISE EXCEPTION 'cenário 1: repasse devia ser 7500, foi %', c.payout_cents;
  END IF;
END $$;

-- ---------- 2. combinado por área: valor e repasse juntos ----------
DO $$
DECLARE c public.appointment_charges%ROWTYPE;
BEGIN
  INSERT INTO public.patient_prices (patient_id, discipline, appointment_type, price_cents, note)
  VALUES ('b8000000-0000-4000-8000-000000000001', 'psicologia', NULL, 13000, 'promoção combinada');

  PERFORM pg_temp.atender('18000000-0000-4000-8000-000000000002', 'b8000000-0000-4000-8000-000000000001', 'session', public.finance_today() - 9);
  c := pg_temp.cobranca('18000000-0000-4000-8000-000000000002');
  IF c.price_cents <> 13000 THEN
    RAISE EXCEPTION 'cenário 2: devia sair 13000, saiu %', c.price_cents;
  END IF;
  -- Escolha de 11/11/2026: a promoção é dividida, o repasse acompanha.
  IF c.payout_cents <> 6500 THEN
    RAISE EXCEPTION 'cenário 2: repasse devia ser 6500 (50%% de 130), foi %', c.payout_cents;
  END IF;

  -- A avaliação, sem combinado próprio, cai no combinado da área.
  PERFORM pg_temp.atender('18000000-0000-4000-8000-000000000003', 'b8000000-0000-4000-8000-000000000001', 'evaluation', public.finance_today() - 8);
  c := pg_temp.cobranca('18000000-0000-4000-8000-000000000003');
  IF c.price_cents <> 13000 THEN
    RAISE EXCEPTION 'cenário 2: avaliação devia cair no combinado da área (13000), saiu %', c.price_cents;
  END IF;
END $$;

-- ---------- 3. combinado por serviço vence o da área ----------
DO $$
DECLARE c public.appointment_charges%ROWTYPE;
BEGIN
  INSERT INTO public.patient_prices (patient_id, discipline, appointment_type, price_cents)
  VALUES ('b8000000-0000-4000-8000-000000000001', 'psicologia', 'evaluation', 20000);

  PERFORM pg_temp.atender('18000000-0000-4000-8000-000000000004', 'b8000000-0000-4000-8000-000000000001', 'evaluation', public.finance_today() - 7);
  c := pg_temp.cobranca('18000000-0000-4000-8000-000000000004');
  IF c.price_cents <> 20000 THEN
    RAISE EXCEPTION 'cenário 3: avaliação devia sair 20000, saiu %', c.price_cents;
  END IF;

  -- A sessão continua no combinado da área.
  PERFORM pg_temp.atender('18000000-0000-4000-8000-000000000005', 'b8000000-0000-4000-8000-000000000001', 'session', public.finance_today() - 6);
  c := pg_temp.cobranca('18000000-0000-4000-8000-000000000005');
  IF c.price_cents <> 13000 THEN
    RAISE EXCEPTION 'cenário 3: sessão devia seguir 13000, saiu %', c.price_cents;
  END IF;
END $$;

-- ---------- 4. convênio ignora o combinado ----------
DO $$
DECLARE c public.appointment_charges%ROWTYPE;
BEGIN
  INSERT INTO public.clinic_convenios (id, clinic_id, name, ans_registry, cnpj, active)
  VALUES ('e8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001', 'Operadora Valor', '123456', '99888777000166', TRUE);
  INSERT INTO public.convenio_procedure_prices (convenio_id, discipline, appointment_type, price_cents, tuss_table, tuss_code, tuss_term)
  VALUES ('e8000000-0000-4000-8000-000000000001', 'psicologia', NULL, 9200, '22', '50000470', 'Sessão');
  INSERT INTO public.patient_coverages (id, patient_id, convenio_id, card_number)
  VALUES ('f8000000-0000-4000-8000-000000000001', 'b8000000-0000-4000-8000-000000000001', 'e8000000-0000-4000-8000-000000000001', '0009998887776');

  PERFORM pg_temp.atender('18000000-0000-4000-8000-000000000006', 'b8000000-0000-4000-8000-000000000001', 'session', public.finance_today() - 5,
                          'convenio', 'e8000000-0000-4000-8000-000000000001', 'f8000000-0000-4000-8000-000000000001');
  c := pg_temp.cobranca('18000000-0000-4000-8000-000000000006');
  IF c.price_cents <> 9200 OR c.payer <> 'convenio' THEN
    RAISE EXCEPTION 'cenário 4: convênio devia sair 9200 da operadora, saiu % (%)', c.price_cents, c.payer;
  END IF;
END $$;

-- ---------- 5. pacote ignora o combinado ----------
DO $$
DECLARE
  v_pkg public.patient_packages%ROWTYPE;
  c public.appointment_charges%ROWTYPE;
BEGIN
  v_pkg := public.finance_sell_package(
    'b8000000-0000-4000-8000-000000000001', NULL, 'Pacote 4 sessões', 'psicologia',
    'a8000000-0000-4000-8000-000000000003', 'counted', 4, 48000, ARRAY['session']::TEXT[],
    'upfront', 1, public.finance_today() - 5, 'free', NULL);

  -- O pacote nasce com sold_on = hoje e só cobre atendimento de hoje em
  -- diante: sessão de ontem continuaria avulsa, com o valor combinado.
  PERFORM pg_temp.atender('18000000-0000-4000-8000-000000000007', 'b8000000-0000-4000-8000-000000000001', 'session', public.finance_today());
  c := pg_temp.cobranca('18000000-0000-4000-8000-000000000007');
  IF c.package_id IS DISTINCT FROM v_pkg.id OR c.price_cents <> 12000 THEN
    RAISE EXCEPTION 'cenário 5: sessão de pacote devia sair 12000 do pacote, saiu % (pacote %)', c.price_cents, c.package_id;
  END IF;
END $$;

-- ---------- 6. cobrança já gravada não muda ----------
DO $$
DECLARE c public.appointment_charges%ROWTYPE;
BEGIN
  INSERT INTO public.patient_prices (patient_id, discipline, appointment_type, price_cents)
  VALUES ('b8000000-0000-4000-8000-000000000002', 'psicologia', NULL, 9000);
  c := pg_temp.cobranca('18000000-0000-4000-8000-000000000001');
  IF c.price_cents <> 15000 THEN
    RAISE EXCEPTION 'cenário 6: cobrança antiga mudou para %', c.price_cents;
  END IF;
END $$;

-- ---------- 7. desativar volta para a tabela; sem dois ativos ----------
DO $$
DECLARE c public.appointment_charges%ROWTYPE;
BEGIN
  BEGIN
    INSERT INTO public.patient_prices (patient_id, discipline, appointment_type, price_cents)
    VALUES ('b8000000-0000-4000-8000-000000000001', 'psicologia', NULL, 11000);
    RAISE EXCEPTION 'cenário 7: dois combinados ativos no mesmo escopo passaram';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  UPDATE public.patient_prices SET active = FALSE
  WHERE patient_id = 'b8000000-0000-4000-8000-000000000001' AND discipline = 'psicologia' AND appointment_type IS NULL;

  PERFORM pg_temp.atender('18000000-0000-4000-8000-000000000008', 'b8000000-0000-4000-8000-000000000001', 'anamnesis', public.finance_today() - 3);
  c := pg_temp.cobranca('18000000-0000-4000-8000-000000000008');
  IF c.price_cents <> 15000 THEN
    RAISE EXCEPTION 'cenário 7: desativado devia voltar para 15000, saiu %', c.price_cents;
  END IF;
END $$;

-- ---------- 8. quem pode, e o que é recusado ----------
DO $$
BEGIN
  BEGIN
    INSERT INTO public.patient_prices (patient_id, discipline, appointment_type, price_cents)
    VALUES ('b8000000-0000-4000-8000-000000000003', 'psicologia', NULL, 10000);
    RAISE EXCEPTION 'cenário 8: paciente de outra instituição passou';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.patient_prices (patient_id, discipline, appointment_type, price_cents)
    VALUES ('b8000000-0000-4000-8000-000000000002', 'psicologia', 'home_visit', 10000);
    RAISE EXCEPTION 'cenário 8: serviço fora da área passou';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;

SELECT set_config('request.jwt.claims', '{"sub":"a8000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}', TRUE);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.patient_prices) <> 0 THEN
    RAISE EXCEPTION 'cenário 8: recepção leu os valores combinados';
  END IF;
  BEGIN
    INSERT INTO public.patient_prices (patient_id, discipline, appointment_type, price_cents)
    VALUES ('b8000000-0000-4000-8000-000000000002', 'psicologia', NULL, 1000);
    RAISE EXCEPTION 'cenário 8: recepção gravou valor combinado';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

SELECT set_config('request.jwt.claims', '{"sub":"a8000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}', TRUE);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.patient_prices) <> 0 THEN
    RAISE EXCEPTION 'cenário 8: profissional leu os valores combinados';
  END IF;
END $$;

SELECT 'valor combinado por paciente: 8 cenários passaram' AS resultado;

ROLLBACK;
