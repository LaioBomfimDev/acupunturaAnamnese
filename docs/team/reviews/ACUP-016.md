## ACUP-016 — revisão

- Veredito: **APROVADO**
- Commit revisado: `df00796` (codex/lk, base integracao `6580f7d`). Branch de revisão: `qa/ACUP-016`.
- Gate: `npm run quality` verde: entrega do dev com 1453 testes (1452 ok, 1 pulado); com o meu teste, 1454 (1453 ok, 1 pulado, 0 falhas), rodado sozinho, sem mutação em andamento. Lint e build ok.
- SQL: não há. Invariantes AGENTS.md: ok. A regra nova no bullet da assistente é da ACUP-017.
- Área sensível (nome de paciente + dinheiro para o Gemini): conferida com dados 100% fictícios, sem rede, sem produção e sem ajudante LLM.
- Correções que eu fiz: só teste (a Edge podia aceitar uma resposta "parecida com true" sem o teste notar).

### FIN-1: a Edge confere no servidor
Script meu, com o espelho real `_shared/assistantConsulta.ts` e a função `readAuthorizedConsultaResult` **extraída do `index.ts`**, executada com um banco simulado.
- **Variações do `tipo` forjado:**
  - Viram "financeiro" depois da limpeza e por isso **passam pela conferência do servidor**: `"  financeiro  "`, `"financeiro\u0000"`, `"\tfinanceiro"`, `" financeiro"`.
  - Não viram "financeiro" e são descartadas antes (`null`, nenhuma chamada ao banco): `"FINANCEIRO"`, `"Financeiro"`, cirílico `"financeirо"`, espaço invisível `"finan​ceiro"`, ligadura `"ﬁnanceiro"`, lista `["financeiro"]`.
  - Não há variação que leve linhas financeiras sem passar pela conferência.
- **Resposta do servidor:** devolve só com `data === true`. Descarta com `false`, `null`, erro, exceção e também com `"true"`, `1`, `{}` e `[true]` (teste meu).
- **Identidade:** sempre `p_clinic` = clínica do perfil do servidor e `p_user` = `caller.user.id`. `clinic_id` e `user_id` forjados no corpo são ignorados.
- **Horários vagos:** seguem sem nenhuma chamada a `can_manage_finance` (terapeuta e recepção continuam, teste do dev).
- `can_manage_finance(p_clinic UUID, p_user UUID DEFAULT auth.uid())` existe com essa assinatura (20261023): a chamada com service role e `p_user` está certa.

### T1 aparelho
- `runFinanceConsulta` recusa antes de qualquer fonte quem não é `clinic_admin`, quem não tem `clinic_id`, e quando `can_manage_finance` não devolve `true`.
- A administração de outra clínica só vê a própria clínica: o perfil e a RLS são dela.
- Erro vira o motivo `erro`, nunca zero.

### T2: lista fechada
- **Aparelho:** do cadastro do paciente só sai o nome (`patientById` = `row.name`). Com paciente fictício carregando CPF, telefone, e-mail, endereço, observação e carteirinha, nenhum desses valores aparece na saída.
- **Edge:** campos extras forjados na linha (`cpf`, `telefone`, `email`, `carteirinha`, `observacao`, `evolucao`, `patient_id`) e no corpo não atravessam. A linha sai só com `paciente`, `profissional`, `valor_centavos`, `vencimento`, `pagamento` e `status`.

### Mesmos números da tela A receber
- Mesma função `buildReceivables` de `utils/finance.js`, com a mesma soma `receipts + operatorReceiptsFrom(tissPaid)` que a `FinanceiroScreen` usa. O atraso vem de `row.late`; não há conta própria.
- Caso fictício: pagamento parcial, recebimento anulado, atendimento anulado, convênio com lote enviado e prazo vencido, e convênio sem lote.
  - Tela: aberto **650,00**, atrasado **300,00**. Assistente: a receber **650,00**, atrasados **300,00**. Iguais.
  - Recebidos: só o recebimento válido (50,00); o anulado fica fora.
  - Convênio com lote vencido sai como `atrasado_operadora`, nunca cobrando o paciente.
  - Convênio sem lote sai como `aguardando_lote_operadora` com `vencimento: null`, e o critério dito: "Data de vencimento; convênio aguardando lote ou prazo usa a data do atendimento e não é cobrança ao paciente.".

### FIN-4
- 01/01 a 03/04 (**93 dias inclusivos**) passa; 01/01 a 04/04 (94) dá `limite_periodo`, "Escolha um período de até 93 dias para consultar o financeiro.". Datas invertidas e 30/02 dão `periodo_invalido`.
- **50 linhas** passam inteiras; **51** dão `limite_linhas`, "Há mais de 50 itens. Estreite o período, o paciente ou o profissional.", com 0 linhas e sem corte. A Edge também recusa 51 linhas forjadas, sem cortar.

### FIN-2
- Nenhum `console`/log em `assistantTools.js`, em `utils/clinicAssistant.js`, no espelho e na Edge.
- Os erros da Edge são textos fixos, e o "SEGREDO" da exceção não aparece (teste do dev).
- O registro de uso (`usageContextFor` → `ai_usage_events`) não mudou: só tokens.

### Asserções e espelho
- `clinic-assistant.test.mjs`: o diff tem só dois trechos, na linha 441 (continua proibindo `full_session`/leitura clínica; paciente só no ramo financeiro) e na linha 448 (exige `readAuthorizedConsultaResult` com identidades do caller e o parser dentro). As linhas 292 e 295 continuam intactas.
- O espelho aparelho × Edge é igual nos 6 itens (`FINANCE_MAX_DAYS`, `MAX_ROWS`, `FILTERS`, `ROW_STATUS`, `CRITERIA`, `REASONS`), e o teste confere.
- O `OUTPUT_SCHEMA` ganhou só `de`, `ate`, `status` e `paciente` (o prompt fica para a 017).

### O teste morde
Fiz 20 mutações. Na entrega, 18 eram pegas. Passavam:
- "A Edge aceita valor truthy" (`!data` no lugar de `data !== true`). Furo de rigor: hoje a função devolve booleano, mas o teste não exigia.
- "O aparelho manda telefone", que é equivalente: `summarizeFinance` devolve tudo pelo `readFinanceResult`, que reconstrói a linha só com T2.

Depois do meu teste, **19/20** (a que sobra é a equivalente). As pegas incluem: tirar a conferência, usuário ou clínica vindos do corpo, exceção liberando, conferir antes de normalizar, exigir permissão financeira nos horários, `cpf` no espelho, corte calado em 50, 94 dias, espelho divergente, aparelho sem checar papel ou sem RPC, fontes carregadas antes da permissão, conta própria de atraso, sem recebimento da operadora, vencimento inventado no convênio, erro virando zero e `console.log` com dados.

### Correção que eu fiz
- `clinic-assistant-finance.test.mjs`: um bloco do QA. Ele exige que a Edge descarte `data` diferente do booleano `true` (`"true"`, `1`, `"sim"`, `{}`, `[true]`); que tipos com espaço, tab ou NBSP passem pela conferência e sejam descartados quando negados; e que maiúscula, cirílico ou espaço invisível nunca virem financeiro nem chamem o banco.

### Observações (não bloqueiam)
1. Os outros tipos de consulta (contagens) aceitam rótulos de texto de até 80 caracteres vindos do aparelho. Quem não é administração pode mandar ali o texto que quiser, mas é o próprio usuário escrevendo, como já pode fazer na pergunta. Não abre o financeiro da clínica, então não é escalada. Fica registrado.
2. Uma linha cujo paciente não está em `listClinicPatients` sai como "Paciente arquivado". Se a lista também omitir paciente por outro motivo, o rótulo pode não ser exato. Vale a 017 instruir a assistente a não afirmar o motivo.
3. Os números da tela A receber podem mudar se `buildReceivables` mudar: a assistente acompanha sozinha, porque importa a mesma função.
