## ACUP-004 — entrega

- Branch/base: `codex/lk`, merge de `integracao` (`9261bed`) antes de começar. Commit da task: `feat(ACUP-004): adiciona perfil ABA cifrado do paciente`.
- Arquivos: migration `20261108b_aba_perfil_paciente.sql`, teste `aba-patient-profile.test.mjs`, somente o bullet ABA em `AGENTS.md`, este handoff. Sem tela, service, financeiro ou outras RPCs ABA.
- O que mudou: um perfil por paciente, códigos fechados de comunicação sem repetição e suporte (`1`, `2`, `3`, `nao_informado`). RLS ligada, sem policy ou privilégios diretos; duas RPCs DEFINER com search_path pg_catalog. Leitura por `aba_require_patient(..., FALSE)`, escrita por `(..., TRUE)`; clínica e carimbo vêm do banco. Lock NO KEY UPDATE no paciente, CAS e replay antes de comparar a revisão.
- Privacidade: diagnóstico só transcrito de laudo, com fonte/data obrigatórias dentro do mesmo `diagnosis_encrypted`; detalhes só em `details_encrypted`. Sem coluna de CID/diagnóstico/fonte em claro, sem geração/sugestão e sem conteúdo clínico em NOTICE/log/retorno de escrita. Texto acima do limite é recusado, não truncado silenciosamente.
- Exclusão: copiada da última definição anterior (`20261108_aba_plano_versionado.sql`), com somente duas linhas adicionais (snapshot e DELETE de `aba_patient_profiles`). O teste compara todo o restante do corpo. Snapshot antes de qualquer limpeza; perfil sai antes da anonimização do paciente.
- Validação: 13 testes focados aprovados; migration aplicou 2x com COMMIT no banco local isolado `acup_lk_004_20261108`, como supabase_admin, no contêiner `acup-qa-pg`. Template e produção intocados. Roteiro SQL também passou (exit 0), oito NOTICEs OK e ROLLBACK: supervisão e administração gravam com carimbo real; membro lê e não grava; outra clínica/anon barrados; modos/suporte/laudo inválidos recusados; CAS velho 40001; replay mantém o mesmo retorno e carimbos; cifra e RLS conferidas; exclusão com perfil, atendimento e evolução vinculada passou. `npm run lint`, `npm test` e `npm run build` passaram (exit 0). Suíte: 1.380 testes, 1.379 aprovados, 1 ignorado, zero falhas (154,5 s). Build com os avisos existentes de chunk grande/import misto. Após ROLLBACK, consulta da tabela retornou 0 perfis de teste.
- Limites: validação estrutural do registro não confirma autenticidade ou conteúdo do laudo; o texto é transcrição informada pela profissional, nunca diagnóstico gerado. Nenhuma tela ou escrita em produção nesta task.
- Reversão: revogar EXECUTE da escrita, mantendo dados, leitura e exclusão atualizadas. Não restaurar exclusão antiga nem apagar tabela com dados; reaplicar reativa.

### API para ACUP-005

- `aba_get_profile(p_patient_id UUID) -> JSONB`: NULL se ainda não há perfil. Existindo, retorna patient_id, clinic_id, communication_mode, support_level, revision, client_event_id, updated_by, updated_at, `diagnosis` (objeto ou null) e `details` (texto ou null). Não devolve as colunas encrypted.
- `aba_save_profile(p_patient_id UUID, p_profile JSONB) -> JSONB`: exige revision (0 cria) e client_event_id UUID novo por ação; retorna somente `{patient_id, revision, client_event_id}`. Replay do último evento retorna o mesmo objeto sem mudar revisão, ator ou horário. Revisão velha, inclusive de evento anterior, falha com 40001.
- Campos aceitos: communication_mode (array de códigos), support_level, diagnosis, details. Campos omitidos preservam o gravado; na criação, comunicação vazia e suporte nao_informado. null limpa diagnosis/details. Valores de clinic_id, patient_id ou updated_by no payload não controlam esses dados.
- `diagnosis`: null ou `{text, source, issued_on: 'AAAA-MM-DD'}`. Texto e fonte obrigatórios (até 6000 e 1000 caracteres); data válida obrigatória. Se o laudo contiver CID, transcrever no text. Não aceita campos extras dentro do objeto, para evitar perder conteúdo silenciosamente. O objeto inteiro é cifrado; não existem colunas claras de fonte/data do laudo.
- `details`: texto de até 12000 caracteres, ou null. Código/modo/tipo inválido e campos obrigatórios faltando = 22023 com mensagem pt-BR sem ecoar valores clínicos. Sem permissão = 42501. A tela futura deve escrever apenas o laudo informado pela pessoa, nunca inferir diagnóstico nem nível de suporte.

### Roteiro SQL (somente cópia local, termina em ROLLBACK)

Preparar uma cópia nova de `acup_base` (usada: `acup_lk_004_20261108`). Aplicar antes, em ordem, 20261108 (plano) e 20261108a (ajustes); se faltar patients.observacoes, aplicar antes 20261103c só na cópia. Aplicar **duas vezes**, cada execução com `psql -1 -v ON_ERROR_STOP=1`, a 20261108b (COMMIT implícito do -1). Depois executar o bloco abaixo. As fixtures são todas fictícias e revertidas; nenhum dado de produção é usado.

```sql
\set ON_ERROR_STOP on
BEGIN;
SELECT vault.create_secret('acup004-chave-local-ficticia-para-validacao-rollback','clinical_records_encryption_key')
WHERE NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name='clinical_records_encryption_key');
INSERT INTO auth.users(id,email) VALUES
 ('a0040000-0000-4000-8000-000000000001','supervisao.004@example.invalid'),
 ('a0040000-0000-4000-8000-000000000002','membro.004@example.invalid'),
 ('a0040000-0000-4000-8000-000000000003','outra.004@example.invalid'),
 ('a0040000-0000-4000-8000-000000000004','admin.004@example.invalid');
INSERT INTO public.clinics(id,name) VALUES
 ('c0040000-0000-4000-8000-000000000001','Clínica fictícia 004'),
 ('c0040000-0000-4000-8000-000000000002','Outra clínica fictícia 004');
INSERT INTO public.profiles(id,email,full_name,role,clinic_id,is_active,must_change_password,mfa_required,disciplines)
SELECT id,email,'Profissional fictício',CASE WHEN right(id::TEXT,1)='4' THEN 'clinic_admin' ELSE 'therapist' END,
 CASE WHEN right(id::TEXT,1)='3' THEN 'c0040000-0000-4000-8000-000000000002'::UUID ELSE 'c0040000-0000-4000-8000-000000000001'::UUID END,
 TRUE,FALSE,FALSE,ARRAY['aba']::TEXT[] FROM auth.users WHERE email LIKE '%.004@example.invalid'
ON CONFLICT ON CONSTRAINT profiles_pkey DO UPDATE SET clinic_id=EXCLUDED.clinic_id,role=EXCLUDED.role,is_active=TRUE,must_change_password=FALSE,mfa_required=FALSE,disciplines=EXCLUDED.disciplines;
INSERT INTO public.patients(id,clinic_id,therapist_id,name) VALUES
 ('b0040000-0000-4000-8000-000000000001','c0040000-0000-4000-8000-000000000001','a0040000-0000-4000-8000-000000000001','Paciente fictício 004');
INSERT INTO public.aba_care_teams(id,clinic_id,name,supervisor_id,created_by) VALUES
 ('d0040000-0000-4000-8000-000000000001','c0040000-0000-4000-8000-000000000001','Time fictício 004','a0040000-0000-4000-8000-000000000001','a0040000-0000-4000-8000-000000000001');
INSERT INTO public.aba_care_team_members(clinic_id,team_id,therapist_id,assigned_by) VALUES
 ('c0040000-0000-4000-8000-000000000001','d0040000-0000-4000-8000-000000000001','a0040000-0000-4000-8000-000000000002','a0040000-0000-4000-8000-000000000001');
INSERT INTO public.aba_patient_teams(clinic_id,team_id,patient_id,assigned_by) VALUES
 ('c0040000-0000-4000-8000-000000000001','d0040000-0000-4000-8000-000000000001','b0040000-0000-4000-8000-000000000001','a0040000-0000-4000-8000-000000000001');
INSERT INTO public.appointments(id,clinic_id,patient_id,professional_id,discipline,starts_at,ends_at,status,kind) VALUES
 ('80040000-0000-4000-8000-000000000001','c0040000-0000-4000-8000-000000000001','b0040000-0000-4000-8000-000000000001','a0040000-0000-4000-8000-000000000001','aba',
 (current_date-1)+time '10:00',(current_date-1)+time '11:00','no_show','appointment');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"a0040000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',TRUE);
SELECT * FROM public.insert_patient_evolution('b0040000-0000-4000-8000-000000000001','aba','{"observacao":"Falta fictícia para teste de anonimização"}','80040000-0000-4000-8000-000000000001',NULL,gen_random_uuid());
DO $test$
DECLARE p UUID := 'b0040000-0000-4000-8000-000000000001'; event UUID := gen_random_uuid(); payload JSONB; first JSONB; replay JSONB; before JSONB; after JSONB;
BEGIN
 ASSERT public.aba_get_profile(p) IS NULL;
 BEGIN
  PERFORM public.aba_save_profile(p,jsonb_build_object('revision',1,'client_event_id',gen_random_uuid())); RAISE EXCEPTION 'Perfil inexistente aceitou revisão 1';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 payload := jsonb_build_object('revision',0,'client_event_id',event,'communication_mode',jsonb_build_array('vocal','pecs'),'support_level','2',
  'diagnosis',jsonb_build_object('text','Transcrição fictícia de laudo, sem valor clínico.','source','Fonte fictícia 004','issued_on','2026-11-01'),
  'details','Detalhes fictícios de contexto.','clinic_id','c0040000-0000-4000-8000-000000000002','updated_by','a0040000-0000-4000-8000-000000000003');
 first := public.aba_save_profile(p,payload);
 before := public.aba_get_profile(p);
 replay := public.aba_save_profile(p,payload);
 after := public.aba_get_profile(p);
 ASSERT first=replay AND before=after AND first->>'revision'='1';
 ASSERT NOT (first ? 'diagnosis') AND NOT (first ? 'details');
 ASSERT after->>'clinic_id'='c0040000-0000-4000-8000-000000000001';
 ASSERT after->>'updated_by'='a0040000-0000-4000-8000-000000000001';
 ASSERT after->'communication_mode'='["vocal","pecs"]'::JSONB AND after->>'support_level'='2';
 ASSERT after->'diagnosis'->>'source'='Fonte fictícia 004' AND after->'diagnosis'->>'issued_on'='2026-11-01';
 ASSERT after->'diagnosis'->>'text'='Transcrição fictícia de laudo, sem valor clínico.';
 ASSERT after->>'details'='Detalhes fictícios de contexto.';
 ASSERT NOT (after ? 'diagnosis_encrypted') AND NOT (after ? 'details_encrypted');
 BEGIN
  PERFORM public.aba_save_profile(p,payload || jsonb_build_object('client_event_id',gen_random_uuid())); RAISE EXCEPTION 'CAS velho aceito';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 ASSERT public.aba_get_profile(p)=after;
 RAISE NOTICE 'OK supervisão: cria, decifra autorizado, clínica/ator reais, CAS e replay idêntico sem mudar carimbos';
END $test$;

-- Comunicação e suporte inválidos, laudo incompleto/data inválida e texto acima do limite.
DO $test$
DECLARE p UUID := 'b0040000-0000-4000-8000-000000000001'; patch JSONB; before JSONB := public.aba_get_profile(p);
BEGIN
 FOR patch IN SELECT value FROM jsonb_array_elements('[
  {"communication_mode":["vocal","vocal"]}, {"communication_mode":["inventado"]}, {"communication_mode":[null]},
  {"communication_mode":[["vocal"]]}, {"communication_mode":null}, {"support_level":"4"}, {"support_level":null},
  {"diagnosis":{"text":"Texto fictício","issued_on":"2026-11-01"}},
  {"diagnosis":{"text":"Texto fictício","source":"Fonte fictícia","issued_on":"2026-02-30"}},
  {"diagnosis":{"text":"Texto fictício","source":"Fonte fictícia","issued_on":"01/11/2026"}},
  {"diagnosis":{"text":"Texto fictício","source":"Fonte fictícia","issued_on":"2026-11-01","cid":"campo extra"}}
 ]'::JSONB)
 LOOP
  BEGIN
   PERFORM public.aba_save_profile(p,patch || jsonb_build_object('revision',1,'client_event_id',gen_random_uuid()));
   RAISE EXCEPTION 'Valor inválido foi aceito';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  ASSERT public.aba_get_profile(p)=before;
 END LOOP;
 BEGIN
  PERFORM public.aba_save_profile(p,jsonb_build_object('revision',1,'client_event_id',gen_random_uuid(),'details',repeat('x',12001)));
  RAISE EXCEPTION 'Detalhes foram truncados';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 ASSERT public.aba_get_profile(p)=before;
 RAISE NOTICE 'OK validação: modos/suporte/laudo inválidos recusados em 22023, sem perda de conteúdo';
END $test$;

SELECT set_config('request.jwt.claims','{"sub":"a0040000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}',TRUE);
DO $test$
DECLARE p UUID := 'b0040000-0000-4000-8000-000000000001';
BEGIN
 ASSERT public.aba_get_profile(p)->>'revision'='1';
 BEGIN PERFORM public.aba_save_profile(p,jsonb_build_object('revision',1,'client_event_id',gen_random_uuid())); RAISE EXCEPTION 'Membro gravou'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM 1 FROM public.aba_patient_profiles; RAISE EXCEPTION 'Leitura direta liberada'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE NOTICE 'OK membro: lê pela RPC, não grava nem acessa tabela diretamente';
END $test$;
SELECT set_config('request.jwt.claims','{"sub":"a0040000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}',TRUE);
DO $test$
DECLARE p UUID := 'b0040000-0000-4000-8000-000000000001';
BEGIN
 BEGIN PERFORM public.aba_get_profile(p); RAISE EXCEPTION 'Outra clínica leu'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.aba_save_profile(p,'{}'); RAISE EXCEPTION 'Outra clínica gravou'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE NOTICE 'OK outra clínica: leitura e escrita barradas';
END $test$;
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims','{"role":"anon"}',TRUE);
DO $test$
BEGIN
 BEGIN PERFORM public.aba_get_profile('b0040000-0000-4000-8000-000000000001'); RAISE EXCEPTION 'Anon leu'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.aba_save_profile('b0040000-0000-4000-8000-000000000001','{}'); RAISE EXCEPTION 'Anon gravou'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE NOTICE 'OK anon: sem EXECUTE nas duas RPCs';
END $test$;
RESET ROLE;

DO $test$
DECLARE p UUID := 'b0040000-0000-4000-8000-000000000001';
BEGIN
 ASSERT (SELECT diagnosis_encrypted IS NOT NULL AND details_encrypted IS NOT NULL FROM public.aba_patient_profiles WHERE patient_id=p);
 ASSERT (SELECT encode(diagnosis_encrypted,'escape') NOT LIKE '%Fonte fict%' AND encode(details_encrypted,'escape') NOT LIKE '%Detalhes fict%' FROM public.aba_patient_profiles WHERE patient_id=p);
 BEGIN
  UPDATE public.aba_patient_profiles SET communication_mode=ARRAY[['vocal','pecs'],['sinais','gestos']] WHERE patient_id=p;
  RAISE EXCEPTION 'CHECK aceitou array multidimensional';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  UPDATE public.aba_patient_profiles SET communication_mode=ARRAY['vocal','vocal'] WHERE patient_id=p;
  RAISE EXCEPTION 'CHECK aceitou repetição';
 EXCEPTION WHEN check_violation THEN NULL; END;
 ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid='public.aba_patient_profiles'::regclass);
 ASSERT NOT EXISTS(SELECT 1 FROM pg_policies WHERE tablename='aba_patient_profiles');
 ASSERT NOT has_table_privilege('authenticated','public.aba_patient_profiles','SELECT');
 ASSERT NOT has_table_privilege('anon','public.aba_patient_profiles','SELECT');
 RAISE NOTICE 'OK armazenamento: cifra, CHECK real de unicidade/dimensões e RLS fechada';
END $test$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"a0040000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal2"}',TRUE);
DO $test$
DECLARE p UUID := 'b0040000-0000-4000-8000-000000000001'; first JSONB; replay JSONB; event UUID := gen_random_uuid(); before JSONB; after JSONB;
BEGIN
 before := public.aba_get_profile(p);
 first := public.aba_save_profile(p,jsonb_build_object('revision',1,'client_event_id',event,'details',NULL,'communication_mode',jsonb_build_array('gestos'),'support_level','nao_informado'));
 after := public.aba_get_profile(p);
 replay := public.aba_save_profile(p,jsonb_build_object('revision',1,'client_event_id',event));
 ASSERT first=replay AND first->>'revision'='2';
 ASSERT after=public.aba_get_profile(p);
 ASSERT after->'diagnosis'=before->'diagnosis' AND after->>'details' IS NULL;
 ASSERT after->>'updated_by'='a0040000-0000-4000-8000-000000000004';
 BEGIN
  PERFORM public.aba_save_profile(p,jsonb_build_object('revision',1,'client_event_id',gen_random_uuid())); RAISE EXCEPTION 'Atualização antiga sobrescreveu';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 RAISE NOTICE 'OK administração: atualiza com CAS, preserva omitido, limpa null e replay não muda carimbos';
END $test$;
RESET ROLE;
INSERT INTO public.patient_deletion_requests(id,patient_id,clinic_id,requested_by,reason) VALUES
 ('90040000-0000-4000-8000-000000000001','b0040000-0000-4000-8000-000000000001','c0040000-0000-4000-8000-000000000001','a0040000-0000-4000-8000-000000000001','Solicitação fictícia de validação');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"a0040000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal2"}',TRUE);
SELECT public.admin_decide_patient_deletion('90040000-0000-4000-8000-000000000001','approved','Teste fictício de anonimização');
RESET ROLE;
DO $test$
DECLARE p UUID := 'b0040000-0000-4000-8000-000000000001'; s JSONB;
BEGIN
 ASSERT NOT EXISTS(SELECT 1 FROM public.aba_patient_profiles WHERE patient_id=p);
 ASSERT NOT EXISTS(SELECT 1 FROM public.patient_evolutions WHERE patient_id=p);
 ASSERT NOT EXISTS(SELECT 1 FROM public.appointments WHERE patient_id=p);
 ASSERT (SELECT erased_at IS NOT NULL FROM public.patients WHERE id=p);
 SELECT snapshot INTO s FROM patient_erasure_backup.snapshots WHERE patient_id=p;
 ASSERT jsonb_array_length(s->'aba_patient_profiles')=1;
 ASSERT s->'aba_patient_profiles'->0->>'diagnosis_encrypted' IS NOT NULL;
 ASSERT NOT (s->'aba_patient_profiles'->0 ? 'diagnosis');
 ASSERT jsonb_array_length(s->'patient_evolutions')=1 AND jsonb_array_length(s->'appointments')=1;
 ASSERT position('Transcrição fictícia de laudo' IN s::TEXT)=0;
 RAISE NOTICE 'OK exclusão: perfil no snapshot cifrado e removido, evolução antes do atendimento e paciente anonimizado';
END $test$;
ROLLBACK;
```

Exemplo para executar o bloco via Docker, na raiz do repo (ajustar só o nome da cópia local para a do QA):

```python
from pathlib import Path
import re, subprocess, sys
sys.stdout.reconfigure(encoding='utf-8')
text = Path('docs/team/handoff/ACUP-004.md').read_text(encoding='utf-8-sig')
script = re.search(r'```sql\n([\s\S]*?)```', text)[1]
result = subprocess.run(['docker', 'exec', '-i', 'acup-qa-pg', 'sh', '-c',
    'PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin -d acup_lk_004_20261108 -v ON_ERROR_STOP=1'],
    input=script.encode('utf-8'))
raise SystemExit(result.returncode)
```
