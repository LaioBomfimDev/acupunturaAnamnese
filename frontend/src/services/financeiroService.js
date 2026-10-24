// ============================================================
// Financeiro, etapa 1 (23/10/2026) — leitura e gravação
//
// Migração: supabase/migrations/20261023_financeiro_etapa1.sql
// (substitui o esboço de 20260908, que nunca teve tela).
//
// Tudo só para a administração da instituição. Dinheiro (recebimento,
// saída, pacote vendido, valor gravado do atendimento) só se grava pelas
// funções do banco, que conferem as regras: nada se apaga, valor não se
// edita, data de pagamento não fica no futuro. Configuração simples
// (modelos de pacote, pessoas, categorias, saídas fixas) grava direto na
// tabela, com a RLS da administração.
//
// As contas da tela moram em utils/finance.js.
// ============================================================

import { supabase } from '../lib/supabase';
import { listClinicMembers } from './clinicMembersService';
import { listClinicPatients } from './clinicPatientsService';

export const FINANCE_MIGRATION_HINT =
  'O financeiro ainda não está no banco. Aplique a migração '
  + 'supabase/migrations/20261023_financeiro_etapa1.sql no Supabase.';

const PAGE_SIZE = 1000;

function isMissingFinanceSchemaError(error) {
  const text = [error?.message, error?.details, error?.hint, error?.code].filter(Boolean).join(' ');
  return /finance_|appointment_charges|patient_packages|clinic_finance_settings/.test(text)
    && /does not exist|schema cache|Could not find|PGRST20[25]/i.test(text);
}

/** Erro do banco → frase que a administração entende. */
export function financeErrorMessage(error, fallback) {
  if (isMissingFinanceSchemaError(error)) return FINANCE_MIGRATION_HINT;
  const text = error?.message || '';
  if (/idx_finance_expenses_occurrence/.test(text)) return 'Este vencimento já foi pago ou marcado.';
  if (/idx_procedure_prices_scope_unique/.test(text)) return 'O mesmo tipo apareceu duas vezes na mesma área.';
  if (/idx_finance_payout_rules_scope_unique/.test(text)) return 'A mesma área apareceu duas vezes nas exceções.';
  if (/finance_expense_categories_name_unique/.test(text)) return 'Já existe uma categoria com esse nome.';
  if (/finance_package_models_range/.test(text)) return 'O máximo de sessões não pode ser menor que o previsto.';
  if (error?.code === '42501' || /permission denied|row-level security/i.test(text)) {
    return 'Só a administração da instituição mexe no financeiro.';
  }
  if (error?.code === '23503') return 'Este cadastro já foi usado em lançamentos: desative em vez de excluir.';
  return text || fallback;
}

function fail(error, fallback) {
  throw new Error(financeErrorMessage(error, fallback));
}

/** Lê a tabela inteira em páginas: o servidor devolve no máximo mil linhas por vez. */
async function fetchAll(table, columns, order = 'created_at') {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order(order, { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) fail(error, 'Não foi possível carregar o financeiro.');
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

async function rpc(name, args, fallback) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) fail(error, fallback);
  return data;
}

// ---------- leitura ----------

/**
 * Carrega tudo o que a tela Financeiro usa, numa ida só. A primeira vez
 * cria as categorias de saída padrão da instituição.
 */
export async function loadFinanceData() {
  await rpc('finance_ensure_defaults', {}, 'Não foi possível preparar o financeiro.');

  const [
    settingsResult,
    prices,
    rules,
    models,
    packages,
    installments,
    charges,
    receipts,
    people,
    categories,
    recurring,
    expenses,
    members,
    patients,
  ] = await Promise.all([
    supabase.from('clinic_finance_settings').select('*').maybeSingle(),
    fetchAll('procedure_prices', 'id,discipline,appointment_type,professional_id,price_cents,active', 'discipline'),
    fetchAll('finance_payout_rules', 'id,professional_id,discipline,appointment_type,mode,percent,amount_cents'),
    fetchAll('finance_package_models', '*'),
    fetchAll('patient_packages', '*'),
    fetchAll('patient_package_installments', 'id,package_id,number,due_on,amount_cents', 'due_on'),
    fetchAll('appointment_charges', '*', 'service_on'),
    fetchAll('finance_receipts', '*', 'received_on'),
    fetchAll('finance_people', '*', 'name'),
    fetchAll('finance_expense_categories', '*', 'sort_order'),
    fetchAll('finance_recurring_expenses', '*'),
    fetchAll('finance_expenses', '*'),
    listClinicMembers(),
    listClinicPatients(),
  ]);

  if (settingsResult.error) fail(settingsResult.error, 'Não foi possível carregar a configuração do financeiro.');

  return {
    settings: settingsResult.data || null,
    prices,
    rules,
    models,
    packages,
    installments,
    charges,
    receipts,
    people,
    categories,
    recurring,
    expenses,
    members,
    patients,
  };
}

// ---------- configuração ----------

export async function saveFinanceSettings({ startsOn, payoutBasis, packagesReviewed = null, expensesReviewed = null }) {
  return rpc('finance_save_settings', {
    p_starts_on: startsOn,
    p_payout_basis: payoutBasis,
    p_packages_reviewed: packagesReviewed,
    p_expenses_reviewed: expensesReviewed,
  }, 'Não foi possível salvar a configuração.');
}

/** Troca todos os valores de um escopo (instituição = professionalId null). */
export async function savePrices(professionalId, rows) {
  return rpc('finance_save_prices', {
    p_professional: professionalId || null,
    p_rows: rows.map(row => ({
      discipline: row.discipline,
      appointment_type: row.appointmentType || '',
      price_cents: row.priceCents,
    })),
  }, 'Não foi possível salvar os valores.');
}

export async function savePayoutRules(professionalId, rows) {
  return rpc('finance_save_payout_rules', {
    p_professional: professionalId,
    p_rows: rows.map(row => ({
      discipline: row.discipline || '',
      appointment_type: row.appointmentType || '',
      mode: row.mode,
      percent: row.mode === 'percent' ? String(row.percent) : '',
      amount_cents: row.mode === 'per_appointment' ? String(row.amountCents) : '',
    })),
  }, 'Não foi possível salvar o jeito de receber.');
}

async function upsertRow(table, row, fallback) {
  const query = row.id
    ? supabase.from(table).update(row).eq('id', row.id).select('*').single()
    : supabase.from(table).insert(row).select('*').single();
  const { data, error } = await query;
  if (error) fail(error, fallback);
  return data;
}

async function deleteRow(table, id, fallback) {
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) fail(error, fallback);
}

export const savePackageModel = row => upsertRow('finance_package_models', row, 'Não foi possível salvar o pacote.');
export const deletePackageModel = id => deleteRow('finance_package_models', id, 'Não foi possível excluir o pacote.');
export const savePerson = row => upsertRow('finance_people', row, 'Não foi possível salvar a pessoa.');
export const saveCategory = row => upsertRow('finance_expense_categories', row, 'Não foi possível salvar a categoria.');
export const saveRecurring = row => upsertRow('finance_recurring_expenses', row, 'Não foi possível salvar a saída fixa.');

// ---------- entradas ----------

export async function registerReceipt({ patientId, receivedOn, rows, note = '' }) {
  return rpc('finance_register_receipt', {
    p_patient: patientId,
    p_received_on: receivedOn,
    p_items: rows,
    p_note: note || null,
  }, 'Não foi possível registrar o recebimento.');
}

export async function voidReceipt(groupId, reason) {
  return rpc('finance_void_receipt', { p_group: groupId, p_reason: reason }, 'Não foi possível anular o recebimento.');
}

export async function adjustCharge(chargeId, priceCents, reason) {
  return rpc('finance_adjust_charge', { p_charge: chargeId, p_price_cents: priceCents, p_reason: reason }, 'Não foi possível mudar o valor.');
}

export async function sellPackage(input) {
  return rpc('finance_sell_package', {
    p_patient: input.patientId,
    p_model: input.modelId || null,
    p_name: input.name,
    p_discipline: input.discipline,
    p_professional: input.professionalId || null,
    p_kind: input.kind,
    p_sessions: input.sessions,
    p_total_cents: input.totalCents,
    p_appointment_types: input.appointmentTypes || [],
    p_payment_plan: input.paymentPlan,
    p_installments: input.installments || 1,
    p_first_due: input.firstDue || null,
    p_over_plan: input.overPlan || 'free',
    p_note: input.note || null,
  }, 'Não foi possível vender o pacote.');
}

export async function updatePackagePlan(packageId, sessionsPlanned) {
  return rpc('finance_update_package_plan', { p_package: packageId, p_sessions_planned: sessionsPlanned }, 'Não foi possível mudar a previsão.');
}

export async function closePackage(packageId, action) {
  return rpc('finance_close_package', { p_package: packageId, p_action: action }, 'Não foi possível encerrar o pacote.');
}

export async function voidPackage(packageId, reason) {
  return rpc('finance_void_package', { p_package: packageId, p_reason: reason }, 'Não foi possível anular a venda.');
}

// ---------- saídas ----------

export async function registerExpense(input) {
  return rpc('finance_register_expense', {
    p_category: input.categoryId,
    p_description: input.description,
    p_amount_cents: input.amountCents,
    p_paid_on: input.paidOn || null,
    p_method: input.paidOn ? input.method : null,
    p_due_on: input.paidOn ? null : input.dueOn,
    p_professional: input.professionalId || null,
    p_person: input.personId || null,
    p_note: input.note || null,
  }, 'Não foi possível lançar a saída.');
}

export async function payExpense(expenseId, paidOn, method) {
  return rpc('finance_pay_expense', { p_expense: expenseId, p_paid_on: paidOn, p_method: method }, 'Não foi possível pagar a saída.');
}

export async function settleRecurring({ recurringId, occurrenceOn, skip = false, amountCents = null, paidOn = null, method = null, note = '' }) {
  return rpc('finance_settle_recurring', {
    p_recurring: recurringId,
    p_occurrence_on: occurrenceOn,
    p_skip: skip,
    p_amount_cents: skip ? null : amountCents,
    p_paid_on: skip ? null : paidOn,
    p_method: skip ? null : method,
    p_note: note || null,
  }, 'Não foi possível registrar o pagamento.');
}

export async function voidExpense(expenseId, reason) {
  return rpc('finance_void_expense', { p_expense: expenseId, p_reason: reason }, 'Não foi possível anular a saída.');
}
