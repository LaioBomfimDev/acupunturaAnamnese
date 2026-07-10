import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';

import { DISCIPLINE_IDS } from '../../src/data/disciplines.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MIGRATION_PATH = path.resolve(root, '../supabase/migrations/20260708_clinic_patients_enrollments.sql');

let server;
let clinicPatientsService;
let migrationSql;

before(async () => {
  server = await createServer({
    root,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  });
  clinicPatientsService = await server.ssrLoadModule('/src/services/clinicPatientsService.js');
  migrationSql = await readFile(MIGRATION_PATH, 'utf8');
});

after(async () => {
  await server?.close();
});

test('migração Fase 2: estruturas centrais presentes (clinic_id, matrículas, discipline nos registros)', () => {
  assert.match(migrationSql, /ALTER TABLE public\.patients\s+ADD COLUMN IF NOT EXISTS clinic_id/);
  assert.match(migrationSql, /CREATE TABLE IF NOT EXISTS public\.patient_enrollments/);
  assert.match(migrationSql, /UNIQUE \(patient_id, discipline\)/);
  assert.match(migrationSql, /ALTER TABLE public\.clinical_records\s+ADD COLUMN IF NOT EXISTS discipline TEXT NOT NULL DEFAULT 'acupuntura'/);
  // Backfill idempotente: paciente existente vira caso de acupuntura, sem duplicar.
  assert.match(migrationSql, /ON CONFLICT \(patient_id, discipline\) DO NOTHING/);
});

test('migração Fase 2: toda disciplina do catálogo está nos CHECKs (contrato hub ↔ banco)', () => {
  for (const id of DISCIPLINE_IDS) {
    assert.ok(migrationSql.includes(`'${id}'`), `disciplina ${id} ausente da migração`);
  }
});

test('migração Fase 2 é ADITIVA: não derruba políticas antigas nem abre conteúdo clínico', () => {
  // A política do dono ("Profissional gerencia apenas seus próprios pacientes")
  // e a de clinical_records não podem ser tocadas nesta fase.
  assert.ok(!/DROP POLICY[^;]*Profissional gerencia/i.test(migrationSql));
  assert.ok(!/CREATE POLICY[^;]*ON public\.clinical_records/i.test(migrationSql),
    'clinical_records não ganha política nova na Fase 2 (abertura é Fase 3, com record_shares)');
  // Matrícula não se apaga: nem grant nem política de DELETE.
  assert.ok(!/FOR DELETE/i.test(migrationSql));
  assert.match(migrationSql, /GRANT SELECT, INSERT, UPDATE ON public\.patient_enrollments/);
  // Cadastro visível para colegas exige clínica + disciplina compartilhada.
  assert.match(migrationSql, /patients_select_clinic_discipline/);
  assert.match(migrationSql, /patient_shares_user_discipline/);
});

test('migração Fase 2: helpers de RLS com SECURITY DEFINER e search_path fixo (hardening 20260702)', () => {
  // Conta apenas declarações reais (LANGUAGE ... SECURITY DEFINER),
  // não menções em comentário.
  const definers = migrationSql.match(/LANGUAGE \w+[^\n]*SECURITY DEFINER/g) || [];
  const pinnedPaths = migrationSql.match(/SET search_path = public/g) || [];
  assert.ok(definers.length >= 5, 'funções/trigger devem ser SECURITY DEFINER');
  assert.equal(definers.length, pinnedPaths.length, 'todo SECURITY DEFINER precisa de search_path fixo');
  assert.match(migrationSql, /REVOKE EXECUTE ON FUNCTION public\.user_clinic_id\(UUID\) FROM anon/);
  assert.match(migrationSql, /REVOKE EXECUTE ON FUNCTION public\.patient_shares_user_discipline\(UUID, UUID\) FROM anon/);
});

test('missingDisciplines devolve as áreas em que o paciente ainda não está matriculado', () => {
  const { missingDisciplines } = clinicPatientsService;
  assert.deepEqual(missingDisciplines([]), DISCIPLINE_IDS);
  assert.deepEqual(
    missingDisciplines([{ discipline: 'acupuntura' }]),
    DISCIPLINE_IDS.filter(id => id !== 'acupuntura'),
  );
  assert.deepEqual(
    missingDisciplines(DISCIPLINE_IDS.map(discipline => ({ discipline }))),
    [],
  );
});

test('assertValidDiscipline aceita o catálogo e rejeita valores fora dele', () => {
  const { assertValidDiscipline } = clinicPatientsService;
  for (const id of DISCIPLINE_IDS) {
    assert.doesNotThrow(() => assertValidDiscipline(id));
  }
  assert.throws(() => assertValidDiscipline('quiropraxia'), /Disciplina inválida/);
  assert.throws(() => assertValidDiscipline(''), /Disciplina inválida/);
});

test('schema desatualizado gera erro EXPLÍCITO citando a migração (sem fallback silencioso)', () => {
  const { isMissingEnrollmentSchemaError, ENROLLMENT_MIGRATION_HINT } = clinicPatientsService;
  assert.equal(
    isMissingEnrollmentSchemaError({ message: 'relation "public.patient_enrollments" does not exist' }),
    true,
  );
  assert.equal(
    isMissingEnrollmentSchemaError({ message: "Could not find a relationship between 'patients' and 'patient_enrollments' in the schema cache" }),
    true,
  );
  assert.equal(isMissingEnrollmentSchemaError({ message: 'permission denied for table patients' }), false);
  assert.match(ENROLLMENT_MIGRATION_HINT, /20260708_clinic_patients_enrollments\.sql/);
});
