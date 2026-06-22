import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const projectRoot = path.resolve(root, '..');

let server;
let service;

before(async () => {
  server = await createServer({
    root,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  });
  service = await server.ssrLoadModule('/src/services/deployHealthService.js');
});

after(async () => {
  await server?.close();
});

test('patients.age ausente vira check bloqueado com correção objetiva', () => {
  const { HEALTH_STATUS, normalizeDeployHealthPayload } = service;
  const health = normalizeDeployHealthPayload({
    checkedAt: '2026-06-16T10:00:00Z',
    patients: [{ name: 'Paciente Teste' }],
    checks: {
      patientsAgeColumn: {
        ok: false,
        message: 'Coluna patients.age ausente.',
        correction: 'Execute supabase/migrations/20260522_patient_age_archive.sql.',
      },
      publicAtlasBucket: { ok: true },
      knowledgeSourceAssets: { ok: true },
      clinicsSchema: { ok: true },
    },
    criticalMigrations: [
      {
        id: '20260522_patient_age_archive',
        recorded: false,
        evidenceOk: false,
      },
    ],
  });

  const ageCheck = health.items.find(item => item.id === 'patientsAgeColumn');
  const ageMigration = health.items.find(item => item.id === '20260522_patient_age_archive');

  assert.equal(ageCheck.status, HEALTH_STATUS.BLOCKED);
  assert.match(ageCheck.correction, /20260522_patient_age_archive\.sql/);
  assert.equal(ageMigration.status, HEALTH_STATUS.BLOCKED);
  assert.equal(JSON.stringify(health).includes('Paciente Teste'), false);
});

test('probe da Edge Function aceita 404 controlado do manifesto como disponibilidade', async () => {
  const {
    EDGE_FUNCTION_PROBE_ASSET_KEY,
    HEALTH_STATUS,
    KNOWLEDGE_SOURCE_ASSET_FUNCTION,
    probeKnowledgeSourceAssetFunction,
  } = service;

  const result = await probeKnowledgeSourceAssetFunction({
    invoke: async (functionName, options) => {
      assert.equal(functionName, KNOWLEDGE_SOURCE_ASSET_FUNCTION);
      assert.equal(options.body.assetKey, EDGE_FUNCTION_PROBE_ASSET_KEY);
      assert.equal(options.body.purpose, 'deploy-health');
      return {
        data: null,
        error: {
          message: 'HTTP 404',
          context: {
            json: async () => ({ error: 'Fonte visual não encontrada.' }),
          },
        },
      };
    },
  });

  assert.equal(result.status, HEALTH_STATUS.OK);
  assert.match(result.detail, /manifesto/i);
});

test('probe da Edge Function bloqueia quando a função não está implantada', async () => {
  const { HEALTH_STATUS, probeKnowledgeSourceAssetFunction } = service;

  const result = await probeKnowledgeSourceAssetFunction({
    invoke: async () => ({
      data: null,
      error: {
        message: 'Function not found',
        context: {
          json: async () => ({ message: 'Function not found' }),
        },
      },
    }),
  });

  assert.equal(result.status, HEALTH_STATUS.BLOCKED);
  assert.match(result.correction, /deploy da Edge Function knowledge-source-asset-url/);
});

test('probe do Atlas público diferencia bucket privado ou bloqueado', async () => {
  const { HEALTH_STATUS, probePublicAtlasIndex } = service;

  const result = await probePublicAtlasIndex({
    fetchImpl: async (url) => {
      assert.match(url, /\/storage\/v1\/object\/public\/knowledge-atlas-public\/atlas-ednea\/source-index\.json$/);
      return { ok: false, status: 403 };
    },
  });

  assert.equal(result.status, HEALTH_STATUS.BLOCKED);
  assert.match(result.correction, /bucket knowledge-atlas-public está público/);
});

test('URL api.supabase.com é bloqueada antes de chamar rede', async () => {
  const { HEALTH_STATUS, runDeployHealthCheck } = service;
  let rpcCalled = false;

  const health = await runDeployHealthCheck({
    supabaseUrl: 'https://api.supabase.com',
    supabaseClient: {
      rpc: async () => {
        rpcCalled = true;
        return { data: null, error: null };
      },
      functions: {
        invoke: async () => {
          throw new Error('não deveria chamar função');
        },
      },
    },
    fetchImpl: async () => {
      throw new Error('não deveria chamar fetch');
    },
  });

  assert.equal(rpcCalled, false);
  assert.equal(health.summary.status, HEALTH_STATUS.BLOCKED);
  assert.equal(health.items[0].id, 'supabaseProjectUrl');
  assert.match(health.items[0].correction, /supabase\.co/);
});

test('falha de rede no RPC aparece como check bloqueado com orientação de configuração', async () => {
  const { HEALTH_STATUS, runDeployHealthCheck } = service;

  const health = await runDeployHealthCheck({
    supabaseUrl: 'https://projeto.supabase.co',
    supabaseClient: {
      rpc: async () => {
        throw new Error('Failed to fetch (api.supabase.com)');
      },
      functions: {
        invoke: async () => ({ data: { error: 'Fonte visual não encontrada.' }, error: null }),
      },
    },
    fetchImpl: async () => ({ ok: true, status: 200 }),
  });

  const rpcCheck = health.items.find(item => item.id === 'adminDeployHealthRpc');
  assert.equal(rpcCheck.status, HEALTH_STATUS.BLOCKED);
  assert.match(rpcCheck.correction, /não para api\.supabase\.com/);
});

test('migration de saúde usa metadados e não lê linhas de pacientes', async () => {
  const migration = await fs.readFile(
    path.join(projectRoot, 'supabase/migrations/20260616_deploy_health_check.sql'),
    'utf8',
  );

  assert.match(migration, /admin_deploy_health_check/);
  assert.match(migration, /public\.is_super_admin\(auth\.uid\(\)\)/);
  assert.match(migration, /information_schema\.columns/);
  assert.match(migration, /storage\.buckets/);
  assert.match(migration, /supabase_migrations\.schema_migrations/);
  assert.doesNotMatch(migration, /FROM\s+public\.patients\b/i);
  assert.doesNotMatch(migration, /SELECT\s+\*\s+FROM/i);
});
