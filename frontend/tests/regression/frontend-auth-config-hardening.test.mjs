import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import {
  assertSupabasePublicConfig,
  validateSupabasePublicConfig,
} from '../../src/lib/supabaseConfig.js';
import {
  LOCAL_USER_KEY,
  readLocalAuthenticatedUser,
} from '../../src/lib/localAuthStorage.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let productionOutDir = '';

after(async () => {
  if (productionOutDir) {
    await fs.rm(productionOutDir, { recursive: true, force: true });
  }
});

function createMemoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}

async function readFilesRecursively(directory, extension) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const contents = [];
  for (const entry of entries) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      contents.push(...await readFilesRecursively(filePath, extension));
    } else if (entry.name.endsWith(extension)) {
      contents.push(await fs.readFile(filePath, 'utf8'));
    }
  }
  return contents;
}

test('configuração pública do Supabase bloqueia ausência, URL insegura e service role', () => {
  assert.throws(
    () => assertSupabasePublicConfig({ production: true }),
    /VITE_SUPABASE_URL.*VITE_SUPABASE_ANON_KEY/,
  );

  const insecureUrl = validateSupabasePublicConfig({
    supabaseUrl: 'http://projeto.supabase.co',
    supabaseAnonKey: 'sb_publishable_regression_1234567890',
    production: true,
  });
  assert.equal(insecureUrl.ok, false);
  assert.match(insecureUrl.issues.join(' '), /HTTPS em produção/);

  const serviceRolePayload = Buffer.from(JSON.stringify({ role: 'service_role' }))
    .toString('base64url');
  const serviceRole = validateSupabasePublicConfig({
    supabaseUrl: 'https://projeto.supabase.co',
    supabaseAnonKey: `header.${serviceRolePayload}.signature-value-long-enough`,
    production: true,
  });
  assert.equal(serviceRole.ok, false);
  assert.match(serviceRole.issues.join(' '), /service role/);

  const valid = validateSupabasePublicConfig({
    supabaseUrl: 'https://projeto.supabase.co',
    supabaseAnonKey: 'sb_publishable_regression_1234567890',
    production: true,
  });
  assert.equal(valid.ok, true);
});

test('acup_local_user é removido quando o modo local não está habilitado', () => {
  const localUser = {
    id: 'local-regression',
    email: 'local@example.test',
    _isLocal: true,
  };
  const storage = createMemoryStorage({
    [LOCAL_USER_KEY]: JSON.stringify(localUser),
  });

  assert.equal(
    readLocalAuthenticatedUser({ storage, enabled: false }),
    null,
  );
  assert.equal(storage.getItem(LOCAL_USER_KEY), null);

  storage.setItem(LOCAL_USER_KEY, JSON.stringify(localUser));
  assert.deepEqual(
    readLocalAuthenticatedUser({ storage, enabled: true }),
    localUser,
  );
});

test('produção exige configuração no build e modo local depende de DEV mais opt-in', async () => {
  const [viteConfig, authContext, supabaseClient, clinicService] = await Promise.all([
    fs.readFile(path.join(root, 'vite.config.js'), 'utf8'),
    fs.readFile(path.join(root, 'src/hooks/AuthContext.jsx'), 'utf8'),
    fs.readFile(path.join(root, 'src/lib/supabase.js'), 'utf8'),
    fs.readFile(path.join(root, 'src/services/clinicService.js'), 'utf8'),
  ]);

  assert.match(viteConfig, /command === 'build'/);
  assert.match(viteConfig, /assertSupabasePublicConfig/);
  assert.match(supabaseClient, /import\.meta\.env\.PROD/);

  for (const source of [authContext, supabaseClient, clinicService]) {
    assert.match(source, /import\.meta\.env\.DEV/);
    assert.match(source, /VITE_ENABLE_LOCAL_AUTH_FALLBACK === 'true'/);
  }

  assert.doesNotMatch(authContext, /admlaio|admkaren|admdeni|123456/);
  assert.doesNotMatch(clinicService, /admlaio|admkaren|admdeni|123456/);
});

test('bundle de produção não inclui módulo nem identidades do fallback local', async () => {
  productionOutDir = await fs.mkdtemp(path.join(os.tmpdir(), 'acup-auth-build-'));
  const previousEnv = {
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY,
    VITE_ENABLE_LOCAL_AUTH_FALLBACK: process.env.VITE_ENABLE_LOCAL_AUTH_FALLBACK,
  };

  process.env.VITE_SUPABASE_URL = 'https://projeto.supabase.co';
  process.env.VITE_SUPABASE_ANON_KEY = 'sb_publishable_regression_1234567890';
  process.env.VITE_ENABLE_LOCAL_AUTH_FALLBACK = 'true';

  try {
    await build({
      root,
      configFile: path.join(root, 'vite.config.js'),
      mode: 'production',
      logLevel: 'silent',
      build: {
        outDir: productionOutDir,
        emptyOutDir: true,
        manifest: true,
      },
    });
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  const javascript = (await readFilesRecursively(productionOutDir, '.js')).join('\n');
  assert.doesNotMatch(
    javascript,
    /admlaio|admkaren|admdeni|laio@acup\.com|karen@acup\.com|deni@acup\.com/i,
  );

  const manifest = await fs.readFile(
    path.join(productionOutDir, '.vite', 'manifest.json'),
    'utf8',
  );
  assert.doesNotMatch(manifest, /localAuthFallback/);
});

test('bootstrap exige senha temporária externa e nunca a registra em log', async () => {
  const source = await fs.readFile(
    path.join(root, 'scripts/bootstrap-super-admin.js'),
    'utf8',
  );

  assert.match(source, /process\.env\.SUPER_ADMIN_PASSWORD/);
  assert.doesNotMatch(source, /password:\s*env\.SUPER_ADMIN_PASSWORD\s*\|\|/);
  assert.doesNotMatch(source, /password:\s*['"]654321['"]/);
  assert.doesNotMatch(source, /console\.(?:log|error)\([^)]*SUPER_ADMIN\.password/);
  assert.doesNotMatch(source, /Senha inicial:/);
});

test('fallback de desenvolvimento lê credenciais somente do .env.local', async () => {
  const source = await fs.readFile(
    path.join(root, 'src/dev/localAuthFallback.js'),
    'utf8',
  );

  assert.match(source, /VITE_LOCAL_AUTH_USERS_JSON/);
  assert.match(source, /password\.length >= 12/);
  assert.doesNotMatch(source, /password:\s*['"][^'"]+['"]/);
  assert.doesNotMatch(source, /@acup\.com|123456|admlaio|admkaren|admdeni/i);
});
