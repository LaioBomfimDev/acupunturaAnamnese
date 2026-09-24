import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import {
  COMPLETED_APPOINTMENT_LABEL,
  COMPLETED_FUTURE_ERROR,
  COMPLETED_TOO_OLD_ERROR,
  canChooseProfessional,
  combineDayAndTime,
  completedDayRange,
  disciplinesForProfessional,
  isLateEntry,
  lateEntryLabel,
  toEvolutionQueueItem,
  validateCompletedStart,
} from '../../src/utils/completedAppointment.js';

// "Registrar atendimento realizado" (2026-09-24): o paciente chegou, foi
// atendido e foi embora sem nunca ter sido marcado. Como evolução só nasce
// de agendamento (20260924b), ele ficava fora da fila de Evoluções. Agora
// o atendimento entra já como Atendido e confirmado, até 30 dias para
// trás, pela tela Evoluções e pela Agenda (a recepção não entra em
// Evoluções).

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const VIEW_MIGRATION = path.resolve(root, '../supabase/migrations/20260903_patient_evolutions.sql');
const read = relative => readFile(path.resolve(root, relative), 'utf8');

let server;
let service;
let sources;

before(async () => {
  server = await createServer({ root, logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' });
  service = await server.ssrLoadModule('/src/services/appointmentService.js');
  sources = {
    screen: await read('src/components/evolutions/EvolutionsScreen.jsx'),
    agenda: await read('src/components/panels/Agenda.jsx'),
    dialog: await read('src/components/panels/agenda/RegisterCompletedDialog.jsx'),
    viewSql: await readFile(VIEW_MIGRATION, 'utf8'),
  };
});

after(async () => {
  await server?.close();
});

// Quinta, 24/09/2026, 15h no fuso local de quem roda o teste.
const NOW = new Date(2026, 8, 24, 15, 0);

function insertRuntime(sink) {
  return {
    getAuthenticatedUser: async () => ({ id: 'prof-1' }),
    from: () => ({
      insert: payload => {
        sink.payload = payload;
        return { select: () => ({ single: async () => ({ data: { id: 'a1', ...payload }, error: null }) }) };
      },
    }),
  };
}

const offline = {
  getAuthenticatedUser: async () => { throw new Error('não deveria autenticar'); },
  from: () => { throw new Error('não deveria consultar o banco'); },
};

const input = (startsAt, extra = {}) => ({
  patientId: 'p1',
  professionalId: 'prof-1',
  discipline: 'acupuntura',
  startsAt: startsAt.toISOString(),
  endsAt: new Date(startsAt.getTime() + 60 * 60000).toISOString(),
  ...extra,
});

// ---------- regras puras ----------

test('janela: só o passado, até 30 dias contados por dia', () => {
  assert.equal(validateCompletedStart(new Date(2026, 8, 23, 10, 0), NOW), null, 'ontem');
  assert.equal(validateCompletedStart(new Date(2026, 8, 24, 14, 0), NOW), null, 'hoje, mais cedo');
  assert.equal(validateCompletedStart(new Date(2026, 7, 25, 0, 0), NOW), null, 'primeiro minuto do 30º dia');
  assert.equal(validateCompletedStart(new Date(2026, 7, 24, 23, 59), NOW), COMPLETED_TOO_OLD_ERROR, '31 dias');
  assert.equal(validateCompletedStart(new Date(2026, 8, 24, 16, 0), NOW), COMPLETED_FUTURE_ERROR, 'mais tarde hoje');
  assert.equal(validateCompletedStart(new Date(2026, 8, 25, 9, 0), NOW), COMPLETED_FUTURE_ERROR, 'amanhã');
  assert.match(validateCompletedStart(null, NOW), /Informe o dia e o horário/);
  assert.match(validateCompletedStart(new Date('inválida'), NOW), /Informe o dia e o horário/);
});

test('limites do campo de data acompanham a janela', () => {
  assert.deepEqual(completedDayRange(NOW), { min: '2026-08-25', max: '2026-09-24' });
});

test('dia e hora do formulário viram instante local sem passar pelo parser de ISO', () => {
  assert.equal(combineDayAndTime('2026-09-23', '14:30').getTime(), new Date(2026, 8, 23, 14, 30).getTime());
  assert.equal(combineDayAndTime('', '14:30'), null);
  assert.equal(combineDayAndTime('2026-09-23', ''), null);
});

test('recepção e admin lançam para a equipe; o profissional, só para si', () => {
  assert.equal(canChooseProfessional({ role: 'receptionist' }), true);
  assert.equal(canChooseProfessional({ role: 'clinic_admin' }), true);
  assert.equal(canChooseProfessional({ role: 'super_admin' }), true);
  assert.equal(canChooseProfessional({ role: 'therapist' }), false);
  assert.equal(canChooseProfessional(null), false);
});

test('áreas oferecidas são cortadas pelas que o profissional atende', () => {
  const offered = [{ id: 'acupuntura' }, { id: 'psicologia' }, { id: 'fisioterapia' }];
  const ids = professional => disciplinesForProfessional(offered, professional).map(item => item.id);
  assert.deepEqual(ids({ disciplines: ['psicologia'] }), ['psicologia']);
  assert.deepEqual(ids({ disciplines: ['acupuntura', 'fisioterapia'] }), ['acupuntura', 'fisioterapia']);
  // Cadastro antigo sem áreas: não corta, senão o formulário ficaria vazio.
  assert.deepEqual(ids({ disciplines: [] }), ['acupuntura', 'psicologia', 'fisioterapia']);
  assert.deepEqual(ids(null), ['acupuntura', 'psicologia', 'fisioterapia']);
});

test('"lançado depois": criado depois do fim do atendimento', () => {
  const late = { kind: 'appointment', ends_at: '2026-09-23T14:00:00Z', created_at: '2026-09-24T12:10:00Z' };
  assert.equal(isLateEntry(late), true);
  assert.match(lateEntryLabel(late), /^Lançado depois do atendimento, em \d{2}\/\d{2} às \d{2}:\d{2}\.$/);

  // Encaixe marcado durante a sessão foi registrado enquanto acontecia.
  const encaixe = { kind: 'appointment', ends_at: '2026-09-24T15:00:00Z', created_at: '2026-09-24T14:10:00Z' };
  assert.equal(isLateEntry(encaixe), false);
  assert.equal(lateEntryLabel(encaixe), '');

  assert.equal(isLateEntry({ ...late, kind: 'block' }), false);
  assert.equal(isLateEntry({ kind: 'appointment', ends_at: '2026-09-23T14:00:00Z' }), false, 'sem created_at não inventa selo');
});

test('item da fila tem as mesmas colunas da view appointments_awaiting_evolution', () => {
  const view = sources.viewSql.match(/CREATE OR REPLACE VIEW public\.appointments_awaiting_evolution[\s\S]*?SELECT([\s\S]*?)FROM public\.appointments/)[1];
  const columns = view.split(',').map(part => {
    const alias = part.match(/AS\s+(\w+)/);
    return alias ? alias[1] : part.trim().split('.').pop();
  }).sort();

  const item = toEvolutionQueueItem({
    id: 'a1', clinic_id: 'c1', patient_id: 'p1', professional_id: 'prof-1',
    discipline: 'acupuntura', starts_at: '2026-09-23T13:00:00Z', status: 'attended',
  }, 'Maria');
  assert.deepEqual(Object.keys(item).sort(), columns);
  assert.equal(item.appointment_id, 'a1');
  assert.equal(item.attendance_status, 'attended');
  assert.equal(item.patient_name, 'Maria');
});

// ---------- service ----------

test('registrar grava Atendido, confirmado no horário do atendimento e sem exceção', async () => {
  const sink = {};
  const start = new Date(2026, 8, 23, 10, 0);
  const created = await service.registerCompletedAppointment(
    input(start, { isException: true, exceptionReason: 'Sábado', status: 'scheduled' }),
    { now: NOW, runtime: insertRuntime(sink) },
  );

  assert.equal(sink.payload.status, 'attended');
  assert.equal(sink.payload.kind, 'appointment');
  assert.equal(sink.payload.confirmed_at, start.toISOString());
  assert.equal(sink.payload.is_exception, false, 'já aconteceu: não pede confirmação de horário atípico');
  assert.equal(sink.payload.exception_reason, null);
  assert.equal(created.id, 'a1');
});

test('registrar recusa futuro, mais de 30 dias e bloqueio sem tocar no banco', async () => {
  await assert.rejects(
    () => service.registerCompletedAppointment(input(new Date(2026, 8, 24, 18, 0)), { now: NOW, runtime: offline }),
    { message: COMPLETED_FUTURE_ERROR },
  );
  await assert.rejects(
    () => service.registerCompletedAppointment(input(new Date(2026, 6, 1, 10, 0)), { now: NOW, runtime: offline }),
    { message: COMPLETED_TOO_OLD_ERROR },
  );
  await assert.rejects(
    () => service.registerCompletedAppointment(input(new Date(2026, 8, 23, 10, 0), { kind: 'block' }), { now: NOW, runtime: offline }),
    /Só atendimento com paciente/,
  );
});

test('registrar respeita o conflito de horário do mesmo profissional', async () => {
  await assert.rejects(
    () => service.registerCompletedAppointment(input(new Date(2026, 8, 23, 10, 30)), {
      now: NOW,
      runtime: offline,
      knownAppointments: [{
        id: 'outro',
        kind: 'appointment',
        professional_id: 'prof-1',
        status: 'attended',
        starts_at: new Date(2026, 8, 23, 10, 0).toISOString(),
        ends_at: new Date(2026, 8, 23, 11, 0).toISOString(),
      }],
    }),
    /já tem atendimento nesse horário/,
  );
});

test('agendamento comum continua nascendo sem confirmação', async () => {
  const sink = {};
  await service.createAppointment(input(new Date(2026, 8, 28, 10, 0)), { runtime: insertRuntime(sink) });
  assert.equal(sink.payload.status, 'scheduled');
  assert.ok(!('confirmed_at' in sink.payload), 'confirmação continua sendo o botão ou o link do WhatsApp');
});

// ---------- telas ----------

test('botão com o nome combinado nas duas telas, abrindo o mesmo formulário', () => {
  assert.equal(COMPLETED_APPOINTMENT_LABEL, 'Registrar atendimento realizado');
  for (const source of [sources.screen, sources.agenda]) {
    assert.match(source, /<RegisterCompletedDialog/);
    assert.match(source, /\{COMPLETED_APPOINTMENT_LABEL\}/);
  }
  assert.match(sources.dialog, /registerCompletedAppointment\(/);
});

test('recepção chega pela Agenda: o botão não depende do acesso a Evoluções', () => {
  const button = sources.agenda.indexOf('onClick={() => setShowRegisterCompleted(true)}');
  assert.ok(button > 0);
  const before = sources.agenda.slice(Math.max(0, button - 300), button);
  assert.doesNotMatch(before, /onOpenEvolutions\s*&&/);
});

test('Evoluções oferece só áreas com formulário e abre o atendimento para evoluir', () => {
  assert.match(sources.screen, /EVOLUTION_DISCIPLINES\.includes\(discipline\.id\)/);
  assert.match(sources.screen, /disciplines=\{REGISTER_DISCIPLINES\}/);
  assert.match(sources.screen, /setCurrentId\(item\.appointment_id\)/);
  // Continua sem evolução avulsa: o registro cria o agendamento antes.
  assert.ok(!sources.screen.includes('Todos os pacientes'));
});

test('Agenda mostra o selo de lançado depois no detalhe do atendimento', () => {
  assert.match(sources.agenda, /lateEntryLabel\(selectedAppointment\)/);
});
