import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  detectLanguageHint,
  importPdfJsForTextExtraction,
  loadSourceCatalog,
  missingOcrPackages,
  selectOcrNodeModules,
  selectSources,
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

test('detector de idioma diferencia espanhol de pt-BR em fontes locais', () => {
  const spanish = 'El tratamiento con láser se aplica en puntos de acupuntura, con cuidado en la piel del paciente.';
  const portuguese = 'O tratamento com laser se aplica em pontos de acupuntura, com cuidado na pele do paciente.';

  assert.equal(detectLanguageHint(spanish, 'unknown'), 'es');
  assert.equal(detectLanguageHint(portuguese, 'unknown'), 'pt-BR');
});

test('catalogo local de PDFs normaliza fontes e permite selecionar lote confiavel', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pdf-source-catalog-'));
  try {
    const catalogPath = path.join(tempRoot, 'catalog.local.json');
    await fs.mkdir(path.join(tempRoot, 'pdfs'), { recursive: true });
    await fs.writeFile(catalogPath, JSON.stringify({
      schemaVersion: 'sistema-acup-pdf-source-catalog.v1',
      sources: [{
        key: 'atlas-confiavel-teste',
        title: 'Atlas Confiavel Teste',
        authors: 'Autora Um; Autor Dois',
        originalLanguage: 'pt-BR',
        sourceType: 'atlas de pontos sistemicos',
        path: 'pdfs/atlas.pdf',
        trustTier: 'atlas_confiavel_operadora',
        knowledgeDomain: 'lingua',
        candidateExtractionPolicy: 'source_only_no_point_candidate_scan',
        clinicalActivationPolicy: 'Manter em review ate aprovacao profissional.',
        use: 'Fonte atlas confiavel para curadoria rastreavel.',
      }],
    }), 'utf8');

    const sources = await loadSourceCatalog(catalogPath);
    assert.equal(sources.length, 1);
    assert.equal(sources[0].key, 'atlas-confiavel-teste');
    assert.deepEqual(sources[0].authors, ['Autora Um', 'Autor Dois']);
    assert.equal(sources[0].path, path.join(tempRoot, 'pdfs', 'atlas.pdf'));
    assert.equal(sources[0].trustTier, 'atlas_confiavel_operadora');
    assert.equal(sources[0].knowledgeDomain, 'lingua');
    assert.equal(sources[0].candidateExtractionPolicy, 'source_only_no_point_candidate_scan');

    const selected = selectSources({ sources: 'atlas-confiavel-teste' }, sources);
    assert.equal(selected.length, 1);
    assert.equal(selected[0].clinicalActivationPolicy, 'Manter em review ate aprovacao profissional.');
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
