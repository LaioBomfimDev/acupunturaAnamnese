## ACUP-024 — Assistente, fase 1: até 3 consultas por pergunta

- Dev: sessão Claude "Documentos timbrados na gestão" (dev2). Pasta `acup-team/dev2`, branch `claude/dev2`, sobre a `integracao` f227800 (a 023 aprovada, com f5617f1), juntada antes de começar. Commit de entrega: `git log -1` desta branch.
- Desenho aprovado como AG-6 (laço, `dadosAnteriores`, acréscimos 1–5).
- Sem SQL, sem publicação, sem push. Nenhuma chamada a banco ou Gemini; testes com Edge e fontes falsas.

### O que mudou

**Aparelho (`clinicAssistantService.askAssistantWithTools`)**
- O laço substitui a "uma volta só". Quem decide a próxima consulta é a IA (`consulta` na resposta); o aparelho executa e conta.
- Volta N manda `dados` = resultado novo e `dadosAnteriores` = os anteriores, já limpos pelas mesmas funções de hoje. A conversa (`messages`) é a mesma em todas as voltas; nada do texto do modelo de uma volta entra na outra.
- Até `ASSISTANT_MAX_ROUNDS = 3`. Se a IA pedir a 4ª, o aparelho para com `ASSISTANT_ROUNDS_MESSAGE` e nunca manda a 5ª chamada.
- Consulta repetida (mesmo tipo e filtros, sem importar a ordem das chaves) reusa o resultado já obtido, sem buscar de novo, e a volta conta.
- Consulta que lança erro vira `{ tipo, motivo: 'erro' }`, sem a mensagem da fonte; a pergunta segue e a IA diz o que faltou.
- Erro da Edge (limite do mês, 400, 413, 422) é lançado na hora; nenhuma volta seguinte é chamada.
- `financeiro: true` se QUALQUER volta foi financeira (FIN-3/6). `askAssistant` também olha `dadosAnteriores`.
- `askAssistantWithTools` aceita `invoke` e `tools` só para teste; na tela continua o import dinâmico.

**Tela (`assistantStore.js`)**
- `onStep(etapa, volta)` grava `sendingRound` (1 a 3), zerado a cada pergunta.
- O texto "Consultando… 2 de 3" depende de `ClinicAssistant.jsx`, que não está na lista; hoje a tela segue com "Consultando os dados da clínica…". Para mostrar a volta, falta UMA linha nesse componente (autorizar numa task).

**Edge (`clinic-assistant/index.ts`)**
- `readRounds(body, 3)`: voltas = itens de `dadosAnteriores` + (`dados` ? 1 : 0), contadas pelo que VEIO, antes da porta. `dadosAnteriores` que não seja lista, que venha sem `dados` ou com mais de 2 itens → 400 com a mesma frase, antes da porta, do orçamento e do Gemini.
- `dados` continua passando pela linha do FIN-1 sem mudança. Cada item de `dadosAnteriores` passa pela MESMA `readAuthorizedConsultaResult` em toda chamada (lista fechada + permissão). O recusado sai calado do prompt, mas a volta conta (forjar menos itens não dá voltas a mais).
- DADOS_CONSULTADOS virou uma lista (anteriores + o mais novo). O prompt diz "Consultas feitas nesta pergunta: N de 3", pede uma consulta por vez, sem repetir, e na 3ª manda responder com o que tem.
- Toda chamada ao Gemini passa pela função `generate`: `enforceAiBudget` (com o `if (budgetResponse) return budgetResponse;` que o teste do limite exige) + `usageContextFor` + `maxOutputTokens: 1500` + `THINKING_LOW`.
- Na 3ª volta (voltas = 3), consulta pedida não é devolvida. Se o modelo só pediu consulta, a Edge faz UMA chamada a mais ("AGORA: já foram feitas 3 consultas. Não peça consulta. Responda…"), que também passa pelo limite e grava uso. Se ainda vier sem resposta, 422 com a frase. É no máximo uma chamada extra (o teste conta).
- FIN-3/6 na Edge: `financeiro: true` também quando algum item aceito de `dadosAnteriores` é financeiro (a condição antiga continua igual).
- O `consulta` do schema diz "UMA consulta, só quando faltar dado, até 3, sem repetir".

**Teto de tamanho (pedido 2 do AG-6)**
- `ASSISTANT_MAX_DADOS_CHARS = 64_000`: soma do JSON dos dados ACEITOS (anteriores + o mais novo). Acima disso, 413 "As consultas trouxeram dados demais para uma resposta só. Pergunte por partes ou estreite o período.", antes do Gemini e do orçamento, nunca cortando.
- Por que 64 mil: o maior resultado legítimo é o financeiro `por_paciente` com 50 linhas e nomes no tamanho máximo, cerca de 21 mil caracteres. Três deles dão 63.426, e o teste confere que cabem. 64 mil caracteres são cerca de 16 mil tokens, ao lado de um prompt que já usa até 60 mil caracteres de correções e ajuda.
- `ASSISTANT_MAX_BODY_BYTES = 128_000` (era 48 mil): 12 mensagens de até 1.500 caracteres (até cerca de 36 KB em UTF-8) mais 3 resultados (cerca de 64 KB) dão uns 100 KB. Corpo acima do limite agora volta 413 com a mesma frase clara; antes virava "Mensagem vazia".

### Arquivos

- `frontend/src/services/clinicAssistantService.js`
- `frontend/src/components/assistant/assistantStore.js` (só `sendingRound`)
- `supabase/functions/clinic-assistant/index.ts`
- `frontend/tests/regression/clinic-assistant.test.mjs`: só as duas asserções de "uma volta só" (aparelho `second.consulta` e Edge `dados ? null : readConsulta`) viraram "até 3".
- novo `frontend/tests/regression/clinic-assistant-rounds.test.mjs`
- este handoff

### Testes (`clinic-assistant-rounds.test.mjs`, 10 testes)

- Espelho 3/frase aparelho × Edge.
- Aparelho com 0, 1, 2 e 3 voltas: corpo de cada chamada (`dados`, `dadosAnteriores`, mesmas `messages`) e etapas 1..N.
- 4ª recusada (3 buscas, 4 chamadas, sem 5ª).
- Repetida reusa e conta, inclusive com chaves em outra ordem.
- Falha vira aviso sem SEGREDO e segue.
- Orçamento estourado na 2ª chamada para tudo.
- Marcador financeiro quando só a 1ª volta foi financeira.
- `readRounds` com 0..3 voltas e quatro formas forjadas; ordem: recusa antes da porta e do Gemini.
- Item anterior sem permissão (financeiro e outra clínica) descartado pela porta real, com as voltas contadas.
- Teto e corpo: constantes, ordem antes do Gemini e pior caso cabendo.
- Chamada extra da 3ª volta: orçamento, uso, tokens e pensamento em cada chamada; no máximo uma extra; 422 só depois.

**Mutações** em disco, restauradas: tirar o limite do aparelho → falha; Edge aceitando 3 anteriores → falha; anteriores sem a porta → falha. **3/3.**

A primeira versão quebrou o teste existente "limite do mês em todas as funções de IA" (que exige `if (budgetResponse) return budgetResponse;` antes de cada `vertexGenerateContent`). Corrigi o código, não o teste: `generate` devolve a própria resposta do limite e quem chama confere `instanceof Response`.

### Gate

Ver a linha "Gate" no fim deste arquivo.

### Roteiro para o QA

1. Rodar o teste novo, os 4 da assistente e o gate.
2. Ler o laço do aparelho e, na Edge, `readRounds` → porta dos anteriores → teto → `generate` → chamada extra.
3. Forjar `dadosAnteriores` com 3 itens, sem `dados`, ou com item sem permissão.
4. Conferir a ordem "recusa antes do Gemini e do orçamento".

### Limites

- A Edge não guarda estado: ela confia na CONTAGEM que o pedido traz, mas limita pelo formato (no máximo 2 anteriores + 1), então um pedido nunca leva mais de 3 resultados ao modelo. Quem mandar menos itens para "zerar" a conta só consegue fazer novas perguntas, cada uma com o próprio limite e o próprio orçamento.
- O pior caso de custo por pergunta passa de 2 para 5 chamadas ao Gemini (1 + 3 + a extra), todas pelo limite do mês.
- Prompt conferido só como texto; sem Deno (`deno check` não rodou). A sintaxe do `index.ts` foi conferida tirando os tipos e rodando `node --check`.
- Publicar: precisa do site e da `clinic-assistant`. Nunca da dev2.

### Gate

- `npm run lint`: exit 0, sem avisos.
- `npm test`: exit 0, **1503 testes, 1502 aprovados, 1 pulado, 0 falhas**, 179593 ms.
- `npm run build`: exit 0, 1,60 s.
