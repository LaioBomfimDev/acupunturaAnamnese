## ACUP-006 — entrega para review

- Branch/base: `codex/lk`, merge de `integracao` (`4e0f088`) antes de começar. Commit de entrega: `feat(ACUP-006): adiciona biblioteca ABA da clínica` (este handoff acompanha o mesmo commit).
- Escopo: migration `20261108c_aba_biblioteca_clinica.sql`, teste `aba-library-items.test.mjs`, somente regra da biblioteca no bullet ABA do `AGENTS.md`, este handoff. Sem tela, catálogo alterado, exclusão de paciente ou financeiro.
- Confirmação: INFO do Orquestrador em 08/11/2026 21:37 (`d875bfb`): objetivo exige `content.title`, técnica `content.name`, conforme catálogo; regex da referência `^[a-z0-9][a-z0-9_-]{0,119}$`.
- Modelo: uma tabela sem vínculo com paciente; biblioteca contém modelos institucionais, nunca dados de pacientes. Catálogo do sistema continua em código. `content` JSONB é o modelo não clínico do B3, com chaves fechadas por tipo (inclusive `suggestedConfig`), tamanho total até 65536 bytes. Texto até 6000 caracteres; listas até 32 textos de 120; configuração textual até 1000; nível/ordem inteiros não negativos com até nove dígitos; `caution` aceita null. Campos opcionais não são inventados nem preenchidos automaticamente.
- Permissões: RPCs começam pelo gate clínico e leem a clínica do banco. Leitura para profissional ABA ou administração; escrita para administração ou supervisor de time ativo da mesma clínica. RLS ligada, sem policy/privilégios diretos. Administração pode operar sem disciplina ABA. Ator/carimbos são do banco.
- Integridade: referência única por clínica/tipo, formato fechado, tipo/referência imutáveis após criar (impede retirar referência e arquivar um item do sistema). Sistema só ativo/oculto; próprio pode arquivar. Não há DELETE. Um bloqueio `FOR NO KEY UPDATE` na clínica serializa criação e replay, sem bloquear a inserção de filhos pela chave estrangeira; depois bloqueia o item. Replay do último evento devolve os mesmos metadados, antes do CAS, sem alterar carimbos. Reutilização do evento noutro item ou referência duplicada dá 23505 em pt-BR.
- Reversão: revogar EXECUTE da escrita e conservar tabela/leitura, sem apagar dados; reaplicar reativa. A migration não exige a tela nova e não altera RPCs antigas.
- Validação SQL local: resultados da sessão anterior conferidos em `mesa/estado/lk.md` nesta retomada. Migration final aplicada duas vezes, cada aplicação com COMMIT, somente em `acup_lk_006_20261108`; roteiro abaixo concluído com nove NOTICEs `OK`, sem falha de ASSERT, ROLLBACK e zero itens persistidos. Os 161 modelos de `abaLibrary.js` também foram aceitos pela RPC autenticada; reaplicar a migration preservou todas as linhas e carimbos (EXCEPT nas duas direções), com ROLLBACK ao terminar. Template `acup_base` e produção intocados. SQL não reexecutado nesta retomada.

### Gates executados na retomada — 08/11/2026

- `cd frontend; npm run lint`: exit 0, sem erros.
- `cd frontend; npm test`: exit 0; 1400 testes, 1399 aprovados, 1 pulado, 0 falhas; duração 221803,9908 ms. Log local: `%TEMP%/acup-006-retomada-tests.log`.
- `cd frontend; npm run build`: exit 0; build concluído em 4,86 s. Avisos sobre import dinâmico também estático (`patientEvolutionService.js`), chunks acima de 500 kB e tempo dos plugins; não impediram o build. Log local: `%TEMP%/acup-006-retomada-build.log`.
- Diff conferido: somente os quatro arquivos do escopo, sem alteração adicional na migration ou no teste durante a retomada. `git diff --check` sem erros. Ruby/Rails não configurado (nenhum Gemfile/gemspec no repositório); gates Ruby não se aplicam.
- Sem tela nesta task; prints não se aplicam. Review independente do QA e integração permanecem com os respectivos donos; nenhuma publicação em produção.

### API para ACUP-007

- `aba_list_library() -> JSONB`: array `[]` se vazio, somente itens da clínica do usuário; inclui ativos, ocultos e arquivados para gestão e mesclagem. Cada item traz id, clinic_id, kind, system_key, content, status, revision, client_event_id e carimbos. O catálogo base não é copiado nem devolvido por esta RPC.
- `aba_save_library_item(p_item JSONB) -> JSONB`: `id` UUID estável escolhido pelo cliente, `revision` (0 cria) e UUID `client_event_id` novo por ação são obrigatórios. Criação exige kind e content; status omitido nasce ativo, system_key omitida/null é item próprio. Ajustes de sistema usam a referência estável que a 007 definir, dentro do formato fechado.
- Retorno de escrita só `{id, revision, client_event_id}`. Depois de salvar, reler a lista para carimbos/conteúdo normalizados. Replay do último evento **no mesmo id** devolve exatamente o mesmo retorno sem nova gravação, mesmo com CAS anterior; evento anterior com CAS velho = 40001. Não é histórico de todos os eventos.
- Na edição, content/status omitidos preservam o gravado. Content presente substitui o objeto inteiro, sem mesclagem implícita. kind e system_key não podem mudar. clinic_id/created_by/updated_by do payload não escolhem clínica/ator. title/name obrigatório e não vazio, demais campos opcionais seguem os tipos do catálogo.
- Erros: 42501 acesso, 40001 conflito (recarregar), 22023 validação pt-BR, 23505 referência/evento já registrado em pt-BR. Nenhum retorno/erro ecoa conteúdo. Modelos não autorizam aplicação de procedimento restrito: permanece a revisão nominal do programa.

### Roteiro SQL — somente cópia local, termina em ROLLBACK

Foi preparada `acup_lk_006_20261108` a partir da minha cópia local da 011 (template `acup_base` intocado). A migration final foi aplicada **duas vezes**, cada uma em transação terminada em COMMIT, como proprietário local. O bloco abaixo foi executado com `psql -v ON_ERROR_STOP=1` nessa cópia; fica como roteiro reproduzível para o QA, sem usar produção nem outro banco do time.

```sql
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id,email) VALUES
 ('a0060000-0000-4000-8000-000000000001','supervisao.006@example.invalid'),
 ('a0060000-0000-4000-8000-000000000002','membro.006@example.invalid'),
 ('a0060000-0000-4000-8000-000000000003','outra.006@example.invalid'),
 ('a0060000-0000-4000-8000-000000000004','admin.006@example.invalid'),
 ('a0060000-0000-4000-8000-000000000005','semaba.006@example.invalid');
INSERT INTO public.clinics(id,name) VALUES
 ('c0060000-0000-4000-8000-000000000001','Clínica fictícia 006'),
 ('c0060000-0000-4000-8000-000000000002','Outra clínica fictícia 006');
INSERT INTO public.profiles(id,email,full_name,role,clinic_id,is_active,must_change_password,mfa_required,disciplines)
SELECT id,email,'Profissional fictício',CASE WHEN right(id::TEXT,1) IN ('3','4') THEN 'clinic_admin' ELSE 'therapist' END,
 CASE WHEN right(id::TEXT,1)='3' THEN 'c0060000-0000-4000-8000-000000000002'::UUID ELSE 'c0060000-0000-4000-8000-000000000001'::UUID END,
 TRUE,FALSE,FALSE,CASE WHEN right(id::TEXT,1) IN ('4','5') THEN '{}'::TEXT[] ELSE ARRAY['aba']::TEXT[] END
 FROM auth.users WHERE email LIKE '%.006@example.invalid'
ON CONFLICT ON CONSTRAINT profiles_pkey DO UPDATE SET clinic_id=EXCLUDED.clinic_id,role=EXCLUDED.role,
 is_active=TRUE,must_change_password=FALSE,mfa_required=FALSE,disciplines=EXCLUDED.disciplines;
INSERT INTO public.aba_care_teams(id,clinic_id,name,supervisor_id,created_by) VALUES
 ('d0060000-0000-4000-8000-000000000001','c0060000-0000-4000-8000-000000000001','Time fictício 006',
 'a0060000-0000-4000-8000-000000000001','a0060000-0000-4000-8000-000000000004');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"a0060000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal2"}',TRUE);
DO $test$
DECLARE payload JSONB; first JSONB; before JSONB;
BEGIN
 ASSERT public.aba_list_library()='[]'::JSONB;
 payload := jsonb_build_object('id','b0060000-0000-4000-8000-000000000001','revision',0,
 'client_event_id','e0060000-0000-4000-8000-000000000001','kind','objetivo','system_key','comunicacao-1',
 'content',jsonb_build_object('title','Modelo fictício','level',1),'clinic_id','c0060000-0000-4000-8000-000000000002',
 'created_by','a0060000-0000-4000-8000-000000000003','updated_by','a0060000-0000-4000-8000-000000000003');
 first := public.aba_save_library_item(payload);
 before := public.aba_list_library();
 ASSERT first=jsonb_build_object('id','b0060000-0000-4000-8000-000000000001','revision',1,'client_event_id','e0060000-0000-4000-8000-000000000001');
 ASSERT public.aba_save_library_item(payload)=first AND public.aba_list_library()=before;
 ASSERT before->0->>'clinic_id'='c0060000-0000-4000-8000-000000000001';
 ASSERT before->0->>'created_by'='a0060000-0000-4000-8000-000000000004';
 ASSERT before->0->>'updated_by'='a0060000-0000-4000-8000-000000000004';
 ASSERT before->0->>'status'='ativo';
 RAISE NOTICE 'OK admin sem disciplina ABA: cria, lê, replay idêntico, clínica/ator reais';
END $test$;

SELECT set_config('request.jwt.claims','{"sub":"a0060000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',TRUE);
DO $test$
DECLARE base JSONB; patch JSONB; before JSONB; first JSONB;
BEGIN
 base := '{"id":"b0060000-0000-4000-8000-000000000001","revision":1,"client_event_id":"e0060000-0000-4000-8000-000000000002","status":"oculto","content":{"title":"Modelo ajustado"}}';
 first := public.aba_save_library_item(base);
 ASSERT first->>'revision'='2';
 before := public.aba_list_library();
 ASSERT before->0->>'status'='oculto' AND before->0->'content'->>'title'='Modelo ajustado';
 ASSERT before->0->>'created_by'='a0060000-0000-4000-8000-000000000004';
 ASSERT before->0->>'updated_by'='a0060000-0000-4000-8000-000000000001';
 ASSERT public.aba_save_library_item(base)=first AND public.aba_list_library()=before;
 base := base || jsonb_build_object('revision',2,'client_event_id',gen_random_uuid());
 FOR patch IN SELECT value FROM jsonb_array_elements('[
  {"status":"arquivado"},{"system_key":null,"status":"arquivado"},{"kind":"tecnica"},
  {"system_key":"outra"},{"status":null},{"content":null},{"content":[]},{"content":{}},
  {"content":{"title":"   "}},{"content":{"title":1}},
  {"content":{"title":"Modelo","patient_id":"indevido"}},
  {"content":{"title":"Modelo","level":null}},{"content":{"title":"Modelo","level":1.5}}
 ]'::JSONB) LOOP
  BEGIN
   PERFORM public.aba_save_library_item(base || patch); RAISE EXCEPTION 'Patch inválido aceito';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  ASSERT public.aba_list_library()=before;
 END LOOP;
 BEGIN
  PERFORM public.aba_save_library_item(base || jsonb_build_object('revision',1)); RAISE EXCEPTION 'CAS velho aceito';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 BEGIN
  PERFORM public.aba_save_library_item(base || '{"revision":0,"client_event_id":"e0060000-0000-4000-8000-000000000001"}');
  RAISE EXCEPTION 'Evento anterior com CAS velho aceito';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 ASSERT public.aba_list_library()=before;
 -- Mesmo system_key e kind é duplicado; mesmo evento em outro id também.
 BEGIN
  PERFORM public.aba_save_library_item(base || jsonb_build_object('id','b0060000-0000-4000-8000-000000000002','revision',0,'kind','objetivo','system_key','comunicacao-1'));
  RAISE EXCEPTION 'Referência duplicada aceita';
 EXCEPTION WHEN unique_violation THEN ASSERT SQLERRM='Esta referência do sistema ou este evento já foi registrado na biblioteca. Recarregue antes de continuar.'; END;
 BEGIN
  PERFORM public.aba_save_library_item(base || '{"id":"b0060000-0000-4000-8000-000000000002","revision":0,"kind":"objetivo","client_event_id":"e0060000-0000-4000-8000-000000000002"}');
  RAISE EXCEPTION 'Evento reutilizado noutro item aceito';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 FOR patch IN SELECT to_jsonb(value) FROM unnest(ARRAY['Maiuscula','com espaço','a.b','-inicio',repeat('x',121),'']) value LOOP
  BEGIN
   PERFORM public.aba_save_library_item(base || jsonb_build_object('id',gen_random_uuid(),'revision',0,'kind','objetivo','system_key',patch));
   RAISE EXCEPTION 'Referência inválida aceita';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 END LOOP;
 -- Mesmo system_key em outro kind é permitido. Técnica usa name, não title.
 PERFORM public.aba_save_library_item('{"id":"b0060000-0000-4000-8000-000000000002","revision":0,"client_event_id":"e0060000-0000-4000-8000-000000000003","kind":"tecnica","system_key":"comunicacao-1","content":{"name":"Técnica fictícia","restricted":false,"caution":null,"goals":["ensinar_nova"],"suggestedConfig":{"prompt_hierarchy":["independente"],"token_economy":true}}}');
 -- Item próprio pode ser arquivado; referência nula não participa da unicidade.
 PERFORM public.aba_save_library_item('{"id":"b0060000-0000-4000-8000-000000000003","revision":0,"client_event_id":"e0060000-0000-4000-8000-000000000004","kind":"objetivo","status":"arquivado","content":{"title":"Modelo próprio"}}');
 ASSERT jsonb_array_length(public.aba_list_library())=3;
 RAISE NOTICE 'OK supervisor ativo: ajusta/oculta, CAS/replay, imutabilidade, unicidade e arquivamento só próprio';
END $test$;

DO $test$
DECLARE payload JSONB; patch JSONB; before JSONB := public.aba_list_library();
BEGIN
 payload := '{"id":"b0060000-0000-4000-8000-000000000002","revision":1,"client_event_id":"e0060000-0000-4000-8000-000000000005"}';
 FOR patch IN SELECT value FROM jsonb_array_elements('[
  {"title":"chave de objetivo"},{"name":"Técnica","campoExtra":"não"},
  {"name":"Técnica","restricted":null},{"name":"Técnica","goals":{}},
  {"name":"Técnica","goals":[null]},{"name":"Técnica","sortOrder":-1},
  {"name":"Técnica","suggestedConfig":[]},
  {"name":"Técnica","suggestedConfig":{"campoExtra":"não"}},
  {"name":"Técnica","suggestedConfig":{"token_economy":"true"}},
  {"name":"Técnica","suggestedConfig":{"prompt_hierarchy":[{}]}},
  {"name":"Técnica","suggestedConfig":{"teaching_format":{}}}
 ]'::JSONB) LOOP
  BEGIN
   PERFORM public.aba_save_library_item(payload || jsonb_build_object('content',patch)); RAISE EXCEPTION 'Tipo inválido aceito';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 END LOOP;
 BEGIN
  PERFORM public.aba_save_library_item(payload || jsonb_build_object('content',jsonb_build_object('name',repeat('x',70000))));
  RAISE EXCEPTION 'Conteúdo excessivo aceito';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 ASSERT public.aba_list_library()=before;
 RAISE NOTICE 'OK conteúdo: tipos, chaves superiores/aninhadas e limites recusam sem mudar registros';
END $test$;

SELECT set_config('request.jwt.claims','{"sub":"a0060000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}',TRUE);
DO $test$ BEGIN
 ASSERT jsonb_array_length(public.aba_list_library())=3;
 BEGIN PERFORM public.aba_save_library_item('{}'); RAISE EXCEPTION 'Membro gravou'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM 1 FROM public.aba_library_items; RAISE EXCEPTION 'Leitura direta liberada'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE NOTICE 'OK terapeuta comum: lê por RPC; escrita e tabela direta barradas';
END $test$;

SELECT set_config('request.jwt.claims','{"sub":"a0060000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}',TRUE);
DO $test$ BEGIN
 ASSERT public.aba_list_library()='[]'::JSONB;
 BEGIN
  PERFORM public.aba_save_library_item('{"id":"b0060000-0000-4000-8000-000000000001","revision":2,"client_event_id":"e0060000-0000-4000-8000-000000000006","status":"ativo"}');
  RAISE EXCEPTION 'Outra clínica alterou item';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM public.aba_save_library_item('{"id":"b0060000-0000-4000-8000-000000000004","revision":0,"client_event_id":"e0060000-0000-4000-8000-000000000006","kind":"objetivo","system_key":"comunicacao-1","content":{"title":"Modelo de outra clínica"}}');
 ASSERT jsonb_array_length(public.aba_list_library())=1;
 RAISE NOTICE 'OK outra clínica: não vê/altera item alheio; referência pode existir na própria clínica';
END $test$;

SELECT set_config('request.jwt.claims','{"sub":"a0060000-0000-4000-8000-000000000005","role":"authenticated","aal":"aal2"}',TRUE);
DO $test$ BEGIN
 BEGIN PERFORM public.aba_list_library(); RAISE EXCEPTION 'Profissional sem ABA leu'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.aba_save_library_item('{}'); RAISE EXCEPTION 'Profissional sem ABA gravou'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE NOTICE 'OK profissional sem ABA barrado';
END $test$;

RESET ROLE;
UPDATE public.aba_care_teams SET archived_at=clock_timestamp() WHERE id='d0060000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"a0060000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',TRUE);
DO $test$ BEGIN
 ASSERT jsonb_array_length(public.aba_list_library())=3;
 BEGIN PERFORM public.aba_save_library_item('{}'); RAISE EXCEPTION 'Supervisor de time arquivado gravou'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE NOTICE 'OK supervisão de time arquivado perde escrita';
END $test$;
RESET ROLE;
DO $test$ BEGIN
 ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid='public.aba_library_items'::regclass);
 ASSERT NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='aba_library_items');
 ASSERT NOT has_table_privilege('authenticated','public.aba_library_items','SELECT,INSERT,UPDATE,DELETE');
 ASSERT NOT has_table_privilege('anon','public.aba_library_items','SELECT,INSERT,UPDATE,DELETE');
 RAISE NOTICE 'OK RLS e revogação de privilégios diretos';
END $test$;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims','{"role":"anon"}',TRUE);
DO $test$ BEGIN
 BEGIN PERFORM public.aba_list_library(); RAISE EXCEPTION 'Anon leu'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.aba_save_library_item('{}'); RAISE EXCEPTION 'Anon gravou'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE NOTICE 'OK anon sem EXECUTE nas duas RPCs';
END $test$;
RESET ROLE;
ROLLBACK;
```

Resultado registrado no estado da sessão anterior: nove NOTICEs `OK`, nenhum ASSERT falhou, ROLLBACK e zero itens de fixture persistidos. A validação adicional dos 161 modelos confirmou preservação dos registros e carimbos ao reaplicar a migration. Esta retomada conferiu o registro; não apresenta esses resultados como nova execução SQL nem como transcrição do terminal anterior.
