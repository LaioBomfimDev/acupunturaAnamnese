// ============================================================
// Configurar agenda — visual do cancelado, fixo × eventual, cores e
// padrões (pedido de 2026-09-28)
//
// Travas:
//  - cancelado ("Cancelado pelo paciente" incluso) nunca mais é só
//    opacidade: todo card de cancelado/falta sai com data-look;
//  - fixo = pacote no horário do pacote; sessão de pacote MOVIDA vira
//    eventual (rescheduled_from guarda o horário original);
//  - o que vem do banco passa por normalizeAgendaSettings e nunca quebra
//    a agenda;
//  - só o clinic_admin grava (RPC + botão), e a regra vale para todos.
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
const migrationPath = path.resolve(root, '../supabase/migrations/20260928_agenda_settings.sql');

let server;
let settings;
let timeline;
let service;
let settingsService;
let Context;
let DayRows;
let WeekView;

before(async () => {
  server = await createServer({
    root,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  });
  settings = await server.ssrLoadModule('/src/utils/agendaSettings.js');
  timeline = await server.ssrLoadModule('/src/utils/agendaTimeline.js');
  service = await server.ssrLoadModule('/src/services/appointmentService.js');
  settingsService = await server.ssrLoadModule('/src/services/agendaSettingsService.js');
  Context = (await server.ssrLoadModule('/src/hooks/AgendaSettingsContext.js')).AgendaSettingsContext;
  DayRows = (await server.ssrLoadModule('/src/components/panels/agenda/AgendaDayRows.jsx')).AgendaDayRows;
  WeekView = (await server.ssrLoadModule('/src/components/panels/agenda/AgendaWeekView.jsx')).AgendaWeekView;
});

after(async () => {
  await server?.close();
});

const DIA = new Date(2026, 8, 29); // terça

function appointment(overrides = {}) {
  return {
    id: 'a1',
    kind: 'appointment',
    status: 'scheduled',
    discipline: 'acupuntura',
    patient_id: 'p1',
    professional_id: 'prof-1',
    starts_at: new Date(2026, 8, 29, 14, 0).toISOString(),
    ends_at: new Date(2026, 8, 29, 15, 0).toISOString(),
    recurrence_group_id: null,
    rescheduled_from: null,
    ...overrides,
  };
}

function renderDay(items, config) {
  const { rows } = timeline.buildDayTimeline({ date: DIA, appointments: items });
  return renderToStaticMarkup(
    React.createElement(
      Context.Provider,
      { value: settings.normalizeAgendaSettings(config) },
      React.createElement(DayRows, {
        rows,
        onPickSlot: () => {},
        patientName: () => 'Jasmine',
      }),
    ),
  );
}

// ---------- normalização ----------

test('configuração vazia, lixo ou array vira o padrão completo', () => {
  for (const raw of [null, undefined, 'x', 42, [], {}]) {
    assert.deepEqual(settings.normalizeAgendaSettings(raw), {
      ...settings.AGENDA_SETTINGS_DEFAULTS,
      disciplineColors: {},
    });
  }
});

test('valor fora da lista cai no padrão só naquele item', () => {
  const result = settings.normalizeAgendaSettings({
    cancelledLook: 'neon',
    noShowLook: 'solid',
    seriesHighlight: 'fixed',
    seriesMarkStyle: 'confete',
    defaultDurationMinutes: 37,
    defaultView: 'ano',
    fallbackSlotMinutes: 30,
    hideCancelled: 'sim',
  });

  assert.equal(result.cancelledLook, 'solid-x');
  assert.equal(result.noShowLook, 'solid');
  assert.equal(result.seriesHighlight, 'fixed');
  assert.equal(result.seriesMarkStyle, 'dashed');
  assert.equal(result.defaultDurationMinutes, 60);
  assert.equal(result.defaultView, 'hoje');
  assert.equal(result.fallbackSlotMinutes, 30);
  assert.equal(result.hideCancelled, false, 'só true literal liga esconder cancelados');
});

test('cor de disciplina: só hex válido e só disciplina que existe', () => {
  const result = settings.normalizeAgendaSettings({
    disciplineColors: {
      acupuntura: '#3f7d5c',
      psicologia: 'red',
      inventada: '#000000',
      nutricao: 'url(javascript:alert(1))',
    },
  });

  assert.deepEqual(result.disciplineColors, { acupuntura: '#3F7D5C' });
  assert.equal(settings.disciplineColorFor('acupuntura', result), '#3F7D5C');
  assert.equal(settings.disciplineColorFor('psicologia', result), 'var(--r1-discipline-psicologia)');
});

test('paleta da agenda: contraste >= 4,5 com texto branco e sem vermelho', () => {
  const luminance = hex => {
    const channels = [1, 3, 5]
      .map(index => parseInt(hex.slice(index, index + 2), 16) / 255)
      .map(value => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };

  for (const color of settings.AGENDA_COLOR_PALETTE) {
    const contrast = 1.05 / (luminance(color.value) + 0.05);
    assert.ok(contrast >= 4.5, `${color.label} (${color.value}) tem contraste ${contrast.toFixed(2)}`);
    assert.doesNotMatch(color.label, /vermelh/i);
  }
});

test('grade sem jornada invertida volta as duas pontas ao padrão', () => {
  const result = settings.normalizeAgendaSettings({ fallbackDayStartHour: 18, fallbackDayEndHour: 9 });
  assert.equal(result.fallbackDayStartHour, 7);
  assert.equal(result.fallbackDayEndHour, 20);
  assert.equal(settings.fallbackGridLabel(result), 'das 07h às 20h');
});

// ---------- status ----------

test('"Cancelado pelo paciente" e "Cancelado" usam o visual do cancelado; falta tem o próprio', () => {
  const config = settings.normalizeAgendaSettings({ cancelledLook: 'solid-x', noShowLook: 'outline' });

  assert.equal(settings.statusLookOf(appointment({ status: 'excused' }), config), 'solid-x');
  assert.equal(settings.statusLookOf(appointment({ status: 'cancelled' }), config), 'solid-x');
  assert.equal(settings.statusLookOf(appointment({ status: 'no_show' }), config), 'outline');
  assert.equal(settings.statusLookOf(appointment({ status: 'scheduled' }), config), null);
  assert.equal(settings.statusLookOf(appointment({ status: 'attended' }), config), null);
  assert.equal(settings.statusLookOf({ kind: 'block', status: 'cancelled' }, config), null);
});

test('card da visão Dia: cancelado sai com data-look e nome, nunca só opacidade', () => {
  const html = renderDay([appointment({ status: 'excused' })], { cancelledLook: 'solid-x' });
  assert.match(html, /data-look="solid-x"/);
  assert.match(html, /agd-card--excused/);

  const css = readFile(path.join(root, 'src/styles/agenda.css'), 'utf8');
  return css.then(text => {
    assert.doesNotMatch(text, /\.agd-card--excused \{ opacity/, 'o visual fraco (só opacidade) não pode voltar');
    assert.match(text, /\[data-look="solid-x"\], \[data-look="x"\]\)::after \{\s+content: "✕"/);
  });
});

// ---------- fixo × eventual ----------

test('fixo = pacote no horário do pacote; movida ou marcada sozinha = eventual', () => {
  assert.equal(settings.seriesKindOf(appointment({ recurrence_group_id: 'g1' })), 'fixed');
  assert.equal(
    settings.seriesKindOf(appointment({ recurrence_group_id: 'g1', rescheduled_from: '2026-09-29T17:00:00.000Z' })),
    'one-off',
  );
  assert.equal(settings.seriesKindOf(appointment()), 'one-off');
  assert.equal(settings.seriesKindOf({ kind: 'block' }), null);
});

test('marca só o tipo escolhido, e nunca em card cancelado', () => {
  const config = settings.normalizeAgendaSettings({ seriesHighlight: 'one-off', seriesMarkStyle: 'stripes' });

  assert.deepEqual(settings.seriesMarkOf(appointment(), config), { kind: 'one-off', style: 'stripes', label: 'Eventual' });
  assert.equal(settings.seriesMarkOf(appointment({ recurrence_group_id: 'g1' }), config), null);
  assert.equal(settings.seriesMarkOf(appointment({ status: 'excused' }), config), null);

  const none = settings.normalizeAgendaSettings({ seriesHighlight: 'none' });
  assert.equal(settings.seriesMarkOf(appointment(), none), null);

  const fixed = settings.normalizeAgendaSettings({ seriesHighlight: 'fixed' });
  assert.equal(settings.seriesMarkOf(appointment({ recurrence_group_id: 'g1' }), fixed)?.label, 'Fixo');
});

test('card da visão Dia mostra o selo Eventual e a remarcação; o fixo fica sem selo', () => {
  const eventual = renderDay([appointment()], {});
  assert.match(eventual, /data-series="one-off"/);
  assert.match(eventual, /data-series-mark="dashed"/);
  assert.match(eventual, />Eventual</);

  const fixo = renderDay([appointment({ recurrence_group_id: 'g1' })], {});
  assert.doesNotMatch(fixo, /data-series=/);
  assert.doesNotMatch(fixo, />Eventual</);

  const movida = renderDay([appointment({
    recurrence_group_id: 'g1',
    rescheduled_from: new Date(2026, 8, 29, 10, 0).toISOString(),
  })], {});
  assert.match(movida, />Eventual</);
  assert.match(movida, /Remarcada de ter 29\/09 10:00/);
});

test('visão Semana desktop leva o selo e a cor escolhida pelo Admin', () => {
  const html = renderToStaticMarkup(
    React.createElement(
      Context.Provider,
      { value: settings.normalizeAgendaSettings({ disciplineColors: { acupuntura: '#3F7D5C' } }) },
      React.createElement(WeekView, {
        week: timeline.buildWeekStrip(DIA, { today: DIA }),
        schedules: [],
        appointments: [appointment()],
        holidays: [],
        selectedKey: '2026-09-29',
        onPickCell: () => {},
        patientName: () => 'Jasmine',
      }),
    ),
  );

  assert.match(html, /class="agw-series">Eventual</);
  assert.match(html, /--card-color:#3F7D5C/);
});

test('nextRescheduledFrom guarda o ORIGINAL e limpa quando volta para ele', () => {
  const original = '2026-09-29T17:00:00.000Z';
  const sexta = '2026-10-02T13:00:00.000Z';
  const sabado = '2026-10-03T13:00:00.000Z';

  const first = settings.nextRescheduledFrom({ starts_at: original, rescheduled_from: null }, sexta);
  assert.equal(first, original);

  const second = settings.nextRescheduledFrom({ starts_at: sexta, rescheduled_from: first }, sabado);
  assert.equal(second, original, 'segunda remarcação não troca a origem');

  const back = settings.nextRescheduledFrom({ starts_at: sabado, rescheduled_from: original }, original);
  assert.equal(back, null, 'voltou ao horário fixo: deixa de ser eventual');
});

test('rescheduleAppointment grava rescheduled_from só quando informado', async () => {
  const patches = [];
  const runtime = {
    getAuthenticatedUser: async () => ({ id: 'u1' }),
    from: () => ({
      update: patch => {
        patches.push(patch);
        return { eq: () => ({ select: () => ({ single: async () => ({ data: { id: 'a1', ...patch }, error: null }) }) }) };
      },
    }),
  };
  const times = { startsAt: '2026-10-02T13:00:00.000Z', endsAt: '2026-10-02T14:00:00.000Z' };

  await service.rescheduleAppointment('a1', { ...times, rescheduledFrom: '2026-09-29T17:00:00.000Z', runtime });
  await service.rescheduleAppointment('a1', { ...times, rescheduledFrom: null, runtime });
  await service.rescheduleAppointment('a1', { ...times, runtime });

  assert.equal(patches[0].rescheduled_from, '2026-09-29T17:00:00.000Z');
  assert.equal(patches[1].rescheduled_from, null);
  assert.ok(!('rescheduled_from' in patches[2]), 'quem não informa não apaga a origem');
});

// ---------- esconder cancelados ----------

test('esconder cancelados some com cancelado/cancelado pelo paciente, e o filtro traz de volta', () => {
  const on = settings.normalizeAgendaSettings({ hideCancelled: true });
  const off = settings.normalizeAgendaSettings({});

  assert.equal(settings.hidesAppointment(appointment({ status: 'excused' }), on), true);
  assert.equal(settings.hidesAppointment(appointment({ status: 'cancelled' }), on), true);
  assert.equal(settings.hidesAppointment(appointment({ status: 'no_show' }), on), false, 'falta não é cancelado');
  assert.equal(settings.hidesAppointment(appointment({ status: 'excused' }), off), false);
  assert.equal(settings.hidesAppointment(appointment({ status: 'excused' }), on, 'excused'), false);
  assert.equal(settings.hidesAppointment({ kind: 'block', status: 'cancelled' }, on), false);
});

// ---------- padrões ----------

test('grade de quem não cadastrou jornada segue a configuração', () => {
  const custom = timeline.buildDayTimeline({
    date: DIA,
    fallback: settings.fallbackGridOf({ fallbackDayStartHour: 8, fallbackDayEndHour: 12, fallbackSlotMinutes: 30 }),
  });
  assert.equal(custom.rows.length, 8);
  assert.equal(custom.rows[0].label, '08:00');
  assert.equal(custom.rows.at(-1).endLabel, '12:00');

  const padrao = timeline.buildDayTimeline({ date: DIA });
  assert.equal(padrao.rows.length, 13, 'sem configuração continua 07h–20h de hora em hora');
});

// ---------- persistência e permissão ----------

test('loadAgendaSettings sem a coluna no banco segue no padrão e avisa indisponível', async () => {
  const runtime = {
    getAuthenticatedUser: async () => ({ id: 'u1' }),
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: null,
            error: { message: 'column clinics.agenda_settings does not exist' },
          }),
        }),
      }),
    }),
  };

  const result = await settingsService.loadAgendaSettings('clinic-1', { runtime });
  assert.equal(result.available, false);
  assert.equal(result.settings.cancelledLook, 'solid-x');
});

test('saveAgendaSettings manda a configuração normalizada e traduz a recusa de permissão', async () => {
  const calls = [];
  const ok = {
    getAuthenticatedUser: async () => ({ id: 'admin' }),
    rpc: async (name, args) => {
      calls.push([name, args]);
      return { data: args.p_settings, error: null };
    },
  };

  const saved = await settingsService.saveAgendaSettings({ cancelledLook: 'solid', lixo: 1 }, { runtime: ok });
  assert.equal(calls[0][0], 'clinic_admin_update_agenda_settings');
  assert.ok(!('lixo' in calls[0][1].p_settings), 'chave desconhecida não vai para o banco');
  assert.equal(saved.cancelledLook, 'solid');

  const denied = {
    getAuthenticatedUser: async () => ({ id: 'recepcao' }),
    rpc: async () => ({ data: null, error: { code: '42501', message: 'Acesso negado' } }),
  };
  await assert.rejects(
    () => settingsService.saveAgendaSettings({}, { runtime: denied }),
    /Só quem é Admin da clínica pode configurar a agenda/,
  );
});

test('migração: só clinic_admin grava, anon bloqueado, e a sessão movida tem onde guardar a origem', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  const fn = sql.match(/CREATE OR REPLACE FUNCTION public\.clinic_admin_update_agenda_settings[\s\S]*?\$\$;/);
  assert.ok(fn, 'RPC precisa existir');
  assert.match(fn[0], /SECURITY DEFINER/);
  assert.match(fn[0], /IF NOT public\.is_clinic_admin\(v_actor_id\) THEN/);
  assert.match(fn[0], /WHERE id = v_clinic/, 'grava só na própria instituição');
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.clinic_admin_update_agenda_settings\(JSONB\) FROM PUBLIC, anon;/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS agenda_settings JSONB NOT NULL DEFAULT '\{\}'::jsonb/);
  assert.match(sql, /jsonb_typeof\(agenda_settings\) = 'object'/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS rescheduled_from TIMESTAMPTZ/);
});

test('Agenda: botão Configurar só para clinic_admin, e mover guarda o horário original', async () => {
  const source = await readFile(path.join(root, 'src/components/panels/Agenda.jsx'), 'utf8');
  assert.match(source, /const canConfigureAgenda = profile\?\.role === 'clinic_admin';/);
  assert.match(source, /\{canConfigureAgenda && \(\s+<button[\s\S]*?setShowSettings\(true\)/);
  assert.match(source, /showSettings && canConfigureAgenda/);
  assert.match(source, /rescheduledFrom: nextRescheduledFrom\(appointment, start\.toISOString\(\)\)/);

  const serviceSource = await readFile(path.join(root, 'src/services/appointmentService.js'), 'utf8');
  assert.match(serviceSource, /'rescheduled_from,created_by,created_at,updated_at'/);
});

test('CSS do visual de status não usa vermelho (reservado a conflito)', async () => {
  const css = await readFile(path.join(root, 'src/styles/agenda.css'), 'utf8');
  const start = css.indexOf('Visual de status e fixo × eventual');
  assert.ok(start > 0);
  const block = css.slice(start, css.indexOf('Tela "Configurar agenda"', start));
  assert.doesNotMatch(block, /--r1-danger|#[cC]0|red\b/);
});

test('a Agenda chama de "Eventual" o que não é fixo; "avulso" não volta (pedido de 2026-09-29)', async () => {
  const files = [
    'src/utils/agendaSettings.js',
    'src/components/panels/Agenda.jsx',
    'src/components/panels/agenda/AgendaSettingsEditor.jsx',
  ];
  for (const file of files) {
    const source = await readFile(path.join(root, file), 'utf8');
    assert.doesNotMatch(source, /avuls/i, `${file} ainda fala em avulso`);
  }

  const labels = settings.SERIES_HIGHLIGHTS.map(option => option.label);
  assert.ok(labels.includes('Destacar os eventuais'));
});
