-- ==========================================================
-- Validação de 20261110b_financeiro_contas_do_mes.sql (BEGIN … ROLLBACK)
--
-- Chama as funções de verdade, com request.jwt.claims e o papel
-- authenticated, como a tela faz. Nada fica gravado: tudo termina em
-- ROLLBACK. Rode depois de aplicar a migration.
--
-- Cenários:
--   1. conta fixa paga ganha número de comprovante; "não houve" não ganha;
--      a próxima paga leva o número seguinte; Transferência e Boleto valem;
--   2. saída "a pagar" ganha o número só quando é paga;
--   3. compra continua na mesma sequência, sem repetir nem pular;
--   4. recepção lança gasto rápido (número seguinte, categoria interna,
--      quem pagou = ela); valor, data futura, forma e quem pagou de outra
--      instituição são recusados sem gastar número;
--   5. profissional não lança nem lista gasto rápido;
--   6. recepção lista os gastos rápidos de todos, não lê finance_expenses
--      direto e não anula;
--   7. administração anula o gasto rápido e o número fica guardado;
--   8. número de comprovante não se troca depois de dado.
-- ==========================================================

BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('a5000000-0000-4000-8000-000000000001', 'admin.contas@example.invalid'),
  ('a5000000-0000-4000-8000-000000000002', 'recepcao.contas@example.invalid'),
  ('a5000000-0000-4000-8000-000000000003', 'prof.contas@example.invalid'),
  ('a5000000-0000-4000-8000-000000000004', 'outra.contas@example.invalid')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.clinics (id, name) VALUES
  ('c5000000-0000-4000-8000-000000000001', 'Clínica Validação Contas'),
  ('c5000000-0000-4000-8000-000000000002', 'Outra Clínica Contas');

INSERT INTO public.profiles (id, email, full_name, role, clinic_id, is_active, must_change_password, disciplines)
VALUES
  ('a5000000-0000-4000-8000-000000000001', 'admin.contas@example.invalid', 'Admin Contas', 'clinic_admin', 'c5000000-0000-4000-8000-000000000001', TRUE, FALSE, ARRAY['psicologia']),
  ('a5000000-0000-4000-8000-000000000002', 'recepcao.contas@example.invalid', 'Recepção Contas', 'receptionist', 'c5000000-0000-4000-8000-000000000001', TRUE, FALSE, ARRAY[]::TEXT[]),
  ('a5000000-0000-4000-8000-000000000003', 'prof.contas@example.invalid', 'Profissional Contas', 'therapist', 'c5000000-0000-4000-8000-000000000001', TRUE, FALSE, ARRAY['psicologia']),
  ('a5000000-0000-4000-8000-000000000004', 'outra.contas@example.invalid', 'Pessoa de Outra', 'receptionist', 'c5000000-0000-4000-8000-000000000002', TRUE, FALSE, ARRAY[]::TEXT[])
ON CONFLICT (id) DO UPDATE SET
  role = EXCLUDED.role, clinic_id = EXCLUDED.clinic_id, is_active = TRUE,
  must_change_password = FALSE, disciplines = EXCLUDED.disciplines, mfa_required = FALSE;

INSERT INTO public.clinic_finance_settings (clinic_id, starts_on)
VALUES ('c5000000-0000-4000-8000-000000000001', public.finance_today() - 60);

INSERT INTO public.finance_expense_categories (id, clinic_id, name, system_key, sort_order) VALUES
  ('d5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'Contas de consumo', NULL, 40);

INSERT INTO public.finance_recurring_expenses (id, clinic_id, description, category_id, amount_cents, amount_varies, frequency, day_of_month, starts_on)
VALUES
  ('e5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'Energia elétrica', 'd5000000-0000-4000-8000-000000000001', 62000, TRUE, 'monthly', 12, public.finance_today() - 60),
  ('e5000000-0000-4000-8000-000000000002', 'c5000000-0000-4000-8000-000000000001', 'Internet', 'd5000000-0000-4000-8000-000000000001', 12990, FALSE, 'monthly', 10, public.finance_today() - 60);

SET LOCAL ROLE authenticated;

-- ---------- 1. conta fixa ----------
SELECT set_config('request.jwt.claims', '{"sub":"a5000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', TRUE);
DO $$
DECLARE
  v_year TEXT := EXTRACT(YEAR FROM public.finance_today())::TEXT;
  v_row public.finance_expenses%ROWTYPE;
BEGIN
  v_row := public.finance_settle_recurring('e5000000-0000-4000-8000-000000000001', public.finance_today() - 30, FALSE, 64350, public.finance_today() - 1, 'boleto', NULL);
  IF v_row.receipt_number IS DISTINCT FROM v_year || '-000001' THEN
    RAISE EXCEPTION 'cenário 1: primeira conta paga ficou com %', v_row.receipt_number;
  END IF;

  v_row := public.finance_settle_recurring('e5000000-0000-4000-8000-000000000002', public.finance_today() - 30, TRUE, NULL, NULL, NULL, NULL);
  IF v_row.receipt_number IS NOT NULL THEN
    RAISE EXCEPTION 'cenário 1: "não houve" ganhou número';
  END IF;

  v_row := public.finance_settle_recurring('e5000000-0000-4000-8000-000000000002', public.finance_today(), FALSE, 12990, public.finance_today(), 'transferencia', NULL);
  IF v_row.receipt_number IS DISTINCT FROM v_year || '-000002' THEN
    RAISE EXCEPTION 'cenário 1: segunda conta paga ficou com %', v_row.receipt_number;
  END IF;

  BEGIN
    PERFORM public.finance_settle_recurring('e5000000-0000-4000-8000-000000000001', public.finance_today(), FALSE, 100, public.finance_today(), 'cheque', NULL);
    RAISE EXCEPTION 'cenário 1: forma "cheque" passou';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;

-- ---------- 2. saída a pagar ganha número ao pagar ----------
DO $$
DECLARE
  v_year TEXT := EXTRACT(YEAR FROM public.finance_today())::TEXT;
  v_row public.finance_expenses%ROWTYPE;
BEGIN
  v_row := public.finance_register_expense('d5000000-0000-4000-8000-000000000001', 'Conserto do ar', 35000, NULL, NULL, public.finance_today() + 5, NULL, NULL, NULL);
  IF v_row.receipt_number IS NOT NULL THEN
    RAISE EXCEPTION 'cenário 2: saída a pagar já nasceu com número';
  END IF;
  v_row := public.finance_pay_expense(v_row.id, public.finance_today(), 'pix');
  IF v_row.receipt_number IS DISTINCT FROM v_year || '-000003' THEN
    RAISE EXCEPTION 'cenário 2: saída paga depois ficou com %', v_row.receipt_number;
  END IF;
END $$;

-- ---------- 3. compra na mesma sequência ----------
DO $$
DECLARE
  v_year TEXT := EXTRACT(YEAR FROM public.finance_today())::TEXT;
  v_row public.finance_expenses%ROWTYPE;
BEGIN
  v_row := public.finance_register_purchase('d5000000-0000-4000-8000-000000000001', public.finance_today(), 'dinheiro', NULL, NULL, NULL,
    '[{"description":"Água 20 L","quantity":2,"unit_cents":1400}]'::JSONB);
  IF v_row.receipt_number IS DISTINCT FROM v_year || '-000004' THEN
    RAISE EXCEPTION 'cenário 3: compra ficou com %', v_row.receipt_number;
  END IF;
END $$;

-- ---------- 4. recepção lança gasto rápido ----------
SELECT set_config('request.jwt.claims', '{"sub":"a5000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}', TRUE);
DO $$
DECLARE
  v_year TEXT := EXTRACT(YEAR FROM public.finance_today())::TEXT;
  v_row public.finance_expenses%ROWTYPE;
BEGIN
  BEGIN
    PERFORM public.finance_register_quick_expense('Lanche', 0, public.finance_today(), 'pix', NULL);
    RAISE EXCEPTION 'cenário 4: valor zero passou';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.finance_register_quick_expense('Lanche', 1000, public.finance_today() + 1, 'pix', NULL);
    RAISE EXCEPTION 'cenário 4: data futura passou';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.finance_register_quick_expense('Lanche', 1000, public.finance_today(), 'cheque', NULL);
    RAISE EXCEPTION 'cenário 4: forma inválida passou';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.finance_register_quick_expense('Lanche', 1000, public.finance_today(), 'pix', 'a5000000-0000-4000-8000-000000000004');
    RAISE EXCEPTION 'cenário 4: quem pagou de outra instituição passou';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  v_row := public.finance_register_quick_expense('  Almoço do time  ', 18600, public.finance_today(), 'cartao_credito', NULL);
  IF v_row.receipt_number IS DISTINCT FROM v_year || '-000005' THEN
    RAISE EXCEPTION 'cenário 4: gasto rápido ficou com % (recusas gastaram número?)', v_row.receipt_number;
  END IF;
  IF NOT v_row.is_quick OR v_row.description <> 'Almoço do time' OR v_row.paid_by <> 'a5000000-0000-4000-8000-000000000002' THEN
    RAISE EXCEPTION 'cenário 4: gasto rápido gravado errado';
  END IF;

  v_row := public.finance_register_quick_expense('Conserto da torneira', 9000, public.finance_today() - 2, 'pix', 'a5000000-0000-4000-8000-000000000001');
  IF v_row.paid_by <> 'a5000000-0000-4000-8000-000000000001' THEN
    RAISE EXCEPTION 'cenário 4: quem pagou não ficou a administração';
  END IF;
END $$;

RESET ROLE;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.finance_expense_categories WHERE clinic_id = 'c5000000-0000-4000-8000-000000000001' AND system_key = 'avulsa') <> 1 THEN
    RAISE EXCEPTION 'cenário 4: categoria interna não ficou uma só';
  END IF;
END $$;
SET LOCAL ROLE authenticated;

-- ---------- 5. profissional fora ----------
SELECT set_config('request.jwt.claims', '{"sub":"a5000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}', TRUE);
DO $$
BEGIN
  BEGIN
    PERFORM public.finance_register_quick_expense('Lanche', 1000, public.finance_today(), 'pix', NULL);
    RAISE EXCEPTION 'cenário 5: profissional lançou gasto rápido';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM * FROM public.finance_list_quick_expenses(public.finance_today() - 30, public.finance_today());
    RAISE EXCEPTION 'cenário 5: profissional listou gasto rápido';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

-- ---------- 6. recepção lista, não lê o resto, não anula ----------
SELECT set_config('request.jwt.claims', '{"sub":"a5000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}', TRUE);
DO $$
DECLARE
  v_count INTEGER;
  v_names TEXT;
  v_id UUID;
BEGIN
  SELECT count(*), string_agg(DISTINCT paid_by_name, ', ' ORDER BY paid_by_name), max(expense_id::TEXT)::UUID
  INTO v_count, v_names, v_id
  FROM public.finance_list_quick_expenses(public.finance_today() - 30, public.finance_today());
  IF v_count <> 2 OR v_names <> 'Admin Contas, Recepção Contas' THEN
    RAISE EXCEPTION 'cenário 6: recepção viu % gastos (%), esperado 2 de todos', v_count, v_names;
  END IF;

  SELECT count(*) INTO v_count FROM public.finance_expenses;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'cenário 6: recepção leu % saídas direto na tabela', v_count;
  END IF;

  BEGIN
    PERFORM public.finance_void_expense(v_id, 'teste da recepção');
    RAISE EXCEPTION 'cenário 6: recepção anulou';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

-- ---------- 7. administração anula, número fica ----------
SELECT set_config('request.jwt.claims', '{"sub":"a5000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', TRUE);
DO $$
DECLARE
  v_row public.finance_expenses%ROWTYPE;
  v_id UUID;
BEGIN
  SELECT expense_id INTO v_id FROM public.finance_list_quick_expenses(public.finance_today() - 30, public.finance_today())
  WHERE description = 'Almoço do time';
  v_row := public.finance_void_expense(v_id, 'lançado em dobro');
  IF v_row.voided_at IS NULL OR v_row.receipt_number IS NULL THEN
    RAISE EXCEPTION 'cenário 7: anulação perdeu o número';
  END IF;
END $$;

-- ---------- 8. número não se troca ----------
RESET ROLE;
DO $$
BEGIN
  BEGIN
    UPDATE public.finance_expenses SET receipt_number = '1999-000001'
    WHERE clinic_id = 'c5000000-0000-4000-8000-000000000001' AND description = 'Conserto da torneira';
    RAISE EXCEPTION 'cenário 8: número trocado';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

SELECT 'contas do mês: 8 cenários passaram' AS resultado;

ROLLBACK;
