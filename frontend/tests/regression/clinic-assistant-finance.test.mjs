import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import { createServer } from 'vite';
import * as front from '../../src/utils/clinicAssistant.js';
import * as edge from '../../../supabase/functions/_shared/assistantConsulta.ts';
const query = { tipo: 'financeiro', de: '2026-10-01', ate: '2026-10-31', status: 'a_receber', profissional: 'equipe', paciente: '' };
// Contrato v2 (ACUP-018, FIN-5/FIN-7): paciente = só primeiro nome + idade; nada de sobrenome ou nascimento.
const row = { paciente: 'Lúcia', idade: 7, homonimo: false, area: 'Psicologia', profissional: 'Profissional fictício', valor_centavos: 12345, vencimento: '2026-10-15', pagamento: null, status: 'a_receber' };
const members = [{ id: 'p', full_name: 'Pessoa Profissional Fictícia', is_active: true, has_agenda: true }];
const patients = [{ id: 'a', name: 'Lúcia', birth_date: '2019-03-10', cpf: 'SEGREDO', telefone: 'SEGREDO', observacoes: 'SEGREDO' }];
const money = () => ({ charges: [{ id: 'c', patient_id: 'a', professional_id: 'p', discipline: 'psicologia', source: 'appointment', service_on: '2026-10-15', price_cents: 12345 }], packages: [], installments: [], receipts: [], tissPaid: [], tissStatus: [], tissReady: true });
const root = fileURLToPath(new URL('../..', import.meta.url));
const state = { permission: true, money: money(), reads: [], fail: '' };
globalThis.__acupFinanceTest = state;
after(() => { delete globalThis.__acupFinanceTest; });
const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent', plugins: [{
  name: 'finance-test-isolation', enforce: 'pre', load(id) {
    const clean = id.replaceAll('\\', '/').split('?')[0];
    if (clean.endsWith('/src/lib/supabase.js')) return `export const getAuthenticatedUser=async()=>({id:'admin'}); export const supabase={rpc:async(fn,args)=>{const s=globalThis.__acupFinanceTest;s.reads.push(fn);if(s.fail===fn)throw Error('SEGREDO de fonte');return fn==='can_manage_finance'?{data:s.permission,error:null}:{data:s.members||${JSON.stringify(members)},error:null};},from:()=>{throw Error('Rede inesperada')}};`;
    if (clean.endsWith('/src/services/appointmentService.js')) return `export const listAppointments=async()=>[];export const listAppointmentsAwaitingEvolution=async()=>[];export const listPatientsAwaitingReturn=async()=>[];`;
    if (clean.endsWith('/src/services/agendaScheduleService.js')) return `export const listHolidays=async()=>[];export const listProfessionalSchedules=async()=>[];`;
    if (clean.endsWith('/src/services/agendaSettingsService.js')) return `export const loadAgendaSettings=async()=>({settings:{}});`;
    if (clean.endsWith('/src/services/financeiroService.js')) return `export async function loadReceivablesData(){const s=globalThis.__acupFinanceTest;s.reads.push('money');if(s.fail==='money')throw Error('SEGREDO');return s.money;}`;
    if (clean.endsWith('/src/services/clinicPatientsService.js')) return `export async function listClinicPatients(){const s=globalThis.__acupFinanceTest;s.reads.push('patients');if(s.fail==='patients')throw Error('SEGREDO');return s.patients||${JSON.stringify(patients)};}`;
  },
}] });
after(() => server.close());
const tools = await server.ssrLoadModule('/src/services/assistantTools.js');
const serviceNames = await server.ssrLoadModule('/src/services/clinicMembersService.js');
const finance = await server.ssrLoadModule('/src/utils/finance.js');
const tiss = await server.ssrLoadModule('/src/utils/tissXml.js');
const admin = { id: 'admin', clinic_id: 'clinic', role: 'clinic_admin' };
const run = (q = query, profile = admin) => tools.runAssistantConsulta(q, { profile, now: new Date('2026-11-01T12:00:00Z') });
const reset = () => { state.permission = true; state.money = money(); state.reads = []; state.fail = ''; state.patients = null; state.members = null; };

test('FIN-4: espelho, datas reais, 93 dias inclusivos, filtro e 50 linhas sem corte silencioso', () => {
  for (const key of ['ASSISTANT_CONSULTAS', 'CONSULTA_MOTIVOS', 'FINANCE_MAX_DAYS', 'FINANCE_MAX_ROWS', 'FINANCE_FILTERS', 'FINANCE_ROW_STATUS', 'FINANCE_REASONS', 'FINANCE_CRITERIA']) assert.deepEqual(edge[key], front[key], key);
  assert.deepEqual(front.FINANCE_ROW_STATUS, ['recebido','a_receber','atrasado','recebido_operadora','a_receber_operadora','atrasado_operadora','aguardando_lote_operadora']);
  for (const raw of [query, { ...query, de: '2026-02-30' }, { ...query, de: '2026-01-01', ate: '2026-04-03' }, { ...query, de: '2026-01-01', ate: '2026-04-04' }, { ...query, ate: '2026-10-01', de: '2026-10-02' }, { ...query, status: 'apagar' }, { ...query, paciente: {} }, { ...query, profissional: null }]) {
    assert.deepEqual(edge.readFinanceConsulta(raw), front.readFinanceConsulta(raw));
    assert.equal(edge.financeConsultaIssue(raw), front.financeConsultaIssue(raw));
  }
  assert.equal(front.financeConsultaIssue({ ...query, de: '2026-01-01', ate: '2026-04-03' }), null);
  assert.equal(front.financeConsultaIssue({ ...query, de: '2026-01-01', ate: '2026-04-04' }), 'limite_periodo');
  for (const count of [0, 50, 51]) {
    const raw = { ...query, linhas: Array(count).fill(row) };
    const result = front.readFinanceResult(raw);
    assert.deepEqual(edge.readConsultaResult(raw), result);
    assert.equal(result.total, count > 50 ? null : count);
    assert.equal(result.linhas.length, count > 50 ? 0 : count);
    if (count > 50) assert.match(result.mensagem, /Estreite/);
  }
});
test('T2: lista fechada e valores em centavos; sem campos clínicos, documentos ou contato', () => {
  const raw = { ...query, cpf: 'SEGREDO', mensagem: 'SEGREDO', criterio: 'SEGREDO', linhas: [{ ...row, cpf: 'SEGREDO', telefone: 'SEGREDO', email: 'SEGREDO', endereco: 'SEGREDO', carteirinha: 'SEGREDO', observacao: 'SEGREDO', full_session: 'SEGREDO', evolucao: 'SEGREDO' }] };
  assert.deepEqual(front.readFinanceResult({...query,motivo:{toString:{}},linhas:[row]}),edge.readFinanceResult({...query,motivo:{toString:{}},linhas:[row]}));
  for (const parse of [front.readFinanceResult, edge.readFinanceResult]) {
    const result = parse(raw);
    // Asserção trocada pela ACUP-018 (FIN-7): a linha v2 ganha idade, homonimo e area; o paciente é só o primeiro nome.
    assert.deepEqual(Object.keys(result.linhas[0]).sort(), ['paciente','idade','homonimo','area','profissional','valor_centavos','vencimento','pagamento','status'].sort());
    assert.deepEqual(result.linhas[0], row);
    assert.doesNotMatch(JSON.stringify(result), /SEGREDO|cpf|telefone|email|endereco|carteirinha|observacao|full_session|evolucao/);
    for (const valor_centavos of [1.2, '12345', -1, Number.MAX_SAFE_INTEGER + 1]) assert.equal(parse({ ...query, linhas: [{ ...row, valor_centavos }] }).motivo, 'erro');
    for (const vencimento of ['2026-02-30','2025-01-01','2026-10-12T00:00:00Z']) assert.equal(parse({ ...query, linhas: [{ ...row, vencimento }] }).motivo, 'erro');
  }
});
test('T1 aparelho: recepção, terapeuta e clínica não autorizada não disparam fontes de dinheiro ou nomes', async () => {
  for (const role of ['receptionist', 'therapist', 'clinic_admin']) {
    reset(); if (role === 'clinic_admin') state.permission = false;
    const result = await run(query, { ...admin, clinic_id: role === 'clinic_admin' ? 'outra' : 'clinic', role });
    assert.equal(result.motivo, 'sem_permissao'); assert.equal(result.total, null);
    assert.deepEqual(state.reads, role === 'clinic_admin' ? ['can_manage_finance'] : []);
  }
  reset(); state.fail = 'can_manage_finance'; assert.equal((await run()).motivo, 'erro'); assert.deepEqual(state.reads, ['can_manage_finance']);
});
test('fontes reais da tela e falha explícita: nunca zero parcial; consulta inválida não carrega fontes', async () => {
  reset(); const result = await run();
  assert.deepEqual(state.reads, ['can_manage_finance','money','patients','list_clinic_members']);
  assert.equal(result.linhas[0].paciente, patients[0].name);
  assert.equal(result.linhas[0].profissional, serviceNames.shortName(members[0].full_name));
  assert.equal(result.linhas[0].valor_centavos, 12345);
  assert.doesNotMatch(JSON.stringify(result), /SEGREDO/);
  for (const fail of ['money','patients','list_clinic_members']) {
    reset(); state.fail = fail; const failed = await run();assert.equal(failed.motivo, 'erro');assert.equal(failed.total, null);assert.doesNotMatch(JSON.stringify(failed), /SEGREDO/);
  }
  reset(); state.money.tissReady = false;assert.equal((await run()).motivo, 'erro');
  reset(); assert.equal((await run({ ...query, ate: '2027-10-31' })).motivo, 'limite_periodo');assert.deepEqual(state.reads, ['can_manage_finance']);
  for (const invalid of [{paciente:{}},{profissional:null},{paciente:'x'.repeat(121)}]) {reset();assert.equal((await run({...query,...invalid})).motivo,'filtro_invalido');assert.deepEqual(state.reads,['can_manage_finance']);}
});
test('mesma conta de A receber, incluindo pagamento parcial, convênio sem lote, prazo e operadora', async () => {
  reset(); state.money.receipts.push({ id:'r',charge_id:'c',patient_id:'a',received_on:'2026-10-20',amount_cents:2345 });
  assert.equal((await run()).linhas[0].valor_centavos, 10000);
  assert.equal((await run({ ...query, status:'recebidos' })).linhas[0].valor_centavos,2345);
  state.money.charges[0].payer='convenio';state.money.charges[0].convenio_id='conv';
  const waiting=await run(); assert.equal(waiting.linhas[0].status,'aguardando_lote_operadora');assert.equal(waiting.linhas[0].vencimento,null);assert.equal(waiting.criterio,front.FINANCE_CRITERIA.misto);
  assert.equal((await run({ ...query, status:'atrasados' })).total,0,'sem lote/prazo não atrasa');
  state.money.tissStatus=[{cobranca:'c',enviado_em:'2026-10-10',prazo_dias:5}];
  assert.equal((await run({ ...query, status:'atrasados' })).linhas[0].status,'atrasado_operadora');
  state.money.tissPaid=[{lancamento:'l',cobranca:'c',pago_em:'2026-10-25',valor_centavos:1000}];
  const paid=await run({ ...query, status:'recebidos' });assert.equal(paid.linhas.at(-1).status,'recebido_operadora');assert.equal(paid.linhas.at(-1).paciente,patients[0].name);
});
test('filtros por paciente/profissional não abrem para todos em erro/ambiguidade, limite conta após filtro', async () => {
  reset(); assert.equal((await run({ ...query,paciente:'ausente' })).motivo,'nao_encontrado');
  assert.equal((await run({ ...query,profissional:'ausente' })).motivo,'nao_encontrado');
  assert.equal((await run({ ...query,paciente:patients[0].name,profissional:serviceNames.shortName(members[0].full_name) })).total,1);
  state.money.charges=Array.from({length:51},(_,i)=>({...money().charges[0],id:'c'+i}));
  const tooMany=await run();assert.equal(tooMany.motivo,'limite_linhas');assert.equal(tooMany.total,null);assert.deepEqual(tooMany.linhas,[]);
});
const edgeSource = await readFile(new URL('../../../supabase/functions/clinic-assistant/index.ts', import.meta.url),'utf8');
const helperSource=edgeSource.slice(edgeSource.indexOf('async function readAuthorizedConsultaResult('),edgeSource.indexOf('// Fim FIN-1.'));
const authorize = new Function('readConsultaResult', stripTypeScriptTypes(helperSource)+'; return readAuthorizedConsultaResult;')(edge.readConsultaResult);
test('FIN-1 servidor: checagem real com identidade autenticada; dados forjados nunca são devolvidos sem permissão', async () => {
  assert.match(edgeSource,/const dados = await readAuthorizedConsultaResult\(requestBody\.dados, supabaseAdmin, clinicId, caller\.user\.id\)/);
  const raw={...query,linhas:[row],clinic_id:'forjada',user_id:'forjado'};
  for(const allowed of [false,null,true]){
    const calls=[];const client={rpc:async(fn,args)=>{calls.push({fn,args});return {data:allowed,error:null};}};
    const result=await authorize(raw,client,'clinica-autenticada','usuario-autenticado');
    assert.deepEqual(calls,[{fn:'can_manage_finance',args:{p_clinic:'clinica-autenticada',p_user:'usuario-autenticado'}}]);
    assert.deepEqual(result,allowed===true?edge.readFinanceResult(raw):null);
  }
  assert.equal(await authorize({...raw,tipo:'\u0000financeiro'},{rpc:async()=>({data:false,error:null})},'c','u'),null, 'normalização de tipo não pode contornar FIN-1');
  assert.equal(await authorize(raw,{rpc:async()=>{throw Error('SEGREDO');}},'c','u'),null);
  assert.equal(await authorize(raw,{rpc:async()=>({data:true,error:{message:'SEGREDO'}})},'c','u'),null);
  let called=false;await authorize({tipo:'atendimentos_dia'}, {rpc:async()=>{called=true;}},'c','u');assert.equal(called,false);
});
test('FIN-2 e escopo: só imports de leitura, orçamento/uso intactos e nada financeiro em logs', async () => {
  const source=await readFile(new URL('../../src/services/assistantTools.js',import.meta.url),'utf8');
  assert.match(source,/import \{ loadReceivablesData \} from '.\/financeiroService'/);
  assert.doesNotMatch(source,/loadFinanceData|finance_ensure_defaults|console\.|\.from\(|\.insert\(|\.update\(|\.delete\(/);
  assert.match(edgeSource,/enforceAiBudget/);assert.match(edgeSource,/usageContextFor/);
  assert.doesNotMatch(helperSource,/console\.|logEdge|error\.message|JSON\.stringify/);
});

test('autorização 2a66b20: horários vagos seguem para terapeuta e recepção sem permissão financeira', async () => {
  for (const role of ['therapist','receptionist']) {
    reset();state.permission=false;
    const result=await tools.runAssistantConsulta({tipo:'horarios_vagos',profissional:'eu',dia:'2026-11-03'}, {profile:{...admin,id:'p',role},team:members,now:new Date('2026-11-01T12:00:00Z')});
    assert.equal(result.tipo,'horarios_vagos');assert.equal(result.motivo,null);assert.ok(result.horarios.length>0);assert.deepEqual(state.reads,[]);
    assert.deepEqual(result.linhas,[]);assert.equal(result.total,null);assert.ok(!('paciente' in result));
  }
});

// QA (review da ACUP-016): FIN-1 só aceita o booleano true do servidor, nunca valor "parecido".
test('QA: FIN-1 descarta resposta não booleana do servidor (string, número, objeto) e tipo forjado com espaço invisível', async () => {
  const raw = { ...query, linhas: [row] };
  for (const data of ['true', 1, 'sim', {}, [true]]) {
    assert.equal(await authorize(raw, { rpc: async () => ({ data, error: null }) }, 'c', 'u'), null, `data=${JSON.stringify(data)} não autoriza`);
  }
  for (const tipo of [' financeiro', 'financeiro\t', ' financeiro ']) {
    assert.equal(await authorize({ ...raw, tipo }, { rpc: async () => ({ data: false, error: null }) }, 'c', 'u'), null, `tipo ${JSON.stringify(tipo)} passa pela conferência`);
  }
  for (const tipo of ['FINANCEIRO', 'financeirо', 'finan​ceiro']) {
    let called = false;
    assert.equal(await authorize({ ...raw, tipo }, { rpc: async () => { called = true; return { data: true, error: null }; } }, 'c', 'u'), null, `tipo ${JSON.stringify(tipo)} não vira financeiro`);
    assert.equal(called, false);
  }
});

// ============================================================
// ACUP-018 (FIN-5 + FIN-7): contrato financeiro v2. Paciente sai do
// aparelho só como primeiro nome + idade; recortes por_area e por_paciente
// pelas mesmas contas do Financeiro. Dados 100% fictícios.
// ============================================================
const team = [
  { id: 'den', full_name: 'Dênis Prof Teste', is_active: true, has_agenda: true },
  { id: 'nut', full_name: 'Nara Nutri Teste', is_active: true, has_agenda: true },
];
const people = [
  { id: 'l1', name: 'Lucas Alfa Fictício', birth_date: '2019-03-10', cpf: 'SEGREDO', phone: 'SEGREDO', observacoes: 'SEGREDO' },
  { id: 'l2', name: 'Lucas Beta Fictício', birth_date: '2020-07-20', cpf: 'SEGREDO' },
  { id: 'l3', name: 'Lucas Gama Fictício', birth_date: '2015-01-05' },
  { id: 'v1', name: 'Vitória Delta Fictícia', birth_date: '2017-05-05' },
  { id: 'm1', name: 'Mateus Épsilon Fictício', birth_date: null },
];
const SURNAMES = /Alfa|Beta|Gama|Delta|Épsilon|Fictíci|SEGREDO|2019-03-10|2020-07-20|2015-01-05|2017-05-05|birth|nascimento|cpf/i;
const charge = (id, patient, pro, discipline, day, price, extra = {}) => ({ id, patient_id: patient, professional_id: pro, discipline, source: 'appointment', service_on: day, price_cents: price, ...extra });
const caseMoney = () => ({
  charges: [
    // Avulso: Lucas (7) com Dênis, Psicologia, 3 sessões, 2 pagas.
    charge('a1', 'l1', 'den', 'psicologia', '2026-10-05', 15000),
    charge('a2', 'l1', 'den', 'psicologia', '2026-10-12', 15000),
    charge('a3', 'l1', 'den', 'psicologia', '2026-10-19', 15000),
    // Avulso em dia: Vitória com Nara, Nutrição, 2 pagas.
    charge('v1a', 'v1', 'nut', 'nutricao', '2026-10-06', 20000),
    charge('v1b', 'v1', 'nut', 'nutricao', '2026-10-20', 20000),
    // Convênio: Mateus com Dênis, sem lote ainda (da operadora, nunca do paciente).
    charge('cv1', 'm1', 'den', 'psicologia', '2026-10-08', 9000, { payer: 'convenio', convenio_id: 'op' }),
    // Pacote por sessão (10 previstas): sessões 1-2 em setembro, 3-4 em outubro.
    charge('ps1', 'l3', 'den', 'psicologia', '2026-09-10', 10000, { package_id: 'pks', session_number: 1 }),
    charge('ps2', 'l3', 'den', 'psicologia', '2026-09-17', 10000, { package_id: 'pks', session_number: 2 }),
    charge('ps3', 'l3', 'den', 'psicologia', '2026-10-01', 10000, { package_id: 'pks', session_number: 3 }),
    charge('ps4', 'l3', 'den', 'psicologia', '2026-10-08', 10000, { package_id: 'pks', session_number: 4 }),
    // Pacote parcelado (3 parcelas): Lucas (6) com Nara, Nutrição, 2 sessões em outubro.
    charge('pp1', 'l2', 'nut', 'nutricao', '2026-10-03', 5000, { package_id: 'pkp', session_number: 1 }),
    charge('pp2', 'l2', 'nut', 'nutricao', '2026-10-17', 5000, { package_id: 'pkp', session_number: 2 }),
  ],
  packages: [
    { id: 'pks', patient_id: 'l3', professional_id: 'den', discipline: 'psicologia', payment_plan: 'per_session', sessions_planned: 10, total_cents: 100000, discount_cents: 0, status: 'active', name: 'Pacote fictício' },
    { id: 'pkp', patient_id: 'l2', professional_id: 'nut', discipline: 'nutricao', payment_plan: 'installments', installments: 3, sessions_planned: 8, total_cents: 30000, discount_cents: 0, status: 'active', name: 'Pacote fictício 2' },
  ],
  installments: [
    { id: 'i1', package_id: 'pkp', number: 1, due_on: '2026-09-10', amount_cents: 10000 },
    { id: 'i2', package_id: 'pkp', number: 2, due_on: '2026-10-10', amount_cents: 10000 },
    { id: 'i3', package_id: 'pkp', number: 3, due_on: '2026-11-10', amount_cents: 10000 },
  ],
  receipts: [
    { id: 'r1', charge_id: 'a1', patient_id: 'l1', received_on: '2026-10-05', amount_cents: 15000, method: 'pix' },
    { id: 'r2', charge_id: 'a2', patient_id: 'l1', received_on: '2026-10-12', amount_cents: 15000, method: 'pix' },
    { id: 'r3', charge_id: 'v1a', patient_id: 'v1', received_on: '2026-10-06', amount_cents: 20000, method: 'cartao' },
    { id: 'r4', charge_id: 'v1b', patient_id: 'v1', received_on: '2026-10-20', amount_cents: 20000, method: 'cartao' },
    // Pacote por sessão: 30000 cobre as sessões 1, 2 e 3.
    { id: 'r5', package_id: 'pks', patient_id: 'l3', received_on: '2026-10-02', amount_cents: 30000, method: 'pix' },
    // Parcelado: só a 1ª parcela paga.
    { id: 'r6', package_id: 'pkp', patient_id: 'l2', received_on: '2026-09-10', amount_cents: 10000, method: 'pix' },
    // Anulado não conta em lugar nenhum.
    { id: 'r7', charge_id: 'a3', patient_id: 'l1', received_on: '2026-10-19', amount_cents: 15000, method: 'pix', voided_at: '2026-10-20' },
  ],
  tissPaid: [], tissStatus: [], tissReady: true,
});
const october = { ...query, de: '2026-10-01', ate: '2026-10-31' };
const caseRun = (q, now = new Date('2026-11-01T12:00:00Z')) => tools.runAssistantConsulta({ ...october, ...q }, { profile: admin, now });
const resetCase = () => { globalThis.__acupFinanceTest = state; reset(); state.money = caseMoney(); state.patients = people; state.members = team; };
const keysDeep = value => (Array.isArray(value) ? value.flatMap(keysDeep)
  : value && typeof value === 'object' ? Object.entries(value).flatMap(([key, inner]) => [key, ...keysDeep(inner)]) : []);

test('ACUP-018 espelho: recortes, chaves, áreas e limites iguais no aparelho e na Edge', async () => {
  for (const key of ['FINANCE_FILTERS', 'FINANCE_FORMS', 'FINANCE_SITUATIONS', 'FINANCE_AREAS', 'FINANCE_KEYS', 'FINANCE_ARCHIVED', 'FINANCE_MAX_AGE', 'FINANCE_CRITERIA', 'FINANCE_REASONS']) {
    assert.deepEqual(edge[key], front[key], key);
  }
  const { DISCIPLINES } = await import('../../src/data/disciplines.js');
  assert.deepEqual(front.FINANCE_AREAS, [...DISCIPLINES.map(item => item.label), 'Sem área'], 'áreas = rótulos das disciplinas');
  assert.match(edgeSource, /status: \{ type: 'STRING', enum: FINANCE_FILTERS/);
  assert.match(edgeSource, /idade: \{ type: 'INTEGER', nullable: true/);
});

test('FIN-5 idade no fuso da clínica: aniversário hoje, amanhã, 29/02, sem data e data impossível', async () => {
  assert.equal(front.ageOn('2019-11-01', '2026-11-01'), 7, 'aniversário hoje já conta');
  assert.equal(front.ageOn('2019-11-02', '2026-11-01'), 6, 'aniversário amanhã ainda não');
  assert.equal(front.ageOn('2016-02-29', '2025-02-28'), 8);
  assert.equal(front.ageOn('2016-02-29', '2025-03-01'), 9, '29/02 completa ano em 01/03 no ano comum');
  assert.equal(front.ageOn('2016-02-29', '2028-02-29'), 12);
  for (const birth of [null, undefined, '', '2019-02-30', '2030-01-01', '1800-01-01', 20190101]) assert.equal(front.ageOn(birth, '2026-11-01'), null, String(birth));
  assert.equal(front.firstNameOf('  Maria Clara Fictícia '), 'Maria');
  // 02/11 02:00 UTC ainda é 01/11 em São Paulo: quem nasceu em 02/11 ainda não fez aniversário.
  resetCase();
  state.patients = [{ id: 'l1', name: 'Lucas Alfa Fictício', birth_date: '2019-11-02' }];
  const late = await caseRun({ status: 'a_receber', profissional: 'equipe' }, new Date('2026-11-02T02:00:00Z'));
  assert.equal(late.linhas.find(line => line.paciente === 'Lucas').idade, 6);
  const next = await caseRun({ status: 'a_receber', profissional: 'equipe' }, new Date('2026-11-02T04:00:00Z'));
  assert.equal(next.linhas.find(line => line.paciente === 'Lucas').idade, 7);
});

test('FIN-5 aparelho: só primeiro nome e idade saem; nunca sobrenome, nascimento, CPF ou contato (todos os recortes)', async () => {
  for (const status of ['recebidos', 'a_receber', 'atrasados', 'por_area', 'por_paciente']) {
    resetCase();
    const result = await caseRun({ status });
    assert.equal(result.motivo, null, status);
    assert.ok(result.linhas.length > 0, status);
    assert.doesNotMatch(JSON.stringify(result), SURNAMES, `${status}: nada além do primeiro nome e da idade`);
    const allowed = new Set([...Object.keys(result), ...Object.values(front.FINANCE_KEYS).flat()]);
    for (const key of keysDeep(result)) assert.ok(allowed.has(key), `${status}: chave fora da lista fechada: ${key}`);
    const lineKeys = status === 'por_area' ? front.FINANCE_KEYS.area : status === 'por_paciente' ? front.FINANCE_KEYS.paciente : front.FINANCE_KEYS.linha;
    for (const line of result.linhas) assert.deepEqual(Object.keys(line).sort(), [...lineKeys].sort(), status);
    if (status === 'por_area') assert.deepEqual(Object.keys(result.totais).sort(), [...front.FINANCE_KEYS.totais].sort());
    else assert.equal(result.totais, null);
    for (const line of result.linhas) if ('paciente' in line) assert.match(line.paciente, /^\S+$/u, 'uma palavra só');
  }
  resetCase();
  const open = await caseRun({ status: 'a_receber' });
  const lucas = open.linhas.find(line => line.paciente === 'Lucas' && line.area === 'Psicologia' && line.idade === 7);
  assert.ok(lucas, 'Lucas, 7 anos (avulso de Psicologia)');
  const mateus = (await caseRun({ status: 'por_paciente' })).linhas.find(line => line.paciente === 'Mateus');
  assert.equal(mateus.idade, null, 'sem data de nascimento: só o primeiro nome, sem idade inventada');
});

test('FIN-7 contrato antigo falha: nome completo, linha v1 ou idade fora do lugar nunca chegam ao modelo', () => {
  const v2 = { ...query, linhas: [row] };
  for (const parse of [front.readFinanceResult, edge.readFinanceResult]) {
    assert.equal(parse(v2).motivo, null);
    const forged = [
      { ...row, paciente: 'Lúcia Sobrenome Fictícia' },
      { paciente: 'Lúcia Sobrenome Fictícia', profissional: 'Profissional fictício', valor_centavos: 12345, vencimento: '2026-10-15', pagamento: null, status: 'a_receber' },
      { ...row, idade: 200 }, { ...row, idade: '7' }, { ...row, idade: 7.5 }, { ...row, homonimo: 'nao' },
      { ...row, area: 'Área inventada' }, { ...row, paciente: 'Paciente arquivado', idade: 7 },
    ];
    for (const line of forged) {
      const result = parse({ ...query, linhas: [row, line] });
      assert.equal(result.motivo, 'erro', JSON.stringify(line));
      assert.deepEqual(result.linhas, []);
      assert.doesNotMatch(JSON.stringify(result), /Sobrenome|Inventada|200/);
    }
    assert.equal(parse({ ...query, linhas: [{ ...row, paciente: 'Paciente arquivado', idade: null }] }).motivo, null, 'rótulo fixo de arquivado passa sem idade');
    const nested = parse({ ...query, linhas: [{ ...row, extra: { birth_date: '2019-03-10', cpf: 'SEGREDO' } }], extra: { telefone: 'SEGREDO' } });
    assert.doesNotMatch(JSON.stringify(nested), /SEGREDO|2019-03-10|birth|cpf|telefone|extra/, 'objeto aninhado não atravessa');
    for (const status of ['por_paciente', 'por_area']) {
      const fake = status === 'por_area'
        ? { area: 'Psicologia', paciente_centavos: 1, operadora_centavos: 2, total_centavos: 3, detalhe: { paciente: 'Lúcia Sobrenome' } }
        : { ...row, paciente: 'Lúcia Sobrenome', forma: 'avulso', sessoes_feitas: 1, sessoes_pagas: 0, sessoes_sem_valor: 0, sessao_atual: null, sessoes_previstas: null, parcelas_pagas: null, parcelas_em_aberto: null, em_aberto_centavos: 1, situacao: 'em_aberto' };
      assert.doesNotMatch(JSON.stringify(parse({ ...query, status, linhas: [fake] })), /Sobrenome/, status);
    }
  }
});

test('FIN-7 pedido com nome completo é recusado antes das fontes e não é devolvido', async () => {
  for (const parse of [front.readFinanceConsulta, edge.readFinanceConsulta]) {
    const request = parse({ ...october, status: 'por_paciente', paciente: 'Lucas Alfa' });
    assert.equal(request.status, '');
    assert.equal(request.paciente, '');
    assert.equal(parse({ ...october, status: 'a_receber', idade: 'sete' }).status, '');
    assert.equal(parse({ ...october, status: 'a_receber', idade: 7 }).idade, 7);
  }
  assert.deepEqual(edge.readConsulta({ ...october, status: 'por_paciente', paciente: 'Lucas Alfa' }), front.readFinanceConsulta({ ...october, status: 'por_paciente', paciente: 'Lucas Alfa' }));
  resetCase();
  const refused = await caseRun({ status: 'por_paciente', paciente: 'Lucas Alfa' });
  assert.equal(refused.motivo, 'filtro_invalido');
  assert.deepEqual(state.reads, ['can_manage_finance']);
  assert.doesNotMatch(JSON.stringify(refused), /Alfa/);
});

test('FIN-5 homônimos: desempate só por idade e profissional; empate total vira homonimo', async () => {
  resetCase();
  const all = await caseRun({ status: 'por_paciente', paciente: 'Lucas' });
  assert.deepEqual(all.linhas.map(line => [line.idade, line.area]).sort(), [[11, 'Psicologia'], [6, 'Nutrição'], [7, 'Psicologia']].sort());
  assert.ok(all.linhas.every(line => line.homonimo === false), 'idades diferentes já separam');
  assert.deepEqual((await caseRun({ status: 'por_paciente', paciente: 'lucas', idade: 6 })).linhas.map(line => line.area), ['Nutrição']);
  assert.equal((await caseRun({ status: 'por_paciente', paciente: 'Lucas', idade: 40 })).motivo, 'nao_encontrado');
  // Dois Lucas de 7 anos com o mesmo profissional: só "dois pacientes com o mesmo nome".
  state.patients = [...people, { id: 'l4', name: 'Lucas Zeta Fictício', birth_date: '2019-01-01' }];
  state.money.charges.push(charge('z1', 'l4', 'den', 'psicologia', '2026-10-09', 15000));
  const twins = (await caseRun({ status: 'a_receber', paciente: 'Lucas', idade: 7 })).linhas;
  assert.equal(new Set(twins.map(line => line.paciente + line.idade + line.profissional)).size, 1);
  assert.ok(twins.length === 2 && twins.every(line => line.homonimo === true));
  assert.doesNotMatch(JSON.stringify(twins), /Alfa|Zeta/);
});

test('FIN-7 contagem por forma: avulso, pacote por sessão, pacote parcelado, convênio e em dia', async () => {
  resetCase();
  const result = await caseRun({ status: 'por_paciente' });
  const pick = (paciente, idade, forma) => result.linhas.find(line => line.paciente === paciente && line.idade === idade && line.forma === forma);
  assert.equal(result.criterio, front.FINANCE_CRITERIA.paciente);
  // Avulso: 3 feitas, 2 pagas (o recebimento anulado não conta), 1 vencida.
  assert.deepEqual(pick('Lucas', 7, 'avulso'), { paciente: 'Lucas', idade: 7, homonimo: false, area: 'Psicologia', profissional: serviceNames.shortName('Dênis Prof Teste'),
    forma: 'avulso', sessoes_feitas: 3, sessoes_pagas: 2, sessoes_sem_valor: 0, sessao_atual: null, sessoes_previstas: null,
    parcelas_pagas: null, parcelas_em_aberto: null, em_aberto_centavos: 15000, situacao: 'atrasado' });
  // Em dia: "pagou as 2 sessões de Nutrição, não deve nada".
  const vitoria = pick('Vitória', 9, 'avulso');
  assert.equal(vitoria.situacao, 'em_dia'); assert.equal(vitoria.sessoes_pagas, 2); assert.equal(vitoria.em_aberto_centavos, 0);
  // Pacote por sessão: no período as sessões 3 e 4; o pagamento cobre até a 3; "sessão 4 de 10".
  const perSession = pick('Lucas', 11, 'pacote_por_sessao');
  assert.equal(perSession.sessoes_feitas, 2); assert.equal(perSession.sessoes_pagas, 1);
  assert.equal(perSession.sessao_atual, 4); assert.equal(perSession.sessoes_previstas, 10); assert.equal(perSession.em_aberto_centavos, 10000);
  // Parcelado: a dívida está nas parcelas (1 paga, 1 em aberto até 31/10; a de novembro não entra); sessão nunca vira "paga".
  const installments = pick('Lucas', 6, 'pacote_parcelas');
  assert.equal(installments.sessoes_feitas, null); assert.equal(installments.sessoes_pagas, null);
  assert.equal(installments.parcelas_pagas, 1); assert.equal(installments.parcelas_em_aberto, 1);
  assert.equal(installments.sessao_atual, 2); assert.equal(installments.sessoes_previstas, 8);
  assert.equal(installments.em_aberto_centavos, 10000); assert.equal(installments.situacao, 'atrasado');
  // Convênio: quem deve é a operadora; quando ela paga, fica em dia.
  const convenio = pick('Mateus', null, 'convenio');
  assert.equal(convenio.situacao, 'da_operadora'); assert.equal(convenio.em_aberto_centavos, 9000);
  state.money.tissPaid = [{ lancamento: 'lan', cobranca: 'cv1', pagamento: 'pg', operadora: 'op', pago_em: '2026-10-28', valor_centavos: 9000, forma: 'pix' }];
  assert.equal((await caseRun({ status: 'por_paciente', paciente: 'Mateus' })).linhas[0].situacao, 'em_dia');
  // Sessão sem valor na tabela: nem paga nem devida.
  state.money.charges.push(charge('sv', 'v1', 'nut', 'nutricao', '2026-10-27', null));
  const noPrice = (await caseRun({ status: 'por_paciente', paciente: 'Vitória' })).linhas[0];
  assert.equal(noPrice.sessoes_feitas, 3); assert.equal(noPrice.sessoes_sem_valor, 1); assert.equal(noPrice.situacao, 'em_dia');
});

test('FIN-7 totais batem com a tela: recebido por área e em aberto igual ao A receber', async () => {
  resetCase();
  state.money.tissPaid = [{ lancamento: 'lan', cobranca: 'cv1', pagamento: 'pg', operadora: 'op', pago_em: '2026-10-28', valor_centavos: 9000, forma: 'pix' }];
  const byArea = await caseRun({ status: 'por_area' });
  // Recebidos da tela: recebimentos não anulados do período (a tela soma por forma de pagamento) + depósitos da operadora.
  const screenPatient = state.money.receipts.filter(row => !row.voided_at && row.received_on >= '2026-10-01' && row.received_on <= '2026-10-31')
    .reduce((sum, row) => sum + row.amount_cents, 0);
  const screenOperator = state.money.tissPaid.reduce((sum, row) => sum + row.valor_centavos, 0);
  assert.deepEqual(byArea.totais, { paciente_centavos: screenPatient, operadora_centavos: screenOperator, total_centavos: screenPatient + screenOperator });
  assert.deepEqual(byArea.linhas, [
    { area: 'Psicologia', paciente_centavos: 60000, operadora_centavos: 9000, total_centavos: 69000 },
    { area: 'Nutrição', paciente_centavos: 40000, operadora_centavos: 0, total_centavos: 40000 },
  ]);
  assert.equal(byArea.criterio, front.FINANCE_CRITERIA.area);
  // A receber: soma do em aberto por paciente = groupReceivablesByPatient da tela (itens até 31/10).
  state.money.tissPaid = [];
  const receipts = [...state.money.receipts, ...tiss.operatorReceiptsFrom(state.money.tissPaid)];
  const items = finance.buildReceivables({ ...state.money, receipts, today: '2026-11-01' }).items.filter(item => item.dueOn <= '2026-10-31');
  const screen = new Map(finance.groupReceivablesByPatient(items).map(group => [group.patientId, group.openCents]));
  const rows = (await caseRun({ status: 'por_paciente' })).linhas;
  const byKey = (paciente, idade) => rows.filter(line => line.paciente === paciente && line.idade === idade).reduce((sum, line) => sum + line.em_aberto_centavos, 0);
  assert.equal(byKey('Lucas', 7), screen.get('l1'));
  assert.equal(byKey('Lucas', 6), screen.get('l2'));
  assert.equal(byKey('Lucas', 11), screen.get('l3'));
  assert.equal(byKey('Mateus', null), screen.get('m1'));
  assert.equal(byKey('Vitória', 9), screen.get('v1') || 0);
});

test('FIN-4 vale para por_paciente e por_area: até 50 linhas (em dia conta) e 93 dias; nunca corta calado', async () => {
  resetCase();
  state.patients = Array.from({ length: 51 }, (_, index) => ({ id: 'x' + index, name: 'Nome' + index + ' Fictício', birth_date: '2010-01-01' }));
  state.money = { ...caseMoney(), packages: [], installments: [], receipts: [],
    charges: Array.from({ length: 51 }, (_, index) => charge('x' + index, 'x' + index, 'den', 'psicologia', '2026-10-10', 0)) };
  const tooMany = await caseRun({ status: 'por_paciente' });
  assert.equal(tooMany.motivo, 'limite_linhas'); assert.deepEqual(tooMany.linhas, []); assert.equal(tooMany.total, null);
  state.money.charges.pop();
  const fifty = await caseRun({ status: 'por_paciente' });
  assert.equal(fifty.total, 50); assert.ok(fifty.linhas.every(line => line.situacao === 'em_dia'), 'linha em dia conta no limite');
  assert.equal((await caseRun({ status: 'por_area', de: '2026-01-01', ate: '2026-04-04' })).motivo, 'limite_periodo');
});

test('Edge: resposta forjada com nome completo não chega ao modelo, mesmo autorizada (FIN-1 + FIN-7)', async () => {
  const forged = { ...query, status: 'por_paciente', linhas: [{ paciente: 'Lucas Alfa Fictício', idade: 7, homonimo: false, area: 'Psicologia', profissional: 'Dênis', forma: 'avulso',
    sessoes_feitas: 1, sessoes_pagas: 0, sessoes_sem_valor: 0, sessao_atual: null, sessoes_previstas: null, parcelas_pagas: null, parcelas_em_aberto: null, em_aberto_centavos: 100, situacao: 'em_aberto' }] };
  const result = await authorize(forged, { rpc: async () => ({ data: true, error: null }) }, 'c', 'u');
  assert.equal(result.motivo, 'erro');
  assert.doesNotMatch(JSON.stringify(result), /Alfa|Fictício/);
  const prompt = edgeSource.slice(edgeSource.indexOf('- Financeiro por_area'), edgeSource.indexOf('- Financeiro por_area') + 2000);
  assert.match(prompt, /nunca diga que uma sessão foi paga/);
  assert.match(prompt, /nunca que o paciente deve/);
  assert.match(prompt, /dois pacientes com o mesmo nome/);
});
