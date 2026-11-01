// ============================================================
// ABA, segunda etapa (31/10/2026): fidelidade, concordância (IOA) e
// alertas — contrato entre tela e banco (20261101c_aba_qualidade.sql).
//   * códigos de fidelidade, métodos de IOA e tipos de alerta da tela são
//     os mesmos do banco (mudar um lado só faria o banco recusar);
//   * a prévia do IOA na tela faz a mesma conta de aba_ioa_agreement;
//   * tabelas novas fechadas, RPCs com gate, telas ligadas no workspace.
// O comportamento do SQL (permissões, regras de alerta, critério igual
// ao da tela) foi validado em PGlite com pgcrypto antes de aplicar.
// ============================================================

import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import {
  ALERT_TYPES,
  FIDELITY_SOURCES,
  IOA_METHODS,
  countOpenAlerts,
  fidelityDraft,
  fidelityScore,
  ioaAgreement,
  summarizeFidelity,
  summarizeIoa,
} from '../../src/utils/aba/quality.js';
import { alertFromDb, fidelityFromDb, ioaFromDb, patientDataFromDb } from '../../src/utils/aba/mapping.js';
import { ABA_HELP } from '../../src/data/screenHelp.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = rel => readFile(path.resolve(root, rel), 'utf8');
const MIGRATION = '../supabase/migrations/20261101c_aba_qualidade.sql';
const sorted = values => [...values].sort();

function checkValues(sql, table, column) {
  const body = sql.match(new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table} \\(([\\s\\S]*?)\\r?\\n\\);`))?.[1];
  assert.ok(body, `tabela ${table}`);
  const list = body.match(new RegExp(`${column}\\s+IN\\s+\\(([^)]*)\\)`))?.[1];
  assert.ok(list, `CHECK de ${table}.${column}`);
  return sorted([...list.matchAll(/'([^']+)'/g)].map(match => match[1]));
}

test('códigos da tela = banco (fidelidade, IOA, alertas)', async () => {
  const sql = await read(MIGRATION);
  for (const [source, config] of Object.entries(FIDELITY_SOURCES)) {
    const list = sql.match(new RegExp(`WHEN '${source}' THEN ARRAY\\[([^\\]]*)\\]`))?.[1];
    assert.ok(list, `aba_fidelity_keys('${source}')`);
    assert.deepEqual([...list.matchAll(/'([^']+)'/g)].map(match => match[1]), config.items.map(item => item.key), source);
  }
  assert.deepEqual(checkValues(sql, 'aba_session_fidelity', 'source'), sorted(Object.keys(FIDELITY_SOURCES)));
  assert.deepEqual(checkValues(sql, 'aba_ioa_records', 'method'), sorted(IOA_METHODS.map(method => method.value)));
  assert.deepEqual(checkValues(sql, 'aba_alerts', 'type'), sorted(Object.keys(ALERT_TYPES)));
  for (const type of Object.keys(ALERT_TYPES)) {
    assert.ok(sql.includes(`'${type}:' ||`), `regra que gera ${type}`);
  }
});

test('prévia do IOA = aba_ioa_agreement', () => {
  assert.deepEqual(ioaAgreement('tentativa_por_tentativa', 9, 10), { value: 90 });
  assert.deepEqual(ioaAgreement('intervalo_por_intervalo', '2', '3'), { value: 66.67 });
  assert.deepEqual(ioaAgreement('contagem_total', 4, 5), { value: 80 });
  assert.deepEqual(ioaAgreement('contagem_total', 5, 4), { value: 80 }, 'menor ÷ maior, em qualquer ordem');
  assert.deepEqual(ioaAgreement('duracao_latencia', 0, 0), { value: 100 }, 'zero e zero concordam');
  assert.match(ioaAgreement('tentativa_por_tentativa', 11, 10).error, /não podem passar/);
  assert.match(ioaAgreement('intervalo_por_intervalo', 0, 0).error, /oportunidades/);
  assert.match(ioaAgreement('contagem_total', '', 3).error, /dois valores/);
  assert.match(ioaAgreement('contagem_total', -1, 3).error, /dois valores/);
});

test('mesmas frases de erro na tela e no banco', async () => {
  const sql = await read(MIGRATION);
  const screenErrors = [
    ioaAgreement('contagem_total', '', 1).error,
    ioaAgreement('tentativa_por_tentativa', 1, 0).error,
    ioaAgreement('tentativa_por_tentativa', 2, 1).error,
  ];
  for (const message of [
    'Informe os dois valores (zero ou mais).',
    'Informe quantas oportunidades houve (mais que zero).',
    'Os acordos não podem passar das oportunidades.',
  ]) {
    assert.ok(sql.includes(message), message);
    assert.ok(screenErrors.includes(message), message);
  }
});

test('fidelidade: rascunho, nota e não aplicável', () => {
  const draft = fidelityDraft('autoavaliacao');
  assert.equal(draft.length, 5);
  assert.ok(draft.every(item => item.applicable && !item.met));
  assert.deepEqual(fidelityScore(draft), { applicable: 5, met: 0, percentage: 0 });

  const saved = { items: [{ key: 'preparo', met: true, applicable: true }, { key: 'assentimento', met: true, applicable: false }] };
  const reopened = fidelityDraft('autoavaliacao', saved);
  assert.equal(reopened.find(item => item.key === 'preparo').met, true);
  assert.equal(reopened.find(item => item.key === 'assentimento').met, false, 'não aplicável nunca volta cumprido');
  assert.deepEqual(fidelityScore(reopened), { applicable: 4, met: 1, percentage: 25 });
  assert.equal(fidelityScore(reopened.map(item => ({ ...item, applicable: false }))).percentage, null);
});

test('resumos e contagem de alertas', () => {
  const fidelity = [
    { source: 'supervisao', scorePercentage: 60 },
    { source: 'supervisao', scorePercentage: 100 },
    { source: 'autoavaliacao', scorePercentage: 75 },
  ];
  assert.deepEqual(summarizeFidelity(fidelity), {
    selfMean: 75, supervisionMean: 80, selfCount: 1, supervisionCount: 2, belowMinimum: 1,
  });
  assert.deepEqual(summarizeIoa([{ agreementPercentage: 90 }, { agreementPercentage: 70 }]), { count: 2, mean: 80, belowMinimum: 1 });
  assert.deepEqual(summarizeIoa([]), { count: 0, mean: null, belowMinimum: 0 });
  const counts = countOpenAlerts([
    { status: 'open', priority: 'critica' },
    { status: 'open', priority: 'alta' },
    { status: 'dismissed', priority: 'alta' },
  ]);
  assert.deepEqual(counts, { total: 2, critica: 1, alta: 1, media: 0, baixa: 0 });
});

test('mapeamento das linhas novas', () => {
  const fidelity = fidelityFromDb({ id: 'f', session_id: 's', source: 'supervisao', score_percentage: '66.67', items: [], revision: 2, notes: null });
  assert.equal(fidelity.scorePercentage, 66.67);
  assert.equal(fidelity.notes, '');
  const ioa = ioaFromDb({ id: 'i', method: 'contagem_total', primary_value: '4', secondary_value: '5', agreement_percentage: '80.00', observed_on: '2026-10-30' });
  assert.equal(ioa.agreementPercentage, 80);
  assert.equal(ioa.programId, '');
  const alert = alertFromDb({ id: 'a', patient_id: 'p', type: 'criterio_atingido', priority: 'alta', status: 'open', revision: 3, can_manage: true });
  assert.equal(alert.revision, 3);
  assert.equal(alert.canManage, true);
  const data = patientDataFromDb({ patient_id: 'p' }, { fidelity: [{ id: 'f', source: 'autoavaliacao' }], ioa: [] });
  assert.equal(data.fidelity.length, 1);
  assert.deepEqual(patientDataFromDb({ patient_id: 'p' }).ioa, [], 'banco sem a segunda etapa: listas vazias');
});

test('tabelas novas fechadas e RPCs com gate', async () => {
  const sql = await read(MIGRATION);
  for (const table of ['aba_session_fidelity', 'aba_ioa_records', 'aba_alerts', 'aba_alert_refreshes']) {
    assert.ok(sql.includes(`'${table}'`), `${table} na trava de RLS/REVOKE`);
  }
  assert.doesNotMatch(sql, /CREATE POLICY/i, 'sem policy: só RPC');
  for (const fn of ['aba_save_fidelity', 'aba_save_ioa', 'aba_get_patient_quality', 'aba_refresh_alerts', 'aba_list_alerts', 'aba_manage_alert']) {
    const body = sql.match(new RegExp(`FUNCTION public\\.${fn}\\([\\s\\S]*?\\$${fn}\\$;`))?.[0];
    assert.ok(body, fn);
    assert.match(body, /SECURITY DEFINER/);
    assert.match(body, /SET search_path = pg_catalog/);
    assert.match(body, /aba_require_(gate|patient)\(/, `${fn} passa pelo gate`);
    assert.match(sql, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\(`), `${fn} liberada para logado`);
  }
  for (const internal of ['aba_num', 'aba_prompt_rank', 'aba_ioa_agreement', 'aba_fidelity_keys', 'aba_fidelity_json', 'aba_ioa_json']) {
    assert.doesNotMatch(sql, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${internal}\\(`), `${internal} é interna`);
  }
  assert.match(sql, /notes_encrypted BYTEA/, 'observação cifrada');
  assert.match(sql, /decision_note_encrypted BYTEA/, 'motivo da dispensa cifrado');
});

test('telas novas ligadas no workspace, no menu e na ajuda', async () => {
  const workspace = await read('src/components/AbaWorkspace.jsx');
  assert.match(workspace, /QUALIDADE: 'Qualidade'/);
  assert.match(workspace, /ALERTAS: 'Alertas'/);
  assert.match(workspace, /TABS_WITHOUT_PATIENT = \[[^\]]*TABS\.ALERTAS/);
  const sidebar = await read('src/components/Sidebar.jsx');
  for (const tab of ['Qualidade', 'Alertas']) assert.match(sidebar, new RegExp(`'${tab}': \\(`), `ícone de ${tab}`);
  assert.ok(ABA_HELP.qualidade && ABA_HELP.alertas, 'ajuda das telas novas');
  for (const type of Object.values(ALERT_TYPES)) {
    assert.ok(workspace.includes(`: '${type.tab}',`), `alerta abre em ${type.tab}, que é uma aba da área`);
  }
  const service = await read('src/services/abaService.js');
  assert.match(service, /isMissingAbaSchema\(error\)\) return null/, 'banco sem a etapa 2 não derruba a área');
});
