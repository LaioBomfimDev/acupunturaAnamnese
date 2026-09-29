import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

import {
  NEURO_ASSESSMENT_SESSIONS_ACTIVE,
  createEmptyNeuropsychologyEvaluation,
  normalizeNeuropsychologyEvaluation,
} from '../../src/data/neuropsychologyEvaluation.js';
import { PSI_NEURO_RECORD_TYPE } from '../../src/data/psychologyAnamnese.js';
import { DISCIPLINES } from '../../src/data/disciplines.js';
import { buildNeuroAssessmentRoute } from '../../src/utils/formRoute.js';

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

test('avaliação nasce com instrumentos, integração e relatório separado', async () => {
  const evaluation = createEmptyNeuropsychologyEvaluation();
  assert.ok(evaluation.instruments.length >= 4);
  assert.ok(Object.hasOwn(evaluation.integration, 'professionalConclusion'));
  assert.deepEqual(evaluation.report, {});
  const assessment = await readPsi('PsychologyNeuroAssessment.jsx');
  // Desde 24/09/2026 os títulos das seções moram no roteiro da ficha
  // (utils/formRoute.js) e a tela renderiza cada seção por FormSectionTitle.
  const titles = buildNeuroAssessmentRoute(evaluation).map(item => item.title);
  for (const [id, text] of [
    ['instrumentos', 'Instrumentos e procedimentos'],
    ['integracao', 'Integração profissional'],
  ]) {
    assert.ok(titles.includes(text), `roteiro sem a seção "${text}"`);
    assert.ok(assessment.includes(`<FormSectionTitle entry={entry('${id}')} />`), `tela não renderiza a seção "${text}"`);
  }
  const report = await readPsi('PsychologyNeuroReport.jsx');
  assert.ok(report.includes('generateNeuropsychologyReport'));
  assert.ok(report.includes('pendente de revisão'));
});

test('sessões dentro da Avaliação desligadas, sem perder o que já foi digitado', async () => {
  // 2026-09-29: a sessão de neuro era "evoluída" dentro da Avaliação e a
  // paciente nunca aparecia em "Falta evoluir". A evolução passou para a
  // tela Evoluções; as Sessões da Avaliação ficam desligadas até a
  // administradora decidir o que fazer com elas.
  assert.equal(NEURO_ASSESSMENT_SESSIONS_ACTIVE, false);

  const evaluation = createEmptyNeuropsychologyEvaluation();
  const titles = buildNeuroAssessmentRoute(evaluation).map(item => item.title);
  assert.ok(!titles.includes('Sessões e evoluções da avaliação'), 'roteiro não mostra as sessões');

  const assessment = await readPsi('PsychologyNeuroAssessment.jsx');
  assert.match(assessment, /\{NEURO_ASSESSMENT_SESSIONS_ACTIVE && \(\s+<section className="psi-neuro-section">\s+<FormSectionTitle entry=\{entry\('sessoes'\)\} \/>/);
  assert.match(assessment, /A evolução de cada sessão é feita na tela Evoluções\./);

  // Nada é apagado: o que já estava gravado sobrevive à normalização (e
  // volta ao próximo save do workspace junto com o resto da avaliação).
  const saved = normalizeNeuropsychologyEvaluation({
    sessions: [{ observations: 'Registro antigo da sessão 1', status: 'concluida' }],
  });
  assert.equal(saved.sessions[0].observations, 'Registro antigo da sessão 1');

  // Relatório não usa as sessões desligadas (a IA: psychology-ai.test.mjs).
  const report = await readPsi('PsychologyNeuroReport.jsx');
  assert.match(report, /const sessions = NEURO_ASSESSMENT_SESSIONS_ACTIVE \? \(evaluation\.sessions \|\| \[\]\) : \[\];/);

  // Contador da lateral vem das evoluções gravadas, não das sessões.
  const workspace = await readWorkspace();
  assert.match(workspace, /listPatientEvolutions\(patientId, 'neuropsicologia'\)/);
  assert.match(workspace, /sessionCount=\{evolutionCount\}/);
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
