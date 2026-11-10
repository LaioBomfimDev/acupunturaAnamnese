-- ==========================================================
-- Validação de 20261110c_financeiro_recibo_prestador.sql (BEGIN … ROLLBACK)
--
-- Cenários:
--   1. administração emite recibo de saída paga: número 1, CPF limpo,
--      valor, forma e data copiados da saída;
--   2. a mesma saída não ganha segundo recibo; saída a pagar e "não houve"
--      não ganham recibo; documento inválido é recusado sem gastar número;
--   3. outra saída leva o número 2; a sequência do comprovante do cliente
--      não anda;
--   4. marcar assinado uma vez só;
--   5. anular e emitir de novo na mesma saída: número 3, nunca o 1 de volta;
--   6. recepção e profissional não emitem nem leem;
--   7. recibo não se edita nem se apaga, nem por cima da RLS.
-- ==========================================================

BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('a6000000-0000-4000-8000-000000000001', 'admin.prest@example.invalid'),
  ('a6000000-0000-4000-8000-000000000002', 'recepcao.prest@example.invalid'),
  ('a6000000-0000-4000-8000-000000000003', 'prof.prest@example.invalid')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.clinics (id, name) VALUES ('c6000000-0000-4000-8000-000000000001', 'Clínica Validação Prestador');

INSERT INTO public.profiles (id, email, full_name, role, clinic_id, is_active, must_change_password, disciplines)
VALUES
  ('a6000000-0000-4000-8000-000000000001', 'admin.prest@example.invalid', 'Admin Prestador', 'clinic_admin', 'c6000000-0000-4000-8000-000000000001', TRUE, FALSE, ARRAY['psicologia']),
  ('a6000000-0000-4000-8000-000000000002', 'recepcao.prest@example.invalid', 'Recepção Prestador', 'receptionist', 'c6000000-0000-4000-8000-000000000001', TRUE, FALSE, ARRAY[]::TEXT[]),
  ('a6000000-0000-4000-8000-000000000003', 'prof.prest@example.invalid', 'Profissional Prestador', 'therapist', 'c6000000-0000-4000-8000-000000000001', TRUE, FALSE, ARRAY['psicologia'])
ON CONFLICT (id) DO UPDATE SET
  role = EXCLUDED.role, clinic_id = EXCLUDED.clinic_id, is_active = TRUE,
  must_change_password = FALSE, disciplines = EXCLUDED.disciplines, mfa_required = FALSE;

INSERT INTO public.clinic_finance_settings (clinic_id, starts_on)
VALUES ('c6000000-0000-4000-8000-000000000001', public.finance_today() - 60);

INSERT INTO public.finance_expense_categories (id, clinic_id, name, system_key, sort_order) VALUES
  ('d6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', 'Manutenção', NULL, 70);

INSERT INTO public.finance_sequences (clinic_id, kind, last_value) VALUES ('c6000000-0000-4000-8000-000000000001', 'voucher', 7);

CREATE TEMP TABLE v_ids (name TEXT PRIMARY KEY, id UUID) ON COMMIT DROP;
GRANT ALL ON v_ids TO authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"a6000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', TRUE);

-- ---------- 1. emitir ----------
DO $$
DECLARE
  v_paid public.finance_expenses%ROWTYPE;
  v_row public.finance_provider_receipts%ROWTYPE;
BEGIN
  v_paid := public.finance_register_expense('d6000000-0000-4000-8000-000000000001', 'Conserto da torneira', 9000, public.finance_today() - 1, 'pix', NULL, NULL, NULL, NULL);
  INSERT INTO v_ids VALUES ('paga', v_paid.id);
  v_row := public.finance_issue_provider_receipt(v_paid.id, '  José Encanador ', '123.456.789-01', 'Conserto da torneira do banheiro', 'novembro de 2026', 'Catu/BA');
  IF v_row.number <> 1 OR v_row.provider_document <> '12345678901' OR v_row.provider_name <> 'José Encanador'
     OR v_row.amount_cents <> 9000 OR v_row.method <> 'pix' OR v_row.paid_on <> public.finance_today() - 1
     OR v_row.signed_at IS NOT NULL THEN
    RAISE EXCEPTION 'cenário 1: recibo gravado errado (%)', row_to_json(v_row);
  END IF;
  INSERT INTO v_ids VALUES ('recibo1', v_row.id);
END $$;

-- ---------- 2. recusas sem gastar número ----------
DO $$
DECLARE
  v_pending public.finance_expenses%ROWTYPE;
  v_other public.finance_expenses%ROWTYPE;
BEGIN
  BEGIN
    PERFORM public.finance_issue_provider_receipt((SELECT id FROM v_ids WHERE name = 'paga'), 'Outro', NULL, 'Serviço', NULL, NULL);
    RAISE EXCEPTION 'cenário 2: segundo recibo na mesma saída passou';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  v_pending := public.finance_register_expense('d6000000-0000-4000-8000-000000000001', 'Pintura', 50000, NULL, NULL, public.finance_today() + 3, NULL, NULL, NULL);
  BEGIN
    PERFORM public.finance_issue_provider_receipt(v_pending.id, 'Pintor', NULL, 'Pintura', NULL, NULL);
    RAISE EXCEPTION 'cenário 2: recibo de saída a pagar passou';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;

  v_other := public.finance_register_expense('d6000000-0000-4000-8000-000000000001', 'Diária da limpeza', 15000, public.finance_today(), 'dinheiro', NULL, NULL, NULL, NULL);
  INSERT INTO v_ids VALUES ('outra', v_other.id);
  BEGIN
    PERFORM public.finance_issue_provider_receipt(v_other.id, 'Maria', '1234', 'Limpeza', NULL, NULL);
    RAISE EXCEPTION 'cenário 2: documento inválido passou';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END $$;

-- ---------- 3. número 2, sequência do cliente parada ----------
DO $$
DECLARE
  v_row public.finance_provider_receipts%ROWTYPE;
BEGIN
  v_row := public.finance_issue_provider_receipt((SELECT id FROM v_ids WHERE name = 'outra'), 'Maria da Limpeza', NULL, 'Limpeza da clínica', NULL, NULL);
  IF v_row.number <> 2 THEN
    RAISE EXCEPTION 'cenário 3: segundo recibo ficou com % (recusa gastou número?)', v_row.number;
  END IF;
  IF (SELECT last_value FROM public.finance_sequences WHERE clinic_id = 'c6000000-0000-4000-8000-000000000001' AND kind = 'voucher') <> 7 THEN
    RAISE EXCEPTION 'cenário 3: a sequência do comprovante do cliente andou';
  END IF;
END $$;

-- ---------- 4. assinado uma vez ----------
DO $$
DECLARE
  v_row public.finance_provider_receipts%ROWTYPE;
BEGIN
  v_row := public.finance_sign_provider_receipt((SELECT id FROM v_ids WHERE name = 'recibo1'));
  IF v_row.signed_at IS NULL OR v_row.signed_by <> 'a6000000-0000-4000-8000-000000000001' THEN
    RAISE EXCEPTION 'cenário 4: não marcou assinado';
  END IF;
  BEGIN
    PERFORM public.finance_sign_provider_receipt((SELECT id FROM v_ids WHERE name = 'recibo1'));
    RAISE EXCEPTION 'cenário 4: marcou assinado duas vezes';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
END $$;

-- ---------- 5. anular e emitir de novo ----------
DO $$
DECLARE
  v_row public.finance_provider_receipts%ROWTYPE;
BEGIN
  v_row := public.finance_void_provider_receipt((SELECT id FROM v_ids WHERE name = 'recibo1'), 'nome escrito errado');
  IF v_row.voided_at IS NULL THEN
    RAISE EXCEPTION 'cenário 5: não anulou';
  END IF;
  v_row := public.finance_issue_provider_receipt((SELECT id FROM v_ids WHERE name = 'paga'), 'José Encanador Silva', '12345678901', 'Conserto da torneira do banheiro', NULL, 'Catu/BA');
  IF v_row.number <> 3 THEN
    RAISE EXCEPTION 'cenário 5: reemissão ficou com %', v_row.number;
  END IF;
END $$;

-- ---------- 6. outros perfis ----------
SELECT set_config('request.jwt.claims', '{"sub":"a6000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}', TRUE);
DO $$
BEGIN
  BEGIN
    PERFORM public.finance_issue_provider_receipt((SELECT id FROM v_ids WHERE name = 'outra'), 'X', NULL, 'Y', NULL, NULL);
    RAISE EXCEPTION 'cenário 6: recepção emitiu';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF (SELECT count(*) FROM public.finance_provider_receipts) <> 0 THEN
    RAISE EXCEPTION 'cenário 6: recepção leu recibos';
  END IF;
END $$;
SELECT set_config('request.jwt.claims', '{"sub":"a6000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}', TRUE);
DO $$
BEGIN
  BEGIN
    PERFORM public.finance_sign_provider_receipt((SELECT id FROM v_ids WHERE name = 'recibo1'));
    RAISE EXCEPTION 'cenário 6: profissional marcou assinado';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF (SELECT count(*) FROM public.finance_provider_receipts) <> 0 THEN
    RAISE EXCEPTION 'cenário 6: profissional leu recibos';
  END IF;
END $$;

-- ---------- 7. não se edita nem se apaga ----------
RESET ROLE;
DO $$
BEGIN
  BEGIN
    UPDATE public.finance_provider_receipts SET provider_name = 'Outro nome'
    WHERE clinic_id = 'c6000000-0000-4000-8000-000000000001' AND number = 2;
    RAISE EXCEPTION 'cenário 7: recibo editado';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM public.finance_provider_receipts WHERE clinic_id = 'c6000000-0000-4000-8000-000000000001' AND number = 2;
    RAISE EXCEPTION 'cenário 7: recibo apagado';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

SELECT 'recibo do prestador: 7 cenários passaram' AS resultado;

ROLLBACK;
