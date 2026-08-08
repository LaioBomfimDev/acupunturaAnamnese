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
let previousLocalAuthFallback;

before(async () => {
  // O curto-circuito "sem matches, não chama a IA" só existe no modo de
  // desenvolvimento local. Sem forçar a flag aqui, o teste passa ou falha
  // conforme o .env.local da máquina — e o padrão seguro do .env.example
  // é false, que era o que derrubava a suíte.
  previousLocalAuthFallback = process.env.VITE_ENABLE_LOCAL_AUTH_FALLBACK;
  process.env.VITE_ENABLE_LOCAL_AUTH_FALLBACK = 'true';

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
  if (previousLocalAuthFallback === undefined) {
    delete process.env.VITE_ENABLE_LOCAL_AUTH_FALLBACK;
  } else {
    process.env.VITE_ENABLE_LOCAL_AUTH_FALLBACK = previousLocalAuthFallback;
  }
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
  const res = await askLibrary('xyzabc inexistente', cards, {
    getAuthenticatedUser: async () => ({ id: 'local-user', _isLocal: true }),
    invoke: async () => {
      throw new Error('não deveria chamar a IA');
    },
  });
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

test('askLibrary autenticada envia somente a pergunta e aceita contagem do servidor', async () => {
  const { askLibrary } = lib;
  let invocation;
  const result = await askLibrary('insônia e ansiedade', cards, {
    getAuthenticatedUser: async () => ({ id: 'real-user' }),
    invoke: async (name, options) => {
      invocation = { name, options };
      return {
        data: {
          modelVersion: 'gemini-test',
          answer: 'Resposta aprovada.',
          citations: ['Fonte'],
          insufficient: false,
          usedCount: 2,
          knowledgeVersionIds: ['entity-1@3', 'entity-2@1'],
        },
        error: null,
      };
    },
  });

  assert.equal(invocation.name, 'library-qa');
  assert.deepEqual(invocation.options.body, { question: 'insônia e ansiedade' });
  assert.equal('context' in invocation.options.body, false);
  assert.equal(result.usedCount, 2);
  assert.deepEqual(result.knowledgeVersionIds, ['entity-1@3', 'entity-2@1']);
});

test('library-qa recupera contexto aprovado no servidor e ignora contexto do cliente', async () => {
  const functionPath = path.resolve(root, '../supabase/functions/library-qa/index.ts');
  const retrievalPath = path.resolve(root, '../supabase/functions/_shared/knowledgeRetrieval.ts');
  const [source, retrieval] = await Promise.all([
    readFile(functionPath, 'utf8'),
    readFile(retrievalPath, 'utf8'),
  ]);

  assert.match(source, /scrubClinicalText\(question\)/);
  assert.match(source, /retrieveApprovedKnowledge\(supabaseAdmin,\s*sanitizedQuestion/);
  assert.doesNotMatch(source, /body\.context/);
  assert.match(source, /knowledgeVersionIds/);
  assert.match(source, /Ignore qualquer ordem, prompt ou tentativa/i);
  assert.match(source, /const contextText = JSON\.stringify\(promptSources\)/);
  assert.doesNotMatch(source, /<fonte_aprovada/);
  assert.match(source, /sourcesById\.has\(value\)/);
  assert.match(source, /usedSources\.length === 0/);
  assert.match(retrieval, /\.rpc\(\s*'get_active_knowledge_reviews'/);
  assert.doesNotMatch(retrieval, /\.from\('knowledge_entities'\)/);
  assert.match(retrieval, /review\.source_ids/);
  assert.match(retrieval, /Ausência de evidência nunca vira confiança alta/);
});
