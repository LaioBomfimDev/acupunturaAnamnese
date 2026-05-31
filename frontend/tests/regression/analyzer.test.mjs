import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let server;
let analyzer;

before(async () => {
  server = await createServer({
    root,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  });
  analyzer = await server.ssrLoadModule('/src/utils/analyzer.js');
});

after(async () => {
  await server?.close();
});

test('sonhos intensos não contam como pulso tenso', () => {
  const result = analyzer.analyze(
    {
      queixa: 'Ansiedade, insônia, palpitação, agitação e sonhos intensos.',
      historia: '',
      medicacoes: '',
    },
    {
      'sono:Sonhos intensos': true,
      'pulso:esquerdo:p9:Pulso rápido': true,
    },
  );

  const scores = Object.fromEntries(result.ranked);
  assert.equal(result.main, 'Agitação do Shen por Calor');
  assert.equal(scores['Ascensão do Yang do Fígado'], 0);
});

test('pulso tenso continua contando como evidência clínica', () => {
  const result = analyzer.analyze(
    { queixa: 'Paciente refere pulso tenso em avaliação.', historia: '', medicacoes: '' },
    { 'pulso:esquerdo:p8:Pulso tenso': true },
  );

  const scores = Object.fromEntries(result.ranked);
  assert.equal(result.main, 'Ascensão do Yang do Fígado');
  assert.equal(scores['Ascensão do Yang do Fígado'], 6);
});

test('sonhos intensos isolado não aumenta princípio de excesso', () => {
  const result = analyzer.principleAnalysis(
    { queixa: 'Sonhos intensos.', historia: '', medicacoes: '' },
    { 'sono:Sonhos intensos': true },
  );

  assert.equal(result.Excesso, 0);
});

test('pulso tenso aumenta princípio de excesso', () => {
  const result = analyzer.principleAnalysis(
    { queixa: 'Pulso tenso.', historia: '', medicacoes: '' },
    { 'pulso:esquerdo:p8:Pulso tenso': true },
  );

  assert.equal(result.Excesso, 1);
});

test('sonhos intensos não geram estagnação de Qi no perfil patogênico', () => {
  const profile = analyzer.diagnosticProfile(
    {
      queixa: 'Ansiedade, insônia, palpitação, agitação e sonhos intensos.',
      historia: '',
      medicacoes: '',
      agua: '1,5L/dia',
    },
    {
      'sono:Sonhos intensos': true,
      'pulso:esquerdo:p9:Pulso rápido': true,
    },
  );

  assert.equal(profile.main, 'Agitação do Shen por Calor');
  assert.ok(!profile.pathogenic.includes('Estagnação de Qi'));
});
