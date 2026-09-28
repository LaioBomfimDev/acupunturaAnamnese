import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, readdir } from 'node:fs/promises';

// ============================================================
// Guarda de regressão do incidente de 25/09/2026: compartilhar
// paciente falhava SEMPRE com 42702 "column reference patient_id is
// ambiguous" (docs/regressao-log.md).
//
// Em PL/pgSQL, cada coluna de RETURNS TABLE, cada parâmetro e cada
// variável do DECLARE é uma variável da função. O alvo de
// `ON CONFLICT (col, ...)` é resolvido como expressão, então se `col`
// tem o mesmo nome de uma dessas variáveis o Postgres aborta na hora
// de executar — nenhum teste de texto isolado pega, e a Edge Function
// que chama a RPC mascara o motivo. A saída segura é
// `ON CONFLICT ON CONSTRAINT <nome>`.
//
// Como no shared-session-cumulative-hardening.test.mjs, o teste olha
// só a versão VIGENTE de cada função (a última migration, por ordem
// de arquivo, que a redefine), porque é essa que roda no banco.
// ============================================================

const migrationsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../supabase/migrations',
);

const FUNCTION_REGEX =
  /CREATE OR REPLACE FUNCTION\s+public\.(\w+)\s*\(([\s\S]*?)\)\s*RETURNS\s+([\s\S]*?)\bAS\s+(\$\w*\$)([\s\S]*?)\4/gi;

let latestFunctions;

function firstWords(list) {
  return list
    .split(/[,;]/)
    .map(item => item.trim().split(/\s+/)[0]?.toLowerCase())
    .filter(Boolean);
}

function functionVariables({ params, returns, body }) {
  const returnsTable = returns.match(/TABLE\s*\(([\s\S]*?)\)\s*(?:LANGUAGE|SECURITY|SET|STABLE|VOLATILE|IMMUTABLE)/i);
  const declare = body.match(/DECLARE([\s\S]*?)\bBEGIN\b/i);
  return new Set([
    ...firstWords(params),
    ...(returnsTable ? firstWords(returnsTable[1]) : []),
    ...(declare ? firstWords(declare[1]) : []),
  ]);
}

before(async () => {
  const entries = (await readdir(migrationsDir))
    .filter(name => name.endsWith('.sql'))
    .sort();

  latestFunctions = new Map();
  for (const name of entries) {
    const source = await readFile(path.join(migrationsDir, name), 'utf8');
    for (const match of source.matchAll(FUNCTION_REGEX)) {
      latestFunctions.set(match[1], {
        file: name,
        params: match[2],
        returns: match[3],
        body: match[5],
      });
    }
  }
});

test('encontra as funções versionadas nas migrations', () => {
  assert.ok(latestFunctions.size > 0, 'nenhuma função encontrada nas migrations');
  assert.ok(
    latestFunctions.has('create_record_share_after_reauthentication'),
    'create_record_share_after_reauthentication precisa estar entre as funções analisadas',
  );
});

test('nenhuma função vigente usa ON CONFLICT (coluna) com nome de variável da função', () => {
  const collisions = [];
  for (const [name, definition] of latestFunctions) {
    const variables = functionVariables(definition);
    for (const conflict of definition.body.matchAll(/ON CONFLICT\s*\(([^)]*)\)/gi)) {
      const clashing = conflict[1]
        .split(',')
        .map(column => column.trim().toLowerCase())
        .filter(column => variables.has(column));
      if (clashing.length) {
        collisions.push(`${definition.file} → ${name}: ON CONFLICT (${conflict[1].trim()}) colide com ${clashing.join(', ')}`);
      }
    }
  }
  assert.deepEqual(
    collisions,
    [],
    'Use ON CONFLICT ON CONSTRAINT <nome> — o alvo por coluna vira 42702 em tempo de execução.',
  );
});

test('compartilhamento (versão vigente) grava a matrícula pelo nome da constraint', () => {
  const share = latestFunctions.get('create_record_share_after_reauthentication');
  assert.match(
    share.body,
    /ON CONFLICT ON CONSTRAINT patient_enrollments_patient_id_discipline_key/,
    `${share.file}: a matrícula no destino precisa usar o alvo por constraint`,
  );
});
