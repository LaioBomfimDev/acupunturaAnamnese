import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { ABA_OBJECTIVES, ABA_TECHNIQUES } from '../../src/data/abaLibrary.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const sql = await readFile(path.join(root, 'supabase/migrations/20261108c_aba_biblioteca_clinica.sql'), 'utf8');
const table = sql.match(/CREATE TABLE IF NOT EXISTS public\.aba_library_items \(([\s\S]*?)\r?\n\);/)?.[1];
assert.ok(table);
const body = name => {
  const result = sql.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\$${name}\\$;`));
  assert.ok(result, name);
  return result[0];
};
const save = body('aba_save_library_item');
const list = body('aba_list_library');
const strings = text => [...text.matchAll(/'([^']+)'/g)].map(match => match[1]);

test('biblioteca: tabela por clínica, sem paciente, RLS fechada, sem DELETE ou exclusão recriada', () => {
  assert.match(table, /clinic_id UUID NOT NULL REFERENCES public\.clinics\(id\) ON DELETE RESTRICT/);
  assert.doesNotMatch(sql, /\bpatient_id\b|admin_decide_patient_deletion|CREATE POLICY|DELETE FROM|DROP TABLE|DROP COLUMN/i);
  assert.match(sql, /FOREACH v_table IN ARRAY ARRAY\['aba_library_items'\]/);
  assert.match(sql, /ALTER TABLE public\.%I ENABLE ROW LEVEL SECURITY', v_table/);
  assert.match(sql, /REVOKE ALL ON TABLE public\.%I FROM PUBLIC, anon, authenticated', v_table/);
  assert.match(sql, /DO \$requires\$/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS/);
  assert.match(table, /kind IN \('objetivo', 'tecnica'\)/);
  assert.match(table, /status IN \('ativo', 'oculto', 'arquivado'\)/);
});

test('biblioteca: referência fechada/única por clínica e tipo, sistema não arquiva', () => {
  assert.ok(table.includes("system_key ~ '^[a-z0-9][a-z0-9_-]{0,119}$'"));
  assert.match(sql, /ON public\.aba_library_items\(clinic_id, kind, system_key\) WHERE system_key IS NOT NULL/);
  assert.match(table, /CHECK \(system_key IS NULL OR status IN \('ativo', 'oculto'\)\)/);
  assert.match(save, /v_system IS NOT NULL AND v_status = 'arquivado'/);
  assert.match(save, /Tipo e referência do sistema não podem mudar depois da criação/);
  assert.match(save, /\(p_item ->> 'system_key'\) IS DISTINCT FROM v_existing\.system_key/);
  assert.match(save, /\(p_item ->> 'kind'\) IS DISTINCT FROM v_existing\.kind/);
});

test('biblioteca: RPCs começam pelo gate, clínica é do banco e privilégios só authenticated', () => {
  for (const name of ['aba_list_library', 'aba_save_library_item']) {
    const fn = body(name);
    assert.match(fn, /SECURITY DEFINER\r?\nSET search_path = pg_catalog/);
    assert.match(fn, /DECLARE\r?\n\s+v_uid UUID := public\.aba_require_gate\(\);\r?\n\s+v_clinic UUID := public\.user_clinic_id\(v_uid\)/);
    assert.doesNotMatch(fn, /p_item\s*->>\s*'(?:clinic_id|created_by|updated_by)'/);
    assert.match(sql, new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\([^;]*FROM PUBLIC, anon;`));
    assert.match(sql, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}\\([^;]*TO authenticated;`));
  }
  assert.match(list, /public\.is_clinic_admin\(v_uid\) OR public\.aba_is_aba_professional\(v_uid\)/);
  assert.match(list, /WHERE item\.clinic_id = v_clinic/);
  assert.match(list, /'\[\]'::JSONB/);
  assert.match(save, /team\.clinic_id = v_clinic AND team\.supervisor_id = v_uid AND team\.archived_at IS NULL/);
  assert.match(save, /v_existing\.clinic_id <> v_clinic/);
});

test('biblioteca: CAS com lock não bloqueia filhos, replay antes de CAS sem gravar', () => {
  const lock = save.indexOf('FOR NO KEY UPDATE');
  const row = save.indexOf('FOR UPDATE');
  const replay = save.indexOf('IF v_existing.client_event_id = v_event THEN');
  const cas = save.indexOf('IF v_existing.revision <> v_revision THEN');
  const write = save.indexOf('INSERT INTO public.aba_library_items');
  assert.ok(lock > 0 && lock < row && row < replay && replay < cas && cas < write);
  assert.doesNotMatch(save.slice(replay, cas), /UPDATE public\.|INSERT INTO|clock_timestamp/);
  assert.match(save.slice(replay, cas), /RETURN jsonb_build_object\('id', v_existing.id, 'revision', v_existing.revision, 'client_event_id', v_existing.client_event_id\)/);
  assert.match(save, /ELSIF v_revision <> 0 THEN[\s\S]*?ERRCODE = '40001'/);
  assert.match(save, /revision = item\.revision \+ 1/);
  assert.match(save, /updated_by = auth\.uid\(\), updated_at = clock_timestamp\(\)/);
  assert.match(save, /v_event, auth\.uid\(\), auth\.uid\(\)/);
  assert.match(table, /UNIQUE \(clinic_id, client_event_id\)/);
  assert.match(save, /WHEN unique_violation THEN\r?\n\s+RAISE EXCEPTION 'Esta referência do sistema ou este evento já foi registrado[\s\S]*?ERRCODE = '23505'/);
});

test('biblioteca: conteúdo fechado coincide com todas as chaves do catálogo', () => {
  const match = save.match(/v_keys := CASE WHEN v_kind = 'objetivo'\r?\n\s+THEN ARRAY\[([^\]]+)\]\r?\n\s+ELSE ARRAY\[([^\]]+)\] END;/);
  assert.ok(match);
  const actual = items => [...new Set(items.flatMap(Object.keys))].sort();
  assert.deepEqual(strings(match[1]).sort(), actual(ABA_OBJECTIVES.map(({ key: _key, ...content }) => content)));
  assert.ok(!strings(match[1]).includes('key'), 'key é metadado do catálogo, nunca content no SQL');
  assert.deepEqual(strings(match[2]).sort(), actual(ABA_TECHNIQUES));
  assert.match(save, /\(v_content - v_keys\) <> '\{\}'::JSONB/);
  const config = save.match(/v_value - ARRAY\[([^\]]+)\]/);
  assert.ok(config);
  assert.deepEqual(strings(config[1]).sort(), [...new Set(ABA_TECHNIQUES.flatMap(item => Object.keys(item.suggestedConfig)))].sort());
  assert.match(save, /CASE WHEN v_kind = 'objetivo' THEN 'title' ELSE 'name' END/);
  assert.match(table, /kind = 'objetivo' AND content ->> 'title' IS NOT NULL/);
  assert.match(table, /kind = 'tecnica' AND content ->> 'name' IS NOT NULL/);
});

test('biblioteca: tipos e tamanho limitados, sem aceitar objeto aninhado arbitrário', () => {
  assert.match(table, /jsonb_typeof\(content\) = 'object' AND octet_length\(content::TEXT\) <= 65536/);
  assert.match(save, /jsonb_typeof\(v_content\) <> 'object' OR octet_length\(v_content::TEXT\) > 65536/);
  assert.match(save, /jsonb_typeof\(v_value\) <> 'string' OR char_length\(v_value #>> '\{\}'\) > 6000/);
  assert.match(save, /jsonb_typeof\(v_value\) <> 'boolean'/);
  assert.match(save, /v_key IN \('goals', 'behaviorFunctions'\)/);
  assert.match(save, /jsonb_array_length\(v_value\) > 32/);
  assert.match(save, /v_config_key = 'token_economy'/);
  assert.match(save, /v_config_key = 'prompt_hierarchy'/);
  assert.match(save, /jsonb_array_length\(v_config_value\) > 32/);
  assert.doesNotMatch(sql, /RAISE\s+(?:NOTICE|LOG|INFO)|RAISE EXCEPTION[^;]*p_item/i);
});

test('biblioteca: contrato não copia catálogo nem gera conteúdo e regra no bullet ABA', async () => {
  assert.equal((sql.match(/CREATE OR REPLACE FUNCTION/g) || []).length, 2);
  assert.equal((sql.match(/CREATE TABLE IF NOT EXISTS/g) || []).length, 1);
  assert.match(sql, /Reversão funcional: revogar EXECUTE da escrita/);
  const agents = await readFile(path.join(root, 'AGENTS.md'), 'utf8');
  const bullet = agents.split(/\r?\n/).find(line => line.startsWith('- ABA ('));
  assert.match(bullet, /Biblioteca da clínica \(`aba_library_items`\) não contém paciente/);
  assert.match(bullet, /item do sistema só fica ativo ou oculto, nunca arquivado nem apagado/);
});
