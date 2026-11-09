## ACUP-006 — revisão

- Veredito: **APROVADO**
- Commit revisado: `47b1cc9` (codex/lk, base integracao `4e0f088`). Branch de revisão: `qa/ACUP-006`.
- Gate: `npm run quality` verde: invariantes de segurança, lint, testes 1400 (1399 ok, 1 pulado, 0 falhas), build ok.
- SQL: ok, validado de novo por mim no `acup-qa-pg` (o dev não reexecutou o roteiro na retomada).
- Invariantes AGENTS.md: ok. Sem tela, então não há prints.
- Correções que eu fiz: nenhuma no código. Só acrescentei este review e `ACUP-006-validacao.sql` (meus cenários, reproduzíveis).

### Escopo e diff
- O diff contra a integracao tem 4 arquivos: a migration `20261108c`, o teste novo, o handoff e o `AGENTS.md`. No `AGENTS.md` muda só a linha do bullet ABA (1 −/1 +), que ganhou a frase da biblioteca. Não há regra além da D3.
- A tabela não tem `patient_id` nem coluna de paciente (conferido no catálogo do banco). `admin_decide_patient_deletion` não foi recriada.
- Não há `DELETE`, `DROP`, policy nem gatilho. RLS está ligada, com `REVOKE ALL` para PUBLIC, anon e authenticated. As 2 RPCs são `SECURITY DEFINER SET search_path = pg_catalog`, começam por `aba_require_gate()` e têm `GRANT EXECUTE` só para `authenticated`.
- `clinic_id` vem sempre de `user_clinic_id(v_uid)`. O `clinic_id`, o `created_by` e o `updated_by` do payload são ignorados (provado no banco). Os carimbos usam `auth.uid()`.
- `content`: as chaves permitidas são exatamente as de `abaLibrary.js`. Conferi por script: objetivo tem 9 chaves e técnica tem 12, os tipos batem, e `suggestedConfig` tem 9 chaves. O obrigatório é `title` em objetivo e `name` em técnica. Limites: 65536 bytes no total, 6000 caracteres por texto, 1000 por valor de configuração, listas de até 32 itens de até 120 caracteres. No catálogo, o maior item tem 840 bytes e o maior texto tem 273 caracteres, ou seja, os limites deixam folga.
- `system_key`: formato fechado `^[a-z0-9][a-z0-9_-]{0,119}$`, índice único parcial por (clinic_id, kind). O tipo e a referência não mudam depois de criados. Item do sistema só fica ativo ou oculto, com dupla trava (CHECK da tabela e RPC).

### Validação SQL (Postgres local descartável, produção não tocada)
Banco `acup_qa_006`, clone de `acup_base` + `20261108ba` (a base do QA ainda não tinha a 011).

1. Migration aplicada **2 vezes, cada uma com COMMIT** (`psql -1`), sem erro. Na segunda vez ela só pula a tabela e o índice, que já existiam.
2. Roteiro do handoff reexecutado: 9 NOTICEs `OK`, nenhum ASSERT falhou, ROLLBACK, `count(*) = 0` depois.
3. Meus cenários (`docs/team/reviews/ACUP-006-validacao.sql`), em transação única com ROLLBACK e `count(*) = 0` depois:
```
QA1 OK: 161 modelos do abaLibrary.js aceitos e devolvidos idênticos
QA2 OK: membro de time ativo (não supervisor) lê e é barrado ao gravar, 42501 pt-BR
QA3 OK: recepção com disciplina aba barrada ao ler e gravar
QA4 OK: admin inativo barrado pelo gate
QA5 OK: supervisor com troca de senha pendente barrado pelo gate
QA6 OK: supervisor de time de outra clínica não grava na clínica do próprio perfil
QA7 OK: replay com payload diferente devolve o mesmo e não grava; omitidos preservam; sistema não arquiva nem perde/troca referência; tipos e limites; clinic_id do payload ignorado
QA8 OK: outra clínica não vê, não faz replay nem escreve item alheio
QA9 INFO: evento antigo de outro item -> aceito
QA10 OK: sem gatilho, DEFINER + search_path nas 2 RPCs, anon sem EXECUTE, nenhuma coluna de paciente
```
4. Concorrência em duas sessões, num clone descartável (`acup_qa_006c`, apagado depois):
   - A grava e segura a transação por 6 s. Enquanto isso, B insere um paciente da mesma clínica (FK em `clinics`) **sem esperar**, porque `FOR NO KEY UPDATE` não bloqueia filhos.
   - B tenta criar o mesmo id com outro evento e revision 0: **espera o COMMIT de A** e recebe `40001` "Item alterado por outra pessoa. Recarregue antes de salvar.".
   - Replay do evento de A: devolve o mesmo `{id, revision 1, client_event_id}`.
   - `UPDATE clinics` durante uma escrita da biblioteca espera a transação terminar (deu lock_timeout de 1 s no teste). É o esperado do NO KEY UPDATE, e a escrita é curta (ver nota 4).

### O teste morde
Fiz 14 mutações temporárias na migration (todas desfeitas, worktree limpa). `aba-library-items` + `aba-invariants` falharam em **14/14**: time arquivado contando, sistema arquivável (RPC e CHECK), chave inventada, `clinic_id` vindo do payload, `FOR UPDATE` na clínica, replay depois do CAS, `system_key` mutável, sem limite de tamanho, leitura liberada, `DELETE`, `patient_id`, 23505 em inglês e `GRANT` para anon.

### Notas (não bloqueiam)
1. **Para a ACUP-007, sobre técnica restrita:** um ajuste da clínica sobre uma técnica do sistema pode gravar `restricted: false`. O banco não conhece o catálogo em código e por isso não tem como impedir. A mesclagem da 007 precisa manter o `restricted` do sistema (sistema OU ajuste), sem nunca desmarcar. Sugiro pôr isso no aceite da 007.
2. **Para a ACUP-007, sobre a chave dos objetivos:** os objetivos de `abaLibrary.js` não têm chave estável (as técnicas têm `code`). A 007 precisa definir a `system_key` de cada objetivo de um jeito que não mude quando o arquivo for reordenado. Usar o índice no array não serve. No meu teste usei `obj-<índice>` só para validar.
3. QA9: o banco guarda só o último evento de cada item. Um evento antigo, já substituído, pode ser aceito em outro item. É o mesmo padrão documentado da 004/010 ("não é histórico de todos os eventos") e é inofensivo com UUID novo por ação.
4. O lock por clínica serializa as escritas da biblioteca e faz esperar quem atualiza a linha de `clinics` (Configurar agenda, Personalizar) enquanto uma escrita estiver aberta. São milissegundos na prática. Fica só registrado.
