// ============================================================
// Para o contador (11/11/2026, etapa 3). O que estes testes guardam:
// - relatório por data do serviço (padrão, em teste) ou do pagamento,
//   com anulado fora dos totais e marcado, e "depois do fechamento";
// - semana de domingo a sábado e período de no máximo um ano e um mês;
// - comparação de meses com a diferença para o mês anterior;
// - a planilha .xlsx abre: dinheiro como número em reais, data como data;
// - fechamento trava pela DATA DO PAGAMENTO (decisão de 11/11/2026),
//   totais calculados no banco, só mês terminado, reabrir com motivo;
// - abas novas no menu, no Resumo, na ajuda e na assistente.
// ============================================================

import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import * as report from '../../src/utils/financeReport.js';
import { buildXlsx, excelDateSerial, sheetName } from '../../src/utils/xlsxExport.js';
import { monthOf } from '../../src/utils/finance.js';
import { FINANCEIRO_HELP } from '../../src/data/screenHelp.js';
import { ASSISTANT_SECTION_LINKS } from '../../src/utils/clinicAssistant.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => readFile(path.join(root, file), 'utf8');
const sql = await read('../supabase/migrations/20261111_financeiro_fechamento_mes.sql');

const october = monthOf('2026-10-15');
const lookups = {
  chargesById: new Map([
    ['ch-out', { id: 'ch-out', service_on: '2026-10-28', appointment_type: 'session', discipline: 'psicologia' }],
  ]),
  patientsById: new Map([['p1', { id: 'p1', name: 'Ana Paciente' }]]),
  categoriesById: new Map([['cat', { id: 'cat', name: 'Contas de consumo' }], ['av', { id: 'av', name: 'Gastos avulsos', system_key: 'avulsa' }]]),
  vouchersByGroup: new Map([['g1', 7]]),
  providerByExpense: new Map([['e-rep', { number: 3, signed_at: null }]]),
};
const receipts = [
  // Sessão de outubro paga em novembro.
  { id: 'r1', group_id: 'g1', patient_id: 'p1', charge_id: 'ch-out', amount_cents: 20000, method: 'pix', received_on: '2026-11-03', created_at: '2026-11-03T12:00:00Z' },
  // Pacote pago em outubro: data do serviço = dia do pagamento.
  { id: 'r2', group_id: 'g2', patient_id: 'p1', package_id: 'pk', amount_cents: 50000, method: 'dinheiro', received_on: '2026-10-05', created_at: '2026-10-05T12:00:00Z' },
  { id: 'r3', group_id: 'g3', patient_id: 'p1', package_id: 'pk', amount_cents: 1000, method: 'pix', received_on: '2026-10-06', created_at: '2026-10-06T12:00:00Z', voided_at: '2026-11-08T12:00:00Z', void_reason: 'errado' },
];
const expenses = [
  // Conta fixa de outubro paga em novembro.
  { id: 'e-luz', recurring_id: 'luz', occurrence_on: '2026-10-25', paid_on: '2026-11-02', amount_cents: 62000, method: 'boleto', category_id: 'cat', description: 'Energia elétrica', receipt_number: '2026-000040', created_at: '2026-11-02T12:00:00Z' },
  { id: 'e-rep', paid_on: '2026-10-30', amount_cents: 400000, method: 'transferencia', category_id: 'cat', description: 'Repasse', receipt_number: '2026-000031', created_at: '2026-10-30T12:00:00Z' },
  { id: 'e-q', is_quick: true, paid_on: '2026-10-12', amount_cents: 2800, method: 'dinheiro', category_id: 'av', description: 'Água', receipt_number: '2026-000020', created_at: '2026-11-09T12:00:00Z' },
  { id: 'e-skip', recurring_id: 'tel', occurrence_on: '2026-10-10', skipped: true, amount_cents: 0, category_id: 'cat', description: 'Telefone' },
];

test('por data do serviço: serviço de outubro pago em novembro entra em outubro', () => {
  const rows = report.buildReportRows({ receipts, expenses, lookups, range: october, basis: 'servico' });
  assert.deepEqual(rows.entradas.map(row => row.id), ['r2', 'r3', 'r1']);
  assert.deepEqual(rows.saidas.map(row => row.id), ['e-q', 'e-luz', 'e-rep']);
  assert.equal(rows.totals.inCents, 70000, 'anulado fica fora');
  assert.equal(rows.totals.outCents, 62000 + 400000 + 2800);
  assert.equal(rows.entradas.find(row => row.id === 'r1').receiptNumber, '0007');
  assert.equal(rows.entradas.find(row => row.id === 'r1').what, 'Sessão');
  assert.equal(rows.saidas.find(row => row.id === 'e-q').category, 'Gasto rápido', 'categoria interna vira "Gasto rápido"');
  assert.equal(rows.saidas.find(row => row.id === 'e-rep').providerNumber, '0003');
  assert.equal(rows.totals.missingProvider, 1);
  assert.equal(rows.totals.voidedCount, 1);
});

test('por data do pagamento: o que saiu de verdade em outubro', () => {
  const rows = report.buildReportRows({ receipts, expenses, lookups, range: october, basis: 'pagamento' });
  assert.deepEqual(rows.entradas.map(row => row.id), ['r2', 'r3']);
  assert.deepEqual(rows.saidas.map(row => row.id), ['e-q', 'e-rep']);
  assert.equal(rows.totals.resultCents, 50000 - 402800);
});

test('com o mês fechado, o que mudou depois fica marcado', () => {
  const closing = { closed_at: '2026-11-05T12:00:00Z' };
  const rows = report.buildReportRows({ receipts, expenses, lookups, range: october, basis: 'servico', closing });
  const late = [...rows.entradas, ...rows.saidas].filter(row => row.afterClose).map(row => row.id).sort();
  assert.deepEqual(late, ['e-q', 'r3'], 'gasto lançado depois e recebimento anulado depois');
  assert.equal(rows.totals.afterCloseCount, 2);
});

test('semana de domingo a sábado; período limitado', () => {
  assert.deepEqual(report.weekOf('2026-11-11'), { from: '2026-11-08', to: '2026-11-14' });
  assert.deepEqual(report.weekOf('2026-11-08'), { from: '2026-11-08', to: '2026-11-14' });
  assert.deepEqual(report.reportRange({ kind: 'mes', anchor: '2026-11-20' }).from, '2026-11-01');
  assert.equal(report.rangeError({ from: '2026-11-10', to: '2026-11-01' }), 'A data inicial é depois da final.');
  assert.equal(report.rangeError({ from: '2025-01-01', to: '2026-11-01' }), 'Escolha no máximo um ano e um mês.');
  assert.equal(report.rangeError({ from: '2026-01-01', to: '2026-12-31' }), '');
});

test('comparação: meses em ordem e diferença para o anterior', () => {
  const months = report.lastMonths(monthOf('2026-11-10'), 3);
  assert.deepEqual(months.map(month => month.key), ['2026-09', '2026-10', '2026-11']);
  const totals = { '2026-09': [100000, 50000], '2026-10': [120000, 50000], '2026-11': [90000, 60000] };
  const comparison = report.buildMonthComparison({
    months,
    rowsFor: month => ({ totals: { inCents: totals[month.key][0], outCents: totals[month.key][1], resultCents: totals[month.key][0] - totals[month.key][1], byCategory: [['Aluguel', totals[month.key][1]]] } }),
  });
  assert.deepEqual(comparison.columns.map(column => column.inChange), [null, 20, -25]);
  assert.deepEqual(comparison.columns.map(column => column.outChange), [null, 0, 20]);
  assert.deepEqual(comparison.categories, [{ name: 'Aluguel', values: [50000, 50000, 60000] }]);
  assert.equal(report.formatChange(20), '+20%');
  assert.equal(report.formatChange(-25), '−25%');
  assert.equal(report.formatChange(null), '');
});

test('planilha .xlsx abre com dinheiro em reais e data de verdade', async () => {
  assert.equal(excelDateSerial('1900-03-01'), 61);
  assert.equal(excelDateSerial('2000-01-01'), 36526);
  assert.equal(sheetName('Saídas: outubro/2026', 0), 'Saídas  outubro 2026');
  const rows = report.buildReportRows({ receipts, expenses, lookups, range: october, basis: 'servico' });
  const blob = await buildXlsx(report.reportSheets({ report: rows, range: { ...october, kind: 'mes', month: october }, basisLabel: 'Data do serviço' }));
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const workbook = await zip.file('xl/workbook.xml').async('string');
  assert.match(workbook, /<sheet name="Resumo"[^>]*\/><sheet name="Entradas"[^>]*\/><sheet name="Saídas"/);
  const entradas = await zip.file('xl/worksheets/sheet2.xml').async('string');
  assert.match(entradas, /<c r="I2" s="2"><v>500<\/v><\/c>/, 'R$ 500,00 como número em reais');
  assert.match(entradas, new RegExp(`<c r="A2" s="3"><v>${excelDateSerial('2026-10-05')}</v></c>`), 'data como data');
  assert.match(entradas, /Anulado: errado/);
  const styles = await zip.file('xl/styles.xml').async('string');
  assert.match(styles, /formatCode="dd\/mm\/yyyy"/);
  assert.ok(zip.file('[Content_Types].xml'));
});

test('fechamento trava pela data do pagamento e calcula os totais no banco', () => {
  assert.match(sql, /CREATE TRIGGER trg_finance_receipts_closed_month\s+BEFORE INSERT ON public\.finance_receipts/);
  assert.match(sql, /CREATE TRIGGER trg_finance_expenses_closed_month\s+BEFORE INSERT OR UPDATE ON public\.finance_expenses/);
  assert.match(sql, /CREATE TRIGGER trg_convenio_payments_closed_month\s+BEFORE INSERT ON public\.convenio_payments/);
  assert.match(sql, /IF TG_OP = 'INSERT' OR OLD\.paid_on IS NULL THEN\s+v_day := NEW\.paid_on;/);
  assert.doesNotMatch(sql, /occurrence_on/, 'nunca pela data do serviço');
  assert.match(sql, /'base', 'data_do_pagamento'/);
  assert.match(sql, /VALUES \(v_clinic, v_month, auth\.uid\(\), public\.finance_month_snapshot\(v_clinic, v_month\)\)/, 'totais vêm do banco, nunca da tela');
  assert.match(sql, /v_month >= date_trunc\('month', public\.finance_today\(\)\)::DATE THEN\s+RAISE EXCEPTION 'Só fecha mês que já terminou\.'/);
  assert.match(sql, /RAISE EXCEPTION 'Diga o motivo para reabrir o mês\.'/);
  assert.match(sql, /RAISE EXCEPTION 'Fechamento não se apaga: reabra com motivo\.'/);
  for (const fn of ['finance_close_month', 'finance_reopen_month']) {
    assert.match(sql, new RegExp(`FUNCTION public\\.${fn}\\([\\s\\S]*?v_clinic UUID := public\\.finance_require_admin\\(\\);`));
  }
});

test('abas Relatório do contador e Comparar meses no menu, no Resumo, na ajuda e na assistente', async () => {
  const screen = await read('src/components/financeiro/FinanceiroScreen.jsx');
  assert.match(screen, /\{ label: 'Para o contador', ids: \['relatorio', 'comparar'\] \}/);
  assert.match(screen, /\n {4}relatorio: \(\(\) => \{/);
  assert.match(screen, /\n {4}comparar: \{\r?\n {6}display:/);
  assert.match(screen, /section === 'relatorio' && <AccountantReport/);
  assert.match(screen, /section === 'comparar' && <MonthComparison/);
  for (const id of ['relatorio', 'comparar']) {
    assert.ok(FINANCEIRO_HELP[id]?.title, `ajuda de ${id}`);
    assert.equal(ASSISTANT_SECTION_LINKS[id]?.screen, 'financeiro');
  }
  assert.match(FINANCEIRO_HELP.relatorio.notes.join(' '), /trava pela data do pagamento/);
  const mirror = await read('../supabase/functions/_shared/clinicAssistant.ts');
  assert.match(mirror, /relatorio: \{ screen: 'financeiro', label: 'Relatório do contador' \}/);
  const reportScreen = await read('src/components/financeiro/AccountantReport.jsx');
  assert.match(reportScreen, /typed\.trim\(\)\.toLowerCase\(\) !== 'fechar'/, 'fechar pede digitar "fechar"');
  assert.match(reportScreen, /Em teste<\/span>Por data do serviço/);
});
