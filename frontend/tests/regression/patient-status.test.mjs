import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_PATIENT_STATUS_FILTER,
  PATIENT_STATUS_OPTIONS,
  filterPatientsByStatus,
  formatInactiveSince,
  isPatientInactive,
} from '../../src/utils/patientUi.js';

// 12/11/2026, pedido da administradora: "Suspender paciente" vira a
// situação Ativo/Inativo (seletor na ficha) e a lista de Pacientes da
// instituição ganha o filtro Ativos / Inativos / Todos, abrindo em Ativos.
// Inativo continua sendo `patients.suspended_at` (RPC set_patient_suspended):
// pausa reversível, sem migration nova e sem apagar nada.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = rel => readFile(path.join(root, rel), 'utf8');

const patients = [
  { id: 'a', name: 'Ana', suspended_at: null },
  { id: 'b', name: 'Bruno', suspended_at: '2026-11-12T13:00:00.000Z' },
  { id: 'c', name: 'Carla' },
];

test('filtro de situação: abre em Ativos, com Inativos e Todos', () => {
  assert.equal(DEFAULT_PATIENT_STATUS_FILTER, 'active');
  assert.deepEqual(PATIENT_STATUS_OPTIONS.map(o => o.label), ['Ativos', 'Inativos', 'Todos']);
  assert.deepEqual(filterPatientsByStatus(patients, 'active').map(p => p.id), ['a', 'c']);
  assert.deepEqual(filterPatientsByStatus(patients, 'inactive').map(p => p.id), ['b']);
  assert.deepEqual(filterPatientsByStatus(patients, 'all').map(p => p.id), ['a', 'b', 'c']);
  assert.deepEqual(filterPatientsByStatus(null, 'active'), []);
});

test('filtrar nunca mexe na lista recebida', () => {
  const copy = filterPatientsByStatus(patients, 'all');
  assert.notEqual(copy, patients);
  assert.equal(patients.length, 3);
});

test('inativo = suspended_at preenchido; data aparece na ficha', () => {
  assert.equal(isPatientInactive(patients[0]), false);
  assert.equal(isPatientInactive(patients[1]), true);
  assert.equal(isPatientInactive(undefined), false);
  assert.match(formatInactiveSince(patients[1]), /^Inativo desde \d{2}\/\d{2}\/2026$/);
  assert.equal(formatInactiveSince({ suspended_at: 'x' }), 'Inativo');
});

test('ficha usa o seletor Situação, nunca mais o botão "Suspender paciente"', async () => {
  const src = await read('src/components/ClinicPatientProfile.jsx');
  assert.doesNotMatch(src, /'Suspender paciente'|Suspenso — reativar|handleToggleSuspended/);
  assert.match(src, /<span>Situação<\/span>/);
  assert.match(src, /<option value="active">Ativo<\/option>/);
  assert.match(src, /<option value="inactive">Inativo<\/option>/);
  assert.match(src, /setPatientSuspended\(full\.id, inactive\)/);
  // Topo da ficha e formulário de edição usam o mesmo seletor.
  assert.equal((src.match(/renderStatusSelect\('/g) || []).length, 2);
});

test('lista de Pacientes da instituição filtra pela situação depois da busca', async () => {
  const src = await read('src/components/ClinicPatientsPanel.jsx');
  assert.match(src, /useState\(DEFAULT_PATIENT_STATUS_FILTER\)/);
  assert.match(src, /const found = filterPatientsByStatus\(searched, statusFilter\);\r?\n\s*return sortPatients\(found, sortOrder\);/);
  assert.match(src, /PATIENT_STATUS_OPTIONS\.map/);
  // Quem procura um inativo em Ativos é avisado, não fica achando que sumiu.
  assert.match(src, /hiddenByStatus > 0/);
  assert.match(src, /setStatusFilter\('all'\)/);
});
