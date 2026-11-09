import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import { createServer } from 'vite';
import * as front from '../../src/utils/clinicAssistant.js';
import * as edge from '../../../supabase/functions/_shared/assistantConsulta.ts';
const query = { tipo: 'financeiro', de: '2026-10-01', ate: '2026-10-31', status: 'a_receber', profissional: 'equipe', paciente: '' };
const row = { paciente: 'Paciente fictício', profissional: 'Profissional fictício', valor_centavos: 12345, vencimento: '2026-10-15', pagamento: null, status: 'a_receber' };
const members = [{ id: 'p', full_name: 'Pessoa Profissional Fictícia', is_active: true, has_agenda: true }];
const patients = [{ id: 'a', name: 'Paciente fictício', cpf: 'SEGREDO', telefone: 'SEGREDO', observacoes: 'SEGREDO' }];
const money = () => ({ charges: [{ id: 'c', patient_id: 'a', professional_id: 'p', source: 'appointment', service_on: '2026-10-15', price_cents: 12345 }], packages: [], installments: [], receipts: [], tissPaid: [], tissStatus: [], tissReady: true });
const root = fileURLToPath(new URL('../..', import.meta.url));
const state = { permission: true, money: money(), reads: [], fail: '' };
globalThis.__acupFinanceTest = state;
after(() => { delete globalThis.__acupFinanceTest; });
const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent', plugins: [{
  name: 'finance-test-isolation', enforce: 'pre', load(id) {
    const clean = id.replaceAll('\\', '/').split('?')[0];
    if (clean.endsWith('/src/lib/supabase.js')) return `export const getAuthenticatedUser=async()=>({id:'admin'}); export const supabase={rpc:async(fn,args)=>{const s=globalThis.__acupFinanceTest;s.reads.push(fn);if(s.fail===fn)throw Error('SEGREDO de fonte');return fn==='can_manage_finance'?{data:s.permission,error:null}:{data:${JSON.stringify(members)},error:null};},from:()=>{throw Error('Rede inesperada')}};`;
    if (clean.endsWith('/src/services/appointmentService.js')) return `export const listAppointments=async()=>[];export const listAppointmentsAwaitingEvolution=async()=>[];export const listPatientsAwaitingReturn=async()=>[];`;
    if (clean.endsWith('/src/services/agendaScheduleService.js')) return `export const listHolidays=async()=>[];export const listProfessionalSchedules=async()=>[];`;
    if (clean.endsWith('/src/services/agendaSettingsService.js')) return `export const loadAgendaSettings=async()=>({settings:{}});`;
    if (clean.endsWith('/src/services/financeiroService.js')) return `export async function loadReceivablesData(){const s=globalThis.__acupFinanceTest;s.reads.push('money');if(s.fail==='money')throw Error('SEGREDO');return s.money;}`;
    if (clean.endsWith('/src/services/clinicPatientsService.js')) return `export async function listClinicPatients(){const s=globalThis.__acupFinanceTest;s.reads.push('patients');if(s.fail==='patients')throw Error('SEGREDO');return ${JSON.stringify(patients)};}`;
  },
}] });
after(() => server.close());
const tools = await server.ssrLoadModule('/src/services/assistantTools.js');
const serviceNames = await server.ssrLoadModule('/src/services/clinicMembersService.js');
const admin = { id: 'admin', clinic_id: 'clinic', role: 'clinic_admin' };
const run = (q = query, profile = admin) => tools.runAssistantConsulta(q, { profile, now: new Date('2026-11-01T12:00:00Z') });
const reset = () => { state.permission = true; state.money = money(); state.reads = []; state.fail = ''; };

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
    assert.deepEqual(Object.keys(result.linhas[0]).sort(), ['paciente','profissional','valor_centavos','vencimento','pagamento','status'].sort());
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
