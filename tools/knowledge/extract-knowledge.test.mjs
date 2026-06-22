import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  extractTierAFromSemiology,
  parseSemiologyTongueCasePage,
  runExtraction,
  validateFindingReferences,
} from './extract-knowledge.mjs';

const knownPatterns = new Set([
  'Umidade-Calor',
  'Deficiência de Qi do Baço',
  'Agitação do Shen por Calor',
]);

const semioSample = 'Língua 37 Língua pálida com revestimento amarelo, pegajosa e negro no centro ASPECTO LINGUAL: Língua Clara, mas com tonalidade mais escura. Saburra: Amarela, espessa e de aspecto sujo na zona central da língua. Principais etiopatogenias: Retenção de frio-umidade no aquecedor médio que se converte em calor. Diagnóstico: Deficiência do baço com exacerbação de umidade, umidade-calor. Comumente vista em casos de doenças cardiovasculares.';

test('parser deterministico da Semiologia extrai caso, saburra e diagnostico', () => {
  const parsed = parseSemiologyTongueCasePage(semioSample, 40);

  assert.equal(parsed.caseNumber, 37);
  assert.equal(parsed.pageNumber, 40);
  assert.equal(parsed.label, 'Língua pálida com revestimento amarelo, pegajosa e negro no centro');
  assert.match(parsed.coating, /Amarela, espessa/);
  assert.match(parsed.diagnosis, /Deficiência do baço/);
});

test('parser tolera cabecalho OCR irregular e diagnostico iniciado por Neste exemplo', () => {
  const typoHeader = 'LÍNGUIA 151 Língua vermelha com pontos proeminentes ASPECTO LINGUAL: Língua Vermelho-escura. Saburra: Branca, seca e levemente amarelo-clara. Principais etiopatogenias: Retenção de calor no sistema Yong. Diagnóstico: Retenção de umidade-calor no sangue. Comumente vista em casos de infecção urinária.';
  const exampleDiagnosis = 'Língua 107 Língua vermelho-clara com revestimento amarelo nas duas laterais ASPECTO LINGUAL: Língua Vermelho-clara. Saburra: Branca, fina, com duas faixas amarelo-claras. Principais etiopatogenias: Deficiência de Qi e de sangue. Diagnóstico: Neste exemplo, o paciente apresenta deficiência de Yin do coração e dos rins com exacerbação de umidade no início do tratamento. Comumente vista em casos de doenças cardíacas.';

  const parsedTypo = parseSemiologyTongueCasePage(typoHeader, 154);
  const parsedExample = parseSemiologyTongueCasePage(exampleDiagnosis, 110);

  assert.equal(parsedTypo.caseNumber, 151);
  assert.match(parsedTypo.diagnosis, /Retenção de umidade-calor/);
  assert.equal(parsedExample.caseNumber, 107);
  assert.match(parsedExample.diagnosis, /^deficiência de Yin/i);
});

test('Tier A gera finding em review com source e patternLinks sem tocar app clinico', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'extract-knowledge-a-'));
  try {
    await fs.mkdir(path.join(tempRoot, 'text'), { recursive: true });
    await fs.mkdir(path.join(tempRoot, 'pages'), { recursive: true });
    await fs.writeFile(path.join(tempRoot, 'text', 'page-040.txt'), semioSample, 'utf8');
    await fs.writeFile(path.join(tempRoot, 'pages', 'page-040.webp'), 'webp', 'utf8');

    const source = {
      key: 'semiologia-da-lingua-completo',
      title: 'Semiologia da Lingua (Completo)',
    };
    const manifest = {
      pages: [{
        pageNumber: 40,
        extraction: { file: 'text/page-040.txt' },
        image: {
          file: 'pages/page-040.webp',
          publicUrl: '/knowledge/source-assets/pdf-sources/semiologia-da-lingua-completo/pages/page-040.webp',
        },
      }],
    };

    const result = await extractTierAFromSemiology({
      source,
      manifest,
      sourceRoot: tempRoot,
      knownPatternNames: knownPatterns,
    });

    assert.equal(result.findings.length, 1);
    assert.equal(result.findings[0].status, 'review');
    assert.equal(result.findings[0].requiresProfessionalAudit, true);
    assert.equal(result.findings[0].source.pdfPage, 40);
    assert.ok(result.findings[0].source.imageUrl.endsWith('/page-040.webp'));
    assert.ok(result.findings[0].aliases.includes('Saburra amarela'));
    assert.ok(result.findings[0].patternLinks.some(link => link.pattern === 'Deficiência de Qi do Baço'));
    assert.ok(result.findings[0].patternLinks.some(link => link.pattern === 'Umidade-Calor'));
    assert.deepEqual(validateFindingReferences(result.findings, result.patterns, knownPatterns), []);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('execucao completa e idempotente nao duplica candidatos', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'extract-knowledge-run-'));
  try {
    const pdfRoot = path.join(tempRoot, 'pdf-sources');
    const sourceRoot = path.join(pdfRoot, 'semiologia-da-lingua-completo');
    const outDir = path.join(pdfRoot, 'knowledge');
    await fs.mkdir(path.join(sourceRoot, 'text'), { recursive: true });
    await fs.mkdir(path.join(sourceRoot, 'pages'), { recursive: true });
    await fs.writeFile(path.join(sourceRoot, 'text', 'page-040.txt'), semioSample, 'utf8');
    await fs.writeFile(path.join(sourceRoot, 'pages', 'page-040.webp'), 'webp', 'utf8');

    const indexPath = path.join(pdfRoot, 'source-index.local.json');
    const catalogPath = path.join(pdfRoot, 'source-catalog.local.json');
    const manifestPath = path.join(sourceRoot, 'manifest.json');
    const source = {
      key: 'semiologia-da-lingua-completo',
      title: 'Semiologia da Lingua (Completo)',
      pageCount: 1,
      originalLanguage: 'pt-BR',
      knowledgeDomain: 'lingua',
      curationTarget: 'modulo_lingua',
      candidateExtractionPolicy: 'source_only_no_point_candidate_scan',
    };

    await fs.writeFile(indexPath, JSON.stringify({ sources: [source] }), 'utf8');
    await fs.writeFile(catalogPath, JSON.stringify({ sources: [source] }), 'utf8');
    await fs.writeFile(manifestPath, JSON.stringify({
      source,
      pages: [{
        pageNumber: 40,
        extraction: { file: 'text/page-040.txt' },
        image: {
          file: 'pages/page-040.webp',
          publicUrl: '/knowledge/source-assets/pdf-sources/semiologia-da-lingua-completo/pages/page-040.webp',
        },
      }],
    }), 'utf8');

    const first = await runExtraction({
      pdfRoot,
      index: indexPath,
      catalog: catalogPath,
      outDir,
      summary: false,
      tiers: 'A,B',
      provider: 'none',
    });
    const second = await runExtraction({
      pdfRoot,
      index: indexPath,
      catalog: catalogPath,
      outDir,
      summary: false,
      tiers: 'A,B',
      provider: 'none',
    });

    assert.equal(first.findingEnvelope.counts.items, 1);
    assert.equal(second.findingEnvelope.counts.items, 1);
    assert.equal(new Set(second.findingEnvelope.items.map(item => item.id)).size, second.findingEnvelope.items.length);

    const written = JSON.parse(await fs.readFile(path.join(outDir, 'finding-candidates.local.json'), 'utf8'));
    assert.equal(written.items.length, 1);
    assert.equal(written.items[0].status, 'review');
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
