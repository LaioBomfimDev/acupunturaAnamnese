import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DEFAULT_PROTOCOL_TECHNIQUE,
  PROTOCOL_STANDALONE_TECHNIQUES,
  getActiveProtocolTechniqueFilter,
  isProtocolPointOverviewEnabled,
  isProtocolSuggestionOriginEnabled,
  isProtocolTechniqueEnabled,
  selectProtocolTechniqueFilter,
} from '../../src/knowledge/protocolTechniqueFilters.js';

test('filtro terapêutico funciona como seleção única', () => {
  assert.deepEqual(selectProtocolTechniqueFilter([], 'Laser'), ['Laser']);
  assert.deepEqual(selectProtocolTechniqueFilter(['Laser'], 'Moxa'), ['Moxa']);
  assert.deepEqual(selectProtocolTechniqueFilter(['Moxa'], 'Moxa'), ['Moxa']);
  assert.deepEqual(selectProtocolTechniqueFilter(['Sistêmicos'], 'Ventosa'), ['Ventosa']);
});

test('filtros terapêuticos de técnica ocultam mapas e sugestões de pontos', () => {
  for (const technique of PROTOCOL_STANDALONE_TECHNIQUES) {
    const filters = [technique];

    assert.equal(isProtocolTechniqueEnabled(filters, technique), true, `${technique} deve ficar visível`);
    assert.equal(isProtocolTechniqueEnabled(filters, 'Sistêmicos'), false, `${technique} não deve mostrar sistêmicos`);
    assert.equal(isProtocolTechniqueEnabled(filters, 'Auriculoterapia'), false, `${technique} não deve mostrar auriculoterapia`);
    assert.equal(isProtocolPointOverviewEnabled(filters), false, `${technique} não deve mostrar mapa corporal/auricular`);
    assert.equal(isProtocolSuggestionOriginEnabled(filters, 'sistemico'), false, `${technique} não deve mostrar sugestão sistêmica`);
    assert.equal(isProtocolSuggestionOriginEnabled(filters, 'auricular'), false, `${technique} não deve mostrar sugestão auricular`);
  }
});

test('filtros de pontos separam sistêmicos e auriculares sem manter tudo aberto', () => {
  assert.equal(isProtocolPointOverviewEnabled(['Sistêmicos']), true);
  assert.equal(isProtocolTechniqueEnabled(['Sistêmicos'], 'Sistêmicos'), true);
  assert.equal(isProtocolTechniqueEnabled(['Sistêmicos'], 'Auriculoterapia'), false);
  assert.equal(isProtocolSuggestionOriginEnabled(['Sistêmicos'], 'sistemico'), true);
  assert.equal(isProtocolSuggestionOriginEnabled(['Sistêmicos'], 'auricular'), false);

  assert.equal(isProtocolPointOverviewEnabled(['Auriculoterapia']), true);
  assert.equal(isProtocolTechniqueEnabled(['Auriculoterapia'], 'Sistêmicos'), false);
  assert.equal(isProtocolTechniqueEnabled(['Auriculoterapia'], 'Auriculoterapia'), true);
  assert.equal(isProtocolSuggestionOriginEnabled(['Auriculoterapia'], 'sistemico'), false);
  assert.equal(isProtocolSuggestionOriginEnabled(['Auriculoterapia'], 'auricular'), true);
});

test('estado sem filtro cai em Sistêmicos sem abrir a visão completa', () => {
  assert.equal(getActiveProtocolTechniqueFilter([]), DEFAULT_PROTOCOL_TECHNIQUE);
  assert.equal(isProtocolPointOverviewEnabled([]), true);
  assert.equal(isProtocolTechniqueEnabled([], 'Sistêmicos'), true);
  assert.equal(isProtocolTechniqueEnabled([], 'Auriculoterapia'), false);
  assert.equal(isProtocolTechniqueEnabled([], 'Laser'), false);
  assert.equal(isProtocolTechniqueEnabled([], 'Eletro'), false);
  assert.equal(isProtocolSuggestionOriginEnabled([], 'sistemico'), true);
  assert.equal(isProtocolSuggestionOriginEnabled([], 'auricular'), false);
});
