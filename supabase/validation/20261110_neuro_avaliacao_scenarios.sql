-- ==========================================================
-- Validação de 20261110_neuro_avaliacao_valor_unico.sql (BEGIN … ROLLBACK)
--
-- Chama as funções de verdade, com request.jwt.claims e o papel
-- authenticated nas RPCs da tela. Nada fica gravado: tudo termina em
-- ROLLBACK. Rode depois de aplicar a migration:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/validation/20261110_neuro_avaliacao_scenarios.sql
--
-- Cenários:
--   1. sem valor da avaliação: atendimento de Neuropsicologia cobra como
--      antes (sem valor) e não abre avaliação;
--   2. administração grava o valor da avaliação e 3 sessões liberadas;
--      recepção não muda as liberadas (42501);
--   3. primeiro atendimento (anamnese) abre a avaliação: cobra o valor
--      inteiro, pacote com 3 + 2 previstos, pagamento a cada sessão;
--   4. sessões seguintes: R$ 0, numeradas; passar das liberadas não cobra;
--   5. "Liberar mais" (finance_update_package_plan) aceita a avaliação;
--   6. devolutiva Atendida: R$ 0 e encerra a avaliação;
--   7. atendimento depois da devolutiva abre avaliação nova, cobrando de novo;
--   8. transição: quem já tinha atendimento fora de pacote nos últimos 90
--      dias abre a avaliação com desconto total (nada a receber);
--   9. falta não abre avaliação nem cobra;
--  10. Acupuntura com pacote de valor fechado segue dividindo o valor.
-- Cada cenário que falha para a execução com a mensagem do cenário.
-- ==========================================================

BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('a5100000-0000-4000-8000-000000000001', 'admin.neuro@example.invalid'),
  ('a5100000-0000-4000-8000-000000000002', 'recepcao.neuro@example.invalid'),
  ('a5100000-0000-4000-8000-000000000003', 'prof.neuro@example.invalid')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.clinics (id, name) VALUES ('c5100000-0000-4000-8000-000000000001', 'Clínica Validação Neuro');

INSERT INTO public.profiles (id, email, full_name, role, clinic_id, is_active, must_change_password, disciplines)
VALUES
  ('a5100000-0000-4000-8000-000000000001', 'admin.neuro@example.invalid', 'Admin Neuro', 'clinic_admin', 'c5100000-0000-4000-8000-000000000001', TRUE, FALSE, ARRAY['neuropsicologia']),
  ('a5100000-0000-4000-8000-000000000002', 'recepcao.neuro@example.invalid', 'Recepção Neuro', 'receptionist', 'c5100000-0000-4000-8000-000000000001', TRUE, FALSE, ARRAY[]::TEXT[]),
  ('a5100000-0000-4000-8000-000000000003', 'prof.neuro@example.invalid', 'Profissional Neuro', 'therapist', 'c5100000-0000-4000-8000-000000000001', TRUE, FALSE, ARRAY['neuropsicologia', 'acupuntura'])
ON CONFLICT (id) DO UPDATE SET
  role = EXCLUDED.role, clinic_id = EXCLUDED.clinic_id, is_active = TRUE,
  must_change_password = FALSE, disciplines = EXCLUDED.disciplines, mfa_required = FALSE;

INSERT INTO public.patients (id, therapist_id, clinic_id, name) VALUES
  ('b5100000-0000-4000-8000-000000000001', 'a5100000-0000-4000-8000-000000000003', 'c5100000-0000-4000-8000-000000000001', 'Paciente Neuro Um'),
  ('b5100000-0000-4000-8000-000000000002', 'a5100000-0000-4000-8000-000000000003', 'c5100000-0000-4000-8000-000000000001', 'Paciente Neuro Dois'),
  ('b5100000-0000-4000-8000-000000000003', 'a5100000-0000-4000-8000-000000000003', 'c5100000-0000-4000-8000-000000000001', 'Paciente Acupuntura');

INSERT INTO public.clinic_finance_settings (clinic_id, starts_on)
VALUES ('c5100000-0000-4000-8000-000000000001', public.finance_today() - 120);

-- Atendimento já Atendido N dias atrás (agendado e depois Atendido, como
-- na Agenda: o gatilho de status gera a cobrança).
CREATE FUNCTION pg_temp.attend(p_patient UUID, p_discipline TEXT, p_type TEXT, p_days_ago INTEGER, p_status TEXT DEFAULT 'attended')
RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
  v_id UUID := gen_random_uuid();
  v_day DATE := public.finance_today() - p_days_ago;
BEGIN
  INSERT INTO public.appointments (id, clinic_id, patient_id, professional_id, discipline, appointment_type, starts_at, ends_at, status, kind)
  VALUES (v_id, 'c5100000-0000-4000-8000-000000000001', p_patient, 'a5100000-0000-4000-8000-000000000003',
          p_discipline, p_type, v_day + time '09:00' AT TIME ZONE 'America/Sao_Paulo',
          v_day + time '10:00' AT TIME ZONE 'America/Sao_Paulo', 'scheduled', 'appointment');
  UPDATE public.appointments SET status = p_status WHERE id = v_id;
  RETURN v_id;
END;
$$;

CREATE FUNCTION pg_temp.charge(p_appt UUID) RETURNS public.appointment_charges LANGUAGE sql AS $$
  SELECT * FROM public.appointment_charges WHERE appointment_id = p_appt AND voided_at IS NULL;
$$;

-- ---------- 1. sem valor: como antes ----------
DO $$
DECLARE
  v_appt UUID := pg_temp.attend('b5100000-0000-4000-8000-000000000002', 'neuropsicologia', 'evaluation', 10);
  c public.appointment_charges;
BEGIN
  c := pg_temp.charge(v_appt);
  ASSERT c.id IS NOT NULL, 'cenário 1: atendimento sem cobrança';
  ASSERT c.price_cents IS NULL AND c.package_id IS NULL, 'cenário 1: sem valor cadastrado não podia abrir avaliação';
  ASSERT NOT EXISTS (SELECT 1 FROM public.patient_packages WHERE clinic_id = 'c5100000-0000-4000-8000-000000000001'),
    'cenário 1: pacote aberto sem valor';
END $$;

-- ---------- 2. administração grava; recepção não ----------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"a5100000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', TRUE);
DO $$
DECLARE
  v_count INTEGER;
  v_row public.clinic_finance_settings;
BEGIN
  v_count := public.finance_save_prices(NULL, '[
    {"discipline":"neuropsicologia","appointment_type":"","price_cents":300000},
    {"discipline":"acupuntura","appointment_type":"","price_cents":15000}
  ]'::JSONB);
  ASSERT v_count = 2, 'cenário 2: valores não gravaram';
  v_row := public.finance_set_neuro_sessions(3);
  ASSERT v_row.neuro_sessions_included = 3, 'cenário 2: liberadas não gravaram';
  BEGIN
    PERFORM public.finance_set_neuro_sessions(0);
    RAISE EXCEPTION 'cenário 2: aceitou 0 sessões liberadas';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END $$;

SELECT set_config('request.jwt.claims', '{"sub":"a5100000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}', TRUE);
DO $$
BEGIN
  BEGIN
    PERFORM public.finance_set_neuro_sessions(5);
    RAISE EXCEPTION 'cenário 2: recepção mudou as liberadas';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;

-- ---------- 3 a 7. avaliação completa do Paciente Um ----------
DO $$
DECLARE
  v_anamnese UUID;
  v_s UUID;
  v_devolutiva UUID;
  v_next UUID;
  c public.appointment_charges;
  p public.patient_packages;
  i INTEGER;
BEGIN
  -- 3
  v_anamnese := pg_temp.attend('b5100000-0000-4000-8000-000000000001', 'neuropsicologia', 'anamnesis', 30);
  c := pg_temp.charge(v_anamnese);
  ASSERT c.price_cents = 300000, format('cenário 3: anamnese cobrou %s, esperado 300000', c.price_cents);
  ASSERT c.session_number = 1, 'cenário 3: anamnese não é o atendimento 1';
  SELECT * INTO p FROM public.patient_packages WHERE id = c.package_id;
  ASSERT p.kind = 'assessment' AND p.sessions_planned = 5 AND p.payment_plan = 'per_session'
     AND p.total_cents = 300000 AND p.discount_cents = 0 AND p.status = 'active' AND p.professional_id IS NULL,
    'cenário 3: avaliação aberta errada';

  -- 4: cinco sessões (3 liberadas, 1 no lugar da devolutiva prevista e
  -- 1 além da previsão): todas R$ 0
  FOR i IN 1..5 LOOP
    v_s := pg_temp.attend('b5100000-0000-4000-8000-000000000001', 'neuropsicologia', 'evaluation', 30 - i);
    c := pg_temp.charge(v_s);
    ASSERT c.package_id = p.id, format('cenário 4: sessão %s fora da avaliação', i);
    ASSERT c.price_cents = 0, format('cenário 4: sessão %s cobrou %s', i, c.price_cents);
    ASSERT c.session_number = i + 1, format('cenário 4: sessão %s com número %s', i, c.session_number);
  END LOOP;
  SELECT * INTO p FROM public.patient_packages WHERE id = p.id;
  ASSERT p.status = 'active', 'cenário 4: avaliação fechou sem devolutiva';
END $$;

-- 5: liberar mais (pela RPC, como administração)
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"a5100000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', TRUE);
DO $$
DECLARE
  p public.patient_packages;
BEGIN
  SELECT * INTO p FROM public.patient_packages
  WHERE patient_id = 'b5100000-0000-4000-8000-000000000001' AND kind = 'assessment' AND status = 'active';
  p := public.finance_update_package_plan(p.id, 8);
  ASSERT p.sessions_planned = 8, 'cenário 5: não liberou mais sessões';
  BEGIN
    PERFORM public.finance_update_package_plan(p.id, 2);
    RAISE EXCEPTION 'cenário 5: previsão abaixo do feito passou';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END $$;
RESET ROLE;

DO $$
DECLARE
  v_devolutiva UUID;
  v_next UUID;
  c public.appointment_charges;
  p public.patient_packages;
  v_first UUID;
BEGIN
  -- 6
  v_devolutiva := pg_temp.attend('b5100000-0000-4000-8000-000000000001', 'neuropsicologia', 'feedback', 20);
  c := pg_temp.charge(v_devolutiva);
  ASSERT c.price_cents = 0, 'cenário 6: devolutiva cobrou';
  SELECT * INTO p FROM public.patient_packages WHERE id = c.package_id;
  v_first := p.id;
  ASSERT p.status = 'completed' AND p.close_action = 'auto', 'cenário 6: devolutiva não encerrou a avaliação';
  ASSERT (SELECT sum(price_cents) FROM public.appointment_charges WHERE package_id = p.id AND voided_at IS NULL) = 300000,
    'cenário 6: soma da avaliação diferente do valor';

  -- 7
  v_next := pg_temp.attend('b5100000-0000-4000-8000-000000000001', 'neuropsicologia', 'evaluation', 2);
  c := pg_temp.charge(v_next);
  ASSERT c.package_id IS DISTINCT FROM v_first AND c.price_cents = 300000 AND c.session_number = 1,
    'cenário 7: atendimento depois da devolutiva não abriu avaliação nova';
END $$;

-- ---------- 8. transição ----------
DO $$
DECLARE
  v_appt UUID := pg_temp.attend('b5100000-0000-4000-8000-000000000002', 'neuropsicologia', 'evaluation', 3);
  c public.appointment_charges;
  p public.patient_packages;
BEGIN
  c := pg_temp.charge(v_appt);
  SELECT * INTO p FROM public.patient_packages WHERE id = c.package_id;
  ASSERT p.kind = 'assessment' AND p.discount_cents = p.total_cents, 'cenário 8: transição sem desconto total';
  ASSERT c.price_cents = 0, format('cenário 8: quem já estava em avaliação foi cobrado %s', c.price_cents);
END $$;

-- ---------- 9. falta ----------
DO $$
DECLARE
  v_appt UUID;
BEGIN
  INSERT INTO public.patients (id, therapist_id, clinic_id, name)
  VALUES ('b5100000-0000-4000-8000-000000000004', 'a5100000-0000-4000-8000-000000000003', 'c5100000-0000-4000-8000-000000000001', 'Paciente Faltou');
  v_appt := pg_temp.attend('b5100000-0000-4000-8000-000000000004', 'neuropsicologia', 'anamnesis', 1, 'no_show');
  ASSERT (pg_temp.charge(v_appt)).id IS NULL, 'cenário 9: falta cobrou';
  ASSERT NOT EXISTS (SELECT 1 FROM public.patient_packages WHERE patient_id = 'b5100000-0000-4000-8000-000000000004'),
    'cenário 9: falta abriu avaliação';
END $$;

-- ---------- 10. Acupuntura: valor fechado segue dividindo ----------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"a5100000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', TRUE);
SELECT public.finance_sell_package(
  'b5100000-0000-4000-8000-000000000003', NULL, 'Pacote fechado', 'acupuntura', NULL, 'closed', 3, 30000,
  ARRAY[]::TEXT[], 'upfront', 1, NULL, 'free', NULL);
RESET ROLE;
DO $$
DECLARE
  c public.appointment_charges;
BEGIN
  c := pg_temp.charge(pg_temp.attend('b5100000-0000-4000-8000-000000000003', 'acupuntura', 'session', 0));
  ASSERT c.price_cents = 10000 AND c.session_number = 1, format('cenário 10: valor fechado cobrou %s', c.price_cents);
END $$;

SELECT 'avaliação neuropsicológica com valor único: todos os cenários passaram' AS resultado;

ROLLBACK;
