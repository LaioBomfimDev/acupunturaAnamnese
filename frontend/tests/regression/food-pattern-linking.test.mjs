import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  PATTERN_FOOD_TARGETS,
  FOOD_LINK_DISCLAIMER,
  getPatternTarget,
  linkFoodsToSynthesis,
} from '../../src/knowledge/foodPatternLinking.js';
import { FOOD_ENERGIES, FOOD_ORGANS } from '../../src/knowledge/foodDietoterapia.js';

// Síntese mínima só com o que o motor lê. `graded` não é usado diretamente aqui.
function synth({ primaryName, level = 'Moderada', primaryPercent = 60, differential = null, isOpenDifferential = false }) {
  return {
    primaryName,
    primaryPercent,
    differential,
    isOpenDifferential,
    confidence: { level, reason: '' },
  };
}

test('cada alvo de padrão referencia órgãos e energias válidas do catálogo', () => {
  for (const [name, target] of Object.entries(PATTERN_FOOD_TARGETS)) {
    assert.ok(target.organs.length, `${name}: sem órgãos-alvo`);
    for (const o of target.organs) assert.ok(FOOD_ORGANS[o], `${name}: órgão inválido ${o}`);
    for (const e of [...target.prefer, ...target.avoid]) assert.ok(FOOD_ENERGIES[e], `${name}: energia inválida ${e}`);
    // Um padrão não pode preferir e evitar a mesma energia (contradição).
    for (const e of target.prefer) assert.ok(!target.avoid.includes(e), `${name}: energia ${e} preferida e evitada`);
    assert.ok(target.direction, `${name}: sem texto de direção`);
  }
});

test('GATE: confiança baixa não sugere nada', () => {
  const res = linkFoodsToSynthesis(synth({ primaryName: 'Deficiência de Yang do Rim', level: 'Baixa' }));
  assert.equal(res.gated, true);
  assert.equal(res.patterns.length, 0);
  assert.match(res.gateReason, /insuficiente|confian/i);
});

test('GATE: sem síntese ou padrão desconhecido não quebra e não inventa', () => {
  assert.equal(linkFoodsToSynthesis(null).gated, true);
  assert.equal(linkFoodsToSynthesis(synth({ primaryName: 'Aguardando dados' })).gated, true);
  const desconhecido = linkFoodsToSynthesis(synth({ primaryName: 'Padrão Inexistente XPTO' }));
  assert.equal(desconhecido.gated, true);
  assert.equal(desconhecido.patterns.length, 0);
});

test('SEGURANÇA TÉRMICA: padrão de FRIO nunca sugere alimento de energia contrária', () => {
  // Deficiência de Yang do Rim evita fria/fresca.
  const target = getPatternTarget('Deficiência de Yang do Rim');
  const res = linkFoodsToSynthesis(synth({ primaryName: 'Deficiência de Yang do Rim', level: 'Alta' }));
  assert.equal(res.gated, false);
  assert.ok(res.patterns[0].foods.length > 0, 'esperava ao menos um alimento aquecedor coerente');
  for (const food of res.patterns[0].foods) {
    assert.ok(!target.avoid.includes(food.energy), `sugeriu ${food.commonName} (${food.energy}) contrário ao frio`);
    // Todo sugerido afeta um órgão-alvo do padrão.
    assert.ok(food.organsMatched.length > 0, `${food.commonName} sem órgão-alvo casado`);
  }
});

test('SEGURANÇA TÉRMICA: padrão de CALOR nunca sugere alimento quente', () => {
  const res = linkFoodsToSynthesis(synth({ primaryName: 'Umidade-Calor', level: 'Alta' }));
  assert.equal(res.gated, false);
  for (const food of res.patterns[0].foods) {
    assert.notEqual(food.energy, 'quente', `sugeriu ${food.commonName} quente num padrão de calor`);
  }
});

test('cada alimento sugerido carrega razão e (quando houver) cautela da fonte', () => {
  const res = linkFoodsToSynthesis(synth({ primaryName: 'Deficiência de Qi do Baço', level: 'Alta' }));
  assert.equal(res.gated, false);
  assert.equal(res.disclaimer, FOOD_LINK_DISCLAIMER);
  for (const food of res.patterns[0].foods) {
    assert.ok(food.rationale && /Afeta/.test(food.rationale), `${food.commonName} sem razão`);
    assert.ok('caution' in food, `${food.commonName} sem campo de cautela`);
  }
  // Alinhados (energia preferida) vêm antes dos não alinhados.
  const foods = res.patterns[0].foods;
  const firstMisaligned = foods.findIndex(f => !f.aligned);
  if (firstMisaligned >= 0) {
    for (let i = firstMisaligned; i < foods.length; i++) {
      assert.equal(foods[i].aligned, false, 'alinhado apareceu depois de não alinhado (ordenação quebrada)');
    }
  }
});

test('diferencial aberto liga os dois padrões; fechado liga só o principal', () => {
  const aberto = linkFoodsToSynthesis(synth({
    primaryName: 'Deficiência de Yang do Rim',
    level: 'Alta',
    differential: { name: 'Deficiência de Qi do Baço', percent: 30 },
    isOpenDifferential: true,
  }));
  assert.equal(aberto.patterns.length, 2);
  assert.equal(aberto.patterns[0].role, 'primary');
  assert.equal(aberto.patterns[1].role, 'differential');

  const fechado = linkFoodsToSynthesis(synth({
    primaryName: 'Deficiência de Yang do Rim',
    level: 'Alta',
    differential: { name: 'Deficiência de Qi do Baço', percent: 10 },
    isOpenDifferential: false,
  }));
  assert.equal(fechado.patterns.length, 1);
});

test('isBlocked remove alimentos bloqueados pela curadoria das sugestões', () => {
  const full = linkFoodsToSynthesis(synth({ primaryName: 'Deficiência de Qi do Baço', level: 'Alta' }));
  const alvoId = full.patterns[0].foods[0].id;
  const filtrado = linkFoodsToSynthesis(
    synth({ primaryName: 'Deficiência de Qi do Baço', level: 'Alta' }),
    { isBlocked: id => id === alvoId },
  );
  assert.ok(!filtrado.patterns[0].foods.some(f => f.id === alvoId), 'alimento bloqueado ainda apareceu');
});

test('maxPerPattern limita a lista', () => {
  const res = linkFoodsToSynthesis(synth({ primaryName: 'Deficiência de Qi do Baço', level: 'Alta' }), { maxPerPattern: 3 });
  assert.ok(res.patterns[0].foods.length <= 3);
});
