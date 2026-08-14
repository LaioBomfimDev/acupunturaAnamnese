import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdir, readFile } from 'node:fs/promises';

// Auditoria de segurança 2026-08-11, item 7 (validação de payload / limite
// de tamanho): toda Edge Function que lê corpo JSON precisa capar bytes
// antes do parse (readClinicalJsonBody), nunca req.json() cru — senão um
// corpo arbitrariamente grande é lido inteiro na memória antes de qualquer
// validação de campo.

const functionsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../supabase/functions',
);

let entries;

before(async () => {
  entries = await readdir(functionsDir, { withFileTypes: true });
});

test('nenhuma Edge Function lê req.json() sem limite de bytes', async () => {
  const offenders = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === '_shared') continue;
    const indexPath = path.join(functionsDir, entry.name, 'index.ts');
    let source;
    try {
      source = await readFile(indexPath, 'utf8');
    } catch {
      continue;
    }
    if (/\breq\.json\(\)/.test(source)) {
      offenders.push(entry.name);
    }
  }
  assert.deepEqual(offenders, [], `Edge Functions sem cap de tamanho de payload: ${offenders.join(', ')}`);
});
