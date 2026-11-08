import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdir, readFile } from 'node:fs/promises';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const migrations = path.join(root, 'supabase/migrations');
const files = (await readdir(migrations)).filter(name => name.endsWith('.sql')).sort();
const sqls = await Promise.all(files.map(async name => ({ name, sql: (await readFile(path.join(migrations, name), 'utf8')).replace(/--[^\r\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '') })));
const aba = sqls.filter(({ name }) => name.includes('aba'));
assert.ok(aba.length, 'encontra migrations ABA');
const pureHelpers = new Set(['aba_clean_text', 'aba_is_restricted_procedure', 'aba_num', 'aba_prompt_rank', 'aba_ioa_agreement', 'aba_fidelity_keys']);

// [texto, nome, cabeçalho + cláusulas depois do corpo, tag, corpo]: aceita CREATE sem OR REPLACE,
// nome sem `public.` e LANGUAGE/SECURITY/SET depois do `$tag$` (formato do pg_dump).
function functions(sql) {
  return [...sql.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?"?(\w+)"?\s*\(([\s\S]*?)\bAS\s+(\$\w*\$)([\s\S]*?)\3([^;]*);/gi)]
    .map(match => [match[0], match[1], match[2] + match[5], match[3], match[4]]);
}
const tables = aba.flatMap(({ name, sql }) => {
  const parsed = [...sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?"?(aba_\w+)"?\s*\(([\s\S]*?)\r?\n\s*\)\s*;/gi)].map(([, table, columns]) => ({ name, sql, table, columns }));
  const declared = [...sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:\w+\.)?"?aba_\w+/gi)];
  assert.equal(parsed.length, declared.length, `${name}: leitor reconhece todas as tabelas ABA`);
  return parsed;
});
assert.ok(tables.length, 'encontra tabelas ABA');

test('ABA: toda tabela tem RLS e revogação no próprio bloco de proteção', () => {
  for (const { name, sql, table } of tables) {
    const blocks = [...sql.matchAll(/DO\s+(\$\w*\$)([\s\S]*?)\1\s*;/gi)].map(match => match[2]);
    const block = blocks.find(body => body.includes(`'${table}'`) && /FOREACH\s+v_table\s+IN\s+ARRAY\s+ARRAY\s*\[/i.test(body));
    assert.ok(block, `${name}: bloco de proteção de ${table}`);
    const list = block.match(/FOREACH\s+v_table\s+IN\s+ARRAY\s+ARRAY\s*\[([\s\S]*?)\]/i)?.[1];
    assert.ok(list?.includes(`'${table}'`), `${table} na lista protegida`);
    assert.match(block, /ALTER TABLE public\.%I ENABLE ROW LEVEL SECURITY',\s*v_table/i, `${table}: RLS`);
    assert.match(block, /REVOKE ALL ON TABLE public\.%I FROM PUBLIC, anon, authenticated',\s*v_table/i, `${table}: revogação`);
  }
});

test('ABA: nenhuma policy concede acesso direto', () => {
  for (const { name, sql } of aba) {
    assert.doesNotMatch(sql, /CREATE\s+POLICY\s+[\s\S]*?\bON\s+(?:public\.)?aba_\w+\b/i, name);
  }
});

test('ABA: funções têm search_path fixo e DEFINER, exceto auxiliares puros conhecidos', () => {
  const seen = new Set();
  for (const { name, sql } of aba) {
    const definitions = functions(sql).filter(match => match[1].startsWith('aba_'));
    for (const [, fn, header, , body] of definitions) {
      seen.add(fn);
      assert.match(header, /\bSET\s+search_path\s*=\s*pg_catalog\s*(?:\r?\n|$)/i, `${name}: ${fn} search_path`);
      if (pureHelpers.has(fn)) {
        assert.doesNotMatch(body, /public\.aba_|public\.patients\b|\bFROM\s+public\./i, `${fn}: auxiliar não acessa tabelas`);
      } else {
        assert.match(header, /\bSECURITY\s+DEFINER\b/i, `${name}: ${fn} DEFINER`);
      }
    }
    const declared = [...sql.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:\w+\.)?"?aba_\w+"?\s*\(/gi)];
    assert.equal(definitions.length, declared.length, `${name}: leitor reconhece todas as funções ABA`);
  }
  assert.ok(seen.size, 'encontra funções ABA');
  for (const fn of pureHelpers) assert.ok(seen.has(fn), `${fn}: exceção ainda existe`);
});

test('ABA: tabelas de paciente entram no snapshot e DELETE da exclusão mais recente', () => {
  const versions = sqls.flatMap(({ name, sql }) => functions(sql).filter(match => match[1] === 'admin_decide_patient_deletion').map(match => ({ name, body: match[4] })));
  assert.ok(versions.length, 'encontra versões da exclusão em todas as migrations');
  const { name, body } = versions.at(-1);
  const newest = sqls.filter(({ sql }) => /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?"?admin_decide_patient_deletion"?\s*\(/i.test(sql)).at(-1).name;
  assert.equal(name, newest, 'leitor reconhece a versão mais recente da exclusão');
  for (const { table, columns } of tables) {
    if (!/\bpatient_id\s+/i.test(columns)) continue;
    assert.match(body, new RegExp(`'${table}'\\s*,\\s*\\(SELECT\\b`), `${table}: snapshot em ${name}`);
    assert.match(body, new RegExp(`DELETE\\s+FROM\\s+public\\.${table}\\s+WHERE\\s+patient_id\\s*=\\s*v_req\\.patient_id\\s*;`, 'i'), `${table}: DELETE em ${name}`);
  }
});

async function sourceFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? sourceFiles(path.join(dir, entry.name)) : path.join(dir, entry.name)))).flat();
}

test('ABA: frontend sem service_role fora da recusa de configuração e sem chave privilegiada literal', async () => {
  const allowed = path.join(root, 'frontend/src/lib/supabaseConfig.js');
  for (const file of await sourceFiles(path.join(root, 'frontend/src'))) {
    const text = await readFile(file, 'utf8');
    const relative = path.relative(root, file);
    if (file !== allowed) assert.doesNotMatch(text, /service_role/i, relative);
    assert.doesNotMatch(text, /sb_(?:secret|service_role)_[A-Za-z0-9]+/i, `${relative}: chave privilegiada literal`);
    for (const [jwt] of text.matchAll(/eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)) {
      let payload;
      try { payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8')); } catch { continue; }
      assert.notEqual(payload.role, 'service_role', `${relative}: JWT privilegiado`);
    }
  }
});
