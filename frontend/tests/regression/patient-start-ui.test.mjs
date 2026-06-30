import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let server;
let patientStart;
let patientUi;

before(async () => {
  server = await createServer({
    root,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  });
  patientStart = await server.ssrLoadModule('/src/components/PatientStart.jsx');
  patientUi = await server.ssrLoadModule('/src/utils/patientUi.js');
});

after(async () => {
  await server?.close();
});

test('cartão da seleção de paciente abre a ficha e expõe exclusão por ícone', () => {
  const { PatientListCard } = patientStart;
  const patient = {
    id: 'patient-1',
    name: 'Denise Neves',
    phone: '71999999999',
    age: 42,
  };

  const html = renderToStaticMarkup(React.createElement(PatientListCard, {
    patient,
    onSelect: () => {},
    onRequestDelete: () => {},
  }));

  assert.match(html, /class="patient-row-card"/);
  assert.match(html, /aria-label="Abrir ficha de Denise Neves"/);
  assert.doesNotMatch(html, />Abrir ficha</);
  assert.match(html, /class="patient-delete-icon-button"/);
  assert.match(html, /aria-label="Excluir paciente Denise Neves"/);
  assert.doesNotMatch(html, />Excluir</);
});

test('confirmação de exclusão aceita somente termos explícitos', () => {
  const { isPatientDeletionConfirmationValid } = patientUi;

  assert.equal(isPatientDeletionConfirmationValid('excluir'), true);
  assert.equal(isPatientDeletionConfirmationValid('  excluir  '), true);
  assert.equal(isPatientDeletionConfirmationValid('DELETE'), true);
  assert.equal(isPatientDeletionConfirmationValid('delete'), false);
  assert.equal(isPatientDeletionConfirmationValid('remover'), false);
  assert.equal(isPatientDeletionConfirmationValid(''), false);
});

test('contagem de pacientes usa pluralização em pt-BR', () => {
  const { formatPatientCount } = patientUi;

  assert.equal(formatPatientCount(0), '0 pacientes');
  assert.equal(formatPatientCount(1), '1 paciente');
  assert.equal(formatPatientCount(2), '2 pacientes');
});
