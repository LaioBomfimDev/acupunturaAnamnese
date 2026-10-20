// ============================================================
// Cor dos links enviados ao paciente (2026-10-01): confirmação de
// agendamento e pesquisa de satisfação vestiam a cor da tela do
// sistema (brand_color). Agora a administração escolhe, em Gestão →
// Personalizar, uma cor para cada link. Sem escolha, o link segue a cor
// do sistema; nunca a cor pessoal de quem mandou o link.
// ============================================================

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const srcDir = path.join(root, 'src');
const repoDir = path.resolve(root, '..');

let server;
let PersonalizarClinica;
let getClinicLinkColor;
let migration;

before(async () => {
  server = await createServer({
    root,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  });
  PersonalizarClinica = (await server.ssrLoadModule('/src/components/panels/PersonalizarClinica.jsx')).PersonalizarClinica;
  ({ getClinicLinkColor } = await server.ssrLoadModule('/src/utils/appointmentConfirmation.js'));
  migration = await readFile(path.join(repoDir, 'supabase/migrations/20261001_public_link_colors.sql'), 'utf8');
});

after(async () => {
  await server?.close();
});

function readRepo(file) {
  return readFile(path.join(repoDir, file), 'utf8');
}

test('cada link usa a própria cor; sem escolha segue a cor do sistema', () => {
  const clinic = { brand_color: '#8C4460', confirmation_link_color: '#2E5A7D', survey_link_color: null };
  assert.equal(getClinicLinkColor(clinic, 'confirmation'), '#2E5A7D');
  assert.equal(getClinicLinkColor(clinic, 'survey'), '#8C4460');
  assert.equal(getClinicLinkColor({ brand_color: '#8C4460' }, 'survey'), '#8C4460');
  assert.equal(getClinicLinkColor(null, 'confirmation'), '');
  // A cor pessoal da tela não entra na página do paciente.
  assert.equal(getClinicLinkColor({ brand_color: '#8C4460', accent_color: '#3F7D5C' }, 'survey'), '#8C4460');
});

test('Edge Functions leem a cor do próprio link, com a cor do sistema de reserva', async () => {
  const confirm = await readRepo('supabase/functions/confirm-appointment/index.ts');
  // agenda_settings (20/10/2026): só para saber se a sala online está ligada.
  assert.match(confirm, /clinics\(name,address,brand_color,confirmation_link_color,agenda_settings\)/);
  assert.match(confirm, /clinicColor:\s*appointment\.clinics\?\.confirmation_link_color \|\| appointment\.clinics\?\.brand_color \|\| null/);
  assert.doesNotMatch(confirm, /survey_link_color|accent_color/);

  const survey = await readRepo('supabase/functions/satisfaction-survey/index.ts');
  assert.match(survey, /\.select\('name,brand_color,survey_link_color'\)/);
  assert.match(survey, /clinicColor: clinic\?\.survey_link_color \|\| clinic\?\.brand_color \|\| null/);
  assert.doesNotMatch(survey, /confirmation_link_color|accent_color/);
});

test('páginas públicas vestem só a cor que a Edge Function devolve', async () => {
  for (const file of ['ConfirmAppointmentPage.jsx', 'SurveyPage.jsx']) {
    const source = await readFile(path.join(srcDir, file), 'utf8');
    assert.match(source, /clinicAccentStyle\((appointment|survey)\?\.clinicColor\)/, file);
    assert.doesNotMatch(source, /accent_color|brand_color|useAuth/, file);
  }
});

test('RPC só deixa o clinic_admin alterar as cores dos links da própria clínica', () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS confirmation_link_color TEXT/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS survey_link_color TEXT/);
  assert.match(migration, /CHECK \(confirmation_link_color IS NULL OR confirmation_link_color ~ '\^#\[0-9A-Fa-f\]\{6\}\$'\)/);
  assert.match(migration, /CHECK \(survey_link_color IS NULL OR survey_link_color ~ '\^#\[0-9A-Fa-f\]\{6\}\$'\)/);
  assert.match(migration, /SECURITY DEFINER\r?\nSET search_path = public/);
  assert.match(migration, /IF NOT public\.is_clinic_admin\(v_actor_id\) THEN/);
  assert.match(migration, /v_clinic UUID := public\.user_clinic_id\(auth\.uid\(\)\)/);
  assert.match(migration, /WHERE id = v_clinic;/);
  // Só as duas colunas dos links — nada de nome, CNPJ, logo ou cor da tela.
  const update = migration.match(/UPDATE public\.clinics\s+SET([\s\S]*?)WHERE/)[1];
  const columns = [...update.matchAll(/(\w+)\s*=/g)].map(match => match[1]).sort();
  assert.deepEqual(columns, ['confirmation_link_color', 'survey_link_color']);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.clinic_admin_update_link_colors\(TEXT, TEXT\) FROM PUBLIC, anon/);
  assert.doesNotMatch(migration, /CREATE POLICY/);
});

function renderPersonalizar(clinic) {
  return renderToStaticMarkup(React.createElement(PersonalizarClinica, { profile: { clinic } }));
}

// Trecho do cartão de um link, do título até o próximo bloco.
function linkSection(html, title) {
  const start = html.indexOf(`<h4>${title}<`);
  assert.ok(start >= 0, `sem o bloco ${title}`);
  const end = html.indexOf('</section>', start);
  return html.slice(start, end);
}

function checkedLabel(section) {
  return section.match(/aria-checked="true" aria-label="([^"]+)"/)?.[1] || null;
}

test('Personalizar mostra uma cor por link, marcada com o que o paciente vê hoje', () => {
  const html = renderPersonalizar({
    id: 'c1',
    name: 'Clínica Teste',
    brand_color: '#8C4460',
    confirmation_link_color: null,
    survey_link_color: '#2E5A7D',
  });
  assert.match(html, /Cor dos links enviados ao paciente/);

  const confirmation = linkSection(html, 'Confirmação de agendamento');
  assert.equal(checkedLabel(confirmation), 'Rosa vinho');
  assert.match(confirmation, /aria-label="Cor do link de confirmação de agendamento"/);
  assert.match(confirmation, /--link-accent:#8C4460/);
  assert.match(confirmation, /Confirmar presença/);

  const survey = linkSection(html, 'Pesquisa de satisfação');
  assert.equal(checkedLabel(survey), 'Azul');
  assert.match(survey, /--link-accent:#2E5A7D/);
  assert.match(survey, /Enviar avaliação/);
});

test('salvar grava as cores dos links pela RPC própria, sem depender da cor da tela', async () => {
  const source = await readFile(path.join(srcDir, 'components/panels/PersonalizarClinica.jsx'), 'utf8');
  assert.match(source, /updateClinicLinkColors\(\{\r?\n\s+confirmationColor: linkColors\.confirmation,\r?\n\s+surveyColor: linkColors\.survey,/);
  // Trocar a cor do sistema não arrasta junto o link que ainda a seguia.
  assert.match(source, /if \(linksDirty \|\| \(colorsDirty && linksFollowBrand\)\)/);
  assert.doesNotMatch(source, /accent_color/);

  const service = await readFile(path.join(srcDir, 'services/clinicService.js'), 'utf8');
  assert.match(service, /supabase\.rpc\('clinic_admin_update_link_colors'/);
  // Banco sem a migração: a clínica continua carregando, sem as cores dos links.
  assert.match(service, /if \(error && \/_link_color\/i\.test\(error\.message \|\| ''\)\)/);
});

// 10/10/2026: a Área do Paciente (formulários e escalas) entrou na mesma
// escolha. Sem escolha, segue a cor do sistema; nunca a cor pessoal.
test('Área do Paciente: cor própria, lida pela Edge Function, com a cor do sistema de reserva', async () => {
  const portalMigration = await readRepo('supabase/migrations/20261013_patient_portal_link_color.sql');
  assert.match(portalMigration, /ADD COLUMN IF NOT EXISTS portal_link_color TEXT/);
  assert.match(portalMigration, /CHECK \(portal_link_color IS NULL OR portal_link_color ~ '\^#\[0-9A-Fa-f\]\{6\}\$'\)/);
  assert.match(portalMigration, /p_portal_color TEXT DEFAULT NULL/, 'tela antiga continua chamando com duas cores');
  assert.match(portalMigration, /IF NOT public\.is_clinic_admin\(v_actor_id\) THEN/);
  assert.match(portalMigration, /SECURITY DEFINER\r?\nSET search_path = public/);
  const update = portalMigration.match(/UPDATE public\.clinics\s+SET([\s\S]*?)WHERE/)[1];
  const columns = [...update.matchAll(/(\w+)\s*=/g)].map(match => match[1]).sort();
  assert.deepEqual(columns, ['confirmation_link_color', 'portal_link_color', 'survey_link_color']);
  assert.match(portalMigration, /DROP FUNCTION IF EXISTS public\.clinic_admin_update_link_colors\(TEXT, TEXT\);/);
  assert.match(portalMigration, /REVOKE ALL ON FUNCTION public\.clinic_admin_update_link_colors\(TEXT, TEXT, TEXT\) FROM PUBLIC, anon/);

  const edge = await readRepo('supabase/functions/patient-portal/index.ts');
  assert.match(edge, /\.select\('name,brand_color,portal_link_color'\)/);
  assert.match(edge, /clinicColor: clinic\?\.portal_link_color \|\| clinic\?\.brand_color \|\| null/);
  assert.doesNotMatch(edge, /accent_color|confirmation_link_color|survey_link_color/);

  const page = await readFile(path.join(srcDir, 'PatientPortalPage.jsx'), 'utf8');
  assert.match(page, /clinicAccentStyle\(home\?\.clinicColor\)/);
  assert.doesNotMatch(page, /accent_color|brand_color|useAuth/);

  assert.equal(getClinicLinkColor({ brand_color: '#8C4460', portal_link_color: '#2E5A7D' }, 'portal'), '#2E5A7D');
  assert.equal(getClinicLinkColor({ brand_color: '#8C4460', portal_link_color: null }, 'portal'), '#8C4460');

  const service = await readFile(path.join(srcDir, 'services/clinicService.js'), 'utf8');
  assert.match(service, /p_portal_color: portalColor \|\| null/);
  assert.match(service, /survey_link_color,portal_link_color`\)/);
  assert.match(service, /if \(error && \/portal_link_color\/i\.test\(error\.message \|\| ''\)\)/, 'banco sem 20261013 não derruba a clínica');
  const source = await readFile(path.join(srcDir, 'components/panels/PersonalizarClinica.jsx'), 'utf8');
  assert.match(source, /surveyColor: linkColors\.survey,\r?\n\s+portalColor: linkColors\.portal,/);
  assert.match(source, /!clinic\?\.portal_link_color/, 'trocar a cor do sistema grava a da Área do Paciente que ainda a seguia');
});

test('Personalizar mostra a Área do Paciente ao lado dos outros links, com a lista e o "Responder"', () => {
  const html = renderToStaticMarkup(React.createElement(PersonalizarClinica, {
    profile: {
      clinic: {
        id: 'c1', name: 'Clínica Teste', brand_color: '#8C4460', confirmation_link_color: null, survey_link_color: null, portal_link_color: '#2E5A7D',
      },
    },
  }));
  const start = html.indexOf('<h4>Área do Paciente<small>formulários e escalas</small></h4>');
  assert.ok(start >= 0, 'sem o bloco da Área do Paciente');
  const portal = html.slice(start, html.indexOf('</section>', start));
  assert.equal(portal.match(/aria-checked="true" aria-label="([^"]+)"/)?.[1], 'Azul');
  assert.match(portal, /aria-label="Cor da Área do Paciente"/);
  assert.match(portal, /--link-accent:#2E5A7D/);
  assert.match(portal, /Questionário PHQ-9/);
  assert.match(portal, />Responder</);

  // Sem escolha gravada, marca a cor do sistema (o que o paciente vê hoje).
  const following = renderToStaticMarkup(React.createElement(PersonalizarClinica, {
    profile: { clinic: { id: 'c1', name: 'Clínica Teste', brand_color: '#8C4460' } },
  }));
  const startFollowing = following.indexOf('<h4>Área do Paciente');
  const section = following.slice(startFollowing, following.indexOf('</section>', startFollowing));
  assert.equal(section.match(/aria-checked="true" aria-label="([^"]+)"/)?.[1], 'Rosa vinho');
});
