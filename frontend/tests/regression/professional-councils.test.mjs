import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const projectRoot = path.resolve(root, '..');

let server;
let councils;

before(async () => {
  server = await createServer({
    root,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  });
  councils = await server.ssrLoadModule('/src/data/professionalCouncils.js');
});

after(async () => {
  await server?.close();
});

test('o sistema deixou de ser exclusivo de acupuntura', () => {
  const values = councils.PROFESSIONS.map(item => item.value);
  for (const expected of ['acupunturista', 'fisioterapeuta', 'psicologo', 'psiquiatra', 'medico', 'nutricionista']) {
    assert.ok(values.includes(expected), `Faltou a profissão "${expected}" na lista`);
  }
  // Toda profissão tem rótulo e placeholder de registro para o formulário.
  for (const item of councils.PROFESSIONS) {
    assert.ok(item.label, `Profissão ${item.value} sem rótulo`);
    assert.ok(item.registrationLabel, `Profissão ${item.value} sem rótulo de registro`);
    assert.ok(item.registrationPlaceholder, `Profissão ${item.value} sem placeholder`);
  }
});

test('getProfession resolve o conselho e cai num padrão neutro', () => {
  assert.equal(councils.getProfession('psiquiatra').council, 'CRM');
  assert.equal(councils.getProfession('psicologo').council, 'CRP');
  assert.equal(councils.getProfession('fisioterapeuta').council, 'CREFITO');

  const fallback = councils.getProfession('inexistente');
  assert.equal(fallback.council, '');
  assert.equal(fallback.registrationLabel, 'Registro profissional');
  assert.equal(fallback.verifyUrl, '');
});

test('conselhos com portal apontam para domínio oficial https', () => {
  for (const item of councils.PROFESSIONS) {
    if (!item.verifyUrl) continue;
    assert.match(item.verifyUrl, /^https:\/\//, `URL do ${item.value} deveria ser https`);
  }
  // CFM e CFP têm consulta pública direta — garantimos o deep link.
  assert.equal(councils.getProfession('medico').verifyUrl, 'https://portal.cfm.org.br/busca-medicos/');
  assert.equal(councils.getProfession('psicologo').verifyUrl, 'https://cadastro.cfp.org.br/');
});

test('acupuntura não exige conselho único', () => {
  const acupuntura = councils.getProfession('acupunturista');
  assert.equal(acupuntura.council, '');
  assert.equal(acupuntura.verifyUrl, '');
  assert.ok(acupuntura.note, 'Acupuntura deveria explicar a ausência de conselho único');
});

test('especialidades convertem entre texto e lista sem perder itens', () => {
  assert.deepEqual(councils.parseSpecialties('Acupuntura, Ortopedia , Dor crônica'), [
    'Acupuntura',
    'Ortopedia',
    'Dor crônica',
  ]);
  assert.deepEqual(councils.parseSpecialties(''), []);
  assert.deepEqual(councils.parseSpecialties(null), []);
  assert.equal(councils.joinSpecialties(['Acupuntura', ' ', 'Ortopedia']), 'Acupuntura, Ortopedia');
});

test('addSpecialty vai somando e ignora duplicatas (case-insensitive)', () => {
  let value = '';
  value = councils.addSpecialty(value, 'Acupuntura');
  value = councils.addSpecialty(value, 'Ortopedia');
  assert.equal(value, 'Acupuntura, Ortopedia');

  // Duplicata em outro caixa não soma de novo.
  value = councils.addSpecialty(value, 'acupuntura');
  assert.equal(value, 'Acupuntura, Ortopedia');

  // Entrada vazia não altera nada.
  value = councils.addSpecialty(value, '   ');
  assert.equal(value, 'Acupuntura, Ortopedia');
});

test('removeSpecialtyAt remove pelo índice', () => {
  const value = 'Acupuntura, Ortopedia, Dor crônica';
  assert.equal(councils.removeSpecialtyAt(value, 1), 'Acupuntura, Dor crônica');
  assert.equal(councils.removeSpecialtyAt(value, 0), 'Ortopedia, Dor crônica');
  // Índice fora do alcance mantém a lista intacta.
  assert.equal(councils.removeSpecialtyAt(value, 9), value);
});

test('Edge Function aceita exatamente as profissões exibidas no formulário', async () => {
  const source = await fs.readFile(
    path.join(projectRoot, 'supabase/functions/super-admin-create-user/index.ts'),
    'utf8',
  );
  const match = source.match(/const ALLOWED_PROFESSIONS = new Set\(\[([\s\S]*?)\]\)/);
  assert.ok(match, 'ALLOWED_PROFESSIONS não encontrado na Edge Function');

  const edgeValues = Array.from(match[1].matchAll(/'([^']+)'/g), item => item[1]).sort();
  const frontendValues = councils.PROFESSIONS.map(item => item.value).sort();

  assert.deepEqual(edgeValues, frontendValues);
});
