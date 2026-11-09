## ACUP-007 — entrega para review

- Branch/base: `codex/lk`, merge autorizado de `integracao` (`eb1434b`, fast-forward) antes da implementação. Commit de entrega: `feat(ACUP-007): adiciona biblioteca clínica e catálogo mesclado` (este handoff acompanha o commit).
- Resultado: aba Biblioteca no grupo Equipe, independente de paciente. Lista objetivos e técnicas do sistema com ajustes institucionais e modelos próprios. Administração e supervisão de time ativo criam/editam modelos, ajustam/ocultam/reativam modelos do sistema e arquivam próprios, com confirmação das mudanças de estado. Demais profissionais só leem. Programas e seu seletor de técnicas usam o catálogo mesclado.
- Mesclagem: conteúdo institucional substitui integralmente o modelo da mesma `kind` + referência; `restricted` da técnica do sistema sempre vem do sistema. Ocultos não entram em Programas e aparecem na Biblioteca somente para quem grava (incluindo item próprio oculto); arquivados não entram nas duas telas. Itens próprios ativos entram. Campos opcionais de técnicas têm listas vazias para o seletor não quebrar.
- Identidade: 94 objetivos receberam `key` explícita e permanente. Não há cálculo de chave em execução por título/posição/ordem. As técnicas continuam com seus 67 `code` originais. Comparação executada contra `git show eb1434b:frontend/src/data/abaLibrary.js` confirmou todos os demais campos de objetivos e todas as técnicas intactos. O novo teste guarda as duas listas fechadas e hash do conteúdo original.
- Permissões: fonte existente `loadTeams()`/`aba_get_teams`, que devolve `isAdmin`, `userId` e `supervisedTeamId` filtrado por time ativo no banco. Falha nessa fonte mantém leitura e esconde escrita com aviso; não infere cargo ou supervisão pela matrícula/paciente. Banco continua autoridade.
- Escrita: UUID gerado uma vez no editor, CAS e evento por ação. Ref síncrona bloqueia clique repetido. Mudanças de estado mantêm id/evento no diálogo. Sucesso relê a lista; falha ao reler não simula catálogo salvo. Conflito mantém o digitado; “Recarregar revisão” atualiza somente metadados, mantém o texto e pede conferência antes de salvar. 42501 tem mensagem pt-BR, 22023/23505 preservam o texto do banco. `key` nunca vai no `content`.
- Sem rede: Programas mantém catálogo do sistema e mostra “Biblioteca da clínica indisponível; mostrando os modelos do sistema”; Biblioteca mostra erro e “Tentar de novo”. Modelos nunca dispensam individualização/revisão nominal.
- Arquivos: `AbaLibrary.jsx`, `abaLibraryMerge.js`, fonte do catálogo em `AbaPrograms.jsx`, funções novas em `abaService.js`, registro em `AbaWorkspace.jsx`, somente keys em `abaLibrary.js`, acréscimos em `aba.css`, somente `ABA_HELP.biblioteca` em `screenHelp.js`, espelho `assistantHelpCorpus.ts` regenerado, teste novo `aba-library-screen.test.mjs`, ajuste autorizado no teste da 006 e somente bullet ABA em `AGENTS.md`. O teste `aba-plan-screen.test.mjs` não precisou mudar.
- Autorização adicional: INFO `27469b1` na caixa LK em 08/11/2026 23:22 permitiu excluir somente `key` dos metadados de objetivo na comparação do teste da 006, exigindo asserção de que `key` não está nas chaves SQL. As demais asserções ficaram intactas.

### Validação

- `node frontend/scripts/sync-assistant-help.mjs`: espelho gerado.
- Testes focados anteriores: 27/27 (`aba-library-items`, `aba-invariants`, `aba-plan-screen`). Novo teste: 10/10, cobrindo mesclagem, restrição, chaves, visibilidade, permissão, CAS/payload, fallback, navegação/ajuda/responsividade e chamadas/erros reais do service com RPC mockada.
- Primeira suíte completa: exit 0; 1410 testes, 1409 aprovados, 1 pulado, zero falhas, 202619,0944 ms. Após conferir item próprio oculto, o caso foi acrescentado ao teste e os gates finais foram reiniciados.
- Gates finais, após o último ajuste: `cd frontend; npm run lint` exit 0; `npm test` exit 0 (1410 testes: 1409 aprovados, 1 pulado, zero falhas; 198168,1135 ms); `npm run build` exit 0 (3,09 s). Logs locais `%TEMP%/acup-007-lint-final.log`, `%TEMP%/acup-007-tests-final.log` e `%TEMP%/acup-007-build-final.log`. Build avisa sobre import dinâmico também estático de `patientEvolutionService.js`, chunks acima de 500 kB e tempo de plugins; não impediram o build.
- Primeiro lint identificou setState síncrono na chamada inicial de refresh; corrigido sem desabilitar a regra. A execução seguinte passou.
- Comparação de catálogo com a base e `git diff --check`: sem diferença além das keys autorizadas e sem erro de whitespace.
- Navegador real (Chrome headless via CDP, harness fictício): duplo clique = uma escrita e releitura; criação com UUID/revision zero/evento e sem key; conflito mantém texto inclusive ao recarregar revisão; ocultação só grava após confirmação; ajuste `restricted:false` mantém selo Restrito e campo bloqueado; membro sem ações de escrita. Sem exceções JS e sem rolagem lateral em 360/768/1024/1280 px.
- Reprodução da validação do navegador: subir `mesa/ferramentas/harness-telas/server.mjs` apontando para este frontend na porta 5197 e rodar `node C:/Users/m/Downloads/acup-team/mesa/ferramentas/harness-telas/verify-biblioteca-lk.mjs`. Log local `%TEMP%/acup-007-browser.log`.
- Ruby/Rails não configurado: gates Ruby não se aplicam. Sem alteração SQL ou acesso à produção; as RPCs no navegador e no teste do service foram mockadas.

### Prints no board

Todos em `C:/Users/m/Downloads/acup-team/mesa/prints/ACUP-007/`, com legendas em `legendas.md`. Computador por `mesa/ferramentas/print.mjs`; celular por `harness-telas/print-cdp.mjs --celular --largura 360 --inteira`, sem rolagem lateral. Dados inteiramente fictícios.

| Estado | Computador | Celular |
|---|---|---|
| Lista mesclada | `biblioteca-lista.png` | `biblioteca-lista-celular.png` |
| Item oculto com Reativar | `biblioteca-oculto.png` | `biblioteca-oculto-celular.png` |
| Edição | `biblioteca-edicao.png` | `biblioteca-edicao-celular.png` |
| Programas com erro de leitura/fallback | `programas-erro-leitura.png` | `programas-erro-leitura-celular.png` |
| Somente leitura | `biblioteca-so-leitura.png` | `biblioteca-so-leitura-celular.png` |
| Biblioteca com erro e retry | `biblioteca-erro-leitura.png` | `biblioteca-erro-leitura-celular.png` |
| Restrição do sistema preservada | `biblioteca-restrito.png` | `biblioteca-restrito-celular.png` |

Harness novo: `mesa/ferramentas/harness-telas/telas/biblioteca-lk.jsx` (fora do git, não altera harness de outro dono). URLs `/tela/biblioteca-lk`, `?acao=editar`, `?role=member`, `?programas=1&error=1`, `?error=1`, `?busca=Modelo%20oculto`, `?tipo=tecnica&busca=T%C3%A9cnica%20restrita`.

### Conferência do QA e limites

1. Rodar `cd frontend; npm run quality` e conferir a lista fechada de chaves e o caso `restricted:false`.
2. Conferir/refazer os prints com sufixo `-qa`; exercitar criação, edição, ocultar/reativar, arquivar próprio, leitura sem supervisão e falha de leitura em Programas.
3. Conferir conflito de revisão sem perda do digitado e clique repetido sem duplicar RPC. Editor usa `useDismiss`/`DismissPrompt`; a proteção ao trocar de aba/paciente no workspace inteiro segue na ACUP-012, conforme fora de escopo.
4. Validação de navegador é contra imitação local de RPC, não uma nova prova SQL. O contrato SQL e sua validação real pertencem à ACUP-006, já integrada. Esta task não altera SQL, financeiro, outras abas ou programas já gravados.
5. Em falha de leitura, Programas usa somente os modelos do sistema conforme aceite; ocultações institucionais não podem ser conhecidas sem rede. Biblioteca não oferece gravação nesse estado.
