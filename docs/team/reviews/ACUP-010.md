## ACUP-010 — revisão
- Veredito: **APROVADO** (com uma correção do QA num teste, abaixo)
- Branch revisada: `codex/lk` @ `8cd7a7d` (base `integracao` @ `1bd98f8`) → `qa/ACUP-010`.
- Gate: `cd frontend && npm run quality` **verde** (exit 0) duas vezes, antes e depois da minha correção: security · lint · testes **1374 (1373 passaram, 1 ignorado, 0 falhas)** · build · bundle.
- SQL: ok, validado no `acup-qa-pg` (saídas abaixo). Produção não foi tocada, nem para leitura.
- Invariantes AGENTS.md: ok. Exclusão de paciente **não** tocada.

### Base local
Container novo, preparação local e as 114 migrations de `integracao` @ `1bd98f8` (inclui a `20261108`), sem erro. Novo `acup_base`, com o plano da 002 e sem `submitted_by`. Clone `acup_010` para a validação.

### Pontos pedidos
1. **Diff textual das 4 RPCs recriadas** (extraídas e comparadas por `diff` com a `20261108`): cada uma = versão da 002 + só o pedido. As mudanças são `FOR UPDATE` → `FOR NO KEY UPDATE` na linha do paciente, `submitted_by = auth.uid()` só no `UPDATE` de `aba_submit_plan`, `RETURN;` explícito nas três VOID e o bloco `EXCEPTION WHEN unique_violation` → 23505 em pt-BR. `aba_list_plan_versions` não foi recriada: o `to_jsonb(plan)` já devolve a coluna nova. GRANT/REVOKE iguais.
2. **Exclusão de paciente:** 0 ocorrências de `admin_decide_patient_deletion` na migration. A versão mais recente continua em `20261108` (o `aba-invariants` confere). O snapshot `to_jsonb(x)` já leva `submitted_by`.
3. **`submitted_by`:**
   - `ADD COLUMN IF NOT EXISTS` com FK RESTRICT;
   - backfill (`authored_by` nos já enviados) **antes** do CHECK;
   - CHECK criado só se o nome não existe, **validado** (não `NOT VALID`) e único;
   - aplicada 2× com COMMIT no clone com dados (roteiro do dev), sem erro;
   - CHECK direto como dono: em revisão, aprovado, substituído e anulado-enviado **sem** remetente são recusados; rascunho **com** remetente é recusado; anulado nunca enviado é aceito;
   - o carimbo vem só de `auth.uid()`: a assinatura do envio não recebe remetente, `aba_save_plan_draft` não menciona `submitted_by` e o `submitted_by` mandado no payload é ignorado (roteiro do dev). O membro enviou um plano criado pela supervisão e ficou registrado o membro, não a autora.
4. **Replay:** o mesmo UUID e o mesmo VOID, com a lista **idêntica** antes e depois (revisão e carimbos), nas 4 escritas (roteiro do dev).
5. **23505:** evento de outra versão nas 4 escritas dá SQLSTATE **23505** com "Esta ação ou versão já foi registrada…", e os dados ficam intactos (status não muda). Conferi também que a mensagem não traz "duplicate/violates/constraint".
6. **Concorrência real, 2 sessões:**
   - roteiro do dev: **controle negativo** com a aprovação antiga (`FOR UPDATE`) recriada só na sessão A, e B (inserir reforçador) cai em lock timeout; com a 010, B conclui **enquanto A segue `idle in transaction`** (conferido em `pg_stat_activity`);
   - meu S1: **a fila entre RPCs de plano continua.** Duas aprovações simultâneas de planos diferentes: B esperou cerca de 2,6 s e só um ficou aprovado. `NO KEY UPDATE` segura outro `NO KEY UPDATE`;
   - meu S2: com um rascunho aberto, `INSERT` em `appointments` levou 663 ms, igual ao custo do `docker exec` sem trava nenhuma (578 a 1.203 ms), então **não espera**. O `UPDATE` do cadastro do paciente **ainda espera** (cerca de 2,6 s). É esperado e aceitável: transação curta via PostgREST.
7. **"Como funciona":** `ABA_HELP.plano` com as 5 seções fixas, escrito pelos rótulos reais ("Nova versão", "Salvar rascunho", "Enviar para revisão", "Aprovar", "Anular", "Ler versão", "Imprimir versão", "Usar revisão atual", "Enviado por", "Aprovado vigente"). Ele declara que o "Enviado por" antigo veio da autoria. `screen-help.test` e `clinic-assistant.test` (espelho igual) verdes. O botão já existia no workspace (`HELP_BY_TAB`) e agora aparece.
8. **Espelho:** rodei `node frontend/scripts/sync-assistant-help.mjs`, e o resultado é **idêntico** ao commitado, tirando o fim de linha (`git diff --ignore-cr-at-eol` vazio). Arquivo restaurado depois.
9. **Teste da 003:** a única expectativa antiga mudada é a inversão autorizada (`doesNotMatch(/enviado por|items|undefined/)` → exige `<dt>Enviado por</dt><dd>—</dd>` e continua proibindo `items|undefined`). O resto são acréscimos.
10. **22023 na tela:** `fail()` passa a anexar `code: '22023'` (mensagem igual, as outras abas não mudam). `planErrorMessage` mostra a mensagem do banco só quando começa por um dos prefixos das RAISE pt-BR do contrato; mensagem técnica em inglês continua escondida. No navegador (harness), o 22023 mostrou "Só o rascunho pode ser editado. Crie outra versão.", com o texto preservado.

### Navegador (harness sem login, Chrome headless via CDP)
Rodei de novo a suíte de 50 verificações da ACUP-003: 49 OK. A única falha é a verificação antiga que exigia **não** haver "Enviado por", que agora aparece de propósito. Em 360/768/1024 px continua sem rolagem lateral, e "Enviado por" mostra o nome ou traço.

### Mutações (temporárias, bytes restaurados)
9 mutações contra `aba-plan-versions`, `aba-plan-screen`, `screen-help` e `clinic-assistant`: tirar o carimbo, carimbar o autor, voltar `FOR UPDATE`, backfill depois do CHECK, CHECK sem `IS NOT NULL` nos enviados, 23505 virando P0001, ajuda sem a seção `notes`, ajuda mudada sem regenerar o espelho e cartão sem "Enviado por". **8 derrubavam o teste; 1 não** (a do CHECK), corrigida abaixo. Agora as 9 derrubam.

### Correção que eu fiz (`fix(ACUP-010)`, só em `aba-plan-versions.test.mjs`)
`/status IN ('em_revisao', 'aprovado', 'substituido')[\s\S]*?submitted_by IS NOT NULL/` é preguiçosa e casava com o `submitted_by IS NOT NULL` do ramo **anulado**. Tirar a exigência do ramo dos enviados (exatamente a regra do AGENTS §9) deixava o teste verde. Troquei por três asserções, uma por ramo do CHECK. A mutação Q5 agora derruba o teste. CRLF mantido, lint ok.

### Pendências (não bloqueiam)
1. **Cosmético no computador:** com o quinto campo, o grid de 4 colunas de `.aba-plan-meta` joga "Aprovado em" sozinho para a segunda linha. `aba.css` estava fora dos arquivos da task. Trocar para `repeat(5, minmax(0, 1fr))` acima de 1024px resolve.
2. **O `EXCEPTION WHEN unique_violation` cobre qualquer unicidade** (evento, número de versão, um aprovado por paciente) com a mesma frase. Hoje só o evento é alcançável (a numeração e o vigente são serializados pela trava), então a frase serve. Se um dia aparecer outra violação, a mensagem vai falar de "ação ou versão já registrada".
3. A lista de prefixos do 22023 em `planErrorMessage` precisa acompanhar as RAISE novas do plano: mensagem nova fora da lista cai no genérico (seguro, mas some o texto útil).

### Saída 1 — roteiro do handoff, rodado por mim (`acup_010`)
```
== SETUP exit 0
COMMIT
== VALIDACAO exit 0
NOTICE:  OK backfill por autoria e CHECK com IS NOT NULL
NOTICE:  OK rascunho: UUID repetido, sem revisão nova e 23505 em pt-BR
NOTICE:  OK envio: auth.uid real, autoria distinta e replay VOID sem alterar carimbos
NOTICE:  OK aprovação/anulação: replay VOID, 23505 pt-BR e falhas atômicas
NOTICE:  OK outra clínica: acesso negado
NOTICE:  OK anon: sem EXECUTE
ROLLBACK
=== CONCORRÊNCIA
Migration com COMMIT, rodada 1 OK
Migration com COMMIT, rodada 2 OK
CONTROLE NEGATIVO: FOR UPDATE bloqueou o filho (lock timeout), como esperado
Sessão A continua aberta durante a conclusão de B, OK
NO KEY UPDATE: filho inserido e revertido antes de A encerrar, OK
Sessão A continua aberta durante a conclusão de B, OK
OK: ambas as sessões revertidas; só fixtures de setup e schema local permanecem
```

### Saída 2 — checagens do QA (`acup_010`, transação com ROLLBACK)
```
NOTICE:  OK [catálogo] 5 RPCs DEFINER+pg_catalog, só authenticated, sem sobrecarga; CHECK validado e único; FK; RLS; coluna sem privilégio direto
NOTICE:  OK [CHECK remetente] em revisão/aprovado/substituído/anulado-enviado sem remetente: recusados; rascunho com remetente: recusado; anulado nunca enviado: aceito
NOTICE:  OK [carimbo] assinatura do envio sem remetente; só aba_submit_plan grava submitted_by = auth.uid(); rascunho ignora submitted_by do payload
NOTICE:  OK [23505] SQLSTATE preservado e mensagem pt-BR: Esta ação ou versão já foi registrada. Recarregue os planos e use um novo evento.
ROLLBACK
```

### Saída 3 — concorrência do QA (`acup_010`, 2 sessões)
```
S1 duas aprovações ao mesmo tempo: B esperou 2565ms → 1:substituido, 2:aprovado | aprovados=1
S2 rascunho aberto × INSERT appointments: 663ms (sem trava: 578/737/1203ms) → não espera
S2 rascunho aberto × UPDATE do cadastro: 2637ms → espera (NO KEY × NO KEY, esperado)
```
