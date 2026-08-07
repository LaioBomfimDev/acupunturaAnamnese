import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let server;
let telemetry;

before(async () => {
  server = await createServer({
    root,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  });
  telemetry = await server.ssrLoadModule('/src/services/telemetry.js');
});

after(async () => {
  await server?.close();
});

test('telemetria não inclui mensagem, stack ou contexto clínico do erro', () => {
  const error = new Error('Paciente Maria: diagnóstico e telefone sigilosos');
  error.code = 'SAVE_FAILED';
  error.stack = 'stack com dado clínico';

  const event = telemetry.sanitizeClientError(error, {
    component: 'ClinicalPanel',
    state: { patient: 'Maria' },
  });

  assert.equal(event.code, 'SAVE_FAILED');
  assert.equal(event.component, 'ClinicalPanel');
  assert.equal('message' in event, false);
  assert.equal('stack' in event, false);
  assert.equal('state' in event, false);
  assert.doesNotMatch(JSON.stringify(event), /Maria|diagnóstico|telefone|sigilosos/i);
});

test('aplicação instala captura global e usa ErrorBoundary no topo', async () => {
  const [main, boundary] = await Promise.all([
    readFile(path.join(root, 'src/main.jsx'), 'utf8'),
    readFile(path.join(root, 'src/components/AppErrorBoundary.jsx'), 'utf8'),
  ]);

  assert.match(main, /installGlobalErrorTelemetry\(\)/);
  assert.match(main, /<AppErrorBoundary>/);
  assert.match(boundary, /componentDidCatch/);
  assert.match(boundary, /reportClientError/);
  assert.match(boundary, /Recarregar o sistema/);
});

test('análise de língua não registra corpo do provedor nem objeto de erro', async () => {
  const source = await readFile(
    path.resolve(root, '../supabase/functions/analyze-tongue/index.ts'),
    'utf8',
  );

  assert.match(source, /logOperationalEvent/);
  assert.match(source, /createCorrelationId/);
  assert.doesNotMatch(source, /geminiResponse\.text\(\)/);
  assert.doesNotMatch(source, /console\.error\([^)]*error/);
  assert.match(source, /Não foi possível concluir a análise\. Referência:/);
});
