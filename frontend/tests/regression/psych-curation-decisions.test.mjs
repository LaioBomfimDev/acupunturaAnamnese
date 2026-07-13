import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

import {
  PSYCH_CURATION_DECISIONS_KEY,
  applyPsychCurationProposal,
  getLocalPsychCurationDecisions,
} from '../../src/knowledge/psychCurationDecisions.js';

function withLocalStorage(fn) {
  const original = globalThis.localStorage;
  const store = new Map();
  globalThis.localStorage = {
    getItem: key => store.get(key) || null,
    setItem: (key, value) => store.set(key, String(value)),
  };
  try {
    return fn(store);
  } finally {
    if (original === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = original;
  }
}

test('SuperAdm aplica proposta existente de Psicologia no armazenamento local', () => withLocalStorage(store => {
  const saved = applyPsychCurationProposal({
    id: 'proposal-1',
    proposer_id: 'psychologist-1',
    proposer_name: 'Revisora Psicologia',
    type: 'anamnese_psic_risk',
    target_ref: 'risk-0',
    payload: {
      decision: 'approved_local',
      kind: 'risk',
      label: 'Ideação e comportamento suicida',
      wording: 'Redação revisada pela psicóloga.',
      sources: [{ key: 'psicologia-dsm-5-tr-revisao-texto', pdfPage: 258 }],
    },
  }, { role: 'super_admin', label: 'SuperAdm' });

  assert.equal(saved.id, 'risk-0');
  assert.equal(saved.status, 'approved_local');
  assert.equal(saved.approvalMode, 'local_only');
  assert.equal(saved.provenanceMode, 'protected_page_pointer');
  assert.equal(saved.professionalReviewerId, 'psychologist-1');
  assert.equal(saved.professionalReviewerLabel, 'Revisora Psicologia');
  assert.equal(getLocalPsychCurationDecisions()[0].wording, 'Redação revisada pela psicóloga.');
  assert.ok(store.has(PSYCH_CURATION_DECISIONS_KEY));
}));

test('novo item profissional usa o id da proposta e não sobrescreve outro item novo', () => withLocalStorage(() => {
  for (const id of ['proposal-a', 'proposal-b']) {
    applyPsychCurationProposal({
      id,
      type: 'anamnese_psic_question',
      target_ref: 'novo:question',
      payload: { decision: 'new', kind: 'question', item: { label: `Pergunta ${id}` } },
    });
  }
  const decisions = getLocalPsychCurationDecisions();
  assert.equal(decisions.length, 2);
  assert.deepEqual(new Set(decisions.map(item => item.id)), new Set(['new:proposal-a', 'new:proposal-b']));
  assert.ok(decisions.every(item => item.provenanceMode === 'professional_authored'));
}));

test('replay rejeita tipo cruzado e decisão desconhecida', () => withLocalStorage(() => {
  assert.throws(() => applyPsychCurationProposal({
    id: 'proposal-x',
    type: 'anamnese_psic_axis',
    target_ref: 'risk-0',
    payload: { decision: 'approved_local', kind: 'risk', wording: 'x' },
  }), /incompatível/);

  assert.throws(() => applyPsychCurationProposal({
    id: 'proposal-y',
    type: 'anamnese_psic_risk',
    target_ref: 'risk-0',
    payload: { decision: 'publicado', kind: 'risk', wording: 'x' },
  }), /inválida/);
}));

test('fila do SuperAdm encaminha os quatro tipos de Psicologia ao replay local', () => {
  const source = readFileSync(
    new URL('../../src/components/panels/CurationProposalsQueue.jsx', import.meta.url),
    'utf8',
  );
  for (const type of [
    'anamnese_psic_risk',
    'anamnese_psic_axis',
    'anamnese_psic_checklist',
    'anamnese_psic_question',
  ]) {
    assert.ok(source.includes(type), `fila sem rótulo para ${type}`);
  }
  assert.match(source, /type\.startsWith\('anamnese_psic_'\)/);
  assert.match(source, /applyPsychCurationProposal\(proposal/);
});
