import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';

// ACUP-022 (09/11/2026): troca da service_role vazada. A chave antiga (JWT)
// não se troca: cria-se sb_publishable_/sb_secret_ e desligam-se as "Legacy
// API keys". A plataforma segue injetando SUPABASE_SERVICE_ROLE_KEY e
// SUPABASE_ANON_KEY; se as Edge Functions preferirem a antiga, todas quebram
// quando ela for desligada. Regra: chave nova primeiro, antiga só de reserva,
// e toda função lê a chave só por _shared/security.ts.
// Nenhum valor real de chave aqui: só marcadores fictícios.

const SECURITY = new URL('../../../supabase/functions/_shared/security.ts', import.meta.url);
const source = readFileSync(SECURITY, 'utf8');

// Carrega createServiceClient/createAnonClient de verdade, com Deno.env e
// createClient falsos (o arquivo importa de https://esm.sh, que o Node não abre).
function loadClients(env) {
  const code = stripTypeScriptTypes(source)
    .replace(/^import .*;\r?$/gm, '')
    .replace(/^export \{[^}]*\} from .*;\r?$/gm, '')
    .replace(/^export /gm, '');
  const Deno = { env: { get: name => env[name] } };
  const createClient = (url, key) => ({ url, key });
  return new Function('Deno', 'createClient', 'resolveCorsDecision', 'decodeVerifiedAuthClaims',
    `${code};return { createServiceClient, createAnonClient };`)(Deno, createClient, () => ({}), () => ({}));
}

const NOVA_SECRETA = JSON.stringify({ default: 'marcador-nova-secreta' });
const NOVA_PUBLICA = JSON.stringify({ default: 'marcador-nova-publica' });
const URL_FALSA = 'http://supabase.local';

test('Edge: com as duas chaves presentes, usa a nova (sb_secret_/sb_publishable_)', () => {
  const c = loadClients({
    SUPABASE_URL: URL_FALSA,
    SUPABASE_SECRET_KEYS: NOVA_SECRETA, SUPABASE_SERVICE_ROLE_KEY: 'marcador-antiga-service',
    SUPABASE_PUBLISHABLE_KEYS: NOVA_PUBLICA, SUPABASE_ANON_KEY: 'marcador-antiga-anon',
  });
  assert.equal(c.createServiceClient().key, 'marcador-nova-secreta');
  assert.equal(c.createAnonClient().key, 'marcador-nova-publica');
});

test('Edge: sem a nova, a antiga ainda serve de reserva', () => {
  const c = loadClients({ SUPABASE_URL: URL_FALSA, SUPABASE_SERVICE_ROLE_KEY: 'marcador-antiga-service', SUPABASE_ANON_KEY: 'marcador-antiga-anon' });
  assert.equal(c.createServiceClient().key, 'marcador-antiga-service');
  assert.equal(c.createAnonClient().key, 'marcador-antiga-anon');
});

test('Edge: chave nomeada "default" vence; sem ela, a primeira da lista', () => {
  const c = loadClients({
    SUPABASE_URL: URL_FALSA,
    SUPABASE_SECRET_KEYS: JSON.stringify({ outra: 'marcador-outra', default: 'marcador-default' }),
    SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ web: 'marcador-web' }),
  });
  assert.equal(c.createServiceClient().key, 'marcador-default');
  assert.equal(c.createAnonClient().key, 'marcador-web');
});

test('Edge: JSON inválido ou sem chave nenhuma dá a mensagem própria, sem o valor', () => {
  const ruim = loadClients({ SUPABASE_URL: URL_FALSA, SUPABASE_SECRET_KEYS: 'marcador-nao-json', SUPABASE_PUBLISHABLE_KEYS: '{quebrado' });
  assert.throws(() => ruim.createServiceClient(), err => err.message === 'Chave secreta do Supabase não configurada nas Edge Functions.' && !err.message.includes('marcador'));
  assert.throws(() => ruim.createAnonClient(), err => err.message === 'Chave pública do Supabase não configurada nas Edge Functions.');
  // JSON inválido com a antiga presente: cai na antiga, não derruba a função.
  const reserva = loadClients({ SUPABASE_URL: URL_FALSA, SUPABASE_SECRET_KEYS: 'marcador-nao-json', SUPABASE_SERVICE_ROLE_KEY: 'marcador-antiga-service' });
  assert.equal(reserva.createServiceClient().key, 'marcador-antiga-service');
});

test('Edge: no fonte, a chave nova vem antes da antiga nos dois clientes', () => {
  assert.match(source, /const serviceRoleKey = getNamedOrFirstKey\(Deno\.env\.get\('SUPABASE_SECRET_KEYS'\)\)\r?\n\s*\|\| Deno\.env\.get\('SUPABASE_SERVICE_ROLE_KEY'\);/);
  assert.match(source, /const anonKey = getNamedOrFirstKey\(Deno\.env\.get\('SUPABASE_PUBLISHABLE_KEYS'\)\)\r?\n\s*\|\| Deno\.env\.get\('SUPABASE_ANON_KEY'\);/);
  assert.doesNotMatch(source, /if \(!serviceRoleKey && secretKeys\)/, 'ordem antiga: a antiga primeiro');
  assert.doesNotMatch(source, /if \(!anonKey && publishableKeys\)/, 'ordem antiga: a antiga primeiro');
  assert.match(source, /try \{\r?\n\s*const keys = JSON\.parse\(rawKeys\)/, 'JSON.parse cita o conteúdo no erro: precisa do try');
});

test('Edge: nenhuma função lê chave do Supabase por fora de _shared/security.ts', async () => {
  const { readdirSync, statSync } = await import('node:fs');
  const { join } = await import('node:path');
  const root = new URL('../../../supabase/functions/', import.meta.url);
  const files = [];
  const walk = dir => readdirSync(dir).forEach(name => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(ts|js|mjs)$/.test(name)) files.push(full);
  });
  walk(root.pathname.replace(/^\/([A-Za-z]:)/, '$1'));
  const outside = files
    .filter(f => !/[\\/]_shared[\\/]security\.ts$/.test(f))
    .filter(f => /SUPABASE_(SERVICE_ROLE_KEY|ANON_KEY|SECRET_KEYS?|PUBLISHABLE_KEYS?)|@supabase\/supabase-js|\bcreateClient\(/.test(readFileSync(f, 'utf8')));
  assert.ok(files.length > 20, 'achou as funções');
  assert.deepEqual(outside, []);
});
