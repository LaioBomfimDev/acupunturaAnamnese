import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let server;
let analyzer;
let pointRecommendations;
let pointDetails;
let knowledgeAdminService;
let kmAgentDrafts;
let sourceReferences;
let mapLocations;
let mtcTranslation;
let pdfSourceLearning;
let testClinicalFixture;
let knowledgeBase;

function withoutBodyFull(locations) {
  return locations.filter(location => location.mapId !== 'body_full');
}

before(async () => {
  server = await createServer({
    root,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  });
  analyzer = await server.ssrLoadModule('/src/utils/analyzer.js');
  pointRecommendations = await server.ssrLoadModule('/src/knowledge/pointRecommendationEngine.js');
  pointDetails = await server.ssrLoadModule('/src/knowledge/pointDetails.js');
  knowledgeAdminService = await server.ssrLoadModule('/src/services/knowledgeAdminService.js');
  kmAgentDrafts = await server.ssrLoadModule('/src/knowledge/kmAgentDrafts.js');
  sourceReferences = await server.ssrLoadModule('/src/knowledge/sourceReferences.js');
  mapLocations = await server.ssrLoadModule('/src/knowledge/mapLocations.js');
  mtcTranslation = await server.ssrLoadModule('/src/knowledge/mtcTranslation.js');
  pdfSourceLearning = await server.ssrLoadModule('/src/knowledge/pdfSourceLearning.js');
  testClinicalFixture = await server.ssrLoadModule('/src/utils/testClinicalFixture.js');
  knowledgeBase = await server.ssrLoadModule('/src/knowledge/knowledgeBase.js');
});

after(async () => {
  await server?.close();
});

test('sonhos intensos não contam como pulso tenso', () => {
  const result = analyzer.analyze(
    {
      queixa: 'Ansiedade, insônia, palpitação, agitação e sonhos intensos.',
      historia: '',
      medicacoes: '',
    },
    {
      'sono:Sonhos intensos': true,
      'pulso:esquerdo:p9:Pulso rápido': true,
    },
  );

  const scores = Object.fromEntries(result.ranked);
  assert.equal(result.main, 'Agitação do Shen por Calor');
  assert.equal(scores['Ascensão do Yang do Fígado'], 0);
});

test('preenchimento de teste cobre todos os diagnósticos canônicos sem repetir no ciclo', () => {
  const fixturePatterns = testClinicalFixture.getTestClinicalFixturePatterns();
  const canonicalPatterns = Object.keys(knowledgeBase.patternDefinitions);

  assert.deepEqual(new Set(fixturePatterns), new Set(canonicalPatterns));

  fixturePatterns.forEach(patternName => {
    const fixture = testClinicalFixture.buildClinicalFixtureForPattern(patternName);
    const result = analyzer.analyze(fixture.statePatch, fixture.selectedMap);
    assert.equal(result.main, patternName);
  });

  testClinicalFixture.resetRandomClinicalFixtureCycle();
  const generatedDiagnoses = [];
  fixturePatterns.forEach(() => {
    const fixture = testClinicalFixture.buildRandomClinicalFixture();
    const result = analyzer.analyze(fixture.statePatch, fixture.selectedMap);
    assert.equal(result.main, fixture.expectedPattern);
    generatedDiagnoses.push(result.main);
  });
  testClinicalFixture.resetRandomClinicalFixtureCycle();

  assert.equal(new Set(generatedDiagnoses).size, fixturePatterns.length);
});

test('glossário MTC traduz localização e agulhamento controlados do KM-Agent', () => {
  const location = mtcTranslation.translateMtcDraftText(
    'On the lower abdomen, 2 B-cun inferior to the centre of the umbilicus, 2 B-cun lateral to the anterior median line.',
  );
  const item = {
    location: {
      ptBr: 'On lower abdomen, 2 B-cun inferior a centre de umbilicus, 2 B-cun lateral à linha mediana anterior.',
    },
    needling: {
      ptBr: 'Perpendicular insertion 0.5-1 cun. Oblique insertion toward medial side.',
    },
  };

  assert.match(location.text, /regiao inferior do abdome/i);
  assert.match(location.text, /centro do umbigo/i);
  assert.match(kmAgentDrafts.getKmAgentLocationPtBr(item), /linha mediana anterior/i);
  assert.match(kmAgentDrafts.getKmAgentNeedlingPtBr(item), /insercao perpendicular/i);
  assert.match(kmAgentDrafts.getKmAgentNeedlingPtBr(item), /insercao obliqua/i);
});

test('pulso tenso continua contando como evidência clínica', () => {
  const result = analyzer.analyze(
    { queixa: 'Paciente refere pulso tenso em avaliação.', historia: '', medicacoes: '' },
    { 'pulso:esquerdo:p8:Pulso tenso': true },
  );

  const scores = Object.fromEntries(result.ranked);
  assert.equal(result.main, 'Ascensão do Yang do Fígado');
  assert.equal(scores['Ascensão do Yang do Fígado'], 6);
});

test('sonhos intensos isolado não aumenta princípio de excesso', () => {
  const result = analyzer.principleAnalysis(
    { queixa: 'Sonhos intensos.', historia: '', medicacoes: '' },
    { 'sono:Sonhos intensos': true },
  );

  assert.equal(result.Excesso, 0);
});

test('pulso tenso aumenta princípio de excesso', () => {
  const result = analyzer.principleAnalysis(
    { queixa: 'Pulso tenso.', historia: '', medicacoes: '' },
    { 'pulso:esquerdo:p8:Pulso tenso': true },
  );

  assert.equal(result.Excesso, 1);
});

test('sonhos intensos não geram estagnação de Qi no perfil patogênico', () => {
  const profile = analyzer.diagnosticProfile(
    {
      queixa: 'Ansiedade, insônia, palpitação, agitação e sonhos intensos.',
      historia: '',
      medicacoes: '',
      agua: '1,5L/dia',
    },
    {
      'sono:Sonhos intensos': true,
      'pulso:esquerdo:p9:Pulso rápido': true,
    },
  );

  assert.equal(profile.main, 'Agitação do Shen por Calor');
  assert.ok(!profile.pathogenic.includes('Estagnação de Qi'));
});

test('ranking por evidências prioriza pontos coerentes com cefaleia e pulso tenso', () => {
  const state = {
    queixa: 'Cefaleia com tensão cervical e irritabilidade.',
    historia: '',
    medicacoes: '',
  };
  const selectedMap = {
    'sintomas:Cefaleia': true,
    'dor:Rigidez': true,
    'pulso:esquerdo:p8:Pulso tenso': true,
  };
  const analysis = analyzer.analyze(state, selectedMap);
  const result = pointRecommendations.buildPointRecommendations({ state, selectedMap, analysis });
  const topCodes = result.recommendations.slice(0, 5).map(item => item.point.code);

  assert.ok(result.evidence.some(item => item.id === 'head_tension'));
  assert.ok(topCodes.includes('LR3'));
  assert.ok(topCodes.includes('GB20'));
});

test('ranking por evidências sinaliza cautela gestacional em pontos sensíveis', () => {
  const state = {
    queixa: 'Gestação com cefaleia e tensão.',
    historia: '',
    medicacoes: '',
  };
  const selectedMap = {
    'historico:Gestação': true,
    'sintomas:Cefaleia': true,
    'dor:Rigidez': true,
  };
  const analysis = analyzer.analyze(state, selectedMap);
  const result = pointRecommendations.buildPointRecommendations({ state, selectedMap, analysis, limit: 12 });
  const li4 = result.recommendations.find(item => item.point.code === 'LI4');

  assert.ok(li4);
  assert.ok(li4.cautions.includes('revisar gestação antes de usar'));
});

test('ranking por evidências usa ponto aprovado da Biblioteca Viva', () => {
  const state = {
    queixa: 'Asma com tosse, dispneia e garganta irritada.',
    historia: '',
    medicacoes: '',
  };
  const selectedMap = {
    'sintomas:Rinite/Sinusite': true,
  };
  const analysis = analyzer.analyze(state, selectedMap);
  const result = pointRecommendations.buildPointRecommendations({
    state,
    selectedMap,
    analysis,
    knowledgeReviews: [{
      code: 'LU1',
      displayCode: 'P1',
      status: 'approved_local',
      title: 'P-1 (Zhongfu) - Palácio Central',
      meridianCode: 'LU',
      meridian: 'Pulmão',
      actions: ['desce o Qi do Pulmão'],
      indications: ['asma', 'tosse', 'dispneia'],
      relatedPatterns: ['Qi em contrafluxo/Pulmão'],
      techniques: ['agulha'],
    }],
    limit: 12,
  });

  const lu1 = result.recommendations.find(item => item.point.code === 'LU1');
  assert.ok(result.evidence.some(item => item.id === 'respiratory_surface'));
  assert.ok(lu1);
  assert.equal(lu1.point.dataOrigin, 'Biblioteca Viva');
  assert.equal(result.candidateStats.approvedReviewCount, 1);
});

test('ranking e ficha do protocolo usam ponto aprovado vindo da curadoria profunda local', () => {
  const deepCuratedApprovedReview = {
    code: 'ATLAS-EXTRA-RESPIRAR',
    displayCode: 'Respirar Livre',
    status: 'approved_local',
    title: 'Respirar Livre - revisão profunda aprovada',
    meridianCode: 'ATLAS_EXTRA',
    meridian: 'Pontos extras locais',
    locationText: 'Região de apoio respiratório revisada localmente.',
    actions: ['desce o Qi do Pulmão', 'libera garganta'],
    indications: ['asma', 'tosse', 'dispneia'],
    relatedPatterns: ['Qi em contrafluxo/Pulmão'],
    techniques: ['agulha', 'laser'],
    source: 'Biblioteca Viva - deep-curated-reviews',
  };
  const mergedReviews = knowledgeAdminService.mergeClinicalKnowledgeReviews({
    deepCuratedReviews: [deepCuratedApprovedReview],
    highConfidenceReviews: [],
    localReviews: [],
  });
  const state = {
    queixa: 'Crise de asma com tosse, dispneia e garganta irritada.',
    historia: '',
    medicacoes: '',
  };
  const selectedMap = {
    'sintomas:Tosse': true,
  };
  const analysis = analyzer.analyze(state, selectedMap);
  const result = pointRecommendations.buildPointRecommendations({
    state,
    selectedMap,
    analysis,
    knowledgeReviews: mergedReviews,
    limit: 12,
  });
  const recommendedPoint = result.recommendations.find(item => item.point.code === 'ATLAS-EXTRA-RESPIRAR');
  const popupDetail = pointDetails.buildPointDetail({
    pointKey: 'ATLAS-EXTRA-RESPIRAR',
    patternName: analysis.main,
    reviews: mergedReviews,
  });

  assert.ok(result.evidence.some(item => item.id === 'respiratory_surface'));
  assert.ok(recommendedPoint);
  assert.equal(recommendedPoint.point.reviewStatus, 'approved_local');
  assert.equal(recommendedPoint.point.dataOrigin, 'Biblioteca Viva');
  assert.equal(popupDetail.name, 'Respirar Livre - revisão profunda aprovada');
  assert.equal(popupDetail.dataOrigin, 'Biblioteca Viva');
  assert.ok(popupDetail.indications.includes('asma'));
});

test('ranking por evidências ignora ponto ainda não aprovado', () => {
  const state = {
    queixa: 'Asma com tosse e dispneia.',
    historia: '',
    medicacoes: '',
  };
  const selectedMap = {};
  const analysis = analyzer.analyze(state, selectedMap);
  const result = pointRecommendations.buildPointRecommendations({
    state,
    selectedMap,
    analysis,
    knowledgeReviews: [{
      code: 'LU1',
      displayCode: 'P1',
      status: 'review',
      title: 'P-1 em revisão',
      indications: ['asma', 'tosse', 'dispneia'],
    }],
    limit: 12,
  });

  assert.equal(result.candidateStats.approvedReviewCount, 0);
  assert.ok(!result.recommendations.some(item => item.point.code === 'LU1'));
});

test('base clínica do protocolo carrega deep-curated, alta confiança e revisões locais', async () => {
  const originalFetch = globalThis.fetch;
  const hadLocalStorage = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage');
  const originalLocalStorage = globalThis.localStorage;
  const fetchCalls = [];

  globalThis.fetch = async url => {
    fetchCalls.push(url);

    if (url === knowledgeAdminService.DEEP_CURATED_KNOWLEDGE_REVIEWS_URL) {
      return {
        ok: true,
        json: async () => ({
          reviews: [
            { code: 'LU1', status: 'review', title: 'LU1 rascunho profundo' },
            { code: 'PC6', status: 'approved_local', title: 'PC6 aprovado pela curadoria profunda' },
          ],
        }),
      };
    }

    if (url === knowledgeAdminService.HIGH_CONFIDENCE_KNOWLEDGE_REVIEWS_URL) {
      return {
        ok: true,
        json: async () => ({
          reviews: [
            { code: 'LU1', status: 'approved_local', title: 'LU1 alta confiança' },
            { code: 'HT7', status: 'approved_local', title: 'HT7 alta confiança' },
          ],
        }),
      };
    }

    return { ok: false, json: async () => ({}) };
  };

  globalThis.localStorage = {
    getItem: () => JSON.stringify([
      { code: 'LU1', status: 'approved_local', title: 'LU1 revisão manual local' },
    ]),
  };

  try {
    const reviews = await knowledgeAdminService.getClinicalKnowledgeReviews();
    const byCode = new Map(reviews.map(review => [review.code, review]));

    assert.deepEqual(fetchCalls, [
      knowledgeAdminService.DEEP_CURATED_KNOWLEDGE_REVIEWS_URL,
      knowledgeAdminService.HIGH_CONFIDENCE_KNOWLEDGE_REVIEWS_URL,
    ]);
    assert.equal(reviews.length, 3);
    assert.equal(byCode.get('LU1').title, 'LU1 revisão manual local');
    assert.equal(byCode.get('PC6').title, 'PC6 aprovado pela curadoria profunda');
    assert.equal(byCode.get('HT7').title, 'HT7 alta confiança');
  } finally {
    globalThis.fetch = originalFetch;
    if (hadLocalStorage) {
      globalThis.localStorage = originalLocalStorage;
    } else {
      delete globalThis.localStorage;
    }
  }
});

test('ficha do ponto prioriza revisão aprovada da Biblioteca Viva', () => {
  const detail = pointDetails.buildPointDetail({
    pointKey: 'LI4',
    patternName: 'Ascensão do Yang do Fígado',
    reviews: [{
      code: 'LI4',
      displayCode: 'IG4',
      status: 'approved_local',
      title: 'IG4 - Hegu revisado',
      meridian: 'Intestino Grosso',
      locationText: 'Localização revisada pela Biblioteca Viva.',
      actions: ['mover Qi', 'analgesia'],
      indications: ['cefaleia'],
      cautions: ['evitar em gestação sem indicação formal'],
      relatedPatterns: ['Ascensão do Yang do Fígado'],
      techniques: ['agulha', 'laser'],
      needling: 'Técnica revisada.',
      source: 'Biblioteca Viva',
    }],
    atlasReference: {
      referenceLabel: 'Atlas Ednea Martins, p. 86-87',
      pdfPages: [103, 104],
    },
  });

  assert.equal(detail.dataOrigin, 'Biblioteca Viva');
  assert.equal(detail.name, 'IG4 - Hegu revisado');
  assert.equal(detail.locationText, 'Localização revisada pela Biblioteca Viva.');
  assert.ok(detail.sources.includes('Atlas Ednea Martins, p. 86-87'));
});

test('ficha identifica aprovação local por confiança alta', () => {
  const detail = pointDetails.buildPointDetail({
    pointKey: 'LI4',
    reviews: [{
      code: 'LI4',
      displayCode: 'IG4',
      status: 'approved_local',
      approvalMethod: 'bulk_high_confidence_operator_request',
      title: 'IG4 - Hegu aprovado por confiança',
      locationText: 'Localização do pacote de alta confiança.',
    }],
  });

  assert.equal(detail.dataOrigin, 'Biblioteca Viva (alta confiança)');
  assert.equal(detail.name, 'IG4 - Hegu aprovado por confiança');
});

test('ficha aceita ponto novo aprovado localmente a partir do Atlas', () => {
  const detail = pointDetails.buildPointDetail({
    pointKey: 'ATLAS-EXTRA-ANMIAN',
    reviews: [{
      code: 'ATLAS-EXTRA-ANMIAN',
      displayCode: 'Anmian',
      status: 'approved_local',
      approvalMethod: 'atlas_extra_operator_request',
      approvalMode: 'local_only',
      requiresProfessionalAudit: true,
      title: 'Anmian (Sono Tranquilo)',
      meridian: 'Pontos extras da cabeca e do pescoco',
      locationText: 'Atras da orelha, entre VB20 e SJ17.',
      source: 'Atlas dos Pontos de Acupuntura: Guia de Localizacao',
    }],
    atlasReference: {
      referenceLabel: 'Atlas Ednea Martins, p. 856',
      pdfPages: [873],
    },
  });

  assert.equal(detail.dataOrigin, 'Biblioteca Viva');
  assert.equal(detail.displayCode, 'Anmian');
  assert.equal(detail.reviewStatus, 'approved_local');
  assert.ok(detail.sources.includes('Atlas Ednea Martins, p. 856'));
});

test('referencia do Atlas encontra pontos extras por alias', () => {
  const reference = sourceReferences.findAtlasEdneaSourceReference({
    items: [{
      code: 'EX-HN1',
      displayCode: 'EX-HN1',
      atlasCode: 'Sishencong',
      aliases: ['Sishencong', 'Si Shen Cong'],
      referenceLabel: 'Atlas Ednea Martins, p. 854',
    }],
  }, 'sishencong');

  assert.ok(reference);
  assert.equal(reference.code, 'EX-HN1');
});

test('referencia do Atlas rejeita alias colidente sem codigo seguro', () => {
  const reference = sourceReferences.findAtlasEdneaSourceReference({
    items: [
      {
        code: 'ATLAS-EXTRA-XIXIA',
        aliases: ['Jianxi'],
        referenceLabel: 'Atlas Ednea Martins, p. 870',
      },
      {
        code: 'ATLAS-EXTRA-JIANXI',
        aliases: ['Jianxi'],
        referenceLabel: 'Atlas Ednea Martins, p. 871',
      },
    ],
  }, 'Jianxi');

  assert.equal(reference, null);
});

test('referencia do Atlas prioriza atlasCode unico sobre alias colidente', () => {
  const reference = sourceReferences.findAtlasEdneaSourceReference({
    items: [
      {
        code: 'ATLAS-EXTRA-XIXIA',
        atlasCode: 'Xixia',
        aliases: ['Jianxi'],
        referenceLabel: 'Atlas Ednea Martins, p. 870',
      },
      {
        code: 'ATLAS-EXTRA-JIANXI',
        atlasCode: 'Jianxi',
        aliases: ['Jianxi'],
        referenceLabel: 'Atlas Ednea Martins, p. 871',
      },
    ],
  }, 'Jianxi');

  assert.ok(reference);
  assert.equal(reference.code, 'ATLAS-EXTRA-JIANXI');
});

test('ficha do ponto não exibe placeholders de curadoria como dado clínico', () => {
  const detail = pointDetails.buildPointDetail({
    pointKey: 'ST19',
    reviews: [{
      code: 'ST19',
      displayCode: 'E19',
      status: 'approved_local',
      title: 'E19 - Burong',
      actions: ['Funções/ações não confirmadas nas fontes automáticas; revisar literatura profissional antes de uso.'],
      indications: ['Indicações não confirmadas nas fontes automáticas; preencher apenas após revisão profissional.'],
      relatedPatterns: ['Padrões MTC não inferidos com segurança; definir pela anamnese e auditoria profissional.'],
      needling: 'Técnica não localizada com fonte suficiente; revisar literatura profissional antes de uso.',
    }],
  });

  assert.deepEqual(detail.actions, []);
  assert.deepEqual(detail.indications, []);
  assert.deepEqual(detail.relatedPatterns, []);
  assert.equal(detail.needling, '');
});

test('ficha do ponto bloqueia conteudo original nao pt-BR sem sintese revisada', () => {
  const detail = pointDetails.buildPointDetail({
    pointKey: 'LU1',
    reviews: [{
      code: 'LU1',
      displayCode: 'P1',
      status: 'approved_local',
      title: 'LU1 - English raw source',
      locationText: 'On the chest, lateral to the anterior median line.',
      actions: ['descends Lung Qi'],
      indications: ['cough'],
      techniques: ['needle'],
      needling: 'Perpendicular insertion.',
      languagePolicy: {
        originalLanguage: 'en',
        pointPageLanguage: 'original',
        allowRawOriginalInPointPages: false,
        ptBrReviewed: false,
      },
    }],
  });

  assert.equal(detail.dataOrigin, 'Biblioteca Viva (aguardando pt-BR)');
  assert.equal(detail.locationText, '');
  assert.deepEqual(detail.actions, []);
  assert.deepEqual(detail.indications, []);
  assert.deepEqual(detail.techniques, []);
  assert.equal(detail.needling, '');
  assert.match(detail.clinicalNote, /sintese pt-BR revisada/i);
});

test('fontes PDF calculam confiabilidade sem aprovar rascunho automaticamente', () => {
  const draft = {
    code: 'LU1',
    displayCode: 'P1',
    title: 'P1 - Pulmao',
    status: 'review',
    sourceCandidateCounts: { highConfidenceLinks: 2 },
  };
  const rows = pdfSourceLearning.buildPdfLearningRows({
    drafts: [draft],
    links: [
      {
        code: 'LU1',
        confidence: 0.96,
        confidenceLabel: 'high',
        source: { key: 'ednea', title: 'Atlas pt-BR', originalLanguage: 'pt-BR' },
        page: { pdfPage: 52 },
        snippet: 'P-1 localizacao em portugues.',
      },
      {
        code: 'LU1',
        confidence: 0.94,
        confidenceLabel: 'high',
        source: { key: 'sumiko', title: 'Fonte inglesa', originalLanguage: 'en' },
        page: { pdfPage: 88 },
        snippet: 'On the chest, lateral to the anterior median line.',
      },
    ],
    reviews: [],
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].unanswered, true);
  assert.ok(rows[0].reliability.pointLinkPercent >= 94);
  assert.ok(rows[0].reliability.translationPercent < 100);
  assert.ok(rows[0].reliability.overallPercent >= 80);
});

test('fontes PDF traduzem trecho ingles como pt-BR preliminar', () => {
  const translated = pdfSourceLearning.translatePdfSnippetPtBr({
    source: { originalLanguage: 'en' },
    snippet: 'On the chest, lateral to the anterior median line, in the depression.',
  });

  assert.equal(translated.mode, 'preliminary_pt_br_translation');
  assert.match(translated.text, /No torax/i);
  assert.match(translated.text, /linha mediana anterior/i);
  assert.ok(translated.reliabilityPercent < 100);
});

test('revisões locais substituem pacote automático ao mesclar por código normalizado', () => {
  const merged = knowledgeAdminService.mergeKnowledgeReviews(
    [{ code: 'LI4', displayCode: 'IG4', title: 'Pacote automático' }],
    [{ code: 'IG4', displayCode: 'IG4', title: 'Revisão manual' }],
  );

  assert.equal(merged.length, 1);
  assert.equal(merged[0].title, 'Revisão manual');
});

test('aprovação local substitui rascunho profundo ao mesclar Biblioteca Viva', () => {
  const merged = knowledgeAdminService.mergeKnowledgeReviews(
    [{ code: 'EX-HN1', status: 'review', title: 'Rascunho profundo' }],
    [{ code: 'EX-HN1', status: 'approved_local', title: 'Sishencong aprovado localmente' }],
  );

  assert.equal(merged.length, 1);
  assert.equal(merged[0].status, 'approved_local');
  assert.equal(merged[0].title, 'Sishencong aprovado localmente');
});

test('coordenadas automáticas de alta confiança entram como rascunho visual', () => {
  // Amostra do acervo completo (SuperAdm): um rascunho automático qualquer que
  // NÃO seja ponto comum recalibrado continua entrando como rascunho não aprovado.
  const autoLocation = mapLocations.getAllMapLocations().find(location => {
    return location.calibrationStatus === 'draft_auto_high_confidence'
      && location.mapId === 'body_front'
      && location.yPct > 40;
  });

  assert.ok(autoLocation);
  assert.equal(autoLocation.approved, false);
  assert.equal(autoLocation.sourceConfidence, 'confidence high (>80%)');
});

test('coordenadas automáticas de confiança média entram como rascunho visual auditável', () => {
  const autoLocation = mapLocations.getAllMapLocations().find(location => {
    return location.calibrationStatus === 'draft_auto_medium_confidence';
  });

  assert.ok(autoLocation);
  assert.equal(autoLocation.approved, false);
  assert.equal(autoLocation.requiresProfessionalAudit, true);
  assert.equal(autoLocation.sourceConfidence, 'confidence medium / pending_atlas_review');
  // BL57 segue disponível no seletor de calibração do SuperAdm (acervo completo).
  assert.ok(mapLocations.calibrationPointOptions.includes('BL57'));
});

test('mapa expõe mais de 200 coordenadas funcionais sem aprovar rascunhos automáticos', () => {
  const allLocations = mapLocations.getAllMapLocations();
  const autoDrafts = allLocations.filter(location => location.calibrationStatus === 'draft_auto_high_confidence');

  assert.ok(allLocations.length > 200);
  assert.ok(autoDrafts.length > 100);
  assert.ok(autoDrafts.every(location => location.approved === false));
  assert.ok(mapLocations.calibrationPointOptions.length > 200);
  assert.ok(mapLocations.calibrationPointOptions.includes('LU1'));
  assert.ok(mapLocations.calibrationPointOptions.includes('BL67'));
  assert.ok(mapLocations.calibrationPointOptions.includes('Shen Men'));
  // BL67 fica no canto ungueal do 5º dedo do pé: como ponto comum recalibrado,
  // tem marcador único no mapa dos pés (roteamento canônico para feet_dorsal).
  const bl67 = withoutBodyFull(mapLocations.getLocationsForPoint('BL67'));
  assert.equal(bl67.length, 1);
  assert.equal(bl67[0].mapId, 'feet_dorsal');
});

test('mapa auricular expõe pontos dos PDFs como rascunhos auditáveis', () => {
  const earLocations = mapLocations.getAllMapLocations()
    .filter(location => location.mapId === 'ear_lateral');
  const pdfDrafts = earLocations.filter(location => location.calibrationStatus === 'draft_auto_auricular_pdf');
  const pulmao = mapLocations.getLocationsForPoint('Pulmão')
    .find(location => location.code === 'auricular:pulmao');
  const vesicula = mapLocations.getLocationsForPoint('Vesícula biliar')
    .find(location => location.code === 'auricular:vesicula-biliar');

  assert.ok(earLocations.length > 70);
  assert.ok(pdfDrafts.length > 60);
  assert.ok(pdfDrafts.every(location => location.approved === false));
  assert.ok(pdfDrafts.every(location => location.requiresProfessionalAudit === true));
  assert.ok(pulmao);
  assert.equal(pulmao.mapId, 'ear_lateral');
  assert.ok(vesicula);
  assert.ok(mapLocations.calibrationPointOptions.includes('Pulmão'));
  assert.ok(mapLocations.calibrationPointOptions.includes('Vesícula biliar'));
});

test('ajuste manual de coordenada por acupunturista aprova visualmente em modo local', () => {
  const hadLocalStorage = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage');
  const originalLocalStorage = globalThis.localStorage;
  const store = new Map();

  globalThis.localStorage = {
    getItem: key => store.get(key) || null,
    setItem: (key, value) => {
      store.set(key, String(value));
    },
  };

  try {
    const saved = mapLocations.upsertStoredMapLocation({
      code: 'LI4',
      mapId: 'hands_dorsal',
      view: 'dorsal',
      xPct: 66.25,
      yPct: 79.5,
    }, {
      actorRole: 'therapist',
      actorLabel: 'acupunturista',
    });
    const persisted = mapLocations.readStoredMapLocations()[0];

    assert.equal(saved.approved, true);
    assert.equal(saved.calibrationStatus, 'approved_local_visual');
    assert.equal(saved.coordinateConfidence, 'confirmed_visual_local');
    assert.equal(saved.approvalMode, 'local_only');
    assert.equal(saved.approvalMethod, 'therapist_map_coordinate_auto_approval');
    assert.equal(saved.requiresProfessionalAudit, true);
    assert.equal(saved.approvedByRole, 'therapist');
    assert.equal(saved.approvedByLabel, 'acupunturista');
    assert.match(saved.source, /aprovado automaticamente por acupunturista/i);
    assert.deepEqual(persisted, saved);
  } finally {
    mapLocations.writeStoredMapLocations([]);
    if (hadLocalStorage) {
      globalThis.localStorage = originalLocalStorage;
    } else {
      delete globalThis.localStorage;
    }
  }
});

test('ajuste manual de coordenada pelo SuperAdm registra auditoria com ator correto', () => {
  const hadLocalStorage = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage');
  const originalLocalStorage = globalThis.localStorage;
  const store = new Map();

  globalThis.localStorage = {
    getItem: key => store.get(key) || null,
    setItem: (key, value) => {
      store.set(key, String(value));
    },
  };

  try {
    const saved = mapLocations.upsertStoredMapLocation({
      code: 'LI4',
      mapId: 'hands_dorsal',
      view: 'dorsal',
      xPct: 66.25,
      yPct: 79.5,
    }, {
      actorRole: 'super_admin',
      actorLabel: 'SuperAdm',
    });

    assert.equal(saved.approved, true);
    assert.equal(saved.calibrationStatus, 'approved_local_visual');
    assert.equal(saved.approvalMethod, 'super_admin_map_coordinate_auto_approval');
    assert.equal(saved.approvedByRole, 'super_admin');
    assert.equal(saved.approvedByLabel, 'SuperAdm');
    assert.match(saved.source, /aprovado automaticamente por SuperAdm/i);
    assert.doesNotMatch(saved.source, /acupunturista/i);
  } finally {
    mapLocations.writeStoredMapLocations([]);
    if (hadLocalStorage) {
      globalThis.localStorage = originalLocalStorage;
    } else {
      delete globalThis.localStorage;
    }
  }
});

test('pontos comuns recalibrados ficam em marcador único no mapa anatômico correto', () => {
  // Os 126 pontos corporais comuns foram recalibrados para as imagens
  // unilaterais: um único marcador por ponto, no mapa da região canônica,
  // com status pendente de confirmação profissional.
  const cases = [
    ['LR3', 'feet_dorsal'],
    ['ST36', 'legs_front'],
    ['SP6', 'legs_front'],
    ['LI4', 'hands_dorsal'],
    ['PC6', 'hands_palmar'],
    ['LI10', 'hands_dorsal'], // rótulo da curadoria dizia "Pernas"; anatomia é antebraço
    ['SP4', 'feet_plantar'], // rótulo dizia "Mãos"; anatomia é pé medial
    ['ST25', 'body_front'], // abdome, não perna
  ];

  for (const [code, expectedMap] of cases) {
    const locations = withoutBodyFull(mapLocations.getLocationsForPoint(code));
    const overview = mapLocations.getLocationsForPoint(code).find(location => location.mapId === 'body_full');
    assert.equal(locations.length, 1, `${code} deveria ter um único marcador segmentado`);
    assert.ok(overview, `${code} deveria ter marcador no mapa corporal inteiro`);
    assert.equal(overview.calibrationStatus, 'body_full_projection_pending');
    const [location] = locations;
    assert.equal(location.mapId, expectedMap, `${code} no mapa errado`);
    assert.equal(location.calibrationStatus, 'recalibrated_local_pending');
    assert.equal(location.requiresProfessionalAudit, true);
    assert.equal(location.approved, false);
    assert.ok(location.xPct >= 0 && location.xPct <= 100);
    assert.ok(location.yPct >= 0 && location.yPct <= 100);
  }

  // Roteamento anatômico preservado: ST36/LR3 não vazam para o torso.
  assert.equal(mapLocations.getLocationsForPoint('ST36').some(location => location.mapId === 'body_front'), false);
  assert.equal(mapLocations.getLocationsForPoint('LR3').some(location => location.mapId === 'body_front'), false);
});

test('ficha do ponto ignora revisão não aprovada na conduta clínica', () => {
  const detail = pointDetails.buildPointDetail({
    pointKey: 'LI4',
    patternName: 'Ascensão do Yang do Fígado',
    reviews: [{
      code: 'LI4',
      displayCode: 'IG4',
      status: 'review',
      title: 'Não aprovado',
      locationText: 'Não deve aparecer como fonte principal.',
    }],
  });

  assert.equal(detail.dataOrigin, 'Base curada');
  assert.notEqual(detail.name, 'Não aprovado');
});

test('auditoria de pontos corporais curados por meridiano e tratamento de erros do KM-Agent', async () => {
  const knowledgeBase = await server.ssrLoadModule('/src/knowledge/knowledgeBase.js');
  const acupoints = knowledgeBase.acupoints;

  // 1. Verificar se novos pontos clássicos oficiais gerados (ex: LU1) estão presentes e aprovados
  const lu1 = acupoints.find(p => p.code === 'LU1');
  assert.ok(lu1);
  assert.equal(lu1.approval.status, 'approved');
  assert.equal(lu1.officialChinese, true);

  // 2. Verificar se pontos de marcadores inválidos (SA, AA) foram devidamente filtrados/removidos
  const saPoints = acupoints.filter(p => p.code.startsWith('SA') || p.meridian?.code === 'SA');
  const aaPoints = acupoints.filter(p => p.code.startsWith('AA') || p.meridian?.code === 'AA');
  assert.equal(saPoints.length, 0);
  assert.equal(aaPoints.length, 0);

  // 3. Verificar se pontos extraordinários sem localização foram desativados/descartados
  // (EX-HN3 Yintang e EX-HN5 Taiyang são curados manualmente, com localização definida)
  const allowedExtraPoints = new Set(['EX-HN3', 'EX-HN5']);
  const exPoints = acupoints.filter(p => p.code.startsWith('EX-') && !allowedExtraPoints.has(p.code));
  assert.equal(exPoints.length, 0);
  const taiyang = acupoints.find(p => p.code === 'EX-HN5');
  assert.ok(taiyang);
  assert.ok(taiyang.locationText);

  // 4. Verificar se os 33 pontos curados manualmente de alta nobreza clínica continuam ativos e preservados
  const st36 = acupoints.find(p => p.code === 'ST36');
  assert.ok(st36);
  assert.equal(st36.names.pt, 'Zusanli'); // nome manual preservado

  // 5. Verificar placeholders de agulhamento para pontos que estavam sem dados
  const te21 = acupoints.find(p => p.code === 'TE21');
  const gb28 = acupoints.find(p => p.code === 'GB28');
  const gv11 = acupoints.find(p => p.code === 'GV11');

  assert.ok(te21);
  assert.match(te21.needlingText, /perpendicular/i);
  assert.ok(gb28);
  assert.match(gb28.needlingText, /perpendicular/i);
  assert.ok(gv11);
  assert.match(gv11.needlingText, /obl[ií]qua/i);
});

// ── Pulso: qualidades palpadas vs sinais associados ───────────────────────────

test('qualidade palpada mantém peso de evidência de pulso', () => {
  const profile = analyzer.diagnosticProfile(
    { queixa: '', historia: '', medicacoes: '' },
    { 'pulso:esquerdo:p8:Pulso tenso': true },
  );

  assert.equal(profile.parts.pulse, 7);
});

test('sinal associado do pulso pesa como sintoma, não como palpação', () => {
  const profile = analyzer.diagnosticProfile(
    { queixa: '', historia: '', medicacoes: '' },
    { 'pulsoSinal:direito:p8:Fadiga pós-prandial': true },
  );

  assert.equal(profile.parts.pulse, 0);
  assert.equal(profile.parts.symptoms, 4);
});

test('sinal associado não conta em dobro quando já marcado na anamnese', () => {
  const state = { queixa: '', historia: '', medicacoes: '' };
  const semSinal = analyzer.diagnosticProfile(state, {
    'digestao:Distensão abdominal': true,
  });
  const comSinal = analyzer.diagnosticProfile(state, {
    'digestao:Distensão abdominal': true,
    'pulsoSinal:direito:p8:Distensão abdominal': true,
  });

  assert.equal(comSinal.parts.pulse, 0);
  assert.equal(comSinal.parts.symptoms, semSinal.parts.symptoms);
  assert.equal(comSinal.confidence, semSinal.confidence);
});

test('chave legada de sinal associado sob "pulso:" é reclassificada como sintoma', () => {
  const profile = analyzer.diagnosticProfile(
    { queixa: '', historia: '', medicacoes: '' },
    { 'pulso:direito:p8:Distensão abdominal': true },
  );

  assert.equal(profile.parts.pulse, 0);
  assert.equal(profile.parts.symptoms, 4);
});

test('sinais associados continuam alimentando o texto clínico da análise', () => {
  const result = analyzer.analyze(
    { queixa: '', historia: '', medicacoes: '' },
    {
      'pulsoSinal:esquerdo:p9:Ansiedade': true,
      'pulsoSinal:esquerdo:p9:Insônia': true,
      'pulsoSinal:esquerdo:p9:Palpitação': true,
    },
  );

  assert.equal(result.main, 'Agitação do Shen por Calor');
});

// ── Sugestão da sessão: limite, grupos e separação sistêmico/auricular ────────

const SUGGESTION_STATE = {
  queixa: 'Cefaleia com tensão cervical, insônia, ansiedade, refluxo, distensão abdominal, fadiga, dor lombar e rinite.',
  historia: 'Quadro recorrente com piora ao estresse, TPM e edema em membros inferiores.',
  medicacoes: '',
};

const SUGGESTION_MAP = {
  'sintomas:Insônia': true,
  'sintomas:Fadiga': true,
  'sintomas:Refluxo': true,
  'digestao:Distensão abdominal': true,
  'dor:Rigidez': true,
  'sono:Despertares frequentes': true,
  'emocoes:Ansiedade/agitação mental': true,
  'pulso:esquerdo:p8:Pulso em corda': true,
};

test('sugestão da sessão respeita limite de 15 sistêmicos e separa auriculares', () => {
  const analysis = analyzer.analyze(SUGGESTION_STATE, SUGGESTION_MAP);
  const suggestion = pointRecommendations.buildSessionSuggestion({
    state: SUGGESTION_STATE,
    selectedMap: SUGGESTION_MAP,
    analysis,
  });

  assert.ok(suggestion.systemic.length > 0);
  assert.ok(suggestion.systemic.length <= 15);
  assert.ok(suggestion.systemic.every(item => !String(item.point.code).startsWith('auricular:')));
  assert.ok(suggestion.auricular.every(item => String(item.point.code).startsWith('auricular:')));
  assert.equal(suggestion.limits.systemicLimit, 15);

  // Por padrão, a base analisada é a categoria "Pontos comumente usados"
  assert.equal(suggestion.candidateStats.commonlyUsedOnly, true);
});

test('grupos essential/complementary/optional particionam a sugestão sistêmica', () => {
  const analysis = analyzer.analyze(SUGGESTION_STATE, SUGGESTION_MAP);
  const suggestion = pointRecommendations.buildSessionSuggestion({
    state: SUGGESTION_STATE,
    selectedMap: SUGGESTION_MAP,
    analysis,
  });

  const grouped = [
    ...suggestion.groups.essential,
    ...suggestion.groups.complementary,
    ...suggestion.groups.optional,
  ];
  assert.equal(grouped.length, suggestion.systemic.length);
  assert.ok(suggestion.systemic.every(item =>
    ['essential', 'complementary', 'optional'].includes(item.group)));

  // Pontos do protocolo-base do padrão principal entram como essenciais
  const protocolCodes = new Set(analysis.protocol.bodyCodes || []);
  const essentialCodes = new Set(suggestion.groups.essential.map(item => item.point.code));
  for (const item of suggestion.systemic) {
    if (protocolCodes.has(item.point.code)) {
      assert.ok(essentialCodes.has(item.point.code), `${item.point.code} do protocolo-base deveria ser essencial`);
    }
  }
});

// ── Síntese ao vivo do assistente ─────────────────────────────────────────────

test('assistantSynthesis grada a hipótese por origem e gera diferencial', () => {
  const synthesis = analyzer.assistantSynthesis(
    { queixa: '', historia: '', medicacoes: '' },
    {
      'lingua:vermelha': true,
      'pulso:esquerdo:p8:Pulso em corda': true,
      'sintomas:Cefaleia': true,
      'sintomas:Irritabilidade': true,
    },
  );

  assert.equal(synthesis.primaryName, 'Ascensão do Yang do Fígado');
  assert.ok(synthesis.primaryPercent > 0);
  // Língua + pulso + sintoma → confiança alta, com motivo descrito.
  assert.equal(synthesis.confidence.level, 'Alta');
  assert.match(synthesis.confidence.reason, /língua/);
  assert.match(synthesis.reading, /Ascensão do Yang do Fígado/);
});

test('assistantSynthesis sem dados não inventa confiança', () => {
  const synthesis = analyzer.assistantSynthesis(
    { queixa: '', historia: '', medicacoes: '' },
    {},
  );

  assert.equal(synthesis.primaryName, 'Aguardando dados');
  assert.equal(synthesis.confidence.level, 'Baixa');
  assert.equal(synthesis.primaryPercent, 0);
  assert.equal(synthesis.differential, null);
});

test('assistantSynthesis prioriza próxima ação de desempate quando diferencial aberto', () => {
  const synthesis = analyzer.assistantSynthesis(
    { queixa: '', historia: '', medicacoes: '' },
    {
      // Um sinal de Fígado e um de Baço/Estômago, sem fonte objetiva dominante.
      'sintomas:Irritabilidade': true,
      'digestao:Refluxo': true,
    },
  );

  if (synthesis.isOpenDifferential) {
    assert.match(synthesis.nextAction, /separar/i);
    assert.ok(synthesis.differential);
  } else {
    assert.ok(synthesis.nextAction.length > 0);
  }
});

test('limite sistêmico da sugestão é configurável', () => {
  const analysis = analyzer.analyze(SUGGESTION_STATE, SUGGESTION_MAP);
  const suggestion = pointRecommendations.buildSessionSuggestion({
    state: SUGGESTION_STATE,
    selectedMap: SUGGESTION_MAP,
    analysis,
    systemicLimit: 5,
  });

  assert.equal(suggestion.systemic.length, 5);
});
