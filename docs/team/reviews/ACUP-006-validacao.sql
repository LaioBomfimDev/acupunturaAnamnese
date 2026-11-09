\set ON_ERROR_STOP on
BEGIN;
-- fixtures: 1 supervisor ativo c1, 2 membro do time c1 (aba), 3 admin c2, 4 admin c1 sem aba,
-- 6 supervisor de time na c2 com perfil na c1, 7 admin inativo c1, 8 recepção c1 com aba, 9 supervisor c1 com troca de senha pendente
INSERT INTO auth.users(id,email) SELECT ('a0069000-0000-4000-8000-00000000000'||n)::UUID, 'qa'||n||'.006@example.invalid' FROM generate_series(1,9) n;
INSERT INTO public.clinics(id,name) VALUES ('c0069000-0000-4000-8000-000000000001','Clínica QA 006'),('c0069000-0000-4000-8000-000000000002','Outra QA 006');
INSERT INTO public.profiles(id,email,full_name,role,clinic_id,is_active,must_change_password,mfa_required,disciplines)
SELECT u.id,u.email,'Fictício',
 CASE x.n WHEN 3 THEN 'clinic_admin' WHEN 4 THEN 'clinic_admin' WHEN 7 THEN 'clinic_admin' WHEN 8 THEN 'receptionist' ELSE 'therapist' END,
 (CASE x.n WHEN 3 THEN 'c0069000-0000-4000-8000-000000000002' ELSE 'c0069000-0000-4000-8000-000000000001' END)::UUID,
 x.n<>7, x.n=9, FALSE, CASE WHEN x.n IN (3,4) THEN '{}'::TEXT[] ELSE ARRAY['aba'] END
FROM auth.users u, LATERAL (SELECT right(u.id::TEXT,1)::INT AS n) x WHERE u.email LIKE 'qa%.006@example.invalid'
ON CONFLICT ON CONSTRAINT profiles_pkey DO UPDATE SET clinic_id=EXCLUDED.clinic_id,role=EXCLUDED.role,is_active=EXCLUDED.is_active,
 must_change_password=EXCLUDED.must_change_password,mfa_required=FALSE,disciplines=EXCLUDED.disciplines;
INSERT INTO public.aba_care_teams(id,clinic_id,name,supervisor_id,created_by) VALUES
 ('d0069000-0000-4000-8000-000000000001','c0069000-0000-4000-8000-000000000001','Time QA','a0069000-0000-4000-8000-000000000001','a0069000-0000-4000-8000-000000000004'),
 ('d0069000-0000-4000-8000-000000000002','c0069000-0000-4000-8000-000000000002','Time outra','a0069000-0000-4000-8000-000000000006','a0069000-0000-4000-8000-000000000003'),
 ('d0069000-0000-4000-8000-000000000009','c0069000-0000-4000-8000-000000000001','Time senha','a0069000-0000-4000-8000-000000000009','a0069000-0000-4000-8000-000000000004');
INSERT INTO public.aba_care_team_members(id,clinic_id,team_id,therapist_id,assigned_by,starts_at)
 VALUES (gen_random_uuid(),'c0069000-0000-4000-8000-000000000001','d0069000-0000-4000-8000-000000000001','a0069000-0000-4000-8000-000000000002','a0069000-0000-4000-8000-000000000004',current_date);
CREATE TEMP TABLE qa_cat AS SELECT pg_read_file('/qa/acup006/catalog.json')::JSONB AS j;
CREATE TEMP TABLE qa_items AS SELECT * FROM public.aba_library_items WITH NO DATA;
GRANT SELECT ON qa_cat TO authenticated;
CREATE OR REPLACE FUNCTION pg_temp.qa_as(n INT) RETURNS TEXT LANGUAGE sql AS $f$
 SELECT set_config('request.jwt.claims', jsonb_build_object('sub','a0069000-0000-4000-8000-00000000000'||n,'role','authenticated','aal','aal2')::TEXT, TRUE) $f$;
CREATE OR REPLACE FUNCTION pg_temp.qa_code(p JSONB) RETURNS TEXT LANGUAGE plpgsql AS $f$
BEGIN PERFORM public.aba_save_library_item(p); RETURN 'aceito';
EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE||' '||SQLERRM; END $f$;
CREATE OR REPLACE FUNCTION pg_temp.qa_list_code() RETURNS TEXT LANGUAGE plpgsql AS $f$
BEGIN PERFORM public.aba_list_library(); RETURN 'aceito';
EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE||' '||SQLERRM; END $f$;
SET LOCAL ROLE authenticated;

-- QA1 catálogo inteiro (161) aceito pela RPC como admin sem disciplina ABA
SELECT pg_temp.qa_as(4) \gset
DO $q$ DECLARE it JSONB; n INT := 0; BEGIN
 FOR it IN SELECT jsonb_array_elements(j) FROM qa_cat LOOP
  PERFORM public.aba_save_library_item(it || jsonb_build_object('id',gen_random_uuid(),'revision',0,'client_event_id',gen_random_uuid())); n := n+1;
 END LOOP;
 ASSERT n=161 AND jsonb_array_length(public.aba_list_library())=161;
 ASSERT (SELECT bool_and(x->'content' = c->'content') AND count(*)=161 FROM jsonb_array_elements(public.aba_list_library()) x
   JOIN jsonb_array_elements((SELECT j FROM qa_cat)) c ON c->>'system_key'=x->>'system_key' AND c->>'kind'=x->>'kind');
 RAISE NOTICE 'QA1 OK: 161 modelos do abaLibrary.js aceitos e devolvidos idênticos';
END $q$;

-- QA2-6 permissões de leitura/escrita
SELECT pg_temp.qa_as(2) \gset
DO $q$ BEGIN
 ASSERT jsonb_array_length(public.aba_list_library())=161;
 ASSERT pg_temp.qa_code('{"id":"b0069000-0000-4000-8000-000000000001","revision":0,"client_event_id":"e0069000-0000-4000-8000-000000000001","kind":"objetivo","content":{"title":"x"}}') LIKE '42501 Só a administração%';
 RAISE NOTICE 'QA2 OK: membro de time ativo (não supervisor) lê e é barrado ao gravar, 42501 pt-BR';
END $q$;
SELECT pg_temp.qa_as(8) \gset
DO $q$ BEGIN ASSERT pg_temp.qa_list_code() LIKE '42501%'; ASSERT pg_temp.qa_code('{}') LIKE '42501%'; RAISE NOTICE 'QA3 OK: recepção com disciplina aba barrada ao ler e gravar'; END $q$;
SELECT pg_temp.qa_as(7) \gset
DO $q$ BEGIN ASSERT pg_temp.qa_list_code() LIKE '42501 Acesso negado%'; ASSERT pg_temp.qa_code('{}') LIKE '42501 Acesso negado%'; RAISE NOTICE 'QA4 OK: admin inativo barrado pelo gate'; END $q$;
SELECT pg_temp.qa_as(9) \gset
DO $q$ BEGIN ASSERT pg_temp.qa_list_code() LIKE '42501 Acesso negado%'; ASSERT pg_temp.qa_code('{}') LIKE '42501 Acesso negado%'; RAISE NOTICE 'QA5 OK: supervisor com troca de senha pendente barrado pelo gate'; END $q$;
SELECT pg_temp.qa_as(6) \gset
DO $q$ BEGIN
 ASSERT pg_temp.qa_code('{"id":"b0069000-0000-4000-8000-000000000006","revision":0,"client_event_id":"e0069000-0000-4000-8000-000000000006","kind":"objetivo","content":{"title":"x"}}') LIKE '42501%';
 RAISE NOTICE 'QA6 OK: supervisor de time de outra clínica não grava na clínica do próprio perfil';
END $q$;

-- QA7 supervisor ativo: replay, omissões, imutabilidade, limites
SELECT pg_temp.qa_as(1) \gset
DO $q$ DECLARE it JSONB; r JSONB; r2 JSONB; ev UUID := gen_random_uuid(); BEGIN
 SELECT x INTO it FROM jsonb_array_elements(public.aba_list_library()) x WHERE x->>'system_key'='obj-0';
 r := public.aba_save_library_item(jsonb_build_object('id',it->'id','revision',1,'client_event_id',ev,'kind','objetivo','system_key','obj-0','status','oculto'));
 ASSERT r->>'revision'='2';
 r2 := public.aba_save_library_item(jsonb_build_object('id',it->'id','revision',99,'client_event_id',ev,'status','ativo','content','{"title":"outro"}'::JSONB));
 ASSERT r2=r;
 SELECT x INTO it FROM jsonb_array_elements(public.aba_list_library()) x WHERE x->>'system_key'='obj-0';
 ASSERT it->>'status'='oculto' AND it->>'revision'='2' AND it->'content'->>'title' <> 'outro';
 r := public.aba_save_library_item(jsonb_build_object('id',it->'id','revision',2,'client_event_id',gen_random_uuid(),'content',jsonb_build_object('title','Só título')));
 SELECT x INTO it FROM jsonb_array_elements(public.aba_list_library()) x WHERE x->>'system_key'='obj-0';
 ASSERT it->>'status'='oculto' AND it->'content'='{"title":"Só título"}'::JSONB AND it->>'updated_by'='a0069000-0000-4000-8000-000000000001' AND it->>'created_by'='a0069000-0000-4000-8000-000000000004';
 ASSERT pg_temp.qa_code(jsonb_build_object('id',it->'id','revision',3,'client_event_id',gen_random_uuid(),'status','arquivado')) LIKE '22023 Item do sistema%';
 ASSERT pg_temp.qa_code(jsonb_build_object('id',it->'id','revision',3,'client_event_id',gen_random_uuid(),'system_key',NULL)) LIKE '22023 Tipo e referência%';
 ASSERT pg_temp.qa_code(jsonb_build_object('id',it->'id','revision',3,'client_event_id',gen_random_uuid(),'system_key',0)) LIKE '22023 Tipo e referência%';
 ASSERT pg_temp.qa_code(jsonb_build_object('id',gen_random_uuid(),'revision',0,'client_event_id',gen_random_uuid(),'kind','objetivo','system_key',123,'content','{"title":"x"}'::JSONB)) LIKE '22023 Referência%';
 ASSERT pg_temp.qa_code(jsonb_build_object('id',gen_random_uuid(),'revision',0,'client_event_id',gen_random_uuid(),'kind','objetivo','system_key',repeat('a',120),'content','{"title":"x"}'::JSONB))='aceito';
 ASSERT pg_temp.qa_code(jsonb_build_object('id','nao-uuid','revision',0,'client_event_id',gen_random_uuid())) LIKE '22023%';
 ASSERT pg_temp.qa_code(jsonb_build_object('id',gen_random_uuid(),'revision','1e30','client_event_id',gen_random_uuid())) LIKE '22023%';
 ASSERT pg_temp.qa_code(jsonb_build_object('id',gen_random_uuid(),'revision',-1,'client_event_id',gen_random_uuid())) LIKE '22023%';
 ASSERT pg_temp.qa_code(jsonb_build_object('id',gen_random_uuid(),'revision',0,'client_event_id',gen_random_uuid(),'kind','objetivo','content',jsonb_build_object('title',repeat('x',6001)))) LIKE '22023 Textos%';
 ASSERT pg_temp.qa_code(jsonb_build_object('id',gen_random_uuid(),'revision',0,'client_event_id',gen_random_uuid(),'kind','objetivo','content',jsonb_build_object('title','x','level','1'))) LIKE '22023 Nível%';
 ASSERT pg_temp.qa_code(jsonb_build_object('id',gen_random_uuid(),'revision',0,'client_event_id',gen_random_uuid(),'kind','tecnica','content',jsonb_build_object('name','x','caution',NULL)))='aceito';
 ASSERT pg_temp.qa_code(jsonb_build_object('id',gen_random_uuid(),'revision',0,'client_event_id',gen_random_uuid(),'kind','objetivo','content',jsonb_build_object('title','x','caution',NULL))) LIKE '22023 Conteúdo contém%';
 ASSERT pg_temp.qa_code(jsonb_build_object('id',gen_random_uuid(),'revision',0,'client_event_id',gen_random_uuid(),'kind','tecnica','content',jsonb_build_object('name','x','goals',(SELECT jsonb_agg('g'::TEXT) FROM generate_series(1,33))))) LIKE '22023 Objetivos%';
 ASSERT pg_temp.qa_code(jsonb_build_object('id',gen_random_uuid(),'revision',0,'client_event_id',gen_random_uuid(),'kind','objetivo','content',jsonb_build_object('title','x'),'clinic_id','c0069000-0000-4000-8000-000000000002'))='aceito';
 ASSERT NOT EXISTS (SELECT 1 FROM jsonb_array_elements(public.aba_list_library()) x WHERE x->>'clinic_id'<>'c0069000-0000-4000-8000-000000000001');
 RAISE NOTICE 'QA7 OK: replay com payload diferente devolve o mesmo e não grava; omitidos preservam; sistema não arquiva nem perde/troca referência; tipos e limites; clinic_id do payload ignorado';
END $q$;

-- QA8 outra clínica tentando replay/escrita num id da c1
RESET ROLE;
INSERT INTO qa_items SELECT * FROM public.aba_library_items WHERE system_key='obj-0';
GRANT SELECT ON qa_items TO authenticated;
SET LOCAL ROLE authenticated;
SELECT pg_temp.qa_as(3) \gset
DO $q$ DECLARE it JSONB; BEGIN
 SELECT to_jsonb(i) INTO it FROM qa_items i;
 ASSERT public.aba_list_library()='[]'::JSONB;
 ASSERT pg_temp.qa_code(jsonb_build_object('id',it->'id','revision',it->'revision','client_event_id',it->'client_event_id')) LIKE '42501 Item indisponível%';
 RAISE NOTICE 'QA8 OK: outra clínica não vê, não faz replay nem escreve item alheio';
END $q$;

-- QA9 evento antigo reaproveitado em outro item depois que o primeiro avançou
SELECT pg_temp.qa_as(1) \gset
DO $q$ DECLARE a UUID := gen_random_uuid(); e1 UUID := gen_random_uuid(); res TEXT; BEGIN
 PERFORM public.aba_save_library_item(jsonb_build_object('id',a,'revision',0,'client_event_id',e1,'kind','objetivo','content','{"title":"a"}'::JSONB));
 PERFORM public.aba_save_library_item(jsonb_build_object('id',a,'revision',1,'client_event_id',gen_random_uuid(),'content','{"title":"a2"}'::JSONB));
 res := pg_temp.qa_code(jsonb_build_object('id',gen_random_uuid(),'revision',0,'client_event_id',e1,'kind','objetivo','content','{"title":"b"}'::JSONB));
 RAISE NOTICE 'QA9 INFO: evento antigo de outro item -> %', res;
END $q$;
RESET ROLE;
DO $q$ BEGIN
 ASSERT NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.aba_library_items'::regclass AND NOT tgisinternal);
 ASSERT (SELECT count(*) FROM pg_proc WHERE proname IN ('aba_list_library','aba_save_library_item') AND prosecdef AND proconfig @> ARRAY['search_path=pg_catalog'])=2;
 ASSERT NOT has_function_privilege('anon','public.aba_save_library_item(jsonb)','EXECUTE');
 ASSERT NOT has_function_privilege('anon','public.aba_list_library()','EXECUTE');
 ASSERT NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='aba_library_items' AND column_name ~ 'patient');
 RAISE NOTICE 'QA10 OK: sem gatilho, DEFINER + search_path nas 2 RPCs, anon sem EXECUTE, nenhuma coluna de paciente';
END $q$;
ROLLBACK;
