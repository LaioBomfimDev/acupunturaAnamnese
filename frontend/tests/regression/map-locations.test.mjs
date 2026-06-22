import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let server;
let mapLocations;
let mapRouting;
let commonlyUsedPoints;

const BODY_FULL_MAP_ID = 'body_full';

function segmentedLocations(locations) {
  return locations.filter(location => location.mapId !== BODY_FULL_MAP_ID);
}

function bodyFullLocation(locations) {
  return locations.find(location => location.mapId === BODY_FULL_MAP_ID) || null;
}

before(async () => {
  server = await createServer({
    root,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  });
  mapLocations = await server.ssrLoadModule('/src/knowledge/mapLocations.js');
  mapRouting = await server.ssrLoadModule('/src/knowledge/mapRouting.js');
  commonlyUsedPoints = await server.ssrLoadModule('/src/knowledge/commonlyUsedPoints.js');
});

after(async () => {
  await server?.close();
});

test('toda localização passa na validação canônica de região e mapa', () => {
  const { errors, stats } = mapLocations.validateMapLocations();

  assert.deepEqual(errors, []);
  assert.ok(stats.total > 200);
});

test('tabela canônica cobre todos os pontos dos 14 meridianos clássicos', () => {
  const expectedCounts = {
    LU: 11, LI: 20, ST: 45, SP: 21, HT: 9, SI: 19, BL: 67,
    KI: 27, PC: 9, TE: 23, GB: 44, LR: 14, CV: 24, GV: 28,
  };

  for (const [meridian, count] of Object.entries(expectedCounts)) {
    for (let number = 1; number <= count; number += 1) {
      const region = mapRouting.getCanonicalRegion(`${meridian}${number}`);
      assert.ok(region, `${meridian}${number} sem região canônica`);
      assert.ok(
        mapRouting.getAllowedMapIds(region).length > 0,
        `região ${region} de ${meridian}${number} sem mapas permitidos`,
      );
    }
  }
});

test('pontos de pé e tornozelo são roteados para os mapas de pés', () => {
  const bl67 = segmentedLocations(mapLocations.getLocationsForPoint('BL67'));
  const gb40 = segmentedLocations(mapLocations.getLocationsForPoint('GB40'));
  const ki1 = segmentedLocations(mapLocations.getLocationsForPoint('KI1'));

  assert.ok(bl67.some(location => location.mapId === 'feet_dorsal'));
  assert.ok(gb40.some(location => location.mapId === 'feet_dorsal'));
  assert.ok(ki1.every(location => location.mapId === 'feet_plantar'));
});

test('mão dorsal e palmar não se misturam', () => {
  const li4 = segmentedLocations(mapLocations.getLocationsForPoint('LI4'));
  const te5 = segmentedLocations(mapLocations.getLocationsForPoint('TE5'));
  const pc6 = segmentedLocations(mapLocations.getLocationsForPoint('PC6'));
  const li1 = segmentedLocations(mapLocations.getLocationsForPoint('LI1'));

  assert.ok(li4.every(location => location.mapId === 'hands_dorsal'));
  assert.ok(te5.every(location => location.mapId === 'hands_dorsal'));
  assert.ok(pc6.every(location => location.mapId === 'hands_palmar'));
  assert.ok(li1.every(location => location.mapId === 'hands_dorsal'));
});

test('rascunho de ponto da face desenhado no mapa das costas é sinalizado para revisão', () => {
  // SI18 saiu da lista: agora é ponto comum recalibrado autoritativamente no
  // body_front, então não há mais rascunho conflitante para sinalizar.
  const flaggedCodes = ['BL1', 'BL2', 'GV25', 'GV26', 'GV27'];

  for (const code of flaggedCodes) {
    const flagged = mapLocations.getLocationsForPoint(code)
      .filter(location => location.reviewStatus === 'review_map_mismatch');
    assert.ok(flagged.length > 0, `${code} deveria estar sinalizado como review_map_mismatch`);
    assert.ok(flagged.every(location => location.approved !== true));
  }
});

test('pontos comuns de linha mediana ficam no eixo anatômico dos mapas unilaterais', () => {
  // Nas novas imagens meio-corpo a linha média anatômica fica em ~x60, não 50.
  // Cada ponto CV/GV/EX-HN3 comum tem UM único marcador nesse eixo.
  const midlineCommon = mapLocations.getAllMapLocations().filter(location => {
    return mapRouting.isMidlinePoint(location.code)
      && (location.mapId === 'body_front' || location.mapId === 'body_back')
      && location.calibrationStatus === 'recalibrated_local_pending';
  });

  assert.ok(midlineCommon.length > 10);
  assert.ok(midlineCommon.every(location => location.xPct >= 55 && location.xPct <= 65));

  const identities = midlineCommon.map(location => `${location.code}::${location.mapId}`);
  assert.equal(new Set(identities).size, identities.length, 'sem marcador duplicado por ponto');
});

test('ponto comum bilateral aparece como marcador único na imagem unilateral', () => {
  // ST25 (e demais pares) deixam de ter dois lados: um marcador por ponto.
  const st25 = mapLocations.getAllMapLocations()
    .filter(location => location.code === 'ST25' && location.mapId === 'body_front');

  assert.equal(st25.length, 1);
  assert.equal(st25[0].calibrationStatus, 'recalibrated_local_pending');
});

test('coordenadas locais antigas de pontos comuns não duplicam o marcador recalibrado', () => {
  // R3/KI3 reproduz o caso observado: uma coordenada local antiga no dorso do
  // pé não pode coexistir com o marcador único recalibrado dos pontos comuns.
  const hadLocalStorage = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage');
  const originalLocalStorage = globalThis.localStorage;
  const store = new Map();
  globalThis.localStorage = {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => {
      store.set(key, String(value));
    },
  };

  try {
    mapLocations.writeStoredMapLocations([
      { code: 'KI3', mapId: 'feet_dorsal', view: 'dorsal', xPct: 39, yPct: 73, approved: true, calibrationStatus: 'approved_local_visual' },
      { code: 'KI3', mapId: 'feet_dorsal', view: 'dorsal', xPct: 64, yPct: 70, approved: true, calibrationStatus: 'approved_local_visual' },
      { code: 'ST25', mapId: 'body_front', view: 'anterior', xPct: 43, yPct: 85, approved: true, calibrationStatus: 'approved_local_visual' },
      { code: 'PC6', mapId: 'hands_palmar', view: 'palmar', xPct: 31, yPct: 45, approved: true, calibrationStatus: 'approved_local_visual' },
    ]);

    const expectedStoredOverrides = [
      ['R3', 'KI3', 'feet_dorsal', 39, 73],
      ['ST25', 'ST25', 'body_front', 43, 85],
      ['PC6', 'PC6', 'hands_palmar', 31, 45],
    ];

    for (const [query, code, mapId, xPct, yPct] of expectedStoredOverrides) {
      const locations = segmentedLocations(mapLocations.getLocationsForPoint(query));
      assert.equal(locations.length, 1, `${query} deveria ter um marcador único`);
      assert.equal(locations[0].code, code);
      assert.equal(locations[0].mapId, mapId);
      assert.equal(locations[0].xPct, xPct);
      assert.equal(locations[0].yPct, yPct);
    }

    const duplicateCommonCodes = commonlyUsedPoints.commonlyUsedBodyPoints
      .filter(point => segmentedLocations(mapLocations.getLocationsForPoint(point.code)).length !== 1)
      .map(point => point.code);

    assert.deepEqual(duplicateCommonCodes, []);
  } finally {
    mapLocations.writeStoredMapLocations([]);
    if (hadLocalStorage) {
      globalThis.localStorage = originalLocalStorage;
    } else {
      delete globalThis.localStorage;
    }
  }
});

test('alterar mapa de BP3 substitui a posição antiga sem duplicar SP3', () => {
  const hadLocalStorage = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage');
  const originalLocalStorage = globalThis.localStorage;
  const store = new Map();
  globalThis.localStorage = {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => {
      store.set(key, String(value));
    },
  };

  try {
    mapLocations.writeStoredMapLocations([]);
    const original = segmentedLocations(mapLocations.getLocationsForPoint('BP3'))
      .find(location => location.mapId === 'feet_dorsal');
    assert.ok(original, 'BP3/SP3 deveria ter posição inicial no dorso do pé');

    const originalIdentity = mapLocations.getLocationIdentity(original);
    const saved = mapLocations.upsertStoredMapLocation({
      code: 'SP3',
      mapId: 'feet_plantar',
      view: 'plantar',
      xPct: 66,
      yPct: 42,
    }, {
      replaceLocationIdentity: originalIdentity,
      replacedFromMapId: original.mapId,
    });

    const locations = segmentedLocations(mapLocations.getLocationsForPoint('BP3'));
    assert.equal(saved.replacesLocationIdentity, originalIdentity);
    assert.equal(saved.replacedFromMapId, 'feet_dorsal');
    assert.equal(locations.length, 1, 'BP3/SP3 deve ficar com marcador único após alterar mapa');
    assert.equal(locations[0].code, 'SP3');
    assert.equal(locations[0].mapId, 'feet_plantar');
    assert.equal(locations[0].xPct, 66);
    assert.equal(locations[0].yPct, 42);
    assert.deepEqual(mapLocations.validateMapLocations().errors, []);
  } finally {
    mapLocations.writeStoredMapLocations([]);
    if (hadLocalStorage) {
      globalThis.localStorage = originalLocalStorage;
    } else {
      delete globalThis.localStorage;
    }
  }
});

test('mecanismo de identidade por lado preserva os dois lados ao calibrar', () => {
  // O mecanismo bilateral (usado pela biblioteca completa do SuperAdm) continua
  // distinguindo lados por identidade; calibrar um lado não apaga o outro.
  const hadLocalStorage = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage');
  const originalLocalStorage = globalThis.localStorage;
  const store = new Map();
  globalThis.localStorage = {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => {
      store.set(key, String(value));
    },
  };

  try {
    mapLocations.writeStoredMapLocations([]);
    mapLocations.upsertStoredMapLocation({
      code: 'ST26', mapId: 'body_front', view: 'anterior', xPct: 43, yPct: 80,
    });
    mapLocations.upsertStoredMapLocation({
      code: 'ST26', mapId: 'body_front', view: 'anterior', xPct: 57.4, yPct: 80,
    });

    const st26 = mapLocations.getAllMapLocations()
      .filter(location => location.code === 'ST26' && location.mapId === 'body_front');
    const sides = st26.map(mapLocations.getLocationSide).sort();

    assert.equal(st26.length, 2);
    assert.deepEqual(sides, ['left', 'right']);
    const identities = new Set(st26.map(mapLocations.getLocationIdentity));
    assert.equal(identities.size, 2);
    assert.ok(st26.some(location => location.xPct === 43));
    assert.ok(st26.some(location => location.xPct === 57.4));
  } finally {
    mapLocations.writeStoredMapLocations([]);
    if (hadLocalStorage) {
      globalThis.localStorage = originalLocalStorage;
    } else {
      delete globalThis.localStorage;
    }
  }
});

test('ajuste local no corpo inteiro preserva marcador segmentado do ponto comum', () => {
  const hadLocalStorage = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage');
  const originalLocalStorage = globalThis.localStorage;
  const store = new Map();
  globalThis.localStorage = {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => {
      store.set(key, String(value));
    },
  };

  try {
    mapLocations.writeStoredMapLocations([]);
    const saved = mapLocations.upsertStoredMapLocation({
      code: 'LI4', mapId: 'body_full', view: 'anterior', xPct: 48, yPct: 58,
    });
    const locations = mapLocations.getLocationsForPoint('LI4');
    const segmented = segmentedLocations(locations);
    const overview = bodyFullLocation(locations);

    assert.equal(segmented.length, 1);
    assert.equal(segmented[0].mapId, 'hands_dorsal');
    assert.ok(overview);
    assert.equal(overview.mapId, 'body_full');
    assert.equal(overview.xPct, 48);
    assert.equal(overview.yPct, 58);
    assert.equal(overview.approved, true);
    assert.equal(saved.approvalMode, 'local_only');
    assert.deepEqual(mapLocations.validateMapLocations().errors, []);
  } finally {
    mapLocations.writeStoredMapLocations([]);
    if (hadLocalStorage) {
      globalThis.localStorage = originalLocalStorage;
    } else {
      delete globalThis.localStorage;
    }
  }
});

test('rascunho com coordenada incoerente com a região não é reescalado para o lugar errado', () => {
  // BL43-54 (segunda linha das costas) foram gerados com y de coxa;
  // precisam ficar pendentes de revisão em vez de virar pontos de perna.
  const bl47 = mapLocations.getLocationsForPoint('BL47');
  const flagged = bl47.find(location => location.reviewStatus === 'review_map_mismatch');

  assert.ok(flagged);
  assert.equal(flagged.mapId, 'body_back');
  assert.ok(bl47.every(location => location.mapId !== 'legs_back'));
});

test('todo ponto corporal comumente usado tem marcador único em mapa válido', () => {
  const bodyPoints = commonlyUsedPoints.commonlyUsedBodyPoints;
  assert.equal(bodyPoints.length, 126);

  const BODY_MAPS = new Set([
    'body_front', 'body_back', 'legs_front', 'legs_back',
    'hands_palmar', 'hands_dorsal', 'feet_dorsal', 'feet_plantar',
  ]);

  for (const point of bodyPoints) {
    const locations = mapLocations.getLocationsForPoint(point.code);
    const segmented = segmentedLocations(locations);
    const overview = bodyFullLocation(locations);

    assert.equal(segmented.length, 1, `${point.code} deveria ter exatamente um marcador segmentado, tem ${segmented.length}`);
    assert.ok(overview, `${point.code} deveria ter marcador no mapa corporal inteiro`);
    assert.equal(overview.calibrationStatus, 'body_full_projection_pending');
    assert.equal(overview.overviewProjection, true);
    assert.equal(overview.approved, false);
    assert.ok(overview.xPct >= 0 && overview.xPct <= 100, `${point.code} xPct body_full fora de faixa`);
    assert.ok(overview.yPct >= 0 && overview.yPct <= 100, `${point.code} yPct body_full fora de faixa`);

    const [location] = segmented;
    assert.ok(BODY_MAPS.has(location.mapId), `${point.code} em mapa não corporal ${location.mapId}`);

    // O mapa precisa pertencer à região anatômica canônica do ponto.
    const allowed = mapRouting.getAllowedMapIds(point.code);
    if (allowed.length) {
      assert.ok(allowed.includes(location.mapId), `${point.code} em ${location.mapId} fora de ${allowed.join('/')}`);
    }

    assert.ok(location.xPct >= 0 && location.xPct <= 100, `${point.code} xPct fora de faixa`);
    assert.ok(location.yPct >= 0 && location.yPct <= 100, `${point.code} yPct fora de faixa`);
    assert.equal(location.calibrationStatus, 'recalibrated_local_pending');
  }
});

test('conjunto completo de localizações continua sem erros de validação', () => {
  const { errors } = mapLocations.validateMapLocations();
  assert.deepEqual(errors, []);
});

test('pontos auriculares só aparecem em mapas de orelha e vice-versa', () => {
  for (const location of mapLocations.getAllMapLocations()) {
    const isAuricular = String(location.code || '').startsWith('auricular:');
    const isEarMap = location.mapId.startsWith('ear_');
    assert.equal(isAuricular, isEarMap, `${location.code} em ${location.mapId}`);
  }
});
