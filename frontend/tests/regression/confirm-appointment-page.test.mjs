import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';

// Página pública de confirmação (/confirmar-agendamento): o paciente
// precisa ver se a consulta é online ou presencial e, se for presencial,
// o endereço da clínica. Endereço nunca aparece pra consulta online —
// nem na página, nem na mensagem de WhatsApp que leva o link.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let server;
let confirmation;
let agenda;

before(async () => {
  server = await createServer({
    root,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  });
  confirmation = await server.ssrLoadModule('/src/utils/appointmentConfirmation.js');
  agenda = await server.ssrLoadModule('/src/utils/agenda.js');
});

after(async () => {
  await server?.close();
});

const BASE_VIEW = {
  patientName: 'Maria Souza',
  professionalName: 'Ana Lima',
  clinicName: 'Clínica Teste',
  clinicAddress: 'Rua das Flores, 100 - Centro, Salvador - BA',
  room: 'Sala 2',
};

function rowIds(rows) {
  return rows.map(row => row.id);
}

test('presencial mostra atendimento, endereço com link do mapa e sala', () => {
  const rows = confirmation.buildConfirmationDetails({ ...BASE_VIEW, modality: 'presencial' });

  assert.deepEqual(rowIds(rows), ['patient', 'professional', 'presencial', 'address', 'room']);
  assert.equal(rows.find(r => r.id === 'presencial').value, 'Presencial');

  const address = rows.find(r => r.id === 'address');
  assert.equal(address.value, BASE_VIEW.clinicAddress);
  assert.equal(
    address.href,
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(BASE_VIEW.clinicAddress)}`,
  );
});

test('online nunca mostra endereço nem sala, mesmo se vierem no payload', () => {
  const rows = confirmation.buildConfirmationDetails({ ...BASE_VIEW, modality: 'online' });

  assert.deepEqual(rowIds(rows), ['patient', 'professional', 'online']);
  assert.equal(rows.find(r => r.id === 'online').value, 'Online');
});

test('presencial sem endereço cadastrado não inventa linha vazia', () => {
  const rows = confirmation.buildConfirmationDetails({ ...BASE_VIEW, modality: 'presencial', clinicAddress: '   ' });
  assert.equal(rowIds(rows).includes('address'), false);
});

test('Edge Function antiga (sem modality) mantém a página como antes, sem chutar "Presencial"', () => {
  // BASE_VIEW não tem modality: é o payload da versão anterior da function.
  const rows = confirmation.buildConfirmationDetails(BASE_VIEW);
  assert.deepEqual(rowIds(rows), ['patient', 'professional', 'room']);
});

test('nome ausente vira "Não informado" em vez de campo vazio', () => {
  const rows = confirmation.buildConfirmationDetails({ modality: 'online' });
  assert.equal(rows.find(r => r.id === 'patient').value, 'Não informado');
  assert.equal(rows.find(r => r.id === 'professional').value, 'Não informado');
});

test('describeAppointmentWhen monta bloquinho de data, extenso e faixa de horário', () => {
  const today = new Date(2026, 8, 29, 10, 0);
  const when = confirmation.describeAppointmentWhen(
    new Date(2026, 8, 30, 14, 0).toISOString(),
    new Date(2026, 8, 30, 15, 0).toISOString(),
    today,
  );

  assert.equal(when.day, '30');
  assert.equal(when.month, 'set');
  assert.equal(when.dateLong, 'Quarta-feira, 30 de setembro');
  assert.equal(when.timeRange, '14:00 às 15:00');
  assert.equal(when.relative, 'Amanhã');
});

test('describeAppointmentWhen: longe não tem selo; sem término mostra só o início', () => {
  const today = new Date(2026, 8, 29, 10, 0);
  const when = confirmation.describeAppointmentWhen(new Date(2026, 9, 8, 9, 30).toISOString(), null, today);

  assert.equal(when.relative, '');
  assert.equal(when.timeRange, '09:30');
  assert.equal(confirmation.describeAppointmentWhen('não é data', null, today), null);
});

test('relativeDayWord é a mesma régua do relativeDayLabel (WhatsApp)', () => {
  const today = new Date(2026, 8, 17, 8, 0);
  assert.equal(agenda.relativeDayWord(new Date(2026, 8, 17, 15, 0), today), 'hoje');
  assert.equal(agenda.relativeDayWord(new Date(2026, 8, 18, 9, 0), today), 'amanhã');
  assert.equal(agenda.relativeDayWord(new Date(2026, 8, 19, 9, 0), today), 'depois de amanhã');
  assert.equal(agenda.relativeDayWord(new Date(2026, 8, 22, 9, 0), today), '');
  assert.equal(agenda.relativeDayLabel(new Date(2026, 8, 18, 9, 0), today), 'amanhã (18 de setembro)');
});

test('cor da clínica só entra quando é hex válido', () => {
  assert.equal(confirmation.clinicAccentStyle(''), null);
  assert.equal(confirmation.clinicAccentStyle('red; background:url(x)'), null);

  const style = confirmation.clinicAccentStyle('#1F6FEB');
  assert.equal(style['--r1-accent'], '#1F6FEB');
  assert.match(style['--r1-accent-strong'], /^#[0-9A-F]{6}$/);
});

test('Edge Function devolve modalidade, término e endereço só pra presencial', async () => {
  const source = await readFile(path.resolve(root, '../supabase/functions/confirm-appointment/index.ts'), 'utf8');

  const select = source.match(/const APPOINTMENT_PUBLIC_SELECT =([\s\S]*?);/)?.[1] || '';
  assert.match(select, /\bmodality\b/);
  assert.match(select, /\bends_at\b/);
  // confirmation_link_color: cor do link escolhida em Personalizar (2026-10-01).
  assert.match(select, /clinics\(name,address,brand_color,confirmation_link_color\)/);

  // \r?\n: checkout no Windows traz o .ts em CRLF.
  const view = source.match(/function toPublicView[\s\S]*?\r?\n}\r?\n/)?.[0] || '';
  assert.ok(view, 'toPublicView não encontrada no código da function');
  assert.match(view, /modality === 'online' \? 'online' : 'presencial'/);
  assert.match(view, /clinicAddress: modality === 'presencial' && clinicAddress \? clinicAddress : null/);
});

test('mensagem de WhatsApp não manda endereço pra consulta online', async () => {
  const source = await readFile(
    path.resolve(root, 'src/components/panels/agenda/PendingConfirmationView.jsx'),
    'utf8',
  );
  assert.match(source, /if \(clinicAddress && appointment\.modality !== 'online'\) paragrafos\.push\(`Nosso endereço/);
});
