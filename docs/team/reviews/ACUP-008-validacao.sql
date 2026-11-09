\set ON_ERROR_STOP on
-- Cenários do QA para a ACUP-008 (dados fictícios, transação única, ROLLBACK).
-- 1 supervisor time A · 2 supervisionado (membro A) · 3 supervisor time B · 4 admin c1 sem ABA
-- 5 terapeuta ABA sem time · 6 admin c2 · 7 recepção com aba · 9 membro do time B
BEGIN;
INSERT INTO auth.users(id,email) SELECT ('a0089000-0000-4000-8000-'||lpad(n::TEXT,12,'0'))::UUID, 'q'||n||'.008@example.invalid' FROM generate_series(1,9) n;
INSERT INTO public.clinics(id,name) VALUES ('c0089000-0000-4000-8000-000000000001','Clínica QA 008'),('c0089000-0000-4000-8000-000000000002','Outra QA 008');
INSERT INTO public.profiles(id,email,full_name,role,clinic_id,is_active,must_change_password,mfa_required,disciplines)
SELECT u.id,u.email,'Fictício',
 CASE x.n WHEN 4 THEN 'clinic_admin' WHEN 6 THEN 'clinic_admin' WHEN 7 THEN 'receptionist' ELSE 'therapist' END,
 (CASE x.n WHEN 6 THEN 'c0089000-0000-4000-8000-000000000002' ELSE 'c0089000-0000-4000-8000-000000000001' END)::UUID,
 TRUE,FALSE,FALSE, CASE WHEN x.n IN (4,6) THEN '{}'::TEXT[] ELSE ARRAY['aba'] END
FROM auth.users u, LATERAL (SELECT right(u.id::TEXT,1)::INT AS n) x WHERE u.email LIKE 'q%.008@example.invalid'
ON CONFLICT ON CONSTRAINT profiles_pkey DO UPDATE SET clinic_id=EXCLUDED.clinic_id,role=EXCLUDED.role,is_active=TRUE,must_change_password=FALSE,mfa_required=FALSE,disciplines=EXCLUDED.disciplines;
INSERT INTO public.aba_care_teams(id,clinic_id,name,supervisor_id,created_by) VALUES
 ('d0089000-0000-4000-8000-000000000001','c0089000-0000-4000-8000-000000000001','Time A','a0089000-0000-4000-8000-000000000001','a0089000-0000-4000-8000-000000000004'),
 ('d0089000-0000-4000-8000-000000000002','c0089000-0000-4000-8000-000000000001','Time B','a0089000-0000-4000-8000-000000000003','a0089000-0000-4000-8000-000000000004');
INSERT INTO public.aba_care_team_members(clinic_id,team_id,therapist_id,assigned_by) VALUES
 ('c0089000-0000-4000-8000-000000000001','d0089000-0000-4000-8000-000000000001','a0089000-0000-4000-8000-000000000002','a0089000-0000-4000-8000-000000000001'),
 ('c0089000-0000-4000-8000-000000000001','d0089000-0000-4000-8000-000000000002','a0089000-0000-4000-8000-000000000009','a0089000-0000-4000-8000-000000000003');
INSERT INTO public.patients(id,clinic_id,therapist_id,name) VALUES
 ('b0089000-0000-4000-8000-000000000001','c0089000-0000-4000-8000-000000000001','a0089000-0000-4000-8000-000000000001','Paciente fictício A'),
 ('b0089000-0000-4000-8000-000000000002','c0089000-0000-4000-8000-000000000001','a0089000-0000-4000-8000-000000000003','Paciente fictício B');
INSERT INTO public.aba_patient_teams(clinic_id,team_id,patient_id,assigned_by) VALUES
 ('c0089000-0000-4000-8000-000000000001','d0089000-0000-4000-8000-000000000001','b0089000-0000-4000-8000-000000000001','a0089000-0000-4000-8000-000000000001'),
 ('c0089000-0000-4000-8000-000000000001','d0089000-0000-4000-8000-000000000002','b0089000-0000-4000-8000-000000000002','a0089000-0000-4000-8000-000000000003');
CREATE OR REPLACE FUNCTION pg_temp.qa_as(n INT) RETURNS TEXT LANGUAGE sql AS $f$
 SELECT set_config('request.jwt.claims', jsonb_build_object('sub','a0089000-0000-4000-8000-'||lpad(n::TEXT,12,'0'),'role','authenticated','aal','aal2')::TEXT, TRUE) $f$;
CREATE OR REPLACE FUNCTION pg_temp.qa_try(sql TEXT) RETURNS TEXT LANGUAGE plpgsql AS $f$
BEGIN EXECUTE sql; RETURN 'aceito'; EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE||' '||SQLERRM; END $f$;
CREATE OR REPLACE FUNCTION pg_temp.rec(p_id TEXT) RETURNS JSONB LANGUAGE sql AS $f$
 SELECT value FROM jsonb_array_elements(public.aba_list_supervisions()->'records') WHERE value->>'id'=p_id $f$;
CREATE OR REPLACE FUNCTION pg_temp.draft(p_id TEXT, p_supervisee INT, p_patient TEXT, p_minutes INT, p_agenda TEXT) RETURNS TEXT LANGUAGE sql AS $f$
 SELECT pg_temp.qa_try(format('SELECT public.aba_save_supervision_draft(%L::jsonb)', jsonb_build_object('id',p_id,'revision',0,'client_event_id',gen_random_uuid(),
  'supervisee_id','a0089000-0000-4000-8000-'||lpad(p_supervisee::TEXT,12,'0'),'patient_id',p_patient,
  'held_on',(clock_timestamp() AT TIME ZONE 'America/Sao_Paulo')::DATE,'duration_minutes',p_minutes,'modality','individual','format','presencial','agenda',p_agenda))) $f$;
SET LOCAL ROLE authenticated;

-- E1 quem grava
SELECT pg_temp.qa_as(1) \gset
DO $q$ BEGIN
 ASSERT pg_temp.draft('80089000-0000-4000-8000-000000000001',2,'b0089000-0000-4000-8000-000000000001',60,'Pauta com paciente A')='aceito';
 ASSERT pg_temp.draft('80089000-0000-4000-8000-000000000002',2,NULL,30,'Pauta geral')='aceito';
 ASSERT pg_temp.draft('80089000-0000-4000-8000-000000000003',2,NULL,45,'Rascunho que fica')='aceito';
 ASSERT pg_temp.draft(gen_random_uuid()::TEXT,2,'b0089000-0000-4000-8000-000000000002',30,'x') LIKE '42501%';
 ASSERT pg_temp.draft(gen_random_uuid()::TEXT,9,NULL,30,'x') LIKE '42501 Só a administração ou a supervisão%';
 ASSERT pg_temp.draft(gen_random_uuid()::TEXT,5,NULL,30,'x') LIKE '42501%';
 ASSERT pg_temp.draft(gen_random_uuid()::TEXT,7,NULL,30,'x') LIKE '42501%';
 ASSERT pg_temp.draft(gen_random_uuid()::TEXT,2,NULL,601,'x') LIKE '22023%';
 ASSERT pg_temp.draft(gen_random_uuid()::TEXT,2,NULL,0,'x') LIKE '22023%';
 ASSERT pg_temp.draft(gen_random_uuid()::TEXT,2,NULL,30,repeat('x',12001)) LIKE '22023 Pauta%';
 ASSERT pg_temp.qa_try(format('SELECT public.aba_save_supervision_draft(%L::jsonb)', jsonb_build_object('id',gen_random_uuid(),'revision',0,'client_event_id',gen_random_uuid(),
  'supervisee_id','a0089000-0000-4000-8000-000000000002','held_on',((clock_timestamp() AT TIME ZONE 'America/Sao_Paulo')::DATE + 1),'duration_minutes',30,'modality','individual','format','online'))) LIKE '22023 Informe data sem futuro%';
 ASSERT pg_temp.qa_try(format('SELECT public.aba_save_supervision_draft(%L::jsonb)', jsonb_build_object('id',gen_random_uuid(),'revision',0,
  'client_event_id',(SELECT value->>'client_event_id' FROM jsonb_array_elements(public.aba_list_supervisions()->'records') WHERE value->>'id'='80089000-0000-4000-8000-000000000002'),
  'supervisee_id','a0089000-0000-4000-8000-000000000002','held_on','2026-11-01','duration_minutes',30,'modality','individual','format','online'))) LIKE '23505 Este evento já foi registrado%';
 RAISE NOTICE 'QA1 OK: supervisor grava só para membro ativo do próprio time e paciente que supervisiona; outro time, sem time, recepção, 0/601 min, pauta longa, amanhã (SP) e evento reaproveitado recusados em pt-BR';
END $q$;

-- E2 supervisor de outro time, outra clínica, terapeuta comum, recepção
SELECT pg_temp.qa_as(3) \gset
DO $q$ BEGIN
 ASSERT public.aba_list_supervisions()->'records'='[]'::JSONB;
 ASSERT pg_temp.qa_try('SELECT public.aba_sign_supervision(''80089000-0000-4000-8000-000000000001'',1,gen_random_uuid())') LIKE '42501%';
 ASSERT pg_temp.qa_try('SELECT public.aba_save_supervision_draft(''{"id":"80089000-0000-4000-8000-000000000001","revision":1,"client_event_id":"e0089000-0000-4000-8000-0000000000aa","agenda":"invasão"}''::jsonb)') LIKE '42501%';
 RAISE NOTICE 'QA2 OK: supervisor de outro time não lê, não assina, não edita';
END $q$;
SELECT pg_temp.qa_as(6) \gset
DO $q$ BEGIN
 ASSERT public.aba_list_supervisions()->'records'='[]'::JSONB;
 ASSERT pg_temp.qa_try('SELECT public.aba_sign_supervision(''80089000-0000-4000-8000-000000000001'',1,gen_random_uuid())') LIKE '42501%';
 ASSERT pg_temp.qa_try('SELECT public.aba_void_supervision(''80089000-0000-4000-8000-000000000001'',1,''motivo qualquer longo'',gen_random_uuid())') LIKE '42501%';
 RAISE NOTICE 'QA3 OK: admin de outra clínica não lê, não assina, não anula';
END $q$;
SELECT pg_temp.qa_as(5) \gset
DO $q$ BEGIN ASSERT public.aba_list_supervisions()->'records'='[]'::JSONB; RAISE NOTICE 'QA4 OK: terapeuta ABA sem vínculo não lê nada'; END $q$;
SELECT pg_temp.qa_as(2) \gset
DO $q$ BEGIN
 ASSERT public.aba_list_supervisions()->'records'='[]'::JSONB;
 ASSERT pg_temp.qa_try('SELECT public.aba_sign_supervision(''80089000-0000-4000-8000-000000000002'',1,gen_random_uuid())') LIKE '42501%';
 RAISE NOTICE 'QA5 OK: supervisionado não vê rascunho e não assina';
END $q$;

-- E3 assinar e imutabilidade
SELECT pg_temp.qa_as(1) \gset
DO $q$ DECLARE ev UUID := gen_random_uuid(); r JSONB; BEGIN
 r := public.aba_sign_supervision('80089000-0000-4000-8000-000000000001',1,ev);
 ASSERT r->>'revision'='2' AND public.aba_sign_supervision('80089000-0000-4000-8000-000000000001',99,ev)=r;
 PERFORM public.aba_sign_supervision('80089000-0000-4000-8000-000000000002',1,gen_random_uuid());
 ASSERT pg_temp.qa_try('SELECT public.aba_save_supervision_draft(''{"id":"80089000-0000-4000-8000-000000000001","revision":2,"client_event_id":"e0089000-0000-4000-8000-0000000000b1","agenda":"mudar assinado"}''::jsonb)') LIKE '22023 Só o rascunho%';
 ASSERT pg_temp.qa_try('SELECT public.aba_save_supervision_draft(''{"id":"80089000-0000-4000-8000-000000000001","revision":2,"client_event_id":"e0089000-0000-4000-8000-0000000000b2","held_on":"2026-01-01"}''::jsonb)') LIKE '22023 Só o rascunho%';
 ASSERT pg_temp.qa_try('SELECT public.aba_sign_supervision(''80089000-0000-4000-8000-000000000001'',2,gen_random_uuid())') LIKE '22023%';
 ASSERT pg_temp.qa_try('SELECT public.aba_void_supervision(''80089000-0000-4000-8000-000000000001'',2,''curto'',gen_random_uuid())') LIKE '22023 Informe o motivo%';
 ASSERT pg_temp.qa_try('SELECT public.aba_void_supervision(''80089000-0000-4000-8000-000000000003'',1,''motivo com mais de dez'',gen_random_uuid())') LIKE '42501%';
 ASSERT pg_temp.qa_try('SELECT public.aba_sign_supervision(''80089000-0000-4000-8000-000000000001'',1,gen_random_uuid())') LIKE '40001%';
 RAISE NOTICE 'QA6 OK: assina com replay; assinado não muda pauta nem data, não reassina, anular exige motivo de 10+, rascunho não se anula, CAS velho 40001';
END $q$;

-- E4 supervisionado: lê assinados, ciência uma vez
SELECT pg_temp.qa_as(2) \gset
DO $q$ DECLARE ev UUID := gen_random_uuid(); r JSONB; l JSONB; BEGIN
 l := public.aba_list_supervisions();
 ASSERT jsonb_array_length(l->'records')=2 AND pg_temp.rec('80089000-0000-4000-8000-000000000003') IS NULL;
 ASSERT pg_temp.rec('80089000-0000-4000-8000-000000000001')->>'agenda'='Pauta com paciente A';
 ASSERT pg_temp.rec('80089000-0000-4000-8000-000000000002')->>'agenda'='Pauta geral';
 ASSERT l->'totals'->0->>'duration_minutes'='90';
 r := public.aba_ack_supervision('80089000-0000-4000-8000-000000000001',ev);
 ASSERT public.aba_ack_supervision('80089000-0000-4000-8000-000000000001',ev)=r;
 ASSERT pg_temp.qa_try('SELECT public.aba_ack_supervision(''80089000-0000-4000-8000-000000000001'',gen_random_uuid())') LIKE '22023 A ciência já%';
 RAISE NOTICE 'QA7 OK: supervisionado lê os 2 assinados (não o rascunho), total 90 min, ciência uma vez com replay';
END $q$;
SELECT pg_temp.qa_as(1) \gset
DO $q$ BEGIN ASSERT pg_temp.qa_try('SELECT public.aba_ack_supervision(''80089000-0000-4000-8000-000000000002'',gen_random_uuid())') LIKE '42501 Só o próprio%'; RAISE NOTICE 'QA8 OK: supervisor não marca ciência no lugar do supervisionado'; END $q$;

-- E5 anular tira das horas
DO $q$ DECLARE rev BIGINT; BEGIN
 rev := (pg_temp.rec('80089000-0000-4000-8000-000000000002')->>'revision')::BIGINT;
 PERFORM public.aba_void_supervision('80089000-0000-4000-8000-000000000002',rev,'Registro em duplicidade, anulado.',gen_random_uuid());
 ASSERT public.aba_list_supervisions()->'totals'->0->>'duration_minutes'='60';
 RAISE NOTICE 'QA9 OK: anulado e rascunho fora da soma (60 min)';
END $q$;

-- E6 supervisionado sai do time: vê horas, não pauta do paciente
RESET ROLE;
UPDATE public.aba_care_team_members SET ended_at=clock_timestamp() WHERE therapist_id='a0089000-0000-4000-8000-000000000002';
SET LOCAL ROLE authenticated;
SELECT pg_temp.qa_as(2) \gset
DO $q$ DECLARE r JSONB; BEGIN
 r := pg_temp.rec('80089000-0000-4000-8000-000000000001');
 ASSERT r->>'content_restricted'='true' AND r->'agenda'='null'::JSONB AND r->'patient_id'='null'::JSONB AND r->>'duration_minutes'='60';
 ASSERT pg_temp.rec('80089000-0000-4000-8000-000000000002')->>'void_reason'='Registro em duplicidade, anulado.';
 ASSERT public.aba_list_supervisions()->'totals'->0->>'duration_minutes'='60';
 RAISE NOTICE 'QA10 OK: fora do time vê data/horas e o registro sem paciente; pauta e paciente do registro com paciente ficam nulos';
END $q$;
SELECT pg_temp.qa_as(1) \gset
DO $q$ BEGIN
 ASSERT pg_temp.draft(gen_random_uuid()::TEXT,2,NULL,30,'depois de sair') LIKE '42501%';
 ASSERT pg_temp.rec('80089000-0000-4000-8000-000000000001')->>'agenda'='Pauta com paciente A';
 ASSERT pg_temp.qa_try('SELECT public.aba_save_supervision_draft(''{"id":"80089000-0000-4000-8000-000000000003","revision":1,"client_event_id":"e0089000-0000-4000-8000-0000000000c1","agenda":"editar"}''::jsonb)') LIKE '42501%';
 RAISE NOTICE 'QA11 OK: quem registrou continua lendo o que registrou, mas não cria nem edita rascunho de quem saiu do time';
END $q$;

-- E7 paciente arquivado (pedido de exclusão em curso): leitura não quebra
RESET ROLE;
UPDATE public.patients SET archived_at=clock_timestamp() WHERE id='b0089000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT pg_temp.qa_as(4) \gset
DO $q$ DECLARE r JSONB; BEGIN
 r := pg_temp.rec('80089000-0000-4000-8000-000000000001');
 RAISE NOTICE 'QA12 INFO: paciente arquivado, admin lê o registro: content_restricted=%, agenda=%', r->>'content_restricted', r->>'agenda';
 RAISE NOTICE 'QA12 INFO: anular com paciente arquivado -> %', pg_temp.qa_try(format('SELECT public.aba_void_supervision(''80089000-0000-4000-8000-000000000001'',%s,''Teste do QA com paciente arquivado'',gen_random_uuid())', r->>'revision'));
END $q$;

-- E8 anon
RESET ROLE;
SET LOCAL ROLE anon;
DO $q$ BEGIN
 ASSERT pg_temp.qa_try('SELECT public.aba_list_supervisions()') LIKE '42501%';
 ASSERT pg_temp.qa_try('SELECT public.aba_save_supervision_draft(''{}''::jsonb)') LIKE '42501%';
 ASSERT pg_temp.qa_try('SELECT public.aba_ack_supervision(gen_random_uuid(),gen_random_uuid())') LIKE '42501%';
 RAISE NOTICE 'QA13 OK: anon sem EXECUTE';
END $q$;
RESET ROLE;
ROLLBACK;
