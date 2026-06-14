import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let server;
let tongueData;
let tongueAiService;
let tongueMediaService;
let clinicState;
let analyzer;

before(async () => {
  server = await createServer({
    root,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  });
  tongueData = await server.ssrLoadModule('/src/data/tongueData.js');
  tongueAiService = await server.ssrLoadModule('/src/services/tongueAiService.js');
  tongueMediaService = await server.ssrLoadModule('/src/services/tongueMediaService.js');
  clinicState = await server.ssrLoadModule('/src/hooks/useClinicState.js');
  analyzer = await server.ssrLoadModule('/src/utils/analyzer.js');
});

after(async () => {
  await server?.close();
});

test('toda tag do tongueAiTagMap aponta para um item existente do checklist', () => {
  const { tongueAiTagMap, tongueOrganAlterations } = tongueData;

  for (const [tag, entry] of Object.entries(tongueAiTagMap)) {
    const organ = tongueOrganAlterations[entry.organ];
    assert.ok(organ, `tag "${tag}" referencia órgão inexistente: "${entry.organ}"`);
    assert.ok(
      organ.items.includes(entry.item),
      `tag "${tag}" referencia item inexistente em "${entry.organ}": "${entry.item}"`
    );
  }
});

test('resolveTongueAiTag retorna grupo no formato do selectedMap e null para tag desconhecida', () => {
  const { resolveTongueAiTag } = tongueData;

  const resolved = resolveTongueAiTag('swollen_center');
  assert.equal(resolved.group, 'linguaOrgao:Estômago e Baço');
  assert.equal(resolved.item, 'Centro inchado');

  assert.equal(resolveTongueAiTag('tag_que_nao_existe'), null);
});

test('achados do mock referenciam apenas tags mapeadas', async () => {
  const { mockAnalyzeTongueImages } = tongueAiService;
  const { resolveTongueAiTag } = tongueData;

  const result = await mockAnalyzeTongueImages({ top: { name: 'top.webp' }, sublingual: { name: 'sub.webp' } });

  assert.ok(result.modelVersion, 'resposta deve declarar a versão do modelo');
  assert.ok(result.findings.length > 0, 'mock deve retornar achados');

  for (const finding of result.findings) {
    assert.ok(finding.id && finding.title && finding.pattern, 'achado deve ter id, título e padrão');
    assert.ok(finding.confidence > 0 && finding.confidence <= 1, 'confiança deve estar em (0, 1]');
    for (const tag of finding.suggestedTags) {
      assert.ok(resolveTongueAiTag(tag), `achado "${finding.id}" usa tag não mapeada: "${tag}"`);
    }
  }
});

test('análise sem foto superior é rejeitada e sublingual habilita achados de estase', async () => {
  const { analyzeTongueImages, mockAnalyzeTongueImages } = tongueAiService;

  // O despachante real rejeita antes de qualquer chamada externa
  await assert.rejects(() => analyzeTongueImages({ top: null }));

  const semSublingual = await mockAnalyzeTongueImages({ top: { name: 'top.webp' } });
  const comSublingual = await mockAnalyzeTongueImages({ top: { name: 'top.webp' }, sublingual: { name: 'sub.webp' } });

  assert.ok(
    !semSublingual.findings.some(f => f.type === 'sublingual'),
    'sem foto sublingual não deve haver achados sublinguais'
  );
  assert.ok(
    comSublingual.findings.some(f => f.type === 'sublingual'),
    'com foto sublingual deve haver achado de estase'
  );
});

test('faixas de confiança comunicam alta/média/baixa', async () => {
  const { confidenceBand } = tongueAiService;

  assert.equal(confidenceBand(0.86).label, 'alta');
  assert.equal(confidenceBand(0.72).label, 'média');
  assert.equal(confidenceBand(0.55).label, 'baixa');
});

// Simula o fluxo "Aceitar" no nível de dados: tags do achado são resolvidas
// e marcadas no selectedMap exatamente como o painel Língua faz.
function acceptTagsIntoSelectedMap(tags, selectedMap = {}) {
  const { resolveTongueAiTag } = tongueData;
  for (const tag of tags) {
    const resolved = resolveTongueAiTag(tag);
    if (resolved) selectedMap[`${resolved.group}:${resolved.item}`] = true;
  }
  return selectedMap;
}

const emptyState = { queixa: '', historia: '', medicacoes: '' };

test('achado aceito pesa como evidência de língua no perfil diagnóstico', () => {
  const selectedMap = acceptTagsIntoSelectedMap(['swollen_center', 'teeth_marks']);
  const profile = analyzer.diagnosticProfile(emptyState, selectedMap);

  assert.equal(profile.parts.tongue, 2 * 7, 'dois itens de língua devem pesar 14 (peso 7 cada)');
});

test('itens do checklist por órgão não contam em dobro com grupos legados', () => {
  const profile = analyzer.diagnosticProfile(emptyState, {
    'lingua:Pálida': true,
    'linguaOrgao:Estômago e Baço:Centro pálido': true,
  });

  assert.equal(profile.parts.tongue, 2 * 7, 'um item legado + um por órgão = exatamente 2 evidências');
});

test('achado aceito alimenta o texto clínico e o perfil patogênico', () => {
  const selectedMap = acceptTagsIntoSelectedMap(['thick_center_coating', 'greasy_coating']);
  const profile = analyzer.diagnosticProfile(emptyState, selectedMap);

  assert.ok(
    profile.pathogenic.includes('Umidade/Fleuma'),
    'saburra espessa/gordurosa aceita deve sugerir Umidade/Fleuma'
  );
});

test('achado ignorado (não marcado) não altera o diagnóstico', () => {
  const semNada = analyzer.diagnosticProfile(emptyState, {});
  // Ignorar um achado não escreve nada no selectedMap — o perfil deve ser idêntico
  const comIgnorado = analyzer.diagnosticProfile(emptyState, {});

  assert.equal(comIgnorado.confidence, semNada.confidence);
  assert.equal(comIgnorado.parts.tongue, 0);
});

// ===== Fase 5: Edge Function de IA real =====

test('tags permitidas da Edge Function analyze-tongue espelham o tongueAiTagMap', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(
    path.resolve(root, '../supabase/functions/analyze-tongue/index.ts'),
    'utf8'
  );

  const match = source.match(/const ALLOWED_TAGS = \[([\s\S]*?)\];/);
  assert.ok(match, 'ALLOWED_TAGS não encontrado na Edge Function');
  const edgeTags = [...match[1].matchAll(/'([a-z_]+)'/g)].map(m => m[1]);
  const mapTags = Object.keys(tongueData.tongueAiTagMap);

  assert.deepEqual(
    [...edgeTags].sort(),
    [...mapTags].sort(),
    'as tags da Edge Function e do tongueAiTagMap devem ser idênticas — atualize os dois lados juntos'
  );
});

// ===== Fase 4: persistência (Storage + metadados na sessão) =====

test('caminho no Storage começa pelo therapist_id (exigência do RLS) e termina em .webp', () => {
  const { buildTonguePhotoPath } = tongueMediaService;
  const date = new Date('2026-06-12T15:30:00');

  const path = buildTonguePhotoPath('terapeuta-1', 'paciente-2', 'top', date);

  assert.ok(path.startsWith('terapeuta-1/'), 'primeiro segmento deve ser o therapist_id');
  assert.match(path, /^terapeuta-1\/paciente-2\/2026-06-12\/top-\d+\.webp$/);
  assert.throws(() => buildTonguePhotoPath(null, 'p', 'top'), /obrigatórios/);
  assert.throws(() => buildTonguePhotoPath('t', 'p', ''), /obrigatórios/);
});

test('serializeTongueAi guarda apenas metadados: nada de object URL ou base64', () => {
  const { serializeTongueAi } = clinicState;

  const meta = serializeTongueAi({
    photos: {
      top: {
        url: 'blob:http://localhost/abc',
        name: 'foto.webp',
        size: 1234,
        type: 'image/webp',
        path: 't1/p1/2026-06-12/top-1.webp',
        uploadedAt: '2026-06-12T15:00:00.000Z',
        uploadStatus: 'uploaded',
      },
      sublingual: null,
    },
    analysis: { modelVersion: 'mock-0.1', analyzedAt: '2026-06-12T15:01:00.000Z', findings: [] },
  });

  assert.ok(!JSON.stringify(meta).includes('blob:'), 'object URLs não podem ser persistidos');
  assert.equal(meta.photos.top.path, 't1/p1/2026-06-12/top-1.webp');
  assert.equal(meta.photos.top.url, undefined);
  assert.equal(meta.photos.sublingual, null);
  assert.equal(meta.analysis.modelVersion, 'mock-0.1');
});

test('foto sem caminho no Storage (apenas local) não é persistida', () => {
  const { serializeTongueAi } = clinicState;

  const meta = serializeTongueAi({
    photos: {
      top: { url: 'blob:http://localhost/x', name: 'local.png', size: 10, path: null, uploadStatus: 'local-only' },
      sublingual: null,
    },
    analysis: null,
  });

  assert.equal(meta, null, 'sem foto enviada e sem análise, nada deve ser salvo na sessão');
});

test('round-trip serialize/deserialize preserva análise e revisão profissional', () => {
  const { serializeTongueAi, deserializeTongueAi } = clinicState;

  const analysis = {
    modelVersion: 'mock-0.1',
    analyzedAt: '2026-06-12T15:01:00.000Z',
    findings: [{
      id: 'swollen_tongue_qi_def',
      title: 'Língua inchada',
      confidence: 0.86,
      suggestedTags: ['swollen_center', 'teeth_marks'],
      status: 'accepted',
      checkedTags: ['swollen_center'],
      acceptedTags: ['swollen_center'],
    }],
  };
  const original = {
    photos: {
      top: { url: 'blob:http://localhost/abc', name: 'foto.webp', size: 99, path: 't1/p1/2026-06-12/top-1.webp', uploadedAt: '2026-06-12T15:00:00.000Z', uploadStatus: 'uploaded' },
      sublingual: null,
    },
    analysis,
  };

  const restored = deserializeTongueAi(serializeTongueAi(original));

  assert.deepEqual(restored.analysis, analysis, 'achados, status e tags aceitas devem sobreviver ao round-trip');
  assert.equal(restored.photos.top.path, original.photos.top.path);
  assert.equal(restored.photos.top.url, null, 'url volta nula; o painel gera URL assinada sob demanda');
  assert.equal(restored.photos.top.uploadStatus, 'uploaded');
  assert.equal(restored.photos.sublingual, null);
});

test('deserializeTongueAi com metadados vazios volta ao estado inicial', () => {
  const { deserializeTongueAi, createInitialTongueAi } = clinicState;

  assert.deepEqual(deserializeTongueAi(null), createInitialTongueAi());
  assert.deepEqual(deserializeTongueAi(undefined), createInitialTongueAi());
});

test('aceite de estase sublingual reflete no perfil patogênico', () => {
  const selectedMap = acceptTagsIntoSelectedMap(['distended_sublingual_veins', 'purple_sublingual_veins']);
  const profile = analyzer.diagnosticProfile(emptyState, selectedMap);

  assert.equal(profile.parts.tongue, 2 * 7);
  assert.ok(
    profile.pathogenic.includes('Estase de Xue'),
    'veias sublinguais arroxeadas aceitas devem sugerir Estase de Xue'
  );
});
