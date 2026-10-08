// ============================================================
// Exclusão de paciente e Área do Paciente (09/10/2026).
// A exclusão é anonimização: admin_decide_patient_deletion tira o
// snapshot, apaga uma lista fixa de tabelas e limpa o cadastro, mas
// nunca faz DELETE em patients — ON DELETE CASCADE não ajuda. A Área do
// Paciente (20261006) criou envios com respostas cifradas, código de
// acesso e sessões sem entrar nessa lista: depois da exclusão, tudo isso
// ficaria no banco. 20261009 corrige partindo da versão de 20261008
// (escalas), que era a última (AGENTS.md §7: parte da última versão).
// ============================================================

import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdir, readFile } from 'node:fs/promises';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MIGRATIONS = path.resolve(root, '../supabase/migrations');
const FIX = path.join(MIGRATIONS, '20261009_portal_patient_erasure.sql');
const PREVIOUS = path.join(MIGRATIONS, '20261008_patient_instruments.sql');

function functionBody(sql, name) {
  const match = sql.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\$${name}\\$;`));
  assert.ok(match, `função ${name}`);
  return match[0];
}

const lines = text => text.split(/\r?\n/);

// As únicas linhas que 20261009 pode acrescentar à versão de 20261008.
const NEW_LINES = [
  "    'patient_form_assignments', (SELECT coalesce(jsonb_agg(to_jsonb(fa)), '[]'::jsonb) FROM public.patient_form_assignments fa WHERE fa.patient_id = v_req.patient_id),",
  "    'patient_portal_access', (SELECT coalesce(jsonb_agg(to_jsonb(pa)), '[]'::jsonb) FROM public.patient_portal_access pa WHERE pa.patient_id = v_req.patient_id),",
  '  DELETE FROM public.patient_portal_sessions WHERE access_id IN (SELECT pa.id FROM public.patient_portal_access pa WHERE pa.patient_id = v_req.patient_id);',
  '  DELETE FROM public.patient_portal_access WHERE patient_id = v_req.patient_id;',
  '  DELETE FROM public.patient_form_assignments WHERE patient_id = v_req.patient_id;',
];

// Tabelas com patient_id ligado a patients que ficam fora da exclusão.
// Entrar aqui exige motivo; tabela nova de paciente entra na exclusão.
const KEPT_ON_PURPOSE = {
  patient_deletion_requests:
    'é a própria solicitação: append-only, FK RESTRICT, registro de que a exclusão aconteceu',
  satisfaction_surveys:
    'PENDENTE desde 20260901: decidir com a administradora (a nota entra nos números da Gestão; o comentário livre pode identificar o paciente)',
};

test('exclusão: parte da versão de 20261008 e só acrescenta a Área do Paciente', async () => {
  const previous = functionBody(await readFile(PREVIOUS, 'utf8'), 'admin_decide_patient_deletion');
  const updated = functionBody(await readFile(FIX, 'utf8'), 'admin_decide_patient_deletion');
  for (const line of NEW_LINES) {
    assert.equal(lines(updated).filter(item => item === line).length, 1, `uma vez: ${line.trim()}`);
  }
  assert.deepEqual(
    lines(updated).filter(line => !NEW_LINES.includes(line)),
    lines(previous),
    'o resto da função é idêntico à versão de 20261008',
  );
});

test('exclusão: snapshot antes, sessões antes do acesso, tudo antes de limpar o cadastro', async () => {
  const sql = await readFile(FIX, 'utf8');
  const body = functionBody(sql, 'admin_decide_patient_deletion');
  const at = text => {
    const index = body.indexOf(text);
    assert.ok(index >= 0, text);
    return index;
  };

  const snapshot = at('INSERT INTO patient_erasure_backup.snapshots');
  const sessions = at('DELETE FROM public.patient_portal_sessions');
  const access = at('DELETE FROM public.patient_portal_access');
  const forms = at('DELETE FROM public.patient_form_assignments');
  const cadastro = at("SET name = '[Paciente removido]'");
  assert.ok(snapshot < sessions, 'snapshot antes de apagar');
  assert.ok(sessions < access, 'sessões saem antes do acesso que as liga ao paciente');
  assert.ok(Math.max(sessions, access, forms) < cadastro, 'apaga antes de limpar o cadastro');

  const snapshotBlock = body.slice(at('SELECT jsonb_build_object('), at(') INTO v_snapshot;'));
  assert.doesNotMatch(snapshotBlock, /patient_portal_sessions|token_hash/, 'token das sessões fora do snapshot');

  // Fora de ordem a função seria criada e só quebraria na hora de excluir.
  for (const table of ['patient_portal_access', 'patient_portal_sessions', 'patient_form_assignments', 'patient_instrument_applications']) {
    assert.match(sql, new RegExp(`to_regclass\\('public\\.${table}'\\) IS NULL`), `exige ${table}`);
  }
  assert.ok(sql.indexOf('DO $requires$') < sql.indexOf('CREATE OR REPLACE FUNCTION'), 'confere antes de recriar');
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.admin_decide_patient_deletion\(UUID, TEXT, TEXT\) FROM PUBLIC, anon;/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.admin_decide_patient_deletion\(UUID, TEXT, TEXT\) TO authenticated;/);
});

test('toda tabela com patient_id ligado a patients entra no snapshot e no DELETE da versão mais nova', async () => {
  const files = (await readdir(MIGRATIONS)).filter(name => name.endsWith('.sql')).sort();
  const sqls = await Promise.all(files.map(name => readFile(path.join(MIGRATIONS, name), 'utf8')));

  const latestIndex = sqls.findLastIndex(sql => sql.includes('FUNCTION public.admin_decide_patient_deletion('));
  assert.ok(latestIndex >= 0, 'alguma migration define a exclusão');
  const body = functionBody(sqls[latestIndex], 'admin_decide_patient_deletion');

  const tables = new Set();
  for (const sql of sqls) {
    for (const [, name, columns] of sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?(?:public\.)?(\w+)\s*\(([\s\S]*?)\r?\n\);/g)) {
      // [^,]*? atravessa linha: "patient_id UUID NOT NULL\n    REFERENCES public.patients(id)".
      if (/\bpatient_id\s+UUID\b[^,]*?\bREFERENCES\s+(?:public\.)?patients\s*\(/i.test(columns)) tables.add(name);
    }
  }
  for (const known of ['clinical_records', 'appointments', 'patient_form_assignments', 'patient_portal_access', ...Object.keys(KEPT_ON_PURPOSE)]) {
    assert.ok(tables.has(known), `o leitor de migrations acha ${known}`);
  }

  for (const table of tables) {
    const inSnapshot = body.includes(`'${table}', (SELECT`);
    const deleted = body.includes(`DELETE FROM public.${table} WHERE patient_id = v_req.patient_id;`);
    if (table in KEPT_ON_PURPOSE) {
      assert.ok(!inSnapshot && !deleted, `${table} já entra na exclusão: tire de KEPT_ON_PURPOSE`);
      continue;
    }
    assert.ok(inSnapshot, `${table} fora do snapshot de ${files[latestIndex]}`);
    assert.ok(deleted, `${table} fora do DELETE de ${files[latestIndex]}`);
  }
});
