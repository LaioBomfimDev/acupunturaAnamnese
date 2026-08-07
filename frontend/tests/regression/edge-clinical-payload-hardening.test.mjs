import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

import {
  ClinicalPayloadValidationError,
  readClinicalJsonBody,
  sanitizeClinicalPayload,
  scrubClinicalText,
} from '../../../supabase/functions/_shared/clinicalPayload.ts';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const functionsRoot = path.resolve(frontendRoot, '../supabase/functions');
const protectedFunctions = [
  'clinical-reasoning',
  'draft-narrative',
  'psych-reading',
  'psych-report',
  'suggest-marks',
  'psych-suggest-marks',
];

test('scrub server-side remove PII brasileira sem apagar conteúdo clínico', () => {
  const sanitized = scrubClinicalText(
    [
      'Nome do paciente: Maria Souza',
      'CPF 123.456.789-00; telefone (11) 91234-5678.',
      'E-mail maria.souza@example.com; CEP 01310-000.',
      'Nascimento em 12/03/1984. Dor 8/10 e sono 3/10.',
    ].join('\n'),
  );

  assert.doesNotMatch(
    sanitized,
    /Maria Souza|123\.456\.789-00|91234-5678|maria\.souza@example\.com|01310-000|12\/03\/1984/,
  );
  for (const marker of ['[NOME]', '[CPF]', '[TELEFONE]', '[EMAIL]', '[CEP]', '[DATA]']) {
    assert.ok(sanitized.includes(marker), `marcador ausente: ${marker}`);
  }
  assert.match(sanitized, /Dor 8\/10 e sono 3\/10/);
});

test('schema recursivo aplica allowlist e redige identificador por finalidade', () => {
  const schema = {
    type: 'object',
    properties: {
      text: { type: 'string', required: true, maxLength: 500 },
      informant: {
        type: 'object',
        properties: {
          type: { type: 'string', maxLength: 80 },
          name: { type: 'string', maxLength: 120, redact: true },
        },
      },
    },
  };

  const sanitized = sanitizeClinicalPayload({
    text: 'Maria Souza relata fadiga e telefone 11912345678.',
    informant: { type: 'mãe', name: 'Ana Souza' },
  }, schema);

  assert.equal(sanitized.informant.name, '[IDENTIFICADOR REMOVIDO]');
  assert.doesNotMatch(JSON.stringify(sanitized), /Maria Souza|Ana Souza|11912345678/);
  assert.match(sanitized.text, /\[NOME\].*\[TELEFONE\]/);

  assert.throws(
    () => sanitizeClinicalPayload({
      text: 'fadiga',
      patientName: 'Maria Souza',
    }, schema),
    error => error instanceof ClinicalPayloadValidationError
      && error.code === 'unexpected_field',
  );
});

test('leitura do request rejeita corpo acima do teto antes do schema', async () => {
  const request = new Request('https://edge.local/test', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'x'.repeat(200) }),
  });

  await assert.rejects(
    () => readClinicalJsonBody(request, 64),
    error => error instanceof ClinicalPayloadValidationError
      && error.code === 'payload_too_large',
  );
});

test('seis Edge Functions sanitizam antes da Vertex e não expõem erros crus', async () => {
  for (const functionName of protectedFunctions) {
    const source = await readFile(
      path.join(functionsRoot, functionName, 'index.ts'),
      'utf8',
    );

    assert.match(source, /readClinicalJsonBody\(/, `${functionName} sem leitura limitada`);
    assert.match(source, /sanitizeClinicalPayload\(/, `${functionName} sem schema server-side`);
    assert.match(source, /logOperationalEvent\(/, `${functionName} sem log sanitizado`);
    assert.match(source, /createCorrelationId\(/, `${functionName} sem correlação`);
    assert.ok(
      source.indexOf('sanitizeClinicalPayload(') < source.indexOf('vertexGenerateContent('),
      `${functionName} chama a Vertex antes de sanitizar`,
    );
    assert.doesNotMatch(source, /req\.json\(/, `${functionName} lê corpo sem limite`);
    assert.doesNotMatch(source, /console\.(?:error|warn|log)\(/, `${functionName} usa console cru`);
    assert.doesNotMatch(source, /error\.message/, `${functionName} expõe mensagem interna`);
    assert.doesNotMatch(
      source,
      /jsonResponse\(\s*\{\s*error:\s*error\b/,
      `${functionName} devolve erro interno ao cliente`,
    );
  }
});

test('campos nominais sem finalidade clínica são redigidos nos contratos psi', async () => {
  const [reading, report] = await Promise.all([
    readFile(path.join(functionsRoot, 'psych-reading/index.ts'), 'utf8'),
    readFile(path.join(functionsRoot, 'psych-report/index.ts'), 'utf8'),
  ]);

  assert.match(reading, /name:\s*\{\s*type:\s*'string'[^}]*redact:\s*true/);
  assert.match(report, /requester:\s*\{\s*type:\s*'string'[^}]*redact:\s*true/);
  assert.match(report, /participants:\s*\{\s*type:\s*'string'[^}]*redact:\s*true/);
  assert.match(report, /informant:\s*\{\s*type:\s*'string'[^}]*redact:\s*true/);
});
