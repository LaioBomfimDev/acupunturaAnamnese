import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';

// Os casos sintéticos de Psicologia (botão "Preencher teste aleatório")
// precisam falar exatamente o vocabulário do produto: um campo ou uma
// marcação com nome errado preenche silenciosamente o nada e faz o
// testador acreditar que a tela está quebrada.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let server;
let fixture;
let anamneseData;
let intakeProfiles;

before(async () => {
  server = await createServer({
    root,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  });
  [fixture, anamneseData, intakeProfiles] = await Promise.all([
    server.ssrLoadModule('/src/utils/testPsychologyFixture.js'),
    server.ssrLoadModule('/src/data/psychologyAnamnese.js'),
    server.ssrLoadModule('/src/data/psychologyIntakeProfiles.js'),
  ]);
});

after(async () => {
  await server?.close();
});

function allCases() {
  return fixture.getTestPsychologyCases()
    .map(item => fixture.buildPsychologyFixtureForCase(item.id));
}

test('todo perfil de anamnese tem pelo menos dois casos de teste', () => {
  const { PSYCHOLOGY_INTAKE_PROFILES } = intakeProfiles;
  const cases = fixture.getTestPsychologyCases();

  for (const profile of PSYCHOLOGY_INTAKE_PROFILES) {
    const forProfile = cases.filter(item => item.intakeProfile === profile.id);
    // Dois é o mínimo para o sorteio dentro de um percurso variar de fato.
    assert.ok(
      forProfile.length >= 2,
      `${profile.id} precisa de ao menos dois casos (tem ${forProfile.length})`,
    );
  }

  const knownProfiles = new Set(PSYCHOLOGY_INTAKE_PROFILES.map(profile => profile.id));
  for (const item of cases) {
    assert.ok(knownProfiles.has(item.intakeProfile), `perfil inexistente: ${item.intakeProfile}`);
  }
});

test('o sorteio dentro de um percurso nunca troca a anamnese escolhida', () => {
  const { PSYCHOLOGY_INTAKE_PROFILES } = intakeProfiles;
  fixture.resetRandomPsychologyFixtureCycle();

  for (const profile of PSYCHOLOGY_INTAKE_PROFILES) {
    const drawn = Array.from(
      { length: 6 },
      () => fixture.buildRandomPsychologyFixture(profile.id),
    );
    for (const item of drawn) {
      assert.equal(
        item.sessionPatch.intakeProfile,
        profile.id,
        `sorteio em ${profile.id} devolveu ${item.sessionPatch.intakeProfile}`,
      );
    }
    // Com dois ou mais casos por perfil, seis sorteios têm de variar.
    assert.ok(
      new Set(drawn.map(item => item.caseId)).size > 1,
      `${profile.id}: o sorteio deve alternar entre os casos do perfil`,
    );
  }

  fixture.resetRandomPsychologyFixtureCycle();
});

test('todo campo preenchido existe no roteiro do perfil escolhido', () => {
  const { getPsychologyTextFields } = anamneseData;

  for (const { caseId, intakeProfile, sessionPatch } of allCases()) {
    const validIds = new Set(
      getPsychologyTextFields(intakeProfile, sessionPatch.contextModules)
        .map(field => field.id),
    );
    for (const fieldId of Object.keys(sessionPatch.fields)) {
      assert.ok(validIds.has(fieldId), `${caseId}: campo inexistente "${fieldId}"`);
    }
    // Cobertura: o caso deve preencher o roteiro inteiro, não só metade.
    assert.equal(
      Object.keys(sessionPatch.fields).length,
      validIds.size,
      `${caseId}: o caso deve preencher todos os campos do perfil`,
    );
  }
});

test('toda marcação aponta para um item real do vocabulário psi', () => {
  const { psychologyChecklists, psychologyRiskChecklist, PSYCHOLOGY_RISK_GROUP } = anamneseData;
  const validKeys = new Set([
    ...Object.entries(psychologyChecklists)
      .flatMap(([group, items]) => items.map(item => `${group}:${item}`)),
    ...psychologyRiskChecklist.map(item => `${PSYCHOLOGY_RISK_GROUP}:${item}`),
  ]);

  for (const { caseId, sessionPatch } of allCases()) {
    const keys = Object.keys(sessionPatch.selectedMap);
    assert.ok(keys.length > 0, `${caseId}: deve marcar algum sinal`);
    for (const key of keys) {
      assert.ok(validKeys.has(key), `${caseId}: marcação inexistente "${key}"`);
    }
  }
});

test('todo módulo de contexto citado existe e algum caso fica sem módulo aberto', async () => {
  const contextModules = await server.ssrLoadModule('/src/data/psychologyContextModules.js');
  const validModules = new Set(
    contextModules.PSYCHOLOGY_CONTEXT_MODULES.map(module => module.id),
  );
  const cases = allCases();

  for (const { caseId, sessionPatch } of cases) {
    for (const moduleId of Object.keys(sessionPatch.contextModules)) {
      assert.ok(validModules.has(moduleId), `${caseId}: módulo inexistente "${moduleId}"`);
    }
  }

  // A ficha enxuta é o estado normal: precisa haver caso que não abre nada.
  assert.ok(
    cases.some(item => Object.keys(item.sessionPatch.contextModules).length === 0),
    'algum caso deve ficar sem módulo de contexto aberto',
  );
  assert.ok(
    cases.some(item => Object.keys(item.sessionPatch.contextModules).length > 0),
    'algum caso deve abrir módulo de contexto',
  );
});

test('toda formulação aponta para um eixo existente', () => {
  const { PSYCHOLOGY_AXES } = anamneseData;
  const axisIds = new Set(PSYCHOLOGY_AXES.map(axis => axis.id));

  for (const { caseId, sessionPatch } of allCases()) {
    for (const axisId of Object.keys(sessionPatch.axisNotes)) {
      assert.ok(axisIds.has(axisId), `${caseId}: eixo inexistente "${axisId}"`);
    }
  }
});

test('os casos exercitam o bloco de risco nos dois estados e ficam rastreáveis', () => {
  const { PSYCHOLOGY_RISK_GROUP } = anamneseData;
  const cases = allCases();

  const withRisk = cases.filter(item => Object.keys(item.sessionPatch.selectedMap)
    .some(key => key.startsWith(`${PSYCHOLOGY_RISK_GROUP}:`)));
  assert.ok(withRisk.length > 0, 'algum caso deve marcar sinal de risco');
  assert.ok(withRisk.length < cases.length, 'algum caso deve ficar sem sinal de risco');

  // Dado sintético precisa se identificar como tal dentro do prontuário.
  for (const { caseId, sessionPatch } of cases) {
    assert.match(sessionPatch.riskNotes, /\[DADOS DE TESTE\]/, `${caseId}: riskNotes deve se identificar`);
    assert.match(
      sessionPatch.fields.observacoesSessao,
      /\[DADOS DE TESTE\]/,
      `${caseId}: observações da sessão devem se identificar`,
    );
  }
});

test('a rotação percorre todos os casos antes de repetir', () => {
  const total = fixture.getTestPsychologyCases().length;
  fixture.resetRandomPsychologyFixtureCycle();

  const drawn = Array.from({ length: total }, () => fixture.buildRandomPsychologyFixture().caseId);
  assert.equal(new Set(drawn).size, total, 'uma rodada deve cobrir todos os casos sem repetir');

  fixture.resetRandomPsychologyFixtureCycle();
});

test('o preenchimento respeita o percurso ativo e troca marcações em vez de somar', async () => {
  const workspace = await readFile(
    path.resolve(root, 'src/components/PsychologyWorkspace.jsx'),
    'utf8',
  );
  assert.match(
    workspace,
    /buildRandomPsychologyFixture\(session\.intakeProfile \|\| undefined\)/,
    'o sorteio deve receber o percurso já escolhido',
  );
  assert.match(
    workspace,
    /selectedMap: \{ \.\.\.sessionPatch\.selectedMap \}/,
    'as marcações do caso anterior não podem se somar às do novo',
  );
});

test('o preenchimento de teste só é oferecido em desenvolvimento', async () => {
  const workspace = await readFile(
    path.resolve(root, 'src/components/PsychologyWorkspace.jsx'),
    'utf8',
  );
  assert.match(workspace, /import\.meta\.env\.DEV \? fillTestAnswers : undefined/);
  assert.doesNotMatch(
    workspace,
    /onFillTestAnswers=\{fillTestAnswers\}/,
    'o botão nunca pode ser ligado sem o gate de DEV',
  );
});
