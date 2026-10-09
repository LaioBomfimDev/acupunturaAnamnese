import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

// Área do Paciente + Importáveis (06/10/2026, opção C): o paciente
// responde online, com código + data de nascimento, os formulários que a
// administração monta na Gestão. O que este teste segura:
//   * a regra das respostas é a mesma na tela e no servidor (as duas
//     versões rodam os mesmos casos);
//   * paciente nunca vira conta do Auth nem linha de profiles, sessão e
//     login só pelo service role, respostas cifradas com a chave do Vault;
//   * só a administração (clinic_admin) vê formulários e respostas;
//   * a planilha não executa fórmula digitada pelo paciente.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const repo = path.resolve(root, '..');
const read = file => readFile(path.resolve(repo, file), 'utf8');

let server;
let front;
let back;
let Runner;

before(async () => {
  front = await import(pathToFileURL(path.resolve(root, 'src/utils/patientForms.js')).href);
  back = await import(pathToFileURL(path.resolve(repo, 'supabase/functions/_shared/patientFormAnswers.ts')).href);
  server = await createServer({ root, logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' });
  ({ PatientFormRunner: Runner } = await server.ssrLoadModule('/src/components/patientForms/PatientFormRunner.jsx'));
});

after(async () => {
  await server?.close();
});

const QUESTIONS = [
  { id: 'qfuma', type: 'yes_no', label: 'Você fuma?', required: true },
  { id: 'qquanto', type: 'short_text', label: 'Se sim, quantos por dia?', required: true, showIf: { questionId: 'qfuma', values: ['Sim'] } },
  { id: 'qparte', type: 'section', label: 'Sono' },
  { id: 'qsono', type: 'single', label: 'Como dorme?', options: ['Bem', 'Mal'], allowOther: true },
  { id: 'qsintomas', type: 'multiple', label: 'Sintomas', options: ['Dor', 'Cansaço'], allowOther: false },
  { id: 'qdor', type: 'scale', label: 'Dor hoje', scale: { min: 0, max: 10 } },
  { id: 'qdata', type: 'date', label: 'Início' },
  { id: 'qpeso', type: 'number', label: 'Peso' },
  { id: 'qobs', type: 'long_text', label: 'Observações' },
];

const CASES = [
  {},
  { qfuma: 'Sim', qquanto: '10' },
  { qfuma: 'Não', qquanto: '10' },
  { qfuma: 'Talvez', qsono: 'Bem' },
  { qsono: '__outro__', qsono__outro: '  acordo cedo  ' },
  { qsintomas: ['Dor', 'Dor', 'Inventado', '__outro__'], qsintomas__outro: 'x' },
  { qdor: 11, qdata: '2026-02-31', qpeso: Number.POSITIVE_INFINITY },
  { qdor: 7, qdata: '2026-02-28', qpeso: 72.5, qobs: 'a'.repeat(5000), desconhecida: 'x' },
  { qfuma: ['Sim'], qobs: 42 },
];

test('tela e servidor limpam, contam e cobram as respostas do mesmo jeito', () => {
  for (const answers of CASES) {
    const clean = front.sanitizeAnswers(QUESTIONS, answers);
    assert.deepEqual(back.sanitizeAnswers(QUESTIONS, answers), clean, JSON.stringify(answers));
    assert.equal(back.computeProgress(QUESTIONS, clean), front.computeProgress(QUESTIONS, clean));
    assert.deepEqual(
      back.missingRequired(QUESTIONS, clean),
      front.missingRequired(QUESTIONS, clean).map(question => question.id),
    );
  }
  assert.equal(front.OTHER_VALUE, back.OTHER_VALUE);
  assert.equal(front.OTHER_SUFFIX, back.OTHER_SUFFIX);
});

test('"Se sim, qual?" some com a resposta quando a origem muda', () => {
  assert.deepEqual(front.sanitizeAnswers(QUESTIONS, { qfuma: 'Não', qquanto: '10' }), { qfuma: 'Não' });
  assert.deepEqual(front.sanitizeAnswers(QUESTIONS, { qfuma: 'Sim', qquanto: '10' }), { qfuma: 'Sim', qquanto: '10' });
  // Escondida não conta no progresso nem como obrigatória.
  assert.deepEqual(front.missingRequired(QUESTIONS, { qfuma: 'Não' }).map(q => q.id), []);
  assert.deepEqual(front.missingRequired(QUESTIONS, { qfuma: 'Sim' }).map(q => q.id), ['qquanto']);
});

test('limpeza: opção inventada, chave estranha e texto longo não passam', () => {
  const clean = front.sanitizeAnswers(QUESTIONS, CASES[7]);
  assert.equal(clean.desconhecida, undefined);
  assert.equal(clean.qobs.length, front.LIMITS.longTextMax);
  assert.deepEqual(front.sanitizeAnswers(QUESTIONS, CASES[5]), { qsintomas: ['Dor'] });
  assert.deepEqual(front.sanitizeAnswers(QUESTIONS, CASES[6]), {});
  assert.deepEqual(front.sanitizeAnswers(QUESTIONS, CASES[4]), { qsono: '__outro__', qsono__outro: '  acordo cedo  ' });
  assert.equal(front.formatAnswer(QUESTIONS[3], { qsono: '__outro__', qsono__outro: 'acordo cedo' }), 'Outro: acordo cedo');
});

test('planilha: ";" e BOM para o Excel, e fórmula do paciente vira texto', () => {
  const csv = front.buildResponsesCsv(
    [QUESTIONS[0], QUESTIONS[8]],
    [{ patientName: 'Ana; Maria', sentAt: '2026-10-06T12:00:00Z', submittedAt: null, answers: { qfuma: 'Sim', qobs: '=HYPERLINK("x")' } }],
  );
  assert.ok(csv.startsWith(String.fromCharCode(0xfeff) + 'Paciente;Enviado em;Respondido em;Você fuma?;Observações'));
  assert.match(csv, /"Ana; Maria"/);
  assert.match(csv, /"'=HYPERLINK\(""x""\)"/);
  assert.doesNotMatch(csv, /;=HYPERLINK/);
});

test('envio que mudou de versão leva todas as perguntas para a planilha', () => {
  const v1 = [{ id: 'a', type: 'yes_no', label: 'A' }, { id: 'b', type: 'short_text', label: 'B' }];
  const v2 = [{ id: 'a', type: 'yes_no', label: 'A' }, { id: 'c', type: 'section', label: 'Parte' }, { id: 'd', type: 'date', label: 'D' }];
  assert.deepEqual(front.mergeQuestionColumns([v2, v1]).map(q => q.id), ['a', 'd', 'b']);
});

test('código e data de nascimento digitados viram o formato do servidor', () => {
  assert.equal(front.formatAccessCodeInput('ktp4o8i2'), 'KTP-482');
  assert.equal(front.isCompleteAccessCode('KTP-482'), true);
  assert.equal(front.isCompleteAccessCode('KT1-482'), false);
  assert.equal(front.formatBirthInput('25031980'), '25/03/1980');
  const now = new Date('2026-10-06T12:00:00');
  assert.equal(front.parseBirthInput('25/03/1980', now), '1980-03-25');
  assert.equal(front.parseBirthInput('31/02/1980', now), null);
  assert.equal(front.parseBirthInput('01/01/2030', now), null);
  assert.equal(front.parseBirthInput('01/01/1880', now), null);
});

test('mensagem do WhatsApp leva link com o código e explica a data de nascimento', () => {
  const link = front.buildPortalLink('https://sistema.exemplo.com.br/', 'KTP-482');
  assert.equal(link, 'https://sistema.exemplo.com.br/area-do-paciente?codigo=KTP-482');
  const message = front.buildPortalMessage({
    patientName: 'Maria Souza', clinicName: 'Clínica X', code: 'KTP-482', link, formTitle: 'Entrevista inicial', dueDate: '2026-10-12',
  });
  assert.match(message, /^Olá, Maria! Clínica X enviou o formulário "Entrevista inicial" para você responder pelo celular até 12\/10\/2026\./);
  assert.match(message, /data de nascimento/);
  assert.match(message, /KTP-482/);
});

test('publicar confere tudo; rascunho aceita pela metade', () => {
  const draft = { title: 'Entrevista', description: '', questions: [{ id: 'x', type: 'single', label: '', options: ['Só uma'] }] };
  assert.deepEqual(front.validateForm(draft), []);
  const errors = front.validateForm(draft, { forPublish: true });
  assert.ok(errors.some(error => /escreva a pergunta/.test(error)));
  assert.ok(errors.some(error => /pelo menos 2 opções/.test(error)));

  const badCondition = {
    title: 'T',
    questions: [
      { id: 'q1', type: 'short_text', label: 'Texto' },
      { id: 'q2', type: 'short_text', label: 'Dep', showIf: { questionId: 'q1', values: ['Sim'] } },
    ],
  };
  assert.ok(front.validateForm(badCondition).some(error => /pergunta de escolha que vem antes/.test(error)));
  assert.deepEqual(front.validateForm({ title: 'T', questions: QUESTIONS.slice(0, 2) }, { forPublish: true }), []);
});

test('situação do envio: atrasado só quando passou do prazo sem enviar', () => {
  const now = new Date('2026-10-06T12:00:00');
  assert.equal(front.assignmentStatus({ status: 'pending', due_date: '2026-10-05' }, now).id, 'late');
  assert.equal(front.assignmentStatus({ status: 'pending', due_date: '2026-10-06' }, now).id, 'pending');
  assert.equal(front.assignmentStatus({ status: 'submitted', due_date: '2026-10-01' }, now).id, 'submitted');
  assert.equal(front.assignmentStatus({ status: 'in_progress', progress: 40 }, now).label, 'Respondendo · 40%');
  assert.equal(front.markingShare(QUESTIONS).percent, 50);
});

test('tela do paciente: partes, condicional escondida e obrigatória marcada', () => {
  const html = renderToStaticMarkup(React.createElement(Runner, {
    questions: QUESTIONS,
    answers: { qfuma: 'Não' },
    onAnswersChange: () => {},
  }));
  assert.match(html, /Parte 1 de 2/);
  assert.match(html, /Você fuma\?/);
  assert.match(html, /\(obrigatória\)/);
  assert.doesNotMatch(html, /quantos por dia/);
  assert.match(html, /Próxima parte/);
});

test('migration: paciente fora do Auth, sessão e login só pelo servidor, respostas cifradas', async () => {
  const sql = await read('supabase/migrations/20261006_patient_portal.sql');
  const code = sql.replace(/--[^\n]*/g, '');

  assert.doesNotMatch(code, /INSERT\s+INTO\s+public\.profiles/i, 'paciente não pode virar linha de profiles');
  assert.doesNotMatch(code, /auth\.users/i);
  for (const table of ['patient_forms', 'patient_portal_access', 'patient_portal_sessions', 'patient_form_assignments']) {
    assert.match(code, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`), `${table} sem RLS`);
  }
  assert.match(code, /REVOKE ALL ON TABLE public\.patient_portal_sessions FROM PUBLIC, anon, authenticated;/);
  assert.match(code, /REVOKE INSERT, UPDATE ON TABLE public\.patient_form_assignments FROM authenticated;/);

  for (const fn of ['portal_login', 'portal_resolve_session', 'portal_read_answers', 'portal_save_answers']) {
    assert.match(code, new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM PUBLIC, anon, authenticated;`), `${fn} aberta`);
    assert.match(code, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) TO service_role;`));
    assert.doesNotMatch(code, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) TO authenticated`));
  }

  // Só a administração da clínica, com os gates de conta e MFA.
  assert.match(code, /public\.can_manage_agenda\(p_clinic, p_user\)\s+AND public\.is_clinic_admin\(p_user\)\s+AND public\.can_access_clinical_data\(p_user\)/);
  const policies = [...code.matchAll(/CREATE POLICY (\w+) ON public\.(\w+)[\s\S]*?;/g)];
  assert.ok(policies.length >= 7);
  for (const [statement, name] of policies) {
    assert.match(statement, /can_manage_patient_portal\(clinic_id\)/, `${name} sem o corte da administração`);
  }

  assert.match(code, /extensions\.pgp_sym_encrypt\(p_answers::TEXT, public\.get_clinical_encryption_key\(\)\)/);
  const assignmentsTable = code.match(/CREATE TABLE IF NOT EXISTS public\.patient_form_assignments \(([\s\S]*?)\r?\n\);/)[1];
  assert.match(assignmentsTable, /answers_encrypted BYTEA/);
  assert.doesNotMatch(assignmentsTable, /\banswers\s+JSONB/i, 'resposta em texto puro');
  assert.match(code, /c_max_attempts CONSTANT INTEGER := 8;/);
  assert.match(code, /ON CONFLICT ON CONSTRAINT patient_portal_access_patient_key/);
  assert.doesNotMatch(code, /ON CONFLICT \(/);
  assert.match(code, /last_save_id = p_save_id/);
  assert.match(code, /v_row\.revision <> p_expected_revision/);
});

test('Edge Function: erro genérico, limites, token só em hash e nada de prontuário', async () => {
  const source = await read('supabase/functions/patient-portal/index.ts');
  assert.match(source, /readClinicalJsonBody\(req, MAX_BODY_BYTES\)/);
  assert.match(source, /const LOGIN_ERROR = 'Código ou data de nascimento não conferem\.'/);
  for (const name of ['patient-portal-ip', 'patient-portal-login', 'patient-portal-save', 'patient-portal-read']) {
    assert.ok(source.includes(`'${name}'`), `sem limite ${name}`);
  }
  assert.match(source, /p_token_hash: tokenHash/);
  assert.doesNotMatch(source, /p_token_hash: token\b/);
  // Respostas limpas pelas perguntas do servidor (cópia do envio ou, na
  // escala, a definição oficial), nunca pelas que o aparelho mandar.
  assert.match(source, /const \{ instrument, questions \} = assignmentContent\(assignment\);\r?\n[\s\S]{0,200}?const answers = sanitizeAnswers\(questions, body\.answers\)/);
  assert.match(source, /return \{ instrument: null, questions: assignment\.form_questions \}/);
  assert.match(source, /\.eq\('patient_id', session\.patientId\)\s*\.eq\('clinic_id', session\.clinicId\)\s*\.in\('status', OPEN_STATUSES\)/);
  for (const table of ['clinical_records', 'patient_evolutions', 'clinical_sessions', 'patient_attachments']) {
    assert.ok(!source.includes(table), `a Área do Paciente não lê ${table}`);
  }
  assert.doesNotMatch(source, /console\./);
});

test('telas ligadas: rota pública, entrada no login, aba da Gestão e aba só da administração na ficha', async () => {
  const main = await read('frontend/src/main.jsx');
  assert.match(main, /const isPublicPatientPortalRoute = path === '\/area-do-paciente'/);
  const vercel = JSON.parse(await read('frontend/vercel.json'));
  assert.ok(vercel.rewrites.some(rule => rule.source === '/area-do-paciente'));

  const login = await read('frontend/src/components/panels/Login.jsx');
  assert.match(login, /href="\/area-do-paciente"/);

  const gestao = await read('frontend/src/components/panels/RelatoriosGestao.jsx');
  assert.match(gestao, /\{ id: 'importaveis', label: 'Importáveis' \}/);
  assert.match(gestao, /section === 'importaveis'/);

  const profile = await read('frontend/src/components/ClinicPatientProfile.jsx');
  assert.match(profile, /TABS\.filter\(tab => tab\.id !== 'portal' \|\| isClinicAdmin\)/);
  assert.match(profile, /isClinicAdmin && activeTab === 'portal'/);

  // Senha/sessão do paciente nunca em localStorage.
  const page = await read('frontend/src/PatientPortalPage.jsx');
  const publicService = await read('frontend/src/services/patientPortalPublic.js');
  assert.doesNotMatch(page + publicService, /localStorage/);
  assert.match(publicService, /sessionStorage/);
});
