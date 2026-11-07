// ============================================================
// Financeiro: compras com itens e recibo interno (06/11/2026). O que
// estes testes guardam:
// - o total do item é quantidade × valor, meio para cima, em inteiros,
//   igual ao round() do banco (sem erro de ponto flutuante);
// - número do recibo sem buraco: contador travado na mesma transação,
//   conferido antes de gastar o número;
// - compra e itens não se editam nem se apagam; só a administração lança;
// - a tela só grava pela função finance_register_purchase.
// ============================================================

import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import * as finance from '../../src/utils/finance.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => readFile(path.join(root, file), 'utf8');
const sql = await read('../supabase/migrations/20261106_financeiro_compras_recibos.sql');

test('quantidade lida em milésimos, com vírgula ou ponto', () => {
  assert.equal(finance.parseQuantityInput('2'), 2000);
  assert.equal(finance.parseQuantityInput('1,5'), 1500);
  assert.equal(finance.parseQuantityInput('0.250'), 250);
  assert.equal(finance.parseQuantityInput('0'), null);
  assert.equal(finance.parseQuantityInput(''), null);
  assert.equal(finance.parseQuantityInput('abc'), null);
  assert.equal(finance.parseQuantityInput('1,2345'), null);
  assert.equal(finance.quantityToText(1500), '1,5');
  assert.equal(finance.quantityToText(2000), '2');
});

test('total do item arredonda meio para cima em inteiros, como o banco', () => {
  assert.equal(finance.purchaseItemTotal({ quantityThousandths: 2000, unitCents: 1500 }), 3000);
  assert.equal(finance.purchaseItemTotal({ quantityThousandths: 500, unitCents: 1999 }), 1000);
  // 1,005 × R$ 1,00 = 100,5 centavos: float daria 100; numeric dá 101.
  assert.equal(finance.purchaseItemTotal({ quantityThousandths: 1005, unitCents: 100 }), 101);
  assert.equal(finance.purchaseItemTotal({ quantityThousandths: 333, unitCents: 100 }), 33);
  assert.equal(finance.purchaseItemTotal({ quantityThousandths: null, unitCents: 100 }), 0);
});

test('total da compra soma os itens já arredondados', () => {
  const items = [
    { quantityThousandths: 2000, unitCents: 1500 },
    { quantityThousandths: 1000, unitCents: 899 },
    { quantityThousandths: 333, unitCents: 100 },
  ];
  assert.equal(finance.purchaseTotal(items), 3000 + 899 + 33);
  assert.equal(finance.purchaseTotal([]), 0);
});

test('itens de uma compra vêm na ordem em que foram lançados', () => {
  const items = [
    { expense_id: 'a', position: 2, description: 'b' },
    { expense_id: 'b', position: 1, description: 'x' },
    { expense_id: 'a', position: 1, description: 'a' },
  ];
  assert.deepEqual(finance.itemsOfPurchase(items, 'a').map(item => item.description), ['a', 'b']);
  assert.deepEqual(finance.itemsOfPurchase(undefined, 'a'), []);
});

test('recibo: número sequencial por instituição e ano, sem buraco', () => {
  assert.match(sql, /finance_receipt_counters[\s\S]*PRIMARY KEY \(clinic_id, year\)/);
  assert.match(sql, /ON CONFLICT ON CONSTRAINT finance_receipt_counters_pkey/);
  assert.match(sql, /last_number = c\.last_number \+ 1/);
  assert.match(sql, /lpad\(v_next::TEXT, 6, '0'\)/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_expenses_receipt_number/);
  // Os itens são conferidos ANTES de o número ser tirado.
  assert.ok(sql.indexOf('Confere todos os itens') < sql.indexOf('INSERT INTO public.finance_receipt_counters'));
  assert.equal(finance.formatReceiptNumber('2026-000123'), 'Nº 2026-000123');
});

test('o banco usa a mesma conta de arredondamento da tela', () => {
  assert.match(sql, /round\(v_qty \* v_unit\)/);
  assert.match(sql, /round\(\(item\.value ->> 'quantity'\)::NUMERIC \* \(item\.value ->> 'unit_cents'\)::NUMERIC\)/);
});

test('compra e itens não se editam nem se apagam; leitura só da administração', () => {
  assert.match(sql, /CREATE TRIGGER trg_finance_purchase_items_guard\s+BEFORE UPDATE OR DELETE ON public\.finance_purchase_items/);
  assert.match(sql, /GRANT SELECT ON public\.finance_purchase_items TO authenticated/);
  assert.doesNotMatch(sql, /GRANT (INSERT|UPDATE|DELETE)[^;]*finance_purchase_items/);
  assert.match(sql, /REVOKE ALL ON public\.finance_receipt_counters FROM anon, authenticated/);
  assert.match(sql, /can_manage_finance\(clinic_id\)/);
});

test('só a administração registra, em categoria e pessoas da própria instituição', () => {
  const body = sql.match(/CREATE OR REPLACE FUNCTION public\.finance_register_purchase\([\s\S]*?\r?\n\$\$;/)[0];
  assert.match(body, /finance_require_admin\(\)/);
  assert.match(body, /Categoria de outra instituição/);
  assert.match(body, /Profissional de outra instituição/);
  assert.match(body, /Pessoa de outra instituição/);
  assert.match(body, /p_paid_on > public\.finance_today\(\)/);
  assert.match(body, /v_count < 1 OR v_count > 50/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.finance_register_purchase\(UUID, DATE, TEXT, UUID, UUID, TEXT, JSONB\) FROM PUBLIC, anon/);
});

test('a tela grava a compra só pela função do banco e mostra o aviso fiscal', async () => {
  const service = await read('src/services/financeiroService.js');
  assert.match(service, /rpc\('finance_register_purchase'/);
  assert.match(service, /fetchAll\('finance_purchase_items'/);
  const receipt = await read('src/components/financeiro/PurchaseReceipt.jsx');
  assert.match(receipt, /Não tem valor fiscal/);
  assert.match(receipt, /RECIBO ANULADO/);
  const saidas = await read('src/components/financeiro/FinanceSaidas.jsx');
  assert.match(saidas, /\+ Registrar compra/);
});
