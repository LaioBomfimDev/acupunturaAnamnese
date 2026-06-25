import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const policyUrl = new URL(
  `file://${path.resolve(root, 'src/knowledge/reviewSourcePolicy.js').replace(/\\/g, '/')}`,
);
const {
  isClinicallyActiveKnowledgeReview,
  isQuarantinedKnowledgeReview,
  normalizeKnowledgeReviewForClinicalUse,
} = await import(policyUrl);

const healthyAtlasReview = {
  code: 'BL40',
  status: 'approved_local',
  approvalMethod: 'bulk_high_confidence_operator_request',
  locationText: 'No centro da prega poplitea.',
  actions: ['Relaxa os tendoes.'],
  indications: ['lombalgia'],
  needling: '1 cun perpendicular.',
};

test('registro Atlas saudavel continua clinicamente ativo', () => {
  assert.equal(isQuarantinedKnowledgeReview(healthyAtlasReview), false);
  assert.equal(isClinicallyActiveKnowledgeReview(healthyAtlasReview), true);
  assert.equal(normalizeKnowledgeReviewForClinicalUse(healthyAtlasReview), healthyAtlasReview);
});

test('registro anotado como blockedFromClinical sai do uso clinico', () => {
  const quarantined = {
    ...healthyAtlasReview,
    code: 'ATLAS-EXTRA-BICHONG',
    dataQuality: { status: 'quarantine', blockedFromClinical: true },
  };
  assert.equal(isQuarantinedKnowledgeReview(quarantined), true);
  assert.equal(isClinicallyActiveKnowledgeReview(quarantined), false);

  const normalized = normalizeKnowledgeReviewForClinicalUse(quarantined);
  assert.equal(normalized.status, 'review');
  assert.equal(normalized.clinicalActivationBlocked, true);
  assert.match(normalized.clinicalActivationReason, /quarentena/i);
});

test('rede de seguranca: nucleo clinico vazio bloqueia mesmo sem anotacao', () => {
  const emptyCore = {
    code: 'ATLAS-EXTRA-JIANXI',
    status: 'approved_local',
    approvalMethod: 'atlas_extra_operator_request',
    locationText: '',
    actions: [],
    indications: [],
    needling: '',
  };
  assert.equal(isQuarantinedKnowledgeReview(emptyCore), true);
  assert.equal(isClinicallyActiveKnowledgeReview(emptyCore), false);

  const normalized = normalizeKnowledgeReviewForClinicalUse(emptyCore);
  assert.equal(normalized.clinicalActivationBlocked, true);
});

test('registro com localizacao + acoes nao e tratado como nucleo vazio', () => {
  const partial = {
    code: 'ATLAS-EXTRA-CHIQIAN',
    status: 'approved_local',
    approvalMethod: 'atlas_extra_operator_request',
    locationText: 'Atras do processo mastoide, 0,5 cun a frente de VB-20.',
    actions: ['Beneficia audicao e visao.'],
    indications: [],
    needling: '',
  };
  assert.equal(isQuarantinedKnowledgeReview(partial), false);
  assert.equal(isClinicallyActiveKnowledgeReview(partial), true);
});
