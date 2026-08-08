import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';

// Os módulos de contexto substituíram os blocos "por sexo clínico"
// (07/08/2026). A regra que estes testes protegem: o gatilho do que se
// pergunta é PERTINÊNCIA, nunca sexo; nada é exclusivo de um perfil; e
// fechar um bloco esconde, não apaga.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let server;
let modules;
let anamneseData;
let intakeProfiles;

before(async () => {
  server = await createServer({
    root,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  });
  [modules, anamneseData, intakeProfiles] = await Promise.all([
    server.ssrLoadModule('/src/data/psychologyContextModules.js'),
    server.ssrLoadModule('/src/data/psychologyAnamnese.js'),
    server.ssrLoadModule('/src/data/psychologyIntakeProfiles.js'),
  ]);
});

after(async () => {
  await server?.close();
});

test('nenhuma seção do roteiro depende mais do sexo clínico', () => {
  const { PSYCHOLOGY_INTAKE_PROFILES, getPsychologyProfileSections } = intakeProfiles;

  const byAgeGroup = new Map();
  for (const profile of PSYCHOLOGY_INTAKE_PROFILES) {
    const fieldIds = getPsychologyProfileSections(profile.id)
      .flatMap(section => section.fields.map(field => field.id))
      .sort()
      .join('|');
    const known = byAgeGroup.get(profile.ageGroup);
    if (known === undefined) {
      byAgeGroup.set(profile.ageGroup, fieldIds);
    } else {
      // Mesma faixa etária ⇒ exatamente o mesmo roteiro, independente do sexo.
      assert.equal(known, fieldIds, `${profile.id} diverge do roteiro de ${profile.ageGroup}`);
    }
  }

  // Faixas etárias diferentes CONTINUAM diferentes: essa distinção é real.
  assert.equal(byAgeGroup.size, 2);
  const [adulto, infantil] = [...byAgeGroup.values()];
  assert.notEqual(adulto, infantil);
});

test('todo módulo é aberto por qualquer perfil e nenhum é exclusivo', () => {
  const { PSYCHOLOGY_CONTEXT_MODULES, getSuggestedContextModules } = modules;
  const { PSYCHOLOGY_INTAKE_PROFILES } = intakeProfiles;
  const profileIds = new Set(PSYCHOLOGY_INTAKE_PROFILES.map(profile => profile.id));

  assert.ok(PSYCHOLOGY_CONTEXT_MODULES.length > 0);
  for (const module of PSYCHOLOGY_CONTEXT_MODULES) {
    assert.ok(module.label, `${module.id} precisa de rótulo`);
    assert.ok(module.summary, `${module.id} precisa de orientação de quando abrir`);
    assert.ok(module.fields.length >= 3, `${module.id} precisa de conteúdo real (3+ campos)`);
    for (const profileId of module.suggestedFor) {
      assert.ok(profileIds.has(profileId), `${module.id} sugere perfil inexistente: ${profileId}`);
    }
    for (const field of module.fields) {
      assert.ok(field.id.startsWith('ctx'), `${field.id} deve usar o prefixo ctx`);
      assert.ok(field.label, `${field.id} precisa de rótulo`);
      assert.ok(field.questionGuide.length > 0, `${field.id} precisa de perguntas de escuta`);
      // Mesma regra dos campos do roteiro: chips demais viram ruído.
      assert.ok(
        field.quickWords.length >= 4 && field.quickWords.length <= 8,
        `${field.id} deve ter 4-8 quickWords (tem ${field.quickWords.length})`,
      );
    }
  }

  // Sugerir é pré-abrir, não restringir: um módulo aberto manualmente vale
  // para qualquer percurso.
  const suggestedForChild = getSuggestedContextModules('infantojuvenil_masculino');
  const openedByHand = { ...suggestedForChild, 'ciclo-hormonios-reproducao': true };
  const fields = modules.getOpenPsychologyContextFields(openedByHand);
  assert.ok(
    fields.some(field => field.id === 'ctxCicloHumor'),
    'um módulo aberto à mão deve valer em qualquer percurso',
  );
});

test('sem percurso escolhido nenhum módulo nasce aberto', () => {
  const { getSuggestedContextModules } = modules;
  assert.deepEqual(getSuggestedContextModules(null), {});
  assert.deepEqual(getSuggestedContextModules('perfil-inexistente'), {});
});

test('identidade de gênero e orientação nunca é pré-aberta por perfil algum', () => {
  const { getSuggestedContextModules, getPsychologyContextModule } = modules;
  const { PSYCHOLOGY_INTAKE_PROFILES } = intakeProfiles;

  const module = getPsychologyContextModule('identidade-genero-orientacao');
  assert.ok(module, 'o módulo deve existir');
  assert.deepEqual(module.suggestedFor, [], 'nunca deduzir identidade do cadastro');

  for (const profile of PSYCHOLOGY_INTAKE_PROFILES) {
    for (const age of [8, 15, 30, 70]) {
      const suggested = getSuggestedContextModules(profile.id, age);
      assert.ok(
        !suggested['identidade-genero-orientacao'],
        `${profile.id}/${age} anos não pode pré-abrir identidade de gênero`,
      );
    }
  }
});

test('módulo com faixa etária só é pré-aberto com idade conhecida e dentro da faixa', () => {
  const { getSuggestedContextModules, getPsychologyContextModule } = modules;
  const puberdade = getPsychologyContextModule('puberdade-desenvolvimento-corporal');
  assert.equal(puberdade.suggestedMinAge, 9);

  const crianca = getSuggestedContextModules('infantojuvenil_feminino', 5);
  const adolescente = getSuggestedContextModules('infantojuvenil_feminino', 13);
  const idadeDesconhecida = getSuggestedContextModules('infantojuvenil_feminino');

  assert.ok(!crianca['puberdade-desenvolvimento-corporal'], '5 anos não deve pré-abrir puberdade');
  assert.ok(adolescente['puberdade-desenvolvimento-corporal'], '13 anos deve pré-abrir puberdade');
  assert.ok(
    !idadeDesconhecida['puberdade-desenvolvimento-corporal'],
    'idade desconhecida não deve pré-abrir bloco com faixa etária',
  );

  // Proteção infantil não tem faixa: é rastreio para toda criança.
  for (const suggested of [crianca, adolescente, idadeDesconhecida]) {
    assert.ok(suggested['protecao-seguranca-infantil'], 'proteção infantil vale para toda criança');
  }
});

test('o bloco de proteção infantil lembra a notificação compulsória', () => {
  const { getPsychologyContextModule } = modules;
  const protecao = getPsychologyContextModule('protecao-seguranca-infantil');

  assert.match(protecao.summary, /a s[óo]s/i, 'deve orientar rastreio sem o possível autor presente');
  assert.match(protecao.summary, /notifica[çc][ãa]o compuls[óo]ria/i);
  assert.match(protecao.summary, /ECA/, 'deve citar a base legal');
  // O sistema lembra; quem avalia e notifica é a profissional.
  assert.match(protecao.summary, /registra e lembra/i);
});

test('campo de módulo fechado não conta como ficha ativa', () => {
  const { getPsychologyTextFields, buildPsychologyWorkspaceSummary, createEmptyPsychologySession } = anamneseData;

  const closed = getPsychologyTextFields('adulto_feminino', {}).map(field => field.id);
  const open = getPsychologyTextFields('adulto_feminino', { 'ciclo-hormonios-reproducao': true })
    .map(field => field.id);

  assert.ok(!closed.includes('ctxCicloHumor'), 'módulo fechado não entra na ficha');
  assert.ok(open.includes('ctxCicloHumor'), 'módulo aberto entra na ficha');

  // Conteúdo de módulo fechado não infla nem esvazia o resumo de andamento.
  const session = createEmptyPsychologySession();
  session.intakeProfile = 'adulto_feminino';
  session.fields.ctxCicloHumor = 'texto escrito antes de fechar o bloco';
  const summaryClosed = buildPsychologyWorkspaceSummary(session);
  session.contextModules = { 'ciclo-hormonios-reproducao': true };
  const summaryOpen = buildPsychologyWorkspaceSummary(session);

  assert.equal(summaryClosed.filledFields, 0);
  assert.equal(summaryOpen.filledFields, 1);
});

test('fechar um módulo esconde o conteúdo sem apagá-lo', () => {
  const { normalizePsychologySession } = anamneseData;

  const saved = {
    intakeProfile: 'adulto_feminino',
    contextModules: { 'ciclo-hormonios-reproducao': false },
    fields: { ctxCicloHumor: 'piora pré-menstrual relatada' },
  };
  const session = normalizePsychologySession(saved);

  assert.equal(session.fields.ctxCicloHumor, 'piora pré-menstrual relatada');
  assert.equal(session.contextModules['ciclo-hormonios-reproducao'], false);
});

test('registro antigo sem contextModules cai na sugestão do percurso', () => {
  const { normalizePsychologySession } = anamneseData;
  const session = normalizePsychologySession({ intakeProfile: 'adulto_feminino' });

  assert.equal(session.contextModules['ciclo-hormonios-reproducao'], true);

  // No percurso infantil, proteção infantil entra (rastreio universal) e
  // puberdade não: normalizar um registro salvo não conhece a idade.
  const child = normalizePsychologySession({ intakeProfile: 'infantojuvenil_masculino' });
  assert.equal(child.contextModules['protecao-seguranca-infantil'], true);
  assert.ok(!child.contextModules['puberdade-desenvolvimento-corporal']);

  // Sem percurso, nada nasce aberto.
  assert.deepEqual(normalizePsychologySession({}).contextModules, {});
});

test('os campos dos antigos blocos por sexo continuam existindo para registros gravados', () => {
  const { LEGACY_SEX_FIELD_IDS } = intakeProfiles;
  const { createEmptyPsychologySession } = anamneseData;
  const session = createEmptyPsychologySession();

  assert.ok(LEGACY_SEX_FIELD_IDS.length > 0);
  for (const fieldId of LEGACY_SEX_FIELD_IDS) {
    assert.ok(fieldId in session.fields, `chave legada perdida: ${fieldId}`);
  }
});

test('o bloco de violência orienta atendimento a sós', () => {
  const { getPsychologyContextModule } = modules;
  const violence = getPsychologyContextModule('violencia-seguranca');

  assert.ok(violence, 'o módulo de violência deve existir');
  assert.match(violence.summary, /a s[óo]s/i, 'deve orientar rastreio sem acompanhante');
  assert.ok(
    violence.fields.some(field => /plano de seguran/i.test(field.label)),
    'deve haver campo para o plano de segurança combinado',
  );
});

test('a interface abre e fecha módulos sem apagar o texto', async () => {
  const workspace = await readFile(
    path.resolve(root, 'src/components/PsychologyWorkspace.jsx'),
    'utf8',
  );
  // Alterna apenas a chave do módulo; nada toca em session.fields.
  assert.match(workspace, /\[moduleId\]: !prev\.contextModules\?\.\[moduleId\]/);
  // A sugestão do percurso entra primeiro; o que a profissional já decidiu
  // sobrescreve. A idade participa da sugestão (blocos com faixa etária).
  assert.match(
    workspace,
    /getSuggestedContextModules\(profileId, getPatientAge\(selectedPatient\)\),\s*\.\.\.prev\.contextModules,/,
    'a escolha da profissional deve prevalecer sobre a sugestão do percurso',
  );
});
