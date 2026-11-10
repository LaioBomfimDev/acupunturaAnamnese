import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import { createServer } from 'vite';
import * as front from '../../src/utils/clinicAssistant.js';
import * as edge from '../../../supabase/functions/_shared/assistantConsulta.ts';

// ============================================================
// ACUP-025 (AG-2, AG-3, AG-8): agenda COM paciente, só primeiro nome +
// idade, só o que o login vê. Dados 100% fictícios, sem rede.
// ============================================================

const TYPES = ['agenda_pacientes', 'proxima_sessao', 'faltosos', 'aniversariantes'];
const ALLOWED = {
  clinic_admin: TYPES,
  receptionist: TYPES,
  therapist: ['agenda_pacientes', 'proxima_sessao'],
};
const SECRET = /Sobrenome|SEGREDO|pac-|ap-|grp-|tok-|1990-0|2019-0|2016-02-29|2020-0|99999|@exemplo/;
const members = [
  { id: 'den', full_name: 'Dênis Prof Teste', is_active: true, has_agenda: true },
  { id: 'nar', full_name: 'Nara Nutri Teste', is_active: true, has_agenda: true },
];
const now = new Date('2026-11-09T12:00:00');
const at = (day, hour) => new Date(`${day}T${hour}:00`).toISOString();
const ap = (id, patient, pro, discipline, day, hour, status, extra = {}) => ({
  id: 'ap-' + id, clinic_id: 'clinic', patient_id: patient, professional_id: pro, discipline, kind: 'appointment',
  starts_at: at(day, hour), ends_at: at(day, hour.replace(/:\d\d$/, ':50')), status, appointment_type: 'session', modality: 'presencial',
  note: 'SEGREDO nota', cancellation_reason: 'SEGREDO motivo', confirmation_token: 'tok-SEGREDO', ...extra,
});
const patients = () => [
  { id: 'pac-l1', name: 'Lucas Sobrenome Um', birth_date: '2019-03-10', phone: '99999', email: 'x@exemplo', observacoes: 'SEGREDO cadastro', cpf: 'SEGREDO' },
  { id: 'pac-l2', name: 'Lucas Sobrenome Dois', birth_date: '2019-07-20' },
  { id: 'pac-l3', name: 'Lucas Sobrenome Três', birth_date: '2015-01-05' },
  { id: 'pac-v1', name: 'Vitória Sobrenome', birth_date: '2017-11-20' },
  { id: 'pac-b1', name: 'Bia Sobrenome', birth_date: '2016-02-29' },
];
const appointments = () => [
  ap('1', 'pac-l1', 'den', 'psicologia', '2026-11-10', '09:00', 'scheduled'),
  ap('2', 'pac-l2', 'den', 'psicologia', '2026-11-10', '10:00', 'scheduled'),
  ap('3', 'pac-l3', 'nar', 'nutricao', '2026-11-10', '11:00', 'attended'),
  ap('4', 'pac-fora', 'nar', 'nutricao', '2026-11-10', '14:00', 'scheduled'),
  { ...ap('5', null, 'den', 'psicologia', '2026-11-10', '15:00', 'scheduled'), kind: 'block', note: 'SEGREDO bloqueio' },
  ap('f1', 'pac-v1', 'nar', 'nutricao', '2026-11-03', '09:00', 'no_show'),
  ap('f2', 'pac-v1', 'nar', 'nutricao', '2026-11-05', '09:00', 'excused'),
  ap('f3', 'pac-v1', 'nar', 'nutricao', '2026-11-06', '09:00', 'cancelled'),
  ap('f4', 'pac-l3', 'nar', 'nutricao', '2026-11-04', '09:00', 'no_show'),
  // Pacote da Vitória: 1 atendida, 1 cancelada (não conta), a próxima é a sessão 2 de 3.
  ap('p1', 'pac-v1', 'den', 'psicologia', '2026-11-01', '16:00', 'attended', { recurrence_group_id: 'grp-v' }),
  ap('p2', 'pac-v1', 'den', 'psicologia', '2026-11-08', '16:00', 'cancelled', { recurrence_group_id: 'grp-v' }),
  ap('p3', 'pac-v1', 'den', 'psicologia', '2026-11-15', '16:00', 'scheduled', { recurrence_group_id: 'grp-v' }),
  ap('p4', 'pac-v1', 'den', 'psicologia', '2026-11-22', '16:00', 'scheduled', { recurrence_group_id: 'grp-v' }),
];

const root = fileURLToPath(new URL('../..', import.meta.url));
const state = {};
const reset = () => Object.assign(state, { reads: [], fail: '', appointments: appointments(), patients: patients() });
reset();
globalThis.__acupPatientsTest = state;
const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent', plugins: [{
  name: 'patients-test-isolation', enforce: 'pre', load(id) {
    const clean = id.replaceAll('\\', '/').split('?')[0];
    const s = 'const s=globalThis.__acupPatientsTest;';
    const read = name => `s.reads.push('${name}');if(s.fail==='${name}')throw Error('SEGREDO de fonte');`;
    if (clean.endsWith('/src/lib/supabase.js')) return `export const getAuthenticatedUser=async()=>({id:'admin'}); export const supabase={rpc:async(fn)=>{${s}s.reads.push(fn);return{data:${JSON.stringify(members)},error:null};},from:()=>{throw Error('Rede inesperada')}};`;
    if (clean.endsWith('/src/services/appointmentService.js')) return `const inRange=(item,from,to,pro,pat)=>(!from||item.starts_at>=from)&&(!to||item.starts_at<=to)&&(!pro||item.professional_id===pro)&&(!pat||item.patient_id===pat);
      export async function listAppointments({from,to,professionalId,patientId}={}){${s}${read('appointments')}return s.appointments.filter(item=>inRange(item,from,to,professionalId,patientId));}
      export async function listSeriesSessions(group){${s}${read('series')}return s.appointments.filter(item=>item.recurrence_group_id===group);}
      export const listPendingConfirmations=async()=>[];export const listAppointmentsAwaitingEvolution=async()=>[];export const listPatientsAwaitingReturn=async()=>[];`;
    if (clean.endsWith('/src/services/agendaScheduleService.js')) return 'export const listHolidays=async()=>[];export const listProfessionalSchedules=async()=>[];';
    if (clean.endsWith('/src/services/agendaSettingsService.js')) return 'export const loadAgendaSettings=async()=>({settings:{}});';
    if (clean.endsWith('/src/services/financeiroService.js')) return "export async function loadReceivablesData(){throw Error('não usado')}export async function loadTissData(){throw Error('não usado')}export async function loadFiscalData(){throw Error('não usado')}";
    if (clean.endsWith('/src/services/clinicPatientsService.js')) return `export async function listClinicPatients(){${s}${read('patients')}return s.patients;}`;
    if (clean.endsWith('/src/services/satisfactionSurveyService.js')) return 'export async function listSatisfactionSurveys(){return []}';
    if (clean.endsWith('/src/services/patientPortalService.js')) return 'export async function listAssignments(){return []}';
  },
}] });
after(() => { server.close(); delete globalThis.__acupPatientsTest; });
const tools = await server.ssrLoadModule('/src/services/assistantTools.js');
const service = await server.ssrLoadModule('/src/services/clinicAssistantService.js');
const indexSource = await readFile(new URL('../../../supabase/functions/clinic-assistant/index.ts', import.meta.url), 'utf8');
const correctionsSource = await readFile(new URL('../../../supabase/functions/_shared/corrections.ts', import.meta.url), 'utf8');
const helperSource = indexSource.slice(indexSource.indexOf('async function readAuthorizedConsultaResult('), indexSource.indexOf('// Fim FIN-1.'));
const authorize = new Function('readConsultaResult', stripTypeScriptTypes(helperSource) + '; return readAuthorizedConsultaResult;')(edge.readConsultaResult);

const profileOf = role => ({ id: role === 'therapist' ? 'den' : 'admin', clinic_id: 'clinic', role });
const week = { de: '2026-11-09', ate: '2026-11-15' };
const ask = tipo => ({ tipo, profissional: 'equipe', ...(tipo === 'proxima_sessao' ? { paciente: 'Vitória' } : tipo === 'aniversariantes' ? {} : tipo === 'faltosos' ? { de: '2026-11-01', ate: '2026-11-08' } : week) });
const run = (q, role = 'clinic_admin', at = now) => tools.runAssistantConsulta(q, { profile: profileOf(role), team: members, now: at });
const keysDeep = value => (Array.isArray(value) ? value.flatMap(keysDeep)
  : value && typeof value === 'object' ? Object.entries(value).flatMap(([key, inner]) => [key, ...keysDeep(inner)]) : []);

test('AG-8 espelho: tipos, acesso, chaves, critérios e motivos iguais; os da fase 1 seguem 8 e sem paciente', () => {
  for (const key of ['PATIENT_CONSULTAS', 'PATIENT_OUTSIDE', 'PATIENT_NEXT_MAX', 'PATIENT_BIRTHDAY_MAX_DAYS', 'PATIENT_KEYS', 'PATIENT_CRITERIA', 'PATIENT_REASONS', 'ASSISTANT_CONSULTAS', 'AGENDA_ACCESS']) {
    assert.deepEqual(edge[key], front[key], key);
  }
  assert.deepEqual(front.PATIENT_CONSULTAS, TYPES);
  assert.equal(front.AGENDA_CONSULTAS.length, 8, 'a fase 1 não ganhou paciente');
  for (const tipo of front.AGENDA_CONSULTAS) assert.ok(!front.AGENDA_KEYS[tipo].linha.includes('paciente'), tipo);
  for (const tipo of TYPES) assert.deepEqual(front.PATIENT_KEYS[tipo].linha.slice(0, 0), []);
  assert.deepEqual(Object.fromEntries(TYPES.map(tipo => [tipo, front.AGENDA_ACCESS[tipo]])), { agenda_pacientes: 'equipe', proxima_sessao: 'equipe', faltosos: 'admin_recepcao', aniversariantes: 'admin_recepcao' });
  const serverAccess = new Function(`return ${helperSource.match(/const SERVER_ACCESS: Record<string, string> = (\{[\s\S]*?\});/)[1]}`)();
  assert.deepEqual(serverAccess, front.AGENDA_ACCESS);
  // Mesmos firstNameOf/ageOn/FINANCE_FIRST_NAME (sem cópia): a trava é a do financeiro.
  assert.equal(edge.FINANCE_FIRST_NAME.source, front.FINANCE_FIRST_NAME.source);
  assert.equal((front.summarizeBirthdayPeople.toString().match(/firstNameOf/g) || []).length > 0, true);
});

test('AG-8 perfis: os 4 tipos × administração, recepção e profissional, no aparelho (antes das fontes) e no servidor', async () => {
  for (const role of Object.keys(ALLOWED)) {
    for (const tipo of TYPES) {
      reset();
      const result = await run(ask(tipo), role);
      const allowed = ALLOWED[role].includes(tipo);
      assert.equal(result.motivo === 'sem_permissao', !allowed, `${role} ${tipo}: ${result.motivo}`);
      if (!allowed) assert.deepEqual(state.reads, [], `${role} ${tipo}: nenhuma fonte`);
      reset();
      const device = await run(ask(tipo), 'clinic_admin');
      assert.equal(device.motivo, null, tipo);
      const client = { rpc: async () => ({ data: true, error: null }), from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role, clinic_id: 'c' }, error: null }) }) }) }) };
      const server = await authorize(device, client, 'c', 'u');
      const serverAllowed = front.AGENDA_ACCESS[tipo] === 'equipe' || allowed;
      assert.deepEqual(server, serverAllowed ? edge.readPatientResult(device) : null, `servidor ${role} ${tipo}`);
    }
  }
});

test('AG-2 só primeiro nome + idade, só o que o login vê; nenhuma chave fora da lista em nenhum tipo', async () => {
  for (const tipo of TYPES) {
    reset();
    const result = await run(ask(tipo));
    assert.equal(result.motivo, null, tipo);
    assert.doesNotMatch(JSON.stringify(result), SECRET, `${tipo}: nada de sobrenome, nascimento, contato, observação ou id`);
    const allowed = new Set([...Object.keys(result), ...front.PATIENT_KEYS[tipo].linha, ...front.PATIENT_KEYS[tipo].resumo]);
    for (const key of keysDeep(result)) assert.ok(allowed.has(key), `${tipo}: ${key}`);
    for (const line of result.linhas) assert.match(line.paciente, /^(\p{L}+|Paciente fora da sua lista|Paciente arquivado)$/u);
    assert.deepEqual(edge.readConsultaResult(result), result, `${tipo}: a Edge aceita a resposta limpa igual`);
  }
  reset();
  const agenda = await run(ask('agenda_pacientes'));
  assert.deepEqual(agenda.resumo, { agendados: 4, atendidos: 1, faltas: 0, cancelamentos: 0, bloqueios: 1 });
  const outside = agenda.linhas.find(line => line.paciente === front.PATIENT_OUTSIDE);
  assert.ok(outside && outside.idade === null, 'atendimento visível de paciente fora da lista: rótulo fixo, sem idade');
  assert.ok(!agenda.linhas.some(line => line.inicio === '15:00'), 'bloqueio não vira linha nem traz nome');
  // "eu" é o login de quem pergunta.
  const mine = await run({ ...ask('agenda_pacientes'), profissional: 'eu' }, 'therapist');
  assert.ok(mine.linhas.length > 0 && mine.linhas.every(line => line.profissional === 'Dênis Prof T.'));
});

test('AG-2 homônimos: separa por idade e profissional; empate total vira homonimo; mais de 5 = ambiguo', async () => {
  reset();
  const lucas = await run({ ...ask('agenda_pacientes'), paciente: 'Lucas' });
  assert.deepEqual(lucas.linhas.map(line => [line.idade, line.homonimo]), [[7, true], [7, true], [11, false]],
    'dois Lucas de 7 anos com o mesmo profissional; o de 11 se separa');
  assert.doesNotMatch(JSON.stringify(lucas), /Sobrenome/);
  assert.deepEqual((await run({ ...ask('agenda_pacientes'), paciente: 'Lucas', idade: 11 })).linhas.map(line => line.idade), [11]);
  assert.equal((await run({ ...ask('proxima_sessao'), paciente: 'Zé' })).motivo, 'nao_encontrado');
  state.patients = [...patients(), ...Array.from({ length: 6 }, (_, i) => ({ id: 'pac-m' + i, name: `Maria Sobrenome ${i}`, birth_date: '2010-01-01' }))];
  const many = await run({ ...ask('proxima_sessao'), paciente: 'Maria' });
  assert.equal(many.motivo, 'ambiguo');
  assert.match(many.mensagem, /Diga a idade ou o profissional/);
  assert.deepEqual(many.linhas, [], 'nunca os 5 primeiros calado');
});

test('AG-8 próxima sessão pela regra de "Sessões do pacote" (cancelado não conta); sem próxima = total 0', async () => {
  reset();
  const next = await run(ask('proxima_sessao'));
  // ACUP-027: cada linha leva um ref curto e aleatório (a tabela da conversa resolve no aparelho).
  assert.equal(next.linhas.length, 1);
  assert.match(next.linhas[0].ref, /^r[0-9a-z]{3}$/);
  const { ref: _ref, ...nextLine } = next.linhas[0];
  assert.deepEqual([nextLine], [{ paciente: 'Vitória', idade: 8, homonimo: false, dia: '2026-11-15', inicio: '16:00', profissional: 'Dênis Prof T.', area: 'Psicologia', tipo_atendimento: 'Sessão', sessao_numero: 2, sessoes_total: 3 }]);
  assert.ok(state.reads.includes('series'), 'número da sessão pelo pacote do banco (listSeriesSessions)');
  const none = await run({ ...ask('proxima_sessao'), paciente: 'Bia' });
  assert.equal(none.total, 0);
  assert.equal((await run({ tipo: 'proxima_sessao', profissional: 'equipe' })).motivo, 'filtro_invalido', 'paciente obrigatório');
});

test('AG-8 faltosos: não compareceu + cancelado pelo paciente, a partir do mínimo; cancelado pela clínica não conta', async () => {
  reset();
  const result = await run(ask('faltosos'));
  assert.deepEqual(result.linhas, [{ paciente: 'Vitória', idade: 8, homonimo: false, profissional: 'Nara Nutri T.', area: 'Nutrição', nao_compareceu: 1, cancelado_paciente: 1 }]);
  assert.equal((await run({ ...ask('faltosos'), minimo: 1 })).total, 2);
  assert.equal((await run({ ...ask('faltosos'), minimo: 0 })).motivo, 'filtro_invalido');
});

test('AG-8 aniversariantes: idade que vai fazer, sem a data; 29/02 em 28/02 no ano comum (regra da Agenda); até 31 dias', async () => {
  reset();
  const month = await run(ask('aniversariantes'));
  assert.deepEqual([month.de, month.ate], ['2026-11-01', '2026-11-30'], 'sem período = mês atual');
  assert.deepEqual(month.linhas, [{ paciente: 'Vitória', idade: 9, homonimo: false }]);
  assert.ok(!keysDeep(month).some(key => /dia|data|nascimento/.test(key)));
  const leap = await run({ tipo: 'aniversariantes', de: '2027-02-27', ate: '2027-03-01' }, 'receptionist', new Date('2027-02-10T12:00:00'));
  assert.deepEqual(leap.linhas, [{ paciente: 'Bia', idade: 11, homonimo: false }], '29/02 aparece em 28/02 de 2027, com a idade que vai fazer');
  const notYet = await run({ tipo: 'aniversariantes', de: '2027-03-01', ate: '2027-03-05' }, 'receptionist', new Date('2027-02-10T12:00:00'));
  assert.equal(notYet.total, 0, 'e não aparece de novo em 01/03');
  assert.equal((await run({ tipo: 'aniversariantes', de: '2026-11-01', ate: '2026-12-02' })).motivo, 'limite_periodo', 'até 31 dias');
});

test('FIN-7/AG-2 na Edge: nome completo, nome disfarçado, rótulo com idade ou chave a mais derrubam a resposta inteira', async () => {
  reset();
  const good = await run(ask('agenda_pacientes'));
  const forged = [
    { paciente: 'Lucas Sobrenome' }, { paciente: 'Lucas.Sobrenome' }, { paciente: 'Lucas​Sobrenome' }, { paciente: '123.456.789-00' },
    { paciente: front.PATIENT_OUTSIDE, idade: 7 }, { idade: 131 }, { homonimo: 'sim' }, { observacoes: 'SEGREDO' }, { patient_id: 'pac-l1' },
  ];
  for (const change of forged) {
    for (const parse of [edge.readConsultaResult, front.readPatientResult]) {
      const result = parse({ ...good, linhas: [{ ...good.linhas[0], ...change }] });
      assert.equal(result.motivo, 'erro', JSON.stringify(change));
      assert.deepEqual(result.linhas, []);
      assert.doesNotMatch(JSON.stringify(result), SECRET);
    }
  }
  assert.equal(edge.readConsultaResult({ ...good, paciente_completo: 'Lucas Sobrenome' }).motivo, 'erro', 'chave a mais no topo');
  // Pedido com nome completo: recusado antes das fontes e não é devolvido.
  reset();
  const refused = await run({ ...ask('proxima_sessao'), paciente: 'Vitória Sobrenome' });
  assert.equal(refused.motivo, 'filtro_invalido');
  assert.deepEqual(state.reads, []);
  assert.doesNotMatch(JSON.stringify(refused), /Sobrenome/);
  assert.equal(edge.readConsulta({ ...ask('proxima_sessao'), paciente: 'Vitória Sobrenome' }).paciente, '');
});

test('AG-3 Corrigir: resposta com paciente liga o mesmo marcador protegido (só a nota, só da autora, nunca aprovada)', async () => {
  assert.equal(service.PROTECTED_CORRECTION_KEY, 'financeiro');
  assert.match(correctionsSource, /export const PROTECTED_CORRECTION_KEY = 'financeiro';/);
  assert.match(correctionsSource, /dinheiro OU com paciente/);
  assert.match(correctionsSource, /return lesson\.context_snapshot\?\.\[PROTECTED_CORRECTION_KEY\] === true;/);
  const invoke = async () => ({ data: { answer: 'Lucas, 7 anos, às 9h.', links: [] }, error: null });
  for (const tipo of TYPES) {
    const reply = await service.askAssistant({ messages: [{ role: 'user', text: 'quem eu atendo amanhã?' }], dados: { tipo }, invoke });
    assert.equal(reply.financeiro, true, `${tipo} protege o Corrigir`);
    const later = await service.askAssistant({ messages: [{ role: 'user', text: 'e depois?' }], dados: { tipo: 'agenda' }, dadosAnteriores: [{ tipo }], invoke });
    assert.equal(later.financeiro, true, `${tipo} em volta anterior também protege`);
  }
  const plain = await service.askAssistant({ messages: [{ role: 'user', text: 'agenda?' }], dados: { tipo: 'agenda' }, invoke });
  assert.ok(!('financeiro' in plain), 'a fase 1 (sem paciente) não muda');
  assert.match(indexSource, /\|\| \[dados, \.\.\.anteriores\]\.some\(item => PATIENT_CONSULTAS\.includes\(String\(item\?\.tipo\)\)\) \? \{ financeiro: true \} : \{\}\)/);
});

test('AG-8 fonte que falha vira aviso; prompt, ajuda e AGENTS dizem primeiro nome + idade', async () => {
  for (const [tipo, source] of [['agenda_pacientes', 'appointments'], ['proxima_sessao', 'patients'], ['faltosos', 'appointments'], ['aniversariantes', 'patients']]) {
    reset(); state.fail = source;
    const result = await run(ask(tipo));
    assert.equal(result.motivo, 'erro', tipo); assert.equal(result.total, null);
    assert.doesNotMatch(JSON.stringify(result), /SEGREDO/);
  }
  assert.match(indexSource, /Consultas com paciente \(agenda_pacientes, proxima_sessao, faltosos, aniversariantes\)/);
  assert.match(indexSource, /Com homonimo true, diga apenas que há dois pacientes com o mesmo nome/);
  const help = await readFile(new URL('../../src/data/screenHelp.js', import.meta.url), 'utf8');
  assert.match(help, /o paciente aparece só pelo primeiro nome e a idade/);
  const agents = await readFile(new URL('../../../AGENTS.md', import.meta.url), 'utf8');
  assert.match(agents, /Agenda com paciente \(ACUP-025, AG-2\/AG-8\)/);
  assert.match(agents, /clinic-assistant-patients\.test\.mjs/);
  // Abertura do painel (autorizada na 025): não promete o que não existe.
  const panel = await readFile(new URL('../../src/components/assistant/ClinicAssistant.jsx', import.meta.url), 'utf8');
  assert.match(panel, /Nas perguntas de agenda, cito o paciente só pelo primeiro nome e a idade\. Nunca leio prontuário, evolução, escalas ou anamnese\./);
  assert.doesNotMatch(panel, /Ainda não vejo pacientes/);
});

test('QA 09/11/2026: cadastro no limite do serviço (2000) vira erro nos 4 tipos; nunca subconta nem rotula paciente real como "fora da sua lista"', async () => {
  for (const tipo of ['agenda_pacientes', 'proxima_sessao', 'faltosos', 'aniversariantes']) {
    reset();
    state.patients = [...patients(), ...Array.from({ length: 2000 - patients().length }, (_, i) => ({ id: 'cheio-' + i, name: 'Nome' + i, birth_date: '1990-11-20' }))];
    const result = await run(ask(tipo));
    assert.equal(result.motivo, 'erro', tipo);
    assert.equal(result.resumo, null, tipo);
    assert.deepEqual(result.linhas, [], tipo);
  }
  reset();
  assert.notEqual((await run(ask('aniversariantes'))).motivo, 'erro', 'abaixo do limite segue normal');
});
