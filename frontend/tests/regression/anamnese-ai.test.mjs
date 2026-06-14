import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Grupos de checklists.js que a Edge Function suggest-marks pode sugerir.
// (lingua/pulso/oito/substancias/objetivos/sintomas ficam de fora de propósito.)
const SCOPE_GROUPS = [
  'queixaEstruturada', 'historico', 'substanciasUso', 'sono', 'digestao',
  'gineco', 'dor', 'clima', 'emocoes', 'fezes', 'seguranca',
];

let server;
let checklistsData;
let anamneseAiService;
let anonymize;

before(async () => {
  server = await createServer({
    root,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  });
  checklistsData = await server.ssrLoadModule('/src/data/checklists.js');
  anamneseAiService = await server.ssrLoadModule('/src/services/anamneseAiService.js');
  anonymize = await server.ssrLoadModule('/src/utils/anonymize.js');
});

after(async () => {
  await server?.close();
});

test('o CATÁLOGO da Edge Function suggest-marks espelha os grupos em escopo de checklists.js', async () => {
  const source = await readFile(
    path.resolve(root, '../supabase/functions/suggest-marks/index.ts'),
    'utf8'
  );
  const { checklists } = checklistsData;

  for (const group of SCOPE_GROUPS) {
    const block = source.match(new RegExp(`${group}:\\s*\\[([\\s\\S]*?)\\]`));
    assert.ok(block, `grupo "${group}" não encontrado no CATALOG da Edge Function`);
    const edgeItems = [...block[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
    assert.deepEqual(
      [...edgeItems].sort(),
      [...checklists[group]].sort(),
      `itens do grupo "${group}" divergem entre a Edge Function e checklists.js — atualize os dois lados juntos`
    );
  }
});

test('anonymize mascara nome do paciente, CPF, telefone, e-mail, datas e CEP', () => {
  const { anonymizeClinicalText, looksLikeContainsPII } = anonymize;

  const texto = 'Maria Silva, CPF 123.456.789-00, tel (11) 91234-5678, '
    + 'email maria@teste.com, nasceu em 01/02/1980, CEP 01310-100.';
  const masked = anonymizeClinicalText(texto, { patientName: 'Maria Silva' });

  assert.ok(!masked.includes('Maria'), 'nome do paciente deve ser mascarado');
  assert.ok(!masked.includes('Silva'), 'sobrenome do paciente deve ser mascarado');
  assert.ok(!masked.includes('123.456.789-00'), 'CPF deve ser mascarado');
  assert.ok(!masked.includes('maria@teste.com'), 'e-mail deve ser mascarado');
  assert.ok(!masked.includes('01/02/1980'), 'data deve ser mascarada');
  assert.ok(masked.includes('[NOME]') && masked.includes('[CPF]') && masked.includes('[EMAIL]'));
  // O texto original tinha PII; o mascarado não deve mais disparar o detector.
  assert.ok(looksLikeContainsPII(texto));
});

test('anonymize preserva conteúdo clínico relevante', () => {
  const { anonymizeClinicalText } = anonymize;
  const masked = anonymizeClinicalText('Paciente com insônia e refluxo, piora ao estresse.', {});
  assert.match(masked, /insônia/);
  assert.match(masked, /refluxo/);
  assert.match(masked, /estresse/);
});

test('buildAnamneseText junta os campos de texto livre rotulados', () => {
  const { buildAnamneseText } = anamneseAiService;
  const text = buildAnamneseText({ queixa: 'dor lombar', obsSonoEmocoes: 'dorme mal' });
  assert.match(text, /Queixa principal: dor lombar/);
  assert.match(text, /Observações de sono\/emoções: dorme mal/);
});

test('mock sugere apenas marcações existentes no checklist', async () => {
  const { mockSuggestAnamneseMarks } = anamneseAiService;
  const { checklists } = checklistsData;

  const res = await mockSuggestAnamneseMarks('Paciente com muita ansiedade e refluxo, piora ao estresse.');
  assert.ok(res.suggestions.length > 0, 'mock deve sugerir algo para texto com sinais conhecidos');
  for (const s of res.suggestions) {
    assert.ok(checklists[s.group], `grupo sugerido inexistente: ${s.group}`);
    assert.ok(
      checklists[s.group].includes(s.item),
      `item sugerido "${s.item}" não existe no grupo "${s.group}"`
    );
    assert.ok(s.confidence > 0 && s.confidence <= 1, 'confiança em (0,1]');
  }
});

test('suggestAnamneseMarks rejeita estado sem texto livre', async () => {
  const { suggestAnamneseMarks } = anamneseAiService;
  await assert.rejects(() => suggestAnamneseMarks({ queixa: '', historia: '' }));
});

test('faixas de confiança comunicam alta/média/baixa', () => {
  const { confidenceBand } = anamneseAiService;
  assert.equal(confidenceBand(0.85).label, 'alta');
  assert.equal(confidenceBand(0.7).label, 'média');
  assert.equal(confidenceBand(0.4).label, 'baixa');
});
