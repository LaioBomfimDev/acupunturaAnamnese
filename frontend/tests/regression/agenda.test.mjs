import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const migrationPath = path.resolve(root, '../supabase/migrations/20260809_appointments.sql');
const operacaoMigrationPath = path.resolve(root, '../supabase/migrations/20260810_agenda_operacao.sql');

// utils/agenda.js não importa nada, então carrega direto — sem custo de
// subir servidor para testar cálculo puro.
const agenda = await import(
  new URL('../../src/utils/agenda.js', import.meta.url).href
);

let server;
let service;

before(async () => {
  server = await createServer({
    root,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  });
  service = await server.ssrLoadModule('/src/services/appointmentService.js');
});

after(async () => {
  await server?.close();
});

// ---------- simetria com o banco ----------

test('status do JS e o CHECK da migration não se separam', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  const check = sql.match(/status IN \(([^)]+)\)/);
  assert.ok(check, 'a migration precisa declarar o CHECK de status');

  const fromSql = check[1].split(',').map(part => part.trim().replace(/'/g, '')).sort();
  const fromJs = [...agenda.APPOINTMENT_STATUS_IDS].sort();

  assert.deepEqual(fromJs, fromSql,
    'APPOINTMENT_STATUSES e o CHECK da tabela precisam listar os mesmos estados');
});

test('estados que liberam o horário espelham o WHERE da constraint', async () => {
  // A constraint foi redefinida em 20260810 (bloqueio saiu de dentro
  // dela). O espelho tem que olhar para a definição EM VIGOR, senão o
  // teste passa validando um SQL que o banco não usa mais.
  const sql = await readFile(operacaoMigrationPath, 'utf8');
  const where = sql.match(/status NOT IN \(([^)]+)\)/);
  assert.ok(where, 'a constraint de sobreposição precisa ter o WHERE');

  const fromSql = where[1].split(',').map(part => part.trim().replace(/'/g, '')).sort();
  assert.deepEqual([...agenda.FREEING_STATUSES].sort(), fromSql);
});

test('a migration guarda contra dupla marcação no banco, não só na tela', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  assert.match(sql, /EXCLUDE USING gist/);
  assert.match(sql, /CREATE EXTENSION IF NOT EXISTS btree_gist/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
});

// ---------- data pura, sem escorregar de fuso ----------

test('parseDateOnly não desloca a data para o dia anterior', () => {
  const parsed = agenda.parseDateOnly('1990-05-10');
  assert.deepEqual(parsed, { year: 1990, month: 5, day: 10 });

  // O bug clássico: new Date('1990-05-10') vira 09/05 a oeste de
  // Greenwich. O parser não pode reproduzir isso.
  assert.equal(parsed.day, 10);
});

test('parseDateOnly recusa entrada inválida em vez de inventar data', () => {
  assert.equal(agenda.parseDateOnly(''), null);
  assert.equal(agenda.parseDateOnly('10/05/1990'), null);
  assert.equal(agenda.parseDateOnly('1990-13-10'), null);
  assert.equal(agenda.parseDateOnly(null), null);
  assert.equal(agenda.parseDateOnly(new Date()), null);
});

// ---------- grade do calendário ----------

test('a grade do mês tem sempre 6 semanas, para a tela não pular de altura', () => {
  for (const [year, month] of [[2026, 2], [2026, 8], [2027, 1]]) {
    const grid = agenda.buildMonthGrid(year, month);
    assert.equal(grid.length, 6);
    grid.forEach(week => assert.equal(week.length, 7));
  }
});

test('a grade começa no domingo e marca os dias de fora do mês', () => {
  const grid = agenda.buildMonthGrid(2026, 8);
  assert.equal(grid[0][0].date.getDay(), 0, 'primeira célula é domingo');

  const first = grid.flat().find(cell => cell.inMonth);
  assert.equal(first.day, 1);

  const outside = grid.flat().filter(cell => !cell.inMonth);
  assert.ok(outside.length > 0, 'agosto/2026 não começa no domingo');
  outside.forEach(cell => assert.notEqual(cell.date.getMonth(), 7));
});

test('hoje é marcado apenas na célula certa', () => {
  const today = new Date(2026, 7, 9);
  const grid = agenda.buildMonthGrid(2026, 8, { today });
  const marked = grid.flat().filter(cell => cell.isToday);

  assert.equal(marked.length, 1);
  assert.equal(marked[0].day, 9);
});

// ---------- aniversários ----------

test('aniversariantes caem no dia certo e calculam a idade do ano', () => {
  const patients = [
    { id: 'p1', name: 'Ana', birth_date: '1990-08-09' },
    { id: 'p2', name: 'Bruno', birth_date: '1985-08-20' },
    { id: 'p3', name: 'Caio', birth_date: '1992-07-09' },
    { id: 'p4', name: 'Sem data', birth_date: null },
  ];

  const map = agenda.birthdaysByDay(patients, 2026, 8);

  assert.deepEqual(map.get('2026-08-09'), [{ id: 'p1', name: 'Ana', age: 36 }]);
  assert.equal(map.get('2026-08-20')[0].name, 'Bruno');
  assert.equal(map.has('2026-07-09'), false, 'julho não entra na grade de agosto');
  assert.equal(map.size, 2);
});

test('nascido em 29/02 aparece em 28/02 nos anos comuns', () => {
  const patients = [{ id: 'p1', name: 'Bissexto', birth_date: '2000-02-29' }];

  assert.ok(agenda.birthdaysByDay(patients, 2027, 2).has('2027-02-28'),
    '2027 não é bissexto: cai em 28/02');
  assert.ok(agenda.birthdaysByDay(patients, 2028, 2).has('2028-02-29'),
    '2028 é bissexto: mantém 29/02');
});

// ---------- aniversários (lista "próximos") ----------

test('upcomingBirthdays ordena pela próxima ocorrência, atravessando o fim do ano', () => {
  const today = new Date(2026, 7, 9); // 09/08/2026
  const patients = [
    { id: 'p1', name: 'Ana', phone: '71999990001', birth_date: '1990-08-20' }, // daqui 11 dias
    { id: 'p2', name: 'Bruno', birth_date: '1985-01-05' }, // ano que vem, mais longe
    { id: 'p3', name: 'Caio', birth_date: '1992-08-09' }, // hoje
    { id: 'p4', name: 'Sem data', birth_date: null },
  ];

  const list = agenda.upcomingBirthdays(patients, today);

  assert.equal(list.length, 3, 'ignora quem não tem data de nascimento');
  assert.deepEqual(list.map(item => item.id), ['p3', 'p1', 'p2'],
    'hoje primeiro, depois em ordem crescente de dias restantes');
  assert.equal(list[0].daysUntil, 0);
  assert.equal(list[0].age, 34, 'idade é a que a pessoa completa na próxima ocorrência');
  assert.equal(list[1].daysUntil, 11);
  assert.equal(list[1].phone, '71999990001');
  assert.equal(list[2].nextDate, '2027-01-05', 'já passou este ano: aniversário cai no ano seguinte');
});

test('upcomingBirthdays empata por nome quando o dia é o mesmo', () => {
  const today = new Date(2026, 7, 9);
  const patients = [
    { id: 'p1', name: 'Zeca', birth_date: '1990-08-20' },
    { id: 'p2', name: 'Ana', birth_date: '1991-08-20' },
  ];

  const list = agenda.upcomingBirthdays(patients, today);

  assert.deepEqual(list.map(item => item.name), ['Ana', 'Zeca']);
});

test('upcomingBirthdays também respeita 29/02 em ano comum', () => {
  const today = new Date(2027, 0, 1); // 2027 não é bissexto
  const patients = [{ id: 'p1', name: 'Bissexto', birth_date: '2000-02-29' }];

  const [item] = agenda.upcomingBirthdays(patients, today);
  assert.equal(item.nextDate, '2027-02-28');
});

// ---------- sobreposição ----------

test('encostar não é sobrepor', () => {
  const existing = [{
    id: 'a1',
    professional_id: 'prof-1',
    status: 'scheduled',
    starts_at: '2026-08-09T09:00:00.000Z',
    ends_at: '2026-08-09T10:00:00.000Z',
  }];

  const encostado = agenda.findOverlap(existing, {
    professional_id: 'prof-1',
    starts_at: '2026-08-09T10:00:00.000Z',
    ends_at: '2026-08-09T11:00:00.000Z',
  });
  assert.equal(encostado, null);

  const sobreposto = agenda.findOverlap(existing, {
    professional_id: 'prof-1',
    starts_at: '2026-08-09T09:30:00.000Z',
    ends_at: '2026-08-09T10:30:00.000Z',
  });
  assert.equal(sobreposto?.id, 'a1');
});

test('cancelado e falta liberam o horário; outro profissional não conflita', () => {
  const base = {
    id: 'a1',
    professional_id: 'prof-1',
    starts_at: '2026-08-09T09:00:00.000Z',
    ends_at: '2026-08-09T10:00:00.000Z',
  };
  const candidate = {
    professional_id: 'prof-1',
    starts_at: '2026-08-09T09:30:00.000Z',
    ends_at: '2026-08-09T10:30:00.000Z',
  };

  for (const status of agenda.FREEING_STATUSES) {
    assert.equal(agenda.findOverlap([{ ...base, status }], candidate), null,
      `status ${status} deveria liberar o horário`);
  }

  assert.equal(
    agenda.findOverlap([{ ...base, status: 'scheduled' }], { ...candidate, professional_id: 'prof-2' }),
    null,
    'agenda de outro profissional não conflita',
  );
});

test('remarcar o próprio agendamento não conflita consigo mesmo', () => {
  const existing = [{
    id: 'a1',
    professional_id: 'prof-1',
    status: 'scheduled',
    starts_at: '2026-08-09T09:00:00.000Z',
    ends_at: '2026-08-09T10:00:00.000Z',
  }];

  const conflict = agenda.findOverlap(existing, {
    id: 'a1',
    professional_id: 'prof-1',
    starts_at: '2026-08-09T09:15:00.000Z',
    ends_at: '2026-08-09T10:15:00.000Z',
  });

  assert.equal(conflict, null);
});

test('períodos do dia alimentam o gráfico manhã/tarde/noite', () => {
  assert.equal(agenda.periodOfDay(new Date(2026, 7, 9, 8)), 'manha');
  assert.equal(agenda.periodOfDay(new Date(2026, 7, 9, 14)), 'tarde');
  assert.equal(agenda.periodOfDay(new Date(2026, 7, 9, 20)), 'noite');
  assert.equal(agenda.periodOfDay(new Date(2026, 7, 9, 11, 59)), 'manha');
});

test('relativeDayLabel usa hoje/amanhã/depois de amanhã perto da data, extenso quando está longe', () => {
  const today = new Date(2026, 8, 17); // 17 de setembro de 2026

  assert.equal(agenda.relativeDayLabel(new Date(2026, 8, 17, 15, 30), today), 'hoje (17 de setembro)');
  assert.equal(agenda.relativeDayLabel(new Date(2026, 8, 18, 9, 0), today), 'amanhã (18 de setembro)');
  assert.equal(agenda.relativeDayLabel(new Date(2026, 8, 19, 9, 0), today), 'depois de amanhã (19 de setembro)');
  assert.equal(
    agenda.relativeDayLabel(new Date(2026, 8, 22, 9, 0), today),
    'terça-feira, 22 de setembro',
  );
});

test('relativeDayLabel não inventa data para entrada inválida', () => {
  const today = new Date(2026, 8, 17);
  assert.equal(agenda.relativeDayLabel('não é data', today), '');
  assert.equal(agenda.relativeDayLabel(new Date(2026, 8, 18), new Date('inválida')), '');
});

// ---------- service: validação antes de tocar no banco ----------

test('createAppointment recusa entrada inválida sem chamar o banco', async () => {
  const runtime = {
    getAuthenticatedUser: async () => { throw new Error('não deveria autenticar'); },
    from: () => { throw new Error('não deveria consultar o banco'); },
  };

  await assert.rejects(
    () => service.createAppointment({}, { runtime }),
    /Selecione o paciente/,
  );

  await assert.rejects(
    () => service.createAppointment(
      { patientId: 'p1', professionalId: 'prof-1', discipline: 'astrologia', startsAt: '2026-08-09T09:00:00Z', endsAt: '2026-08-09T10:00:00Z' },
      { runtime },
    ),
    /Disciplina inválida/,
  );

  await assert.rejects(
    () => service.createAppointment(
      { patientId: 'p1', professionalId: 'prof-1', discipline: 'acupuntura', startsAt: '2026-08-09T10:00:00Z', endsAt: '2026-08-09T09:00:00Z' },
      { runtime },
    ),
    /término precisa ser depois do início/,
  );
});

test('conflito conhecido barra antes do round-trip', async () => {
  const runtime = {
    getAuthenticatedUser: async () => { throw new Error('não deveria autenticar'); },
    from: () => { throw new Error('não deveria consultar o banco'); },
  };

  await assert.rejects(
    () => service.createAppointment(
      {
        patientId: 'p1',
        professionalId: 'prof-1',
        discipline: 'acupuntura',
        startsAt: '2026-08-09T09:30:00Z',
        endsAt: '2026-08-09T10:30:00Z',
      },
      {
        runtime,
        knownAppointments: [{
          id: 'a1',
          professional_id: 'prof-1',
          status: 'scheduled',
          starts_at: '2026-08-09T09:00:00.000Z',
          ends_at: '2026-08-09T10:00:00.000Z',
        }],
      },
    ),
    /já tem atendimento nesse horário/,
  );
});

test('erro de schema ausente aponta a migration pelo nome', () => {
  assert.equal(
    service.isMissingAgendaSchemaError({
      message: "relation \"public.appointments\" does not exist",
    }),
    true,
  );
  assert.match(service.AGENDA_MIGRATION_HINT, /20260809_appointments\.sql/);
  assert.equal(service.isMissingAgendaSchemaError({ message: 'timeout' }), false);
});

test('violação da constraint de exclusão vira mensagem de recepção', () => {
  assert.equal(service.isOverlapError({ code: '23P01' }), true);
  assert.equal(
    service.isOverlapError({ message: 'conflicting key value violates exclusion constraint "appointments_no_overlap"' }),
    true,
  );
  assert.equal(service.isOverlapError({ message: 'outro erro' }), false);
});

test('violação de RLS é reconhecida por código e por texto', () => {
  assert.equal(service.isRlsPolicyError({ code: '42501' }), true);
  assert.equal(
    service.isRlsPolicyError({ message: 'new row violates row-level security policy for table "appointments"' }),
    true,
  );
  assert.equal(service.isRlsPolicyError({ message: 'outro erro' }), false);
});

test('createAppointment traduz erro de RLS listando as causas, sem esconder o erro original', async () => {
  const runtime = {
    getAuthenticatedUser: async () => ({ id: 'karen' }),
    from: () => ({
      insert: () => ({
        select: () => ({
          single: async () => ({
            data: null,
            error: { code: '42501', message: 'new row violates row-level security policy for table "appointments"' },
          }),
        }),
      }),
    }),
  };

  await assert.rejects(
    () => service.createAppointment(
      {
        patientId: 'p1',
        professionalId: 'prof-1',
        discipline: 'acupuntura',
        startsAt: '2026-08-09T09:00:00Z',
        endsAt: '2026-08-09T10:00:00Z',
      },
      { runtime },
    ),
    (err) => {
      assert.match(err.message, /paciente e profissional precisam pertencer a esta clínica/);
      assert.match(err.message, /erro original: new row violates row-level security policy/);
      return true;
    },
  );
});

test('updateAppointmentStatus recusa status fora da lista', async () => {
  const runtime = {
    getAuthenticatedUser: async () => { throw new Error('não deveria autenticar'); },
    from: () => { throw new Error('não deveria consultar o banco'); },
  };

  await assert.rejects(
    () => service.updateAppointmentStatus('a1', 'inventado', { runtime }),
    /Status de agendamento inválido/,
  );
});
