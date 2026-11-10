// ============================================================
// Recibos no desenho dos modelos da clínica (10/11/2026, etapa 2). O que
// estes testes guardam:
// - valor por extenso em pt-BR certo (o "e" entre grupos, real/reais,
//   "de reais" no milhão redondo, centavos);
// - folha do prestador (modelo 07) e do cliente (modelo 08) com as linhas
//   do modelo, forma de pagamento marcada e declaração;
// - numeração por tipo: prestador com sequência própria ('provider'),
//   cliente na sequência de antes ('voucher'), despesa nas compras;
// - recibo do prestador não se edita nem se apaga; uma saída tem no
//   máximo um valendo; só a administração emite, marca assinado e anula;
// - assinado é só a marcação, sem foto.
// ============================================================

import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import * as finance from '../../src/utils/finance.js';
import * as receipts from '../../src/utils/financeReceipts.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => readFile(path.join(root, file), 'utf8');
const sql = await read('../supabase/migrations/20261110c_financeiro_recibo_prestador.sql');

test('valor por extenso em pt-BR', () => {
  const cases = [
    [1, 'um centavo'],
    [99, 'noventa e nove centavos'],
    [100, 'um real'],
    [150, 'um real e cinquenta centavos'],
    [9000, 'noventa reais'],
    [10000, 'cem reais'],
    [10100, 'cento e um reais'],
    [28050, 'duzentos e oitenta reais e cinquenta centavos'],
    [100000, 'mil reais'],
    [105000, 'mil e cinquenta reais'],
    [120000, 'mil e duzentos reais'],
    [125001, 'mil duzentos e cinquenta reais e um centavo'],
    [280000, 'dois mil e oitocentos reais'],
    [985000, 'nove mil oitocentos e cinquenta reais'],
    [1400000, 'catorze mil reais'],
    [100000000, 'um milhão de reais'],
    [200050000, 'dois milhões e quinhentos reais'],
    [100100000, 'um milhão e mil reais'],
  ];
  for (const [cents, words] of cases) assert.equal(finance.amountInWords(cents), words, `${cents} centavos`);
});

test('local e data do modelo, CPF e CNPJ formatados', () => {
  assert.equal(finance.placeFromAddress('Rua Simões Filho, 350, Boa Vista, Catu – BA, CEP 48110-000'), 'Catu/BA');
  assert.equal(finance.placeFromAddress('Av. Central, 10 - Centro, Salvador - BA'), 'Salvador/BA');
  assert.equal(finance.placeFromAddress(''), '');
  assert.equal(finance.placeAndDate('Catu/BA', '2026-11-10'), 'Catu/BA, 10 de novembro de 2026.');
  assert.equal(finance.placeAndDate('', '2026-03-02'), '2 de março de 2026.');
  assert.equal(finance.formatPersonDocument('12345678901'), '123.456.789-01');
  assert.equal(finance.formatPersonDocument('53351769000110'), '53.351.769/0001-10');
  assert.equal(finance.formatPersonDocument('12ABC34501DE35'), '12.ABC.345/01DE-35');
});

test('forma de pagamento marcada como no modelo', () => {
  const prestador = ['PIX', 'Transferência', 'Dinheiro', 'Outro'];
  assert.equal(receipts.methodChoices(prestador, 'pix'), '( X ) PIX   (   ) Transferência   (   ) Dinheiro   (   ) Outro');
  assert.equal(receipts.methodChoices(prestador, 'boleto'), '(   ) PIX   (   ) Transferência   (   ) Dinheiro   ( X ) Outro: Boleto');
  assert.equal(receipts.methodChoices(prestador, 'cartao_credito'), '(   ) PIX   (   ) Transferência   (   ) Dinheiro   ( X ) Outro: Cartão de crédito');
  const cliente = ['PIX', 'Cartão', 'Dinheiro', 'Transferência', 'Outro'];
  assert.match(receipts.methodChoices(cliente, 'cartao_debito'), /\( X \) Cartão/);
});

test('folha do prestador segue o modelo 07', () => {
  const profile = { clinic: { name: 'Clínica Reability', address: 'Rua Simões Filho, 350, Boa Vista, Catu – BA, CEP 48110-000' } };
  const sheet = receipts.providerSheetProps(profile, {
    number: 3, issued_on: '2026-11-10', provider_name: 'José Encanador', provider_document: '12345678901',
    services: 'Conserto da torneira', period_text: 'novembro de 2026', amount_cents: 9000, method: 'pix',
    paid_on: '2026-11-07', place_label: 'Catu/BA', voided_at: null,
  });
  assert.equal(sheet.title, 'Recibo de pagamento ao prestador de serviços');
  assert.equal(sheet.number, '0003');
  assert.deepEqual(sheet.fields.map(field => field.label), ['Prestador(a)', 'CPF/CNPJ', 'Serviço(s) prestado(s)', 'Período de referência']);
  assert.equal(sheet.fields[1].value, '123.456.789-01');
  assert.match(sheet.declaration, /^Declaro, para os devidos fins, que recebi da Clínica Reability o valor acima indicado/);
  assert.equal(sheet.signatureLabel, 'Assinatura do(a) prestador(a) / recebedor(a)');
  assert.equal(sheet.voided, null);
});

test('folha do cliente segue o modelo 08 e não finge ser nota', () => {
  const fin = { profile: { clinic: { name: 'Clínica Reability', address: 'Rua X, 1, Catu – BA' } } };
  const group = { rows: [{ amount_cents: 15000, method: 'pix' }, { amount_cents: 5000, method: 'pix' }], receivedOn: '2026-11-05' };
  const sheet = receipts.clientSheetProps({
    fin, number: 12, group, doc: { taker_name: 'Maria Responsável', taker_document: '12345678901', status: 'pending' },
    what: 'Sessão de psicologia', serviceDays: ['2026-11-03', '2026-11-05', null, '2026-11-03'], patient: 'João Paciente',
  });
  assert.equal(sheet.title, 'Recibo de pagamento do cliente');
  assert.equal(sheet.number, '0012');
  assert.equal(sheet.amountCents, 20000);
  const byLabel = Object.fromEntries(sheet.fields.map(field => [field.label, field.value]));
  assert.equal(byLabel['Pagador(a) / responsável financeiro'], 'Maria Responsável');
  assert.equal(byLabel['Paciente'], 'João Paciente', 'paciente aparece quando é diferente de quem pagou');
  assert.equal(byLabel['Data(s) do atendimento'], '03/11/2026, 05/11/2026');
  assert.equal(sheet.place, 'Catu/BA');
  assert.match(sheet.note, /não substitui a nota fiscal/);
  assert.equal(sheet.signatureLabel, 'Assinatura / identificação do responsável pela clínica');

  const same = receipts.clientSheetProps({ fin, number: 1, group, doc: null, what: '', serviceDays: [], patient: 'João Paciente' });
  assert.equal(same.fields.find(field => field.label === 'Paciente').value, '', 'paciente que pagou não repete');
  const mixed = receipts.clientSheetProps({ fin, number: 1, group: { ...group, rows: [{ amount_cents: 100, method: 'pix' }, { amount_cents: 100, method: 'dinheiro' }] }, doc: null, patient: 'A' });
  assert.match(mixed.methodLine, /\( X \) Outro: Pix \+ Dinheiro$/);
});

test('numeração por tipo: prestador com sequência própria, cliente na de antes', () => {
  assert.match(sql, /finance_sequences_kind_check CHECK \(kind IN \('voucher', 'provider'\)\)/);
  assert.match(sql, /VALUES \(v_clinic, 'provider', 1\)/);
  assert.doesNotMatch(sql, /'voucher', 1\)/, 'esta migration não mexe na sequência do cliente');
  const fiscal = readFile(path.join(root, 'src/components/financeiro/FinanceFiscal.jsx'), 'utf8');
  return fiscal.then(source => assert.match(source, /receiptVoucherNumber\(group\.id\)/));
});

test('recibo do prestador: cópia própria, um valendo por saída, sem editar nem apagar', () => {
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_provider_receipts_live\s+ON public\.finance_provider_receipts \(expense_id\) WHERE voided_at IS NULL/);
  assert.match(sql, /RAISE EXCEPTION 'Recibo não se apaga: anule com motivo\.'/);
  assert.match(sql, /RAISE EXCEPTION 'Recibo emitido não se edita: anule e emita outro\.'/);
  assert.match(sql, /v_expense\.voided_at IS NOT NULL OR v_expense\.skipped OR v_expense\.paid_on IS NULL/);
  // Valor, forma e data vêm da saída, nunca da tela.
  assert.match(sql, /v_expense\.amount_cents, v_expense\.method, v_expense\.paid_on/);
  for (const fn of ['finance_issue_provider_receipt', 'finance_sign_provider_receipt', 'finance_void_provider_receipt']) {
    assert.match(sql, new RegExp(`FUNCTION public\\.${fn}\\([\\s\\S]*?v_clinic UUID := public\\.finance_require_admin\\(\\);`), `${fn} só da administração`);
  }
  assert.doesNotMatch(sql, /photo|foto_url|storage\./i, 'assinado é só a marcação');
  assert.match(sql, /REVOKE ALL ON public\.finance_provider_receipts FROM PUBLIC, anon, authenticated;\s+GRANT SELECT ON public\.finance_provider_receipts TO authenticated;/);
});

test('recibo de prestador em Pagas, com a situação da assinatura', async () => {
  const saidas = await read('src/components/financeiro/FinanceSaidas.jsx');
  assert.match(saidas, /<ProviderReceiptDialog/);
  assert.match(saidas, /falta assinar/);
  const dialog = await read('src/components/financeiro/ProviderReceipt.jsx');
  assert.match(dialog, /Marcar como assinado/);
  assert.match(dialog, /issueProviderReceipt/);
  assert.doesNotMatch(dialog, /amountCents|amount_cents:/, 'a tela não manda valor: vem da saída');
});

test('valor do recibo sempre com centavos', () => {
  assert.equal(finance.formatBRLWithCents(32000), 'R$ 320,00');
  assert.equal(finance.formatBRLWithCents(28050), 'R$ 280,50');
  assert.equal(finance.formatBRLWithCents(123456789), 'R$ 1.234.567,89');
});
