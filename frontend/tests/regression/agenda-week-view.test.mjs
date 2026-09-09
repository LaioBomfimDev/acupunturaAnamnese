// ============================================================
// Agenda — visão Semana, desktop e celular
//
// A visão Semana desktop (grid de 620px) existe pra alinhar os 7 dias
// numa régua só e enxergar buraco na semana inteira. No celular essa
// régua não sobrevive (não tem como Segunda 8h ficar ao lado de Terça
// 8h empilhado), então AgendaWeekMobileView.jsx troca por 7 dias
// empilhados reaproveitando a MESMA faixa/card da visão Dia
// (AgendaDayRows.jsx) — zero scroll horizontal, zero interação nova.
//
// Este arquivo trava: (1) o grid desktop não mudou de estrutura com o
// dedup de isPast/BLOCK_TYPE_LABEL/BLOCK_TYPE_ICONS; (2) a versão
// mobile produz os 7 dias, cada um com faixa livre tocável; (3) o
// seletor de visão não esconde mais nenhuma aba via posição de irmão
// (o bug que escondia "Dia" em vez de "Semana").
// ============================================================

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let server;
let WeekView;
let WeekMobileView;
let timeline;

before(async () => {
  server = await createServer({
    root,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  });
  WeekView = (await server.ssrLoadModule('/src/components/panels/agenda/AgendaWeekView.jsx')).AgendaWeekView;
  WeekMobileView = (await server.ssrLoadModule('/src/components/panels/agenda/AgendaWeekMobileView.jsx')).AgendaWeekMobileView;
  timeline = await server.ssrLoadModule('/src/utils/agendaTimeline.js');
});

after(async () => {
  await server?.close();
});

const JORNADA = [{
  professional_id: 'prof-1',
  weekday: 3, // quarta
  starts_at: '08:00:00',
  ends_at: '18:00:00',
  break_starts_at: '12:00:00',
  break_ends_at: '13:00:00',
  slot_minutes: 60,
  is_active: true,
}];

const QUARTA = new Date(2026, 7, 12);

const ATENDIMENTO = {
  id: 'a1',
  kind: 'appointment',
  status: 'scheduled',
  discipline: 'acupuntura',
  patient_id: 'p1',
  professional_id: 'prof-1',
  starts_at: new Date(2026, 7, 12, 9, 0).toISOString(),
  ends_at: new Date(2026, 7, 12, 10, 0).toISOString(),
};

function week() {
  return timeline.buildWeekStrip(QUARTA, { today: QUARTA });
}

test('visão Semana desktop: grid de 8 colunas intacto após o dedup de isPast/BLOCK_TYPE_*', () => {
  const html = renderToStaticMarkup(React.createElement(WeekView, {
    week: week(),
    schedules: JORNADA,
    appointments: [ATENDIMENTO],
    holidays: [],
    selectedKey: '2026-08-12',
    onPickCell: () => {},
    onSelectAppointment: () => {},
    patientName: id => (id === 'p1' ? 'Ana Souza' : 'Paciente'),
    movingId: null,
    now: null,
  }));

  assert.match(html, /class="agw"/);
  assert.match(html, /class="agw-head"/);
  assert.match(html, /class="agw-line"/);
  assert.match(html, /Ana Souza/);
});

test('visão Semana desktop: célula ganha a cor da disciplina do atendimento (ATENDIMENTO é acupuntura)', () => {
  const html = renderToStaticMarkup(React.createElement(WeekView, {
    week: week(),
    schedules: JORNADA,
    appointments: [ATENDIMENTO],
    holidays: [],
    selectedKey: '2026-08-12',
    onPickCell: () => {},
    onSelectAppointment: () => {},
    patientName: id => (id === 'p1' ? 'Ana Souza' : 'Paciente'),
    movingId: null,
    now: null,
  }));

  assert.match(html, /agw-item--filled/);
  assert.match(html, /--card-color:var\(--r1-discipline-acupuntura\)/);
});

test('visão Semana celular: 7 dias empilhados, cada um com suas próprias faixas', () => {
  const html = renderToStaticMarkup(React.createElement(WeekMobileView, {
    week: week(),
    schedules: JORNADA,
    appointments: [ATENDIMENTO],
    holidays: [],
    selectedKey: '2026-08-12',
    onPickSlot: () => {},
    onSelectAppointment: () => {},
    patientName: id => (id === 'p1' ? 'Ana Souza' : 'Paciente'),
    professionalName: () => 'você',
    now: null,
  }));

  const dias = html.match(/class="agwm-day(?:\s|")/g) || [];
  assert.equal(dias.length, 7, 'a semana tem 7 dias, sem pular nem duplicar nenhum');

  // Reaproveita a faixa da visão Dia — não uma versão paralela.
  assert.match(html, /class="agd-rows"/);
  assert.match(html, /class="agd-free"/, 'faixa livre precisa continuar sendo botão tocável');
  assert.match(html, /Ana Souza/);
});

test('visão Semana celular: nenhum scroll lateral embutido na estrutura (sem grid de colunas fixas)', () => {
  const html = renderToStaticMarkup(React.createElement(WeekMobileView, {
    week: week(),
    schedules: JORNADA,
    appointments: [],
    holidays: [],
    selectedKey: '2026-08-12',
    onPickSlot: () => {},
    onSelectAppointment: () => {},
    patientName: () => 'Paciente',
    professionalName: () => 'você',
    now: null,
  }));

  // .agw/.agw-line são o grid de 620px do desktop — a versão mobile não
  // deve conter NENHUM traço dele.
  assert.doesNotMatch(html, /class="agw[ "]/);
  assert.doesNotMatch(html, /class="agw-line"/);
});

test('visão Semana celular: dia de hoje e feriado aparecem marcados no cabeçalho do dia', () => {
  const html = renderToStaticMarkup(React.createElement(WeekMobileView, {
    week: week(),
    schedules: JORNADA,
    appointments: [],
    holidays: [{ day: '2026-08-12', name: 'Aniversário da cidade', is_working_day: false }],
    selectedKey: '2026-08-12',
    onPickSlot: () => {},
    onSelectAppointment: () => {},
    patientName: () => 'Paciente',
    professionalName: () => 'você',
    now: null,
  }));

  assert.match(html, /agwm-day--today/);
  assert.match(html, /ag-pill--holiday/);
});

test('nenhum seletor de CSS decide visibilidade de aba por posição de irmão (nth-child)', async () => {
  const css = await readFile(path.join(root, 'src/styles/agenda.css'), 'utf8');
  assert.doesNotMatch(
    css,
    /\.ag-seg-btn:nth-child/,
    'esconder aba por :nth-child já quebrou uma vez (escondia "Dia" achando que era "Semana") — visibilidade tem que depender do id da view, não da posição',
  );
});
