## ACUP-003 — revisão
- Veredito: **APROVADO** (com uma correção do QA, abaixo)
- Branch revisada: `codex/lk` @ `26c3cfa` → `qa/ACUP-003`. A branch traz `6c589bc` (a cópia da ACUP-002 com +1 linha no handoff-002): inofensivo, confirmado.
- Gate: `cd frontend && npm run quality` **verde** (exit 0): security · lint · testes **1368 (1367 passaram, 1 ignorado, 0 falhas)** · build · bundle. Rodado já com a correção.
- SQL: não se aplica (sem `.sql`; diff só em `AbaPlan.jsx`, `AbaWorkspace.jsx` com só o registro da aba, `abaService.js` com só acréscimos, `aba.css` com só acréscimos, teste novo e handoff).
- Invariantes AGENTS.md: ok. Sem IA, sem `localStorage`, sem cor pessoal na impressão, `useDismiss` nas janelas, `HubBackButton nested`.

### Como validei
1. Leitura completa de `AbaPlan.jsx` e do diff de service/workspace/CSS, conferida contra o contrato da ACUP-002.
2. **Navegador de verdade, sem login e sem Supabase.** O harness da memória (`harness-telas-sem-login`) foi refeito na scratchpad do QA: um Vite com `src/lib/supabase.js` trocado por um cliente falso e só a tela `AbaPlan` montada. As 5 RPCs ficam num "banco" em memória com as mesmas regras e as mesmas mensagens da ACUP-002: evento repetido, CAS 40001, 22023 por estado e 42501 para quem não supervisiona. Os erros são injetados de propósito. O Chrome headless é dirigido por CDP (script Node, sem Playwright). Resultado: **50/50 verificações**. Nenhuma chamada saiu da máquina.
3. Impressão: `window.print` interceptado, folhas medidas no DOM, `printToPDF` e captura com `media: print` em A4.

### Aceite, item por item
1. **Lista e ações por estado:** ordem 5→1 e só o aprovado com `is-current`. Supervisão:
   - rascunho = Editar/enviar + Anular;
   - em revisão = Aprovar + Anular;
   - aprovado = Anular + Imprimir;
   - substituído e anulado = só Imprimir.

   O anulado mostra o motivo. O cartão traz Autoria, Envio para revisão, Aprovação e Aprovado em, e não aparece "enviado por" em lugar nenhum. "Nova versão" fica no topo.
2. **Rascunho:** "Nova versão" copia o vigente (programas `{program_id, revision}` congelados, resumo, data). Para programa que mudou, oferece "Usar revisão atual (4)" e não troca sozinho. Programa arquivado não aparece para escolher. Salvar novo manda `revision: 0`, evento UUID v4 e só `{program_id, revision}`. Enviar manda a `revision` do salvo (1) e **outro** evento. Enviar fica bloqueado até salvar, com aviso. Clique triplo em Salvar = **1** chamada (trava `lock`).
3. **Permissão:** usa `data.permissions.canSupervise`, a mesma fonte de Programas. O membro não vê Aprovar nem Anular em nenhum cartão, e `PlanConfirmation` só monta com `canSupervise`. A confirmação de aprovar diz que a anterior vira substituída. Anular o vigente avisa "fica sem plano vigente". Motivo curto: aviso na tela e **nenhuma** chamada ao banco. Nada de IA no texto da tela nem no código.
4. **Erros:** injetados no navegador: 40001 → "alterado por outra pessoa. Recarregue…"; 42501 → "não tem permissão"; 23505 com a mensagem **em inglês** do Postgres → "já foi registrada…"; 22023, PGRST202 (função ausente) e falha de rede → texto próprio. Em todos, nenhum código nem inglês na tela, e **o texto digitado foi preservado**.
5. **Impressão:** `PrintLetterhead` + `PrintFooter` + `paginateReportBody`. O resumo longo deu 5 folhas, com timbrado em todas. Os programas saem da **cópia congelada** ("Nome congelado rev3"), nunca do atual ("Nome atual rev4"/"Objetivo NOVO"). HTML no texto sai escapado. O anulado imprime "Anulado" e o motivo, nunca "vigente". `afterprint` desmonta as folhas. Na mídia de impressão o resultado é preto/cinza: o `filter: grayscale(1)` neutraliza os dois tons azulados do timbrado (`rgb(83,101,122)`, `rgb(31,41,55)`), conferido na captura.
6. **≤1024px:** em 360, 768 e 1024 px, lista e editor com `scrollWidth = clientWidth` e nenhum elemento passando da borda. "Voltar aos planos" visível. O editor vira painel de baixo no celular. Plural certo: "0 programas", "1 programa", "2 programas". No computador o "Voltar aos planos" também aparece dentro da janela, como nas outras telas com `HubBackButton nested` (Agenda, Escalas, Financeiro).
7. **Teste:** 9 testes do dev, cobrindo fonte, SSR, funções puras e RPC com mock. Mais 1 meu (abaixo).

Esc e clique fora com texto não salvo **perguntam** antes de descartar (`DismissPrompt`), e o texto continua lá.

### Correção que eu fiz (`fix(ACUP-003)`)
**Texto cortado no meio da palavra, na tela e no papel.** `TextParagraphs` partia o texto a cada 450 caracteres exatos (`/[\s\S]{1,450}/`), sem olhar palavra nem quebra de linha. Na captura da impressão saíram "…do plano. Res" | "umo longo…" e "Resumo lo" | "ngo". Num documento clínico, "Reduzir 50%" podia virar "Reduzir 5" num parágrafo e "0%" no seguinte, e a leitura muda. A correção (em `AbaPlan.jsx`, só essa função) corta só na quebra de linha da pessoa ou num espaço. Só uma palavra sem espaço maior que o limite se divide. Linha em branco continua ocupando espaço.

Teste de regressão em `aba-plan-screen.test.mjs`. Ele **falhou antes** ("juntando com espaço volta o texto original") e passa depois. Confere parágrafos ≤ 450, a junção com espaço igual ao original, a quebra de linha da pessoa e a palavra gigante sem perder caractere. Navegador de novo: 50/50, e a captura da impressão agora quebra entre palavras. CRLF mantido.

### Pendências (não bloqueiam)
1. **Sem "Como funciona" na aba.** `HELP_BY_TAB` aponta para `plano`, mas `ABA_HELP` (`data/screenHelp.js`) não tem esse tópico, e o botão some. O AGENTS §7 diz que a explicação da tela mora ali. `screenHelp.js` está fora dos arquivos da task. Sugiro task curta: o texto escrito pelos rótulos reais e depois `scripts/sync-assistant-help.mjs`.
2. **A mensagem pt-BR do banco no 22023 é trocada por texto genérico.** Exemplos: "Só o rascunho pode ser editado", "Paciente arquivado não recebe plano", "Cada programa entra uma única vez no plano". Todas as RAISE 22023 da ACUP-002 já são pt-BR, e mostrá-las ajudaria a pessoa. O aceite permite texto próprio, então não bloqueia.
3. **Ordem de publicação:** sem a migration `20261108` aplicada (função ausente, PGRST202), a aba mostra o texto genérico, não o aviso de migration. O humano precisa aplicar a `20261108` antes de publicar esta tela.
4. Repetir depois de falha de rede gera evento novo. Se a primeira chamada tinha entrado, a pessoa vê "alterado por outra pessoa". É seguro (CAS), só a mensagem confunde.
5. Programa da versão anterior que não está mais na lista aparece como "Programa da versão anterior · revisão N", sem nome. Dava para usar o nome de `program_snapshots`.
6. Depois de um conflito, "Recarregar planos" fica desabilitado com o editor aberto: é preciso fechar (com a pergunta de descartar) para recarregar.
