import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildCardsFromMarkdown,
  buildDocCorpusCards,
  chunkMarkdown,
  extractBoldTerms,
  markdownToReadable,
  slugify,
} from './ingest-docs-corpus.mjs';

const SAMPLE = `# Repertório de teste

> Nota curada: refinável pela equipe técnica.

## 3. Padrões de Sangue (Xue)
- **Deficiência de Sangue** (geral) — palidez, tontura; língua pálida.
- **Estase de Sangue** — dor fixa; língua roxa.

## A. Cor do corpo
| Sinal | Padrão | Conf. |
|---|---|---|
| Pálida + úmida | Def. Yang | alta |
| Roxa | Estase de Xue | alta |
`;

test('slugify normaliza acentos e separadores', () => {
  assert.equal(slugify('Regras-Clínicas Língua.md'.replace(/\.md$/, '')), 'regras-clinicas-lingua');
  assert.equal(slugify('Repertório operacional'), 'repertorio-operacional');
});

test('extractBoldTerms coleta termos em negrito, deduplicados', () => {
  const terms = extractBoldTerms('a **Fogo do Fígado** e **Fogo do Fígado** e **Estase de Xue**');
  assert.deepEqual(terms, ['Fogo do Fígado', 'Estase de Xue']);
});

test('markdownToReadable converte tabela e remove blockquote/ênfase', () => {
  const out = markdownToReadable('> nota\n\n| Sinal | Padrão |\n|---|---|\n| Roxa | **Estase** |');
  assert.ok(out.includes('nota'));
  assert.ok(out.includes('Roxa — Estase'));
  assert.ok(!out.includes('|'));
  assert.ok(!out.includes('**'));
  assert.ok(!out.includes('---'));
});

test('chunkMarkdown quebra por título com breadcrumb', () => {
  const chunks = chunkMarkdown(SAMPLE);
  const titles = chunks.map(c => c.titleParts.join(' › '));
  assert.ok(titles.includes('Repertório de teste › 3. Padrões de Sangue (Xue)'));
  assert.ok(titles.includes('Repertório de teste › A. Cor do corpo'));
  // A intro (blockquote) vira um chunk sob o H1.
  assert.ok(titles.some(t => t === 'Repertório de teste'));
});

test('buildCardsFromMarkdown produz o formato de card da Biblioteca', () => {
  const cards = buildCardsFromMarkdown(SAMPLE, {
    file: 'repertorio-padroes-mtc.md',
    cat: 'Repertório',
    source: 'Repertório operacional MTC (curado)',
    confidence: 'medium',
  });
  assert.ok(cards.length >= 2);
  for (const card of cards) {
    for (const field of ['id', 'cat', 'title', 'confidence', 'statusLabel', 'cardColor', 'tags', 'source', 'txt']) {
      assert.ok(field in card, `card sem campo ${field}`);
    }
    assert.equal(card.cat, 'Repertório');
    assert.equal(card.confidence, 'medium');
    assert.equal(card.statusLabel, 'Em revisão de fonte');
    assert.match(card.id, /^doc:repertorio-padroes-mtc#\d+$/);
  }
  // IDs únicos.
  const ids = cards.map(c => c.id);
  assert.equal(new Set(ids).size, ids.length);

  // Os nomes de padrão em negrito viram tags pesquisáveis.
  const sangue = cards.find(c => c.title.includes('Padrões de Sangue'));
  assert.ok(sangue.tags.includes('Deficiência de Sangue'));
  assert.ok(sangue.tags.includes('Estase de Sangue'));
});

test('buildDocCorpusCards lê a allowlist via readFile injetado', async () => {
  const fakeFiles = {
    'a.md': '# Doc A\n## Seção 1\nConteúdo **Padrão X**.',
    'b.md': '# Doc B\n## Seção 2\nOutro conteúdo.',
  };
  const cards = await buildDocCorpusCards(
    [
      { file: 'a.md', cat: 'Repertório', source: 'A', confidence: 'medium' },
      { file: 'b.md', cat: 'Regra clínica', source: 'B', confidence: 'high' },
    ],
    {
      baseDir: '/virtual',
      readFile: async (p) => {
        const name = p.split(/[\\/]/).pop();
        return fakeFiles[name];
      },
    },
  );
  assert.ok(cards.some(c => c.cat === 'Repertório' && c.tags.includes('Padrão X')));
  const high = cards.find(c => c.cat === 'Regra clínica');
  assert.equal(high.confidence, 'high');
  assert.equal(high.statusLabel, '✅ Seguro para Uso Clínico');
});
