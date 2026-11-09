import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
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

// KEYS-1 (09/11/2026): com a chave publishable (não é JWT), o gateway com
// verify_jwt barraria antes do código, então toda função publicada fica com
// verify_jwt = false. A porta passa a ser o próprio handler: cada função sem
// verify_jwt confere a sessão no código OU é pública de propósito, nesta lista
// e com o motivo. Função nova sem conferência e fora da lista = teste falha.
const PUBLIC_FUNCTIONS = {
  'login-with-identifier': {
    motivo: 'chamada antes de existir sessão: é o próprio login (senha conferida pelo Supabase Auth)',
    prova: /signInWithPassword/,
  },
  'satisfaction-survey': {
    motivo: 'paciente responde a pesquisa pelo link, sem conta; vale só o token do link',
    prova: /token/,
  },
  'confirm-appointment': {
    motivo: 'paciente confirma o agendamento pelo link pessoal, sem conta; vale só o token do link',
    prova: /token/,
  },
  'public-agenda': {
    motivo: 'agenda somente leitura compartilhada por link; quem abre não tem conta; vale só o token do link',
    prova: /token/,
  },
  'patient-portal': {
    motivo: 'Área do Paciente: código de acesso + data de nascimento, sem conta no Supabase Auth; sessão própria do portal',
    prova: /\.rpc\('portal_login'[\s\S]*\.rpc\('portal_resolve_session'|\.rpc\('portal_resolve_session'[\s\S]*\.rpc\('portal_login'/,
  },
  'interview-link': {
    motivo: 'quem convive com o paciente responde a entrevista pelo link, sem conta; vale só o token do link',
    prova: /\.rpc\('interview_link_open'/,
  },
  'online-consultation': {
    motivo: 'o paciente entra na consulta pelo link do agendamento, sem conta; o lado de quem atende confere a sessão no handler',
    prova: /token[\s\S]*const caller = await getCallerProfile\(req, \w+\);/,
  },
};

// Conferem a sessão, mas sem assertEdgeAccess, de propósito.
const SESSION_WITHOUT_ACCOUNT_GATE = {
  'complete-first-login': 'é a troca obrigatória de senha do primeiro acesso: o gate de conta barraria justamente quem precisa trocar',
  'log-logout': 'só registra a saída; sem sessão responde ok sem gravar nada',
};

const FUNCTIONS_ROOT = new URL('../../../supabase/functions/', import.meta.url);
const CONFIG = readFileSync(new URL('../../../supabase/config.toml', import.meta.url), 'utf8');

function publishedFunctions() {
  return readdirSync(FUNCTIONS_ROOT, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name !== '_shared')
    .map(entry => entry.name)
    .sort();
}

function verifyJwtOf(name) {
  // Blocos do TOML: cada "[cabeçalho]" até o próximo.
  const blocks = CONFIG.split(/^(?=\[)/m);
  const block = blocks.find(b => b.split(/\r?\n/)[0].trim() === `[functions.${name}]`);
  if (!block) return undefined;
  return block.match(/^verify_jwt\s*=\s*(true|false)\s*$/m)?.[1];
}

function handlerSource(name) {
  return readFileSync(new URL(`${name}/index.ts`, FUNCTIONS_ROOT), 'utf8');
}

// Sessão exigida: pega o perfil pelo token e devolve na hora quando falha.
const SESSION_CHECK = /const caller = await getCallerProfile\(req, \w+\);\r?\n(?:\s*\r?\n)?\s*if \('error' in caller\) (?:\{\r?\n\s*)?return /;
const ACCOUNT_GATE = /assertEdgeAccess\(caller\.profile, caller\.claims\)/;

test('KEYS-1: toda função publicada tem bloco próprio no config.toml com verify_jwt = false', () => {
  const functions = publishedFunctions();
  assert.equal(functions.length, 23, 'mudou o número de funções: confira a lista de republicar do review');
  const notFalse = functions.filter(name => verifyJwtOf(name) !== 'false');
  assert.deepEqual(notFalse, [], 'sem bloco, o padrão é verify_jwt = true e o gateway barra a chave nova');
});

test('KEYS-1: função sem verify_jwt confere a sessão no código ou é pública de propósito, com motivo', () => {
  const problems = [];
  for (const name of publishedFunctions().filter(n => verifyJwtOf(n) === 'false')) {
    const src = handlerSource(name);
    const pub = PUBLIC_FUNCTIONS[name];
    if (pub) {
      if (!pub.motivo || pub.motivo.length < 20) problems.push(`${name}: pública sem motivo`);
      if (!/enforceEdgeRateLimit\(/.test(src)) problems.push(`${name}: pública sem limite de tentativas`);
      if (!pub.prova.test(src)) problems.push(`${name}: pública sem a própria conferência (${pub.prova})`);
      continue;
    }
    if (!SESSION_CHECK.test(src)) { problems.push(`${name}: sem conferência de sessão e fora da lista de públicas`); continue; }
    if (!ACCOUNT_GATE.test(src) && !SESSION_WITHOUT_ACCOUNT_GATE[name]) problems.push(`${name}: sessão sem assertEdgeAccess (conta ativa, troca de senha, MFA)`);
  }
  assert.deepEqual(problems, []);
});

test('KEYS-1: as listas não apodrecem', () => {
  const functions = new Set(publishedFunctions());
  for (const name of [...Object.keys(PUBLIC_FUNCTIONS), ...Object.keys(SESSION_WITHOUT_ACCOUNT_GATE)]) {
    assert.ok(functions.has(name), `${name} está na lista mas não existe mais`);
  }
  // quem está na lista sem gate precisa ao menos conferir a sessão
  for (const name of Object.keys(SESSION_WITHOUT_ACCOUNT_GATE)) {
    assert.match(handlerSource(name), SESSION_CHECK, `${name}: na lista sem gate, mas sem conferir a sessão`);
  }
});
