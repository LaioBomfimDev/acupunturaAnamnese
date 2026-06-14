import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function readCssRule(css, selector) {
  const start = css.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `regra CSS não encontrada: ${selector}`);

  const bodyStart = css.indexOf('{', start) + 1;
  let depth = 1;

  for (let index = bodyStart; index < css.length; index += 1) {
    if (css[index] === '{') depth += 1;
    if (css[index] === '}') depth -= 1;
    if (depth === 0) return css.slice(bodyStart, index);
  }

  assert.fail(`regra CSS sem fechamento: ${selector}`);
}

test('prévia do mapa não invade o frame do PDF no dialog de revisão do ponto', async () => {
  const css = await readFile(path.join(root, 'src/App.css'), 'utf8');
  const sourceRule = readCssRule(css, '.point-review-source');
  const mapPreviewImageRule = readCssRule(css, '.point-review-map-preview img');

  assert.match(
    sourceRule,
    /grid-template-rows:\s*auto\s+auto\s+auto\s+auto;/,
    'a coluna precisa reservar linhas separadas para cabeçalho, PDF, mapa e metadados',
  );
  assert.match(
    sourceRule,
    /overflow:\s*auto;/,
    'a coluna precisa rolar quando PDF e mapa não couberem juntos no modal',
  );
  assert.match(
    mapPreviewImageRule,
    /max-height:\s*240px;/,
    'o mapa calibrado deve ser uma prévia compacta abaixo da fonte visual',
  );
});
