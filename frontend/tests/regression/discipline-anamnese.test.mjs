import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';

// Anamnese genérica: fisioterapia e nutrição (07/08/2026). O contrato
// (data/anamneseKit.js) é o mesmo da Psicologia — o que muda é o
// vocabulário. Estes testes protegem o contrato, não o texto clínico,
// que ainda é rascunho a validar pelas profissionais de cada área.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let server;
let kit;
let registry;

before(async () => {
  server = await createServer({
    root,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  });
  [kit, registry] = await Promise.all([
    server.ssrLoadModule('/src/data/anamneseKit.js'),
    server.ssrLoadModule('/src/data/anamneseRegistry.js'),
  ]);
});

after(async () => {
  await server?.close();
});

function configs() {
  return Object.entries(registry.ANAMNESE_CONFIGS);
}

test('cada disciplina registrada traz uma configuração completa', () => {
  const required = [
    'discipline', 'label', 'recordType', 'contentStatus', 'draftNotice',
    'pathsTitle', 'pathsIntro', 'profiles', 'sectionSets', 'textFields',
    'checklistSections', 'riskGroup', 'riskItems', 'riskReminder',
    'axes', 'axesIntro', 'contextModules',
  ];

  assert.ok(configs().length >= 2, 'fisioterapia e nutrição devem estar registradas');
  for (const [id, config] of configs()) {
    assert.equal(config.discipline, id, 'a chave do registro deve casar com a disciplina');
    for (const key of required) {
      assert.ok(config[key], `${id}: falta "${key}" na configuração`);
    }
    // Enquanto não houver validação profissional, o banner precisa existir.
    assert.equal(config.contentStatus, 'rascunho_a_validar', `${id}: conteúdo não validado deve se declarar`);
  }
});

test('o record_type e a disciplina são aceitos pelas CHECKs do banco', async () => {
  // A CHECK de discipline nasceu em 20260708 e se repete nas seguintes.
  const migration = await readFile(
    path.resolve(root, '../supabase/migrations/20260710_insert_record_discipline.sql'),
    'utf8',
  );
  for (const [id, config] of configs()) {
    assert.ok(migration.includes(`'${id}'`), `a CHECK de discipline precisa aceitar '${id}'`);
    assert.match(config.recordType, /^[a-z_]+$/, `${id}: record_type deve ser snake_case`);
  }

  // record_type único por disciplina — senão um prontuário sobrescreve o outro.
  const recordTypes = configs().map(([, config]) => config.recordType);
  assert.equal(new Set(recordTypes).size, recordTypes.length, 'record_type deve ser único por disciplina');
});

test('todo percurso aponta para um conjunto de seções existente e não vazio', () => {
  for (const [id, config] of configs()) {
    assert.ok(config.profiles.length >= 2, `${id}: precisa de mais de um percurso`);
    for (const profile of config.profiles) {
      const sections = kit.getProfileSections(config, profile.id);
      assert.ok(sections.length >= 3, `${id}/${profile.id}: roteiro raso demais`);
      assert.ok(profile.label && profile.shortLabel && profile.description,
        `${id}/${profile.id}: percurso precisa de rótulo, rótulo curto e descrição`);
    }
    // Nenhum conjunto de seções pode ficar órfão (escrito e nunca usado).
    const used = new Set(config.profiles.map(profile => profile.sectionSet));
    for (const key of Object.keys(config.sectionSets)) {
      assert.ok(used.has(key), `${id}: conjunto de seções "${key}" não é usado por percurso algum`);
    }
  }
});

test('todo campo tem id único, rótulo, perguntas de escuta e 4-8 chips', () => {
  for (const [id, config] of configs()) {
    const seen = new Map();
    const allFields = [
      ...config.textFields,
      ...kit.getAllProfileFields(config),
      ...kit.getAllContextFields(config),
    ];
    for (const field of allFields) {
      assert.ok(!seen.has(field.id), `${id}: campo duplicado "${field.id}"`);
      seen.set(field.id, field);
      assert.ok(field.label, `${id}/${field.id}: sem rótulo`);
      assert.ok(
        field.questionGuide.length >= 2,
        `${id}/${field.id}: precisa de perguntas de escuta (tem ${field.questionGuide.length})`,
      );
      assert.ok(
        field.quickWords.length >= 4 && field.quickWords.length <= 8,
        `${id}/${field.id}: deve ter 4-8 chips (tem ${field.quickWords.length})`,
      );
    }
    assert.ok(allFields.length >= 25, `${id}: anamnese rasa demais (${allFields.length} campos)`);
  }
});

test('o bloco de risco traz triagem, o que observar e conduta lembrada', () => {
  for (const [id, config] of configs()) {
    assert.ok(config.riskItems.length >= 4, `${id}: bloco de risco precisa de cobertura real`);
    for (const item of config.riskItems) {
      assert.ok(item.label, `${id}: item de risco sem rótulo`);
      assert.ok(item.summary, `${id}/${item.label}: precisa dizer por que importa`);
      assert.ok(item.screening.length >= 2, `${id}/${item.label}: precisa de perguntas de triagem`);
      assert.ok(item.observe.length >= 2, `${id}/${item.label}: precisa do que observar`);
      assert.ok(item.reminder, `${id}/${item.label}: precisa da conduta lembrada`);
    }
    // O sistema lembra; quem decide é a profissional — invariante de todas.
    assert.match(config.riskReminder, /a decisão é sempre sua/i, `${id}: o lembrete deve preservar o gate humano`);
  }
});

test('nenhum módulo de contexto é amarrado a sexo e todos abrem em qualquer percurso', () => {
  for (const [id, config] of configs()) {
    const profileIds = new Set(config.profiles.map(profile => profile.id));
    assert.ok(config.contextModules.length >= 4, `${id}: poucos módulos de contexto`);
    for (const module of config.contextModules) {
      assert.ok(module.summary, `${id}/${module.id}: precisa dizer quando abrir`);
      assert.ok(module.fields.length >= 3, `${id}/${module.id}: precisa de conteúdo real`);
      for (const profileId of module.suggestedFor) {
        assert.ok(profileIds.has(profileId), `${id}/${module.id}: sugere percurso inexistente "${profileId}"`);
      }
      for (const field of module.fields) {
        assert.ok(field.id.startsWith('ctx'), `${id}/${field.id}: campo de contexto usa prefixo ctx`);
      }
    }

    // Um módulo aberto à mão vale em qualquer percurso — sugerir é
    // pré-abrir, nunca restringir.
    const first = config.contextModules[0];
    const opened = kit.getOpenContextFields(config, { [first.id]: true });
    assert.equal(opened.length, first.fields.length);
  }
});

test('módulo fechado não entra na ficha ativa nem no resumo', () => {
  for (const [id, config] of configs()) {
    const profileId = config.profiles[0].id;
    const module = config.contextModules[0];
    const field = module.fields[0];

    const closed = kit.getActiveTextFields(config, profileId, {}).map(f => f.id);
    const open = kit.getActiveTextFields(config, profileId, { [module.id]: true }).map(f => f.id);
    assert.ok(!closed.includes(field.id), `${id}: módulo fechado não pode entrar na ficha`);
    assert.ok(open.includes(field.id), `${id}: módulo aberto deve entrar na ficha`);

    const session = kit.createEmptySession(config);
    session.intakeProfile = profileId;
    session.fields[field.id] = 'texto escrito antes de fechar';
    assert.equal(kit.buildWorkspaceSummary(config, session).filledFields, 0);
    session.contextModules = { [module.id]: true };
    assert.equal(kit.buildWorkspaceSummary(config, session).filledFields, 1);
  }
});

test('a sessão vazia declara a disciplina e conhece todas as chaves de campo', () => {
  for (const [id, config] of configs()) {
    const session = kit.createEmptySession(config);
    assert.equal(session.discipline, id);
    assert.equal(session.intakeProfile, null);
    assert.deepEqual(session.contextModules, {});

    // Todas as chaves existem desde o início, inclusive de percursos e
    // módulos não usados: sem isso os inputs ficariam não controlados.
    for (const field of kit.getAllContextFields(config)) {
      assert.ok(field.id in session.fields, `${id}: falta a chave ${field.id}`);
    }
    for (const field of kit.getAllProfileFields(config)) {
      assert.ok(field.id in session.fields, `${id}: falta a chave ${field.id}`);
    }
  }
});

test('normalizar registro antigo preserva conteúdo e cai na sugestão do percurso', () => {
  for (const [, config] of configs()) {
    const profileId = config.profiles[0].id;
    const suggested = kit.getSuggestedContextModules(config, profileId);

    const restored = kit.normalizeSession(config, {
      intakeProfile: profileId,
      fields: { queixaObjetivo: 'texto salvo antes', queixaPrincipal: 'texto salvo antes' },
      selectedMap: { 'grupo:item': true },
    });
    assert.deepEqual(restored.contextModules, suggested);
    assert.equal(restored.selectedMap['grupo:item'], true);

    // contextModules gravado prevalece sobre a sugestão.
    const explicit = kit.normalizeSession(config, {
      intakeProfile: profileId,
      contextModules: {},
    });
    assert.deepEqual(explicit.contextModules, {});
  }
});

test('as duas disciplinas ficaram acessíveis no hub e roteadas para o workspace genérico', async () => {
  const [disciplines, appSource] = await Promise.all([
    server.ssrLoadModule('/src/data/disciplines.js'),
    readFile(path.resolve(root, 'src/App.jsx'), 'utf8'),
  ]);

  for (const [id] of configs()) {
    const discipline = disciplines.getDiscipline(id);
    assert.equal(discipline.available, true, `${id} deve estar liberada no hub`);
  }
  assert.match(appSource, /GENERIC_ANAMNESE_DISCIPLINES\.includes\(activeDiscipline\)/);
  assert.match(appSource, /<DisciplineWorkspace/);
});

test('cada disciplina define evolução com indicadores comparáveis e campos de texto', () => {
  for (const [id, config] of configs()) {
    const { evolution } = config;
    assert.ok(evolution?.intro, `${id}: evolução precisa explicar o que registrar`);
    assert.ok(evolution.indicators.length >= 2, `${id}: precisa de indicadores comparáveis entre sessões`);
    assert.ok(evolution.fields.length >= 4, `${id}: precisa de campos de registro da sessão`);

    const ids = new Set();
    for (const item of [...evolution.indicators, ...evolution.fields]) {
      assert.ok(item.id && item.label, `${id}: item de evolução sem id ou rótulo`);
      assert.ok(!ids.has(item.id), `${id}: id de evolução duplicado "${item.id}"`);
      ids.add(item.id);
    }
    // 'data' e 'sessao' são gravados pelo componente; não podem colidir.
    assert.ok(!ids.has('data') && !ids.has('sessao'), `${id}: evolução não pode redefinir data/sessao`);
  }
});

test('o relatório tem modo interno completo e modo externo resumido', () => {
  for (const [id, config] of configs()) {
    const { report } = config;
    assert.ok(report?.modes?.length >= 2, `${id}: precisa de modo interno e externo`);
    for (const mode of report.modes) {
      assert.ok(mode.id && mode.label && mode.title, `${id}: modo de relatório incompleto`);
      assert.ok(['full', 'summary'].includes(mode.scope), `${id}: escopo inválido em ${mode.id}`);
    }
    assert.ok(report.modes.some(mode => mode.scope === 'full'), `${id}: falta o registro interno completo`);
    assert.ok(report.modes.some(mode => mode.scope === 'summary'), `${id}: falta o relatório externo resumido`);
    assert.ok(report.externalNotice, `${id}: o documento externo precisa se declarar`);
    assert.match(
      report.externalNotice,
      /não substitui diagnóstico médico/i,
      `${id}: o relatório externo deve deixar claro o que não é`,
    );

    // O resumo só pode apontar para campos que existem de verdade.
    const known = new Set([
      ...config.textFields.map(field => field.id),
      ...kit.getAllProfileFields(config).map(field => field.id),
      ...kit.getAllContextFields(config).map(field => field.id),
    ]);
    assert.ok(report.summaryFieldIds.length > 0, `${id}: o resumo precisa de campos`);
    for (const fieldId of report.summaryFieldIds) {
      assert.ok(known.has(fieldId), `${id}: summaryFieldIds aponta para campo inexistente "${fieldId}"`);
    }
  }
});

test('o documento que sai da clínica não leva a ficha inteira nem a nota de risco', async () => {
  const source = await readFile(
    path.resolve(root, 'src/components/anamnese/DisciplineRelatorio.jsx'),
    'utf8',
  );
  // Resumo usa só os campos declarados; interno usa todos.
  assert.match(source, /mode\.scope === 'summary' \? summaryFields : allFields/);
  // A anotação de conduta de risco é detalhe de prontuário.
  assert.match(source, /mode\.scope === 'full' && riskNotes/);
  // Evolução completa também é só do registro interno.
  assert.match(source, /mode\.scope === 'full' && evolucoes\.length > 0/);
  // HTML editado passa por saneamento antes de ir para a tela e a impressão.
  assert.match(source, /function sanitizeHtml/);
  assert.match(source, /doc\.querySelectorAll\('script,style,iframe,object,embed,link,meta'\)/);
});

test('a evolução não grava sessão vazia e confirma antes de excluir', async () => {
  const source = await readFile(
    path.resolve(root, 'src/components/anamnese/DisciplineEvolucao.jsx'),
    'utf8',
  );
  assert.match(source, /const hasContent = config\.evolution\.fields/);
  // Sessão vazia não é gravada silenciosamente: agora avisa o motivo em
  // vez de só ignorar o clique (ver supabase/migrations/20260903, que
  // trouxe o registro de evolução vinculado ao atendimento).
  assert.match(source, /if \(!hasContent\) \{\s*\n\s*setSaveError/);
  assert.match(source, /window\.confirm\('Excluir este registro de sessão\?/);
});

test('evolução e relatório deixaram de ser placeholder no workspace genérico', async () => {
  const source = await readFile(
    path.resolve(root, 'src/components/DisciplineWorkspace.jsx'),
    'utf8',
  );
  assert.match(source, /<DisciplineEvolucao/);
  assert.match(source, /<DisciplineRelatorio/);
  assert.doesNotMatch(source, /PLACEHOLDER_TABS/);
  // Ambos gravam na mesma sessão que o auto-save já cobre.
  assert.match(source, /handleEvolucoesChange/);
  assert.match(source, /handleRelatorioChange/);
});

test('o workspace genérico bloqueia escrita quando a leitura do prontuário falha', async () => {
  const source = await readFile(
    path.resolve(root, 'src/components/DisciplineWorkspace.jsx'),
    'utf8',
  );
  // Mesma proteção do MTC e da Psi: não sobrescrever prontuário não carregado.
  assert.match(source, /loadBlockedRef\.current = true/);
  assert.match(source, /if \(!patientId \|\| loadBlockedRef\.current\) return;/);
  // Autosave com fila serial e versão, como as demais disciplinas.
  assert.match(source, /saveQueue\.enqueue\(/);
  assert.match(source, /changeVersion/);
});
