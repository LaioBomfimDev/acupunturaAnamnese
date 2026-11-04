-- ==========================================================
-- Validação de 20261104b_valores_servicos_por_area.sql (BEGIN … ROLLBACK)
--
-- Chama as funções de verdade, com request.jwt.claims e o papel
-- authenticated, como a tela faz. Nada fica gravado: tudo termina em
-- ROLLBACK. Rode depois de aplicar a migration:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/validation/20261104b_valores_servicos_scenarios.sql
--
-- Cenários:
--   1. administração salva valores da instituição com tipos novos, tipo
--      anterior (Devolutiva) e R$ 0, e valores próprios da profissional;
--   2. recepção e profissional não salvam valores (42501);
--   3. escopo completo com um tipo fora da área é recusado inteiro: os
--      valores anteriores, o tipo anterior e a herança ficam como estavam;
--   4. herança: tipo novo sem valor cai no padrão da área; valor próprio
--      da profissional vence o da instituição;
--   5. tipo novo na Agenda: sem cobrança enquanto Agendado, cobrança com o
--      valor da profissional quando Atendido, tipo copiado na cobrança;
--   6. tipo fora da área barrado na Agenda (inserir e trocar a área);
--   7. pacote com tipo novo: venda pela RPC, Atendido gasta sessão, falta
--      (Não compareceu, Cancelado pelo paciente, Cancelado) não cobra nem
--      gasta; pacote e modelo com tipo de outra área recusados;
--   8. histórico: tipo anterior segue válido em qualquer área (inclusive
--      ao mudar o status de uma linha antiga);
--   9. repasse por tipo novo e preço de operadora por tipo novo, só na área;
--  10. nota fiscal descreve o tipo novo pelo nome.
-- Cada cenário que falha para a execução com a mensagem do cenário.
-- ==========================================================

BEGIN;

-- ---------- dados de teste (como postgres, sem RLS) ----------
INSERT INTO auth.users (id, email) VALUES
  ('a4000000-0000-4000-8000-000000000001', 'admin.valores@example.invalid'),
  ('a4000000-0000-4000-8000-000000000002', 'recepcao.valores@example.invalid'),
  ('a4000000-0000-4000-8000-000000000003', 'prof.valores@example.invalid')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.clinics (id, name) VALUES ('c4000000-0000-4000-8000-000000000001', 'Clínica Validação Valores');

INSERT INTO public.profiles (id, email, full_name, role, clinic_id, is_active, must_change_password, disciplines)
VALUES
  ('a4000000-0000-4000-8000-000000000001', 'admin.valores@example.invalid', 'Admin Valores', 'clinic_admin', 'c4000000-0000-4000-8000-000000000001', TRUE, FALSE, ARRAY['acupuntura']),
  ('a4000000-0000-4000-8000-000000000002', 'recepcao.valores@example.invalid', 'Recepção Valores', 'receptionist', 'c4000000-0000-4000-8000-000000000001', TRUE, FALSE, ARRAY[]::TEXT[]),
  ('a4000000-0000-4000-8000-000000000003', 'prof.valores@example.invalid', 'Profissional Valores', 'therapist', 'c4000000-0000-4000-8000-000000000001', TRUE, FALSE, ARRAY['acupuntura', 'fisioterapia', 'nutricao', 'aba'])
ON CONFLICT (id) DO UPDATE SET
  role = EXCLUDED.role, clinic_id = EXCLUDED.clinic_id, is_active = TRUE,
  must_change_password = FALSE, disciplines = EXCLUDED.disciplines, mfa_required = FALSE;

INSERT INTO public.patients (id, therapist_id, clinic_id, name) VALUES
  ('b4000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000003', 'c4000000-0000-4000-8000-000000000001', 'Paciente Valores Um'),
  ('b4000000-0000-4000-8000-000000000002', 'a4000000-0000-4000-8000-000000000003', 'c4000000-0000-4000-8000-000000000001', 'Paciente Valores Dois');

INSERT INTO public.clinic_finance_settings (clinic_id, starts_on)
VALUES ('c4000000-0000-4000-8000-000000000001', public.finance_today() - 60);

-- Linha antiga (antes da migration seria igual): Avaliação na Acupuntura,
-- agendada, para o cenário 8.
INSERT INTO public.appointments (id, clinic_id, patient_id, professional_id, discipline, appointment_type, starts_at, ends_at, status, kind)
VALUES ('14000000-0000-4000-8000-000000000099', 'c4000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000002', 'a4000000-0000-4000-8000-000000000003',
        'acupuntura', 'evaluation', (public.finance_today() - 5) + time '09:00' AT TIME ZONE 'America/Sao_Paulo',
        (public.finance_today() - 5) + time '10:00' AT TIME ZONE 'America/Sao_Paulo', 'scheduled', 'appointment');

SET LOCAL ROLE authenticated;

-- ---------- 1. administração salva instituição e profissional ----------
SELECT set_config('request.jwt.claims', '{"sub":"a4000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', TRUE);

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  v_count := public.finance_save_prices(NULL, '[
    {"discipline":"acupuntura","appointment_type":"","price_cents":10000},
    {"discipline":"acupuntura","appointment_type":"auriculotherapy","price_cents":8000},
    {"discipline":"acupuntura","appointment_type":"cupping","price_cents":0},
    {"discipline":"psicologia","appointment_type":"feedback","price_cents":12000},
    {"discipline":"psicologia","appointment_type":"e_ilib","price_cents":20000},
    {"discipline":"fisioterapia","appointment_type":"neuromodulation","price_cents":18000},
    {"discipline":"aba","appointment_type":"home_visit","price_cents":25000}
  ]'::JSONB);
  ASSERT v_count = 7, format('cenário 1: instituição gravou %s linhas, esperado 7', v_count);

  v_count := public.finance_save_prices('a4000000-0000-4000-8000-000000000003', '[
    {"discipline":"acupuntura","appointment_type":"auriculotherapy","price_cents":9000}
  ]'::JSONB);
  ASSERT v_count = 1, 'cenário 1: valor próprio da profissional não gravou';
END $$;

-- ---------- 2. outros perfis bloqueados ----------
SELECT set_config('request.jwt.claims', '{"sub":"a4000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}', TRUE);
DO $$
BEGIN
  BEGIN
    PERFORM public.finance_save_prices(NULL, '[]'::JSONB);
    RAISE EXCEPTION 'cenário 2: recepção salvou valores';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

SELECT set_config('request.jwt.claims', '{"sub":"a4000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}', TRUE);
DO $$
BEGIN
  BEGIN
    PERFORM public.finance_save_prices(NULL, '[]'::JSONB);
    RAISE EXCEPTION 'cenário 2: profissional salvou valores';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.finance_sell_package(
      'b4000000-0000-4000-8000-000000000001', NULL, 'Pacote', 'acupuntura', NULL, 'counted', 5, 40000,
      ARRAY['auriculotherapy'], 'upfront', 1, NULL, 'free', NULL);
    RAISE EXCEPTION 'cenário 2: profissional vendeu pacote';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

-- ---------- 3. escopo com tipo fora da área: recusado inteiro ----------
SELECT set_config('request.jwt.claims', '{"sub":"a4000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', TRUE);
DO $$
BEGIN
  BEGIN
    PERFORM public.finance_save_prices(NULL, '[
      {"discipline":"acupuntura","appointment_type":"","price_cents":11000},
      {"discipline":"nutricao","appointment_type":"auriculotherapy","price_cents":5000}
    ]'::JSONB);
    RAISE EXCEPTION 'cenário 3: auriculoterapia na Nutrição passou';
  EXCEPTION WHEN check_violation THEN
    ASSERT SQLERRM LIKE '%procedure_prices_appointment_type_check%', 'cenário 3: erro inesperado: ' || SQLERRM;
  END;
END $$;

RESET ROLE;
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM public.procedure_prices
          WHERE clinic_id = 'c4000000-0000-4000-8000-000000000001' AND professional_id IS NULL) = 7,
    'cenário 3: escopo da instituição mudou depois da recusa';
  ASSERT (SELECT price_cents FROM public.procedure_prices
          WHERE clinic_id = 'c4000000-0000-4000-8000-000000000001' AND professional_id IS NULL
            AND discipline = 'acupuntura' AND appointment_type IS NULL) = 10000,
    'cenário 3: padrão da área mudou depois da recusa';
  ASSERT EXISTS (SELECT 1 FROM public.procedure_prices
          WHERE clinic_id = 'c4000000-0000-4000-8000-000000000001' AND appointment_type = 'feedback' AND price_cents = 12000),
    'cenário 3: tipo anterior (Devolutiva) sumiu';
  ASSERT EXISTS (SELECT 1 FROM public.procedure_prices
          WHERE clinic_id = 'c4000000-0000-4000-8000-000000000001' AND appointment_type = 'cupping' AND price_cents = 0),
    'cenário 3: R$ 0 virou vazio';

  -- 4. herança
  ASSERT public.finance_resolve_price('c4000000-0000-4000-8000-000000000001', 'acupuntura', 'laserpuncture', 'a4000000-0000-4000-8000-000000000003') = 10000,
    'cenário 4: tipo novo sem valor não caiu no padrão da área';
  ASSERT public.finance_resolve_price('c4000000-0000-4000-8000-000000000001', 'acupuntura', 'auriculotherapy', 'a4000000-0000-4000-8000-000000000003') = 9000,
    'cenário 4: valor próprio da profissional não venceu';
  ASSERT public.finance_resolve_price('c4000000-0000-4000-8000-000000000001', 'acupuntura', 'auriculotherapy', 'a4000000-0000-4000-8000-000000000001') = 8000,
    'cenário 4: outra pessoa não ficou com o valor da instituição';
  ASSERT public.finance_resolve_price('c4000000-0000-4000-8000-000000000001', 'acupuntura', 'cupping', NULL) = 0,
    'cenário 4: R$ 0 da ventosa não valeu';
END $$;

-- ---------- 5 e 6. Agenda, como a profissional ----------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"a4000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}', TRUE);

INSERT INTO public.appointments (id, patient_id, professional_id, discipline, appointment_type, starts_at, ends_at, status, kind)
VALUES ('14000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000002', 'a4000000-0000-4000-8000-000000000003',
        'acupuntura', 'auriculotherapy', (public.finance_today() - 3) + time '09:00' AT TIME ZONE 'America/Sao_Paulo',
        (public.finance_today() - 3) + time '10:00' AT TIME ZONE 'America/Sao_Paulo', 'scheduled', 'appointment');

DO $$
BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM public.appointment_charges WHERE appointment_id = '14000000-0000-4000-8000-000000000001'),
    'cenário 5: Agendado já gerou cobrança';

  BEGIN
    INSERT INTO public.appointments (patient_id, professional_id, discipline, appointment_type, starts_at, ends_at, kind)
    VALUES ('b4000000-0000-4000-8000-000000000002', 'a4000000-0000-4000-8000-000000000003', 'nutricao', 'cupping',
            (public.finance_today() + 1) + time '09:00' AT TIME ZONE 'America/Sao_Paulo',
            (public.finance_today() + 1) + time '10:00' AT TIME ZONE 'America/Sao_Paulo', 'appointment');
    RAISE EXCEPTION 'cenário 6: ventosa na Nutrição passou';
  EXCEPTION WHEN check_violation THEN
    ASSERT SQLERRM LIKE '%appointments_type_check%', 'cenário 6: erro inesperado: ' || SQLERRM;
  END;

  BEGIN
    UPDATE public.appointments SET discipline = 'fisioterapia' WHERE id = '14000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'cenário 6: trocar a área deixou auriculoterapia na Fisioterapia';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;

UPDATE public.appointments SET status = 'attended' WHERE id = '14000000-0000-4000-8000-000000000001';

-- ---------- 7. pacote com tipo novo (administração vende) ----------
SELECT set_config('request.jwt.claims', '{"sub":"a4000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', TRUE);

DO $$
DECLARE
  v_pkg public.patient_packages;
BEGIN
  v_pkg := public.finance_sell_package(
    'b4000000-0000-4000-8000-000000000001', NULL, 'Auriculoterapia 5 sessões', 'acupuntura',
    'a4000000-0000-4000-8000-000000000003', 'counted', 5, 38000,
    ARRAY['auriculotherapy'], 'upfront', 1, NULL, 'free', NULL);
  ASSERT v_pkg.appointment_types = ARRAY['auriculotherapy'] AND v_pkg.total_cents = 38000,
    'cenário 7: pacote não gravou tipo e total como enviados';
  PERFORM set_config('valid.pkg', v_pkg.id::TEXT, TRUE);

  BEGIN
    PERFORM public.finance_sell_package(
      'b4000000-0000-4000-8000-000000000001', NULL, 'Pacote errado', 'nutricao', NULL, 'counted', 5, 30000,
      ARRAY['home_visit'], 'upfront', 1, NULL, 'free', NULL);
    RAISE EXCEPTION 'cenário 7: pacote de Nutrição com Visita domiciliar passou';
  EXCEPTION WHEN check_violation THEN
    ASSERT SQLERRM LIKE '%patient_packages_types%', 'cenário 7: erro inesperado: ' || SQLERRM;
  END;

  BEGIN
    INSERT INTO public.finance_package_models (clinic_id, name, discipline, kind, sessions, total_cents, appointment_types)
    VALUES ('c4000000-0000-4000-8000-000000000001', 'Modelo errado', 'psicologia', 'counted', 5, 30000, ARRAY['cupping']);
    RAISE EXCEPTION 'cenário 7: modelo de Psicologia com ventosa passou';
  EXCEPTION WHEN check_violation THEN
    ASSERT SQLERRM LIKE '%finance_package_models_types%', 'cenário 7: erro inesperado: ' || SQLERRM;
  END;

  INSERT INTO public.finance_package_models (clinic_id, name, discipline, kind, sessions, total_cents, appointment_types)
  VALUES ('c4000000-0000-4000-8000-000000000001', 'e-ILIB 10 sessões', 'psicologia', 'counted', 10, 200000, ARRAY['e_ilib', 'session']);
END $$;

SELECT set_config('request.jwt.claims', '{"sub":"a4000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}', TRUE);

-- Atendido: gasta a sessão 1 do pacote (pacote vale a partir do dia da
-- venda, por isso as sessões são de hoje, de madrugada, já passadas).
INSERT INTO public.appointments (id, patient_id, professional_id, discipline, appointment_type, starts_at, ends_at, status, kind)
VALUES ('14000000-0000-4000-8000-000000000002', 'b4000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000003',
        'acupuntura', 'auriculotherapy', public.finance_today() + time '00:10' AT TIME ZONE 'America/Sao_Paulo',
        public.finance_today() + time '00:40' AT TIME ZONE 'America/Sao_Paulo', 'scheduled', 'appointment');
UPDATE public.appointments SET status = 'attended' WHERE id = '14000000-0000-4000-8000-000000000002';

-- Faltas: nenhuma cobra nem gasta.
INSERT INTO public.appointments (id, patient_id, professional_id, discipline, appointment_type, starts_at, ends_at, status, kind)
VALUES
  ('14000000-0000-4000-8000-000000000003', 'b4000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000003',
   'acupuntura', 'auriculotherapy', public.finance_today() + time '00:50' AT TIME ZONE 'America/Sao_Paulo',
   public.finance_today() + time '01:20' AT TIME ZONE 'America/Sao_Paulo', 'scheduled', 'appointment'),
  ('14000000-0000-4000-8000-000000000004', 'b4000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000003',
   'acupuntura', 'auriculotherapy', public.finance_today() + time '01:30' AT TIME ZONE 'America/Sao_Paulo',
   public.finance_today() + time '02:00' AT TIME ZONE 'America/Sao_Paulo', 'scheduled', 'appointment'),
  ('14000000-0000-4000-8000-000000000005', 'b4000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000003',
   'acupuntura', 'auriculotherapy', public.finance_today() + time '02:10' AT TIME ZONE 'America/Sao_Paulo',
   public.finance_today() + time '02:40' AT TIME ZONE 'America/Sao_Paulo', 'scheduled', 'appointment');
UPDATE public.appointments SET status = 'no_show' WHERE id = '14000000-0000-4000-8000-000000000003';
UPDATE public.appointments SET status = 'excused' WHERE id = '14000000-0000-4000-8000-000000000004';
UPDATE public.appointments SET status = 'cancelled' WHERE id = '14000000-0000-4000-8000-000000000005';

-- 8. Linha antiga muda de status e segue válida; tipo anterior em outra área.
UPDATE public.appointments SET status = 'attended' WHERE id = '14000000-0000-4000-8000-000000000099';
INSERT INTO public.appointments (id, patient_id, professional_id, discipline, appointment_type, starts_at, ends_at, status, kind)
VALUES ('14000000-0000-4000-8000-000000000006', 'b4000000-0000-4000-8000-000000000002', 'a4000000-0000-4000-8000-000000000003',
        'aba', 'interview', (public.finance_today() - 1) + time '09:00' AT TIME ZONE 'America/Sao_Paulo',
        (public.finance_today() - 1) + time '10:00' AT TIME ZONE 'America/Sao_Paulo', 'scheduled', 'appointment');

-- ---------- 9. repasse e operadora (administração) ----------
SELECT set_config('request.jwt.claims', '{"sub":"a4000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', TRUE);
DO $$
BEGIN
  PERFORM public.finance_save_payout_rules('a4000000-0000-4000-8000-000000000003', '[
    {"discipline":"","appointment_type":"","mode":"percent","percent":"50"},
    {"discipline":"aba","appointment_type":"school_visit","mode":"per_appointment","amount_cents":"9000"}
  ]'::JSONB);
  BEGIN
    PERFORM public.finance_save_payout_rules('a4000000-0000-4000-8000-000000000003', '[
      {"discipline":"","appointment_type":"","mode":"percent","percent":"40"},
      {"discipline":"acupuntura","appointment_type":"school_visit","mode":"per_appointment","amount_cents":"9000"}
    ]'::JSONB);
    RAISE EXCEPTION 'cenário 9: repasse de Visita escolar na Acupuntura passou';
  EXCEPTION WHEN check_violation THEN
    ASSERT SQLERRM LIKE '%finance_payout_rules_appointment_type_check%', 'cenário 9: erro inesperado: ' || SQLERRM;
  END;
END $$;

RESET ROLE;
INSERT INTO public.clinic_convenios (id, clinic_id, name, ans_registry, active)
VALUES ('e4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001', 'Operadora Valores', '123456', TRUE);
INSERT INTO public.convenio_procedure_prices (convenio_id, discipline, appointment_type, price_cents, tuss_table, tuss_code, tuss_term)
VALUES ('e4000000-0000-4000-8000-000000000001', 'fisioterapia', 'neuromodulation', 15000, '00', 'NEUROMOD', 'Neuromodulação');
DO $$
BEGIN
  BEGIN
    INSERT INTO public.convenio_procedure_prices (convenio_id, discipline, appointment_type, price_cents)
    VALUES ('e4000000-0000-4000-8000-000000000001', 'nutricao', 'neuromodulation', 15000);
    RAISE EXCEPTION 'cenário 9: Neuromodulação na Nutrição passou na operadora';
  EXCEPTION WHEN check_violation THEN
    ASSERT SQLERRM LIKE '%convenio_procedure_prices_appointment_type_check%', 'cenário 9: erro inesperado: ' || SQLERRM;
  END;
END $$;

-- ---------- conferência (como postgres) ----------
DO $$
DECLARE
  c public.appointment_charges%ROWTYPE;
  v_pkg UUID := current_setting('valid.pkg')::UUID;
BEGIN
  -- 5
  SELECT * INTO c FROM public.appointment_charges WHERE appointment_id = '14000000-0000-4000-8000-000000000001';
  ASSERT FOUND, 'cenário 5: Atendido sem cobrança';
  ASSERT c.appointment_type = 'auriculotherapy' AND c.discipline = 'acupuntura', 'cenário 5: tipo não copiado na cobrança';
  ASSERT c.price_cents = 9000, format('cenário 5: esperado o valor da profissional 9000, veio %s', c.price_cents);

  -- 7
  SELECT * INTO c FROM public.appointment_charges WHERE appointment_id = '14000000-0000-4000-8000-000000000002';
  ASSERT c.package_id = v_pkg AND c.session_number = 1, 'cenário 7: Atendido não gastou o pacote';
  ASSERT NOT EXISTS (SELECT 1 FROM public.appointment_charges
                     WHERE appointment_id IN ('14000000-0000-4000-8000-000000000003', '14000000-0000-4000-8000-000000000004', '14000000-0000-4000-8000-000000000005')),
    'cenário 7: falta gerou cobrança';
  ASSERT (SELECT count(*) FROM public.appointment_charges WHERE package_id = v_pkg) = 1,
    'cenário 7: falta gastou sessão do pacote';

  -- 8
  SELECT * INTO c FROM public.appointment_charges WHERE appointment_id = '14000000-0000-4000-8000-000000000099';
  ASSERT FOUND AND c.appointment_type = 'evaluation' AND c.price_cents = 10000,
    'cenário 8: linha antiga (Avaliação na Acupuntura) não cobrou pelo padrão da área';

  -- 9
  ASSERT EXISTS (SELECT 1 FROM public.finance_payout_rules
                 WHERE professional_id = 'a4000000-0000-4000-8000-000000000003' AND appointment_type = 'school_visit' AND amount_cents = 9000),
    'cenário 9: regra de repasse sumiu depois da recusa';
  ASSERT (SELECT percent FROM public.finance_payout_rules
          WHERE professional_id = 'a4000000-0000-4000-8000-000000000003' AND discipline IS NULL) = 50,
    'cenário 9: regra base mudou depois da recusa';
  ASSERT c.payout_cents IS NOT NULL, 'cenário 8: repasse não calculado';

  -- 10
  ASSERT public.fiscal_type_label('e_ilib') = 'e-ILIB' AND public.fiscal_type_label('home_visit') = 'Visita domiciliar',
    'cenário 10: nota sem o nome do tipo novo';
END $$;

SELECT 'valores e serviços por área: todos os cenários passaram' AS resultado;

ROLLBACK;
