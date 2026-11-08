## ACUP-001 — entrega

- Branch/commits: `codex/lk`; commit desta entrega com mensagem `feat(ACUP-001): documenta e verifica invariantes ABA`. Base sincronizada por `git merge integracao` (fast-forward para `e9c6a40`, inclui `c072893`).
- O que mudou: somente o bullet da parte vigente da seção C da auditoria, inserido antes de "Use nomes claros", e cinco testes das invariantes ABA. Lista explícita dos seis auxiliares puros; presença e ausência de acesso a tabelas conferidas. Exceção de `service_role` restrita a `lib/supabaseConfig.js`; literais privilegiados continuam proibidos inclusive nesse arquivo.
- Arquivos: `AGENTS.md`, `frontend/tests/regression/aba-invariants.test.mjs` e este handoff.
- Comandos rodados e resultado:
  - `git merge integracao`: concluído. Rascunhos preexistentes preservados em `stash@{0}` (`ACUP-001-pre-merge`); documentos de outros donos mantidos na versão integrada, sem reaplicar cópias antigas.
  - Comparação automatizada de `AGENTS.md` com HEAD + bullet da proposta: passou, nenhuma outra linha alterada.
  - `node --test frontend/tests/regression/aba-invariants.test.mjs`: 5/5 passaram após restaurar a mutação.
  - `cd frontend; npm run lint`: passou (exit 0).
  - `cd frontend; npm test`: passou (exit 0), 1.350 testes, 1.349 aprovados, 1 ignorado, nenhuma falha (164,6 s).
  - `cd frontend; npm run build`: bloqueado por ausência de `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` nesta worktree. Para completar esse gate adicional, configurar as variáveis públicas na worktree de validação e repetir o build; nenhuma credencial foi copiada nem configuração alterada.
- Prova de regressão: alterado temporariamente apenas o primeiro `SET search_path = pg_catalog` para `SET search_path = public` em `20261101c_aba_qualidade.sql` (`aba_num`). O teste saiu com código 1, 4 passaram/1 falhou, mensagem `20261101c_aba_qualidade.sql: aba_num search_path`. Bytes originais restaurados em `finally`; nenhuma migration integra o diff.
- Como o QA verifica: comparar o bullet com a parte vigente da auditoria, executar o teste isolado e os comandos de aceite; conferir a descoberta da última `admin_decide_patient_deletion` em todas as migrations ordenadas por nome e a compatibilidade de regex com CRLF. `git diff integracao -- AGENTS.md` deve conter apenas uma linha adicionada.
- Riscos/limites: teste estático segue os formatos SQL atuais (bloco FOREACH de proteção, funções delimitadas por dólar); não substitui execução real de SQL nem auditoria de produção. Sem mudança de schema, permissões, runtime ou financeiro. A aprovação/review e integração final cabem ao QA/Orquestrador.
- Aviso: executado `node docs/team/aviso.mjs orquestrador ACUP-001-pronta-para-review`; barramento confirmou `ok orquestrador (Mirela, .claude:17640)`. Depois da confirmação, o Node encerrou com assertion `UV_HANDLE_CLOSING` (exit 1); entrega confirmada, sem repetir a mensagem.
