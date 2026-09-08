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

test('login distingue usuário inválido de senha incorreta sem devolver erro cru', async () => {
  const source = await readRepositoryFile(
    'supabase',
    'functions',
    'login-with-identifier',
    'index.ts',
  );

  assert.match(
    source,
    /const profileValid = Boolean\(profile\?\.id && profile\.email && profile\.is_active === true\)/,
  );
  assert.match(
    source,
    /const INVALID_IDENTIFIER_ERROR = 'Usuário incorreto\.'/,
  );
  assert.match(
    source,
    /const INVALID_PASSWORD_ERROR = 'Senha incorreta\.'/,
  );
  assert.match(
    source,
    /const DETAILED_LOGIN_ERRORS = Deno\.env\.get\('DETAILED_LOGIN_ERRORS'\) !== 'false'/,
  );
  assert.doesNotMatch(
    source,
    /catch\s*\([^)]*\)\s*\{[\s\S]*?jsonResponse\(\{ error: [^}]*\.message/,
  );
});

test('login sempre chama signInWithPassword, mesmo com identificador inexistente (mitiga timing oracle)', async () => {
  const source = await readRepositoryFile(
    'supabase',
    'functions',
    'login-with-identifier',
    'index.ts',
  );

  // Não pode existir um retorno ANTES de signInWithPassword baseado só na
  // validade do perfil — isso reintroduziria a diferença de latência entre
  // "conta não existe" (retorno imediato) e "conta existe, senha errada"
  // (round-trip de verificação de senha).
  assert.doesNotMatch(
    source,
    /if \(!profile\?\.\w+[\s\S]{0,120}\)\s*\{\s*return jsonResponse\(\{ error: GENERIC_LOGIN_ERROR \}, 401\);\s*\}\s*\n\s*const \{ data, error \} = await supabaseAuth\.auth\.signInWithPassword/,
  );
  assert.match(source, /login-decoy\.invalid/);
  assert.match(source, /const profileValid = Boolean\(/);
  assert.match(
    source,
    /if \(!profileValid\)[\s\S]*?INVALID_IDENTIFIER_ERROR[\s\S]*?if \(error \|\| !data\.session \|\| !data\.user\)[\s\S]*?INVALID_PASSWORD_ERROR/,
  );
});

test('senha temporária vencida é recusada só depois de validar a senha, e a sessão é revogada', async () => {
  const source = await readRepositoryFile(
    'supabase',
    'functions',
    'login-with-identifier',
    'index.ts',
  );

  const passwordAuthenticationIndex = source.indexOf('supabaseAuth.auth.signInWithPassword');
  const ttlCheckIndex = source.indexOf('TEMPORARY_PASSWORD_TTL_MS');
  const secondTtlCheckIndex = source.indexOf('TEMPORARY_PASSWORD_TTL_MS', ttlCheckIndex + 1);
  const revokeIndex = source.indexOf('supabaseAdmin.auth.admin.signOut');

  assert.ok(passwordAuthenticationIndex >= 0);
  assert.ok(secondTtlCheckIndex > passwordAuthenticationIndex, 'checagem de TTL precisa vir depois de validar a senha');
  assert.ok(revokeIndex > passwordAuthenticationIndex);
  assert.match(source, /profile\.must_change_password === true && profile\.temporary_password_set_at/);
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

test('configuração versionada libera JWT só para as functions deliberadamente pré-sessão', async () => {
  const config = await readRepositoryFile('supabase', 'config.toml');
  const publicFunctionOverrides = config.match(/verify_jwt\s*=\s*false/g) || [];

  // Lista fechada de propósito: cada function aqui é uma superfície sem
  // autenticação, revisada individualmente. Uma quarta aparecer sem
  // passar por este teste é o sinal de alarme que ele existe para dar.
  assert.match(
    config,
    /\[functions\.login-with-identifier\][\s\S]*?verify_jwt\s*=\s*false/,
  );
  assert.match(
    config,
    /\[functions\.satisfaction-survey\][\s\S]*?verify_jwt\s*=\s*false/,
  );
  assert.match(
    config,
    /\[functions\.confirm-appointment\][\s\S]*?verify_jwt\s*=\s*false/,
  );
  assert.equal(publicFunctionOverrides.length, 3);
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
