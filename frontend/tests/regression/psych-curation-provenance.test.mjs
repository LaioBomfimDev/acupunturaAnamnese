import assert from 'node:assert/strict';
import { test } from 'node:test';

import draft from '../../src/data/psychAnamneseDraft.json' with { type: 'json' };
import {
  PSYCH_ANAMNESE_PROVENANCE,
  getPsychAnamneseSources,
} from '../../src/data/psychAnamneseProvenance.js';

function assertProtectedPagePointer(source, itemId) {
  assert.ok(source.key?.startsWith('psicologia-'), `${itemId}: chave de fonte ausente`);
  assert.ok(Number.isInteger(source.pdfPage) && source.pdfPage > 0, `${itemId}: página inválida`);
  assert.equal(source.verificationStatus, 'verified_page_pointer');
  assert.equal(source.requiresProfessionalAudit, true);
  assert.match(source.assetKey, /^pdf-sources\/.+\/pages\/page-\d{3,4}\.webp$/);
  assert.equal(source.imageUrl, `/knowledge/source-assets/${source.assetKey}`);
  assert.ok(['direct', 'contextual'].includes(source.supportLevel));
}

test('todo rascunho curável de psicologia mantém ponteiro verificável para fonte protegida', () => {
  const ids = [
    ...(draft.risk || []).map((_, index) => `risk-${index}`),
    ...(draft.axis || []).map((_, index) => `axis-${index}`),
    ...(draft.checklist || []).map((_, index) => `checklist-${index}`),
  ];

  for (const id of ids) {
    const sources = getPsychAnamneseSources(id);
    assert.ok(sources.length > 0, `${id}: sem proveniência`);
    sources.forEach(source => assertProtectedPagePointer(source, id));
  }
});

test('perguntas formuladas usam apoio contextual por bloco, sem alegar citação literal', () => {
  (draft.questionnaire || []).forEach((block, blockIndex) => {
    (block.questions || []).forEach((_, questionIndex) => {
      const id = `question-${blockIndex}-${questionIndex}`;
      const sources = getPsychAnamneseSources(id, blockIndex);
      assert.ok(sources.length > 0, `${id}: sem proveniência contextual`);
      for (const source of sources) {
        assertProtectedPagePointer(source, id);
        assert.equal(source.supportLevel, 'contextual');
      }
    });
  });
});

test('mapa de proveniência não inclui texto integral nem libera conteúdo clínico', () => {
  for (const [id, sources] of Object.entries(PSYCH_ANAMNESE_PROVENANCE)) {
    for (const source of sources) {
      assert.equal('snippet' in source, false, `${id}: trecho protegido entrou no bundle`);
      assert.equal('status' in source, false, `${id}: ponteiro não deve aprovar conteúdo`);
      assert.equal(source.requiresProfessionalAudit, true);
    }
  }
});
