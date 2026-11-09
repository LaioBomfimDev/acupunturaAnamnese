import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = await readFile(path.join(root, 'src/components/aba/AbaProfile.jsx'), 'utf8');
const workspace = await readFile(path.join(root, 'src/components/AbaWorkspace.jsx'), 'utf8');
const css = await readFile(path.join(root, 'src/styles/aba.css'), 'utf8');
let server, api, screen, help, db, originalRpc;
before(async () => {
  server = await createServer({ root, logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' });
  api = await server.ssrLoadModule('/src/services/abaService.js');
  screen = await server.ssrLoadModule('/src/components/aba/AbaProfile.jsx');
  help = (await server.ssrLoadModule('/src/data/screenHelp.js')).ABA_HELP;
  db = (await server.ssrLoadModule('/src/lib/supabase.js')).supabase;
  originalRpc = db.rpc;
  db.rpc = async () => { throw new Error('RPC sem mock neste teste'); };
});
after(async () => { if (db) db.rpc = originalRpc; await server?.close(); });
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));
const profile = {
  revision: 7, communication_mode: ['vocal', 'caa_baixa'], support_level: '2',
  diagnosis: { text: 'Transcrição fictícia <script>não executar</script>', source: 'Laudo fictício', issued_on: '2026-11-07' },
  details: 'Detalhe fictício\nSegunda linha', updated_by: 'supervisora', updated_at: '2026-11-08T15:00:00Z',
};

test('NULL é estado vazio, preencher/editar somente para supervisão; membro só leitura', () => {
  for (const canSupervise of [true, false]) {
    const empty = render(screen.AbaProfileView, { value: null, canSupervise });
    assert.match(empty, /Ainda não há perfil/);
    assert.equal(empty.includes('Preencher perfil</button>'), canSupervise);
    const filled = render(screen.AbaProfileView, { value: profile, canSupervise });
    assert.equal(filled.includes('Editar perfil</button>'), canSupervise);
    if (!canSupervise) assert.doesNotMatch(filled, /<button|<input|<textarea|Salvar perfil/);
  }
  assert.match(source, /const canSupervise = data\.permissions\.canSupervise/);
  assert.match(source, /editing && canSupervise/);
});

test('leitura mostra laudo com fonte/data, detalhes e carimbo sem HTML executável', () => {
  const html = render(screen.AbaProfileView, { value: profile, professionalName: () => 'Supervisora fictícia' });
  for (const text of ['Fala vocal', 'CAA de baixa tecnologia', 'Nível 2', 'Laudo fictício', '07/11/2026', 'Supervisora fictícia', 'Revisão 7', 'Detalhe fictício']) assert.ok(html.includes(text), text);
  assert.ok(html.includes('&lt;script&gt;'));
  assert.doesNotMatch(html, /<script>|undefined|caa_baixa/);
  const blank = render(screen.AbaProfileView, { value: { revision: 1 } });
  assert.match(blank, /Não informada/);
  assert.doesNotMatch(blank, /Invalid Date|undefined/);
});

test('códigos fechados, todos com rótulo pt-BR, sem preencher diagnóstico por inferência', () => {
  assert.deepEqual(Object.keys(api.PROFILE_COMMUNICATION), ['vocal', 'pecs', 'caa_alta', 'caa_baixa', 'sinais', 'gestos', 'misto']);
  assert.deepEqual(Object.values(api.PROFILE_COMMUNICATION), ['Fala vocal', 'PECS', 'CAA de alta tecnologia', 'CAA de baixa tecnologia', 'Sinais', 'Gestos', 'Misto']);
  assert.deepEqual(Object.values(api.PROFILE_SUPPORT), ['Nível 1', 'Nível 2', 'Nível 3', 'Não informado']);
  const html = render(screen.AbaProfileEditor, { patientId: 'fictício' });
  assert.match(html, /<textarea[^>]*autoComplete="off"[^>]*><\/textarea>/);
  assert.match(html, /autoComplete="off"/);
  assert.match(html, /value="nao_informado" selected/);
  assert.doesNotMatch(source, /datalist|placeholder=|gemini|generateContent|suggest|localStorage|sessionStorage|console\.|dangerouslySetInnerHTML/i);
});

test('data máxima é o dia em São Paulo, inclusive na virada UTC', () => {
  assert.equal(api.profileToday(new Date('2026-11-09T01:00:00Z')), '2026-11-08');
  assert.equal(api.profileToday(new Date('2026-11-09T03:00:00Z')), '2026-11-09');
  assert.match(source, /type="date" max=\{profileToday\(\)\}/);
  assert.match(source, /const issue = profileDraftIssue\(draft\);\r?\n\s+if \(issue\)/);
});

test('validação exige laudo completo, data real não futura, sem exigir laudo ausente', () => {
  const today = '2026-11-08';
  assert.equal(api.profileDraftIssue({ details: '' }, today), '');
  assert.equal(api.profileDraftIssue({ diagnosis: { text: '', source: '', issued_on: '' } }, today), '');
  assert.equal(api.profileDraftIssue(profile, today), '');
  for (const key of ['text', 'source', 'issued_on']) assert.match(api.profileDraftIssue({ ...profile, diagnosis: { ...profile.diagnosis, [key]: '' } }, today), /exige texto, fonte e data/);
  for (const issued_on of ['2026-02-30', '2026-13-01', '2026-1-1', 'inválida']) assert.equal(api.profileDraftIssue({ ...profile, diagnosis: { ...profile.diagnosis, issued_on } }, today), 'Data do laudo inválida.');
  assert.equal(api.profileDraftIssue({ ...profile, diagnosis: { ...profile.diagnosis, issued_on: '2026-11-09' } }, today), 'Data do laudo não pode ser futura.');
  assert.equal(api.profileDraftIssue({ ...profile, diagnosis: { ...profile.diagnosis, issued_on: today } }, today), '');
  assert.match(api.profileDraftIssue({ ...profile, details: 'a'.repeat(12001) }, today), /12000/);
  assert.match(api.profileDraftIssue({ ...profile, diagnosis: { ...profile.diagnosis, text: 'a'.repeat(6001) } }, today), /6000/);
  assert.match(api.profileDraftIssue({ ...profile, diagnosis: { ...profile.diagnosis, source: 'a'.repeat(1001) } }, today), /1000/);
});

test('serviço só RPCs autorizadas, NULL preservado, CAS e evento sem campos de autoridade', async () => {
  const calls = [];
  db.rpc = async (fn, args) => { calls.push({ fn, args }); return { data: fn === 'aba_get_profile' ? null : { revision: 1 }, error: null }; };
  assert.equal(await api.getPatientProfile('paciente-fictício'), null);
  await api.savePatientProfile('paciente-fictício', { ...profile, revision: 0, clinic_id: 'forjada', updated_by: 'forjado' }, 'evento-1');
  assert.equal(calls[0].fn, 'aba_get_profile');
  assert.deepEqual(calls[0].args, { p_patient_id: 'paciente-fictício' });
  assert.equal(calls[1].fn, 'aba_save_profile');
  assert.deepEqual(calls[1].args, { p_patient_id: 'paciente-fictício', p_profile: {
    revision: 0, client_event_id: 'evento-1', communication_mode: profile.communication_mode, support_level: '2', diagnosis: profile.diagnosis, details: profile.details,
  } });
  await api.savePatientProfile('paciente-fictício', { ...profile, diagnosis: { text: '', source: '', issued_on: '' }, details: '' }, 'evento-2');
  assert.equal(calls[2].args.p_profile.diagnosis, null);
  assert.equal(calls[2].args.p_profile.details, null);
  assert.equal(calls[2].args.p_profile.revision, 7);
  assert.equal(calls[2].args.p_profile.client_event_id, 'evento-2');
});

test('erros do banco preservam texto pt-BR da 011 e conflitos pedem recarga', async () => {
  for (const message of ['Paciente arquivado não recebe perfil.', 'Data do laudo não pode ser futura.', 'Comunicação aceita somente os códigos previstos, sem repetição.', 'Laudo exige texto (até 6000 caracteres), fonte (até 1000) e data.']) {
    db.rpc = async () => ({ data: null, error: { code: '22023', message } });
    await assert.rejects(api.savePatientProfile('fictício', profile, 'evento'), error => api.profileErrorMessage(error) === message);
  }
  db.rpc = async () => ({ data: null, error: { code: '40001', message: 'Perfil alterado por outra pessoa.' } });
  await assert.rejects(api.savePatientProfile('fictício', profile, 'evento'), error => /alterado por outra pessoa\. Recarregue/.test(api.profileErrorMessage(error)));
  assert.match(api.profileErrorMessage({ code: '42501' }), /não tem permissão/);
  assert.doesNotMatch(api.profileErrorMessage({ code: '22023', message: 'invalid input syntax SQL' }), /invalid|syntax|SQL/);
  assert.doesNotMatch(api.profileErrorMessage(new Error('network error')), /network error/);
});

test('ação trava antes da RPC, usa evento novo e conflito impede repetir CAS velho', () => {
  assert.match(source, /if \(lock\.current \|\| conflict\) return/);
  assert.match(source, /lock\.current = true; setBusy\(true\);[\s\S]*?await savePatientProfile\(patientId, draft, newId\(\)\)/);
  assert.match(source, /finally \{ lock\.current = false; setBusy\(false\); \}/);
  assert.match(source, /disabled=\{busy \|\| conflict\}/);
  assert.match(source, /setConflict\(failure\.code === 'conflict' \|\| failure\.code === '40001'\)/);
  assert.match(source, /onSaved=\{saved\} onCancel=\{reload\}/);
  assert.match(source, /function saved\(\) \{ setNotice\('Perfil salvo\.'\); reload\(\); \}/);
  assert.match(source, /setDiscarding\(true\)/);
  assert.match(source, /Descartar as alterações não salvas do perfil\?/);
  assert.match(source, /onClick=\{onCancel\}>Descartar alterações/);
  assert.doesNotMatch(source, /window\.confirm/);
});

test('aba Perfil no grupo Plano, isolada por paciente, ajuda completa e sem SQL novo', () => {
  assert.match(workspace, /title: 'Plano', tabs: \[TABS\.PERFIL,/);
  assert.match(workspace, /\[TABS\.PERFIL\]: 'perfil'/);
  assert.match(workspace, /<AbaProfile key=\{selectedPatient\.id\} patient=\{selectedPatient\} data=\{data\}/);
  assert.equal(help.perfil.title, 'Perfil ABA');
  for (const key of ['summary', 'actions', 'reading', 'access', 'notes']) assert.ok(help.perfil[key]?.length, key);
  assert.ok(help.perfil.notes.some(text => text.includes('não sugere nem completa')));
});

test('layout do perfil até 1024px em uma coluna e cinco metadados do plano no computador', () => {
  assert.match(css, /\.aba-plan-meta \{[^}]*grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 1024px\) \{\r?\n\s+\.aba-profile-meta, \.aba-profile-choices \{ grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /\.aba-profile-form input, \.aba-profile-form textarea, \.aba-profile-form select \{[^}]*min-width: 0; max-width: 100%; width: 100%/);
  assert.match(css, /\.aba-profile \{[^}]*overflow-wrap: anywhere/);
});
