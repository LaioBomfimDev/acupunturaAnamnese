import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdir, readFile } from 'node:fs/promises';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const directory = path.join(root, 'supabase/migrations');
const name = '20261108b_aba_perfil_paciente.sql';
const sql = await readFile(path.join(directory, name), 'utf8');
const body = functionName => {
  const value = sql.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${functionName}\\([\\s\\S]*?\\$${functionName}\\$;`));
  assert.ok(value, functionName);
  return value[0];
};
const table = sql.match(/CREATE TABLE IF NOT EXISTS public\.aba_patient_profiles\s*\(([\s\S]*?)\r?\n\);/)?.[1];
assert.ok(table, 'tabela do perfil');

test('perfil ABA: uma linha por paciente, códigos fechados e comunicação sem NULL/repetição', () => {
  assert.match(table, /patient_id UUID PRIMARY KEY REFERENCES public\.patients\(id\) ON DELETE RESTRICT/);
  const modes = table.match(/communication_mode <@ ARRAY\[([^\]]+)\]/)?.[1];
  assert.ok(modes);
  const codes = [...modes.matchAll(/'([^']+)'/g)].map(match => match[1]);
  assert.deepEqual(codes, ['vocal', 'pecs', 'caa_alta', 'caa_baixa', 'sinais', 'gestos', 'misto']);
  assert.match(table, /array_position\(communication_mode, NULL\) IS NULL/);
  assert.match(table, /cardinality\(communication_mode\) = \(/);
  for (const code of codes) assert.ok(table.includes(`CASE WHEN '${code}' = ANY(communication_mode) THEN 1 ELSE 0 END`));
  assert.match(table, /COALESCE\(array_ndims\(communication_mode\), 1\) = 1/);
  assert.match(table, /support_level IN \('1', '2', '3', 'nao_informado'\)/);
});

test('perfil ABA: só diagnóstico/detalhes cifrados, sem coluna clínica clara ou log de conteúdo', async () => {
  assert.match(table, /diagnosis_encrypted BYTEA/);
  assert.match(table, /details_encrypted BYTEA/);
  assert.doesNotMatch(table, /\r?\n\s*(?:diagnosis|cid|source|issued_on|details)\s+/i);
  // Lista fechada (QA, ACUP-004): a lista negra deixava passar "diagnosis_cid TEXT", "cid10" ou um
  // ADD COLUMN posterior. Coluna nova no perfil exige mudar este teste de propósito.
  const columns = [...table.matchAll(/\r?\n\s*(?!CONSTRAINT\b)([a-z_][a-z0-9_]*)\s+(?:UUID|TEXT|BYTEA|BIGINT|TIMESTAMPTZ|INTEGER|BOOLEAN|DATE|JSONB|NUMERIC|SMALLINT)\b/g)].map(match => match[1]);
  assert.deepEqual(columns, ['patient_id', 'clinic_id', 'communication_mode', 'support_level', 'diagnosis_encrypted',
    'details_encrypted', 'revision', 'client_event_id', 'updated_by', 'updated_at']);
  assert.equal([...table.matchAll(/\r?\n\s*(?!CONSTRAINT\b)[a-z_][a-z0-9_]*\s+[A-Za-z"]/g)].length, columns.length, 'toda coluna da tabela foi reconhecida');
  for (const file of (await readdir(directory)).filter(item => item.endsWith('.sql'))) {
    const text = await readFile(path.join(directory, file), 'utf8');
    assert.doesNotMatch(text, /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(?:public\.)?"?aba_patient_profiles"?\s+ADD\b/i, `${file}: coluna nova no perfil fora da lista`);
  }
  assert.match(body('aba_save_profile'), /v_diagnosis := public\.aba_encrypt\(jsonb_build_object/);
  assert.match(body('aba_save_profile'), /v_details := public\.aba_encrypt/);
  assert.doesNotMatch(sql, /RAISE\s+(?:NOTICE|LOG|INFO)|RAISE EXCEPTION[^;]*p_profile/i);
  assert.match(body('aba_get_profile'), /- 'diagnosis_encrypted' - 'details_encrypted'/);
});

test('perfil ABA: leitura por acesso, escrita por supervisão; clínica e ator vêm do banco', () => {
  assert.match(body('aba_get_profile'), /aba_require_patient\(p_patient_id, FALSE\)/);
  assert.match(body('aba_save_profile'), /aba_require_patient\(p_patient_id, TRUE\)/);
  for (const fn of ['aba_get_profile', 'aba_save_profile']) {
    assert.match(body(fn), /SECURITY DEFINER\r?\nSET search_path = pg_catalog/);
    assert.match(sql, new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^;]+FROM PUBLIC, anon;`));
    assert.match(sql, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^;]+TO authenticated;`));
  }
  assert.match(body('aba_save_profile'), /v_clinic UUID := public\.user_clinic_id\(v_uid\)/);
  assert.match(body('aba_save_profile'), /v_event, auth\.uid\(\)\)/);
  assert.match(body('aba_save_profile'), /updated_by = auth\.uid\(\)/);
  assert.doesNotMatch(body('aba_save_profile'), /p_profile\s*->>\s*'(?:clinic_id|updated_by|patient_id)'/);
  assert.match(body('aba_get_profile'), /clinic_id = public\.user_clinic_id\(v_uid\)/);
});

test('perfil ABA: CAS e replay estável sem revisão/carimbo novos e sem plaintext no retorno de escrita', () => {
  const save = body('aba_save_profile');
  assert.match(save, /FROM public\.patients WHERE id = p_patient_id AND erased_at IS NULL FOR NO KEY UPDATE/);
  assert.match(save, /v_revision <> 0/);
  assert.match(save, /v_existing\.revision <> v_revision/);
  assert.match(save, /USING ERRCODE = '40001'/);
  assert.ok(save.indexOf('IF v_existing.client_event_id = v_event') < save.indexOf('v_existing.revision <> v_revision'));
  assert.match(save, /revision = profile\.revision \+ 1/);
  const returns = [...save.matchAll(/RETURN jsonb_build_object\(([^;]+)\);/g)].map(match => match[1]);
  assert.equal(returns.length, 2);
  assert.equal(returns[0].replaceAll('v_existing.', ''), returns[1].replaceAll('v_saved.', ''));
  for (const result of returns) assert.doesNotMatch(result, /diagnosis|details|encrypted|updated_at/);
});

test('perfil ABA: diagnóstico de laudo exige fonte/data e não trunca detalhes silenciosamente', () => {
  const save = body('aba_save_profile');
  assert.match(save, /v_report - ARRAY\['text','source','issued_on'\]/);
  for (const field of ['text', 'source', 'issued_on']) assert.ok(save.includes(`jsonb_typeof(v_report -> '${field}') IS DISTINCT FROM 'string'`));
  assert.match(save, /NULLIF\(btrim\(v_report ->> 'source'\), ''\) IS NULL/);
  assert.match(save, /invalid_datetime_format OR datetime_field_overflow/);
  assert.match(save, /char_length\(p_profile ->> 'details'\) > 12000/);
  assert.match(save, /char_length\(v_report ->> 'text'\) > 6000/);
  assert.match(save, /'source', btrim\(v_report ->> 'source'\), 'issued_on', v_report_date/);
  assert.match(save, /v_diagnosis := v_existing\.diagnosis_encrypted/);
  assert.match(save, /v_details := v_existing\.details_encrypted/);
});

test('perfil ABA: exclusão é a última versão anterior + só snapshot e DELETE do perfil', async () => {
  const files = (await readdir(directory)).filter(file => file.endsWith('.sql') && file < name).sort();
  let latest;
  for (const file of files) {
    const source = await readFile(path.join(directory, file), 'utf8');
    const match = source.match(/CREATE OR REPLACE FUNCTION public\.admin_decide_patient_deletion\([\s\S]*?\$admin_decide_patient_deletion\$;/);
    if (match) latest = { file, text: match[0] };
  }
  assert.equal(latest.file, '20261108_aba_plano_versionado.sql');
  const additions = [
    "    'aba_patient_profiles', (SELECT coalesce(jsonb_agg(to_jsonb(app)), '[]'::jsonb) FROM public.aba_patient_profiles app WHERE app.patient_id = v_req.patient_id),",
    '  DELETE FROM public.aba_patient_profiles WHERE patient_id = v_req.patient_id;',
  ];
  const updated = body('admin_decide_patient_deletion');
  for (const line of additions) assert.equal(updated.split(/\r?\n/).filter(item => item === line).length, 1);
  assert.equal(updated.split(/\r?\n/).filter(line => !additions.includes(line)).join('\n'), latest.text.replace(/\r?\n/g, '\n'));
  assert.ok(updated.indexOf('INSERT INTO patient_erasure_backup.snapshots') < updated.indexOf('DELETE FROM public.aba_patient_profiles'));
});


const adjustments = await readFile(path.join(directory, '20261108ba_aba_perfil_ajustes.sql'), 'utf8');

test('perfil 011: só save recriada, delta integral limitado às duas recusas', async () => {
  const declared = [...adjustments.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(/g)].map(match => match[1]);
  assert.deepEqual(declared, ['aba_save_profile']);
  const plan = await readFile(path.join(directory, '20261108a_aba_plano_ajustes.sql'), 'utf8');
  const archive = plan.match(/  IF EXISTS \(SELECT 1 FROM public\.patients WHERE id = p_patient_id AND archived_at IS NOT NULL\) THEN\r?\n    RAISE EXCEPTION 'Paciente arquivado não recebe plano\.' USING ERRCODE = '22023';\r?\n  END IF;/)?.[0];
  assert.ok(archive, 'bloco da regra do plano');
  const profileArchive = archive.replace('Paciente arquivado não recebe plano.', 'Paciente arquivado não recebe perfil.');
  const future = "      IF v_report_date > (clock_timestamp() AT TIME ZONE 'America/Sao_Paulo')::DATE THEN\n        RAISE EXCEPTION 'Data do laudo não pode ser futura.' USING ERRCODE = '22023';\n      END IF;\n";
  const anchor = "  IF NOT FOUND THEN RAISE EXCEPTION 'Paciente indisponível.' USING ERRCODE = '42501'; END IF;";
  const original = body('aba_save_profile').replace(/\r?\n/g, '\n');
  const expected = original.replace(anchor, anchor + '\n' + profileArchive.replace(/\r?\n/g, '\n'))
    .replace('      v_diagnosis := public.aba_encrypt(jsonb_build_object(', future + '      v_diagnosis := public.aba_encrypt(jsonb_build_object(');
  const actual = adjustments.match(/CREATE OR REPLACE FUNCTION public\.aba_save_profile\([\s\S]*?\$aba_save_profile\$;/)?.[0];
  assert.ok(actual);
  assert.equal(actual.replace(/\r?\n/g, '\n'), expected, 'nenhum outro comportamento mudou');
  assert.doesNotMatch(adjustments, /CREATE OR REPLACE FUNCTION public\.(?:aba_get_profile|admin_decide_patient_deletion)/);
});

test('perfil 011: arquivado recusa escrita como no plano e hoje é calculado no fuso explícito', () => {
  assert.ok(adjustments.indexOf('archived_at IS NOT NULL') < adjustments.indexOf('IF v_existing.client_event_id = v_event'));
  assert.match(adjustments, /v_report_date > \(clock_timestamp\(\) AT TIME ZONE 'America\/Sao_Paulo'\)::DATE/);
  assert.ok(adjustments.indexOf('Data do laudo não pode ser futura.') < adjustments.indexOf('v_diagnosis := public.aba_encrypt'));
  assert.doesNotMatch(adjustments, /\bcurrent_date\b/i);
  assert.match(adjustments, /Data do laudo não pode ser futura\.' USING ERRCODE = '22023'/);
  assert.match(adjustments, /REVOKE ALL ON FUNCTION public\.aba_save_profile\(UUID, JSONB\) FROM PUBLIC, anon;/);
  assert.match(adjustments, /GRANT EXECUTE ON FUNCTION public\.aba_save_profile\(UUID, JSONB\) TO authenticated;/);
});
