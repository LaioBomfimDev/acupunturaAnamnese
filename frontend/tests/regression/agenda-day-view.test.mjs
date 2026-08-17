// ============================================================
// Agenda — visão Dia e jornada, renderizadas de verdade
//
// A tela fica atrás do login e não há como autenticar em teste, então a
// conferência visual humana continua pendente. O que dá para garantir
// aqui é o que quebra silencioso: a faixa livre precisa ser BOTÃO (é o
// alvo de toque do celular), o rótulo precisa mudar em modo "mover", e
// nenhum texto pode dizer que marcar fora do padrão é proibido.
// ============================================================

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let server;
let DayView;
let timeline;

before(async () => {
  server = await createServer({
    root,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  });
  DayView = (await server.ssrLoadModule('/src/components/panels/agenda/AgendaDayView.jsx')).AgendaDayView;
  timeline = await server.ssrLoadModule('/src/utils/agendaTimeline.js');
});

after(async () => {
  await server?.close();
});

const JORNADA = [{
  professional_id: 'prof-1',
  weekday: 3,
  starts_at: '08:00:00',
  ends_at: '18:00:00',
  break_starts_at: '12:00:00',
  break_ends_at: '13:00:00',
  slot_minutes: 60,
  is_active: true,
}];

const QUARTA = new Date(2026, 7, 12);

function render(overrides = {}) {
  const appointments = overrides.appointments || [];
  const schedules = overrides.schedules ?? JORNADA;

  return renderToStaticMarkup(React.createElement(DayView, {
    week: timeline.buildWeekStrip(QUARTA, { today: QUARTA }),
    timeline: timeline.buildDayTimeline({
      date: QUARTA,
      schedules,
      appointments,
      holidays: overrides.holidays || [],
    }),
    selectedKey: '2026-08-12',
    onSelectDay: () => {},
    onPickSlot: () => {},
    onSelectAppointment: () => {},
    patientName: id => (id === 'p1' ? 'Ana Souza' : 'Paciente'),
    professionalName: () => 'você',
    ...overrides.props,
  }));
}

test('a visão Dia renderiza sem quebrar e mostra a jornada cadastrada', () => {
  const html = render();

  assert.match(html, /08:00/);
  assert.match(html, /17:00/);
  assert.match(html, /Intervalo/);
  assert.doesNotMatch(html, /Sem jornada cadastrada/);
});

test('faixa livre é BOTÃO — é o alvo de toque, não um texto decorativo', () => {
  const html = render();
  const botoesLivres = html.match(/class="agd-free"/g) || [];

  assert.ok(botoesLivres.length >= 8,
    'cada horário livre da jornada precisa ser tocável para preencher a hora');
});

test('atendimento aparece com o nome do paciente e some do estado livre', () => {
  const html = render({
    appointments: [{
      id: 'a1',
      kind: 'appointment',
      status: 'scheduled',
      discipline: 'acupuntura',
      patient_id: 'p1',
      professional_id: 'prof-1',
      starts_at: new Date(2026, 7, 12, 9, 0).toISOString(),
      ends_at: new Date(2026, 7, 12, 10, 0).toISOString(),
    }],
  });

  assert.match(html, /Ana Souza/);
  assert.match(html, /agd-card/);
  // Faixa ocupada continua aceitando encaixe: quem recusa sobreposição
  // de paciente é o banco, com mensagem própria.
  assert.match(html, /encaixe/);
});

test('exceção gravada aparece na própria faixa, não escondida num tooltip', () => {
  const html = render({
    appointments: [{
      id: 'a1',
      kind: 'appointment',
      status: 'scheduled',
      discipline: 'acupuntura',
      patient_id: 'p1',
      professional_id: 'prof-1',
      is_exception: true,
      exception_reason: 'Dentro do intervalo',
      starts_at: new Date(2026, 7, 12, 12, 0).toISOString(),
      ends_at: new Date(2026, 7, 12, 13, 0).toISOString(),
    }],
  });

  assert.match(html, /Fora do padrão: Dentro do intervalo/);
});

test('em modo "mover", a faixa livre convida a soltar em vez de criar', () => {
  const html = render({ props: { movingId: 'a1' } });

  assert.match(html, /Mover para cá/);
  assert.doesNotMatch(html, /agd-free-plus/,
    'o "+" de criar não pode aparecer enquanto a ação em curso é mover');
});

test('sem jornada, a tela explica a grade genérica e oferece cadastrar', () => {
  const html = render({
    schedules: [],
    props: { onOpenSchedule: () => {} },
  });

  assert.match(html, /Sem jornada cadastrada/);
  assert.match(html, /Cadastrar horários/);
  assert.match(html, /07:00/);
});

test('feriado é avisado como atípico, sem dizer que está proibido', () => {
  const html = render({
    holidays: [{ day: '2026-08-12', name: 'Aniversário da cidade', is_working_day: false }],
  });

  assert.match(html, /Aniversário da cidade/);
  assert.match(html, /pede confirmação/);

  for (const proibitivo of ['não é possível', 'bloqueado para', 'indisponível']) {
    assert.doesNotMatch(html, new RegExp(proibitivo, 'i'),
      'a clínica é flexível: o texto avisa, nunca proíbe');
  }
});

test('feriado em que a clínica atende não vira alarme', () => {
  const html = render({
    holidays: [{ day: '2026-08-12', name: 'Corpus Christi', is_working_day: true }],
  });

  assert.match(html, /atende normalmente/);
  assert.doesNotMatch(html, /agd-banner--warn/);
});

// ---------- conferência do pacote ----------

test('a conferência do pacote distingue "não vai ser criada" de "vai, marcada"', async () => {
  const { SeriesPreview } = await server.ssrLoadModule('/src/components/panels/agenda/SeriesPreview.jsx');
  const recurrence = await server.ssrLoadModule('/src/utils/agendaRecurrence.js');

  const dates = recurrence.buildRecurrenceDates({ start: new Date(2026, 7, 31), count: 3 });
  const items = recurrence.describeSeries({
    dates,
    time: '14:00',
    durationMinutes: 60,
    professionalId: 'prof-1',
    appointments: [{
      id: 'x1',
      kind: 'appointment',
      status: 'scheduled',
      patient_id: 'p1',
      professional_id: 'prof-1',
      starts_at: new Date(2026, 8, 14, 14, 0).toISOString(),
      ends_at: new Date(2026, 8, 14, 15, 0).toISOString(),
    }],
    evaluate: start => (
      start.getMonth() === 8 && start.getDate() === 7
        ? { isException: true, reason: 'Feriado: Independência', exceptions: [] }
        : { isException: false, reason: '', exceptions: [] }
    ),
  });

  const html = renderToStaticMarkup(React.createElement(SeriesPreview, {
    items,
    summary: recurrence.summarizeSeries(items),
    saving: false,
    onConfirm: () => {},
    onCancel: () => {},
    patientName: id => (id === 'p1' ? 'Ana Souza' : 'Paciente'),
  }));

  // renderToStaticMarkup escapa aspas e afins como entidade; comparar
  // o texto já decodificado evita asserção frouxa com alternativa.
  const texto = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

  // O feriado ENTRA no pacote, marcado.
  assert.match(texto, /Feriado: Independência/);
  assert.match(texto, /serão criadas/);

  // O conflito NÃO entra, e o botão conta só o que vai ser criado.
  assert.match(texto, /Já ocupado por Ana Souza/);
  assert.match(texto, /Criar 2 sessões/);

  assert.match(texto, /1 fora do padrão/);
  assert.match(texto, /1 em conflito/);
});
