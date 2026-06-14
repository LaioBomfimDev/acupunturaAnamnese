import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  buildCandidateLinksForPages,
  buildCandidateTermsForRecord,
  buildAuricularTerms,
  compileTerm,
  findTermMatches,
} from './connect-pdf-source-candidates.mjs';

test('normaliza aliases de ponto sem aceitar match colado em palavra', () => {
  const terms = buildCandidateTermsForRecord({
    code: 'LI4',
    displayCode: 'LI4',
    titlePtBr: 'LI4 - Hegu',
    names: { pinyin: 'Hegu' },
  }).map(compileTerm).filter(Boolean);

  const matches = findTermMatches('A pagina cita IG-4 e Hegu. O token CLI4X nao deve contar.', terms);
  const values = matches.map(match => match.value);

  assert.ok(values.some(value => value === 'IG4' || value === 'IG-4'));
  assert.ok(values.includes('Hegu'));
  assert.ok(!matches.some(match => match.value === 'LI4'));
});

test('fonte nao pt-BR gera candidato bloqueado para ficha clinica', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pdf-source-candidates-'));
  try {
    await fs.mkdir(path.join(tempRoot, 'text'), { recursive: true });
    await fs.writeFile(path.join(tempRoot, 'text', 'page-001.txt'), 'LU1 is cited as an acupuncture point.', 'utf8');

    const manifest = {
      source: {
        key: 'english-source',
        title: 'English source',
        sourceType: 'livro clinico',
        originalLanguage: 'en',
      },
      policy: {
        originalLanguage: 'en',
      },
      pages: [{
        pageNumber: 1,
        languageHint: 'en',
        extraction: { file: 'text/page-001.txt' },
        ocr: {},
        image: { publicUrl: '/page-001.webp' },
      }],
    };
    const compiledTerms = buildCandidateTermsForRecord({
      code: 'LU1',
      displayCode: 'LU1',
      titlePtBr: 'LU1 - Pulmao',
    }).map(compileTerm).filter(Boolean);

    const result = await buildCandidateLinksForPages({
      source: manifest.source,
      manifest,
      sourceRoot: tempRoot,
      compiledTerms,
      auricularCompiledTerms: [],
    });

    assert.equal(result.links.length, 1);
    assert.equal(result.links[0].status, 'review');
    assert.equal(result.links[0].languagePolicy.requiresPtBrSynthesis, true);
    assert.equal(result.links[0].clinicalUse.canPopulatePointPageNow, false);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('termo auricular em fonte auricular vira candidato separado', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pdf-source-auricular-'));
  try {
    await fs.mkdir(path.join(tempRoot, 'text'), { recursive: true });
    await fs.writeFile(path.join(tempRoot, 'text', 'page-001.txt'), 'Protocolo auricular com Shen Men e Fome.', 'utf8');

    const manifest = {
      source: {
        key: 'auricular-source',
        title: 'Manual de auriculoterapia',
        sourceType: 'auriculoterapia manual',
        originalLanguage: 'pt-BR',
      },
      policy: {
        originalLanguage: 'pt-BR',
      },
      pages: [{
        pageNumber: 1,
        languageHint: 'pt-BR',
        extraction: { file: 'text/page-001.txt' },
        ocr: {},
        image: { publicUrl: '/page-001.webp' },
      }],
    };
    const auricularCompiledTerms = [{
      value: 'Shen Men',
      type: 'auricular_term',
      confidence: 0.86,
      targetCode: 'auricular:shen-men',
      targetType: 'auricular_point',
      targetLabel: 'Shen Men',
    }].map(compileTerm).filter(Boolean);

    const result = await buildCandidateLinksForPages({
      source: manifest.source,
      manifest,
      sourceRoot: tempRoot,
      compiledTerms: [],
      auricularCompiledTerms,
    });

    assert.equal(result.links.length, 0);
    assert.equal(result.auricularLinks.length, 1);
    assert.equal(result.auricularLinks[0].code, 'auricular:shen-men');
    assert.equal(result.auricularLinks[0].languagePolicy.requiresPtBrSynthesis, false);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('termos auriculares sao carregados da lista de pontos PDF', () => {
  const terms = buildAuricularTerms();

  assert.ok(terms.some(term => term.targetCode === 'auricular:pulmao' && term.value === 'Pulmão'));
  assert.ok(terms.some(term => term.targetCode === 'auricular:vesicula-biliar'));
  assert.ok(terms.some(term => term.targetCode === 'AA1'));
});
