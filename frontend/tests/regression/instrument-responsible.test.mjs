import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

// Incidente de 09/10/2026: a administradora mandou a paciente para a
// Psicologia escolhendo a psicóloga e mandou o PHQ-9 para casa. O "Enviar"
// não gravava o destino como responsável e quem cria a matrícula
// (referred_by) contava como "quem atende": a nota e o alerta de risco
// ficaram só com a administradora, e a psicóloga, também da
// administração, recebeu "você precisa atender o paciente nessa área".
// Decisão (mesmo dia): responsável claro antes de enviar, destino do
// "Enviar" vira responsável, "encaminhado por" não conta, e a
// administração lê as escalas sempre. Migração 20261012.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = rel => readFile(path.join(root, 'src', rel), 'utf8');
const MIGRATION = path.resolve(root, '../supabase/migrations/20261012_instrument_result_responsible.sql');

let server;
let sql;
let recipients;
let service;

before(async () => {
  server = await createServer({
    root,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  });
  recipients = await server.ssrLoadModule('/src/utils/instrumentRecipients.js');
  service = await server.ssrLoadModule('/src/services/patientInstrumentService.js');
  sql = await readFile(MIGRATION, 'utf8');
});

after(async () => {
  await server?.close();
});

function functionBody(text, name) {
  const match = text.match(new RegExp(`CREATE (?:OR REPLACE )?FUNCTION public\\.${name}\\([\\s\\S]*?\\$${name}\\$;`));
  assert.ok(match, `função ${name}`);
  return match[0];
}

const DENISE = { id: 'denise', name: 'Denise Neves' };
const KAREN = { id: 'karen', name: 'Karen Karoline Santos' };
const LAIZE = { id: 'laize', name: 'Laize de S.' };

// A situação do incidente, como o banco devolve depois da correção.
const incident = {
  enrollmentId: 'e1',
  enrollmentStatus: 'active',
  responsible: null,
  agenda: [],
  candidates: [DENISE, KAREN],
  viewerAttends: false,
  viewerIsAdmin: true,
};

// ---- migração ---------------------------------------------------------------

test('migração: "quem atende" é Agenda ou responsável; quem só criou a matrícula não conta', () => {
  const access = functionBody(sql, 'can_use_patient_instruments');
  assert.doesNotMatch(access, /referred_by/, 'encaminhado por não dá acesso');
  assert.match(access, /AND enrollment\.assigned_to = p_user\r?\n/);
  assert.match(access, /enrollment\.status = 'active'/);
  assert.match(access, /appointment\.professional_id = p_user/);
  assert.match(access, /appointment\.discipline = p_discipline/);
  assert.match(access, /public\.can_access_clinical_data\(p_user\)/);
  assert.match(access, /p_discipline = ANY\(public\.user_disciplines\(p_user\)\)/);
});

test('migração: a administração da clínica lê as escalas sempre; aplicar e alerta seguem com quem atende', () => {
  const read = functionBody(sql, 'can_read_patient_instruments');
  assert.match(read, /SELECT public\.can_use_patient_instruments\(p_patient, p_discipline, p_user\)\r?\n\s*OR \(/);
  assert.match(read, /public\.is_clinic_admin\(p_user\)/);
  assert.match(read, /public\.can_access_clinical_data\(p_user\)/);
  assert.match(read, /patient\.clinic_id = public\.user_clinic_id\(p_user\)/, 'só pacientes da própria clínica');

  const list = functionBody(sql, 'list_patient_instrument_applications');
  assert.match(list, /NOT public\.can_read_patient_instruments\(p_patient_id, p_discipline, v_uid\)/);
  assert.match(list, /pia\.clinic_id = public\.user_clinic_id\(v_uid\)/);
  assert.match(list, /Acesso negado: o paciente não está em atendimento nesta área com você\./, 'frase que a tela reconhece');
  assert.match(functionBody(sql, 'list_patient_instrument_requests'), /public\.can_read_patient_instruments\(p_patient_id, p_discipline, v_uid\)/);

  // Aplicar, anular, alerta e "Vi o alerta" não são recriados aqui: seguem
  // com can_use_patient_instruments (só quem atende).
  for (const name of ['record_patient_instrument_application', 'void_patient_instrument_application', 'list_my_instrument_risk_alerts', 'acknowledge_instrument_risk']) {
    assert.doesNotMatch(sql, new RegExp(`FUNCTION public\\.${name}\\(`), name);
  }
});

test('migração: envio da administração exige responsável que atende; só a administração escolhe', () => {
  assert.match(sql, /DROP FUNCTION IF EXISTS public\.portal_send_instrument\(UUID, TEXT, TEXT, INTEGER, TEXT, JSONB, DATE\);/);
  const send = functionBody(sql, 'portal_send_instrument');
  assert.match(send, /p_due_date DATE DEFAULT NULL,\r?\n\s*p_responsible UUID DEFAULT NULL/, 'tela antiga continua chamando com sete');
  assert.match(send, /IF NOT v_is_admin THEN\r?\n\s*RAISE EXCEPTION 'Só a administração escolhe o responsável\.'/);
  assert.match(send, /public\.is_enrollment_responsible_candidate\(p_responsible, v_clinic, p_discipline\)/);
  assert.match(send, /SET assigned_to = p_responsible/);
  assert.match(send, /IF v_is_admin\r?\n\s*AND v_enrollment_id IS NOT NULL\r?\n\s*AND \(v_responsible IS NULL OR NOT public\.can_use_patient_instruments\(p_patient_id, p_discipline, v_responsible\)\) THEN/);
  assert.match(send, /Escolha o responsável pela escala nesta área antes de enviar/);
  // A trava antiga continua: sem ninguém atendendo, não envia.
  assert.match(send, /AND public\.can_use_patient_instruments\(p_patient_id, p_discipline, pr\.id\)/);
  assert.match(send, /f\.status IN \('pending', 'in_progress'\)/);
  assert.ok(send.indexOf("'Já existe um envio desta escala") < send.indexOf('SET assigned_to = p_responsible'), 'valida tudo antes de gravar o responsável');
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.portal_send_instrument\(UUID, TEXT, TEXT, INTEGER, TEXT, JSONB, DATE, UUID\) TO authenticated;/);
});

test('migração: responsável só pela RPC da administração; o cliente não grava assigned_to', () => {
  const set = functionBody(sql, 'set_enrollment_responsible');
  assert.match(set, /IF NOT public\.is_clinic_admin\(v_uid\) THEN\r?\n\s*RAISE EXCEPTION 'Só a administração escolhe o responsável\.'/);
  assert.match(set, /v_clinic IS DISTINCT FROM public\.user_clinic_id\(v_uid\)/);
  assert.match(set, /public\.is_enrollment_responsible_candidate\(p_responsible, v_clinic, v_discipline\)/);
  assert.match(set, /FOR UPDATE/);
  assert.match(sql, /REVOKE UPDATE \(assigned_to\) ON TABLE public\.patient_enrollments FROM authenticated;/);

  const candidate = functionBody(sql, 'is_enrollment_responsible_candidate');
  for (const rule of [/candidate\.clinic_id = p_clinic/, /candidate\.role IN \('therapist', 'clinic_admin'\)/, /candidate\.is_active IS TRUE/, /candidate\.must_change_password IS NOT TRUE/, /p_discipline = ANY\(COALESCE\(candidate\.disciplines/]) {
    assert.match(candidate, rule);
  }
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.is_enrollment_responsible_candidate\(UUID, UUID, TEXT\) FROM PUBLIC, anon, authenticated;/);
});

test('migração: "Enviar para outra área" grava o destino como responsável, sem passar por cima de quem atende', () => {
  const trigger = functionBody(sql, 'assign_enrollment_responsible_from_share');
  assert.match(trigger, /NEW\.to_user_id IS NOT NULL AND NEW\.revoked_at IS NULL/);
  assert.match(trigger, /e\.discipline = NEW\.to_discipline/);
  assert.match(trigger, /e\.assigned_to IS NULL\r?\n\s*OR NOT public\.is_enrollment_responsible_candidate\(e\.assigned_to/);
  assert.match(trigger, /public\.is_enrollment_responsible_candidate\(NEW\.to_user_id, e\.clinic_id, e\.discipline\)/);
  assert.match(sql, /CREATE TRIGGER record_shares_assign_enrollment_responsible\r?\n\s*AFTER INSERT ON public\.record_shares/);
  // Matrículas antigas: o destino mais recente, não revogado, assume.
  assert.match(sql, /SELECT DISTINCT ON \(rs\.patient_id, rs\.to_discipline\)[\s\S]*?WHERE rs\.revoked_at IS NULL[\s\S]*?ORDER BY rs\.patient_id, rs\.to_discipline, rs\.created_at DESC/);
});

test('migração: para quem vai o resultado devolve só nomes da equipe, nunca conteúdo clínico', () => {
  const who = functionBody(sql, 'instrument_result_recipients');
  assert.doesNotMatch(who, /patient_instrument_applications|pgp_sym_decrypt|payload/);
  assert.match(who, /'candidates', CASE WHEN v_is_admin THEN/, 'lista de candidatos só para a administração');
  assert.match(who, /v_clinic IS DISTINCT FROM public\.user_clinic_id\(v_uid\)/);
  assert.match(who, /public\.can_read_patient_instruments\(p_patient_id, p_discipline, v_uid\)/);
});

test('migração: funções com search_path fixo, sem anon, sem ON CONFLICT por coluna e sem tabela nova', () => {
  for (const name of [
    'is_enrollment_responsible_candidate', 'can_use_patient_instruments', 'can_read_patient_instruments',
    'list_patient_instrument_applications', 'list_patient_instrument_requests', 'instrument_result_recipients',
    'set_enrollment_responsible', 'assign_enrollment_responsible_from_share', 'portal_send_instrument',
  ]) {
    assert.match(functionBody(sql, name), /SECURITY DEFINER\r?\n\s*SET search_path = pg_catalog/, `${name}: search_path fixo`);
    assert.match(sql, new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\([^)]*\\) FROM PUBLIC, anon`), `${name}: sem anon`);
  }
  assert.doesNotMatch(sql, /ON CONFLICT \(/);
  assert.doesNotMatch(sql, /CREATE TABLE/, 'tabela nova com paciente precisaria entrar na exclusão');
});

// ---- regra da tela ----------------------------------------------------------

test('incidente: administração com matrícula sem responsável tem de escolher antes de enviar', () => {
  const plan = recipients.recipientPlan(incident, '', { discipline: 'psicologia' });
  assert.equal(plan.canChoose, true);
  assert.equal(plan.initialChoice, '', 'ninguém vem marcado: a escolha é da administração');
  assert.equal(plan.canSend, false);
  assert.match(plan.blockedReason, /Escolha o responsável na Psicologia/);
  assert.deepEqual(plan.options, [DENISE, KAREN]);

  const chosen = recipients.recipientPlan(incident, DENISE.id, { discipline: 'psicologia' });
  assert.equal(chosen.canSend, true);
  assert.deepEqual(chosen.receivers, [{ ...DENISE, reason: 'responsavel' }]);
  assert.equal(
    recipients.recipientSentence(chosen.receivers, KAREN.id),
    'A nota e o alerta de risco vão para Denise Neves (responsável).',
  );
});

test('responsável atual vem marcado; trocar avisa quem deixa de ser', () => {
  const info = { ...incident, responsible: { ...DENISE, receives: true }, agenda: [LAIZE] };
  const plan = recipients.recipientPlan(info, DENISE.id, { discipline: 'psicologia' });
  assert.equal(plan.initialChoice, DENISE.id);
  assert.equal(plan.changesFrom, '');
  assert.deepEqual(plan.receivers.map(person => person.reason), ['responsavel', 'agenda']);
  assert.equal(
    recipients.recipientSentence(plan.receivers, LAIZE.id),
    'A nota e o alerta de risco vão para Denise Neves (responsável) e você (atendimento na Agenda).',
  );
  assert.equal(recipients.recipientPlan(info, KAREN.id, { discipline: 'psicologia' }).changesFrom, 'Denise Neves');

  // Responsável que saiu (não recebe mais) não vem marcado; a única pessoa
  // da Agenda, se puder ser responsável, vem.
  const gone = { ...incident, responsible: { ...DENISE, receives: false }, agenda: [KAREN] };
  assert.equal(recipients.recipientPlan(gone, '', { discipline: 'psicologia' }).initialChoice, KAREN.id);
  const notCandidate = { ...incident, agenda: [LAIZE] };
  assert.equal(recipients.recipientPlan(notCandidate, '', { discipline: 'psicologia' }).initialChoice, '');
});

test('quem atende e não é da administração envia sem escolher; sem ninguém atendendo, não sai', () => {
  const professional = { ...incident, viewerIsAdmin: false, viewerAttends: true, candidates: [], agenda: [LAIZE] };
  const plan = recipients.recipientPlan(professional, '', { discipline: 'psicologia' });
  assert.equal(plan.canChoose, false);
  assert.equal(plan.canSend, true);
  assert.deepEqual(plan.receivers, [{ ...LAIZE, reason: 'agenda' }]);

  const notEnrolled = { ...incident, enrollmentId: null, enrollmentStatus: null };
  const blocked = recipients.recipientPlan(notEnrolled, '', { discipline: 'psicologia' });
  assert.equal(blocked.canChoose, false, 'sem matrícula não há onde gravar o responsável');
  assert.equal(blocked.canSend, false);
  assert.match(blocked.blockedReason, /ainda não está na Psicologia\. Na ficha, aba Matrículas, envie o paciente para a área/);
  assert.equal(recipients.recipientPlan({ ...notEnrolled, agenda: [DENISE] }, '', { discipline: 'psicologia' }).canSend, true);
  assert.equal(recipients.recipientPlan(null).canSend, false, 'carregando não envia');
});

test('quem pode ser responsável: ativo, de papel clínico e da área', () => {
  const base = { id: 'x', role: 'therapist', is_active: true, disciplines: ['psicologia'] };
  assert.equal(recipients.canBeResponsible(base, 'psicologia'), true);
  assert.equal(recipients.canBeResponsible({ ...base, role: 'clinic_admin' }, 'psicologia'), true);
  assert.equal(recipients.canBeResponsible(base, 'nutricao'), false);
  assert.equal(recipients.canBeResponsible({ ...base, is_active: false }, 'psicologia'), false);
  assert.equal(recipients.canBeResponsible({ ...base, role: 'reception' }, 'psicologia'), false);
  assert.equal(recipients.canBeResponsible({ ...base, disciplines: null }, 'psicologia'), false);
});

test('serviço: lê para quem vai, manda o responsável e mapeia a resposta do banco', async () => {
  const row = {
    enrollment_id: 'e1',
    enrollment_status: 'active',
    responsible: { id: 'denise', name: 'Denise Neves', receives: true },
    agenda: [{ id: 'laize', name: 'Laize de S.' }, { name: 'sem id' }],
    candidates: [{ id: 'denise', name: 'Denise Neves' }],
    viewer_attends: false,
    viewer_is_admin: true,
  };
  assert.deepEqual(service.mapRecipientsRow(row), {
    enrollmentId: 'e1',
    enrollmentStatus: 'active',
    responsible: { id: 'denise', name: 'Denise Neves', receives: true },
    agenda: [LAIZE],
    candidates: [DENISE],
    viewerAttends: false,
    viewerIsAdmin: true,
  });
  assert.equal(service.mapRecipientsRow(null).responsible, null);

  const code = await src('services/patientInstrumentService.js');
  assert.match(code, /supabase\.rpc\('instrument_result_recipients'/);
  assert.match(code, /p_responsible: responsibleId \|\| null/);
  const patients = await src('services/clinicPatientsService.js');
  assert.match(patients, /supabase\.rpc\('set_enrollment_responsible'/);
  assert.match(patients, /patient_enrollments\(id,discipline,status,note,created_at,assigned_to\)/);
  assert.match(patients, /\.select\('id,discipline,status,note,created_at,assigned_to'\)/);
});

// ---- telas ------------------------------------------------------------------

test('envio pela ficha e pela aba Escalas: escolha do responsável, frase de quem recebe e botão travado', async () => {
  for (const file of ['components/instruments/SendInstrumentForm.jsx', 'components/instruments/InstrumentPortalBox.jsx']) {
    const code = await src(file);
    assert.match(code, /useRecipientChoice\(recipients, discipline\)/, file);
    assert.match(code, /<ResponsibleSelect/, file);
    assert.match(code, /<RecipientNote/, file);
    assert.match(code, /responsibleId: choice\.responsibleId/, file);
    assert.match(code, /!choice\.canSend/, file);
  }
  const { SendInstrumentForm } = await server.ssrLoadModule('/src/components/instruments/SendInstrumentForm.jsx');
  const html = renderToStaticMarkup(React.createElement(SendInstrumentForm, { patient: { id: 'p1' } }));
  assert.match(html, /Conferindo quem recebe o resultado/);
  assert.match(html, /<button type="submit" class="gt-btn gt-btn--primary" disabled="">/, 'não envia antes de saber para quem vai');

  const { ResponsibleSelect, RecipientNote } = await server.ssrLoadModule('/src/components/instruments/InstrumentRecipientField.jsx');
  const plan = recipients.recipientPlan(incident, '', { discipline: 'psicologia' });
  const select = renderToStaticMarkup(React.createElement(ResponsibleSelect, {
    id: 'r', plan, value: '', onChange: () => {}, discipline: 'psicologia',
  }));
  assert.match(select, /Responsável na Psicologia/);
  assert.match(select, /required=""/);
  assert.match(select, /<option value="" selected="">Escolha quem atende<\/option><option value="denise">Denise Neves<\/option>/);
  const note = renderToStaticMarkup(React.createElement(RecipientNote, {
    recipients: { info: incident, loading: false, error: '' }, plan,
  }));
  assert.match(note, /Escolha o responsável na Psicologia: é quem recebe a nota e o alerta de risco\./);
  assert.match(note, /aba Matrículas/);
  const nonAdmin = recipients.recipientPlan({ ...incident, viewerIsAdmin: false, agenda: [LAIZE] }, '', { discipline: 'psicologia' });
  assert.equal(renderToStaticMarkup(React.createElement(ResponsibleSelect, {
    id: 'r', plan: nonAdmin, value: '', onChange: () => {}, discipline: 'psicologia',
  })), '', 'quem não é da administração não escolhe');
});

test('aba Escalas: administração que não atende lê, sem "Aplicar agora" nem "Vi o alerta"', async () => {
  const panel = await src('components/instruments/PatientInstrumentsPanel.jsx');
  assert.match(panel, /const readOnly = Boolean\(recipients\.info\) && !recipients\.info\.viewerAttends;/);
  assert.match(panel, /\{!readOnly && \(\r?\n\s*<button type="button" className="primary-button" onClick=\{\(\) => onApply\(instrument, latest\)\}>Aplicar agora<\/button>/);
  assert.match(panel, /\{readOnly \? \(\r?\n\s*<p className="small">Quem atende o paciente marca “Vi o alerta”\.<\/p>/);
  assert.match(panel, /Você vê as escalas por ser da administração/);
  assert.match(panel, /quem atende o paciente nesta área \(atendimento na Agenda ou responsável\) e a administração/);

  const result = await src('components/instruments/InstrumentRequestResult.jsx');
  assert.match(result, /O resultado fica com quem atende o paciente na \{area\} e com a administração/);
  assert.doesNotMatch(result, /responsável pela matrícula/, 'nada de pedir um campo que a tela não tem');
});

test('ficha → Matrículas: responsável visível para todos, escolha só da administração', async () => {
  const profile = await src('components/ClinicPatientProfile.jsx');
  assert.match(profile, /<EnrollmentResponsible\r?\n\s*enrollment=\{enrollment\}[\s\S]*?canEdit=\{isClinicAdmin\}/);

  const { EnrollmentResponsible } = await server.ssrLoadModule('/src/components/EnrollmentResponsible.jsx');
  const members = [
    { id: 'denise', full_name: 'Denise Neves', role: 'clinic_admin', is_active: true, disciplines: ['psicologia'] },
    { id: 'laize', full_name: 'Laize de Santana', role: 'therapist', is_active: true, disciplines: ['nutricao'] },
  ];
  const enrollment = { id: 'e1', discipline: 'psicologia', assigned_to: 'denise' };
  const asProfessional = renderToStaticMarkup(React.createElement(EnrollmentResponsible, {
    enrollment, disciplineLabel: 'Psicologia', members, canEdit: false,
  }));
  assert.match(asProfessional, /Responsável: <b>Denise Neves<\/b>/);
  assert.doesNotMatch(asProfessional, /Trocar|Escolher/);

  const empty = renderToStaticMarkup(React.createElement(EnrollmentResponsible, {
    enrollment: { ...enrollment, assigned_to: null }, disciplineLabel: 'Psicologia', members, canEdit: true,
  }));
  assert.match(empty, /Sem responsável/);
  assert.match(empty, />Escolher</);
  assert.match(empty, /recebe as escalas e o alerta de risco/);

  // Nenhuma tela grava assigned_to direto (o banco também não deixa).
  for (const file of ['services/clinicPatientsService.js', 'components/ClinicPatientProfile.jsx', 'components/EnrollmentResponsible.jsx']) {
    assert.doesNotMatch(await src(file), /\.update\(\{[^}]*assigned_to/, file);
  }
});
