import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let server;
let analyzer;
let reasoning;

before(async () => {
  server = await createServer({
    root,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  });
  analyzer = await server.ssrLoadModule('/src/utils/analyzer.js');
  reasoning = await server.ssrLoadModule('/src/services/clinicalReasoningService.js');
});

after(async () => {
  await server?.close();
});

test('lacunas reprodutivas acompanham o sexo clínico sem pesar o diagnóstico', () => {
  const masculino = analyzer.diagnosticProfile({ sexo: 'Masculino' }, {});
  assert.ok(
    masculino.missing.includes('saúde urogenital, sexual e hormonal, se pertinente ao caso'),
    'atendimento masculino deve receber investigação urogenital quando não há registro',
  );
  assert.ok(
    !masculino.missing.some(item => item.includes('ciclo menstrual')),
    'atendimento masculino não pode receber lacuna menstrual',
  );

  const feminino = analyzer.diagnosticProfile({ sexo: 'Feminino' }, {});
  assert.ok(
    feminino.missing.includes('ciclo menstrual, saúde ginecológica e contexto hormonal, se pertinente ao caso'),
    'atendimento feminino deve receber investigação menstrual/ginecológica quando não há registro',
  );
  assert.ok(
    !feminino.missing.some(item => item.includes('urogenital')),
    'atendimento feminino não pode receber lacuna urogenital masculina',
  );

  const naoInformado = analyzer.diagnosticProfile({}, {});
  assert.ok(
    !naoInformado.missing.some(item => /menstrual|urogenital|hormonal/i.test(item)),
    'sem sexo clínico informado, o sistema não deve presumir investigação reprodutiva',
  );
});

test('registro urogenital encerra a lacuna e chega aos consumidores clínicos', () => {
  const selectedMap = { 'urogenital:Sem queixas urogenitais/sexuais': true };
  const state = { sexo: 'Masculino', queixa: '', historia: '', medicacoes: '' };
  const profile = analyzer.diagnosticProfile(state, selectedMap);

  assert.ok(
    !profile.missing.includes('saúde urogenital, sexual e hormonal, se pertinente ao caso'),
    'registro explícito deve encerrar a lacuna urogenital',
  );
  assert.ok(analyzer.getAllClinicalText(state, selectedMap).includes('Sem queixas urogenitais/sexuais'));
  assert.equal(profile.parts.symptoms, 4, 'grupo urogenital deve contar como evidência de sintoma');

  const clinicalCase = reasoning.buildClinicalCase(state, selectedMap, { primaryPercent: 0, graded: [] });
  assert.ok(clinicalCase.signals.sintomas.includes('Sem queixas urogenitais/sexuais'));
});
