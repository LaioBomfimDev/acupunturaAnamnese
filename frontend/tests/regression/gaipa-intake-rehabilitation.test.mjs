import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

import { checklists } from '../../src/data/checklists.js';
import {
  buildRehabilitationAssessment,
  createEmptyRehabilitationAssessment,
  normalizeRehabilitationState,
  summarizeRehabilitation,
} from '../../src/services/rehabilitationService.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function buildAssessment(overrides, sequence) {
  const { assessment } = buildRehabilitationAssessment(
    { ...createEmptyRehabilitationAssessment(), ...overrides },
    sequence,
  );
  return assessment;
}

let server;
let rehabilitationPanel;
let reportPanel;
let evolutionPanel;
let safetyEngine;

before(async () => {
  server = await createServer({
    root,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  });
  rehabilitationPanel = await server.ssrLoadModule('/src/components/panels/Reabilitacao.jsx');
  reportPanel = await server.ssrLoadModule('/src/components/panels/Relatorio.jsx');
  evolutionPanel = await server.ssrLoadModule('/src/components/panels/Evolucao.jsx');
  safetyEngine = await server.ssrLoadModule('/src/knowledge/safetyEngine.js');
});

after(async () => {
  await server?.close();
});

test('triagem inclui os novos sinais de alerta GAIPA', () => {
  const expected = [
    'Perda de peso não intencional',
    'Desmaio recente',
    'Queda recente',
    'Trauma recente',
    'Distúrbio de coagulação',
    'Histórico de câncer',
    'Cirurgia recente',
  ];

  for (const item of expected) {
    assert.ok(checklists.seguranca.includes(item), `${item} deve estar no checklist de segurança`);
  }

  assert.deepEqual(checklists.dorRegioes, [
    'Pescoço', 'Ombros', 'Parte superior das costas', 'Cotovelos', 'Punhos/mãos',
    'Parte inferior das costas', 'Quadril/coxas', 'Joelhos', 'Tornozelos/pés',
  ]);
});

test('novos sinais geram alertas clínicos sem produzir diagnóstico', () => {
  const { evaluateSafety } = safetyEngine;
  const safetyAlerts = evaluateSafety({
    safetyFlags: [
      'Perda de peso não intencional',
      'Desmaio recente',
      'Queda recente',
      'Distúrbio de coagulação',
      'Histórico de câncer',
      'Cirurgia recente',
    ],
  });
  const ids = safetyAlerts.map(alert => alert.ruleId);

  assert.deepEqual(ids, [
    'coagulation-risk',
    'unintended-weight-loss',
    'recent-fainting',
    'recent-trauma',
    'recent-surgery',
    'cancer-history',
  ]);
  assert.match(
    safetyAlerts.find(alert => alert.ruleId === 'cancer-history').message,
    /não define diagnóstico/i,
  );
});

test('módulo de reabilitação começa desativado e só aceita medidas válidas', () => {
  assert.deepEqual(normalizeRehabilitationState(), { ativa: false, avaliacoes: [] });

  const invalid = buildRehabilitationAssessment({
    ...createEmptyRehabilitationAssessment(),
    dorRepouso: '11',
  });
  assert.equal(invalid.assessment, null);
  assert.match(invalid.validation.errors.dorRepouso, /0 e 10/);

  const valid = buildRehabilitationAssessment({
    ...createEmptyRehabilitationAssessment(),
    data: '19/06/2026',
    dorRepouso: '3,5',
    tugSegundos: '12.4',
    objetivoFuncional: 'Caminhar até o mercado sem pausa.',
  }, 2);

  assert.equal(valid.validation.ok, true);
  assert.deepEqual(valid.assessment, {
    avaliacao: 2,
    data: '19/06/2026',
    objetivoFuncional: 'Caminhar até o mercado sem pausa.',
    amplitudeMovimento: '',
    observacoes: '',
    dorRepouso: 3.5,
    dorMovimento: null,
    mudancaGlobal: null,
    tugSegundos: 12.4,
    sentarLevantar5xSegundos: null,
    equilibrioDireitoSegundos: null,
    equilibrioEsquerdoSegundos: null,
    dedosSoloCm: null,
  });
});

test('painel mantém reabilitação opcional e não inclui questionários licenciados', () => {
  const { Reabilitacao } = rehabilitationPanel;
  const inactiveHtml = renderToStaticMarkup(React.createElement(Reabilitacao, {
    state: {},
    onUpdate: () => {},
  }));
  assert.match(inactiveHtml, /Avaliação não ativada/);
  assert.match(inactiveHtml, /Ativar avaliação de reabilitação/);
  assert.doesNotMatch(inactiveHtml, /Nova avaliação funcional/);

  const activeHtml = renderToStaticMarkup(React.createElement(Reabilitacao, {
    state: { reabilitacao: { ativa: true, avaliacoes: [] } },
    onUpdate: () => {},
  }));
  assert.match(activeHtml, /TUG/);
  assert.match(activeHtml, /Mudança percebida global/);
  assert.doesNotMatch(activeHtml, /SF-12|WHOQOL|QuickDASH|LEFS|RMDQ|DASS-21|PSQI/);
});

test('summarizeRehabilitation só resume quando ativo e reporta variação bruta', () => {
  const primeira = buildAssessment({ data: '01/06/2026', dorRepouso: '6', tugSegundos: '18' }, 1);
  const segunda = buildAssessment({ data: '19/06/2026', dorRepouso: '3', tugSegundos: '12', objetivoFuncional: 'Subir escada sem apoio.' }, 2);

  assert.equal(summarizeRehabilitation(), null);
  assert.equal(summarizeRehabilitation({ ativa: false, avaliacoes: [primeira] }), null);
  assert.equal(summarizeRehabilitation({ ativa: true, avaliacoes: [] }), null);

  const resumo = summarizeRehabilitation({ ativa: true, avaliacoes: [primeira, segunda] });
  assert.equal(resumo.total, 2);
  assert.equal(resumo.primeira.data, '01/06/2026');
  assert.equal(resumo.ultima.data, '19/06/2026');
  assert.equal(resumo.objetivoFuncional, 'Subir escada sem apoio.');

  const dor = resumo.metricas.find(m => m.field === 'dorRepouso');
  assert.deepEqual({ primeiro: dor.primeiro, ultimo: dor.ultimo, delta: dor.delta }, { primeiro: 6, ultimo: 3, delta: -3 });
  const tug = resumo.metricas.find(m => m.field === 'tugSegundos');
  assert.deepEqual({ ultimo: tug.ultimo, delta: tug.delta, suffix: tug.suffix }, { ultimo: 12, delta: -6, suffix: ' s' });

  // Uma única avaliação: sem par para comparar, apenas o valor atual.
  const unico = summarizeRehabilitation({ ativa: true, avaliacoes: [primeira] });
  assert.equal(unico.total, 1);
  assert.equal(unico.metricas.find(m => m.field === 'dorRepouso').ultimo, 6);
});

test('relatório mostra a reabilitação só quando há avaliação ativa', () => {
  const { Relatorio } = reportPanel;
  const analysis = { main: '', detail: {}, protocol: {}, safety: [], safetyAlerts: [] };
  const avaliacoes = [
    buildAssessment({ data: '01/06/2026', dorRepouso: '6' }, 1),
    buildAssessment({ data: '19/06/2026', dorRepouso: '3' }, 2),
  ];

  const comReab = renderToStaticMarkup(React.createElement(Relatorio, {
    state: { evolucoes: [], reabilitacao: { ativa: true, avaliacoes } },
    analysis,
    onUpdate: () => {},
  }));
  assert.match(comReab, /Reabilitação funcional/);
  assert.match(comReab, /2 avaliação/);

  const semReab = renderToStaticMarkup(React.createElement(Relatorio, {
    state: { evolucoes: [], reabilitacao: { ativa: false, avaliacoes: [] } },
    analysis,
    onUpdate: () => {},
  }));
  assert.doesNotMatch(semReab, /Reabilitação funcional/);
});
