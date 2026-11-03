// Observações do cadastro do paciente (03/11/2026, opção A escolhida pela
// administradora): campo em Cadastrar paciente, Editar cadastro e no
// detalhe do atendimento na Agenda. Regra em AGENTS.md §7.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => readFile(path.join(root, file), 'utf8');
const notes = await import(new URL('../../src/utils/patientNotes.js', import.meta.url).href);

const MIGRATION = '../supabase/migrations/20261103c_patient_notes.sql';
const PREVIOUS = '../supabase/migrations/20261101c_aba_qualidade.sql';

function functionBody(sql) {
  const match = sql.match(/CREATE OR REPLACE FUNCTION public\.admin_decide_patient_deletion\([\s\S]*?\$admin_decide_patient_deletion\$;/);
  assert.ok(match, 'admin_decide_patient_deletion');
  return match[0];
}

test('limite da tela é o mesmo do CHECK do banco', async () => {
  const sql = await read(MIGRATION);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS observacoes TEXT NULL/);
  const check = sql.match(/char_length\(observacoes\) <= (\d+)/);
  assert.ok(check, 'CHECK de tamanho');
  assert.equal(Number(check[1]), notes.PATIENT_NOTES_MAX);
});

test('exclusão parte da última versão e só acrescenta observacoes = NULL', async () => {
  const previous = functionBody(await read(PREVIOUS)).split(/\r?\n/);
  const updated = functionBody(await read(MIGRATION)).split(/\r?\n/);
  const added = '      observacoes = NULL,';
  assert.equal(updated.filter(line => line === added).length, 1);
  assert.deepEqual(updated.filter(line => line !== added), previous, 'o resto da função é idêntico');
  const sql = await read(MIGRATION);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.admin_decide_patient_deletion\(UUID, TEXT, TEXT\) FROM PUBLIC, anon;/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.admin_decide_patient_deletion\(UUID, TEXT, TEXT\) TO authenticated;/);
});

test('texto é limpo, vazio vira nada e passar do limite recusa', () => {
  assert.equal(notes.normalizePatientNotes(undefined), undefined, 'sem campo, não mexe');
  assert.equal(notes.normalizePatientNotes('   '), null);
  assert.equal(notes.normalizePatientNotes('  vem com a mãe \r\n prefere manhã  '), 'vem com a mãe \n prefere manhã');
  assert.equal(notes.normalizePatientNotes('x'.repeat(notes.PATIENT_NOTES_MAX)).length, notes.PATIENT_NOTES_MAX);
  assert.throws(() => notes.normalizePatientNotes('x'.repeat(notes.PATIENT_NOTES_MAX + 1)), /limite de 1000 caracteres/);
  assert.equal(notes.patientNotesCounter('a'), '1 de 1000 caractere');
  assert.equal(notes.patientNotesCounter(''), '0 de 1000 caracteres');
  assert.equal(notes.patientNotesCounter('abc'), '3 de 1000 caracteres');
});

test('o aviso diz quem vê e onde vai o dado clínico', () => {
  assert.match(notes.PATIENT_NOTES_HINT, /Toda a equipe vê/);
  assert.match(notes.PATIENT_NOTES_HINT, /recepção/);
  assert.match(notes.PATIENT_NOTES_HINT, /dado clínico/);
});

test('cadastrar e editar usam o mesmo campo, e a gravação leva o texto', async () => {
  const create = await read('src/components/NewPatientForm.jsx');
  assert.match(create, /<PatientNotesField[\s\S]*?id="new-patient-notes"/);
  assert.match(create, /observacoes: form\.observacoes,/);

  const profile = await read('src/components/ClinicPatientProfile.jsx');
  assert.match(profile, /<PatientNotesField[\s\S]*?id="edit-patient-notes"/);
  assert.match(profile, /observacoes: editForm\.observacoes,/);
  assert.match(profile, /observacoes: p\?\.observacoes \|\| '',/);
  assert.match(profile, /<Field wide multiline label=\{PATIENT_NOTES_LABEL\} value=\{full\?\.observacoes\} \/>/);

  const field = await read('src/components/PatientNotesField.jsx');
  assert.match(field, /maxLength=\{PATIENT_NOTES_MAX\}/);
  assert.match(field, /PATIENT_NOTES_HINT/, 'aviso visível junto do campo');
});

test('serviço grava, lê e não deixa o texto sumir calado sem a migração', async () => {
  const service = await read('src/services/patientService.js');
  assert.match(service, /'has_pending,observacoes,'/);
  assert.match(service, /payload\.observacoes = normalizedNotes/);
  assert.equal((service.match(/assertCanFallbackWithoutNotes\(error, normalizedNotes\)/g) || []).length, 2,
    'criar e editar recusam quando a coluna falta e há texto');
  assert.match(service, /delete fallbackPayload\.observacoes;/);

  const list = await read('src/services/clinicPatientsService.js');
  assert.match(list, /has_pending,observacoes,archived_at/);
  assert.match(list, /isMissingNotesColumnError\(error\)/, 'sem a migração, a Agenda continua abrindo');
});

test('Agenda mostra as observações no detalhe do atendimento', async () => {
  const agenda = await read('src/components/panels/Agenda.jsx');
  assert.match(agenda, /function patientNotes\(id\)/);
  assert.match(agenda, /selectedAppointment\.kind !== 'block' && patientNotes\(selectedAppointment\.patient_id\) && \(/);
  assert.match(agenda, /className="ag-detail-notes"/);
  const css = await read('src/styles/agenda.css');
  const block = css.slice(css.indexOf('/* ---------- Observações do cadastro'));
  assert.match(block, /white-space: pre-line/);
  assert.doesNotMatch(block, /box-shadow|#[0-9a-f]{3,8}\b|rgba?\(/i, 'cor só por token');
});
