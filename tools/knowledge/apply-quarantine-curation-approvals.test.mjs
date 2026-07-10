import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  applyQuarantineCurationApprovals,
  isEntryEligibleForLocalApproval,
} from './apply-quarantine-curation-approvals.mjs';

const approvedAt = '2026-07-03T12:00:00.000Z';

const worksheet = {
  entries: [
    {
      code: 'EX-HN4',
      tier: 'A',
      suggestions: {
        location: { value: 'Na região frontal, no centro da sobrancelha.', source: 'km-agent-traduzido', confidence: 'alta' },
        actions: { value: 'Clareia os olhos.', source: 'leitura-ocr', confidence: 'media' },
        indications: { value: 'Dor supraorbital.', source: 'leitura-ocr', confidence: 'media' },
        needling: { value: 'Inserção horizontal: 0,3 a 0,5 cun.', source: 'km-agent', confidence: 'alta' },
      },
      reviewNote: 'Paralisia facial precisa confirmação.',
    },
    {
      code: 'ATLAS-EXTRA-GENPING',
      tier: 'B',
      suggestions: {
        location: { value: 'Região posterior do tornozelo.', source: 'leitura-ocr', confidence: 'media' },
      },
    },
    {
      code: 'ATLAS-EXTRA-JIANMING',
      tier: 'B',
      suggestions: {
        location: { value: 'Possivelmente na margem inferior da órbita.', source: 'leitura-ocr', confidence: 'baixa' },
      },
    },
    {
      code: 'ATLAS-EXTRA-BICHONG',
      tier: 'C',
      suggestions: {},
    },
  ],
};

const reviewsPayload = {
  generatedAt: '2026-06-22T00:00:00.000Z',
  counts: { approvedLocal: 4 },
  reviews: [
    {
      code: 'EX-HN4',
      status: 'approved_local',
      locationText: '',
      actions: ['OCR quebrado'],
      indications: ['paralisia facial'],
      needling: '- bruto',
      dataQuality: {
        status: 'quarantine',
        blockedFromClinical: true,
        issues: [{ type: 'ocr_corruption' }],
        missingEssential: ['localizacao'],
      },
      clinicalNote: 'Fonte primaria: Atlas.',
    },
    {
      code: 'ATLAS-EXTRA-GENPING',
      status: 'approved_local',
      locationText: 'OCR ruidoso',
      actions: [],
      indications: [],
      needling: '',
      dataQuality: { status: 'quarantine', blockedFromClinical: true },
    },
    {
      code: 'ATLAS-EXTRA-JIANMING',
      status: 'approved_local',
      locationText: 'OCR ruidoso',
      dataQuality: { status: 'quarantine', blockedFromClinical: true },
    },
    {
      code: 'ATLAS-EXTRA-BICHONG',
      status: 'approved_local',
      locationText: 'Dado mal atribuido',
      dataQuality: { status: 'quarantine', blockedFromClinical: true },
    },
  ],
};

test('elegibilidade aprova Tier A/B sem baixa confianca e bloqueia baixa/Tier C', () => {
  assert.equal(isEntryEligibleForLocalApproval(worksheet.entries[0]), true);
  assert.equal(isEntryEligibleForLocalApproval(worksheet.entries[1]), true);
  assert.equal(isEntryEligibleForLocalApproval(worksheet.entries[2]), false);
  assert.equal(isEntryEligibleForLocalApproval(worksheet.entries[3]), false);
});

test('aplica campos revisados e limpa quarentena apenas dos aprovados', () => {
  const { payload, report } = applyQuarantineCurationApprovals({ reviewsPayload, worksheet, approvedAt });

  assert.deepEqual(report.counts, { approved: 2, skipped: 2 });
  assert.deepEqual(report.approved.map(item => item.code), ['EX-HN4', 'ATLAS-EXTRA-GENPING']);
  assert.deepEqual(report.skipped.map(item => item.code), ['ATLAS-EXTRA-JIANMING', 'ATLAS-EXTRA-BICHONG']);

  const yuyao = payload.reviews.find(review => review.code === 'EX-HN4');
  assert.equal(yuyao.dataQuality.blockedFromClinical, false);
  assert.equal(yuyao.dataQuality.previousBlockedFromClinical, true);
  assert.equal(yuyao.locationText, 'Na região frontal, no centro da sobrancelha.');
  assert.deepEqual(yuyao.actions, ['Clareia os olhos.']);
  assert.deepEqual(yuyao.indications, ['Dor supraorbital.']);
  assert.equal(yuyao.needling, 'Inserção horizontal: 0,3 a 0,5 cun.');
  assert.match(yuyao.clinicalNote, /Curadoria de quarentena aprovada localmente/);

  const genping = payload.reviews.find(review => review.code === 'ATLAS-EXTRA-GENPING');
  assert.equal(genping.dataQuality.blockedFromClinical, false);
  assert.equal(genping.locationText, 'Região posterior do tornozelo.');
  assert.deepEqual(genping.actions, []);
  assert.deepEqual(genping.indications, []);

  const jianming = payload.reviews.find(review => review.code === 'ATLAS-EXTRA-JIANMING');
  assert.equal(jianming.dataQuality.blockedFromClinical, true);
  assert.equal(jianming.locationText, 'OCR ruidoso');

  const bichong = payload.reviews.find(review => review.code === 'ATLAS-EXTRA-BICHONG');
  assert.equal(bichong.dataQuality.blockedFromClinical, true);
  assert.equal(bichong.locationText, 'Dado mal atribuido');
});
