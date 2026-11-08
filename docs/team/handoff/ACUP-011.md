## ACUP-011 — entrega

- Branch/base: `codex/lk`, merge de `integracao` (`4bd3326`) antes de começar. Commit da task: `fix(ACUP-011): recusa perfil arquivado e laudo futuro`.
- Arquivos: migration nova `20261108ba_aba_perfil_ajustes.sql`, somente acréscimos em `aba-patient-profile.test.mjs`, este handoff. Sem tela, schema novo, financeiro ou exclusão recriada.
- O que mudou: apenas dois IFs em `aba_save_profile`, copiada integralmente da 20261108b. O teste reconstrói o corpo anterior + essas duas inserções e compara tudo, preservando gates, cifra, CAS, replay, locks e retorno.
- Arquivado: bloco/mensagem copiados literalmente de `aba_save_plan_draft` da 20261108a: `Paciente arquivado não recebe plano.` (22023). O substantivo foi mantido por instrução de copiar a mensagem, sem inventar outra. A checagem fica após o lock do paciente e antes do replay, exatamente como no plano. Portanto, nem replay escreve/responde sucesso em paciente arquivado; a leitura segue a regra inalterada da 004.
- Data: depois do cast válido e antes da cifra, `issued_on` não pode superar `(clock_timestamp() AT TIME ZONE 'America/Sao_Paulo')::DATE`; recusa 22023 `Data do laudo não pode ser futura.` Não usa current_date nem o fuso da conexão, não ecoa conteúdo de laudo e não reescreve registro antigo.
- Validação SQL: passou (exit 0), quatro NOTICEs OK e ROLLBACK. Laudo hoje aceito, amanhã recusado com 22023 pt-BR em conexão Pacific/Kiritimati; CAS e replay preservados no ativo; arquivado lê mas não cria/atualiza/replay. Migration 2x com COMMIT em acup_lk_011_20261108; hashes de get_profile/exclusão iguais antes/depois. Template e produção intocados.
- Regressão: 15 testes focados (perfil + invariantes) passaram; retiradas temporariamente, uma por vez, as guardas de arquivado e data futura da migration: cada mutação fez o teste sair com 1. Bytes originais restaurados, e os 8 testes do perfil passaram novamente. Nenhuma expectativa anterior foi removida ou alterada.
- Gates: lint e build passaram (exit 0); build com avisos existentes de chunk/import misto. Suíte completa passou (exit 0): 1.382 testes, 1.381 aprovados, 1 ignorado, zero falhas (155,5 s).
- Reversão: restaurar somente aba_save_profile da 20261108b; isso volta a permitir as situações corrigidas. Nenhum dado ou estrutura é apagado.

### Roteiro SQL local (ROLLBACK)

Somente em cópia isolada de `acup_base`, usada `acup_lk_011_20261108`, no contêiner `acup-qa-pg`. Aplicar antes 20261108, 20261108a e 20261108b (e 20261103c se faltar observacoes). Depois aplicar **duas vezes, cada uma com COMMIT**, a 20261108ba usando `psql -1 -v ON_ERROR_STOP=1`. Comparar os hashes de `pg_get_functiondef` de aba_get_profile e admin_decide_patient_deletion antes/depois: precisam permanecer iguais.

O bloco abaixo usa só fixtures fictícias, com conexão em Pacific/Kiritimati para conferir que o dia de referência é São Paulo. Confere laudo hoje aceito, amanhã recusado sem alterar o perfil, replay/CAS preservados no paciente ativo, arquivado existente ainda legível e escrita barrada (incluindo replay), e arquivado sem perfil não recebe registro novo. Nenhum conteúdo clínico é impresso em NOTICE.

```sql
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL TIME ZONE 'Pacific/Kiritimati';
SELECT vault.create_secret('acup011-chave-local-ficticia-para-validacao-rollback','clinical_records_encryption_key')
WHERE NOT EXISTS(SELECT 1 FROM vault.secrets WHERE name='clinical_records_encryption_key');
INSERT INTO auth.users(id,email) VALUES ('a0110000-0000-4000-8000-000000000001','admin.011@example.invalid');
INSERT INTO public.clinics(id,name) VALUES ('c0110000-0000-4000-8000-000000000001','Clínica fictícia 011');
INSERT INTO public.profiles(id,email,full_name,role,clinic_id,is_active,must_change_password,mfa_required,disciplines)
VALUES ('a0110000-0000-4000-8000-000000000001','admin.011@example.invalid','Profissional fictício','clinic_admin','c0110000-0000-4000-8000-000000000001',TRUE,FALSE,FALSE,ARRAY['aba'])
ON CONFLICT ON CONSTRAINT profiles_pkey DO UPDATE SET role=EXCLUDED.role,clinic_id=EXCLUDED.clinic_id,is_active=TRUE,must_change_password=FALSE,mfa_required=FALSE,disciplines=EXCLUDED.disciplines;
INSERT INTO public.patients(id,clinic_id,therapist_id,name,archived_at) VALUES
 ('b0110000-0000-4000-8000-000000000001','c0110000-0000-4000-8000-000000000001','a0110000-0000-4000-8000-000000000001','Paciente fictício ativo',NULL),
 ('b0110000-0000-4000-8000-000000000002','c0110000-0000-4000-8000-000000000001','a0110000-0000-4000-8000-000000000001','Paciente fictício arquivado',clock_timestamp());
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"a0110000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',TRUE);
DO $test$
DECLARE p UUID := 'b0110000-0000-4000-8000-000000000001';
 today DATE := (clock_timestamp() AT TIME ZONE 'America/Sao_Paulo')::DATE;
 event UUID := gen_random_uuid(); payload JSONB; first JSONB; replay JSONB; before JSONB;
BEGIN
 payload := jsonb_build_object('revision',0,'client_event_id',event,
  'diagnosis',jsonb_build_object('text','Transcrição fictícia sem valor clínico','source','Fonte fictícia 011','issued_on',today),
  'details','Detalhes fictícios');
 first := public.aba_save_profile(p,payload);
 before := public.aba_get_profile(p);
 ASSERT first->>'revision'='1';
 ASSERT before->'diagnosis'->>'issued_on'=today::TEXT;
 replay := public.aba_save_profile(p,payload);
 ASSERT first=replay AND public.aba_get_profile(p)=before;
 RAISE NOTICE 'OK hoje São Paulo passa e replay repete retorno/revisão/carimbos';
 BEGIN
  PERFORM public.aba_save_profile(p,jsonb_build_object('revision',1,'client_event_id',gen_random_uuid(),
   'diagnosis',jsonb_build_object('text','Transcrição fictícia sem valor clínico','source','Fonte fictícia 011','issued_on',today+1)));
  RAISE EXCEPTION 'Data futura foi aceita';
 EXCEPTION WHEN invalid_parameter_value THEN
  ASSERT SQLERRM='Data do laudo não pode ser futura.';
 END;
 ASSERT public.aba_get_profile(p)=before;
 RAISE NOTICE 'OK amanhã São Paulo recusa em 22023 pt-BR, mesmo com outro fuso na conexão';
 BEGIN
  PERFORM public.aba_save_profile(p,jsonb_build_object('revision',0,'client_event_id',gen_random_uuid(),'details','Tentativa fictícia com CAS antigo'));
  RAISE EXCEPTION 'CAS velho foi aceito';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 ASSERT public.aba_get_profile(p)=before;
 first := public.aba_save_profile(p,jsonb_build_object('revision',1,'client_event_id',gen_random_uuid(),'details','Atualização fictícia válida'));
 ASSERT first->>'revision'='2';
 RAISE NOTICE 'OK CAS velho recusa 40001; CAS atual segue gravando';
END $test$;
RESET ROLE;
UPDATE public.patients SET archived_at=clock_timestamp() WHERE id='b0110000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"a0110000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',TRUE);
DO $test$
DECLARE p UUID := 'b0110000-0000-4000-8000-000000000001'; before JSONB := public.aba_get_profile(p);
BEGIN
 ASSERT before IS NOT NULL AND before->>'revision'='2';
 BEGIN
  PERFORM public.aba_save_profile(p,jsonb_build_object('revision',2,'client_event_id',gen_random_uuid(),'details','Tentativa fictícia em arquivado'));
  RAISE EXCEPTION 'Arquivado aceitou atualização';
 EXCEPTION WHEN invalid_parameter_value THEN
  ASSERT SQLERRM='Paciente arquivado não recebe plano.';
 END;
 ASSERT public.aba_get_profile(p)=before;
 BEGIN
  PERFORM public.aba_save_profile(p,jsonb_build_object('revision',1,'client_event_id',before->>'client_event_id'));
  RAISE EXCEPTION 'Arquivado aceitou replay';
 EXCEPTION WHEN invalid_parameter_value THEN
  ASSERT SQLERRM='Paciente arquivado não recebe plano.';
 END;
 ASSERT public.aba_get_profile(p)=before;
 ASSERT public.aba_get_profile('b0110000-0000-4000-8000-000000000002') IS NULL;
 BEGIN
  PERFORM public.aba_save_profile('b0110000-0000-4000-8000-000000000002',jsonb_build_object('revision',0,'client_event_id',gen_random_uuid()));
  RAISE EXCEPTION 'Arquivado aceitou criação';
 EXCEPTION WHEN invalid_parameter_value THEN
  ASSERT SQLERRM='Paciente arquivado não recebe plano.';
 END;
 ASSERT public.aba_get_profile('b0110000-0000-4000-8000-000000000002') IS NULL;
 RAISE NOTICE 'OK arquivado: leitura preservada; criação, atualização e replay recusados com a regra literal do plano';
END $test$;
ROLLBACK;
```

Runner Python na raiz da worktree (ajustar só o nome da cópia do QA):

```python
from pathlib import Path
import re,subprocess,sys
sys.stdout.reconfigure(encoding='utf-8')
text=Path('docs/team/handoff/ACUP-011.md').read_text(encoding='utf-8-sig')
script=re.search(r'```sql\n([\s\S]*?)```',text)[1]
result=subprocess.run(['docker','exec','-i','acup-qa-pg','sh','-c',
 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin -d acup_lk_011_20261108 -v ON_ERROR_STOP=1'],input=script.encode('utf-8'))
raise SystemExit(result.returncode)
```
