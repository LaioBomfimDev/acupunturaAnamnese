-- ==========================================================
-- Validação de 20261103_convenios_fase2.sql (BEGIN … ROLLBACK)
--
-- Chama as funções de verdade, com request.jwt.claims e o papel
-- authenticated, como a tela faz. Nada fica gravado. Rode depois de
-- aplicar as migrations 20261103 e 20261103b:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/validation/20261103_convenios_fase2_scenarios.sql
--
-- A última linha antes do ROLLBACK devolve o XML do lote 1: salve e
-- confira contra o XSD oficial (supabase/tiss/4.03.00/tissV4_03_00.xsd).
--
-- Cenários:
--   1. atendimento de convênio Atendido gera guia (número 1, 2…); particular não;
--   2. o que falta na guia (carteira, CPF/conselho/CBO de quem atende);
--   3. falta e volta a Atendido: a mesma guia, com o mesmo número;
--   4. erro corrigido: mudar dia/profissional/área de Atendido refaz a cobrança;
--      com pagamento, profissional muda e área barra;
--   5. lote: guia incompleta barrada; contratado misturado barrado; lote 1
--      com XML, hash conferido de novo, guias "no lote";
--   6. guia em lote não muda: Agenda, ajuste de valor e campos da guia barram;
--   7. pagamento: lote não enviado barra; depósito diferente da soma barra;
--      glosa sem código barra; pago + glosa → situações certas;
--   8. recurso: abre, ganha, paga o resto → paga;
--   9. anular lançamento volta a situação;
--  10. reenviar guia: com pagamento barra; só com glosa volta a "em aberto"
--      e entra no lote 2; descartar lote gerado devolve as guias;
--  11. recebimento de convênio pelo paciente barrado;
--  12. recepção não lê guias nem chama a função;
--  13. exclusão de paciente com guia em lote e pagamento passa, e a guia fica.
-- ==========================================================

BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('a1000000-0000-4000-8000-000000000001', 'admin.fase2@example.invalid'),
  ('a1000000-0000-4000-8000-000000000002', 'recepcao.fase2@example.invalid'),
  ('a1000000-0000-4000-8000-000000000003', 'psico.fase2@example.invalid'),
  ('a1000000-0000-4000-8000-000000000004', 'fisio.fase2@example.invalid')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.clinics (id, name, legal_name, cnpj, cnes)
VALUES ('c1000000-0000-4000-8000-000000000001', 'Clínica Fase Dois', 'Clínica Fase Dois & Cia Ltda', '11222333000181', '1234567');

INSERT INTO public.profiles (id, email, full_name, role, clinic_id, is_active, must_change_password, disciplines)
VALUES
  ('a1000000-0000-4000-8000-000000000001', 'admin.fase2@example.invalid', 'Admin Fase Dois', 'clinic_admin', 'c1000000-0000-4000-8000-000000000001', TRUE, FALSE, ARRAY['psicologia']),
  ('a1000000-0000-4000-8000-000000000002', 'recepcao.fase2@example.invalid', 'Recepção Fase Dois', 'receptionist', 'c1000000-0000-4000-8000-000000000001', TRUE, FALSE, ARRAY[]::TEXT[]),
  ('a1000000-0000-4000-8000-000000000003', 'psico.fase2@example.invalid', 'Joana Conceição Psicóloga', 'therapist', 'c1000000-0000-4000-8000-000000000001', TRUE, FALSE, ARRAY['psicologia']),
  ('a1000000-0000-4000-8000-000000000004', 'fisio.fase2@example.invalid', 'Fábio Fisioterapeuta', 'therapist', 'c1000000-0000-4000-8000-000000000001', TRUE, FALSE, ARRAY['fisioterapia', 'psicologia'])
ON CONFLICT (id) DO UPDATE SET
  role = EXCLUDED.role, clinic_id = EXCLUDED.clinic_id, is_active = TRUE, full_name = EXCLUDED.full_name,
  must_change_password = FALSE, disciplines = EXCLUDED.disciplines, mfa_required = FALSE;

INSERT INTO public.patients (id, therapist_id, clinic_id, name) VALUES
  ('b1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000003', 'c1000000-0000-4000-8000-000000000001', 'Ana Paciente'),
  ('b1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000003', 'c1000000-0000-4000-8000-000000000001', 'Bruno Paciente'),
  ('b1000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000003', 'c1000000-0000-4000-8000-000000000001', 'Carla Particular');

INSERT INTO public.clinic_finance_settings (clinic_id, starts_on)
VALUES ('c1000000-0000-4000-8000-000000000001', public.finance_today() - 90);
INSERT INTO public.procedure_prices (clinic_id, discipline, appointment_type, professional_id, price_cents, active)
VALUES ('c1000000-0000-4000-8000-000000000001', 'psicologia', NULL, NULL, 20000, TRUE),
       ('c1000000-0000-4000-8000-000000000001', 'fisioterapia', NULL, NULL, 12000, TRUE);
INSERT INTO public.finance_payout_rules (clinic_id, professional_id, discipline, appointment_type, mode, percent)
VALUES ('c1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000003', NULL, NULL, 'percent', 50),
       ('c1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000004', NULL, NULL, 'percent', 40);

INSERT INTO public.clinic_convenios (id, clinic_id, name, ans_registry, cnpj, active, payment_term_days)
VALUES ('e1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'Operadora Fase Dois', '123456', '99888777000166', TRUE, 30);
INSERT INTO public.convenio_credentials (convenio_id, contractor_kind, provider_code)
VALUES ('e1000000-0000-4000-8000-000000000001', 'clinic', '4471');
INSERT INTO public.convenio_procedure_prices (convenio_id, discipline, appointment_type, price_cents, tuss_table, tuss_code, tuss_term)
VALUES ('e1000000-0000-4000-8000-000000000001', 'psicologia', NULL, 9200, '22', '50000470', 'Sessão de psicoterapia individual'),
       ('e1000000-0000-4000-8000-000000000001', 'fisioterapia', NULL, 8000, '22', '50000144', 'Sessão de fisioterapia');
INSERT INTO public.professional_billing_info (professional_id, cpf, council_code, council_number, council_uf, cbo_code)
VALUES ('a1000000-0000-4000-8000-000000000003', '52998224725', '09', '06/12345', '35', '251510');
INSERT INTO public.tiss_requesters (id, clinic_id, name, council_code, council_number, council_uf, cbo_code)
VALUES ('d1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'Dra. Renata Lima', '06', '123456', '35', '225125');
INSERT INTO public.patient_coverages (id, patient_id, convenio_id, card_number, card_valid_until)
VALUES ('f1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', '0001234500018', public.finance_today() + 365);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}', TRUE);

-- Atendimentos: 1 e 2 de convênio da Ana (com carteira), 3 do Bruno (sem
-- carteira), 4 particular da Carla, 5 de convênio do Fábio (sem dados de
-- faturamento).
INSERT INTO public.appointments (id, patient_id, professional_id, discipline, appointment_type, starts_at, ends_at, status, kind, billing_type, convenio_id, coverage_id, modality)
VALUES
  ('11000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000003', 'psicologia', 'session',
   ((public.finance_today() - 10) + time '14:00') AT TIME ZONE 'America/Sao_Paulo', ((public.finance_today() - 10) + time '14:50') AT TIME ZONE 'America/Sao_Paulo',
   'scheduled', 'appointment', 'convenio', 'e1000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'presencial'),
  ('11000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000003', 'psicologia', 'session',
   ((public.finance_today() - 3) + time '14:00') AT TIME ZONE 'America/Sao_Paulo', ((public.finance_today() - 3) + time '14:50') AT TIME ZONE 'America/Sao_Paulo',
   'scheduled', 'appointment', 'convenio', 'e1000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'online'),
  ('11000000-0000-4000-8000-000000000003', 'b1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000003', 'psicologia', 'session',
   ((public.finance_today() - 3) + time '16:00') AT TIME ZONE 'America/Sao_Paulo', ((public.finance_today() - 3) + time '16:50') AT TIME ZONE 'America/Sao_Paulo',
   'scheduled', 'appointment', 'convenio', 'e1000000-0000-4000-8000-000000000001', NULL, NULL),
  ('11000000-0000-4000-8000-000000000004', 'b1000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000003', 'psicologia', 'session',
   ((public.finance_today() - 5) + time '09:00') AT TIME ZONE 'America/Sao_Paulo', ((public.finance_today() - 5) + time '09:50') AT TIME ZONE 'America/Sao_Paulo',
   'scheduled', 'appointment', 'particular', NULL, NULL, NULL),
  ('11000000-0000-4000-8000-000000000005', 'b1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000004', 'fisioterapia', 'session',
   ((public.finance_today() - 4) + time '10:00') AT TIME ZONE 'America/Sao_Paulo', ((public.finance_today() - 4) + time '10:50') AT TIME ZONE 'America/Sao_Paulo',
   'scheduled', 'appointment', 'convenio', 'e1000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', NULL);

UPDATE public.appointments SET status = 'attended'
WHERE id IN ('11000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000002',
             '11000000-0000-4000-8000-000000000003', '11000000-0000-4000-8000-000000000004',
             '11000000-0000-4000-8000-000000000005');

RESET ROLE;

-- Ajudante só da validação: a guia de um atendimento.
CREATE OR REPLACE FUNCTION pg_temp.guide_of(p_appt UUID) RETURNS public.tiss_guides
LANGUAGE sql AS $$
  SELECT g.* FROM public.tiss_guides g
  JOIN public.tiss_guide_items i ON i.guide_id = g.id
  JOIN public.appointment_charges c ON c.id = i.charge_id
  WHERE c.appointment_id = p_appt;
$$;

-- 1. Guias nascem com a cobrança de convênio
DO $$
DECLARE
  g1 public.tiss_guides%ROWTYPE := pg_temp.guide_of('11000000-0000-4000-8000-000000000001');
  g2 public.tiss_guides%ROWTYPE := pg_temp.guide_of('11000000-0000-4000-8000-000000000002');
BEGIN
  ASSERT g1.id IS NOT NULL AND g1.status = 'open', 'cenário 1: guia não nasceu';
  ASSERT g1.number = '1' AND g2.number = '2', format('cenário 1: numeração errada (%s, %s)', g1.number, g2.number);
  ASSERT (pg_temp.guide_of('11000000-0000-4000-8000-000000000004')).id IS NULL, 'cenário 1: particular ganhou guia';
END $$;

-- 2. O que falta
DO $$
DECLARE
  s JSONB;
BEGIN
  s := public.tiss_guide_snapshot((pg_temp.guide_of('11000000-0000-4000-8000-000000000001')).id);
  ASSERT jsonb_array_length(s->'missing') = 0, 'cenário 2: guia completa com pendência: ' || (s->'missing')::TEXT;
  ASSERT s->>'regime_code' = '01', 'cenário 2: presencial precisa de regime 01 (ambulatorial)';
  ASSERT s->>'contractor_name' = 'Clinica Fase Dois Cia Ltda', 'cenário 2: nome em ASCII errado: ' || (s->>'contractor_name');
  ASSERT s->>'executor_name' = 'Joana Conceicao Psicologa', 'cenário 2: nome de quem atende sem acento errado';
  s := public.tiss_guide_snapshot((pg_temp.guide_of('11000000-0000-4000-8000-000000000002')).id);
  ASSERT s->>'regime_code' = '05', 'cenário 2: consulta online precisa de regime 05 (telessaúde)';
  s := public.tiss_guide_snapshot((pg_temp.guide_of('11000000-0000-4000-8000-000000000003')).id);
  ASSERT s->'missing' ? 'carteira', 'cenário 2: sem carteira não apontou';
  s := public.tiss_guide_snapshot((pg_temp.guide_of('11000000-0000-4000-8000-000000000005')).id);
  ASSERT s->'missing' ? 'cpf_executante' AND s->'missing' ? 'conselho_executante' AND s->'missing' ? 'cbo_executante',
    'cenário 2: dados de quem atende não apontados: ' || (s->'missing')::TEXT;
  ASSERT s->'warnings' ? 'indicacao_clinica', 'cenário 2: indicação clínica não avisou';
END $$;

-- 3. Falta e volta: a mesma guia
SET LOCAL ROLE authenticated;
UPDATE public.appointments SET status = 'no_show' WHERE id = '11000000-0000-4000-8000-000000000002';
RESET ROLE;
DO $$
BEGIN
  ASSERT (pg_temp.guide_of('11000000-0000-4000-8000-000000000002')).status = 'cancelled', 'cenário 3: falta não cancelou a guia';
END $$;
SET LOCAL ROLE authenticated;
UPDATE public.appointments SET status = 'attended' WHERE id = '11000000-0000-4000-8000-000000000002';
RESET ROLE;
DO $$
DECLARE
  g public.tiss_guides%ROWTYPE := pg_temp.guide_of('11000000-0000-4000-8000-000000000002');
BEGIN
  ASSERT g.status = 'open' AND g.number = '2', format('cenário 3: não reabriu a mesma guia (%s, %s)', g.status, g.number);
  ASSERT (SELECT count(*) FROM public.tiss_guides WHERE convenio_id = 'e1000000-0000-4000-8000-000000000001') = 4,
    'cenário 3: nasceu guia a mais';
END $$;

-- 4. Erro corrigido: Atendido que muda de dia, profissional, área
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', TRUE);
UPDATE public.appointments
SET starts_at = starts_at - interval '1 day', ends_at = ends_at - interval '1 day',
    professional_id = 'a1000000-0000-4000-8000-000000000004', discipline = 'fisioterapia'
WHERE id = '11000000-0000-4000-8000-000000000004';
RESET ROLE;
DO $$
DECLARE
  c public.appointment_charges%ROWTYPE;
BEGIN
  SELECT * INTO c FROM public.appointment_charges WHERE appointment_id = '11000000-0000-4000-8000-000000000004' AND voided_at IS NULL;
  ASSERT c.service_on = public.finance_today() - 6, 'cenário 4: dia da cobrança não acompanhou';
  ASSERT c.professional_id = 'a1000000-0000-4000-8000-000000000004', 'cenário 4: profissional da cobrança não acompanhou';
  ASSERT c.discipline = 'fisioterapia' AND c.price_cents = 12000 AND c.payout_cents = 4800,
    format('cenário 4: área/valor/repasse não acompanharam (%s, %s, %s)', c.discipline, c.price_cents, c.payout_cents);
END $$;

SET LOCAL ROLE authenticated;
SELECT public.finance_register_receipt('b1000000-0000-4000-8000-000000000003', public.finance_today(),
  jsonb_build_array(jsonb_build_object('charge_id',
    (SELECT id FROM public.appointment_charges WHERE appointment_id = '11000000-0000-4000-8000-000000000004' AND voided_at IS NULL),
    'amount_cents', 12000, 'method', 'pix')));
UPDATE public.appointments SET professional_id = 'a1000000-0000-4000-8000-000000000003'
WHERE id = '11000000-0000-4000-8000-000000000004';
DO $$
BEGIN
  BEGIN
    UPDATE public.appointments SET discipline = 'psicologia' WHERE id = '11000000-0000-4000-8000-000000000004';
    RAISE EXCEPTION 'cenário 4: mudar a área com pagamento passou';
  EXCEPTION WHEN others THEN
    ASSERT SQLERRM LIKE '%appointment_has_payment%', 'cenário 4: erro inesperado: ' || SQLERRM;
  END;
END $$;
RESET ROLE;
DO $$
DECLARE
  c public.appointment_charges%ROWTYPE;
BEGIN
  SELECT * INTO c FROM public.appointment_charges WHERE appointment_id = '11000000-0000-4000-8000-000000000004' AND voided_at IS NULL;
  ASSERT c.professional_id = 'a1000000-0000-4000-8000-000000000003' AND c.price_cents = 12000 AND c.payout_cents = 6000,
    format('cenário 4: com pagamento, profissional e repasse precisam acompanhar (%s, %s)', c.professional_id, c.payout_cents);
END $$;

-- 5. Lote
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.finance_tiss_create_batch('e1000000-0000-4000-8000-000000000001',
      ARRAY[(pg_temp.guide_of('11000000-0000-4000-8000-000000000001')).id, (pg_temp.guide_of('11000000-0000-4000-8000-000000000003')).id]);
    RAISE EXCEPTION 'cenário 5: guia sem carteira entrou no lote';
  EXCEPTION WHEN others THEN
    ASSERT SQLERRM LIKE '%guia_incompleta%carteira%', 'cenário 5: erro inesperado: ' || SQLERRM;
  END;
END $$;

-- Fábio ganha credenciamento próprio e dados: a guia dele vira de outro contratado.
RESET ROLE;
INSERT INTO public.convenio_credentials (convenio_id, contractor_kind, professional_id, provider_code)
VALUES ('e1000000-0000-4000-8000-000000000001', 'professional', 'a1000000-0000-4000-8000-000000000004', 'PF-778');
INSERT INTO public.professional_billing_info (professional_id, cpf, council_code, council_number, council_uf, cbo_code)
VALUES ('a1000000-0000-4000-8000-000000000004', '11144477735', '05', '123456-F', '35', '223605');
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.finance_tiss_create_batch('e1000000-0000-4000-8000-000000000001',
      ARRAY[(pg_temp.guide_of('11000000-0000-4000-8000-000000000001')).id, (pg_temp.guide_of('11000000-0000-4000-8000-000000000005')).id]);
    RAISE EXCEPTION 'cenário 5: contratados diferentes no mesmo lote';
  EXCEPTION WHEN others THEN
    ASSERT SQLERRM LIKE '%contratado_misturado%', 'cenário 5: erro inesperado: ' || SQLERRM;
  END;
END $$;

SELECT public.finance_tiss_save_guide((pg_temp.guide_of('11000000-0000-4000-8000-000000000001')).id,
  jsonb_build_object('requester_id', 'd1000000-0000-4000-8000-000000000001', 'requested_on', (public.finance_today() - 20)::TEXT,
                     'clinical_indication', 'Ansiedade: psicoterapia semanal', 'password', 'ABC123',
                     'authorized_on', (public.finance_today() - 15)::TEXT));

DO $$
DECLARE
  b public.tiss_batches%ROWTYPE;
BEGIN
  b := public.finance_tiss_create_batch('e1000000-0000-4000-8000-000000000001',
    ARRAY[(pg_temp.guide_of('11000000-0000-4000-8000-000000000002')).id, (pg_temp.guide_of('11000000-0000-4000-8000-000000000001')).id]);
  ASSERT b.number = '1' AND b.guide_count = 2 AND b.total_cents = 18400, format('cenário 5: lote errado (%s, %s, %s)', b.number, b.guide_count, b.total_cents);
  ASSERT b.origin_kind = 'code' AND b.origin_value = '4471', 'cenário 5: origem errada';
  ASSERT b.period_from = public.finance_today() - 10 AND b.period_until = public.finance_today() - 3, 'cenário 5: período errado';
  ASSERT b.xml_hash = public.tiss_hash(b.xml), 'cenário 5: hash não confere com o XML';
  ASSERT b.xml LIKE '%<ans:hash>' || b.xml_hash || '</ans:hash>%', 'cenário 5: hash fora do epílogo';
  ASSERT b.xml LIKE '%<ans:numeroGuiaPrestador>1</ans:numeroGuiaPrestador>%<ans:numeroGuiaPrestador>2</ans:numeroGuiaPrestador>%',
    'cenário 5: guias fora de ordem';
  ASSERT b.xml LIKE '%<ans:codigoPrestadorNaOperadora>99999999999999</ans:codigoPrestadorNaOperadora>%', 'cenário 5: solicitante externo sem 14 noves';
  ASSERT b.xml LIKE '%<ans:senha>ABC123</ans:senha>%', 'cenário 5: senha opcional não foi';
  ASSERT b.xml LIKE '%<ans:horaInicial>14:00:00</ans:horaInicial><ans:horaFinal>14:50:00</ans:horaFinal>%',
    'cenário 5: hora do atendimento fora do fuso da clínica';
  ASSERT b.xml !~ '[^ -~]', 'cenário 5: XML com caractere fora do ASCII';
  ASSERT (pg_temp.guide_of('11000000-0000-4000-8000-000000000001')).status = 'batched', 'cenário 5: guia não ficou no lote';
END $$;

-- 6. Guia em lote não muda
DO $$
BEGIN
  BEGIN
    UPDATE public.appointments SET status = 'no_show' WHERE id = '11000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'cenário 6: falta de atendimento em lote passou';
  EXCEPTION WHEN others THEN
    ASSERT SQLERRM LIKE '%guia_no_lote%', 'cenário 6: erro inesperado (Agenda): ' || SQLERRM;
  END;
  BEGIN
    UPDATE public.appointments SET starts_at = starts_at - interval '1 day', ends_at = ends_at - interval '1 day'
    WHERE id = '11000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'cenário 6: mudar o dia de atendimento em lote passou';
  EXCEPTION WHEN others THEN
    ASSERT SQLERRM LIKE '%guia_no_lote%', 'cenário 6: erro inesperado (dia): ' || SQLERRM;
  END;
  BEGIN
    PERFORM public.finance_adjust_charge(
      (SELECT id FROM public.appointment_charges WHERE appointment_id = '11000000-0000-4000-8000-000000000001'), 5000, 'Teste de ajuste');
    RAISE EXCEPTION 'cenário 6: ajuste de valor em lote passou';
  EXCEPTION WHEN others THEN
    ASSERT SQLERRM LIKE '%guia_no_lote%', 'cenário 6: erro inesperado (ajuste): ' || SQLERRM;
  END;
  BEGIN
    PERFORM public.finance_tiss_save_guide((pg_temp.guide_of('11000000-0000-4000-8000-000000000001')).id, '{"password":"X"}'::JSONB);
    RAISE EXCEPTION 'cenário 6: editar guia em lote passou';
  EXCEPTION WHEN others THEN
    ASSERT SQLERRM LIKE '%guia_no_lote%', 'cenário 6: erro inesperado (guia): ' || SQLERRM;
  END;
  BEGIN
    DELETE FROM public.appointments WHERE id = '11000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'cenário 6: excluir atendimento em lote passou';
  EXCEPTION WHEN others THEN
    ASSERT SQLERRM LIKE '%guia_no_lote%', 'cenário 6: erro inesperado (excluir): ' || SQLERRM;
  END;
END $$;

-- 7. Pagamento e glosa
DO $$
DECLARE
  g1 UUID := (pg_temp.guide_of('11000000-0000-4000-8000-000000000001')).id;
  g2 UUID := (pg_temp.guide_of('11000000-0000-4000-8000-000000000002')).id;
  v_batch UUID := (SELECT id FROM public.tiss_batches WHERE convenio_id = 'e1000000-0000-4000-8000-000000000001' AND number = '1');
BEGIN
  BEGIN
    PERFORM public.finance_tiss_register_payment('e1000000-0000-4000-8000-000000000001', public.finance_today(), 9200, 'ted',
      jsonb_build_array(jsonb_build_object('guide_id', g1, 'paid_cents', 9200)));
    RAISE EXCEPTION 'cenário 7: pagamento de lote não enviado passou';
  EXCEPTION WHEN others THEN
    ASSERT SQLERRM LIKE '%lote_nao_enviado%', 'cenário 7: erro inesperado: ' || SQLERRM;
  END;
  PERFORM public.finance_tiss_mark_sent(v_batch, public.finance_today(), 'PROT-1');
  BEGIN
    PERFORM public.finance_tiss_register_payment('e1000000-0000-4000-8000-000000000001', public.finance_today(), 10000, 'ted',
      jsonb_build_array(jsonb_build_object('guide_id', g1, 'paid_cents', 9200)));
    RAISE EXCEPTION 'cenário 7: depósito diferente passou';
  EXCEPTION WHEN others THEN
    ASSERT SQLERRM LIKE '%deposito_diferente%', 'cenário 7: erro inesperado: ' || SQLERRM;
  END;
  BEGIN
    PERFORM public.finance_tiss_register_payment('e1000000-0000-4000-8000-000000000001', public.finance_today(), 0, 'ted',
      jsonb_build_array(jsonb_build_object('guide_id', g2, 'glosa_cents', 9200)));
    RAISE EXCEPTION 'cenário 7: glosa sem código passou';
  EXCEPTION WHEN others THEN
    ASSERT SQLERRM LIKE '%glosa_sem_motivo%', 'cenário 7: erro inesperado: ' || SQLERRM;
  END;
  BEGIN
    PERFORM public.finance_tiss_register_payment('e1000000-0000-4000-8000-000000000001', public.finance_today(), 9300, 'ted',
      jsonb_build_array(jsonb_build_object('guide_id', g1, 'paid_cents', 9300)));
    RAISE EXCEPTION 'cenário 7: pago a mais passou';
  EXCEPTION WHEN others THEN
    ASSERT SQLERRM LIKE '%pago_demais%', 'cenário 7: erro inesperado: ' || SQLERRM;
  END;

  -- Depósito de R$ 92 + 50: guia 1 paga inteira; guia 2 paga R$ 50 e glosada R$ 42.
  PERFORM public.finance_tiss_register_payment('e1000000-0000-4000-8000-000000000001', public.finance_today(), 14200, 'ted',
    jsonb_build_array(jsonb_build_object('guide_id', g1, 'paid_cents', 9200),
                      jsonb_build_object('guide_id', g2, 'paid_cents', 5000, 'glosa_cents', 4200, 'glosa_code', '1702',
                                         'glosa_note', 'Cobrança acima da tabela')),
    'Depósito de outubro');
  ASSERT (SELECT status FROM public.tiss_guides WHERE id = g1) = 'paid', 'cenário 7: guia 1 devia ficar paga';
  ASSERT (SELECT status FROM public.tiss_guides WHERE id = g2) = 'glosa', 'cenário 7: guia 2 devia ficar glosada';
  ASSERT (SELECT pago_centavos FROM public.finance_tiss_charge_status() WHERE guia = g2) = 5000
     AND (SELECT glosa_centavos FROM public.finance_tiss_charge_status() WHERE guia = g2) = 4200,
    'cenário 7: situação da cobrança errada';
  ASSERT (SELECT sum(valor_centavos) FROM public.finance_tiss_paid_rows()) = 14200
     AND (SELECT prazo_dias FROM public.finance_tiss_charge_status() WHERE guia = g1) = 30,
    'cenário 7: dinheiro da operadora por cobrança (ou prazo) errado';
END $$;

-- 8. Recurso
DO $$
DECLARE
  g2 UUID := (pg_temp.guide_of('11000000-0000-4000-8000-000000000002')).id;
BEGIN
  PERFORM public.finance_tiss_open_appeal(g2, 'Valor está na tabela acordada (anexo).');
  ASSERT (SELECT status FROM public.tiss_guides WHERE id = g2) = 'appeal', 'cenário 8: recurso não marcou a guia';
  PERFORM public.finance_tiss_close_appeal(g2, 'won', 'Operadora aceitou');
  ASSERT (SELECT status FROM public.tiss_guides WHERE id = g2) = 'glosa', 'cenário 8: recurso ganho sem dinheiro ainda é glosa';
  PERFORM public.finance_tiss_register_payment('e1000000-0000-4000-8000-000000000001', public.finance_today(), 4200, 'pix',
    jsonb_build_array(jsonb_build_object('guide_id', g2, 'paid_cents', 4200)));
  ASSERT (SELECT status FROM public.tiss_guides WHERE id = g2) = 'paid', 'cenário 8: recurso pago devia deixar a guia paga';
END $$;

-- 9. Anular o último lançamento volta a glosa
DO $$
DECLARE
  g2 UUID := (pg_temp.guide_of('11000000-0000-4000-8000-000000000002')).id;
  v_group UUID;
BEGIN
  SELECT group_id INTO v_group FROM public.tiss_guide_settlements WHERE guide_id = g2 AND voided_at IS NULL ORDER BY created_at DESC, paid_cents LIMIT 1;
  PERFORM public.finance_tiss_void_settlement(v_group, 'Lançado em dobro');
  ASSERT (SELECT status FROM public.tiss_guides WHERE id = g2) = 'glosa', 'cenário 9: anular não voltou a glosa';
  ASSERT (SELECT voided_at IS NOT NULL FROM public.convenio_payments WHERE amount_cents = 4200), 'cenário 9: depósito não foi anulado';
  BEGIN
    DELETE FROM public.convenio_payments WHERE amount_cents = 4200;
    RAISE EXCEPTION 'cenário 9: apagar depósito passou';
  EXCEPTION WHEN others THEN
    ASSERT SQLERRM LIKE '%não se apaga%' OR SQLERRM LIKE '%permission denied%', 'cenário 9: erro inesperado: ' || SQLERRM;
  END;
END $$;

-- 10. Reenviar e descartar
DO $$
DECLARE
  g1 UUID := (pg_temp.guide_of('11000000-0000-4000-8000-000000000001')).id;
  g5 UUID := (pg_temp.guide_of('11000000-0000-4000-8000-000000000005')).id;
  b public.tiss_batches%ROWTYPE;
BEGIN
  BEGIN
    PERFORM public.finance_tiss_resend_guide(g1, 'Carteira errada');
    RAISE EXCEPTION 'cenário 10: reenviar guia paga passou';
  EXCEPTION WHEN others THEN
    ASSERT SQLERRM LIKE '%guia_paga%', 'cenário 10: erro inesperado: ' || SQLERRM;
  END;
  b := public.finance_tiss_create_batch('e1000000-0000-4000-8000-000000000001', ARRAY[g5]);
  ASSERT b.number = '2' AND b.origin_value = 'PF-778', format('cenário 10: lote 2 errado (%s, %s)', b.number, b.origin_value);
  PERFORM public.finance_tiss_discard_batch(b.id, 'Gerado sem querer');
  ASSERT (SELECT status FROM public.tiss_guides WHERE id = g5) = 'open', 'cenário 10: descartar não devolveu a guia';
  b := public.finance_tiss_create_batch('e1000000-0000-4000-8000-000000000001', ARRAY[g5]);
  ASSERT b.number = '3', 'cenário 10: número do lote voltou depois do descarte';
  PERFORM public.finance_tiss_mark_sent(b.id, public.finance_today());
  PERFORM public.finance_tiss_register_payment('e1000000-0000-4000-8000-000000000001', public.finance_today(), 0, 'ted',
    jsonb_build_array(jsonb_build_object('guide_id', g5, 'glosa_cents', 8000, 'glosa_code', '1001')));
  ASSERT (SELECT status FROM public.tiss_guides WHERE id = g5) = 'glosa', 'cenário 10: glosa total sem dinheiro';
  PERFORM public.finance_tiss_resend_guide(g5, 'Carteira corrigida');
  ASSERT (SELECT status FROM public.tiss_guides WHERE id = g5) = 'open', 'cenário 10: reenvio não voltou a em aberto';
  b := public.finance_tiss_create_batch('e1000000-0000-4000-8000-000000000001', ARRAY[g5]);
  ASSERT b.number = '4' AND (SELECT status FROM public.tiss_guides WHERE id = g5) = 'batched', 'cenário 10: reenvio não entrou no lote novo';
  ASSERT (SELECT count(*) FROM public.tiss_batch_guides WHERE guide_id = g5) = 3, 'cenário 10: histórico do lote sumiu';
  ASSERT b.xml LIKE '%<ans:cpfContratado>%' IS NOT TRUE AND b.xml LIKE '%<ans:codigoPrestadorNaOperadora>PF-778</ans:codigoPrestadorNaOperadora>%',
    'cenário 10: executante com credenciamento próprio vai pelo código';
END $$;

-- 11. Recebimento de convênio pelo paciente barrado
DO $$
BEGIN
  BEGIN
    PERFORM public.finance_register_receipt('b1000000-0000-4000-8000-000000000002', public.finance_today(),
      jsonb_build_array(jsonb_build_object('charge_id',
        (SELECT id FROM public.appointment_charges WHERE appointment_id = '11000000-0000-4000-8000-000000000003'),
        'amount_cents', 100, 'method', 'pix')));
    RAISE EXCEPTION 'cenário 11: recebimento de convênio pelo paciente passou';
  EXCEPTION WHEN others THEN
    ASSERT SQLERRM LIKE '%recebimento_de_convenio%', 'cenário 11: erro inesperado: ' || SQLERRM;
  END;
END $$;

-- 12. Recepção
SELECT set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}', TRUE);
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM public.tiss_guides) = 0, 'cenário 12: recepção leu guias';
  ASSERT (SELECT count(*) FROM public.tiss_batches) = 0, 'cenário 12: recepção leu lotes';
  ASSERT (SELECT count(*) FROM public.convenio_payments) = 0, 'cenário 12: recepção leu pagamentos';
  ASSERT (SELECT count(*) FROM public.finance_tiss_charge_status()) = 0, 'cenário 12: recepção viu situação';
  BEGIN
    PERFORM public.finance_tiss_guides(NULL);
    RAISE EXCEPTION 'cenário 12: recepção chamou finance_tiss_guides';
  EXCEPTION WHEN others THEN
    ASSERT SQLERRM LIKE '%administração%', 'cenário 12: erro inesperado: ' || SQLERRM;
  END;
  BEGIN
    INSERT INTO public.tiss_guides (clinic_id, convenio_id, patient_id, number)
    VALUES ('c1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', '999');
    RAISE EXCEPTION 'cenário 12: escrita direta em tiss_guides passou';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END $$;

-- 13. Exclusão de paciente com guia em lote e pagamento
SELECT set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}', TRUE);
SELECT public.request_patient_deletion('b1000000-0000-4000-8000-000000000001', 'Pedido de exclusão só para a validação.');
SELECT set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', TRUE);
SELECT public.admin_decide_patient_deletion(
  (SELECT id FROM public.patient_deletion_requests WHERE patient_id = 'b1000000-0000-4000-8000-000000000001' AND status = 'pending'),
  'approved', 'Aprovado na validação.'
);
RESET ROLE;
DO $$
BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM public.appointments WHERE patient_id = 'b1000000-0000-4000-8000-000000000001'),
    'cenário 13: agendamento do paciente excluído ficou';
  ASSERT (SELECT count(*) FROM public.tiss_guides WHERE patient_id = 'b1000000-0000-4000-8000-000000000001' AND coverage_id IS NULL) = 3,
    'cenário 13: as guias precisam ficar (registro de faturamento), sem a carteira ao vivo';
  ASSERT (SELECT count(*) FROM public.tiss_batch_guides bg JOIN public.tiss_guides g ON g.id = bg.guide_id
          WHERE g.patient_id = 'b1000000-0000-4000-8000-000000000001') >= 4,
    'cenário 13: a cópia enviada nos lotes precisa ficar';
END $$;

SELECT 'convênios fase 2: todos os cenários passaram' AS resultado;
SELECT xml AS lote_1_xml FROM public.tiss_batches WHERE convenio_id = 'e1000000-0000-4000-8000-000000000001' AND number = '1';

ROLLBACK;
