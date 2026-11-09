## ACUP-014 — revisão

- Veredito: **APROVADO**, com correção minha (campo "Código" tirado da tela)
- Commit revisado: `7a7ce58` (codex/lk, base integracao `cfa9047`). Branch de revisão: `qa/ACUP-014`.
- Gate: `npm run quality` verde: entrega do dev com 1437 testes (1436 ok, 1 pulado); com as minhas correções, 1439 (1438 ok, 1 pulado, 0 falhas). Lint e build ok.
- **PROD-2:** nenhum dos 6 SQL em produção mudou (`git diff --stat cfa9047...7a7ce58 -- supabase/migrations` vazio).
- SQL: não se aplica. Invariantes AGENTS.md: ok depois da correção 1.

### Conferido no navegador
Harness de telas sem login + Chrome por CDP, dados fictícios.

1. **Editor de técnica.**
   - Categoria, Objetivos e Funções do comportamento são seletores com os rótulos de Programas.
   - Na Configuração sugerida, Forma de coleta, Formato de ensino, Esquema de reforço, Hierarquia de ajuda, Esvanecimento, Medida de tempo, Procedimento e Direção do objetivo também são seletores.
   - Nenhuma opção mostra código.
   - Ao salvar, o banco recebe os códigos (`goals: ["tolerar","reduzir"]`, `behaviorFunctions: ["fuga"]`, `category: "reducao"`) e `restricted: true` da técnica do sistema continua.
   - Conferi por script que **todos** os valores das 67 técnicas do catálogo existem nas listas dos seletores; nenhum cai em "Valor anterior (fora do catálogo atual)".
   - **Furo achado:** o campo "Código" continuava como texto livre com o identificador cru ("extincao_de_fuga"), no editor e em "Ver modelo". Ver Correções.
2. **23505 em ajuste simultâneo.** Outra pessoa grava o ajuste do mesmo modelo do sistema enquanto o editor está aberto:
   - Ao salvar, aparece a mensagem pt-BR, "Salvar" trava e surge "Recarregar". Clicar em Salvar de novo não repete a chamada.
   - "Recarregar" acha o item existente por tipo + referência e mantém o texto digitado.
   - A gravação seguinte vai para o id existente (`…00aa`, revisão 4 → 5), com evento novo; não tenta criar de novo. O texto do QA foi gravado.
3. **Arquivados (BIB-1).**
   - Quem só lê não vê "Mostrar" nem o arquivado.
   - Quem grava escolhe "Arquivados": o modelo próprio aparece com a marca "Arquivado", só "Reativar" (sem Editar) e sem "Novo".
   - "Reativar" pede confirmação; clique duplo dá 1 chamada, com id, revisão e conteúdo preservados e `status: ativo`.
   - Depois disso o modelo volta para "Disponíveis".
   - As RPCs usadas foram só `aba_save_library_item`, `aba_list_library` e `aba_get_teams`: nada é apagado.
4. **Supervisão, "Recarregar revisão".**
   - 40001: o texto fica. Recarregar troca só a revisão (2 → 3) e salvar grava a pauta digitada. O texto que a outra pessoa escreveu no banco não substitui o digitado.
   - O recarregar **recusa** continuar, mantendo o texto e com "Salvar" travado, sem nova gravação e sem trazer texto do banco, quando o registro foi **anonimizado** (`patient_id` virou NULL e a pauta foi apagada), quando o supervisionado mudou, quando o registro foi assinado e quando a pauta ficou restrita.
- **Geral:**
  - Sem rolagem lateral em 360, 768, 1024 e 1280 (editor de técnica, Arquivados, editor da supervisão).
  - Console sem erro nem texto clínico.
- **Testes trocados:**
  - Só saiu a asserção autorizada (`onRefresh`/"Atualizar lista" → "Recarregar revisão"). Todo o resto do diff dos testes é acréscimo.
  - "Reativar" passou a cobrir oculto e arquivado.
  - Os blocos de QA das reviews 007 e 013 continuam lá.
- **`ABA_HELP.supervisao`:** mudou só a nota do conflito. `ABA_HELP.biblioteca` ganhou o texto dos seletores, dos Arquivados e do Recarregar. O espelho regenerado pelo script dá exatamente o arquivo commitado.

### Correções que eu fiz (branch qa/ACUP-014)
1. **"Código" fora da tela.** `code` saiu de `TECHNIQUE_FIELDS`, então não aparece nem se edita no editor e no "Ver modelo".
   - O valor continua guardado no conteúdo: o ajuste de técnica do sistema mantém o `code` original.
   - Programas não usa esse campo (a mesclagem troca pela chave).
   - Na técnica do sistema, editar o campo não tinha efeito nenhum. Teste novo.
2. **Teste reforçado.** Fiz 20 mutações; passavam 3:
   - "23505 sem Recarregar": o editor podia deixar de ligar o duplicado.
   - "Arquivado editável".
   - "Item do sistema em Arquivados": praticamente equivalente, porque o banco não deixa item do sistema arquivado, mas agora tem asserção.
   - Com o bloco do QA, **20/20**.

### Prints conferidos (mesa/prints/ACUP-014)
- Conferi os 14 do dev: seletores, configuração, Arquivados, duplicado, conflito, recarregada e contexto protegido, no computador e no celular. As legendas agora têm espaço ("celular 360").
- Refiz com `-qa` depois da correção:
  - `tecnica-editor-qa` e `tecnica-editor-celular-qa`: editor sem o campo Código.
  - `biblioteca-arquivados-qa`: Arquivados com Reativar e sem Editar.

### Observação (não bloqueia)
- Os seletores múltiplos (Objetivos, Funções, Hierarquia de ajuda) são o `select multiple` nativo. No computador, marcar mais de uma opção exige Ctrl/Cmd, e a tela não diz isso; o "Como funciona" diz só que "permitem várias escolhas". Sugiro uma dica curta junto do campo, ou caixas de marcar, numa próxima rodada.
