import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  FOOD_CATALOG,
  FOOD_ENERGIES,
  FOOD_FLAVORS,
  FOOD_ORGANS,
  describeFoodTradition,
  getFoodsByAxis,
  getFoodsByEnergy,
  getFoodsByFlavor,
  getFoodsByOrgan,
  summarizeFoodCatalog,
} from '../../src/knowledge/foodDietoterapia.js';

test('todo alimento tem id único, campos coerentes e página de fonte', () => {
  assert.ok(FOOD_CATALOG.length >= 100, 'catálogo menor que o esperado da fonte');
  const ids = new Set();
  for (const food of FOOD_CATALOG) {
    assert.ok(food.id && !ids.has(food.id), `id ausente ou duplicado: ${food.id}`);
    ids.add(food.id);
    // Energia e sabor são opcionais: o livro às vezes omite (ex.: Timo, Limão).
    // Quando presentes, precisam ser chaves válidas dos enums.
    if (food.energy != null) {
      assert.ok(FOOD_ENERGIES[food.energy], `${food.id}: energia inválida ${food.energy}`);
    }
    for (const flavor of food.flavors || []) {
      assert.ok(FOOD_FLAVORS[flavor], `${food.id}: sabor inválido ${flavor}`);
    }
    for (const organ of food.organs || []) {
      assert.ok(FOOD_ORGANS[organ], `${food.id}: sistema funcional inválido ${organ}`);
    }
    assert.ok((food.sourcePages || []).length >= 1, `${food.id}: sem página de fonte`);
  }
});

test('conteúdo rico da fonte está presente (indicações/aplicações)', () => {
  const comAplicacoes = FOOD_CATALOG.filter(f => (f.aplicacoes || []).length > 0);
  assert.ok(comAplicacoes.length >= 100, 'poucas monografias com aplicações');
  const mamao = FOOD_CATALOG.find(f => f.id === 'mamao');
  assert.ok(mamao, 'mamão ausente do catálogo');
  assert.ok(mamao.indications && mamao.aplicacoes.length >= 1, 'mamão sem conteúdo rico');
});

test('a frase educativa é segura: sem prescrição, com rótulo educativo', () => {
  const food = FOOD_CATALOG.find(f => f.id === 'gengibre-fresco');
  const text = describeFoodTradition(food);
  assert.match(text, /educativo/i);
  assert.match(text, /não é indicação|não é prescrição|plano alimentar/i);
  // Não deve conter linguagem de cura/tratamento nem dose.
  assert.doesNotMatch(text, /\bcura\b|\btrate\b|\bdose\b|\bmg\b/i);
});

test('filtros por energia, órgão e eixo retornam apenas itens coerentes', () => {
  for (const food of getFoodsByEnergy('quente')) assert.equal(food.energy, 'quente');
  for (const food of getFoodsByOrgan('baco')) assert.ok(food.organs.includes('baco'));

  const aquecer = getFoodsByAxis('aquecer');
  assert.ok(aquecer.length > 0);
  for (const food of aquecer) assert.ok(['morna', 'quente'].includes(food.energy));

  const refrescar = getFoodsByAxis('refrescar');
  for (const food of refrescar) assert.ok(['fria', 'fresca'].includes(food.energy));
});

test('cruzamento por propriedade (tags clicáveis) sempre inclui o próprio alimento', () => {
  // Cada tag de sabor/órgão/energia vira um botão que abre a lista de alimentos
  // que compartilham a propriedade. A lista nunca pode vir vazia para um item
  // visível: no mínimo ele próprio precisa aparecer.
  for (const food of getFoodsByFlavor('pungente')) assert.ok(food.flavors.includes('pungente'));

  const amostra = FOOD_CATALOG.filter(f => f.energy && f.flavors.length && f.organs.length).slice(0, 40);
  assert.ok(amostra.length > 0, 'sem alimentos com as três propriedades para amostrar');
  for (const food of amostra) {
    assert.ok(getFoodsByEnergy(food.energy).some(f => f.id === food.id), `${food.id}: fora do cruzamento de energia`);
    for (const flavor of food.flavors) {
      assert.ok(getFoodsByFlavor(flavor).some(f => f.id === food.id), `${food.id}: fora do cruzamento de sabor ${flavor}`);
    }
    for (const organ of food.organs) {
      assert.ok(getFoodsByOrgan(organ).some(f => f.id === food.id), `${food.id}: fora do cruzamento de órgão ${organ}`);
    }
  }
});

test('o resumo soma exatamente o total do catálogo', () => {
  const summary = summarizeFoodCatalog();
  assert.equal(summary.total, FOOD_CATALOG.length);
  const soma = Object.values(summary.byEnergy).reduce((a, b) => a + b, 0);
  assert.equal(soma, FOOD_CATALOG.length);
});
