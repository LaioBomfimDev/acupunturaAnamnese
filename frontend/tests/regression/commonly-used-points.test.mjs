import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let server;
let commonlyUsed;
let knowledgeBase;
let pointRecommendations;
let auricularCuration;
let mapLocations;

before(async () => {
  server = await createServer({
    root,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  });
  commonlyUsed = await server.ssrLoadModule('/src/knowledge/commonlyUsedPoints.js');
  knowledgeBase = await server.ssrLoadModule('/src/knowledge/knowledgeBase.js');
  pointRecommendations = await server.ssrLoadModule('/src/knowledge/pointRecommendationEngine.js');
  auricularCuration = await server.ssrLoadModule('/src/knowledge/auricularCuration.js');
  mapLocations = await server.ssrLoadModule('/src/knowledge/mapLocations.js');
});

after(async () => {
  await server?.close();
});

test('categoria "Pontos comumente usados" tem apenas pontos corporais e auriculares chineses rastreados', () => {
  const { commonlyUsedPoints, commonlyUsedBodyPoints, commonlyUsedAuricularPoints } = commonlyUsed;

  assert.equal(commonlyUsedPoints.length, 142);
  assert.equal(commonlyUsedBodyPoints.length, 126);
  assert.equal(commonlyUsedAuricularPoints.length, 16);

  const ids = new Set(commonlyUsedPoints.map(entry => entry.id));
  assert.equal(ids.size, commonlyUsedPoints.length);

  for (const entry of commonlyUsedPoints) {
    assert.ok(entry.map, `entrada ${entry.id} sem mapa definido`);
    assert.ok(entry.name, `entrada ${entry.id} sem nome`);
    assert.ok(entry.mainUse, `entrada ${entry.id} sem uso principal`);
    assert.ok(Array.isArray(entry.clinicalCategories) && entry.clinicalCategories.length > 0,
      `entrada ${entry.id} sem categoria clínica`);
  }
});

test('todo ponto corporal comumente usado existe na base e está marcado', () => {
  for (const entry of commonlyUsed.commonlyUsedBodyPoints) {
    const point = knowledgeBase.getPointByCode(entry.code);
    assert.ok(point, `${entry.code} (${entry.name}) não encontrado na base de conhecimento`);
    assert.equal(point.commonlyUsed, true, `${entry.code} sem marcação commonlyUsed`);
    assert.equal(point.commonUsage?.map, entry.map);
  }

  const flaggedBodyCodes = knowledgeBase.acupoints.filter(point => point.commonlyUsed);
  const uniqueFlagged = new Set(flaggedBodyCodes.map(point => point.code));
  assert.equal(uniqueFlagged.size, 126);
});

test('todo ponto auricular comumente usado existe na base e está marcado', () => {
  for (const entry of commonlyUsed.commonlyUsedAuricularPoints) {
    const point = knowledgeBase.auricularPoints.find(item => item.slug === entry.auricularSlug);
    assert.ok(point, `aurículo ${entry.auricularSlug} (${entry.name}) não encontrado na base`);
    assert.equal(point.commonlyUsed, true, `aurículo ${entry.auricularSlug} sem marcação commonlyUsed`);
    assert.equal(point.curation?.officialChinese, true, `aurículo ${entry.auricularSlug} não está no trilho chinês/oficial`);
    assert.equal(point.curation?.source?.id, 'pdf-auricular-local-sources');
    assert.ok(point.curation?.sourcePage?.pdfPage, `aurículo ${entry.auricularSlug} sem página de fonte`);
  }

  const flagged = knowledgeBase.auricularPoints.filter(point => point.commonlyUsed);
  const uniqueFlagged = new Set(flagged.map(point => point.slug));
  assert.equal(uniqueFlagged.size, 16);
});

test('filtro de mapa preserva pontos corporais e prioriza auriculares localizáveis', () => {
  const { commonlyUsedMapFilterCodes, commonlyUsedBodyPoints, commonlyUsedAuricularPoints } = commonlyUsed;

  for (const entry of commonlyUsedBodyPoints) {
    assert.ok(commonlyUsedMapFilterCodes.has(entry.code), `${entry.code} ausente do filtro do mapa`);
  }

  for (const entry of commonlyUsedAuricularPoints) {
    const code = `auricular:${entry.auricularSlug}`;
    assert.ok(commonlyUsedMapFilterCodes.has(code), `${code} ausente do filtro do mapa`);
  }

  assert.ok(!commonlyUsedMapFilterCodes.has('auricular:sono'));
  assert.ok(!commonlyUsedMapFilterCodes.has('SP3'));

  const summary = auricularCuration.auricularCurationSummary;
  assert.equal(summary.sourceRecords, 83);
  assert.equal(summary.commonPriority, 16);
  assert.equal(summary.commonMapReady, 16);
  assert.equal(summary.commonAwaitingCoordinates, 0);
  assert.equal(auricularCuration.auricularCurationRecords.length, 83);
  assert.ok(auricularCuration.auricularCurationRecords.every(record => record.approvalStatus === 'review'));

  for (const slug of [
    'ansiedade', 'sono', 'fome', 'utero', 'ovario', 'depressao', 'insonia', 'occipital', 'fronte', 'talamo',
  ]) {
    assert.equal(auricularCuration.isDefaultCommonMapLocationCode(`auricular:${slug}`), false);
    assert.equal(commonlyUsed.isCommonlyUsedPointKey(`auricular:${slug}`), false);
  }

  const defaultEarLocations = mapLocations.getAllMapLocations()
    .filter(location => location.mapId === 'ear_lateral')
    .filter(location => auricularCuration.isDefaultCommonMapLocationCode(location.code));
  assert.equal(defaultEarLocations.length, 16);
});

test('helpers aceitam aliases brasileiros, nomes auriculares e prefixo auricular:', () => {
  assert.ok(commonlyUsed.isCommonlyUsedPointKey('VG20'));
  assert.ok(commonlyUsed.isCommonlyUsedPointKey('GV20'));
  assert.ok(commonlyUsed.isCommonlyUsedPointKey('E36'));
  assert.ok(commonlyUsed.isCommonlyUsedPointKey('EX-HN5'));
  assert.ok(commonlyUsed.isCommonlyUsedPointKey('Shen Men'));
  assert.ok(commonlyUsed.isCommonlyUsedPointKey('Subcórtex'));
  assert.ok(commonlyUsed.isCommonlyUsedPointKey('auricular:supra-renal'));
  assert.ok(commonlyUsed.isCommonlyUsedPointKey('Adrenal'));
  assert.ok(commonlyUsed.isCommonlyUsedPointKey('Coluna Lombar'));
  assert.ok(commonlyUsed.isCommonlyUsedPointKey('Simpático'));

  assert.ok(!commonlyUsed.isCommonlyUsedPointKey('SP3'));
  assert.ok(!commonlyUsed.isCommonlyUsedPointKey('Sono'));
  assert.ok(!commonlyUsed.isCommonlyUsedPointKey('Ansiedade'));
  assert.ok(!commonlyUsed.isCommonlyUsedPointKey('Útero'));
  assert.ok(!commonlyUsed.isCommonlyUsedPointKey(''));
});

test('auriculares comuns mantidos têm texto pt-BR limpo nos campos visíveis', () => {
  const visibleText = knowledgeBase.auricularPoints
    .filter(point => point.commonlyUsed)
    .map(point => JSON.stringify({
      name: point.name,
      locationText: point.locationText,
      actions: point.actions,
      indications: point.indications,
    }))
    .join('\n');

  for (const typo of [
    'regulacao',
    'vasodilatacao',
    'constipacao',
    'distensao',
    'hipertensao',
    'ulcera',
    'proximo',
    'anti-helice',
    'helix',
    'ossea',
    'respiracao',
    'depressao',
  ]) {
    assert.ok(!visibleText.includes(typo), `texto auricular comum ainda contém grafia sem pt-BR: ${typo}`);
  }
});

test('filtro commonlyUsedOnly restringe candidatos do ranking aos pontos comumente usados', () => {
  const filtered = pointRecommendations.buildRecommendationCandidates([], { commonlyUsedOnly: true });
  const unfiltered = pointRecommendations.buildRecommendationCandidates([]);

  assert.equal(filtered.stats.commonlyUsedOnly, true);
  assert.ok(filtered.candidates.length < unfiltered.candidates.length);
  assert.ok(filtered.candidates.every(point => point.commonlyUsed
    || commonlyUsed.isCommonlyUsedPointKey(point.code)));
  assert.ok(filtered.candidates.some(point => point.code === 'ST36'));
  assert.ok(!filtered.candidates.some(point => point.code === 'SP3'));

  // Sem o filtro, a base completa continua disponível (nada foi excluído).
  assert.ok(unfiltered.candidates.some(point => point.code === 'SP3'));
});

test('revisão aprovada fora da categoria não entra na visão filtrada do usuário comum', () => {
  const reviews = [{
    code: 'ATLAS-EXTRA-TESTE',
    displayCode: 'Extra Teste',
    status: 'approved_local',
    title: 'Extra Teste - aprovado',
    indications: ['teste'],
    source: 'Atlas dos Pontos de Acupuntura: Guia de Localizacao',
  }];

  const filtered = pointRecommendations.buildRecommendationCandidates(reviews, { commonlyUsedOnly: true });
  const unfiltered = pointRecommendations.buildRecommendationCandidates(reviews);

  assert.ok(!filtered.candidates.some(point => point.code === 'ATLAS-EXTRA-TESTE'));
  assert.ok(unfiltered.candidates.some(point => point.code === 'ATLAS-EXTRA-TESTE'));
});
