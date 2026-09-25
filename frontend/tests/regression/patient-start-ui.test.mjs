import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { readFile } from 'node:fs/promises';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let server;
let patientStart;
let patientUi;
let PatientProvider;

before(async () => {
  server = await createServer({
    root,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  });
  patientStart = await server.ssrLoadModule('/src/components/PatientStart.jsx');
  patientUi = await server.ssrLoadModule('/src/utils/patientUi.js');
  ({ PatientProvider } = await server.ssrLoadModule('/src/hooks/PatientContext.jsx'));
});

after(async () => {
  await server?.close();
});

function renderStart(props = {}) {
  return renderToStaticMarkup(React.createElement(PatientProvider, null,
    React.createElement(patientStart.PatientStart, { therapistName: 'Profissional de teste', ...props })));
}

test('seletor não duplica saída quando a área já fornece o cabeçalho', async () => {
  assert.doesNotMatch(renderStart(), />Sair<\/button>/);
  for (const file of ['PsychologyWorkspace.jsx', 'NeuropsychologyWorkspace.jsx', 'DisciplineWorkspace.jsx']) {
    const source = await readFile(path.join(root, 'src/components', file), 'utf8');
    const selector = source.match(/<PatientStart\b[\s\S]*?\/>/);
    assert.ok(selector, `${file} mantém o seletor`);
    assert.doesNotMatch(selector[0], /onSignOut=/, `${file} não duplica a saída`);
    assert.equal((source.match(/>Sair<\/button>/g) || []).length, 1, `${file} mantém uma saída no cabeçalho`);
  }
});

test('entrada sem cabeçalho mantém uma saída e uma troca de especialidade', () => {
  const html = renderStart({ onSignOut: () => {}, hasMultipleDisciplines: true, onSwitchDiscipline: () => {} });
  assert.equal((html.match(/>Sair<\/button>/g) || []).length, 1);
  // 25/09/2026: a troca virou "Voltar à tela principal" (sem citar áreas).
  assert.equal((html.match(/>\s*Voltar à tela principal\s*</g) || []).length, 1);
  assert.doesNotMatch(html, /Mudar Especialidade|Trocar Especialidade|Alternar para Psicologia/);
});

test('entrada concentra seleção e contagem na lista e identifica a busca', () => {
  const html = renderStart();
  assert.equal((html.match(/<h2>Selecionar paciente<\/h2>/g) || []).length, 1);
  assert.match(html, /<p class="patient-start-greeting">/);
  assert.match(html, /<label class="patient-start-search"><span>Buscar paciente<\/span><input[^>]*type="search"/);
  assert.match(html, /role="status">0 pacientes</);
  assert.match(html, /Cadastre o primeiro em Pacientes da instituição/);
});

test('cartão inicia atendimento e expõe edição de cadastro por ícone', () => {
  // Ícone de exclusão rápida saiu da lista (commit 81c0295): o lápis
  // agora abre ClinicPatientProfile para edição direta, e é lá que mora
  // "Solicitar exclusão" (ver clinical-privacy-hardening.test.mjs).
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
    onEdit: () => {},
  }));

  assert.match(html, /class="patient-row-card"/);
  assert.match(html, /aria-label="Iniciar atendimento de Denise Neves"/);
  assert.match(html, /class="patient-edit-icon-button"/);
  assert.match(html, /aria-label="Editar cadastro de Denise Neves"/);
  assert.doesNotMatch(html, /patient-delete-icon-button|Solicitar exclus[ãa]o|>Excluir</);
});

test('confirmação de exclusão aceita somente termos explícitos', () => {
  const { isDeleteConfirmationValid } = patientUi;

  assert.equal(isDeleteConfirmationValid('excluir'), true);
  assert.equal(isDeleteConfirmationValid('  excluir  '), true);
  assert.equal(isDeleteConfirmationValid('DELETE'), true);
  assert.equal(isDeleteConfirmationValid('delete'), false);
  assert.equal(isDeleteConfirmationValid('remover'), false);
  assert.equal(isDeleteConfirmationValid(''), false);
});

test('contagem de pacientes usa pluralização em pt-BR', () => {
  const { formatPatientCount } = patientUi;

  assert.equal(formatPatientCount(0), '0 pacientes');
  assert.equal(formatPatientCount(1), '1 paciente');
  assert.equal(formatPatientCount(2), '2 pacientes');
});
