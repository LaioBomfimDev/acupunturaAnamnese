import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

import { getReviewerDisplayName } from '../../src/utils/reviewerDisplayName.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('boas-vindas troca rótulos legados pelo nome da revisora sem alterar nomes reais', () => {
  assert.equal(getReviewerDisplayName('Curadoria Acupuntura'), 'Denise Neves');
  assert.equal(getReviewerDisplayName('Revisora Psicologia'), 'Denise Neves');
  assert.equal(getReviewerDisplayName('Ana Souza'), 'Ana Souza');
});

test('home da revisora usa saudação única e layout próprio sem estilos inline', async () => {
  const source = await readFile(path.resolve(root, 'src/components/ReviewerHome.jsx'), 'utf8');

  assert.ok(source.includes('Olá, {reviewerName}, hora de revisar!'));
  assert.ok(source.includes('reviewer-home-shell'));
  assert.ok(source.includes('reviewer-home-grid'));
  assert.ok(source.includes('Crie ou escolha um paciente para começar'));
  assert.ok(source.includes('navegue por todas as abas'));
  assert.ok(source.includes('Confira Evolução e Relatório'));
  assert.doesNotMatch(source, /clique em Imprimir/i);
  assert.doesNotMatch(source, /relatório completo com o timbrado/i);
  assert.doesNotMatch(source, /dados fictícios/i);
  assert.doesNotMatch(source, /style=\{\{/);
  assert.doesNotMatch(source, /\{label\} e curadoria/);
});
