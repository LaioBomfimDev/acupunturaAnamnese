## ACUP-002 — revisão
- Veredito: **APROVADO**
- Branch revisada: `codex/lk` @ `f65fa97` (base `fda5966`) → `qa/ACUP-002`. A ponta atual da `codex/lk` (`6c589bc`) difere de `f65fa97` só por 1 linha do handoff (o aviso ao Orquestrador): o código é o mesmo.
- Gate: `cd frontend && npm run quality` **verde** (exit 0): security · lint · testes **1358 (1357 passaram, 1 ignorado, 0 falhas)** · build · bundle.
- SQL: ok, validado no `acup-qa-pg` (saídas abaixo). Produção não foi tocada, nem para leitura.
- Invariantes AGENTS.md: ok.
- Correções que eu fiz: nenhuma. Não achei nada que impeça o aceite.

### Base local
Reconstruí do zero: container novo, preparação local e as 113 migrations de `integracao` @ `7f6e9c9` (inclui `cdef4c4`), em duas passadas, sem erro. `patients.observacoes` existe. Novo `acup_base`, e a `integracao` não difere de `fda5966` em `supabase/migrations`. Cada roteiro rodou num clone novo (`acup_002`, `acup_002_idem`, `acup_002_conc`).

### Os 8 pontos pedidos
1. **Exclusão:** `admin_decide_patient_deletion` (extraída e comparada por `diff` com a de `20261103c`) tem **só 4 linhas a mais**: 2 no snapshot e 2 DELETE. A ordem é `aba_plan_versions` → `aba_program_revisions` → `aba_programs`, filho antes do pai (o histórico aponta para o programa com RESTRICT). O snapshot vem antes de todo DELETE. GRANT/REVOKE iguais. Na prática, a exclusão roda com atendimento e evolução vinculados (roteiro do dev).
2. **Programas:** `aba_save_program` e `aba_update_program_status` comparadas por `diff` com a versão viva (`20261101b`): **só o INSERT em `aba_program_revisions`**, mesma assinatura, mesmo retorno (`aba_program_json`), mesmos GRANT/REVOKE. Nenhum outro ponto grava em `aba_programs` (fora os DELETE da exclusão), então "toda gravação de programa deixa revisão" vale de fato.
3. **RPCs (catálogo, Q1):** as 7 (5 novas e 2 recriadas) têm `prosecdef`, `proconfig = {search_path=pg_catalog}` e o gate do paciente como primeira coisa. `EXECUTE` só para `authenticated` (sem PUBLIC, sem anon), sem sobrecarga. As 2 tabelas têm RLS, nenhuma policy e nenhum privilégio para PUBLIC/anon/authenticated.
4. **Aprovado imutável, um por paciente:**
   - Contra o aprovado, 8 tentativas: editar com evento novo, editar com CAS velho, reenviar, aprovar de novo, evento antigo com revisão atual, evento antigo com revisão antiga (40001), replay do último evento por rascunho e replay pelo envio. Depois delas, o md5 de `programs` + `summary_encrypted` + data e a `revision` ficaram **idênticos**.
   - O programa editado depois (rev 4) não muda a leitura do plano, que mostra o congelado (v2).
   - Sem RPC, `UPDATE` direto como `authenticated` dá 42501.
   - **Concorrência real, com 2 sessões:** C1, aprovar X e Y ao mesmo tempo: Y espera cerca de 2,3 s pela trava do paciente e entra, X vira substituído, sempre 1 aprovado. C2, duas aprovações do mesmo Z com a mesma revisão: a segunda recebe 40001. C3, dois rascunhos simultâneos: version_no 4 e 5, sem colisão.
5. **Quem não aprova:** membro do time (e ele não lê nem escreve a tabela direto), supervisor de outro time da mesma clínica, administração de outra clínica, ABA da mesma clínica sem time, ex-membro (`ended_at`), membro com troca de senha pendente, `authenticated` sem `sub` e `anon` nas 7 RPCs: todos 42501. Referência a revisão de programa de outro paciente, inexistente ou com campo extra: 22023.
6. **Idempotência:** aplicada 2× na mesma transação (no roteiro do dev e no meu) **e** 2× em transações separadas com COMMIT (`acup_002_idem`, exit 0 e 0). A captura inicial de programa existente gera **1** linha (a revisão atual) e não duplica na segunda aplicação. O passado não é inventado.
7. **Texto livre cifrado:** resumo, motivo de anulação e notas de programa só como `bytea` cifrado: nenhum `SECRETO`/`NOTA-` aparece no bytea nem em coluna clara. O snapshot não leva `notes` nem autorização de procedimento restrito. `approval_statement` é uma frase fixa do banco, nunca texto do usuário.
8. **Inventado sem evidência na proposta** (nada contraria regra, mas o Orquestrador deve saber):
   - limites: até 200 programas, resumo de até 12.000 caracteres, motivo de anulação com no mínimo 10;
   - a frase fixa "Plano terapêutico conferido e aprovado pela supervisão responsável.";
   - rascunho vazio pode ser salvo, mas o envio exige programas e resumo;
   - anular vale para qualquer status menos `anulado` (inclusive rascunho e substituído, só pela supervisão);
   - trava da linha de `patients` com `FOR UPDATE` para serializar: é um padrão **novo**, nenhuma migration fazia isso antes (ver pendência 1);
   - `client_event_id` único por paciente.

### Testes e mutações
- `aba-invariants` (24 mutações, as mesmas da ACUP-001, com a exclusão agora em `20261108`): todas derrubam o teste, e LF sem mutação passa. A pendência da ACUP-001 (E6, DISABLE RLS + GRANT) **agora derruba**: "RLS não pode ser desligada" e "GRANT não pode liberar tabelas ABA".
- `aba-plan-versions` (10 mutações): todas derrubam o teste. As mutações: tirar a revisão de `update_program_status`, aprovar com `FALSE`, DELETE do histórico depois do programa, CHECK sem `approved_by`, carimbo pelo autor, índice sem `WHERE`, resumo sem cifra, exclusão perdendo linha antiga, leitura do programa vivo e mudança extra em `save_program`.
- Bullet do AGENTS.md: uma linha trocada (só o bullet ABA). O acréscimo é a parte "proposta" do plano ajustada à D1, e "Alertas lembram, nunca decidem" continua lá.

### Pendências (não bloqueiam; sugiro para a ACUP-003 ou uma correção curta)
1. **`FOR UPDATE` em `patients` trava mais do que precisa.** C4 medida: durante um rascunho, `INSERT` em `appointments` daquele paciente e `UPDATE` do cadastro esperaram cerca de 2,4 s, até o fim da transação. Via PostgREST cada RPC é uma transação curta, então o efeito é de milissegundos. Mesmo assim, `FOR NO KEY UPDATE` serializa as RPCs de plano do mesmo jeito sem segurar inserts com FK para o paciente. Troca de 4 linhas, se o Orquestrador quiser.
2. **Evento reaproveitado num plano novo** volta 23505 com a mensagem em inglês ("duplicate key value…"). A ACUP-003 precisa traduzir, ou a RPC passa a devolver 22023 em pt-BR.
3. **Replay do último evento é no-op em qualquer RPC:** chamar `aba_submit_plan` com o evento da aprovação devolve sucesso sem enviar nada. Segue o contrato ("cada ação usa outro evento"), mas a tela da ACUP-003 deve gerar evento novo por clique.
4. Mensagem do gate para `authenticated` sem `sub`: "conclua a troca da senha temporária…" (já existia, não é desta task).

### Saída 1 — roteiro do handoff, rodado por mim (`acup_002`, exit 0)
```
NOTICE:  OK supervisor: criar, editar e mudar fase gravam revisões 1, 2 e 3
NOTICE:  OK membro: rascunho/retry/CAS/envio/leitura; aprovação/anulação/escrita de programa/acesso direto negados
NOTICE:  OK outra clínica: cinco RPCs negadas (42501)
NOTICE:  OK anon: cinco RPCs sem EXECUTE (42501)
NOTICE:  OK supervisor: aprovação carimbada, snapshot histórico, aprovado imutável, cópia, substituição, CAS e anulação
NOTICE:  OK dados: 3 revisões, cifra, CHECK NULL, índice único, RLS sem policy/privilégios diretos
NOTICE:  OK administração: pode aprovar e o carimbo registra sua identidade
NOTICE:  OK exclusão: snapshot completo, filhos antes do programa, observações limpas e paciente anonimizado
ROLLBACK
```
Depois: `aba_plan_versions` não existe e o paciente fictício também não (0).

### Saída 2 — roteiro adversarial do QA (`acup_002`, uma transação, exit 0, 55 OK, 0 ERROR)
O roteiro (`qa_adversarial.sql`) fica na scratchpad do QA. Saída:
```
OK [Q2 captura] programa existente vira 1 revisão (=2), sem duplicar na 2ª aplicação; passado não inventado
OK [Q1 catálogo] 7 RPCs DEFINER + search_path=pg_catalog + gate primeiro; EXECUTE só authenticated (sem PUBLIC/anon); 2 tabelas RLS, sem policy, sem privilégio direto
OK [Q3 sup do T1 não cria programa no P2 (outro time)] 42501 — Só a supervisão do time (ou a administração) pode fazer isto com este paciente.
OK [Q4 membro cria rascunho A] 00000 
OK [Q3 cruzado: revisão de programa do P2 no plano do P1] 22023 — Programa ou revisão não pertence ao paciente.
OK [Q3 cruzado: campo extra na referência] 22023 — Referência de programa inválida.
OK [Q3 cruzado: revisão inexistente] 22023 — Programa ou revisão não pertence ao paciente.
OK [Q3 cruzado: plano do P1 chamado pelo P2 (membro não acessa P2)] 42501 — Acesso negado: este paciente é atendido por outro time ABA.
OK [Q5 membro envia A] 00000 
OK [Q5 membro NÃO aprova] 42501 — Só a supervisão do time (ou a administração) pode fazer isto com este paciente.
OK [Q5 membro NÃO anula] 42501 — Só a supervisão do time (ou a administração) pode fazer isto com este paciente.
OK [Q5 membro NÃO lê a tabela direto] 42501 — permission denied for table aba_plan_versions
OK [Q5 membro NÃO lê o histórico direto] 42501 — permission denied for table aba_program_revisions
OK [Q5 membro NÃO faz UPDATE direto] 42501 — permission denied for table aba_plan_versions
OK [Q5 membro com troca de senha pendente: gate barra leitura] 42501 — Acesso negado: conclua a troca da senha temporária ou reative o usuário.
OK [Q5 ex-membro (ended_at) não lê] 42501 — Acesso negado: este paciente é atendido por outro time ABA.
OK [Q5 ABA da mesma clínica sem time não lê] 42501 — Acesso negado: este paciente é atendido por outro time ABA.
OK [Q5 ABA da mesma clínica sem time não cria rascunho] 42501 — Acesso negado: este paciente é atendido por outro time ABA.
OK [Q5 supervisor de OUTRO time não aprova P1] 42501 — Só a supervisão do time (ou a administração) pode fazer isto com este paciente.
OK [Q5 administração de OUTRA clínica não aprova] 42501 — Só a supervisão do time (ou a administração) pode fazer isto com este paciente.
OK [Q5 administração de OUTRA clínica não lê] 42501 — Acesso negado: este paciente é atendido por outro time ABA.
OK [Q5 outra clínica não lê] 42501 — Acesso negado: este paciente é atendido por outro time ABA.
OK [Q5 authenticated sem sub (sem login) não lê] 42501 — Acesso negado: conclua a troca da senha temporária ou reative o usuário.
OK [Q5 anon: list] 42501 — permission denied for function aba_list_plan_versions
OK [Q5 anon: save_program (recriada)] 42501 — permission denied for function aba_save_program
OK [Q5 anon: update_program_status (recriada)] 42501 — permission denied for function aba_update_program_status
OK [Q4 sup aprova A] 00000 
OK [Q4 editar aprovado (evento novo, revisão atual)] 22023 — Só o rascunho pode ser editado. Crie outra versão.
OK [Q4 editar aprovado (CAS velho)] 22023 — Só o rascunho pode ser editado. Crie outra versão.
OK [Q4 reenviar aprovado] 22023 — Envie um rascunho com programas e resumo preenchidos.
OK [Q4 aprovar de novo o aprovado] 22023 — Só um plano enviado para revisão pode ser aprovado.
OK [Q4 evento ANTIGO (do envio) + revisão atual na aprovação] 22023 — Só um plano enviado para revisão pode ser aprovado.
OK [Q4 evento ANTIGO + revisão antiga] 40001 — Plano alterado por outra pessoa. Recarregue.
OK [Q4 reenvio do ÚLTIMO evento no rascunho (no-op silencioso)] 00000 
OK [Q4 reenvio do ÚLTIMO evento via submit (no-op silencioso)] 00000 
OK [Q4 programa editado depois (rev 4)] 00000 
OK [Q4] aprovado: conteúdo e revisão idênticos após 8 tentativas; leitura mostra o programa congelado (v2), não o editado (rev 4)
OK [Q4 evento do aprovado reaproveitado num plano novo] 23505 — duplicate key value violates unique constraint "aba_plan_versions_patient_event_key"
OK [Q4b membro cria B (copia o aprovado)] 00000 
OK [Q4b membro cria C vazio, depois preenche] 00000 
OK [Q4b envio de rascunho vazio recusado] 22023 — Envie um rascunho com programas e resumo preenchidos.
OK [Q4b preenche C] 00000 
OK [Q4b programa repetido recusado] 22023 — Cada programa entra uma única vez no plano.
OK [Q4b envia B] 00000 
OK [Q4b envia C] 00000 
OK [Q4b aprova C] 00000 
OK [Q4b aprova B (C vira substituído)] 00000 
OK [Q4b substituído não volta a aprovado] 22023 — Só um plano enviado para revisão pode ser aprovado.
OK [Q4b anular sem motivo suficiente] 22023 — Anular exige plano não anulado e motivo de ao menos 10 caracteres.
OK [Q4b anular o aprovado com motivo] 00000 
OK [Q4b anulado não se edita] 22023 — Só o rascunho pode ser editado. Crie outra versão.
OK [Q4b anulado não se anula de novo] 22023 — Anular exige plano não anulado e motivo de ao menos 10 caracteres.
OK [Q4b] A→substituído, C aprovado→substituído por B, B anulado; nunca 2 aprovados; carimbos com auth.uid(); B copiou A
OK [Q7] resumo, motivo e notas só cifrados; snapshot sem notas/autorização; approval_statement é a frase fixa do banco (não texto do usuário)
OK [Q8 CHECK] aprovado sem carimbo, em revisão sem envio, anulado sem motivo e rascunho carimbado: todos recusados
ROLLBACK
 depois do ROLLBACK: pacientes QA = 0
 depois do ROLLBACK: tabela plano existe? false
```

### Saída 3 — idempotência com COMMIT (`acup_002_idem`)
```
aplicação 1 exit=0
aplicação 2 exit=0
2 tabelas aba_plan/revisions; 5 funções de plano; 1 índice único
```

### Saída 4 — concorrência, 2 sessões (`acup_002_conc`, fixtures commitadas só nesse clone local)
```
C1 aprovar X e Y ao mesmo tempo: B (Y) esperou 2343ms, exit 0 → 1:substituido, 2:aprovado, 3:em_revisao | aprovados=1
C2 aprovar Z duas vezes com a mesma revisão: B esperou 2420ms → ERROR: Plano alterado por outra pessoa. Recarregue. | aprovados=1
C3 dois rascunhos novos ao mesmo tempo: B esperou 2402ms, sem erro → version_no 4 e 5
C4 durante um rascunho: INSERT appointments esperou 2377ms; UPDATE patients esperou 2385ms (pendência 1)
```
