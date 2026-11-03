// ============================================================
// Regressão de 03/11/2026: no Financeiro (e na Gestão), clicar numa
// parte do menu lá embaixo (ex.: Convênios → Lotes) deixava a página
// rolada onde estava, e a parte nova, que começa no topo, parecia vazia.
// Trocar de parte pelo menu, por um quadro do Resumo, por link interno
// ou por "Voltar ao Resumo" leva ao título da parte (scrollToSectionTop).
// ============================================================

import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => readFile(path.join(root, file), 'utf8');

test('menu da Gestão e do Financeiro leva ao título da parte escolhida', async () => {
  const nav = await read('src/components/panels/GestaoNav.jsx');
  const helper = await read('src/utils/sectionScroll.js');
  assert.match(helper, /export function scrollToSectionTop\(fromNode\)/);
  // Só rola quando o título ficou acima da tela, e sem animação para quem pede menos movimento.
  assert.match(helper, /getBoundingClientRect\(\)\.top >= 0\) return;/);
  assert.match(helper, /prefers-reduced-motion: reduce/);
  assert.match(nav, /onSelect\(id\);\s*\r?\n\s*scrollToSectionTop\(event\.currentTarget\);/);
});

test('Financeiro: quadro do Resumo, links internos e "Voltar ao Resumo" também levam ao topo', async () => {
  const screen = await read('src/components/financeiro/FinanceiroScreen.jsx');
  assert.match(screen, /const goTo = id => \{ setSection\(id\); setFlash\(''\); scrollToSectionTop\(null\); \};/);
  // Nada troca de parte por fora do goTo (quadros, links e "Voltar" usam ele).
  assert.doesNotMatch(screen, /setSection\('resumo'\)|onOpen=\{setSection\}|onSelect=\{setSection\}/);
});

test('Gestão: quadro do Resumo e "Voltar ao Resumo" levam ao topo', async () => {
  const gestao = await read('src/components/panels/RelatoriosGestao.jsx');
  assert.match(gestao, /onOpen=\{id => \{ setSection\(id\); scrollToSectionTop\(null\); \}\}/);
  assert.match(gestao, /onClick=\{\(\) => \{ setSection\('resumo'\); scrollToSectionTop\(null\); \}\}/);
});
