import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import * as agenda from '../../src/utils/agenda.js';

// Rótulos e tipos da Agenda revistos com a administradora (2026-09-24):
// - "Cancelado pelo paciente" (excused) substitui "Cancelou" e "Faltou
//   com aviso", que tinham o mesmo sentido; conta como falta justificada.
// - "Pronto para atender"/"Chegou" (ready) saiu da tela: a agenda só
//   registra o resultado. O estado segue no banco por causa do legado.
// - Tipo do atendimento ganha Anamnese, Sessão, Devolutiva e Entrevista,
//   em ordem alfabética, e o banco aceita os mesmos valores.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TYPES_MIGRATION = path.resolve(root, '../supabase/migrations/20260924c_appointment_types_expand.sql');

let server;
let service;
let typesSql;
let agendaSource;

before(async () => {
  server = await createServer({ root, logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' });
  service = await server.ssrLoadModule('/src/services/appointmentService.js');
  typesSql = await readFile(TYPES_MIGRATION, 'utf8');
  agendaSource = await readFile(path.resolve(root, 'src/components/panels/Agenda.jsx'), 'utf8');
});

after(async () => {
  await server?.close();
});

test('rótulos novos dos status', () => {
  assert.equal(agenda.getStatusLabel('attended'), 'Atendido');
  assert.equal(agenda.getStatusLabel('no_show'), 'Não compareceu');
  assert.equal(agenda.getStatusLabel('excused'), 'Cancelado pelo paciente');
  assert.equal(agenda.getStatusLabel('ready'), 'Agendado', 'legado "chegou" aparece como agendado');
});

test('card oferece só o resultado, na ordem certa — sem "chegou" nem dois tipos de cancelamento', () => {
  assert.deepEqual(agenda.OUTCOME_STATUSES.map(item => item.id), ['attended', 'no_show', 'excused']);
  assert.ok(!agenda.SELECTABLE_STATUSES.some(item => item.id === 'ready'), 'filtro não oferece o legado');
  const labels = agenda.APPOINTMENT_STATUSES.map(item => item.label);
  for (const antigo of ['Pronto para atender', 'Atendeu', 'Cancelou', 'Faltou com aviso']) {
    assert.ok(!labels.includes(antigo), `rótulo antigo "${antigo}" não pode voltar`);
  }
});

test('"Confirmado" fica no card como confirmação de presença, não como status', () => {
  assert.match(agendaSource, /ag-chip-btn--confirm/);
  assert.match(agendaSource, /handleConfirm\(selectedAppointment, Boolean\(selectedAppointment\.confirmed_at\)\)/);
  assert.ok(!agendaSource.includes('checkInAppointment'), 'o check-in ("Chegou") saiu da Agenda');
});

test('tipos em ordem alfabética, com os 4 novos', () => {
  const labels = service.APPOINTMENT_TYPES.map(item => item.label);
  assert.deepEqual(labels, [...labels].sort((a, b) => a.localeCompare(b, 'pt-BR')));
  for (const novo of ['Anamnese', 'Sessão', 'Devolutiva', 'Entrevista']) {
    assert.ok(labels.includes(novo), `falta o tipo ${novo}`);
  }
});

test('banco aceita exatamente os tipos da tela, na agenda e nas duas tabelas de preço', () => {
  const ids = [...service.APPOINTMENT_TYPE_IDS].sort();
  for (const constraint of ['appointments_type_check', 'procedure_prices_appointment_type_check', 'convenio_procedure_prices_appointment_type_check']) {
    const bloco = typesSql.split(`ADD CONSTRAINT ${constraint}`)[1]?.split(';')[0] || '';
    const fromSql = [...bloco.matchAll(/'([a-z_]+)'/g)].map(match => match[1]).sort();
    assert.deepEqual(fromSql, ids, `${constraint} diverge de APPOINTMENT_TYPES`);
  }
});
