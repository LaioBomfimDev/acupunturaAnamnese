## ACUP-002 — entrega

- Branch/commits: `codex/lk`, base `fda5966` após `git merge integracao`. Commit da task: mensagem `feat(ACUP-002): versiona programas e planos ABA`.
- O que mudou: histórico por programa, captura inicial da revisão vigente (não inventa o passado), cinco RPCs de plano, CAS/evento e serialização por paciente; cópia da versão aprovada, aprovação nominal e substituição atômica. Assinaturas das RPCs de programa preservadas. Exclusão de 20261103c preservada com só quatro linhas novas. Bullet ABA atualizado; invariantes também barram DISABLE RLS e GRANT direto.
- Arquivos: migration `20261108_aba_plano_versionado.sql`, `aba-plan-versions.test.mjs`, duas checagens em `aba-invariants.test.mjs`, bullet ABA em `AGENTS.md`, este handoff.
- Comandos e resultados:
  - Testes focados: `node --test frontend/tests/regression/aba-plan-versions.test.mjs frontend/tests/regression/aba-invariants.test.mjs`: 13/13 passaram; repetidos após a revisão final da validação de data, novamente verdes (roteiro SQL também repetido, exit 0). `npx eslint tests/regression/aba-plan-versions.test.mjs` também passou após essa revisão.
  - `git diff --check`: passou; arquivos fora da propriedade intocados.
  - Migration aplicada duas vezes com sucesso em `acup_lk_002_20261108`, cópia isolada local de `acup_base`. A base disponível não tinha `patients.observacoes`; o gate recusou corretamente, e `20261103c_patient_notes.sql` foi aplicada somente na cópia antes de repetir.
  - Roteiro abaixo executado com as duas inclusões expandidas: exit 0 e `ROLLBACK`; nenhuma fixture remanescente (consulta posterior de `patients` devolveu 0).
  - Quatro mutações temporárias: DISABLE RLS em `aba_plan_versions`; GRANT SELECT dessa tabela para `authenticated`; GRANT ALL de `public."aba_program_revisions"` para PUBLIC; GRANT SELECT ON ALL TABLES IN SCHEMA public para anon. Nos quatro casos, invariantes saíram com 1; bytes originais restaurados antes da suíte completa.
  - `cd frontend; npm run lint`: passou (exit 0). `npm test`: passou (exit 0), 1.358 testes, 1.357 aprovados, 1 ignorado, nenhuma falha (276,8 s).
  - `cd frontend; npm run build`: bloqueado (exit 1) por ausência de `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`. Completar o build na worktree de validação com as variáveis públicas configuradas; nenhuma credencial copiada nem configuração alterada.
- Saída SQL observada (todos os ASSERTs passaram): oito NOTICEs `OK`: supervisor gravou revisões 1/2/3; membro passou em rascunho/retry/CAS/envio/leitura e foi barrado nas ações de supervisão; outra clínica e anon barrados nas cinco RPCs (42501); aprovação carimbada, histórico, imutabilidade, cópia, substituição e anulação conferidos; CHECK NULL, índice único, cifra/RLS/privilégios conferidos; administração aprovou com carimbo próprio; exclusão com snapshot completo passou; encerramento `ROLLBACK`. A exclusão incluiu também atendimento e evolução vinculados, com snapshot de ambos e sem erro de FK RESTRICT.
- Riscos/limites: validação local não comprova produção. Não aplicar em produção nesta rodada. Histórico anterior à migration contém somente a revisão corrente. Plano guarda referências imutáveis a revisões escolhidas, sem atualizar para o programa atual silenciosamente; a listagem devolve snapshots históricos e notas decifradas só após o gate.
- Compatibilidade/reversão: RPCs antigas de programa mantêm contrato. Para suspender a feature, revogar EXECUTE das cinco RPCs de plano, mantendo dados, escritores do histórico e exclusão atualizados; reaplicar restaura. Não restaurar escritores antigos com histórico em uso, nem apagar tabelas.
- API para ACUP-003: `aba_save_plan_draft(patient_id, JSONB)` retorna UUID; payload exige `id` UUID, `client_event_id` UUID e `revision` (0 ao criar). `programs` = lista de `{program_id, revision}` (até 200, sem repetição), `summary` (até 12000), `review_due_on` (data ou null). Ao criar, campos omitidos copiam o aprovado; valores presentes substituem. Rascunho vazio pode ser salvo, mas envio exige programas e resumo. `aba_submit_plan(patient_id, plan_id, revision, event_id)`, `aba_approve_plan(...)`, `aba_void_plan(..., reason)` retornam void. Cada nova ação usa outro evento; repetição do último evento é no-op. CAS desatualizado = 40001. `aba_list_plan_versions(patient_id)` retorna array em ordem decrescente com metadados, resumo/motivo decifrados e `program_snapshots` (sem depender de programa vivo).
- Stash: descartado pelo nome somente `ACUP-001-pre-merge` (41020bf), criado pelo LK e superado pela ACUP-001 integrada; stash do financeiro preservado.

### Roteiro SQL para QA (somente Postgres local)

Executar como dono das funções no `acup-qa-pg`, numa cópia de `acup_base`, com diretório atual na raiz desta worktree. O bloco abaixo inclui a migration DUAS vezes na MESMA transação e termina em ROLLBACK. Se a cópia-base não tiver `patients.observacoes`, aplicar antes `20261103c_patient_notes.sql` só nessa cópia (o gate da migration detecta a ausência). Nunca apontar para produção. `ON_ERROR_STOP` e ASSERT abortam no primeiro comportamento inesperado; resultados esperados aparecem nos comentários e NOTICEs. O QA deve anexar sua própria saída ao review.

```sql
\set ON_ERROR_STOP on
BEGIN;
\i supabase/migrations/20261108_aba_plano_versionado.sql
\i supabase/migrations/20261108_aba_plano_versionado.sql

-- Fixtures fictícias; inclusive a chave é só para este teste com ROLLBACK.
SELECT vault.create_secret('acup002-chave-local-ficticia-para-validacao-rollback', 'clinical_records_encryption_key')
WHERE NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'clinical_records_encryption_key');
INSERT INTO auth.users(id, email) VALUES
 ('a2000000-0000-4000-8000-000000000001','supervisor.002@example.invalid'),
 ('a2000000-0000-4000-8000-000000000002','membro.002@example.invalid'),
 ('a2000000-0000-4000-8000-000000000003','outra.002@example.invalid'),
 ('a2000000-0000-4000-8000-000000000004','admin.002@example.invalid');
INSERT INTO public.clinics(id,name) VALUES
 ('c2000000-0000-4000-8000-000000000001','Clínica Teste 002'),
 ('c2000000-0000-4000-8000-000000000002','Outra Clínica Teste 002');
INSERT INTO public.profiles(id,email,full_name,role,clinic_id,is_active,must_change_password,mfa_required,disciplines)
SELECT id,email,'Profissional fictício',CASE WHEN right(id::text,1) = '4' THEN 'clinic_admin' ELSE 'therapist' END,
 CASE WHEN right(id::text,1) = '3' THEN 'c2000000-0000-4000-8000-000000000002'::UUID ELSE 'c2000000-0000-4000-8000-000000000001'::UUID END,
 TRUE,FALSE,FALSE,ARRAY['aba']::TEXT[] FROM auth.users WHERE email LIKE '%.002@example.invalid'
ON CONFLICT (id) DO UPDATE SET role=EXCLUDED.role,clinic_id=EXCLUDED.clinic_id,is_active=TRUE,must_change_password=FALSE,mfa_required=FALSE,disciplines=EXCLUDED.disciplines;
INSERT INTO public.patients(id,clinic_id,therapist_id,name,observacoes) VALUES
 ('b2000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','Paciente fictício 002','Deve sair na anonimização');
INSERT INTO public.aba_care_teams(id,clinic_id,name,supervisor_id,created_by) VALUES
 ('d2000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','Time Teste 002','a2000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001');
INSERT INTO public.aba_care_team_members(clinic_id,team_id,therapist_id,assigned_by) VALUES
 ('c2000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000001');
INSERT INTO public.aba_patient_teams(clinic_id,team_id,patient_id,assigned_by) VALUES
 ('c2000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001');

-- Atendimento concluído e evolução: prova também a ordem RESTRICT já vigente.
INSERT INTO public.appointments(id,clinic_id,patient_id,professional_id,discipline,starts_at,ends_at,status,kind)
VALUES ('82000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001',
 'b2000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','aba',
 (current_date-1)+time '10:00',(current_date-1)+time '11:00','no_show','appointment');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"a2000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',TRUE);
SELECT * FROM public.insert_patient_evolution('b2000000-0000-4000-8000-000000000001','aba','{"observacao":"Falta fictícia para teste de anonimização"}','82000000-0000-4000-8000-000000000001',NULL,gen_random_uuid());
DO $test$
DECLARE p UUID := 'b2000000-0000-4000-8000-000000000001'; v JSONB;
BEGIN
 v := public.aba_save_program(p,'{"id":"e2000000-0000-4000-8000-000000000001","type":"aquisicao","name":"Programa fictício inicial","trial_count":5,"notes":"Nota inicial fictícia","definition":{"target":"codigo_teste"}}');
 ASSERT (v->>'revision')::BIGINT = 1;
 v := public.aba_save_program(p,v || '{"name":"Programa fictício editado","notes":"Nota posterior fictícia"}'::JSONB);
 ASSERT (v->>'revision')::BIGINT = 2;
 v := public.aba_update_program_status('e2000000-0000-4000-8000-000000000001','manutencao','Parecer fictício de teste',FALSE);
 ASSERT (v->>'revision')::BIGINT = 3;
 RAISE NOTICE 'OK supervisor: criar, editar e mudar fase gravam revisões 1, 2 e 3';
END $test$;

-- Membro do time: lê, salva rascunho, atualiza por CAS e envia. Não aprova/anula.
SELECT set_config('request.jwt.claims','{"sub":"a2000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}',TRUE);
DO $test$
DECLARE p UUID := 'b2000000-0000-4000-8000-000000000001';
 id UUID := 'f2000000-0000-4000-8000-000000000001'; event UUID := gen_random_uuid(); payload JSONB; v JSONB;
BEGIN
 payload := jsonb_build_object('id',id,'client_event_id',event,'revision',0,
   'programs',jsonb_build_array(jsonb_build_object('program_id','e2000000-0000-4000-8000-000000000001','revision',1)),
   'summary','Resumo fictício individualizado','review_due_on',current_date+30);
 PERFORM public.aba_save_plan_draft(p,payload);
 PERFORM public.aba_save_plan_draft(p,payload); -- retry: continua revisão 1, não duplica.
 BEGIN
   PERFORM public.aba_save_plan_draft(p,payload || jsonb_build_object('review_due_on','sem data'));
   RAISE EXCEPTION 'Data inválida foi aceita';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END; -- erro em pt-BR, 22023.
 v := public.aba_list_plan_versions(p);
 ASSERT jsonb_array_length(v)=1 AND (v->0->>'revision')::BIGINT=1;
 BEGIN
   PERFORM public.aba_save_plan_draft(p,payload || jsonb_build_object('client_event_id',gen_random_uuid()));
   RAISE EXCEPTION 'CAS inicial antigo foi aceito';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 PERFORM public.aba_save_plan_draft(p,payload || jsonb_build_object('revision',1,'client_event_id',gen_random_uuid(),'summary','Resumo revisto pelo membro'));
 PERFORM public.aba_submit_plan(p,id,2,gen_random_uuid());
 BEGIN
   PERFORM public.aba_approve_plan(p,id,3,gen_random_uuid()); RAISE EXCEPTION 'Membro aprovou';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
   PERFORM public.aba_void_plan(p,id,3,gen_random_uuid(),'Motivo fictício suficiente'); RAISE EXCEPTION 'Membro anulou';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
   PERFORM public.aba_update_program_status('e2000000-0000-4000-8000-000000000001','pausado',NULL,FALSE); RAISE EXCEPTION 'Membro alterou programa';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
   PERFORM 1 FROM public.aba_plan_versions; RAISE EXCEPTION 'Leitura direta liberada';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE NOTICE 'OK membro: rascunho/retry/CAS/envio/leitura; aprovação/anulação/escrita de programa/acesso direto negados';
END $test$;

-- Outra clínica e anon: todas as cinco RPCs novas devem dar 42501.
SELECT set_config('request.jwt.claims','{"sub":"a2000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}',TRUE);
DO $test$
DECLARE p UUID := 'b2000000-0000-4000-8000-000000000001'; id UUID := 'f2000000-0000-4000-8000-000000000001';
BEGIN
 BEGIN PERFORM public.aba_list_plan_versions(p); RAISE EXCEPTION 'Outra clínica leu'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.aba_save_plan_draft(p,'{}'); RAISE EXCEPTION 'Outra clínica salvou'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.aba_submit_plan(p,id,3,gen_random_uuid()); RAISE EXCEPTION 'Outra clínica enviou'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.aba_approve_plan(p,id,3,gen_random_uuid()); RAISE EXCEPTION 'Outra clínica aprovou'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.aba_void_plan(p,id,3,gen_random_uuid(),'Motivo fictício suficiente'); RAISE EXCEPTION 'Outra clínica anulou'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE NOTICE 'OK outra clínica: cinco RPCs negadas (42501)';
END $test$;
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims','{"role":"anon"}',TRUE);
DO $test$
DECLARE p UUID := 'b2000000-0000-4000-8000-000000000001'; id UUID := 'f2000000-0000-4000-8000-000000000001';
BEGIN
 BEGIN PERFORM public.aba_list_plan_versions(p); RAISE EXCEPTION 'Anon leu'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.aba_save_plan_draft(p,'{}'); RAISE EXCEPTION 'Anon salvou'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.aba_submit_plan(p,id,3,gen_random_uuid()); RAISE EXCEPTION 'Anon enviou'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.aba_approve_plan(p,id,3,gen_random_uuid()); RAISE EXCEPTION 'Anon aprovou'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.aba_void_plan(p,id,3,gen_random_uuid(),'Motivo fictício suficiente'); RAISE EXCEPTION 'Anon anulou'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE NOTICE 'OK anon: cinco RPCs sem EXECUTE (42501)';
END $test$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"a2000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',TRUE);
DO $test$
DECLARE p UUID := 'b2000000-0000-4000-8000-000000000001'; id UUID := 'f2000000-0000-4000-8000-000000000001';
 id2 UUID := 'f2000000-0000-4000-8000-000000000002'; event UUID := gen_random_uuid(); v JSONB;
BEGIN
 PERFORM public.aba_approve_plan(p,id,3,event);
 PERFORM public.aba_approve_plan(p,id,3,event); -- retry não mexe na revisão.
 v := public.aba_list_plan_versions(p);
 ASSERT v->0->>'status'='aprovado' AND (v->0->>'revision')::BIGINT=4;
 ASSERT v->0->>'approved_by'='a2000000-0000-4000-8000-000000000001';
 ASSERT v->0->'program_snapshots'->0->'snapshot'->>'name'='Programa fictício inicial';
 ASSERT v->0->'program_snapshots'->0->>'notes'='Nota inicial fictícia';
 BEGIN
   PERFORM public.aba_save_plan_draft(p,jsonb_build_object('id',id,'client_event_id',gen_random_uuid(),'revision',4,'summary','Tentativa de alterar aprovado'));
   RAISE EXCEPTION 'Aprovado foi editado';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 PERFORM public.aba_save_plan_draft(p,jsonb_build_object('id',id2,'client_event_id',gen_random_uuid(),'revision',0));
 v := public.aba_list_plan_versions(p);
 ASSERT v->0->>'status'='rascunho' AND v->0->'programs'=v->1->'programs' AND v->0->>'summary'=v->1->>'summary';
 PERFORM public.aba_submit_plan(p,id2,1,gen_random_uuid());
 PERFORM public.aba_approve_plan(p,id2,2,gen_random_uuid());
 v := public.aba_list_plan_versions(p);
 ASSERT v->0->>'status'='aprovado' AND v->1->>'status'='substituido';
 BEGIN
   PERFORM public.aba_void_plan(p,id2,3,gen_random_uuid(),NULL); RAISE EXCEPTION 'Anulou sem motivo';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN
   PERFORM public.aba_void_plan(p,id2,2,gen_random_uuid(),'Motivo fictício suficiente'); RAISE EXCEPTION 'Anulou com CAS antigo';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 PERFORM public.aba_void_plan(p,id2,3,gen_random_uuid(),'Motivo fictício suficiente');
 v := public.aba_list_plan_versions(p);
 ASSERT v->0->>'status'='anulado' AND v->0->>'void_reason'='Motivo fictício suficiente';
 RAISE NOTICE 'OK supervisor: aprovação carimbada, snapshot histórico, aprovado imutável, cópia, substituição, CAS e anulação';
END $test$;
RESET ROLE;

-- CHECK não pode aceitar NULL em carimbos; índice não permite dois vigentes.
DO $test$
DECLARE p UUID := 'b2000000-0000-4000-8000-000000000001';
BEGIN
 ASSERT (SELECT count(*) FROM public.aba_program_revisions WHERE patient_id=p)=3;
 ASSERT (SELECT bool_and(notes_encrypted IS NOT NULL) FROM public.aba_program_revisions WHERE patient_id=p);
 BEGIN
  UPDATE public.aba_plan_versions SET status='aprovado', approved_by=NULL WHERE patient_id=p AND version_no=1;
  RAISE EXCEPTION 'CHECK aceitou aprovação NULL';
 EXCEPTION WHEN check_violation THEN NULL; END;
 UPDATE public.aba_plan_versions SET status='aprovado' WHERE patient_id=p AND version_no=1;
 BEGIN
  UPDATE public.aba_plan_versions SET status='aprovado',voided_by=NULL,voided_at=NULL,void_reason_encrypted=NULL WHERE patient_id=p AND version_no=2;
  RAISE EXCEPTION 'Índice aceitou dois aprovados';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 ASSERT (SELECT count(*) FROM public.aba_plan_versions WHERE patient_id=p AND status='aprovado')=1;
 ASSERT (SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN ('public.aba_plan_versions'::regclass,'public.aba_program_revisions'::regclass));
 ASSERT NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename IN ('aba_plan_versions','aba_program_revisions'));
 ASSERT NOT has_table_privilege('authenticated','public.aba_plan_versions','SELECT');
 ASSERT NOT has_table_privilege('anon','public.aba_program_revisions','SELECT');
 RAISE NOTICE 'OK dados: 3 revisões, cifra, CHECK NULL, índice único, RLS sem policy/privilégios diretos';
END $test$;

-- Administração decide exclusão com as duas tabelas preenchidas.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"a2000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal2"}',TRUE);
DO $test$
DECLARE p UUID := 'b2000000-0000-4000-8000-000000000001'; id UUID := 'f2000000-0000-4000-8000-000000000003'; v JSONB;
BEGIN
 PERFORM public.aba_save_plan_draft(p,jsonb_build_object('id',id,'client_event_id',gen_random_uuid(),'revision',0));
 PERFORM public.aba_submit_plan(p,id,1,gen_random_uuid());
 PERFORM public.aba_approve_plan(p,id,2,gen_random_uuid());
 v := public.aba_list_plan_versions(p);
 ASSERT v->0->>'status'='aprovado' AND v->0->>'approved_by'='a2000000-0000-4000-8000-000000000004';
 RAISE NOTICE 'OK administração: pode aprovar e o carimbo registra sua identidade';
END $test$;
RESET ROLE;
INSERT INTO public.patient_deletion_requests(id,patient_id,clinic_id,requested_by,reason) VALUES
 ('92000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','Solicitação fictícia para validar anonimização');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"a2000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal2"}',TRUE);
SELECT public.admin_decide_patient_deletion('92000000-0000-4000-8000-000000000001','approved','Validação local fictícia');
RESET ROLE;
DO $test$
DECLARE p UUID := 'b2000000-0000-4000-8000-000000000001'; s JSONB;
BEGIN
 ASSERT NOT EXISTS (SELECT 1 FROM public.aba_program_revisions WHERE patient_id=p);
 ASSERT NOT EXISTS (SELECT 1 FROM public.aba_plan_versions WHERE patient_id=p);
 ASSERT NOT EXISTS (SELECT 1 FROM public.aba_programs WHERE patient_id=p);
 ASSERT NOT EXISTS (SELECT 1 FROM public.patient_evolutions WHERE patient_id=p);
 ASSERT NOT EXISTS (SELECT 1 FROM public.appointments WHERE patient_id=p);
 ASSERT (SELECT erased_at IS NOT NULL AND observacoes IS NULL FROM public.patients WHERE id=p);
 SELECT snapshot INTO s FROM patient_erasure_backup.snapshots WHERE patient_id=p;
 ASSERT jsonb_array_length(s->'aba_program_revisions')=3 AND jsonb_array_length(s->'aba_plan_versions')=3;
 ASSERT jsonb_array_length(s->'patient_evolutions')=1 AND jsonb_array_length(s->'appointments')=1;
 RAISE NOTICE 'OK exclusão: snapshot completo, filhos antes do programa, observações limpas e paciente anonimizado';
END $test$;
ROLLBACK;
```

Para executar via Docker, expandir as duas inclusões antes de enviar o SQL ao contêiner. Exemplo Python, executado na raiz do repo (ajustar somente o nome da cópia local, se necessário):

```python
from pathlib import Path
import re, subprocess
text = Path('docs/team/handoff/ACUP-002.md').read_text(encoding='utf-8-sig')
script = re.search(r'```sql\n([\s\S]*?)```', text)[1]
script = script.replace(r'\i supabase/migrations/20261108_aba_plano_versionado.sql',
    Path('supabase/migrations/20261108_aba_plano_versionado.sql').read_text(encoding='utf-8'))
result = subprocess.run(['docker', 'exec', '-i', 'acup-qa-pg', 'sh', '-c',
    'PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin -d acup_lk_002_20261108 -v ON_ERROR_STOP=1'],
    input=script.encode('utf-8'))
raise SystemExit(result.returncode)
```
