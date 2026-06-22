import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const projectRoot = path.resolve(root, '..');

let server;
let helpers;

before(async () => {
  server = await createServer({
    root,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  });
  helpers = await server.ssrLoadModule('/src/components/panels/professionalFormHelpers.js');
});

after(async () => {
  await server?.close();
});

test('o formulário em branco já nasce pronto para a profissão e a clínica', () => {
  assert.equal(helpers.EMPTY_PROFESSIONAL_FORM.profession, '');
  assert.equal(helpers.EMPTY_PROFESSIONAL_FORM.clinicId, '');
  // Não carrega mais um clinicName de texto livre.
  assert.equal('clinicName' in helpers.EMPTY_PROFESSIONAL_FORM, false);
});

test('normalizeUsername limpa caracteres inválidos e mantém minúsculas', () => {
  assert.equal(helpers.normalizeUsername('  João.Silva '), 'joo.silva');
  assert.equal(helpers.normalizeUsername('Maria@Clinica'), 'mariaclinica');
  assert.equal(helpers.normalizeUsername('ana_paula-01'), 'ana_paula-01');
});

test('getEmailLogin usa a parte local do e-mail', () => {
  assert.equal(helpers.getEmailLogin('fisio.ana@clinica.com'), 'fisio.ana');
  assert.equal(helpers.getEmailLogin('PSI@dominio.com.br'), 'psi');
});

test('nome completo: junta e separa preservando o sobrenome composto', () => {
  assert.equal(helpers.getFullName('Ana', 'Paula Souza'), 'Ana Paula Souza');
  assert.equal(helpers.getFullName('  ', 'Souza'), 'Souza');

  const split = helpers.splitFullName('Ana Paula Souza');
  assert.deepEqual(split, { firstName: 'Ana', lastName: 'Paula Souza' });
});

test('maskCpfCnpj formata CPF e CNPJ conforme a quantidade de dígitos', () => {
  assert.equal(helpers.maskCpfCnpj('12345678901'), '123.456.789-01');
  assert.equal(helpers.maskCpfCnpj('12345678000199'), '12.345.678/0001-99');
  // Texto com ruído é limpo antes de formatar.
  assert.equal(helpers.maskCpfCnpj('abc123.456.789-01'), '123.456.789-01');
});

test('payload de criação leva profissão e clinic_id para a Edge Function', () => {
  const clinicId = '3c61e9b2-9673-45c5-9b12-f6d3dfd4670d';
  const payload = helpers.buildProfessionalCreatePayload({
    firstName: ' Ana ',
    lastName: ' Souza ',
    email: ' ANA@Clinica.COM ',
    username: '',
    phone: ' (11) 99999-0000 ',
    document: '123.456.789-01',
    profession: ' fisioterapeuta ',
    professionalRegistration: ' CREFITO-3 123456-F ',
    specialty: ' Acupuntura, Ortopedia ',
    clinicId,
    notes: ' credenciada ',
    temporaryPassword: 'Acup1234',
    confirmTemporaryPassword: 'Acup1234',
  }, [
    { id: clinicId, name: 'Clínica Integrada' },
  ]);

  assert.equal(payload.fullName, 'Ana Souza');
  assert.equal(payload.email, 'ana@clinica.com');
  assert.equal(payload.username, 'ana');
  assert.equal(payload.profession, 'fisioterapeuta');
  assert.equal(payload.professionalRegistration, 'CREFITO-3 123456-F');
  assert.equal(payload.clinicId, clinicId);
  assert.equal(payload.clinicName, 'Clínica Integrada');
  assert.equal(helpers.getProfessionalCreateValidationError(payload), '');
});

test('validação do cadastro exige profissão e senha temporária compatível com a Edge Function', () => {
  const payload = helpers.buildProfessionalCreatePayload({
    firstName: 'Ana',
    email: 'ana@clinica.com',
    profession: '',
    temporaryPassword: '12345',
    confirmTemporaryPassword: '12345',
  });

  assert.equal(
    helpers.getProfessionalCreateValidationError(payload),
    'Selecione a profissão do profissional.',
  );

  const withProfession = { ...payload, profession: 'psicologo' };
  assert.equal(
    helpers.getProfessionalCreateValidationError(withProfession),
    'A senha temporária precisa ter pelo menos 6 caracteres.',
  );
});

test('ProfessionalCreateForm não faz vínculo clinic_id em chamada posterior best-effort', async () => {
  const source = await fs.readFile(
    path.join(root, 'src/components/panels/ProfessionalCreateForm.jsx'),
    'utf8',
  );

  assert.match(source, /buildProfessionalCreatePayload\(form, clinics\)/);
  assert.doesNotMatch(source, /setProfileClinic/);
});

test('Edge Function cria profissional já com clinic_id validado', async () => {
  const source = await fs.readFile(
    path.join(projectRoot, 'supabase/functions/super-admin-create-user/index.ts'),
    'utf8',
  );

  assert.match(source, /const clinicId = cleanText\(body\.clinicId\)/);
  assert.match(source, /\.from\('clinics'\)[\s\S]*\.eq\('id', clinicId\)[\s\S]*\.maybeSingle\(\)/);
  assert.match(source, /clinic_id: clinic\?\.id \|\| null/);
  assert.match(source, /clinic_id: profilePayload\.clinic_id/);
  assert.match(source, /profession,professional_registration,specialty,clinic_name,clinic_id/);
});

test('migration multiprofissional expõe profession e clinic_id no painel SuperAdm', async () => {
  const migration = await fs.readFile(
    path.join(projectRoot, 'supabase/migrations/20260616_professional_type.sql'),
    'utf8',
  );

  assert.match(migration, /ADD COLUMN IF NOT EXISTS profession TEXT/);
  assert.match(migration, /profession TEXT,\s+clinic_name TEXT,\s+clinic_id UUID/s);
  assert.match(migration, /p\.profession,\s+p\.clinic_name,\s+p\.clinic_id/s);
  assert.match(migration, /p_profession TEXT DEFAULT NULL/);
  assert.match(migration, /profession = NULLIF\(BTRIM\(p_profession\), ''\)/);
});
