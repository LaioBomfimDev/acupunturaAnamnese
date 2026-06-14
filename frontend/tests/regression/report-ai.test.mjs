import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let server;
let reportAi;

before(async () => {
  server = await createServer({
    root,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  });
  reportAi = await server.ssrLoadModule('/src/services/reportAiService.js');
});

after(async () => {
  await server?.close();
});

test('mockDraftReport devolve parágrafos coerentes com a hipótese', async () => {
  const { mockDraftReport } = reportAi;
  const res = await mockDraftReport('Resumo clínico', {
    hipotese: 'Deficiência de Qi do Baço',
    principioTerapeutico: 'Tonificar o Baço',
    queixa: 'fadiga e distensão',
  });

  assert.ok(Array.isArray(res.paragraphs) && res.paragraphs.length > 0);
  assert.ok(res.paragraphs.some(p => p.includes('Deficiência de Qi do Baço')));
});

test('mockSummarizeEvolution compara primeira e última sessão', async () => {
  const { mockSummarizeEvolution } = reportAi;
  const res = await mockSummarizeEvolution([
    { sessao: 1, dor: 8, sono: 3 },
    { sessao: 2, dor: 5, sono: 6 },
    { sessao: 3, dor: 3, sono: 7 },
  ]);

  assert.ok(Array.isArray(res.paragraphs) && res.paragraphs.length > 0);
  assert.ok(res.paragraphs.some(p => p.includes('8') && p.includes('3')), 'deve citar a variação da dor');
});

test('summarizeEvolution rejeita lista vazia de sessões (antes de qualquer chamada)', async () => {
  const { summarizeEvolution } = reportAi;
  await assert.rejects(() => summarizeEvolution([]));
});

test('mockDraftReport sem hipótese ainda produz rascunho (fallback)', async () => {
  const { mockDraftReport } = reportAi;
  const res = await mockDraftReport('Orientação ao paciente', { queixa: 'insônia' });
  assert.ok(Array.isArray(res.paragraphs) && res.paragraphs.length > 0);
  assert.ok(res.paragraphs.some(p => /hipótese/i.test(p)), 'rascunho menciona estado da hipótese');
});
