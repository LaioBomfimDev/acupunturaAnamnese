import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ------------------------------------------------------------
// IA da anamnese de Psicologia (Fase 5): sugestões de marcação
// (psych-suggest-marks) + leitura em rascunho (psych-reading).
// Estes testes travam o contrato: catálogo em sincronia, mocks
// fiéis ao vocabulário, risco com prioridade e rótulo de rascunho.
// ------------------------------------------------------------

let server;
let psychologyData;
let psychologyAiService;

before(async () => {
  server = await createServer({
    root,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  });
  psychologyData = await server.ssrLoadModule('/src/data/psychologyAnamnese.js');
  psychologyAiService = await server.ssrLoadModule('/src/services/psychologyAiService.js');
});

after(async () => {
  await server?.close();
});

test('o CATÁLOGO da Edge Function psych-suggest-marks espelha o vocabulário psi (incl. risco e sono da MTC)', async () => {
  const source = await readFile(
    path.resolve(root, '../supabase/functions/psych-suggest-marks/index.ts'),
    'utf8',
  );
  const { psychologyChecklists, psychologyRiskChecklist, PSYCHOLOGY_RISK_GROUP } = psychologyData;

  const expected = {
    ...psychologyChecklists,
    [PSYCHOLOGY_RISK_GROUP]: psychologyRiskChecklist,
  };

  for (const [group, items] of Object.entries(expected)) {
    const block = source.match(new RegExp(`${group}:\\s*\\[([\\s\\S]*?)\\]`));
    assert.ok(block, `grupo "${group}" não encontrado no CATALOG da Edge Function`);
    const edgeItems = [...block[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
    assert.deepEqual(
      [...edgeItems].sort(),
      [...items].sort(),
      `itens do grupo "${group}" divergem entre a Edge Function e psychologyAnamnese.js — atualize os dois lados juntos`,
    );
    // Chave composta "grupo:item" é separável no 1º ':' — item não pode ter ':'.
    for (const item of items) {
      assert.ok(!item.includes(':'), `item "${item}" não pode conter ':'`);
    }
  }
});

test('buildPsychologyText junta os campos rotulados + anotações de risco', () => {
  const { buildPsychologyText } = psychologyAiService;
  const { createEmptyPsychologySession } = psychologyData;
  const session = createEmptyPsychologySession();
  session.fields.demanda = 'muita tristeza';
  session.riskNotes = 'combinado contato de apoio';
  const text = buildPsychologyText(session);
  assert.match(text, /Demanda \/ queixa principal \(nas palavras da pessoa\): muita tristeza/);
  assert.match(text, /Anotações de risco\/conduta: combinado contato de apoio/);
});

test('suggestPsychologyMarks rejeita sessão sem texto', async () => {
  const { suggestPsychologyMarks } = psychologyAiService;
  const { createEmptyPsychologySession } = psychologyData;
  await assert.rejects(() => suggestPsychologyMarks(createEmptyPsychologySession()));
});

test('mock de sugestões só usa itens do catálogo psi e põe risco primeiro', async () => {
  const { mockSuggestPsychologyMarks } = psychologyAiService;
  const { psychologyChecklists, psychologyRiskChecklist, PSYCHOLOGY_RISK_GROUP } = psychologyData;
  const catalog = {
    ...psychologyChecklists,
    [PSYCHOLOGY_RISK_GROUP]: psychologyRiskChecklist,
  };

  const res = await mockSuggestPsychologyMarks(
    'Paciente relata tristeza constante, insônia e pensamentos de suicídio.',
  );
  assert.ok(res.suggestions.length > 0, 'mock deve sugerir algo para texto com sinais conhecidos');
  for (const s of res.suggestions) {
    assert.ok(catalog[s.group], `grupo sugerido inexistente: ${s.group}`);
    assert.ok(
      catalog[s.group].includes(s.item),
      `item sugerido "${s.item}" não existe no grupo "${s.group}"`,
    );
    assert.ok(s.confidence > 0 && s.confidence <= 1, 'confiança em (0,1]');
  }
  // Texto com ideação suicida → sugestão de risco, e em primeiro lugar.
  assert.equal(res.suggestions[0].group, PSYCHOLOGY_RISK_GROUP, 'risco deve vir primeiro');
  assert.ok(
    res.suggestions.some(s => s.item === 'Ideação e comportamento suicida'),
    'texto com suicídio deve sugerir Ideação e comportamento suicida',
  );
});

test('mock da leitura tem o shape do contrato e destaca risco marcado', async () => {
  const { mockPsychologyReading, buildPsychologyCase } = psychologyAiService;
  const { createEmptyPsychologySession, PSYCHOLOGY_RISK_GROUP } = psychologyData;

  const session = createEmptyPsychologySession();
  session.fields.demanda = 'tristeza e isolamento';
  session.selectedMap = {
    'psiHumor:Tristeza persistente': true,
    [`${PSYCHOLOGY_RISK_GROUP}:Autolesão não suicida`]: true,
  };

  const psychologyCase = buildPsychologyCase(session, {});
  assert.deepEqual(psychologyCase.selected[PSYCHOLOGY_RISK_GROUP], ['Autolesão não suicida']);

  const reading = await mockPsychologyReading(psychologyCase);
  assert.equal(typeof reading.overview, 'string');
  assert.ok(Array.isArray(reading.hypotheses));
  assert.ok(Array.isArray(reading.riskAlerts));
  assert.ok(Array.isArray(reading.questions));
  assert.ok(Array.isArray(reading.cautions));
  // Risco marcado → alerta correspondente na leitura.
  assert.ok(
    reading.riskAlerts.some(alert => alert.sign === 'Autolesão não suicida'),
    'risco marcado deve aparecer em riskAlerts',
  );
});

test('generatePsychologyReading rejeita anamnese vazia', async () => {
  const { generatePsychologyReading } = psychologyAiService;
  const { createEmptyPsychologySession } = psychologyData;
  await assert.rejects(() => generatePsychologyReading(createEmptyPsychologySession()));
});

test('disclaimers comunicam rascunho, gate humano e limite da IA', () => {
  const { PSYCHOLOGY_AI_DISCLAIMER, PSYCHOLOGY_READING_DISCLAIMER } = psychologyAiService;
  // Linguagem honesta: só o que a profissional CONFIRMAR entra na ficha
  // (o antigo "aceitar/marcar" foi trocado para não prometer treino da IA).
  assert.match(PSYCHOLOGY_AI_DISCLAIMER, /confirmar/i);
  assert.match(PSYCHOLOGY_AI_DISCLAIMER, /anonimizado/i);
  assert.doesNotMatch(PSYCHOLOGY_AI_DISCLAIMER, /marca(r|ção)/i, 'disclaimer não deve falar em "marcação"');
  assert.match(PSYCHOLOGY_READING_DISCLAIMER, /rascunho/i);
  assert.match(PSYCHOLOGY_READING_DISCLAIMER, /não é diagnóstico/i);
});

test('sugestões distinguem "sustentado" de "investigar" (não inferir prejuízo de menção neutra)', async () => {
  // Prompt e schema da Edge Function trazem o rótulo kind.
  const source = await readFile(
    path.resolve(root, '../supabase/functions/psych-suggest-marks/index.ts'),
    'utf8',
  );
  assert.match(source, /kind/, 'schema deve ter o campo kind');
  assert.match(source, /investigar/, 'prompt deve prever sinais "a investigar"');
  assert.match(source, /sustentado/, 'prompt deve prever sinais "sustentados"');
  assert.match(source, /menção neutra|NÃO transforme/i, 'prompt deve barrar inferir prejuízo de menção neutra');

  // Mock reflete o mesmo contrato: todo sinal traz um kind válido.
  const { mockSuggestPsychologyMarks } = psychologyAiService;
  const res = await mockSuggestPsychologyMarks('Relata tristeza constante e estresse no trabalho.');
  for (const s of res.suggestions) {
    assert.ok(['investigar', 'sustentado'].includes(s.kind), `kind inválido: ${s.kind}`);
  }
});

test('a Edge Function psych-reading proíbe diagnóstico/conduta e usa instruções + correções', async () => {
  const source = await readFile(
    path.resolve(root, '../supabase/functions/psych-reading/index.ts'),
    'utf8',
  );
  assert.match(source, /RASCUNHO/, 'prompt deve rotular a saída como rascunho');
  assert.match(source, /Não dar diagnóstico/, 'prompt deve proibir diagnóstico fechado');
  assert.match(source, /Não sugerir conduta/, 'prompt deve proibir conduta');
  assert.ok(source.includes("getActiveInstructions(supabaseAdmin, ['psych-global', 'psych-case-assistant'])"));
  assert.ok(!source.includes("['clinical-global', 'psych-reading']"), 'Psi não deve herdar diretrizes globais de MTC');
  assert.ok(source.includes("surface: 'psych_reading'"));
});

test('as IAs de Psicologia usam diretrizes próprias e aparecem no painel do SuperAdm', async () => {
  const marksSource = await readFile(
    path.resolve(root, '../supabase/functions/psych-suggest-marks/index.ts'),
    'utf8',
  );
  const instructionsSource = await readFile(
    path.resolve(root, 'src/services/aiInstructionsService.js'),
    'utf8',
  );

  assert.ok(marksSource.includes("getActiveInstructions(supabaseAdmin, ['psych-global', 'psych-anamnese-marks'])"));
  assert.ok(marksSource.includes('layerSystemPrompt(SYSTEM_PROMPT, extraInstructions)'));
  for (const key of ['psych-global', 'psych-anamnese-marks', 'psych-case-assistant', 'psych-report-assistant']) {
    assert.ok(instructionsSource.includes(`key: '${key}'`), `painel sem a chave ${key}`);
  }
});

test('relatório neuropsicológico usa prompt próprio, dados anonimizados e gate humano', async () => {
  const source = await readFile(
    path.resolve(root, '../supabase/functions/psych-report/index.ts'),
    'utf8',
  );
  assert.match(source, /RASCUNHO/);
  assert.match(source, /Não invente teste, resultado, percentil, diagnóstico/);
  assert.match(source, /Não converta resultado bruto em interpretação clínica/);
  assert.ok(source.includes("getActiveInstructions(supabaseAdmin, ['psych-global', 'psych-report-assistant'])"));
  assert.ok(!source.includes('clinical-global'));

  const evaluation = {
    referral: { reason: 'Avaliação de Maria, telefone 11999998888.' },
    instruments: [],
    sessions: [],
    integration: {},
  };
  const payload = psychologyAiService.buildNeuropsychologyReportCase(evaluation, { patientName: 'Maria' });
  assert.ok(!JSON.stringify(payload).includes('11999998888'));
  assert.ok(!JSON.stringify(payload).includes('Maria'));
});
