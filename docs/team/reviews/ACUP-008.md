## ACUP-008 — revisão

- Veredito: **APROVADO**
- Commit revisado: `452d683` (codex/lk, base integracao `68a8aa0`). Branch de revisão: `qa/ACUP-008`.
- Gate: `npm run quality` verde: entrega do dev 1421 testes (1420 ok, 1 pulado); com meu teste 1422 (1421 ok, 1 pulado, 0 falhas). Lint e build ok.
- SQL: ok, validado de novo por mim no `acup-qa-pg` (Postgres local descartável; produção não tocada).
- Invariantes AGENTS.md: ok. Sem tela, então não há prints.
- Correções que eu fiz: só teste. Duas mutações passavam sem o teste notar (abaixo).

### Diff e regras
- O diff tem 6 arquivos, todos do escopo e das autorizações de 09/11. No `AGENTS.md` muda 1 linha, a do bullet ABA, que ganhou a regra da supervisão (SUP-1/2/3).
- Tabela: RLS ligada, `REVOKE ALL` para PUBLIC, anon e authenticated, sem policy. CHECK de ciclo de vida com `IS NOT NULL` explícito em cada ramo. Texto livre só em `*_encrypted`. Os índices são de `clinic_id`/`patient_id`, sem texto.
- RPCs: todas `SECURITY DEFINER SET search_path = pg_catalog`, começando por `aba_require_gate`, e com paciente também `aba_require_patient(…, TRUE)`. `GRANT EXECUTE` só para `authenticated`. Os auxiliares `aba_supervision_can_manage`/`aba_supervision_lock` não têm EXECUTE nem para `authenticated`.
- `clinic_id`, `supervisor_id`, `created_by`, `updated_by`, `signed_by` e `voided_by` vêm sempre do banco (`auth.uid()`). `held_on` é comparado com o dia de `America/Sao_Paulo`.
- **Diff textual da exclusão** (`admin_decide_patient_deletion`) contra `20261108b_aba_perfil_paciente.sql`: exatamente 3 trechos, que são a trava `PERFORM 1 FROM public.patients … FOR UPDATE` antes do snapshot, a linha `aba_supervision_records` no snapshot, e o UPDATE de anonimização (`patient_id`/pauta/decisões NULL, motivo genérico cifrado só em anulado, `revision + 1`). Nenhuma outra linha mudou.
- **Exceções fechadas** em `aba-invariants` e `patient-erasure`: valem só pelo nome `aba_supervision_records` e exigem snapshot + UPDATE (não ausência). Provei com uma tabela falsa `aba_fake_qa` com `patient_id`, só no snapshot e sem DELETE: os dois testes quebram com "aba_fake_qa: DELETE em 20261108d…".

### Validação SQL
Banco `acup_qa_008`, clone da base do QA com 011 + 006.

1. Migration **2 vezes, cada uma com COMMIT** (`psql -1`), sem erro.
2. Roteiro do handoff reexecutado: **12 NOTICEs OK**, ROLLBACK e `count(*) = 0` depois. Ele roda com `TimeZone = Pacific/Kiritimati`, o que prova que a data é a de São Paulo e não a do servidor.
3. Meus cenários (`docs/team/reviews/ACUP-008-validacao.sql`), transação única, ROLLBACK e `count(*) = 0`:
```
QA1 OK: supervisor grava só para membro ativo do próprio time e paciente que supervisiona; outro time, sem time, recepção, 0/601 min, pauta longa, amanhã (SP) e evento reaproveitado recusados em pt-BR
QA2 OK: supervisor de outro time não lê, não assina, não edita
QA3 OK: admin de outra clínica não lê, não assina, não anula
QA4 OK: terapeuta ABA sem vínculo não lê nada
QA5 OK: supervisionado não vê rascunho e não assina
QA6 OK: assina com replay; assinado não muda pauta nem data, não reassina, anular exige motivo de 10+, rascunho não se anula, CAS velho 40001
QA7 OK: supervisionado lê os 2 assinados (não o rascunho), total 90 min, ciência uma vez com replay
QA8 OK: supervisor não marca ciência no lugar do supervisionado
QA9 OK: anulado e rascunho fora da soma (60 min)
QA10 OK: fora do time vê data/horas e o registro sem paciente; pauta e paciente do registro com paciente ficam nulos
QA11 OK: quem registrou continua lendo o que registrou, mas não cria nem edita rascunho de quem saiu do time
QA12 INFO: paciente arquivado, admin lê o registro: content_restricted=false, agenda=Pauta com paciente A
QA12 INFO: anular com paciente arquivado -> 22023 Paciente arquivado não recebe escrita de supervisão.
QA13 OK: anon sem EXECUTE
```
4. **Concorrência em duas sessões**, num clone descartável (`acup_qa_008c`, apagado depois; fixtures em `ACUP-008-concorrencia-setup.sql`). Testei as três ordens:
   - (a) A exclusão segura a transação por 4 s e a criação de rascunho com o mesmo paciente entra no meio: a criação espera e recebe 42501 "Paciente indisponível.". Não sobra registro, e o snapshot fica com 0 supervisões.
   - (b) A criação segura a transação por 4 s e a exclusão entra no meio: a exclusão espera o COMMIT (10,24 s → 12,70 s; a criação fez COMMIT em 12,66 s). O registro novo entra no snapshot (1) e sai anonimizado (sem paciente, sem pauta, revision 2, 40 min preservados).
   - (c) A exclusão segura a transação e a edição de um rascunho já existente com o paciente entra no meio: a edição recebe 42501 "Paciente indisponível. Recarregue o registro." (revalidação em `aba_supervision_lock`). A pauta antiga não volta; o registro fica sem paciente e sem pauta, revision 2, 50 min.

### O teste morde
Fiz 28 mutações temporárias na migration, todas desfeitas, e a worktree ficou limpa. `aba-supervision-records` + `aba-invariants` + `patient-erasure` pegaram **28/28** depois do meu reforço; antes eram 26/28. As mutações cobrem: tabela `aba_*` nova sem DELETE (duas formas), DELETE de outra tabela sumindo, supervisão fora do snapshot, exclusão sem limpar pauta, motivo mantido, sem `revision+1`, supervisão apagada, sem trava do paciente, escrita sem revalidar paciente excluído, lock sem travar o paciente, time arquivado, membro que saiu, supervisionado lendo rascunho, conteúdo sempre liberado, total somando anulado, data futura, data em UTC, supervisor vindo do payload, qualquer um assinando, assinado editável, ciência duas vezes, ciência por outra pessoa, motivo curto, anular sem ter assinado, CHECK de anulado sem motivo, GRANT para anon e auxiliar exposto.

### Correção que eu fiz
- `aba-supervision-records.test.mjs`: um bloco do QA no fim. Ele cobre os dois furos: "assinado editável", porque a recusa de edição fora do rascunho não era conferida, e "GRANT para anon", porque nada barrava `GRANT … anon`. Agora o teste confere o REVOKE/GRANT exato das 5 RPCs e nenhum `GRANT` para anon/PUBLIC.

### Observações (não bloqueiam)
1. QA12: com o paciente arquivado (pedido de exclusão em curso), toda escrita no registro dele fica parada: assinar, anular e marcar ciência dão 22023 "Paciente arquivado não recebe escrita de supervisão.". A leitura funciona. Depois da exclusão o vínculo some e o registro volta a aceitar anulação e ciência; se o pedido for negado, o paciente sai do arquivo. Parece intencional (mesma regra do plano e do perfil). Fica registrado para a ACUP-013 explicar na tela ("Paciente arquivado: aguarde a decisão da exclusão").
2. Quem registrou continua lendo o que registrou, mesmo depois de deixar a supervisão do time (QA11). Segue o aceite ("quem registrou").
3. O banco guarda só o último evento de cada registro, como em todas as RPCs ABA desta rodada (cabeçalho e handoff dizem isso).
