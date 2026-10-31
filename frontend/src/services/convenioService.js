// ============================================================
// Convênios, Fase 1 (31/10/2026) — leitura e gravação dos cadastros
//
// Migração: supabase/migrations/20261031_convenios_fase1.sql (+ catálogo
// oficial em 20261031b_tiss_terms_202607.sql).
//
// Operadora, credenciamento, preços, solicitantes e dados de faturamento
// de quem atende: só a administração (RLS com can_manage_finance).
// Operadora e plano a equipe do cadastro também lê, para escolher no
// convênio do paciente; o convênio do paciente quem edita o cadastro
// grava (sem apagar: desativa).
// ============================================================

import { supabase } from '../lib/supabase';
import { normalizeCnpj, onlyDigits } from '../utils/convenio';

export const CONVENIO_MIGRATION_HINT =
  'Os cadastros de convênio ainda não estão no banco. Aplique a migração '
  + 'supabase/migrations/20261031_convenios_fase1.sql no Supabase.';

function isMissingSchemaError(error) {
  const text = [error?.message, error?.details, error?.hint, error?.code].filter(Boolean).join(' ');
  return /convenio_plans|convenio_credentials|tiss_requesters|professional_billing_info|patient_coverages|tiss_terms|ans_registry|cnes/.test(text)
    && /does not exist|schema cache|Could not find|PGRST20[025]|42703/i.test(text);
}

/** Erro do banco → frase que quem está na tela entende. */
export function convenioErrorMessage(error, fallback) {
  if (isMissingSchemaError(error)) return CONVENIO_MIGRATION_HINT;
  const text = error?.message || '';
  if (/idx_clinic_convenios_ans_unique/.test(text)) return 'Já existe uma operadora com esse registro ANS.';
  if (/clinic_convenios_name_unique/.test(text)) return 'Já existe uma operadora com esse nome.';
  if (/idx_convenio_plans_name_unique/.test(text)) return 'Esta operadora já tem um plano com esse nome.';
  if (/idx_convenio_credentials_clinic_unique/.test(text)) return 'A clínica já está credenciada nesta operadora.';
  if (/idx_convenio_credentials_professional_unique/.test(text)) return 'Este profissional já está credenciado nesta operadora.';
  if (/idx_convenio_prices_(default|specific)_unique/.test(text)) return 'Esta área e tipo já têm preço nesta operadora.';
  if (/idx_tiss_requesters_council_unique/.test(text)) return 'Já existe um solicitante com esse conselho e número.';
  if (/idx_patient_coverages_active_unique/.test(text)) return 'O paciente já tem esta operadora ativa. Mude a que existe.';
  if (/plano_de_outra_operadora/.test(text)) return 'O plano escolhido é de outra operadora.';
  if (error?.code === '23514') return 'Algum campo está fora do formato. Confira os números digitados.';
  if (error?.code === '23503') return 'Este cadastro já está em uso: desative em vez de excluir.';
  if (error?.code === '42501' || /permission denied|row-level security/i.test(text)) {
    return 'Só a administração da instituição altera os convênios.';
  }
  return text || fallback;
}

function fail(error, fallback) {
  throw new Error(convenioErrorMessage(error, fallback));
}

async function rows(query, fallback) {
  const { data, error } = await query;
  if (error) fail(error, fallback);
  return data || [];
}

async function upsertRow(table, row, fallback) {
  const query = row.id
    ? supabase.from(table).update(row).eq('id', row.id).select('*').single()
    : supabase.from(table).insert(row).select('*').single();
  const { data, error } = await query;
  if (error) fail(error, fallback);
  return data;
}

// ---------- administração (Financeiro → Convênios) ----------

/** Tudo o que as telas de convênio do Financeiro usam, numa ida só. */
export async function loadConvenioData(clinicId) {
  const fallback = 'Não foi possível carregar os convênios.';
  const [convenios, plans, credentials, prices, requesters, billing, cbos, clinicResult] = await Promise.all([
    rows(supabase.from('clinic_convenios').select('*').order('name'), fallback),
    rows(supabase.from('convenio_plans').select('*').order('name'), fallback),
    rows(supabase.from('convenio_credentials').select('*').order('created_at'), fallback),
    rows(supabase.from('convenio_procedure_prices').select('*').order('discipline'), fallback),
    rows(supabase.from('tiss_requesters').select('*').order('name'), fallback),
    rows(supabase.from('professional_billing_info').select('*'), fallback),
    listTissTerms('24'),
    clinicId
      ? supabase.from('clinics').select('id,name,cnpj,cnes').eq('id', clinicId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (clinicResult.error) fail(clinicResult.error, fallback);
  return { convenios, plans, credentials, prices, requesters, billing, cbos, clinic: clinicResult.data || null };
}

export function saveConvenio(row) {
  return upsertRow('clinic_convenios', {
    ...row,
    ...(row.cnpj !== undefined ? { cnpj: row.cnpj ? normalizeCnpj(row.cnpj) : null } : {}),
    ...(row.ans_registry !== undefined ? { ans_registry: onlyDigits(row.ans_registry) || null } : {}),
  }, 'Não foi possível salvar a operadora.');
}

export const savePlan = row => upsertRow('convenio_plans', row, 'Não foi possível salvar o plano.');
export const saveCredential = row => upsertRow('convenio_credentials', row, 'Não foi possível salvar o credenciamento.');
export const saveConvenioPrice = row => upsertRow('convenio_procedure_prices', row, 'Não foi possível salvar o preço.');
export const saveRequester = row => upsertRow('tiss_requesters', row, 'Não foi possível salvar o solicitante.');

export async function deleteConvenioPrice(id) {
  const { error } = await supabase.from('convenio_procedure_prices').delete().eq('id', id);
  if (error) fail(error, 'Não foi possível tirar o preço.');
}

export async function saveProfessionalBilling(professionalId, info) {
  const { data, error } = await supabase
    .from('professional_billing_info')
    .upsert({
      professional_id: professionalId,
      cpf: onlyDigits(info.cpf) || null,
      council_code: info.council_code || null,
      council_number: String(info.council_number || '').trim() || null,
      council_uf: info.council_uf || null,
      cbo_code: info.cbo_code || null,
    }, { onConflict: 'professional_id' })
    .select('*')
    .single();
  if (error) fail(error, 'Não foi possível salvar os dados de faturamento.');
  return data;
}

export async function saveClinicCnes(clinicId, cnes) {
  const { error } = await supabase.rpc('finance_save_clinic_cnes', { p_clinic: clinicId, p_cnes: cnes || null });
  if (error) {
    if (/cnes_invalido/.test(error.message || '')) throw new Error('O CNES tem 7 números.');
    fail(error, 'Não foi possível salvar o CNES.');
  }
}

// ---------- catálogo oficial ----------

/** Tabela inteira (só as pequenas: 24 CBO, 26, 50, 59, 76). */
export function listTissTerms(tableCode) {
  return rows(
    supabase.from('tiss_terms').select('code,term,valid_until').eq('table_code', tableCode).order('term'),
    'Não foi possível carregar a tabela da ANS.',
  );
}

/** Busca na tabela 22 (procedimentos) por código ou por palavra do termo. */
export async function searchTussProcedures(text, limit = 20) {
  const query = String(text || '').trim();
  if (query.length < 3) return [];
  let request = supabase.from('tiss_terms').select('code,term,valid_until').eq('table_code', '22');
  if (/^\d+$/.test(query)) {
    request = request.like('code', `${query}%`);
  } else {
    // Cada palavra precisa aparecer no termo, em qualquer ordem.
    for (const word of query.split(/\s+/).filter(Boolean)) {
      request = request.ilike('term', `%${word.replace(/[%_\\]/g, '')}%`);
    }
  }
  return rows(request.order('code').limit(limit), 'Não foi possível buscar na tabela TUSS.');
}

// ---------- convênio do paciente (ficha) ----------

/** Operadoras ativas e seus planos, para escolher no cadastro do paciente. */
export async function listConvenioChoices() {
  const fallback = 'Não foi possível carregar as operadoras.';
  const [convenios, plans] = await Promise.all([
    rows(supabase.from('clinic_convenios').select('id,name,active').eq('active', true).order('name'), fallback),
    rows(supabase.from('convenio_plans').select('id,convenio_id,name,active').eq('active', true).order('name'), fallback),
  ]);
  return { convenios, plans };
}

export function listPatientCoverages(patientId) {
  return rows(
    supabase.from('patient_coverages').select('*').eq('patient_id', patientId).order('active', { ascending: false }).order('created_at'),
    'Não foi possível carregar o convênio do paciente.',
  );
}

export function savePatientCoverage(row) {
  return upsertRow('patient_coverages', {
    ...row,
    ...(row.cns !== undefined ? { cns: onlyDigits(row.cns) || null } : {}),
  }, 'Não foi possível salvar o convênio do paciente.');
}
