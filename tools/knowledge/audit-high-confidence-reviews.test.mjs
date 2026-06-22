import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  normalizeTechniques,
  stripPdfBanners,
  ocrCorruptionScore,
  hasMixedSection,
  isBlankField,
  rebuildTitle,
  titleNeedsFix,
  assessRecord,
} from './audit-high-confidence-reviews.mjs';

test('normalizeTechniques quebra string com virgulas em lista limpa', () => {
  assert.deepEqual(normalizeTechniques(['agulha, moxa, ventosa']), ['agulha', 'moxa', 'ventosa']);
  assert.deepEqual(normalizeTechniques(['agulha, laser, stiper']), ['agulha', 'laser', 'stiper']);
});

test('normalizeTechniques deduplica, normaliza caixa e aliases', () => {
  assert.deepEqual(
    normalizeTechniques(['Agulha', 'agulhamento', 'Moxabustao', 'moxa']),
    ['agulha', 'moxa'],
  );
});

test('stripPdfBanners remove cabecalho de canal do PDF mas preserva o texto clinico', () => {
  const input = 'CANAL DE ENERGIA DA BEXIGA Localize o ponto 3 cun lateral a linha mediana.';
  const out = stripPdfBanners(input);
  assert.ok(!/CANAL DE ENERGIA/i.test(out), 'banner deveria sumir');
  assert.ok(/Localize o ponto/.test(out), 'conteudo clinico deveria permanecer');
});

test('stripPdfBanners nao apaga conteudo legitimo em caixa baixa', () => {
  const input = 'Tres cun acima do malelo medial, atras da tibia.';
  assert.equal(stripPdfBanners(input), input);
});

test('ocrCorruptionScore pontua texto quebrado acima de texto limpo', () => {
  assert.ok(ocrCorruptionScore('Apopleua. dcsmllío. hislcna. tootura') >= 3);
  assert.equal(ocrCorruptionScore('Acalma e clareia a mente.'), 0);
});

test('hasMixedSection detecta rotulo de outra secao dentro da localizacao', () => {
  assert.ok(hasMixedSection({ locationText: '3 cun acima. Metodo: 0,5 cun. Funcoes energeticas: tonifica.' }));
  assert.ok(!hasMixedSection({ locationText: '3 cun acima do malelo medial.' }));
});

test('isBlankField trata campos so com pontuacao/ruido como vazios', () => {
  assert.ok(isBlankField(''));
  assert.ok(isBlankField('  .,;  '));
  assert.ok(isBlankField([]));
  assert.ok(!isBlankField('3 cun'));
});

const NAMES = new Map([
  ['BL14', { pinyin: 'Jueyinshu', en: 'Absolute Yin Hollow' }],
  ['SP6', { pinyin: 'Sanyinjiao', en: 'Three Yin Meeting' }],
]);

test('rebuildTitle usa nomes canonicos do projeto e nao inventa quando ausente', () => {
  assert.equal(
    rebuildTitle({ code: 'BL14', displayCode: 'BL14', title: 'BL14 - Ponto do meridiano Bexiga' }, NAMES),
    'BL14 (Jueyinshu) - Absolute Yin Hollow',
  );
  assert.equal(rebuildTitle({ code: 'ZZ9', displayCode: 'ZZ9' }, NAMES), null);
});

test('titleNeedsFix sinaliza titulo generico e titulo com lixo de OCR', () => {
  assert.equal(titleNeedsFix({ title: 'CV3 - Ponto do meridiano Vaso Concepção' }), 'generic');
  assert.equal(titleNeedsFix({ title: 'Ba-6 (Sanyi j ·ao) - Reu11ião dos Três Yin' }), 'ocr');
  assert.equal(titleNeedsFix({ title: 'Anmian (Sono Tranquilo)' }), null);
});

test('assessRecord poe em quarentena ponto sem localizacao', () => {
  const a = assessRecord(
    { code: 'EX-HN12', locationText: '', actions: ['Beneficia'], indications: ['sangria'], needling: '0.1 cun' },
    NAMES,
  );
  assert.equal(a.status, 'quarantine');
  assert.equal(a.blockedFromClinical, true);
});

test('assessRecord poe em quarentena registro com apenas 1 campo essencial', () => {
  const a = assessRecord({ code: 'ATLAS-EXTRA-GENPING', locationText: 'Regiao posterior do tornozelo.', actions: [], indications: [], needling: '' }, NAMES);
  assert.equal(a.blockedFromClinical, true);
});

test('assessRecord poe em quarentena ponto confirmado como mal-atribuido', () => {
  const a = assessRecord(
    { code: 'ATLAS-EXTRA-BICHONG', locationText: '0,1 cun insercao distal nas unhas.', actions: ['Abre os orificios.'], indications: ['febre alta'], needling: '0,1 cun' },
    NAMES,
  );
  assert.ok(a.issues.some(i => i.type === 'misattributed'));
  assert.equal(a.blockedFromClinical, true);
});

test('assessRecord mantem ativo um registro saudavel com os 4 campos', () => {
  const a = assessRecord(
    {
      code: 'BL40',
      locationText: 'No centro da prega poplitea.',
      actions: ['Relaxa os tendoes.'],
      indications: ['lombalgia'],
      needling: '1 cun perpendicular.',
    },
    NAMES,
  );
  assert.equal(a.blockedFromClinical, false);
  assert.equal(a.status, 'clean');
});
