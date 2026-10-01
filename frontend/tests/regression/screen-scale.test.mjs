import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdir, readFile } from 'node:fs/promises';

// Escala da tela inteira (--app-zoom no body) e telas do hub na largura
// toda. Com zoom, 1vh passa a cobrir 1,1 da janela: altura presa à janela
// sem compensar empurra janela e tela cheia para fora da tela. E o
// getBoundingClientRect volta multiplicado pelo zoom, o offsetHeight não:
// a paginação do relatório não pode misturar os dois.

const here = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(here, '../../src');

async function listFiles(dir, exts) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(full, exts);
    return exts.some((ext) => entry.name.endsWith(ext)) ? [full] : [];
  }));
  return nested.flat();
}

function stripCssComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\r\n]/g, ' '));
}

let tokens;
let appCss;
let hubCss;
let pagination;
let sources;

before(async () => {
  tokens = await readFile(path.join(srcDir, 'styles/tokens.css'), 'utf8');
  appCss = await readFile(path.join(srcDir, 'App.css'), 'utf8');
  hubCss = await readFile(path.join(srcDir, 'styles/hub.css'), 'utf8');
  pagination = await readFile(path.join(srcDir, 'components/report/reportPagination.js'), 'utf8');
  const files = await listFiles(srcDir, ['.css', '.jsx']);
  sources = await Promise.all(files.map(async (file) => ({
    file: path.relative(srcDir, file),
    text: await readFile(file, 'utf8'),
  })));
});

test('zoom só na tela, de notebook pra cima; impressão e celular ficam em 1', () => {
  assert.match(tokens, /--app-zoom:\s*1;/);
  assert.match(tokens, /@media screen and \(min-width: 1025px\)\s*\{\s*:root\s*\{\s*--app-zoom:\s*1\.\d+;/);
  assert.match(appCss, /body\s*\{[^}]*zoom:\s*var\(--app-zoom\);/);
});

test('tokens de altura/largura da janela desfazem o zoom', () => {
  for (const unit of ['vh', 'svh', 'dvh', 'vw']) {
    assert.match(tokens, new RegExp(`--${unit}:\\s*calc\\(1${unit} \\/ var\\(--app-zoom\\)\\);`));
  }
});

test('nenhuma altura presa à janela escapa da compensação do zoom', () => {
  const offenders = [];
  for (const { file, text } of sources) {
    if (file.replace(/\\/g, '/') === 'styles/tokens.css') continue;
    const code = file.endsWith('.css') ? stripCssComments(text) : text;
    code.split(/\r?\n/).forEach((line, index) => {
      if (/^\s*@(media|supports|container)/.test(line)) return;
      if (/\b\d+(?:\.\d+)?(vh|svh|dvh|lvh)\b/.test(line)) offenders.push(`${file}:${index + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(offenders, [], 'use calc(N * var(--vh)) / var(--svh) / var(--dvh)');
});

test('largura presa à janela no visualizador de imagem também compensa', () => {
  assert.doesNotMatch(appCss, /width:\s*min\(1380px,\s*96vw\)/);
  assert.doesNotMatch(appCss, /calc\(\(100vw - 1380px\)/);
});

test('paginação do relatório mede cabeçalho e rodapé sem o zoom da tela', () => {
  assert.match(pagination, /function paperHeight\(el\)\s*\{\s*return el\.getBoundingClientRect\(\)\.height \/ \(el\.currentCSSZoom \|\| 1\);/);
  assert.match(pagination, /const headerH = paperHeight\(header\);/);
  assert.match(pagination, /const footerH = paperHeight\(footer\);/);
  const rawRects = pagination.match(/getBoundingClientRect\(\)/g) || [];
  assert.equal(rawRects.length, 1, 'getBoundingClientRect só dentro de paperHeight');
});

test('telas do hub ocupam a largura inteira', () => {
  const rule = hubCss.match(/\n\.hub-body\s*\{([^}]*)\}/);
  assert.ok(rule, '.hub-body não encontrado');
  assert.doesNotMatch(rule[1], /max-width/);
  assert.doesNotMatch(rule[1], /margin:\s*0 auto/);
});
