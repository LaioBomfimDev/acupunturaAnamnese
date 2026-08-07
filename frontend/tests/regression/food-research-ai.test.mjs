import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let server;
let svc;
let foods;

before(async () => {
  server = await createServer({
    root,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  });
  svc = await server.ssrLoadModule('/src/services/foodResearchAiService.js');
  foods = await server.ssrLoadModule('/src/knowledge/foodDietoterapia.js');
});

after(async () => {
  await server?.close();
});

const gengibre = {
  id: 'gengibre', commonName: 'Gengibre (fresco)', energy: 'morna',
  flavors: ['pungente'], organs: ['baco', 'estomago', 'pulmoes'],
  sourcePages: [20, 25], caution: 'O gengibre seco é mais aquecedor.',
};

test('toFoodResearchPayload envia somente a chave de busca do alimento', () => {
  const payload = svc.toFoodResearchPayload(gengibre);
  assert.deepEqual(payload, { commonName: 'Gengibre (fresco)' });
});

test('researchFood usa o mock no login local, sem chamar a Edge Function', async () => {
  let invoked = false;
  const runtime = {
    getAuthenticatedUser: async () => ({ _isLocal: true }),
    invoke: async () => { invoked = true; return { data: null, error: null }; },
  };
  const res = await svc.researchFood(gengibre, 'visao_geral', {}, runtime);
  assert.equal(invoked, false, 'não deve chamar a IA no login local');
  assert.ok(Array.isArray(res.sections) && res.sections.length > 0);
  assert.equal(res.mode, 'visao_geral');
});

test('researchFood envia o pedido ao servidor, que aplica a curadoria publicada', async () => {
  let captured = null;
  const runtime = {
    getAuthenticatedUser: async () => ({ id: 'u1' }),
    invoke: async (fn, opts) => {
      captured = { fn, body: opts.body };
      return {
        data: { modelVersion: 'gemini-2.5-flash', mode: 'seguranca', food: 'Gengibre (fresco)', sections: [{ heading: 'Cautelas', body: 'Confira a publicação aprovada.' }], evidenceNote: 'publicação aprovada', safety: 'Revisar com profissional habilitado.', insufficient: false },
        error: null,
      };
    },
  };
  const res = await svc.researchFood(gengibre, 'seguranca', { objective: 'digestão' }, runtime);
  assert.equal(captured.fn, 'food-research');
  assert.equal(captured.body.mode, 'seguranca');
  assert.equal(captured.body.name, 'Gengibre (fresco)');
  assert.equal('objective' in captured.body, false);
  assert.equal('food' in captured.body, false);
  assert.equal(res.sections[0].heading, 'Cautelas');
});

test('researchFood rejeita modo inválido e alimento ausente', async () => {
  const runtime = { getAuthenticatedUser: async () => ({ id: 'u1' }), invoke: async () => ({ data: {}, error: null }) };
  await assert.rejects(() => svc.researchFood(gengibre, 'inexistente', {}, runtime));
  await assert.rejects(() => svc.researchFood(null, 'visao_geral', {}, runtime));
});

test('researchFood propaga erro da Edge Function', async () => {
  const runtime = {
    getAuthenticatedUser: async () => ({ id: 'u1' }),
    invoke: async () => ({ data: null, error: { message: 'IA indisponível' } }),
  };
  await assert.rejects(() => svc.researchFood(gengibre, 'mtc', {}, runtime), /IA indisponível/);
});

test('a Edge Function aceita só modos educativos e bloqueia o modo legado de receitas', async () => {
  const source = await readFile(path.resolve(root, '../supabase/functions/food-research/index.ts'), 'utf8');
  for (const modeId of ['visao_geral', 'mtc', 'seguranca']) {
    assert.match(source, new RegExp(`${modeId}:`), `modo ${modeId} deve existir na Edge Function`);
  }
  assert.doesNotMatch(source, /^\s*receitas:\s*\{/m);
  assert.match(source, /modeId === 'receitas'/);
  assert.match(source, /modo de receitas foi desativado/i);
});

test('a Edge Function food-research mantém os trilhos de segurança', async () => {
  const [source, policy] = await Promise.all([
    readFile(path.resolve(root, '../supabase/functions/food-research/index.ts'), 'utf8'),
    readFile(path.resolve(root, '../supabase/functions/food-research/policy.ts'), 'utf8'),
  ]);
  assert.match(source, /Use EXCLUSIVAMENTE as publicações/i);
  assert.match(source, /Nunca produza receita, ingredientes, preparo, cardápio/i);
  assert.match(source, /Nunca trate erva, planta medicinal/i);
  assert.match(source, /get_active_knowledge_reviews/);
  assert.match(source, /containsProhibitedFoodGuidance/);
  assert.match(source, /assertEdgeAccess/);
  assert.match(source, /enforceEdgeRateLimit/);
  assert.doesNotMatch(svc.FOOD_RESEARCH_MODES.map(mode => mode.id).join(','), /receitas/);
  assert.match(source, /logOperationalEvent/);
  assert.doesNotMatch(source, /error\.message|console\.error/);
  assert.match(policy, /return JSON\.stringify\(published\)/);
  assert.doesNotMatch(policy, /<alimento_publicado/);
  assert.match(source, /citations\.length === 0/);
  assert.match(source, /surface:\s*'food_research'/);
  assert.match(source, /REGRA FINAL DE PRECEDÊNCIA/);
});

test('food-research aparece no painel de prompts do SuperAdm', async () => {
  const instr = await server.ssrLoadModule('/src/services/aiInstructionsService.js');
  // A chave editável existe (o painel itera AI_INSTRUCTION_KEYS).
  assert.ok(
    instr.AI_INSTRUCTION_KEYS.some(k => k.key === 'food-research'),
    'AI_INSTRUCTION_KEYS deve incluir food-research',
  );
  // A base fixa (só leitura) é exibida para a chave e empilhada em clinical-global.
  assert.ok(Array.isArray(instr.AI_BASE_PROMPTS['food-research']));
  assert.ok(
    instr.AI_BASE_PROMPTS['clinical-global'].some(b => /síntese educativa de ALIMENTOS publicados/i.test(b.text)),
    'clinical-global deve exibir a base segura do food-research sem incluir fitoterapia',
  );
});

test('o aviso legado do painel não substitui as barreiras clínicas do servidor', async () => {
  const instr = await server.ssrLoadModule('/src/services/aiInstructionsService.js');
  const panelText = instr.AI_BASE_PROMPTS['food-research'][0].text;
  const source = await readFile(path.resolve(root, '../supabase/functions/food-research/index.ts'), 'utf8');
  assert.match(panelText, /Nunca gere receita, ingredientes, preparo, dose, cardápio/i);
  assert.match(panelText, /Nunca trate erva, planta medicinal/i);
  assert.match(panelText, /Não faça diagnóstico, prescrição/i);
  assert.match(source, /Não faça diagnóstico, prescrição, promessa de cura/i);
  assert.match(source, /Nunca produza receita, ingredientes, preparo, cardápio/i);
  assert.doesNotMatch(source, /getActiveInstructions/);
  assert.match(source, /withCorrectionLessons/);
  assert.match(source, /nenhuma lição de correção pode liberar receita/i);
});
