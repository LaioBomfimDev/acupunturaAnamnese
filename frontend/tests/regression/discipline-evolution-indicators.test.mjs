import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

// Evolução de Fisioterapia e Nutrição (25/09/2026). Dois buracos:
//  * o relatório imprimia cada sessão como um bloco de texto corrido,
//    sem o rótulo dos campos e SEM os indicadores (EVA, força, peso…);
//  * indicador aceitava qualquer coisa ("Força (0-5)" gravava 9 ou texto),
//    no formulário e no "Corrigir" da linha do tempo.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = rel => readFile(path.join(root, 'src', rel), 'utf8');

let server;
let kit;
let registry;
let relatorio;

before(async () => {
  server = await createServer({
    root,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  });
  [kit, registry, relatorio] = await Promise.all([
    server.ssrLoadModule('/src/data/anamneseKit.js'),
    server.ssrLoadModule('/src/data/anamneseRegistry.js'),
    server.ssrLoadModule('/src/components/anamnese/DisciplineRelatorio.jsx'),
  ]);
});

after(async () => {
  await server?.close();
});

test('todo indicador de evolução genérico tem faixa de digitação definida', () => {
  for (const id of registry.GENERIC_ANAMNESE_DISCIPLINES) {
    const config = registry.getAnamneseConfig(id);
    for (const indicator of config.evolution.indicators) {
      assert.ok(Number.isFinite(indicator.min), `${id}.${indicator.id} sem min`);
      assert.ok(Number.isFinite(indicator.max), `${id}.${indicator.id} sem max`);
      assert.ok(indicator.max > indicator.min, `${id}.${indicator.id} com faixa invertida`);
    }
  }
});

test('indicador válido passa: inteiro, vírgula decimal, grau com +/- e vazio', () => {
  const fisio = registry.getAnamneseConfig('fisioterapia');
  const nutri = registry.getAnamneseConfig('nutricao');
  assert.equal(kit.validateEvolutionIndicators(fisio, { eva: '7', forca: '4+', amplitude: '85', percepcaoMelhora: '' }), null);
  assert.equal(kit.validateEvolutionIndicators(fisio, { forca: '3-' }), null);
  assert.equal(kit.validateEvolutionIndicators(fisio, { eva: ' 0 ' }), null);
  assert.equal(kit.validateEvolutionIndicators(nutri, { peso: '72,5', cintura: '88.5', adesao: '10', sintomas: '0' }), null);
  assert.equal(kit.validateEvolutionIndicators(nutri, {}), null);
});

test('indicador fora da faixa ou não numérico é barrado com mensagem que nomeia o campo', () => {
  const fisio = registry.getAnamneseConfig('fisioterapia');
  const nutri = registry.getAnamneseConfig('nutricao');
  const cases = [
    [fisio, { eva: '11' }, /^Dor \(EVA 0-10\): use um número de 0 a 10\.$/],
    [fisio, { forca: '9' }, /^Força \(0-5\):.*0 a 5.*4\+/],
    [fisio, { forca: '5+' }, /^Força \(0-5\)/],
    [fisio, { forca: '0-' }, /^Força \(0-5\)/],
    [fisio, { eva: '-1' }, /^Dor \(EVA 0-10\)/],
    [fisio, { eva: '7+' }, /^Dor \(EVA 0-10\)/], // +/- só onde a escala é graduada
    [fisio, { percepcaoMelhora: 'melhorou' }, /^Percepção de melhora/],
    [nutri, { peso: '725' }, /^Peso \(kg\): use um número de 0 a 400\.$/],
    [nutri, { peso: '72,5kg' }, /^Peso \(kg\)/],
    [nutri, { cintura: '1.2.3' }, /^Cintura \(cm\)/],
  ];
  for (const [config, form, expected] of cases) {
    const error = kit.validateEvolutionIndicators(config, form);
    assert.match(error || '', expected, JSON.stringify(form));
  }
});

test('formulário de evolução e "Corrigir" da linha do tempo validam os indicadores antes de gravar', async () => {
  const form = await src('components/anamnese/DisciplineEvolucao.jsx');
  const validateAt = form.indexOf('validateEvolutionIndicators(config, form)');
  assert.ok(validateAt > 0, 'DisciplineEvolucao não valida indicadores');
  assert.ok(validateAt < form.indexOf('await insertPatientEvolution('), 'validação precisa vir antes do insert');

  const timeline = await src('components/PatientEvolutionTimeline.jsx');
  const saveEdit = timeline.slice(timeline.indexOf('async function saveEdit('));
  const timelineValidateAt = saveEdit.indexOf('validateEvolutionIndicators(config, editForm)');
  assert.ok(timelineValidateAt > 0, 'Corrigir da linha do tempo não valida indicadores');
  assert.ok(timelineValidateAt < saveEdit.indexOf('await updatePatientEvolution('), 'validação precisa vir antes do update');
});

test('relatório imprime indicadores e campos da evolução com o rótulo de cada um', () => {
  const config = registry.getAnamneseConfig('fisioterapia');
  const html = renderToStaticMarkup(React.createElement(relatorio.DisciplineRelatorio, {
    config,
    session: kit.createEmptySession(config),
    evolucoes: [
      { id: 'a', sessao: 1, data: '10/09/2026', eva: '7', forca: '4+', conduta: 'Cinesioterapia de quadril', respostaImediata: 'Tolerou bem' },
      { id: 'b', sessao: 2, data: '17/09/2026', attendanceStatus: 'no_show', observacao: 'Avisou depois.' },
      { id: 'c', sessao: 3, data: '24/09/2026' },
    ],
    selectedPatient: { nome: 'Paciente Teste' },
    therapistProfile: { full_name: 'Profissional Teste' },
    onRelatorioChange: () => {},
  }));

  assert.match(html, /Sessão 1 — 10\/09\/2026/);
  assert.match(html, /<b>Indicadores:<\/b> Dor \(EVA 0-10\): 7; Força \(0-5\): 4\+/);
  assert.match(html, /<b>Conduta realizada nesta sessão:<\/b> Cinesioterapia de quadril/);
  assert.match(html, /<b>Resposta imediata:<\/b> Tolerou bem/);
  assert.match(html, /<b>Presença:<\/b> faltou\. Avisou depois\./);
  assert.match(html, /Sessão 3 — 24\/09\/2026<\/p><p[^>]*>Sem descrição registrada\./);
  // Campo vazio não vira linha "rótulo: " sem conteúdo.
  assert.doesNotMatch(html, /Intercorrências:/);
});
