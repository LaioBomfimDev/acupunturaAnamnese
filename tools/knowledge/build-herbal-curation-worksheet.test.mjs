import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CURATED,
  HERBAL_DISCLAIMER,
  buildHerbalWorksheet,
} from './build-herbal-curation-worksheet.mjs';

// Catálogo mínimo cobrindo um item de cada tier presente no overlay.
function catalogFor(plantIds) {
  return {
    items: plantIds.map((id, index) => ({
      id,
      commonName: `Planta ${index}`,
      scientificNameSource: `Species ${index}`,
      botanicalFamily: 'Fam.',
      sourcePdfPages: [index + 1],
      sourceSections: {
        partsUsed: { text: 'Folhas.' },
        traditionalIndications: { text: 'Uso tradicional citado.' },
        toxicology: { text: 'Cautela descrita na fonte.' },
      },
      traditionalMtcAssociations: [],
      traditionalMtcAssociationStatus: 'not_available_in_source',
    })),
  };
}

test('a planilha cobre todas as ervas do overlay curado e não aplica nada ao clínico', () => {
  const ws = buildHerbalWorksheet({ catalog: catalogFor(Object.keys(CURATED)) });

  assert.equal(ws.entries.length, Object.keys(CURATED).length);
  assert.equal(ws.policy.appliesToClinicalData, false);
  assert.equal(ws.policy.requiresProfessionalAudit, true);
  assert.equal(ws.policy.inventedMtcAssociations, false);
  assert.equal(ws.disclaimer, HERBAL_DISCLAIMER);
});

test('só propõe status educativo ou restrito, e a soma bate com o total', () => {
  const ws = buildHerbalWorksheet({ catalog: catalogFor(Object.keys(CURATED)) });

  for (const entry of ws.entries) {
    assert.ok(['educativo_aprovado', 'restrito_profissional'].includes(entry.suggestedStatus));
    assert.ok(entry.educationalSummary.length >= 20, `${entry.plantId}: síntese curta`);
    assert.ok(entry.cautionSummary.length >= 20, `${entry.plantId}: cautela curta`);
    // Nenhuma associação MTC inventada.
    assert.equal(entry.mtcAssociation.available, false);
  }
  assert.equal(
    ws.counts.educativoAprovadoProposto + ws.counts.restritoProfissionalProposto,
    ws.counts.total,
  );
});

test('checks de segurança: parte usada e toxicologia sustentados pela fonte; o resto é conferência humana', () => {
  const ws = buildHerbalWorksheet({ catalog: catalogFor(Object.keys(CURATED)) });
  const entry = ws.entries[0];

  assert.equal(entry.safetyReadiness.partUsedConfirmed, true);
  assert.equal(entry.safetyReadiness.toxicologyReviewed, true);
  assert.equal(entry.safetyReadiness.botanicalIdentityConfirmed, false);
  assert.equal(entry.safetyReadiness.interactionsReviewed, false);
  assert.equal(entry.safetyReadiness.vulnerableGroupsReviewed, false);
  assert.equal(entry.safetyReadiness.sourceScopeConfirmed, false);
});

test('falha explicitamente se uma planta do overlay não existir no catálogo', () => {
  assert.throws(
    () => buildHerbalWorksheet({ catalog: { items: [] } }),
    /Planta não encontrada no catálogo/,
  );
});
