// ============================================================
// Agenda → Ferramentas → "Copiar horários vagos" (06/10/2026).
// Um toque copia os horários vagos do dia escolhido, um por linha, para
// a recepção colar no WhatsApp. O risco é oferecer ao paciente um
// horário que está ocupado; por isso a conta:
// - usa todos os atendimentos do profissional, não os filtrados na tela;
// - ocupa toda faixa que o atendimento toca (90 min numa grade de 60);
// - libera cancelado, não compareceu e cancelado pelo paciente;
// - bloqueio ocupa; intervalo e feriado sem atendimento não entram;
// - hoje, só o que ainda não começou; dia que passou, nada.
// ============================================================

import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import {
  buildFreeSlotsCopy,
  freeSlotsNotice,
  freeSlotsOfDay,
} from '../../src/utils/agendaFreeSlots.js';

const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');

// Quinta-feira, 08/10/2026 (weekday 4).
const DAY = new Date(2026, 9, 8, 12, 0);
const BEFORE = new Date(2026, 9, 7, 9, 0);

const ANA = 'ana';
const BIA = 'bia';

function jornada(professionalId, { from = '08:00', to = '12:00', slot = 60, breakFrom = null, breakTo = null } = {}) {
  return {
    professional_id: professionalId,
    weekday: 4,
    starts_at: from,
    ends_at: to,
    slot_minutes: slot,
    break_starts_at: breakFrom,
    break_ends_at: breakTo,
    is_active: true,
  };
}

function at(hour, minute = 0) {
  return new Date(2026, 9, 8, hour, minute).toISOString();
}

function appointment(professionalId, [h1, m1], [h2, m2], extra = {}) {
  return {
    id: `${professionalId}-${h1}${m1}`,
    professional_id: professionalId,
    starts_at: at(h1, m1),
    ends_at: at(h2, m2),
    status: 'scheduled',
    kind: 'appointment',
    ...extra,
  };
}

function labels(result) {
  return result.slots.map(slot => slot.label);
}

test('vago = faixa da jornada que nenhum atendimento ativo toca', () => {
  const result = freeSlotsOfDay({
    date: DAY,
    professionalId: ANA,
    schedules: [jornada(ANA)],
    appointments: [appointment(ANA, [9, 0], [10, 0])],
    now: BEFORE,
  });
  assert.deepEqual(labels(result), ['08:00', '10:00', '11:00']);
  assert.equal(result.closedReason, null);
});

test('atendimento de 90 min ocupa as duas faixas que toca; encostar não ocupa', () => {
  const result = freeSlotsOfDay({
    date: DAY,
    professionalId: ANA,
    schedules: [jornada(ANA)],
    appointments: [appointment(ANA, [8, 0], [9, 0]), appointment(ANA, [9, 30], [11, 0])],
    now: BEFORE,
  });
  // 08:00 ocupado, 09:00 e 10:00 tocados pelo das 09:30; 11:00 só encosta.
  assert.deepEqual(labels(result), ['11:00']);
});

test('cancelado, não compareceu e cancelado pelo paciente liberam; bloqueio ocupa', () => {
  const result = freeSlotsOfDay({
    date: DAY,
    professionalId: ANA,
    schedules: [jornada(ANA)],
    appointments: [
      appointment(ANA, [8, 0], [9, 0], { status: 'cancelled' }),
      appointment(ANA, [9, 0], [10, 0], { status: 'no_show' }),
      appointment(ANA, [10, 0], [11, 0], { status: 'excused' }),
      appointment(ANA, [11, 0], [12, 0], { kind: 'block', status: 'scheduled' }),
    ],
    now: BEFORE,
  });
  assert.deepEqual(labels(result), ['08:00', '09:00', '10:00']);
});

test('atendimento de outra pessoa não ocupa; intervalo não é vago', () => {
  const result = freeSlotsOfDay({
    date: DAY,
    professionalId: ANA,
    schedules: [jornada(ANA, { from: '08:00', to: '14:00', breakFrom: '12:00', breakTo: '13:00' })],
    appointments: [appointment(BIA, [8, 0], [9, 0])],
    now: BEFORE,
  });
  assert.deepEqual(labels(result), ['08:00', '09:00', '10:00', '11:00', '13:00']);
});

test('hoje só oferece o que ainda não começou; dia que passou não oferece nada', () => {
  const now = new Date(2026, 9, 8, 10, 0);
  const today = freeSlotsOfDay({ date: DAY, professionalId: ANA, schedules: [jornada(ANA)], now });
  assert.deepEqual(labels(today), ['11:00']);

  const past = freeSlotsOfDay({
    date: DAY,
    professionalId: ANA,
    schedules: [jornada(ANA)],
    now: new Date(2026, 9, 9, 8, 0),
  });
  assert.deepEqual(past, { slots: [], closedReason: 'past' });
});

test('feriado sem atendimento fecha o dia; feriado com atendimento segue a jornada', () => {
  const closed = freeSlotsOfDay({
    date: DAY,
    professionalId: ANA,
    schedules: [jornada(ANA)],
    holidays: [{ day: '2026-10-08', name: 'Feriado', is_working_day: false }],
    now: BEFORE,
  });
  assert.deepEqual(closed, { slots: [], closedReason: 'holiday' });

  const working = freeSlotsOfDay({
    date: DAY,
    professionalId: ANA,
    schedules: [jornada(ANA)],
    holidays: [{ day: '2026-10-08', name: 'Ponto facultativo', is_working_day: true }],
    now: BEFORE,
  });
  assert.equal(working.slots.length, 4);
});

test('agenda de uma pessoa: só os horários, um por linha', () => {
  const result = buildFreeSlotsCopy({
    date: DAY,
    professionals: [{ id: ANA, name: null }],
    schedules: [jornada(ANA)],
    appointments: [appointment(ANA, [9, 0], [10, 0])],
    now: BEFORE,
  });
  assert.equal(result.text, '08:00\n10:00\n11:00');
  assert.equal(result.total, 3);
});

test('sem jornada cadastrada, a agenda de uma pessoa usa a grade padrão de Configurar agenda', () => {
  const result = buildFreeSlotsCopy({
    date: DAY,
    professionals: [{ id: ANA, name: null }],
    fallback: { start: 14 * 60, end: 16 * 60, slot: 30 },
    now: BEFORE,
  });
  assert.equal(result.text, '14:00\n14:30\n15:00\n15:30');
});

test('visão de recepção: um bloco por profissional, só de quem tem jornada no dia', () => {
  const result = buildFreeSlotsCopy({
    date: DAY,
    allProfessionals: true,
    professionals: [
      { id: ANA, name: 'Ana Paula S.' },
      { id: BIA, name: 'Bia' },
      { id: 'sem-jornada', name: 'Caio' },
    ],
    schedules: [jornada(ANA, { from: '08:00', to: '10:00' }), jornada(BIA, { from: '14:00', to: '16:00' })],
    appointments: [appointment(BIA, [14, 0], [15, 0])],
    now: BEFORE,
  });
  assert.equal(result.text, 'Ana Paula S.\n08:00\n09:00\n\nBia\n15:00');
  assert.equal(result.total, 3);
  assert.ok(!result.text.includes('Caio'));

  const nobody = buildFreeSlotsCopy({
    date: DAY,
    allProfessionals: true,
    professionals: [{ id: 'sem-jornada', name: 'Caio' }],
    now: BEFORE,
  });
  assert.equal(nobody.closedReason, 'no-schedule');
});

test('recado diz o que foi copiado, no plural certo, e mostra os horários quando não deu para copiar', () => {
  const one = buildFreeSlotsCopy({
    date: DAY,
    professionals: [{ id: ANA, name: null }],
    schedules: [jornada(ANA, { from: '08:00', to: '09:00' })],
    now: BEFORE,
  });
  assert.match(freeSlotsNotice({ result: one, date: DAY, now: BEFORE }), /^1 horário vago copiado \(quinta-feira, 08\/10\)\. É só colar no WhatsApp\.$/);

  const many = buildFreeSlotsCopy({
    date: DAY,
    allProfessionals: true,
    professionals: [{ id: ANA, name: 'Ana' }, { id: BIA, name: 'Bia' }],
    schedules: [jornada(ANA, { from: '08:00', to: '10:00' }), jornada(BIA, { from: '08:00', to: '09:00' })],
    now: BEFORE,
  });
  assert.match(freeSlotsNotice({ result: many, date: DAY, now: BEFORE }), /^3 horários vagos copiados de 2 profissionais/);
  assert.equal(
    freeSlotsNotice({ result: many, date: DAY, now: BEFORE, copied: false }),
    'Não deu para copiar sozinho. 3 horários vagos de 2 profissionais em quinta-feira, 08/10: Ana: 08:00, 09:00 · Bia: 08:00',
  );

  const none = { groups: [], total: 0, text: '', closedReason: null };
  assert.equal(freeSlotsNotice({ result: none, date: DAY, now: new Date(2026, 9, 8, 11, 30) }), 'Nenhum horário vago no resto de hoje.');
  assert.match(freeSlotsNotice({ result: { ...none, closedReason: 'past' }, date: DAY }), /^Quinta-feira, 08\/10 já passou/);
  for (const message of [
    freeSlotsNotice({ result: one, date: DAY }),
    freeSlotsNotice({ result: many, date: DAY }),
  ]) {
    assert.doesNotMatch(message, /\(s\)|\bitems\b/);
  }
});

test('Agenda: ferramenta copia a partir de todos os atendimentos, não dos filtrados', async () => {
  const agenda = await readFile(path.join(srcDir, 'components/panels/Agenda.jsx'), 'utf8');
  const handler = agenda.match(/async function copyFreeSlots\(\) \{[\s\S]*?\r?\n {2}\}\r?\n/)?.[0] || '';
  assert.ok(handler, 'copyFreeSlots não encontrada');
  assert.match(handler, /^\s+appointments,$/m);
  assert.doesNotMatch(handler, /visibleAppointments/);
  // Mês carregando ou agenda com erro: nada de "tudo vago".
  assert.match(handler, /if \(loading\) \{/);
  assert.match(handler, /if \(error\) \{/);
  assert.match(handler, /navigator\.clipboard\.writeText\(result\.text\)/);

  // Mora dentro de "Ferramentas", como toda ferramenta da Agenda.
  const tools = agenda.match(/const toolItems = \([\s\S]*?\r?\n {2}\);/)?.[0] || '';
  assert.match(tools, /onClick=\{copyFreeSlots\}/);
  assert.match(tools, /Copiar horários vagos/);
});
