-- ==========================================================
-- Validação de 20261104_notas_fiscais.sql (BEGIN … ROLLBACK)
--
-- Chama as funções de verdade, como a tela faz. Nada fica gravado.
-- Rode depois de aplicar 20261103 e 20261104:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/validation/20261104_notas_fiscais_scenarios.sql
--
-- Cenários:
--   1. recebimento do particular gera a nota pendente: tomador com CPF,
--      competência = dia do atendimento, descrição com área e quem atendeu;
--      sem código da área, "falta código"; salvar o código completa;
--   2. paciente sem CPF: tomador é o responsável, e a descrição diz o paciente;
--   3. registrar: data antes da competência barra; número repetido barra;
--      nota emitida não muda;
--   4. recebimento anulado antes da nota: pendência cancelada sozinha;
--      depois da nota: "cancelar no emissor"; cancelar registra e guarda o número;
--   5. nota cancelada com o dinheiro valendo: volta a pendência;
--   6. depósito da operadora: nota para a operadora (CNPJ), competência do
--      atendimento, descrição com o lote;
--   7. comprovante: número em sequência, o mesmo na segunda impressão;
--   8. recepção não lê notas; nota não se apaga;
--   9. exclusão de paciente passa e a nota fica.
-- ==========================================================

BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('a2000000-0000-4000-8000-000000000001', 'admin.notas@example.invalid'),
  ('a2000000-0000-4000-8000-000000000002', 'recepcao.notas@example.invalid'),
  ('a2000000-0000-4000-8000-000000000003', 'psico.notas@example.invalid')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.clinics (id, name, legal_name, cnpj, cnes)
VALUES ('c2000000-0000-4000-8000-000000000001', 'Clínica Notas', 'Clínica Notas Ltda', '11222333000181', '1234567');

INSERT INTO public.profiles (id, email, full_name, role, clinic_id, is_active, must_change_password, disciplines)
VALUES
  ('a2000000-0000-4000-8000-000000000001', 'admin.notas@example.invalid', 'Admin Notas', 'clinic_admin', 'c2000000-0000-4000-8000-000000000001', TRUE, FALSE, ARRAY['psicologia']),
  ('a2000000-0000-4000-8000-000000000002', 'recepcao.notas@example.invalid', 'Recepção Notas', 'receptionist', 'c2000000-0000-4000-8000-000000000001', TRUE, FALSE, ARRAY[]::TEXT[]),
  ('a2000000-0000-4000-8000-000000000003', 'psico.notas@example.invalid', 'Joana Conceição', 'therapist', 'c2000000-0000-4000-8000-000000000001', TRUE, FALSE, ARRAY['psicologia'])
ON CONFLICT (id) DO UPDATE SET
  role = EXCLUDED.role, clinic_id = EXCLUDED.clinic_id, is_active = TRUE, full_name = EXCLUDED.full_name,
  must_change_password = FALSE, disciplines = EXCLUDED.disciplines, mfa_required = FALSE;

INSERT INTO public.patients (id, therapist_id, clinic_id, name, cpf, responsavel_nome, responsavel_cpf) VALUES
  ('b2000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000003', 'c2000000-0000-4000-8000-000000000001', 'Ana Paciente', '529.982.247-25', NULL, NULL),
  ('b2000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000003', 'c2000000-0000-4000-8000-000000000001', 'Bia Criança', NULL, 'Carla Mãe', '111.444.777-35'),
  ('b2000000-0000-4000-8000-000000000003', 'a2000000-0000-4000-8000-000000000003', 'c2000000-0000-4000-8000-000000000001', 'Davi Convênio', NULL, NULL, NULL);

INSERT INTO public.clinic_finance_settings (clinic_id, starts_on)
VALUES ('c2000000-0000-4000-8000-000000000001', public.finance_today() - 90);
INSERT INTO public.procedure_prices (clinic_id, discipline, appointment_type, professional_id, price_cents, active)
VALUES ('c2000000-0000-4000-8000-000000000001', 'psicologia', NULL, NULL, 20000, TRUE);
INSERT INTO public.professional_billing_info (professional_id, cpf, council_code, council_number, council_uf, cbo_code)
VALUES ('a2000000-0000-4000-8000-000000000003', '52998224725', '09', '06/12345', '35', '251510');

INSERT INTO public.clinic_convenios (id, clinic_id, name, ans_registry, cnpj, active)
VALUES ('e2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 'Operadora Notas', '123456', '99888777000166', TRUE);
INSERT INTO public.convenio_credentials (convenio_id, contractor_kind, provider_code)
VALUES ('e2000000-0000-4000-8000-000000000001', 'clinic', '4471');
INSERT INTO public.convenio_procedure_prices (convenio_id, discipline, appointment_type, price_cents, tuss_table, tuss_code, tuss_term)
VALUES ('e2000000-0000-4000-8000-000000000001', 'psicologia', NULL, 9200, '22', '50000470', 'Sessão de psicoterapia individual');
INSERT INTO public.patient_coverages (id, patient_id, convenio_id, card_number)
VALUES ('f2000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000003', 'e2000000-0000-4000-8000-000000000001', '0009998887776');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"a2000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', TRUE);

INSERT INTO public.appointments (id, patient_id, professional_id, discipline, appointment_type, starts_at, ends_at, status, kind, billing_type, convenio_id, coverage_id)
VALUES
  ('12000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000003', 'psicologia', 'session',
   ((public.finance_today() - 6) + time '09:00') AT TIME ZONE 'America/Sao_Paulo', ((public.finance_today() - 6) + time '09:50') AT TIME ZONE 'America/Sao_Paulo',
   'attended', 'appointment', 'particular', NULL, NULL),
  ('12000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000003', 'psicologia', 'evaluation',
   ((public.finance_today() - 5) + time '10:00') AT TIME ZONE 'America/Sao_Paulo', ((public.finance_today() - 5) + time '10:50') AT TIME ZONE 'America/Sao_Paulo',
   'attended', 'appointment', 'particular', NULL, NULL),
  ('12000000-0000-4000-8000-000000000003', 'b2000000-0000-4000-8000-000000000003', 'a2000000-0000-4000-8000-000000000003', 'psicologia', 'session',
   ((public.finance_today() - 8) + time '11:00') AT TIME ZONE 'America/Sao_Paulo', ((public.finance_today() - 8) + time '11:50') AT TIME ZONE 'America/Sao_Paulo',
   'attended', 'appointment', 'convenio', 'e2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001');

CREATE OR REPLACE FUNCTION pg_temp.charge_of(p_appt UUID) RETURNS UUID LANGUAGE sql AS $$
  SELECT id FROM public.appointment_charges WHERE appointment_id = p_appt AND voided_at IS NULL;
$$;
CREATE OR REPLACE FUNCTION pg_temp.doc_of_group(p_group UUID) RETURNS public.fiscal_documents LANGUAGE sql AS $$
  SELECT d.* FROM public.fiscal_documents d JOIN public.fiscal_document_sources s ON s.document_id = d.id
  WHERE s.receipt_group_id = p_group ORDER BY d.created_at DESC LIMIT 1;
$$;

-- 1. Recebimento do particular
DO $$
DECLARE
  g UUID;
  d public.fiscal_documents%ROWTYPE;
BEGIN
  g := public.finance_register_receipt('b2000000-0000-4000-8000-000000000001', public.finance_today(),
    jsonb_build_array(jsonb_build_object('charge_id', pg_temp.charge_of('12000000-0000-4000-8000-000000000001'), 'amount_cents', 15000, 'method', 'pix'),
                      jsonb_build_object('charge_id', pg_temp.charge_of('12000000-0000-4000-8000-000000000001'), 'amount_cents', 5000, 'method', 'dinheiro')));
  d := pg_temp.doc_of_group(g);
  ASSERT d.id IS NOT NULL AND d.status = 'pending', 'cenário 1: nota pendente não nasceu';
  ASSERT d.amount_cents = 20000, format('cenário 1: valor da nota errado (%s), as duas formas somam', d.amount_cents);
  ASSERT d.taker_kind = 'patient' AND d.taker_document = '52998224725' AND d.taker_name = 'Ana Paciente', 'cenário 1: tomador errado';
  ASSERT d.competence_on = public.finance_today() - 6, 'cenário 1: competência precisa ser o dia do atendimento';
  ASSERT d.description LIKE 'Sessão de Psicologia em %, Joana Conceição (CRP 06/12345)%', 'cenário 1: descrição: ' || d.description;
  ASSERT d.service_code IS NULL AND public.fiscal_missing(d) = ARRAY['codigo_servico'], 'cenário 1: falta o código';
  PERFORM public.finance_fiscal_save_settings('https://www.nfse.gov.br/EmissorNacional',
    '[{"discipline":"psicologia","service_code":"04.16","service_label":"Psicologia"}]'::JSONB);
  d := pg_temp.doc_of_group(g);
  ASSERT d.service_code = '04.16' AND cardinality(public.fiscal_missing(d)) = 0, 'cenário 1: salvar o código não completou a nota';
END $$;

-- 2. Paciente sem CPF: o responsável é o tomador
DO $$
DECLARE
  g UUID;
  d public.fiscal_documents%ROWTYPE;
BEGIN
  g := public.finance_register_receipt('b2000000-0000-4000-8000-000000000002', public.finance_today(),
    jsonb_build_array(jsonb_build_object('charge_id', pg_temp.charge_of('12000000-0000-4000-8000-000000000002'), 'amount_cents', 20000, 'method', 'pix')));
  d := pg_temp.doc_of_group(g);
  ASSERT d.taker_document = '11144477735' AND d.taker_name = 'Carla Mãe', 'cenário 2: tomador devia ser o responsável';
  ASSERT d.description LIKE 'Avaliação de Psicologia em %Paciente: Bia Criança', 'cenário 2: descrição: ' || d.description;
  ASSERT d.service_code = '04.16', 'cenário 2: nota nova já vem com o código da área';
END $$;

-- 3. Registrar a nota
DO $$
DECLARE
  d public.fiscal_documents%ROWTYPE;
  d2 public.fiscal_documents%ROWTYPE;
BEGIN
  SELECT * INTO d FROM public.fiscal_documents WHERE taker_name = 'Ana Paciente';
  SELECT * INTO d2 FROM public.fiscal_documents WHERE taker_name = 'Carla Mãe';
  BEGIN
    PERFORM public.finance_fiscal_register_issued(d.id, '151', d.competence_on - 1);
    RAISE EXCEPTION 'cenário 3: emissão antes da competência passou';
  EXCEPTION WHEN others THEN
    ASSERT SQLERRM LIKE '%nota_data%', 'cenário 3: erro inesperado: ' || SQLERRM;
  END;
  d := public.finance_fiscal_register_issued(d.id, '151', public.finance_today(), repeat('1', 50));
  ASSERT d.status = 'issued' AND d.nfse_number = '151' AND d.issued_via = 'manual', 'cenário 3: nota não ficou emitida';
  BEGIN
    PERFORM public.finance_fiscal_register_issued(d2.id, '151', public.finance_today());
    RAISE EXCEPTION 'cenário 3: número repetido passou';
  EXCEPTION WHEN others THEN
    ASSERT SQLERRM LIKE '%nota_repetida%', 'cenário 3: erro inesperado: ' || SQLERRM;
  END;
  BEGIN
    PERFORM public.finance_fiscal_save_document(d.id, '{"description":"Outra coisa"}'::JSONB);
    RAISE EXCEPTION 'cenário 3: nota emitida mudou';
  EXCEPTION WHEN others THEN
    ASSERT SQLERRM LIKE '%nota_emitida%', 'cenário 3: erro inesperado: ' || SQLERRM;
  END;
END $$;

-- 4. Recebimento anulado antes e depois da nota
DO $$
DECLARE
  g_ana UUID := (SELECT s.receipt_group_id FROM public.fiscal_document_sources s JOIN public.fiscal_documents d ON d.id = s.document_id WHERE d.taker_name = 'Ana Paciente');
  g_bia UUID := (SELECT s.receipt_group_id FROM public.fiscal_document_sources s JOIN public.fiscal_documents d ON d.id = s.document_id WHERE d.taker_name = 'Carla Mãe');
  d public.fiscal_documents%ROWTYPE;
BEGIN
  PERFORM public.finance_void_receipt(g_bia, 'Lançado no paciente errado');
  d := pg_temp.doc_of_group(g_bia);
  ASSERT d.status = 'cancelled' AND d.cancel_reason LIKE 'Recebimento anulado%', 'cenário 4: pendência não cancelou sozinha';

  PERFORM public.finance_void_receipt(g_ana, 'Paciente pagou em dobro');
  d := pg_temp.doc_of_group(g_ana);
  ASSERT d.status = 'issued' AND d.needs_cancellation, 'cenário 4: nota emitida devia pedir cancelamento no emissor';
  d := public.finance_fiscal_cancel(d.id, 'Cancelada no Emissor Nacional');
  ASSERT d.status = 'cancelled' AND d.nfse_number = '151' AND NOT d.needs_cancellation, 'cenário 4: cancelamento não guardou o número';
  ASSERT (SELECT count(*) FROM public.fiscal_documents WHERE taker_name = 'Ana Paciente' AND status = 'pending') = 0,
    'cenário 4: dinheiro anulado não volta a pendência';
END $$;

-- 5. Nota cancelada com o dinheiro valendo volta a pendência
DO $$
DECLARE
  g UUID;
  d public.fiscal_documents%ROWTYPE;
BEGIN
  -- Atendimento de novo valendo (recebimento novo na mesma cobrança).
  g := public.finance_register_receipt('b2000000-0000-4000-8000-000000000001', public.finance_today(),
    jsonb_build_array(jsonb_build_object('charge_id', pg_temp.charge_of('12000000-0000-4000-8000-000000000001'), 'amount_cents', 20000, 'method', 'pix')));
  d := pg_temp.doc_of_group(g);
  d := public.finance_fiscal_register_issued(d.id, '152', public.finance_today());
  d := public.finance_fiscal_cancel(d.id, 'CPF digitado errado');
  ASSERT (SELECT count(*) FROM public.fiscal_documents dd JOIN public.fiscal_document_sources s ON s.document_id = dd.id
          WHERE s.receipt_group_id = g AND dd.status = 'pending' AND s.released_at IS NULL) = 1,
    'cenário 5: nota cancelada com o dinheiro valendo precisa voltar para emitir';
END $$;

-- 6. Depósito da operadora
DO $$
DECLARE
  guide UUID := (SELECT g.id FROM public.tiss_guides g JOIN public.tiss_guide_items i ON i.guide_id = g.id
                 WHERE i.charge_id = pg_temp.charge_of('12000000-0000-4000-8000-000000000003'));
  b public.tiss_batches%ROWTYPE;
  d public.fiscal_documents%ROWTYPE;
BEGIN
  b := public.finance_tiss_create_batch('e2000000-0000-4000-8000-000000000001', ARRAY[guide]);
  PERFORM public.finance_tiss_mark_sent(b.id, public.finance_today());
  PERFORM public.finance_tiss_register_payment('e2000000-0000-4000-8000-000000000001', public.finance_today(), 9200, 'ted',
    jsonb_build_array(jsonb_build_object('guide_id', guide, 'paid_cents', 9200)));
  SELECT * INTO d FROM public.fiscal_documents WHERE taker_kind = 'convenio';
  ASSERT d.id IS NOT NULL AND d.taker_document = '99888777000166' AND d.taker_name = 'Operadora Notas', 'cenário 6: nota da operadora';
  ASSERT d.amount_cents = 9200 AND d.competence_on = public.finance_today() - 8, format('cenário 6: valor/competência (%s, %s)', d.amount_cents, d.competence_on);
  ASSERT d.description LIKE 'Serviços de saúde prestados a beneficiários de Operadora Notas, 1 guia do lote 1, pagos em %',
    'cenário 6: descrição: ' || d.description;
  ASSERT d.service_code = '04.16', 'cenário 6: código da área';
END $$;

-- 7. Comprovante numerado
DO $$
DECLARE
  g1 UUID := (SELECT group_id FROM public.finance_receipts WHERE voided_at IS NULL AND patient_id = 'b2000000-0000-4000-8000-000000000001' LIMIT 1);
  n1 INTEGER;
  n2 INTEGER;
  g2 UUID;
BEGIN
  n1 := public.finance_receipt_voucher(g1);
  ASSERT n1 = 1 AND public.finance_receipt_voucher(g1) = 1, 'cenário 7: segunda impressão mudou o número';
  g2 := public.finance_register_receipt('b2000000-0000-4000-8000-000000000002', public.finance_today(),
    jsonb_build_array(jsonb_build_object('charge_id', pg_temp.charge_of('12000000-0000-4000-8000-000000000002'), 'amount_cents', 1000, 'method', 'pix')));
  n2 := public.finance_receipt_voucher(g2);
  ASSERT n2 = 2, 'cenário 7: número do comprovante fora de sequência';
END $$;

-- 8. Recepção e apagar
SELECT set_config('request.jwt.claims', '{"sub":"a2000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}', TRUE);
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM public.fiscal_documents) = 0, 'cenário 8: recepção leu notas';
  BEGIN
    PERFORM public.finance_fiscal_save_settings(NULL, '[]'::JSONB);
    RAISE EXCEPTION 'cenário 8: recepção mexeu na configuração';
  EXCEPTION WHEN others THEN
    ASSERT SQLERRM LIKE '%administração%', 'cenário 8: erro inesperado: ' || SQLERRM;
  END;
END $$;
RESET ROLE;
DO $$
BEGIN
  BEGIN
    DELETE FROM public.fiscal_documents WHERE taker_kind = 'convenio';
    RAISE EXCEPTION 'cenário 8: nota apagou';
  EXCEPTION WHEN others THEN
    ASSERT SQLERRM LIKE '%nota_nao_se_apaga%', 'cenário 8: erro inesperado: ' || SQLERRM;
  END;
END $$;

-- 9. Exclusão de paciente com nota
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"a2000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}', TRUE);
SELECT public.request_patient_deletion('b2000000-0000-4000-8000-000000000001', 'Pedido de exclusão só para a validação.');
SELECT set_config('request.jwt.claims', '{"sub":"a2000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', TRUE);
SELECT public.admin_decide_patient_deletion(
  (SELECT id FROM public.patient_deletion_requests WHERE patient_id = 'b2000000-0000-4000-8000-000000000001' AND status = 'pending'),
  'approved', 'Aprovado na validação.'
);
RESET ROLE;
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM public.fiscal_documents WHERE patient_id = 'b2000000-0000-4000-8000-000000000001') >= 2,
    'cenário 9: as notas do paciente excluído precisam ficar (documento fiscal)';
END $$;

SELECT 'notas fiscais: todos os cenários passaram' AS resultado;

ROLLBACK;
