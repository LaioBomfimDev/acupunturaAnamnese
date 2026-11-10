// Valores e serviços por área (04/11/2026): um catálogo só
// (utils/appointmentTypes.js) para Agenda, Financeiro e Convênios, e a
// mesma regra área × tipo no banco (appointment_type_fits_area, migration
// 20261104b). Os sete tipos anteriores seguem valendo em qualquer área
// (histórico); os oito novos só nas áreas deles.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, readdir } from 'node:fs/promises';
import { createServer } from 'vite';
import {
  APPOINTMENT_TYPES,
  GENERAL_APPOINTMENT_TYPE_IDS,
  SERVICES_BY_AREA,
  appointmentTypeGroups,
  appointmentTypeLabel,
  isTypeAllowedInArea,
  typeAfterAreaChange,
} from '../../src/utils/appointmentTypes.js';
import { FINANCE_SERVICES_BY_AREA } from '../../src/utils/financeServices.js';
import { FINANCE_APPOINTMENT_TYPES, typeLabel } from '../../src/utils/finance.js';
import { FINANCEIRO_HELP } from '../../src/data/screenHelp.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => readFile(path.join(root, file), 'utf8');
const MIGRATION = '../supabase/migrations/20261104b_valores_servicos_por_area.sql';
const sql = await read(MIGRATION);
const NEW_TYPES = ['auriculotherapy', 'laserpuncture', 'cupping', 'home_visit', 'school_visit', 'neuromodulation', 'vascular_biomodulation', 'e_ilib'];
const AREAS = ['acupuntura', 'fisioterapia', 'psicologia', 'nutricao', 'neuropsicologia', 'aba'];

let server;
let service;
let financeService;

before(async () => {
  server = await createServer({ root, logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' });
  service = await server.ssrLoadModule('/src/services/appointmentService.js');
  financeService = await server.ssrLoadModule('/src/services/financeiroService.js');
});

after(async () => {
  await server?.close();
});

/** Lê a função do banco e devolve, por tipo novo, as áreas aceitas. */
function sqlAreasByType() {
  const fn = sql.split('FUNCTION public.appointment_type_fits_area')[1].split('$$;')[0];
  const map = {};
  for (const line of fn.split(/\r?\n/)) {
    const match = line.match(/WHEN p_type IN \(([^)]*)\) THEN (.*)$/);
    if (!match) continue;
    const types = [...match[1].matchAll(/'([a-z_]+)'/g)].map(item => item[1]);
    const areas = [...match[2].matchAll(/'([a-z_]+)'/g)].map(item => item[1]);
    for (const type of types) map[type] = match[2].trim() === 'TRUE' ? 'todas' : areas.sort();
  }
  return map;
}

test('migration nova vem depois de notas fiscais e libera os oito tipos', async () => {
  const files = (await readdir(path.join(root, '../supabase/migrations'))).sort();
  assert.ok(files.indexOf('20261104b_valores_servicos_por_area.sql') > files.indexOf('20261104_notas_fiscais.sql'));
  for (const type of NEW_TYPES) assert.ok(APPOINTMENT_TYPES.some(item => item.id === type), `catálogo sem ${type}`);
});

test('banco e tela: mesma regra área × tipo (função única nos seis CHECKs)', () => {
  const map = sqlAreasByType();
  for (const type of GENERAL_APPOINTMENT_TYPE_IDS) assert.equal(map[type], 'todas', `${type} precisa valer em qualquer área (histórico)`);
  for (const type of NEW_TYPES) {
    const areas = AREAS.filter(area => SERVICES_BY_AREA[area].some(item => item.id === type)).sort();
    assert.deepEqual(map[type], areas, `áreas de ${type} divergem entre banco e catálogo`);
    for (const area of AREAS) assert.equal(isTypeAllowedInArea(area, type), areas.includes(area), `${type} em ${area}`);
  }
  assert.deepEqual(Object.keys(map).sort(), APPOINTMENT_TYPES.map(item => item.id).sort());
  for (const [table, constraint, call] of [
    ['appointments', 'appointments_type_check', 'appointment_type_fits_area(discipline, appointment_type)'],
    ['procedure_prices', 'procedure_prices_appointment_type_check', 'appointment_type_fits_area(discipline, appointment_type)'],
    ['convenio_procedure_prices', 'convenio_procedure_prices_appointment_type_check', 'appointment_type_fits_area(discipline, appointment_type)'],
    ['finance_payout_rules', 'finance_payout_rules_appointment_type_check', 'appointment_type_fits_area(discipline, appointment_type)'],
    ['finance_package_models', 'finance_package_models_types', 'appointment_types_fit_area(discipline, appointment_types)'],
    ['patient_packages', 'patient_packages_types', 'appointment_types_fit_area(discipline, appointment_types)'],
  ]) {
    const block = sql.split(`ALTER TABLE public.${table} ADD CONSTRAINT ${constraint}`)[1]?.split(';')[0] || '';
    assert.ok(block.includes(`public.${call}`), `${constraint} precisa usar a regra única`);
  }
  // Trava antiga sai pelo conteúdo, nunca por nome adivinhado.
  assert.match(sql, /pg_get_constraintdef\(c\.oid\) LIKE '%interview%'/);
});

test('contratos de preço e pacote ficam: a migration não recria as RPCs nem impõe desconto', () => {
  for (const fn of ['finance_save_prices', 'finance_sell_package', 'finance_save_payout_rules', 'finance_charge_appointment', 'finance_resolve_price']) {
    assert.ok(!sql.includes(`FUNCTION public.${fn}`), `${fn} não pode mudar nesta migration`);
  }
  assert.doesNotMatch(sql, /discount_cents\s*=|percent\s*=\s*5/i, 'desconto de pacote é só preenchimento na tela');
});

test('nota fiscal descreve os tipos novos pelo nome geral do catálogo', () => {
  const fn = sql.split('FUNCTION public.fiscal_type_label')[1].split('$$;')[0];
  for (const type of NEW_TYPES) {
    const label = APPOINTMENT_TYPES.find(item => item.id === type).label;
    assert.ok(fn.includes(`WHEN '${type}' THEN '${label}'`), `nota sem ${type}`);
  }
});

test('rótulo depende da área: anamnese e avaliação mudam de nome', () => {
  assert.equal(appointmentTypeLabel('anamnesis', 'acupuntura'), 'Avaliação inicial (anamnese)');
  assert.equal(appointmentTypeLabel('anamnesis', 'nutricao'), 'Anamnese');
  assert.equal(appointmentTypeLabel('evaluation', 'psicologia'), 'Avaliação psicológica');
  assert.equal(appointmentTypeLabel('evaluation', 'neuropsicologia'), 'Avaliação neuropsicológica');
  assert.equal(appointmentTypeLabel('evaluation', 'aba'), 'Avaliação');
  assert.equal(appointmentTypeLabel('session', 'acupuntura'), 'Sessão de acupuntura');
  assert.equal(appointmentTypeLabel('feedback', 'acupuntura'), 'Devolutiva', 'tipo anterior mantém o nome geral');
  assert.equal(appointmentTypeLabel('evaluation'), 'Avaliação', 'sem área, nome geral');
  assert.equal(appointmentTypeLabel(null, 'psicologia'), 'Sem tipo');
  assert.equal(typeLabel('evaluation', 'psicologia'), 'Avaliação psicológica', 'Financeiro usa o mesmo rótulo');
  assert.equal(FINANCE_APPOINTMENT_TYPES, APPOINTMENT_TYPES, 'Financeiro não tem lista própria');
  assert.equal(FINANCE_SERVICES_BY_AREA, SERVICES_BY_AREA, 'valores por área não têm catálogo próprio');
});

test('campo Tipo da Agenda: serviços da área primeiro, tipos gerais depois, nada de outra área', () => {
  const groups = appointmentTypeGroups('acupuntura');
  assert.equal(groups[0].label, 'Serviços da área');
  assert.deepEqual(groups[0].options.map(item => item.id), ['anamnesis', 'session', 'auriculotherapy', 'laserpuncture', 'cupping']);
  const others = groups[1].options.map(item => item.id);
  for (const id of ['evaluation', 'feedback', 'interview', 'first_visit', 'return']) assert.ok(others.includes(id), `Acupuntura perdeu ${id}`);
  for (const id of ['home_visit', 'e_ilib', 'neuromodulation']) assert.ok(!others.includes(id), `${id} não é da Acupuntura`);
  const neuro = appointmentTypeGroups('neuropsicologia').flatMap(group => group.options.map(item => item.id));
  assert.ok(neuro.includes('session') && neuro.includes('feedback'), 'Neuropsicologia segue com Sessão e Devolutiva');
  // tipo já gravado nunca some da lista
  const kept = appointmentTypeGroups('psicologia', 'interview').flatMap(group => group.options.map(item => item.id));
  assert.ok(kept.includes('interview'));
  assert.equal(typeAfterAreaChange('auriculotherapy', 'nutricao'), '');
  assert.equal(typeAfterAreaChange('e_ilib', 'fisioterapia'), 'e_ilib');
  assert.equal(typeAfterAreaChange('feedback', 'aba'), 'feedback');
});

test('Novo agendamento, Editar e Registrar atendimento já realizado usam o catálogo por área', async () => {
  for (const file of ['src/components/panels/Agenda.jsx', 'src/components/panels/agenda/EditAppointmentPanel.jsx', 'src/components/panels/agenda/RegisterCompletedDialog.jsx']) {
    const source = await read(file);
    assert.match(source, /<AppointmentTypeOptions discipline=\{/, `${file} sem o campo por área`);
    assert.match(source, /typeAfterAreaChange\(/, `${file} não limpa o tipo ao trocar a área`);
    assert.doesNotMatch(source, /APPOINTMENT_TYPES\.map\(/, `${file} voltou a listar todos os tipos`);
  }
  const rows = await read('src/components/panels/agenda/AgendaDayRows.jsx');
  assert.match(rows, /appointmentTypeLabel\(appointment\.appointment_type, appointment\.discipline\)/);
  assert.doesNotMatch(rows, /APPOINTMENT_TYPE_LABEL/);
});

test('catálogo único: nenhum outro arquivo define os tipos', async () => {
  const offenders = [];
  async function walk(dir) {
    for (const entry of await readdir(path.join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) await walk(rel);
      else if (/\.(jsx?|mjs)$/.test(entry.name) && rel !== 'src/utils/appointmentTypes.js') {
        const text = await read(rel);
        if (/\{ id: '(auriculotherapy|home_visit|first_visit|feedback)'/.test(text)) offenders.push(rel);
      }
    }
  }
  await walk('src');
  assert.deepEqual(offenders, []);
});

test('Financeiro e Convênios: tipo pelo serviço da área e rótulo com a área', async () => {
  const config = await read('src/components/financeiro/FinanceConfig.jsx');
  assert.match(config, /financeServicesForArea\(row\.discipline, \[row\.type\]\)/, 'exceção de repasse por serviço da área');
  const convenios = await read('src/components/financeiro/FinanceConvenios.jsx');
  assert.match(convenios, /financeServicesForArea\(form\.discipline, \[form\.appointment_type\]\)/, 'preço da operadora por serviço da área');
  assert.match(convenios, /typeLabel\(row\.appointment_type, row\.discipline\)/);
  const entradas = await read('src/components/financeiro/FinanceEntradas.jsx');
  assert.doesNotMatch(entradas, /typeLabel\([^,)]*\)/, 'lançamento sem a área no rótulo');
});

test('recusa do banco vira frase: tipo fora da área', async () => {
  assert.equal(
    service.billingErrorMessage({ message: 'new row for relation "appointments" violates check constraint "appointments_type_check"' }),
    service.TYPE_AREA_MESSAGE,
  );
  assert.match(financeService.financeErrorMessage({ message: 'violates check constraint "procedure_prices_appointment_type_check"' }, 'x'), /não é serviço desta área/);
  assert.match(financeService.financeErrorMessage({ message: 'violates check constraint "patient_packages_types"' }, 'x'), /não é serviço desta área/);
  await assert.rejects(
    service.updateAppointmentDetails('id-qualquer', { discipline: 'nutricao', appointmentType: 'cupping' }),
    { message: service.TYPE_AREA_MESSAGE },
  );
});

test('validação SQL em transação com ROLLBACK cobre os cenários pedidos', async () => {
  const scenarios = await read('../supabase/validation/20261104b_valores_servicos_scenarios.sql');
  assert.match(scenarios, /^BEGIN;$/m);
  assert.match(scenarios, /^ROLLBACK;\s*$/m);
  for (const fn of ['finance_save_prices', 'finance_sell_package', 'finance_save_payout_rules', 'finance_resolve_price']) {
    assert.ok(scenarios.includes(`public.${fn}(`), `cenários sem ${fn}`);
  }
  for (const status of ['attended', 'no_show', 'excused', 'cancelled']) assert.ok(scenarios.includes(`'${status}'`));
  assert.match(scenarios, /insufficient_privilege/, 'cenário de perfil bloqueado');
});

test('ajuda e assistente explicam os serviços por área', async () => {
  const text = JSON.stringify([FINANCEIRO_HELP.valores, FINANCEIRO_HELP.modelos]);
  for (const piece of ['valor padrão da sessão', 'auriculoterapia', 'biomodulação vascular (e-ILIB)', 'Calcular com 5% de desconto', 'nada muda']) {
    assert.ok(text.includes(piece), `ajuda sem "${piece}"`);
  }
  const corpus = await read('../supabase/functions/_shared/assistantHelpCorpus.ts');
  assert.ok(corpus.includes('Anamnese, avaliação, retorno e devolutiva não têm campo'), 'rode node frontend/scripts/sync-assistant-help.mjs');
});
