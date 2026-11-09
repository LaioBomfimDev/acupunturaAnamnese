# Financeiro: compras com recibo interno + assistente que responde sobre o financeiro

## Objetivo
Parte A: em Saídas, registrar cada compra (até uma água) com itens, categoria, forma de pagamento e quem comprou, e gerar recibo interno numerado para imprimir ou salvar em PDF.
Parte B: a assistente virtual passa a responder qualquer dúvida de financeiro, tanto de uso (como funciona) quanto de números (mês, gastos, compras, equipe).
Tudo só para `clinic_admin` (`can_manage_finance`). Sem anexo de cupom, sem fornecedor, sem controle de reembolso.

## Decisões já tomadas
- Recibo interno, "sem valor fiscal" escrito no documento.
- Compra entra em Saídas (botão ao lado de "+ Lançar saída"), sempre já paga.
- Não se edita nem se apaga: só anula com motivo. Recibo anulado continua existindo, marcado ANULADO.
- "Quem comprou" reaproveita `professional_id` / `person_id` de `finance_expenses`.
- Assistente: números do financeiro e nomes da equipe entram; **nome de paciente nunca** (atraso vira contagem, não lista). Só para a administração; recepção e profissional recebem "isso é da administração" com o caminho da tela.

## Parte A: compras e recibo

**Banco** (migration nova `supabase/migrations/20261106_financeiro_compras_recibos.sql`, parte da `20261023_financeiro_etapa1.sql`):
- `finance_expenses`: colunas `receipt_number TEXT` e `is_purchase BOOLEAN NOT NULL DEFAULT FALSE`; índice único `(clinic_id, receipt_number)` onde não nulo. A guarda `finance_guard_money_rows` já impede editar; as colunas só nascem no INSERT.
- `finance_receipt_counters (clinic_id, year, last_number)`, PK nomeada, RLS leitura admin. Número `AAAA-000123` sequencial, tirado com `INSERT ... ON CONFLICT ON CONSTRAINT <pk> DO UPDATE ... RETURNING` na mesma transação da compra (falha não gasta número).
- `finance_purchase_items (id, clinic_id, expense_id, position, description 1..120, quantity numeric(10,3) > 0, unit_cents >= 0, total_cents)`; RLS leitura admin; trigger bloqueia UPDATE/DELETE.
- RPC `finance_register_purchase(p_category, p_paid_on, p_method, p_professional, p_person, p_note, p_items JSONB)`: `finance_require_admin()`, valida categoria/pessoa da mesma clínica, 1..50 itens, data não futura, soma dos itens vira `amount_cents`, descrição = resumo dos itens, devolve a linha com o número. `REVOKE`/`GRANT` no bloco final de assinaturas.
- `finance_void_expense` segue valendo para compras.

**Tela**
- `services/financeiroService.js`: `registerPurchase`; `loadFinanceData` lê `finance_purchase_items`.
- `utils/finance.js`: `purchaseItemTotal`, `purchaseTotal`, `formatReceiptNumber` (mesma conta do SQL, em centavos).
- `FinanceDialogs.jsx`: `PurchaseDialog` (itens com + / remover, total ao vivo, categoria, data, `MethodPicker`, quem comprou); depois de salvar oferece "Imprimir recibo".
- `FinanceSaidas.jsx`: botão "+ Registrar compra"; em Pagas, nº do recibo, botão "Recibo" e marca de anulada.
- Novo `PurchaseReceipt.jsx`: recibo no papel timbrado (`PrintLetterhead`, `PrintFooter`, `paginateReportBody`, como `PatientEvolutionTimeline`), com carimbo ANULADO + motivo.
- `styles/financeiro.css`: linhas de item e carimbo.

## Parte B: assistente sabe o financeiro

Hoje a assistente não lê o banco: pede uma `consulta`, o aparelho de quem perguntou faz a conta com o login e as mesmas funções da tela, e devolve só o resultado em `dados`. A Parte B segue esse desenho (nada de service role no servidor).

**1. Como funciona (dúvidas de uso)**
- `frontend/src/data/screenHelp.js` (`FINANCEIRO_HELP`): completar com compras e recibo, ordem de preço (tipo do profissional > tipo da instituição > padrão do profissional > padrão da instituição), pacote de valor fechado, repasse (percentual ou fixo, por atendimento ou recebimento), saídas fixas, anulação com motivo, convênios. Fonte única das regras para a assistente.
- Regenerar `supabase/functions/_shared/assistantHelpCorpus.ts` com `frontend/scripts/sync-assistant-help.mjs`.

**2. Consultas de números (admin)** — novos tipos em `ASSISTANT_CONSULTAS`, espelhados em `utils/clinicAssistant.js` e `_shared/assistantConsulta.ts`:
- `financeiro_resumo`: mês pedido (`dia` = qualquer dia do mês): entrou, saiu, resultado, a receber, em atraso (valor e nº de pacientes), a pagar, repasses, entradas por área e por forma de pagamento.
- `financeiro_gastos`: saídas pagas do mês por categoria e as maiores saídas (descrição + valor), com as compras (nº do recibo, itens resumidos, quem comprou).
- `financeiro_equipe`: repasses e pagamentos do mês por pessoa (equipe e pessoas sem login), pagos e a pagar.
- `financeiro_meses`: entrou/saiu/resultado dos últimos N meses (`dias` reaproveitado como N, padrão 3, máx 12) para "como foi o trimestre?" e comparações.
- Formato novo no retorno: `fatos: [{ rotulo, texto }]` com o valor já formatado em reais pelo aparelho (`formatBRL`), para a IA nunca refazer conta nem errar centavos; `linhas` atuais continuam para contagens. `readConsultaResult` aceita `fatos` (até 60, texto até 60 caracteres) e continua sem campo de paciente.
- `services/assistantTools.js`: `runAssistantConsulta` ganha os 4 tipos, usando `loadFinanceData` + `buildReceivables`, `buildPayouts`, `buildPayables`, `buildMonthSummary` (as mesmas de `FinanceiroScreen`), nunca uma segunda conta. Extrair a montagem de `derived` de `FinanceiroScreen` para função em `utils/finance.js` (`buildFinanceView(data, month, today)`) usada pela tela e pela assistente, para os números nunca divergirem.
- Servidor: `readConsulta` recebe o papel; tipo `financeiro_*` de quem não é `admin` é descartado, e o aparelho também confere o papel. Erro de RLS vira `motivo: 'erro'`.

**3. Prompt da assistente** (`supabase/functions/clinic-assistant/index.ts`):
- `CAPABILITIES`: incluir financeiro (mês, gastos, compras, equipe/repasses, como cada coisa funciona). Trocar `NOT_YET` para "não leio dados de paciente (fichas, evoluções, escalas, anamneses)".
- Regras de consulta: descrever os 4 tipos, usar `fatos` literalmente (sem recalcular), dizer o mês, nunca citar paciente, e para quem não é administração dizer que o financeiro é da administração e indicar o caminho.
- Remover "financeiro" da frase de "dado que você ainda não lê".
- `OUTPUT_SCHEMA`: enum já vem de `ASSISTANT_CONSULTAS`. `maxOutputTokens` fica.
- `SCREEN_LABELS.financeiro` e links por aba já existem (`ASSISTANT_SECTION_LINKS`); acrescentar "Compras" se virar aba, o que o plano não prevê.

**4. Painel "Sua atenção hoje"**: sem mudança. Opcional futuro: compra sem categoria.

## Riscos
- Privacidade: valores e nomes da equipe vão ao Gemini (Vertex) na hora da pergunta, só do administrador, sem paciente. Hoje já vão horários e nomes da equipe; salário/repasse por pessoa é mais sensível, por isso `financeiro_equipe` só roda quando a pergunta pede.
- Duas contas diferentes seriam o pior erro: por isso `buildFinanceView` único e teste que compara a saída da assistente com `buildMonthSummary`.
- Número do recibo sem buraco: contador na mesma transação.
- Validar a RPC de verdade em transação com ROLLBACK (colisão de nomes do PL/pgSQL).
- Corpus gerado: se `screenHelp.js` mudar sem rodar o script, o teste de `clinic-assistant` falha (é o desejado).
- Migration e deploy da Edge Function `clinic-assistant` são passos da administração; não faço deploy.

## Verificação
- `node --test frontend/tests/regression/financeiro-compras.test.mjs` (novo): itens, número, guarda, anulação, RPC no SQL.
- `node --test frontend/tests/regression/financeiro-etapa1.test.mjs` e `frontend/tests/regression/clinic-assistant.test.mjs` (estendido: tipos novos nos dois espelhos, `fatos`, financeiro só para admin, prompt sem "nem o financeiro", corpus em dia).
- `cd frontend && npm run lint && npm run build`.

## Steps
1. Criar `supabase/migrations/20261106_financeiro_compras_recibos.sql` com colunas novas, `finance_receipt_counters`, `finance_purchase_items` (RLS e bloqueio de UPDATE/DELETE) e `finance_register_purchase` com GRANTs.
2. Em `frontend/src/utils/finance.js`, adicionar `purchaseItemTotal`, `purchaseTotal`, `formatReceiptNumber` e extrair `buildFinanceView(data, month, today)` da `FinanceiroScreen`, que passa a usá-la.
3. Em `frontend/src/services/financeiroService.js`, adicionar `registerPurchase` e carregar `finance_purchase_items` em `loadFinanceData`.
4. Criar `PurchaseDialog` em `FinanceDialogs.jsx` com itens, total ao vivo, categoria, data, forma e quem comprou.
5. Criar `components/financeiro/PurchaseReceipt.jsx` (papel timbrado, aviso sem valor fiscal, carimbo ANULADO) e ligar a impressão.
6. Em `FinanceSaidas.jsx`, adicionar "+ Registrar compra" e, em Pagas, número do recibo, botão "Recibo" e marca de anulada; ajustar `styles/financeiro.css`.
7. Completar `FINANCEIRO_HELP` em `frontend/src/data/screenHelp.js` e regenerar `_shared/assistantHelpCorpus.ts` com `sync-assistant-help.mjs`.
8. Adicionar `financeiro_resumo`, `financeiro_gastos`, `financeiro_equipe` e `financeiro_meses` em `utils/clinicAssistant.js` e `_shared/assistantConsulta.ts`, com `fatos` em `readConsultaResult` e filtro por papel admin em `readConsulta`.
9. Implementar os 4 tipos em `frontend/src/services/assistantTools.js` usando `buildFinanceView`, com valores formatados em reais e sem nome de paciente.
10. Atualizar o prompt em `supabase/functions/clinic-assistant/index.ts` (capacidades, regras de consulta financeira, `NOT_YET`, regra para quem não é administração).
11. Criar `frontend/tests/regression/financeiro-compras.test.mjs` e estender `clinic-assistant.test.mjs` para os casos acima.
12. Atualizar `AGENTS.md` (parágrafos do Financeiro e da Assistente da clínica) com compras, recibos e as consultas financeiras da assistente.
13. Rodar os três testes, `npm run lint` e `npm run build`, e conferir a RPC em transação com ROLLBACK quando houver banco disponível.
