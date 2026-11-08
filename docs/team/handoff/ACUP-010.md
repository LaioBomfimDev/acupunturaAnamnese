## ACUP-010 — entrega

- Branch/base: `codex/lk`, merge de `integracao` em `1bd98f8` antes de começar. Commit da task com mensagem `fix(ACUP-010): ajusta envio e validação do plano ABA`.
- Escopo: quatro RPCs de escrita recriadas a partir de 20261108, somente lock do paciente, tradução de 23505, RETURN explícito de VOID e remetente no envio. Não recria a exclusão, listagem nem escritores de programa. `aba_list_plan_versions` inclui a coluna nova pelo `to_jsonb(plan)` já existente.
- Remetente: `submitted_by` FK RESTRICT para profiles; backfill de envios antigos por authored_by antes do CHECK; envio novo carimbado por `auth.uid()`. Legado não é prova de quem enviou: o Como funciona informa a limitação do backfill. Autoria e Enviado por aparecem separadamente na tela e no papel.
- Replay: mantém as assinaturas UUID/VOID; UUID repete o mesmo id e VOID repete sucesso vazio. Não cria revisão nem troca remetente/carimbos. Evento de outra versão preserva SQLSTATE 23505 com mensagem pt-BR; CAS continua 40001.
- Ajuda: `ABA_HELP.plano` ativa o botão do workspace que já apontava para esse id; não adiciona botão duplicado. Espelho regenerado por `node frontend/scripts/sync-assistant-help.mjs`. 22023 conserva as mensagens de validação pt-BR do contrato, mantendo mensagem técnica em inglês oculta.
- Teste de tela autorizado pelo Orquestrador em 08/11/2026 19:11 na mesa: a asserção `doesNotMatch(html, /enviado por|items|undefined/i)` foi alterada apenas para exigir o rótulo ligado ao remetente (ausente = traço), conservando a proibição de items/undefined. Casos adicionais conferem submitted_by diferente de authored_by, 22023 e Como funciona. Nenhuma outra expectativa antiga alterada.
- Arquivos: migration nova `20261108a_aba_plano_ajustes.sql`, acréscimos em `aba-plan-versions.test.mjs`, linha do remetente em `AbaPlan.jsx`, tratamento de 22023 em `abaService.js`, somente `ABA_HELP.plano` em `screenHelp.js`, espelho gerado `assistantHelpCorpus.ts`, teste `aba-plan-screen.test.mjs` autorizado e este handoff.
- Validação SQL local: passou (exit 0), com os dois includes da migration na mesma transação, seis NOTICEs OK e ROLLBACK. Conferidos backfill e CHECK NULL, carimbo auth.uid diferente da autoria, UUID/VOID repetidos sem mudar revisão ou timestamp, 23505 pt-BR nas quatro escritas com rollback atômico, supervisão, outra clínica e anon.
- Concorrência local: passou. A 010 aplicou duas vezes com COMMIT na cópia. Controle negativo com a função antiga: B falhou com lock timeout enquanto A seguia aberta. Com NO KEY UPDATE: B inseriu/reverteu o reforçador antes de A encerrar; pg_stat_activity confirmou A idle in transaction. Depois, A também reverteu; plano continuou em_revisao e reforçador fictício não permaneceu.
- Testes focados: `node --test frontend/tests/regression/aba-plan-versions.test.mjs frontend/tests/regression/aba-plan-screen.test.mjs frontend/tests/regression/aba-invariants.test.mjs`: 29/29 passaram. O teste textual reconstrói cada RPC a partir da 002 + apenas as quatro alterações permitidas, e compara o corpo completo.
- `npm run build`: passou (exit 0); apenas avisos existentes de chunk grande e import misto. `npm run lint`: passou (exit 0). `npm test`: passou (exit 0), 1.374 testes, 1.373 aprovados, 1 ignorado, zero falhas (577,1 s).
- Reversão funcional: revogar EXECUTE das quatro RPCs de escrita, preservar coluna/CHECK/dados e reaplicar para reativar. Não restaurar aba_submit_plan antiga, que deixaria de preencher o remetente obrigatório.

### Preparação local (fixtures fictícias visíveis às duas sessões)

Somente numa cópia isolada de `acup_base`, nunca em produção. Usei `acup_lk_010_20261108` no contêiner `acup-qa-pg`, como `supabase_admin`, sem alterar o template. A cópia tinha observacoes, mas não plano; apliquei antes a migration 20261108 da ACUP-002. Se faltar observacoes, aplicar antes a 20261103c apenas na cópia.

O setup abaixo termina em COMMIT somente para as fixtures fictícias poderem ser vistas pelas duas sessões do teste concorrente. As chamadas de validação e as duas sessões concorrentes terminam em ROLLBACK. Não se usa dado real nem se consulta produção.

```sql
-- SETUP: executar antes de aplicar a 010 pela primeira vez, para provar backfill.
\set ON_ERROR_STOP on
BEGIN;
SELECT vault.create_secret('acup010-chave-local-ficticia-para-validacao-rollback', 'clinical_records_encryption_key')
WHERE NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'clinical_records_encryption_key');
INSERT INTO auth.users(id,email) VALUES
 ('a1000000-0000-4000-8000-000000000001','supervisao.010@example.invalid'),
 ('a1000000-0000-4000-8000-000000000002','membro.010@example.invalid'),
 ('a1000000-0000-4000-8000-000000000003','outra.010@example.invalid');
INSERT INTO public.clinics(id,name) VALUES
 ('c1000000-0000-4000-8000-000000000001','Clínica fictícia 010'),
 ('c1000000-0000-4000-8000-000000000002','Outra clínica fictícia 010');
INSERT INTO public.profiles(id,email,full_name,role,clinic_id,is_active,must_change_password,mfa_required,disciplines)
SELECT id,email,'Profissional fictício','therapist',
 CASE WHEN right(id::TEXT,1)='3' THEN 'c1000000-0000-4000-8000-000000000002'::UUID ELSE 'c1000000-0000-4000-8000-000000000001'::UUID END,
 TRUE,FALSE,FALSE,ARRAY['aba']::TEXT[] FROM auth.users WHERE email LIKE '%.010@example.invalid'
ON CONFLICT ON CONSTRAINT profiles_pkey DO UPDATE SET clinic_id=EXCLUDED.clinic_id,role=EXCLUDED.role,is_active=TRUE,must_change_password=FALSE,mfa_required=FALSE,disciplines=EXCLUDED.disciplines;
INSERT INTO public.patients(id,clinic_id,therapist_id,name) VALUES
 ('b1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','Paciente fictício 010');
INSERT INTO public.aba_care_teams(id,clinic_id,name,supervisor_id,created_by) VALUES
 ('d1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','Time fictício 010','a1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001');
INSERT INTO public.aba_care_team_members(clinic_id,team_id,therapist_id,assigned_by) VALUES
 ('c1000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000001');
INSERT INTO public.aba_patient_teams(clinic_id,team_id,patient_id,assigned_by) VALUES
 ('c1000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',TRUE);
SELECT public.aba_save_program('b1000000-0000-4000-8000-000000000001','{"id":"e1000000-0000-4000-8000-000000000001","type":"aquisicao","name":"Programa fictício 010","trial_count":5}');
SELECT public.aba_save_plan_draft('b1000000-0000-4000-8000-000000000001','{"id":"f1000000-0000-4000-8000-000000000001","revision":0,"client_event_id":"91000000-0000-4000-8000-000000000001","programs":[{"program_id":"e1000000-0000-4000-8000-000000000001","revision":1}],"summary":"Resumo fictício para teste"}');
SELECT set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}',TRUE);
SELECT public.aba_submit_plan('b1000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001',1,'91000000-0000-4000-8000-000000000002');
COMMIT;
```

### Validação numa transação terminada em ROLLBACK

Incluir a migration duas vezes no mesmo BEGIN; o roteiro espera backfill por autoria para o envio legado. Depois, o membro do time envia um rascunho criado pela supervisão: o remetente novo deve ser o membro, não a autora e nem um UUID do payload. Replays conferem retorno, revisão e carimbos; colisão de evento nas quatro escritas deve sair com 23505 em pt-BR e sem alterar dados.

```sql
-- VALIDACAO
\set ON_ERROR_STOP on
BEGIN;
\i supabase/migrations/20261108a_aba_plano_ajustes.sql
\i supabase/migrations/20261108a_aba_plano_ajustes.sql
DO $test$
BEGIN
 ASSERT (SELECT submitted_by='a1000000-0000-4000-8000-000000000001'::UUID FROM public.aba_plan_versions WHERE id='f1000000-0000-4000-8000-000000000001');
 BEGIN
  UPDATE public.aba_plan_versions SET submitted_by=NULL WHERE id='f1000000-0000-4000-8000-000000000001';
  RAISE EXCEPTION 'CHECK aceitou remetente NULL';
 EXCEPTION WHEN check_violation THEN NULL; END;
 RAISE NOTICE 'OK backfill por autoria e CHECK com IS NOT NULL';
END $test$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',TRUE);
DO $test$
DECLARE p UUID := 'b1000000-0000-4000-8000-000000000001';
 id UUID := 'f1000000-0000-4000-8000-000000000002';
 event UUID := '91000000-0000-4000-8000-000000000003'; first UUID; replay UUID; payload JSONB; a JSONB; b JSONB;
BEGIN
 payload := jsonb_build_object('id',id,'revision',0,'client_event_id',event,
  'programs',jsonb_build_array(jsonb_build_object('program_id','e1000000-0000-4000-8000-000000000001','revision',1)),
  'summary','Resumo fictício novo','submitted_by','a1000000-0000-4000-8000-000000000003');
 first := public.aba_save_plan_draft(p,payload);
 a := public.aba_list_plan_versions(p)->0;
 replay := public.aba_save_plan_draft(p,payload);
 b := public.aba_list_plan_versions(p)->0;
 ASSERT first = id AND replay = first AND a=b;
 ASSERT b->>'submitted_by' IS NULL;
 BEGIN
  PERFORM public.aba_save_plan_draft(p,payload || jsonb_build_object('id',gen_random_uuid()));
  RAISE EXCEPTION 'Aceitou evento de outra versão';
 EXCEPTION WHEN unique_violation THEN
  ASSERT SQLERRM='Esta ação ou versão já foi registrada. Recarregue os planos e use um novo evento.';
 END;
 RAISE NOTICE 'OK rascunho: UUID repetido, sem revisão nova e 23505 em pt-BR';
END $test$;
SELECT set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}',TRUE);
DO $test$
DECLARE p UUID := 'b1000000-0000-4000-8000-000000000001'; id UUID := 'f1000000-0000-4000-8000-000000000002';
 event UUID := '91000000-0000-4000-8000-000000000004'; a JSONB; b JSONB; first TEXT; replay TEXT;
BEGIN
 BEGIN
  PERFORM public.aba_submit_plan(p,id,1,'91000000-0000-4000-8000-000000000002');
  RAISE EXCEPTION 'Envio aceitou evento de outra versão';
 EXCEPTION WHEN unique_violation THEN
  ASSERT SQLERRM='Esta ação ou versão já foi registrada. Recarregue os planos e use um novo evento.';
 END;
 first := public.aba_submit_plan(p,id,1,event)::TEXT;
 a := public.aba_list_plan_versions(p)->0;
 replay := public.aba_submit_plan(p,id,1,event)::TEXT;
 b := public.aba_list_plan_versions(p)->0;
 ASSERT first IS NOT DISTINCT FROM replay AND a=b;
 ASSERT b->>'submitted_by'='a1000000-0000-4000-8000-000000000002';
 ASSERT b->>'authored_by'='a1000000-0000-4000-8000-000000000001';
 BEGIN
  PERFORM public.aba_approve_plan(p,id,2,gen_random_uuid()); RAISE EXCEPTION 'Membro aprovou';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE NOTICE 'OK envio: auth.uid real, autoria distinta e replay VOID sem alterar carimbos';
END $test$;
SELECT set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',TRUE);
DO $test$
DECLARE p UUID := 'b1000000-0000-4000-8000-000000000001'; id UUID := 'f1000000-0000-4000-8000-000000000002';
 a JSONB; b JSONB; first TEXT; replay TEXT; event UUID := '91000000-0000-4000-8000-000000000005';
BEGIN
 BEGIN
  PERFORM public.aba_approve_plan(p,id,2,'91000000-0000-4000-8000-000000000002');
  RAISE EXCEPTION 'Aprovação aceitou evento de outra versão';
 EXCEPTION WHEN unique_violation THEN
  ASSERT SQLERRM='Esta ação ou versão já foi registrada. Recarregue os planos e use um novo evento.';
 END;
 ASSERT (public.aba_list_plan_versions(p)->0->>'status')='em_revisao';
 first := public.aba_approve_plan(p,id,2,event)::TEXT;
 a := public.aba_list_plan_versions(p)->0;
 replay := public.aba_approve_plan(p,id,2,event)::TEXT;
 b := public.aba_list_plan_versions(p)->0;
 ASSERT first IS NOT DISTINCT FROM replay AND a=b;
 BEGIN
  PERFORM public.aba_void_plan(p,id,3,'91000000-0000-4000-8000-000000000002','Motivo fictício suficiente');
  RAISE EXCEPTION 'Anulação aceitou evento de outra versão';
 EXCEPTION WHEN unique_violation THEN
  ASSERT SQLERRM='Esta ação ou versão já foi registrada. Recarregue os planos e use um novo evento.';
 END;
 ASSERT (public.aba_list_plan_versions(p)->0->>'status')='aprovado';
 event := '91000000-0000-4000-8000-000000000006';
 first := public.aba_void_plan(p,id,3,event,'Motivo fictício suficiente')::TEXT;
 a := public.aba_list_plan_versions(p)->0;
 replay := public.aba_void_plan(p,id,3,event,'Motivo fictício suficiente')::TEXT;
 b := public.aba_list_plan_versions(p)->0;
 ASSERT first IS NOT DISTINCT FROM replay AND a=b;
 ASSERT b->>'submitted_by'='a1000000-0000-4000-8000-000000000002';
 RAISE NOTICE 'OK aprovação/anulação: replay VOID, 23505 pt-BR e falhas atômicas';
END $test$;
SELECT set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}',TRUE);
DO $test$
BEGIN
 BEGIN PERFORM public.aba_list_plan_versions('b1000000-0000-4000-8000-000000000001'); RAISE EXCEPTION 'Outra clínica leu'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.aba_submit_plan('b1000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001',2,gen_random_uuid()); RAISE EXCEPTION 'Outra clínica enviou'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE NOTICE 'OK outra clínica: acesso negado';
END $test$;
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims','{"role":"anon"}',TRUE);
DO $test$
BEGIN
 BEGIN PERFORM public.aba_submit_plan('b1000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001',2,gen_random_uuid()); RAISE EXCEPTION 'Anon enviou'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE NOTICE 'OK anon: sem EXECUTE';
END $test$;
ROLLBACK;
```

Para enviar os dois blocos SQL via Docker sem montar a worktree no contêiner, pode-se usar o exemplo abaixo na raiz do repo. Ajustar o nome da cópia local para a do QA; SETUP é uma execução única numa cópia nova, com a 002 já aplicada. O segundo bloco pode ser repetido, pois reverte as chamadas e o DDL em ROLLBACK.

```python
# RUNNER_SQL
from pathlib import Path
import re, subprocess, sys
sys.stdout.reconfigure(encoding='utf-8')
text = Path('docs/team/handoff/ACUP-010.md').read_text(encoding='utf-8-sig')
blocks = re.findall(r'```sql\n([\s\S]*?)```', text)
for label, sql in zip(['SETUP', 'VALIDACAO'], blocks):
    sql = sql.replace(r'\i supabase/migrations/20261108a_aba_plano_ajustes.sql',
        Path('supabase/migrations/20261108a_aba_plano_ajustes.sql').read_text(encoding='utf-8'))
    result = subprocess.run(['docker', 'exec', '-i', 'acup-qa-pg', 'sh', '-c',
        'PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin -d acup_lk_010_20261108 -v ON_ERROR_STOP=1'],
        input=sql.encode('utf-8'), capture_output=True, timeout=60)
    print(label, 'exit', result.returncode)
    print(result.stdout.decode('utf-8'))
    print(result.stderr.decode('utf-8'))
    assert result.returncode == 0
```

### Duas sessões concorrentes (aprovar × inserir filho com FK de paciente)

Após o roteiro anterior terminar em ROLLBACK, o script Python abaixo aplica a 010 duas vezes com COMMIT **na cópia local**, mantendo as fixtures fictícias de setup visíveis. Depois, em cada cenário, a sessão A aprova e permanece aberta; somente após o marcador PRONTA a sessão B tenta inserir um reforçador pela RPC, com lock_timeout de 1 s. B e A terminam em ROLLBACK.

A prova tem controle negativo: na sessão A somente, recria temporariamente a função de aprovação original (FOR UPDATE), dentro da transação. B deve falhar por lock timeout. O ROLLBACK de A desfaz inclusive a recriação. Na segunda rodada, a RPC real da 010 (FOR NO KEY UPDATE) deve permitir B concluir **enquanto A continua idle in transaction**. A transação de A permanece aberta até essa condição ser conferida. Tudo é local; nenhuma mudança na função original persiste.

Executar na raiz do repo com Python. A cópia deve ter recebido o SETUP uma única vez. O script também confere que a aprovação voltou ao estado anterior e que nenhum reforçador fictício ficou gravado.

```python
# CONCORRENCIA
from pathlib import Path
import re, subprocess

command = ['docker', 'exec', '-i', 'acup-qa-pg', 'sh', '-c',
    'PGPASSWORD="$POSTGRES_PASSWORD" psql -X -qAt -U supabase_admin -d acup_lk_010_20261108 -v ON_ERROR_STOP=1']

def run(sql):
    return subprocess.run(command, input=sql.encode('utf-8'), capture_output=True, timeout=60)

def checked(sql):
    result = run(sql)
    assert result.returncode == 0, result.stderr.decode('utf-8', errors='replace')
    return result.stdout.decode('utf-8').strip()

migration = Path('supabase/migrations/20261108a_aba_plano_ajustes.sql').read_text(encoding='utf-8')
for attempt in range(2):
    checked('BEGIN;\n' + migration + '\nCOMMIT;')
    print('Migration com COMMIT, rodada', attempt + 1, 'OK')
old_source = Path('supabase/migrations/20261108_aba_plano_versionado.sql').read_text(encoding='utf-8')
old_approve = re.search(r'CREATE OR REPLACE FUNCTION public\.aba_approve_plan\([\s\S]*?\$aba_approve_plan\$;', old_source)[0]
claims_a = '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}'
claims_b = '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}'

for negative in [True, False]:
    label = 'acup010_A_antiga' if negative else 'acup010_A_nokey'
    session_a = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    prefix = "BEGIN; SET LOCAL idle_in_transaction_session_timeout='60s';\n"
    if negative:
        prefix += old_approve + '\n'
    prefix += f"SET LOCAL application_name='{label}'; SET LOCAL ROLE authenticated;\n"
    prefix += f"SELECT set_config('request.jwt.claims','{claims_a}',TRUE);\n"
    prefix += "SELECT public.aba_approve_plan('b1000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001',2,'91000000-0000-4000-8000-000000000010');\nSELECT 'PRONTA';\n"
    session_a.stdin.write(prefix.encode('utf-8'))
    session_a.stdin.flush()
    try:
        while True:
            line = session_a.stdout.readline()
            assert line, 'Sessão A encerrou antes de aprovar: ' + session_a.stderr.read().decode('utf-8', errors='replace')
            if line.strip() == b'PRONTA':
                break
        session_b = "BEGIN; SET LOCAL ROLE authenticated; SET LOCAL lock_timeout='1s';\n"
        session_b += f"SELECT set_config('request.jwt.claims','{claims_b}',TRUE);\n"
        session_b += "SELECT public.aba_save_reinforcer('b1000000-0000-4000-8000-000000000001','{\"id\":\"81000000-0000-4000-8000-000000000001\",\"name\":\"Reforçador fictício 010\",\"category\":\"atividade\",\"initial_preference\":\"alta\"}');\nROLLBACK;"
        result = run(session_b)
        if negative:
            assert result.returncode != 0 and 'lock timeout' in result.stderr.decode('utf-8', errors='replace'), result.stderr
            print('CONTROLE NEGATIVO: FOR UPDATE bloqueou o filho (lock timeout), como esperado')
        else:
            assert result.returncode == 0, result.stderr.decode('utf-8', errors='replace')
            print('NO KEY UPDATE: filho inserido e revertido antes de A encerrar, OK')
        active = checked(f"SELECT count(*) FROM pg_stat_activity WHERE application_name='{label}' AND state='idle in transaction';")
        assert active == '1', 'A precisa continuar aberta para a prova ser válida'
        print('Sessão A continua aberta durante a conclusão de B, OK')
    finally:
        stdout, stderr = session_a.communicate(input=b'ROLLBACK;\n', timeout=60)
        assert session_a.returncode == 0, stderr.decode('utf-8', errors='replace')
    assert checked("SELECT status FROM public.aba_plan_versions WHERE id='f1000000-0000-4000-8000-000000000001';") == 'em_revisao'
    assert checked("SELECT count(*) FROM public.aba_reinforcers WHERE id='81000000-0000-4000-8000-000000000001';") == '0'
print('OK: ambas as sessões revertidas; só fixtures de setup e schema local permanecem')
```
