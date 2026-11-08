import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const load = name => readFile(path.join(root, 'supabase/migrations', name), 'utf8');
const sql = await load('20261108_aba_plano_versionado.sql');
const oldPrograms = await load('20261101b_aba_coleta.sql');
const oldErasure = await load('20261103c_patient_notes.sql');
const lines = text => text.replace(/\r?\n/g, '\n');
function fn(source, name) {
  const match = source.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\$${name}\\$;`));
  assert.ok(match, name);
  return lines(match[0]);
}

test('plano ABA: expansão idempotente, índice único parcial e CHECKs com carimbos obrigatórios', () => {
  assert.match(sql, /DO \$requires\$/);
  for (const table of ['aba_program_revisions', 'aba_plan_versions']) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}\\s*\\(`));
  }
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS aba_plan_versions_one_approved\s+ON public\.aba_plan_versions\(patient_id\) WHERE status = 'aprovado'/);
  for (const column of ['submitted_at', 'approved_by', 'approved_at', 'approval_statement', 'voided_by', 'voided_at', 'void_reason_encrypted']) {
    assert.ok(sql.includes(`${column} IS NOT NULL`), column);
  }
  assert.match(sql, /UNIQUE \(patient_id, version_no\)/);
  assert.match(sql, /UNIQUE \(program_id, revision\)/);
  assert.match(sql, /ON CONFLICT ON CONSTRAINT aba_program_revisions_program_revision_key DO NOTHING/);
  assert.doesNotMatch(sql.replace(/--[^\r\n]*/g, ''), /DROP\s+(?:TABLE|COLUMN)|DELETE\s+FROM\s+public\.patients\b/i);
});

test('programas ABA: preserva integralmente escritores vivos, acrescentando só a revisão', () => {
  for (const name of ['aba_save_program', 'aba_update_program_status']) {
    const updated = fn(sql, name);
    const inserts = [...updated.matchAll(/  INSERT INTO public\.aba_program_revisions \([\s\S]*?\r?\n  \);\r?\n\r?\n/g)];
    assert.equal(inserts.length, 1, `${name}: uma revisão por escrita`);
    assert.match(inserts[0][0], /v_saved\.revision/);
    assert.match(inserts[0][0], /v_saved\.notes_encrypted, v_uid, v_saved\.updated_at/);
    assert.doesNotMatch(inserts[0][0], /'notes'|'restricted_authorization'/);
    assert.equal(updated.replace(inserts[0][0], ''), fn(oldPrograms, name));
  }
});

test('plano ABA: rascunho/envio/leitura para quem acessa, aprovação/anulação só supervisão', () => {
  for (const [name, supervise] of [
    ['aba_save_plan_draft', false], ['aba_submit_plan', false], ['aba_list_plan_versions', false],
    ['aba_approve_plan', true], ['aba_void_plan', true],
  ]) {
    const body = fn(sql, name);
    assert.match(body, new RegExp(`aba_require_patient\\(p_patient_id, ${String(supervise).toUpperCase()}\\)`));
    assert.match(body, /SECURITY DEFINER\r?\nSET search_path = pg_catalog/);
    assert.match(sql, new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\([^;]+FROM PUBLIC, anon;`));
    assert.match(sql, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}\\([^;]+TO authenticated;`));
  }
  assert.match(fn(sql, 'aba_approve_plan'), /approved_by = auth\.uid\(\)/);
  assert.match(fn(sql, 'aba_void_plan'), /voided_by = auth\.uid\(\)/);
});

test('plano ABA: CAS, eventos e serialização por paciente em todas as escritas', () => {
  for (const name of ['aba_save_plan_draft', 'aba_submit_plan', 'aba_approve_plan', 'aba_void_plan']) {
    const body = fn(sql, name);
    assert.match(body, /FROM public\.patients WHERE id = p_patient_id AND erased_at IS NULL FOR UPDATE/);
    assert.match(body, /USING ERRCODE = '40001'/);
    assert.match(body, /client_event_id = (?:v_event|p_client_event_id) THEN RETURN/);
    assert.match(body, /revision = revision \+ 1/);
  }
  const save = fn(sql, 'aba_save_plan_draft');
  assert.match(save, /invalid_datetime_format OR datetime_field_overflow/);
  assert.match(save, /v_existing\.status <> 'rascunho'/);
  assert.match(save, /COALESCE\(v_existing\.programs, v_approved\.programs/);
  assert.match(save, /COALESCE\(v_existing\.summary_encrypted, v_approved\.summary_encrypted\)/);
  assert.match(save, /v_revision <> 0/);
  assert.match(save, /public\.aba_encrypt\(public\.aba_clean_text\(p_plan ->> 'summary'/);
  assert.match(save, /r\.patient_id = p_patient_id AND r\.clinic_id = v_clinic/);
  assert.match(save, /count\(DISTINCT \(value ->> 'program_id'\)::UUID\)/);
});

test('plano ABA: aprovação troca a anterior sem alterar o conteúdo; leitura usa histórico', () => {
  const approve = fn(sql, 'aba_approve_plan');
  assert.match(approve, /v_plan\.status <> 'em_revisao'/);
  assert.ok(approve.indexOf("SET status = 'substituido'") < approve.indexOf("SET status = 'aprovado'"));
  assert.doesNotMatch(approve, /SET\s+(?:programs|summary_encrypted)|programs\s*=/);
  const list = fn(sql, 'aba_list_plan_versions');
  assert.match(list, /JOIN public\.aba_program_revisions r/);
  assert.match(list, /r\.revision = \(item\.value ->> 'revision'\)::BIGINT/);
  assert.doesNotMatch(list, /FROM public\.aba_programs|JOIN public\.aba_programs/);
  assert.match(fn(sql, 'aba_void_plan'), /public\.aba_encrypt\(v_reason\)/);
});

test('exclusão ABA: versão 20261103c intacta exceto quatro linhas, histórico antes do programa', () => {
  const updated = fn(sql, 'admin_decide_patient_deletion');
  const additions = [
    ...['aba_plan_versions', 'aba_program_revisions'].map(table => `    '${table}', (SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM public.${table} x WHERE x.patient_id = v_req.patient_id),`),
    ...['aba_plan_versions', 'aba_program_revisions'].map(table => `  DELETE FROM public.${table} WHERE patient_id = v_req.patient_id;`),
  ];
  for (const line of additions) assert.equal(updated.split(/\r?\n/).filter(item => item === line).length, 1);
  assert.equal(updated.split(/\r?\n/).filter(line => !additions.includes(line)).join('\n'), fn(oldErasure, 'admin_decide_patient_deletion'));
  assert.ok(updated.indexOf('DELETE FROM public.aba_program_revisions') < updated.indexOf('DELETE FROM public.aba_programs'));
  assert.ok(updated.indexOf('INSERT INTO patient_erasure_backup.snapshots') < updated.indexOf('DELETE FROM public.aba_plan_versions'));
});
