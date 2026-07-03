import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildWorksheet } from './build-quarantine-curation-worksheet.mjs';

const pkg = {
  reviews: [
    {
      code: 'EX-HN6',
      title: 'EX-HN6 - Erjian',
      dataQuality: { blockedFromClinical: true },
      locationText: '',
      actions: ['!a Beneficia o nau (texto quebrado)'],
      needling: '03 a O.S para dcntJO',
    },
    {
      code: 'ATLAS-EXTRA-BICHONG',
      title: 'Bichong',
      dataQuality: { blockedFromClinical: true },
      locationText: '0,1 ca.n insercao distal',
    },
    {
      code: 'LU1',
      title: 'LU1 saudavel',
      dataQuality: { blockedFromClinical: false },
      locationText: 'No primeiro espaco intercostal.',
    },
  ],
};

const enriched = new Map([
  ['EX-HN6', {
    code: 'EX-HN6',
    names: { zh: '耳尖', ko: '이첨' },
    location: { originalKo: '귀의 꼭대기.' },
    needling: { ptBr: '- Inserção perpendicular: 0,1 a 0,2 cun' },
  }],
]);

test('a planilha inclui apenas pontos em quarentena', () => {
  const ws = buildWorksheet({ pkg, enriched });
  assert.equal(ws.total, 2);
  assert.ok(!ws.entries.some(e => e.code === 'LU1'), 'registro saudavel nao deveria entrar');
});

test('EX-* usa needling revisado com fonte de alta confianca', () => {
  const ws = buildWorksheet({ pkg, enriched });
  const hn6 = ws.entries.find(e => e.code === 'EX-HN6');
  assert.equal(hn6.tier, 'A');
  assert.equal(hn6.suggestions.needling.source, 'km-agent');
  assert.equal(hn6.suggestions.needling.value, 'Inserção perpendicular: 0,1 a 0,2 cun. Pode-se usar agulha triangular para sangria.');
  assert.equal(hn6.suggestions.location.source, 'km-agent-traduzido');
  assert.equal(hn6.kmAgent.zh, '耳尖');
});

test('ponto mal-atribuido carrega nota de atribuicao cruzada e fica no tier C', () => {
  const ws = buildWorksheet({ pkg, enriched });
  const bichong = ws.entries.find(e => e.code === 'ATLAS-EXTRA-BICHONG');
  assert.equal(bichong.tier, 'C');
  assert.match(bichong.crossNote, /Shixuan/);
  assert.equal(bichong.suggestions.location, undefined, 'hipotese sem fonte nao deve virar dado curado');
  assert.equal(bichong.suggestions.needling, undefined, 'sem km-agent => sem sugestao de needling');
});

test('preserva o valor atual (quebrado) para comparacao lado a lado', () => {
  const ws = buildWorksheet({ pkg, enriched });
  const hn6 = ws.entries.find(e => e.code === 'EX-HN6');
  assert.match(hn6.current.needling, /dcntJO/);
});

test('remove indicacoes duvidosas quando o OCR nao sustenta claramente', () => {
  const ws = buildWorksheet({ pkg: {
    reviews: [{
      code: 'EX-HN4',
      title: 'EX-HN4 - Yuyao',
      dataQuality: { blockedFromClinical: true },
      indications: 'paralisia facial',
    }],
  }, enriched: new Map() });
  const yuyao = ws.entries.find(e => e.code === 'EX-HN4');
  assert.doesNotMatch(yuyao.suggestions.indications.value, /paralisia facial/i);
  assert.match(yuyao.reviewNote, /Paralisia facial/);
});
