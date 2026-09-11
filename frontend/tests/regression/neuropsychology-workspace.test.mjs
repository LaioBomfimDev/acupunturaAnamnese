import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

import {
  createEmptyNeuropsychologyEvaluation,
  buildNeuropsychologySummary,
} from '../../src/data/neuropsychologyEvaluation.js';
import { PSI_NEURO_RECORD_TYPE } from '../../src/data/psychologyAnamnese.js';
import { DISCIPLINES } from '../../src/data/disciplines.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function readPsi(file) {
  return readFile(path.resolve(root, 'src/components/psychology', file), 'utf8');
}

async function readWorkspace() {
  return readFile(path.resolve(root, 'src/components/NeuropsychologyWorkspace.jsx'), 'utf8');
}

// ------------------------------------------------------------
// Neuropsicologia virou disciplina própria em 10/09/2026 (era a opção
// "Avaliação" dentro do PathChooser de Psicologia). Escopo mínimo
// aprovado: Painel + Avaliação (instrumentos/sessões) + Relatório —
// sem Anamnese/Evolução próprias. Reaproveita
// PsychologyNeuroAssessment/PsychologyNeuroReport tal como já
// existiam (não foram movidos de pasta).
// ------------------------------------------------------------

test('avaliação nasce com instrumentos, 10 sessões/evoluções, integração e relatório separado', async () => {
  const evaluation = createEmptyNeuropsychologyEvaluation();
  assert.equal(evaluation.sessions.length, 10);
  assert.ok(evaluation.instruments.length >= 4);
  assert.ok(Object.hasOwn(evaluation.integration, 'professionalConclusion'));
  assert.deepEqual(evaluation.report, {});
  const summary = buildNeuropsychologySummary(evaluation);
  assert.equal(summary.plannedSessions, 10);
  const assessment = await readPsi('PsychologyNeuroAssessment.jsx');
  for (const text of ['Instrumentos e procedimentos', 'Sessões e evoluções da avaliação', 'Integração profissional']) {
    assert.ok(assessment.includes(text));
  }
  const report = await readPsi('PsychologyNeuroReport.jsx');
  assert.ok(report.includes('generateNeuropsychologyReport'));
  assert.ok(report.includes('pendente de revisão'));
});

test('disciplina Neuropsicologia registrada em disciplines.js', () => {
  const entry = DISCIPLINES.find(item => item.id === 'neuropsicologia');
  assert.ok(entry, 'neuropsicologia deve estar em DISCIPLINES');
  assert.equal(entry.available, true);
  assert.equal(entry.color, 'var(--r1-discipline-neuropsicologia)');
});

test('workspace: registro grava discipline neuropsicologia, sem Anamnese/Evolução próprias', async () => {
  const source = await readWorkspace();
  assert.ok(source.includes("discipline: 'neuropsicologia'"), 'payload deve declarar discipline neuropsicologia');
  assert.ok(source.includes("'neuropsicologia'"), 'getLatestRecord/saveQueue devem usar a disciplina nova');
  assert.ok(source.includes('PSI_NEURO_RECORD_TYPE'), 'reaproveita o record_type já existente da avaliação');
  assert.ok(source.includes('PsychologyNeuroAssessment') && source.includes('PsychologyNeuroReport'),
    'reaproveita os componentes de avaliação/relatório sem duplicar');
  // Escopo mínimo: sem aba própria de Anamnese/Evolução na lateral.
  assert.ok(!/tabs: \[.*ANAMNESE/.test(source) && !source.includes("'Evolução'"),
    'workspace mínimo não deve ter Anamnese/Evolução próprias');
  assert.ok(source.includes('import { Sidebar }'), 'deve reutilizar a sidebar clínica');
  assert.ok(source.includes('className="app psi-app"'), 'deve usar o shell .app padrão');
});
