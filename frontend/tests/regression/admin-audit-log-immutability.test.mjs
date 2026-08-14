import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

// Auditoria de segurança 2026-08-11, achado A5: admin_audit_logs não
// tinha trigger de imutabilidade, ao contrário de clinical_record_audit_log.

const migrationsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../supabase/migrations',
);

let migration;

before(async () => {
  migration = await readFile(
    path.join(migrationsDir, '20260812_admin_audit_log_immutability.sql'),
    'utf8',
  );
});

test('admin_audit_logs recusa UPDATE/DELETE via trigger', () => {
  assert.match(
    migration,
    /CREATE TRIGGER admin_audit_logs_reject_mutation\s+BEFORE UPDATE OR DELETE\s+ON public\.admin_audit_logs/,
  );
  assert.match(
    migration,
    /EXECUTE FUNCTION public\.reject_immutable_clinical_log_mutation\(\)/,
  );
});
