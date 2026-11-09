## ACUP-024 — Review do QA (Lucas, 09/11/2026)

- **Entrega:** `claude/dev2` d0550f3 (9d60489 + a linha do "N de 3"; base `integracao` f227800). Desenho AG-6. Review na `qa/ACUP-024`, criada de `claude/dev2`.
- **Veredito:** **APROVADO com correção do QA** (`fix(ACUP-024)` nesta branch): uma linha no aparelho e o teste. **O gate inteiro está pendente:** o sistema parou o `npm run quality` por falta de memória (ver "Quality").

### Escopo

- **Arquivos:** 7. São os autorizados: `assistantStore`, `clinicAssistantService`, `ClinicAssistant.jsx` (1 linha), `clinic-assistant/index.ts`, `clinic-assistant.test` e o `rounds.test` novo, mais o handoff.
- **`clinic-assistant.test`:** só as 2 asserções de "uma volta só" mudaram, e passaram a cobrar "até 3".
- **Fora do escopo, nada tocado:** nenhuma SQL e nenhuma migration (PROD-2 intacto).

### Quality

- **`npm run quality` da entrega:** o sistema parou a rodada por falta de memória. Os arquivos de teste morreram em cerca de 15 ms cada, com "test failed" e sem nenhuma asserção, porque os processos não subiram. É o mesmo padrão da ACUP-020 e não é defeito do código. Não rodei de novo por conta própria.
- **Testes rodados um por vez, com a correção:**

  | Teste | Resultado |
  |---|---|
  | `clinic-assistant-rounds` | 10/10 |
  | `clinic-assistant` (inclui o limite do mês com a linha literal) | 27/27 |
  | `clinic-assistant-finance` | 21/21 |
  | `clinic-assistant-agenda` | 9/9 |
  | `clinic-assistant-finance-corrections` | 7/7 |

  O ESLint dos dois arquivos que mudei está limpo.
- **Pendente:** rodar o quality inteiro antes de juntar.

### Correção do QA

**O problema:** quando uma consulta lança erro no laço, o aparelho mandava só `{ tipo, motivo: 'erro' }`. Os leitores de agenda, pesquisas e financeiro conferem o período antes do motivo. Sem `de`/`ate`, o resultado virava `periodo_invalido` ("Informe início e fim válidos…"). A IA então pediria à pessoa outro período, quando o problema foi a busca. Conferi pela Edge: agenda, pesquisas e financeiro davam `periodo_invalido`; convênio e horários vagos davam `erro`.

**A correção:** o aviso mantém os filtros do pedido, que já vieram limpos pela Edge: `{ ...pedido, motivo: 'erro' }`. Continua sem a mensagem da fonte.

**O teste:** no `rounds.test`, a falha em faltas, agenda, pesquisas e financeiro agora tem de chegar à Edge como `erro`. Com o código da entrega, ele falha (1 falha). Ajustei a asserção do dev para o corpo novo; ela continua conferindo que nenhum SEGREDO sai.

### Os 6 pontos do foco

1. **Voltas contadas pelo que veio.**
   - `readRounds` roda antes da porta, do orçamento e do Gemini.
   - `dadosAnteriores` sem `dados`, que não seja lista ou com mais de 2 itens dá 400.
   - Um item recusado depois pela porta continua contando como volta.
   - Mandar menos itens só abre uma pergunta "nova", com limite e orçamento próprios. A Edge não guarda estado, como o handoff declara e o AG-6 aceita. Um pedido nunca leva mais de 3 resultados ao modelo.
2. **Mesma porta para todos.**
   - `dados` passa pela linha do FIN-1 sem mudança, e o teste antigo continua conferindo essa linha.
   - Cada item de `dadosAnteriores` passa pela mesma `readAuthorizedConsultaResult` em toda chamada.
   - Item financeiro sem permissão ou de outra clínica sai, e a volta conta. O dev testa isso pela porta real.
3. **Toda chamada ao Gemini pela `generate`.** Cada chamada passa por `enforceAiBudget` e para em `if (budgetResponse) return budgetResponse;`, grava uso com `usageContextFor` e usa `maxOutputTokens: 1500` e `THINKING_LOW`.
   - A chamada extra da 3ª volta é no máximo uma: o teste conta 2 `await generate(`.
   - Com o orçamento estourado na extra, o fluxo para na hora (`instanceof Response`).
   - O teste do limite do mês com a linha literal passa sem mudança.
4. **Tetos de tamanho.** Os dois são conferidos antes do Gemini e do orçamento, e nada é cortado calado:
   - corpo acima de 128 KB dá 413 com a frase clara (`payload_too_large` de `readClinicalJsonBody`, antes virava "Mensagem vazia");
   - dados aceitos acima de 64.000 caracteres dão 413.

   **Observação sobre a conta do pior caso:** o teste do dev usa um paciente de 11 letras e um profissional de 80. Pelo contrato, o paciente vai até 40 e o profissional até 120. Calculei 3 consultas `por_paciente` de 50 linhas:

   | Caso | Tamanho | Resultado |
   |---|---|---|
   | Teste do dev | 63.772 | cabe |
   | Máximo do contrato | 74.122 | 413 claro |
   | Nomes realistas ("Ana Paula S.") | 53.572 | cabe |

   Não bloqueia: nada é cortado calado, e nomes reais ficam bem abaixo do teto. Se o Orquestrador quiser o máximo do contrato cabendo, basta subir para 80.000. O corpo de 128 KB ainda comporta isso.
5. **FIN-3/6.** O marcador `financeiro: true` aparece se qualquer volta foi financeira, nos dois lados: o aparelho olha os resultados, e a Edge olha `dados`, os anteriores aceitos e o contexto.
6. **Repetida, falha e erro da Edge.**
   - Consulta repetida (mesmo tipo e filtros, em qualquer ordem de chaves) reusa o resultado e conta a volta.
   - Uma falha não para as outras e não vaza a mensagem da fonte. Agora chega à IA com o motivo certo (correção acima).
   - Erro da Edge (limite do mês, 400, 413, 422) para o laço na hora.
   - O aparelho nunca manda uma 5ª chamada.

### Observações

- **Custo:** o pior caso por pergunta passa de 2 para 5 chamadas ao Gemini (1 + 3 + a extra), todas pelo limite do mês.
- **Prompt:** "Consultas feitas nesta pergunta: N de 3", uma consulta por vez, sem repetir, e na 3ª responder com o que tem. A regra antiga ("Se a consulta já foi tentada e não há DADOS_CONSULTADOS aceitos… não peça outra consulta") continua valendo e é coerente: quando a porta recusa tudo, a IA não insiste.
- **Prints:** a tela mudou só no texto "Consultando os dados da clínica… 2 de 3", dentro da bolha de espera. Não fiz print, porque o estado é transitório e o texto é conferido pelo teste.

### Quality depois da correção

Pendente, ver "Quality" acima.
