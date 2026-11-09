## ACUP-007 — revisão

- Veredito: **APROVADO**, com duas correções minhas (abaixo)
- Commit revisado: `107e5d9` (codex/lk, base integracao `eb1434b`). Branch de revisão: `qa/ACUP-007`.
- Gate: `npm run quality` verde nos dois commits: entrega do dev 1410 testes (1409 ok, 1 pulado); com minhas correções 1413 (1412 ok, 1 pulado, 0 falhas). Lint e build ok.
- SQL: não se aplica (a tela não muda SQL).
- Invariantes AGENTS.md: ok depois da correção 1 (antes, a tela mostrava código interno em vez de pt-BR).

### Conferido pelo foco do REVIEW
1. **Mesclagem.**
   - `restricted` de técnica do sistema sempre vem do sistema. No navegador, o ajuste fictício com `restricted:false` continua "Restrito", e o seletor "Restrito" do editor fica travado, com aviso.
   - Oculto some de Programas: busquei "Alternar olhar" em Programas e o objetivo oculto não aparece, só o "entre pessoa e objeto".
   - Oculto continua na Biblioteca de quem grava, com "Reativar". Para o membro do time, some.
   - Arquivado próprio some das duas telas.
2. **Chaves dos objetivos.**
   - As 94 `key` em `abaLibrary.js` são só acréscimos: todas as linhas do diff são `key: '...'`. São únicas e estão no formato `^[a-z0-9][a-z0-9_-]{0,119}$`.
   - Há lista fechada e hash do resto do conteúdo no teste.
   - `key` nunca vai no `content`: conferido no payload real das chamadas.
3. **`aba-library-items.test.mjs` (da 006):** mudou só o autorizado (tirar `key` da comparação e conferir que `key` fica fora do SQL).
4. **Permissão.**
   - Vem de `aba_get_teams` (`isAdmin` / `supervisedTeamId`). Conferi no banco que `supervised_team_id` só conta time não arquivado e da mesma clínica, a mesma regra de `aba_save_library_item`.
   - O 42501 vira frase pt-BR.
   - O membro não vê nenhum botão de escrita.
5. **Erro de leitura:** Programas mostra "Biblioteca da clínica indisponível; mostrando os modelos do sistema" e mantém os 94 objetivos e as 67 técnicas. A Biblioteca mostra o erro com "Tentar de novo", sem "Novo".
6. **Escrita.**
   - Clique triplo em "Salvar modelo" e em "Confirmar" dá uma chamada só.
   - O id é gerado uma vez por editor: depois de uma falha, a segunda tentativa usa o mesmo id e um evento novo.
   - 40001: a mensagem pt-BR diz que o texto foi mantido, o texto continua lá, "Salvar" fica travado e aparece "Recarregar revisão". Recarregar mantém o texto e pega a revisão nova; salvar depois grava com a revisão certa.
7. **Aviso "ponto de partida"** nas duas telas.
   - Sem rolagem lateral em 360, 768, 1024 e 1280 (lista, editor, Programas e Programas com erro).
   - O editor no celular é um painel de baixo que rola por dentro até "Salvar modelo". O corte no print do dev é efeito do print da página inteira.
   - Console sem erro.
   - O "Como funciona" tem as 5 seções e foi escrito pelos rótulos reais da tela. O espelho regenerado pelo script dá exatamente o arquivo commitado (só muda o fim de linha).

### Correções que eu fiz (branch qa/ACUP-007)
1. **pt-BR:** o cartão e o "Ver modelo" da técnica mostravam o código cru do catálogo: "reducao" em vez de "Redução de interferentes", "reduzir" e "fuga" em vez de "Reduzir comportamento interferente" e "Fuga / esquiva da demanda". Agora usam os mesmos rótulos de Programas (`techniqueCategoryLabel`, `techniqueGoalLabel`, `behaviorFunctionLabel`). A leitura também deixou de mostrar a instrução do editor ("Objetivos (um por linha)" virou "Objetivos"). Dois testes novos.
2. **O teste não mordia em 4 pontos do foco.** Fiz 19 mutações; 5 passavam, e uma delas é equivalente (o arquivado já é filtrado depois). As 4 reais eram: aviso "ponto de partida" tirado de Programas, id novo a cada salvar, evento fixo e "Restrito" editável numa técnica do sistema. Acrescentei um bloco de teste do QA. Agora 18/19 mordem; a que sobra é a equivalente.

### Prints conferidos (mesa/prints/ACUP-007)
- Conferi os 14 do dev: lista, edição, só leitura, erro de leitura (Biblioteca e Programas), oculto e restrito, no computador e no celular. Batem com o que medi no navegador.
- Refiz com `-qa`:
  - `biblioteca-restrito-qa` e `biblioteca-restrito-celular-qa`: categoria agora em pt-BR, marca "Restrito" mantida.
  - `biblioteca-edicao-celular-qa`: tela visível, mostra o painel de baixo, sem o corte do print de página inteira.

### Pendências para o dev (não bloqueiam)
1. **Editor de técnica com códigos em texto livre.** Categoria, Objetivos, Funções e os campos de Configuração sugerida são caixas de texto com códigos internos ("reducao", "ensinar_nova", "fuga"). Um valor digitado fora da lista some dos filtros de Programas. Sugiro seletor ou caixas de marcar com os rótulos pt-BR. O campo "Código" de técnica do sistema também é editável e não tem efeito: a referência é o `system_key`.
2. **23505 sem saída.** Quando duas pessoas ajustam ao mesmo tempo um modelo do sistema ainda sem ajuste, a segunda recebe "…Recarregue antes de continuar", mas não aparece "Recarregar revisão". Tentar de novo repete o 23505, porque o id é outro, e só fechando (e perdendo o texto) dá para sair. Sugiro tratar 23505 como conflito e recarregar a linha por `kind` + `system_key`.
3. Item próprio arquivado some da gestão e não tem como reativar pela tela. Segue o aceite ("arquivado some das duas"); fica registrado para o Orquestrador decidir se precisa de "ver arquivados".
