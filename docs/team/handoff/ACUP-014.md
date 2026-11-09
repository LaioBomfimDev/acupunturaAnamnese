## ACUP-014 — entrega para review

- Branch/base: `codex/lk`, merge autorizado de `integracao` (`cfa9047`, fast-forward) antes da implementação. Commit: `fix(ACUP-014): ajusta biblioteca e recarga de supervisão` (este handoff acompanha o commit).
- Escopo: `AbaLibrary.jsx`, somente recarga após conflito em `AbaSupervision.jsx`, `abaLibraryMerge.js`, acréscimos em `aba.css`, os dois testes de tela, ajuda da Biblioteca e nota de conflito da Supervisão, espelho regenerado e este handoff. Sem alterações em SQL, catálogo, service, workspace, AGENTS, financeiro ou produção.
- Editor de técnica: categoria, objetivos, funções e configuração sugerida usam os catálogos/rótulos de Programas. Objetivos, funções e hierarquia são seletores múltiplos; economia de fichas e Restrito continuam Sim/Não. Opcional não preenchido não cria valor. Valor histórico fora do catálogo é preservado como opção “Valor anterior … (fora do catálogo atual)”, sem expor código como rótulo nem apagá-lo silenciosamente. Restrito do sistema continua bloqueado e prevalece na mesclagem. Busca por categoria também usa seu rótulo.
- Ajuste simultâneo: 23505 no modelo do sistema oferece “Recarregar”; reconhece também a mensagem pt-BR da RPC porque o `call()` existente não conserva o code de 23505. A lista é relida e encontra o mesmo `kind` + `system_key`, mesmo que o editor tivesse começado sem `row`. Atualiza somente row/status, mantendo o digitado. O próximo save usa id e revision do item existente, com evento novo; não tenta criar novamente. Se não localizar o item, mantém o bloqueio/texto e explica indisponibilidade.
- Arquivados (BIB-1): filtro “Mostrar → Arquivados” só para quem grava, com somente itens próprios arquivados e Reativar por confirmação. Sem editar/apagar nessa lista. Reativação preserva id, conteúdo e CAS e relê a lista; sai do filtro Arquivados e volta às opções ativas. Arquivados nunca entram no catálogo de Programas. Defaults da mesclagem continuam escondendo arquivados, inclusive para quem grava se não pediu esse filtro; `includeArchived` não concede permissão a leitor.
- Banco: contrato atual de `aba_save_library_item` conferido na migration da 006: status admite ativo/oculto/arquivado; a proibição de arquivar e a referência imutável se aplicam ao sistema. Item próprio arquivado pode voltar a ativo pelo mesmo UPDATE/CAS. Nenhuma migration foi editada/aplicada e nenhuma chamada foi feita em produção; validação desta task usa RPCs mockadas, não é uma nova validação SQL.
- Supervisão: depois de 40001, “Recarregar revisão” relê `listSupervisions`, mantém todos os campos digitados e troca somente revision; habilita salvar com evento novo. Não substitui pauta/decisões pelo conteúdo do servidor. Recusa a recarga que liberaria escrita se paciente ou supervisionado mudou, inclusive `patient_id` tornado NULL pela exclusão, se deixou de ser rascunho ou se o conteúdo ficou restrito. Mantém o texto local e o bloqueio nesses casos; não restaura texto expurgado.
- Autorizações adicionais: `d3df4da` autorizou somente a nota de conflito em `ABA_HELP.supervisao` + espelho, e confirmou a proteção de contexto. `bb8dc81` autorizou substituir a asserção antiga onRefresh/Atualizar lista por reloadRevision/Recarregar revisão com provas mais fortes; demais asserções preservadas. Na Biblioteca, foram acrescentadas as provas de reativação de ocultos/arquivados, mantendo confirmação/CAS/eventos; a asserção antiga compatível foi preservada.

### Validação

- `node frontend/scripts/sync-assistant-help.mjs`: espelho regenerado.
- Focados: 28/28 nos dois testes de tela. Novo caso de seletor teve inicialmente expectativa de rótulo “Física parcial”; corrigida para o rótulo real do catálogo, “Ajuda física parcial”, sem mudar o catálogo/produto para caber no teste.
- Gates finais: `cd frontend; npm run lint` exit 0; `npm test` exit 0 (1437 testes, 1436 aprovados, 1 pulado, zero falhas; 197293,0313 ms); `npm run build` exit 0 (2,60 s). Logs `%TEMP%/acup-014-lint-final.log`, `%TEMP%/acup-014-tests-final.log`, `%TEMP%/acup-014-build-final.log`. Build com os avisos de import dinâmico também estático de `patientEvolutionService.js` e chunks acima de 500 kB, sem impedir a conclusão.
- Cinco mutações temporárias rejeitadas e desfeitas: seletor convertido em texto livre; reload ignorando tipo/chave; arquivado omitido da gestão autorizada; recarga mantendo revisão antiga; retirada da proteção de vínculo expurgado. Cada mutação derrubou seu teste de tela. Logs `%TEMP%/acup-014-mutation-*.log`.
- Chrome/CDP, RPCs fictícias: 23505 seguido de Recarregar preservou texto e salvou no id existente com revision 4; reativação confirmou e enviou uma única chamada com id/revision/conteúdo preservados; leitor sem Arquivados; seletores múltiplos enviaram os códigos corretos e mantiveram Restrito; 40001 recarregou revision 3 e salvou o digitado com uma única chamada final; expurgo/troca de supervisionado/estado/acesso mantiveram texto sem liberar save. Sem exceções JS nem texto clínico no console; editor da técnica sem rolagem lateral em 360/768/1024/1280.
- O grafo do Vite do harness foi reiniciado após as mutações temporárias (a primeira tentativa de navegador ficara vazia). Na instrumentação, foi ignorado exclusivamente o 404 de `/favicon.ico` do harness, não erros de execução. Log final aprovado `%TEMP%/acup-014-browser.log`.
- `git diff --check` sem erros. Ruby/Rails não configurado: gates Ruby não se aplicam. Sem SQL/produção. Review e integração continuam com QA e Orquestrador.

### Prints no board

Em `C:/Users/m/Downloads/acup-team/mesa/prints/ACUP-014/`, legendas com espaços normais em `legendas.md`. Computador por `mesa/ferramentas/print.mjs`; celular por `harness-telas/print-cdp.mjs --celular --largura 360 --inteira`. Dados inteiramente fictícios.

| Estado | Computador | Celular |
|---|---|---|
| Seletores da técnica | `tecnica-seletores.png` | `tecnica-seletores-celular.png` |
| Configuração sugerida | `tecnica-configuracao.png` | `tecnica-configuracao-celular.png` |
| Filtro Arquivados / Reativar | `biblioteca-arquivados.png` | `biblioteca-arquivados-celular.png` |
| Ajuste simultâneo / Recarregar | `biblioteca-duplicado.png` | `biblioteca-duplicado-celular.png` |
| Supervisão em conflito | `supervisao-conflito.png` | `supervisao-conflito-celular.png` |
| Revisão recarregada / texto mantido | `supervisao-recarregada.png` | `supervisao-recarregada-celular.png` |
| Contexto expurgado protegido | `supervisao-contexto-protegido.png` | `supervisao-contexto-protegido-celular.png` |

### Reprodução para o QA

1. Rodar `cd frontend; npm run quality`.
2. Harness próprio da task, sem alterar fixtures anteriores: `mesa/ferramentas/harness-telas/telas/biblioteca-014-lk.jsx` e `supervisao-014-lk.jsx`. Subir `server.mjs` contra o frontend da worktree na porta 5194 e rodar `mesa/ferramentas/harness-telas/verify-014-lk.mjs`.
3. URLs Biblioteca: `/tela/biblioteca-014-lk?tipo=tecnica&busca=T%C3%A9cnica%20restrita&acao=editar&scroll=seletores` (ou `scroll=config`), `?archived=1`, `?duplicate=1&busca=Acompanhar` (com `&reloaded=1` para ver após recarga). O driver também salva após recuperar 23505 e reativa um arquivado, verificando payload e clique repetido.
4. URLs Supervisão: `/tela/supervisao-014-lk?acao=erro`, com `&reloaded=1` para revision nova e salvar liberado; `&erased=1&reloaded=1` prova bloqueio depois de anonimização. O driver também cobre troca de supervisionado, status e acesso.
5. Conferir/refazer prints com `-qa`; verificar que rótulos são pt-BR enquanto payload usa códigos, que não há exclusão de modelos e que a supervisão salva o texto mantido somente com contexto compatível.

Limites preservados: só último evento para idempotência, como no contrato existente; o banco é autoridade. Recarregar não aprova conteúdo clínico. Proteção global ao trocar aba/paciente segue na ACUP-012. Nenhuma alteração nos seis SQL já publicados (PROD-2).
