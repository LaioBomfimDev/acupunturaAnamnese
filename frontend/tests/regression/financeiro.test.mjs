// ============================================================
// Financeiro básico (Fase 6) — schema
//
// A regra que estes testes protegem: preço particular e preço por
// convênio são cadastros separados, repasse é por procedimento/
// disciplina (não um percentual único da clínica), e "fechamento" é
// resumo por período — sem rotina de caixa diário. Dado financeiro é
// visível só a admin da instituição.
// ============================================================

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const migrationPath = path.resolve(root, '../supabase/migrations/20260908_financeiro_backend.sql');
const profileJoinFixPath = path.resolve(
  root,
  '../supabase/migrations/20260922c_clinic_financial_summary_profile_join_fix.sql',
);

const sql = await readFile(migrationPath, 'utf8');

test('preço particular tem no máximo um padrão por disciplina e um por tipo específico', () => {
  assert.match(sql, /CREATE UNIQUE INDEX idx_procedure_prices_default_unique[\s\S]*?WHERE appointment_type IS NULL/);
  assert.match(sql, /CREATE UNIQUE INDEX idx_procedure_prices_specific_unique[\s\S]*?WHERE appointment_type IS NOT NULL/);
});

test('repasse é percentual por linha de procedure_prices, entre 0 e 100', () => {
  assert.match(sql, /repasse_percent NUMERIC\(5,2\) NOT NULL DEFAULT 0 CHECK \(repasse_percent >= 0 AND repasse_percent <= 100\)/);
});

test('preço por convênio é tabela própria, não reaproveita procedure_prices', () => {
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.convenio_procedure_prices/);
  assert.match(sql, /convenio_id UUID NOT NULL REFERENCES public\.clinic_convenios\(id\) ON DELETE CASCADE/);
});

test('clinic_id de convenio_procedure_prices vem do convênio, não do cliente', () => {
  const trigger = sql.match(/CREATE OR REPLACE FUNCTION public\.set_convenio_price_defaults[\s\S]*?\$\$;/);
  assert.ok(trigger, 'precisa existir o trigger que deriva clinic_id do convênio');
  assert.match(trigger[0], /SELECT clinic_id INTO NEW\.clinic_id FROM public\.clinic_convenios WHERE id = NEW\.convenio_id/);
  assert.match(trigger[0], /RAISE EXCEPTION/);
});

test('atendimento marcado particular não pode carregar convenio_id', () => {
  assert.match(sql, /CONSTRAINT appointments_billing_convenio_shape/);
  assert.match(sql, /CHECK \(billing_type = 'convenio' OR convenio_id IS NULL\)/);
});

test('clinic_id de appointment_payments vem do agendamento, não do cliente', () => {
  const trigger = sql.match(/CREATE OR REPLACE FUNCTION public\.set_appointment_payment_defaults[\s\S]*?\$\$;/);
  assert.ok(trigger, 'precisa existir o trigger que deriva clinic_id do agendamento');
  assert.match(trigger[0], /SELECT clinic_id INTO NEW\.clinic_id FROM public\.appointments WHERE id = NEW\.appointment_id/);
});

test('pagamento aceita só os métodos previstos', () => {
  assert.match(
    sql,
    /payment_method TEXT NOT NULL\s*\n\s*CHECK \(payment_method IN \('dinheiro', 'cartao_debito', 'cartao_credito', 'pix', 'convenio', 'outro'\)\)/,
  );
});

test('resumo financeiro roda como quem chama (RLS decide, não SECURITY DEFINER)', () => {
  const fn = sql.match(/CREATE OR REPLACE FUNCTION public\.clinic_financial_summary[\s\S]*?\$\$;/);
  assert.ok(fn);
  assert.doesNotMatch(fn[0], /SECURITY DEFINER/);
  assert.match(fn[0], /LEFT JOIN LATERAL/);
});

test('as 4 tabelas novas são só legíveis/graváveis por admin da instituição', () => {
  for (const policyName of [
    'procedure_prices_admin',
    'clinic_convenios_admin',
    'convenio_procedure_prices_admin',
    'appointment_payments_admin',
  ]) {
    const policy = sql.match(new RegExp(`CREATE POLICY ${policyName}[\\s\\S]*?;`));
    assert.ok(policy, `política ${policyName} precisa existir`);
    assert.match(policy[0], /is_clinic_admin\(\) OR public\.is_super_admin\(\)/);
  }
});

test('nenhuma tabela nova concede acesso a anon', () => {
  for (const table of ['procedure_prices', 'clinic_convenios', 'convenio_procedure_prices', 'appointment_payments']) {
    assert.match(sql, new RegExp(`REVOKE ALL ON public\\.${table} FROM anon`));
  }
});

test('migração não cita nome de concorrente', () => {
  assert.doesNotMatch(sql, /somar|edutec/i);
});

// ---------- 20260922c: JOIN cru contra profiles escondia pagamento de colega ----------
//
// Reproduzido com INSERT real (rollback) simulando um clinic_admin chamando
// clinic_financial_summary logo após um pagamento de um COLEGA da mesma
// clínica: o resumo voltava vazio, sem erro — o `JOIN public.profiles pr`
// dentro da function (LANGUAGE sql, sem SECURITY DEFINER, de propósito, pra
// deixar a RLS de appointment_payments/procedure_prices isolar a clínica)
// também herdava "Profiles select self or super admin" e só batia quando
// professional_id == quem chamou.

test('profile_full_name existe e é SECURITY DEFINER — sem isso o JOIN em profiles herda a RLS "só vê a si mesmo" e esconde pagamento de colega', async () => {
  const fixSql = await readFile(profileJoinFixPath, 'utf8');
  assert.match(fixSql, /CREATE OR REPLACE FUNCTION public\.profile_full_name/);
  assert.match(fixSql, /SECURITY DEFINER/);
  assert.match(fixSql, /REVOKE ALL ON FUNCTION public\.profile_full_name\(UUID\) FROM PUBLIC, anon/);
});

test('clinic_financial_summary troca o JOIN cru em profiles por profile_full_name, mantendo o isolamento por clínica via RLS', async () => {
  const fixSql = await readFile(profileJoinFixPath, 'utf8');
  const fn = fixSql.match(/CREATE OR REPLACE FUNCTION public\.clinic_financial_summary[\s\S]*?\$\$;/);
  assert.ok(fn);
  assert.doesNotMatch(
    fn[0],
    /JOIN public\.profiles/,
    'JOIN cru contra profiles herda "cada perfil só vê a si mesmo" e some com pagamento de qualquer colega',
  );
  assert.match(fn[0], /public\.profile_full_name\(a\.professional_id\)/);
  // Continua rodando como quem chama: reimplementar isolamento de clínica
  // manualmente aqui seria abrir um BOLA novo (a RLS de appointment_payments/
  // procedure_prices já faz esse trabalho).
  assert.doesNotMatch(fn[0], /\bSECURITY DEFINER\b/);
});
