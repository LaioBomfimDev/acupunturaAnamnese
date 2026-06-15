import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const projectRoot = path.resolve(root, '..');

let server;
let sourceAssets;

before(async () => {
  server = await createServer({
    root,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  });
  sourceAssets = await server.ssrLoadModule('/src/services/knowledgeSourceAssetService.js');
});

after(async () => {
  await server?.close();
});

test('assetKey de fonte visual aceita apenas caminhos internos esperados', () => {
  const {
    assetKeyFromSourceAssetUrl,
    isValidKnowledgeSourceAssetKey,
    sourceAssetUrlFromKey,
  } = sourceAssets;

  assert.equal(
    assetKeyFromSourceAssetUrl('/knowledge/source-assets/pdf-sources/fonte/pages/page-001.webp'),
    'pdf-sources/fonte/pages/page-001.webp',
  );
  assert.equal(
    assetKeyFromSourceAssetUrl('atlas-ednea/source-index.local.json'),
    'atlas-ednea/source-index.local.json',
  );
  assert.equal(
    sourceAssetUrlFromKey('atlas-ednea/pages/page-357.webp'),
    '/knowledge/source-assets/atlas-ednea/pages/page-357.webp',
  );

  assert.equal(isValidKnowledgeSourceAssetKey('pdf-sources/a/pages/page-001.webp'), true);
  assert.equal(isValidKnowledgeSourceAssetKey('../pdf-sources/a.webp'), false);
  assert.equal(isValidKnowledgeSourceAssetKey('/pdf-sources/a.webp'), false);
  assert.equal(isValidKnowledgeSourceAssetKey('pdf-sources//a.webp'), false);
  assert.equal(isValidKnowledgeSourceAssetKey('pdf-sources\\a.webp'), false);
  assert.equal(isValidKnowledgeSourceAssetKey('PDF-SOURCES/a.webp'), false);

  assert.equal(
    assetKeyFromSourceAssetUrl('https://evil.example/knowledge/source-assets/atlas-ednea/pages/page-001.webp'),
    null,
  );
});

test('migration mantém bucket privado e manifesto restrito a SuperAdm', async () => {
  const migration = await fs.readFile(
    path.join(projectRoot, 'supabase/migrations/20260615_knowledge_source_assets.sql'),
    'utf8',
  );

  assert.match(migration, /knowledge-source-assets/);
  assert.match(migration, /VALUES\s*\(\s*'knowledge-source-assets'[\s\S]*false[\s\S]*52428800/i);
  assert.match(migration, /ALTER TABLE public\.knowledge_source_assets ENABLE ROW LEVEL SECURITY/i);
  assert.match(migration, /public\.is_super_admin\(auth\.uid\(\)\)/);
  assert.match(migration, /asset_key !~ '\(\^\/\|\\\\\.\\\\\.\|\/\/\|\\\\\\\\\)'/);
  assert.equal(
    /CREATE POLICY[\s\S]*ON storage\.objects[\s\S]*knowledge-source-assets/i.test(migration),
    false,
    'não deve haver policy direta de storage.objects para o bucket de fontes',
  );
});

test('Edge Function só assina fonte após autenticação SuperAdm e manifesto allowlist', async () => {
  const source = await fs.readFile(
    path.join(projectRoot, 'supabase/functions/knowledge-source-asset-url/index.ts'),
    'utf8',
  );

  const superAdminIndex = source.indexOf('assertSuperAdmin(caller.profile)');
  const signedUrlIndex = source.indexOf('createSignedUrl');

  assert.ok(superAdminIndex > 0, 'função deve exigir assertSuperAdmin');
  assert.ok(signedUrlIndex > superAdminIndex, 'URL assinada só pode ser criada depois da autorização');
  assert.match(source, /\.eq\('asset_key', assetKey\)/);
  assert.match(source, /\.eq\('is_active', true\)/);
  assert.doesNotMatch(source, /body\?\.(bucket|objectPath|object_path|path|expiresIn|expires)/);
  assert.match(source, /SIGNED_URL_TTL_SECONDS = 5 \* 60/);
});

test('script de sincronização bloqueia anon key e não imprime segredo', async () => {
  const source = await fs.readFile(
    path.join(projectRoot, 'tools/knowledge/sync-knowledge-source-assets.mjs'),
    'utf8',
  );

  assert.match(source, /jwtRole\(serviceRoleKey\) !== 'service_role'/);
  assert.match(source, /allowedTopLevelDirs = new Set\(\['atlas-ednea', 'pdf-sources'\]\)/);
  const logLines = source.split(/\r?\n/).filter(line => /console\.(log|error)\(/.test(line));
  assert.equal(
    logLines.some(line => line.includes('serviceRoleKey')),
    false,
    'logs não devem imprimir o segredo serviceRoleKey',
  );
  assert.match(source, /Bucket privado/);
});

test('Atlas público resolve para URL pública permanente do Storage (sem assinar)', async () => {
  const { resolveKnowledgeSourceAssetUrl, publicAtlasAssetUrl, isPublicAtlasAssetKey } = sourceAssets;

  assert.equal(isPublicAtlasAssetKey('atlas-ednea/pages/page-357.webp'), true);
  assert.equal(isPublicAtlasAssetKey('pdf-sources/x/pages/page-001.webp'), false);

  const direct = publicAtlasAssetUrl('atlas-ednea/pages/page-357.webp');
  assert.match(
    direct,
    /\/storage\/v1\/object\/public\/knowledge-atlas-public\/atlas-ednea\/pages\/page-357\.webp$/,
  );

  // Atlas não passa por Edge Function nem URL assinada, mesmo sem fallback local.
  const resolved = await resolveKnowledgeSourceAssetUrl(
    '/knowledge/source-assets/atlas-ednea/pages/page-357.webp',
    { allowLocalFallback: false },
  );
  assert.equal(resolved, direct);
  assert.doesNotMatch(resolved, /token=|[?&]expires/i);
});

test('migration cria bucket público dedicado do Atlas, sem policy de escrita explorável', async () => {
  const migration = await fs.readFile(
    path.join(projectRoot, 'supabase/migrations/20260615_knowledge_atlas_public_bucket.sql'),
    'utf8',
  );

  assert.match(migration, /VALUES\s*\(\s*'knowledge-atlas-public'[\s\S]*true[\s\S]*52428800/i);
  assert.match(migration, /public = true/i);
  assert.equal(
    /CREATE POLICY[\s\S]*knowledge-atlas-public/i.test(migration),
    false,
    'bucket público não deve ter policy de escrita customizada em storage.objects',
  );
});
