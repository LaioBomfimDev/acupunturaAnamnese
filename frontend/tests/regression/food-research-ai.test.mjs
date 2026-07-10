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

test('toFoodResearchPayload converte códigos curados em rótulos legíveis', () => {
  const payload = svc.toFoodResearchPayload(gengibre);
  assert.equal(payload.commonName, 'Gengibre (fresco)');
  assert.equal(payload.energyLabel, 'Morna');
  assert.deepEqual(payload.flavors, ['Pungente']);
  assert.ok(payload.organs.includes('Baço (eixo digestivo, MTC)'));
  assert.ok(payload.tradition.includes('dietoterapia chinesa'));
  assert.equal(payload.caution, 'O gengibre seco é mais aquecedor.');
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

test('researchFood envia o payload curado e o modo para a Edge Function', async () => {
  let captured = null;
  const runtime = {
    getAuthenticatedUser: async () => ({ id: 'u1' }),
    invoke: async (fn, opts) => {
      captured = { fn, body: opts.body };
      return {
        data: { modelVersion: 'gemini-2.5-flash', mode: 'receitas', food: 'Gengibre (fresco)', sections: [{ heading: 'Chá', body: '...' }], evidenceNote: 'tradicional', safety: 'gestação', insufficient: false },
        error: null,
      };
    },
  };
  const res = await svc.researchFood(gengibre, 'receitas', { objective: 'digestão' }, runtime);
  assert.equal(captured.fn, 'food-research');
  assert.equal(captured.body.mode, 'receitas');
  assert.equal(captured.body.objective, 'digestão');
  assert.equal(captured.body.food.energyLabel, 'Morna');
  assert.equal(res.sections[0].heading, 'Chá');
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

test('os modos da UI batem com os modos da Edge Function', async () => {
  const source = await readFile(path.resolve(root, '../supabase/functions/food-research/index.ts'), 'utf8');
  for (const mode of svc.FOOD_RESEARCH_MODES) {
    assert.match(source, new RegExp(`${mode.id}:`), `modo ${mode.id} deve existir na Edge Function`);
  }
});

test('a Edge Function food-research mantém os trilhos de segurança', async () => {
  const source = await readFile(path.resolve(root, '../supabase/functions/food-research/index.ts'), 'utf8');
  assert.match(source, /NÃO faça diagnóstico, prescrição/i);
  assert.match(source, /NÃO prometa cura/i);
  assert.match(source, /nível de evidência/i);
  assert.match(source, /surface: 'food_research'/);
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
    instr.AI_BASE_PROMPTS['clinical-global'].some(b => /dietoterapia e fitoterapia/i.test(b.text)),
    'clinical-global deve empilhar a base do food-research (a função passa clinical-global)',
  );
});

test('a base exibida no painel espelha o BASE_PROMPT da Edge Function', async () => {
  const instr = await server.ssrLoadModule('/src/services/aiInstructionsService.js');
  const panelText = instr.AI_BASE_PROMPTS['food-research'][0].text;
  const source = await readFile(path.resolve(root, '../supabase/functions/food-research/index.ts'), 'utf8');
  // Frases-âncora dos trilhos de segurança devem bater nos dois lados.
  for (const anchor of [
    'NÃO faça diagnóstico, prescrição',
    'NÃO prometa cura',
    'Rotule SEMPRE o nível de evidência',
  ]) {
    assert.ok(panelText.includes(anchor), `painel deve conter: ${anchor}`);
    assert.ok(source.includes(anchor), `Edge Function deve conter: ${anchor}`);
  }
});
