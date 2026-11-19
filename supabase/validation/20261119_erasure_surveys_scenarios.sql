-- ==========================================================
-- Validação de 20261119_patient_erasure_surveys_access_code.sql
-- (cenário no fim; quem roda junta a migration e este arquivo num BEGIN … ROLLBACK)
--
-- Cenários, com um paciente que tem pesquisa respondida, pesquisa aberta,
-- código da Área do Paciente, valor combinado e evolução no prontuário:
--   1. a exclusão aprovada passa (ordem dos DELETE com evolução);
--   2. pesquisa respondida: nota e datas ficam, comentário sai, token novo;
--   3. pesquisa aberta: encerrada (expires_at <= agora), sem resposta;
--   4. snapshot: pesquisas sem token, acesso sem código;
--   5. código de acesso e valor combinado saem.
-- Dados fictícios; nada fica gravado.
-- ==========================================================
INSERT INTO auth.users (id, email) VALUES
  ('a3000000-0000-4000-8000-000000000001', 'admin.excl@example.invalid'),
  ('a3000000-0000-4000-8000-000000000002', 'psico.excl@example.invalid')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.clinics (id, name) VALUES ('c3000000-0000-4000-8000-000000000001', 'Clínica Exclusão');
INSERT INTO public.profiles (id, email, full_name, role, clinic_id, is_active, must_change_password, disciplines)
VALUES
  ('a3000000-0000-4000-8000-000000000001', 'admin.excl@example.invalid', 'Admin Excl', 'clinic_admin', 'c3000000-0000-4000-8000-000000000001', TRUE, FALSE, ARRAY['psicologia']),
  ('a3000000-0000-4000-8000-000000000002', 'psico.excl@example.invalid', 'Psico Excl', 'therapist', 'c3000000-0000-4000-8000-000000000001', TRUE, FALSE, ARRAY['psicologia'])
ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, clinic_id = EXCLUDED.clinic_id, is_active = TRUE,
  must_change_password = FALSE, disciplines = EXCLUDED.disciplines, mfa_required = FALSE;
INSERT INTO public.patients (id, therapist_id, clinic_id, name)
VALUES ('b3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000002', 'c3000000-0000-4000-8000-000000000001', 'Paciente Teste Exclusão');
INSERT INTO public.satisfaction_surveys (id, clinic_id, patient_id, token, responded_at, rating, comment, created_at, expires_at)
VALUES
  ('d3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000001',
   'e3000000-0000-4000-8000-000000000001', now() - interval '2 days', 4, 'Comentário que identifica a pessoa', now() - interval '3 days', now() + interval '11 days'),
  ('d3000000-0000-4000-8000-000000000002', 'c3000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000001',
   'e3000000-0000-4000-8000-000000000002', NULL, NULL, NULL, now() - interval '1 day', now() + interval '13 days');
INSERT INTO public.patient_portal_access (clinic_id, patient_id, access_code)
VALUES ('c3000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000001', 'XK7-QP4');
INSERT INTO public.patient_prices (clinic_id, patient_id, discipline, price_cents)
VALUES ('c3000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000001', 'psicologia', 15000);
INSERT INTO public.appointments (id, clinic_id, patient_id, professional_id, discipline, appointment_type, starts_at, ends_at, status, kind)
VALUES ('13000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000002', 'psicologia', 'session',
        now() - interval '4 days', now() - interval '4 days' + interval '50 minutes', 'attended', 'appointment');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"a3000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}', TRUE);
SELECT public.request_patient_deletion('b3000000-0000-4000-8000-000000000001', 'Pedido de exclusão só para a validação.');
SELECT set_config('request.jwt.claims', '{"sub":"a3000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', TRUE);
SELECT public.admin_decide_patient_deletion(
  (SELECT id FROM public.patient_deletion_requests WHERE patient_id = 'b3000000-0000-4000-8000-000000000001' AND status = 'pending'),
  'approved', 'Aprovado na validação.'
);
RESET ROLE;

DO $$
DECLARE
  v_answered public.satisfaction_surveys%ROWTYPE;
  v_open public.satisfaction_surveys%ROWTYPE;
  v_snap JSONB;
BEGIN
  SELECT * INTO v_answered FROM public.satisfaction_surveys WHERE id = 'd3000000-0000-4000-8000-000000000001';
  SELECT * INTO v_open FROM public.satisfaction_surveys WHERE id = 'd3000000-0000-4000-8000-000000000002';
  ASSERT (SELECT erased_at IS NOT NULL FROM public.patients WHERE id = 'b3000000-0000-4000-8000-000000000001'), '1: paciente não foi excluído';
  ASSERT v_answered.rating = 4 AND v_answered.responded_at IS NOT NULL AND v_answered.created_at IS NOT NULL, '2: nota e datas precisam ficar';
  ASSERT v_answered.comment IS NULL, '2: comentário precisa sair';
  ASSERT v_answered.token <> 'e3000000-0000-4000-8000-000000000001', '2: token precisa ser trocado';
  ASSERT v_open.responded_at IS NULL AND v_open.rating IS NULL, '3: aberta continua sem resposta';
  ASSERT v_open.expires_at <= clock_timestamp(), '3: aberta precisa ser encerrada';
  ASSERT v_open.token <> 'e3000000-0000-4000-8000-000000000002', '3: link aberto precisa morrer';
  SELECT snapshot INTO v_snap FROM patient_erasure_backup.snapshots WHERE patient_id = 'b3000000-0000-4000-8000-000000000001' ORDER BY 1 DESC LIMIT 1;
  ASSERT jsonb_array_length(v_snap -> 'satisfaction_surveys') = 2, '4: pesquisas no snapshot';
  ASSERT NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_snap -> 'satisfaction_surveys') s WHERE s ? 'token'), '4: token fora do snapshot';
  ASSERT jsonb_array_length(v_snap -> 'patient_portal_access') = 1, '4: acesso no snapshot';
  ASSERT NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_snap -> 'patient_portal_access') a WHERE a ? 'access_code'), '4: código fora do snapshot';
  ASSERT NOT EXISTS (SELECT 1 FROM public.patient_portal_access WHERE patient_id = 'b3000000-0000-4000-8000-000000000001'), '5: código de acesso precisa sair';
  ASSERT NOT EXISTS (SELECT 1 FROM public.patient_prices WHERE patient_id = 'b3000000-0000-4000-8000-000000000001'), '5: valor combinado precisa sair';
  RAISE NOTICE 'validacao 20261119: 13 checagens ok';
END $$;
