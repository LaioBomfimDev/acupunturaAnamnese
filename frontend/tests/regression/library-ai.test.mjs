import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let server;
let lib;
let docCorpus;

before(async () => {
  server = await createServer({
    root,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  });
  lib = await server.ssrLoadModule('/src/services/libraryAiService.js');
  docCorpus = await server.ssrLoadModule('/src/knowledge/generated/doc-corpus.js');
});

after(async () => {
  await server?.close();
});

const cards = [
  { title: 'E36 Zusanli', cat: 'Ponto', confidence: 'high', source: 'Base', txt: 'Tonifica o Qi do Baço e Estômago, trata fadiga e digestão.', tags: 'E36, baço, energia' },
  { title: 'C7 Shenmen', cat: 'Ponto', confidence: 'high', source: 'Base', txt: 'Acalma o Shen, indicado para insônia e ansiedade, calor no Coração.', tags: 'C7, insônia, ansiedade, coração' },
  { title: 'Ventosa', cat: 'Técnica', confidence: 'medium', source: 'Rascunho', txt: 'Técnica de sucção para estase e dor muscular.', tags: 'ventosa, dor' },
];

test('rankLibraryCards traz o ponto mais relevante primeiro', () => {
  const { rankLibraryCards } = lib;
  const top = rankLibraryCards('quais pontos para insônia e ansiedade?', cards);
  assert.ok(top.length > 0, 'deve recuperar algo');
  assert.equal(top[0].title, 'C7 Shenmen', 'C7 deve liderar para insônia/ansiedade');
});

test('rankLibraryCards normaliza acentos e ignora stopwords', () => {
  const { rankLibraryCards } = lib;
  // "insonia" sem acento deve casar com "insônia"
  const top = rankLibraryCards('insonia', cards);
  assert.ok(top.some(c => c.title === 'C7 Shenmen'));
});

test('rankLibraryCards retorna vazio quando nada casa', () => {
  const { rankLibraryCards } = lib;
  assert.deepEqual(rankLibraryCards('xyzabc inexistente', cards), []);
});

test('rankLibraryCards respeita o limite', () => {
  const { rankLibraryCards } = lib;
  const many = Array.from({ length: 20 }, (_, i) => ({
    title: `Ponto dor ${i}`, cat: 'Ponto', confidence: 'high', source: 'Base', txt: 'trata dor', tags: 'dor',
  }));
  assert.equal(rankLibraryCards('dor', many, 5).length, 5);
});

test('rankLibraryCards recupera a nota TEAC com referencia rastreavel', () => {
  const { rankLibraryCards } = lib;
  const top = rankLibraryCards('VB20 esternocleidomastoideo trapezio', docCorpus.docCorpusCards);
  const teacCard = top.find(card => card.source.includes('Acupuntura Médica em Questões'));

  assert.ok(teacCard, 'a busca deve recuperar o corpus TEAC');
  assert.equal(teacCard.confidence, 'medium');
  assert.match(teacCard.txt, /TEAC 2013, questao 01/i);
  assert.match(teacCard.txt, /alternativa D/i);
});

test('library-qa exige atribuicao rastreavel para respostas TEAC', async () => {
  const promptPath = path.resolve(root, '../supabase/functions/library-qa/index.ts');
  const source = await readFile(promptPath, 'utf8');

  assert.match(source, /De acordo com Cruz, Höhl e Ungarelli/i);
  assert.match(source, /TEAC \[ano\], questão \[número\]/i);
  assert.match(source, /Nunca apresente a resposta de prova como verdade clínica universal/i);
});

test('askLibrary sem matches faz curto-circuito sem chamar IA', async () => {
  const { askLibrary } = lib;
  const res = await askLibrary('xyzabc inexistente', cards);
  assert.equal(res.modelVersion, 'local');
  assert.equal(res.insufficient, true);
  assert.equal(res.usedCount, 0);
});

test('mockAskLibrary cita os títulos recuperados', async () => {
  const { rankLibraryCards, mockAskLibrary } = lib;
  const top = rankLibraryCards('baço energia fadiga', cards);
  const res = await mockAskLibrary('baço energia fadiga', top);
  assert.ok(res.citations.includes('E36 Zusanli'));
  assert.equal(res.insufficient, false);
});

test('askLibrary rejeita pergunta vazia', async () => {
  const { askLibrary } = lib;
  await assert.rejects(() => askLibrary('   ', cards));
});
