## ACUP-011 — revisão
- Veredito: **APROVADO** (sem correção minha; uma pendência de texto para o Orquestrador decidir, item 1 abaixo)
- Branch revisada: `codex/lk` @ `8d2701a` (base `integracao` @ `4bd3326`) → `qa/ACUP-011`.
- Gate: `cd frontend && npm run quality` **verde** (exit 0): security · lint · testes **1382 (1381 passaram, 1 ignorado, 0 falhas)** · build · bundle.
- SQL: ok, validado no `acup-qa-pg` (saídas abaixo). Produção não foi tocada.
- Invariantes AGENTS.md: ok.

### Base local
O `acup_base` foi atualizado para a `integracao` @ `4bd3326`: a única migration nova era a `20261108b`, aplicada no banco-mãe. Clone `acup_011`. A `20261108ba` foi aplicada **2× com COMMIT** (`psql -1`), exit 0 e 0.

### Pontos pedidos
1. **Diff textual:** `aba_save_profile` da `20261108ba` = `20261108b` + **só** os dois IFs (arquivado: 3 linhas; data futura: 3 linhas). Nenhuma outra função criada. GRANT/REVOKE iguais.
2. **Exclusão não recriada e leitura igual:** `md5(pg_get_functiondef)` de `aba_get_profile` e de `admin_decide_patient_deletion` **iguais** antes (`acup_base`) e depois (`acup_011`). Só `aba_save_profile` mudou.
3. **Arquivado = regra do plano:** bloco e mensagem **idênticos** aos de `aba_save_plan_draft` (`20261108a`), na **mesma posição**: depois da trava `FOR NO KEY UPDATE` do paciente e antes de ler o perfil e do replay. No banco: supervisão e membro **continuam lendo** o perfil do arquivado (como na 004). Atualizar, replay e criar perfil novo em arquivado → 22023, sem gravar nada. O plano do mesmo paciente recusa com a mesma mensagem.
4. **Data futura no dia de São Paulo:**
   - **virada do dia, com instantes fixos e a conexão em UTC:** 23h30 em SP (= 02h30 do dia seguinte em UTC) conta como o dia de SP; 00h10 SP já é o dia novo; 02h30 UTC ainda é o dia anterior em SP;
   - **com a conexão em UTC, Kiritimati (+14) e GMT+12 (−12):** o laudo com o dia de hoje em SP **passa** e o com o dia seguinte de SP **recusa** ("Data do laudo não pode ser futura.", 22023). A recusa não muda a revisão;
   - **controle negativo:** recriei na transação a mesma RPC trocando a expressão por `current_date`. Com a conexão em Kiritimati (agora 09/11, enquanto SP está em 08/11), a versão errada **aceita** o dia seguinte de SP, e a entregue recusa. O teste discrimina de verdade.
5. **Replay e CAS intactos** (roteiro do dev): hoje passa e o replay repete retorno, revisão e carimbos; CAS velho → 40001; CAS atual grava.
6. **Mutações** (10, temporárias, bytes restaurados): sem a regra de arquivado; mensagem diferente; regra depois do replay; sem a regra de data; `current_date`; `clock_timestamp()::DATE`; `>=` (hoje recusado); fuso UTC; recriar a exclusão; mexer no replay. **Todas derrubam o teste.** O teste reconstrói o corpo da 004 + os dois IFs e compara o texto inteiro.

### Pendências (não bloqueiam)
1. **A mensagem diz "plano" quando se salva o perfil.** "Paciente arquivado não recebe **plano**." foi copiada ao pé da letra, como o aceite pediu ("mesma regra e mensagem", "não inventar outra"). Mas o padrão do projeto é a mesma frase trocando só o objeto: "…não recebe programa novo." (programa), "…não recebe coleta nova." (coleta), "…não recebe plano." (plano). Na tela do perfil (ACUP-005), essa mensagem vai aparecer como está, e a tela do plano já mostra o 22023 do banco quando ele começa com "Paciente ". Quem salva o perfil vai ler "não recebe plano". **Recomendo** "Paciente arquivado não recebe perfil." (uma linha na RPC e uma no teste), numa correção curta ou junto da ACUP-005. Não mudei porque contraria o texto literal do aceite.
2. Ressalva do controle negativo: ele só discrimina enquanto Kiritimati e SP estão em dias diferentes (17 das 24 horas). Neste horário estavam (09/11 × 08/11). A checagem com instantes fixos (item 4) cobre a virada em qualquer horário.

### Saída 1 — roteiro do handoff, rodado por mim (`acup_011`, depois das 2 aplicações com COMMIT)
```
011 aplicação 1 (COMMIT) exit=0
011 aplicação 2 (COMMIT) exit=0
NOTICE:  OK hoje São Paulo passa e replay repete retorno/revisão/carimbos
NOTICE:  OK amanhã São Paulo recusa em 22023 pt-BR, mesmo com outro fuso na conexão
NOTICE:  OK CAS velho recusa 40001; CAS atual segue gravando
NOTICE:  OK arquivado: leitura preservada; criação, atualização e replay recusados com a regra literal do plano
ROLLBACK
```

### Saída 2 — checagens do QA (`acup_011`, duas transações, ambas em ROLLBACK, exit 0)
```
NOTICE:  OK [virada] 23h30 SP (=02h30 UTC do dia seguinte) conta como o dia de SP; 00h10 SP já é o dia novo; a conexão em UTC não interfere
NOTICE:  INFO dia agora em America/Sao_Paulo: 2026-11-08 (SP: 2026-11-08)
NOTICE:  INFO dia agora em UTC: 2026-11-08 (SP: 2026-11-08)
NOTICE:  INFO dia agora em Pacific/Kiritimati: 2026-11-09 (SP: 2026-11-08)
NOTICE:  INFO dia agora em Etc/GMT+12: 2026-11-08 (SP: 2026-11-08)
NOTICE:  OK [datas] com conexão em UTC, Kiritimati (+14) e GMT+12 (-12): hoje de SP passa, amanhã de SP recusa (22023 pt-BR) e a recusa não grava
NOTICE:  OK [controle negativo] versão com current_date ACEITA o dia seguinte de SP com conexão em Kiritimati — a versão entregue recusa (item 2)
NOTICE:  OK [arquivado] supervisão e membro leem; atualizar, replay e criar recusados (22023) sem gravar; mensagem idêntica à do plano ("Paciente arquivado não recebe plano.")
hashes acup_base × acup_011: aba_get_profile igual · admin_decide_patient_deletion igual · aba_save_profile diferente (esperado)
```
