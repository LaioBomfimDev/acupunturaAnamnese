// ============================================================
// Agenda com particular ou convênio (02/11/2026; banco A + tela A).
// O que estes testes guardam:
// - o preço da operadora sai igual no banco e na tela: o tipo vence o
//   padrão da área (finance_convenio_price ↔ resolveConvenioPrice);
// - finance_charge_appointment foi recriada a partir da versão mais nova
//   (20261023) e continua com todas as regras do particular; convênio
//   copia TUSS, grava payer = 'convenio', não gasta pacote particular e,
//   sem preço, grava price_cents NULL;
// - o repasse do convênio mora num ponto só (finance_charge_payout);
// - a carteira é conferida no banco (mesmo paciente, mesma clínica,
//   mesma operadora) e o CHECK por tipo tem IS NOT NULL explícito;
// - a recepção sabe se a operadora tem preço, nunca o valor;
// - "A receber" separa paciente de operadora: convênio nunca cobra o
//   paciente;
// - a tela A: "Como paga" logo abaixo de Paciente, com o convênio ativo
//   da ficha marcado, selo "Convênio" no card e no detalhe.
// ============================================================

import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdir, readFile } from 'node:fs/promises';
import { resolveConvenioPrice } from '../../src/utils/convenio.js';
import * as billing from '../../src/utils/agendaBilling.js';
import * as finance from '../../src/utils/finance.js';
import { AGENDA_HELP, FINANCEIRO_HELP } from '../../src/data/screenHelp.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => readFile(path.join(root, file), 'utf8');
const MIGRATIONS = path.join(root, '../supabase/migrations');
const MIGRATION = '20261102_agenda_convenio.sql';
const sql = await read(`../supabase/migrations/${MIGRATION}`);
const etapa1 = await read('../supabase/migrations/20261023_financeiro_etapa1.sql');

function sqlFunction(source, name) {
  const match = source.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\r?\\n\\$\\$;`));
  assert.ok(match, `função ${name} existe`);
  return match[0];
}

// ---------- preço da operadora: banco × tela ----------

const PRICES = [
  { convenio_id: 'unimed', discipline: 'psicologia', appointment_type: null, price_cents: 10000, tuss_table: '22', tuss_code: '50000470' },
  { convenio_id: 'unimed', discipline: 'psicologia', appointment_type: 'evaluation', price_cents: 15000, tuss_table: '22', tuss_code: '50000462' },
  { convenio_id: 'outra', discipline: 'psicologia', appointment_type: 'session', price_cents: 99900, tuss_table: '22', tuss_code: '50000470' },
];

test('preço da operadora: o tipo vence o padrão da área, e só da própria operadora', () => {
  const byType = resolveConvenioPrice(PRICES, { convenioId: 'unimed', discipline: 'psicologia', type: 'evaluation' });
  assert.equal(byType.cents, 15000);
  assert.equal(byType.byType, true);
  assert.equal(byType.price.tuss_code, '50000462');
  const byArea = resolveConvenioPrice(PRICES, { convenioId: 'unimed', discipline: 'psicologia', type: 'session' });
  assert.deepEqual([byArea.cents, byArea.byType], [10000, false]);
  assert.deepEqual([resolveConvenioPrice(PRICES, { convenioId: 'unimed', discipline: 'psicologia' }).cents], [10000]);
  const none = resolveConvenioPrice(PRICES, { convenioId: 'unimed', discipline: 'acupuntura', type: 'session' });
  assert.deepEqual(none, { found: false, cents: null, byType: false, price: null });
});

test('preço da operadora: o banco filtra e ordena igual à tela', () => {
  const body = sqlFunction(sql, 'finance_convenio_price');
  assert.match(body, /cp\.convenio_id = p_convenio/);
  assert.match(body, /cp\.discipline = p_discipline/);
  assert.match(body, /\(cp\.appointment_type IS NULL OR cp\.appointment_type = p_type\)/);
  assert.match(body, /ORDER BY \(cp\.appointment_type IS NULL\)\r?\n\s+LIMIT 1;/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.finance_convenio_price\(UUID, TEXT, TEXT\) FROM PUBLIC, anon, authenticated;/);
});

// ---------- cobrança ----------

test('cobrança: recriada da versão mais nova, e nenhuma migration depois a recria', async () => {
  const files = (await readdir(MIGRATIONS)).filter(name => name.endsWith('.sql')).sort();
  const recreating = [];
  for (const name of files) {
    const text = await readFile(path.join(MIGRATIONS, name), 'utf8');
    if (/CREATE OR REPLACE FUNCTION public\.finance_charge_appointment\(/.test(text)) recreating.push(name);
  }
  // 10/11/2026: a avaliação neuropsicológica recria a partir desta
  // (conferido em neuro-avaliacao-valor-unico.test.mjs).
  assert.deepEqual(recreating.slice(-3), ['20261023_financeiro_etapa1.sql', MIGRATION, '20261110_neuro_avaliacao_valor_unico.sql'],
    'parte de 20261023, a anterior; só a avaliação neuropsicológica veio depois');
});

test('cobrança: particular segue com todas as regras de 20261023', () => {
  const before = sqlFunction(etapa1, 'finance_charge_appointment');
  const after = sqlFunction(sql, 'finance_charge_appointment');
  for (const rule of [
    /v_appt\.status IS DISTINCT FROM 'attended'/,
    /FROM public\.clinic_finance_settings WHERE clinic_id = v_appt\.clinic_id;\r?\n\s+IF NOT FOUND THEN\r?\n\s+RETURN;/,
    /IF v_day < v_settings\.starts_on THEN/,
    /IF FOUND AND v_charge\.voided_at IS NULL THEN/,
    /p\.status = 'active'/,
    /p\.sold_on <= v_day/,
    /\(p\.professional_id IS NULL OR p\.professional_id = v_appt\.professional_id\)/,
    /\(cardinality\(p\.appointment_types\) = 0 OR v_appt\.appointment_type = ANY \(p\.appointment_types\)\)/,
    /ORDER BY p\.sold_on, p\.created_at/,
    /WHEN v_left <= 1 THEN v_remaining/,
    /ELSE v_remaining \/ v_left/,
    /ELSIF v_package\.over_plan = 'free' THEN/,
    /public\.finance_resolve_price\(v_appt\.clinic_id, v_appt\.discipline, v_appt\.appointment_type, v_appt\.professional_id\)/,
    /v_package\.kind = 'counted' AND v_session >= v_package\.sessions_planned/,
  ]) {
    assert.match(before, rule, `regra existia: ${rule}`);
    assert.match(after, rule, `regra continua: ${rule}`);
  }
});

test('cobrança: convênio usa o preço da operadora, copia TUSS e não gasta pacote', () => {
  const body = sqlFunction(sql, 'finance_charge_appointment');
  const convenio = body.match(/IF v_appt\.billing_type = 'convenio' AND v_appt\.convenio_id IS NOT NULL THEN([\s\S]*?)\r?\n {2}ELSE\r?\n/);
  assert.ok(convenio, 'ramo do convênio antes do particular');
  assert.match(convenio[1], /v_payer := 'convenio';/);
  assert.match(convenio[1], /public\.finance_convenio_price\(v_appt\.convenio_id, v_appt\.discipline, v_appt\.appointment_type\)/);
  assert.match(convenio[1], /v_tuss_code := v_cprice\.tuss_code;/);
  assert.match(convenio[1], /ELSE\r?\n\s+v_price := NULL;/, 'sem preço: price_cents NULL');
  assert.doesNotMatch(convenio[1], /patient_packages|finance_resolve_price/, 'convênio não procura pacote nem tabela particular');
  for (const column of ['payer', 'convenio_id', 'coverage_id', 'tuss_table', 'tuss_code', 'tuss_term']) {
    assert.match(body, new RegExp(`${column} = v_[a-z_]+,`), `UPDATE grava ${column}`);
  }
  assert.match(body, /payer, convenio_id, coverage_id, tuss_table, tuss_code, tuss_term\r?\n/);
});

test('cobrança: CHECK por quem paga tem um ramo por tipo com IS NOT NULL explícito', () => {
  const check = sql.match(/ADD CONSTRAINT appointment_charges_payer_shape CHECK \(([\s\S]*?)\r?\n\);/);
  assert.ok(check);
  const [patient, convenio] = check[1].split(/\r?\n\s+OR \(payer = 'convenio'/);
  assert.match(patient, /payer = 'patient'/);
  assert.match(patient, /convenio_id IS NULL AND coverage_id IS NULL/);
  assert.match(convenio, /convenio_id IS NOT NULL/);
  assert.match(convenio, /tuss_table IS NOT NULL/);
  assert.match(convenio, /package_id IS NULL/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS payer TEXT NOT NULL DEFAULT 'patient'/);
});

test('repasse: decisão num ponto só, usado na cobrança e no ajuste de valor', () => {
  const point = sqlFunction(sql, 'finance_charge_payout');
  assert.match(point, /IF p_payer = 'convenio' THEN/);
  assert.match(sql, /DECISÃO PENDENTE da administradora/);
  for (const name of ['finance_charge_appointment', 'finance_adjust_charge']) {
    const body = sqlFunction(sql, name);
    assert.match(body, /public\.finance_charge_payout\(/, `${name} passa pelo ponto único`);
    assert.doesNotMatch(body, /public\.finance_payout_for\(/, `${name} não chama a regra direto`);
  }
});

test('mudar quem paga num Atendido refaz a cobrança, e barra com pagamento', () => {
  const body = sqlFunction(sql, 'finance_on_appointment_billing');
  assert.match(body, /OLD\.status IS DISTINCT FROM 'attended' OR NEW\.status IS DISTINCT FROM 'attended'/);
  assert.match(body, /appointment_has_payment: [^']*quem paga/);
  assert.match(body, /PERFORM public\.finance_void_appointment_charge\(NEW\.id, [^)]*\);\r?\n\s+PERFORM public\.finance_charge_appointment\(NEW\.id\);/);
  // A exclusão de paciente apaga a carteira (SET NULL aqui): não pode parar.
  assert.match(body, /d\.status = 'approved'/);
  assert.match(sql, /AFTER UPDATE OF billing_type, convenio_id, coverage_id ON public\.appointments/);
});

// ---------- carteira e acesso ----------

test('carteira: mesmo paciente, mesma clínica e mesma operadora, conferidos no banco', () => {
  const body = sqlFunction(sql, 'appointments_payer_check');
  assert.match(body, /IF NEW\.convenio_id IS NULL THEN\r?\n\s+RAISE EXCEPTION 'convenio_sem_operadora/);
  assert.match(body, /c\.id = NEW\.convenio_id AND c\.clinic_id = NEW\.clinic_id/);
  assert.match(body, /v_coverage\.patient_id IS DISTINCT FROM NEW\.patient_id/);
  assert.match(body, /v_coverage\.clinic_id IS DISTINCT FROM NEW\.clinic_id/);
  assert.match(body, /v_coverage\.convenio_id IS DISTINCT FROM NEW\.convenio_id/);
  assert.match(sql, /coverage_id UUID REFERENCES public\.patient_coverages\(id\) ON DELETE SET NULL/);
  assert.match(sql, /CHECK \(billing_type = 'convenio' OR coverage_id IS NULL\)/);
  // Roda depois de trg_appointments_defaults (ordem alfabética), com clinic_id preenchido.
  assert.ok('trg_appointments_payer_check' > 'trg_appointments_defaults');
});

test('RPC de preço: quem edita o cadastro sabe se tem preço; o valor só a administração', () => {
  const body = sqlFunction(sql, 'convenio_price_check');
  assert.match(body, /SECURITY DEFINER/);
  assert.match(body, /NOT public\.can_edit_patient_registry\(v_clinic\)/);
  assert.match(body, /CASE WHEN public\.can_manage_finance\(v_clinic\) THEN v_price\.price_cents ELSE NULL END/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.convenio_price_check\(UUID, TEXT, TEXT\) FROM PUBLIC, anon;/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.convenio_price_check\(UUID, TEXT, TEXT\) TO authenticated;/);
  // A tabela de preços continua fechada: nenhuma política nova nela.
  assert.doesNotMatch(sql, /POLICY[^;]*convenio_procedure_prices/);
});

test('"sessão N de M": convênio não mostra pacote particular', () => {
  const body = sqlFunction(sql, 'appointment_package_info');
  assert.match(body, /IF v_appt\.billing_type = 'convenio' THEN\r?\n\s+RETURN;/);
  assert.match(body, /RETURNS TABLE \(\r?\n\s+pacote TEXT/);
});

test('exclusão de paciente: nenhuma tabela nova com patient_id', () => {
  assert.doesNotMatch(sql, /CREATE TABLE/);
  assert.doesNotMatch(sql, /admin_decide_patient_deletion/);
});

test('validação SQL pronta: BEGIN … ROLLBACK, com request.jwt.claims e os cenários pedidos', async () => {
  const scenarios = await read('../supabase/validation/20261102_agenda_convenio_scenarios.sql');
  assert.match(scenarios, /^BEGIN;$/m);
  assert.match(scenarios, /^ROLLBACK;\r?\n?$/m);
  assert.doesNotMatch(scenarios, /^COMMIT;/m);
  assert.match(scenarios, /set_config\('request\.jwt\.claims'/);
  assert.match(scenarios, /SET LOCAL ROLE authenticated;/);
  for (const piece of ['cenário 1', 'cenário 2', 'cenário 3', 'cenário 4', 'carteira_de_outro_paciente', 'recepção viu o valor', 'cenário 9']) {
    assert.ok(scenarios.includes(piece), `cobre ${piece}`);
  }
});

// ---------- tela: "Como paga" ----------

const COVERAGES = [
  { id: 'cv-old', convenio_id: 'gone', card_number: '1', active: true },
  { id: 'cv-1', convenio_id: 'unimed', plan_id: 'p1', card_number: '0 123 456', card_valid_until: '2026-10-31', active: true },
  { id: 'cv-off', convenio_id: 'bradesco', card_number: '9', active: false },
  { id: 'cv-2', convenio_id: 'amil', card_number: 'A77', card_valid_until: null, active: true },
];
const CATALOG = {
  convenios: [{ id: 'unimed', name: 'Unimed' }, { id: 'amil', name: 'Amil' }, { id: 'bradesco', name: 'Bradesco' }],
  plans: [{ id: 'p1', convenio_id: 'unimed', name: 'Essencial' }],
};

test('Como paga: só carteira ativa de operadora ativa, e a primeira já vem marcada', () => {
  const choices = billing.coverageChoices(COVERAGES, CATALOG);
  assert.deepEqual(choices.map(item => item.convenioName), ['Unimed', 'Amil']);
  assert.deepEqual(billing.defaultBilling(choices), { billingType: 'convenio', convenioId: 'unimed', coverageId: 'cv-1' });
  assert.deepEqual(billing.defaultBilling([]), billing.PARTICULAR);
  assert.equal(billing.coverageNote(choices[0]), 'Plano Essencial · carteira 0 123 456 · válida até 31/10/2026');
  assert.equal(billing.coverageNote(choices[1]), 'carteira A77 · sem validade na ficha');
});

test('Como paga: avisos em âmbar com o texto da prévia', () => {
  const [unimed] = billing.coverageChoices(COVERAGES, CATALOG);
  assert.deepEqual(
    billing.billingWarnings({ choice: unimed, today: '2026-11-02', priceCheck: { hasPrice: false }, disciplineLabel: 'Psicologia' }),
    ['Carteira vencida em 31/10/2026.', 'Unimed não tem preço para Psicologia. A administração cadastra em Financeiro → Operadoras.'],
  );
  assert.deepEqual(billing.billingWarnings({ choice: unimed, today: '2026-10-31', priceCheck: { hasPrice: true }, disciplineLabel: 'Psicologia' }), []);
});

test('Como paga: o valor gravado volta para o campo, e particular nunca leva operadora', async () => {
  assert.deepEqual(billing.billingOf({ billing_type: 'convenio', convenio_id: 'u', coverage_id: 'c' }), { billingType: 'convenio', convenioId: 'u', coverageId: 'c' });
  assert.deepEqual(billing.billingOf({ billing_type: 'particular', convenio_id: null }), billing.PARTICULAR);
  assert.equal(billing.billingBadgeLabel({ billing_type: 'convenio' }, 'Unimed'), 'Convênio · Unimed');
  assert.equal(billing.billingBadgeLabel({ billing_type: 'particular' }), '');
  const service = await read('src/services/appointmentService.js');
  assert.match(service, /return \{ billing_type: 'particular', convenio_id: null, coverage_id: null \};/);
  assert.match(service, /\.\.\.billingColumns\(kind === 'block' \? null : input\),/);
  assert.match(service, /carteira_de_outro_paciente/);
});

test('tela A: "Como paga" logo abaixo de Paciente, no novo, na edição, no pacote e no já realizado', async () => {
  const agenda = await read('src/components/panels/Agenda.jsx');
  const patient = agenda.indexOf('<label htmlFor="ag-patient">Paciente</label>');
  const choice = agenda.indexOf('<BillingChoice', patient);
  const area = agenda.indexOf('<label htmlFor="ag-discipline">Área</label>');
  assert.ok(patient > 0 && choice > patient && choice < area, 'entre Paciente e Área');
  assert.match(agenda, /\.\.\.\(form\.kind === 'block' \? PARTICULAR : form\.billing\),/);
  assert.match(agenda, /\/\/ Cada sessão do pacote herda quem paga\.\r?\n\s+\.\.\.form\.billing,/);
  assert.match(agenda, /canSeePrice=\{canSeeConvenioPrice\}/);
  const edit = await read('src/components/panels/agenda/EditAppointmentPanel.jsx');
  assert.match(edit, /<BillingChoice[\s\S]*?autoPick=\{false\}/);
  assert.match(edit, /sameBilling\(billing, billingOf\(appointment\)\) \? \{\} : \{ billing \}/);
  const completed = await read('src/components/panels/agenda/RegisterCompletedDialog.jsx');
  assert.match(completed, /<BillingChoice/);
  const component = await read('src/components/panels/agenda/BillingChoice.jsx');
  assert.match(component, /listPatientCoverages\(patientId\)/);
  assert.match(component, /canSeePrice && priceCheck\?\.hasPrice/);
  assert.match(component, /coverageNote\(choice\)/);
});

test('selo "Convênio" no card e no detalhe, cor só por token e sem box-shadow', async () => {
  const rows = await read('src/components/panels/agenda/AgendaDayRows.jsx');
  assert.match(rows, /<span className="agd-chip agd-chip--billing">Convênio<\/span>/);
  const week = await read('src/components/panels/agenda/AgendaWeekView.jsx');
  assert.match(week, /appointment\.billing_type === 'convenio'/);
  const agenda = await read('src/components/panels/Agenda.jsx');
  assert.match(agenda, /<span className="ag-billing-badge">/);
  const css = await read('src/styles/agenda.css');
  const block = css.slice(css.indexOf('/* ---------- Como paga')).replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(block.length > 100);
  assert.doesNotMatch(block, /box-shadow/);
  assert.doesNotMatch(block, /#[0-9a-f]{3,8}\b|rgba?\(/i, 'cor só por token');
  assert.match(block, /minmax\(min\(100%, \d+px\), 1fr\)/, 'botões quebram linha no celular');
});

// ---------- Financeiro: A receber por quem paga ----------

const CHARGES = [
  { id: 'c1', source: 'appointment', patient_id: 'ana', price_cents: 20000, service_on: '2026-10-01', payer: 'patient', discipline: 'psicologia' },
  { id: 'c2', source: 'appointment', patient_id: 'ana', price_cents: 10000, service_on: '2026-10-02', payer: 'convenio', convenio_id: 'unimed', tuss_code: '50000470', discipline: 'psicologia' },
  { id: 'c3', source: 'appointment', patient_id: 'bia', price_cents: 15000, service_on: '2026-10-03', payer: 'convenio', convenio_id: 'unimed', discipline: 'psicologia' },
  { id: 'c4', source: 'appointment', patient_id: 'bia', price_cents: null, service_on: '2026-10-04', payer: 'convenio', convenio_id: 'amil', discipline: 'acupuntura' },
  { id: 'c5', source: 'appointment', patient_id: 'bia', price_cents: 9000, service_on: '2026-10-05', payer: 'convenio', convenio_id: 'amil', discipline: 'psicologia', voided_at: '2026-10-06' },
];
const RECEIPTS = [{ id: 'r1', charge_id: 'c5', amount_cents: 9000, received_on: '2026-10-05', group_id: 'g1', method: 'outro' }];

test('A receber: convênio nunca aparece cobrando o paciente', () => {
  const receivables = finance.buildReceivables({ charges: CHARGES, receipts: RECEIPTS, today: '2026-11-02' });
  const { patients, convenios } = finance.splitReceivablesByPayer(receivables.items);
  assert.deepEqual(patients.map(item => item.chargeId), ['c1']);
  assert.deepEqual(convenios.map(group => [group.convenioId, group.openCents, group.items.length]), [['unimed', 25000, 2]]);
  assert.equal(convenios[0].items[0].tussCode, '50000470');
  // Sem preço da operadora: "Sem valor" para a administração resolver.
  assert.deepEqual(receivables.missingPrice.map(row => row.id), ['c4']);
  // Pagamento de convênio que deixou de valer é crédito da operadora, não do paciente.
  assert.equal(receivables.credits.size, 0);
  assert.equal(receivables.convenioCredits.get('amil'), 9000);
});

test('Resumo: atraso de paciente só conta o particular; o de convênio é da operadora', () => {
  const receivables = finance.buildReceivables({ charges: CHARGES, receipts: RECEIPTS, today: '2026-11-02' });
  const summary = finance.buildMonthSummary({ charges: CHARGES, receipts: RECEIPTS, receivables, payables: [], month: finance.monthOf('2026-11-02'), today: '2026-11-02' });
  assert.equal(summary.latePatients, 1);
  // Fase 2 (20261103): convênio sem lote enviado não atrasa (antes atrasava
  // no dia seguinte ao atendimento, e a operadora só paga depois do lote).
  assert.equal(summary.lateConvenios, 0);
  assert.equal(summary.receivableConvenioCents, 25000);
  assert.equal(summary.receivableCents, 45000);

  // Lote enviado em 01/10 com prazo de 20 dias: em 02/11 a operadora está atrasada.
  const tissStatus = ['c2', 'c3'].map(id => ({ cobranca: id, guia: `g-${id}`, numero_guia: '1', situacao: 'batched', lote: '1', enviado_em: '2026-10-01', prazo_dias: 20, pago_centavos: 0, glosa_centavos: 0 }));
  const late = finance.buildReceivables({ charges: CHARGES, receipts: RECEIPTS, tissStatus, today: '2026-11-02' });
  const lateSummary = finance.buildMonthSummary({ charges: CHARGES, receipts: RECEIPTS, receivables: late, payables: [], month: finance.monthOf('2026-11-02'), today: '2026-11-02' });
  assert.equal(lateSummary.lateConvenios, 1);
  assert.equal(lateSummary.latePatients, 1);
});

test('A receber na tela: blocos de pacientes e de cada operadora, recebendo por paciente', async () => {
  const screen = await read('src/components/financeiro/FinanceEntradas.jsx');
  assert.match(screen, /splitReceivablesByPayer\(visible\)/);
  assert.match(screen, /groupReceivablesByPatient\(byPayer\.patients\)/);
  assert.match(screen, /Pacientes \(particular\)/);
  assert.match(screen, /Convênio · \{convenioName\(fin, convGroup\.convenioId\)\}/);
  const tiles = await read('src/components/financeiro/FinanceiroScreen.jsx');
  assert.match(tiles, /plural\(summary\.lateConvenios, 'operadora', 'operadoras'\)/);
});

// ---------- ajuda ----------

test('"Como funciona" da Agenda e de A receber falam de quem paga, e a assistente sabe', async () => {
  const agenda = JSON.stringify(AGENDA_HELP.agendamento);
  assert.match(agenda, /Como paga/);
  assert.match(agenda, /Convênio · nome da operadora/);
  assert.match(agenda, /Financeiro → Operadoras/);
  const receber = JSON.stringify(FINANCEIRO_HELP.areceber);
  assert.match(receber, /cada operadora/);
  assert.match(receber, /nunca aparece cobrando o paciente/);
  assert.doesNotMatch(agenda + receber, /\bitems\b|\(s\)/);
  const corpus = await read('../supabase/functions/_shared/assistantHelpCorpus.ts');
  assert.ok(corpus.includes('Convênio · nome da operadora'), 'rode node frontend/scripts/sync-assistant-help.mjs');
  const agendaSource = await read('src/components/panels/Agenda.jsx');
  assert.match(agendaSource, /<ScreenHelp topic=\{AGENDA_HELP\.agendamento\} \/>/);
});
