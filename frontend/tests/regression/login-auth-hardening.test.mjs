import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const frontendRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const repositoryRoot = path.resolve(frontendRoot, '..');

async function readRepositoryFile(...segments) {
  return fs.readFile(path.join(repositoryRoot, ...segments), 'utf8');
}

test('login limita o identificador antes da consulta e mantém bucket por conta', async () => {
  const source = await readRepositoryFile(
    'supabase',
    'functions',
    'login-with-identifier',
    'index.ts',
  );

  const identifierBucketIndex = source.indexOf(
    "functionName: 'login-identifier-lookup'",
  );
  const profileLookupIndex = source.indexOf(".from('profiles')");
  const accountBucketIndex = source.indexOf(
    "functionName: 'login-with-identifier'",
  );
  const passwordAuthenticationIndex = source.indexOf(
    'supabaseAuth.auth.signInWithPassword',
  );

  assert.match(source, /crypto\.subtle\.digest\(\s*'SHA-256'/);
  assert.match(source, /const accountSubjectId = profile\?\.id \|\| await/);
  assert.ok(identifierBucketIndex >= 0);
  assert.ok(profileLookupIndex > identifierBucketIndex);
  assert.ok(accountBucketIndex > profileLookupIndex);
  assert.ok(passwordAuthenticationIndex > accountBucketIndex);
});

test('login não enumera conta ausente, suspensa nem senha incorreta', async () => {
  const source = await readRepositoryFile(
    'supabase',
    'functions',
    'login-with-identifier',
    'index.ts',
  );

  assert.match(
    source,
    /!profile\?\.id \|\| !profile\.email \|\| profile\.is_active !== true/,
  );
  assert.match(
    source,
    /return jsonResponse\(\{ error: GENERIC_LOGIN_ERROR \}, 401\)/,
  );
  assert.doesNotMatch(source, /Usuário suspenso|Usuário não encontrado/i);
  assert.doesNotMatch(
    source,
    /catch\s*\([^)]*\)\s*\{[\s\S]*?jsonResponse\(\{ error: [^}]*\.message/,
  );
});

test('frontend autentica e-mail e username somente pela Edge Function', async () => {
  const source = await fs.readFile(
    path.join(frontendRoot, 'src', 'hooks', 'AuthContext.jsx'),
    'utf8',
  );

  const edgeLoginIndex = source.indexOf(
    "supabase.functions.invoke('login-with-identifier'",
  );
  const localFallbackIndex = source.indexOf(
    'const localAuth = await loadLocalAuthFallback()',
  );

  assert.ok(edgeLoginIndex >= 0);
  assert.ok(localFallbackIndex > edgeLoginIndex);
  assert.doesNotMatch(source, /supabase\.auth\.signInWithPassword/);
  assert.doesNotMatch(source, /\bverifyPassword\b/);
});

test('loading só libera a aplicação após sessão, perfil e MFA resolverem', async () => {
  const source = await fs.readFile(
    path.join(frontendRoot, 'src', 'hooks', 'AuthContext.jsx'),
    'utf8',
  );

  assert.match(source, /const \[sessionLoading, setSessionLoading\] = useState\(true\)/);
  assert.match(
    source,
    /profileResolvedUserId !== user\.id/,
  );
  assert.match(
    source,
    /mfaResolvedUserId !== user\.id/,
  );
  assert.match(
    source,
    /const loading = sessionLoading \|\| profileLoading \|\| mfaLoading/,
  );
  assert.match(
    source,
    /setProfileError\('Não foi possível carregar o perfil de acesso\.'\)/,
  );
  assert.doesNotMatch(source, /setLoading\(false\)/);
});

test('configuração versionada libera JWT somente para o login pré-sessão', async () => {
  const config = await readRepositoryFile('supabase', 'config.toml');
  const publicFunctionOverrides = config.match(/verify_jwt\s*=\s*false/g) || [];

  assert.match(
    config,
    /\[functions\.login-with-identifier\][\s\S]*?verify_jwt\s*=\s*false/,
  );
  assert.equal(publicFunctionOverrides.length, 1);
});

test('fonte visual registra somente eventos operacionais sanitizados', async () => {
  const source = await readRepositoryFile(
    'supabase',
    'functions',
    'knowledge-source-asset-url',
    'index.ts',
  );

  assert.match(source, /createCorrelationId/);
  assert.match(source, /logOperationalEvent/);
  assert.doesNotMatch(source, /console\.error/);
  assert.doesNotMatch(source, /assetError\.message|signedError\?\.message/);
});
