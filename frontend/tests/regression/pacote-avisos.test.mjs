// ============================================================
// Avisos de pacote (11/11/2026, pedido da administradora: "tem que
// sempre checar com a administradora"). O que estes testes guardam:
// - sessão feita é a cobrança do pacote que vale: falta e anulada não
//   gastam sessão, e cobrança que não é de atendimento também não;
// - dois estados separados: "na última prevista" e "passou do previsto",
//   com quantas a mais e se elas saem R$ 0 ou cobradas como avulsas;
// - pacote encerrado e anulado ficam de fora, e o que está no meio não
//   vira aviso (sem barulho);
// - NÃO existe aviso de "pacote parado": o paciente usa quando quiser;
// - a tela de Pacotes, o Resumo e a assistente usam a MESMA conta.
// ============================================================

import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { packageUsage, packagesNeedingAttention } from '../../src/utils/finance.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => readFile(path.join(root, file), 'utf8');

const pkg = (id, planned, extra = {}) => ({ id, status: 'active', sessions_planned: planned, over_plan: 'free', ...extra });
const sessions = (id, count) => Array.from({ length: count }, () => ({ package_id: id, source: 'appointment' }));

test('sessão feita é só a cobrança do pacote que vale', () => {
  const packages = [pkg('p', 4)];
  const charges = [
    ...sessions('p', 2),
    { package_id: 'p', source: 'appointment', voided_at: '2026-11-01' },
    { package_id: 'p', source: 'package' },
    { package_id: 'outro', source: 'appointment' },
    { package_id: null, source: 'appointment' },
  ];
  const [row] = packageUsage({ packages, charges });
  assert.equal(row.done, 2, 'anulada, cobrança do próprio pacote e de outro não contam');
  assert.equal(row.left, 2);
  assert.equal(row.state, null, 'no meio do pacote não vira aviso');
});

test('os dois estados: última prevista e passou do previsto', () => {
  const packages = [
    pkg('ultima', 10),
    pkg('acabou', 4),
    pkg('passou', 4),
    pkg('passou-cobra', 4, { over_plan: 'single' }),
    pkg('meio', 10),
  ];
  const charges = [
    ...sessions('ultima', 9),
    ...sessions('acabou', 4),
    ...sessions('passou', 6),
    ...sessions('passou-cobra', 5),
    ...sessions('meio', 3),
  ];
  const byId = new Map(packageUsage({ packages, charges }).map(row => [row.pkg.id, row]));

  assert.deepEqual([byId.get('ultima').state, byId.get('ultima').left], ['ending', 1]);
  assert.deepEqual([byId.get('acabou').state, byId.get('acabou').left], ['ending', 0]);
  assert.deepEqual([byId.get('passou').state, byId.get('passou').extra, byId.get('passou').extraFree], ['over', 2, true]);
  assert.deepEqual([byId.get('passou-cobra').state, byId.get('passou-cobra').extraFree], ['over', false]);
  assert.equal(byId.get('meio').state, null);

  // Quem passou do previsto vem antes: é o que mexe com dinheiro.
  assert.deepEqual(packagesNeedingAttention({ packages, charges }).map(row => row.pkg.id),
    ['passou', 'passou-cobra', 'acabou', 'ultima']);
});

test('pacote encerrado, anulado ou sem sessão nenhuma não vira aviso', () => {
  const packages = [
    pkg('fechado', 4, { status: 'completed' }),
    pkg('anulado', 4, { status: 'voided' }),
    pkg('novo', 4),
  ];
  const charges = [...sessions('fechado', 4), ...sessions('anulado', 9)];
  assert.deepEqual(packageUsage({ packages, charges }).map(row => row.pkg.id), ['novo'], 'só o ativo entra na conta');
  assert.deepEqual(packagesNeedingAttention({ packages, charges }), []);
  assert.deepEqual(packagesNeedingAttention({}), [], 'sem dados, nenhum aviso');
});

test('pacote de 1 sessão ainda não usada já conta como última', () => {
  const rows = packagesNeedingAttention({ packages: [pkg('unica', 1)], charges: [] });
  assert.deepEqual(rows.map(row => [row.state, row.left, row.done]), [['ending', 1, 0]]);
});

test('a tela de Pacotes, o Resumo e a assistente usam a mesma conta', async () => {
  const entradas = await read('src/components/financeiro/FinanceEntradas.jsx');
  assert.match(entradas, /packageUsage\(fin\.data\)/, 'a tela conta uma vez e passa ao cartão');
  assert.match(entradas, /usage=\{usageById\.get\(pkg\.id\)/);
  assert.match(entradas, /pacotes pedem atenção/);
  assert.match(entradas, /Passou do previsto: \$\{extra\}, sem cobrar nada/);
  assert.match(entradas, /cobrada como avulsa pela tabela da área/);
  // O cartão não reconta sessões por fora.
  assert.doesNotMatch(entradas, /charges\.filter\(row => row\.source === 'appointment'\)/);

  const screen = await read('src/components/financeiro/FinanceiroScreen.jsx');
  assert.match(screen, /packageAttention: packagesNeedingAttention\(data\)/);
  assert.match(screen, /derived\.packageAttention\.length \? ' \· '|pede atenção/);

  const assistant = await read('src/utils/clinicAssistant.js');
  assert.match(assistant, /export function packagesNearEnd\(input\) \{\s*return packagesNeedingAttention\(input\);/);
  assert.match(assistant, /text: 'na última sessão prevista'/);
  assert.match(assistant, /text: 'com sessão além do previsto'/);
});

test('nada de aviso por tempo parado: o paciente usa quando quiser', async () => {
  const finance = await read('src/utils/finance.js');
  const block = finance.slice(finance.indexOf('export function packageUsage'), finance.indexOf('export function packagesNeedingAttention'));
  for (const bad of [/daysBetween/, /sold_on/, /last_session/, /parado/i]) {
    assert.doesNotMatch(block, bad, 'o aviso não olha data nenhuma');
  }
  const entradas = await read('src/components/financeiro/FinanceEntradas.jsx');
  assert.match(entradas, /o paciente usa quando quiser, sem prazo/, 'a tela diz isso');
});
