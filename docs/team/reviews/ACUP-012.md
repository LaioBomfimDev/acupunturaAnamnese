## ACUP-012 — revisão

- Veredito: **APROVADO**
- Commit revisado: `775881e` (codex/lk, base integracao `16a77c8`). Branch de revisão: `qa/ACUP-012`.
- Gate: `npm run quality` verde: entrega do dev com 1443 testes (1442 ok, 1 pulado); com o meu teste, 1444 (1443 ok, 1 pulado, 0 falhas). Lint e build ok. `patient-start-ui` e `dismiss-overlays` estão na suíte e passaram.
- **PROD-2:** nenhum SQL no diff. SQL: não se aplica. Invariantes AGENTS.md: ok (§7 janela sobreposta com `DismissPrompt`, nunca descarta calado).
- Correções que eu fiz: só teste (uma rota do painel podia sair do guarda sem o teste notar).

### Conferido no navegador
Harness `server-012-lk` apontado para a minha worktree, com o `AbaWorkspace` real e o Chrome por CDP.
1. **Guarda único.**
   - **Trocar aba** com texto pendente no Perfil abre "Sair sem salvar?", com o foco em "Continuar editando". Continuar mantém o texto e a aba (Perfil); Esc também. "Descartar e sair" vai para Programas.
   - **Sem pendência**, nada pergunta. **Depois de salvar**, nada pergunta.
   - **Voltar à tela principal**, **Sair** e **Tela inicial** perguntam. Continuar não executa a saída e mantém o texto; Descartar executa exatamente a saída pedida (`area`, `signout`).
   - **Trocar de paciente** pelo `PatientStart` (probe do dev, editor e seletor juntos) pergunta antes de mudar o paciente. Continuar não seleciona; Descartar seleciona.
   - **Durante a gravação**, a troca de aba é ignorada: não pergunta e não navega.
   - **`beforeunload`** só barra a saída com pendência (testado antes e depois de digitar, e depois de descartar).
   - **Nenhum diálogo nativo**: `window.confirm` espionado deu 0 chamadas, e nenhum `Page.javascriptDialogOpening`.
2. **Componentes compartilhados.**
   - `PatientStart` sem a prop chama o mesmo `select()` assíncrono de antes. Ninguém aguarda o retorno de `handleSelect` (`PatientListCard` chama `onSelect?.(patient)` sem `await`).
   - As outras 4 áreas (`App`, `DisciplineWorkspace`, `Psychology`, `Neuropsychology`) não passam a prop, então nada muda para elas.
   - `DismissPrompt` mantém o padrão "Descartar e fechar"; a ABA passa "Descartar e sair".
3. **Editores registrados.** Perfil, Plano (editor e diálogo), Biblioteca, Supervisão (editor e diálogo) e Coleta (rascunho diferente do autosave).
   - Varri `components/aba/` atrás de campos de texto. Os que não se registram (Programas, Repertório, Times, Qualidade, correções de Sessões, ocorrência de risco da Coleta) ficam todos dentro de `AbaDialog`. A sobreposição tem z-index 200, acima do menu (100) e da barra de baixo (120), então não dá para trocar de aba com eles abertos. A ocorrência de risco usa `AbaDialog guardUnsaved`. As observações da coleta fazem parte do rascunho registrado.
   - Nenhum editor solto ficou de fora. Lacuna menor, nas Observações abaixo.
4. **Seletor de suporte e caixas.**
   - O seletor de suporte agora usa `aba-field`, com borda, raio e altura do kit.
   - Objetivos, Funções do comportamento e Hierarquia de ajuda viraram caixas de marcar com rótulos pt-BR (0 `select multiple`). Marcar "tolerar" e "fuga" gravou `goals: [ensinar_nova, discriminar, tolerar]` e `behaviorFunctions: [fuga]`: os mesmos códigos.
   - Asserções trocadas: só as 4 autorizadas (11→8 `<select`, 3→0 `multiple`, `comunicar`/`ajuda_visual` de `selected` para `checked`). Meus blocos de QA da 007 e da 014 continuam lá.
5. **Até 1024 px.** Com a pergunta aberta, em 360, 768, 1024 e 1280: sem rolagem lateral, a pergunta cabe na largura, e "Continuar editando" e "Descartar e sair" ficam visíveis na tela. Console sem erro.

### O teste morde
Fiz 25 mutações. Na entrega, 23 eram pegas. Passavam:
- "Atalho do painel sem guarda" (`onCollect` direto em `setActiveTab`). Hoje é inofensivo, porque nenhum editor fica montado no Painel, mas a regra é toda rota pelo guarda.
- "Texto no registro", que é equivalente: o valor que chega ali já é booleano.

Depois do meu bloco, **24/25** (a que sobra é a equivalente).

### Correção que eu fiz
- `aba-unsaved-guard.test.mjs`: bloco do QA. Ele exige que os atalhos do painel e o `onOpenSessions` da coleta passem por `handleTabChange`, que nenhum `on…={() => setActiveTab(…)}` direto exista no Workspace (só o retorno da seleção já guardada), e que `beforeSelectPatient={unsaved.navigate}` esteja lá.

### Prints conferidos (mesa/prints/ACUP-012)
- Conferi os 12 do dev: troca de aba, troca de paciente, perfil, biblioteca, caixas e hierarquia, no computador e no celular. Legendas com espaço normal.
- Acrescentei `-qa`: `troca-aba-qa`, `troca-aba-celular-qa` (pergunta no painel de baixo) e `biblioteca-caixas-celular-qa` (caixas tocáveis, sem Ctrl/Cmd).

### Observações (não bloqueiam)
1. Editores dentro de `AbaDialog` sem registro (Programas, Repertório, Times, Qualidade, correções de Sessões) não ligam o `beforeunload`: fechar a aba do navegador com um programa digitado não avisa. A troca de aba e de paciente está protegida pela sobreposição. Se quiser fechar essa porta, basta `useAbaUnsaved(dirty)` dentro do `AbaDialog guardUnsaved`.
2. Durante a gravação, clicar noutra aba não faz nada, sem nenhum aviso. Um "Aguarde, salvando…" ajudaria.
3. O texto da pergunta vem do `DismissPrompt` ("Fechar agora descarta o que foi digitado"); aqui a ação é sair ou trocar de tela. Pode ganhar uma frase própria junto com o `discardLabel`.
