import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let server;
let patientService;

before(async () => {
  server = await createServer({
    root,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  });
  patientService = await server.ssrLoadModule('/src/services/patientService.js');
});

after(async () => {
  await server?.close();
});

test('idade preenchida não cai em fallback que salvaria paciente sem age', () => {
  const { assertCanFallbackWithoutPatientAge } = patientService;
  const missingAgeColumn = {
    message: "Could not find the 'age' column of 'patients' in the schema cache",
  };

  assert.throws(
    () => assertCanFallbackWithoutPatientAge(missingAgeColumn, '42'),
    /Não foi possível salvar a idade do paciente/,
  );

  assert.doesNotThrow(() => assertCanFallbackWithoutPatientAge(missingAgeColumn, ''));
  assert.doesNotThrow(() => assertCanFallbackWithoutPatientAge({ message: 'network timeout' }, '42'));
});

test('normalização de idade preserva zero e rejeita valores inválidos', () => {
  const { hasSubmittedAge, normalizeAge } = patientService;

  assert.equal(normalizeAge('42'), 42);
  assert.equal(normalizeAge(0), 0);
  assert.equal(normalizeAge(''), null);
  assert.equal(normalizeAge('abc'), null);
  assert.equal(hasSubmittedAge('0'), true);
  assert.equal(hasSubmittedAge('   '), false);
});
