import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import {
  FALTA_OBSERVATION_REQUIRED,
  canWriteEvolution,
  evolutionDisciplinesFor,
  groupQueueByDay,
  nextQueueItem,
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
const read = relative => readFile(path.resolve(root, relative), 'utf8');

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
    evolucao: 'src/components/panels/Evolucao.jsx',
    psychologyEvolucao: 'src/components/psychology/PsychologyEvolucao.jsx',
    disciplineEvolucao: 'src/components/anamnese/DisciplineEvolucao.jsx',
  }).map(async ([key, file]) => [key, await read(file)]));
  sources = Object.fromEntries(entries);
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

test('evolução avulsa só nas áreas liberadas que têm formulário (Neuropsicologia não tem)', () => {
  const supported = ['acupuntura', 'psicologia', 'fisioterapia', 'nutricao'];
  assert.deepEqual(evolutionDisciplinesFor(['neuropsicologia', 'psicologia'], supported), ['psicologia']);
  assert.deepEqual(evolutionDisciplinesFor(undefined, supported), []);
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
