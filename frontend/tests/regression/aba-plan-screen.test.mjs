import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let server, api, screen, db, originalRpc;
const source = await readFile(path.join(root, 'src/components/aba/AbaPlan.jsx'), 'utf8');
const serviceSource = await readFile(path.join(root, 'src/services/abaService.js'), 'utf8');
const css = await readFile(path.join(root, 'src/styles/aba.css'), 'utf8');

before(async () => {
  server = await createServer({ root, logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' });
  api = await server.ssrLoadModule('/src/services/abaService.js');
  screen = await server.ssrLoadModule('/src/components/aba/AbaPlan.jsx');
  db = (await server.ssrLoadModule('/src/lib/supabase.js')).supabase;
  originalRpc = db.rpc;
  // Nenhuma leitura/escrita de produção: toda chamada deste teste é interceptada.
  db.rpc = async () => { throw new Error('RPC sem mock neste teste'); };
});
after(async () => { if (db) db.rpc = originalRpc; await server?.close(); });

const plan = {
  id: 'plano-1', version_no: 2, revision: 7, status: 'aprovado',
  authored_by: 'autora', approved_by: 'supervisora', submitted_at: '2026-11-07T12:00:00Z', approved_at: '2026-11-08T12:00:00Z',
  programs: [{ program_id: 'p1', revision: 3 }], summary: 'Resumo clínico revisado', review_due_on: '2026-12-08',
  program_snapshots: [{ program_id: 'p1', revision: 3, notes: 'Nota histórica', snapshot: {
    name: 'Nome congelado', type: 'aquisicao', status: 'em_ensino', trial_count: 5, collection_type: 'tentativas',
    definition: { objective: 'Objetivo congelado', criterion: 'Critério congelado' },
  } }],
};
const names = id => ({ autora: 'Autora do plano', supervisora: 'Supervisora responsável' }[id] || '—');
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));

test('versões: ordem decrescente sem mutar entrada e pluralização pt-BR', () => {
  const input = [{ version_no: 1 }, { version_no: 3 }, { version_no: 2 }];
  assert.deepEqual(api.orderedPlanVersions(input).map(row => row.version_no), [3, 2, 1]);
  assert.equal(input[0].version_no, 1);
  assert.equal(api.planProgramCount(1), '1 programa');
  assert.equal(api.planProgramCount(2), '2 programas');
  assert.equal(api.planProgramCount(0), '0 programas');
});

test('cartões: autoria/envio/aprovação e destaque do vigente, sem remetente inventado', () => {
  const html = render(screen.AbaPlanVersionCard, { plan, canSupervise: true, professionalName: names });
  assert.match(html, /is-current/);
  for (const text of ['Versão 2', 'Aprovado vigente', 'Autoria', 'Autora do plano', 'Envio para revisão', 'Supervisora responsável', 'Aprovado em', '1 programa']) assert.ok(html.includes(text), text);
  assert.match(html, /<dt>Enviado por<\/dt><dd>—<\/dd>/);
  assert.doesNotMatch(html, /items|undefined/i);
  assert.match(source, /versions\.map\(plan =>/);
});

test('ações por estado e permissão: só supervisão aprova/anula, histórico só leitura', () => {
  for (const canSupervise of [true, false]) {
    for (const status of ['rascunho', 'em_revisao', 'aprovado', 'substituido', 'anulado']) {
      const html = render(screen.AbaPlanVersionCard, { plan: { ...plan, status, void_reason: 'Motivo registrado' }, canSupervise, professionalName: names });
      assert.equal(/>Aprovar<\/button>/.test(html), canSupervise && status === 'em_revisao', `${status}/${canSupervise}: aprovar`);
      assert.equal(/>Anular<\/button>/.test(html), canSupervise && ['rascunho', 'em_revisao', 'aprovado'].includes(status), `${status}/${canSupervise}: anular`);
      assert.equal(/Editar \/ enviar para revisão/.test(html), status === 'rascunho', `${status}: editar`);
      if (status === 'anulado') assert.match(html, /Motivo da anulação: Motivo registrado/);
    }
  }
  assert.match(source, /const canSupervise = data\.permissions\.canSupervise/);
  assert.match(source, /confirmation && canSupervise && <PlanConfirmation/);
  assert.match(source, /versão aprovada anterior vira substituída/);
  assert.match(source, /paciente fica sem plano vigente/);
  assert.match(source, /reason\.trim\(\)\.length < 10/);
});

test('rascunho: programa e resumo exigidos antes de enviar, sem gerar conteúdo clínico', () => {
  assert.match(api.planDraftIssue({ programs: [], summary: 'Texto' }), /Escolha ao menos um programa/);
  assert.match(api.planDraftIssue({ programs: [{}], summary: ' \n ' }), /Preencha o resumo/);
  assert.equal(api.planDraftIssue({ programs: [{}], summary: 'Escrito pela profissional' }), '');
  assert.match(source, /const issue = planDraftIssue\(draft\);\r?\n\s+if \(issue\)/);
  assert.match(source, /program_id: program\.id, revision: program\.revision/);
  assert.match(source, /const approved = versions\.find\(plan => plan\.status === 'aprovado'\)/);
  assert.match(source, /summary: approved\?\.summary \|\| ''/);
  assert.doesNotMatch(source, /gemini|generateContent|localStorage|abaLibrary/);
});

test('serviços: cinco RPCs pelo call existente, CAS e evento explícito sem acesso direto', async () => {
  const calls = [];
  db.rpc = async (fn, args) => { calls.push({ fn, args }); return { data: fn === 'aba_list_plan_versions' ? [{ version_no: 1 }, { version_no: 2 }] : 'id', error: null }; };
  assert.deepEqual((await api.listPlanVersions('paciente')).map(row => row.version_no), [2, 1]);
  const draft = { id: 'id', revision: 0, programs: plan.programs, summary: 'Texto humano', review_due_on: '' };
  await api.savePlanDraft('paciente', draft, 'evento-salvar');
  await api.submitPlan('paciente', { ...draft, revision: 1 }, 'evento-enviar');
  await api.approvePlan('paciente', { ...draft, revision: 2 }, 'evento-aprovar');
  await api.voidPlan('paciente', { ...draft, revision: 3 }, 'evento-anular', ' Motivo suficiente ');
  assert.deepEqual(calls.map(item => item.fn), ['aba_list_plan_versions', 'aba_save_plan_draft', 'aba_submit_plan', 'aba_approve_plan', 'aba_void_plan']);
  assert.deepEqual(calls[1].args.p_plan, { ...draft, client_event_id: 'evento-salvar', review_due_on: null });
  for (const [index, event] of [[2, 'evento-enviar'], [3, 'evento-aprovar'], [4, 'evento-anular']]) {
    assert.equal(calls[index].args.p_client_event_id, event);
    assert.equal(calls[index].args.p_revision, index - 1);
    assert.equal(calls[index].args.p_patient_id, 'paciente');
  }
  assert.equal(calls[4].args.p_reason, 'Motivo suficiente');
  for (const action of ['savePlanDraft(patientId, draft, newId())', 'submitPlan(patientId, draft, newId())', 'approvePlan(patientId, plan, newId())', 'voidPlan(patientId, plan, newId(), reason)']) assert.ok(source.includes(action), action);
  assert.match(source, /if \(lock\.current\) return/);
  assert.match(source, /disabled=\{busy \|\| dirty \|\| !draft\.revision\}/);
  assert.doesNotMatch(serviceSource.slice(serviceSource.indexOf('// ---------- plano terapêutico')), /\.from\(|supabase\.rpc/);
});

test('erros: conflito/permissão/duplicação/dados viram mensagem pt-BR, nunca inglês ou código cru', async () => {
  const cases = [
    [{ code: '40001', message: 'serialization failure' }, /alterado por outra pessoa.*Recarregue/],
    [{ code: '42501', message: 'permission denied' }, /não tem permissão/],
    [{ code: '23505', message: 'duplicate key value' }, /já foi registrada/],
    [{ code: '22023', message: 'invalid input syntax' }, /Confira os dados/],
  ];
  for (const [error, expected] of cases) {
    db.rpc = async () => ({ data: null, error });
    try { await api.approvePlan('paciente', plan, 'evento'); assert.fail('RPC deveria recusar'); }
    catch (failure) {
      const text = api.planErrorMessage(failure);
      assert.match(text, expected);
      assert.doesNotMatch(text, /40001|42501|23505|22023|permission denied|syntax|constraint/i);
    }
  }
});

test('documento: só cópia congelada, nota histórica, estado real e escape de conteúdo', () => {
  const html = render(screen.AbaPlanDocument, { plan, patient: { name: 'Paciente <teste>' }, professionalName: names,
    data: { programs: [{ id: 'p1', name: 'Nome ATUAL', objective: 'Objetivo ATUAL' }] } });
  for (const text of ['Nome congelado', 'Objetivo congelado', 'Critério congelado', 'Nota histórica', 'revisão 3', 'Paciente &lt;teste&gt;']) assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /Nome ATUAL|Objetivo ATUAL/);
  const annulled = render(screen.AbaPlanDocument, { plan: { ...plan, status: 'anulado', void_reason: '<script>teste</script>' }, patient: { name: 'Paciente' }, professionalName: names });
  assert.match(annulled, /Anulado/);
  assert.match(annulled, /&lt;script&gt;/);
  assert.doesNotMatch(annulled, /<script>/);
  const frozen = source.slice(source.indexOf('function FrozenPrograms'), source.indexOf('export function AbaPlanDocument'));
  assert.match(frozen, /plan\.program_snapshots/);
  assert.doesNotMatch(frozen, /data\.programs|programFromDb/);
});

// Regressão (QA, 08/11/2026): o texto era cortado a cada 450 caracteres no meio da palavra,
// e "Reduzir 50%" podia sair como "Reduzir 5" num parágrafo e "0%" no outro (tela e papel).
test('texto longo: parágrafos só quebram em espaço ou na quebra de linha da pessoa, nunca no meio da palavra', () => {
  const words = Array.from({ length: 160 }, (_, index) => `palavra${index} Reduzir 50%`);
  const summary = `${words.join(' ')}\r\nSegunda linha escrita pela pessoa\n\nDepois de uma linha em branco`;
  const html = render(screen.AbaPlanDocument, { plan: { ...plan, summary, program_snapshots: [] }, patient: { name: 'Paciente' }, professionalName: names });
  const paragraphs = [...html.matchAll(/<p class="aba-plan-text">([\s\S]*?)<\/p>/g)].map(match => match[1].replace(/&nbsp;| /g, ''));
  const resumo = paragraphs; // o plano de exemplo não tem approval_statement: só o resumo usa .aba-plan-text
  assert.ok(resumo.length > 3, 'texto longo vira vários parágrafos para o paginador');
  for (const chunk of resumo) assert.ok(chunk.length <= 450, `parágrafo com ${chunk.length} caracteres`);
  const firstLine = resumo.slice(0, resumo.indexOf('Segunda linha escrita pela pessoa'));
  assert.equal(firstLine.join(' '), words.join(' '), 'juntando com espaço volta o texto original: nenhum corte no meio da palavra');
  for (const chunk of firstLine) assert.doesNotMatch(chunk, /^\s|\s$/, 'sem espaço sobrando nas pontas');
  assert.ok(resumo.includes('Segunda linha escrita pela pessoa'), 'quebra de linha da pessoa vira parágrafo');
  assert.ok(resumo.includes('Depois de uma linha em branco'));
  const giant = render(screen.AbaPlanDocument, { plan: { ...plan, summary: 'x'.repeat(1000), program_snapshots: [] }, patient: { name: 'P' }, professionalName: names });
  const giantText = [...giant.matchAll(/<p class="aba-plan-text">([\s\S]*?)<\/p>/g)].map(match => match[1]);
  assert.equal(giantText.join(''), 'x'.repeat(1000), 'palavra gigante sem espaço não perde caractere');
  assert.ok(giantText.every(chunk => chunk.length <= 450));
});

test('impressão: timbrado, paginação e mesma tipografia no palco invisível, sem cor pessoal', () => {
  assert.match(source, /<PrintLetterhead/);
  assert.match(source, /new Date\(plan\.approved_at\)\.toLocaleDateString\('pt-BR'\)/);
  assert.match(source, /paginateReportBody\(source\.current\?\.innerHTML/);
  assert.match(source, /ref=\{stage\} className="rpage-body aba-plan-print-body"/);
  assert.match(source, /className="rpage-body aba-plan-print-body" style=/);
  assert.match(source, /\['aprovado', 'substituido', 'anulado'\]\.includes\(plan\.status\)/);
  assert.match(css, /\.aba-plan-print \{[^}]*--clinic-accent: #222;[^}]*filter: grayscale\(1\)/);
  assert.doesNotMatch(source, /accent_color|brand_color|--r1-accent/);
});

test('navegação: grupo Plano, paciente como key e celular/tablet até 1024px sem larguras fixas', async () => {
  const workspace = await readFile(path.join(root, 'src/components/AbaWorkspace.jsx'), 'utf8');
  assert.match(workspace, /PLANO: 'Plano terapêutico'/);
  assert.match(workspace, /title: 'Plano', tabs: \[TABS\.PERFIL, TABS\.PROGRAMAS, TABS\.PLANO, TABS\.REPERTORIO\]/);
  assert.match(workspace, /\[TABS\.PLANO\]: 'plano'/);
  assert.match(workspace, /<AbaPlan key=\{selectedPatient\.id\}/);
  assert.match(source, /<HubBackButton nested label="Voltar aos planos"/);
  assert.match(source, /useDismiss\(\{ onClose, busy, guardUnsaved: true, unsaved: dirty \}\)/);
  assert.match(source, /onClick=\{dismiss\.requestDismiss\}/);
  assert.match(source, /\{\.\.\.dismiss\.panelProps\}/);
  assert.match(source, /dismiss\.markSaved\(\)/);
  assert.match(source, /savedRevision=\{draft\.revision\}/);
  const added = css.slice(css.indexOf('/* ---------- Plano terapêutico versionado'));
  assert.match(added, /@media \(max-width: 1024px\)/);
  assert.match(added, /grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(added, /overflow-wrap: anywhere/);
  assert.doesNotMatch(added, /min-width:\s*(?:3[6-9]\d|[4-9]\d\d)px|\b\d+(?:vh|dvh|svh)\b/);
});


test('remetente: mostra submitted_by e não confunde autoria com quem enviou', () => {
  const professionalName = id => id === 'remetente' ? 'Profissional que enviou' : names(id);
  const submitted = { ...plan, submitted_by: 'remetente' };
  const html = render(screen.AbaPlanVersionCard, { plan: submitted, canSupervise: false, professionalName });
  assert.match(html, /<dt>Autoria<\/dt><dd>Autora do plano<\/dd>/);
  assert.match(html, /<dt>Enviado por<\/dt><dd>Profissional que enviou<\/dd>/);
  const document = render(screen.AbaPlanDocument, { plan: submitted, patient: { name: 'Paciente' }, professionalName });
  assert.match(document, /Enviado por: Profissional que enviou/);
  const missing = render(screen.AbaPlanDocument, { plan, patient: { name: 'Paciente' }, professionalName });
  assert.match(missing, /Enviado por: —/);
});

test('22023: preserva mensagem de validação pt-BR do banco e mantém filtro de mensagem técnica', async () => {
  for (const message of ['Só o rascunho pode ser editado. Crie outra versão.', 'Paciente arquivado não recebe plano.', 'Cada programa entra uma única vez no plano.']) {
    db.rpc = async () => ({ data: null, error: { code: '22023', message } });
    try { await api.approvePlan('paciente', plan, 'evento'); assert.fail('deveria recusar'); }
    catch (failure) { assert.equal(api.planErrorMessage(failure), message); }
  }
  assert.doesNotMatch(api.planErrorMessage({ code: '22023', message: 'invalid input syntax' }), /invalid|syntax/);
});

test('ajuda: ABA_HELP.plano alimenta o Como funciona existente e explica o remetente histórico', async () => {
  const help = await server.ssrLoadModule('/src/data/screenHelp.js');
  const { ScreenHelp } = await server.ssrLoadModule('/src/components/ui/ScreenHelp.jsx');
  const topic = help.ABA_HELP.plano;
  assert.equal(topic.title, 'Plano terapêutico');
  for (const { key } of help.HELP_SECTIONS) assert.ok(topic[key]?.length, key);
  const text = Object.values(topic).flat().join(' ');
  for (const label of ['Nova versão', 'Salvar rascunho', 'Enviar para revisão', 'Aprovar', 'Anular', 'Enviado por', 'Imprimir versão']) assert.ok(text.includes(label), label);
  assert.match(text, /envios anteriores.*autoria/);
  assert.match(render(ScreenHelp, { topic }), /Como funciona/);
  const workspace = await readFile(path.join(root, 'src/components/AbaWorkspace.jsx'), 'utf8');
  assert.match(workspace, /\[TABS\.PLANO\]: 'plano'/);
  assert.match(workspace, /ABA_HELP\[HELP_BY_TAB\[effectiveTab\]\]/);
  assert.match(workspace, /<ScreenHelp topic=\{helpTopic\}/);
});
