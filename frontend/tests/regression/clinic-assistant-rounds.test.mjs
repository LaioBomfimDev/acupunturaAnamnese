import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import { createServer } from 'vite';
import * as front from '../../src/utils/clinicAssistant.js';
import * as edge from '../../../supabase/functions/_shared/assistantConsulta.ts';

// ============================================================
// ACUP-024 (AG-6): até 3 consultas por pergunta (antes, uma volta só).
// Quem pede a próxima é a IA; o aparelho executa e conta, a Edge conta de
// novo, passa cada resultado pela mesma porta e recusa a 4ª. Sem rede.
// ============================================================

const root = fileURLToPath(new URL('../..', import.meta.url));
const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent', plugins: [{
  name: 'rounds-test-isolation', enforce: 'pre', load(id) {
    const clean = id.replaceAll('\\', '/').split('?')[0];
    if (clean.endsWith('/src/lib/supabase.js')) return "export const getAuthenticatedUser=async()=>({id:'u'});export const supabase={functions:{invoke:async()=>{throw Error('Rede inesperada')}},rpc:async()=>({data:null,error:null}),from:()=>{throw Error('Rede inesperada')}};";
  },
}] });
after(() => server.close());
const service = await server.ssrLoadModule('/src/services/clinicAssistantService.js');
const indexSource = await readFile(new URL('../../../supabase/functions/clinic-assistant/index.ts', import.meta.url), 'utf8');
const serviceSource = await readFile(new URL('../../src/services/clinicAssistantService.js', import.meta.url), 'utf8');
const storeSource = await readFile(new URL('../../src/components/assistant/assistantStore.js', import.meta.url), 'utf8');

const roundsCode = indexSource.slice(indexSource.indexOf('function readRounds('), indexSource.indexOf('// Fim das voltas.'));
const readRounds = new Function(stripTypeScriptTypes(roundsCode) + '; return readRounds;')();
const helperSource = indexSource.slice(indexSource.indexOf('async function readAuthorizedConsultaResult('), indexSource.indexOf('// Fim FIN-1.'));
const authorize = new Function('readConsultaResult', stripTypeScriptTypes(helperSource) + '; return readAuthorizedConsultaResult;')(edge.readConsultaResult);
const constant = name => {
  const match = indexSource.match(new RegExp(`const ${name} = ([^;]+);`));
  return new Function(`return ${match[1]}`)();
};

const messages = [{ role: 'user', text: 'Quem tem mais faltas e como está a agenda dele amanhã?' }];
const consultas = [
  { tipo: 'faltas', de: '2026-11-01', ate: '2026-11-08', profissional: 'equipe' },
  { tipo: 'agenda', de: '2026-11-10', ate: '2026-11-10', profissional: 'Denise' },
  { tipo: 'confirmacoes_pendentes', profissional: 'Denise' },
  { tipo: 'pacotes_fim', profissional: 'equipe' },
];
const resultOf = consulta => ({ tipo: consulta.tipo, de: consulta.de || '', ate: consulta.ate || '', profissional: consulta.profissional, motivo: null, resumo: { total: 1 } });

// Edge falsa: devolve consultas na ordem dada e depois a resposta.
function fakeEdge(script) {
  const bodies = [];
  const invoke = async (_name, { body }) => {
    bodies.push(body);
    const step = script[bodies.length - 1];
    if (step instanceof Error) return { data: null, error: step };
    return { data: step, error: null };
  };
  return { invoke, bodies };
}
function fakeTools({ fail = null } = {}) {
  const runs = [];
  return {
    runs,
    tools: {
      loadAssistantTeam: async () => [],
      runAssistantConsulta: async consulta => {
        runs.push(consulta);
        if (fail === consulta.tipo) throw new Error('SEGREDO de fonte');
        return consulta.tipo === 'financeiro' ? { tipo: 'financeiro', motivo: null, linhas: [] } : resultOf(consulta);
      },
    },
  };
}
const askRounds = (script, options = {}) => {
  const edgeFake = fakeEdge(script);
  const toolsFake = fakeTools(options);
  const steps = [];
  const promise = service.askAssistantWithTools({
    messages: options.messages || messages, screen: 'agenda', profile: { id: 'u', clinic_id: 'c', role: 'clinic_admin' },
    onStep: (step, round) => steps.push([step, round]), invoke: edgeFake.invoke, tools: toolsFake.tools,
  });
  return { promise, ...edgeFake, ...toolsFake, steps };
};
const answer = text => ({ answer: text, links: [] });

test('AG-6 espelho: 3 voltas e a mesma frase no aparelho e na Edge; a asserção "uma volta só" virou "até 3"', () => {
  assert.equal(service.ASSISTANT_MAX_ROUNDS, 3);
  assert.equal(constant('ASSISTANT_MAX_ROUNDS'), service.ASSISTANT_MAX_ROUNDS);
  assert.equal(constant('ASSISTANT_ROUNDS_MESSAGE'), service.ASSISTANT_ROUNDS_MESSAGE);
  assert.match(service.ASSISTANT_ROUNDS_MESSAGE, /no máximo 3 consultas por pergunta/);
  assert.doesNotMatch(serviceSource, /second\.consulta/, 'o laço de uma volta só saiu');
});

test('AG-6 aparelho: 1, 2 e 3 voltas; cada volta manda só o resultado novo em dados e os anteriores já limpos', async () => {
  for (const count of [0, 1, 2, 3]) {
    const script = [...consultas.slice(0, count).map(consulta => ({ consulta })), answer(`resposta com ${count}`)];
    const run = askRounds(script);
    const reply = await run.promise;
    assert.equal(reply.answer, `resposta com ${count}`);
    assert.equal(run.bodies.length, count + 1, `${count} voltas = ${count + 1} chamadas`);
    assert.equal(run.runs.length, count);
    assert.ok(!('dados' in run.bodies[0]) && !('dadosAnteriores' in run.bodies[0]), '1ª chamada sem dados');
    for (let round = 1; round <= count; round += 1) {
      const body = run.bodies[round];
      assert.deepEqual(body.dados, resultOf(consultas[round - 1]));
      if (round === 1) assert.ok(!('dadosAnteriores' in body));
      else assert.deepEqual(body.dadosAnteriores, consultas.slice(0, round - 1).map(resultOf));
      assert.deepEqual(body.messages, messages, 'a conversa é a mesma; nada do modelo de uma volta entra na outra');
    }
    assert.deepEqual(run.steps.filter(([step]) => step === 'agenda').map(([, round]) => round), Array.from({ length: count }, (_, i) => i + 1));
  }
});

test('AG-6 aparelho: a 4ª consulta é recusada com erro claro e nunca é pedida', async () => {
  const run = askRounds([...consultas.map(consulta => ({ consulta })), answer('não chega')]);
  await assert.rejects(run.promise, new RegExp(service.ASSISTANT_ROUNDS_MESSAGE.replace(/[.]/g, '\\.')));
  assert.equal(run.runs.length, 3, 'a 4ª consulta não é buscada');
  assert.equal(run.bodies.length, 4, 'nenhuma 5ª chamada');
});

test('AG-6 aparelho: consulta repetida reusa o resultado (sem buscar de novo) e conta a volta', async () => {
  const run = askRounds([{ consulta: consultas[0] }, { consulta: { ...consultas[0] } }, answer('ok')]);
  assert.equal((await run.promise).answer, 'ok');
  assert.equal(run.runs.length, 1, 'buscou uma vez só');
  assert.equal(run.bodies.length, 3, 'mas a volta contou');
  assert.deepEqual(run.bodies[2].dadosAnteriores, [resultOf(consultas[0])]);
  // A ordem das chaves não muda o que é "igual".
  const reordered = askRounds([{ consulta: consultas[1] }, { consulta: { profissional: 'Denise', ate: '2026-11-10', de: '2026-11-10', tipo: 'agenda' } }, answer('ok')]);
  await reordered.promise;
  assert.equal(reordered.runs.length, 1);
});

test('AG-6 aparelho: consulta que falha vira aviso e não para as outras; orçamento estourado para na hora', async () => {
  const failing = askRounds([{ consulta: consultas[0] }, { consulta: consultas[1] }, answer('faltou faltas')], { fail: 'faltas' });
  assert.equal((await failing.promise).answer, 'faltou faltas');
  assert.deepEqual(failing.bodies[1].dados, { ...consultas[0], motivo: 'erro' }, 'falha vira resultado com motivo, sem a mensagem da fonte');
  // QA 09/11/2026: com os filtros do pedido, a Edge lê "erro", nunca "período inválido".
  for (const tipo of ['faltas', 'agenda', 'pesquisas', 'financeiro']) {
    const pedido = tipo === 'financeiro' ? { tipo, de: '2026-11-01', ate: '2026-11-08', status: 'recebidos', paciente: '', idade: null, profissional: 'equipe' }
      : { tipo, de: '2026-11-01', ate: '2026-11-08', profissional: 'equipe' };
    const failed = askRounds([{ consulta: pedido }, answer('sem dado')], { fail: tipo });
    await failed.promise;
    assert.equal(edge.readConsultaResult(failed.bodies[1].dados).motivo, 'erro', tipo);
  }
  assert.doesNotMatch(JSON.stringify(failing.bodies), /SEGREDO/);
  assert.equal(failing.runs.length, 2, 'a 2ª consulta seguiu');
  const limit = Object.assign(new Error('fallback'), { context: { json: async () => ({ error: 'O limite de IA do mês da instituição acabou.' }) } });
  const budget = askRounds([{ consulta: consultas[0] }, limit, answer('não chega')]);
  await assert.rejects(budget.promise, /limite de IA do mês/);
  assert.equal(budget.bodies.length, 2, 'parou na volta em que o limite estourou');
  assert.equal(budget.runs.length, 1);
});

test('AG-6 aparelho: o marcador financeiro (FIN-3/6) segue se QUALQUER volta foi financeira', async () => {
  const financial = { tipo: 'financeiro', de: '2026-10-01', ate: '2026-10-31', status: 'recebidos', profissional: 'equipe' };
  const run = askRounds([{ consulta: financial }, { consulta: consultas[1] }, answer('misturada')]);
  const reply = await run.promise;
  assert.equal(reply.financeiro, true);
  assert.equal(run.bodies[2].dados.tipo, 'agenda');
  assert.equal(run.bodies[2].dadosAnteriores[0].tipo, 'financeiro');
  const plain = askRounds([{ consulta: consultas[1] }, answer('sem dinheiro')]);
  assert.ok(!('financeiro' in await plain.promise));
  assert.match(storeSource, /onStep: \(step, round = 0\) => setState\(\{ sendingStep: step, sendingRound: round \}\)/);
  // Autorizado na ACUP-024: a tela mostra a volta ("Consultando… 2 de 3"), lendo sendingRound do store.
  const component = await readFile(new URL('../../src/components/assistant/ClinicAssistant.jsx', import.meta.url), 'utf8');
  assert.match(component, /\{state\.sendingStep === 'agenda' \? `Consultando os dados da clínica…\$\{state\.sendingRound \? ` \$\{state\.sendingRound\} de 3` : ''\}` : 'Pensando…'\}/);
});

test('AG-6 Edge: voltas contadas pelo que veio; pedido acima de 3 recusado antes da porta, do orçamento e do Gemini', () => {
  const a = { tipo: 'agenda' };
  assert.deepEqual(readRounds({}, 3), { ok: true, voltas: 0, anteriores: [] });
  assert.deepEqual(readRounds({ dados: a }, 3), { ok: true, voltas: 1, anteriores: [] });
  assert.deepEqual(readRounds({ dados: a, dadosAnteriores: [a] }, 3), { ok: true, voltas: 2, anteriores: [a] });
  assert.deepEqual(readRounds({ dados: a, dadosAnteriores: [a, a] }, 3), { ok: true, voltas: 3, anteriores: [a, a] });
  for (const forged of [{ dados: a, dadosAnteriores: [a, a, a] }, { dadosAnteriores: [a] }, { dados: a, dadosAnteriores: a }, { dados: a, dadosAnteriores: 'x' }]) {
    assert.equal(readRounds(forged, 3).ok, false, JSON.stringify(forged));
  }
  const order = name => indexSource.indexOf(name);
  assert.ok(order('if (!rounds.ok) return jsonResponse({ error: ASSISTANT_ROUNDS_MESSAGE }, 400);') > 0);
  assert.ok(order('if (!rounds.ok)') < order('const dados = await readAuthorizedConsultaResult(requestBody.dados'), 'recusa antes da porta');
  assert.ok(order('if (!rounds.ok)') < order('const generate = async'), 'recusa antes do Gemini e do orçamento');
  assert.match(indexSource, /const consulta = rounds\.voltas >= ASSISTANT_MAX_ROUNDS \? null : readConsulta\(reply\.parsed\?\.consulta\);/);
});

test('AG-6 Edge: cada item anterior passa pela mesma porta em toda chamada; o recusado sai calado e a volta conta', async () => {
  assert.match(indexSource, /rounds\.anteriores\.map\(item => readAuthorizedConsultaResult\(item, supabaseAdmin, clinicId, caller\.user\.id\)\)/);
  const financial = { tipo: 'financeiro', de: '2026-10-01', ate: '2026-10-31', status: 'recebidos', paciente: '', idade: null, profissional: 'equipe', motivo: null, mensagem: '', criterio: '', linhas: [], totais: null, total: 0 };
  const denied = { rpc: async () => ({ data: false, error: null }), from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: 'therapist', clinic_id: 'outra' }, error: null }) }) }) }) };
  const pesquisas = { tipo: 'pesquisas', de: '2026-11-01', ate: '2026-11-08', profissional: 'equipe', motivo: null, mensagem: '', criterio: '', linhas: [], total: 0, resumo: { respondidas: 1, media: 5, aguardando: 0 } };
  const body = { dados: { tipo: 'agenda' }, dadosAnteriores: [financial, pesquisas] };
  const rounds = readRounds(body, 3);
  const accepted = (await Promise.all(rounds.anteriores.map(item => authorize(item, denied, 'c', 'u')))).filter(Boolean);
  assert.deepEqual(accepted, [], 'financeiro sem permissão e pesquisa de outra clínica saem');
  assert.equal(rounds.voltas, 3, 'mas as voltas continuam contadas: forjar menos itens não dá voltas a mais');
  assert.match(indexSource, /JSON\.stringify\(\[\.\.\.\(context\.anteriores \|\| \[\]\), \.\.\.\(context\.dados \? \[context\.dados\] : \[\]\)\]\)/, 'só o que passou pela porta vai ao prompt');
  assert.match(indexSource, /anteriores\.some\(item => item\.tipo === 'financeiro'\)/, 'FIN-3/6 na Edge também olha as voltas anteriores aceitas');
});

test('AG-6 Edge: teto de tamanho recusa antes do Gemini e do orçamento, com mensagem clara (nunca corta)', () => {
  const maxChars = constant('ASSISTANT_MAX_DADOS_CHARS');
  assert.equal(maxChars, 80_000, 'AG-9: era 64.000; o máximo do contrato (74.122) caía em 413');
  assert.equal(constant('ASSISTANT_MAX_BODY_BYTES'), 128_000);
  const order = name => indexSource.indexOf(name);
  assert.ok(order('if (JSON.stringify([...anteriores, dados]).length > ASSISTANT_MAX_DADOS_CHARS)') < order('const generate = async'));
  assert.match(indexSource, /if \(bodyTooLarge\) return jsonResponse\(\{ error: ASSISTANT_TOO_LARGE_MESSAGE \}, 413\);/);
  assert.match(constant('ASSISTANT_TOO_LARGE_MESSAGE'), /dados demais para uma resposta só/);
  // Pior caso realista: 3 consultas financeiras por paciente de 50 linhas, com nomes no tamanho máximo, cabem.
  const line = { paciente: 'Maximiliano', idade: 130, homonimo: true, area: 'Neuropsicologia', profissional: 'X'.repeat(80), forma: 'pacote_por_sessao', sessoes_feitas: 999,
    sessoes_pagas: 999, sessoes_sem_valor: 999, sessao_atual: 999, sessoes_previstas: 999, parcelas_pagas: null, parcelas_em_aberto: null, em_aberto_centavos: 999999999, situacao: 'em_aberto' };
  const biggest = { tipo: 'financeiro', de: '2026-10-01', ate: '2026-10-31', status: 'por_paciente', paciente: '', idade: null, profissional: 'equipe', motivo: null, mensagem: '',
    criterio: front.FINANCE_CRITERIA.paciente, linhas: Array(50).fill(line), totais: null, total: 50 };
  assert.ok(JSON.stringify([biggest, biggest, biggest]).length <= maxChars, 'o teto não recusa 3 consultas legítimas no limite de 50 linhas');
  // AG-9: o máximo do CONTRATO (paciente com 40 letras, profissional com 120) passa pela Edge e cabe.
  const longName = 'Á'.repeat(40);
  const contractLine = { ...line, paciente: longName, profissional: 'P'.repeat(120) };
  const contractMax = { ...biggest, profissional: 'P'.repeat(120), linhas: Array(50).fill(contractLine) };
  assert.deepEqual(edge.readConsultaResult(contractMax).linhas[0], contractLine, 'a Edge aceita a linha no máximo do contrato');
  const contractSize = JSON.stringify([contractMax, contractMax, contractMax]).length;
  assert.ok(contractSize > 64_000 && contractSize <= maxChars, `máximo do contrato (${contractSize}) cabe no teto`);
  // Tipos com paciente da ACUP-025: os maiores ficam abaixo do financeiro.
  if (front.PATIENT_KEYS) {
    const longest = list => list.reduce((a, b) => (b.length > a.length ? b : a), '');
    const agendaLine = { dia: '2026-10-01', inicio: '09:00', fim: '09:50', paciente: longName, idade: 130, homonimo: false, profissional: 'P'.repeat(80),
      area: longest(front.FINANCE_AREAS), tipo_atendimento: longest(front.AGENDA_TYPE_LABELS), modalidade: longest(front.AGENDA_MODALITIES), status: longest(front.AGENDA_STATUS_LABELS) };
    const agendaMax = { tipo: 'agenda_pacientes', de: '2026-10-01', ate: '2026-12-31', profissional: 'P'.repeat(80), paciente: longName, idade: 130, minimo: 20, motivo: null, mensagem: '',
      criterio: front.PATIENT_CRITERIA.agenda_pacientes, linhas: Array(50).fill(agendaLine), total: 50, resumo: { agendados: 99999, atendidos: 99999, faltas: 99999, cancelamentos: 99999, bloqueios: 99999 } };
    assert.equal(edge.readConsultaResult(agendaMax).motivo, null);
    assert.ok(JSON.stringify([agendaMax, agendaMax, agendaMax]).length < contractSize, 'agenda_pacientes no máximo fica abaixo do financeiro');
  }
});

test('AG-6 Edge: na 3ª volta, pedido de consulta vira UMA chamada a mais só pela resposta (orçamento e uso), e só então 422', () => {
  const generate = indexSource.slice(indexSource.indexOf('const generate = async'), indexSource.indexOf('let reply = await generate(systemText);'));
  assert.match(generate, /const budgetResponse = await enforceAiBudget\(supabaseAdmin, caller, jsonResponse\);/, 'cada chamada passa pelo limite do mês');
  assert.match(generate, /usageContextFor\(supabaseAdmin, 'clinic-assistant', caller\)/, 'cada chamada grava uso');
  assert.match(generate, /maxOutputTokens: 1500/);
  assert.match(generate, /thinkingConfig: THINKING_LOW/);
  const tail = indexSource.slice(indexSource.indexOf('let reply = await generate(systemText);'));
  assert.match(tail, /if \(!answer && rounds\.voltas >= ASSISTANT_MAX_ROUNDS && reply\.parsed\?\.consulta\) \{[\s\S]*?reply = await generate\(`\$\{systemText\}[\s\S]*?AGORA: já foram feitas \$\{ASSISTANT_MAX_ROUNDS\} consultas\. Não peça consulta\./);
  assert.match(tail, /if \(reply instanceof Response\) return reply;\r?\n\s*answer = /, 'orçamento estourado na chamada extra para na hora');
  assert.match(generate, /if \(budgetResponse\) return budgetResponse;/);
  assert.match(tail, /if \(!answer\) return jsonResponse\(\{ error: ASSISTANT_ROUNDS_MESSAGE \}, 422\);/);
  assert.equal((tail.match(/await generate\(/g) || []).length, 2, 'no máximo uma chamada a mais');
  assert.match(indexSource, /Consultas feitas nesta pergunta: \$\{context\.voltas \|\| 0\} de 3\. Peça UMA consulta por vez/);
});
