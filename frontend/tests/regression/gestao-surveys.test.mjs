import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';

// Gestão > Pesquisa de satisfação: filtro por semana/mês (data de envio)
// e exclusão das pesquisas de teste — só administradora, em lote,
// digitando "excluir", avisando quando a nota do paciente vai junto.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let server;
let surveys;
let panel;
let service;
let migration;

before(async () => {
  server = await createServer({
    root,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  });
  surveys = await server.ssrLoadModule('/src/utils/gestaoSurveys.js');
  [panel, service, migration] = await Promise.all([
    readFile(path.join(root, 'src/components/panels/RelatoriosGestao.jsx'), 'utf8'),
    readFile(path.join(root, 'src/services/satisfactionSurveyService.js'), 'utf8'),
    readFile(path.resolve(root, '../supabase/migrations/20260929b_satisfaction_surveys_delete.sql'), 'utf8'),
  ]);
});

after(async () => {
  await server?.close();
});

const dayKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

test('mês vai do dia 1 ao dia 1 do mês seguinte (fim exclusivo)', () => {
  const range = surveys.surveyPeriodRange('month', new Date(2026, 8, 29, 15));
  assert.equal(dayKey(range.start), '2026-09-01');
  assert.equal(dayKey(range.end), '2026-10-01');
  assert.equal(surveys.surveyPeriodLabel('month', new Date(2026, 8, 29)), 'Setembro de 2026');
});

test('semana começa no domingo, igual ao resto da agenda', () => {
  // 29/09/2026 é terça.
  const range = surveys.surveyPeriodRange('week', new Date(2026, 8, 29, 15));
  assert.equal(dayKey(range.start), '2026-09-27');
  assert.equal(dayKey(range.end), '2026-10-04');
  assert.equal(surveys.surveyPeriodLabel('week', new Date(2026, 8, 29)), '27/09 a 03/10/2026');
  assert.equal(surveys.surveyPeriodLabel('week', new Date(2025, 11, 30)), '28/12/2025 a 03/01/2026');
});

test('"Tudo" não recorta nada', () => {
  assert.equal(surveys.surveyPeriodRange('all', new Date(2026, 8, 29)), null);
  assert.equal(surveys.isInSurveyPeriod('2020-01-01T00:00:00Z', null), true);
});

test('andar de mês nunca pula mês curto; semana anda 7 dias', () => {
  const fromJan31 = surveys.shiftSurveyPeriod('month', new Date(2026, 0, 31), 1);
  assert.equal(dayKey(fromJan31), '2026-02-01');
  const back = surveys.shiftSurveyPeriod('month', new Date(2026, 0, 15), -1);
  assert.equal(dayKey(back), '2025-12-01');
  const nextWeek = surveys.shiftSurveyPeriod('week', new Date(2026, 8, 29), 1);
  assert.equal(dayKey(nextWeek), '2026-10-06');
});

test('não avança para período que ainda não terminou', () => {
  const today = new Date(2026, 8, 29, 10);
  assert.equal(surveys.canAdvanceSurveyPeriod('month', today, today), false);
  assert.equal(surveys.canAdvanceSurveyPeriod('month', new Date(2026, 7, 10), today), true);
  assert.equal(surveys.canAdvanceSurveyPeriod('week', new Date(2026, 8, 20), today), true);
  assert.equal(surveys.canAdvanceSurveyPeriod('all', today, today), false);
});

test('pesquisa entra no período pelo envio, com fim exclusivo', () => {
  const range = surveys.surveyPeriodRange('month', new Date(2026, 8, 10));
  assert.equal(surveys.isInSurveyPeriod(new Date(2026, 8, 30, 23, 59).toISOString(), range), true);
  assert.equal(surveys.isInSurveyPeriod(new Date(2026, 9, 1, 0, 0).toISOString(), range), false);
});

test('números do topo seguem a lista carregada (o período)', () => {
  const stats = surveys.surveyStats([
    { responded_at: '2026-09-02', rating: 5 },
    { responded_at: '2026-09-03', rating: 2 },
    { responded_at: null, rating: null },
    { responded_at: null, rating: null },
  ]);
  assert.deepEqual(stats, { total: 4, responded: 2, rate: 0.5, avg: 3.5 });
  assert.deepEqual(surveys.surveyStats([]), { total: 0, responded: 0, rate: 0, avg: 0 });
});

test('confirmação avisa quando a nota do paciente será apagada junto, no plural certo', () => {
  const open = { responded_at: null };
  const rated = { responded_at: '2026-09-02', rating: 4 };

  const none = surveys.surveyDeletionSummary([open, open, open]);
  assert.equal(none.title, 'Excluir 3 pesquisas?');
  assert.equal(none.ratedWarning, '');

  const single = surveys.surveyDeletionSummary([rated]);
  assert.equal(single.title, 'Excluir 1 pesquisa?');
  assert.match(single.ratedWarning, /já respondeu esta pesquisa/);
  assert.match(single.ratedWarning, /A nota e o comentário serão apagados junto/);

  const oneOfThree = surveys.surveyDeletionSummary([rated, open, open]);
  assert.match(oneOfThree.ratedWarning, /^1 delas já tem nota do paciente\./);
  assert.match(oneOfThree.ratedWarning, /A nota e o comentário/);

  const twoOfThree = surveys.surveyDeletionSummary([rated, rated, open]);
  assert.match(twoOfThree.ratedWarning, /^2 delas já têm nota do paciente\./);
  assert.match(twoOfThree.ratedWarning, /As notas e os comentários/);

  const all = surveys.surveyDeletionSummary([rated, rated]);
  assert.match(all.ratedWarning, /^Todas as 2 já têm nota do paciente\./);

  assert.equal(surveys.surveyDeletedMessage(1), '1 pesquisa excluída.');
  assert.equal(surveys.surveyDeletedMessage(3), '3 pesquisas excluídas.');
  assert.equal(surveys.surveySelectionLabel(0), 'Selecionar todas');
  assert.equal(surveys.surveySelectionLabel(1), '1 selecionada');
  assert.equal(surveys.surveySelectionLabel(2), '2 selecionadas');
});

test('lista recorta no servidor pela data de envio e mantém teto de linhas', () => {
  assert.match(service, /\.gte\('created_at', from\)/);
  assert.match(service, /\.lt\('created_at', to\)/);
  assert.match(service, /\.limit\(limit\)/);
  assert.match(panel, /listSatisfactionSurveys\(\{\s*limit: SURVEY_LIST_LIMIT,\s*from: surveyRange/);
});

test('exclusão confere quantas o banco apagou de fato (RLS barra sem erro)', () => {
  assert.match(service, /\.delete\(\)\s*\.in\('id', uniqueIds\)\s*\.select\('id'\)/);
  assert.match(panel, /deletedIds\.length === requestedIds\.length/);
  assert.match(panel, /Nenhuma pesquisa foi excluída/);
});

test('exclusão só para administradora, digitando "excluir", sobre o que está visível', () => {
  assert.match(panel, /isDeleteConfirmationValid\(surveyDeleteText\)/);
  assert.doesNotMatch(panel, /window\.confirm/);
  assert.match(panel, /isClinicAdmin && surveyDeleteOpen/);
  assert.match(panel, /\{isClinicAdmin && \(\s*<input\s+type="checkbox"\s+className="gt-card-check"/);
  assert.match(panel, /filteredSurveys\.filter\(item => selectedSurveyIds\.has\(item\.id\)\)/);
  assert.match(panel, /surveyDeletion\.ratedWarning/);
});

test('policy de DELETE: mesma instituição + administradora ou super admin', () => {
  assert.match(migration, /CREATE POLICY satisfaction_surveys_delete ON public\.satisfaction_surveys\s+FOR DELETE TO authenticated/);
  assert.match(migration, /public\.can_manage_agenda\(clinic_id\)\s+AND \(public\.is_clinic_admin\(\) OR public\.is_super_admin\(\)\)/);
  assert.match(migration, /GRANT DELETE ON public\.satisfaction_surveys TO authenticated/);
  assert.doesNotMatch(migration, /FOR UPDATE/);
  assert.doesNotMatch(migration, /TO anon/);
});
