## ACUP-023 — Review do QA (Lucas, 09/11/2026)

- **Entrega:** `claude/dev2` 0dac1c4 (27b73ad + merge do integracao e99c896). Contrato AG-5. Review na `qa/ACUP-023`, criada de `claude/dev2`.
- **Veredito:** **APROVADO com correção do QA** (`fix(ACUP-023)` nesta branch). São três correções pequenas, nos arquivos da própria entrega, mais um teste. Há também uma ressalva de uso real (pacotes_fim), que deixo para o Orquestrador decidir.

### Escopo

- **Arquivos:** 9, todos da lista do handoff. O merge do integracao só traz docs da 020.
- **Fora do escopo, nada tocado:** nenhuma SQL, nenhuma migration (PROD-2 intacto) e nenhuma tela.
- **Corpus da assistente:** rodei o script e a única diferença foi de fim de linha (CRLF). O corpus confere com o script.

### Quality

- **Entrega:** `npm run quality` rodado sozinho, exit 0: 1492 testes, 1491 ok e 1 pulado (o de sempre, sem o xmllint). Bate com o resultado do dev.
- **Depois da correção:** ver o fim deste arquivo.

### Correções do QA

1. **Confirmações pendentes podiam subcontar sem aviso.** `listPendingConfirmations` corta a busca em 2000 (`.limit(2000)`), mas o resultado não passava pelo `full()` que as outras fontes usam. Uma fila cheia saía como contagem baixa, o que fere o foco (4) e o AG-5 ("fonte no limite vira erro"). Agora passa por `full()`.
2. **Aniversários tinham o mesmo problema.** `listClinicPatients` também corta em 2000. Com 2000 ou mais pacientes, a contagem do mês saía baixa. Agora passa por `full()`.
3. **pacotes_fim afirmava ser "a mesma regra da Sua atenção hoje", mas a fonte é outra.**
   - A "Sua atenção hoje" conta os pacotes do **Financeiro**: `packagesNearEnd` = sessões contratadas menos as cobradas, ≤ 1.
   - A consulta conta as **séries da Agenda**: sessões ainda agendadas, ≤ 1, por `summarizePackageSessions`.

   O próprio `agendaPackageSessions.js` avisa que "Pacote da Agenda ≠ pacote do Financeiro". Só o limite (≤ 1) é o mesmo. No caso do teste os números batem porque as duas fontes foram montadas iguais. Fora dele, divergem: por exemplo, um pacote de 10 com 9 cobradas e 5 sessões ainda marcadas está perto do fim no Financeiro e não está na Agenda. Do jeito que estava, o modelo diria ao usuário que os dois números são o mesmo.

   **Correção:** o critério, nos dois lados e espelhado, diz que é o pacote da Agenda, que não é o do Financeiro e que os números podem não bater. O prompt manda não dizer que são os mesmos.
4. **Teste "QA 09/11/2026…"** em `clinic-assistant-agenda.test.mjs`. Ele cobre:
   - 2000 confirmações dão `erro` e 1999 dão `limite_linhas` com o resumo;
   - 2000 pacientes dão `erro` e 1999 dão o total;
   - o critério e o prompt do pacote.

   Com o código da entrega, o teste falha: `assistantTools.js` antigo dá 1 falha e `clinicAssistant.js` antigo dá 3. Com a correção, o focado passa 9/9.

### Os 6 pontos do foco

1. **Sem paciente e sem id.**
   - `readAgendaResult` remonta tudo por lista fechada, nos dois lados: chaves exatas no topo, na linha e no resumo, e uma chave a mais derruba a resposta inteira.
   - Os valores também são fechados: área, tipo, status, modalidade, dia real, HH:MM, inteiros ≥ 0 e média de 1 a 5 com uma casa.
   - A confirmação não leva `confirmation_token`. O bloqueio só conta, sem `note` nem motivo.

   O teste 4 do dev é uma varredura recursiva com o token, a nota e o nascimento presentes nas fontes. O teste 5 forja chaves a mais em cada nível. O único texto livre que sobra é `profissional` (até 80 letras, nome curto da equipe), como nas outras consultas.
2. **Perfil no aparelho e no servidor.**
   - **Aparelho:** `agendaAllowed` roda antes de qualquer fonte. Aniversários = administração ou recepção. Pesquisas = administração. Portal e convênio = administração + RPC do banco.
   - **Servidor:** a porta FIN-1 foi estendida.
     - `convenio` chama `can_manage_finance(p_clinic, p_user)`;
     - `formularios_pendentes` chama `can_manage_patient_portal(p_clinic, p_user)`. A assinatura aceita `p_user` (migration `20261006_patient_portal.sql`), igual ao uso que o FIN-1 já faz;
     - aniversários e pesquisas leem `profiles.role/clinic_id` pelo id autenticado e exigem a mesma clínica. O papel nunca vem do pedido.
   - **Consultas da equipe:** dependem só da barreira da rota, e confirmei: `index.ts:265-267` (`roleOf` + `if (!role || !clinicId)`) recusa super_admin e quem não tem clínica antes de chegar à porta. A Agenda é da clínica inteira, recepção inclusive, então a equipe toda ver agenda, faltas, confirmações e pacotes é o mesmo que a tela mostra.
3. **Números iguais aos das telas.**
   - **Média das pesquisas:** a fórmula foi recalculada no `clinicAssistant.js` porque `gestaoSummary` não carrega fora do Vite. O teste confere contra o `buildGestaoSummary` real, carregado pelo Vite. **Aceitável:** se a fórmula da tela mudar, o teste quebra.
   - **4 números do convênio:** repetem linha a linha os filtros de `buildTissTiles` (`tissXml.js:361-364`: lotes gerados, guias esperando, valor esperando, glosas). Isso é conta paralela, mas copiada exatamente e conferida pelo teste contra o texto do quadro. **Aceitável agora.**
     - Melhor alternativa, em task própria: o `buildTissTiles` devolveria esses quatro números, e a assistente leria de lá.
     - Por que não fiz: `tissXml.js` não é desta entrega.
   - **pacotes_fim:** ver a correção 3.
4. **Fonte que falha e limites.** Toda fonte que falha vira `erro`, nunca zero. A conferência de limite agora cobre as 8 consultas (correções 1 e 2). A lista acima de 50 itens vira `limite_linhas` com o resumo, que a Edge aceita. Períodos de 94 dias e agenda sem período são recusados.
   - **Observação:** `loadTissData` e `loadFiscalData` não têm `.limit` e dependem do teto de linhas do servidor. É a mesma conta que a tela Financeiro faz hoje, não é coisa nova da assistente.
5. **Financeiro, horários vagos e correções intactos.** Os testes `clinic-assistant`, `clinic-assistant-finance` e de correções não tiveram nenhuma asserção mexida. A import nova do financeiro está numa linha separada, para não quebrar a asserção literal do teste T1.
6. **Prompt sem inventar.**
   - Diz "Estas consultas NÃO trazem paciente: nunca invente nome", usa o resumo quando vem `limite_linhas`, trata a média com vírgula e `null` = nenhuma respondida, e diz que operadora não é cobrança ao paciente.
   - Agora também diz que o pacote da Agenda não é o da "Sua atenção hoje".
   - A ajuda ganhou dois itens novos, sem mudar os existentes, e o corpus confere com o script.

### Ressalva para o Orquestrador (não bloqueia, mas pede decisão)

- **pacotes_fim em uso real:** busca a agenda da clínica inteira em ±180 dias, numa única leitura com teto de 2000 linhas. Uma clínica com uns 15 atendimentos por dia passa de 2000 em 360 dias. Nesse caso a consulta vai devolver `erro` sempre: nunca um número errado, mas inútil na prática. Eu não tenho como medir o volume real, porque produção é proibida.

  **Opções:**
  1. Encurtar a janela para −30/+180 dias. Ajuda pouco.
  2. Uma leitura só das linhas com `recurrence_group_id`, ou uma RPC de contagem por série. Resolve, mas mexe em serviço ou SQL e volta ao dev.
  3. Aceitar como está e ver na prática.

  **Recomendo a 2**, numa task própria.
- **Agenda e faltas da equipe toda** num período de 93 dias também podem bater no teto em clínica grande. A mensagem de `erro` ("não foi possível consultar agora") faz a pessoa tentar de novo em vez de estreitar o período. Um motivo próprio, por exemplo `limite_fonte` com "Estreite o período ou escolha um profissional", seria mais honesto. É mudança de contrato (AG-5), então fica para decisão.

### Quality depois da correção

`npm run quality` sozinho, exit 0: segurança, lint, 1493 testes (1492 ok, 1 pulado — xmllint ausente, já conhecido, 0 falhas), build e orçamento do bundle.
