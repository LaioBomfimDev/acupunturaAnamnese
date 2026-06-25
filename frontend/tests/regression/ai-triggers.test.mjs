import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let server;
let anamnese;
let reasoning;
let library;
let report;
let tongue;

before(async () => {
  server = await createServer({
    root,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  });
  [anamnese, reasoning, library, report, tongue] = await Promise.all([
    server.ssrLoadModule('/src/services/anamneseAiService.js'),
    server.ssrLoadModule('/src/services/clinicalReasoningService.js'),
    server.ssrLoadModule('/src/services/libraryAiService.js'),
    server.ssrLoadModule('/src/services/reportAiService.js'),
    server.ssrLoadModule('/src/services/tongueAiService.js'),
  ]);
});

after(async () => {
  await server?.close();
});

const realUser = { id: 'professional-1' };
const synthesis = {
  primaryName: 'Deficiência de Qi do Baço',
  primaryPercent: 62,
  confidence: { level: 'Moderada', reason: 'sinais confirmados' },
  graded: [{ name: 'Deficiência de Qi do Baço', score: 4, hits: [{ term: 'fadiga' }] }],
};
const libraryCards = [{
  title: 'E36 Zusanli',
  cat: 'Ponto',
  confidence: 'high',
  source: 'Base curada',
  txt: 'Ponto relacionado a fadiga e digestão.',
  tags: 'E36 fadiga digestão',
}];

function realRuntime(calls) {
  return {
    getAuthenticatedUser: async () => realUser,
    invoke: async (name, options) => {
      calls.push({ name, options });
      const dataByFunction = {
        'suggest-marks': { modelVersion: 'gemini-test', suggestions: [], warning: null },
        'clinical-reasoning': {
          modelVersion: 'gemini-test', interpretation: 'Leitura para conferência.',
          differentialReasoning: null, redFlags: [], contradictions: [], questions: [],
        },
        'library-qa': { modelVersion: 'gemini-test', answer: 'Resposta ancorada.', citations: [], insufficient: false },
        'draft-narrative': { modelVersion: 'gemini-test', paragraphs: ['Rascunho para revisão.'] },
        'analyze-tongue': { modelVersion: 'gemini-test', findings: [], warning: null },
      };
      return { data: dataByFunction[name], error: null };
    },
  };
}

test('os seis fluxos críticos chamam a Edge Function correspondente em sessão real', async () => {
  const calls = [];
  const runtime = realRuntime(calls);

  await anamnese.suggestAnamneseMarks(
    { queixa: 'Maria Souza relata fadiga e refluxo.' },
    { patientName: 'Maria Souza' },
    runtime,
  );
  await reasoning.deepenClinicalReasoning(
    { queixa: 'Maria Souza relata fadiga.' },
    { 'digestao:Refluxo/azia': true },
    synthesis,
    { patientName: 'Maria Souza' },
    runtime,
  );
  await library.askLibrary('E36 para fadiga', libraryCards, runtime);
  await report.draftReport('Resumo clínico', { queixa: 'Maria Souza relata fadiga.' }, { patientName: 'Maria Souza' }, runtime);
  await report.summarizeEvolution([{ sessao: 1, dor: 7, obs: 'Maria Souza relatou dor.' }], { patientName: 'Maria Souza' }, runtime);
  await tongue.analyzeTongueImages(
    { top: { path: 'professional-1/patient-1/2026-06-23/top-1.webp' } },
    { patientId: 'patient-1' },
    runtime,
  );

  assert.deepEqual(calls.map(call => call.name), [
    'suggest-marks', 'clinical-reasoning', 'library-qa', 'draft-narrative', 'draft-narrative', 'analyze-tongue',
  ]);
  assert.ok(!calls[0].options.body.text.includes('Maria Souza'), 'anamnese deve sair anonimizada');
  assert.ok(!calls[1].options.body.case.anamneseText.includes('Maria Souza'), 'raciocínio deve sair anonimizado');
  assert.ok(!JSON.stringify(calls[3].options.body.payload).includes('Maria Souza'), 'relatório deve sair anonimizado');
  assert.ok(!JSON.stringify(calls[4].options.body.payload).includes('Maria Souza'), 'evolução deve sair anonimizada');
  assert.deepEqual(calls[5].options.body.photos, {
    top: 'professional-1/patient-1/2026-06-23/top-1.webp',
    sublingual: null,
  });
});

test('sessão real recebe erro da infraestrutura em vez de resultado simulado', async () => {
  const unavailableRuntime = {
    getAuthenticatedUser: async () => realUser,
    invoke: async () => ({
      data: null,
      error: { context: { json: async () => ({ error: 'Análise por IA não configurada no servidor.' }) } },
    }),
  };

  const flows = [
    () => anamnese.suggestAnamneseMarks({ queixa: 'fadiga' }, {}, unavailableRuntime),
    () => reasoning.deepenClinicalReasoning({ queixa: 'fadiga' }, {}, synthesis, {}, unavailableRuntime),
    () => library.askLibrary('E36 fadiga', libraryCards, unavailableRuntime),
    () => report.draftReport('Resumo clínico', { queixa: 'fadiga' }, {}, unavailableRuntime),
    () => report.summarizeEvolution([{ sessao: 1, dor: 7 }], {}, unavailableRuntime),
    () => tongue.analyzeTongueImages(
      { top: { path: 'professional-1/patient-1/2026-06-23/top-1.webp' } },
      { patientId: 'patient-1' },
      unavailableRuntime,
    ),
  ];

  for (const run of flows) {
    await assert.rejects(run, /não configurada/i);
  }
});

test('os botões e ações de teclado permanecem ligados às seis superfícies de IA', async () => {
  const triggers = [
    ['src/components/panels/Anamnese.jsx', /Sugerir marcações com IA/, /suggestAnamneseMarks/],
    ['src/components/panels/Lingua.jsx', /Analisar com IA/, /analyzeTongueImages/],
    ['src/components/panels/AssistantDeepDive.jsx', /Aprofundar com IA/, /deepenClinicalReasoning/],
    ['src/components/panels/Biblioteca.jsx', /Perguntar/, /askLibrary/],
    ['src/components/panels/Relatorio.jsx', /Gerar rascunho com IA/, /draftReport/],
    ['src/components/panels/Evolucao.jsx', /Resumir evolução com IA/, /summarizeEvolution/],
  ];

  for (const [relativePath, label, serviceCall] of triggers) {
    const source = await readFile(path.resolve(root, relativePath), 'utf8');
    assert.match(source, label, `${relativePath} deve manter a ação visível`);
    assert.match(source, serviceCall, `${relativePath} deve continuar ligado ao serviço de IA`);
  }
});
