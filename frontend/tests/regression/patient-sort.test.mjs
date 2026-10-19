import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import {
  DEFAULT_PATIENT_SORT,
  PATIENT_SORT_OPTIONS,
  sortPatients,
} from '../../src/utils/patientUi.js';

// 18/10/2026, pedido da administradora: as listas de pacientes ("Selecionar
// paciente" de cada área e Pacientes da instituição) ordenam por nome, de
// A a Z ao abrir. O banco devolve por cadastro, mais recente primeiro, e a
// lista de 34 nomes ficava sem ordem para quem procura de olho.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let server;
let patientStart;
let PatientProvider;

before(async () => {
  server = await createServer({
    root,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  });
  patientStart = await server.ssrLoadModule('/src/components/PatientStart.jsx');
  ({ PatientProvider } = await server.ssrLoadModule('/src/hooks/PatientContext.jsx'));
});

after(async () => {
  await server?.close();
});

const PATIENTS = [
  { id: '1', name: 'Rafael de Oliveira Santos', created_at: '2026-10-15T10:00:00Z' },
  { id: '2', name: 'ágata Lima', created_at: '2026-10-01T10:00:00Z' },
  { id: '3', name: 'Lourileide Vergasta Lopes', created_at: '2026-10-17T10:00:00Z' },
  { id: '4', name: '', created_at: '2026-10-18T10:00:00Z' },
  { id: '5', name: 'Felipe de Santana Miranda', created_at: '2026-09-20T10:00:00Z' },
  { id: '6', name: 'Agata Barros', created_at: '2026-10-10T10:00:00Z' },
];

const ids = list => list.map(patient => patient.id);

test('abre em Nome (A a Z) e oferece as três ordens em pt-BR', () => {
  assert.equal(DEFAULT_PATIENT_SORT, 'name_asc');
  assert.deepEqual(PATIENT_SORT_OPTIONS.map(option => option.label), [
    'Nome (A a Z)',
    'Nome (Z a A)',
    'Cadastro mais recente',
  ]);
});

test('A a Z ignora acento e maiúscula; sem nome vai para o fim', () => {
  // "ágata" (minúscula e com acento) fica junto de "Agata", não depois do Z.
  assert.deepEqual(ids(sortPatients(PATIENTS)), ['6', '2', '5', '3', '1', '4']);
  assert.deepEqual(ids(sortPatients(PATIENTS, 'name_asc')), ['6', '2', '5', '3', '1', '4']);
});

test('Z a A inverte o nome e mantém o sem nome no fim', () => {
  assert.deepEqual(ids(sortPatients(PATIENTS, 'name_desc')), ['1', '3', '5', '2', '6', '4']);
});

test('Cadastro mais recente segue a data de cadastro', () => {
  assert.deepEqual(ids(sortPatients(PATIENTS, 'recent')), ['4', '3', '1', '6', '2', '5']);
});

test('número no nome segue a ordem natural e a lista recebida não muda', () => {
  const list = [{ id: 'b', name: 'Ana 10' }, { id: 'a', name: 'Ana 2' }];
  assert.deepEqual(ids(sortPatients(list)), ['a', 'b']);
  assert.deepEqual(ids(list), ['b', 'a']);
  assert.deepEqual(sortPatients(null), []);
});

test('"Selecionar paciente" (todas as áreas) mostra "Ordenar por" já em A a Z', () => {
  const html = renderToStaticMarkup(React.createElement(PatientProvider, null,
    React.createElement(patientStart.PatientStart, { therapistName: 'Profissional de teste' })));
  assert.match(html, /<label class="patient-start-sort"><span>Ordenar por<\/span><select>/);
  assert.match(html, /<option value="name_asc" selected="">Nome \(A a Z\)<\/option>/);
});

test('as duas listas de pacientes ordenam pelo mesmo helper', async () => {
  for (const file of ['components/PatientStart.jsx', 'components/ClinicPatientsPanel.jsx']) {
    const source = await readFile(path.join(root, 'src', file), 'utf8');
    assert.match(source, /useState\(DEFAULT_PATIENT_SORT\)/, `${file} abre na ordem padrão`);
    assert.match(source, /return sortPatients\(found, sortOrder\);/, `${file} ordena depois da busca`);
    assert.match(source, /PATIENT_SORT_OPTIONS\.map\(/, `${file} mostra as opções do helper`);
  }
  // Todas as áreas usam o mesmo seletor: a ordem vale em cada uma.
  for (const file of ['App.jsx', 'components/PsychologyWorkspace.jsx', 'components/NeuropsychologyWorkspace.jsx', 'components/DisciplineWorkspace.jsx']) {
    const source = await readFile(path.join(root, 'src', file), 'utf8');
    assert.match(source, /<PatientStart\b/, `${file} usa o seletor compartilhado`);
  }
});
