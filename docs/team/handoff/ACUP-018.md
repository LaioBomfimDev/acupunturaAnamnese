## ACUP-018 — Contrato financeiro v2: primeiro nome + idade, sessões e totais por área

- Dev: sessão Claude "Documentos timbrados na gestão" (DEV2-1). Pasta `acup-team/dev2`, branch `claude/dev2`, base `integracao` cc4462b. Commit de entrega: `git log -1` desta branch.
- Contrato aprovado pelo Orquestrador como FIN-7 (opção A + acréscimos 1–6), com as decisões menores (i) 29/02 → 01/03 e (ii) "Paciente arquivado" sem idade.
- Sem SQL, sem tela nova, sem publicação, sem push. Dados 100% fictícios; nenhuma chamada a banco, Gemini ou Vertex.

### O que mudou

- **Paciente sai do aparelho só como primeira palavra do nome + idade** (`firstNameOf`, `ageOn` em `utils/clinicAssistant.js`). A idade é calculada no aparelho a partir de `birth_date` em `todayInClinic` (fuso da clínica). A data de nascimento nunca sai. Sem data, data impossível, no futuro ou acima de 130 anos: `idade: null`, nunca inventada. O campo `age` antigo do cadastro não é usado. Nascido em 29/02 completa ano em 01/03 no ano comum.
- **Linha dos recortes antigos** (recebidos, a_receber, atrasados) passa de 6 para 9 chaves: `paciente`, `idade`, `homonimo`, `area`, `profissional`, `valor_centavos`, `vencimento`, `pagamento`, `status`. `area` = rótulo da disciplina da cobrança ou do pacote (`FINANCE_AREAS` = rótulos de `data/disciplines.js` + "Sem área").
- **Recorte novo `por_area`** ("quanto recebi em outubro"): recebimentos não anulados do paciente + `operatorReceiptsFrom(tissPaid)` com data de pagamento no período, somados por área. Linha: `area`, `paciente_centavos`, `operadora_centavos`, `total_centavos`. `totais` traz a soma geral nas mesmas três chaves. Não tem nome de paciente.
- **Recorte novo `por_paciente`** ("quem falta pagar", "quem está em dia"): uma linha por paciente × área × profissional × forma (e por pacote). O aberto e o pago vêm dos itens de `buildReceivables`, com os mesmos `receipts` e `operatorReceiptsFrom` da tela: o que está no A receber está em aberto, o que não está foi pago.
  - **avulso:** `sessoes_feitas`, `sessoes_pagas`, `sessoes_sem_valor` (preço nulo: nem paga nem devida).
  - **pacote_por_sessao:** idem no período, mais `sessao_atual` / `sessoes_previstas` ("sessão 4 de 10"). O resto do encerramento ("rest") entra no aberto, sem contar sessão.
  - **pacote_parcelas** (à vista ou parcelado): a dívida está nas parcelas. Conta `parcelas_pagas` / `parcelas_em_aberto` só das parcelas que vencem até o fim do período, mais `sessao_atual` / `sessoes_previstas`. As contagens de sessão vão null, para nunca virar "sessão paga". Entra se tem sessão no período ou parcela vencendo nele.
  - **convenio:** com aberto, `situacao: 'da_operadora'`, nunca dívida do paciente. Quando a operadora paga, `em_dia`.
  - `situacao` ∈ `atrasado`, `em_aberto`, `da_operadora`, `em_dia`. A linha `em_dia` aparece e conta no limite de 50.
- **Homônimos:** `homonimo: true` quando primeiro nome + idade + profissional empatam entre pacientes diferentes. O prompt manda dizer só "dois pacientes com o mesmo nome". O pedido ganhou `idade` (opcional) para desempatar. O filtro por paciente casa a primeira palavra exata (sem acento e caixa), com a idade se vier. Sem nenhum, `nao_encontrado`. Vários com idades diferentes saem todos, cada um com a sua idade.
- **Pedido com nome completo** (`paciente` com espaço) vira `filtro_invalido` antes das fontes (só `can_manage_finance` é chamado). O nome nunca é devolvido no eco do pedido. Texto novo de `filtro_invalido` pede "só o primeiro nome".
- **Edge (`_shared/assistantConsulta.ts`)**, espelho conferido pelo teste:
  - recusa `paciente` com espaço no pedido e em toda linha da resposta, aceitando só o rótulo fixo `Paciente arquivado` com `idade: null`;
  - recusa `idade` fora de 0..130 ou não inteira, `area` fora da lista, forma e situação fora das listas, e `situacao` incoerente com o aberto ou com a forma;
  - remonta cada objeto só com as chaves do recorte, então nada aninhado atravessa;
  - uma linha fora do contrato derruba a resposta inteira (`motivo: 'erro'`, `linhas: []`), sem guardar o valor. Isso é mais estrito que só descartar a linha: assim nada é cortado calado (FIN-4) e o modelo nunca recebe meia lista.
- **`clinic-assistant/index.ts`:** `status` usa `FINANCE_FILTERS`; `idade` entrou no schema; `paciente` descrito como "SÓ o primeiro nome". Prompt, só no trecho de sessões e totais: quando usar `por_area`/`por_paciente`, como ler cada forma (parcelado nunca "sessão paga", convênio nunca "o paciente deve"), "Lucas, 7 anos" e homônimo. A frase de capacidades da administração ganhou "por área" e "sessões ou parcelas"; o começo, que o teste da 017 confere, ficou igual. FIN-1 (`readAuthorizedConsultaResult`), FIN-3/FIN-6, orçamento e `usageContextFor` intocados.
- **`AGENTS.md`:** só o bullet "Assistente da clínica", trocando o recorte "primeiro nome e idade" pela regra v2 (ageOn, homônimo, recortes, `FINANCE_KEYS` espelhado, FIN-7).

### Arquivos

- `frontend/src/utils/clinicAssistant.js` (bloco financeiro; imports de `isConvenioCharge` e `DISCIPLINES`)
- `supabase/functions/_shared/assistantConsulta.ts` (bloco financeiro, espelho)
- `supabase/functions/clinic-assistant/index.ts` (schema + trecho do prompt)
- `frontend/tests/regression/clinic-assistant-finance.test.mjs`
- `AGENTS.md` (bullet da assistente)
- este handoff

`assistantTools.js` não precisou mudar: a conta nova está em `summarizeFinance`, que já morava em `utils/clinicAssistant.js` (arquivo de propriedade), e reusa `buildReceivables`, `isConvenioCharge` e `operatorReceiptsFrom`, sem conta paralela de dinheiro. A única leitura além dos itens é a chave do item de sessão de pacote (`package:<pacote>:session:<cobrança>`), porque o item de pacote do `buildReceivables` não traz `chargeId`. Está comentado no código e coberto por mutação.

### Testes e asserções

- Asserções antigas alteradas (autorizadas no FIN-7):
  1. T2: as chaves da linha passam de 6 para as 9 do v2.
  2. As fixtures mudam para o v2: o `row` ganha `idade`/`homonimo`/`area`; o paciente fictício passa a se chamar "Lúcia", com nascimento; a cobrança ganha `discipline`. Com o paciente de nome de uma palavra só, as asserções "paciente === patients[0].name" das fontes reais e da operadora continuam valendo sem mudar o texto.
  - Nenhuma outra asserção mudou. O mock de pacientes e equipe passou a ler `state.patients`/`state.members` (com o valor antigo de reserva), e o `reset` limpa os dois.
- 10 testes novos em `clinic-assistant-finance.test.mjs`:
  - espelho de recortes, chaves, áreas e limites;
  - idade: aniversário hoje e amanhã, 29/02, sem data, data impossível e fuso (02/11 02:00 UTC ainda é 01/11 em São Paulo);
  - lista fechada de chaves em TODOS os recortes, recursiva, sem sobrenome, nascimento, CPF ou contato;
  - contrato antigo falha (nome completo, linha v1, idade inválida, área inventada, arquivado com idade, objeto aninhado);
  - pedido com nome completo recusado antes das fontes;
  - homônimos;
  - contagem por forma (avulso, pacote por sessão, parcelado, convênio, em dia, sem valor);
  - totais batendo com a tela (Recebidos + depósitos da operadora; A receber por paciente = `groupReceivablesByPatient`);
  - FIN-4 nos recortes novos (50/51 linhas, em dia conta, 93 dias);
  - Edge recusando resposta forjada com nome completo mesmo com FIN-1 autorizado.
- Achado de teste: o `after()` de topo apaga `globalThis.__acupFinanceTest` antes dos testes que vêm depois de `await`s de topo. O `resetCase` repõe o estado.
- Mutações em disco, restauradas em seguida: (a) o aparelho voltar a mandar o nome completo → 6 falhas; (b) a Edge aceitar nome com espaço → 2 falhas; (c) perder a sessão de pacote em aberto → 2 falhas. **3/3 detectadas.**

### Comandos

- Focado: `node --test frontend/tests/regression/clinic-assistant-finance.test.mjs` → 20/20.
- Gate: ver a linha "Gate" no fim deste arquivo.

### Roteiro para o QA

1. Rodar o focado e o gate. Conferir no diff que só os 5 arquivos acima mudaram.
2. Ler `readFinanceResult` dos dois lados: chaves remontadas por recorte, `financePatientLabel`, `financeAge` e coerência de `situacao`.
3. Forjar na Edge: `paciente: 'Nome Sobrenome'` em cada recorte, `idade: 131`, `area: 'X'`, objeto aninhado. Tudo deve virar `erro` sem o valor.
4. Conferir que `por_paciente` nunca traz `sessoes_pagas` em pacote parcelado e nunca `em_aberto` de convênio como dívida do paciente.
5. Conferir o caso fictício de totais contra a conta da tela (Recebidos + Da operadora; A receber).
6. Prompt: trecho novo de `por_area`/`por_paciente` e homônimo; FIN-1, FIN-3/6, orçamento e uso intactos.

### Limites

- `parcelas_pagas` = parcelas vencidas até o fim do período menos as em aberto, contando as linhas da tabela de parcelas. Se o desconto de encerramento zerar a última parcela, ela conta como paga (o `installmentsAfterDiscount` do Financeiro é interno). Palpite de impacto: raro e pequeno.
- Recebido de pacote cai na área do pacote. Recebido sem cobrança nem pacote achados cai em "Sem área".
- O prompt foi conferido só como texto. Não houve chamada real ao Gemini; a qualidade da frase final só aparece com a função republicada (PUB-1, com o humano).
- Deno não está instalado: sem `deno check`. Os tipos do espelho TS são simples (`Record<string, unknown>`). Ruby/Rails não se aplica.
- Prints: nenhuma tela mudou (só o contrato enviado à IA), portanto não se aplicam.

### Gate

- `npm run lint`: exit 0, sem avisos.
- `npm test`: exit 0, **1486 testes, 1485 aprovados, 1 pulado, 0 falhas**, 180526 ms.
- `npm run build`: exit 0, 1,86 s (avisos conhecidos de import dinâmico/chunk).
- `git diff --check` limpo.
