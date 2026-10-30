// ============================================================
// Assistente da clínica, etapa 1 (30/10/2026; prévia C na tela inicial
// + painel A minimizado em todas as telas). O que estes testes guardam:
// - toda chamada ao Gemini grava o próprio uso (tokens, sem conteúdo);
// - o uso só é lido somado, e só pela administração; teto confere antes
//   de chamar a IA da assistente;
// - a assistente responde só com os textos do "Como funciona" (espelho
//   gerado), não lê paciente nem financeiro, nunca dá conduta;
// - "Sua atenção hoje" conta sem IA, por perfil, e fonte que falhou não
//   vira zero;
// - os dois lados (tela e Edge Function) usam os mesmos preços, telas e
//   limites.
// ============================================================

import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as assistant from '../../src/utils/clinicAssistant.js';
import { AI_PRICES_USD_PER_MILLION, formatUsd, summarizeAiUsage } from '../../src/utils/aiUsage.js';
import { unplacedHelpGroups } from '../../src/utils/assistantHelp.js';
import { GESTAO_HELP } from '../../src/data/screenHelp.js';
import { buildAssistantHelpMirror, HELP_MIRROR_TARGET } from '../../scripts/sync-assistant-help.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => readFile(path.join(root, file), 'utf8');
const functionsDir = '../supabase/functions';

test('espelho da ajuda da assistente igual ao "Como funciona" e todo grupo de ajuda com lugar', async () => {
  const onDisk = await readFile(HELP_MIRROR_TARGET, 'utf8');
  assert.equal(onDisk.replace(/\r\n/g, '\n'), await buildAssistantHelpMirror(),
    'rode node frontend/scripts/sync-assistant-help.mjs');
  assert.deepEqual(unplacedHelpGroups(), [], 'grupo de ajuda novo precisa entrar em HELP_GROUP_PLACES');
  assert.match(onDisk, /"title": "Financeiro → A receber"/);
  assert.match(onDisk, /"title": "Gestão → IA do mês"/);
});

test('preços, telas e limites iguais na tela e na Edge Function', async () => {
  const usageTs = await read(`${functionsDir}/_shared/aiUsage.ts`);
  for (const [model, price] of Object.entries(AI_PRICES_USD_PER_MILLION)) {
    const line = new RegExp(`'${model.replace(/\./g, '\\.')}': \\{ input: ${price.input.toFixed(2)}, output: ${price.output.toFixed(2)} \\}`);
    assert.match(usageTs, line, `preço de ${model} diferente no servidor`);
  }
  const modelsTs = await read(`${functionsDir}/_shared/aiModels.ts`);
  for (const model of modelsTs.matchAll(/= '([a-z0-9.-]+)';/g)) {
    assert.ok(AI_PRICES_USD_PER_MILLION[model[1]], `modelo ${model[1]} sem preço`);
  }

  const rulesTs = await read(`${functionsDir}/_shared/clinicAssistant.ts`);
  const listOf = name => [...rulesTs.match(new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\];`))[1].matchAll(/'([a-z]+)'/g)].map(m => m[1]);
  assert.deepEqual(listOf('ASSISTANT_SCREENS'), assistant.ASSISTANT_SCREENS);
  assert.deepEqual(listOf('ASSISTANT_LINKS'), assistant.ASSISTANT_LINKS);
  assert.match(rulesTs, new RegExp(`ASSISTANT_MAX_MESSAGES = ${assistant.ASSISTANT_MAX_MESSAGES};`));
  assert.match(rulesTs, new RegExp(`ASSISTANT_MAX_MESSAGE_CHARS = ${assistant.ASSISTANT_MAX_MESSAGE_CHARS};`));
  assert.match(rulesTs, /if \(link === 'financeiro'\) return role === 'admin';/);
  assert.match(rulesTs, /if \(link === 'evolucao' \|\| link === 'escalas'\) return role !== 'reception';/);
});

test('atalhos por perfil: financeiro só da administração, recepção sem clínico', () => {
  assert.deepEqual(assistant.linksForRole('admin'), assistant.ASSISTANT_LINKS);
  assert.deepEqual(assistant.linksForRole('professional'), ['agenda', 'evolucao', 'escalas', 'gestao', 'pacientes']);
  assert.deepEqual(assistant.linksForRole('reception'), ['agenda', 'gestao', 'pacientes']);
  assert.equal(assistant.assistantRoleOf({ role: 'clinic_admin' }), 'admin');
  assert.equal(assistant.assistantRoleOf({ role: 'receptionist' }), 'reception');
  assert.equal(assistant.assistantRoleOf({ role: 'therapist' }), 'professional');
});

test('Sua atenção hoje: por perfil, com plural, e fonte que falhou não vira zero', () => {
  const admin = assistant.buildAttentionItems({
    role: 'admin',
    riskAlerts: [{}],
    pendingEvolutions: [{}, {}, {}],
    nearEndPackages: [{}, {}],
    receivables: [
      { late: true, daysLate: 20, openCents: 48000 },
      { late: true, daysLate: 16, openCents: 12000 },
      { late: true, daysLate: 15, openCents: 99999 },
      { late: false, daysLate: 0, openCents: 5000 },
    ],
  });
  assert.deepEqual(admin.items.map(item => [item.id, item.tone, item.target]), [
    ['risk', 'risk', 'escalas'],
    ['evolutions', 'pending', 'evolucao'],
    ['packages', 'info', 'financeiro'],
    ['late', 'info', 'financeiro'],
  ]);
  assert.equal(admin.items[0].strong, '1 escala com alerta de risco');
  assert.equal(admin.items[1].strong, '3 evoluções');
  assert.equal(admin.items[1].text, 'faltando na equipe');
  assert.equal(admin.items[3].cents, 60000, 'só o que passou de 15 dias');

  const reception = assistant.buildAttentionItems({ role: 'reception', riskAlerts: [{}], pendingEvolutions: [{}], receivables: [], nearEndPackages: [{}] });
  assert.deepEqual(reception, { items: [], failed: [] }, 'recepção não vê nada clínico nem financeiro');

  const professional = assistant.buildAttentionItems({ role: 'professional', riskAlerts: null, pendingEvolutions: [{}], receivables: [{ late: true, daysLate: 99, openCents: 1 }] });
  assert.deepEqual(professional.items.map(item => item.id), ['evolutions']);
  assert.equal(professional.items[0].text, 'para escrever');
  assert.deepEqual(professional.failed, ['escalas'], 'falha aparece, nunca zero');

  const nothing = assistant.buildAttentionItems({ role: 'admin', riskAlerts: [], pendingEvolutions: [], receivables: [], nearEndPackages: [] });
  assert.deepEqual(nothing, { items: [], failed: [] });
});

test('pacote perto do fim conta só sessões que valeram', () => {
  const packages = [
    { id: 'a', status: 'active', sessions_planned: 4 },
    { id: 'b', status: 'active', sessions_planned: 4 },
    { id: 'c', status: 'completed', sessions_planned: 1 },
    { id: 'd', status: 'active', sessions_planned: 1 },
  ];
  const charges = [
    ...['a', 'a', 'a'].map(id => ({ package_id: id, source: 'appointment' })),
    { package_id: 'b', source: 'appointment' },
    { package_id: 'b', source: 'appointment', voided_at: '2026-10-01' },
    { package_id: 'b', source: 'appointment', voided_at: '2026-10-02' },
  ];
  assert.deepEqual(assistant.packagesNearEnd({ packages, charges }).map(pkg => pkg.id), ['a', 'd']);
});

test('IA do mês: soma por função, custo estimado e teto', () => {
  const summary = summarizeAiUsage([
    { funcao: 'clinic-assistant', modelo: 'gemini-2.5-flash', chamadas: 10, entrada: 1_000_000, saida: 100_000, raciocinio: 0, teto_usd: 1 },
    { funcao: 'library-qa', modelo: 'gemini-2.5-flash', chamadas: 2, entrada: 0, saida: 0, raciocinio: 200_000, teto_usd: 1 },
  ]);
  assert.equal(summary.calls, 12);
  assert.equal(summary.functions[0].label, 'Assistente');
  assert.ok(Math.abs(summary.functions[0].usd - 0.55) < 1e-9);
  assert.ok(Math.abs(summary.totalUsd - 1.05) < 1e-9, 'raciocínio é cobrado como saída');
  assert.equal(summary.limitReached, true);
  assert.equal(summary.limitShare, 1);

  const empty = summarizeAiUsage([{ funcao: null, modelo: null, chamadas: 0, entrada: 0, saida: 0, raciocinio: 0, teto_usd: null }]);
  assert.deepEqual([empty.calls, empty.totalUsd, empty.limitUsd, empty.limitReached], [0, 0, null, false]);
  assert.equal(formatUsd(0.42), 'US$ 0,42');
  assert.equal(formatUsd(0.001), 'menos de US$ 0,01');
});

test('toda chamada ao Gemini grava o uso de quem chamou', async () => {
  const vertex = await read(`${functionsDir}/_shared/vertex.ts`);
  assert.match(vertex, /usage: AiUsageContext \| null,\r?\n\): Promise<Response>/, 'o uso é parâmetro obrigatório');
  assert.match(vertex, /response\.clone\(\)\.json\(\)/, 'lê uma cópia: a resposta continua inteira para quem chamou');
  assert.match(await read(`${functionsDir}/_shared/aiSmoke.ts`), /\}, null\);/, 'só o smoke técnico não grava');

  const dirs = (await readdir(path.join(root, functionsDir), { withFileTypes: true }))
    .filter(entry => entry.isDirectory() && entry.name !== '_shared')
    .map(entry => entry.name);
  let callers = 0;
  for (const dir of dirs) {
    const source = await read(`${functionsDir}/${dir}/index.ts`).catch(() => '');
    const calls = source.split('vertexGenerateContent(').length - 1;
    if (!calls) continue;
    callers += 1;
    const tagged = source.split(`usageContextFor(supabaseAdmin, '${dir}', caller)`).length - 1;
    assert.equal(tagged, calls, `${dir}: cada chamada ao Gemini grava o uso com o nome da função`);
    assert.doesNotMatch(source, /MODEL_ID = 'gemini/, `${dir}: modelo vem de _shared/aiModels.ts`);
  }
  assert.equal(callers, 9, 'as oito funções de IA e a assistente');
});

test('registro de uso no banco: sem conteúdo, sem leitura direta, só somado e só a administração', async () => {
  const sql = await read('../supabase/migrations/20261030_ai_usage.sql');
  const table = sql.match(/CREATE TABLE IF NOT EXISTS public\.ai_usage_events \(([\s\S]*?)\r?\n\);/)[1];
  const columns = [...table.matchAll(/^\s{2}([a-z_]+) /gm)].map(m => m[1]);
  assert.deepEqual(columns, ['id', 'clinic_id', 'user_id', 'function_name', 'model', 'input_tokens', 'output_tokens', 'thinking_tokens', 'created_at']);
  assert.match(sql, /ALTER TABLE public\.ai_usage_events ENABLE ROW LEVEL SECURITY;/);
  assert.doesNotMatch(sql, /CREATE POLICY/, 'nenhuma policy: o cliente não lê nem grava direto');
  assert.match(sql, /REVOKE ALL ON TABLE public\.ai_usage_events FROM PUBLIC, anon, authenticated;/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.ai_usage_totals\(UUID, DATE\) FROM PUBLIC, anon, authenticated;\r?\nGRANT EXECUTE ON FUNCTION public\.ai_usage_totals\(UUID, DATE\) TO service_role;/);
  const month = sql.match(/CREATE OR REPLACE FUNCTION public\.ai_usage_month\([\s\S]*?\r?\n\$\$;/)[0];
  assert.match(month, /NOT public\.is_clinic_admin\(auth\.uid\(\)\)/);
  assert.match(month, /public\.user_clinic_id\(auth\.uid\(\)\)/, 'sempre a instituição de quem pergunta');
  const limit = sql.match(/CREATE OR REPLACE FUNCTION public\.clinic_admin_set_ai_limit\([\s\S]*?\r?\n\$\$;/)[0];
  assert.match(limit, /NOT public\.is_clinic_admin\(auth\.uid\(\)\)/);
  assert.match(sql, /'America\/Sao_Paulo'/, 'o mês vira no fuso da clínica');
});

test('Edge Function da assistente: acesso, teto antes da IA, só ajuda do sistema, nunca conduta', async () => {
  const source = await read(`${functionsDir}/clinic-assistant/index.ts`);
  assert.match(source, /assertEdgeAccess\(caller\.profile, caller\.claims\)/);
  assert.match(source, /enforceEdgeRateLimit\(/);
  assert.ok(source.indexOf("rpc('ai_usage_totals'") < source.indexOf('vertexGenerateContent(MODEL_ID'), 'confere o teto antes de chamar');
  assert.match(source, /code: 'ai_limit'/);
  assert.match(source, /if \(totalsError \|\| clinicError\)/, 'sem conseguir conferir o teto, não chama');
  assert.match(source, /scrubClinicalText\(text\)/, 'mensagens passam pela limpeza de identificadores');
  assert.match(source, /Nunca dê diagnóstico, conduta, prescrição/);
  assert.match(source, /Nesta versão você NÃO vê pacientes/);
  assert.match(source, /ASSISTANT_HELP_TOPICS/);
  assert.doesNotMatch(source, /\.from\('(patients|patient_|clinical_records|appointments|finance_|appointment_charges)/, 'etapa 1 não lê dado de paciente nem financeiro');
  assert.match(source, /links\.includes\(link\)/, 'atalho só da lista do perfil');
  assert.match(source, /role === 'super_admin'\) return null/, 'SuperAdm não é equipe de instituição');
});

test('tela: botão minimizado fora da tela inicial, painel fecha como as outras janelas, cartão na tela inicial', async () => {
  const component = await read('src/components/assistant/ClinicAssistant.jsx');
  assert.match(component, /if \(state\.screen === 'inicio'\) return null;/, 'na tela inicial ela é o cartão');
  assert.match(component, /useDismiss\(\{ open, onClose: minimize \}\)/);
  assert.match(component, /aria-modal="true"/);
  assert.match(component, /Ela lembra e explica\. Quem decide é você\./);
  assert.match(component, /Sua atenção hoje/);
  assert.match(component, /link !== 'escalas' \|\| canSeeScales\(profile\)/, 'atalho de Escalas segue a regra da tela Escalas');

  const store = await read('src/components/assistant/assistantStore.js');
  assert.match(store, /const loadService = \(\) => import\('\.\.\/\.\.\/services\/clinicAssistantService'\);/, 'serviço fora do pacote principal');
  assert.match(store, /draft: question,/, 'pergunta que falhou volta para a caixa');

  const home = await read('src/components/HomeConsole.jsx');
  assert.match(home, /<AssistantHomeCard profile=\{profile\} \/>/);

  const app = await read('src/App.jsx');
  assert.match(app, /<ClinicAssistantLauncher profile=\{profile\} \/>/);
  assert.match(app, /!isSuperAdmin && !mustChangePassword && !needsMfa/, 'fora dos bloqueios de conta');
  assert.match(app, /setAssistantScreen\(assistantScreen\)/);
  assert.match(app, /registerAssistantNavigator\(/);

  const css = await read('src/styles/assistant.css');
  assert.match(css, /\.ca-launcher \{[\s\S]*?z-index: 44;/, 'abaixo de painel, ferramentas e janelas que abrem por cima');
  assert.match(css, /body:has\(\.ag-fab\) \.ca-launcher/, 'na Agenda do celular, acima do "+ Novo agendamento"');
  assert.match(css, /@media \(max-width: 1024px\)/);
  assert.doesNotMatch(css, /#[0-9a-f]{3,6}\b/i, 'só tokens');
});

test('Gestão → Configurações → IA do mês com "Como funciona"', async () => {
  const gestao = await read('src/components/panels/RelatoriosGestao.jsx');
  assert.match(gestao, /\{ id: 'ia', label: 'IA do mês' \}/);
  assert.match(gestao, /section === 'ia' &&/);
  assert.equal(GESTAO_HELP.ia.title, 'IA do mês');
  assert.match(GESTAO_HELP.ia.reading.join(' '), /fatura do Google Cloud é a referência/);
});
