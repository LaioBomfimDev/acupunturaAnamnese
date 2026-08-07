import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const migrationPath = path.resolve(
  frontendRoot,
  '../supabase/migrations/20260723_clinical_data_hardening.sql',
);
const knowledgeSyncPath = path.resolve(
  frontendRoot,
  'scripts/sync-approved-knowledge.mjs',
);

let sql;
let knowledgeSync;

before(async () => {
  [sql, knowledgeSync] = await Promise.all([
    readFile(migrationPath, 'utf8'),
    readFile(knowledgeSyncPath, 'utf8'),
  ]);
});

function functionBody(name) {
  const expression = new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${name}\\b[\\s\\S]*?`
      + `AS \\$${name}\\$([\\s\\S]*?)\\$${name}\\$;`,
  );
  const match = sql.match(expression);
  assert.ok(match, `função ${name} ausente ou sem delimitador próprio`);
  return match[1];
}

test('preflight do Vault vem antes do DDL e falha fechado sem segredo compatível', () => {
  const preflightAt = sql.indexOf('DO $vault_preflight$');
  const firstSchemaChangeAt = sql.indexOf('ALTER TABLE public.profiles');
  assert.ok(preflightAt >= 0);
  assert.ok(firstSchemaChangeAt > preflightAt);
  assert.match(sql, /to_regclass\('vault\.decrypted_secrets'\) IS NULL/);
  assert.match(sql, /clinical_records_encryption_key/);
  assert.match(sql, /extensions\.pgp_sym_decrypt\(v_sample, v_key\)/);
  assert.match(sql, /Hardening clínico bloqueado/);
  assert.match(sql, /Esta migration não gira chave nem recriptografa linhas/);
});

test('chave clínica é lida somente do Vault e a cópia em app_config é removida', () => {
  const body = functionBody('get_clinical_encryption_key');
  assert.match(body, /FROM vault\.decrypted_secrets/);
  assert.match(body, /Chave clínica indisponível no Vault/);
  assert.doesNotMatch(body, /app_config/);

  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.get_clinical_encryption_key\(\) FROM PUBLIC, anon, authenticated/,
  );
  assert.match(
    sql,
    /DELETE FROM public\.app_config\s+WHERE key = 'encryption_key'/,
  );
  assert.doesNotMatch(sql, /INSERT INTO public\.app_config/i);
  assert.doesNotMatch(sql, /vault\.create_secret\s*\(/i);
});

test('papéis, disciplines NOT NULL e gate clínico ficam coerentes', () => {
  for (const role of [
    'therapist',
    'clinic_admin',
    'super_admin',
    'knowledge_reviewer',
  ]) {
    assert.ok(sql.includes(`'${role}'`), `papel ${role} ausente`);
  }

  const gate = functionBody('can_access_clinical_data');
  assert.match(gate, /p\.is_active IS TRUE/);
  assert.match(gate, /p\.must_change_password IS NOT TRUE/);
  assert.match(sql, /normalize_profile_disciplines_not_null/);
  assert.match(sql, /IF NEW\.disciplines IS NOT NULL THEN/);
  assert.match(
    sql,
    /BEFORE INSERT OR UPDATE OF disciplines, profession, role/,
  );
});

test('MFA é opt-in sem lockout e passa a exigir aal2 somente após flag', () => {
  assert.match(
    sql,
    /ADD COLUMN IF NOT EXISTS mfa_required BOOLEAN NOT NULL DEFAULT FALSE/,
  );
  const gate = functionBody('can_access_clinical_data');
  assert.match(gate, /p\.mfa_required IS NOT TRUE/);
  assert.match(gate, /auth\.jwt\(\) ->> 'aal'/);
  assert.match(gate, /'aal1'\) = 'aal2'/);
  assert.match(sql, /Não faça backfill por papel/);
  assert.match(sql, /publicar UI de enrollment\/challenge\/verify/);

  const executableSql = sql
    .split(/\r?\n/)
    .filter(line => !line.trimStart().startsWith('--'))
    .join('\n');
  assert.doesNotMatch(
    executableSql,
    /UPDATE public\.profiles[\s\S]*?SET mfa_required = TRUE/i,
  );
  assert.doesNotMatch(
    sql,
    /DROP POLICY IF EXISTS "Profiles select self or super admin"/,
  );
});

test('RPCs clínicas existentes exigem gate, posse e helper central de chave', () => {
  for (const name of [
    'insert_clinical_record',
    'get_clinical_records',
    'update_clinical_record',
  ]) {
    const body = functionBody(name);
    assert.match(body, /public\.can_access_clinical_data\(v_uid\)/);
    assert.match(body, /public\.get_clinical_encryption_key\(\)/);
    assert.doesNotMatch(body, /app_config/);
  }

  const insert = functionBody('insert_clinical_record');
  assert.match(insert, /p\.therapist_id = v_uid/);
  const update = functionBody('update_clinical_record');
  assert.match(update, /revision = cr\.revision \+ 1/);
});

test('autosave tem contrato exato, revisão otimista e replay idempotente', () => {
  assert.match(
    sql,
    /FUNCTION public\.upsert_clinical_session\(\s*p_patient_id UUID,\s*p_data TEXT,\s*p_expected_revision BIGINT,\s*p_idempotency_key UUID,\s*p_discipline TEXT DEFAULT 'acupuntura'/s,
  );
  assert.match(
    sql,
    /RETURNS TABLE \(\s*id UUID,\s*revision BIGINT,\s*updated_at TIMESTAMPTZ,\s*replayed BOOLEAN\s*\)/s,
  );

  const sessionBody = functionBody('upsert_clinical_session');
  assert.match(
    sessionBody,
    /public\.upsert_versioned_clinical_record\(/,
  );
  assert.match(sessionBody, /'full_session'/);

  assert.match(
    sql,
    /FUNCTION public\.upsert_versioned_clinical_record\(\s*p_patient_id UUID,\s*p_record_type TEXT,\s*p_data TEXT,\s*p_expected_revision BIGINT,\s*p_idempotency_key UUID,\s*p_discipline TEXT/s,
  );
  const body = functionBody('upsert_versioned_clinical_record');
  assert.match(body, /p_expected_revision <> 0/);
  assert.match(body, /v_record\.revision <> p_expected_revision/);
  assert.match(body, /ERRCODE = '40001'/);
  assert.match(body, /pg_advisory_xact_lock/);
  assert.match(body, /clinical_record_write_receipts/);
  assert.match(body, /v_receipt\.request_hash <> v_request_hash/);
  assert.match(body, /TRUE;\s+RETURN;/);
  assert.match(body, /v_record_found := FOUND/);
  assert.match(body, /IF v_record_found THEN/);
  for (const type of [
    'full_session',
    'psi_anamnese',
    'psi_neuro_avaliacao',
  ]) {
    assert.ok(body.includes(`'${type}'`), `record_type ${type} ausente`);
  }
  assert.match(
    body,
    /p_record_type IN \('psi_anamnese', 'psi_neuro_avaliacao'\)[\s\S]*?p_discipline <> 'psicologia'/,
  );
});

test('leitura mais recente expõe revisão e conteúdo sem abrir acesso compartilhado', () => {
  assert.match(
    sql,
    /FUNCTION public\.get_latest_clinical_record\(\s*p_patient_id UUID,\s*p_record_type TEXT,\s*p_discipline TEXT DEFAULT NULL/s,
  );
  assert.match(
    sql,
    /RETURNS TABLE \(\s*id UUID,\s*patient_id UUID,\s*record_type TEXT,\s*discipline TEXT,\s*revision BIGINT,\s*sensitive_data TEXT/s,
  );
  const body = functionBody('get_latest_clinical_record');
  assert.match(body, /p\.therapist_id = v_uid/);
  assert.match(body, /LIMIT 1/);
});

test('auditoria clínica é append-only e toda mutação exige avanço de uma revisão', () => {
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.clinical_record_audit_log/);
  assert.match(sql, /ciphertext_sha256 TEXT/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.clinical_record_write_receipts/);
  assert.match(sql, /clinical_audit_reject_mutation/);
  assert.match(sql, /clinical_receipts_reject_mutation/);
  assert.match(sql, /NEW\.revision <> OLD\.revision \+ 1/);
  assert.match(sql, /AFTER INSERT OR UPDATE OR DELETE\s+ON public\.clinical_records/);
  assert.match(
    sql,
    /REVOKE ALL ON TABLE public\.clinical_record_audit_log FROM PUBLIC, anon, authenticated/,
  );
  assert.match(
    sql,
    /GRANT SELECT ON TABLE public\.clinical_record_audit_log TO authenticated/,
  );
});

test('consulta de auditoria do paciente não devolve payload clínico', () => {
  assert.match(
    sql,
    /FUNCTION public\.get_patient_audit_log\(\s*p_patient_id UUID,\s*p_limit INTEGER DEFAULT 50/s,
  );
  assert.match(
    sql,
    /RETURNS TABLE \(\s*audit_id UUID,\s*record_id UUID,\s*action TEXT,\s*record_type TEXT,\s*discipline TEXT,\s*old_revision BIGINT,\s*new_revision BIGINT,\s*actor_id UUID,\s*occurred_at TIMESTAMPTZ/s,
  );
  const body = functionBody('get_patient_audit_log');
  assert.match(body, /public\.can_access_clinical_data\(v_uid\)/);
  assert.match(body, /v_patient_owner = v_uid/);
  assert.match(body, /public\.is_clinic_admin\(v_uid\)/);
  assert.match(body, /s\.revoked_at IS NULL/);
  assert.match(body, /s\.from_discipline = audit\.discipline/);
  assert.match(body, /LIMIT p_limit/);
  assert.doesNotMatch(
    body,
    /sensitive_data|ciphertext_sha256|idempotency_key/,
  );
});

test('compartilhamento filtra o payload no servidor conforme os escopos', () => {
  const shared = functionBody('get_shared_session');
  assert.match(shared, /public\.can_access_clinical_data\(v_uid\)/);
  assert.match(shared, /s\.revoked_at IS NULL/);
  assert.match(shared, /v_source_disciplines/);
  assert.match(shared, /authorized_share\.allowed_scopes/);
  assert.match(shared, /s\.from_discipline = cr\.discipline/);
  assert.match(shared, /public\.filter_shared_session_payload/);
  assert.match(shared, /LIMIT 1/);
  assert.doesNotMatch(shared, /app_config/);

  const filter = functionBody('filter_shared_session_payload');
  for (const scope of [
    'cadastro',
    'resumo',
    'anamnese',
    'dores',
    'evolucao',
    'relatorio',
  ]) {
    assert.ok(filter.includes(`'${scope}'`), `escopo ${scope} ausente`);
  }
  assert.match(filter, /'queixa', v_source_state -> 'queixa'/);
  assert.match(filter, /'evolucoes', v_source_state -> 'evolucoes'/);
  assert.match(filter, /'relatorioEdits', v_source_state -> 'relatorioEdits'/);
  assert.doesNotMatch(filter, /RETURN\s+p_payload/i);
});

test('RLS adicional de pacientes, compartilhamentos e fotos exige gate ativo', () => {
  for (const policy of [
    'patients_select_clinic_discipline',
    'patients_select_clinic_admin',
    'enrollments_select_clinic',
    'enrollments_insert_initial_own',
    'enrollments_update_lifecycle',
    'record_shares_select_clinic',
    'record_shares_update',
  ]) {
    const start = sql.indexOf(`CREATE POLICY ${policy}`);
    assert.ok(start >= 0, `política ${policy} ausente`);
    const end = sql.indexOf(';', start);
    assert.match(
      sql.slice(start, end + 1),
      /public\.can_access_clinical_data\(auth\.uid\(\)\)/,
    );
  }
  assert.doesNotMatch(sql, /CREATE POLICY record_shares_insert/);
  assert.match(
    sql,
    /REVOKE INSERT, UPDATE, DELETE ON TABLE public\.record_shares FROM authenticated/,
  );

  for (const policy of [
    'Terapeuta envia fotos de língua na própria pasta',
    'Terapeuta lê fotos de língua da própria pasta',
    'Terapeuta remove fotos de língua da própria pasta',
  ]) {
    const start = sql.indexOf(`CREATE POLICY "${policy}"`);
    assert.ok(start >= 0, `política ${policy} ausente`);
    const end = sql.indexOf(';', start);
    const policySql = sql.slice(start, end + 1);
    assert.match(
      policySql,
      /public\.can_access_clinical_data\(auth\.uid\(\)\)/,
    );
    assert.match(policySql, /clinical-tongue-photos/);
  }
});

test('primeira matrícula usa marca atômica no paciente contra corrida entre disciplinas', () => {
  assert.match(
    sql,
    /ADD COLUMN IF NOT EXISTS initial_enrollment_created_at TIMESTAMPTZ/i,
  );
  assert.match(
    sql,
    /SET initial_enrollment_created_at = pg_catalog\.clock_timestamp\(\)[\s\S]*p\.initial_enrollment_created_at IS NULL[\s\S]*RETURNING p\.clinic_id INTO v_patient_clinic/i,
  );
  assert.match(
    sql,
    /IF auth\.role\(\) = 'service_role' THEN[\s\S]*UPDATE public\.patients p/i,
  );
});

test('runtime de conhecimento lê somente versão corrente profissionalmente aprovada', () => {
  const body = functionBody('get_active_knowledge_reviews');
  assert.match(body, /public\.can_access_clinical_data\(v_uid\)/);
  assert.match(body, /kev\.version = ke\.current_version/);
  assert.match(body, /ke\.approval_status = 'approved'/);
  assert.match(body, /knowledge_payload_professionally_approved\(kev\.payload\)/);
  assert.match(body, /cardinality\(kev\.source_ids\) > 0/);
  assert.match(body, /knowledge_payload_has_traceable_provenance\(kev\.payload\)/);
  assert.match(
    sql,
    /RETURNS TABLE \(\s*entity_id UUID,\s*entity_key TEXT,\s*entity_type TEXT,\s*entity_title TEXT,\s*entity_code TEXT,\s*entity_tags TEXT\[\],\s*version INTEGER,\s*payload JSONB,\s*source_ids UUID\[\],\s*approved_at TIMESTAMPTZ/s,
  );
  assert.match(body, /auth\.role\(\) IS DISTINCT FROM 'service_role'/);
  assert.match(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.get_active_knowledge_reviews\(\)\s+TO authenticated, service_role/,
  );
});

test('decisão de curadoria é transacional e não confunde SuperAdm com gate profissional', () => {
  const body = functionBody('approve_knowledge_curation_proposal');
  assert.match(body, /public\.is_super_admin\(v_uid\)/);
  assert.match(body, /public\.can_access_clinical_data\(v_uid\)/);
  assert.match(body, /FOR UPDATE/);
  assert.match(body, /v_proposal\.status <> 'proposed'/);
  assert.match(body, /v_proposal\.type <> 'knowledge_review'/);
  assert.match(body, /knowledge_payload_has_traceable_provenance/);
  assert.match(body, /knowledge_payload_professionally_approved/);
  assert.match(
    body,
    /v_professional_reviewer <> v_proposal\.proposer_id/,
    'o atestado profissional deve pertencer à conta que propôs a revisão',
  );
  assert.match(body, /ELSE 'review'/);
  assert.match(body, /'requiresProfessionalAudit', TRUE/);
  assert.match(body, /INSERT INTO public\.knowledge_entity_versions/);
  assert.match(body, /UPDATE public\.curation_proposals/);
  assert.match(body, /INSERT INTO public\.knowledge_audit_log/);
  assert.match(body, /INSERT INTO public\.knowledge_outbox/);
  assert.match(
    sql,
    /CREATE POLICY curation_proposals_update[\s\S]*?type <> 'knowledge_review'/,
  );

  const professionalGate = functionBody(
    'knowledge_payload_professionally_approved',
  );
  assert.match(professionalGate, /requiresProfessionalAudit/);
  assert.match(professionalGate, /server_professional/);
  assert.match(professionalGate, /professionalReview,attestationId/);
  assert.match(professionalGate, /professional_registration/);
});

test('outbox é durável, sem worker automático e com mutação limitada', () => {
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.knowledge_outbox/);
  for (const column of [
    'attempts INTEGER',
    'available_at TIMESTAMPTZ',
    'processed_at TIMESTAMPTZ',
    'last_error TEXT',
  ]) {
    assert.ok(sql.includes(column), `coluna ${column} ausente`);
  }
  assert.match(sql, /dedupe_key TEXT NOT NULL UNIQUE/);
  assert.match(sql, /knowledge_outbox_pending_idx/);
  assert.match(
    sql,
    /GRANT UPDATE \(attempts, available_at, processed_at, last_error\)/,
  );
  assert.doesNotMatch(sql, /cron\.schedule|pg_cron|CREATE\s+TRIGGER[^;]+knowledge_outbox/is);
});

test('bootstrap aprovado é service_role-only, versionado e idempotente por checksum', () => {
  assert.match(
    sql,
    /FUNCTION public\.import_approved_knowledge_review\(\s*p_entity_key TEXT,\s*p_entity_type TEXT,\s*p_title TEXT,\s*p_code TEXT,\s*p_tags TEXT\[\],\s*p_payload JSONB,\s*p_source_id UUID,\s*p_payload_checksum TEXT/s,
  );
  const body = functionBody('import_approved_knowledge_review');
  assert.match(body, /auth\.role\(\) IS DISTINCT FROM 'service_role'/);
  assert.match(body, /knowledge_payload_professionally_approved\(p_payload\)/);
  assert.match(body, /payload_checksum = v_checksum/);
  assert.match(body, /extensions\.digest\(p_payload::TEXT, 'sha256'\)/);
  assert.match(body, /INSERT INTO public\.knowledge_entity_versions/);
  assert.match(body, /INSERT INTO public\.knowledge_audit_log/);
  assert.match(body, /INSERT INTO public\.knowledge_outbox/);
  assert.match(body, /v_checksum,\s+TRUE,\s+v_outbox_id/);
  assert.match(
    sql,
    /RETURNS TABLE \(\s*entity_id UUID,\s*version INTEGER,\s*approval_status TEXT,\s*payload_checksum TEXT,\s*replayed BOOLEAN/s,
  );
  assert.match(sql, /O caller[\s\S]*?pode passar NULL/);
  assert.match(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.import_approved_knowledge_review\([\s\S]*?\) TO service_role/,
  );
  assert.doesNotMatch(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.import_approved_knowledge_review\([\s\S]*?\) TO authenticated/,
  );
  assert.match(knowledgeSync, /p_entity_type: review\.category === 'auriculo'\s*\?\s*'auricular_point'\s*:\s*'acupoint'/);
  assert.doesNotMatch(
    knowledgeSync,
    /(?:auricular_)?acupuncture_point/,
    'o importador deve usar exatamente os tipos aceitos pela RPC',
  );
});

test('rate limit persistente é atômico e acessível somente por service_role', () => {
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.edge_rate_limits/);
  assert.match(sql, /PRIMARY KEY \(bucket, subject\)/);
  assert.match(sql, /edge_rate_limits_updated_at_idx/);
  assert.match(
    sql,
    /FUNCTION public\.consume_edge_rate_limit\(\s*p_subject_id UUID,\s*p_function_name TEXT,\s*p_window_seconds INTEGER,\s*p_limit INTEGER/s,
  );
  assert.match(
    sql,
    /RETURNS TABLE \(\s*allowed BOOLEAN,\s*remaining INTEGER,\s*retry_after_seconds INTEGER,\s*reset_at TIMESTAMPTZ/s,
  );
  const body = functionBody('consume_edge_rate_limit');
  assert.match(body, /auth\.role\(\) IS DISTINCT FROM 'service_role'/);
  assert.match(body, /ON CONFLICT \(bucket, subject\)\s+DO UPDATE/);
  assert.match(body, /window_started_at/);
  assert.match(body, /request_count::BIGINT \+ 1/);
  assert.match(body, /EXTRACT\(EPOCH FROM \(v_reset_at - v_now\)\)/);
  assert.match(
    sql,
    /REVOKE ALL ON TABLE public\.edge_rate_limits\s+FROM PUBLIC, anon, authenticated, service_role/,
  );
  assert.match(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.consume_edge_rate_limit\(UUID, TEXT, INTEGER, INTEGER\)\s+TO service_role/,
  );
  assert.doesNotMatch(
    sql,
    /GRANT (?:SELECT|ALL)[^;]*edge_rate_limits[^;]*authenticated/i,
  );
  assert.match(sql, /DELETE FROM public\.edge_rate_limits[\s\S]*interval '7 days'/);
});

test('pedido de exclusão é rastreável e não executa nem cascateia dados', () => {
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.patient_deletion_requests/);
  assert.match(sql, /status IN \('pending', 'approved', 'rejected', 'executed'\)/);
  assert.match(sql, /REFERENCES public\.patients\(id\) ON DELETE RESTRICT/);
  assert.match(sql, /patient_deletion_one_pending_idx/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.patient_deletion_request_audit/);
  assert.match(sql, /patient_deletion_audit_reject_mutation/);
  assert.match(sql, /Solicitações de exclusão são append-only/);

  const body = functionBody('request_patient_deletion');
  assert.match(body, /public\.can_access_clinical_data\(v_uid\)/);
  assert.match(body, /v_patient_owner <> v_uid/);
  assert.match(body, /public\.is_clinic_admin\(v_uid\)/);
  assert.match(body, /public\.is_super_admin\(v_uid\)/);
  assert.match(body, /status = 'pending'/);
  assert.match(body, /INSERT INTO public\.patient_deletion_requests/);
  assert.match(
    body,
    /UPDATE public\.patients p\s+SET archived_at = pg_catalog\.clock_timestamp\(\)[\s\S]*?p\.archived_at IS NULL/,
  );
  assert.doesNotMatch(body, /DELETE FROM/);

  assert.match(
    sql,
    /REVOKE ALL ON TABLE public\.patient_deletion_requests\s+FROM PUBLIC, anon, authenticated/,
  );
  assert.doesNotMatch(
    sql,
    /GRANT (?:UPDATE|DELETE|ALL)[^;]*patient_deletion_requests[^;]*authenticated/i,
  );
  assert.doesNotMatch(sql, /FUNCTION public\.(?:execute|approve)_patient_deletion/i);
  assert.match(sql, /depois de definição jurídica, RPO, backup/);
});

test('todo SECURITY DEFINER novo fixa search_path e revoga PUBLIC nas RPCs expostas', () => {
  const headers = [
    ...sql.matchAll(
      /CREATE OR REPLACE FUNCTION public\.[\s\S]*?\nAS \$[a-z_]+\$/g,
    ),
  ].map(match => match[0]);
  const definers = headers.filter(header => /SECURITY DEFINER/.test(header));
  assert.ok(definers.length >= 15);
  for (const header of definers) {
    assert.match(header, /SET search_path = pg_catalog/);
  }

  for (const signature of [
    'insert_clinical_record\\(UUID, TEXT, TEXT, TEXT\\)',
    'get_clinical_records\\(UUID, TEXT\\)',
    'update_clinical_record\\(UUID, TEXT\\)',
    'get_shared_session\\(UUID\\)',
    'get_latest_clinical_record\\(UUID, TEXT, TEXT\\)',
    'get_patient_audit_log\\(UUID, INTEGER\\)',
    'upsert_versioned_clinical_record\\(UUID, TEXT, TEXT, BIGINT, UUID, TEXT\\)',
    'upsert_clinical_session\\(UUID, TEXT, BIGINT, UUID, TEXT\\)',
    'get_active_knowledge_reviews\\(\\)',
    'approve_knowledge_curation_proposal\\(UUID, TEXT\\)',
    'request_patient_deletion\\(UUID, TEXT\\)',
  ]) {
    assert.match(
      sql,
      new RegExp(`REVOKE ALL ON FUNCTION public\\.${signature}[\\s\\S]*?FROM PUBLIC, anon`),
    );
  }
});

test('migration nova não derruba tabelas/colunas nem altera migrations antigas', () => {
  assert.doesNotMatch(sql, /DROP\s+TABLE/i);
  assert.doesNotMatch(sql, /DROP\s+COLUMN/i);
  assert.doesNotMatch(sql, /TRUNCATE\s+/i);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS revision/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS payload_checksum/);
});
