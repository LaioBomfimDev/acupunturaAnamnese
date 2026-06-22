import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  HERBAL_CURATION_DECISIONS_KEY,
  filterHerbalCurationRows,
  getLocalHerbalCurationDecisions,
  materializeHerbalCurationRows,
  saveLocalHerbalCurationDecision,
  summarizeHerbalCurationRows,
  validateHerbalCurationDecision,
} from '../../src/knowledge/herbalPlantCuration.js';

function withLocalStorage(fn) {
  const previous = globalThis.localStorage;
  const hadLocalStorage = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage');
  const store = new Map();
  globalThis.localStorage = {
    getItem: key => store.get(key) || null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: key => store.delete(key),
  };
  try {
    return fn(store);
  } finally {
    if (hadLocalStorage) globalThis.localStorage = previous;
    else delete globalThis.localStorage;
  }
}

const plant = {
  id: 'acafrao-da-india-curcuma-longa-p001',
  commonName: 'AÇAFRÃO-DA-ÍNDIA',
  scientificNameSource: 'Curcuma longa L.',
  contentReleaseStatus: 'source_only',
  sourceSections: {
    partsUsed: { text: 'Rizomas.', pdfPages: [2] },
    traditionalProperties: { text: 'Propriedade tradicional descrita pela fonte.', pdfPages: [2] },
    traditionalIndications: { text: 'Indicação tradicional descrita pela fonte.', pdfPages: [2] },
    toxicology: { text: 'Cautela em altas doses.', pdfPages: [3] },
  },
};

test('aprovacao educativa de erva exige revisao de seguranca e rastreabilidade', () => {
  const blocked = validateHerbalCurationDecision({
    plantId: plant.id,
    status: 'educativo_aprovado',
    reviewNote: 'Revisão inicial.',
  }, plant);
  assert.equal(blocked.ok, false);
  assert.match(blocked.errors.join(' '), /segurança/i);

  const approved = validateHerbalCurationDecision({
    plantId: plant.id,
    status: 'educativo_aprovado',
    reviewNote: 'Revisão profissional com conferência da fonte.',
    educationalSummary: 'Resumo educativo interno, sem indicação de uso individual.',
    cautionSummary: 'Cautelas revisadas; não orientar dose, preparo ou combinação.',
    safetyReview: {
      botanicalIdentityConfirmed: true,
      partUsedConfirmed: true,
      toxicologyReviewed: true,
      interactionsReviewed: true,
      vulnerableGroupsReviewed: true,
      sourceScopeConfirmed: true,
    },
  }, plant);
  assert.equal(approved.ok, true);
});

test('decisao local guarda somente curadoria e nao replica o texto da fonte', () => withLocalStorage(store => {
  const decision = saveLocalHerbalCurationDecision({
    plantId: plant.id,
    status: 'restrito_profissional',
    reviewNote: 'Exige avaliação individual antes de qualquer conversa educativa.',
    reviewedByRole: 'super_admin',
    reviewedByLabel: 'SuperAdm',
  });

  const stored = store.get(HERBAL_CURATION_DECISIONS_KEY);
  assert.ok(stored);
  assert.doesNotMatch(stored, /Propriedade tradicional/);
  assert.equal(getLocalHerbalCurationDecisions()[0].plantId, plant.id);

  const [row] = materializeHerbalCurationRows([plant], [decision]);
  assert.equal(row.contentReleaseStatus, 'restrito_profissional');
  assert.equal(row.patientEligible, false);
}));

test('busca encontra indicação da fonte sem inferir associação MTC', () => {
  const rows = materializeHerbalCurationRows([plant], []);
  const filtered = filterHerbalCurationRows(rows, { query: 'indicação tradicional' });
  assert.equal(filtered.length, 1);
  const summary = summarizeHerbalCurationRows(rows);
  assert.equal(summary.pending, 1);
  assert.equal(summary.approved, 0);
});

test('catálogo de ervas usa chave interna de fonte protegida', () => {
  const service = readFileSync(new URL('../../src/services/herbalPlantCurationService.js', import.meta.url), 'utf8');
  assert.match(service, /HERBAL_PLANT_CATALOG_ASSET_KEY = 'pdf-sources\/ebook-ervas-medicinais\/plant-catalog\.local\.json'/);
  assert.match(service, /fetchKnowledgeSourceJsonAsset\(/);
});
