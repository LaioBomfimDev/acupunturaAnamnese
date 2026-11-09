## ACUP-008 — entrega para review

- Branch/base: `codex/lk`, merge autorizado de `integracao` (`68a8aa0`, fast-forward) antes da implementação. Commit de entrega: `feat(ACUP-008): registra supervisão formal com ciência e horas` (acompanha este handoff).
- Escopo: somente migration `20261108d_aba_supervisao_formal.sql`, teste novo `aba-supervision-records.test.mjs`, regra no bullet ABA do `AGENTS.md`, exceções fechadas autorizadas em `aba-invariants.test.mjs` e `patient-erasure.test.mjs`, este handoff. Sem tela/service/frontend de produto, financeiro, certificação ou produção. Tela ficou na ACUP-013; prints não se aplicam.
- Modelo: `aba_supervision_records`, tabela com RLS, sem policy nem acesso direto. Pauta, decisões e motivo só em BYTEA cifrado. Cinco RPCs públicas; auxiliares internas sem EXECUTE para `authenticated`, `anon` e PUBLIC. Clínica/atores/carimbos vêm do banco.
- Escrita: administração ou supervisão de time ativo em que o supervisionado da mesma clínica, ativo e profissional ABA tem matrícula ativa no time (`ended_at IS NULL`). Registro atribui `supervisor_id = auth.uid()` ao criador, imutável. Rascunho pode mudar; assinado não muda. Assina só o autor ou administração; anula só quem assinou ou administração, com motivo de 10–6000 caracteres. Duração inteira 1–600; data sem futuro em America/Sao_Paulo; pauta/decisões até 12000 caracteres cada. Com paciente, exige supervisão do paciente; escritas com paciente revalidam excluído/arquivado sob lock.
- CAS/eventos: criação revision 0, UUID do cliente, evento por ação, replay do último evento no mesmo registro sem gravar, antes do CAS. Ciência é a exceção deliberada à assinatura com revisão: lock, só o próprio supervisionado, só assinado, uma vez; incrementa revisão. Reaproveitar evento de assinatura como ciência é recusado. Eventos antigos não são histórico de idempotência permanente.
- SUP-3: administração lê todos da clínica; autor e supervisor atual do time leem os registros; supervisionado lê somente os próprios assinados/anulados. Metadados e minutos continuam visíveis depois de sair do time. Sem acesso clínico ao paciente, o servidor devolve `patient_id`, pauta, decisões e motivo como NULL e `content_restricted: true`, sem nome de paciente. Não devolve bytes cifrados para o cliente filtrar. Ciência só muda metadados e não concede acesso clínico.
- SUP-1/2: exclusão parte literalmente da função em `20261108b_aba_perfil_paciente.sql`. Somente cinco linhas novas: lock do paciente antes do snapshot, linha de snapshot da supervisão e três linhas do UPDATE de limpeza. Limpa vínculo/pauta/decisões, motivo de anulação vira `aba_encrypt('Motivo removido na exclusão do paciente.')`, sobe revisão e conserva evento, datas, atores, status, modalidade, formato, duração e ciência. Horas ficam; texto de editor antigo não volta com CAS antigo, e replay não regrava texto. Snapshot protegido conserva a cópia anterior, como na política de exclusão vigente.
- Locks: clínica `FOR NO KEY UPDATE` serializa eventos/criação; paciente `FOR NO KEY UPDATE` antes da linha do registro, com revalidação; registro `FOR UPDATE`. Exclusão usa `patients FOR UPDATE` antes do snapshot. Isso fecha a janela de criação de texto durante a exclusão. Não há lock global de toda a clínica na exclusão.
- Reversão: revogar EXECUTE das quatro RPCs de escrita, manter tabela, leitura e exclusão atualizada; reaplicar reativa. Não apagar horas nem restaurar exclusão anterior enquanto houver registro vinculado a paciente. Aplicação antiga continua funcionando: mudança aditiva, sem tela dependente nesta task.

### Autorizações complementares

- `60a2383`: exceção SUP-1 em `KEPT_ON_PURPOSE`; ciência sem `p_revision`, lock/revisão/replay; motivo genérico cifrado na exclusão.
- `f854be5`: exceção fechada só para supervisão em `aba-invariants`, mantendo DELETE obrigatório em todas as demais tabelas ABA.
- `714b6d9` (SUP-3): leitura histórica com conteúdo clínico/paciente restritos no servidor; exceção em `patient-erasure` exige snapshot + UPDATE somente para supervisão, sem mudar a regra de `KEPT_ON_PURPOSE` das demais tabelas.
- `b4d4643`: revisão sobe no expurgo para barrar reenvio antigo; evento/datas/atores/status/horas preservados.
- `31d5a06`: lock de `patients FOR UPDATE` antes do snapshot, escrita com lock/revalidação e prova concorrente com controle negativo.

### API para ACUP-013

Todas as RPCs passam pelo gate de conta/senha/MFA. Parâmetros UUID/BIGINT são os tipos SQL; o cliente gera UUID estável por registro e UUID de evento por ação. Nenhum retorno de escrita inclui texto clínico.

| RPC | Contrato |
|---|---|
| `aba_save_supervision_draft(p_record JSONB)` | Cria com `id`, `revision: 0`, `client_event_id`, `supervisee_id`, `held_on: AAAA-MM-DD`, `duration_minutes: 1..600`, `modality: individual/grupo`, `format: presencial/online`. `patient_id`, `agenda`, `decisions` opcionais/null. Na edição, campos omitidos preservam; null limpa paciente/texto. Receber metadados de clínica/ator no payload não os aceita como autoridade. Retorna `{id, revision, client_event_id}`. |
| `aba_sign_supervision(p_id UUID, p_revision BIGINT, p_client_event_id UUID)` | Rascunho → assinado; autor ou administração; carimbos no banco. Mesmo retorno de metadados. |
| `aba_ack_supervision(p_id UUID, p_client_event_id UUID)` | Só o próprio supervisionado, só assinado, uma vez; sem parâmetro de revisão por decisão explícita. Incrementa revisão. Repetir último evento da própria ciência devolve metadados iguais; novo evento após ciência ou ciência em anulado/rascunho recusa. |
| `aba_void_supervision(p_id UUID, p_revision BIGINT, p_reason TEXT, p_client_event_id UUID)` | Assinado → anulado; quem assinou ou administração. Motivo obrigatório com 10–6000 caracteres. Mesmo retorno de metadados. |
| `aba_list_supervisions(p_supervisee_id UUID DEFAULT NULL)` | `{records: [...], totals: [...]}`. Filtro opcional por supervisionado aplicado no servidor sobre o que o leitor pode ver. Sem registros: dois arrays vazios. |

`records` contém id, clínica, criador da supervisão (`supervisor_id`), supervisionado, data, minutos, modalidade/formato, status, revisão/evento e todos os carimbos. `agenda`, `decisions`, `void_reason` são textos decifrados ou NULL; `patient_id` é UUID ou NULL, sempre conforme SUP-3. `content_restricted: true` significa que vínculo e textos foram ocultados porque o leitor não acessa mais o paciente. Nenhum nome de paciente é devolvido.

`totals` contém `{supervisee_id, duration_minutes}` somente para supervisionados com minutos assinados entre os registros autorizados e filtrados. Rascunhos e anulados nunca somam. Ausência de entrada significa zero minutos assinados; a ACUP-013 converte minutos em horas sem arredondar cada registro antes de somar.

Depois de qualquer escrita, reler lista e metadados. Não fixar revisões: assinatura, ciência, anulação e expurgo podem incrementá-las. Após expurgo administrativo, o último evento permanece, mas a revisão já subiu; replay devolve os metadados atuais sem restaurar texto. A ACUP-013 deve impedir escrita repetida, manter texto em conflito e confirmar assinatura/anulação.

Erros: 42501 acesso, 40001 conflito/recarregar, 22023 validação/estado e 23505 evento reaproveitado; mensagens pt-BR sem ecoar pauta/decisões/motivo. Supervisão atual vem dos times, não de cargo novo em `profiles.role`. Para botões de assinar/anular, usar também autoria/assinatura reais e perfil de administração; banco segue autoridade.

### Validação executada — só cópias locais

- Cópia própria `acup_lk_008_20261109`, criada por template da minha `acup_lk_006_20261108` no container local `acup-qa-pg`. `acup_base`, bancos de outros donos e produção intocados. Migration final aplicada **duas vezes com COMMIT**, sem erro; reaplicação adicional com dados em transação preservou todas as linhas/carimbos por EXCEPT nas duas direções, terminando em ROLLBACK.
- Roteiro abaixo executado com `ON_ERROR_STOP=1`: **12 NOTICEs OK**, nenhum ASSERT falhou, ROLLBACK, zero registros persistidos. Inclui fuso Pacific/Kiritimati, aceitando hoje de São Paulo e recusando amanhã; supervisionado de outra clínica, sem ABA ou inativo barrado. Log `%TEMP%/acup-008-sql.log`; reaplicação `%TEMP%/acup-008-reapply.log`.
- Testes focados: 18/18, incluindo 8 novos. Gates completos: `cd frontend; npm run lint` exit 0; `npm test` exit 0 (1421 testes, 1420 aprovados, 1 pulado, zero falhas; 342341,4539 ms); `npm run build` exit 0 (3,60 s). Logs `%TEMP%/acup-008-lint.log`, `%TEMP%/acup-008-tests.log`, `%TEMP%/acup-008-build.log`. Build com avisos de import dinâmico também estático de `patientEvolutionService.js`, chunks acima de 500 kB e tempo dos plugins; não impediram a conclusão. `git diff --check` sem erros.
- Quatro mutações temporárias foram rejeitadas e desfeitas: retirar DELETE de `aba_patient_profiles` (prova de que a exceção SUP-1 não aceita outra tabela), não limpar pauta, retirar lock antes do snapshot, aceitar membro com `ended_at` preenchido. Logs `%TEMP%/acup-008-mutation-*.log`. A primeira derrubou `aba-invariants` e `patient-erasure`; a exceção continua literal e fechada só para `aba_supervision_records`.
- Concorrência positiva, duas sessões, `acup_lk_008_conc_pos2_20261109`: exclusão em 3550 ms; criação concorrente esperou 3123 ms e recebeu 42501 após revalidar o paciente excluído. Ficou 1 registro, 1 no snapshot, zero texto/vínculo residual.
- Controle negativo só em clone `acup_lk_008_conc_neg2_20261109`, retirando exclusivamente o lock antecipado da exclusão: criação entrou em 597 ms enquanto a exclusão estava pausada antes do INSERT do snapshot; ficaram 2 registros limpos, mas só 1 no snapshot. A prova detecta a criação fora do snapshot. Função original restaurada e trigger local de pausa removido ao terminar. Logs `%TEMP%/acup-008-concurrency.log` e `%TEMP%/acup-008-conc-positive.log`/`negative.log`.
- Falhas reais corrigidas durante o desenvolvimento: primeira aplicação abortou por nome de constraint igual ao CHECK automático de `status`; a constraint composta agora se chama `aba_supervision_records_lifecycle_check`, com regressão e regra no bullet ABA. Dois ensaios de geração de roteiro temporário falharam por escapes de JavaScript (`replace` interpretando `$` e `\set` perdendo a barra); corrigidos nos geradores, sem mudança na migration por esses erros. Somente as execuções bem-sucedidas acima são tratadas como prova.
- Sem tela: prints não se aplicam. Ruby/Rails não configurado: gates Ruby não se aplicam. QA precisa revisar e repetir a validação SQL; dev não aprova nem integra a própria entrega.

### Roteiro SQL local para o QA

Criar uma cópia local própria com as dependências da 006/011. Aplicar a migration duas vezes como proprietário local, cada vez dentro de BEGIN/COMMIT, com `psql -v ON_ERROR_STOP=1`. Não apontar os comandos a produção nem reutilizar banco de outro dono. Salvar o bloco SQL a seguir como `%TEMP%/acup-008-validation.sql` para a prova concorrente. Ele termina em ROLLBACK e confere zero registros; fixtures são inteiramente fictícias.

```sql
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL TimeZone = 'Pacific/Kiritimati';
INSERT INTO auth.users(id,email) SELECT ('a0080000-0000-4000-8000-'||lpad(n::TEXT,12,'0'))::UUID,
 'p'||n||'.008@example.invalid' FROM generate_series(1,8) n;
INSERT INTO public.clinics(id,name) VALUES
 ('c0080000-0000-4000-8000-000000000001','Clínica fictícia 008'),
 ('c0080000-0000-4000-8000-000000000002','Outra clínica fictícia 008');
INSERT INTO public.profiles(id,email,full_name,role,clinic_id,is_active,must_change_password,mfa_required,disciplines)
SELECT id,email,'Pessoa fictícia 008',CASE WHEN right(id::TEXT,1) IN ('4','6') THEN 'clinic_admin' ELSE 'therapist' END,
 CASE WHEN right(id::TEXT,1)='6' THEN 'c0080000-0000-4000-8000-000000000002'::UUID ELSE 'c0080000-0000-4000-8000-000000000001'::UUID END,
 right(id::TEXT,1)<>'8',FALSE,FALSE,CASE WHEN right(id::TEXT,1) IN ('4','7') THEN '{}'::TEXT[] ELSE ARRAY['aba']::TEXT[] END
FROM auth.users WHERE email LIKE '%.008@example.invalid'
ON CONFLICT ON CONSTRAINT profiles_pkey DO UPDATE SET clinic_id=EXCLUDED.clinic_id,role=EXCLUDED.role,is_active=EXCLUDED.is_active,
 must_change_password=FALSE,mfa_required=FALSE,disciplines=EXCLUDED.disciplines;
INSERT INTO public.aba_care_teams(id,clinic_id,name,supervisor_id,created_by) VALUES
 ('d0080000-0000-4000-8000-000000000001','c0080000-0000-4000-8000-000000000001','Time A fictício','a0080000-0000-4000-8000-000000000001','a0080000-0000-4000-8000-000000000004'),
 ('d0080000-0000-4000-8000-000000000002','c0080000-0000-4000-8000-000000000001','Time B fictício','a0080000-0000-4000-8000-000000000003','a0080000-0000-4000-8000-000000000004');
INSERT INTO public.aba_care_team_members(clinic_id,team_id,therapist_id,assigned_by) VALUES
 ('c0080000-0000-4000-8000-000000000001','d0080000-0000-4000-8000-000000000001','a0080000-0000-4000-8000-000000000002','a0080000-0000-4000-8000-000000000001');
INSERT INTO public.patients(id,clinic_id,therapist_id,name) VALUES
 ('b0080000-0000-4000-8000-000000000001','c0080000-0000-4000-8000-000000000001','a0080000-0000-4000-8000-000000000001','Paciente fictício A'),
 ('b0080000-0000-4000-8000-000000000002','c0080000-0000-4000-8000-000000000001','a0080000-0000-4000-8000-000000000003','Paciente fictício B');
INSERT INTO public.aba_patient_teams(clinic_id,team_id,patient_id,assigned_by) VALUES
 ('c0080000-0000-4000-8000-000000000001','d0080000-0000-4000-8000-000000000001','b0080000-0000-4000-8000-000000000001','a0080000-0000-4000-8000-000000000001'),
 ('c0080000-0000-4000-8000-000000000001','d0080000-0000-4000-8000-000000000002','b0080000-0000-4000-8000-000000000002','a0080000-0000-4000-8000-000000000003');
CREATE TEMP TABLE acup008_capture(name TEXT PRIMARY KEY,value JSONB);
GRANT ALL ON acup008_capture TO authenticated;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"a0080000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal2"}',TRUE);
DO $test$
DECLARE p JSONB; first JSONB; before JSONB; i INTEGER;
BEGIN
 p := jsonb_build_object('id','80080000-0000-4000-8000-000000000001','revision',0,'client_event_id','e0080000-0000-4000-8000-000000000001',
 'supervisee_id','a0080000-0000-4000-8000-000000000002','held_on',(clock_timestamp() AT TIME ZONE 'America/Sao_Paulo')::DATE,
 'duration_minutes',30,'modality','individual','format','online','agenda','Pauta geral fictícia',
 'clinic_id','c0080000-0000-4000-8000-000000000002','supervisor_id','a0080000-0000-4000-8000-000000000001');
 first := public.aba_save_supervision_draft(p); before := public.aba_list_supervisions();
 FOR i IN 6..8 LOOP
  BEGIN
   PERFORM public.aba_save_supervision_draft(p || jsonb_build_object('id',gen_random_uuid(),'client_event_id',gen_random_uuid(),
    'supervisee_id',('a0080000-0000-4000-8000-'||lpad(i::TEXT,12,'0'))::UUID));
   RAISE EXCEPTION 'Supervisionado de outra clínica, sem ABA ou inativo aceito';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 END LOOP;
 ASSERT first->>'revision'='1' AND public.aba_save_supervision_draft(p)=first AND public.aba_list_supervisions()=before;
 ASSERT before->'records'->0->>'supervisor_id'='a0080000-0000-4000-8000-000000000004';
 ASSERT before->'records'->0->>'clinic_id'='c0080000-0000-4000-8000-000000000001';
 ASSERT NOT (before->'records'->0 ? 'agenda_encrypted');
 RAISE NOTICE 'OK administração sem ABA cria; ator/clínica do banco; replay preserva metadados';
END $test$;
SELECT set_config('request.jwt.claims','{"sub":"a0080000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',TRUE);
DO $test$
DECLARE p JSONB; patch JSONB; before JSONB; i INTEGER;
BEGIN
 p := jsonb_build_object('supervisee_id','a0080000-0000-4000-8000-000000000002','patient_id','b0080000-0000-4000-8000-000000000001',
 'held_on',(clock_timestamp() AT TIME ZONE 'America/Sao_Paulo')::DATE,'duration_minutes',60,'modality','grupo','format','presencial',
 'agenda','Pauta de caso fictício','decisions','Decisões fictícias','revision',0);
 FOR i IN 2..4 LOOP
  PERFORM public.aba_save_supervision_draft(p || jsonb_build_object('id',('80080000-0000-4000-8000-'||lpad(i::TEXT,12,'0'))::UUID,
   'client_event_id',('e0080000-0000-4000-8000-'||lpad(i::TEXT,12,'0'))::UUID,'duration_minutes',CASE i WHEN 2 THEN 60 WHEN 3 THEN 20 ELSE 15 END));
 END LOOP;
 before := public.aba_list_supervisions(); ASSERT jsonb_array_length(before->'records')=4;
 FOR patch IN SELECT value FROM jsonb_array_elements(jsonb_build_array(
  jsonb_build_object('held_on',((clock_timestamp() AT TIME ZONE 'America/Sao_Paulo')::DATE+1)),
  '{"duration_minutes":0}'::JSONB,'{"duration_minutes":601}'::JSONB,'{"duration_minutes":1.5}'::JSONB,
  '{"modality":"fora"}'::JSONB,'{"format":"fora"}'::JSONB,'{"agenda":{}}'::JSONB)) LOOP
  BEGIN
   PERFORM public.aba_save_supervision_draft(p || patch || jsonb_build_object('id',gen_random_uuid(),'client_event_id',gen_random_uuid()));
   RAISE EXCEPTION 'Campo inválido aceito'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 END LOOP;
 BEGIN PERFORM public.aba_save_supervision_draft(p || '{"id":"80080000-0000-4000-8000-000000000002","client_event_id":"e0080000-0000-4000-8000-000000000009"}');
  RAISE EXCEPTION 'CAS velho aceito'; EXCEPTION WHEN serialization_failure THEN NULL; END;
 BEGIN PERFORM public.aba_save_supervision_draft(p || '{"id":"80080000-0000-4000-8000-000000000009","client_event_id":"e0080000-0000-4000-8000-000000000002"}');
  RAISE EXCEPTION 'Evento reutilizado aceito'; EXCEPTION WHEN unique_violation THEN ASSERT SQLERRM='Este evento já foi registrado em outra supervisão. Recarregue.'; END;
 BEGIN PERFORM public.aba_save_supervision_draft(p || jsonb_build_object('id',gen_random_uuid(),'client_event_id',gen_random_uuid(),'patient_id','b0080000-0000-4000-8000-000000000002'));
  RAISE EXCEPTION 'Paciente de outro time aceito'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 ASSERT public.aba_list_supervisions()=before;
 RAISE NOTICE 'OK supervisor cria; validações, data local, CAS, evento e paciente de outro time';
END $test$;
SELECT set_config('request.jwt.claims','{"sub":"a0080000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}',TRUE);
DO $test$ BEGIN
 ASSERT public.aba_list_supervisions()->'records'='[]'::JSONB;
 BEGIN PERFORM public.aba_ack_supervision('80080000-0000-4000-8000-000000000002',gen_random_uuid()); RAISE EXCEPTION 'Ciência em rascunho'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM public.aba_save_supervision_draft(jsonb_build_object('id',gen_random_uuid(),'revision',0,'client_event_id',gen_random_uuid(),'supervisee_id','a0080000-0000-4000-8000-000000000002'));
  RAISE EXCEPTION 'Membro gravou'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.aba_sign_supervision('80080000-0000-4000-8000-000000000002',1,gen_random_uuid()); RAISE EXCEPTION 'Membro assinou'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE NOTICE 'OK supervisionado não lê rascunho, não grava/assina, não marca ciência em rascunho';
END $test$;
SELECT set_config('request.jwt.claims','{"sub":"a0080000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}',TRUE);
DO $test$ BEGIN
 ASSERT public.aba_list_supervisions()->'records'='[]'::JSONB;
 BEGIN PERFORM public.aba_save_supervision_draft(jsonb_build_object('id',gen_random_uuid(),'revision',0,'client_event_id',gen_random_uuid(),'supervisee_id','a0080000-0000-4000-8000-000000000002'));
  RAISE EXCEPTION 'Supervisor de outro time gravou'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.aba_sign_supervision('80080000-0000-4000-8000-000000000002',1,gen_random_uuid()); RAISE EXCEPTION 'Supervisor de outro time assinou'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE NOTICE 'OK supervisor de outro time sem leitura/escrita/assinatura';
END $test$;
SELECT set_config('request.jwt.claims','{"sub":"a0080000-0000-4000-8000-000000000006","role":"authenticated","aal":"aal2"}',TRUE);
DO $test$ BEGIN
 ASSERT public.aba_list_supervisions()->'records'='[]'::JSONB;
 BEGIN PERFORM public.aba_sign_supervision('80080000-0000-4000-8000-000000000002',1,gen_random_uuid()); RAISE EXCEPTION 'Outra clínica assinou'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.aba_save_supervision_draft(jsonb_build_object('id',gen_random_uuid(),'revision',0,'client_event_id',gen_random_uuid(),'supervisee_id','a0080000-0000-4000-8000-000000000002'));
  RAISE EXCEPTION 'Outra clínica gravou'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE NOTICE 'OK outra clínica sem leitura/escrita';
END $test$;
SELECT set_config('request.jwt.claims','{"sub":"a0080000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',TRUE);
DO $test$
DECLARE first JSONB; before JSONB;
BEGIN
 first := public.aba_sign_supervision('80080000-0000-4000-8000-000000000002',1,'e0080000-0000-4000-8000-000000000012');
 before := public.aba_list_supervisions();
 ASSERT first->>'revision'='2' AND public.aba_sign_supervision('80080000-0000-4000-8000-000000000002',1,'e0080000-0000-4000-8000-000000000012')=first;
 ASSERT public.aba_list_supervisions()=before;
 BEGIN PERFORM public.aba_save_supervision_draft('{"id":"80080000-0000-4000-8000-000000000002","revision":2,"client_event_id":"e0080000-0000-4000-8000-000000000022","agenda":"Troca indevida"}');
  RAISE EXCEPTION 'Assinado editado'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM public.aba_ack_supervision('80080000-0000-4000-8000-000000000002',gen_random_uuid()); RAISE EXCEPTION 'Supervisor marcou ciência alheia'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM public.aba_sign_supervision('80080000-0000-4000-8000-000000000003',1,'e0080000-0000-4000-8000-000000000013');
 BEGIN PERFORM public.aba_void_supervision('80080000-0000-4000-8000-000000000003',2,'curto',gen_random_uuid()); RAISE EXCEPTION 'Anulou sem motivo'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 first := public.aba_void_supervision('80080000-0000-4000-8000-000000000003',2,'Motivo fictício de validação','e0080000-0000-4000-8000-000000000023');
 ASSERT public.aba_void_supervision('80080000-0000-4000-8000-000000000003',2,'','e0080000-0000-4000-8000-000000000023')=first;
 RAISE NOTICE 'OK assinatura/replay, imutabilidade, ciência só própria e anulação com motivo';
END $test$;
SELECT set_config('request.jwt.claims','{"sub":"a0080000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal2"}',TRUE);
SELECT public.aba_sign_supervision('80080000-0000-4000-8000-000000000001',1,'e0080000-0000-4000-8000-000000000011');
SELECT set_config('request.jwt.claims','{"sub":"a0080000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}',TRUE);
DO $test$
DECLARE before JSONB; first JSONB; r JSONB;
BEGIN
 before := public.aba_list_supervisions(); ASSERT jsonb_array_length(before->'records')=3;
 ASSERT before->'totals'->0->>'duration_minutes'='90';
 SELECT value INTO r FROM jsonb_array_elements(before->'records') WHERE value->>'id'='80080000-0000-4000-8000-000000000002';
 ASSERT r->>'agenda'='Pauta de caso fictício' AND r->>'content_restricted'='false';
 BEGIN PERFORM public.aba_ack_supervision('80080000-0000-4000-8000-000000000002','e0080000-0000-4000-8000-000000000012'); RAISE EXCEPTION 'Evento da assinatura reaproveitado como ciência'; EXCEPTION WHEN unique_violation THEN NULL; END;
 first := public.aba_ack_supervision('80080000-0000-4000-8000-000000000002','e0080000-0000-4000-8000-000000000032');
 before := public.aba_list_supervisions();
 ASSERT first->>'revision'='3' AND public.aba_ack_supervision('80080000-0000-4000-8000-000000000002','e0080000-0000-4000-8000-000000000032')=first;
 ASSERT public.aba_list_supervisions()=before;
 BEGIN PERFORM public.aba_ack_supervision('80080000-0000-4000-8000-000000000002',gen_random_uuid()); RAISE EXCEPTION 'Segunda ciência aceita'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM public.aba_ack_supervision('80080000-0000-4000-8000-000000000003',gen_random_uuid()); RAISE EXCEPTION 'Ciência em anulado aceita'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 RAISE NOTICE 'OK próprios assinados/anulados; total 90 minutos; ciência única/replay';
END $test$;
RESET ROLE;
UPDATE public.aba_care_team_members SET ended_at=clock_timestamp() WHERE therapist_id='a0080000-0000-4000-8000-000000000002';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"a0080000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}',TRUE);
DO $test$
DECLARE result JSONB; r JSONB;
BEGIN
 result := public.aba_list_supervisions(); ASSERT result->'totals'->0->>'duration_minutes'='90';
 SELECT value INTO r FROM jsonb_array_elements(result->'records') WHERE value->>'id'='80080000-0000-4000-8000-000000000002';
 ASSERT r->'patient_id'='null'::JSONB AND r->'agenda'='null'::JSONB AND r->'decisions'='null'::JSONB AND r->>'content_restricted'='true';
 ASSERT public.aba_list_supervisions('a0080000-0000-4000-8000-000000000001')->'records'='[]'::JSONB;
 RAISE NOTICE 'OK SUP-3: fora do time ainda vê horas, não paciente/pauta/decisões';
END $test$;
RESET ROLE;
UPDATE public.aba_care_team_members SET ended_at=NULL WHERE therapist_id='a0080000-0000-4000-8000-000000000002';
-- Captura metadados antes da exclusão para provar preservação.
INSERT INTO acup008_capture SELECT id::TEXT,to_jsonb(r) FROM public.aba_supervision_records r;
INSERT INTO public.patient_deletion_requests(id,patient_id,clinic_id,requested_by,reason) VALUES
 ('90080000-0000-4000-8000-000000000001','b0080000-0000-4000-8000-000000000001','c0080000-0000-4000-8000-000000000001','a0080000-0000-4000-8000-000000000004','Solicitação fictícia 008');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"a0080000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal2"}',TRUE);
SELECT public.admin_decide_patient_deletion('90080000-0000-4000-8000-000000000001','approved','Validação fictícia');
RESET ROLE;
DO $test$
DECLARE r public.aba_supervision_records%ROWTYPE; old JSONB; snap JSONB;
BEGIN
 FOR r IN SELECT * FROM public.aba_supervision_records WHERE id IN ('80080000-0000-4000-8000-000000000002','80080000-0000-4000-8000-000000000003','80080000-0000-4000-8000-000000000004') LOOP
  SELECT value INTO old FROM acup008_capture WHERE name=r.id::TEXT;
  ASSERT r.patient_id IS NULL AND r.agenda_encrypted IS NULL AND r.decisions_encrypted IS NULL;
  ASSERT r.revision=(old->>'revision')::BIGINT+1;
  ASSERT (to_jsonb(r)-ARRAY['patient_id','agenda_encrypted','decisions_encrypted','void_reason_encrypted','revision'])=(old-ARRAY['patient_id','agenda_encrypted','decisions_encrypted','void_reason_encrypted','revision']);
  IF r.status='anulado' THEN ASSERT public.aba_decrypt_text(r.void_reason_encrypted,public.get_clinical_encryption_key())='Motivo removido na exclusão do paciente.'; END IF;
 END LOOP;
 SELECT snapshot INTO snap FROM patient_erasure_backup.snapshots WHERE request_id='90080000-0000-4000-8000-000000000001';
 ASSERT jsonb_array_length(snap->'aba_supervision_records')=3;
 ASSERT (SELECT erased_at IS NOT NULL FROM public.patients WHERE id='b0080000-0000-4000-8000-000000000001');
 RAISE NOTICE 'OK SUP-1/2: snapshot, paciente/textos limpos, motivo genérico, revision sobe, horas/carimbos preservados';
END $test$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"a0080000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',TRUE);
DO $test$
DECLARE p JSONB; before JSONB;
BEGIN
 before := public.aba_list_supervisions();
 p := '{"id":"80080000-0000-4000-8000-000000000004","revision":1,"client_event_id":"e0080000-0000-4000-8000-000000000044","agenda":"Texto antigo que não pode voltar"}';
 BEGIN PERFORM public.aba_save_supervision_draft(p); RAISE EXCEPTION 'CAS velho após exclusão aceito'; EXCEPTION WHEN serialization_failure THEN NULL; END;
 PERFORM public.aba_save_supervision_draft(p || '{"client_event_id":"e0080000-0000-4000-8000-000000000004"}');
 ASSERT public.aba_list_supervisions()=before;
 ASSERT before->'totals'->0->>'duration_minutes'='90';
 RAISE NOTICE 'OK pós-exclusão: CAS antigo 40001, replay não restaura texto, total preservado';
END $test$;
RESET ROLE;
DO $test$ BEGIN
 ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid='public.aba_supervision_records'::regclass);
 ASSERT NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='aba_supervision_records');
 ASSERT NOT has_table_privilege('authenticated','public.aba_supervision_records','SELECT,INSERT,UPDATE,DELETE');
 ASSERT NOT has_table_privilege('anon','public.aba_supervision_records','SELECT,INSERT,UPDATE,DELETE');
 ASSERT NOT has_function_privilege('authenticated','public.aba_supervision_lock(uuid)','EXECUTE');
 RAISE NOTICE 'OK RLS fechada, privilégios diretos e auxiliares internos revogados';
END $test$;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims','{"role":"anon"}',TRUE);
DO $test$ BEGIN
 BEGIN PERFORM public.aba_list_supervisions(); RAISE EXCEPTION 'Anon leu'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.aba_save_supervision_draft('{}'); RAISE EXCEPTION 'Anon gravou'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.aba_sign_supervision(gen_random_uuid(),1,gen_random_uuid()); RAISE EXCEPTION 'Anon assinou'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.aba_ack_supervision(gen_random_uuid(),gen_random_uuid()); RAISE EXCEPTION 'Anon marcou ciência'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.aba_void_supervision(gen_random_uuid(),1,'Motivo fictício',gen_random_uuid()); RAISE EXCEPTION 'Anon anulou'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE NOTICE 'OK anon barrado nas cinco RPCs';
END $test$;
RESET ROLE;
ROLLBACK;
SELECT count(*) AS itens_persistidos FROM public.aba_supervision_records;

```

### Reprodução da concorrência com controle negativo

Salvar o JavaScript abaixo como `%TEMP%/acup-008-concurrency-qa.mjs` e rodar da raiz desta worktree. Ajustar `template` para uma cópia própria local com a migration já aplicada. O script cria dois clones novos, usa somente o Docker local e a senha interna do container sem mostrá-la. Pausa 3 segundos antes do INSERT do snapshot por um trigger temporário restrito aos clones; em duas sessões executa exclusão e criação de rascunho. Depois restaura a função original e remove o trigger. O controle negativo nunca modifica o arquivo da migration.

```js
// Só cópias locais desta task. Nunca lê credencial do host nem produção.
import { readFileSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const cwd = process.cwd();
const template = 'acup_lk_008_20261109'; // trocar por cópia própria do QA
if (!/^acup_(?:lk|qa)_008_[a-z0-9_]+$/.test(template)) throw Error('Somente cópia local própria da 008');
const stamp = Date.now();
const sql = readFileSync(cwd+'/supabase/migrations/20261108d_aba_supervisao_formal.sql','utf8');
const fixture = readFileSync(process.env.TEMP+'/acup-008-validation.sql','utf8').split('SET LOCAL ROLE authenticated;')[0];
const command = database => `PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -v VERBOSITY=verbose -At`;
function run(database, input) {
  const result = spawnSync('docker',['exec','-i','acup-qa-pg','sh','-c',command(database)],{ input, encoding:'utf8' });
  if(result.status) throw Error(result.stderr);
  return result.stdout.trim();
}
function session(database,input) {
  const start=Date.now(); const child=spawn('docker',['exec','-i','acup-qa-pg','sh','-c',command(database)]);
  let stdout='',stderr=''; child.stdout.on('data',data=>stdout+=data);child.stderr.on('data',data=>stderr+=data);
  child.stdin.end(input);return new Promise(resolve=>child.on('close',code=>resolve({code,stdout,stderr,ms:Date.now()-start})));
}
const claims = id => `SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims','{"sub":"a0080000-0000-4000-8000-00000000000${id}","role":"authenticated","aal":"aal2"}',TRUE);`;
const payload = id => `jsonb_build_object('id','80080000-0000-4000-8000-00000000000${id}','revision',0,'client_event_id','e0080000-0000-4000-8000-00000000000${id}',
 'supervisee_id','a0080000-0000-4000-8000-000000000002','patient_id','b0080000-0000-4000-8000-000000000001',
 'held_on',(clock_timestamp() AT TIME ZONE 'America/Sao_Paulo')::DATE,'duration_minutes',60,'modality','individual','format','online','agenda','Pauta fictícia concorrente')`;
for(const negative of [false,true]) {
  const database = 'acup_qa_008_conc_' + (negative ? 'neg_' : 'pos_') + stamp;
  run('postgres',`CREATE DATABASE ${database} TEMPLATE ${template};`);
  run(database,fixture+`
${claims(4)}
SELECT public.aba_save_supervision_draft(${payload(1)});
RESET ROLE;
INSERT INTO public.patient_deletion_requests(id,patient_id,clinic_id,requested_by,reason) VALUES
 ('90080000-0000-4000-8000-000000000001','b0080000-0000-4000-8000-000000000001','c0080000-0000-4000-8000-000000000001','a0080000-0000-4000-8000-000000000004','Pedido fictício de concorrência');
CREATE OR REPLACE FUNCTION public.acup008_pause_snapshot() RETURNS trigger LANGUAGE plpgsql AS $pause$ BEGIN PERFORM pg_sleep(3); RETURN NEW; END $pause$;
CREATE TRIGGER acup008_pause_snapshot BEFORE INSERT ON patient_erasure_backup.snapshots FOR EACH ROW EXECUTE FUNCTION public.acup008_pause_snapshot();
COMMIT;`);
  if(negative) {
    const deletion=sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.admin_decide_patient_deletion(')).replace('  PERFORM 1 FROM public.patients WHERE id=v_req.patient_id FOR UPDATE;','');
    run(database,deletion);
  }
  const a=session(database,`BEGIN; ${claims(4)} SELECT public.admin_decide_patient_deletion('90080000-0000-4000-8000-000000000001','approved','Validação fictícia concorrente'); COMMIT;`);
  await new Promise(resolve=>setTimeout(resolve,400));
  const b=session(database,`BEGIN; ${claims(1)} SELECT public.aba_save_supervision_draft(${payload(2)}); COMMIT;`);
  const [ar,br]=await Promise.all([a,b]);
  assert.equal(ar.code,0,ar.stderr);
  if(negative) assert.equal(br.code,0,br.stderr);
  else { assert.notEqual(br.code,0);assert.match(br.stderr,/42501/);assert.ok(br.ms>1500,JSON.stringify(br)); }
  const result=JSON.parse(run(database,`SELECT jsonb_build_object('records',(SELECT count(*) FROM public.aba_supervision_records),
 'snapshot_rows',(SELECT jsonb_array_length(snapshot->'aba_supervision_records') FROM patient_erasure_backup.snapshots WHERE request_id='90080000-0000-4000-8000-000000000001'),
 'pending_text',(SELECT count(*) FROM public.aba_supervision_records WHERE patient_id IS NOT NULL OR agenda_encrypted IS NOT NULL OR decisions_encrypted IS NOT NULL));`));
  assert.equal(result.pending_text,0);assert.equal(result.snapshot_rows,1);assert.equal(result.records,negative?2:1);
  console.log(negative?'OK controle negativo: SEM lock, criação entra durante snapshot, que não a captura':'OK concorrência: COM lock, escrita aguarda exclusão e recebe 42501; snapshot completo');
  console.log(JSON.stringify({database,a_ms:ar.ms,b_ms:br.ms,b_exit:br.code,...result}));
  writeFileSync(process.env.TEMP+'/acup-008-conc-'+(negative?'negative':'positive')+'.log',JSON.stringify({a:ar,b:br,result},null,2));
  // Controle negativo é somente local: restaura função e retira a pausa nas cópias.
  run(database,sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.admin_decide_patient_deletion(')));
  run(database,'DROP TRIGGER acup008_pause_snapshot ON patient_erasure_backup.snapshots; DROP FUNCTION public.acup008_pause_snapshot();');
}

```
