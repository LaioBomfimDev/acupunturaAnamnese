import assert from 'node:assert/strict';
import { test } from 'node:test';

// Importa o módulo puro das Edge Functions (Node 24 faz type stripping de .ts).
import {
  fitToBudget,
  rankLessonsByRelevance,
  tokenize,
} from '../../../supabase/functions/_shared/promptBudget.ts';

const lesson = (correction_text, approval_status = 'approved') => ({
  correction_text,
  reason: null,
  ai_output: null,
  context_snapshot: null,
  approval_status,
  author_id: 'a',
});

test('tokenize normaliza acentos e descarta stopwords/curtas', () => {
  assert.deepEqual(tokenize('Estase de Sangue'), ['estase', 'sangue']); // "de" é curta
  assert.ok(tokenize('Língua roxa').includes('lingua'));
  assert.equal(tokenize('para com sem').length, 0); // só stopwords
});

test('rankLessonsByRelevance põe a lição relevante na frente', () => {
  const lessons = [
    lesson('fala sobre vento frio e tosse'),
    lesson('estase de sangue, língua roxa e dor fixa'),
  ];
  const ranked = rankLessonsByRelevance(lessons, 'estase de sangue língua roxa');
  assert.equal(ranked[0].correction_text, 'estase de sangue, língua roxa e dor fixa');
});

test('rankLessonsByRelevance sem query preserva a ordem (recência)', () => {
  const lessons = [lesson('primeira'), lesson('segunda')];
  const ranked = rankLessonsByRelevance(lessons, '');
  assert.deepEqual(ranked.map(l => l.correction_text), ['primeira', 'segunda']);
});

test('fitToBudget respeita o orçamento de caracteres', () => {
  assert.deepEqual(fitToBudget(['aaaa', 'bbbb', 'cccc'], 100), ['aaaa', 'bbbb', 'cccc']);
  assert.deepEqual(fitToBudget(['aaaa', 'bbbb', 'cccc'], 6), ['aaaa']); // 5 usados; +5 estoura
  assert.deepEqual(fitToBudget(['aaaa'], 0), []);
  assert.deepEqual(fitToBudget([], 100), []);
});

test('fitToBudget sempre inclui ao menos a 1ª lição quando há orçamento', () => {
  // Uma lição muito relevante passa mesmo sozinha, ainda que maior que o teto.
  assert.deepEqual(fitToBudget(['aaaaaaaaaa'], 3), ['aaaaaaaaaa']);
});
