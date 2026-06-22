import assert from 'node:assert/strict';
import { test } from 'node:test';

import { docCorpusCards } from '../../src/knowledge/generated/doc-corpus.js';

const VALID_CONFIDENCE = new Set(['high', 'medium', 'low']);
const REQUIRED_FIELDS = ['id', 'cat', 'title', 'confidence', 'statusLabel', 'cardColor', 'tags', 'source', 'txt'];

test('doc-corpus gerado é um array não vazio', () => {
  assert.ok(Array.isArray(docCorpusCards));
  assert.ok(docCorpusCards.length > 0, 'corpus vazio — rode node tools/knowledge/ingest-docs-corpus.mjs');
});

test('todo card tem o formato consumido pela Biblioteca', () => {
  for (const card of docCorpusCards) {
    for (const field of REQUIRED_FIELDS) {
      assert.equal(typeof card[field], 'string', `card ${card.id} sem campo string ${field}`);
      assert.ok(card[field].length > 0 || field === 'tags', `card ${card.id} com ${field} vazio`);
    }
    assert.ok(VALID_CONFIDENCE.has(card.confidence), `confiança inválida em ${card.id}`);
    assert.match(card.id, /^doc:/);
  }
});

test('ids são únicos', () => {
  const ids = docCorpusCards.map(c => c.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('inclui Repertório e Regra clínica com conteúdo real ingerido', () => {
  const cats = new Set(docCorpusCards.map(c => c.cat));
  assert.ok(cats.has('Repertório'));
  assert.ok(cats.has('Regra clínica'));
  assert.ok(cats.has('Técnica terapêutica'));

  // Prova que o conteúdo curado foi de fato ingerido (não placeholder).
  const haystack = docCorpusCards.map(c => `${c.tags} ${c.txt}`).join(' ');
  assert.ok(/Estase de Sangue|Estase de Xue/.test(haystack));
  assert.ok(/Umidade-Calor/.test(haystack));
  assert.ok(/laseracupuntura|laser de baixa intensidade/i.test(haystack));
  assert.ok(/moxabustão|bastão de moxa/i.test(haystack));
});

test('docs curadas não entram como "Seguro para uso clínico" (não over-claim)', () => {
  // Phase 1: corpus de docs é confiança média/baixa — gate humano antes de virar verde.
  for (const card of docCorpusCards) {
    assert.notEqual(card.confidence, 'high', `card ${card.id} marcado high sem revisão técnica`);
  }
});
