import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let server;
let buildReasoningKnowledgeQuery;
let retrieveCaseKnowledge;

const SAMPLE_CASE = {
  hypothesis: { primary: 'Estase de Sangue', differential: { name: 'Deficiência de Sangue' } },
  topPatterns: [
    { name: 'Estase de Sangue', score: 7, terms: ['dor fixa', 'língua roxa'] },
  ],
  signals: {
    'língua': ['língua roxa', 'veias sublinguais'],
    sintomas: ['dor fixa em pontada'],
  },
};

before(async () => {
  server = await createServer({
    root,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  });
  const mod = await server.ssrLoadModule('/src/services/clinicalReasoningService.js');
  buildReasoningKnowledgeQuery = mod.buildReasoningKnowledgeQuery;
  retrieveCaseKnowledge = mod.retrieveCaseKnowledge;
});

after(async () => {
  await server?.close();
});

test('buildReasoningKnowledgeQuery reúne hipótese, diferencial, padrões e sinais', () => {
  const q = buildReasoningKnowledgeQuery(SAMPLE_CASE);
  assert.ok(q.includes('Estase de Sangue'));
  assert.ok(q.includes('Deficiência de Sangue'));
  assert.ok(q.includes('dor fixa'));
  assert.ok(q.includes('veias sublinguais'));
});

test('buildReasoningKnowledgeQuery em caso vazio retorna vazio', () => {
  assert.equal(buildReasoningKnowledgeQuery({}).trim(), '');
});

test('retrieveCaseKnowledge recupera o mais relevante, corta texto e mantém formato', () => {
  const corpus = [
    { title: 'Estase de Sangue', cat: 'Síndrome', confidence: 'high', source: 'Base', txt: 'x'.repeat(2000), tags: 'Estase de Sangue, dor fixa' },
    { title: 'Vento-Frio', cat: 'Síndrome', confidence: 'high', source: 'Base', txt: 'irrelevante', tags: 'vento frio' },
  ];
  const out = retrieveCaseKnowledge(SAMPLE_CASE, { corpus, limit: 3 });
  assert.ok(out.length >= 1);
  const top = out[0];
  assert.equal(top.title, 'Estase de Sangue');
  for (const field of ['title', 'cat', 'confidence', 'source', 'text']) {
    assert.ok(field in top, `faltou ${field}`);
  }
  assert.ok(top.text.length <= 600, 'texto não foi cortado');
});

test('retrieveCaseKnowledge sem sinais não recupera nada (não gasta IA à toa)', () => {
  assert.deepEqual(retrieveCaseKnowledge({}, { corpus: [] }), []);
});

test('retrieveCaseKnowledge ancora um caso de Estase no corpus real (repertório/base)', () => {
  const out = retrieveCaseKnowledge(SAMPLE_CASE);
  assert.ok(Array.isArray(out));
  assert.ok(out.length >= 1, 'deveria achar âncora curada para um caso tão marcado');
});
