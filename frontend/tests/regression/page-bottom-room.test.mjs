// ============================================================
// Regressão de 03/11/2026: toda página rolava 88px além do sistema, com
// uma faixa em branco embaixo e a lateral escura terminando antes do fim
// (o espaço do botão da assistente ficava no #root, por fora do fundo das
// telas). Rolar além do topo também mostrava o fundo da página.
// Verificado no Chromium com o CSS do build (tela inicial, hub e área,
// curto e comprido, 1440 e 390 px): sem sobra abaixo da tela, lateral
// até o fim e o último item acima do botão.
// ============================================================

import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => readFile(path.join(root, file), 'utf8');

test('espaço do botão da assistente mora dentro da coluna de conteúdo, não no #root', async () => {
  const css = await read('src/styles/assistant.css');
  assert.match(css, /body:has\(\.ca-launcher\) \.hc-main::after,\s*\r?\nbody:has\(\.ca-launcher\) \.hub-body::after,\s*\r?\nbody:has\(\.ca-launcher\) \.main::after \{\s*\r?\n\s*content: '';\s*\r?\n\s*display: block;\s*\r?\n\s*height: var\(--ca-launcher-room\);/);
  // O #root só ganha o espaço quando a tela não tem nenhuma dessas colunas.
  assert.match(css, /body:has\(\.ca-launcher\):not\(:has\(\.hc-main, \.hub-body, \.main\)\) #root \{/);
  assert.doesNotMatch(css, /^body:has\(\.ca-launcher\) #root \{/m);
});

test('sem "puxão" além do topo e do fim da página', async () => {
  const css = await read('src/styles/assistant.css');
  assert.match(css, /html,\s*\r?\nbody \{\s*\r?\n\s*overscroll-behavior-y: none;/);
});

test('as colunas que recebem o espaço continuam sendo bloco (o ::after não vira item de grade)', async () => {
  const app = await read('src/App.css');
  const hub = await read('src/styles/hub.css');
  const consoleCss = await read('src/styles/console.css');
  for (const [source, selector] of [[app, '\\.main'], [hub, '\\.hub-body'], [consoleCss, '\\.hc-main']]) {
    const block = source.match(new RegExp(`^${selector} \\{([^}]*)\\}`, 'm'));
    assert.ok(block, selector);
    assert.doesNotMatch(block[1], /display:\s*(grid|flex)/, selector);
  }
});
