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
  // Tipo de atendimento fora da área (20261104b, appointment_type_fits_area).
  if (/procedure_prices_appointment_type_check|finance_payout_rules_appointment_type_check|convenio_procedure_prices_appointment_type_check/.test(text)) {
    return 'Um dos tipos não é serviço desta área. Confira a área de cada valor.';
  }
  if (/finance_package_models_types|patient_packages_types/.test(text)) return 'O pacote tem tipo que não é serviço desta área.';
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
    purchaseItems,
    providerReceipts,
    monthClosings,
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
    fetchAll('finance_purchase_items', '*', 'position'),
    fetchAll('finance_provider_receipts', '*', 'number'),
    fetchAll('finance_month_closings', '*', 'closed_at'),
  ]);

  if (settingsResult.error) fail(settingsResult.error, 'Não foi possível carregar a configuração do financeiro.');

  const tiss = await loadTissMoney();

  return {
    ...tiss,
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
    purchaseItems,
    providerReceipts,
    monthClosings,
  };
}

/**
 * Só o que "Sua atenção hoje" da assistente precisa (a receber e pacotes),
 * sem preparar o financeiro: não cria nada, só lê.
 */
export async function loadReceivablesData() {
  const [packages, installments, charges, receipts, tiss] = await Promise.all([
    fetchAll('patient_packages', '*'),
    fetchAll('patient_package_installments', 'id,package_id,number,due_on,amount_cents', 'due_on'),
    fetchAll('appointment_charges', '*', 'service_on'),
    fetchAll('finance_receipts', '*', 'received_on'),
    loadTissMoney(),
  ]);
  return { packages, installments, charges, receipts, ...tiss };
}

// ---------- convênio: guia, lote, pagamento da operadora (Fase 2) ----------

export const TISS_MIGRATION_HINT =
  'Guias e lotes de convênio ainda não estão no banco. Aplique a migração '
  + 'supabase/migrations/20261103_convenios_fase2.sql no Supabase.';

function isMissingTissSchema(error) {
  const text = [error?.message, error?.details, error?.hint, error?.code].filter(Boolean).join(' ');
  return /tiss_|convenio_payments|finance_tiss/.test(text)
    && /does not exist|schema cache|Could not find|PGRST20[025]|42883/i.test(text);
}

/** Erro do banco → frase de quem fatura convênio. */
export function tissErrorMessage(error, fallback) {
  if (isMissingTissSchema(error)) return TISS_MIGRATION_HINT;
  const text = error?.message || '';
  // As funções já mandam a frase depois do código ("guia_no_lote: …").
  const coded = text.match(/^[a-z_]+: (.+)$/s);
  if (coded) return coded[1];
  return financeErrorMessage(error, fallback);
}

async function tissRpc(name, args, fallback) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(tissErrorMessage(error, fallback));
  return data;
}

/**
 * O que o "A receber", o Resumo e o repasse precisam do convênio. Sem a
 * migration da Fase 2 no banco, volta vazio e o resto do financeiro segue.
 */
export async function loadTissMoney() {
  const [status, paid] = await Promise.all([
    supabase.rpc('finance_tiss_charge_status'),
    supabase.rpc('finance_tiss_paid_rows'),
  ]);
  for (const result of [status, paid]) {
    if (result.error && !isMissingTissSchema(result.error)) fail(result.error, 'Não foi possível carregar o convênio do financeiro.');
  }
  return {
    tissStatus: status.error ? [] : status.data || [],
    tissPaid: paid.error ? [] : paid.data || [],
    // As DUAS: se só a dos pagamentos falhar, o dinheiro da operadora
    // sumia e virava zero calado (achado na revisão de 11/11/2026).
    tissReady: !status.error && !paid.error,
  };
}

/** Tudo o que Guias, Lotes e Pagamentos e glosas mostram, numa ida só. */
export async function loadTissData() {
  const fallback = 'Não foi possível carregar as guias.';
  const [guides, batches, payments, settlements, appeals, glosas] = await Promise.all([
    tissRpc('finance_tiss_guides', { p_convenio: null }, fallback),
    supabase.from('tiss_batches')
      .select('id,convenio_id,number,status,origin_kind,origin_value,generated_on,generated_time,period_from,period_until,guide_count,total_cents,xml_hash,sent_on,protocol_number,created_at,discarded_at,discard_reason')
      .order('created_at', { ascending: false }),
    supabase.from('convenio_payments').select('*').order('received_on', { ascending: false }),
    supabase.from('tiss_guide_settlements').select('*').order('created_at', { ascending: false }),
    supabase.from('tiss_guide_appeals').select('*').order('created_at', { ascending: false }),
    supabase.from('tiss_terms').select('code,term').eq('table_code', '38').order('code'),
  ]);
  for (const result of [batches, payments, settlements, appeals, glosas]) {
    if (result.error) throw new Error(tissErrorMessage(result.error, fallback));
  }
  return {
    guides: guides || [],
    batches: batches.data || [],
    payments: payments.data || [],
    settlements: settlements.data || [],
    appeals: appeals.data || [],
    glosas: glosas.data || [],
  };
}

/** XML guardado do lote (só quando a pessoa pede para baixar). */
export async function loadBatchXml(batchId) {
  const { data, error } = await supabase.from('tiss_batches').select('number,xml,xml_hash').eq('id', batchId).single();
  if (error) throw new Error(tissErrorMessage(error, 'Não foi possível ler o XML do lote.'));
  return data;
}

export const saveGuide = (guideId, fields) =>
  tissRpc('finance_tiss_save_guide', { p_guide: guideId, p_fields: fields }, 'Não foi possível salvar a guia.');
export const createBatch = (convenioId, guideIds) =>
  tissRpc('finance_tiss_create_batch', { p_convenio: convenioId, p_guides: guideIds }, 'Não foi possível montar o lote.');
export const markBatchSent = (batchId, sentOn, protocol) =>
  tissRpc('finance_tiss_mark_sent', { p_batch: batchId, p_sent_on: sentOn, p_protocol: protocol || null }, 'Não foi possível marcar o envio.');
export const discardBatch = (batchId, reason) =>
  tissRpc('finance_tiss_discard_batch', { p_batch: batchId, p_reason: reason }, 'Não foi possível descartar o lote.');
export const resendGuide = (guideId, reason) =>
  tissRpc('finance_tiss_resend_guide', { p_guide: guideId, p_reason: reason }, 'Não foi possível reenviar a guia.');
export const registerConvenioPayment = ({ convenioId, receivedOn, amountCents, method, items, note }) =>
  tissRpc('finance_tiss_register_payment', {
    p_convenio: convenioId,
    p_received_on: receivedOn,
    p_amount_cents: amountCents,
    p_method: method,
    p_items: items,
    p_note: note || null,
  }, 'Não foi possível registrar o pagamento.');
export const voidSettlement = (groupId, reason) =>
  tissRpc('finance_tiss_void_settlement', { p_group: groupId, p_reason: reason }, 'Não foi possível anular o lançamento.');
export const openAppeal = (guideId, note) =>
  tissRpc('finance_tiss_open_appeal', { p_guide: guideId, p_note: note }, 'Não foi possível registrar o recurso.');
export const closeAppeal = (guideId, outcome, note) =>
  tissRpc('finance_tiss_close_appeal', { p_guide: guideId, p_outcome: outcome, p_note: note || null }, 'Não foi possível fechar o recurso.');

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

/** Sessões liberadas por padrão na avaliação neuropsicológica (só administração). */
export async function setNeuroSessions(sessions) {
  return rpc('finance_set_neuro_sessions', { p_sessions: sessions }, 'Não foi possível salvar as sessões liberadas.');
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

/** items: [{ description, quantityThousandths, unitCents }] */
export async function registerPurchase(input) {
  return rpc('finance_register_purchase', {
    p_category: input.categoryId,
    p_paid_on: input.paidOn,
    p_method: input.method,
    p_professional: input.professionalId || null,
    p_person: input.personId || null,
    p_note: input.note || null,
    p_items: input.items.map(item => ({
      description: item.description,
      quantity: item.quantityThousandths / 1000,
      unit_cents: item.unitCents,
    })),
  }, 'Não foi possível registrar a compra.');
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

// ---------- valor combinado por paciente (20261111b) ----------
//
// Configuração, como as outras do Financeiro: grava direto na tabela,
// com a RLS da administração (can_manage_finance). Nada se apaga: o
// combinado que acabou fica desativado.

export async function listPatientPrices(patientId) {
  const { data, error } = await supabase
    .from('patient_prices')
    .select('*')
    .eq('patient_id', patientId)
    .order('discipline')
    .order('appointment_type', { nullsFirst: true });
  if (error) fail(error, 'Não foi possível carregar os valores combinados.');
  return data || [];
}

/** A tabela de valores da instituição, para mostrar o que o combinado substitui. */
export async function listClinicPrices() {
  const { data, error } = await supabase
    .from('procedure_prices')
    .select('discipline,appointment_type,professional_id,price_cents,active');
  if (error) fail(error, 'Não foi possível carregar a tabela de valores.');
  return data || [];
}

export const savePatientPrice = row => upsertRow('patient_prices', row, 'Não foi possível salvar o valor combinado.');

// ---------- gasto rápido (20261110b): administração e recepção ----------

/** Lança o gasto já pago; o banco dá o número do comprovante. */
export async function registerQuickExpense({ description, amountCents, paidOn, method, paidBy = null }) {
  return rpc('finance_register_quick_expense', {
    p_description: description,
    p_amount_cents: amountCents,
    p_paid_on: paidOn,
    p_method: method,
    p_paid_by: paidBy || null,
  }, 'Não foi possível lançar o gasto.');
}

/** Gastos rápidos de todos no período, com o nome de quem pagou e de quem lançou. */
export async function listQuickExpenses(from, to) {
  const rows = await rpc('finance_list_quick_expenses', { p_from: from, p_to: to }, 'Não foi possível carregar os gastos rápidos.');
  return (rows || []).map(row => ({
    id: row.expense_id,
    paid_on: row.paid_on,
    description: row.description,
    amount_cents: row.amount_cents,
    method: row.method,
    receipt_number: row.receipt_number,
    paid_by: row.paid_by,
    paid_by_name: row.paid_by_name,
    recorded_by_name: row.recorded_by_name,
    created_at: row.created_at,
    voided_at: row.voided_at,
    void_reason: row.void_reason,
    is_quick: true,
  }));
}

// ---------- recibo do prestador (20261110c): só a administração ----------

export async function issueProviderReceipt({ expenseId, providerName, providerDocument = '', services, period = '', place = '' }) {
  return rpc('finance_issue_provider_receipt', {
    p_expense: expenseId,
    p_provider_name: providerName,
    p_provider_document: providerDocument || null,
    p_services: services,
    p_period: period || null,
    p_place: place || null,
  }, 'Não foi possível emitir o recibo.');
}

export async function signProviderReceipt(receiptId) {
  return rpc('finance_sign_provider_receipt', { p_receipt: receiptId }, 'Não foi possível marcar como assinado.');
}

export async function voidProviderReceipt(receiptId, reason) {
  return rpc('finance_void_provider_receipt', { p_receipt: receiptId, p_reason: reason }, 'Não foi possível anular o recibo.');
}

// ---------- fechamento do mês (20261111): só a administração ----------

/** month: qualquer dia do mês ("AAAA-MM-DD"). */
export async function closeMonth(month) {
  return rpc('finance_close_month', { p_month: month }, 'Não foi possível fechar o mês.');
}

export async function reopenMonth(month, reason) {
  return rpc('finance_reopen_month', { p_month: month, p_reason: reason }, 'Não foi possível reabrir o mês.');
}

export async function voidExpense(expenseId, reason) {
  return rpc('finance_void_expense', { p_expense: expenseId, p_reason: reason }, 'Não foi possível anular a saída.');
}

// ---------- notas fiscais e comprovante (20261104) ----------

export const FISCAL_MIGRATION_HINT =
  'As notas fiscais ainda não estão no banco. Aplique a migração '
  + 'supabase/migrations/20261104_notas_fiscais.sql no Supabase.';

function isMissingFiscalSchema(error) {
  const text = [error?.message, error?.details, error?.hint, error?.code].filter(Boolean).join(' ');
  return /fiscal_|finance_receipt_voucher|finance_sequences/.test(text)
    && /does not exist|schema cache|Could not find|PGRST20[025]|42883|42P01/i.test(text);
}

export function fiscalErrorMessage(error, fallback) {
  if (isMissingFiscalSchema(error)) return FISCAL_MIGRATION_HINT;
  const text = error?.message || '';
  const coded = text.match(/^[a-z_]+: (.+)$/s);
  if (coded) return coded[1];
  return financeErrorMessage(error, fallback);
}

async function fiscalRpc(name, args, fallback) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(fiscalErrorMessage(error, fallback));
  return data;
}

/** Notas, o que cada uma cobre, configuração e comprovantes, numa ida só. */
export async function loadFiscalData() {
  const fallback = 'Não foi possível carregar as notas fiscais.';
  const results = await Promise.all([
    supabase.from('fiscal_documents').select('*').order('competence_on', { ascending: false }),
    supabase.from('fiscal_document_sources').select('document_id,receipt_group_id,convenio_payment_id,amount_cents,released_at'),
    supabase.from('clinic_fiscal_settings').select('*').maybeSingle(),
    supabase.from('clinic_fiscal_service_codes').select('*'),
    supabase.from('finance_receipt_vouchers').select('group_id,number'),
  ]);
  for (const result of results) {
    if (result.error) throw new Error(fiscalErrorMessage(result.error, fallback));
  }
  const [documents, sources, settings, codes, vouchers] = results.map(result => result.data);
  return { documents: documents || [], sources: sources || [], settings: settings || null, codes: codes || [], vouchers: vouchers || [] };
}

export const saveFiscalSettings = (emitterUrl, codes) =>
  fiscalRpc('finance_fiscal_save_settings', { p_emitter_url: emitterUrl || null, p_codes: codes }, 'Não foi possível salvar a configuração das notas.');
export const saveFiscalDocument = (docId, fields) =>
  fiscalRpc('finance_fiscal_save_document', { p_doc: docId, p_fields: fields }, 'Não foi possível salvar a nota.');
export const registerFiscalIssued = (docId, number, issuedOn, accessKey) =>
  fiscalRpc('finance_fiscal_register_issued', { p_doc: docId, p_number: number, p_issued_on: issuedOn, p_access_key: accessKey || null }, 'Não foi possível registrar a nota.');
export const cancelFiscalDocument = (docId, reason) =>
  fiscalRpc('finance_fiscal_cancel', { p_doc: docId, p_reason: reason }, 'Não foi possível registrar o cancelamento.');
export const receiptVoucherNumber = groupId =>
  fiscalRpc('finance_receipt_voucher', { p_group: groupId }, 'Não foi possível numerar o comprovante.');
