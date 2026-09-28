import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

// Áreas próprias de Fisioterapia e Nutrição (25/09/2026): abas de
// avaliação além da anamnese, gravadas na MESMA sessão do registro da
// disciplina (sem record_type novo → sem migração). Conteúdo clínico é
// rascunho a validar pelas profissionais; estes testes protegem o
// contrato, os cálculos e os limites (sem conduta automática, sem
// reproduzir perguntas de escalas protegidas).

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = rel => readFile(path.join(root, 'src', rel), 'utf8');

let server;
let fisio;
let nutri;
let areas;
let route;
let kit;
let registry;

before(async () => {
  server = await createServer({
    root,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  });
  [fisio, nutri, areas, route, kit, registry] = await Promise.all([
    server.ssrLoadModule('/src/data/fisioterapiaAvaliacao.js'),
    server.ssrLoadModule('/src/data/nutricaoAvaliacao.js'),
    server.ssrLoadModule('/src/components/areas/disciplineAreas.js'),
    server.ssrLoadModule('/src/utils/formRoute.js'),
    server.ssrLoadModule('/src/data/anamneseKit.js'),
    server.ssrLoadModule('/src/data/anamneseRegistry.js'),
  ]);
});

after(async () => {
  await server?.close();
});

test('cada área tem as próprias abas, com chave de sessão que não colide com a anamnese', () => {
  const fisioArea = areas.getDisciplineArea('fisioterapia');
  const nutriArea = areas.getDisciplineArea('nutricao');
  assert.deepEqual(fisioArea.tabs.map(tab => tab.name), ['Exame físico', 'Escalas funcionais']);
  assert.deepEqual(nutriArea.tabs.map(tab => tab.name), ['Antropometria', 'Consumo alimentar', 'Exames']);

  for (const [id, area] of Object.entries(areas.DISCIPLINE_AREAS)) {
    const config = registry.getAnamneseConfig(id);
    const baseKeys = Object.keys(kit.createEmptySession(config));
    for (const tab of area.tabs) {
      assert.ok(!baseKeys.includes(tab.sessionKey), `${id}: ${tab.sessionKey} colide com a sessão da anamnese`);
      assert.equal(typeof tab.Component, 'function');
      assert.ok(Array.isArray(tab.route(undefined)), `${id}: roteiro de ${tab.name} aceita aba vazia`);
    }
    assert.match(area.notice, /rascunho/i, `${id}: aviso de validação profissional`);
  }
});

test('dado das abas mora na mesma sessão e sobrevive ao recarregar (sem record_type novo)', async () => {
  const config = registry.getAnamneseConfig('fisioterapia');
  const raw = {
    ...kit.createEmptySession(config),
    exameFisico: { dor: { repouso: '3' } },
    escalas: { itens: [{ scaleId: 'odi', score: '34' }] },
  };
  const loaded = kit.normalizeSession(config, JSON.parse(JSON.stringify(raw)));
  assert.equal(loaded.exameFisico.dor.repouso, '3');
  assert.equal(loaded.escalas.itens[0].score, '34');

  const workspace = await src('components/DisciplineWorkspace.jsx');
  assert.match(workspace, /setSession\(prev => \(\{ \.\.\.prev, \[key\]: value \}\)\)/, 'aba grava a própria chave na sessão');
  assert.match(workspace, /recordType: config\.recordType/, 'continua gravando no registro da disciplina');
  assert.match(workspace, /getDisciplineArea\(disciplineId\)/);
  assert.equal(registry.getAnamneseConfig('fisioterapia').recordType, 'fisio_anamnese');
  assert.equal(registry.getAnamneseConfig('nutricao').recordType, 'nutri_anamnese');
});

test('IMC e relação cintura-quadril: vírgula decimal, idade em texto e faixas por idade', () => {
  assert.equal(nutri.parseMeasure('72,5'), 72.5);
  assert.equal(nutri.parseMeasure(''), null);
  assert.equal(nutri.parseMeasure('abc'), null);
  assert.equal(nutri.computeBmi('70', '170'), 24.2);
  assert.equal(nutri.computeBmi('70', ''), null);
  assert.equal(nutri.computeWaistHipRatio('80', '100'), 0.8);

  // getPatientAge devolve texto: "34" precisa contar como idade conhecida.
  assert.deepEqual(nutri.classifyBmi(24.2, '34'), { label: 'eutrofia', reference: 'OMS (adultos)' });
  assert.equal(nutri.classifyBmi(31, '45').label, 'obesidade grau I');
  assert.equal(nutri.classifyBmi(17, '45').label, 'baixo peso');
  assert.deepEqual(nutri.classifyBmi(24.2, '70'), { label: 'eutrofia', reference: 'Lipschitz (idosos)' });
  assert.equal(nutri.classifyBmi(28, 70).label, 'sobrepeso');
  assert.equal(nutri.classifyBmi(21, '15').needsCurve, true, 'criança/adolescente usa curva por idade');
  assert.equal(nutri.classifyBmi(24.2, '').reference, 'OMS (adultos) — idade não informada');
});

test('roteiros das abas contam o que foi registrado', () => {
  const exame = route.buildFisioExameRoute({
    sinais: { pa: '120/80', fc: '72' },
    adm: [{ joint: 'ombro', movement: 'flexao', side: 'D', active: '150', passive: '' }, { joint: 'joelho', movement: 'flexao', side: 'E' }],
    testes: { Neer: { result: 'positivo', side: 'D' }, Jobe: { result: '' } },
  });
  const byId = id => route.findRouteItem(exame, id);
  assert.deepEqual([byId('fisio-sinais').done, byId('fisio-sinais').total], [2, 4]);
  assert.deepEqual([byId('fisio-adm').done, byId('fisio-adm').total], [1, 2]);
  assert.equal(byId('fisio-testes').hint, '1 teste registrado');

  const consumo = route.buildNutriConsumoRoute({ tipoDia: 'Fim de semana', refeicoes: { almoco: { alimentos: 'Arroz, feijão' } } });
  assert.deepEqual([route.findRouteItem(consumo, 'consumo-refeicoes').done, route.findRouteItem(consumo, 'consumo-refeicoes').total], [1, 6]);
  assert.equal(route.findRouteItem(consumo, 'consumo-dia').done, 1);

  const antro = route.buildNutriAntropometriaRoute(undefined);
  assert.equal(route.findRouteItem(antro, 'antro-medidas').hint, 'nenhuma medida registrada');
});

test('relatório: registro interno leva o exame; relatório externo leva só o essencial', () => {
  const session = {
    exameFisico: {
      dor: { repouso: '4' },
      adm: [{ joint: 'ombro', movement: 'flexao', side: 'D', active: '150', passive: '160', pain: true }],
      forca: [{ group: 'Flexores de ombro', side: 'D', grade: '4' }],
      testes: { Neer: { result: 'positivo', side: 'D' }, Jobe: { result: 'negativo' } },
      inspecao: 'Ombro direito elevado.',
    },
    escalas: { itens: [{ scaleId: 'odi', score: '34', date: '12/09/2026' }] },
  };
  const full = fisio.buildFisioReportSections(session, 'full');
  const fullText = JSON.stringify(full);
  assert.match(fullText, /Ombro — flexão — direito/);
  assert.match(fullText, /ativo 150°, passivo 160° \(ref\. 0–180°\); com dor/);
  assert.match(fullText, /grau 4 — vence alguma resistência/);
  assert.match(fullText, /Inspeção, postura e marcha/);
  assert.match(fullText, /Oswestry \(ODI\)/);
  assert.match(fullText, /34% — 12\/09\/2026/, 'porcentagem sem espaço, em pt-BR');

  const summary = fisio.buildFisioReportSections(session, 'summary');
  const summaryText = JSON.stringify(summary);
  assert.match(summaryText, /Testes especiais positivos/);
  assert.match(summaryText, /Neer \(direito\)/);
  assert.doesNotMatch(summaryText, /Inspeção|passivo|Jobe/, 'relatório externo não despeja o exame inteiro');

  const nutriSession = {
    antropometria: { medidas: [
      { date: '24/09/2026', peso: '70', altura: '170', cintura: '80', quadril: '100' },
      { date: '24/08/2026', peso: '72', altura: '170' },
    ] },
    consumo: { refeicoes: { almoco: { horario: '12:30', alimentos: 'Arroz, feijão e frango' } } },
    exames: { itens: [{ nome: 'Glicemia de jejum', valor: '92', unidade: 'mg/dL', data: '01/09/2026' }] },
  };
  const nutriFull = JSON.stringify(nutri.buildNutriReportSections(nutriSession, 'full', '34'));
  assert.match(nutriFull, /24,2 kg\/m² — eutrofia, referência OMS \(adultos\)/);
  assert.match(nutriFull, /Relação cintura-quadril/);
  assert.match(nutriFull, /-2,0 kg/);
  assert.match(nutriFull, /Almoço \(12:30\)/);
  assert.match(nutriFull, /Glicemia de jejum \(01\/09\/2026\)/);

  const nutriSummary = nutri.buildNutriReportSections(nutriSession, 'summary', '34');
  assert.equal(nutriSummary.length, 1, 'externo leva só a antropometria mais recente');
  assert.deepEqual(nutriSummary[0].rows.map(row => row.label), ['Peso', 'Altura', 'IMC']);
});

test('limites: escalas sem perguntas reproduzidas e Nutrição sem conduta automática', async () => {
  for (const scale of fisio.FUNCTIONAL_SCALES) {
    assert.deepEqual(Object.keys(scale).sort(), ['about', 'id', 'label', 'range', 'unit'], `${scale.id} só traz nome, faixa e unidade`);
  }
  const nutriSource = await src('data/nutricaoAvaliacao.js');
  assert.match(nutri.NUTRI_EVALUATION_NOTICE, /Nada aqui gera conduta ou plano alimentar/);
  assert.doesNotMatch(nutriSource, /export function (build|generate|suggest)\w*(Plano|Cardapio|Dieta|Prescri)/i);
  for (const tab of ['Antropometria', 'Consumo alimentar', 'Exames']) {
    assert.doesNotMatch(tab, /plano|card[aá]pio|dieta/i);
  }
});

test('abas novas têm ícone na lateral e atalho com andamento no Painel', async () => {
  const sidebar = await src('components/Sidebar.jsx');
  for (const tab of ['Exame físico', 'Escalas funcionais', 'Antropometria', 'Consumo alimentar', 'Exames']) {
    assert.match(sidebar, new RegExp(`'${tab}': \\(`), `ícone de ${tab}`);
  }
  const workspace = await src('components/DisciplineWorkspace.jsx');
  assert.match(workspace, /className="area-shortcuts"/);
  assert.match(workspace, /extraSections=\{area \? scope => area\.reportSections\(session, scope, patientAge\) : undefined\}/);
});

test('telas renderizam o roteiro e o cálculo de IMC', async () => {
  const [{ NutriAntropometria }, { FisioExameFisico }] = await Promise.all([
    server.ssrLoadModule('/src/components/areas/nutricao/NutriAntropometria.jsx'),
    server.ssrLoadModule('/src/components/areas/fisioterapia/FisioExameFisico.jsx'),
  ]);
  const antroHtml = renderToStaticMarkup(React.createElement(NutriAntropometria, {
    value: { medidas: [{ id: 'm1', date: '24/09/2026', peso: '70', altura: '170' }] },
    onChange: () => {},
    patientAge: '34',
  }));
  assert.match(antroHtml, /aria-label="Roteiro da ficha"/);
  assert.match(antroHtml, /24,2 kg\/m²/);
  assert.match(antroHtml, /eutrofia · OMS \(adultos\)/);

  const exameHtml = renderToStaticMarkup(React.createElement(FisioExameFisico, { value: undefined, onChange: () => {} }));
  assert.match(exameHtml, /id="form-sec-fisio-adm"/);
  assert.match(exameHtml, /Adicionar movimento/);
  assert.match(exameHtml, /Lachman/);
});

test('casca real da área mostra as abas próprias na lateral', async () => {
  const [{ DisciplineWorkspace }, { PatientProvider }] = await Promise.all([
    server.ssrLoadModule('/src/components/DisciplineWorkspace.jsx'),
    server.ssrLoadModule('/src/hooks/PatientContext.jsx'),
  ]);
  const render = disciplineId => renderToStaticMarkup(React.createElement(PatientProvider, null,
    React.createElement(DisciplineWorkspace, { disciplineId, profile: { role: 'professional' }, therapistName: 'Teste' })));
  const fisioHtml = render('fisioterapia');
  for (const tab of ['Exame físico', 'Escalas funcionais']) assert.match(fisioHtml, new RegExp(`>${tab}<`));
  const nutriHtml = render('nutricao');
  for (const tab of ['Antropometria', 'Consumo alimentar', 'Exames']) assert.match(nutriHtml, new RegExp(`>${tab}<`));
  assert.doesNotMatch(fisioHtml, />Antropometria</, 'abas de uma área não vazam para a outra');
});
