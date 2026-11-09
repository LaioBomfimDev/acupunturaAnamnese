\set ON_ERROR_STOP on
-- Fixtures commitadas SÓ no clone descartável acup_qa_008c (apagado ao final).
INSERT INTO auth.users(id,email) VALUES
 ('a0089100-0000-4000-8000-000000000001','c1.008@example.invalid'),('a0089100-0000-4000-8000-000000000002','c2.008@example.invalid'),('a0089100-0000-4000-8000-000000000004','c4.008@example.invalid');
INSERT INTO public.clinics(id,name) VALUES ('c0089100-0000-4000-8000-000000000001','Clínica conc 008');
INSERT INTO public.profiles(id,email,full_name,role,clinic_id,is_active,must_change_password,mfa_required,disciplines)
SELECT id,email,'Fictício',CASE WHEN right(id::TEXT,1)='4' THEN 'clinic_admin' ELSE 'therapist' END,'c0089100-0000-4000-8000-000000000001',TRUE,FALSE,FALSE,ARRAY['aba']
FROM auth.users WHERE email LIKE 'c_.008@example.invalid'
ON CONFLICT ON CONSTRAINT profiles_pkey DO UPDATE SET clinic_id=EXCLUDED.clinic_id,role=EXCLUDED.role,is_active=TRUE,must_change_password=FALSE,mfa_required=FALSE,disciplines=EXCLUDED.disciplines;
INSERT INTO public.aba_care_teams(id,clinic_id,name,supervisor_id,created_by) VALUES
 ('d0089100-0000-4000-8000-000000000001','c0089100-0000-4000-8000-000000000001','Time conc','a0089100-0000-4000-8000-000000000001','a0089100-0000-4000-8000-000000000004');
INSERT INTO public.aba_care_team_members(clinic_id,team_id,therapist_id,assigned_by) VALUES
 ('c0089100-0000-4000-8000-000000000001','d0089100-0000-4000-8000-000000000001','a0089100-0000-4000-8000-000000000002','a0089100-0000-4000-8000-000000000001');
INSERT INTO public.patients(id,clinic_id,therapist_id,name) SELECT ('b0089100-0000-4000-8000-00000000000'||n)::UUID,'c0089100-0000-4000-8000-000000000001','a0089100-0000-4000-8000-000000000001','Paciente conc '||n FROM generate_series(1,3) n;
INSERT INTO public.aba_patient_teams(clinic_id,team_id,patient_id,assigned_by) SELECT 'c0089100-0000-4000-8000-000000000001','d0089100-0000-4000-8000-000000000001',('b0089100-0000-4000-8000-00000000000'||n)::UUID,'a0089100-0000-4000-8000-000000000001' FROM generate_series(1,3) n;
INSERT INTO public.patient_deletion_requests(id,patient_id,clinic_id,requested_by,reason) SELECT ('90089100-0000-4000-8000-00000000000'||n)::UUID,('b0089100-0000-4000-8000-00000000000'||n)::UUID,'c0089100-0000-4000-8000-000000000001','a0089100-0000-4000-8000-000000000004','Pedido fictício conc '||n FROM generate_series(1,3) n;
-- rascunho já existente com o paciente 3 (caso c)
SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"a0089100-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',false);
SELECT public.aba_save_supervision_draft(jsonb_build_object('id','80089100-0000-4000-8000-000000000003','revision',0,'client_event_id',gen_random_uuid(),'supervisee_id','a0089100-0000-4000-8000-000000000002','patient_id','b0089100-0000-4000-8000-000000000003','held_on',(clock_timestamp() AT TIME ZONE 'America/Sao_Paulo')::DATE,'duration_minutes',50,'modality','individual','format','online','agenda','Pauta existente'));
RESET ROLE;
