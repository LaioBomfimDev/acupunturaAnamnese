## ACUP-001 — revisão
- Veredito: **APROVADO** (com uma correção do QA no teste, abaixo)
- Branch revisada: `codex/lk` @ `2a7e0d7` (base `integracao` @ `e9c6a40`) → `qa/ACUP-001`
- Gate: `cd frontend && npm run quality` **verde** (exit 0): security · lint · testes **1350 (1349 passaram, 1 ignorado, 0 falhas)** · build · bundle. Rodado já com a correção do QA.
- SQL: não se aplica (a task não tem `.sql`; nenhuma migration foi alterada no diff).
- Invariantes AGENTS.md: ok.

### Critérios de aceite
1. **Bullet:** confere. O texto é idêntico, caractere por caractere, ao bloco "Parte vigente" da seção C de `docs/team/propostas/aba-auditoria-2026-11-08.md` (comparado por script). Inclui a exceção dos auxiliares puros, que já estava no texto da proposta. A parte "proposta" ficou de fora. `git diff --numstat integracao...HEAD -- AGENTS.md` = `1 0`: só uma linha acrescentada, antes de "Use nomes claros". Todos os nomes citados existem no código (`aba_require_gate`/`_patient`, `aba_can_access_patient`, `aba_can_supervise_patient`, `supervisor_id`, `aba_encrypt`, `program_snapshot`, `client_event_id`, `aba_correct_session`, `previous_encrypted`, `data/abaLibrary.js`, 5 testes `aba-*.test.mjs`). Nenhuma regra inventada.
2. **(a)–(e):** cobertos (mutações abaixo).
3. **CRLF e última exclusão:** confere. As migrations estão em CRLF no disco e o teste passa. Passa também com tudo convertido para LF (M9), e com LF ainda morde (M9b). A exclusão mais recente é procurada em **todas** as migrations, sem nome fixo: hoje cai em `20261103c_patient_notes.sql`, fora dos `*aba*` (M3/M3b falham citando esse arquivo).
4. **Prova do dev:** confere (a mutação de `search_path` em `aba_num` foi reproduzida em M1/M9b em outra função).

### Mutações (temporárias; bytes restaurados em `finally`; `git status` limpo depois de cada rodada)
Teste isolado: `node --test frontend/tests/regression/aba-invariants.test.mjs`. Base: exit 0.

| # | Mutação | Resultado | Mensagem |
|---|---|---|---|
| M1 | tira `SET search_path` de `aba_require_gate` (DEFINER) | falha | `aba_require_gate search_path` |
| M1b | `search_path = pg_catalog, public` | falha | idem |
| M2 | `aba_require_gate` DEFINER → INVOKER | falha | `aba_require_gate DEFINER` |
| M3 | tira `aba_callouts` do snapshot de `20261103c` | falha | `aba_callouts: snapshot em 20261103c_patient_notes.sql` |
| M3b | tira o DELETE de `aba_callouts` de `20261103c` | falha | `aba_callouts: DELETE em 20261103c…` |
| M4 | `CREATE POLICY … ON public.aba_programs` | falha | `20261101c_aba_qualidade.sql` |
| M5 | literal `sb_secret_…` em `frontend/src` | falha | `chave privilegiada literal` |
| M5b | JWT com `"role":"service_role"` em `src` | falha | `JWT privilegiado` |
| M5c | palavra `service_role` fora de `supabaseConfig.js` | falha | caminho do arquivo |
| M5d | `sb_secret_…` dentro de `lib/supabaseConfig.js` | falha | `chave privilegiada literal` |
| M6 | auxiliar puro `aba_num` lê `public.patients` | falha | `aba_num: auxiliar não acessa tabelas` |
| M7b | `aba_num` renomeado (e com DEFINER, para só a lista pegar) | falha | `aba_num: exceção ainda existe` |
| M8 | `aba_session_reviews` sai do FOREACH de proteção | falha | `bloco de proteção de aba_session_reviews` |
| M9 | migrations em LF, sem outra mudança | **passa** (correto) | — |
| M9b | LF + M1 | falha | `aba_require_gate search_path` |
| E1 | nova `CREATE OR REPLACE FUNCTION aba_evil()` **sem `public.`** e sem search_path | passava → **falha** após correção | `aba_evil search_path` |
| E2/E2b | `CREATE FUNCTION public.aba_evil()` (**sem OR REPLACE**) sem DEFINER | passava → **falha** | `aba_evil DEFINER` |
| E3 | tabela `aba_evil` com `patient_id`, sem RLS, `);` **indentado** | passava → **falha** | `bloco de proteção de aba_evil` + `snapshot` |
| E4 | idem com `);` na coluna 0 | falha (já falhava) | idem |
| E5 | versão **nova** de `admin_decide_patient_deletion` com `$function$ LANGUAGE plpgsql …;` (formato pg_dump), sem tabelas ABA | passava → **falha** | `aba_patient_teams: snapshot em 20261109_qa_tmp.sql` |
| E6 | `DISABLE ROW LEVEL SECURITY` + `GRANT SELECT` em `aba_programs` | passa | fora do critério (pendência 1) |

### Correções que eu fiz (`fix(ACUP-001)`, só em `aba-invariants.test.mjs`, CRLF mantido)
O critério 3 pede que o teste ache a versão mais recente da exclusão. Em E5, uma versão nova escrita no formato do pg_dump não era reconhecida: o teste conferia a versão anterior e passava verde. E1/E2/E3 eram fugas do mesmo tipo, em que o leitor não via a função ou a tabela e o teste não acusava nada. Mudanças:
- `functions()` aceita `CREATE FUNCTION` sem `OR REPLACE`, nome sem `public.` e cláusulas (`LANGUAGE`/`SECURITY`/`SET`) depois do `$tag$`. Essas cláusulas entram no "cabeçalho" conferido.
- O contador de funções declaradas usa a mesma forma ampla (qualquer schema). Se o leitor não reconhecer uma, o teste falha.
- Tabelas: o fechamento aceita `);` indentado, e há um contador de `CREATE TABLE … aba_*` por arquivo: se uma tabela não for lida, o teste falha.
- Exclusão: confere que a versão lida está no arquivo de maior nome que declara `admin_decide_patient_deletion`.

Nada mais do teste ou do bullet foi mudado. Nenhuma regra nova.

### Pendências para o dev / próximas tasks (não bloqueiam)
1. **E6:** o teste não pega `DISABLE ROW LEVEL SECURITY` nem `GRANT … ON public.aba_*` em migration posterior. Isso contraria "RLS ligada e `REVOKE ALL`" do bullet. Sugiro entrar na ACUP-002 (primeira com SQL ABA nova), se o Orquestrador quiser.
2. **Escopo por nome de arquivo:** tabela, função ou policy `aba_*` criada em migration cujo nome não contém `aba` não é conferida pelos testes (a)–(c). Segue o critério literal (`*aba*.sql`), mas as ACUP-002/004/006/008 já usam nomes `*_aba_*`. Se alguma recriar uma RPC ABA fora deles, o QA confere à mão.
3. **Rigidez conhecida:** `SET search_path TO pg_catalog` (sintaxe válida) e `search_path` com aspas reprovariam. O erro é falso, alto e seguro, não silencioso.
4. Handoff: o dev guardou rascunhos no `stash@{0}` (`ACUP-001-pre-merge`). O stash é compartilhado entre worktrees. Não mexi nele.

### Nota de ambiente
Para criar `qa/ACUP-001` foi preciso tirar da worktree do QA as cópias não versionadas de `docs/team/`, que bloqueavam o checkout. Elas estão guardadas na scratchpad do QA. Nenhum arquivo versionado foi afetado.
