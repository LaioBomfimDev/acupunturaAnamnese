import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

// Janela do resultado de uma escala (10/10/2026, pedido da
// administradora): nota na cor da tela, régua das faixas do instrumento
// marcando onde a nota caiu, ícones de quando/de onde/quem mandou e os
// pontos de cada resposta em bolinhas. Cor só nos elementos principais;
// vermelho só no risco.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let server;
let instruments;
let scoring;
let Dialog;
let BandMeter;
let format;

before(async () => {
  server = await createServer({
    root,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  });
  instruments = await server.ssrLoadModule('/src/data/clinicalInstruments.js');
  scoring = await server.ssrLoadModule('/src/utils/instrumentScoring.js');
  format = await server.ssrLoadModule('/src/components/instruments/instrumentFormat.js');
  ({ InstrumentApplicationDialog: Dialog, BandMeter } = await server.ssrLoadModule('/src/components/instruments/InstrumentApplicationDialog.jsx'));
});

after(async () => {
  await server?.close();
});

function application(instrument, answers, extra = {}) {
  const payload = scoring.buildApplicationPayload(instrument, answers);
  return {
    id: 'a1',
    appliedAt: '2026-10-09T14:17:10Z',
    appliedByName: 'Karen Karoline Santos',
    source: 'area_do_paciente',
    answers: payload.answers,
    result: payload.result,
    ...extra,
  };
}

function render(instrument, app) {
  return renderToStaticMarkup(React.createElement(Dialog, { application: app, instrument, canVoid: false, onClose: () => {} }));
}

test('PHQ-9 respondido em casa: nota de 27, faixa marcada na régua, de onde veio e quem mandou', () => {
  const phq = instruments.PHQ9;
  // 1,1,1,2,2,3,2,1,1 = 14 (Moderada, 10 a 14), com risco no item 9.
  const values = [1, 1, 1, 2, 2, 3, 2, 1, 1];
  const answers = Object.fromEntries(phq.items.map((item, index) => [item.id, values[index]]));
  const html = render(phq, application(phq, answers));

  assert.match(html, /class="instrument-score-value">14</);
  assert.match(html, /pontos de 27/);
  assert.match(html, /class="instrument-band-chip">Moderada</);
  assert.match(html, /role="img" aria-label="14 pontos de 27, faixa Moderada \(10 a 14 pontos\)"/);
  assert.equal((html.match(/instrument-meter-band is-active/g) || []).length, 1, 'uma faixa marcada');
  assert.equal((html.match(/class="instrument-meter-band/g) || []).length, phq.bands.length);
  assert.match(html, /Faixa <b>Moderada<\/b>: 10 a 14 pontos\./);

  assert.match(html, /Respondida pelo paciente na Área do Paciente/);
  assert.match(html, /Enviada por Karen Karoline Santos/);
  assert.doesNotMatch(html, /Aplicada por/);

  // Risco em vermelho (.alert.instrument-risk), com ícone, e nada além dele.
  assert.match(html, /class="alert instrument-risk instrument-dialog-alert"/);

  // Pontos em bolinhas: 3 por pergunta (0 a 3), marcadas = pontos dados.
  assert.equal((html.match(/class="instrument-dot(?: is-on)?"/g) || []).length, phq.items.length * 3);
  assert.equal((html.match(/instrument-dot is-on/g) || []).length, 14);
  assert.match(html, /Soma das 9 perguntas: 14 pontos\./);
  assert.match(html, /9 perguntas<\/span>/);
});

test('aplicada no consultório: diz quem aplicou e não fala em envio', () => {
  const gad = instruments.GAD7;
  const answers = Object.fromEntries(gad.items.map(item => [item.id, 0]));
  const html = render(gad, application(gad, answers, { source: 'consultorio', appliedByName: 'Denise N.' }));
  assert.match(html, /Aplicada por Denise N\./);
  assert.doesNotMatch(html, /Enviada por|Área do Paciente/);
  assert.match(html, /aria-label="0 pontos de 21, faixa Mínima/);
  assert.equal((html.match(/instrument-dot is-on/g) || []).length, 0);
});

test('DASS-21: um cartão por subescala, cada um com a própria régua', () => {
  const dass = instruments.DASS21;
  const answers = Object.fromEntries(dass.items.map(item => [item.id, 1]));
  const html = render(dass, application(dass, answers, { source: 'consultorio', appliedByName: 'Denise N.' }));
  for (const label of ['Depressão', 'Ansiedade', 'Estresse']) assert.match(html, new RegExp(`>${label}<`));
  assert.equal((html.match(/class="instrument-score-card"/g) || []).length, 3);
  assert.equal((html.match(/class="instrument-meter-track"/g) || []).length, 3);
  assert.equal((html.match(/instrument-meter-band is-active/g) || []).length, 3);
  assert.match(html, /multiplica por 2, como no manual/);
});

test('régua: marcador dentro da escala e sem nota não marca faixa nenhuma', () => {
  const [view] = format.scoreViews(instruments.PHQ9);
  const top = renderToStaticMarkup(React.createElement(BandMeter, { view, score: 27, bandLabel: 'Grave' }));
  assert.match(top, /left:100%/);
  const empty = renderToStaticMarkup(React.createElement(BandMeter, { view, score: null, bandLabel: null }));
  assert.doesNotMatch(empty, /is-active|instrument-meter-marker/);
  assert.match(empty, /Escala de 0 a 27 pontos/);
});

test('CSS da janela: cor da tela só por token, sem cor fixa', async () => {
  const css = (await readFile(path.join(root, 'src/styles/instruments.css'), 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '');
  for (const rule of ['.instrument-score-value', '.instrument-meter-band.is-active', '.instrument-dot.is-on', '.instrument-answer-number']) {
    const start = css.indexOf(`${rule} {`);
    assert.ok(start >= 0, rule);
    const body = css.slice(start, css.indexOf('}', start));
    assert.match(body, /var\(--r1-accent(-strong|-wash)?\)/, `${rule} usa a cor da tela`);
  }
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/);
});

test('PHQ-4: duas notas sem "multiplica por 1" e a sigla maiúscula no rótulo', () => {
  const phq4 = instruments.PHQ4;
  const html = render(phq4, application(phq4, { q1: 2, q2: 1, q3: 0, q4: 2 }, { source: 'consultorio', appliedByName: 'Denise N.' }));
  assert.equal((html.match(/class="instrument-score-card"/g) || []).length, 2);
  assert.match(html, /aria-label="Nota de ansiedade \(GAD-2\)"/);
  assert.match(html, /Cada nota soma as 2 perguntas da subescala\./);
  assert.doesNotMatch(html, /multiplica por 1/);
});

test('Rosenberg: sem faixa clínica, a janela diz isso e não desenha régua', () => {
  const ros = instruments.ROSENBERG;
  const answers = Object.fromEntries(ros.items.map(item => [item.id, item.options[0].value]));
  const html = render(ros, application(ros, answers, { source: 'consultorio', appliedByName: 'Denise N.' }));
  assert.match(html, />Sem faixas clínicas</);
  assert.doesNotMatch(html, /instrument-meter-track/);
  assert.match(html, /Soma das 10 perguntas: 15 pontos\./);
});

test('Autocompaixão: total e as seis subescalas, nota com vírgula e a frase de como foi calculada', () => {
  const scs = instruments.SCS;
  const answers = { ...Object.fromEntries(scs.items.map(item => [item.id, 3])), q5: 4, q12: 4, q19: 4, q23: 4, q26: 3 };
  const html = render(scs, application(scs, answers, { source: 'consultorio', appliedByName: 'Denise N.' }));
  assert.equal((html.match(/class="instrument-score-card"/g) || []).length, 7);
  assert.match(html, /aria-label="Nota de total"/);
  assert.match(html, /class="instrument-score-value">3,13</);
  assert.match(html, /class="instrument-score-value">3,8</);
  assert.equal((html.match(/class="instrument-meter-track"/g) || []).length, 1, 'só o total tem régua');
  assert.equal((html.match(/>Sem faixas clínicas</g) || []).length, 6);
  assert.match(html, /Cada subescala é a média das suas perguntas\. O total é a média das subescalas, com as negativas invertidas\./);
  assert.doesNotMatch(html, /3\.13|Soma das/);
});
