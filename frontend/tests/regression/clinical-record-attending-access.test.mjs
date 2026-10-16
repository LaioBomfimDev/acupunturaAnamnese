// ============================================================
// "Erro ao carregar a ficha" (16/10/2026).
// Sintoma: na Psicologia, todos os pacientes abriam com "Erro ao carregar
// a ficha" para a administradora. Causa: get_latest_clinical_record e
// upsert_versioned_clinical_record só abriam a ficha da área para quem
// CADASTROU o paciente (patients.therapist_id). Também prendia quem atende
// paciente cadastrado por outra pessoa (a Denise num paciente que a Karen
// cadastrou). Correção 20261016b: quem atende na área também abre (a mesma
// regra das escalas), cada um com a própria ficha; a administração que não
// atende vê "Ficha de quem atende" no lugar do erro.
// Validado no banco real com ROLLBACK (11 cenários) antes de aplicar.
// ============================================================

import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MIGRATIONS = path.resolve(root, '../supabase/migrations');
const FIX = path.join(MIGRATIONS, '20261016b_clinical_record_attending_access.sql');
const read = rel => readFile(path.join(root, rel), 'utf8');

function functionBody(sql, name) {
  const match = sql.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\$${name}\\$;`));
  assert.ok(match, `função ${name}`);
  return match[0].replace(/\r\n/g, '\n');
}

const OLD_GATE = `  IF NOT EXISTS (
    SELECT 1
    FROM public.patients p
    WHERE p.id = p_patient_id
      AND p.therapist_id = v_uid
  ) THEN`;

test('ficha da área: parte das últimas versões e só troca a conferência de acesso', async () => {
  const fix = await readFile(FIX, 'utf8');
  const sources = {
    get_latest_clinical_record: '20260910_neuropsicologia_discipline.sql',
    upsert_versioned_clinical_record: '20260914_generic_anamnese_record_types.sql',
  };
  for (const [name, file] of Object.entries(sources)) {
    const previous = functionBody(await readFile(path.join(MIGRATIONS, file), 'utf8'), name);
    const updated = functionBody(fix, name);
    assert.ok(previous.includes(OLD_GATE), `${name}: a versão anterior tinha a trava só de quem cadastrou`);
    assert.ok(!updated.includes(OLD_GATE), `${name}: a trava antiga saiu`);
    // Tirando o bloco novo, o resto é idêntico à versão anterior.
    const start = updated.indexOf('  -- 20261016b:');
    const end = updated.indexOf('  ) THEN', start) + '  ) THEN'.length;
    assert.ok(start > 0 && end > start, `${name}: bloco novo marcado`);
    assert.equal(updated.slice(0, start) + OLD_GATE + updated.slice(end), previous, `${name}: resto igual`);

    const gate = updated.slice(start, end);
    assert.match(gate, /p\.therapist_id = v_uid/, 'quem cadastrou continua abrindo');
    assert.match(gate, /p_discipline IS NOT NULL\s+AND public\.can_use_patient_instruments\(p\.id, p_discipline, v_uid\)/,
      'quem atende na área (Agenda ou responsável), nunca a administração por ser administração');
    // A ficha continua sendo de cada profissional.
    assert.match(updated, /cr\.therapist_id = v_uid/);
  }
  assert.match(fix, /to_regprocedure\('public\.can_use_patient_instruments\(uuid,text,uuid\)'\) IS NULL/);
});

test('tela: banco recusando por não atender vira "Ficha de quem atende", não erro', async () => {
  const { isNotAttendingError } = await import(pathToFileURL(path.join(root, 'src/utils/clinicalRecordAccess.js')).href);
  assert.equal(isNotAttendingError({ code: '42501', message: 'Acesso negado: paciente não pertence ao profissional autenticado.' }), true);
  assert.equal(isNotAttendingError({ code: '42501', message: 'Acesso negado: conclua a troca da senha temporária.' }), false);
  assert.equal(isNotAttendingError({ code: '40001', message: 'Conflito' }), false);
  assert.equal(isNotAttendingError(null), false);

  for (const file of ['src/components/PsychologyWorkspace.jsx', 'src/components/DisciplineWorkspace.jsx', 'src/components/NeuropsychologyWorkspace.jsx']) {
    const workspace = await read(file);
    assert.match(workspace, /if \(isNotAttendingError\(err\)\) \{\r?\n\s+setSaveStatus\('no_access'\);\r?\n\s+return;\r?\n\s+\}\r?\n\s+setSaveStatus\('load_error'\);/, file);
  }
  const indicator = await read('src/components/ui/SaveIndicator.jsx');
  assert.match(indicator, /no_access: \{ text: 'Ficha de quem atende', tone: 'idle', clickable: false \}/);

  const psi = await read('src/components/PsychologyWorkspace.jsx');
  // Acima do aviso, só o "Responder em casa" (home-anamnese): a administração
  // envia a anamnese mesmo sem atender; a ficha continua de quem atende.
  assert.match(psi, /if \(noAccess && !TABS_WITHOUT_RECORD\.includes\(effectiveTab\)\) \{\r?\n\s+return \(\r?\n\s+<>\r?\n\s+\{homeBox\}\r?\n\s+<PsychologyNoAccess/);
  // Escalas e entrevistas seguem abrindo para a administração.
  assert.match(psi, /const TABS_WITHOUT_RECORD = \[[\s\S]*?PSYCHOLOGY_TABS\.ESCALAS,[\s\S]*?\.\.\.Object\.keys\(PSYCHOLOGY_INTERVIEW_TABS\),/);
});

test('menu da Psicologia: Infantil e Adulto com anamnese e entrevista; rastreio e escalas fora', async () => {
  const anamnese = await import(pathToFileURL(path.join(root, 'src/data/psychologyAnamnese.js')).href);
  const { PSYCHOLOGY_TABS: T } = anamnese;
  assert.equal(anamnese.anamnesePathOfTab(T.ANAMNESE_INFANTIL), 'infantojuvenil');
  assert.equal(anamnese.anamnesePathOfTab(T.ANAMNESE_ADULTO), 'adulto');
  assert.equal(anamnese.anamnesePathOfTab(T.ESCALAS), null);
  assert.deepEqual(anamnese.PSYCHOLOGY_INTERVIEW_TABS, {
    'Entrevista pais e professores': 'pais_professores',
    'Entrevista familiar / laboral': 'familiar_laboral',
    'Entrevista de rastreio': 'rastreio',
  });

  const psi = await read('src/components/PsychologyWorkspace.jsx');
  assert.match(psi, /title: 'Avaliação',\r?\n\s+tabs: \[\r?\n\s+PSYCHOLOGY_TABS\.ENTREVISTA_RASTREIO,\r?\n\s+PSYCHOLOGY_TABS\.PERGUNTAS_COMPLEMENTARES,\r?\n\s+PSYCHOLOGY_TABS\.ESCALAS,/);
  // "Anamnese" dos atalhos internos leva à do percurso.
  assert.match(psi, /if \(tab === PSYCHOLOGY_TABS\.ANAMNESE\r?\n/);
  assert.match(psi, /fixedPath=\{anamnesePath\}/);
  const chooser = await read('src/components/psychology/PsychologyPathChooser.jsx');
  assert.match(chooser, /const \[intakePath, setIntakePath\] = useState\(fixedPath\);/);
});

test('cadastrar paciente dentro da área usa a mesma ficha de Pacientes da instituição', async () => {
  const start = await read('src/components/PatientStart.jsx');
  const panel = await read('src/components/ClinicPatientsPanel.jsx');
  const form = await read('src/components/NewPatientForm.jsx');
  assert.match(start, /<NewPatientForm\r?\n\s+initialDiscipline=\{initialDiscipline\}/);
  assert.match(start, /\+ Cadastrar paciente/);
  assert.match(panel, /<NewPatientForm onCancel=\{\(\) => setMode\(null\)\} onCreated=\{handleCreated\} \/>/);
  assert.doesNotMatch(panel, /<form className="cp-form"/, 'o formulário mora num lugar só');
  // A ficha nasce com a matrícula na área escolhida (a área atual, por padrão).
  assert.match(form, /useState\(\(\) => \(\{ \.\.\.EMPTY_FORM, discipline: initialDiscipline \}\)\)/);
  assert.match(form, /const enrollment = await enrollPatientInitial\(patient\.id, form\.discipline\);/);
});
