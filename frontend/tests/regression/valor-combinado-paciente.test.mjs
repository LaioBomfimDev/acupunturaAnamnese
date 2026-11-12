// ============================================================
// Valor combinado por paciente (11/11/2026). O que estes testes guardam:
// - a conta da tela espelha finance_patient_price: serviço escolhido
//   vence o combinado da área, desativado não conta, outra área não;
// - a ordem do valor no banco: combinado do paciente antes da tabela,
//   e só no particular fora de pacote;
// - o repasse NÃO muda (escolha de 11/11/2026: a promoção é dividida),
//   então finance_charge_payout continua recebendo o valor final;
// - convênio e pacote seguem com o preço deles;
// - preço de paciente é só da administração: RLS can_manage_finance,
//   sem DELETE, e o bloco na ficha só monta com isClinicAdmin;
// - a cobrança do atendimento foi recriada a partir da última versão.
// ============================================================

import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { patientPriceFor } from '../../src/utils/finance.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => readFile(path.join(root, file), 'utf8');
const sql = await read('../supabase/migrations/20261111b_valor_combinado_paciente.sql');

const rows = [
  { discipline: 'psicologia', appointment_type: null, price_cents: 13000, active: true },
  { discipline: 'psicologia', appointment_type: 'evaluation', price_cents: 20000, active: true },
  { discipline: 'acupuntura', appointment_type: null, price_cents: 9000, active: false },
];

test('a conta da tela: serviço vence a área, desativado não conta', () => {
  assert.equal(patientPriceFor(rows, { discipline: 'psicologia', type: 'session' }), 13000);
  assert.equal(patientPriceFor(rows, { discipline: 'psicologia', type: 'evaluation' }), 20000, 'serviço escolhido vence');
  assert.equal(patientPriceFor(rows, { discipline: 'psicologia', type: null }), 13000);
  assert.equal(patientPriceFor(rows, { discipline: 'acupuntura', type: 'session' }), null, 'desativado não vale');
  assert.equal(patientPriceFor(rows, { discipline: 'nutricao', type: 'session' }), null, 'outra área não vale');
  assert.equal(patientPriceFor([], { discipline: 'psicologia', type: 'session' }), null);
  assert.equal(patientPriceFor(null, { discipline: 'psicologia', type: 'session' }), null);
  // Valor combinado de R$ 0 é um valor, não "sem combinado".
  assert.equal(patientPriceFor([{ discipline: 'psicologia', appointment_type: null, price_cents: 0, active: true }], { discipline: 'psicologia', type: 'session' }), 0);
});

test('a ordem do banco é a mesma: serviço antes da área, só ativo', () => {
  const fn = sql.slice(sql.indexOf('FUNCTION public.finance_patient_price'), sql.indexOf('REVOKE ALL ON FUNCTION public.finance_patient_price'));
  assert.match(fn, /AND pp\.active/);
  assert.match(fn, /\(pp\.appointment_type IS NULL OR pp\.appointment_type = p_type\)/);
  assert.match(fn, /ORDER BY \(pp\.appointment_type IS NULL\)/);
  assert.match(fn, /LIMIT 1/);
});

test('o combinado vence a tabela, e só no particular fora de pacote', () => {
  // As duas linhas que resolvem o valor passaram a consultar o paciente.
  assert.match(sql, /v_price := COALESCE\(\s*public\.finance_patient_price\(v_appt\.clinic_id, v_appt\.patient_id, v_appt\.discipline, v_appt\.appointment_type\),\s*public\.finance_resolve_price\(/);
  assert.match(sql, /v_assessment_price := COALESCE\(\s*public\.finance_patient_price\(v_appt\.clinic_id, v_appt\.patient_id, 'neuropsicologia', NULL\),/);
  // Fora de pacote: a linha do valor segue dentro do IF v_package_id IS NULL.
  assert.match(sql, /IF v_package_id IS NULL THEN\s*\r?\n\s*-- Valor combinado do paciente/);
  // Convênio tem o ramo próprio e não consulta o combinado.
  const convenio = sql.slice(sql.indexOf("IF v_appt.billing_type = 'convenio'"), sql.indexOf('ELSE', sql.indexOf("IF v_appt.billing_type = 'convenio'")));
  assert.doesNotMatch(convenio, /finance_patient_price/, 'convênio usa o preço da operadora');
});

test('o repasse não muda: continua sobre o valor que o paciente pagou', () => {
  assert.match(sql, /v_payout := public\.finance_charge_payout\([^)]*v_price, v_payer\)/);
  assert.doesNotMatch(sql, /FUNCTION public\.finance_charge_payout/, 'esta migration não recria o repasse');
  assert.doesNotMatch(sql, /FUNCTION public\.finance_resolve_price/, 'nem a tabela da área');
});

test('preço de paciente é só da administração e não se apaga', () => {
  for (const kind of ['select', 'insert', 'update']) {
    assert.match(sql, new RegExp(`CREATE POLICY patient_prices_${kind} ON public\\.patient_prices[\\s\\S]{0,160}can_manage_finance\\(clinic_id\\)`), kind);
  }
  assert.doesNotMatch(sql, /CREATE POLICY patient_prices_delete/);
  assert.match(sql, /GRANT SELECT, INSERT, UPDATE ON public\.patient_prices TO authenticated;/);
  assert.doesNotMatch(sql, /GRANT[^\r\n]*DELETE[^\r\n]*patient_prices/);
  // O gatilho tira o clinic_id do próprio paciente: ninguém grava para outra instituição.
  assert.match(sql, /SELECT p\.clinic_id INTO NEW\.clinic_id FROM public\.patients p WHERE p\.id = NEW\.patient_id;/);
  assert.match(sql, /Paciente de outra instituição\./);
  assert.match(sql, /NEW\.patient_id := OLD\.patient_id;/, 'combinado não troca de paciente');
  // Serviço tem de existir na área, como nos outros CHECKs de tipo.
  assert.match(sql, /CHECK \(public\.appointment_type_fits_area\(discipline, appointment_type\)\)/);
  // Um combinado valendo por paciente, área e serviço.
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS idx_patient_prices_scope_unique[\s\S]{0,140}WHERE active/);
});

test('o bloco na ficha só aparece para a administração', async () => {
  const profile = await read('src/components/ClinicPatientProfile.jsx');
  assert.match(profile, /\{isClinicAdmin && <PatientPrices patientId=\{patient\.id\} \/>\}/);
  const block = await read('src/components/PatientPrices.jsx');
  assert.match(block, /Vale para o atendimento avulso, do próximo em diante/, 'a tela diz até onde o valor vale');
  assert.match(block, /Desativar/);
  assert.doesNotMatch(block, /Excluir|delete\(/, 'não se apaga');
});

test('a cobrança foi recriada a partir da última versão, sem perder nada', async () => {
  const previous = await read('../supabase/migrations/20261110_neuro_avaliacao_valor_unico.sql');
  const grab = text => text.slice(text.indexOf('CREATE OR REPLACE FUNCTION public.finance_charge_appointment'), text.indexOf('\n$$;', text.indexOf('CREATE OR REPLACE FUNCTION public.finance_charge_appointment')));
  const before = grab(previous);
  const now = grab(sql);
  // Tudo o que a versão anterior fazia continua: só as duas linhas do
  // valor mudaram (e os comentários delas).
  const strip = text => text
    .replace(/\s*--[^\r\n]*/g, '')
    .replace(/v_(price|assessment_price) := COALESCE\([\s\S]*?\);/g, 'VALOR')
    .replace(/v_(price|assessment_price) := public\.finance_resolve_price\([^;]*\);/g, 'VALOR')
    .replace(/\s+/g, ' ')
    .trim();
  assert.equal(strip(now), strip(before), 'a cobrança mudou além das linhas do valor');
  assert.match(now, /finance_patient_price/);
});
