// ============================================================
// Anamnese para responder em casa (16/10/2026).
// Pedido: as anamneses que já existem (infantil e adulto, da Psicologia)
// também vão para o paciente responder em casa, pela Área do Paciente,
// como as escalas. Regras que este teste segura:
//  * as perguntas são as da ficha (mesmo id de campo), sem o que é da
//    profissional, e o banco (home_anamnese_templates) tem exatamente a
//    versão que a tela conhece;
//  * o envio copia as perguntas do banco, nunca do aparelho;
//  * nada entra na ficha sozinho: a profissional traz campo a campo,
//    sem apagar o que já escreveu e sem repetir;
//  * o rascunho do paciente fica com ele até ele enviar.
// Validado no banco real com ROLLBACK (39 cenários) antes de aplicar; a
// validação achou o CHECK de tipo de envio que deixava passar escala sem
// instrumento (NULL num CHECK não reprova), fechado em 20261016c.
// ============================================================

import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readdir, readFile } from 'node:fs/promises';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MIGRATIONS = path.resolve(root, '../supabase/migrations');
const MIGRATION = path.join(MIGRATIONS, '20261016c_home_anamnese.sql');
const load = rel => import(pathToFileURL(path.join(root, rel)).href);
const read = rel => readFile(path.join(root, rel), 'utf8');

function functionBody(sql, name) {
  const match = sql.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\$${name}\\$;`));
  assert.ok(match, `função ${name}`);
  return match[0];
}

/** Modelo gravado por alguma migration: { title, description, questions }. */
async function seededTemplate(id, version) {
  const files = (await readdir(MIGRATIONS)).filter(file => file.endsWith('.sql')).sort();
  const pattern = new RegExp(
    `VALUES \\(\\r?\\n\\s+'${id}', ${version}, '([a-z]+)', '([a-z]+)',\\r?\\n\\s+'([^']+)',\\r?\\n\\s+`
    + '\\$description\\$([\\s\\S]*?)\\$description\\$,\\r?\\n\\s+\\$questions\\$([\\s\\S]*?)\\$questions\\$::jsonb',
  );
  for (const file of files) {
    const match = (await readFile(path.join(MIGRATIONS, file), 'utf8')).match(pattern);
    if (match) {
      return {
        file,
        discipline: match[1],
        path: match[2],
        title: match[3],
        description: match[4],
        questions: JSON.parse(match[5]),
      };
    }
  }
  return null;
}

test('o banco tem exatamente a versão da anamnese de casa que a tela conhece', async () => {
  const { HOME_ANAMNESES, buildHomeAnamneseQuestions } = await load('src/data/homeAnamneses.js');
  assert.deepEqual(HOME_ANAMNESES.map(item => item.path).sort(), ['adulto', 'infantojuvenil']);
  for (const definition of HOME_ANAMNESES) {
    const seeded = await seededTemplate(definition.id, definition.version);
    assert.ok(seeded,
      `${definition.id} v${definition.version}: mudou pergunta da ficha? Suba version em data/homeAnamneses.js e grave a versão nova numa migration nova.`);
    assert.equal(seeded.discipline, definition.discipline);
    assert.equal(seeded.path, definition.path);
    assert.equal(seeded.title, definition.title);
    assert.equal(seeded.description, definition.description);
    assert.deepEqual(seeded.questions, buildHomeAnamneseQuestions(definition),
      `${definition.id}: as perguntas do banco diferem das da ficha — suba version e grave numa migration nova`);
  }
});

test('vão para casa as perguntas da ficha, sem o que é da profissional', async () => {
  const { HOME_ANAMNESES, buildHomeAnamneseQuestions, homeAnamneseFieldIds } = await load('src/data/homeAnamneses.js');
  const { PSYCHOLOGY_TEXT_FIELDS, createEmptyPsychologySession, normalizePsychologySession } = await load('src/data/psychologyAnamnese.js');
  const { getPsychologyProfileSections, getPsychologyProfilesForPath, PSYCHOLOGY_INFORMANT_OPTIONS } = await load('src/data/psychologyIntakeProfiles.js');
  const { PSYCHOLOGY_CONTEXT_FIELDS } = await load('src/data/psychologyAnamnese.js');
  const { sanitizeAnswers } = await load('src/utils/patientForms.js');
  const fichaFields = createEmptyPsychologySession().fields;

  for (const definition of HOME_ANAMNESES) {
    const questions = buildHomeAnamneseQuestions(definition);
    const fieldIds = homeAnamneseFieldIds(questions);
    const profile = getPsychologyProfilesForPath(definition.path)[0];
    const expected = [
      ...PSYCHOLOGY_TEXT_FIELDS.filter(field => field.id !== 'observacoesSessao'),
      ...getPsychologyProfileSections(profile.id).flatMap(section => section.fields),
    ];
    assert.deepEqual(fieldIds, expected.map(field => field.id), `${definition.id}: mesmos campos, mesma ordem`);
    for (const question of questions.filter(item => item.type === 'long_text')) {
      assert.ok(question.id in fichaFields, `${question.id} é campo da ficha`);
      assert.equal(question.label, expected.find(field => field.id === question.id).label, 'mesmo texto da ficha');
      assert.equal(question.required, false, 'nenhuma pergunta de texto obrigatória');
    }
    assert.ok(!fieldIds.includes('observacoesSessao'), 'observação da sessão é da profissional');
    for (const field of PSYCHOLOGY_CONTEXT_FIELDS) {
      assert.ok(!fieldIds.includes(field.id), `bloco de contexto (${field.id}) abre por pertinência, não vai para casa`);
    }
    assert.ok(!questions.some(item => /risco|eixo/i.test(item.label)), 'sem risco nem eixos');
    assert.match(definition.description, /188 \(CVV\) ou 192 \(SAMU\)/, 'diz que a resposta não é lida na hora e onde pedir ajuda');
  }

  const adult = HOME_ANAMNESES.find(item => item.path === 'adulto');
  const adultQuestions = buildHomeAnamneseQuestions(adult);
  assert.match(adultQuestions.find(item => item.id === 'demanda').help, /^O que te trouxe ao atendimento\?/,
    'adulto: as perguntas-guia da escuta ajudam quem responde sozinho');
  assert.ok(!adultQuestions.some(item => item.id === 'informante'));

  const child = HOME_ANAMNESES.find(item => item.path === 'infantojuvenil');
  const childQuestions = buildHomeAnamneseQuestions(child);
  const informant = childQuestions.find(item => item.id === 'informante');
  assert.equal(informant.type, 'single');
  assert.equal(informant.required, true, 'infantil: começa dizendo quem responde');
  assert.deepEqual(informant.options, PSYCHOLOGY_INFORMANT_OPTIONS.map(option => option.label));
  assert.equal(childQuestions.find(item => item.id === 'demanda').help, '',
    'infantil: sem as perguntas-guia que falam com a própria pessoa');

  // O servidor limpa as respostas pela mesma regra.
  const clean = sanitizeAnswers(childQuestions, { informante: 'Vizinha', demanda: 'Agitação', inventado: 'x' });
  assert.deepEqual(clean, { demanda: 'Agitação' });

  // A sessão guarda o que já foi trazido de casa (e registro antigo abre sem isso).
  assert.deepEqual(createEmptyPsychologySession().homeImports, {});
  assert.deepEqual(normalizePsychologySession({ fields: {} }).homeImports, {});
  assert.deepEqual(normalizePsychologySession({ homeImports: { r1: { fields: ['demanda'] } } }).homeImports, { r1: { fields: ['demanda'] } });
});

test('trazer para a ficha: campo vazio recebe, campo escrito acrescenta, nada repete', async () => {
  const { HOME_ANAMNESES, buildHomeAnamneseQuestions } = await load('src/data/homeAnamneses.js');
  const { createEmptyPsychologySession } = await load('src/data/psychologyAnamnese.js');
  const home = await load('src/utils/homeAnamnese.js');
  const child = HOME_ANAMNESES.find(item => item.path === 'infantojuvenil');
  const request = {
    id: 'envio-1',
    anamneseId: child.id,
    status: 'submitted',
    sentAt: '2026-10-10T12:00:00Z',
    submittedAt: '2026-10-12T15:00:00Z',
    questions: buildHomeAnamneseQuestions(child),
    answers: {
      informante: 'Mãe',
      informanteNome: 'Ana',
      demanda: '  Muita agitação na escola  ',
      childGestacao: 'Gestação planejada',
      childSensorial: '   ',
    },
  };
  const session = {
    ...createEmptyPsychologySession(),
    intakeProfile: 'infantojuvenil_feminino',
  };
  session.fields = { ...session.fields, childGestacao: 'Pré-natal completo' };
  session.fieldInformants = { childGestacao: { type: 'pai', name: '' } };

  const pending = home.pendingHomeAnswers(session, request);
  assert.deepEqual(Object.keys(pending).sort(), ['childGestacao', 'demanda'], 'resposta em branco não conta');
  assert.equal(pending.demanda.text, 'Muita agitação na escola');
  assert.equal(pending.demanda.fieldEmpty, true);
  assert.equal(pending.demanda.informantLabel, 'Mãe · Ana');
  assert.equal(pending.childGestacao.fieldEmpty, false);
  assert.deepEqual(home.emptyFieldsWithHomeAnswer(session, request), ['demanda']);

  const filled = home.applyHomeAnswer(session, request, 'demanda', '2026-10-13T10:00:00Z');
  assert.equal(filled.fields.demanda, 'Muita agitação na escola');
  assert.deepEqual(filled.fieldInformants.demanda, { type: 'mae', name: 'Ana' }, 'quem respondeu em casa vira o informante');
  assert.deepEqual(filled.homeImports['envio-1'].fields, ['demanda']);
  assert.equal(session.fields.demanda, '', 'não muda a sessão original');

  const appended = home.applyHomeAnswer(filled, request, 'childGestacao', '2026-10-13T10:01:00Z');
  assert.equal(appended.fields.childGestacao, 'Pré-natal completo\n\nRespondido em casa (Mãe · Ana): Gestação planejada',
    'acrescenta no fim, sem apagar o que a profissional escreveu');
  assert.deepEqual(appended.fieldInformants.childGestacao, { type: 'pai', name: '' }, 'campo já escrito mantém o informante');

  const again = home.applyHomeAnswer(appended, request, 'childGestacao');
  assert.equal(again, appended, 'trazer de novo não repete');
  assert.deepEqual(home.pendingHomeAnswers(appended, request), {}, 'tudo já na ficha');

  const bulk = home.applyHomeAnswers(session, request, home.emptyFieldsWithHomeAnswer(session, request));
  assert.equal(bulk.fields.demanda, 'Muita agitação na escola');
  assert.equal(bulk.fields.childGestacao, 'Pré-natal completo', 'trazer para os vazios não mexe no campo escrito');

  // Rascunho do paciente não aparece; a mais nova respondida vem primeiro.
  const list = [
    { ...request, id: 'velha', submittedAt: '2026-09-01T10:00:00Z', sentAt: '2026-08-30T10:00:00Z' },
    request,
    { id: 'aberta', anamneseId: child.id, status: 'in_progress', progress: 40, sentAt: '2026-10-14T10:00:00Z', answers: null, questions: [] },
  ];
  assert.deepEqual(home.answeredHomeRequests(list).map(item => item.id), ['envio-1', 'velha']);
  assert.equal(home.openHomeRequest(list).id, 'aberta');
  assert.equal(home.homeRequestStatusLabel(list[2]), 'sendo respondida (40%)');
  assert.deepEqual(home.requestsOfAnamnese(list, 'outra'), []);
});

test('banco: perguntas saem do modelo, rascunho fica com o paciente, CHECK sem buraco de NULL', async () => {
  const sql = await readFile(MIGRATION, 'utf8');

  // Modelos: só as funções leem.
  assert.match(sql, /ALTER TABLE public\.home_anamnese_templates ENABLE ROW LEVEL SECURITY;/);
  assert.match(sql, /REVOKE ALL ON TABLE public\.home_anamnese_templates FROM PUBLIC, anon, authenticated;/);

  const send = functionBody(sql, 'portal_send_anamnese');
  assert.match(send, /portal_send_anamnese\(\r?\n\s+p_patient_id UUID,\r?\n\s+p_anamnese_id TEXT,\r?\n\s+p_due_date DATE DEFAULT NULL\r?\n\)/,
    'o envio não recebe perguntas do aparelho');
  assert.match(send, /v_template\.title, v_template\.description, v_template\.questions/);
  assert.match(send, /public\.can_manage_patient_portal\(v_clinic, v_uid\)\r?\n\s+OR public\.can_use_patient_instruments\(p_patient_id, v_template\.discipline, v_uid\)/,
    'envia quem atende na área e a administração, como as escalas');
  assert.match(send, /PERFORM public\.portal_ensure_access_row\(p_patient_id\);/);

  const list = functionBody(sql, 'list_patient_anamnese_requests');
  assert.match(list, /public\.can_read_patient_instruments\(p_patient_id, p_discipline, v_uid\)/);
  assert.match(list, /WHEN f\.status = 'submitted' AND f\.answers_encrypted IS NOT NULL\r?\n\s+THEN extensions\.pgp_sym_decrypt/,
    'resposta só depois que o paciente envia');

  const admin = functionBody(sql, 'portal_admin_read_answers');
  assert.match(admin, /AND \(f\.kind = 'form' OR \(f\.kind = 'anamnese' AND f\.status = 'submitted'\)\)/);

  const kindCheck = sql.match(/ADD CONSTRAINT patient_form_assignments_kind_check CHECK \(([\s\S]*?)\r?\n  \);/)[1];
  assert.match(kindCheck, /kind = 'instrument'\r?\n\s+AND instrument_id IS NOT NULL AND instrument_version IS NOT NULL AND discipline IS NOT NULL/);
  assert.match(kindCheck, /kind = 'anamnese'\r?\n\s+AND anamnese_id IS NOT NULL AND anamnese_version IS NOT NULL AND discipline IS NOT NULL/);
  assert.match(sql, /FOREIGN KEY \(anamnese_id, anamnese_version\)\r?\n\s+REFERENCES public\.home_anamnese_templates \(id, version\)/);

  for (const signature of ['portal_send_anamnese(UUID, TEXT, DATE)', 'list_patient_anamnese_requests(UUID, TEXT)', 'cancel_patient_anamnese_request(UUID)']) {
    assert.ok(sql.includes(`REVOKE ALL ON FUNCTION public.${signature} FROM PUBLIC, anon;`), signature);
    assert.ok(sql.includes(`GRANT EXECUTE ON FUNCTION public.${signature} TO authenticated;`), signature);
  }

  // A Área do Paciente trata a anamnese como formulário: perguntas da
  // cópia do envio, sem precisar mexer na Edge Function.
  const edge = await readFile(path.resolve(root, '../supabase/functions/patient-portal/index.ts'), 'utf8');
  assert.match(edge, /if \(assignment\.kind !== 'instrument'\) \{\r?\n\s+return \{ instrument: null, questions: assignment\.form_questions \};/);
});

test('telas: resposta de casa junto do campo, trazer só com a ficha aberta', async () => {
  const anamnese = await read('src/components/psychology/PsychologyAnamnese.jsx');
  assert.match(anamnese, /<HomeAnswerNote fieldId=\{field\.id\} answer=\{homeAnswer\} onUse=\{onUseHomeAnswer\} \/>/);
  assert.equal((anamnese.match(/homeAnswer=\{homeAnswers\[field\.id\]\}/g) || []).length, 2, 'escuta e roteiro do percurso');
  assert.match(anamnese, /\{answer\.fieldEmpty \? 'Trazer para o campo' : 'Acrescentar ao campo'\}/);

  const workspace = await read('src/components/PsychologyWorkspace.jsx');
  assert.match(workspace, /canImport=\{showingAnamneseForm\}/);
  assert.match(workspace, /homeAnswers=\{latestHome \? pendingHomeAnswers\(session, latestHome\) : \{\}\}/);
  assert.match(workspace, /const homeRequests = homeCurrent \? homeState\.rows : \[\];/, 'nunca mostra envio de outro paciente');

  const box = await read('src/components/psychology/HomeAnamneseBox.jsx');
  assert.match(box, /sendHomeAnamnese\(\{ patientId: patient\.id, anamneseId: definition\.id, dueDate: dueDate \|\| null \}\)/);
  assert.match(box, /answers=\{viewing\.answers \|\| \{\}\}/, 'respostas com papel timbrado pela mesma janela dos formulários');

  const assignments = await read('src/components/patientForms/AssignmentList.jsx');
  assert.match(assignments, /\(!isAnamnese && assignment\.status === 'in_progress'\)/,
    'na Gestão, anamnese sendo respondida não abre o rascunho do paciente');
});
