// ============================================================
// Convênios, Fase 1 (31/10/2026; banco A + tela B). O que estes testes
// guardam:
// - CPF e CNPJ (alfanumérico desde 07/2026) conferidos pelo dígito;
// - os formatos da tela são os mesmos CHECKs do banco;
// - conselho, UF e códigos TUSS da tela batem com a carga oficial da
//   ANS (202607), sem lista escrita de memória;
// - a operadora mostra o que falta para faturar, na ordem do passo a
//   passo;
// - a equipe do cadastro só lê nome de operadora e plano, nunca preço,
//   credenciamento nem CPF de quem atende;
// - exclusão de paciente apaga o convênio do paciente e apaga a evolução
//   antes do agendamento (achado ao validar esta migration: com a ordem
//   antiga, a exclusão de quem tinha evolução parava no RESTRICT de
//   patient_evolutions.appointment_id).
// ============================================================

import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdir, readFile } from 'node:fs/promises';
import * as convenio from '../../src/utils/convenio.js';
import { CBO_BY_PROFESSION, COUNCIL_BY_PROFESSION, TISS_COUNCILS, TISS_UFS } from '../../src/data/tissDomains.js';
import { FINANCEIRO_HELP } from '../../src/data/screenHelp.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => readFile(path.join(root, file), 'utf8');
const MIGRATIONS = path.join(root, '../supabase/migrations');
const sql = await read('../supabase/migrations/20261031_convenios_fase1.sql');
const catalog = await read('../supabase/migrations/20261031b_tiss_terms_202607.sql');

function catalogRows(table) {
  return [...catalog.matchAll(new RegExp(`^ {2}\\('${table}', '([^']+)', '((?:[^']|'')+)'`, 'gm'))]
    .map(([, code, term]) => ({ code, term: term.replace(/''/g, "'") }));
}

// ---------- documentos ----------

test('CNPJ alfanumérico: exemplo da Receita passa, dígito errado não', () => {
  assert.equal(convenio.isValidCnpj('12.ABC.345/01DE-35'), true);
  assert.equal(convenio.isValidCnpj('12ABC34501DE36'), false);
  assert.equal(convenio.isValidCnpj('11.222.333/0001-81'), true, 'CNPJ só de números continua valendo');
  assert.equal(convenio.isValidCnpj('11111111111111'), false);
  assert.equal(convenio.normalizeCnpj('12.abc.345/01de-35'), '12ABC34501DE35');
  assert.equal(convenio.formatCnpj('12ABC34501DE35'), '12.ABC.345/01DE-35');
});

test('CPF confere os dois dígitos', () => {
  assert.equal(convenio.isValidCpf('529.982.247-25'), true);
  assert.equal(convenio.isValidCpf('529.982.247-24'), false);
  assert.equal(convenio.isValidCpf('111.111.111-11'), false);
  assert.equal(convenio.formatCpf('52998224725'), '529.982.247-25');
});

// ---------- banco × tela ----------

test('formatos da tela são os CHECKs do banco', () => {
  const pairs = [
    [convenio.ANS_PATTERN, "ans_registry ~ '^[0-9]{6}$'"],
    [convenio.CNES_PATTERN, "cnes ~ '^[0-9]{7}$'"],
    [convenio.CNS_PATTERN, "cns ~ '^[0-9]{15}$'"],
    [convenio.TUSS_PATTERN, "tuss_code ~ '^[0-9]{8}$'"],
    [convenio.OWN_CODE_PATTERN, "tuss_code ~ '^[A-Za-z0-9.-]{1,10}$'"],
    [convenio.PROVIDER_CODE_PATTERN, "provider_code ~ '^[A-Za-z0-9./-]{1,14}$'"],
    [convenio.COUNCIL_NUMBER_PATTERN, "council_number ~ '^[A-Za-z0-9./-]{1,15}$'"],
    [convenio.CARD_PATTERN, "card_number ~ '^[A-Za-z0-9./ -]{1,20}$'"],
  ];
  for (const [pattern, check] of pairs) {
    assert.ok(sql.includes(check), `banco tem ${check}`);
    const dbSource = check.match(/'(\^.*\$)'/)[1].replace(/\[0-9\]/g, '\\d');
    assert.equal(pattern.source, dbSource, `tela e banco iguais: ${check}`);
  }
  assert.match(sql, /cnpj ~ '\^\[A-Z0-9\]\{12\}\[0-9\]\{2\}\$'/, 'CNPJ alfanumérico no banco');
  assert.equal(convenio.CNES_NONE, '9999999');
});

test('conselho e UF da tela são as tabelas 26 e 59 oficiais', () => {
  const councils = catalogRows('26');
  assert.deepEqual(TISS_COUNCILS.map(row => [row.code, row.label]), councils.map(row => [row.code, row.term]));
  const ufs = catalogRows('59');
  assert.deepEqual(TISS_UFS.map(row => [row.code, row.label]), ufs.map(row => [row.code, row.term]));
  // Os CHECKs do banco aceitam exatamente esses códigos.
  for (const { code } of councils) assert.match(code, /^(0[1-9]|1[0-5])$/);
  for (const { code } of ufs) assert.match(code, /^([1-5][0-9]|98)$/);
});

test('sugestões por profissão usam códigos que existem na carga oficial', () => {
  const cbos = new Set(catalogRows('24').map(row => row.code));
  for (const code of Object.values(CBO_BY_PROFESSION)) assert.ok(cbos.has(code), `CBO ${code}`);
  const councils = new Set(TISS_COUNCILS.map(row => row.code));
  for (const code of Object.values(COUNCIL_BY_PROFESSION)) assert.ok(councils.has(code), `conselho ${code}`);
});

test('catálogo 202607 tem as tabelas da clínica e os procedimentos conferidos', () => {
  for (const table of ['22', '24', '26', '50', '59', '76']) {
    assert.ok(catalogRows(table).length > 0, `tabela ${table} carregada`);
  }
  assert.ok(catalogRows('22').length > 5000, 'tabela 22 inteira');
  const tuss = new Map(catalogRows('22').map(row => [row.code, row.term]));
  assert.equal(tuss.get('50000470'), 'Sessão de psicoterapia individual por psicólogo');
  assert.equal(tuss.get('31601014'), 'Acupuntura por sessão');
  assert.equal(tuss.get('50000560'), 'Consulta ambulatorial por nutricionista');
  assert.equal(tuss.get('50000144'), 'Consulta ambulatorial em fisioterapia');
  assert.match(catalog, /Não editar à mão/);
  assert.match(catalog, /ON CONFLICT ON CONSTRAINT tiss_terms_pkey/, 'carga repetível, sem ON CONFLICT ambíguo');
});

// ---------- o que falta para faturar ----------

const OP = { id: 'op1', name: 'Exemplo', ans_registry: '123456', cnpj: '12ABC34501DE35', active: true };

test('operadora pronta: ANS, CNPJ, código do prestador e todos os preços com código', () => {
  const ready = convenio.convenioReadiness({
    convenio: OP,
    credentials: [{ convenio_id: 'op1', active: true }],
    plans: [],
    prices: [{ convenio_id: 'op1', tuss_code: '50000470' }],
  });
  assert.equal(ready.ready, true);
  assert.equal(ready.missing, 0);
  assert.equal(ready.percent, 100);
  assert.deepEqual(ready.items.map(item => item.step), [1, 2, 3, 4], 'na ordem do passo a passo');
  assert.equal(ready.items.find(item => item.key === 'planos').optional, true, 'plano é opcional');
});

test('operadora pela metade diz o que falta, no plural certo', () => {
  const half = convenio.convenioReadiness({
    convenio: { ...OP, cnpj: null },
    credentials: [{ convenio_id: 'outra', active: true }, { convenio_id: 'op1', active: false }],
    plans: [],
    prices: [{ convenio_id: 'op1', tuss_code: '50000470' }, { convenio_id: 'op1', tuss_code: null }],
  });
  assert.equal(half.ready, false);
  assert.equal(half.missing, 3);
  assert.deepEqual(half.items.filter(item => !item.ok).map(item => item.label), [
    'Falta o CNPJ',
    'Falta o código do prestador',
    '1 de 2 preços sem código',
  ]);
  assert.equal(convenio.missingLabel(1), 'Falta 1 item');
  assert.equal(convenio.missingLabel(3), 'Faltam 3 itens');
  assert.equal(convenio.convenioReadiness({ convenio: { ...OP, active: false }, credentials: [{ convenio_id: 'op1' }], prices: [{ convenio_id: 'op1', tuss_code: '1' }] }).ready, false, 'desativada nunca está pronta');
});

test('dados de quem atende e carteira vencida', () => {
  assert.deepEqual(convenio.professionalBillingMissing(null), ['CPF', 'conselho', 'CBO']);
  assert.deepEqual(convenio.professionalBillingMissing({ cpf: '1', council_code: '09', council_number: '1', council_uf: '35', cbo_code: '251510' }), []);
  assert.equal(convenio.coverageExpired({ card_valid_until: '2026-10-30' }, '2026-10-31'), true);
  assert.equal(convenio.coverageExpired({ card_valid_until: '2026-10-31' }, '2026-10-31'), false, 'vence no fim do dia');
  assert.equal(convenio.procedureCodeLabel({ tuss_table: '00', tuss_code: 'NEURO-01' }), 'Própria NEURO-01');
  assert.equal(convenio.procedureCodeLabel({ tuss_table: '22', tuss_code: '50000470' }), 'TUSS 50000470');
});

test('Resumo: carregando e falha nunca viram zero', () => {
  const data = { members: [{ id: 'p', full_name: 'P', role: 'therapist', is_active: true, has_agenda: true, disciplines: ['psicologia'] }] };
  const loading = convenio.buildConvenioTiles({ data, conv: null, convError: '' });
  assert.equal(loading.tiles.solicitantes.line, 'carregando…');
  const failed = convenio.buildConvenioTiles({ data, conv: null, convError: 'falhou' });
  assert.equal(failed.tiles.operadoras.tone, 'warning');
  assert.doesNotMatch(JSON.stringify(failed), /"display":"0"/);
  const loaded = convenio.buildConvenioTiles({
    data,
    conv: { convenios: [OP], credentials: [], plans: [], prices: [], requesters: [], billing: [], clinic: null },
    convError: '',
  });
  assert.equal(loaded.tiles.operadoras.line, 'Falta · 0 de 1 operadora pronta');
  assert.equal(loaded.tiles.faturamento.line, 'Falta · 1 profissional incompleto');
});

// ---------- acesso ----------

test('equipe do cadastro lê operadora e plano; o resto é só da administração', () => {
  assert.match(sql, /CREATE POLICY clinic_convenios_registry_read ON public\.clinic_convenios\s+FOR SELECT/);
  assert.match(sql, /CREATE POLICY convenio_plans_registry_read ON public\.convenio_plans\s+FOR SELECT/);
  for (const table of ['convenio_credentials', 'tiss_requesters', 'professional_billing_info']) {
    const policies = [...sql.matchAll(new RegExp(`CREATE POLICY (\\w+) ON public\\.${table}\\s+FOR (\\w+) TO authenticated\\s+USING \\(([^)]*\\))`, 'g'))];
    assert.ok(policies.length > 0, `${table} tem política`);
    for (const [, name, , using] of policies) assert.match(using, /can_manage_finance/, `${name} só administração`);
  }
  // Convênio do paciente: quem edita o cadastro; nunca se apaga.
  assert.match(sql, /REVOKE ALL ON public\.patient_coverages FROM PUBLIC, anon, authenticated;\r?\nGRANT SELECT, INSERT, UPDATE ON public\.patient_coverages TO authenticated;/);
  assert.match(sql, /REVOKE ALL ON public\.tiss_terms FROM PUBLIC, anon, authenticated;\r?\nGRANT SELECT ON public\.tiss_terms TO authenticated;/);
});

test('a escolha do paciente lê só nome de operadora e plano', async () => {
  const service = await read('src/services/convenioService.js');
  const choices = service.match(/export async function listConvenioChoices\(\) \{[\s\S]*?\r?\n\}/)[0];
  assert.match(choices, /from\('clinic_convenios'\)\.select\('id,name,active'\)/);
  assert.match(choices, /from\('convenio_plans'\)\.select\('id,convenio_id,name,active'\)/);
  assert.doesNotMatch(choices, /convenio_procedure_prices|convenio_credentials/);
});

// ---------- exclusão de paciente ----------

test('exclusão: convênio do paciente sai, e a evolução sai antes do agendamento', async () => {
  const files = (await readdir(MIGRATIONS)).filter(name => name.endsWith('.sql')).sort();
  const sqls = await Promise.all(files.map(name => readFile(path.join(MIGRATIONS, name), 'utf8')));
  const latest = sqls.findLast(text => text.includes('FUNCTION public.admin_decide_patient_deletion('));
  const body = latest.match(/CREATE OR REPLACE FUNCTION public\.admin_decide_patient_deletion\([\s\S]*?\$admin_decide_patient_deletion\$;/)[0];
  const at = text => {
    const index = body.indexOf(text);
    assert.ok(index >= 0, text);
    return index;
  };
  assert.ok(at("'patient_coverages', (SELECT") < at('INSERT INTO patient_erasure_backup.snapshots'), 'convênio no snapshot');
  at('DELETE FROM public.patient_coverages WHERE patient_id = v_req.patient_id;');
  assert.ok(
    at('DELETE FROM public.patient_evolutions WHERE patient_id') < at('DELETE FROM public.appointments WHERE patient_id'),
    'patient_evolutions.appointment_id é RESTRICT: evolução sai antes do agendamento',
  );
});

// ---------- tela ----------

test('Financeiro ganha o grupo Convênios, com ajuda em cada parte', async () => {
  const screen = await read('src/components/financeiro/FinanceiroScreen.jsx');
  assert.match(screen, /\{ label: 'Convênios', ids: \['operadoras', 'solicitantes', 'faturamento'\] \}/);
  for (const id of ['operadoras', 'solicitantes', 'faturamento']) {
    assert.match(screen, new RegExp(`\\{ id: '${id}', label: '`), `${id} no menu`);
    assert.ok(FINANCEIRO_HELP[id]?.title && FINANCEIRO_HELP[id]?.summary, `${id} com "Como funciona"`);
  }
  // Convênios carregam à parte: falha ali não derruba o financeiro.
  assert.match(screen, /loadConvenioData\(profile\?\.clinic_id\)/);
  assert.match(screen, /setConvError\(/);
});

test('tela B: cartões com o que falta e passo a passo de quatro etapas', async () => {
  const source = await read('src/components/financeiro/FinanceConvenios.jsx');
  assert.match(source, /className=\{`fin-conv-card/);
  assert.match(source, /convenioReadiness\(/);
  const steps = source.match(/const STEPS = \[([\s\S]*?)\];/)[1];
  assert.deepEqual([...steps.matchAll(/label: '([^']+)'/g)].map(match => match[1]), ['Operadora', 'Credenciamento', 'Planos', 'Tabela de preços']);
  // Janela do passo a passo fecha como as outras do Financeiro.
  assert.match(source, /<DialogShell/);
  assert.match(source, /searchTussProcedures\(/, 'busca na tabela TUSS do banco, não em lista escrita à mão');
});

test('ficha do paciente usa o convênio novo; o texto livre saiu dos formulários', async () => {
  const profile = await read('src/components/ClinicPatientProfile.jsx');
  const form = await read('src/components/NewPatientForm.jsx');
  assert.match(profile, /<PatientCoverages patientId=\{patient\.id\}/);
  assert.doesNotMatch(profile, /setEditField\('convenioNome'/);
  assert.doesNotMatch(form, /convenioNome|convenioCarteirinha/);
  const coverages = await read('src/components/PatientCoverages.jsx');
  assert.doesNotMatch(coverages, /\.delete\(/, 'convênio do paciente desativa, não apaga');
});
