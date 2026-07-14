import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const guide = readFileSync(
  new URL('../../src/components/panels/CurationGuide.jsx', import.meta.url),
  'utf8',
);
const psychPanel = readFileSync(
  new URL('../../src/components/panels/PsychAnamneseCurationPanel.jsx', import.meta.url),
  'utf8',
);
const psychService = readFileSync(
  new URL('../../src/services/psychCurationService.js', import.meta.url),
  'utf8',
);

test('guias explicam a legenda antes do passo a passo ou junto aos controles relacionados', () => {
  const configuredGuides = guide.match(/icon:\s*'/g) || [];
  const legends = guide.match(/legend:\s*\[/g) || [];
  const fourStepGuides = guide.match(/steps:\s*\[[\s\S]*?\n\s{6}'[^\n]+',\n\s{6}'[^\n]+',\n\s{6}'[^\n]+',\n\s{6}'[^\n]+',\n\s{4}\]/g) || [];

  assert.equal(configuredGuides.length, 9, 'todas as oito áreas prontas e a observação devem ter guia');
  assert.equal(legends.length, configuredGuides.length - 1, 'Psicologia posiciona a legenda junto aos quatro seletores');
  assert.equal(fourStepGuides.length, configuredGuides.length, 'cada hero deve oferecer quatro passos concretos');
  assert.match(guide, /Entenda o que você está vendo/);
  assert.match(guide, /Passo a passo/);
});

test('hero de Psicologia diferencia os quatro tipos e explica as contagens', () => {
  assert.match(guide, /Os botões são tipos de conteúdo, não níveis de aprovação/);
  assert.match(guide, /número entre parênteses mostra quantos itens/);
  assert.match(psychPanel, /tab-row[\s\S]*psych-curation-kind-legend[\s\S]*O que significa cada tipo\?/);
  assert.match(psychPanel, /PSYCH_KIND_DESCRIPTION\[kind\]/);
  assert.match(psychPanel, /O botão verde é o tipo aberto/);
  assert.match(psychService, /risk:\s*'Alertas prioritários/);
  assert.match(psychService, /axis:\s*'Áreas amplas/);
  assert.match(psychService, /checklist:\s*'Grupos de caixinhas/);
  assert.match(psychService, /question:\s*'Perguntas que ajudam/);
});

test('legendas de confiança não apresentam confiança de fonte como certeza clínica', () => {
  assert.match(guide, /não a certeza clínica do conteúdo/);
  assert.match(guide, /a revisão profissional continua obrigatória/);
  assert.match(guide, /nunca é diagnóstico automático/);
});
