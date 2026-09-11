// ============================================================
// Financeiro básico (Fase 6) — camada de dados, sem tela
//
// Migração: supabase/migrations/20260908_financeiro_backend.sql
//
// Preço particular e preço por convênio são cadastros separados
// (procedure_prices / convenio_procedure_prices) — o mesmo
// procedimento pode valer diferente para cada um. Repasse ao
// profissional é por procedimento/disciplina (procedure_prices.
// repasse_percent), não um percentual único da clínica.
//
// "Fechamento" é resumo agregado por período (getFinancialSummary),
// não uma rotina de abrir/fechar caixa diário — decisão da usuária,
// 2026-09-08.
//
// Convênio aqui é só cadastro (nome, vigência, preço por
// procedimento). Não há integração com sistema/portal de operadora
// nenhuma ainda — falta saber qual operadora, cada uma tem endpoint
// e protocolo próprios.
// ============================================================

import { supabase } from '../lib/supabase';

const MIGRATION_HINT =
  'Recursos financeiros ausentes no banco. Aplique a migração ' +
  'supabase/migrations/20260908_financeiro_backend.sql no Supabase.';

function isMissingFinanceiroSchemaError(error) {
  const text = [error?.message, error?.details, error?.hint, error?.code]
    .filter(Boolean)
    .join(' ');
  return /procedure_prices|clinic_convenios|convenio_procedure_prices|appointment_payments|clinic_financial_summary/.test(text)
    && /does not exist|schema cache|Could not find|PGRST202/i.test(text);
}

function throwFriendly(error, fallbackMessage) {
  if (isMissingFinanceiroSchemaError(error)) throw new Error(MIGRATION_HINT);
  throw new Error(error?.message || fallbackMessage);
}

// ---------- preço particular por procedimento ----------

export async function listProcedurePrices({ discipline = null } = {}) {
  let query = supabase
    .from('procedure_prices')
    .select('id,discipline,appointment_type,price_cents,repasse_percent,active')
    .order('discipline', { ascending: true });
  if (discipline) query = query.eq('discipline', discipline);

  const { data, error } = await query;
  if (error) throwFriendly(error, 'Não foi possível carregar os preços.');
  return data || [];
}

export async function upsertProcedurePrice({
  id = null,
  discipline,
  appointmentType = null,
  priceCents,
  repassePercent,
  active = true,
}) {
  const row = {
    discipline,
    appointment_type: appointmentType,
    price_cents: priceCents,
    repasse_percent: repassePercent,
    active,
  };
  if (id) row.id = id;

  const { data, error } = await supabase
    .from('procedure_prices')
    .upsert(row)
    .select('id,discipline,appointment_type,price_cents,repasse_percent,active')
    .single();

  if (error) throwFriendly(error, 'Não foi possível salvar o preço.');
  return data;
}

export async function deleteProcedurePrice(id) {
  const { error } = await supabase.from('procedure_prices').delete().eq('id', id);
  if (error) throwFriendly(error, 'Não foi possível remover o preço.');
}

// ---------- convênios (cadastro) ----------

export async function listConvenios({ activeOnly = false } = {}) {
  let query = supabase
    .from('clinic_convenios')
    .select('id,name,valid_from,valid_until,active,notes')
    .order('name', { ascending: true });
  if (activeOnly) query = query.eq('active', true);

  const { data, error } = await query;
  if (error) throwFriendly(error, 'Não foi possível carregar os convênios.');
  return data || [];
}

export async function upsertConvenio({
  id = null,
  name,
  validFrom = null,
  validUntil = null,
  active = true,
  notes = null,
}) {
  const row = { name, valid_from: validFrom, valid_until: validUntil, active, notes };
  if (id) row.id = id;

  const { data, error } = await supabase
    .from('clinic_convenios')
    .upsert(row)
    .select('id,name,valid_from,valid_until,active,notes')
    .single();

  if (error) throwFriendly(error, 'Não foi possível salvar o convênio.');
  return data;
}

export async function deleteConvenio(id) {
  const { error } = await supabase.from('clinic_convenios').delete().eq('id', id);
  if (error) throwFriendly(error, 'Não foi possível remover o convênio.');
}

// ---------- preço por procedimento, por convênio ----------

export async function listConvenioProcedurePrices(convenioId) {
  const { data, error } = await supabase
    .from('convenio_procedure_prices')
    .select('id,discipline,appointment_type,price_cents')
    .eq('convenio_id', convenioId)
    .order('discipline', { ascending: true });

  if (error) throwFriendly(error, 'Não foi possível carregar os preços do convênio.');
  return data || [];
}

export async function upsertConvenioProcedurePrice({
  id = null,
  convenioId,
  discipline,
  appointmentType = null,
  priceCents,
}) {
  const row = {
    convenio_id: convenioId,
    discipline,
    appointment_type: appointmentType,
    price_cents: priceCents,
  };
  if (id) row.id = id;

  const { data, error } = await supabase
    .from('convenio_procedure_prices')
    .upsert(row)
    .select('id,discipline,appointment_type,price_cents')
    .single();

  if (error) throwFriendly(error, 'Não foi possível salvar o preço do convênio.');
  return data;
}

export async function deleteConvenioProcedurePrice(id) {
  const { error } = await supabase.from('convenio_procedure_prices').delete().eq('id', id);
  if (error) throwFriendly(error, 'Não foi possível remover o preço do convênio.');
}

// ---------- pagamentos por agendamento ----------

export const PAYMENT_METHODS = [
  { id: 'dinheiro', label: 'Dinheiro' },
  { id: 'cartao_debito', label: 'Cartão de débito' },
  { id: 'cartao_credito', label: 'Cartão de crédito' },
  { id: 'pix', label: 'Pix' },
  { id: 'convenio', label: 'Convênio' },
  { id: 'outro', label: 'Outro' },
];

export async function listAppointmentPayments(appointmentId) {
  const { data, error } = await supabase
    .from('appointment_payments')
    .select('id,amount_cents,payment_method,paid_at,note')
    .eq('appointment_id', appointmentId)
    .order('paid_at', { ascending: true });

  if (error) throwFriendly(error, 'Não foi possível carregar os pagamentos.');
  return data || [];
}

export async function recordAppointmentPayment({
  appointmentId,
  amountCents,
  paymentMethod,
  paidAt = null,
  note = null,
}) {
  const row = {
    appointment_id: appointmentId,
    amount_cents: amountCents,
    payment_method: paymentMethod,
    note,
  };
  if (paidAt) row.paid_at = paidAt;

  const { data, error } = await supabase
    .from('appointment_payments')
    .insert(row)
    .select('id,amount_cents,payment_method,paid_at,note')
    .single();

  if (error) throwFriendly(error, 'Não foi possível registrar o pagamento.');
  return data;
}

export async function deleteAppointmentPayment(id) {
  const { error } = await supabase.from('appointment_payments').delete().eq('id', id);
  if (error) throwFriendly(error, 'Não foi possível remover o pagamento.');
}

// ---------- resumo por período (fechamento agregado) ----------

/**
 * Uma linha por profissional × disciplina × forma de pagamento, com o
 * total recebido e o repasse devido (já calculado pelo banco a partir
 * de procedure_prices.repasse_percent). Sem tela ainda: quem monta a
 * visão agregada (total por profissional, líquido da clínica) é quem
 * consumir isto.
 */
export async function getFinancialSummary({ from, to, professionalId = null }) {
  const { data, error } = await supabase.rpc('clinic_financial_summary', {
    p_from: from,
    p_to: to,
    p_professional: professionalId,
  });

  if (error) throwFriendly(error, 'Não foi possível carregar o resumo financeiro.');
  return (data || []).map(row => ({
    professionalId: row.professional_id,
    professionalName: row.professional_name,
    discipline: row.discipline,
    paymentMethod: row.payment_method,
    receivedCents: Number(row.received_cents) || 0,
    repasseCents: Number(row.repasse_cents) || 0,
  }));
}
