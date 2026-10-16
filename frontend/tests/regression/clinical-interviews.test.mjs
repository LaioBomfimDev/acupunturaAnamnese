// ============================================================
// Entrevistas clínicas (aba Entrevistas da Psicologia, 16/10/2026).
// Pedido da administradora: anamnese que se responde no consultório ou
// se envia para responder, como as escalas, mas sem nota; tela de
// respostas no visual das escalas e impressão no papel timbrado.
// Decisões: motor dos formulários, link só de quem responde (a pessoa
// próxima não entra pela Área do Paciente, que é do paciente) e as
// perguntas transcritas do modelo que a clínica mandou.
// ============================================================

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const repo = path.resolve(root, '..');
const MIGRATIONS = path.join(repo, 'supabase/migrations');
const MIGRATION = path.join(MIGRATIONS, '20261016_clinical_interviews.sql');
const read = rel => readFile(path.join(root, rel), 'utf8');

let catalog;
let utils;
let forms;
let back;
let server;
let Runner;

before(async () => {
  catalog = await import(pathToFileURL(path.join(root, 'src/data/clinicalInterviews.js')).href);
  utils = await import(pathToFileURL(path.join(root, 'src/utils/clinicalInterviews.js')).href);
  forms = await import(pathToFileURL(path.join(root, 'src/utils/patientForms.js')).href);
  back = await import(pathToFileURL(path.join(repo, 'supabase/functions/_shared/patientFormAnswers.ts')).href);
  server = await createServer({ root, logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' });
  ({ PatientFormRunner: Runner } = await server.ssrLoadModule('/src/components/patientForms/PatientFormRunner.jsx'));
});

after(async () => {
  await server?.close();
});

const interview = () => catalog.getInterview('ecologica_adulto_heterorrelato');

// ---------- conteúdo: igual ao modelo da clínica ----------

test('entrevista ecológica: 48 perguntas em 9 partes, com as 6 alternativas do modelo', () => {
  const item = interview();
  assert.ok(item, 'entrevista no catálogo');
  assert.equal(item.respondent, 'informante');
  assert.equal(item.discipline, 'psicologia');
  assert.deepEqual(catalog.INTERVIEW_FREQUENCY_OPTIONS, [
    'Nunca', 'Raramente', 'Às vezes', 'Frequentemente', 'Quase sempre', 'Não sei observar',
  ]);
  assert.deepEqual(item.sections.map(section => section.title), [
    '1. Comunicação e interação social',
    '2. Flexibilidade, sensorialidade e padrões repetitivos',
    '3. Atenção e funções executivas',
    '4. Hiperatividade e impulsividade',
    '5. Regulação emocional e expressão comportamental',
    '6. Ansiedade, humor e relações interpessoais',
    '7. Comportamentos associados e saúde',
    '8. Autonomia e impacto funcional',
    '9. Persistência, evolução e contextos',
  ]);
  assert.deepEqual(item.sections.map(section => section.items.length), [6, 6, 7, 5, 5, 6, 5, 5, 3]);
  assert.equal(catalog.interviewItemCount(item), 48);

  const all = item.sections.flatMap(section => section.items);
  assert.equal(all[0], 'Tem dificuldade para manter conversas com troca equilibrada de falas?');
  assert.equal(all[33], 'Já apresentou períodos distintos de vários dias com energia ou atividade muito aumentada e necessidade de sono reduzida, fora do seu padrão habitual?');
  assert.equal(all[47], 'Houve surgimento recente ou piora importante dos comportamentos após estresse, adoecimento, perdas ou mudanças significativas?');
  assert.equal(new Set(all).size, 48, 'nenhuma pergunta repetida');

  assert.deepEqual(item.identification.map(field => field.label), ['Informante', 'Parentesco/vínculo', 'Frequência de convivência']);
  assert.deepEqual(item.identification[2].options, ['Diária', 'Algumas vezes por semana', 'Ocasional']);
  assert.deepEqual(item.complementary.questions.map(field => [field.id, field.type, (field.options || []).length]), [
    ['ambientes', 'multiple', 6],
    ['impacto', 'single', 5],
    ['evolucao', 'single', 5],
    ['mudancas', 'multiple', 8],
    ['exemplos', 'long_text', 0],
    ['observacoes', 'long_text', 0],
  ]);
  assert.match(item.technicalNote, /Não possui escore, ponto de corte ou validação psicométrica/);
});

test('perguntas no formato dos formulários: número do roteiro, identificação e complementares sem número', () => {
  const questions = catalog.buildInterviewQuestions(interview());
  const numbered = questions.filter(question => question.number);
  assert.equal(numbered.length, 48);
  numbered.forEach((question, index) => {
    assert.equal(question.number, index + 1);
    assert.equal(question.id, `q${String(index + 1).padStart(2, '0')}`);
    assert.equal(question.type, 'single');
    assert.equal(question.required, true);
    assert.equal(question.lettered, true);
    assert.deepEqual(question.options, catalog.INTERVIEW_FREQUENCY_OPTIONS);
  });
  for (const id of ['informante', 'vinculo', 'convivencia', 'ambientes', 'exemplos']) {
    assert.equal(questions.find(question => question.id === id).unnumbered, true, id);
  }
  assert.equal(questions.filter(question => question.type === 'section').length, 11, 'identificação + 9 partes + complementar');
  assert.equal(new Set(questions.map(question => question.id)).size, questions.length, 'ids únicos');
  assert.deepEqual(forms.validateForm({ title: interview().title, description: '', questions }, { forPublish: true }), []);
});

test('servidor e tela limpam as respostas da entrevista do mesmo jeito', () => {
  const questions = catalog.buildInterviewQuestions(interview());
  const raw = { informante: 'Rita', vinculo: 'Mãe', convivencia: 'Diária', q01: 'Nunca', q02: 'Talvez', ambientes: ['Casa', 'Lua'], invasor: 'x' };
  const front = forms.sanitizeAnswers(questions, raw);
  assert.deepEqual(back.sanitizeAnswers(questions, raw), front);
  assert.equal(front.q01, 'Nunca');
  assert.equal(front.q02, undefined, 'alternativa que não existe sai');
  assert.deepEqual(front.ambientes, ['Casa']);
  assert.equal(front.invasor, undefined);
  assert.equal(back.missingRequired(questions, front).length, 47, 'faltam as outras 47 do roteiro');
});

test('formulário numera pelo roteiro: a pergunta 1 é a 1, não a 4', () => {
  const questions = catalog.buildInterviewQuestions(interview());
  const answers = { informante: 'Rita', vinculo: 'Mãe', convivencia: 'Diária' };
  const html = renderToStaticMarkup(React.createElement(Runner, { questions, answers, onAnswersChange() {} }));
  assert.match(html, /Parte 1 de 11/);
  assert.doesNotMatch(html, /pq-number/, 'identificação sem número');
  // Comum continua contando 1, 2...
  const plain = renderToStaticMarkup(React.createElement(Runner, {
    questions: [{ id: 'a', type: 'short_text', label: 'A' }, { id: 'b', type: 'short_text', label: 'B' }],
    answers: {},
    onAnswersChange() {},
  }));
  assert.match(plain, /<span class="pq-number">1\.<\/span>A/);
  assert.match(plain, /<span class="pq-number">2\.<\/span>B/);
});

// ---------- regras da tela ----------

test('link: token depois do "#", 48 letras de 0-9a-f, mensagem sem o nome do paciente', () => {
  const token = 'a'.repeat(48);
  assert.equal(utils.interviewLinkUrl('https://app.exemplo.com/', token), `https://app.exemplo.com/entrevista#${token}`);
  assert.equal(utils.tokenFromHash(`#${token.toUpperCase()}`), token);
  assert.equal(utils.tokenFromHash('#abc'), '');
  assert.equal(utils.tokenFromHash(`#${'g'.repeat(48)}`), '');
  const message = utils.buildInterviewLinkMessage({ recipientLabel: 'Rita (mãe)', clinicName: 'Clínica X', link: 'L' });
  assert.match(message, /^Olá, Rita!/);
  assert.match(message, /Acesse: L/);
  assert.doesNotMatch(message, /TEA|TDAH|neurocomportamental/i, 'assunto fora da mensagem');
});

test('situação de cada envio e quem respondeu', () => {
  const now = new Date('2026-10-16T12:00:00Z');
  const link = { channel: 'link', status: 'pending', recipientLabel: 'Mãe', linkExpiresAt: '2026-10-20T00:00:00Z', progress: 0 };
  assert.equal(utils.interviewState(link, now).key, 'waiting');
  assert.equal(utils.interviewState({ ...link, status: 'in_progress', progress: 40 }, now).label, 'Respondendo · 40%');
  assert.equal(utils.interviewState({ ...link, linkExpiresAt: '2026-10-10T00:00:00Z' }, now).key, 'expired');
  assert.equal(utils.interviewState({ ...link, status: 'cancelled' }, now).key, 'cancelled');
  assert.equal(utils.interviewState({ ...link, status: 'submitted', voidedAt: '2026-10-15' }, now).key, 'voided');
  assert.equal(utils.isOpenLink(link, now), true);
  assert.equal(utils.isOpenLink({ ...link, linkExpiresAt: '2026-10-10T00:00:00Z' }, now), false);

  const answered = { channel: 'link', recipientLabel: 'Mãe', answers: { informante: 'Rita Moura', vinculo: 'Mãe' } };
  assert.equal(utils.respondentLine(answered), 'Rita Moura (Mãe)');
  assert.equal(utils.respondentLine({ channel: 'consultorio', answers: {} }), 'Respondida no consultório');

  const sorted = utils.sortInterviewResponses([
    { id: 'velha', submittedAt: '2026-10-01' },
    { id: 'link', createdAt: '2026-10-15' },
    { id: 'nova', submittedAt: '2026-10-12' },
  ]);
  assert.deepEqual(sorted.map(item => item.id), ['link', 'nova', 'velha']);
  assert.equal(utils.ageAt('1992-03-12', '2026-10-14T12:00:00Z'), 34);
  assert.equal(utils.ageAt('1992-10-20', '2026-10-14T12:00:00Z'), 33);
});

test('respostas para ler: sem a identificação, com o número do roteiro e destaque sem nota', () => {
  const questions = catalog.buildInterviewQuestions(interview());
  const rows = utils.buildInterviewRows(questions, { informante: 'Rita', q01: 'Quase sempre', q02: 'Não sei observar', q03: 'Nunca' });
  assert.ok(!rows.some(row => row.id === 'informante'), 'identificação vai no cabeçalho');
  assert.ok(!rows.some(row => row.id === 'identificacao'), 'parte vazia some');
  const byId = new Map(rows.map(row => [row.id, row]));
  assert.equal(byId.get('q01').number, 1);
  assert.equal(byId.get('q01').tone, 'frequent');
  assert.equal(byId.get('q02').tone, 'unknown');
  assert.equal(byId.get('q03').tone, 'plain');
  assert.equal(byId.get('q04').tone, 'empty');
  assert.equal(utils.answeredSummary(rows).label, '3 de 48 perguntas');
});

// ---------- banco ----------

function functionBody(sql, name) {
  const match = sql.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\$${name}\\$;`));
  assert.ok(match, `função ${name}`);
  return match[0];
}

test('migration: tabela sem leitura direta, link só pela Edge Function, token guardado como hash', async () => {
  const sql = await readFile(MIGRATION, 'utf8');
  assert.match(sql, /ALTER TABLE public\.patient_interview_responses ENABLE ROW LEVEL SECURITY;/);
  assert.match(sql, /REVOKE ALL ON TABLE public\.patient_interview_responses FROM PUBLIC, anon, authenticated;/);
  assert.doesNotMatch(sql, /CREATE POLICY[^;]*patient_interview_responses/, 'nenhuma policy: só RPC');
  assert.doesNotMatch(sql, /GRANT [^;]*ON (TABLE )?public\.patient_interview_responses/, 'sem GRANT na tabela');

  for (const name of ['interview_link_open', 'interview_link_save']) {
    assert.match(sql, new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\([^)]*\\) FROM PUBLIC, anon, authenticated;`), name);
    assert.match(sql, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}\\([^)]*\\) TO service_role;`), name);
  }
  for (const name of ['record_interview_answers', 'send_interview_link', 'get_interview_link', 'cancel_interview_link', 'void_interview_response', 'list_patient_interviews']) {
    assert.match(sql, new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\([^)]*\\) FROM PUBLIC, anon;`), name);
  }
  // Cada função SECURITY DEFINER fixa o search_path.
  for (const [, header] of sql.matchAll(/CREATE OR REPLACE FUNCTION ([\s\S]*?)\bAS \$/g)) {
    if (/SECURITY DEFINER/.test(header)) assert.match(header, /SET search_path = /, header.split('\n')[0]);
  }

  const send = functionBody(sql, 'send_interview_link');
  assert.match(send, /extensions\.gen_random_bytes\(24\)/, 'token de 192 bits gerado no banco');
  assert.match(send, /extensions\.digest\(v_token, 'sha256'\)/);
  assert.match(send, /extensions\.pgp_sym_encrypt\(v_token, public\.get_clinical_encryption_key\(\)\)/);
  assert.match(sql, /link_token_hash ~ '\^\[0-9a-f\]\{64\}\$'/);

  const open = functionBody(sql, 'interview_link_open');
  assert.match(open, /WHERE r\.link_token_hash = p_token_hash/);
  assert.doesNotMatch(open, /link_token_encrypted/, 'o link nunca devolve o token');
  // Depois de enviado, cancelado ou vencido, nada de perguntas nem respostas.
  assert.match(open, /IF v_state <> 'ok' THEN\s+RETURN QUERY SELECT v_state, NULL::UUID, NULL::TEXT, NULL::JSONB, NULL::JSONB/);

  // Quem usa = mesma regra das escalas (quem atende + administração).
  assert.match(functionBody(sql, 'can_use_patient_interviews'), /public\.can_read_patient_instruments\(p_patient, p_discipline, p_user\)/);
  assert.match(functionBody(sql, 'void_interview_response'), /v_row\.created_by = v_uid OR public\.is_clinic_admin\(v_uid\)/);
});

test('exclusão do paciente: parte de 20261009 e só acrescenta as entrevistas (snapshot sem token)', async () => {
  const previous = functionBody(await readFile(path.join(MIGRATIONS, '20261009_portal_patient_erasure.sql'), 'utf8'), 'admin_decide_patient_deletion');
  const updated = functionBody(await readFile(MIGRATION, 'utf8'), 'admin_decide_patient_deletion');
  const NEW_LINES = [
    "    'patient_interview_responses', (SELECT coalesce(jsonb_agg(to_jsonb(ir) - 'link_token_hash' - 'link_token_encrypted'), '[]'::jsonb) FROM public.patient_interview_responses ir WHERE ir.patient_id = v_req.patient_id),",
    '  DELETE FROM public.patient_interview_responses WHERE patient_id = v_req.patient_id;',
  ];
  const lines = text => text.split(/\r?\n/);
  for (const line of NEW_LINES) {
    assert.equal(lines(updated).filter(item => item === line).length, 1, `uma vez: ${line.trim()}`);
  }
  assert.deepEqual(lines(updated).filter(line => !NEW_LINES.includes(line)), lines(previous), 'o resto é idêntico a 20261009');
});

// ---------- Edge Function e telas ----------

test('Edge Function do link: só o hash vai ao banco, respostas limpas e limite de pedidos', async () => {
  const source = await readFile(path.join(repo, 'supabase/functions/interview-link/index.ts'), 'utf8');
  const config = await readFile(path.join(repo, 'supabase/config.toml'), 'utf8');
  assert.match(config, /\[functions\.interview-link\]\r?\nverify_jwt = false/);
  assert.match(source, /const tokenHash = await sha256Hex\(token\);/);
  assert.doesNotMatch(source, /p_token_hash: token\b/, 'token cru nunca vai ao banco');
  assert.match(source, /sanitizeAnswers\(questions, body\.answers\)/);
  assert.match(source, /missingRequired\(questions, answers\)/);
  assert.match(source, /functionName: 'interview-link-save'/);
  assert.match(source, /functionName: 'interview-link-ip'/);
  assert.match(source, /readClinicalJsonBody\(req, MAX_BODY_BYTES\)/);
});

test('aba Entrevistas na Psicologia, logo depois da Anamnese', async () => {
  const data = await read('src/data/psychologyAnamnese.js');
  const workspace = await read('src/components/PsychologyWorkspace.jsx');
  assert.match(data, /ENTREVISTAS: 'Entrevistas'/);
  assert.match(workspace, /PSYCHOLOGY_TABS\.ANAMNESE,\r?\n\s+PSYCHOLOGY_TABS\.ENTREVISTAS,/);
  assert.match(workspace, /case PSYCHOLOGY_TABS\.ENTREVISTAS:[\s\S]*?<PatientInterviewsPanel/);
  const sidebar = await read('src/components/Sidebar.jsx');
  assert.match(sidebar, /'Entrevistas': \(/, 'ícone no menu');
});

test('respostas saem no papel timbrado, com a fonte do corpo no palco invisível', async () => {
  const dialog = await read('src/components/interviews/InterviewResponseDialog.jsx');
  assert.match(dialog, /<PrintLetterhead \{\.\.\.letterheadProps\} \/>/);
  assert.match(dialog, /<PrintFooter items=\{contactItems\} clinicName=\{clinicName\} \/>/);
  assert.match(dialog, /paginateReportBody\(html,/);
  assert.match(dialog, /<div className="rpage-measure-stage">[\s\S]*?<div ref=\{sourceRef\}>\{printBody\}<\/div>\r?\n\s+<\/div>/);
  assert.match(dialog, /exportStandardDocx\(/);
  // Janela fecha por useDismiss; anular com motivo escrito pergunta antes de descartar.
  assert.match(dialog, /useDismiss\(\{ onClose, busy: saving \|\| exporting, guardUnsaved: voiding \}\)/);
  const office = await read('src/components/interviews/InterviewOfficeDialog.jsx');
  assert.match(office, /useDismiss\(\{ onClose: onCancel, busy: saving, guardUnsaved: true, unsaved: touched \}\)/);
  assert.match(office, /<DismissPrompt dismiss=\{dismiss\} \/>/);
});

test('tela nunca lê a tabela direto: tudo pelas RPCs', async () => {
  const service = await read('src/services/patientInterviewService.js');
  assert.doesNotMatch(service, /\.from\('patient_interview_responses'\)/);
  for (const rpc of ['list_patient_interviews', 'record_interview_answers', 'send_interview_link', 'get_interview_link', 'cancel_interview_link', 'void_interview_response']) {
    assert.match(service, new RegExp(`supabase\\.rpc\\('${rpc}'`), rpc);
  }
  const page = await read('src/InterviewLinkPage.jsx');
  assert.match(page, /tokenFromHash\(window\.location\.hash\)/, 'token vem do "#", nunca da busca');
  assert.doesNotMatch(page, /localStorage|sessionStorage/, 'resposta nunca fica no aparelho');
});
