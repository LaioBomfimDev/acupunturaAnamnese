import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  importPdfJsForTextExtraction,
  missingOcrPackages,
  selectOcrNodeModules,
} from './ingest-local-pdf-sources.mjs';

async function createPackageDir(nodeModules, packageName) {
  await fs.mkdir(path.join(nodeModules, packageName), { recursive: true });
}

test('importacao do PDF.js para texto nao vaza aviso de @napi-rs/canvas', async () => {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...values) => warnings.push(values.join(' '));

  try {
    const pdfjsLib = await importPdfJsForTextExtraction();
    assert.equal(typeof pdfjsLib.getDocument, 'function');
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(warnings.some(message => message.includes('@napi-rs/canvas')), false);
});

test('runtime OCR parcial nao e selecionado para Tesseract', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pdf-source-ocr-runtime-'));
  try {
    const incomplete = path.join(tempRoot, 'incomplete', 'node_modules');
    const complete = path.join(tempRoot, 'complete', 'node_modules');

    await createPackageDir(incomplete, 'tesseract.js');
    assert.deepEqual(
      missingOcrPackages(incomplete).sort(),
      ['regenerator-runtime', 'tesseract.js-core'].sort(),
    );
    assert.equal(selectOcrNodeModules([incomplete]), null);

    await createPackageDir(complete, 'tesseract.js');
    await createPackageDir(complete, 'tesseract.js-core');
    await createPackageDir(complete, 'regenerator-runtime');
    assert.equal(selectOcrNodeModules([incomplete, complete]), complete);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
