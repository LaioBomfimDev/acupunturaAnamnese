import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import * as front from '../../src/utils/clinicAssistant.js';
import * as edge from '../../../supabase/functions/_shared/assistantConsulta.ts';

// ============================================================
// ACUP-027 (AG-4, AG-10): a assistente PREPARA, a pessoa decide.
// Confirmação = link wa.me (a pessoa toca em Enviar); novo agendamento =
// formulário preenchido (a pessoa confere e salva). A IA só vê um ref
// curto; quem diz qual atendimento é a tabela da conversa, no aparelho.
// Dados 100% fictícios, sem rede.
// ============================================================

const root = fileURLToPath(new URL('../..', import.meta.url));
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent', plugins: [{
  name: 'actions-test-isolation', enforce: 'pre', load(id) {
    const clean = id.replaceAll('\\', '/').split('?')[0];
    if (clean.endsWith('/src/lib/supabase.js')) return "export const getAuthenticatedUser=async()=>null; export const supabase={rpc:async()=>{throw Error('Rede inesperada')},from:()=>{throw Error('Rede inesperada')}};";
  },
}] });
after(() => server.close());
const messages = await server.ssrLoadModule('/src/utils/agendaMessages.js');
const whatsapp = await server.ssrLoadModule('/src/utils/whatsapp.js');
const appointmentTypes = await server.ssrLoadModule('/src/utils/appointmentTypes.js');
const service = await server.ssrLoadModule('/src/services/clinicAssistantService.js');

const NOW = new Date('2026-11-09T12:00:00');
const at = (day, hour) => new Date(`${day}T${hour}:00`).toISOString();
const appointment = (extra = {}) => ({
  id: 'ap-1', patient_id: 'pac-1', professional_id: 'den', discipline: 'psicologia', kind: 'appointment',
  starts_at: at('2026-11-10', '09:00'), modality: 'presencial', appointment_type: 'session', confirmation_token: 'tok-abc', ...extra,
});

// ---------- 1. A mensagem é a mesma da Agenda, byte a byte ----------

test('AG-10 mensagem: texto da confirmação igual ao que a Agenda montava (com e sem endereço, com sala online)', () => {
  const base = { patientName: 'Lucas Sobrenome', professionalName: 'Dênis T.', origin: 'https://exemplo.test', now: NOW };
  assert.equal(messages.buildConfirmationMessage({ ...base, appointment: appointment(), clinicName: 'Clínica Teste', clinicAddress: 'Rua A, 1' }),
    'Olá, Lucas Sobrenome! Aqui é da Clínica Teste. Você tem uma consulta com Dênis T. agendada para amanhã (10 de novembro) às 09:00.\n\n'
    + 'Por favor, confirme sua presença aqui: https://exemplo.test/confirmar-agendamento?token=tok-abc\n\n'
    + 'Nosso endereço: Rua A, 1.\n\nObrigado(a)!');
  assert.equal(messages.buildConfirmationMessage({ ...base, appointment: appointment() }),
    'Olá, Lucas Sobrenome! Você tem uma consulta com Dênis T. agendada para amanhã (10 de novembro) às 09:00.\n\n'
    + 'Por favor, confirme sua presença aqui: https://exemplo.test/confirmar-agendamento?token=tok-abc\n\nObrigado(a)!');
  const online = messages.buildConfirmationMessage({ ...base, appointment: appointment({ modality: 'online' }), clinicAddress: 'Rua A, 1', agendaSettings: { onlineRoom: true } });
  assert.match(online, /Sua consulta é online, por vídeo\. No horário, abra este mesmo link e toque em “Entrar na consulta”\./);
  assert.doesNotMatch(online, /Nosso endereço/, 'online não manda o endereço');
});

test('AG-10 mensagem: a Agenda e a assistente usam a MESMA função (nunca texto paralelo)', async () => {
  const view = await read('../../src/components/panels/agenda/PendingConfirmationView.jsx');
  const svc = await read('../../src/services/clinicAssistantService.js');
  assert.match(view, /buildConfirmationMessage\(\{/);
  assert.doesNotMatch(view, /Por favor, confirme sua presença/, 'o texto não mora mais na tela');
  assert.match(svc, /buildConfirmationMessage: messages\.buildConfirmationMessage/);
  assert.doesNotMatch(svc, /Por favor, confirme sua presença/);
});

// ---------- 2. Tabela da conversa ----------

test('AG-10 refs: curtos, sem id, iguais para o mesmo atendimento e resolvidos só nesta conversa', () => {
  const registry = front.createRefRegistry();
  const ref = registry.refFor(appointment());
  assert.match(ref, front.ASSISTANT_REF);
  assert.doesNotMatch(ref, /ap-|pac-|den|tok/);
  assert.equal(registry.refFor(appointment()), ref, 'o mesmo atendimento repete o ref');
  assert.notEqual(registry.refFor(appointment({ id: 'ap-2' })), ref);
  assert.deepEqual(registry.resolve(ref), { appointmentId: 'ap-1', patientId: 'pac-1', professionalId: 'den', discipline: 'psicologia', startsAt: appointment().starts_at });
  assert.equal(front.createRefRegistry().resolve(ref), null, 'outra conversa não conhece o ref');
  assert.equal(registry.resolve('ap-1'), null);
  // Colisão do aleatório: nunca reaproveita um ref de outro atendimento.
  const fixed = front.createRefRegistry(() => 0);
  const first = fixed.refFor(appointment());
  let calls = 0;
  const colliding = front.createRefRegistry(() => (calls++ < 2 ? 0 : 0.5));
  const a = colliding.refFor(appointment());
  const b = colliding.refFor(appointment({ id: 'ap-2' }));
  assert.equal(first, 'r000');
  assert.notEqual(a, b);
});

// ---------- 3. O que a IA pode pedir ----------

test('AG-4 ação: lista fechada, uma só, ref dos dados aceitos e profissional da EQUIPE (aparelho e Edge iguais)', () => {
  for (const reader of [front.readAssistantAction, edge.readAssistantAction]) {
    const refs = ['r1ab'];
    assert.deepEqual(reader({ tipo: 'confirmacao', ref: 'r1ab', extra: 'x' }, { refs }), { tipo: 'confirmacao', ref: 'r1ab' });
    assert.equal(reader({ tipo: 'confirmacao', ref: 'r9zz' }, { refs }), null, 'ref fora dos dados aceitos');
    assert.equal(reader({ tipo: 'cancelar', ref: 'r1ab' }, { refs }), null, 'só as duas ações');
    assert.equal(reader({ tipo: 'falta', ref: 'r1ab' }, { refs }), null, 'sem modelo de falta');
    assert.equal(reader([{ tipo: 'confirmacao', ref: 'r1ab' }], { refs }), null, 'várias ações = nenhuma');
    assert.equal(reader({ tipo: 'confirmacao', ref: 'ap-1' }, { refs: ['ap-1'] }), null, 'id nunca vale como ref');
    assert.equal(reader(null), null);
    assert.deepEqual(reader({ tipo: 'novo_agendamento', ref: 'r1ab', profissional: 'Fulano Inventado', dia: '2026-11-20', hora: '25:00', tipo_atendimento: 'Inventado' },
      { refs, team: ['Dênis T.'] }), { tipo: 'novo_agendamento', ref: 'r1ab', profissional: '', dia: '2026-11-20', hora: '', tipo_atendimento: '' });
    assert.deepEqual(reader({ tipo: 'novo_agendamento', ref: 'r1ab', profissional: 'Dênis T.', dia: '2026-11-20', hora: '14:30', tipo_atendimento: 'Sessão' },
      { refs, team: ['Dênis T.'] }), { tipo: 'novo_agendamento', ref: 'r1ab', profissional: 'Dênis T.', dia: '2026-11-20', hora: '14:30', tipo_atendimento: 'Sessão' });
  }
  assert.deepEqual(front.ASSISTANT_ACTIONS, edge.ASSISTANT_ACTIONS);
  assert.equal(String(front.ASSISTANT_REF), String(edge.ASSISTANT_REF));
  const dados = [{ tipo: 'agenda_pacientes', linhas: [{ ref: 'r1ab' }, { ref: 'nope' }] }, { tipo: 'proxima_sessao', linhas: [{ ref: 'r2cd' }] }, { tipo: 'agenda' }];
  assert.deepEqual(front.refsOf(dados), ['r1ab', 'r2cd']);
  assert.deepEqual(edge.refsOf(dados), ['r1ab', 'r2cd']);
});

test('AG-4 Edge: ação só com refs dos dados aceitos nesta chamada; schema e prompt dizem que só prepara', async () => {
  const index = await read('../../../supabase/functions/clinic-assistant/index.ts');
  assert.match(index, /const acao = readAssistantAction\(reply\.parsed\?\.acao, \{ team: context\.team, refs: refsOf\(\[\.\.\.anteriores, \.\.\.\(dados \? \[dados\] : \[\]\)\]\) \}\);/);
  assert.match(index, /\.\.\.\(acao \? \{ acao \} : \{\}\)/);
  assert.match(index, /acao: \{\r?\n\s+type: 'OBJECT',\r?\n\s+nullable: true,/);
  assert.match(index, /Você nunca envia, salva, agenda, cancela nem cobra\./);
  assert.match(index, /Uma ação por resposta/);
  assert.match(index, /Nunca escreva o ref no texto\./);
});

// ---------- 4. Preparar no aparelho ----------

const patients = [
  { id: 'pac-1', name: 'Lucas Sobrenome', phone: '(71) 99999-0000' },
  { id: 'pac-2', name: 'Vitória Sobrenome', phone: '' },
];
const members = [{ id: 'den', full_name: 'Dênis Prof Teste' }, { id: 'nar', full_name: 'Nara Nutri Teste' }];
function deps(overrides = {}) {
  const calls = [];
  const spy = (name, fn) => async (...args) => { calls.push(name); return fn(...args); };
  return {
    calls,
    listClinicPatients: spy('patients', () => patients),
    listClinicMembers: spy('members', () => members),
    listPendingConfirmations: spy('pending', () => [appointment()]),
    loadAgendaSettings: spy('settings', () => ({ settings: {} })),
    buildConfirmationMessage: messages.buildConfirmationMessage,
    buildWhatsAppLink: whatsapp.buildWhatsAppLink,
    isLikelyValidWhatsAppPhone: whatsapp.isLikelyValidWhatsAppPhone,
    appointmentTypes,
    origin: 'https://exemplo.test',
    ...overrides,
  };
}
const profile = { id: 'admin', clinic_id: 'clinic', role: 'clinic_admin', clinic: { name: 'Clínica Teste', address: '' } };

test('AG-10 confirmação: o paciente vem do ref, nunca do texto da IA; mostra só o primeiro nome', async () => {
  const refs = front.createRefRegistry();
  const ref = refs.refFor(appointment());
  const d = deps();
  const result = await service.prepareAssistantAction({ tipo: 'confirmacao', ref, paciente: 'Vitória' }, { profile, refs, deps: d });
  assert.equal(result.kind, 'whatsapp');
  assert.equal(result.label, 'Abrir o WhatsApp com a confirmação para Lucas (você toca em Enviar)');
  assert.doesNotMatch(result.label, /Sobrenome|Vitória/);
  const text = decodeURIComponent(new URL(result.href).searchParams.get('text'));
  assert.equal(text, messages.buildConfirmationMessage({ appointment: appointment(), patientName: 'Lucas Sobrenome', professionalName: 'Dênis Prof T.', clinicName: 'Clínica Teste', origin: 'https://exemplo.test' }));
  assert.match(result.href, /^https:\/\/wa\.me\/5571999990000\?text=/);
  assert.deepEqual(d.calls.filter(name => !['patients', 'members', 'pending', 'settings'].includes(name)), [], 'só leitura');
});

test('AG-10 confirmação: motivos claros (sem link, sem WhatsApp, não pendente, ref desconhecido)', async () => {
  const refs = front.createRefRegistry();
  const ref = refs.refFor(appointment());
  const noToken = await service.prepareAssistantAction({ tipo: 'confirmacao', ref }, { profile, refs, deps: deps({ listPendingConfirmations: async () => [appointment({ confirmation_token: null })] }) });
  assert.deepEqual(noToken, { kind: 'motivo', text: 'Este atendimento ainda não tem link de confirmação.' });
  const notPending = await service.prepareAssistantAction({ tipo: 'confirmacao', ref }, { profile, refs, deps: deps({ listPendingConfirmations: async () => [] }) });
  assert.deepEqual(notPending, { kind: 'motivo', text: 'Este atendimento não está esperando confirmação.' });
  const refV = refs.refFor(appointment({ id: 'ap-v', patient_id: 'pac-2' }));
  const noPhone = await service.prepareAssistantAction({ tipo: 'confirmacao', ref: refV }, { profile, refs,
    deps: deps({ listPendingConfirmations: async () => [appointment({ id: 'ap-v', patient_id: 'pac-2' })] }) });
  assert.deepEqual(noPhone, { kind: 'motivo', text: 'O cadastro de Vitória não tem um WhatsApp válido.' });
  const unknown = await service.prepareAssistantAction({ tipo: 'confirmacao', ref: 'r9zz' }, { profile, refs, deps: deps() });
  assert.deepEqual(unknown, { kind: 'motivo', text: 'Não encontrei esse atendimento nesta conversa. Peça de novo a agenda e a ação.' });
  const broken = await service.prepareAssistantAction({ tipo: 'confirmacao', ref }, { profile, refs, deps: deps({ listClinicPatients: async () => { throw Error('SEGREDO'); } }) });
  assert.deepEqual(broken, { kind: 'motivo', text: 'Não foi possível preparar a ação agora. Faça pela Agenda.' });
});

test('AG-10 novo agendamento: rascunho do ref; profissional e tipo que não casam ficam vazios; nunca "Como paga" nem valor', async () => {
  const refs = front.createRefRegistry();
  const ref = refs.refFor(appointment());
  const ok = await service.prepareAssistantAction({ tipo: 'novo_agendamento', ref, profissional: 'Nara Nutri T.', dia: '2026-11-20', hora: '14:30', tipo_atendimento: 'Sessão' }, { profile, refs, deps: deps() });
  assert.equal(ok.kind, 'agenda');
  assert.equal(ok.label, 'Abrir Novo agendamento preenchido para Lucas (você confere e salva)');
  assert.deepEqual(ok.draft, { patientId: 'pac-1', patientName: 'Lucas Sobrenome', discipline: 'psicologia', professionalId: 'nar', date: '2026-11-20', time: '14:30', appointmentType: 'session' });
  const loose = await service.prepareAssistantAction({ tipo: 'novo_agendamento', ref, profissional: 'Ninguém X.', dia: '', hora: '', tipo_atendimento: '' }, { profile, refs, deps: deps() });
  assert.deepEqual(loose.draft, { patientId: 'pac-1', patientName: 'Lucas Sobrenome', discipline: 'psicologia', professionalId: '', date: '', time: '', appointmentType: '' });
  for (const draft of [ok.draft, loose.draft]) assert.deepEqual(Object.keys(draft).filter(key => /billing|pay|price|valor|coverage/i.test(key)), []);
});

test('AG-10 tela: nada é salvo nem enviado sem a pessoa; a Agenda abre preenchida com a faixa e sem "Como paga"', async () => {
  const agenda = await read('../../src/components/panels/Agenda.jsx');
  const app = await read('../../src/App.jsx');
  const panel = await read('../../src/components/assistant/ClinicAssistant.jsx');
  const svc = await read('../../src/services/clinicAssistantService.js');
  const prepare = svc.slice(svc.indexOf('export async function prepareAssistantAction('), svc.indexOf('\n}\n', svc.indexOf('export async function prepareAssistantAction(')) + 1);
  assert.doesNotMatch(prepare, /createAppointment|updateAppointment|insert|update\(|\.from\(|fetch\(|window\.open/, 'preparar só lê');
  assert.match(panel, /<a className="ca-action" href=\{prepared\.href\} target="_blank" rel="noopener noreferrer">/, 'WhatsApp só por link que a pessoa toca');
  assert.match(panel, /onClick=\{\(\) => openScreenFromAssistant\('agenda', null, prepared\.draft\)\}/);
  assert.match(agenda, /Preenchido pela assistente: confira antes de salvar\./);
  const effect = agenda.slice(agenda.indexOf('if (!initialDraft) return;'), agenda.indexOf('onInitialDraftUsed?.();'));
  assert.doesNotMatch(effect, /billing|createAppointment|handleSave|submit/, 'o rascunho não toca em "Como paga" nem salva');
  assert.match(effect, /setSheetOpen\(true\);/);
  assert.match(effect, /setPatientSearch\(initialDraft\.patientId \? \(initialDraft\.patientName \|\| ''\) : ''\);/, 'o campo Paciente mostra o nome preenchido');
  assert.match(app, /if \(target === 'agenda' && agendaDraft\) \{/);
  assert.match(app, /<Agenda\r?\n\s+key=\{hubAgendaKey\}\r?\n\s+profile=\{profile\}\r?\n\s+initialDraft=\{hubAgendaDraft\}/);
});
