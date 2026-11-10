// ============================================================
// Financeiro: Contas do mês e gasto rápido (10/11/2026, opção A). O que
// estes testes guardam:
// - as contas do mês saem em grupos por situação (vencida, vence hoje,
//   a vencer, paga, não houve) e contam pela data do serviço;
// - conta que muda todo mês leva a previsão até ser paga; paga, vale o
//   que saiu de verdade;
// - formas de pagamento da saída = CHECK do banco (Transferência, Boleto);
// - toda saída paga ganha número de comprovante na mesma sequência das
//   compras, por gatilho, sem a tela escolher número;
// - gasto rápido sem categoria escolhida, lançado pela administração ou
//   pela recepção, e a recepção nunca lê o resto do financeiro;
// - a aba nova está no menu, no quadro do Resumo, na ajuda e nos
//   atalhos da assistente.
// ============================================================

import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import * as finance from '../../src/utils/finance.js';
import { FINANCEIRO_HELP } from '../../src/data/screenHelp.js';
import { ASSISTANT_SECTION_LINKS } from '../../src/utils/clinicAssistant.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => readFile(path.join(root, file), 'utf8');
const sql = await read('../supabase/migrations/20261110b_financeiro_contas_do_mes.sql');

const month = finance.monthOf('2026-11-10');
const today = '2026-11-10';
const rec = (id, description, day, extra = {}) => ({
  id, description, day_of_month: day, frequency: 'monthly', starts_on: '2026-01-01', active: true,
  category_id: 'cat', amount_cents: 10000, amount_varies: false, ...extra,
});
const paid = (recurringId, occurrenceOn, amountCents, paidOn, extra = {}) => ({
  id: `exp-${recurringId}-${occurrenceOn}`, recurring_id: recurringId, occurrence_on: occurrenceOn,
  amount_cents: amountCents, paid_on: paidOn, method: 'pix', skipped: false, receipt_number: '2026-000001', ...extra,
});

test('contas do mês em grupos por situação', () => {
  const bills = finance.buildMonthBills({
    recurring: [
      rec('aluguel', 'Aluguel', 5),
      rec('terapeutas', 'Pagamento dos terapeutas', 7),
      rec('internet', 'Internet', 10),
      rec('luz', 'Energia elétrica', 12, { amount_cents: 62000, amount_varies: true }),
      rec('agua', 'Água', 15, { amount_cents: null, amount_varies: true }),
      rec('manutencao', 'Manutenção de equipamentos', 20),
    ],
    expenses: [
      paid('aluguel', '2026-11-05', 280000, '2026-11-05'),
      { ...paid('manutencao', '2026-11-20', 0, null), skipped: true, receipt_number: null, method: null },
    ],
    month,
    today,
  });
  const names = group => bills.groups[group].map(item => item.description);
  assert.deepEqual(names('late'), ['Pagamento dos terapeutas']);
  assert.deepEqual(names('today'), ['Internet']);
  assert.deepEqual(names('upcoming'), ['Energia elétrica', 'Água']);
  assert.deepEqual(names('paid'), ['Aluguel']);
  assert.deepEqual(names('skipped'), ['Manutenção de equipamentos']);

  // Previsão até pagar; sem previsão, "valor muda" (fica fora da soma e é contada à parte).
  const luz = bills.groups.upcoming[0];
  assert.equal(luz.amountCents, 62000);
  assert.equal(luz.varies, true);
  assert.equal(bills.groups.upcoming[1].amountCents, null);
  assert.equal(bills.openWithoutAmount, 1);

  // Paga vale o que saiu, não o cadastro.
  assert.equal(bills.groups.paid[0].amountCents, 280000);
  assert.equal(bills.paidCents, 280000);
  assert.equal(bills.openCents, 10000 + 10000 + 62000);
  assert.equal(bills.fixedCents, 280000 + 10000 + 10000 + 62000);
  assert.equal(bills.paidPercent, Math.round((280000 / (280000 + 82000)) * 100));
});

test('conta fixa conta no mês do vencimento, mesmo paga no mês seguinte', () => {
  const recurring = [rec('aluguel', 'Aluguel', 28)];
  const expenses = [paid('aluguel', '2026-10-28', 280000, '2026-11-02')];
  const october = finance.buildMonthBills({ recurring, expenses, month: finance.monthOf('2026-10-15'), today });
  const november = finance.buildMonthBills({ recurring, expenses, month, today });
  assert.equal(october.groups.paid.length, 1);
  assert.equal(october.paidCents, 280000);
  assert.equal(november.paidCents, 0, 'pagamento de outubro feito em novembro não entra em novembro');
  assert.deepEqual(november.groups.upcoming.map(item => item.dueOn), ['2026-11-28']);
});

test('saída fixa desativada só aparece no que já foi pago', () => {
  const recurring = [rec('tel', 'Telefone', 3, { active: false }), rec('net', 'Internet', 4, { active: false })];
  const bills = finance.buildMonthBills({ recurring, expenses: [paid('tel', '2026-11-03', 8990, '2026-11-03')], month, today });
  assert.deepEqual(bills.items.map(item => item.description), ['Telefone']);
});

test('anulada volta a ficar em aberto; gasto rápido e compra contam no dia pago', () => {
  const recurring = [rec('net', 'Internet', 4)];
  const expenses = [
    paid('net', '2026-11-04', 12990, '2026-11-04', { voided_at: '2026-11-05T10:00:00Z', void_reason: 'errado' }),
    { id: 'q1', is_quick: true, description: 'Almoço do time', amount_cents: 18600, paid_on: '2026-11-06', method: 'cartao_credito', receipt_number: '2026-000010', created_at: '2026-11-06T15:00:00Z' },
    { id: 'q2', is_quick: true, description: 'Água', amount_cents: 2800, paid_on: '2026-11-03', method: 'dinheiro', receipt_number: '2026-000009', created_at: '2026-11-03T10:00:00Z', voided_at: '2026-11-03T11:00:00Z', void_reason: 'dobrado' },
    { id: 'p1', is_purchase: true, description: 'Material', amount_cents: 5000, paid_on: '2026-10-30', method: 'pix', receipt_number: '2026-000008', created_at: '2026-10-30T10:00:00Z' },
  ];
  const bills = finance.buildMonthBills({ recurring, expenses, month, today });
  assert.deepEqual(bills.groups.late.map(item => item.description), ['Internet']);
  assert.deepEqual(bills.quick.map(row => row.id), ['q1', 'q2'], 'compra de outubro fica fora; anulado aparece riscado');
  assert.equal(bills.quickCents, 18600, 'anulado não soma');
  assert.equal(bills.paidCents, 18600);
});

test('lista da planilha: as 16 contas, na ordem, sem valor nem dia inventados', () => {
  assert.deepEqual(finance.FIXED_BILL_TEMPLATE.map(row => row.name), [
    'Aluguel', 'Energia elétrica', 'Água', 'Internet', 'Telefone', 'Sistema de gestão', 'Contabilidade',
    'Salários e encargos', 'Pagamento dos terapeutas', 'Materiais de escritório', 'Materiais terapêuticos',
    'Produtos de limpeza', 'Manutenção de equipamentos', 'Marketing e publicidade', 'Impostos e taxas', 'Outras despesas',
  ]);
  for (const row of finance.FIXED_BILL_TEMPLATE) {
    assert.ok(!('amount' in row) && !('day' in row), `${row.name} não traz valor nem dia`);
  }
});

test('formas de pagamento da saída = CHECK do banco', () => {
  const check = sql.match(/finance_expenses_method_check CHECK \(\s*method IS NULL OR method IN \(([^)]*)\)/);
  assert.ok(check, 'CHECK das formas da saída');
  const db = check[1].split(',').map(item => item.trim().replace(/'/g, ''));
  assert.deepEqual([...db].sort(), finance.EXPENSE_METHODS.map(row => row.id).sort());
  const rpc = sql.match(/p_method NOT IN \(([^)]*)\)/);
  assert.deepEqual(rpc[1].split(',').map(item => item.trim().replace(/'/g, '')).sort(), [...db].sort());
  // Boleto da saída não vira "Boleto da operadora".
  assert.equal(finance.methodLabel('boleto'), 'Boleto');
  assert.equal(finance.methodLabel('transferencia'), 'Transferência');
  assert.equal(finance.methodLabel('ted'), 'TED da operadora');
});

test('número do comprovante: gatilho, mesma sequência das compras, só quando paga', () => {
  assert.match(sql, /CREATE TRIGGER trg_finance_expenses_receipt_number\s+BEFORE INSERT OR UPDATE ON public\.finance_expenses/);
  assert.match(sql, /INSERT INTO public\.finance_receipt_counters AS c/);
  assert.match(sql, /NEW\.paid_on IS NOT NULL AND NOT NEW\.skipped AND NEW\.receipt_number IS NULL/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.finance_next_expense_receipt\(UUID\) FROM PUBLIC, anon, authenticated/);
  // Pagar uma saída "a pagar" pode receber o número; depois, nada muda.
  assert.match(sql, /v_pay_cols TEXT\[\] := ARRAY\['paid_on', 'method', 'paid_by', 'receipt_number'\]/);
  assert.match(sql, /OLD\.paid_on IS NULL AND NEW\.paid_on IS NOT NULL AND OLD\.receipt_number IS NULL/);
});

test('gasto rápido: administração ou recepção; recepção não lê o resto', async () => {
  assert.match(sql, /public\.can_manage_finance\(v_clinic\)\s+OR \(public\.is_receptionist\(auth\.uid\(\)\) AND public\.can_manage_agenda\(v_clinic\)\)/);
  assert.match(sql, /FUNCTION public\.finance_register_quick_expense\([\s\S]*?v_clinic UUID := public\.finance_require_quick\(\);/);
  // A lista devolve só o gasto rápido.
  assert.match(sql, /AND e\.is_quick\s+AND e\.paid_on BETWEEN p_from AND p_to/);
  // Nenhuma policy nova em finance_expenses: a leitura direta segue só da administração.
  assert.doesNotMatch(sql, /CREATE POLICY[^;]*finance_expenses/);
  // Anular segue só da administração (finance_void_expense não muda aqui).
  assert.doesNotMatch(sql, /FUNCTION public\.finance_void_expense/);

  const screen = await read('src/components/financeiro/QuickExpensesScreen.jsx');
  assert.match(screen, /listQuickExpenses/);
  assert.doesNotMatch(screen, /loadFinanceData|voidExpense/, 'a tela da recepção não carrega o financeiro nem anula');
  const app = await read('src/App.jsx');
  assert.match(app, /showHubFinance && isReceptionist/);
  assert.match(app, /onOpenQuickExpenses=\{isReceptionist \?/);
});

test('gasto rápido não tem categoria na tela; a interna some das escolhas', async () => {
  const form = await read('src/components/financeiro/QuickExpenseForm.jsx');
  assert.doesNotMatch(form, /category|Categoria/, "nem campo nem rótulo de categoria");
  for (const file of ['FinanceConfig.jsx', 'FinanceDialogs.jsx', 'PurchaseDialog.jsx']) {
    const source = await read(`src/components/financeiro/${file}`);
    assert.match(source, /system_key !== 'avulsa'/, `${file} esconde a categoria interna`);
  }
});

test('aba nova no menu, no Resumo, na ajuda e na assistente', async () => {
  const screen = await read('src/components/financeiro/FinanceiroScreen.jsx');
  assert.match(screen, /\{ id: 'contas', label: 'Contas do mês' \}/);
  assert.match(screen, /ids: \['contas', 'apagar', 'pagas', 'equipe'\]/);
  assert.match(screen, /\n {4}contas: \{\r?\n {6}display:/);
  assert.match(screen, /section === 'contas' && <ContasDoMes/);
  assert.equal(FINANCEIRO_HELP.contas.title, 'Contas do mês');
  assert.match(FINANCEIRO_HELP.contas.reading.join(' '), /data do serviço/);
  assert.deepEqual(ASSISTANT_SECTION_LINKS.contas, { screen: 'financeiro', label: 'Contas do mês' });
  const mirror = await read('../supabase/functions/_shared/clinicAssistant.ts');
  assert.match(mirror, /contas: \{ screen: 'financeiro', label: 'Contas do mês' \}/);
});

test('aviso de que conta pela data do serviço fica visível na tela', async () => {
  const source = await read('src/components/financeiro/ContasDoMes.jsx');
  assert.match(source, /Em teste<\/span>\r?\n\s+Conta pela data do serviço/);
});
