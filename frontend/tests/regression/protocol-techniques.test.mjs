import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let server;
let protocolEngine;

before(async () => {
  server = await createServer({
    root,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  });
  protocolEngine = await server.ssrLoadModule('/src/knowledge/protocolEngine.js');
});

after(async () => {
  await server?.close();
});

test('moxa fica indicada em padrão de Yang/frio com pontos do protocolo', () => {
  const { buildMoxaTechniquePlan, getProtocolForPattern } = protocolEngine;
  const protocol = getProtocolForPattern('Deficiência de Yang do Rim');
  const plan = buildMoxaTechniquePlan({ protocol, patternName: 'Deficiência de Yang do Rim' });

  assert.equal(plan.status, 'indicado');
  assert.ok(plan.points.includes('CV4'));
  assert.match(plan.summary, /frio|deficiência|Yang/i);
});

test('moxa é bloqueada como padrão automático em Umidade-Calor', () => {
  const { buildMoxaTechniquePlan, getProtocolForPattern } = protocolEngine;
  const protocol = getProtocolForPattern('Umidade-Calor');
  const plan = buildMoxaTechniquePlan({ protocol, patternName: 'Umidade-Calor' });

  assert.equal(plan.status, 'evitar');
  assert.match(plan.summary, /calor|contraindicação|revisar/i);
  assert.ok(plan.cautions.some(item => /calor|febre|inflamação/i.test(item)));
});

test('laser mantém parâmetros abertos e sobe cautela em sinais de segurança', () => {
  const { buildLaserTechniquePlan, getProtocolForPattern } = protocolEngine;
  const protocol = getProtocolForPattern('Deficiência de Yang do Rim');
  const plan = buildLaserTechniquePlan({
    protocol,
    patternName: 'Deficiência de Yang do Rim',
    clinicalText: 'Paciente relata fotossensibilidade medicamentosa.',
  });

  assert.equal(plan.status, 'cautela');
  assert.ok(plan.parameters.some(item => item.label === 'Comprimento de onda'));
  assert.ok(plan.parameters.some(item => item.label === 'Energia por ponto'));
  assert.ok(plan.checklist.some(item => /proteção ocular|olhos/i.test(item)));
  assert.ok(plan.checklist.some(item => /fotossensibilidade/i.test(item)));
});
