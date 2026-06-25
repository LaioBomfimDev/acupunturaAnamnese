import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let server;
let reportUtils;
let reportAiReview;
let clinicService;
let reportPanel;

before(async () => {
  server = await createServer({
    root,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  });
  reportUtils = await server.ssrLoadModule('/src/utils/reportUtils.js');
  reportAiReview = await server.ssrLoadModule('/src/utils/reportAiReview.js');
  clinicService = await server.ssrLoadModule('/src/services/clinicService.js');
  reportPanel = await server.ssrLoadModule('/src/components/panels/Relatorio.jsx');
});

after(async () => {
  await server?.close();
});

test('relatório conta avaliação inicial como primeiro encontro', () => {
  const { getReportSessionInfo } = reportUtils;

  assert.deepEqual(getReportSessionInfo([]), {
    registeredSessionCount: 0,
    reportSessionNumber: 0,
    label: 'Avaliação inicial',
  });

  assert.deepEqual(getReportSessionInfo([{ sessao: 1 }]), {
    registeredSessionCount: 1,
    reportSessionNumber: 2,
    label: '2ª sessão',
  });

  assert.deepEqual(getReportSessionInfo([{ sessao: 1 }, { sessao: 2 }]), {
    registeredSessionCount: 2,
    reportSessionNumber: 3,
    label: '3ª sessão',
  });
});

test('contador de evoluções usa pluralização pt-BR', () => {
  const { formatRegisteredSessionCount } = reportUtils;

  assert.equal(formatRegisteredSessionCount(0), '');
  assert.equal(formatRegisteredSessionCount(1), '1 sessão registrada');
  assert.equal(formatRegisteredSessionCount(2), '2 sessões registradas');
});

test('contato do PDF usa somente telefone e endereço nessa ordem', () => {
  const { buildReportContactItems } = reportUtils;
  const items = buildReportContactItems({
    clinic: {
      phone: '  (11) 99999-0000  ',
      address: 'Rua das Flores, 123',
      email: 'contato@clinica.com',
    },
    therapistProfile: {
      phone: '(11) 98888-0000',
    },
  });

  assert.deepEqual(items, [
    { id: 'phone', label: 'Telefone', value: '(11) 99999-0000' },
    { id: 'address', label: 'Endereço', value: 'Rua das Flores, 123' },
  ]);
});

test('contato do PDF usa telefone do profissional como fallback', () => {
  const { buildReportContactItems } = reportUtils;
  const items = buildReportContactItems({
    clinic: { address: '' },
    therapistProfile: { phone: '(21) 97777-0000' },
  });

  assert.deepEqual(items, [
    { id: 'phone', label: 'Telefone', value: '(21) 97777-0000' },
    { id: 'address', label: 'Endereço', value: 'Endereço não informado' },
  ]);
});

test('paleta do timbrado deriva sombra a partir de uma única cor da clínica', () => {
  const { buildReportAccentPalette } = reportUtils;

  assert.deepEqual(buildReportAccentPalette('#00A65A'), {
    accent: '#00A65A',
    shade: '#006E3B',
    soft: '#6BCB9F',
  });

  assert.deepEqual(buildReportAccentPalette('invalid', '#0E2A4A'), {
    accent: '#0E2A4A',
    shade: '#091C31',
    soft: '#738396',
  });
});

test('fallback local de clínicas só aceita erro de schema ausente', () => {
  const { isMissingClinicSchemaError } = clinicService;

  assert.equal(isMissingClinicSchemaError({ code: '42P01', message: 'relation "clinics" does not exist' }), true);
  assert.equal(isMissingClinicSchemaError({ message: "Could not find the 'clinic_id' column in the schema cache" }), true);
  assert.equal(isMissingClinicSchemaError({ message: 'new row violates row-level security policy for table "clinics"' }), false);
});

test('relatório avisa quando RLS impede carregar dados institucionais da clínica', () => {
  const { Relatorio } = reportPanel;
  const html = renderToStaticMarkup(React.createElement(Relatorio, {
    state: { evolucoes: [] },
    analysis: {
      main: '',
      detail: {},
      protocol: {},
      safety: [],
      safetyAlerts: [],
    },
    selectedPatient: { name: 'Paciente Teste' },
    therapistProfile: {
      full_name: 'Profissional Teste',
      clinic_name: 'Clínica do Perfil',
      clinicLoadError: 'permission denied for table clinics',
    },
  }));

  assert.match(html, /dados institucionais da clínica não puderam ser carregados/i);
  assert.doesNotMatch(html, /permission denied/i);
});

test('rascunho de IA exige confirmação de revisão antes de imprimir', () => {
  const { isAiDraftPendingReview } = reportAiReview;

  assert.equal(isAiDraftPendingReview({ aiDraft: true }), true);
  assert.equal(isAiDraftPendingReview({ aiDraft: true, aiReviewedAt: '2026-06-23T10:00:00.000Z' }), false);
  assert.equal(isAiDraftPendingReview({ aiDraft: false }), false);
});
