import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = await readFile(path.join(root, 'src/components/aba/AbaSupervision.jsx'), 'utf8');
const workspace = await readFile(path.join(root, 'src/components/AbaWorkspace.jsx'), 'utf8');
const css = await readFile(path.join(root, 'src/styles/aba.css'), 'utf8');
let server, api, screen, db, originalRpc;
before(async () => {
  server = await createServer({ root, logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' });
  api = await server.ssrLoadModule('/src/services/abaService.js');
  screen = await server.ssrLoadModule('/src/components/aba/AbaSupervision.jsx');
  db = (await server.ssrLoadModule('/src/lib/supabase.js')).supabase;
  originalRpc = db.rpc;
  db.rpc = async () => { throw new Error('RPC sem mock no teste'); };
});
after(async () => { if (db) db.rpc = originalRpc; await server?.close(); });

const record = {
  id: 'registro-1', revision: 7, supervisor_id: 'sup', supervisee_id: 'member', patient_id: 'paciente-ficticio',
  held_on: '2026-11-08', duration_minutes: 60, modality: 'grupo', format: 'online', status: 'rascunho',
  agenda: 'Pauta exclusiva de teste', decisions: 'Decisões exclusivas de teste', content_restricted: false,
};
const teams = { userId: 'sup', isAdmin: false, supervisedTeamId: 'time', professionals: [{ id: 'member', memberTeamId: 'time' }] };
const personName = id => ({ sup: 'Supervisora fictícia', member: 'Profissional fictício' }[id] || 'Profissional');
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));
const card = (row = record, state = teams, extra = {}) => render(screen.SupervisionCard, { record: row, teams: state, personName, ...extra });

test('horas: soma só assinados por profissional, antes de converter; pluralização sem arredondar cada encontro', () => {
  const records = [record, { ...record, id: 's1', status: 'assinado', duration_minutes: 35 },
    { ...record, id: 's2', status: 'assinado', duration_minutes: 25 },
    { ...record, id: 'a1', status: 'anulado', duration_minutes: 600 },
    { ...record, id: 's3', status: 'assinado', supervisee_id: 'outro', duration_minutes: 120 }];
  assert.deepEqual(api.supervisionTotals(records), [{ supervisee_id: 'member', duration_minutes: 60 }, { supervisee_id: 'outro', duration_minutes: 120 }]);
  assert.equal(api.supervisionHours(60), '1 hora');
  assert.equal(api.supervisionHours(120), '2 horas');
  assert.equal(api.supervisionHours(61), '1 hora e 1 minuto');
  assert.equal(api.supervisionHours(25), '25 minutos');
  assert.equal(api.supervisionHours(0), '0 horas');
  assert.match(render(screen.SupervisionSummary, { records, personName }), /1 hora/);
  assert.doesNotMatch(render(screen.SupervisionSummary, { records, personName }), /600|10 horas/);
});

test('rascunho: supervisor atual edita; autoria permite assinar; membro e falha de permissão sem escrita', () => {
  assert.match(card(), /Editar rascunho/);
  assert.match(card(), />Assinar</);
  const member = card(record, { ...teams, userId: 'member', supervisedTeamId: null });
  assert.doesNotMatch(member, /Editar rascunho|>Assinar<|Marcar ciência/);
  assert.doesNotMatch(card(record, null), /Editar rascunho|>Assinar</);
  assert.match(source, /Promise\.allSettled\(\[listSupervisions\(\), loadTeams\(\)\]\)/);
  assert.match(source, /person\.memberTeamId === teams\.supervisedTeamId/);
  assert.match(source, /permissions\.status === 'fulfilled' \? permissions\.value : null/);
  assert.match(source, /teams\.isAdmin \|\| teams\.userId === record\.supervisor_id/);
});

test('assinado: só leitura, anula quem assinou/admin, ciência só própria e uma vez', () => {
  const signed = { ...record, status: 'assinado', signed_by: 'sup', signed_at: '2026-11-08T18:00:00Z' };
  assert.match(card(signed), />Anular</);
  assert.doesNotMatch(card(signed), /Editar rascunho|>Assinar<|Marcar ciência/);
  const self = { ...teams, userId: 'member', supervisedTeamId: null };
  assert.match(card(signed, self), /Marcar ciência/);
  assert.doesNotMatch(card(signed, self), />Anular<|Editar rascunho/);
  assert.doesNotMatch(card({ ...signed, supervisee_ack_at: '2026-11-08T19:00:00Z' }, self), /Marcar ciência/);
  assert.doesNotMatch(card({ ...signed, status: 'anulado' }, self), /Marcar ciência|Editar rascunho/);
});

test('SUP-3: conteúdo restrito não mostra paciente nem qualquer texto, mesmo se vier indevidamente no objeto', () => {
  const hidden = { ...record, status: 'anulado', content_restricted: true, patient_id: 'NAO-MOSTRAR-PACIENTE', agenda: 'NAO-MOSTRAR-PAUTA', decisions: 'NAO-MOSTRAR-DECISOES', void_reason: 'NAO-MOSTRAR-MOTIVO' };
  const html = card(hidden);
  assert.match(html, /Pauta restrita/);
  assert.match(html, /1 hora/);
  assert.match(html, /08\/11\/2026/);
  assert.doesNotMatch(html, /NAO-MOSTRAR|Ver registro|Paciente vinculado/);
  const signed = { ...hidden, status: 'assinado' };
  assert.match(card(signed, { ...teams, userId: 'member', supervisedTeamId: null }), /Marcar ciência/);
});

test('arquivado: 22023 vira explicação junto do botão; bloqueia assinatura, anulação e ciência até atualizar', () => {
  const error = api.supervisionErrorMessage({ code: '22023', message: 'Paciente arquivado não recebe escrita de supervisão.' });
  assert.match(error, /Paciente arquivado: aguarde a decisão da exclusão/);
  for (const [row, state, action] of [[record, teams, 'Assinar'], [{ ...record, status: 'assinado', signed_by: 'sup' }, teams, 'Anular'], [{ ...record, status: 'assinado' }, { ...teams, userId: 'member' }, 'Marcar ciência']]) {
    const html = card(row, state, { error });
    assert.match(html, /role="alert"/);
    assert.match(html, new RegExp(`<button[^>]+disabled=""[^>]*>${action}</button>`));
    assert.doesNotMatch(html, /22023/);
  }
});

test('validação: data real em São Paulo, futuro recusado, duração e campos fechados', () => {
  assert.equal(api.profileToday(new Date('2026-11-09T01:00:00Z')), '2026-11-08');
  assert.equal(api.supervisionDraftIssue(record, '2026-11-08'), '');
  assert.match(api.supervisionDraftIssue({ ...record, held_on: '2026-11-09' }, '2026-11-08'), /futura/);
  assert.match(api.supervisionDraftIssue({ ...record, held_on: '2026-02-31' }), /data válida/);
  for (const duration_minutes of [0, 601, 1.5, '']) assert.match(api.supervisionDraftIssue({ ...record, duration_minutes }), /duração/);
  assert.match(api.supervisionDraftIssue({ ...record, supervisee_id: '' }), /supervisionado/);
  assert.match(api.supervisionDraftIssue({ ...record, agenda: 'x'.repeat(12001) }), /12000/);
  assert.match(source, /max=\{profileToday\(\)\}/);
});

test('serviço: cinco RPCs com parâmetros exatos; só campos permitidos, sem autor/clínica, ciência sem revisão', async () => {
  const calls = [];
  db.rpc = async (fn, args) => { calls.push([fn, args]); return { data: fn === 'aba_list_supervisions' ? { records: [], totals: [] } : { id: record.id, revision: 8 }, error: null }; };
  await api.listSupervisions(); await api.listSupervisions('member');
  await api.saveSupervisionDraft({ ...record, clinic_id: 'indevido', created_by: 'indevido' }, 'evento-save');
  await api.signSupervision(record, 'evento-sign'); await api.ackSupervision(record, 'evento-ack'); await api.voidSupervision(record, '  Motivo fictício  ', 'evento-void');
  assert.deepEqual(calls[0], ['aba_list_supervisions', { p_supervisee_id: null }]);
  assert.deepEqual(calls[1], ['aba_list_supervisions', { p_supervisee_id: 'member' }]);
  assert.deepEqual(calls[2], ['aba_save_supervision_draft', { p_record: {
    id: record.id, revision: 7, client_event_id: 'evento-save', supervisee_id: 'member', patient_id: 'paciente-ficticio', held_on: record.held_on,
    duration_minutes: 60, modality: 'grupo', format: 'online', agenda: record.agenda, decisions: record.decisions,
  } }]);
  assert.deepEqual(calls[3], ['aba_sign_supervision', { p_id: record.id, p_revision: 7, p_client_event_id: 'evento-sign' }]);
  assert.deepEqual(calls[4], ['aba_ack_supervision', { p_id: record.id, p_client_event_id: 'evento-ack' }]);
  assert.deepEqual(calls[5], ['aba_void_supervision', { p_id: record.id, p_revision: 7, p_reason: 'Motivo fictício', p_client_event_id: 'evento-void' }]);
});

test('erros: conflito não fecha/limpa editor e não rebaseia revisão antiga; erro técnico nunca vira texto cru', async () => {
  for (const [code, message] of [['40001', 'Registro alterado'], ['42501', 'Acesso negado'], ['22023', 'Informe duração válida.'], ['23505', 'Este evento já foi registrado em outra supervisão. Recarregue.']]) {
    db.rpc = async () => ({ data: null, error: { code, message } });
    await assert.rejects(api.saveSupervisionDraft(record, 'evento'), error => {
      const text = api.supervisionErrorMessage(error);
      assert.doesNotMatch(text, /40001|42501|22023|23505/);
      if (code === '40001') assert.match(text, /texto foi mantido/);
      if (code === '22023' || code === '23505') assert.equal(text, message);
      return true;
    });
  }
  assert.doesNotMatch(api.supervisionErrorMessage(new Error('Failed to fetch')), /fetch/);
  const save = source.slice(source.indexOf('async function save(event)'), source.indexOf('return <SupervisionOverlay'));
  const failure = save.slice(save.indexOf('catch (failure)'));
  assert.doesNotMatch(failure, /onClose|onSaved|setDraft/);
  assert.match(source, /disabled=\{busy \|\| conflict \|\| archived\(error\)\}/);
  assert.match(source, /onClick=\{\(\) => void onRefresh\(\)\}/);
  assert.match(source, /useEffect\(\(\) => \{ target\.current\?\.focus\(\); \}, \[message\]\)/, 'erro do formulário recebe foco e não fica abaixo da parte visível');
  assert.match(source, /role="alert" tabIndex=\{-1\} ref=\{target\}/);
});

test('escritas: trava síncrona, UUID uma vez por registro/evento por ação, sucesso relê lista, confirmar assinatura/anulação', () => {
  assert.match(source, /id: crypto\.randomUUID\(\), revision: 0/);
  assert.match(source, /useState\(\(\) => initial \|\|/);
  assert.match(source, /await saveSupervisionDraft\(draft, crypto\.randomUUID\(\)\)/);
  assert.match(source, /if \(lock\.current \|\| conflict \|\| archived\(error\)\) return/);
  assert.match(source, /lock\.current = true; setBusy\(true\)/);
  assert.match(source, /setConfirming\(\{ record, action, eventId \}\)/);
  assert.match(source, /Confirmar assinatura/);
  assert.match(source, /Confirmar anulação/);
  assert.match(source, /reason\.trim\(\)\.length < 10/);
  assert.match(source, /await load\(\)/);
  assert.match(source, /useDismiss\(\{ onClose, busy, guardUnsaved: true, unsaved: dirty \}\)/);
});

test('navegação/ajuda/privacidade: Equipe sem paciente, nada da reunião no título/console, cartões até 1024', async () => {
  assert.match(workspace, /title: 'Equipe', tabs: \[TABS\.TIMES, TABS\.BIBLIOTECA, TABS\.SUPERVISAO, TABS\.REVISAO, TABS\.ALERTAS\]/);
  assert.match(workspace, /const TABS_WITHOUT_PATIENT = \[TABS\.HOME, TABS\.TIMES, TABS\.BIBLIOTECA, TABS\.SUPERVISAO, TABS\.REVISAO, TABS\.ALERTAS\]/);
  assert.match(workspace, /\[TABS\.SUPERVISAO\]: 'supervisao'/);
  assert.match(workspace, /if \(effectiveTab === TABS\.SUPERVISAO\) return <AbaSupervision \/>/);
  assert.doesNotMatch(source, /console\.|document\.title|localStorage|sessionStorage|title=\{[^}]*\.(?:agenda|decisions|void_reason)/);
  assert.doesNotMatch(card(), /<h[1-6][^>]*>[^<]*(?:Pauta exclusiva|Decisões exclusivas)/);
  assert.match(css, /@media \(max-width: 1024px\) \{\r?\n\s+\.aba-supervision-meta, \.aba-supervision-fields \{ grid-template-columns: minmax\(0, 1fr\)/);
  const { ABA_HELP } = await import('../../src/data/screenHelp.js');
  for (const key of ['title','summary','actions','reading','access','notes']) assert.ok(ABA_HELP.supervisao[key]);
});
