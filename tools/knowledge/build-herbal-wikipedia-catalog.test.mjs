import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildWikipediaSearchUrl,
  extractHerbalEntries,
  primaryScientificName,
  resolveWikipediaPage,
} from './build-herbal-wikipedia-catalog.mjs';

test('extrai verbetes botanicos com pagina e nome cientifico primario', () => {
  const items = extractHerbalEntries([
    {
      number: 18,
      text: "ALFACE-D'ÁGUA NOME CIENTÍFICO Pistia stratiotes L. FAMÍLIA BOTÂNICA Araceae.",
    },
    {
      number: 53,
      text: 'BABOSA-DE-BOTICA NOME CIENTÍFICO Aloe vera L. ou Aloe barbadensis Mill. FAMÍLIA BOTÂNICA Asphodelaceae.',
    },
  ]);

  assert.deepEqual(items.map(item => ({
    commonName: item.commonName,
    scientificNameLookup: item.scientificNameLookup,
    sourcePdfPages: item.sourcePdfPages,
  })), [
    { commonName: "ALFACE-D'ÁGUA", scientificNameLookup: 'Pistia stratiotes', sourcePdfPages: [18] },
    { commonName: 'BABOSA-DE-BOTICA', scientificNameLookup: 'Aloe vera', sourcePdfPages: [53] },
  ]);
});

test('resolve redirecionamento da Wikipedia e preserva busca para itens sem pagina', () => {
  const resolved = resolveWikipediaPage({
    query: {
      redirects: [{ from: 'Curcuma longa', to: 'Açafrão-da-terra' }],
      pages: { 1: { pageid: 1, title: 'Açafrão-da-terra' } },
    },
  }, ['Curcuma longa']);

  assert.equal(resolved.title, 'Açafrão-da-terra');
  assert.equal(
    buildWikipediaSearchUrl('Pistia stratiotes'),
    'https://pt.wikipedia.org/w/index.php?search=Pistia+stratiotes',
  );
  assert.equal(primaryScientificName('Apium graveolens L. e Apium australe Thou.'), 'Apium graveolens');
  assert.equal(primaryScientificName('A diantum capillus-veneris L.'), 'Adiantum capillus-veneris');
  assert.equal(primaryScientificName('Artemísia dracunculus L.'), 'Artemisia dracunculus');
  assert.equal(primaryScientificName('Mentha x villosa Huds.'), 'Mentha × villosa');
});

test('separa campos tradicionais da fonte sem criar associacao MTC automatica', () => {
  const [item] = extractHerbalEntries([{
    number: 1,
    text: 'CÚRCUMA NOME CIENTÍFICO Curcuma longa L. FAMÍLIA BOTÂNICA Zingiberiaceae. PARTES UTILIZADAS Rizomas. PROPRIEDADES ETNOTERAPÊUTICAS Aromática. INDICAÇÕES A fonte cita o fígado. FORMAS DE USO Registro da fonte. TOXICOLOGIA Cautela em altas doses. OUTRAS PROPRIEDADES Condimento.',
  }]);

  assert.equal(item.botanicalFamily, 'Zingiberiaceae.');
  assert.deepEqual(item.sourceSections.partsUsed, { text: 'Rizomas.', pdfPages: [1] });
  assert.deepEqual(item.sourceSections.traditionalProperties, { text: 'Aromática.', pdfPages: [1] });
  assert.deepEqual(item.sourceSections.traditionalIndications, { text: 'A fonte cita o fígado.', pdfPages: [1] });
  assert.deepEqual(item.sourceSections.toxicology, { text: 'Cautela em altas doses.', pdfPages: [1] });
  assert.deepEqual(item.sourceMentionedBodyTerms, ['figado']);
  assert.deepEqual(item.traditionalMtcAssociations, []);
  assert.equal(item.traditionalMtcAssociationStatus, 'not_available_in_source');
});

test('preserva verbete quando a familia botanica continua na pagina seguinte com grafia OCR incompleta', () => {
  const [item] = extractHerbalEntries([
    { number: 88, text: 'CÁLAMO-AROMÁTICO NOME CIENTÍFICO Acorus calamus L.' },
    { number: 89, text: 'FAMÍLA BOTÂNICA Acoraceae. PARTES UTILIZADAS Rizoma.' },
  ]);

  assert.equal(item.scientificNameSource, 'Acorus calamus L.');
  assert.equal(item.botanicalFamily, 'Acoraceae.');
  assert.deepEqual(item.sourcePdfPages, [88, 89]);
  assert.deepEqual(item.sourceSections.partsUsed, { text: 'Rizoma.', pdfPages: [89] });
});
