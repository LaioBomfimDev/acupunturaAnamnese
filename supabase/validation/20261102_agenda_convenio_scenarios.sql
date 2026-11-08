-- ==========================================================
-- Validação de 20261102_agenda_convenio.sql (BEGIN … ROLLBACK)
--
-- Chama as funções de verdade, com request.jwt.claims e o papel
-- authenticated, como a tela faz. Nada fica gravado: tudo termina em
-- ROLLBACK. Rode depois de aplicar a migration:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/validation/20261102_agenda_convenio_scenarios.sql
--
-- Cenários:
--   1. particular sem mudança (preço da tabela, repasse, payer patient);
--   2. convênio com preço do tipo (vence o padrão da área), TUSS copiado,
--      pacote particular ativo NÃO é gasto;
--   3. convênio com preço da área (tipo sem preço próprio);
--   4. convênio sem preço: price_cents NULL ("sem valor");
--   5. carteira de outro paciente barrada (e de outra operadora);
--   6. recepção vê se tem preço e o TUSS na RPC, nunca o valor; a
--      administração vê o valor;
--   7. atendimento já Atendido que muda para convênio refaz a cobrança;
--   8. "sessão N de M" não aparece em atendimento de convênio;
--   9. exclusão de paciente aprovada com carteira, convênio e pagamento
--      passa, e a cobrança fica sem a carteira.
-- Cada cenário que falha para a execução com a mensagem do cenário.
-- ==========================================================

BEGIN;

-- ---------- dados de teste (como postgres, sem RLS) ----------
INSERT INTO auth.users (id, email) VALUES
  ('a0000000-0000-4000-8000-000000000001', 'admin.validacao@example.invalid'),
  ('a0000000-0000-4000-8000-000000000002', 'recepcao.validacao@example.invalid'),
  ('a0000000-0000-4000-8000-000000000003', 'psico.validacao@example.invalid')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.clinics (id, name) VALUES ('c0000000-0000-4000-8000-000000000001', 'Clínica Validação Convênio');

INSERT INTO public.profiles (id, email, full_name, role, clinic_id, is_active, must_change_password, disciplines)
VALUES
  ('a0000000-0000-4000-8000-000000000001', 'admin.validacao@example.invalid', 'Admin Validação', 'clinic_admin', 'c0000000-0000-4000-8000-000000000001', TRUE, FALSE, ARRAY['psicologia']),
  ('a0000000-0000-4000-8000-000000000002', 'recepcao.validacao@example.invalid', 'Recepção Validação', 'receptionist', 'c0000000-0000-4000-8000-000000000001', TRUE, FALSE, ARRAY[]::TEXT[]),
  ('a0000000-0000-4000-8000-000000000003', 'psico.validacao@example.invalid', 'Psicóloga Validação', 'therapist', 'c0000000-0000-4000-8000-000000000001', TRUE, FALSE, ARRAY['psicologia', 'acupuntura'])
ON CONFLICT (id) DO UPDATE SET
  role = EXCLUDED.role, clinic_id = EXCLUDED.clinic_id, is_active = TRUE,
  must_change_password = FALSE, disciplines = EXCLUDED.disciplines, mfa_required = FALSE;

INSERT INTO public.patients (id, therapist_id, clinic_id, name) VALUES
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000001', 'Paciente Um'),
  ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000001', 'Paciente Dois');

INSERT INTO public.clinic_finance_settings (clinic_id, starts_on)
VALUES ('c0000000-0000-4000-8000-000000000001', public.finance_today() - 60);

-- Particular: psicologia R$ 200 na instituição; repasse 50%.
INSERT INTO public.procedure_prices (clinic_id, discipline, appointment_type, professional_id, price_cents, active)
VALUES ('c0000000-0000-4000-8000-000000000001', 'psicologia', NULL, NULL, 20000, TRUE),
       ('c0000000-0000-4000-8000-000000000001', 'acupuntura', NULL, NULL, 15000, TRUE);
INSERT INTO public.finance_payout_rules (clinic_id, professional_id, discipline, appointment_type, mode, percent)
VALUES ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003', NULL, NULL, 'percent', 50);

-- Pacote particular ativo do Paciente Um (não pode ser gasto pelo convênio).
INSERT INTO public.patient_packages (id, clinic_id, patient_id, discipline, name, kind, sessions_planned, total_cents, payment_plan, sold_on, status)
VALUES ('d0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
        'psicologia', 'Pacote de 4 sessões', 'counted', 4, 64000, 'upfront', public.finance_today() - 30, 'active');

-- Operadora com preço da área (R$ 100, TUSS 50000470) e do tipo Avaliação (R$ 150).
INSERT INTO public.clinic_convenios (id, clinic_id, name, ans_registry, active)
VALUES ('e0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'Operadora Validação', '123456', TRUE),
       ('e0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001', 'Outra Operadora', '654321', TRUE);
INSERT INTO public.convenio_procedure_prices (convenio_id, discipline, appointment_type, price_cents, tuss_table, tuss_code, tuss_term)
VALUES ('e0000000-0000-4000-8000-000000000001', 'psicologia', NULL, 10000, '22', '50000470', 'Sessão de psicoterapia individual'),
       ('e0000000-0000-4000-8000-000000000001', 'psicologia', 'evaluation', 15000, '22', '50000462', 'Avaliação psicológica');

INSERT INTO public.patient_coverages (id, patient_id, convenio_id, card_number, card_valid_until)
VALUES ('f0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'CART-0001', public.finance_today() + 365),
       ('f0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001', 'CART-0002', NULL),
       ('f0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002', 'CART-0003', NULL);

-- ---------- a partir daqui, como a psicóloga (authenticated) ----------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}', TRUE);

-- 1. Particular sem mudança
INSERT INTO public.appointments (id, patient_id, professional_id, discipline, appointment_type, starts_at, ends_at, status, kind)
VALUES ('10000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000003',
        'psicologia', 'session', (public.finance_today() - 3) + time '09:00' AT TIME ZONE 'America/Sao_Paulo',
        (public.finance_today() - 3) + time '10:00' AT TIME ZONE 'America/Sao_Paulo', 'scheduled', 'appointment');
UPDATE public.appointments SET status = 'attended' WHERE id = '10000000-0000-4000-8000-000000000001';

-- 2. Convênio, preço do tipo (Avaliação), Paciente Um, com pacote particular ativo
INSERT INTO public.appointments (id, patient_id, professional_id, discipline, appointment_type, starts_at, ends_at, status, kind, billing_type, convenio_id, coverage_id)
VALUES ('10000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003',
        'psicologia', 'evaluation', (public.finance_today() - 3) + time '11:00' AT TIME ZONE 'America/Sao_Paulo',
        (public.finance_today() - 3) + time '12:00' AT TIME ZONE 'America/Sao_Paulo', 'scheduled', 'appointment',
        'convenio', 'e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001');

-- 8. Antes de acontecer, convênio não mostra o pacote particular
DO $$
BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM public.appointment_package_info('10000000-0000-4000-8000-000000000002')),
    'cenário 8: atendimento de convênio não pode mostrar pacote particular';
END $$;

UPDATE public.appointments SET status = 'attended' WHERE id = '10000000-0000-4000-8000-000000000002';

-- 3. Convênio, preço da área (Sessão não tem preço próprio)
INSERT INTO public.appointments (id, patient_id, professional_id, discipline, appointment_type, starts_at, ends_at, status, kind, billing_type, convenio_id, coverage_id)
VALUES ('10000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003',
        'psicologia', 'session', (public.finance_today() - 2) + time '09:00' AT TIME ZONE 'America/Sao_Paulo',
        (public.finance_today() - 2) + time '10:00' AT TIME ZONE 'America/Sao_Paulo', 'attended', 'appointment',
        'convenio', 'e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001');

-- 4. Convênio sem preço (Acupuntura não tem preço na operadora)
INSERT INTO public.appointments (id, patient_id, professional_id, discipline, appointment_type, starts_at, ends_at, status, kind, billing_type, convenio_id, coverage_id)
VALUES ('10000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003',
        'acupuntura', 'session', (public.finance_today() - 2) + time '11:00' AT TIME ZONE 'America/Sao_Paulo',
        (public.finance_today() - 2) + time '12:00' AT TIME ZONE 'America/Sao_Paulo', 'attended', 'appointment',
        'convenio', 'e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001');

-- 5. Carteira de outro paciente e de outra operadora: barradas
DO $$
BEGIN
  BEGIN
    INSERT INTO public.appointments (patient_id, professional_id, discipline, starts_at, ends_at, kind, billing_type, convenio_id, coverage_id)
    VALUES ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003', 'psicologia',
            (public.finance_today() + 1) + time '09:00' AT TIME ZONE 'America/Sao_Paulo',
            (public.finance_today() + 1) + time '10:00' AT TIME ZONE 'America/Sao_Paulo', 'appointment',
            'convenio', 'e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'cenário 5: carteira de outro paciente passou';
  EXCEPTION WHEN others THEN
    ASSERT SQLERRM LIKE '%carteira_de_outro_paciente%', 'cenário 5: erro inesperado: ' || SQLERRM;
  END;
  BEGIN
    INSERT INTO public.appointments (patient_id, professional_id, discipline, starts_at, ends_at, kind, billing_type, convenio_id, coverage_id)
    VALUES ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003', 'psicologia',
            (public.finance_today() + 1) + time '11:00' AT TIME ZONE 'America/Sao_Paulo',
            (public.finance_today() + 1) + time '12:00' AT TIME ZONE 'America/Sao_Paulo', 'appointment',
            'convenio', 'e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000003');
    RAISE EXCEPTION 'cenário 5: carteira de outra operadora passou';
  EXCEPTION WHEN others THEN
    ASSERT SQLERRM LIKE '%carteira_de_outra_operadora%', 'cenário 5: erro inesperado: ' || SQLERRM;
  END;
  BEGIN
    INSERT INTO public.appointments (patient_id, professional_id, discipline, starts_at, ends_at, kind, billing_type)
    VALUES ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003', 'psicologia',
            (public.finance_today() + 1) + time '13:00' AT TIME ZONE 'America/Sao_Paulo',
            (public.finance_today() + 1) + time '14:00' AT TIME ZONE 'America/Sao_Paulo', 'appointment', 'convenio');
    RAISE EXCEPTION 'cenário 5: convênio sem operadora passou';
  EXCEPTION WHEN others THEN
    ASSERT SQLERRM LIKE '%convenio_sem_operadora%', 'cenário 5: erro inesperado: ' || SQLERRM;
  END;
END $$;

-- 7. Atendido como particular e corrigido depois para convênio
INSERT INTO public.appointments (id, patient_id, professional_id, discipline, appointment_type, starts_at, ends_at, status, kind)
VALUES ('10000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000003',
        'psicologia', 'session', (public.finance_today() - 1) + time '09:00' AT TIME ZONE 'America/Sao_Paulo',
        (public.finance_today() - 1) + time '10:00' AT TIME ZONE 'America/Sao_Paulo', 'attended', 'appointment');
UPDATE public.appointments
SET billing_type = 'convenio', convenio_id = 'e0000000-0000-4000-8000-000000000001', coverage_id = 'f0000000-0000-4000-8000-000000000002'
WHERE id = '10000000-0000-4000-8000-000000000005';

-- ---------- conferência das cobranças (como postgres) ----------
RESET ROLE;

DO $$
DECLARE
  c public.appointment_charges%ROWTYPE;
  v_package_sessions INTEGER;
BEGIN
  -- 1
  SELECT * INTO c FROM public.appointment_charges WHERE appointment_id = '10000000-0000-4000-8000-000000000001';
  ASSERT FOUND, 'cenário 1: particular sem cobrança';
  ASSERT c.payer = 'patient' AND c.convenio_id IS NULL AND c.tuss_code IS NULL, 'cenário 1: particular com dados de convênio';
  ASSERT c.price_cents = 20000 AND c.payout_cents = 10000, format('cenário 1: valor %s / repasse %s', c.price_cents, c.payout_cents);

  -- 2
  SELECT * INTO c FROM public.appointment_charges WHERE appointment_id = '10000000-0000-4000-8000-000000000002';
  ASSERT c.payer = 'convenio' AND c.convenio_id = 'e0000000-0000-4000-8000-000000000001', 'cenário 2: quem paga errado';
  ASSERT c.coverage_id = 'f0000000-0000-4000-8000-000000000001', 'cenário 2: carteira não copiada';
  ASSERT c.price_cents = 15000, format('cenário 2: preço do tipo esperado 15000, veio %s', c.price_cents);
  ASSERT c.tuss_table = '22' AND c.tuss_code = '50000462' AND c.tuss_term = 'Avaliação psicológica', 'cenário 2: TUSS não copiado';
  ASSERT c.package_id IS NULL AND c.session_number IS NULL, 'cenário 2: convênio gastou pacote particular';
  -- Repasse provisório: mesma regra do particular (50%) sobre o valor da operadora.
  ASSERT c.payout_cents = 7500, format('cenário 2: repasse esperado 7500, veio %s', c.payout_cents);
  SELECT count(*) INTO v_package_sessions FROM public.appointment_charges WHERE package_id = 'd0000000-0000-4000-8000-000000000001';
  ASSERT v_package_sessions = 0, 'cenário 2: o pacote particular perdeu sessão';

  -- 3
  SELECT * INTO c FROM public.appointment_charges WHERE appointment_id = '10000000-0000-4000-8000-000000000003';
  ASSERT c.payer = 'convenio' AND c.price_cents = 10000 AND c.tuss_code = '50000470',
    format('cenário 3: preço da área esperado 10000/50000470, veio %s/%s', c.price_cents, c.tuss_code);

  -- 4
  SELECT * INTO c FROM public.appointment_charges WHERE appointment_id = '10000000-0000-4000-8000-000000000004';
  ASSERT FOUND AND c.payer = 'convenio', 'cenário 4: convênio sem preço sem cobrança';
  ASSERT c.price_cents IS NULL AND c.tuss_code IS NULL AND c.payout_cents = 0, 'cenário 4: sem preço precisa gravar NULL';

  -- 7
  ASSERT (SELECT count(*) FROM public.appointment_charges WHERE appointment_id = '10000000-0000-4000-8000-000000000005') = 1,
    'cenário 7: cobrança duplicada';
  SELECT * INTO c FROM public.appointment_charges WHERE appointment_id = '10000000-0000-4000-8000-000000000005';
  ASSERT c.voided_at IS NULL AND c.payer = 'convenio' AND c.price_cents = 10000 AND c.coverage_id = 'f0000000-0000-4000-8000-000000000002',
    format('cenário 7: não refez a cobrança (payer %s, valor %s, anulada %s)', c.payer, c.price_cents, c.voided_at);
END $$;

-- 6. RPC: recepção sem valor, administração com valor
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}', TRUE);
DO $$
DECLARE
  r RECORD;
BEGIN
  SELECT * INTO r FROM public.convenio_price_check('e0000000-0000-4000-8000-000000000001', 'psicologia', 'evaluation');
  ASSERT r.tem_preco AND r.do_tipo AND r.codigo = '50000462', 'cenário 6: recepção não soube que tem preço';
  ASSERT r.valor_centavos IS NULL, 'cenário 6: recepção viu o valor da operadora';
  SELECT * INTO r FROM public.convenio_price_check('e0000000-0000-4000-8000-000000000001', 'acupuntura', 'session');
  ASSERT NOT r.tem_preco AND r.valor_centavos IS NULL, 'cenário 6: área sem preço apareceu com preço';
  -- A tabela de preços continua fechada para a recepção.
  ASSERT (SELECT count(*) FROM public.convenio_procedure_prices) = 0, 'cenário 6: recepção leu convenio_procedure_prices';
END $$;

SELECT set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', TRUE);
DO $$
DECLARE
  r RECORD;
BEGIN
  SELECT * INTO r FROM public.convenio_price_check('e0000000-0000-4000-8000-000000000001', 'psicologia', 'session');
  ASSERT r.tem_preco AND NOT r.do_tipo AND r.valor_centavos = 10000, 'cenário 6: administração não viu o valor da área';
  SELECT * INTO r FROM public.convenio_price_check('e0000000-0000-4000-8000-000000000001', 'psicologia', 'evaluation');
  ASSERT r.valor_centavos = 15000, 'cenário 6: administração não viu o valor do tipo';
END $$;

-- 9. Exclusão de paciente aprovada com carteira, atendimento de convênio
--    e pagamento da operadora: passa, e a cobrança fica (KEPT_ON_PURPOSE).
-- Desde 20261103 (Fase 2) o pagamento da operadora entra por
-- finance_tiss_register_payment, não por finance_receipts: o recebimento
-- abaixo só roda antes dela. A exclusão com pagamento da operadora em lote
-- é conferida em 20261103_convenios_fase2_scenarios.sql.
DO $$
BEGIN
  IF to_regclass('public.tiss_guides') IS NULL THEN
    PERFORM public.finance_register_receipt(
      'b0000000-0000-4000-8000-000000000001', public.finance_today(),
      jsonb_build_array(jsonb_build_object(
        'charge_id', (SELECT id FROM public.appointment_charges WHERE appointment_id = '10000000-0000-4000-8000-000000000003'),
        'amount_cents', 10000, 'method', 'outro')),
      'Pagamento da operadora (validação)'
    );
  END IF;
END $$;

SELECT set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}', TRUE);
SELECT public.request_patient_deletion('b0000000-0000-4000-8000-000000000001', 'Pedido de exclusão só para a validação.');

SELECT set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', TRUE);
SELECT public.admin_decide_patient_deletion(
  (SELECT id FROM public.patient_deletion_requests WHERE patient_id = 'b0000000-0000-4000-8000-000000000001' AND status = 'pending'),
  'approved', 'Aprovado na validação.'
);

RESET ROLE;
DO $$
BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM public.patient_coverages WHERE patient_id = 'b0000000-0000-4000-8000-000000000001'),
    'cenário 9: carteira do paciente excluído ficou';
  ASSERT NOT EXISTS (SELECT 1 FROM public.appointments WHERE patient_id = 'b0000000-0000-4000-8000-000000000001'),
    'cenário 9: agendamento do paciente excluído ficou';
  ASSERT (SELECT count(*) FROM public.appointment_charges
          WHERE patient_id = 'b0000000-0000-4000-8000-000000000001' AND payer = 'convenio' AND coverage_id IS NULL) = 3,
    'cenário 9: a cobrança de convênio precisa ficar, sem a carteira';
END $$;

SELECT 'agenda com convênio: todos os cenários passaram' AS resultado;

ROLLBACK;
