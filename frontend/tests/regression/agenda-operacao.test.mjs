// ============================================================
// Agenda — operação da clínica (Fase 0 do plano de gestão)
//
// A regra que estes testes protegem: a clínica é FLEXÍVEL com horário.
// Feriado, sábado, almoço e fora de jornada são AVISO com confirmação
// dupla, nunca recusa. O único horário recusado é dois pacientes ao
// mesmo tempo com o mesmo profissional.
//
// Se alguém um dia "consertar" a agenda transformando bloqueio em
// parede, é aqui que quebra.
// ============================================================

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const operacaoSql = path.resolve(root, '../supabase/migrations/20260810_agenda_operacao.sql');
const membersSql = path.resolve(root, '../supabase/migrations/20260810_clinic_members.sql');

const exceptions = await import(
  new URL('../../src/utils/agendaExceptions.js', import.meta.url).href
);
const agenda = await import(
  new URL('../../src/utils/agenda.js', import.meta.url).href
);

let server;
let service;
let members;

before(async () => {
  server = await createServer({
    root,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  });
  service = await server.ssrLoadModule('/src/services/appointmentService.js');
  members = await server.ssrLoadModule('/src/services/clinicMembersService.js');
});

after(async () => {
  await server?.close();
});

// ---------- a migração faz o que foi combinado ----------

test('bloqueio fica FORA da constraint de sobreposição — ele avisa, não barra', async () => {
  const sql = await readFile(operacaoSql, 'utf8');
  const constraint = sql.match(/ADD CONSTRAINT appointments_no_overlap[\s\S]*?WHERE \(([^;]+)\);/);

  assert.ok(constraint, 'a migração precisa redefinir appointments_no_overlap');
  assert.match(constraint[1], /kind = 'appointment'/,
    'sem este filtro o bloqueio viraria parede e marcar no almoço seria impossível');
});

test('dois pacientes no mesmo horário continuam recusados pelo banco', async () => {
  const sql = await readFile(operacaoSql, 'utf8');
  assert.match(sql, /EXCLUDE USING gist/);
  assert.match(sql, /professional_id WITH =/);
  assert.match(sql, /tstzrange\(starts_at, ends_at\) WITH &&/);
});

test('exceção declarada exige motivo no próprio banco', async () => {
  const sql = await readFile(operacaoSql, 'utf8');
  assert.match(sql, /appointments_exception_reason/);
  assert.match(sql, /is_exception IS FALSE OR/);
});

test('bloqueio não leva paciente; atendimento leva paciente e disciplina', async () => {
  const sql = await readFile(operacaoSql, 'utf8');
  assert.match(sql, /ALTER COLUMN patient_id DROP NOT NULL/);
  assert.match(sql, /kind = 'appointment' AND patient_id IS NOT NULL AND discipline IS NOT NULL/);
  assert.match(sql, /kind = 'block' AND patient_id IS NULL/);
});

test('a policy de INSERT aceita bloqueio sem paciente', async () => {
  const sql = await readFile(operacaoSql, 'utf8');
  const policy = sql.match(/CREATE POLICY appointments_insert[\s\S]*?\);/);
  assert.ok(policy);
  assert.match(policy[0], /patient_id IS NULL\s*\n\s*OR EXISTS/,
    'sem o ramo IS NULL o EXISTS derruba todo bloqueio');
});

test('jornada e feriados nascem com RLS por instituição', async () => {
  const sql = await readFile(operacaoSql, 'utf8');
  assert.match(sql, /ALTER TABLE public\.professional_schedules ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /ALTER TABLE public\.clinic_holidays ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON public\.professional_schedules FROM anon/);
  assert.match(sql, /REVOKE ALL ON public\.clinic_holidays FROM anon/);
});

test('a leitura de colegas não expõe dado pessoal do profissional', async () => {
  const sql = await readFile(membersSql, 'utf8');

  // A lista de colunas do RETURNS TABLE é o contrato: o que não está
  // ali não sai do banco.
  const returns = sql.match(/RETURNS TABLE \(([\s\S]*?)\)\s*LANGUAGE/);
  assert.ok(returns, 'a função precisa declarar as colunas devolvidas');

  for (const proibido of ['email', 'phone', 'document', 'professional_registration', 'must_change_password']) {
    assert.doesNotMatch(returns[1], new RegExp(`\\b${proibido}\\b`),
      `${proibido} não pode vazar na listagem da equipe`);
  }

  assert.match(sql, /can_manage_agenda\(v_clinic\) OR public\.is_super_admin\(\)/);
});

// Incidente 2026-08-12: a verificação da migração devolveu
// anon_bloqueado = false. Causa: o Postgres concede EXECUTE a PUBLIC ao
// criar a função, e `anon` herda dessa concessão — revogar só de `anon`
// não tira nada. Regra destilada: função nova revoga de PUBLIC E de anon.
test('revogar de anon sem revogar de PUBLIC não bloqueia ninguém', async () => {
  for (const file of [membersSql, operacaoSql]) {
    const sql = await readFile(file, 'utf8');
    const revokes = sql.match(/REVOKE[^;]*ON FUNCTION[^;]*;/g) || [];

    for (const revoke of revokes) {
      assert.match(revoke, /FROM PUBLIC/,
        `REVOKE sem PUBLIC não tem efeito sobre anon: ${revoke.trim()}`);
      assert.match(revoke, /\banon\b/,
        `REVOKE precisa citar anon explicitamente: ${revoke.trim()}`);
    }
  }
});

test('a verificação da migração confere as duas funções da agenda', async () => {
  const sql = await readFile(membersSql, 'utf8');
  assert.match(sql, /anon_bloqueado_na_agenda/,
    'can_manage_agenda nasceu com o padrão antigo; a verificação precisa cobri-la');
});

// ---------- classificação de horário atípico ----------

const JORNADA_SEG_SEX = [1, 2, 3, 4, 5].map(weekday => ({
  professional_id: 'prof-1',
  weekday,
  starts_at: '08:00:00',
  ends_at: '18:00:00',
  break_starts_at: '12:00:00',
  break_ends_at: '13:00:00',
  slot_minutes: 60,
  is_active: true,
}));

function slot(year, month, day, hour, durationMinutes = 60) {
  const start = new Date(year, month - 1, day, hour, 0, 0, 0);
  return { start, end: new Date(start.getTime() + durationMinutes * 60000) };
}

test('horário dentro da jornada não gera aviso nenhum', () => {
  // 2026-08-12 é uma quarta-feira.
  const { start, end } = slot(2026, 8, 12, 9);
  const result = exceptions.evaluateSlot({ start, end, schedules: JORNADA_SEG_SEX });

  assert.equal(result.isException, false);
  assert.equal(result.exceptions.length, 0);
  assert.equal(result.reason, '');
});

test('sábado avisa, e o aviso nomeia o dia da semana', () => {
  // 2026-08-15 é um sábado.
  const { start, end } = slot(2026, 8, 15, 9);
  const result = exceptions.evaluateSlot({ start, end, schedules: JORNADA_SEG_SEX });

  assert.equal(result.isException, true);
  assert.equal(result.exceptions[0].kind, exceptions.EXCEPTION_KINDS.DAY_OFF);
  assert.match(result.exceptions[0].label, /sábado/);
});

test('almoço avisa e diz qual é o intervalo — sem impedir', () => {
  const { start, end } = slot(2026, 8, 12, 12);
  const result = exceptions.evaluateSlot({ start, end, schedules: JORNADA_SEG_SEX });

  const almoco = result.exceptions.find(item => item.kind === exceptions.EXCEPTION_KINDS.BREAK);
  assert.ok(almoco, 'marcar no almoço precisa ser reconhecido como atípico');
  assert.match(almoco.detail, /12:00–13:00/);
});

test('fora do expediente avisa com a janela cadastrada', () => {
  const { start, end } = slot(2026, 8, 12, 20);
  const result = exceptions.evaluateSlot({ start, end, schedules: JORNADA_SEG_SEX });

  const fora = result.exceptions.find(item => item.kind === exceptions.EXCEPTION_KINDS.OUTSIDE_HOURS);
  assert.ok(fora);
  assert.match(fora.detail, /08:00–18:00/);
});

test('feriado avisa pelo nome; feriado em que a clínica atende, não', () => {
  const { start, end } = slot(2026, 9, 7, 9);
  const holidays = [{ day: '2026-09-07', name: 'Independência', is_working_day: false }];

  const comAviso = exceptions.evaluateSlot({ start, end, schedules: [], holidays });
  assert.equal(comAviso.isException, true);
  assert.match(comAviso.reason, /Independência/);

  const semAviso = exceptions.evaluateSlot({
    start,
    end,
    schedules: [],
    holidays: [{ ...holidays[0], is_working_day: true }],
  });
  assert.equal(semAviso.isException, false);
});

test('bloqueio no horário vira aviso, não recusa', () => {
  const { start, end } = slot(2026, 8, 12, 14);
  const blocks = [{
    kind: 'block',
    professional_id: 'prof-1',
    note: 'Reunião de equipe',
    starts_at: new Date(2026, 7, 12, 14, 0).toISOString(),
    ends_at: new Date(2026, 7, 12, 15, 0).toISOString(),
  }];

  const result = exceptions.evaluateSlot({ start, end, schedules: JORNADA_SEG_SEX, blocks });
  const aviso = result.exceptions.find(item => item.kind === exceptions.EXCEPTION_KINDS.BLOCK);

  assert.ok(aviso);
  assert.match(aviso.label, /Reunião de equipe/);
});

test('clínica sem jornada cadastrada não transforma todo horário em aviso', () => {
  const { start, end } = slot(2026, 8, 15, 22);
  const result = exceptions.evaluateSlot({ start, end, schedules: [] });

  assert.equal(result.isException, false,
    'avisar sem configuração seria ruído em toda instituição nova');
});

test('o motivo gravado é texto legível, não código', () => {
  const { start, end } = slot(2026, 8, 15, 12);
  const holidays = [{ day: '2026-08-15', name: 'Festa da cidade', is_working_day: false }];
  const result = exceptions.evaluateSlot({ start, end, schedules: JORNADA_SEG_SEX, holidays });

  assert.equal(result.exceptions.length, 2, 'feriado + fora dos dias de atendimento');
  assert.match(result.reason, /Festa da cidade/);
  assert.match(result.reason, /sábado/);
  assert.doesNotMatch(result.reason, /day_off|holiday/);
});

test('encostar no intervalo não é entrar nele', () => {
  const { start, end } = slot(2026, 8, 12, 13);
  const result = exceptions.evaluateSlot({ start, end, schedules: JORNADA_SEG_SEX });

  assert.equal(result.isException, false, '13:00–14:00 começa quando o almoço acaba');
});

// ---------- slots sugeridos ----------

test('os slots do dia saem da jornada e pulam o intervalo', () => {
  const slots = exceptions.buildDaySlots({
    date: new Date(2026, 7, 12),
    schedules: JORNADA_SEG_SEX,
  });

  assert.equal(slots[0].label, '08:00');
  assert.equal(slots.at(-1).label, '17:00');
  assert.equal(slots.some(item => item.label === '12:00'), false, 'almoço não é sugerido');
  assert.equal(slots.length, 9, '08–12 e 13–18, de hora em hora');
});

test('dia sem jornada não sugere slot', () => {
  const slots = exceptions.buildDaySlots({
    date: new Date(2026, 7, 15),
    schedules: JORNADA_SEG_SEX,
  });
  assert.deepEqual(slots, []);
});

// ---------- service: bloqueio e exceção ----------

const runtimeSemBanco = {
  getAuthenticatedUser: async () => { throw new Error('não deveria autenticar'); },
  from: () => { throw new Error('não deveria consultar o banco'); },
};

test('bloqueio não aceita paciente, e atendimento continua exigindo um', async () => {
  await assert.rejects(
    () => service.createAppointment(
      {
        kind: 'block',
        professionalId: 'prof-1',
        patientId: 'p1',
        startsAt: '2026-08-12T12:00:00Z',
        endsAt: '2026-08-12T13:00:00Z',
      },
      { runtime: runtimeSemBanco },
    ),
    /Bloqueio de horário não recebe paciente/,
  );

  await assert.rejects(
    () => service.createAppointment(
      {
        kind: 'appointment',
        professionalId: 'prof-1',
        startsAt: '2026-08-12T09:00:00Z',
        endsAt: '2026-08-12T10:00:00Z',
      },
      { runtime: runtimeSemBanco },
    ),
    /Selecione o paciente/,
  );
});

test('exceção sem motivo é recusada antes de chegar ao banco', async () => {
  await assert.rejects(
    () => service.createAppointment(
      {
        kind: 'appointment',
        patientId: 'p1',
        professionalId: 'prof-1',
        discipline: 'acupuntura',
        startsAt: '2026-08-15T09:00:00Z',
        endsAt: '2026-08-15T10:00:00Z',
        isException: true,
        exceptionReason: '   ',
      },
      { runtime: runtimeSemBanco },
    ),
    /motivo da exceção/,
  );
});

test('bloqueio existente não impede marcar atendimento no mesmo horário', () => {
  const bloqueio = [{
    id: 'b1',
    kind: 'block',
    professional_id: 'prof-1',
    status: 'scheduled',
    starts_at: '2026-08-12T15:00:00.000Z',
    ends_at: '2026-08-12T16:00:00.000Z',
  }];

  const conflito = agenda.findOverlap(bloqueio, {
    kind: 'appointment',
    professional_id: 'prof-1',
    starts_at: '2026-08-12T15:00:00.000Z',
    ends_at: '2026-08-12T16:00:00.000Z',
  });

  assert.equal(conflito, null, 'bloqueio avisa pela tela; quem barra é só paciente x paciente');
});

test('remarcar reavalia a exceção: mover para sábado sem motivo é recusado', async () => {
  await assert.rejects(
    () => service.rescheduleAppointment('a1', {
      startsAt: '2026-08-15T09:00:00Z',
      endsAt: '2026-08-15T10:00:00Z',
      isException: true,
      exceptionReason: '',
      runtime: runtimeSemBanco,
    }),
    /motivo da exceção/,
    'sem isto, remarcar seria a porta dos fundos para gravar exceção sem motivo',
  );
});

test('remarcar continua recusando período invertido', async () => {
  await assert.rejects(
    () => service.rescheduleAppointment('a1', {
      startsAt: '2026-08-12T10:00:00Z',
      endsAt: '2026-08-12T09:00:00Z',
      runtime: runtimeSemBanco,
    }),
    /término precisa ser depois do início/,
  );
});

test('tipo de atendimento inválido não passa', async () => {
  await assert.rejects(
    () => service.createAppointment(
      {
        patientId: 'p1',
        professionalId: 'prof-1',
        discipline: 'acupuntura',
        appointmentType: 'inventado',
        startsAt: '2026-08-12T09:00:00Z',
        endsAt: '2026-08-12T10:00:00Z',
      },
      { runtime: runtimeSemBanco },
    ),
    /Tipo de atendimento inválido/,
  );
});

test('os tipos do JS espelham o CHECK da migração', async () => {
  const sql = await readFile(operacaoSql, 'utf8');
  const check = sql.match(/appointment_type IN \(([^)]+)\)/);
  assert.ok(check);

  const fromSql = check[1].split(',').map(part => part.trim().replace(/'/g, '')).sort();
  assert.deepEqual([...service.APPOINTMENT_TYPE_IDS].sort(), fromSql);
});

test('as modalidades do JS espelham o CHECK da migração', async () => {
  const modalitySql = path.resolve(root, '../supabase/migrations/20260818_appointment_modality.sql');
  const sql = await readFile(modalitySql, 'utf8');
  const check = sql.match(/modality IS NULL OR modality IN \(([^)]+)\)/);
  assert.ok(check);

  const fromSql = check[1].split(',').map(part => part.trim().replace(/'/g, '')).sort();
  assert.deepEqual([...service.APPOINTMENT_MODALITY_IDS].sort(), fromSql);
});

test('as categorias de bloqueio do JS espelham o CHECK da migração', async () => {
  const blockTypeSql = path.resolve(root, '../supabase/migrations/20260823_appointment_block_type.sql');
  const sql = await readFile(blockTypeSql, 'utf8');
  const check = sql.match(/block_type IS NULL OR block_type IN \(([^)]+)\)/);
  assert.ok(check);

  const fromSql = check[1].split(',').map(part => part.trim().replace(/'/g, '')).sort();
  assert.deepEqual([...service.APPOINTMENT_BLOCK_TYPE_IDS].sort(), fromSql);
});

test('os kinds do JS espelham o CHECK da migração', async () => {
  const sql = await readFile(operacaoSql, 'utf8');
  const check = sql.match(/kind IN \(([^)]+)\)/);
  assert.ok(check);

  const fromSql = check[1].split(',').map(part => part.trim().replace(/'/g, '')).sort();
  assert.deepEqual([...service.APPOINTMENT_KINDS].sort(), fromSql);
});

// ---------- equipe ----------

test('a própria pessoa aparece primeiro na lista de agendas', () => {
  const lista = members.sortWithSelfFirst([
    { id: 'c', full_name: 'Zuleica' },
    { id: 'a', full_name: 'Ana' },
    { id: 'eu', full_name: 'Marcos' },
  ], 'eu');

  assert.equal(lista[0].id, 'eu');
  assert.deepEqual(lista.slice(1).map(item => item.full_name), ['Ana', 'Zuleica']);
});

test('nome curto cabe em chip sem virar iniciais indecifráveis', () => {
  assert.equal(members.shortName('Ana Paula Souza Lima'), 'Ana Paula L.');
  assert.equal(members.shortName('Ana Souza'), 'Ana Souza');
  assert.equal(members.shortName(''), 'Profissional');
  assert.equal(members.shortName(null), 'Profissional');
});
