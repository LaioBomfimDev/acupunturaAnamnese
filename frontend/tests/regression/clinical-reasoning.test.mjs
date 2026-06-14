import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let server;
let reasoning;

before(async () => {
  server = await createServer({
    root,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  });
  reasoning = await server.ssrLoadModule('/src/services/clinicalReasoningService.js');
});

after(async () => {
  await server?.close();
});

const synthesis = {
  primaryName: 'Agitação do Shen por Calor',
  primaryPercent: 62,
  differential: { name: 'Deficiência de Yin do Rim', percent: 24 },
  isOpenDifferential: false,
  confidence: { level: 'Moderada', reason: 'língua (1) + sintomas (2)' },
  graded: [
    { name: 'Agitação do Shen por Calor', score: 18, hits: [{ term: 'ansiedade', group: 'sintomas' }, { term: 'insônia', group: 'sintomas' }] },
  ],
};

test('buildClinicalCase anonimiza o texto livre e mantém os sinais', () => {
  const { buildClinicalCase } = reasoning;
  const state = {
    queixa: 'Maria Souza, ansiedade e insônia há meses',
    nome: 'Maria Souza',
  };
  const selectedMap = {
    'lingua:Vermelha': true,
    'emocoes:Ansiedade/agitação mental': true,
    'seguranca:Gestação': true,
  };

  const c = buildClinicalCase(state, selectedMap, synthesis, { patientName: 'Maria Souza' });

  assert.ok(!c.anamneseText.includes('Maria'), 'nome do paciente deve ser mascarado no caso');
  assert.ok(c.anamneseText.includes('[NOME]'), 'texto deve conter marcador de nome');
  assert.equal(c.hypothesis.primary, 'Agitação do Shen por Calor');
  assert.ok(c.signals['língua'].includes('Vermelha'));
  assert.ok(c.signals.seguranca.includes('Gestação'));
  assert.ok(c.topPatterns[0].terms.includes('ansiedade'));
});

test('caseHasEvidence reflete presença de hipótese, sinais ou texto', () => {
  const { caseHasEvidence } = reasoning;

  assert.equal(caseHasEvidence({}, {}, { primaryPercent: 0 }), false);
  assert.equal(caseHasEvidence({ queixa: 'dor lombar' }, {}, { primaryPercent: 0 }), true);
  assert.equal(caseHasEvidence({}, { 'lingua:Pálida': true }, { primaryPercent: 0 }), true);
  assert.equal(caseHasEvidence({}, {}, { primaryPercent: 40 }), true);
});

test('mock produz raciocínio coerente com o caso e converte segurança em red flag', async () => {
  const { buildClinicalCase, mockDeepenClinicalReasoning } = reasoning;
  const c = buildClinicalCase(
    { queixa: 'ansiedade' },
    { 'seguranca:Gestação': true },
    synthesis,
    {}
  );
  const res = await mockDeepenClinicalReasoning(c);

  assert.match(res.interpretation, /Agitação do Shen por Calor/);
  assert.ok(Array.isArray(res.redFlags));
  assert.ok(res.redFlags.some(f => f.sign === 'Gestação'), 'sinal de segurança vira red flag');
  assert.ok(Array.isArray(res.questions) && res.questions.length > 0);
});

test('deepenClinicalReasoning rejeita caso totalmente vazio', async () => {
  const { deepenClinicalReasoning } = reasoning;
  await assert.rejects(() => deepenClinicalReasoning({}, {}, { primaryPercent: 0 }));
});
