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
    technicalCuration: 0,
    educationalApproved: 0,
    worksheetPreloaded: 0,
    worksheetProposedEducational: 0,
    worksheetProposedRestricted: 0,
  });
  assert.equal(seed.decisions[0].status, 'restrito_profissional');
  assert.equal(seed.decisions[1].status, 'source_only');
  assert.equal(seed.policy.automaticPatientEligibility, false);
  assert.ok(seed.decisions.every(item => item.requiresProfessionalAudit));
});

test('pré-carga do worksheet entra como curadoria técnica local sem publicar', () => {
  const plantId = 'alcachofra-cynara-scolymus-p012';
  const seed = buildHerbalCurationSeed({
    items: [
      { id: plantId, sourceSections: { toxicology: { text: 'Cautela.' } } },
      { id: 'fora-do-worksheet', sourceSections: { toxicology: null } },
    ],
  }, {
    generatedAt: '2026-07-04T00:00:00.000Z',
    worksheet: {
      entries: [{
        plantId,
        tier: 'A',
        suggestedStatus: 'educativo_aprovado',
        educationalSummary: 'Resumo educativo seguro para revisão profissional.',
        cautionSummary: 'Cautelas revisadas sem dose, preparo ou combinação.',
        safetyReadiness: {
          botanicalIdentityConfirmed: false,
          partUsedConfirmed: true,
          toxicologyReviewed: true,
          interactionsReviewed: false,
          vulnerableGroupsReviewed: false,
          sourceScopeConfirmed: false,
        },
      }],
    },
  });

  assert.equal(seed.counts.educationalApproved, 0);
  assert.equal(seed.counts.technicalCuration, 1);
  assert.equal(seed.counts.worksheetPreloaded, 1);
  assert.equal(seed.counts.worksheetProposedEducational, 1);
  assert.equal(seed.counts.sourceOnly, 1);

  const preload = seed.decisions.find(item => item.plantId === plantId);
  assert.equal(preload.status, 'curadoria_tecnica');
  assert.equal(preload.proposedStatus, 'educativo_aprovado');
  assert.equal(preload.approvalMode, 'local_only');
  assert.equal(preload.requiresProfessionalAudit, true);
  assert.equal(preload.safetyReview.partUsedConfirmed, true);
  assert.equal(preload.safetyReview.interactionsReviewed, false);
  assert.match(preload.reviewNote, /Pré-carga local/);
});
