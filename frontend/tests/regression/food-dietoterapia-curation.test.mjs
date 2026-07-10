import assert from 'node:assert/strict';
import { test } from 'node:test';

import { FOOD_CATALOG } from '../../src/knowledge/foodDietoterapia.js';
import {
  FOOD_DEFAULT_STATUS,
  isFoodPatientEligible,
  materializeFoodCurationRows,
  normalizeFoodCurationDecision,
  summarizeFoodCurationRows,
  validateFoodCurationDecision,
} from '../../src/knowledge/foodDietoterapiaCuration.js';

test('sem decisão, todo alimento fica no status padrão curadoria_tecnica e não é elegível a paciente', () => {
  const rows = materializeFoodCurationRows([]);
  assert.equal(rows.length, FOOD_CATALOG.length);
  assert.ok(rows.every(row => row.contentReleaseStatus === FOOD_DEFAULT_STATUS));
  assert.ok(rows.every(row => row.patientEligible === false));
  const summary = summarizeFoodCurationRows(rows);
  assert.equal(summary.approved, 0);
  assert.equal(summary.patientEligible, 0);
});

test('aprovar exige nota e as três conferências; senão a validação falha', () => {
  const foodId = FOOD_CATALOG[0].id;
  const incompleto = validateFoodCurationDecision({ foodId, status: 'educativo_aprovado', reviewNote: 'ok fonte revisada' });
  assert.equal(incompleto.ok, false);
  assert.ok(incompleto.errors.some(e => /fonte, linguagem e cautelas/i.test(e)));

  const completo = validateFoodCurationDecision({
    foodId,
    status: 'educativo_aprovado',
    reviewNote: 'Fonte pp. conferidas; linguagem educativa; cautelas ok.',
    review: { sourceConfirmed: true, languageReviewed: true, cautionsReviewed: true },
  });
  assert.equal(completo.ok, true);
  assert.equal(isFoodPatientEligible(completo.decision), true);
});

test('status inválido cai para o padrão e alimento inexistente é rejeitado', () => {
  const d = normalizeFoodCurationDecision({ foodId: 'gengibre', status: 'inventado' });
  assert.equal(d.status, FOOD_DEFAULT_STATUS);

  const invalid = validateFoodCurationDecision({ foodId: 'nao-existe', status: 'curadoria_tecnica' });
  assert.equal(invalid.ok, false);
  assert.ok(invalid.errors.some(e => /não encontrado/i.test(e)));
});

test('uma decisão aprovada aparece como elegível na materialização', () => {
  const foodId = FOOD_CATALOG.find(f => f.id === 'gengibre-fresco').id;
  const decision = normalizeFoodCurationDecision({
    foodId,
    status: 'educativo_aprovado',
    reviewNote: 'Revisado contra a fonte, linguagem e cautelas.',
    review: { sourceConfirmed: true, languageReviewed: true, cautionsReviewed: true },
  });
  const rows = materializeFoodCurationRows([decision]);
  const row = rows.find(r => r.id === foodId);
  assert.equal(row.contentReleaseStatus, 'educativo_aprovado');
  assert.equal(row.patientEligible, true);
  assert.equal(summarizeFoodCurationRows(rows).approved, 1);
});
