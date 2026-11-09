## ACUP-005 — revisão
- Veredito: **APROVADO** (com uma correção do QA no teste, abaixo)
- Branch revisada: `codex/lk` @ `87b340b` (base `integracao` @ `f582a94`) → `qa/ACUP-005`.
- Gate: `cd frontend && npm run quality` **verde** (exit 0), já com a correção: security · lint · testes **1393 (1392 passaram, 1 ignorado, 0 falhas)** · build · bundle.
- SQL: não se aplica (sem `.sql`).
- Invariantes AGENTS.md: ok. Nenhuma sugestão de diagnóstico, nada de IA.

### Como validei
Leitura do diff completo. **Navegador de verdade:** harness sem login (Vite + Supabase falso) com `AbaProfile` e um "banco" em memória com as regras da 004/011 (CAS, replay, 42501 para quem não supervisiona, 22023 de arquivado e de data futura em SP), dirigido pelo Chrome headless via CDP. **29 de 31 verificações OK**; as 2 que falharam eram expectativas minhas erradas, explicadas no item 4. A suíte do plano (ACUP-003) também rodou de novo, para conferir o grid.

### Pontos pedidos
1. **Nenhuma sugestão nem autocompletar:**
   - nenhum `datalist`, atributo `list` ou `placeholder` no DOM do editor, nem no diff inteiro;
   - nenhum exemplo de diagnóstico/CID/TEA em texto ou ajuda;
   - `<form autoComplete="off">`, com texto e fonte do laudo também `off`; o campo de detalhes herda o `off` do form.
2. **Quem vê o diagnóstico:** só aparece depois de `aba_get_profile` (quem não pode ler recebe 42501 e vê a mensagem, sem dado). **Console:** 12 linhas capturadas no navegador durante todo o roteiro, nenhuma com laudo ou detalhes. **Título da aba** inalterado. Nenhum `console.` nem `document.title` no código.
3. **Permissão:** o membro vê o perfil inteiro em leitura, com rótulos pt-BR, o aviso "Somente leitura…" e **nenhum** botão de editar, salvar ou preencher. Sem perfil, o membro vê o estado vazio sem "Preencher perfil". A supervisão vê "Preencher perfil" ou "Editar perfil". O 42501 do banco aparece como "Você não tem permissão…".
4. **Revisão, evento e clique:**
   - criar manda `revision: 0`; editar manda a revisão gravada (1);
   - **evento UUID v4 novo por ação** (diferente entre os dois salvamentos);
   - **clique triplo em Salvar = 1 RPC**;
   - o payload não leva `clinic_id`/`updated_by`;
   - **40001:** "Este perfil foi alterado por outra pessoa. Recarregue antes de salvar.", com os campos travados, o texto preservado e o botão virando "Descartar e recarregar" (pergunta antes de descartar).
5. **Data do laudo (fuso SP):**
   - `profileToday` dá 08/11 às 02h30 UTC de 09/11 (23h30 em SP) e 09/11 às 03h10 UTC;
   - o campo tem `max` = hoje em SP;
   - a data futura é **barrada pelo navegador** (validação nativa: "O valor deve ser 08/11/2026 ou anterior.", sem RPC). Sem a validação nativa, entra o aviso da tela "Data do laudo não pode ser futura." (sem RPC);
   - a recusa do banco aparece **com o texto dele** ("Data do laudo não pode ser futura.", "Paciente arquivado não recebe perfil.");
   - 22023 técnico em inglês e falha de rede viram texto genérico em pt-BR.

   *(As 2 falhas do navegador foram expectativas minhas: o "≥3 autocomplete" contava só os campos dentro do form, e o "aviso na tela" não aparece porque o `max` nativo barra antes, como descrito acima.)*
6. **Rótulos pt-BR:** os 7 modos (Fala vocal, PECS, CAA de alta tecnologia, CAA de baixa tecnologia, Sinais, Gestos, Misto) e os 4 níveis (Nível 1/2/3, Não informado), no editor e na leitura.
7. **"Como funciona":** `ABA_HELP.perfil` com as 5 seções, escrito pelos rótulos reais ("Preencher perfil", "Editar perfil", "Salvar perfil", "Cancelar", "Não informado"). Diz que o sistema não sugere nem completa diagnóstico e repete a regra do arquivado. O espelho regenerado pelo script é **igual** ao commitado (só muda o fim de linha).
8. **Grid do plano:** `repeat(5, …)` acima de 1024px. No computador os 5 campos ficam **numa linha** (captura conferida). A suíte do plano no navegador continua 49/50 (a única falha é a verificação antiga que proibia "Enviado por", obsoleta desde a 010).
9. **`aba-plan-screen.test.mjs`:** o diff é só a regex do grupo Plano ganhando `TABS.PERFIL`. Nada mais.
10. **Larguras:** em 360, 768, 1024 e 1280 px, leitura e editor sem rolagem lateral (`scrollWidth = clientWidth`, nenhum elemento passando da borda). No celular e no tablet, uma coluna e botões empilhados.

### Mutações (temporárias, bytes restaurados)
19 mutações contra `aba-profile-screen`, `aba-plan-screen`, `screen-help` e `clinic-assistant`:
- datalist, placeholder com diagnóstico, `autocomplete="on"`, `console.log`, título da aba com diagnóstico;
- membro com "Editar", sem trava de clique, evento fixo, revisão sempre 0;
- sem `max`, hoje em UTC, futuro aceito, rótulo errado, 22023 genérico, 40001 genérico;
- grid de volta a 4 colunas, aba fora do grupo, ajuda sem seção, ajuda sem regenerar o espelho.

**Antes da correção, 3 passavam:** `autocomplete="on"`, diagnóstico no título da aba e revisão sempre 0. **Depois, as 19 derrubam os testes.**

### Correção que eu fiz (`fix(ACUP-005)`, só em `aba-profile-screen.test.mjs`)
- O teste conferia o `autoComplete="off"` só em **algum** campo: trocar o da fonte do laudo para `on` passava. Agora exige `off` no `<form>` e proíbe qualquer outro valor em todo campo de texto livre. Campo sem atributo herda o do form.
- Proíbe `document.title` (diagnóstico no título da aba, pedido explícito do aceite).
- Teste novo: editar parte da revisão gravada (`initial?.revision ?? 0`) e cada salvamento usa `newId()`. Com "revisão sempre 0" a edição sempre cairia em 40001.

Nenhuma asserção do dev foi removida. CRLF mantido, lint ok.

### Pendências (não bloqueiam)
1. **Texto não salvo some ao trocar de aba ou de paciente** sem perguntar. O editor do perfil é embutido na página (não janela) e a área ABA não tem proteção de troca de aba. O mesmo vale para as outras abas ABA; só as janelas do plano usam `useDismiss`. Vale uma task da área inteira.
2. **Cosmético:** o seletor "Nível de suporte" sai fino e sem o estilo arredondado dos outros campos (o kit `forms.css` estiliza `select` só dentro de `.panel`).
3. A mensagem nativa da data máxima segue o idioma do navegador (aqui saiu em pt-BR). Num navegador em inglês sairia em inglês; o aviso pt-BR da tela só aparece se o navegador não validar.
