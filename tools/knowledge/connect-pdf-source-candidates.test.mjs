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
  sourceSkipsPointCandidateExtraction,
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
    await fs.writeFile(path.join(tempRoot, 'text', 'page-001.txt'), 'LU1 is cited as an acupuncture point in this clinical reference. Location: anterior chest, below the lateral end of the clavicle. Method: apply the technique described by the source. Indications include respiratory discomfort and chest tension.', 'utf8');

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

test('ignora ruído de capa, sumário e front matter antes de conectar pontos', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pdf-source-front-matter-'));
  try {
    await fs.mkdir(path.join(tempRoot, 'text'), { recursive: true });
    await Promise.all([
      fs.writeFile(path.join(tempRoot, 'text', 'page-001.txt'), '""\'.~,,>~ 1<8 \\~ \'" -r ~ ~ \'1fP f ~. "\'\'\')< ...I~, ~ (l\'b 1 .. 11 li! ~lU1 MJ rru ~ lU] ~@ \\::..', 'utf8'),
      fs.writeFile(path.join(tempRoot, 'text', 'page-002.txt'), 'Atlas de Acupuntura. Claudia Focks. Este atlas apresenta ilustrações e créditos editoriais para estudo. LU1 aparece apenas por ruído de extração na capa desta edição digital.', 'utf8'),
      fs.writeFile(path.join(tempRoot, 'text', 'page-003.txt'), 'SUMÁRIO\nMeridiano do Pulmão LU1 ........ 18\nMeridiano da Bexiga BL1 ........ 42\nMeridiano do Fígado LR3 ........ 76', 'utf8'),
      fs.writeFile(path.join(tempRoot, 'text', 'page-004.txt'), 'Parte 1 Pontos sistêmicos 18 Parte 2 Meridianos 42 Parte 3 Combinações 76 Parte 4 Anatomia 101 Parte 5 Referências 130 LU1 18 BL1 42 LR3 76', 'utf8'),
      fs.writeFile(path.join(tempRoot, 'text', 'page-005.txt'), 'PREFÁCIO\nEsta obra descreve a organização editorial do atlas e agradece às pessoas colaboradoras. LU1 é citado apenas como exemplo de nomenclatura, sem conteúdo de ficha clínica.', 'utf8'),
      fs.writeFile(path.join(tempRoot, 'text', 'page-006.txt'), 'LU1 (Zhongfu) é apresentado no Canal de Energia do Pulmão. Localização: região anterior do tórax, abaixo da extremidade lateral da clavícula. Método: inserir conforme a técnica descrita pela fonte. Indicações: tosse e desconforto torácico. A referência permanece em revisão profissional.', 'utf8'),
    ]);

    const manifest = {
      source: {
        key: 'atlas-acupuntura-claudia-focks',
        title: 'Atlas de Acupuntura',
        authors: ['Claudia Focks'],
        sourceType: 'atlas de pontos sistemicos',
        originalLanguage: 'pt-BR',
      },
      policy: { originalLanguage: 'pt-BR' },
      pages: Array.from({ length: 6 }, (_, index) => ({
        pageNumber: index + 1,
        extraction: { file: `text/page-${String(index + 1).padStart(3, '0')}.txt` },
        ocr: {},
        image: {},
      })),
    };
    const compiledTerms = ['BL1', 'LU1'].flatMap(code => buildCandidateTermsForRecord({
      code,
      displayCode: code,
      titlePtBr: code,
    })).map(compileTerm).filter(Boolean);

    const result = await buildCandidateLinksForPages({
      source: manifest.source,
      manifest,
      sourceRoot: tempRoot,
      compiledTerms,
      auricularCompiledTerms: [],
    });

    assert.deepEqual(result.links.map(link => `${link.code}:p${link.page.pdfPage}`), ['LU1:p6']);
    assert.equal(result.stats.pagesSkippedAsNonContent, 5);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('termo auricular em fonte auricular vira candidato separado', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pdf-source-auricular-'));
  try {
    await fs.mkdir(path.join(tempRoot, 'text'), { recursive: true });
    await fs.writeFile(path.join(tempRoot, 'text', 'page-001.txt'), 'O protocolo auricular inclui Shen Men e Fome para revisão profissional. Localização: conferir a região anatômica correspondente no pavilhão auricular. Método: registrar somente como candidato de curadoria, sem prescrição automática ou conclusão clínica.', 'utf8');

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

test('fonte de lingua marcada como source-only nao entra no scanner de pontos', () => {
  assert.equal(sourceSkipsPointCandidateExtraction({
    key: 'semiologia-lingua',
    candidateExtractionPolicy: 'source_only_no_point_candidate_scan',
  }), true);

  assert.equal(sourceSkipsPointCandidateExtraction({
    key: 'atlas-sistemico',
    candidateExtractionPolicy: 'acupoint_candidate_scan',
  }), false);
});
