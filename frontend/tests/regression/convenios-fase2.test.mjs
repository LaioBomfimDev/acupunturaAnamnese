// ============================================================
// Convênios, Fase 2 (03/11/2026; banco A + tela A): guia SP/SADT, lote
// XML TISS 4.03.00, pagamento da operadora e glosa. O que estes testes
// guardam:
// - o XML que a tela monta (utils/tissXml.js) é o mesmo que o banco gera
//   (fixture tirada de supabase/validation/20261103_convenios_fase2_scenarios.sql
//   rodado num Postgres de verdade) e passa no XSD oficial da ANS;
// - o hash do epílogo bate nas duas leituras do manual (UTF-8 e
//   ISO-8859-1), porque o texto vai só em ASCII;
// - o texto sem acento, as situações da guia, o que falta e os tipos de
//   atendimento são os mesmos dos dois lados;
// - convênio não "atrasa" antes do lote enviado + prazo da operadora, e o
//   dinheiro da operadora tira do "A receber"; glosa não tira;
// - os XSD guardados são os da ANS (SHA-256 da proveniência);
// - erro achado na auditoria de 03/11/2026: Atendido que muda de dia,
//   profissional, área ou tipo deixava a cobrança com os dados velhos.
// ============================================================

import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import * as tiss from '../../src/utils/tissXml.js';
import { buildReceivables } from '../../src/utils/finance.js';
import { FINANCEIRO_HELP } from '../../src/data/screenHelp.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => readFile(path.join(root, file), 'utf8');
const sql = await read('../supabase/migrations/20261103_convenios_fase2.sql');
const scenarios = await read('../supabase/validation/20261103_convenios_fase2_scenarios.sql');
const fixture = JSON.parse(await read('tests/fixtures/tiss/lote-fase2.json'));
const XSD_DIR = path.join(root, '../supabase/tiss/4.03.00');

function functionBody(source, name) {
  const start = source.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  assert.ok(start >= 0, `função ${name} não achada`);
  const open = source.indexOf('AS $$', start);
  const close = source.indexOf('$$;', open + 5);
  return source.slice(open + 5, close);
}

function hasXmllint() {
  try {
    execFileSync('xmllint', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function validateWithXsd(xml) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'tiss-'));
  const file = path.join(dir, 'lote.xml');
  await writeFile(file, xml, 'latin1');
  return execFileSync('xmllint', ['--noout', '--schema', path.join(XSD_DIR, 'tissV4_03_00.xsd'), file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

// ---------- XML: banco × tela × XSD ----------

test('XML da tela é igual ao do banco, byte a byte', () => {
  const built = tiss.buildBatchXml(fixture.batch, fixture.guides, fixture.batch.xml_hash);
  assert.equal(built, fixture.xml);
});

test('hash do epílogo: MD5 do texto das folhas, igual em UTF-8 e ISO-8859-1', () => {
  const text = tiss.tissLeafText(fixture.xml);
  assert.ok(text.length > 100, 'texto das folhas vazio');
  assert.ok(!text.includes(fixture.batch.xml_hash), 'o próprio hash não entra na conta');
  assert.equal(createHash('md5').update(text, 'utf8').digest('hex'), fixture.batch.xml_hash);
  assert.equal(createHash('md5').update(text, 'latin1').digest('hex'), fixture.batch.xml_hash);
  assert.ok(/^[ -~]*$/.test(fixture.xml), 'XML com caractere fora do ASCII imprimível');
});

test('XML passa no XSD oficial 4.03.00 da ANS', { skip: !hasXmllint() && 'xmllint não instalado' }, async () => {
  await validateWithXsd(fixture.xml);
  // Guia sem autorização e sem horário (opcionais somem do XML).
  const guides = fixture.guides.map(guide => ({
    ...guide, authorized_on: null, password: null, operator_guide_number: null, password_valid_until: null,
    requested_on: null, clinical_indication: null, notes: null,
    items: guide.items.map(item => ({ ...item, start_time: null, end_time: null })),
  }));
  const xml = tiss.buildBatchXml(fixture.batch, guides, '0'.repeat(32));
  await validateWithXsd(xml);
  // E com executante por CPF e origem por CNPJ.
  const other = tiss.buildBatchXml({ ...fixture.batch, origin_kind: 'cnpj', origin_value: '11222333000181' },
    fixture.guides.map(guide => ({ ...guide, contractor_kind: 'cnpj', contractor_value: '11222333000181',
      items: guide.items.map(item => ({ ...item, executor_kind: 'cpf', executor_value: '52998224725' })) })), 'a'.repeat(32));
  await validateWithXsd(other);
});

test('XSD guardados são os da ANS (SHA-256 da proveniência)', async () => {
  const provenance = await readFile(path.join(XSD_DIR, 'PROVENIENCIA.md'), 'utf8');
  const rows = [...provenance.matchAll(/^\| (\S+\.xsd) \| ([0-9a-f]{64}) \|\r?$/gm)];
  assert.equal(rows.length, 7, 'sete XSD na tabela da proveniência');
  for (const [, file, sha] of rows) {
    const bytes = await readFile(path.join(XSD_DIR, file));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), sha, file);
  }
});

test('XSD confirma o que o modelo assume: até 100 guias, vários procedimentos com data', async () => {
  const guias = await readFile(path.join(XSD_DIR, 'tissGuiasV4_03_00.xsd'), 'latin1');
  const complex = await readFile(path.join(XSD_DIR, 'tissComplexTypesV4_03_00.xsd'), 'latin1');
  assert.match(guias, /name="guiaSP-SADT" type="ans:ctm_sp-sadtGuia" maxOccurs="100"/);
  assert.equal(tiss.TISS_MAX_GUIDES_PER_BATCH, 100);
  assert.match(guias, /name="procedimentoExecutado" type="ans:ct_procedimentoExecutadoSadt" maxOccurs="unbounded"/);
  assert.match(complex, /name="ct_procedimentoExecutadoSadt">\s*\r?\n\s*<sequence>\s*\r?\n\s*<element name="sequencialItem"[^>]*\/>\s*\r?\n\s*<element name="dataExecucao"/);
  // Senha e número da guia da operadora opcionais.
  assert.match(complex, /<element name="senha" type="ans:st_texto20" minOccurs="0"\/>/);
});

// ---------- espelhos ----------

test('texto sem acento: o mesmo mapa nos dois lados', () => {
  const body = functionBody(sql, 'tiss_ascii');
  const [from, to] = [...body.matchAll(/'([^']{20,})'/g)].map(match => match[1]);
  assert.equal(tiss.tissText(from, 200), tiss.tissText(to, 200));
  assert.equal(tiss.tissText('Clínica Fase Dois & Cia Ltda', 70), 'Clinica Fase Dois Cia Ltda');
  assert.equal(tiss.tissText('  São   Joãoº  ', 70), 'Sao Joao');
  assert.equal(tiss.tissText('abcdef', 3), 'abc');
  assert.equal(tiss.tissText('   ', 10), null);
  assert.equal(tiss.tissMoney(9200), '92.00');
  assert.equal(tiss.tissMoney(5), '0.05');
});

test('o que falta e os avisos: as mesmas chaves no banco e na tela', () => {
  const body = functionBody(sql, 'tiss_guide_snapshot');
  const missing = new Set([...body.matchAll(/array_append\(v_missing, '([a-z_]+)'\)/g)].map(match => match[1]));
  const warnings = new Set([...body.matchAll(/array_append\(v_warnings, '([a-z_]+)'\)/g)].map(match => match[1]));
  assert.deepEqual([...missing].sort(), Object.keys(tiss.TISS_MISSING_LABELS).sort());
  assert.deepEqual([...warnings].sort(), Object.keys(tiss.TISS_WARNING_LABELS).sort());
});

test('tipos de atendimento, acidente e formas de pagamento: os mesmos CHECKs', () => {
  const attendance = sql.match(/tiss_guides_attendance_check CHECK \(attendance_type IN \(([^)]+)\)\)/)[1];
  assert.deepEqual(attendance.match(/'(\d+)'/g).map(code => code.slice(1, -1)).sort(), tiss.ATTENDANCE_TYPES.map(row => row.id).sort());
  const accident = sql.match(/tiss_guides_accident_check CHECK \(accident_code IN \(([^)]+)\)\)/)[1];
  assert.deepEqual(accident.match(/'(\d)'/g).map(code => code.slice(1, -1)).sort(), tiss.ACCIDENT_CODES.map(row => row.id).sort());
  const methods = sql.match(/method TEXT NOT NULL CHECK \(method IN \(([^)]+)\)\)/)[1];
  assert.deepEqual(methods.match(/'([a-z]+)'/g).map(code => code.slice(1, -1)).sort(), tiss.CONVENIO_PAYMENT_METHODS.map(row => row.id).sort());
  const statuses = sql.match(/tiss_guides_status_check CHECK \(status IN \(([^)]+)\)\)/)[1];
  assert.deepEqual(statuses.match(/'([a-z]+)'/g).map(code => code.slice(1, -1)).sort(), Object.keys(tiss.GUIDE_STATUS).sort());
});

test('situação da guia: a mesma ordem de decisão do banco', () => {
  const body = functionBody(sql, 'tiss_refresh_guide_status');
  const order = [...body.matchAll(/THEN '([a-z]+)'/g)].map(match => match[1]);
  assert.deepEqual(order, ['paid', 'appeal', 'glosa']);
  assert.equal(tiss.guideStatusFrom({ inBatch: false, totalCents: 9200 }), 'open');
  assert.equal(tiss.guideStatusFrom({ inBatch: true, totalCents: 9200 }), 'batched');
  assert.equal(tiss.guideStatusFrom({ inBatch: true, totalCents: 9200, paidCents: 5000, glosaCents: 4200 }), 'glosa');
  assert.equal(tiss.guideStatusFrom({ inBatch: true, totalCents: 9200, paidCents: 5000, glosaCents: 4200, appealOpen: true }), 'appeal');
  // Recurso ganho e pago: a glosa antiga não segura a guia.
  assert.equal(tiss.guideStatusFrom({ inBatch: true, totalCents: 9200, paidCents: 9200, glosaCents: 4200 }), 'paid');
  assert.equal(tiss.guideStatusFrom({ cancelled: true, inBatch: true, totalCents: 1 }), 'cancelled');
});

test('lote: separa por contratado e corta em 100 guias', () => {
  const guide = (n, key) => ({ guide_id: `g${n}`, guide_number: String(n), status: 'open', missing: [], contractor_key: key, contractor_name: key, total_cents: 100 });
  const guides = [...Array.from({ length: 150 }, (_, i) => guide(i + 1, 'clinica')), guide(999, 'pf'),
    { ...guide(1000, 'clinica'), missing: ['carteira'] }, { ...guide(1001, 'clinica'), status: 'batched' }];
  const groups = tiss.batchCandidates(guides);
  assert.deepEqual(groups.map(group => [group.contractorKey, group.guides.length]), [['clinica', 100], ['clinica', 50], ['pf', 1]]);
  assert.equal(groups[0].guides[0].guide_number, '1', 'na ordem do número');
});

// ---------- "A receber" ----------

test('convênio não atrasa antes do lote enviado + prazo, e o dinheiro da operadora tira do "A receber"', () => {
  const charge = { id: 'c1', source: 'appointment', payer: 'convenio', convenio_id: 'op', patient_id: 'p', price_cents: 9200, service_on: '2026-09-01' };
  const base = { charges: [charge], today: '2026-11-03' };
  const status = extra => [{ cobranca: 'c1', guia: 'g1', numero_guia: '7', situacao: 'batched', lote: '3', enviado_em: null, prazo_dias: 30, pago_centavos: 0, glosa_centavos: 0, ...extra }];

  // Sem guia ainda (migration não aplicada) ou guia em aberto: não atrasa.
  assert.equal(buildReceivables(base).items[0].late, false);
  assert.equal(buildReceivables({ ...base, tissStatus: status({ situacao: 'open', lote: null }) }).items[0].late, false);
  // Lote enviado há 10 dias, prazo 30: em dia, vence no dia certo.
  let item = buildReceivables({ ...base, tissStatus: status({ enviado_em: '2026-10-24' }) }).items[0];
  assert.equal(item.late, false);
  assert.equal(item.dueOn, '2026-11-23');
  // Passou do prazo: atrasa.
  item = buildReceivables({ ...base, tissStatus: status({ enviado_em: '2026-09-20' }) }).items[0];
  assert.equal(item.late, true);
  // Operadora pagou parte: sai o pago; a glosa fica no "A receber".
  const receipts = tiss.operatorReceiptsFrom([{ cobranca: 'c1', lancamento: 'l1', pagamento: 'pg', operadora: 'op', pago_em: '2026-11-01', forma: 'ted', valor_centavos: 5000 }]);
  item = buildReceivables({ ...base, receipts, tissStatus: status({ situacao: 'glosa', enviado_em: '2026-10-24', pago_centavos: 5000, glosa_centavos: 4200 }) }).items[0];
  assert.equal(item.openCents, 4200);
  assert.equal(item.guide.glosaCents, 4200);
  assert.equal(item.payer, 'convenio');
  // Pago tudo: sai.
  const all = tiss.operatorReceiptsFrom([{ cobranca: 'c1', lancamento: 'l2', pagamento: 'pg2', operadora: 'op', pago_em: '2026-11-02', forma: 'pix', valor_centavos: 9200 }]);
  assert.equal(buildReceivables({ ...base, receipts: all }).items.length, 0);
});

test('particular continua vencendo no dia do atendimento', () => {
  const charge = { id: 'c2', source: 'appointment', payer: 'patient', patient_id: 'p', price_cents: 20000, service_on: '2026-11-01' };
  assert.equal(buildReceivables({ charges: [charge], today: '2026-11-03' }).items[0].late, true);
});

// ---------- banco: proteção ----------

test('tabelas novas: só a administração lê e ninguém grava direto', () => {
  const tables = ['tiss_guides', 'tiss_guide_items', 'tiss_batches', 'tiss_batch_guides', 'tiss_batch_items', 'convenio_payments', 'tiss_guide_settlements', 'tiss_guide_appeals'];
  const loop = sql.match(/FOREACH v_table IN ARRAY ARRAY\[([^\]]+)\]/)[1];
  assert.deepEqual(loop.match(/'([a-z_]+)'/g).map(name => name.slice(1, -1)), tables);
  assert.match(sql, /REVOKE ALL ON public\.%I FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT SELECT ON public\.%I TO authenticated/);
  assert.match(sql, /USING \(public\.can_manage_finance\(clinic_id\)\)/);
  assert.match(sql, /trg_convenio_payments_guard\s*\r?\n\s*BEFORE UPDATE OR DELETE ON public\.convenio_payments\s*\r?\n\s*FOR EACH ROW EXECUTE FUNCTION public\.finance_guard_money_rows\(\)/);
  assert.match(sql, /trg_tiss_guide_settlements_guard\s*\r?\n\s*BEFORE UPDATE OR DELETE ON public\.tiss_guide_settlements\s*\r?\n\s*FOR EACH ROW EXECUTE FUNCTION public\.finance_guard_money_rows\(\)/);
  for (const table of ['tiss_batches', 'tiss_batch_guides', 'tiss_batch_items']) {
    assert.match(sql, new RegExp(`BEFORE UPDATE OR DELETE ON public\\.${table}\\s*\\r?\\n\\s*FOR EACH ROW EXECUTE FUNCTION public\\.tiss_guard_frozen\\(\\)`), table);
  }
});

test('guia em lote não muda: o guarda fica na cobrança e cobre dia, valor, profissional e anulação', () => {
  const body = functionBody(sql, 'tiss_guard_charge');
  for (const column of ['voided_at', 'price_cents', 'payer', 'convenio_id', 'service_on', 'professional_id', 'discipline', 'appointment_type', 'patient_id', 'tuss_code']) {
    assert.ok(body.includes(`OLD.${column}`) && body.includes(`NEW.${column}`), column);
  }
  // A exclusão de paciente zera a carteira e o agendamento: não podem barrar.
  assert.ok(!body.includes('OLD.coverage_id') && !body.includes('OLD.appointment_id'));
  assert.match(sql, /trg_appointment_charges_tiss_guard\s*\r?\n\s*BEFORE UPDATE ON public\.appointment_charges/);
});

test('PL/pgSQL sem AND que dependa de parar cedo em coluna de outra tabela (achado ao validar)', () => {
  const body = functionBody(sql, 'tiss_guard_frozen');
  assert.ok(!/TG_TABLE_NAME = '[a-z_]+' AND OLD\./.test(body));
});

test('erro da auditoria: Atendido que muda de dia, profissional, área ou tipo refaz a cobrança', () => {
  assert.match(sql, /CREATE TRIGGER trg_appointments_finance_change\s*\r?\n\s*AFTER UPDATE OF starts_at, professional_id, discipline, appointment_type, patient_id ON public\.appointments/);
  const body = functionBody(sql, 'finance_on_appointment_change');
  assert.match(body, /finance_void_appointment_charge\(NEW\.id/);
  assert.match(body, /finance_charge_appointment\(NEW\.id\)/);
  assert.match(body, /appointment_has_payment/);
  assert.match(scenarios, /-- 4\. Erro corrigido: Atendido que muda de dia, profissional, área/);
});

test('recebimento de convênio só pelo pagamento da operadora', () => {
  assert.match(sql, /CREATE TRIGGER trg_finance_receipts_payer\s*\r?\n\s*BEFORE INSERT ON public\.finance_receipts/);
  assert.match(functionBody(sql, 'finance_receipts_payer_check'), /c\.payer = 'convenio'/);
});

test('lote: até 100, contratado único, guia completa e atendimento até hoje, no banco', () => {
  const body = functionBody(sql, 'finance_tiss_create_batch');
  assert.match(body, /v_count > 100/);
  assert.match(body, /contratado_misturado/);
  assert.match(body, /guia_incompleta/);
  assert.match(functionBody(sql, 'tiss_guide_snapshot'), /v_row\.service_on > v_today/);
  assert.match(body, /public\.tiss_hash\(v_xml\)/);
});

test('validação SQL cobre os cenários e devolve o XML para o XSD', () => {
  for (let n = 1; n <= 13; n += 1) assert.match(scenarios, new RegExp(`^-- ${n}\\. `, 'm'), `cenário ${n}`);
  assert.match(scenarios, /SELECT xml AS lote_1_xml/);
  assert.match(scenarios, /ROLLBACK;\s*$/);
});

test('tabela 38 vem do script de carga, nunca escrita à mão', async () => {
  const load = await read('../supabase/migrations/20261103b_tiss_terms_38.sql');
  assert.match(load, /Gerado por frontend\/scripts\/build-tiss-terms-sql\.py/);
  const rows = [...load.matchAll(/^ {2}\('38', '(\d{4})', /gm)];
  assert.ok(rows.length >= 400, `tabela 38 com ${rows.length} termos`);
  assert.ok(rows.some(([, code]) => code === '1001'), 'carteira inválida (1001)');
});

// ---------- tela ----------

test('tela A: Guias, Lotes e Pagamentos e glosas no grupo Convênios, com "Como funciona"', async () => {
  const screen = await read('src/components/financeiro/FinanceiroScreen.jsx');
  assert.match(screen, /\{ label: 'Convênios', ids: \['guias', 'lotes', 'pagamentos', 'operadoras', 'solicitantes', 'faturamento'\] \}/);
  for (const id of ['guias', 'lotes', 'pagamentos']) {
    assert.ok(FINANCEIRO_HELP[id]?.summary, `ajuda de ${id}`);
    assert.match(screen, new RegExp(`section === '${id}'`));
  }
  const css = await read('src/styles/financeiro.css');
  assert.match(css, /\.fin-tiss-split \{\s*\r?\n\s*display: grid;\s*\r?\n\s*grid-template-columns: minmax\(0, 2fr\) minmax\(0, 3fr\);/);
  const help = await read('src/data/screenHelp.js');
  assert.match(help, /Glosa não sai do “A receber”/);
});

test('convênio no "A receber": sem "Receber" do paciente, leva às Guias ou aos Pagamentos', async () => {
  const entradas = await read('src/components/financeiro/FinanceEntradas.jsx');
  assert.match(entradas, /operator=\{Boolean\(fin\.data\.tissReady\)\}/);
  assert.match(entradas, /\{open && !operator && \(/);
});

test('XSD sem cópia no bundle: só para os testes e a conferência', async () => {
  const attrs = await read('../.gitattributes');
  assert.match(attrs, /^supabase\/tiss\/\*\* -text\r?$/m);
  assert.ok(existsSync(path.join(XSD_DIR, 'tissV4_03_00.xsd')));
});
