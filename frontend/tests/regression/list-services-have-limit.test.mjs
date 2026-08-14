import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

// Auditoria de segurança 2026-08-11, item 7/8 (paginação / exaustão de
// recurso): listagens sem .limit() trazem a tabela inteira escopada por
// RLS de uma vez. Não é vazamento cross-tenant, mas é latência/memória sem
// teto para clínicas grandes. Trava a presença do .limit() nos três
// serviços que a auditoria encontrou sem ele.

const frontendRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

const CASES = [
  { file: 'src/services/appointmentService.js', fn: 'listAppointments' },
  { file: 'src/services/patientService.js', fn: 'listPatients' },
  { file: 'src/services/clinicPatientsService.js', fn: 'listClinicPatients' },
];

let sources;

before(async () => {
  sources = await Promise.all(
    CASES.map(({ file }) => readFile(path.join(frontendRoot, file), 'utf8')),
  );
});

test('listagens de paciente/agenda têm teto de linhas', () => {
  sources.forEach((source, i) => {
    assert.match(
      source,
      /\.limit\(\d+\)/,
      `${CASES[i].file} (${CASES[i].fn}): precisa de .limit() na query remota`,
    );
  });
});
