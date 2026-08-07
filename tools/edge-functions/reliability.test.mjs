import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test, { afterEach } from 'node:test';

import { writeAuditLog } from '../../supabase/functions/_shared/audit.ts';
import {
  createCorrelationId,
  logOperationalEvent,
} from '../../supabase/functions/_shared/observability.ts';
import {
  parseCorsAllowedOrigins,
  resolveCorsDecision,
} from '../../supabase/functions/_shared/corsPolicy.ts';
import {
  assertEdgeAccess,
  decodeVerifiedAuthClaims,
} from '../../supabase/functions/_shared/edgeAccess.ts';
import {
  consumePersistentRateLimit,
  enforceEdgeRateLimit,
  resolveEdgeRateLimitConfig,
} from '../../supabase/functions/_shared/rateLimit.ts';
import {
  fetchWithDeadlineAndRetry,
  ReliableFetchError,
  resolveVertexLocation,
} from '../../supabase/functions/_shared/vertexReliability.ts';

const originalConsoleError = console.error;

afterEach(() => {
  console.error = originalConsoleError;
});

test('região Vertex é obrigatória e o padrão permite somente residência BR', () => {
  assert.equal(
    resolveVertexLocation('southamerica-east1'),
    'southamerica-east1',
  );
  assert.throws(
    () => resolveVertexLocation(undefined),
    error => error?.code === 'location_missing',
  );
  assert.throws(
    () => resolveVertexLocation('us-central1'),
    error => error?.code === 'location_not_approved',
  );
  assert.throws(
    () => resolveVertexLocation('global'),
    error => error?.code === 'location_not_approved',
  );
});

test('allowlist Vertex só amplia regiões quando configurada explicitamente', () => {
  assert.equal(
    resolveVertexLocation(
      'us-central1',
      'southamerica-east1, us-central1',
    ),
    'us-central1',
  );
  assert.throws(
    () => resolveVertexLocation('southamerica-east1', ''),
    error => error?.code === 'allowed_locations_empty',
  );
  assert.throws(
    () => resolveVertexLocation('southamerica-east1', 'regiao-invalida'),
    error => error?.code === 'location_invalid',
  );
});

test('retry ocorre em resposta HTTP transitória com backoff exponencial', async () => {
  let attempts = 0;
  const delays = [];
  const response = await fetchWithDeadlineAndRetry(
    'https://example.invalid',
    { method: 'POST', body: '{}' },
    {
      correlationId: createCorrelationId('retry-http-test'),
      timeoutMs: 1_000,
      maxAttempts: 3,
      retryBaseMs: 100,
      random: () => 0,
      sleep: async delayMs => delays.push(delayMs),
      fetchImpl: async () => {
        attempts += 1;
        return attempts <= 2
          ? new Response('indisponível', { status: 503 })
          : new Response('ok', { status: 200 });
      },
    },
  );

  assert.equal(response.status, 200);
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [100, 200]);
});

test('não repete erro HTTP definitivo nem erro de rede da geração', async () => {
  let definitiveAttempts = 0;
  const definitiveResponse = await fetchWithDeadlineAndRetry(
    'https://example.invalid',
    { method: 'POST' },
    {
      correlationId: 'no-retry-http',
      timeoutMs: 1_000,
      maxAttempts: 3,
      sleep: async () => assert.fail('não deveria aguardar retry'),
      fetchImpl: async () => {
        definitiveAttempts += 1;
        return new Response('requisição inválida', { status: 400 });
      },
    },
  );

  assert.equal(definitiveResponse.status, 400);
  assert.equal(definitiveAttempts, 1);

  let networkAttempts = 0;
  await assert.rejects(
    fetchWithDeadlineAndRetry(
      'https://example.invalid',
      { method: 'POST' },
      {
        correlationId: 'no-retry-network',
        timeoutMs: 1_000,
        maxAttempts: 3,
        retryOnNetworkError: false,
        sleep: async () => assert.fail('não deveria aguardar retry'),
        fetchImpl: async () => {
          networkAttempts += 1;
          throw new TypeError('conteúdo potencialmente sensível');
        },
      },
    ),
    error => error instanceof ReliableFetchError
      && error.reason === 'network_error'
      && !error.message.includes('sensível'),
  );
  assert.equal(networkAttempts, 1);
});

test('erro de rede só é repetido quando a operação declara que é segura', async () => {
  let attempts = 0;
  const delays = [];
  const response = await fetchWithDeadlineAndRetry(
    'https://example.invalid',
    { method: 'POST' },
    {
      correlationId: 'oauth-network-retry',
      timeoutMs: 1_000,
      maxAttempts: 2,
      retryBaseMs: 100,
      retryOnNetworkError: true,
      random: () => 0,
      sleep: async delayMs => delays.push(delayMs),
      fetchImpl: async () => {
        attempts += 1;
        if (attempts === 1) throw new TypeError('network down');
        return new Response('ok', { status: 200 });
      },
    },
  );

  assert.equal(response.status, 200);
  assert.equal(attempts, 2);
  assert.deepEqual(delays, [100]);
});

test('deadline aborta a chamada e não repete geração possivelmente aceita', async () => {
  let attempts = 0;
  await assert.rejects(
    fetchWithDeadlineAndRetry(
      'https://example.invalid',
      { method: 'POST' },
      {
        correlationId: 'deadline-test',
        timeoutMs: 5,
        maxAttempts: 3,
        retryOnNetworkError: false,
        fetchImpl: async (_input, init) => {
          attempts += 1;
          return await new Promise((_resolve, reject) => {
            init.signal.addEventListener(
              'abort',
              () => reject(new DOMException('aborted', 'AbortError')),
              { once: true },
            );
          });
        },
      },
    ),
    error => error instanceof ReliableFetchError && error.reason === 'timeout',
  );
  assert.equal(attempts, 1);
});

test('deadline permanece ativo até a leitura completa do corpo da resposta', async () => {
  let attempts = 0;
  await assert.rejects(
    fetchWithDeadlineAndRetry(
      'https://example.invalid',
      { method: 'POST' },
      {
        correlationId: 'response-body-deadline',
        timeoutMs: 5,
        maxAttempts: 2,
        retryOnNetworkError: false,
        fetchImpl: async (_input, init) => {
          attempts += 1;
          return new Response(new ReadableStream({
            start(controller) {
              init.signal.addEventListener(
                'abort',
                () => controller.error(new DOMException('aborted', 'AbortError')),
                { once: true },
              );
            },
          }));
        },
      },
    ),
    error => error instanceof ReliableFetchError && error.reason === 'timeout',
  );
  assert.equal(attempts, 1);
});

test('writeAuditLog detecta { error } retornado e registra somente metadados seguros', async () => {
  const logLines = [];
  console.error = line => logLines.push(String(line));

  const ok = await writeAuditLog(
    {
      from(table) {
        assert.equal(table, 'admin_audit_logs');
        return {
          async insert() {
            return {
              error: {
                code: '23505',
                message: 'token=segredo email=paciente@example.com',
              },
            };
          },
        };
      },
    },
    {
      actorId: 'usuario-123',
      targetId: 'paciente-456',
      action: 'reset_password',
      details: {
        secret: 'segredo',
        email: 'paciente@example.com',
      },
    },
  );

  assert.equal(ok, false);
  assert.equal(logLines.length, 1);
  assert.match(logLines[0], /"event":"admin_audit_write_failed"/);
  assert.match(logLines[0], /"action":"reset_password"/);
  assert.match(logLines[0], /"errorCode":"23505"/);
  assert.doesNotMatch(
    logLines[0],
    /segredo|paciente@example\.com|usuario-123|paciente-456/,
  );
});

test('writeAuditLog preserva o contrato de inserção e retorna sucesso explícito', async () => {
  let inserted;
  const ok = await writeAuditLog(
    {
      from() {
        return {
          async insert(values) {
            inserted = values;
            return { error: null };
          },
        };
      },
    },
    {
      actorId: 'ator',
      targetId: 'alvo',
      action: 'create_user',
      details: { role: 'admin' },
    },
  );

  assert.equal(ok, true);
  assert.deepEqual(inserted, {
    actor_id: 'ator',
    target_id: 'alvo',
    action: 'create_user',
    details: { role: 'admin' },
  });
});

test('logger estruturado descarta campos fora da allowlist', () => {
  const logLines = [];
  console.error = line => logLines.push(String(line));

  logOperationalEvent('error', 'safe_event', {
    correlationId: 'correlation-123',
    operation: 'vertex_generate_content',
    secret: 'não-pode-aparecer',
    body: '{"patient":"nome"}',
  });

  assert.equal(logLines.length, 1);
  assert.match(logLines[0], /"correlationId":"correlation-123"/);
  assert.doesNotMatch(logLines[0], /não-pode-aparecer|patient|nome|secret|body/);
});

test('CORS aceita somente origens exatas da allowlist', () => {
  assert.deepEqual(
    parseCorsAllowedOrigins('https://app.exemplo.com, https://admin.exemplo.com/'),
    ['https://app.exemplo.com', 'https://admin.exemplo.com'],
  );
  assert.deepEqual(
    resolveCorsDecision(
      'https://app.exemplo.com',
      'https://app.exemplo.com,https://admin.exemplo.com',
    ),
    { allowed: true, origin: 'https://app.exemplo.com' },
  );
  assert.equal(
    resolveCorsDecision(
      'https://sub.app.exemplo.com',
      'https://app.exemplo.com',
    ).allowed,
    false,
  );
  assert.equal(
    resolveCorsDecision('https://app.exemplo.com', '*').reason,
    'invalid_configuration',
  );
  assert.equal(
    resolveCorsDecision(null, null).allowed,
    true,
    'requisição servidor-a-servidor sem Origin deve continuar possível',
  );
});

test('origens locais exigem opt-in explícito e permanecem exatas', () => {
  assert.equal(
    resolveCorsDecision('http://localhost:5173', null, false).allowed,
    false,
  );
  assert.equal(
    resolveCorsDecision('http://localhost:5173', null, true).allowed,
    true,
  );
  assert.equal(
    resolveCorsDecision('http://localhost:3000', null, true).allowed,
    false,
  );
  assert.equal(
    resolveCorsDecision(
      'http://app.exemplo.com',
      'http://app.exemplo.com',
      true,
    ).allowed,
    false,
    'opt-in local nunca deve liberar HTTP remoto',
  );
  assert.equal(
    resolveCorsDecision(
      'http://localhost:5173',
      'http://localhost:5173',
      false,
    ).reason,
    'invalid_configuration',
  );
});

test('rate limit persistente repassa contrato atômico e aceita decisão válida', async () => {
  let rpcCall;
  const decision = await consumePersistentRateLimit(
    {
      async rpc(name, parameters) {
        rpcCall = { name, parameters };
        return {
          data: {
            allowed: true,
            remaining: 4,
            retry_after_seconds: 0,
            reset_at: '2026-07-23T15:00:00.000Z',
          },
          error: null,
        };
      },
    },
    {
      subjectId: '123e4567-e89b-42d3-a456-426614174000',
      functionName: 'clinical-reasoning',
      windowSeconds: 60,
      limit: 5,
    },
  );

  assert.deepEqual(rpcCall, {
    name: 'consume_edge_rate_limit',
    parameters: {
      p_subject_id: '123e4567-e89b-42d3-a456-426614174000',
      p_function_name: 'clinical-reasoning',
      p_window_seconds: 60,
      p_limit: 5,
    },
  });
  assert.deepEqual(decision, {
    allowed: true,
    status: 200,
    remaining: 4,
    retryAfterSeconds: 0,
    resetAt: '2026-07-23T15:00:00.000Z',
  });
});

test('rate limit bloqueia excesso com 429 e indisponibilidade com 503', async () => {
  const exceeded = await consumePersistentRateLimit(
    {
      async rpc() {
        return {
          data: [{
            allowed: false,
            remaining: 0,
            retry_after_seconds: 37,
            reset_at: '2026-07-23T15:00:00.000Z',
          }],
          error: null,
        };
      },
    },
    {
      subjectId: '123e4567-e89b-42d3-a456-426614174000',
      functionName: 'analyze-tongue',
      windowSeconds: 60,
      limit: 5,
    },
  );
  assert.equal(exceeded.allowed, false);
  assert.equal(exceeded.status, 429);
  assert.equal(exceeded.retryAfterSeconds, 37);

  const logLines = [];
  console.error = line => logLines.push(String(line));
  const unavailable = await consumePersistentRateLimit(
    {
      async rpc() {
        return {
          data: null,
          error: {
            code: '42883',
            message: 'subject=123e4567-e89b-42d3-a456-426614174000 segredo',
          },
        };
      },
    },
    {
      subjectId: '123e4567-e89b-42d3-a456-426614174000',
      functionName: 'analyze-tongue',
      windowSeconds: 60,
      limit: 5,
    },
  );

  assert.equal(unavailable.allowed, false);
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.reason, 'storage_unavailable');
  assert.equal(logLines.length, 1);
  assert.match(logLines[0], /"event":"edge_rate_limit_failed"/);
  assert.doesNotMatch(logLines[0], /123e4567|segredo|subject/);
});

test('enforcement usa defaults conservadores e override por função', async () => {
  const requestedPolicies = [];
  const supabaseAdmin = {
    async rpc(_name, parameters) {
      requestedPolicies.push(parameters);
      return {
        data: {
          allowed: true,
          remaining: parameters.p_limit - 1,
          retry_after_seconds: 0,
          reset_at: '2026-07-23T15:00:00.000Z',
        },
        error: null,
      };
    },
  };
  const jsonResponse = (body, status = 200, headers = {}) =>
    new Response(JSON.stringify(body), { status, headers });

  const defaultResponse = await enforceEdgeRateLimit({
    supabaseAdmin,
    subjectId: '123e4567-e89b-42d3-a456-426614174000',
    functionName: 'clinical-reasoning',
    jsonResponse,
    readEnvironment: () => undefined,
  });
  assert.equal(defaultResponse, null);
  assert.equal(requestedPolicies[0].p_window_seconds, 60);
  assert.equal(requestedPolicies[0].p_limit, 20);

  const overrideEnvironment = new Map([
    ['EDGE_RATE_LIMIT_WINDOW_SECONDS', '120'],
    ['EDGE_RATE_LIMIT_MAX_REQUESTS', '30'],
    ['EDGE_RATE_LIMIT_CLINICAL_REASONING_MAX_REQUESTS', '7'],
  ]);
  assert.deepEqual(
    resolveEdgeRateLimitConfig(
      'clinical-reasoning',
      name => overrideEnvironment.get(name),
    ),
    { windowSeconds: 120, limit: 7 },
  );
});

test('enforcement devolve Retry-After em 429 e falha fechado em configuração inválida', async () => {
  const jsonResponse = (body, status = 200, headers = {}) =>
    new Response(JSON.stringify(body), { status, headers });
  const limitedResponse = await enforceEdgeRateLimit({
    supabaseAdmin: {
      async rpc() {
        return {
          data: {
            allowed: false,
            remaining: 0,
            retry_after_seconds: 19,
            reset_at: '2026-07-23T15:00:00.000Z',
          },
          error: null,
        };
      },
    },
    subjectId: '123e4567-e89b-42d3-a456-426614174000',
    functionName: 'library-qa',
    jsonResponse,
    readEnvironment: () => undefined,
  });

  assert.equal(limitedResponse.status, 429);
  assert.equal(limitedResponse.headers.get('Retry-After'), '19');
  assert.deepEqual(await limitedResponse.json(), {
    error: 'Muitas solicitações. Aguarde antes de tentar novamente.',
    retryAfterSeconds: 19,
  });

  const logLines = [];
  console.error = line => logLines.push(String(line));
  let rpcCalled = false;
  const invalidConfigResponse = await enforceEdgeRateLimit({
    supabaseAdmin: {
      async rpc() {
        rpcCalled = true;
        return { data: null, error: null };
      },
    },
    subjectId: '123e4567-e89b-42d3-a456-426614174000',
    functionName: 'library-qa',
    jsonResponse,
    readEnvironment: name =>
      name === 'EDGE_RATE_LIMIT_MAX_REQUESTS' ? 'inválido' : undefined,
  });

  assert.equal(invalidConfigResponse.status, 503);
  assert.equal(rpcCalled, false);
  assert.match(logLines[0], /"reason":"invalid_config"/);

  const storageResponse = await enforceEdgeRateLimit({
    supabaseAdmin: {
      async rpc() {
        return { data: null, error: { code: '57014' } };
      },
    },
    subjectId: '123e4567-e89b-42d3-a456-426614174000',
    functionName: 'library-qa',
    jsonResponse,
    readEnvironment: () => undefined,
  });
  assert.equal(storageResponse.status, 503);
  assert.deepEqual(await storageResponse.json(), {
    error: 'Limite de uso temporariamente indisponível.',
  });
});

test('assertEdgeAccess bloqueia suspensão, senha temporária e MFA pendente', () => {
  assert.deepEqual(
    assertEdgeAccess(
      { is_active: false, must_change_password: false, mfa_required: false },
      { aal: 'aal2' },
    ),
    {
      allowed: false,
      status: 403,
      error: 'Usuário suspenso.',
      reason: 'inactive',
    },
  );
  assert.equal(
    assertEdgeAccess(
      { is_active: true, must_change_password: true, mfa_required: false },
      { aal: 'aal2' },
    ).reason,
    'password_change_required',
  );
  assert.equal(
    assertEdgeAccess(
      { is_active: true, must_change_password: false, mfa_required: true },
      { aal: 'aal1' },
    ).reason,
    'mfa_required',
  );
  assert.deepEqual(
    assertEdgeAccess(
      { is_active: true, must_change_password: false, mfa_required: true },
      { aal: 'aal2' },
    ),
    { allowed: true },
  );
});

test('claims AAL são extraídas do JWT já verificado sem confiar em payload inválido', () => {
  const payload = Buffer.from(JSON.stringify({ sub: 'user', aal: 'aal2' }))
    .toString('base64url');
  assert.deepEqual(
    decodeVerifiedAuthClaims(`header.${payload}.signature`),
    { aal: 'aal2' },
  );
  assert.deepEqual(decodeVerifiedAuthClaims('token-inválido'), { aal: null });
});

test('vertex.ts conecta fail-closed, deadline e política de retry segura', () => {
  const vertexPath = fileURLToPath(
    new URL('../../supabase/functions/_shared/vertex.ts', import.meta.url),
  );
  const source = readFileSync(vertexPath, 'utf8');

  assert.match(source, /GCP_ALLOWED_LOCATIONS/);
  assert.match(source, /resolveVertexLocation/);
  assert.match(source, /fetchWithDeadlineAndRetry/);
  assert.match(source, /retryOnNetworkError:\s*false/);
  assert.match(source, /retryOnNetworkError:\s*true/);
  assert.match(source, /const maxAttempts = 1;/);
  assert.doesNotMatch(source, /VERTEX_REQUEST_MAX_ATTEMPTS/);
  assert.match(source, /DEFAULT_VERTEX_TIMEOUT_MS[\s\S]*5_000,[\s\S]*60_000/);
  assert.doesNotMatch(source, /\|\|\s*['"]us-central1['"]/);
});

test('handlers Edge aplicam CORS e rate limit; handlers sensíveis aplicam gate de acesso', () => {
  const securityPath = fileURLToPath(
    new URL('../../supabase/functions/_shared/security.ts', import.meta.url),
  );
  const securitySource = readFileSync(securityPath, 'utf8');
  assert.doesNotMatch(
    securitySource,
    /['"]Access-Control-Allow-Origin['"]\s*:\s*['"]\*['"]/,
  );

  const handlerPaths = [
    'analyze-tongue',
    'clinical-reasoning',
    'complete-first-login',
    'create-record-share',
    'draft-narrative',
    'food-research',
    'knowledge-source-asset-url',
    'library-qa',
    'login-with-identifier',
    'psych-reading',
    'psych-report',
    'psych-suggest-marks',
    'suggest-marks',
    'super-admin-create-user',
    'super-admin-reset-mfa',
    'super-admin-reset-password',
  ];
  const accessExemptHandlers = new Set([
    'complete-first-login',
    'login-with-identifier',
  ]);

  for (const handler of handlerPaths) {
    const source = readFileSync(
      fileURLToPath(
        new URL(`../../supabase/functions/${handler}/index.ts`, import.meta.url),
      ),
      'utf8',
    );
    assert.match(source, /const cors = createCorsContext\(req\)/, handler);
    assert.match(source, /if \(!cors\.allowed\) return cors\.rejectResponse\(\)/, handler);
    assert.match(source, /enforceEdgeRateLimit\(\{/, handler);
    const rateLimitIndex = source.indexOf('enforceEdgeRateLimit({');
    const bodyIndex = source.indexOf('req.json()');
    assert.ok(rateLimitIndex >= 0, handler);
    if (handler !== 'login-with-identifier') {
      assert.ok(bodyIndex < 0 || rateLimitIndex < bodyIndex, handler);
    }

    if (!accessExemptHandlers.has(handler)) {
      assert.match(source, /assertEdgeAccess\(caller\.profile, caller\.claims\)/, handler);
      const getCallerIndex = source.indexOf('getCallerProfile(req, supabaseAdmin)');
      const accessIndex = source.indexOf(
        'assertEdgeAccess(caller.profile, caller.claims)',
      );
      assert.ok(getCallerIndex >= 0 && accessIndex > getCallerIndex, handler);
      assert.ok(rateLimitIndex > accessIndex, handler);
    }
  }

  const loginSource = readFileSync(
    fileURLToPath(
      new URL(
        '../../supabase/functions/login-with-identifier/index.ts',
        import.meta.url,
      ),
    ),
    'utf8',
  );
  assert.ok(
    loginSource.indexOf('enforceEdgeRateLimit({')
      < loginSource.indexOf('signInWithPassword'),
  );

  const securitySourceGetUser = securitySource.indexOf(
    'supabaseAdmin.auth.getUser(token)',
  );
  const securitySourceDecodeClaims = securitySource.indexOf(
    'decodeVerifiedAuthClaims(token)',
  );
  assert.match(securitySource, /must_change_password,mfa_required/);
  assert.ok(securitySourceGetUser >= 0);
  assert.ok(securitySourceDecodeClaims > securitySourceGetUser);
});
