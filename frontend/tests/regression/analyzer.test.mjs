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
let sourceReferences;
let mapLocations;

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
  sourceReferences = await server.ssrLoadModule('/src/knowledge/sourceReferences.js');
  mapLocations = await server.ssrLoadModule('/src/knowledge/mapLocations.js');
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
  const lu1Locations = mapLocations.getLocationsForPoint('LU1');
  const autoLocation = lu1Locations.find(location => location.calibrationStatus === 'draft_auto_high_confidence');

  assert.ok(autoLocation);
  assert.equal(autoLocation.approved, false);
  assert.equal(autoLocation.sourceConfidence, 'confidence high (>80%)');
  assert.equal(autoLocation.mapId, 'body_front');
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
