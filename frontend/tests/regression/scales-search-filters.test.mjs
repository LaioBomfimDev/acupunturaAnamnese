import test from 'node:test';
import assert from 'node:assert/strict';
import { CLINICAL_INSTRUMENTS } from '../../src/data/clinicalInstruments.js';
import {
  INSTRUMENT_CATEGORIES,
  categoriesPresent,
  filterInstruments,
  instrumentCategories,
  instrumentKind,
} from '../../src/utils/instrumentCatalog.js';

test('toda escala do catálogo tem complemento de título e categoria válida', () => {
  const ids = new Set(INSTRUMENT_CATEGORIES.map(category => category.id));
  for (const instrument of CLINICAL_INSTRUMENTS) {
    assert.ok(instrumentKind(instrument), `${instrument.id} sem complemento de título`);
    const categories = instrumentCategories(instrument);
    assert.ok(categories.length > 0, `${instrument.id} sem categoria`);
    for (const id of categories) assert.ok(ids.has(id), `${instrument.id}: categoria ${id} desconhecida`);
  }
});

test('busca ignora acento e caixa e acha por sigla, assunto e categoria', () => {
  const ids = query => filterInstruments(CLINICAL_INSTRUMENTS, { query }).map(item => item.id);
  assert.deepEqual(ids('rosenberg'), ['rosenberg']);
  assert.ok(ids('AUTOESTIMA').includes('rosenberg'));
  assert.ok(ids('depressao').includes('phq9'));
  assert.ok(ids('tdah').includes('asrs6'));
  assert.deepEqual(ids('zzzz'), []);
});

test('filtro por categoria e categorias presentes na área', () => {
  const only = filterInstruments(CLINICAL_INSTRUMENTS, { category: 'autoimagem' }).map(item => item.id);
  assert.deepEqual(only.sort(), ['rosenberg', 'scs', 'scssf']);
  assert.equal(categoriesPresent(CLINICAL_INSTRUMENTS).length, INSTRUMENT_CATEGORIES.length);
  assert.deepEqual(categoriesPresent([]), []);
});
