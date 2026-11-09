import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import { createServer } from 'vite';
import * as front from '../../src/utils/clinicAssistant.js';
import * as edge from '../../../supabase/functions/_shared/assistantConsulta.ts';

// ============================================================
// ACUP-023 (AG-1, AG-5): a assistente consulta a agenda e a operação da
// clínica SEM paciente. Cada consulta segue a regra de perfil da tela de
// origem, no aparelho (antes de qualquer fonte) e na Edge (papel lido no
// servidor). Dados 100% fictícios, sem rede.
// ============================================================

const TYPES = ['agenda', 'faltas', 'confirmacoes_pendentes', 'pacotes_fim', 'aniversarios', 'pesquisas', 'formularios_pendentes', 'convenio'];
const ALLOWED = {
  clinic_admin: TYPES,
  receptionist: ['agenda', 'faltas', 'confirmacoes_pendentes', 'pacotes_fim', 'aniversarios'],
  therapist: ['agenda', 'faltas', 'confirmacoes_pendentes', 'pacotes_fim'],
};
const SECRET = /SEGREDO|pac-|ap-|grp-|tok-|Paciente Fictício|1990-01-0|99999|@exemplo/;
const members = [
  { id: 'den', full_name: 'Dênis Prof Teste', is_active: true, has_agenda: true },
  { id: 'nar', full_name: 'Nara Nutri Teste', is_active: true, has_agenda: true },
];
const now = new Date('2026-11-09T12:00:00');
const at = (day, hour) => new Date(`${day}T${hour}:00`).toISOString();
const ap = (id, pro, discipline, day, hour, status, extra = {}) => ({
  id: 'ap-' + id, clinic_id: 'clinic', patient_id: 'pac-' + id, professional_id: pro, discipline, kind: 'appointment',
  starts_at: at(day, hour), ends_at: at(day, hour.replace(/:\d\d$/, ':50')), status, appointment_type: 'session', modality: 'presencial',
  note: 'SEGREDO nota clínica', cancellation_reason: 'SEGREDO motivo', confirmation_token: 'tok-SEGREDO', confirmed_at: null, ...extra,
});
const appointments = () => [
  ap('1', 'den', 'psicologia', '2026-11-10', '09:00', 'scheduled'),
  ap('2', 'den', 'psicologia', '2026-11-10', '10:00', 'attended', { confirmed_at: '2026-11-09' }),
  ap('3', 'den', 'psicologia', '2026-11-11', '09:00', 'no_show'),
  ap('4', 'nar', 'nutricao', '2026-11-11', '14:00', 'excused', { modality: 'online', appointment_type: 'return' }),
  ap('5', 'nar', 'nutricao', '2026-11-12', '15:00', 'cancelled'),
  { ...ap('6', 'den', 'psicologia', '2026-11-12', '08:00', 'scheduled'), kind: 'block', note: 'SEGREDO bloqueio' },
  // Pacote da Agenda (série grp-a): 10 sessões, a última agendada; outro (grp-b) com 3 restantes.
  ...Array.from({ length: 9 }, (_, i) => ap('a' + i, 'den', 'psicologia', `2026-10-${String(10 + i).padStart(2, '0')}`, '11:00', 'attended', { recurrence_group_id: 'grp-a' })),
  ap('a9', 'den', 'psicologia', '2026-11-13', '11:00', 'scheduled', { recurrence_group_id: 'grp-a' }),
  ...Array.from({ length: 3 }, (_, i) => ap('b' + i, 'nar', 'nutricao', `2026-11-${String(16 + i).padStart(2, '0')}`, '16:00', 'scheduled', { recurrence_group_id: 'grp-b' })),
];
const patients = [
  { id: 'pac-1', name: 'Paciente Fictício Um', birth_date: '1990-11-03', phone: '99999', email: 'x@exemplo' },
  { id: 'pac-2', name: 'Paciente Fictício Dois', birth_date: '1990-01-05' },
];
const surveys = [
  { id: 's1', rating: 5, responded_at: '2026-11-02', comment: 'SEGREDO comentário' },
  { id: 's2', rating: 4, responded_at: '2026-11-03' },
  { id: 's3', rating: null, responded_at: null, expires_at: '2026-12-01' },
];
const assignments = [
  { id: 'f1', status: 'submitted', submitted_at: '2026-11-01', patient_id: 'pac-1' },
  { id: 'f2', status: 'pending', patient_id: 'pac-2' },
  { id: 'f3', status: 'cancelled', patient_id: 'pac-2' },
];
const tiss = () => ({
  guides: [
    { id: 'g1', status: 'open', missing: ['senha'], total_cents: 9000 },
    { id: 'g2', status: 'open', missing: [], total_cents: 8000 },
    { id: 'g3', status: 'batched', batch: { status: 'sent', sent_on: '2026-10-01' }, payment_term_days: 30, total_cents: 7000, settled: { paid_cents: 1000 } },
    { id: 'g4', status: 'glosa', batch: { status: 'sent', sent_on: '2026-10-01' }, payment_term_days: 30, total_cents: 5000 },
  ],
  batches: [{ id: 'b1', status: 'generated' }, { id: 'b2', status: 'sent' }],
  payments: [], settlements: [], appeals: [], glosas: [],
});
const fiscal = () => ({ documents: [
  { id: 'n1', status: 'pending', amount_cents: 12000 },
  { id: 'n2', status: 'issued', needs_cancellation: true, amount_cents: 3000 },
  { id: 'n3', status: 'issued', amount_cents: 9999 },
] });

const root = fileURLToPath(new URL('../..', import.meta.url));
const state = {};
const reset = () => Object.assign(state, {
  reads: [], fail: '', permissions: { can_manage_finance: true, can_manage_patient_portal: true },
  appointments: appointments(), patients, surveys, assignments, tiss: tiss(), fiscal: fiscal(),
});
reset();
globalThis.__acupAgendaTest = state;
const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent', plugins: [{
  name: 'agenda-test-isolation', enforce: 'pre', load(id) {
    const clean = id.replaceAll('\\', '/').split('?')[0];
    const s = 'const s=globalThis.__acupAgendaTest;';
    const read = name => `s.reads.push('${name}');if(s.fail==='${name}')throw Error('SEGREDO de fonte');`;
    if (clean.endsWith('/src/lib/supabase.js')) return `export const getAuthenticatedUser=async()=>({id:'admin'}); export const supabase={rpc:async(fn)=>{${s}s.reads.push(fn);if(s.fail===fn)throw Error('SEGREDO');if(fn in s.permissions)return{data:s.permissions[fn],error:null};return{data:${JSON.stringify(members)},error:null};},from:()=>{throw Error('Rede inesperada')}};`;
    if (clean.endsWith('/src/services/appointmentService.js')) return `const inRange=(item,from,to,pro)=>(!from||item.starts_at>=from)&&(!to||item.starts_at<=to)&&(!pro||item.professional_id===pro);
      export async function listAppointments({from,to,professionalId}={}){${s}${read('appointments')}return s.appointments.filter(item=>inRange(item,from,to,professionalId));}
      export async function listPendingConfirmations({from,to,professionalId}={}){${s}${read('pending')}return s.appointments.filter(item=>item.kind==='appointment'&&item.status==='scheduled'&&!item.confirmed_at&&inRange(item,from,to,professionalId));}
      export const listAppointmentsAwaitingEvolution=async()=>[];export const listPatientsAwaitingReturn=async()=>[];`;
    if (clean.endsWith('/src/services/agendaScheduleService.js')) return 'export const listHolidays=async()=>[];export const listProfessionalSchedules=async()=>[];';
    if (clean.endsWith('/src/services/agendaSettingsService.js')) return 'export const loadAgendaSettings=async()=>({settings:{}});';
    if (clean.endsWith('/src/services/financeiroService.js')) return `export async function loadReceivablesData(){throw Error('não usado')}
      export async function loadTissData(){${s}${read('tiss')}return s.tiss;}
      export async function loadFiscalData(){${s}${read('fiscal')}return s.fiscal;}`;
    if (clean.endsWith('/src/services/clinicPatientsService.js')) return `export async function listClinicPatients(){${s}${read('patients')}return s.patients;}`;
    if (clean.endsWith('/src/services/satisfactionSurveyService.js')) return `export async function listSatisfactionSurveys(){${s}${read('surveys')}return s.surveys;}`;
    if (clean.endsWith('/src/services/patientPortalService.js')) return `export async function listAssignments(){${s}${read('assignments')}return s.assignments;}`;
  },
}] });
after(() => { server.close(); delete globalThis.__acupAgendaTest; });
const tools = await server.ssrLoadModule('/src/services/assistantTools.js');
const gestao = await server.ssrLoadModule('/src/utils/gestaoSummary.js');
const dashboard = await server.ssrLoadModule('/src/utils/gestaoDashboard.js');
const forms = await server.ssrLoadModule('/src/utils/patientForms.js');
const tissXml = await server.ssrLoadModule('/src/utils/tissXml.js');
const fiscalUtils = await server.ssrLoadModule('/src/utils/fiscal.js');
const agendaUtils = await server.ssrLoadModule('/src/utils/agenda.js');
const types = await server.ssrLoadModule('/src/utils/appointmentTypes.js');
const edgeSource = await readFile(new URL('../../../supabase/functions/clinic-assistant/index.ts', import.meta.url), 'utf8');
const helperSource = edgeSource.slice(edgeSource.indexOf('async function readAuthorizedConsultaResult('), edgeSource.indexOf('// Fim FIN-1.'));
const authorize = new Function('readConsultaResult', stripTypeScriptTypes(helperSource) + '; return readAuthorizedConsultaResult;')(edge.readConsultaResult);

const profileOf = role => ({ id: role === 'therapist' ? 'den' : 'admin', clinic_id: 'clinic', role });
const week = { de: '2026-11-09', ate: '2026-11-15' };
const ask = tipo => ({ tipo, profissional: 'equipe', ...(['agenda', 'faltas', 'confirmacoes_pendentes', 'pesquisas'].includes(tipo) ? week : {}) });
const run = (q, role = 'clinic_admin') => tools.runAssistantConsulta(q, { profile: profileOf(role), team: members, now });
const keysDeep = value => (Array.isArray(value) ? value.flatMap(keysDeep)
  : value && typeof value === 'object' ? Object.entries(value).flatMap(([key, inner]) => [key, ...keysDeep(inner)]) : []);

test('ACUP-023 espelho: tipos, acesso, chaves, rótulos, critérios e motivos iguais no aparelho e na Edge', () => {
  for (const key of ['ASSISTANT_CONSULTAS', 'AGENDA_CONSULTAS', 'AGENDA_ACCESS', 'AGENDA_PERIOD_REQUIRED', 'AGENDA_PERIOD_OPTIONAL', 'AGENDA_KEYS',
    'AGENDA_STATUS_LABELS', 'AGENDA_TYPE_LABELS', 'AGENDA_MODALITIES', 'AGENDA_CRITERIA', 'AGENDA_REASONS']) {
    assert.deepEqual(edge[key], front[key], key);
  }
  assert.deepEqual(front.AGENDA_CONSULTAS, TYPES);
  assert.deepEqual(front.AGENDA_STATUS_LABELS, [...new Set(agendaUtils.APPOINTMENT_STATUSES.map(item => item.label))]);
  const labels = new Set([...types.APPOINTMENT_TYPES.map(item => item.label), ...Object.values(types.SERVICES_BY_AREA).flat().map(item => item.label), 'Sem tipo']);
  assert.deepEqual(new Set(front.AGENDA_TYPE_LABELS), labels);
  // A tabela de acesso do servidor é a mesma do aparelho.
  const serverAccess = new Function(`return ${helperSource.match(/const SERVER_ACCESS: Record<string, string> = (\{[\s\S]*?\});/)[1]}`)();
  assert.deepEqual(serverAccess, front.AGENDA_ACCESS);
  assert.equal(front.PACKAGE_NEAR_END_MAX, 1);
  for (const raw of [ask('agenda'), { tipo: 'agenda' }, { tipo: 'agenda', de: '2026-01-01', ate: '2026-04-04' }, { tipo: 'convenio', de: 'x' }, { tipo: 'pacotes_fim', profissional: 7 }]) {
    assert.deepEqual(edge.readConsulta(raw), front.readAgendaConsulta(raw));
    assert.equal(edge.agendaConsultaIssue(raw), front.agendaConsultaIssue(raw));
  }
});

test('AG-5 perfis no aparelho: quem não vê a tela de origem recebe "sem permissão" antes de qualquer fonte', async () => {
  for (const role of Object.keys(ALLOWED)) {
    for (const tipo of TYPES) {
      reset();
      const result = await run(ask(tipo), role);
      const allowed = ALLOWED[role].includes(tipo);
      assert.equal(result.motivo === 'sem_permissao', !allowed, `${role} ${tipo}: ${result.motivo}`);
      if (!allowed) {
        assert.equal(result.total, null);
        assert.deepEqual(state.reads.filter(read => !read.startsWith('can_manage')), [], `${role} ${tipo}: nenhuma fonte antes da permissão`);
      } else {
        assert.equal(result.motivo, null, `${role} ${tipo}`);
      }
    }
  }
  // Administração sem a permissão do banco também para antes da fonte.
  for (const [tipo, rpc] of [['convenio', 'can_manage_finance'], ['formularios_pendentes', 'can_manage_patient_portal']]) {
    reset(); state.permissions[rpc] = false;
    assert.equal((await run(ask(tipo))).motivo, 'sem_permissao');
    assert.deepEqual(state.reads, [rpc]);
  }
});

test('AG-5 perfis no servidor: papel lido do perfil autenticado; sem permissão, os dados são descartados', async () => {
  for (const role of [...Object.keys(ALLOWED), 'super_admin', null]) {
    for (const tipo of TYPES) {
      reset();
      const device = await run(ask(tipo), 'clinic_admin');
      assert.equal(device.motivo, null, tipo);
      const calls = [];
      const client = {
        rpc: async (fn, args) => { calls.push({ fn, args }); return { data: role === 'clinic_admin', error: null }; },
        from: table => ({ select: () => ({ eq: (column, value) => ({ maybeSingle: async () => {
          calls.push({ table, column, value });
          return { data: role ? { role, clinic_id: 'clinica-autenticada' } : null, error: null };
        } }) }) }),
      };
      const forged = { ...device, role: 'clinic_admin', clinic_id: 'forjada' };
      delete forged.role; delete forged.clinic_id;
      const result = await authorize(device, client, 'clinica-autenticada', 'usuario-autenticado');
      // Consultas da equipe (Agenda) não releem o papel: só chega aqui quem passou pela barreira
      // da rota (papel da clínica + clínica), conferida logo abaixo.
      const allowed = front.AGENDA_ACCESS[tipo] === 'equipe' || (role !== null && (ALLOWED[role] || []).includes(tipo));
      assert.deepEqual(result, allowed ? edge.readAgendaResult(device) : null, `${role} ${tipo}`);
      for (const call of calls) {
        if (call.fn) assert.deepEqual(call.args, { p_clinic: 'clinica-autenticada', p_user: 'usuario-autenticado' });
        else assert.deepEqual([call.table, call.column, call.value], ['profiles', 'id', 'usuario-autenticado']);
      }
      assert.ok(!JSON.stringify(calls).includes('forjad'));
    }
  }
  // A barreira da rota: sem papel de clínica (SuperAdm, papel desconhecido) ou sem clínica, nem chega ao helper.
  assert.match(edgeSource, /const role = roleOf\(caller\.profile\.role\);\r?\n\s*const clinicId = caller\.profile\.clinic_id;\r?\n\s*if \(!role \|\| !clinicId\) \{/);
  assert.match(edgeSource, /if \(role === 'super_admin'\) return null;/);
  // Perfil de outra clínica ou erro na leitura: descarta.
  const pesquisas = await run(ask('pesquisas'));
  const otherClinic = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: 'clinic_admin', clinic_id: 'outra' }, error: null }) }) }) }) };
  assert.equal(await authorize(pesquisas, otherClinic, 'clinica-autenticada', 'u'), null);
  const broken = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => { throw Error('SEGREDO'); } }) }) }) };
  assert.equal(await authorize(pesquisas, broken, 'clinica-autenticada', 'u'), null);
});

test('AG-5 sem paciente e sem id: só as chaves fechadas de cada consulta saem do aparelho', async () => {
  for (const tipo of TYPES) {
    reset();
    const result = await run(ask(tipo));
    assert.equal(result.motivo, null, tipo);
    assert.doesNotMatch(JSON.stringify(result), SECRET, `${tipo}: nada do paciente nem id`);
    const allowed = new Set([...Object.keys(result), ...front.AGENDA_KEYS[tipo].linha, ...front.AGENDA_KEYS[tipo].resumo]);
    for (const key of keysDeep(result)) assert.ok(allowed.has(key), `${tipo}: chave fora da lista: ${key}`);
    for (const line of result.linhas) assert.deepEqual(Object.keys(line).sort(), [...front.AGENDA_KEYS[tipo].linha].sort());
    assert.deepEqual(Object.keys(result.resumo).sort(), [...front.AGENDA_KEYS[tipo].resumo].sort());
  }
});

test('AG-5 Edge: resposta de cada tipo com uma chave a mais (paciente, id, token, note) é recusada inteira', async () => {
  for (const tipo of TYPES) {
    reset();
    const good = await run(ask(tipo));
    assert.deepEqual(edge.readConsultaResult(good), good, `${tipo}: a resposta limpa passa igual`);
    const extras = { paciente: 'Paciente Fictício', id: 'ap-SEGREDO', token: 'tok-SEGREDO', note: 'SEGREDO' };
    for (const [key, value] of Object.entries(extras)) {
      const forgedResumo = { ...good, resumo: { ...good.resumo, [key]: value } };
      const forgedTop = { ...good, [key]: value };
      const forgedLine = good.linhas.length ? { ...good, linhas: [{ ...good.linhas[0], [key]: value }, ...good.linhas.slice(1)] } : null;
      for (const forged of [forgedResumo, forgedTop, forgedLine].filter(Boolean)) {
        for (const parse of [edge.readConsultaResult, front.readAgendaResult]) {
          const result = parse(forged);
          assert.equal(result.motivo, 'erro', `${tipo} + ${key}`);
          assert.deepEqual(result.linhas, []);
          assert.doesNotMatch(JSON.stringify(result), SECRET);
        }
      }
    }
  }
  // Valores fora da lista também derrubam: tipo, status, área, modalidade, hora e número.
  reset();
  const agenda = await run(ask('agenda'));
  for (const change of [{ tipo_atendimento: 'Paciente Fictício' }, { status: 'Confirmado por SEGREDO' }, { area: 'X' }, { modalidade: 'casa' }, { inicio: '9h' }, { dia: '2026-02-30' }]) {
    assert.equal(edge.readConsultaResult({ ...agenda, linhas: [{ ...agenda.linhas[0], ...change }] }).motivo, 'erro', JSON.stringify(change));
  }
  assert.equal(edge.readConsultaResult({ ...agenda, resumo: { ...agenda.resumo, faltas: -1 } }).motivo, 'erro');
});

test('AG-5 números batem com as telas de origem no mesmo caso fictício', async () => {
  reset();
  const agenda = await run(ask('agenda'));
  const inWeek = state.appointments.filter(item => item.starts_at >= at('2026-11-09', '00:00') && item.starts_at <= new Date('2026-11-15T23:59:59.999').toISOString());
  assert.deepEqual(agenda.resumo, { agendados: 2, atendidos: 1, faltas: 1, cancelamentos: 2, bloqueios: 1 });
  assert.equal(agenda.total, inWeek.filter(item => item.kind !== 'block').length);
  assert.deepEqual(agenda.linhas[0], { dia: '2026-11-10', inicio: '09:00', fim: '09:50', profissional: 'Dênis Prof T.', area: 'Psicologia', tipo_atendimento: 'Sessão', modalidade: 'Presencial', status: 'Agendado' });
  assert.ok(agenda.linhas.some(line => line.tipo_atendimento === 'Retorno' && line.modalidade === 'Online' && line.status === 'Cancelado pelo paciente'));
  // Faltas: mesma regra de Gestão → Indicadores (isAbsence, groupAbsencesByProfessional).
  const faltas = await run(ask('faltas'));
  assert.equal(faltas.resumo.total, inWeek.filter(dashboard.isAbsence).length);
  const byPro = dashboard.groupAbsencesByProfessional(inWeek);
  const sum = line => line.nao_compareceu + line.cancelado_paciente + line.cancelado;
  assert.equal(faltas.linhas.reduce((total, line) => total + sum(line), 0), byPro.reduce((total, item) => total + (item.count ?? item.value ?? item.total ?? 0), 0) || faltas.resumo.total);
  // Confirmações: a fila da Agenda (listPendingConfirmations) no período padrão (amanhã).
  const pending = await run({ tipo: 'confirmacoes_pendentes', profissional: 'equipe' });
  assert.deepEqual([pending.de, pending.ate], ['2026-11-10', '2026-11-10']);
  assert.deepEqual(pending.linhas, [{ dia: '2026-11-10', inicio: '09:00', profissional: 'Dênis Prof T.', area: 'Psicologia' }]);
  // Pacotes perto do fim: grp-a (1 restante) entra; grp-b (3) não. A "Sua atenção hoje" dá o mesmo no mesmo caso.
  const packs = await run(ask('pacotes_fim'));
  assert.deepEqual(packs.linhas, [{ profissional: 'Dênis Prof T.', area: 'Psicologia', pacotes: 1, sessoes_restantes: 1 }]);
  const financePackages = [
    { id: 'pa', status: 'active', sessions_planned: 10 },
    { id: 'pb', status: 'active', sessions_planned: 10 },
  ];
  const charges = [
    ...Array.from({ length: 9 }, (_, i) => ({ id: 'ca' + i, package_id: 'pa', source: 'appointment' })),
    ...Array.from({ length: 7 }, (_, i) => ({ id: 'cb' + i, package_id: 'pb', source: 'appointment' })),
  ];
  assert.equal(front.packagesNearEnd({ packages: financePackages, charges }).length, packs.resumo.total, 'mesmo número da Sua atenção hoje');
  // Aniversários: mesma conta da Agenda (currentMonthBirthdays), só o número.
  assert.deepEqual((await run(ask('aniversarios'))).resumo, { total: dashboard.currentMonthBirthdays(patients, now).length });
  // Pesquisas: média igual ao quadro Pesquisa do Resumo da Gestão.
  const pesquisas = await run(ask('pesquisas'));
  assert.equal(pesquisas.resumo.media, Math.round(gestao.buildGestaoSummary({ surveys, now }).pesquisa.value * 10) / 10);
  assert.deepEqual(pesquisas.resumo, { respondidas: 2, media: 4.5, aguardando: 1 });
  // Formulários: sendsTabSummary de Importáveis.
  const sends = forms.sendsTabSummary(assignments, now);
  assert.deepEqual((await run(ask('formularios_pendentes'))).resumo, { enviados: sends.count, respondidos: sends.count - sends.waiting, aguardando: sends.waiting });
  // Convênio e notas: quadros do Resumo do Financeiro.
  const convenio = (await run(ask('convenio'))).resumo;
  const tiles = tissXml.buildTissTiles({ tiss: tiss(), tissError: null, today: '2026-11-09' }).tiles;
  assert.equal(String(convenio.guias_com_pendencia), tiles.guias.display);
  assert.equal(String(convenio.guias_prontas), tiles.lotes.display);
  assert.match(tiles.lotes.line, new RegExp(`${convenio.lotes_nao_enviados} lote`));
  assert.match(tiles.pagamentos.line, new RegExp(`${convenio.guias_esperando_operadora} guias? esperando`));
  assert.equal(convenio.valor_esperando_centavos, 6000 + 5000);
  assert.equal(convenio.glosadas, 1);
  const queue = fiscalUtils.fiscalQueue(fiscal().documents);
  assert.deepEqual([convenio.notas_pendentes, convenio.notas_a_cancelar, convenio.valor_notas_pendentes_centavos], [queue.pending.length, queue.toCancel.length, 12000]);
  // Filtro por pessoa.
  const nara = await run({ ...ask('agenda'), profissional: 'Nara' });
  assert.ok(nara.linhas.length > 0 && nara.linhas.every(line => line.profissional === 'Nara Nutri T.'));
  assert.equal((await run({ ...ask('agenda'), profissional: 'Ninguém' })).motivo, 'nao_encontrado');
});

test('AG-5 fonte que falha vira aviso (nunca zero); fonte no limite e lista acima de 50 não cortam calado', async () => {
  const sourceOf = { agenda: 'appointments', faltas: 'appointments', confirmacoes_pendentes: 'pending', pacotes_fim: 'appointments', aniversarios: 'patients', pesquisas: 'surveys', formularios_pendentes: 'assignments', convenio: 'tiss' };
  for (const tipo of TYPES) {
    reset(); state.fail = sourceOf[tipo];
    const result = await run(ask(tipo));
    assert.equal(result.motivo, 'erro', tipo); assert.equal(result.total, null); assert.equal(result.resumo, null);
    assert.doesNotMatch(JSON.stringify(result), /SEGREDO/);
  }
  reset(); state.fail = 'fiscal'; assert.equal((await run(ask('convenio'))).motivo, 'erro');
  reset(); state.appointments = Array.from({ length: 2000 }, (_, i) => ap('x' + i, 'den', 'psicologia', '2026-11-10', '09:00', 'scheduled'));
  assert.equal((await run(ask('agenda'))).motivo, 'erro', 'fonte no limite de 2000 pode estar cortada');
  reset(); state.appointments = Array.from({ length: 51 }, (_, i) => ap('y' + i, 'den', 'psicologia', '2026-11-10', '09:00', 'scheduled'));
  const many = await run(ask('agenda'));
  assert.equal(many.motivo, 'limite_linhas'); assert.deepEqual(many.linhas, []);
  assert.deepEqual(many.resumo, { agendados: 51, atendidos: 0, faltas: 0, cancelamentos: 0, bloqueios: 0 }, 'os números do resumo vêm mesmo sem a lista');
  assert.deepEqual(edge.readConsultaResult(many), many);
  state.appointments.pop();
  assert.equal((await run(ask('agenda'))).total, 50);
  reset(); assert.equal((await run({ ...ask('agenda'), de: '2026-01-01', ate: '2026-04-04' })).motivo, 'limite_periodo');
  assert.equal((await run({ tipo: 'agenda', profissional: 'equipe' })).motivo, 'periodo_invalido', 'agenda exige período');
});

test('AG-5 prompt, ajuda e AGENTS: consultas novas explicadas, sem paciente e com a tela como referência', async () => {
  assert.match(edgeSource, /- agenda: a agenda de um período/);
  assert.match(edgeSource, /Estas consultas NÃO trazem paciente: nunca invente nome/);
  assert.match(edgeSource, /Com motivo limite_linhas, os números do resumo valem/);
  const help = await readFile(new URL('../../src/data/screenHelp.js', import.meta.url), 'utf8');
  assert.match(help, /As consultas de agenda e operação não trazem paciente/);
  const agents = await readFile(new URL('../../../AGENTS.md', import.meta.url), 'utf8');
  assert.match(agents, /Agenda e operação sem paciente \(ACUP-023, AG-5\)/);
  assert.match(agents, /clinic-assistant-agenda\.test\.mjs/);
  const tools = await readFile(new URL('../../src/services/assistantTools.js', import.meta.url), 'utf8');
  assert.doesNotMatch(tools, /console\.|\.from\(|\.insert\(|\.update\(|\.delete\(/);
});

test('QA 09/11/2026: confirmações e aniversários com a fonte no limite (2000) viram erro, nunca subcontagem', async () => {
  reset();
  state.appointments = Array.from({ length: 2000 }, (_, i) => ap('p' + i, 'den', 'psicologia', '2026-11-10', '09:00', 'scheduled'));
  const pending = await run(ask('confirmacoes_pendentes'));
  assert.equal(pending.motivo, 'erro', 'fila de confirmação cheia pode estar cortada');
  assert.equal(pending.resumo, null);
  state.appointments.pop();
  assert.equal((await run(ask('confirmacoes_pendentes'))).motivo, 'limite_linhas', '1999 cabem na fonte: resumo sem a lista');
  reset();
  state.patients = Array.from({ length: 2000 }, (_, i) => ({ id: 'q' + i, name: 'Nome ' + i, birth_date: '1990-11-03' }));
  const birthdays = await run(ask('aniversarios'));
  assert.equal(birthdays.motivo, 'erro', 'cadastro cheio pode estar cortado');
  assert.equal(birthdays.resumo, null);
  state.patients.pop();
  assert.deepEqual((await run(ask('aniversarios'))).resumo, { total: 1999 });
  // pacotes_fim: a fonte é a série da Agenda, não o pacote do Financeiro da "Sua atenção hoje".
  for (const criteria of [front.AGENDA_CRITERIA, edge.AGENDA_CRITERIA]) {
    assert.match(criteria.pacotes_fim, /Não é o pacote do Financeiro/);
    assert.doesNotMatch(criteria.pacotes_fim, /mesma regra/);
  }
  assert.match(edgeSource, /pacotes_fim: [^\r\n]*não diga que os números são os mesmos/);
});
