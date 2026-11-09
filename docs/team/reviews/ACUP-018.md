## ACUP-018 — Review do QA (Lucas, 09/11/2026)

- Entrega: `claude/dev2` 9a8387d (base `integracao` cc4462b), contrato FIN-7. Review na `qa/ACUP-018`, criada de `claude/dev2`.
- Veredito: **APROVADO com correção do QA** (commit `fix(ACUP-018)` nesta branch). A correção é pequena e fica nos dois arquivos espelhados da própria entrega, mais o teste.

### Escopo

- O diff contra cc4462b tem 6 arquivos, todos da lista do handoff: `clinicAssistant.js`, `assistantConsulta.ts`, `clinic-assistant/index.ts`, o teste financeiro, o bullet da assistente no `AGENTS.md` e o handoff.
- Nenhuma migration, nenhuma SQL e nenhuma tela. PROD-2 não é tocado.
- Dados só fictícios. Não houve chamada a banco, Gemini ou produção.

### Quality

- Antes da correção, rodando sozinho, o resultado bateu com o do dev: 1486 testes, 1485 ok, 1 pulado, 0 falhas. Lint, build e bundle passaram.
- Depois da correção, rodando sozinho: ver o fim deste arquivo.

### Achados e correção do QA

1. **Sobrenome colado passava como "primeiro nome".** A Edge e o aparelho só recusavam `paciente` com espaço, então uma resposta forjada passava inteira até o modelo com qualquer um destes valores:
   - `Lúcia.Souza` ou `Lúcia_Souza`;
   - `Lúcia` + espaço invisível (U+200B ou U+2060) + `Souza`;
   - um CPF (`123.456.789-09`), um e-mail, uma data de nascimento (`1986-03-04`) ou um telefone.

   Isso contradiz o foco (1). No aparelho, um cadastro com o nome escrito `Ana.Souza` também saía inteiro, porque `firstNameOf` só cortava no espaço.

   **Correção:** o paciente agora segue uma regra única, `FINANCE_FIRST_NAME = /^\p{L}[\p{L}\p{M}'’-]{0,39}$/u`. É uma palavra só, feita de letras, e aceita acento, apóstrofo e hífen (`Maria-Clara`, `D'Ávila`). A regra vale nos dois lados, espelhada e conferida pelo teste de espelho:
   - na linha da resposta: uma linha fora dela derruba a resposta inteira, como já acontecia com o espaço;
   - no pedido: vira `filtro_invalido`, sem devolver o valor.

   O `firstNameOf` agora corta em tudo que não é letra. `Lúcia.Souza`, `(Lúcia) Souza` e `-Lúcia- Souza` viram `Lúcia`.
2. **A Edge aceitava "sessão paga" em pacote parcelado.** Uma linha `pacote_parcelas` com `sessoes_pagas: 3` passava pelos dois leitores. Isso contradiz o foco (4) e o FIN-7 ("parcela, nunca sessão paga").

   **Correção:** a lista `FINANCE_NULL_BY_FORM` diz, para cada forma, as contagens que precisam vir null:
   - parcelado: sem contagem de sessão;
   - avulso e convênio: sem parcela e sem "sessão N de M";
   - pacote por sessão: sem parcela.

   Uma linha incoerente derruba a resposta. O aparelho já montava as linhas assim, e nenhuma linha verdadeira muda.
3. **Teste de regressão**, em `clinic-assistant-finance.test.mjs`, o "QA 09/11/2026…". Ele cobre:
   - os 9 valores colados acima, no recorte de linha e em `por_paciente`, nos dois lados, e mais o pedido;
   - nomes válidos (com acento decomposto inclusive);
   - parcelado com cada contagem de sessão;
   - avulso com parcela ou "sessão N de M";
   - `firstNameOf` com cadastro colado;
   - consulta real com os nomes do cadastro escritos com ponto, que sai sem sobrenome.

   Com o código da entrega, o teste falha: Edge antiga dá 2 falhas e aparelho antigo dá 2 falhas. Com a correção, o focado passa 21/21.

### Os 7 pontos do foco

1. **Nada além do primeiro nome e da idade.** Forjei respostas contra a Edge e contra o aparelho, numa sonda fora do repositório. Testei:
   - nome completo, nome com NBSP, tab e espaço ideográfico;
   - objeto aninhado na linha, no paciente e em `totais`;
   - campo a mais no topo;
   - idade 131 ou 4,5, área inventada, arquivado com idade.

   Tudo vira `erro` sem o valor, ou some na remontagem das chaves. Os buracos que sobravam eram os do achado 1, já corrigidos. Nascimento, CPF e contato não saem do aparelho: o teste "FIN-5 aparelho" faz uma varredura recursiva das chaves em todos os recortes.
2. **Idade.** `ageOn` usa `todayInClinic(now)` (confirmado em `assistantTools.js`). Aniversário hoje conta, amanhã não. 29/02 vira 01/03 no ano comum. Sem data, data impossível, data no futuro ou acima de 130 anos dão null. 02/11 02:00 UTC ainda é 01/11 em São Paulo. Tudo coberto e passando.
3. **por_area.** O total bate com Recebidos da tela mais os depósitos da operadora. A operadora vem em `operadora_centavos`, separada. O em aberto de `por_paciente` bate com `groupReceivablesByPatient` paciente a paciente. Conferi a conta do teste, e o código usa `buildReceivables`, `operatorReceiptsFrom` e `isConvenioCharge`, sem conta paralela.
4. **por_paciente.** Conferido:
   - avulso: 3 feitas, 2 pagas, recebimento anulado não conta;
   - pacote por sessão: "sessão 4 de 10";
   - parcelado: parcelas, com sessões null;
   - convênio: `da_operadora` e, quando a operadora paga, `em_dia`;
   - sem valor: nem paga nem devida;
   - limite: 50 linhas em dia passam e 51 dão `limite_linhas`; 93 dias valem.

   A Edge agora também recusa sessão paga em parcelado (achado 2).
5. **Chave `package:<p>:session:<c>`.** Funciona: os ids são UUID, sem `:`. Também é coberta pela mutação (c) do dev. É frágil porque depende do formato de texto da chave em `finance.js`.
   - **Melhor alternativa, para outra task:** o item de pacote do `buildReceivables` passaria a trazer um campo próprio, por exemplo `sessionChargeId`. Não serve reaproveitar `chargeId`: outras telas leem `chargeId` como "cobrança avulsa".
   - **Por que não fiz agora:** `finance.js` não é desta entrega, e o risco atual é baixo porque uma mudança no formato faz o teste falhar.
6. **FIN-1/2/3/6, orçamento e uso.** No `clinic-assistant/index.ts`, o diff toca só o import de `FINANCE_FILTERS`, o schema (`status` e `idade`) e o trecho do prompt. Ficaram sem nenhuma mudança: `readAuthorizedConsultaResult`, `enforceAiBudget` e `usageContextFor`. Das asserções antigas, só saiu a linha das 6 chaves (T2). As fixtures passaram para o v2, como o FIN-7 autoriza.
7. **Prompt.** As regras novas não inventam:
   - parcelado nunca vira "sessão paga";
   - convênio nunca vira "o paciente deve";
   - homônimo é dito só como "dois pacientes com o mesmo nome";
   - sem idade, só o primeiro nome;
   - total = quantidade de linhas.

   A frase final só dá para ver com a função republicada.

### Observações (não bloqueiam)

- O `profissional` da linha continua sendo texto livre, como na v1. Uma resposta forjada pode levar ali qualquer texto até 120 letras. Esse campo é o nome curto da equipe, não dado de paciente, e a Edge não tem como saber os nomes reais da equipe (a lista também vem do aparelho). Se quiserem fechar, o caminho é uma regra de letras, espaço e ponto para esse campo, numa task própria.
- `sessao_atual` conta as sessões do pacote até hoje, não até o fim do período. Numa consulta de um mês passado, o "sessão N de M" é o número de hoje.
- Uma sessão de pacote por sessão com preço 0 conta como paga, porque `buildReceivables` não gera item para ela. É raro.
- O dev já anotou que uma parcela zerada pelo desconto de encerramento conta como paga.
- O texto de `ambiguo` ("Informe o nome completo") agora só aparece para profissional. Para paciente, o desempate é por idade e o filtro nunca dá `ambiguo`. Está coerente.
- Prints não se aplicam: nenhuma tela mudou.

### Quality depois da correção

`npm run quality` sozinho, exit 0: segurança, lint, 1487 testes (1486 ok, 1 pulado — xmllint ausente, já conhecido, 0 falhas), build e orçamento do bundle.
