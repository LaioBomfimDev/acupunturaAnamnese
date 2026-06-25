import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildHerbalCurationSeed } from './build-herbal-curation-seed.mjs';

test('triagem-semente restringe plantas com trecho de toxicologia sem liberar pacientes', () => {
  const seed = buildHerbalCurationSeed({
    items: [
      { id: 'com-toxicologia', sourceSections: { toxicology: { text: 'Cautela.' } } },
      { id: 'sem-toxicologia', sourceSections: { toxicology: null } },
    ],
  }, { generatedAt: '2026-06-22T00:00:00.000Z' });

  assert.deepEqual(seed.counts, {
    total: 2,
    restrictedProfessional: 1,
    sourceOnly: 1,
    educationalApproved: 0,
  });
  assert.equal(seed.decisions[0].status, 'restrito_profissional');
  assert.equal(seed.decisions[1].status, 'source_only');
  assert.equal(seed.policy.automaticPatientEligibility, false);
  assert.ok(seed.decisions.every(item => item.requiresProfessionalAudit));
});
