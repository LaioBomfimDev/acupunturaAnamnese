import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, readdir } from 'node:fs/promises';
import {
  FALTA_OBSERVATION_REQUIRED,
  ATTENDANCE_LABELS,
  EVOLUTION_DISCIPLINES,
  PSYCHOLOGY_FORM_DISCIPLINES,
  canWriteEvolution,
  endSentence,
  filterQueue,
  groupQueueByDay,
  nextQueueItem,
  onlyEvolutionDisciplines,
  toActiveAppointment,
  validateFaltaObservation,
} from '../../src/utils/evolutionQueue.js';

// Tela Evoluções (2026-09-23): a evolução saiu de dentro das disciplinas
// e ganhou tela própria, com fila e registro na mesma página. O fluxo
// antigo obrigava Agenda → pendência → disciplina → voltar pra Agenda a
// cada paciente. Estes testes seguram as três regras que motivaram a
// mudança: a fila anda sozinha, falta exige observação e nenhuma
// disciplina volta a ter formulário de evolução próprio.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MIGRATIONS_DIR = path.resolve(root, '../supabase/migrations');
const read = relative => readFile(path.resolve(root, relative), 'utf8');

// Versão viva de insert_patient_evolution: a última migration que a
// recria. Ler um arquivo fixo deixou passar 20260924b ter derrubado a
// Neuropsicologia que 20260910 tinha liberado.
async function latestInsertEvolutionMigration() {
  const files = (await readdir(MIGRATIONS_DIR)).filter(name => name.endsWith('.sql')).sort();
  let latest = null;
  for (const name of files) {
    const sql = await readFile(path.join(MIGRATIONS_DIR, name), 'utf8');
    if (/CREATE OR REPLACE FUNCTION public\.insert_patient_evolution\(/.test(sql)) latest = [name, sql];
  }
  return latest;
}

let sources;

before(async () => {
  const entries = await Promise.all(Object.entries({
    app: 'src/App.jsx',
    agenda: 'src/components/panels/Agenda.jsx',
    disciplineWorkspace: 'src/components/DisciplineWorkspace.jsx',
    psychologyWorkspace: 'src/components/PsychologyWorkspace.jsx',
    painelInicial: 'src/components/panels/PainelInicial.jsx',
    recordPanel: 'src/components/evolutions/EvolutionRecordPanel.jsx',
    screen: 'src/components/evolutions/EvolutionsScreen.jsx',
    css: 'src/styles/evolutions.css',
    evolucao: 'src/components/panels/Evolucao.jsx',
    psychologyEvolucao: 'src/components/psychology/PsychologyEvolucao.jsx',
    disciplineEvolucao: 'src/components/anamnese/DisciplineEvolucao.jsx',
    timeline: 'src/components/PatientEvolutionTimeline.jsx',
  }).map(async ([key, file]) => [key, await read(file)]));
  sources = Object.fromEntries(entries);
  [sources.migrationName, sources.migration] = await latestInsertEvolutionMigration();
});

const item = (id, startsAt, extra = {}) => ({
  appointment_id: id,
  patient_id: `p-${id}`,
  professional_id: 'me',
  discipline: 'acupuntura',
  starts_at: startsAt,
  attendance_status: 'attended',
  ...extra,
});

const QUEUE = [
  item('a', '2026-09-22T09:00:00'),
  item('b', '2026-09-23T16:00:00'),
  item('c', '2026-09-23T10:00:00'),
  item('d', '2026-09-18T11:00:00'),
];

test('fila: mais recente primeiro, agrupada por dia', () => {
  const groups = groupQueueByDay(QUEUE);
  assert.deepEqual(groups.map(([, list]) => list.map(entry => entry.appointment_id)), [['b', 'c'], ['a'], ['d']]);
});

test('salvar e ir para o próximo: segue a ordem da fila e pula o que já foi feito', () => {
  assert.equal(nextQueueItem(QUEUE, 'b', new Set(['b'])).appointment_id, 'c');
  assert.equal(nextQueueItem(QUEUE, 'c', new Set(['b', 'c'])).appointment_id, 'a');
  // Salvou o último da lista: volta ao primeiro que sobrou.
  assert.equal(nextQueueItem(QUEUE, 'd', new Set(['d', 'a'])).appointment_id, 'b');
  // Tudo feito: acabou a fila.
  assert.equal(nextQueueItem(QUEUE, 'd', new Set(['a', 'b', 'c', 'd'])), null);
});

test('salvar e ir para o próximo: nunca abre atendimento de outra pessoa', () => {
  const queue = [item('mine', '2026-09-23T10:00:00'), item('team', '2026-09-23T09:00:00', { professional_id: 'other' })];
  const profile = { id: 'me', disciplines: ['acupuntura'] };
  const next = nextQueueItem(queue, 'mine', new Set(['mine']), entry => canWriteEvolution(entry, profile, null));
  assert.equal(next, null);
});

test('só escreve a própria evolução, na disciplina liberada, com paciente visível', () => {
  const profile = { id: 'me', disciplines: ['acupuntura'] };
  assert.equal(canWriteEvolution(item('x', '2026-09-23T10:00:00'), profile, new Set(['p-x'])), true);
  assert.equal(canWriteEvolution(item('x', '2026-09-23T10:00:00', { professional_id: 'other' }), profile, null), false);
  assert.equal(canWriteEvolution(item('x', '2026-09-23T10:00:00', { discipline: 'psicologia' }), profile, null), false);
  assert.equal(canWriteEvolution(item('x', '2026-09-23T10:00:00'), profile, new Set(['outro'])), false);
});

test('falta exige observação: vazio ou só espaço não passa', () => {
  assert.equal(validateFaltaObservation(''), FALTA_OBSERVATION_REQUIRED);
  assert.equal(validateFaltaObservation('   '), FALTA_OBSERVATION_REQUIRED);
  assert.equal(validateFaltaObservation(undefined), FALTA_OBSERVATION_REQUIRED);
  assert.equal(validateFaltaObservation('Avisou por WhatsApp às 8h.'), null);
});

test('os três formulários de evolução bloqueiam falta sem observação', () => {
  for (const source of [sources.evolucao, sources.psychologyEvolucao, sources.disciplineEvolucao]) {
    assert.match(source, /validateFaltaObservation\(faltaObs\)/);
    assert.match(source, /Observação sobre a falta \(obrigatória\)/);
    assert.ok(!source.includes('Observação (opcional)'), 'a observação da falta não pode voltar a ser opcional');
  }
});

test('agendamento vira o vínculo que os formulários já esperam', () => {
  assert.deepEqual(toActiveAppointment(item('z', '2026-09-23T10:00:00', { attendance_status: 'no_show' })), {
    id: 'z',
    startsAt: '2026-09-23T10:00:00',
    discipline: 'acupuntura',
    attendanceStatus: 'no_show',
    patientId: 'p-z',
  });
});

test('filtros da fila: situação, área, atendido ou ausência e período', () => {
  const agora = new Date('2026-09-23T20:00:00');
  const fila = [
    item('hoje', '2026-09-23T10:00:00'),
    item('ontem-falta', '2026-09-22T09:00:00', { attendance_status: 'no_show', discipline: 'psicologia' }),
    item('antigo', '2026-09-10T09:00:00', { attendance_status: 'excused' }),
  ];
  const ids = options => filterQueue(fila, { now: agora, ...options }).map(entry => entry.appointment_id);

  assert.deepEqual(ids({}), ['hoje', 'ontem-falta', 'antigo']);
  assert.deepEqual(ids({ periodo: 'hoje' }), ['hoje']);
  assert.deepEqual(ids({ periodo: 'semana' }), ['hoje', 'ontem-falta']);
  assert.deepEqual(ids({ area: 'psicologia' }), ['ontem-falta']);
  assert.deepEqual(ids({ atendimento: 'atendido' }), ['hoje']);
  assert.deepEqual(ids({ atendimento: 'ausencia' }), ['ontem-falta', 'antigo']);

  // Evoluído não some: fica na lista (verde) e o filtro separa.
  const done = new Set(['hoje']);
  assert.deepEqual(ids({ done }), ['hoje', 'ontem-falta', 'antigo']);
  assert.deepEqual(ids({ done, situacao: 'pendentes' }), ['ontem-falta', 'antigo']);
  assert.deepEqual(ids({ done, situacao: 'evoluidos' }), ['hoje']);
});

test('cancelado pelo paciente aparece com o mesmo nome da Agenda', () => {
  assert.equal(ATTENDANCE_LABELS.excused, 'Cancelado pelo paciente');
  assert.equal(ATTENDANCE_LABELS.no_show, 'Não compareceu');
});

test('sem evolução avulsa: a tela não busca "Todos os pacientes"', () => {
  assert.ok(!sources.screen.includes('Todos os pacientes'));
  assert.ok(!sources.screen.includes('openAvulso'));
  assert.match(sources.screen, /<SearchSelect/, 'busca da fila é o combobox de digitar-e-escolher');
});

test('banco: evolução só com agendamento do próprio profissional, na área do agendamento', () => {
  const sql = sources.migration;
  assert.match(sql, /IF p_appointment_id IS NULL THEN\s+RAISE EXCEPTION\s+'Evolução só pode ser registrada a partir de um atendimento marcado na Agenda\.'/);
  assert.match(sql, /v_appointment\.professional_id IS DISTINCT FROM v_uid/);
  assert.match(sql, /v_appointment\.discipline IS DISTINCT FROM p_discipline/);
  assert.match(sql, /v_appointment\.status NOT IN \('attended', 'no_show', 'excused'\)/);
  // A trava antiga por quem CADASTROU o paciente travava todo paciente
  // cadastrado pela recepção ou por colega.
  assert.doesNotMatch(sql, /p\.therapist_id = v_uid/);
  // Mantém o que já era garantido.
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /pgp_sym_encrypt\(p_data, public\.get_clinical_encryption_key\(\)\)/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.insert_patient_evolution\(UUID, TEXT, TEXT, UUID, TIMESTAMPTZ, UUID\) TO authenticated;/);
});

test('nenhuma disciplina volta a ter formulário de evolução próprio', () => {
  assert.ok(!sources.disciplineWorkspace.includes('<DisciplineEvolucao'), 'Fisio/Nutrição não renderizam Evolução');
  assert.ok(!sources.psychologyWorkspace.includes('<PsychologyEvolucao'), 'Psi não renderiza Evolução');
  assert.ok(!sources.app.includes("case 'Evolução'") && !sources.app.includes('<Evolucao'), 'Acupuntura não renderiza Evolução');
  assert.ok(!sources.painelInicial.includes("onNavigate?.('Evolução')"), 'painel da Acup não aponta mais para a aba');
});

test('Agenda só encaminha: não tem mais lista de evolução dentro dela', () => {
  assert.ok(!sources.agenda.includes('PendingEvolutionsView'));
  assert.match(sources.agenda, /onOpenEvolutions\(\)/);
  assert.match(sources.app, /<EvolutionsScreen profile=\{profile\} \/>/);
});

test('tela Evoluções não regrava o prontuário da disciplina (só lê)', () => {
  // Evolução nova vai para patient_evolutions dentro dos formulários;
  // regravar o clinical_record inteiro daqui, fora do workspace dono dele,
  // furaria o CAS do autosave (AGENTS.md §9).
  assert.ok(!sources.recordPanel.includes('upsertVersionedClinicalRecord'));
  assert.match(sources.recordPanel, /editable: false/);
  assert.match(sources.recordPanel, /<PanelLoading \/>/);
});

test('Neuropsicologia entra na fila e evolui com o formulário da Psicologia', () => {
  // 2026-09-29: a paciente de neuro atendida no dia não aparecia em
  // "Falta evoluir" (a área ficava fora da fila e o banco recusava) e a
  // sessão acabava registrada dentro da Avaliação. Agora ela evolui aqui,
  // com o formulário da Psicologia, gravada como neuropsicologia.
  const fila = [
    item('acup', '2026-09-23T10:00:00'),
    item('neuro', '2026-09-23T11:00:00', { discipline: 'neuropsicologia' }),
    item('outra', '2026-09-23T12:00:00', { discipline: 'area-sem-formulario' }),
  ];
  assert.deepEqual(onlyEvolutionDisciplines(fila).map(entry => entry.appointment_id), ['acup', 'neuro']);
  assert.ok(PSYCHOLOGY_FORM_DISCIPLINES.includes('neuropsicologia'));

  // Mesma lista que a versão viva de insert_patient_evolution aceita.
  assert.equal(sources.migrationName, '20260929b_neuropsicologia_evolution.sql');
  const fromSql = sources.migration.match(/ARRAY\[([^\]]+)\]::TEXT\[\]/)[1]
    .split(',').map(part => part.trim().replace(/'/g, '')).sort();
  assert.deepEqual([...EVOLUTION_DISCIPLINES].sort(), fromSql);
  assert.match(sources.screen, /onlyEvolutionDisciplines\(/);
  assert.match(sources.app, /onlyEvolutionDisciplines\(list\)\.length/, 'o número do card inicial conta só o que dá para evoluir');
  assert.match(sources.recordPanel, /Esta área não tem formulário de evolução/);

  // Formulário da Psicologia, mas gravando a área do agendamento.
  assert.match(sources.recordPanel, /<PsychologyEvolucao \{\.\.\.common\} session=\{clinical\.session\} discipline=\{discipline\}/);
  assert.match(sources.psychologyEvolucao, /discipline = 'psicologia' \}\)/);
  assert.match(sources.psychologyEvolucao, /patientId,\s+discipline,\s+data: conteudo/);
  assert.doesNotMatch(sources.psychologyEvolucao, /discipline: 'psicologia'/, 'área fixa gravaria neuro como psicologia e o banco recusaria');
  // Sem anamnese própria: não lê a anamnese de Psicologia (sem aviso de risco por enquanto).
  assert.match(sources.recordPanel, /if \(discipline === 'neuropsicologia'\) \{\s+return \{ session: createEmptyPsychologySession\(\) \};/);
  // A linha do tempo do paciente mostra os campos da Psicologia.
  assert.match(sources.timeline, /PSYCHOLOGY_FORM_DISCIPLINES\.includes\(discipline\)/);
});

test('fila só cobra atendimentos a partir de 22/09/2026 (histórico importado fica fora)', async () => {
  // 2026-09-29: o histórico da agenda anterior, importado em 14/09 já
  // como Atendido, virou 132 pendências de atendimentos que têm evolução
  // no sistema anterior. Qualquer migração que recriar a view precisa
  // manter o corte, senão elas voltam para a fila, o atalho e a ficha.
  const files = (await readdir(MIGRATIONS_DIR)).filter(name => name.endsWith('.sql')).sort();
  const defining = [];
  for (const name of files) {
    const sql = await readFile(path.join(MIGRATIONS_DIR, name), 'utf8');
    if (/CREATE OR REPLACE VIEW public\.appointments_awaiting_evolution\b/.test(sql)) defining.push([name, sql]);
  }
  // Vale a versão viva: a última migration que recria a view.
  const [, latestSql] = defining.at(-1);
  assert.match(latestSql, /AND a\.starts_at >= TIMESTAMPTZ '2026-09-22 00:00:00-03'/);
  // O resto da regra continua igual.
  assert.match(latestSql, /WITH \(security_invoker = true\)/);
  assert.match(latestSql, /a\.status IN \('attended', 'no_show', 'excused'\)/);
  assert.match(latestSql, /NOT EXISTS \(\s+SELECT 1 FROM public\.patient_evolutions pe\s+WHERE pe\.appointment_id = a\.id\s+\)/);
  assert.match(latestSql, /REVOKE ALL ON public\.appointments_awaiting_evolution FROM anon;/);
  // Corte é só de leitura da fila: não mexe em agendamento nem cria evolução.
  assert.doesNotMatch(latestSql, /\b(UPDATE|DELETE FROM|INSERT INTO)\b/);
});

test('aviso de atendimento de colega não repete o ponto do nome curto', () => {
  // 2026-10-05: "Este atendimento é de Laize de S.. Só o profissional...".
  // O nome curto já termina em ponto (shortName: "Laize de S.").
  assert.equal(endSentence('Laize de S.'), 'Laize de S.');
  assert.equal(endSentence('Marina'), 'Marina.');
  assert.equal(endSentence('Ana Paula '), 'Ana Paula.');
  assert.equal(endSentence('você'), 'você.');

  // A tela fecha a frase pelo helper nas duas mensagens com o nome.
  assert.match(sources.screen, /Este atendimento é de \{endSentence\(professionalName\(current\.professional_id\)\)\} Só o profissional/);
  assert.match(sources.screen, /`Ele está na fila de \$\{endSentence\(professionalName\(item\.professional_id\)\)\}`/);
  assert.doesNotMatch(sources.screen, /professionalName\([^)]*\)\}?\./, 'nome curto seguido de ponto escrito à mão');
});

test('fila à esquerda (40%), formulário à direita (60%), hora em coluna', () => {
  // Opção B, escolhida em 05/10/2026: presa em 300px à direita, a fila
  // ficava com ~25% da tela e letra miúda ao lado do formulário.
  const css = sources.css.replace(/\/\*[\s\S]*?\*\//g, '');
  const layout = css.match(/(?:^|\r?\n)\.evs-layout\s*\{([^}]*)\}/);
  assert.ok(layout, '.evs-layout não encontrado');
  assert.match(layout[1], /grid-template-columns:\s*minmax\(0, 2fr\) minmax\(0, 3fr\);/);

  // A fila vem antes do formulário no HTML: à esquerda no computador, em
  // cima no celular, e na mesma ordem para quem navega pelo teclado.
  const queueAt = sources.screen.indexOf('<aside className="evs-queue"');
  const mainAt = sources.screen.indexOf('<section className="evs-main">');
  assert.ok(queueAt > 0 && mainAt > queueAt, 'fila precisa vir antes do formulário');

  // Hora em coluna própria; a linha de baixo não repete a hora.
  assert.match(sources.screen, /<span className="evs-queue-time">\{hora\(item\.starts_at\)\}<\/span>/);
  assert.doesNotMatch(sources.screen, /<small>\s*\{hora\(item\.starts_at\)\}/);

  // Lista com a altura que sobra (flex), não com conta fixa de px.
  const list = css.match(/(?:^|\r?\n)\.evs-queue-list\s*\{([^}]*)\}/);
  assert.ok(list, '.evs-queue-list não encontrado');
  assert.match(list[1], /flex:\s*1 1 auto;/);
  assert.doesNotMatch(list[1], /max-height/);

  // Letra da fila não volta ao miúdo de antes (11px).
  const small = [];
  let checked = 0;
  for (const [, selector, body] of css.matchAll(/(?:^|\r?\n)([^{}\r\n@][^{}]*?)\s*\{([^}]*)\}/g)) {
    if (!selector.split(',').every(part => /^\.evs-(queue|chip|filter-label|register|legend|select)\b/.test(part.trim()))) continue;
    checked += 1;
    const size = body.match(/font-size:\s*([\d.]+)px/);
    if (size && Number(size[1]) < 12.5) small.push(`${selector.trim()}: ${size[1]}px`);
  }
  assert.ok(checked >= 8, `só ${checked} regras da fila conferidas: o seletor mudou?`);
  assert.deepEqual(small, [], 'texto da fila com menos de 12.5px');
});
