// ============================================================
// Notas fiscais e comprovante (04/11/2026; banco A + tela A, caminho A:
// a nota é emitida fora e o sistema prepara, guarda o número e mostra o
// que falta). O que estes testes guardam:
// - o que falta numa nota e as situações são os mesmos no banco e na tela;
// - a nota nasce por gatilho quando o dinheiro entra (recebimento do
//   particular e depósito da operadora) e não se apaga;
// - a aba Notas fiscais fica no grupo Entradas do Financeiro;
// - os textos de ajuda e a validação SQL acompanham.
// ============================================================

import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as fiscal from '../../src/utils/fiscal.js';
import { FINANCEIRO_HELP } from '../../src/data/screenHelp.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => readFile(path.join(root, file), 'utf8');
const sql = await read('../supabase/migrations/20261104_notas_fiscais.sql');
const scenarios = await read('../supabase/validation/20261104_notas_fiscais_scenarios.sql');
const screen = await read('src/components/financeiro/FinanceiroScreen.jsx');
const entradas = await read('src/components/financeiro/FinanceEntradas.jsx');
const agents = await read('../AGENTS.md');

test('fiscal_missing do banco e fiscalMissing da tela têm as mesmas chaves', () => {
  const body = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.fiscal_missing('));
  const fn = body.slice(0, body.indexOf('$$;'));
  const sqlKeys = [...fn.matchAll(/THEN '([a-z_]+)'/g)].map(match => match[1]).sort();
  assert.deepEqual(sqlKeys, Object.keys(fiscal.FISCAL_MISSING_LABELS).sort());
  assert.deepEqual(fiscal.fiscalMissing({}).sort(), sqlKeys);
  assert.deepEqual(fiscal.fiscalMissing({ taker_document: '12345678901', service_code: '04.16' }), []);
});

test('situações da nota: CHECK do banco = FISCAL_STATUS', () => {
  const match = sql.match(/fiscal_documents_status_check CHECK \(status IN \(([^)]*)\)\)/);
  assert.ok(match, 'CHECK de situação não encontrado');
  const statuses = [...match[1].matchAll(/'([a-z]+)'/g)].map(item => item[1]).sort();
  assert.deepEqual(statuses, Object.keys(fiscal.FISCAL_STATUS).sort());
});

test('nota nasce por gatilho quando o dinheiro entra e não se apaga', () => {
  for (const trigger of [
    'trg_finance_receipts_fiscal',
    'trg_convenio_payments_fiscal',
    'trg_tiss_guide_settlements_fiscal',
    'trg_fiscal_documents_no_delete',
    'trg_fiscal_document_sources_no_delete',
    'trg_fiscal_documents_guard',
  ]) {
    assert.match(sql, new RegExp(`CREATE TRIGGER ${trigger}\\b`), trigger);
  }
  // Nota cancelada guarda o número (nunca some calada).
  assert.match(sql, /status = 'cancelled'/);
  // Competência nunca depois da emissão.
  assert.match(sql, /issued_on >= competence_on/);
});

test('tela só grava pelas funções finance_fiscal_* e conferindo a administração', () => {
  for (const name of [
    'finance_fiscal_save_settings',
    'finance_fiscal_save_document',
    'finance_fiscal_register_issued',
    'finance_fiscal_cancel',
    'finance_receipt_voucher',
  ]) {
    const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
    assert.ok(start >= 0, name);
    const body = sql.slice(start, sql.indexOf('$$;', sql.indexOf('$$', start) + 2));
    assert.match(body, /SECURITY DEFINER/, `${name} SECURITY DEFINER`);
    assert.match(body, /finance_require_admin\(\)/, `${name} confere a administração`);
  }
});

test('aba Notas fiscais no grupo Entradas, com chip e comprovante nos recebidos', () => {
  assert.match(screen, /\{ id: 'notas', label: 'Notas fiscais' \}/);
  assert.match(screen, /label: 'Entradas', ids: \[[^\]]*'notas'[^\]]*\]/);
  assert.match(entradas, /<FiscalChip/);
  assert.match(entradas, /<VoucherButton/);
});

test('ajuda da tela explica as notas e o comprovante', () => {
  const notas = FINANCEIRO_HELP.notas;
  assert.ok(notas, 'FINANCEIRO_HELP.notas');
  for (const key of ['summary', 'actions', 'reading', 'access', 'notes']) assert.ok(notas[key], key);
  assert.ok(FINANCEIRO_HELP.recebidos.actions.some(line => line.includes('Comprovante')));
});

test('helpers da tela', () => {
  assert.equal(fiscal.formatTakerDocument('12345678901'), '123.456.789-01');
  assert.equal(fiscal.formatTakerDocument('12ABC34501DE35'), '12.ABC.345/01DE-35');
  assert.equal(fiscal.moneyForEmitter(123456), '1234,56');
  assert.equal(fiscal.moneyForEmitter(5), '0,05');
  assert.equal(fiscal.dayForEmitter('2026-11-04'), '04/11/2026');
  const docs = [
    { id: 'a', status: 'pending', amount_cents: 1000, service_code: null },
    { id: 'b', status: 'issued', needs_cancellation: true, amount_cents: 2000 },
    { id: 'c', status: 'issued', amount_cents: 3000 },
  ];
  const queue = fiscal.fiscalQueue(docs);
  assert.equal(queue.count, 2);
  const { byGroup, byPayment } = fiscal.fiscalBySource({
    documents: docs,
    sources: [
      { document_id: 'a', receipt_group_id: 'g1' },
      { document_id: 'b', receipt_group_id: 'g2', released_at: '2026-11-04' },
      { document_id: 'c', convenio_payment_id: 'p1' },
    ],
  });
  assert.equal(byGroup.get('g1').id, 'a');
  assert.equal(byGroup.has('g2'), false);
  assert.equal(byPayment.get('p1').id, 'c');
  const { tiles, counts } = fiscal.buildFiscalTiles({ fiscal: { documents: docs } });
  assert.equal(tiles.notas.display, '2');
  assert.equal(counts.notas.text, '2');
  // Falha aparece, nunca vira zero; carregando é traço.
  assert.equal(fiscal.buildFiscalTiles({ fiscalError: 'x' }).tiles.notas.value, null);
  assert.equal(fiscal.buildFiscalTiles({}).tiles.notas.value, null);
  // Código de serviço é só sugestão do contador.
  assert.ok(fiscal.SUGGESTED_SERVICE_CODES.psicologia.code);
});

test('validação SQL roda em transação desfeita, com os nove cenários', () => {
  assert.match(scenarios, /^BEGIN;\r?$/m);
  assert.match(scenarios, /ROLLBACK;\s*$/);
  for (let index = 1; index <= 9; index += 1) {
    assert.match(scenarios, new RegExp(`^-- ${index}\\. `, 'm'), `cenário ${index}`);
  }
});

test('regra destilada no AGENTS.md', () => {
  assert.match(agents, /Notas fiscais e comprovante \(04\/11\/2026/);
  assert.match(agents, /tests\/regression\/notas-fiscais\.test\.mjs/);
});
