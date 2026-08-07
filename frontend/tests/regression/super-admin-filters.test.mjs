import assert from 'node:assert/strict';
import test from 'node:test';

import {
  filterClinicDirectory,
  filterClinics,
  filterManagedProfessionals,
} from '../../src/components/panels/superAdminFilters.js';

const professionals = [
  {
    id: 'p-1',
    full_name: 'Álvaro Lima',
    email: 'alvaro@example.com',
    profession: 'fisioterapia',
    clinic_id: 'clinic-a',
    clinic_name: 'Clínica Centro',
    is_active: true,
    must_change_password: false,
  },
  {
    id: 'p-2',
    full_name: 'Beatriz Souza',
    email: 'bia@example.com',
    profession: 'psicologia',
    clinic_id: 'clinic-b',
    clinic_name: 'Unidade Norte',
    is_active: true,
    must_change_password: true,
  },
  {
    id: 'p-3',
    full_name: 'Caio Rocha',
    email: 'caio@example.com',
    profession: 'fisioterapia',
    clinic_id: null,
    is_active: false,
    must_change_password: false,
  },
];

test('gestão combina clínica, profissão, status e pesquisa sem depender de acentos', () => {
  const result = filterManagedProfessionals(professionals, {
    query: 'alvaro',
    clinicId: 'clinic-a',
    profession: 'fisioterapia',
    status: 'active',
  }, value => value);

  assert.deepEqual(result.map(item => item.id), ['p-1']);
});

test('gestão encontra profissionais sem clínica', () => {
  const result = filterManagedProfessionals(professionals, { clinicId: 'unassigned' });
  assert.deepEqual(result.map(item => item.id), ['p-3']);
});

test('diretório da aba clínicas filtra profissionais pelo vínculo selecionado', () => {
  const result = filterClinicDirectory(professionals, { clinicId: 'clinic-b' });
  assert.deepEqual(result.map(item => item.id), ['p-2']);
});

test('pesquisa de clínicas considera dados institucionais', () => {
  const clinics = [
    { id: 'clinic-a', name: 'Clínica Centro', address: 'Curitiba - PR' },
    { id: 'clinic-b', name: 'Unidade Norte', address: 'Recife - PE' },
  ];

  assert.deepEqual(filterClinics(clinics, 'recife').map(item => item.id), ['clinic-b']);
});
