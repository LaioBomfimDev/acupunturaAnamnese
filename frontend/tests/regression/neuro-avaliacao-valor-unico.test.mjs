// Avaliação neuropsicológica com valor único (10/11/2026, caminho A).
// Banco: 20261110_neuro_avaliacao_valor_unico.sql; tela: Valores (cartão
// da Neuropsicologia) e Entradas → Pacotes ("Liberar sessões").
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdir, readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { packageSessionLabel, packageShare } from '../../src/utils/finance.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => readFile(path.join(root, file), 'utf8');
const MIGRATION = '20261110_neuro_avaliacao_valor_unico.sql';
const sql = await read(`../supabase/migrations/${MIGRATION}`);
const previous = await read('../supabase/migrations/20261102_agenda_convenio.sql');

function sqlFunction(source, name) {
  const match = source.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\r?\\n\\$\\$;`));
  assert.ok(match, `função ${name} existe`);
  return match[0];
}
const codeLines = text => text.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('--'));

test('cobrança parte da última versão (20261102); depois dela, só o valor combinado', async () => {
  const dir = path.join(root, '../supabase/migrations');
  const files = (await readdir(dir)).filter(name => name.endsWith('.sql')).sort();
  const recreating = [];
  for (const name of files) {
    if (/CREATE OR REPLACE FUNCTION public\.finance_charge_appointment\(/.test(await readFile(path.join(dir, name), 'utf8'))) recreating.push(name);
  }
  // 11/11/2026: o valor combinado por paciente recria depois desta,
  // mudando só as linhas do valor (valor-combinado-paciente.test.mjs
  // compara as duas e não deixa passar mais nada).
  assert.deepEqual(recreating.slice(-2), [MIGRATION, '20261111b_valor_combinado_paciente.sql']);
  const current = new Set(codeLines(sqlFunction(sql, 'finance_charge_appointment')));
  // Só mudam: o IF FOUND do pacote (agora v_found) e a regra de fechar.
  const changed = new Set(['IF FOUND THEN', "IF v_package_id IS NOT NULL AND v_package.kind = 'counted' AND v_session >= v_package.sessions_planned THEN"]);
  for (const line of codeLines(sqlFunction(previous, 'finance_charge_appointment'))) {
    if (changed.has(line)) continue;
    assert.ok(current.has(line), `linha da versão anterior sumiu: ${line}`);
  }
});

test('banco: avaliação abre sozinha, cobra tudo no primeiro, fecha na devolutiva', () => {
  const body = sqlFunction(sql, 'finance_charge_appointment');
  assert.match(body, /IF NOT v_found AND v_appt\.discipline = 'neuropsicologia' THEN/);
  assert.match(body, /finance_resolve_price\(v_appt\.clinic_id, 'neuropsicologia', NULL, v_appt\.professional_id\)/, 'valor = linha padrão da Neuropsicologia');
  assert.match(body, /IF v_assessment_price > 0 THEN/, 'sem valor, nada muda');
  assert.match(body, /PERFORM 1 FROM public\.patients WHERE id = v_appt\.patient_id FOR UPDATE;/, 'uma avaliação por vez');
  assert.match(body, /'assessment',\r?\n\s+v_settings\.neuro_sessions_included \+ 2, v_assessment_price, '\{\}'::TEXT\[\], 'per_session', 1,\r?\n\s+'free', v_day,/);
  assert.match(body, /c\.service_on BETWEEN v_day - 90 AND v_day\r?\n\s+\) THEN v_assessment_price ELSE 0 END,/, 'transição com desconto total');
  assert.match(body, /WHEN v_package\.kind = 'assessment' THEN v_remaining/);
  assert.match(body, /OR \(v_package\.kind = 'assessment' AND v_appt\.appointment_type = 'feedback'\)/);
  assert.match(body, /v_appt\.billing_type = 'convenio'/, 'convênio continua antes do pacote');
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.finance_charge_appointment\(UUID\) FROM PUBLIC, anon, authenticated;/);
});

test('banco: liberadas só pela administração, de 1 a 98; "Liberar sessões" aceita a avaliação', () => {
  assert.match(sql, /ADD COLUMN IF NOT EXISTS neuro_sessions_included INTEGER NOT NULL DEFAULT 10;/);
  assert.match(sql, /CHECK \(neuro_sessions_included BETWEEN 1 AND 98\)/);
  assert.match(sql, /CHECK \(kind IN \('counted', 'closed', 'assessment'\)\)/);
  assert.ok(sql.includes("pg_get_constraintdef(c.oid) LIKE '%''counted''%'"), 'trava antiga sai pelo conteúdo');
  const set = sqlFunction(sql, 'finance_set_neuro_sessions');
  assert.match(set, /v_clinic UUID := public\.finance_require_admin\(\);/);
  assert.match(set, /p_sessions < 1 OR p_sessions > 98/);
  const plan = sqlFunction(sql, 'finance_update_package_plan');
  assert.match(plan, /v_pkg\.kind NOT IN \('closed', 'assessment'\)/);
  assert.match(plan, /p_sessions_planned < GREATEST\(v_done, 1\)/, 'não libera menos do que já foi feito');
});

test('espelho: packageShare cobra a avaliação inteira no primeiro atendimento', () => {
  const pkg = { totalCents: 300000, planned: 12, kind: 'assessment' };
  assert.equal(packageShare({ ...pkg, usedCents: 0, done: 0 }), 300000);
  assert.equal(packageShare({ ...pkg, usedCents: 300000, done: 1 }), 0);
  assert.equal(packageShare({ ...pkg, usedCents: 300000, done: 12 }), 0, 'passou das liberadas: não cobra');
  assert.equal(packageShare({ ...pkg, discountCents: 300000, usedCents: 0, done: 0 }), 0, 'transição: desconto total');
  assert.equal(packageShare({ totalCents: 30000, usedCents: 0, done: 0, planned: 3 }), 10000, 'valor fechado segue dividindo');
});

test('Agenda: a linha da avaliação fala em atendimentos liberados', () => {
  const base = { name: 'Avaliação neuropsicológica', kind: 'assessment', planned: 12 };
  assert.equal(packageSessionLabel({ ...base, session: 3, done: 3 }), 'Avaliação neuropsicológica: atendimento 3 de 12 liberados');
  assert.match(packageSessionLabel({ ...base, session: 13, done: 13 }), /passou dos 12 liberados, sem cobrança/);
  assert.equal(packageSessionLabel({ ...base, session: null, done: 4 }), 'Avaliação neuropsicológica: 4 de 12 atendimentos liberados já feitos');
});

test('validação em transação cobre os cenários da avaliação', async () => {
  const scenarios = await read('../supabase/validation/20261110_neuro_avaliacao_scenarios.sql');
  assert.match(scenarios, /^BEGIN;\r?$/m);
  assert.match(scenarios, /^ROLLBACK;\r?$/m);
  for (const piece of ['cenário 3', 'cenário 4', 'cenário 5', 'cenário 6', 'cenário 7', 'cenário 8', 'cenário 9', 'cenário 10']) {
    assert.ok(scenarios.includes(piece), `validação sem ${piece}`);
  }
});

let server;
let config;
let entradas;
before(async () => {
  server = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' });
  config = await server.ssrLoadModule('/src/components/financeiro/FinanceConfig.jsx');
  entradas = await server.ssrLoadModule('/src/components/financeiro/FinanceEntradas.jsx');
});
after(async () => { await server?.close(); });

test('tela Valores: avaliação editável e sessões liberadas da instituição', () => {
  const fin = { data: { prices: [], members: [], settings: { neuro_sessions_included: 7 } } };
  const html = renderToStaticMarkup(React.createElement(config.ValoresConfig, { fin }));
  assert.match(html, /aria-label="Valor da avaliação completa, Neuropsicologia"/);
  assert.doesNotMatch(html, /aria-label="Valor da avaliação completa, Neuropsicologia"[^>]*disabled=""/);
  assert.match(html, /id="fin-neuro-sessions-inst"[^>]*value="7"/);
  assert.match(html, /Liberar sessões/);
});

test('Pacotes: avaliação mostra atendimentos liberados e "Liberar sessões"', () => {
  const pkg = {
    id: 'pk1', patient_id: 'p1', discipline: 'neuropsicologia', name: 'Avaliação neuropsicológica', kind: 'assessment',
    sessions_planned: 12, total_cents: 300000, discount_cents: 0, payment_plan: 'per_session', installments: 1,
    status: 'active', sold_on: '2026-11-01', professional_id: null,
  };
  const fin = {
    data: {
      packages: [pkg], charges: [{ id: 'c1', package_id: 'pk1', source: 'appointment', price_cents: 300000 }],
      receipts: [], patients: [{ id: 'p1', name: 'Paciente' }], members: [], installments: [],
    },
    patientsById: new Map([['p1', { id: 'p1', name: 'Paciente' }]]),
    membersById: new Map(),
    open: () => {}, notify: () => {}, reload: () => {},
  };
  const html = renderToStaticMarkup(React.createElement(entradas.Pacotes, { fin }));
  assert.match(html, /1 de 12 liberados/);
  assert.match(html, /anamnese \+ 10 sessões \+ devolutiva/);
  assert.match(html, />Liberar sessões</);
  assert.match(html, />Encerrar avaliação</);
});
