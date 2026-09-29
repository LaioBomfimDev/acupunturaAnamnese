import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';

// Página pública da pesquisa de satisfação (/pesquisa-satisfacao):
// mesmo visual da confirmação de agendamento, estrelas no lugar dos
// números e contexto do atendimento avaliado (com quem, em que dia).

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let server;
let survey;

before(async () => {
  server = await createServer({
    root,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  });
  survey = await server.ssrLoadModule('/src/utils/satisfactionSurvey.js');
});

after(async () => {
  await server?.close();
});

test('as notas seguem 1 a 5, igual ao CHECK de satisfaction_surveys.rating', async () => {
  const sql = await readFile(
    path.resolve(root, '../supabase/migrations/20260901_satisfaction_surveys.sql'),
    'utf8',
  );
  assert.match(sql, /rating SMALLINT CHECK \(rating BETWEEN 1 AND 5\)/);
  assert.deepEqual(survey.SURVEY_RATINGS, [1, 2, 3, 4, 5]);
});

test('título diz com quem foi o atendimento, sem artigo de gênero', () => {
  assert.equal(survey.surveyTitle('Ana Paula Lima'), 'Como foi seu atendimento com Ana Paula Lima?');
  // Pesquisa sem atendimento ligado (ou function antiga): título genérico.
  assert.equal(survey.surveyTitle(null), 'Como foi seu atendimento?');
  assert.equal(survey.surveyTitle('   '), 'Como foi seu atendimento?');
  assert.doesNotMatch(survey.surveyTitle('Ana'), /com (a|o) /);
});

test('toda nota tem rótulo em pt-BR e sem nota aparece a instrução', () => {
  assert.equal(survey.ratingLabel(1), 'Muito ruim');
  assert.equal(survey.ratingLabel(3), 'Regular');
  assert.equal(survey.ratingLabel(5), 'Excelente');
  assert.equal(survey.ratingLabel(0), 'Toque numa estrela para dar sua nota');
});

test('convite do comentário acompanha a nota', () => {
  assert.equal(survey.commentPlaceholder(0), 'Conte como foi, se quiser.');
  assert.equal(survey.commentPlaceholder(2), 'O que podemos melhorar?');
  assert.equal(survey.commentPlaceholder(5), 'O que você mais gostou?');
});

test('limite do comentário da tela bate com o corte da Edge Function', async () => {
  const source = await readFile(path.resolve(root, '../supabase/functions/satisfaction-survey/index.ts'), 'utf8');
  assert.match(source, new RegExp(`\\.slice\\(0, ${survey.COMMENT_MAX_LENGTH}\\)`));
});

test('estrelas são radios nativos (teclado e leitor de tela), não botões soltos', async () => {
  const page = await readFile(path.resolve(root, 'src/SurveyPage.jsx'), 'utf8');
  assert.match(page, /type="radio"/);
  assert.match(page, /name="rating"/);
  assert.doesNotMatch(page, /aria-pressed/);
});

test('Edge Function devolve cor da clínica e contexto do atendimento, preso à mesma clínica', async () => {
  const source = await readFile(path.resolve(root, '../supabase/functions/satisfaction-survey/index.ts'), 'utf8');
  const view = source.match(/async function loadSurveyView[\s\S]*?\n}\n/)?.[0] || '';

  assert.match(view, /select\('name,brand_color'\)/);
  assert.match(view, /select\('starts_at,ends_at,profiles!professional_id\(full_name\)'\)/);
  assert.match(view, /\.eq\('clinic_id', survey\.clinic_id\)/);
  // Nada clínico na página pública: nem disciplina nem observação.
  assert.doesNotMatch(view, /discipline|notes|observ/);
});
