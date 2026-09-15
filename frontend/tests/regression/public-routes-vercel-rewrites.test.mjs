import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

// Achado 15/09/2026: o link público da agenda (/agenda-publica) ficou
// quebrado em produção desde que a rota foi criada (b12a940) — o Vercel
// devolvia 404 puro antes do React sequer montar, porque vercel.json
// nunca ganhou a regra de rewrite pra essa rota (só /pesquisa-satisfacao
// e /confirmar-agendamento tinham). Sem rewrite, uma navegação direta
// (link do WhatsApp, favorito) cai fora do SPA. Este teste garante que
// toda rota pública declarada em main.jsx tem rewrite correspondente —
// para não se repetir na próxima rota pública que alguém criar.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('toda rota pública de main.jsx (isPublic*Route) tem rewrite em vercel.json', async () => {
  const mainSource = await readFile(path.resolve(root, 'src/main.jsx'), 'utf8');
  const vercelConfig = JSON.parse(await readFile(path.resolve(root, 'vercel.json'), 'utf8'));

  const routeMatches = [...mainSource.matchAll(/const isPublic\w+Route = path === '([^']+)'/g)];
  assert.ok(routeMatches.length >= 3, 'esperado achar pelo menos as 3 rotas públicas conhecidas em main.jsx');

  const rewriteSources = new Set((vercelConfig.rewrites || []).map(r => r.source));

  for (const [, routePath] of routeMatches) {
    assert.ok(
      rewriteSources.has(routePath),
      `vercel.json não tem rewrite para a rota pública "${routePath}" declarada em main.jsx — sem isso, o Vercel devolve 404 antes do React montar`,
    );
  }
});
