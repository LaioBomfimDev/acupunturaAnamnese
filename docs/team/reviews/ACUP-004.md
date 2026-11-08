## ACUP-004 — revisão
- Veredito: **APROVADO** (com uma correção do QA no teste, abaixo)
- Branch revisada: `codex/lk` @ `be47d50` (base `integracao` @ `9261bed`) → `qa/ACUP-004`.
- Gate: `cd frontend && npm run quality` **verde** (exit 0), já com a correção: security · lint · testes **1380 (1379 passaram, 1 ignorado, 0 falhas)** · build · bundle.
- SQL: ok, validado no `acup-qa-pg` (saídas abaixo). Produção não foi tocada, nem para leitura.
- Invariantes AGENTS.md: ok. Nenhum diagnóstico sugerido ou inferido.

### Base local
O `acup_base` foi atualizado para a `integracao` @ `9261bed`: a única migration nova desde a base anterior (`1bd98f8`) é a `20261108a`, aplicada no banco-mãe antes de refazer o modelo. Clone `acup_004`. A `20261108b` foi aplicada **2× com COMMIT** (`psql -1`), exit 0 e 0.

### Pontos pedidos
1. **Nada em claro** (conferido no banco com diagnóstico "F84.0 SECRETO…", fonte "Hospital QA SECRETO" e detalhes "DETALHE-SECRETO"):
   - colunas claras sem texto clínico; `bytea` sem o texto em claro;
   - **nenhuma coluna** de CID/diagnóstico/laudo/fonte/data além dos `*_encrypted`; só o índice da PK;
   - **nenhum** `RAISE NOTICE/LOG/INFO` nas RPCs;
   - **nenhuma mensagem de erro** ecoa conteúdo (verificado em todos os 30 cenários com erro);
   - o retorno de `aba_save_profile` é só `{patient_id, revision, client_event_id}`;
   - `aba_get_profile` não devolve as colunas cifradas, e quem não pode ler recebe 42501 antes de qualquer leitura (mensagem sem dado);
   - no snapshot da exclusão o perfil vai só cifrado (o texto de `s->'aba_patient_profiles'` não tem `SECRETO/F84/Hospital`).
2. **Listas fechadas:**
   - comunicação: repetida, fora da lista, com `null`, aninhada, como texto ou com 8 itens → 22023;
   - suporte: `4` e `null` → 22023;
   - CHECK direto como dono: repetido, 2 dimensões, `NULL` dentro e `NULL` nas colunas obrigatórias (`communication_mode`, `support_level`, ambas `NOT NULL`) → recusados;
   - as recusas não mudam a revisão;
   - laudo sem fonte, com data impossível (`2026-02-30`), com campo extra (`cid` solto) ou como texto solto → 22023.
3. **Quem lê e quem grava (D2):** grava supervisão e administração. **Membro do time barrado ao gravar** (42501), mas lê pela RPC (decifrado). Barrados ao ler e ao gravar: supervisor de outro time, administração de outra clínica, outra clínica, membro com troca de senha pendente, ex-membro, ABA da clínica sem time e `anon` (sem EXECUTE). Tabela sem leitura nem UPDATE direto.
4. **`updated_by = auth.uid()` e `clinic_id` do banco:** o payload tentou forjar `clinic_id`, `patient_id` e `updated_by`, e o banco gravou a clínica, o paciente e o ator reais. A administração atualizando trocou o `updated_by` para ela.
5. **CAS e replay:** CAS velho com evento novo → 40001; evento anterior já superado com revisão velha → 40001. Replay do último evento (até por outra pessoa autorizada) devolve **o mesmo objeto** e não muda conteúdo, revisão nem carimbos. Campos omitidos são preservados.
6. **Exclusão:** é `20261108_aba_plano_versionado.sql` + **só 2 linhas** (snapshot e DELETE de `aba_patient_profiles`), por `diff` textual. A `20261108b` passa a ser a versão de maior nome, e o `aba-invariants` acha ela. **Testada com paciente que tinha perfil, programa, plano aprovado (revisão + versão), atendimento e evolução:** tudo no snapshot, tudo removido, sem erro de FK, paciente anonimizado. O outro paciente da clínica ficou intacto.
7. **Catálogo:** as 2 RPCs `SECURITY DEFINER` + `search_path=pg_catalog`, EXECUTE só para `authenticated` (sem PUBLIC/anon); tabela com RLS, sem policy, sem privilégio direto.
8. **Bullet do AGENTS.md:** só acréscimo, e alinhado à D2 e à seção B2 da proposta: lê quem acessa, grava quem supervisiona, códigos fechados, diagnóstico só de laudo com fonte e data cifradas, "nunca sugere nem infere diagnóstico". O "replay não muda revisão nem carimbos" é o contrato da 010. Nenhuma regra nova.

### Testes e mutações (temporárias, bytes restaurados)
19 mutações contra `aba-invariants` e `aba-patient-profile`:
- invariantes (7): tabela fora do bloco de RLS, GRANT, policy, sem `search_path`, INVOKER, perfil fora do snapshot, perfil fora do DELETE;
- perfil (12): gravar com `FALSE`, `updated_by` do payload, coluna clara de CID (3 formas), detalhes sem cifra, CHECK aceitando repetição, suporte `4`, `RAISE NOTICE` com o laudo, replay depois do CAS, exclusão perdendo linha antiga.

**Antes da correção, 2 passavam:** as colunas claras `diagnosis_cid TEXT` e `cid10 TEXT`. Depois, **as 19 derrubam os testes**.

### Correção que eu fiz (`fix(ACUP-004)`, só em `aba-patient-profile.test.mjs`)
O teste proibia só colunas com o nome **exato** `diagnosis|cid|source|issued_on|details`. Uma coluna clara `diagnosis_cid TEXT` ou `cid10 TEXT` (ou um `ALTER TABLE … ADD COLUMN` numa migration futura) deixava o teste verde, e é exatamente o que o aceite proíbe. Acrescentei:
- **lista fechada** das colunas da tabela (as 10 de hoje), com conferência de que toda coluna foi reconhecida;
- proibição de `ALTER TABLE … aba_patient_profiles ADD` em qualquer migration.

Coluna nova no perfil passa a exigir mudar o teste de propósito. A asserção antiga continua. CRLF mantido, lint ok.

### Pendências (não bloqueiam)
1. `aba_save_profile` **não recusa paciente arquivado**; programa e plano recusam ("Paciente arquivado não recebe…"). É inconsistência pequena: decidir se o perfil segue a mesma regra.
2. A data do laudo (`issued_on`) pode ser **futura**. Recusar data depois de hoje evita erro de digitação, mas é regra nova: fica para o Orquestrador decidir.
3. O replay vale para qualquer pessoa que possa gravar (a administração repetindo o evento da supervisão recebe sucesso sem efeito). Segue o contrato da 010 e não é brecha (a pessoa já poderia gravar), mas a ACUP-005 deve gerar evento novo por clique.

### Saída 1 — roteiro do handoff, rodado por mim (`acup_004`, depois das 2 aplicações com COMMIT)
```
aplicação 1 (COMMIT) exit=0
aplicação 2 (COMMIT) exit=0
NOTICE:  OK supervisão: cria, decifra autorizado, clínica/ator reais, CAS e replay idêntico sem mudar carimbos
NOTICE:  OK validação: modos/suporte/laudo inválidos recusados em 22023, sem perda de conteúdo
NOTICE:  OK membro: lê pela RPC, não grava nem acessa tabela diretamente
NOTICE:  OK outra clínica: leitura e escrita barradas
NOTICE:  OK anon: sem EXECUTE nas duas RPCs
NOTICE:  OK armazenamento: cifra, CHECK real de unicidade/dimensões e RLS fechada
NOTICE:  OK administração: atualiza com CAS, preserva omitido, limpa null e replay não muda carimbos
NOTICE:  OK exclusão: perfil no snapshot cifrado e removido, evolução antes do atendimento e paciente anonimizado
ROLLBACK
perfis depois do ROLLBACK: 0
```

### Saída 2 — roteiro adversarial do QA (`acup_004`, uma transação, exit 0, 34 OK, 0 ERROR)
O roteiro (`qa_004.sql`) fica na scratchpad do QA.
```
NOTICE:  OK [membro do time NÃO grava] 42501 — Só a supervisão do time (ou a administração) pode fazer isto com este paciente.
NOTICE:  OK [membro: sem perfil ainda, leitura devolve NULL] 00000 
NOTICE:  OK [sup cria (payload tenta forjar clinic_id/patient_id/updated_by)] 00000 
NOTICE:  OK [supervisor de OUTRO time NÃO grava] 42501 — Só a supervisão do time (ou a administração) pode fazer isto com este paciente.
NOTICE:  OK [supervisor de OUTRO time NÃO lê] 42501 — Acesso negado: este paciente é atendido por outro time ABA.
NOTICE:  OK [admin de OUTRA clínica NÃO grava] 42501 — Só a supervisão do time (ou a administração) pode fazer isto com este paciente.
NOTICE:  OK [admin de OUTRA clínica NÃO lê] 42501 — Acesso negado: este paciente é atendido por outro time ABA.
NOTICE:  OK [outra clínica NÃO lê] 42501 — Acesso negado: este paciente é atendido por outro time ABA.
NOTICE:  OK [membro com troca de senha pendente NÃO lê] 42501 — Acesso negado: conclua a troca da senha temporária ou reative o usuário.
NOTICE:  OK [ex-membro NÃO lê] 42501 — Acesso negado: este paciente é atendido por outro time ABA.
NOTICE:  OK [ABA da clínica sem time NÃO lê] 42501 — Acesso negado: este paciente é atendido por outro time ABA.
NOTICE:  OK [membro NÃO lê a tabela direto] 42501 — permission denied for table aba_patient_profiles
NOTICE:  OK [membro NÃO faz UPDATE direto] 42501 — permission denied for table aba_patient_profiles
NOTICE:  OK [membro lê] decifrado pela RPC; clinic_id/patient_id/updated_by do banco, nunca do payload; sem colunas cifradas no retorno
NOTICE:  OK [replay do evento da sup (admin chamando): mesmo retorno, nada muda] 00000 
NOTICE:  OK [CAS velho com evento novo] 40001 — Perfil alterado por outra pessoa. Recarregue antes de salvar.
NOTICE:  OK [admin atualiza só suporte (omitidos preservados)] 00000 
NOTICE:  OK [evento ANTERIOR (já superado) com revisão velha] 40001 — Perfil alterado por outra pessoa. Recarregue antes de salvar.
NOTICE:  OK [comunicação repetida] 22023 — Perfil inválido: confira comunicação e nível de suporte.
NOTICE:  OK [comunicação com código fora da lista] 22023 — Perfil inválido: confira comunicação e nível de suporte.
NOTICE:  OK [comunicação com null] 22023 — Comunicação aceita somente os códigos previstos, sem repetição.
NOTICE:  OK [comunicação aninhada] 22023 — Comunicação aceita somente os códigos previstos, sem repetição.
NOTICE:  OK [comunicação como texto] 22023 — Comunicação precisa ser uma lista de códigos.
NOTICE:  OK [comunicação com 8 itens] 22023 — Comunicação aceita somente os códigos previstos, sem repetição.
NOTICE:  OK [suporte fora da lista (4)] 22023 — Perfil inválido: confira comunicação e nível de suporte.
NOTICE:  OK [suporte null (coluna obrigatória)] 22023 — Perfil inválido: confira comunicação e nível de suporte.
NOTICE:  OK [laudo sem fonte] 22023 — Laudo exige texto (até 6000 caracteres), fonte (até 1000) e data.
NOTICE:  OK [laudo com data impossível] 22023 — Data do laudo inválida.
NOTICE:  OK [laudo com campo extra (cid em claro?)] 22023 — Laudo exige texto (até 6000 caracteres), fonte (até 1000) e data.
NOTICE:  OK [laudo como texto solto (diagnóstico sem fonte)] 22023 — Diagnóstico deve vir de laudo, com texto, fonte e data.
NOTICE:  OK [detalhes acima de 12000] 22023 — Detalhes precisam ser texto de até 12000 caracteres.
NOTICE:  OK [CHECK direto] repetido, 2 dimensões, null dentro e NULL nas colunas obrigatórias: recusados; recusas não mexeram na revisão
NOTICE:  OK [nada em claro] colunas claras sem texto clínico, bytea cifrado, nenhuma coluna de CID/laudo/fonte, só o índice da PK, nenhum NOTICE/LOG nas RPCs; DEFINER+pg_catalog, só authenticated; RLS sem policy nem privilégio
NOTICE:  OK [exclusão] perfil+plano aprovado+revisão+programa+atendimento+evolução: tudo no snapshot (perfil só cifrado), tudo removido, sem erro de FK, paciente anonimizado
 depois do ROLLBACK: perfis QA = 0
```
