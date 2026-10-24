// ============================================================
// Financeiro, etapa 1 (23/10/2026, opção C). O que estes testes guardam:
// - o valor de um atendimento sai da tabela na mesma ordem no banco e na
//   tela (tipo do profissional > tipo da instituição > padrão do
//   profissional > padrão da instituição);
// - pacote de valor fechado: cada sessão vale o que falta ÷ as sessões
//   que faltam na previsão, e a soma fecha no total;
// - "a receber", repasse e "a pagar" contam certo (FIFO, parcial,
//   crédito, desconto nas últimas parcelas, saída fixa);
// - dinheiro não se apaga nem se edita no banco: só anula com motivo;
// - falta não cobra; atendimento pago não se exclui na Agenda; a
//   exclusão de paciente aprovada passa e guarda o financeiro;
// - só a administração vê; a tela segue a opção C (menu como a Gestão).
// ============================================================

import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import * as finance from '../../src/utils/finance.js';
import { FINANCEIRO_HELP } from '../../src/data/screenHelp.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => readFile(path.join(root, file), 'utf8');
const sql = await read('../supabase/migrations/20261023_financeiro_etapa1.sql');

function sqlFunction(name) {
  const match = sql.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\r?\\n\\$\\$;`));
  assert.ok(match, `função ${name} existe na migration`);
  return match[0];
}

// ---------- valores ----------

const PRICES = [
  { discipline: 'psicologia', appointment_type: null, professional_id: null, price_cents: 18000 },
  { discipline: 'psicologia', appointment_type: 'feedback', professional_id: null, price_cents: 0 },
  { discipline: 'psicologia', appointment_type: null, professional_id: 'paula', price_cents: 25000 },
  { discipline: 'psicologia', appointment_type: 'session', professional_id: 'paula', price_cents: 20000 },
];

test('valor: tipo do profissional > tipo da instituição > padrão do profissional > padrão da instituição', () => {
  assert.deepEqual(finance.resolvePrice(PRICES, { discipline: 'psicologia', type: 'session', professionalId: 'paula' }), { cents: 20000, source: 'own-type' });
  // Devolutiva que a instituição não cobra continua sem cobrar para quem tem padrão próprio.
  assert.deepEqual(finance.resolvePrice(PRICES, { discipline: 'psicologia', type: 'feedback', professionalId: 'paula' }), { cents: 0, source: 'inst-type' });
  assert.deepEqual(finance.resolvePrice(PRICES, { discipline: 'psicologia', type: 'anamnesis', professionalId: 'paula' }), { cents: 25000, source: 'own-default' });
  assert.deepEqual(finance.resolvePrice(PRICES, { discipline: 'psicologia', type: 'anamnesis', professionalId: 'outra' }), { cents: 18000, source: 'inst-default' });
  assert.deepEqual(finance.resolvePrice(PRICES, { discipline: 'nutricao', type: 'session' }), { cents: null, source: null });
});

test('valor: o banco ordena igual à tela', () => {
  const body = sqlFunction('finance_resolve_price');
  assert.match(body, /ORDER BY \(pp\.appointment_type IS NULL\), \(pp\.professional_id IS NULL\)/);
});

test('dinheiro: formata e lê em centavos, sem "items" nem número cru', () => {
  assert.equal(finance.formatBRL(15000), 'R$ 150');
  assert.equal(finance.formatBRL(13333), 'R$ 133,33');
  assert.equal(finance.formatBRL(240000), 'R$ 2.400');
  assert.equal(finance.parseBRLInput('1.234,56'), 123456);
  assert.equal(finance.parseBRLInput('150'), 15000);
  assert.equal(finance.parseBRLInput('R$ 90,5'), 9050);
  assert.equal(finance.parseBRLInput('abc'), null);
  assert.equal(finance.parseBRLInput(''), null);
});

// ---------- pacotes ----------

test('valor fechado: R$ 2.400 em 6 previstas, vira 8 depois da 3ª, a 9ª não cobra', () => {
  const shares = finance.simulateClosedPackage({ totalCents: 240000, planned: 6, changeAfter: 3, newPlanned: 8, sessions: 9 });
  assert.deepEqual(shares, [40000, 40000, 40000, 24000, 24000, 24000, 24000, 24000, 0]);
  assert.equal(shares.reduce((a, b) => a + b, 0), 240000);
});

test('valor fechado: a última prevista leva o resto e a soma fecha no centavo', () => {
  const shares = finance.simulateClosedPackage({ totalCents: 100000, planned: 3, sessions: 3 });
  assert.deepEqual(shares, [33333, 33333, 33334]);
  assert.equal(finance.packageShare({ totalCents: 100000, usedCents: 100000, done: 3, planned: 3, overPlan: 'single' }), null);
});

test('banco: mesma conta da parte da sessão, e pacote contado fecha sozinho', () => {
  const body = sqlFunction('finance_charge_appointment');
  assert.match(body, /WHEN v_left <= 1 THEN v_remaining/);
  assert.match(body, /ELSE v_remaining \/ v_left/);
  assert.match(body, /v_package\.kind = 'counted' AND v_session >= v_package\.sessions_planned/);
  // Sem configuração do financeiro, o gatilho não faz nada.
  assert.match(body, /FROM public\.clinic_finance_settings WHERE clinic_id = v_appt\.clinic_id;\r?\n\s+IF NOT FOUND THEN\r?\n\s+RETURN;/);
});

test('parcelas iguais, o resto na última', () => {
  assert.deepEqual(finance.splitInstallments(100000, 3), [33333, 33333, 33334]);
  assert.deepEqual(finance.splitInstallments(64000, 2), [32000, 32000]);
});

// ---------- a receber ----------

const TODAY = '2026-10-23';

test('a receber: avulso vence no dia, parcial mostra o que falta, sem valor e crédito ficam à parte', () => {
  const charges = [
    { id: 'c1', patient_id: 'ana', discipline: 'psicologia', appointment_type: 'session', service_on: '2026-10-14', source: 'appointment', price_cents: 20000 },
    { id: 'c2', patient_id: 'ana', discipline: 'psicologia', appointment_type: 'session', service_on: '2026-10-23', source: 'appointment', price_cents: 20000 },
    { id: 'c3', patient_id: 'bia', discipline: 'nutricao', appointment_type: 'session', service_on: '2026-10-20', source: 'appointment', price_cents: null },
    { id: 'c4', patient_id: 'bia', discipline: 'nutricao', appointment_type: 'session', service_on: '2026-10-10', source: 'appointment', price_cents: 15000, voided_at: '2026-10-11' },
  ];
  const receipts = [
    { charge_id: 'c1', amount_cents: 5000, group_id: 'g1' },
    { charge_id: 'c4', amount_cents: 15000, group_id: 'g2' },
    { charge_id: 'c2', amount_cents: 20000, group_id: 'g3', voided_at: '2026-10-23' },
  ];
  const result = finance.buildReceivables({ charges, receipts, today: TODAY });
  assert.deepEqual(result.items.map(item => [item.chargeId, item.openCents, item.late]), [['c1', 15000, true], ['c2', 20000, false]]);
  assert.equal(result.items[0].daysLate, 9);
  assert.deepEqual(result.missingPrice.map(row => row.id), ['c3']);
  assert.equal(result.credits.get('bia'), 15000);
});

test('a receber: parcelas cobertas na ordem e desconto do encerramento sai das últimas', () => {
  const packages = [{ id: 'p1', patient_id: 'ana', discipline: 'acupuntura', name: 'Pacote de 10 sessões', payment_plan: 'installments', installments: 3, sessions_planned: 10, total_cents: 120000, discount_cents: 30000, status: 'completed' }];
  const installments = [
    { package_id: 'p1', number: 1, due_on: '2026-09-23', amount_cents: 40000 },
    { package_id: 'p1', number: 2, due_on: '2026-10-23', amount_cents: 40000 },
    { package_id: 'p1', number: 3, due_on: '2026-11-23', amount_cents: 40000 },
  ];
  const receipts = [{ package_id: 'p1', amount_cents: 50000, group_id: 'g1' }];
  const { items } = finance.buildReceivables({ packages, installments, receipts, today: TODAY });
  // 1ª paga, 2ª paga em parte (10.000 cobertos), 3ª vira 10.000 depois do desconto.
  assert.deepEqual(items.map(item => [item.installmentNumber, item.openCents]), [[2, 30000], [3, 10000]]);
});

test('a receber: pacote "a cada sessão" cobra a sessão feita, pago adiantado cobre primeiro', () => {
  const packages = [{ id: 'p2', patient_id: 'fabio', discipline: 'neuropsicologia', name: 'Avaliação neuropsicológica', payment_plan: 'per_session', installments: 1, sessions_planned: 8, total_cents: 240000, discount_cents: 0, status: 'active' }];
  const charges = [1, 2, 3, 4].map(number => ({ id: `s${number}`, package_id: 'p2', patient_id: 'fabio', discipline: 'neuropsicologia', source: 'appointment', session_number: number, service_on: `2026-10-${10 + number}`, price_cents: number <= 3 ? 40000 : 24000 }));
  const receipts = [{ package_id: 'p2', amount_cents: 100000, group_id: 'g1' }];
  const { items } = finance.buildReceivables({ packages, charges, receipts, today: TODAY });
  assert.deepEqual(items.map(item => [item.sessionNumber, item.openCents]), [[3, 20000], [4, 24000]]);
  assert.ok(items.every(item => item.packageId === 'p2' && item.kind === 'session'));
});

test('recebimento: divide na ordem e entre as formas; sessão de pacote vai para o pacote', () => {
  const items = [
    { key: 'a', chargeId: 'c1', openCents: 15000 },
    { key: 'b', chargeId: 's3', packageId: 'p2', openCents: 20000 },
  ];
  const { rows, error } = finance.allocateReceipt(items, [{ method: 'pix', amountCents: 20000 }, { method: 'dinheiro', amountCents: 15000 }]);
  assert.equal(error, '');
  assert.deepEqual(rows, [
    { method: 'pix', amount_cents: 15000, charge_id: 'c1' },
    { method: 'pix', amount_cents: 5000, package_id: 'p2' },
    { method: 'dinheiro', amount_cents: 15000, package_id: 'p2' },
  ]);
  assert.notEqual(finance.allocateReceipt(items, [{ method: 'pix', amountCents: 40000 }]).error, '');
});

// ---------- repasse ----------

test('repasse: "quando o paciente paga" conta só a parte paga; pagamento de repasse abate', () => {
  const charges = [
    { id: 'c1', professional_id: 'paula', source: 'appointment', service_on: '2026-10-14', price_cents: 20000, payout_cents: 12000 },
    { id: 'c2', professional_id: 'paula', source: 'appointment', service_on: '2026-10-15', price_cents: 20000, payout_cents: 12000 },
  ];
  const receipts = [{ charge_id: 'c1', amount_cents: 20000 }, { charge_id: 'c2', amount_cents: 10000 }];
  const expenses = [{ id: 'e1', category_id: 'rep', professional_id: 'paula', paid_on: '2026-10-20', amount_cents: 10000 }];
  const month = finance.monthOf(TODAY);
  const onPayment = finance.buildPayouts({ charges, receipts, expenses, repasseCategoryId: 'rep', basis: 'on_payment', month }).get('paula');
  assert.equal(onPayment.dueCents, 18000);
  assert.equal(onPayment.balanceCents, 8000);
  assert.equal(onPayment.monthCount, 2);
  const onAttendance = finance.buildPayouts({ charges, receipts, expenses, repasseCategoryId: 'rep', basis: 'on_attendance', month }).get('paula');
  assert.equal(onAttendance.dueCents, 24000);
});

// ---------- saídas fixas ----------

test('saída fixa: dia 31 vira o último dia do mês; semanal e quinzenal no dia certo', () => {
  assert.deepEqual(
    finance.recurringOccurrences({ frequency: 'monthly', day_of_month: 31, starts_on: '2026-09-15' }, '2026-09-01', '2026-11-30'),
    ['2026-09-30', '2026-10-31', '2026-11-30'],
  );
  assert.deepEqual(
    finance.recurringOccurrences({ frequency: 'weekly', weekday: 5, starts_on: '2026-10-01' }, '2026-10-01', '2026-10-31'),
    ['2026-10-02', '2026-10-09', '2026-10-16', '2026-10-23', '2026-10-30'],
  );
  assert.deepEqual(
    finance.recurringOccurrences({ frequency: 'biweekly', weekday: 1, starts_on: '2026-10-01' }, '2026-10-20', '2026-11-30'),
    ['2026-11-02', '2026-11-16', '2026-11-30'],
  );
  assert.deepEqual(finance.recurringOccurrences({ frequency: 'monthly', day_of_month: 5, starts_on: '2026-01-01', active: false }, '2026-10-01', '2026-10-31'), []);
});

test('a pagar: vencimento pago ou "não houve" sai; conta a pagar e repasse entram', () => {
  const recurring = [{ id: 'r1', description: 'Aluguel', category_id: 'alug', amount_cents: 420000, frequency: 'monthly', day_of_month: 5, starts_on: '2026-09-01' }];
  const expenses = [
    { id: 'e1', recurring_id: 'r1', occurrence_on: '2026-09-05', paid_on: '2026-09-05', amount_cents: 420000 },
    { id: 'e2', recurring_id: 'r1', occurrence_on: '2026-10-05', skipped: true, amount_cents: 0 },
    { id: 'e3', description: 'Conserto', category_id: 'man', due_on: '2026-10-30', amount_cents: 30000 },
  ];
  const payouts = new Map([['paula', { professionalId: 'paula', balanceCents: 8000 }]]);
  const items = finance.buildPayables({ recurring, expenses, startsOn: '2026-09-01', until: '2026-11-30', today: TODAY, payouts });
  assert.deepEqual(items.map(item => item.key), ['pending:e3', 'recurring:r1:2026-11-05', 'payout:paula']);
});

test('configuração: cada parte diz se está pronta', () => {
  const members = [{ id: 'paula', is_active: true, has_agenda: true, disciplines: ['psicologia'] }, { id: 'karen', is_active: true, has_agenda: false, disciplines: [] }];
  const empty = finance.buildConfigStatus({ settings: null, members });
  assert.equal(empty.readyCount, 0);
  assert.equal(empty.started, false);
  const ready = finance.buildConfigStatus({
    settings: { packages_reviewed: true, expenses_reviewed: true },
    prices: [{ discipline: 'psicologia', appointment_type: null, professional_id: null, price_cents: 18000 }],
    rules: [{ professional_id: 'paula', mode: 'percent', percent: 60 }],
    members,
  });
  assert.equal(ready.readyCount, 4);
});

// ---------- banco: regras do dinheiro ----------

test('dinheiro lançado não se apaga nem se edita: só anula com motivo ou paga uma vez', () => {
  const guard = sqlFunction('finance_guard_money_rows');
  assert.match(guard, /TG_OP = 'DELETE'/);
  assert.match(guard, /length\(btrim\(NEW\.void_reason\)\) < 3/);
  assert.match(guard, /Valor e data de lançamento não se editam/);
  for (const table of ['finance_receipts', 'finance_expenses']) {
    assert.match(sql, new RegExp(`BEFORE UPDATE OR DELETE ON public\\.${table}\\r?\\n\\s+FOR EACH ROW EXECUTE FUNCTION public\\.finance_guard_money_rows`));
    assert.match(sql, new RegExp(`REVOKE ALL ON public\\.${table} FROM anon, authenticated;\\r?\\nGRANT SELECT ON public\\.${table} TO authenticated;`));
  }
});

test('falta não cobra e atendimento pago não se exclui; exclusão de paciente aprovada passa', () => {
  assert.match(sql, /AFTER INSERT OR UPDATE OF status ON public\.appointments/);
  const onStatus = sqlFunction('finance_on_appointment_status');
  assert.match(onStatus, /NEW\.status = 'attended'/);
  assert.match(onStatus, /OLD\.status = 'attended' AND NEW\.status IS DISTINCT FROM 'attended'/);
  const onDelete = sqlFunction('finance_before_appointment_delete');
  assert.match(onDelete, /d\.status = 'approved'/);
  assert.match(onDelete, /appointment_has_payment/);
  // A cobrança guarda paciente, profissional, área e dia: sobrevive ao agendamento apagado.
  assert.match(sql, /appointment_id UUID REFERENCES public\.appointments\(id\) ON DELETE SET NULL/);
});

test('data de recebimento e de pagamento nunca no futuro', () => {
  assert.match(sqlFunction('finance_register_receipt'), /p_received_on > public\.finance_today\(\)/);
  assert.match(sqlFunction('finance_register_expense'), /p_paid_on > public\.finance_today\(\)/);
  assert.match(sqlFunction('finance_pay_expense'), /p_paid_on > public\.finance_today\(\)/);
});

test('só a administração: toda tabela nova lê por can_manage_finance e toda função confere', () => {
  for (const table of ['clinic_finance_settings', 'procedure_prices', 'finance_payout_rules', 'patient_packages', 'patient_package_installments', 'appointment_charges', 'finance_receipts', 'finance_expenses']) {
    assert.match(sql, new RegExp(`ON public\\.${table}\\r?\\n\\s+FOR SELECT TO authenticated(?:\\r?\\n\\s+)? USING \\(public\\.can_manage_finance\\(clinic_id\\)\\)`), `${table} só para a administração`);
  }
  for (const name of ['finance_save_settings', 'finance_save_prices', 'finance_register_receipt', 'finance_sell_package', 'finance_register_expense', 'finance_void_receipt']) {
    assert.match(sqlFunction(name), /public\.finance_require_admin\(\)/);
  }
  assert.match(sqlFunction('can_manage_finance'), /public\.is_clinic_admin\(p_user\)/);
});

test('PL/pgSQL: ON CONFLICT pelo nome da constraint', () => {
  assert.doesNotMatch(sql, /ON CONFLICT \(/);
  assert.match(sql, /ON CONFLICT ON CONSTRAINT clinic_finance_settings_pkey/);
});

test('formas de pagamento e tipos de atendimento iguais no banco e na tela', async () => {
  const methods = finance.PAYMENT_METHODS.map(item => `'${item.id}'`).join(', ');
  assert.ok(sql.includes(`method IN (${methods})`), 'mesmas formas no CHECK');
  const appointmentService = await read('src/services/appointmentService.js');
  for (const type of finance.FINANCE_APPOINTMENT_TYPES) {
    assert.ok(appointmentService.includes(`{ id: '${type.id}', label: '${type.label}' }`), `tipo ${type.id} igual ao da Agenda`);
  }
});

test('migration não cita concorrente', () => {
  assert.doesNotMatch(sql, /somar|edutec/i);
});

// ---------- tela ----------

test('tela: opção C, menu em grupos como a Gestão, só para a administração', async () => {
  const screen = await read('src/components/financeiro/FinanceiroScreen.jsx');
  assert.match(screen, /<GestaoNav/);
  assert.match(screen, /<GestaoResumo/);
  assert.match(screen, /className="gt gt--rail gt--index fin"/);
  for (const label of ['Visão geral', 'Entradas', 'Saídas', 'Configuração']) assert.ok(screen.includes(`label: '${label}'`));
  const ids = [...screen.matchAll(/\{ id: '([^']+)', label: '/g)].map(match => match[1]);
  assert.ok(ids.length >= 11);
  for (const id of ids) {
    assert.match(id, /^[a-z]+$/, `id ${id} só com letras minúsculas`);
    assert.ok(FINANCEIRO_HELP[id]?.title && FINANCEIRO_HELP[id]?.summary, `ajuda de ${id}`);
  }
  const app = await read('src/App.jsx');
  assert.match(app, /onOpenFinance=\{isClinicAdmin \? \(\) => setShowHubFinance\(true\) : undefined\}/);
  assert.match(app, /if \(showHubFinance && isClinicAdmin\)/);
  const home = await read('src/components/HomeConsole.jsx');
  assert.match(home, /title="Financeiro"/);
});

test('Agenda: excluir atendimento pago explica o motivo antes do erro de evolução', async () => {
  const service = await read('src/services/appointmentService.js');
  const payment = service.indexOf('appointment_has_payment');
  const evolution = service.indexOf("error.code === '23503'");
  assert.ok(payment > 0 && payment < evolution, 'o teste do pagamento vem antes do 23503 da evolução');
});

// ---------- Agenda: "sessão 3 de 10" (24/10/2026) ----------

test('Agenda: linha do pacote diz a sessão gasta, ou quantas foram feitas antes de acontecer', () => {
  assert.equal(finance.packageSessionLabel({ name: 'Pacote de 10 sessões', kind: 'counted', session: 3, planned: 10, done: 3 }), 'Pacote de 10 sessões: sessão 3 de 10');
  assert.equal(finance.packageSessionLabel({ name: 'Avaliação neuropsicológica', kind: 'closed', session: 4, planned: 8, done: 4 }), 'Avaliação neuropsicológica: sessão 4 de 8 previstas');
  assert.equal(finance.packageSessionLabel({ name: 'Avaliação neuropsicológica', kind: 'closed', session: 9, planned: 8, done: 9 }), 'Avaliação neuropsicológica: sessão 9 (passou das 8 previstas)');
  assert.equal(finance.packageSessionLabel({ name: 'Pacote de 10 sessões', kind: 'counted', session: null, planned: 10, done: 4 }), 'Pacote de 10 sessões: 4 de 10 sessões feitas');
  assert.equal(finance.packageSessionLabel(null), '');
});

test('Agenda: a função do pacote não devolve dinheiro, é da clínica e segue a regra do gatilho', async () => {
  const info = await read('../supabase/migrations/20261024_appointment_package_info.sql');
  const returns = info.match(/RETURNS TABLE \(([\s\S]*?)\)\r?\nLANGUAGE/);
  assert.ok(returns, 'RETURNS TABLE');
  assert.doesNotMatch(returns[1], /cents|price|valor|amount|pago|paid/i, 'nenhum valor em dinheiro sai daqui');
  assert.match(info, /NOT public\.can_manage_agenda\(v_appt\.clinic_id\)/);
  assert.match(info, /v_appt\.status IN \('cancelled', 'no_show', 'excused'\)/);
  // Mesma escolha de pacote que finance_charge_appointment.
  for (const rule of [
    /p\.status = 'active'/,
    /p\.sold_on <= v_day/,
    /\(p\.professional_id IS NULL OR p\.professional_id = v_appt\.professional_id\)/,
    /\(cardinality\(p\.appointment_types\) = 0 OR v_appt\.appointment_type = ANY \(p\.appointment_types\)\)/,
    /ORDER BY p\.sold_on, p\.created_at/,
  ]) {
    assert.match(info, rule);
    assert.match(sqlFunction('finance_charge_appointment'), rule);
  }
  assert.match(info, /REVOKE ALL ON FUNCTION public\.appointment_package_info\(UUID\) FROM PUBLIC, anon;/);
});

test('Agenda: detalhe relê o pacote quando o status muda', async () => {
  const agenda = await read('src/components/panels/Agenda.jsx');
  assert.match(agenda, /`\$\{selectedAppointment\.id\}\|\$\{selectedAppointment\.status\}`/);
  assert.match(agenda, /getAppointmentPackageInfo\(packageKey\.split\('\|'\)\[0\]\)/);
  assert.match(agenda, /<p className="ag-detail-package">\{packageSessionLabel\(selectedPackage\)\}<\/p>/);
  const service = await read('src/services/appointmentService.js');
  assert.match(service, /rpc\('appointment_package_info', \{ p_appointment: id \}\)/);
});

test('visual: ação na cor da clínica, nada de petróleo fixo nem altura crua da janela', async () => {
  const css = await read('src/styles/financeiro.css');
  assert.doesNotMatch(css, /--r1-(navy|gold)-|--r1-surface-inverse|#0f4c49/i);
  assert.match(css, /\.fin-choice\[aria-pressed='true'\] \{[^}]*background: var\(--r1-accent\)/);
  assert.doesNotMatch(css.replace(/@media[^{]*\{/g, ''), /\b\d+(?:\.\d+)?(vh|svh|dvh)\b/);
});
