import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  FINANCE_SERVICES_BY_AREA,
  financePackageQuote,
  financePriceCells,
  financePricePayload,
  financePriceSignature,
  financeServicesForArea,
  financeValueCards,
  financeVisiblePriceKeys,
} from '../../src/utils/financeServices.js';

const ids = area => financeServicesForArea(area).map(service => service.id);

test('valores: cada área oferece só os serviços pedidos, com os nomes próprios', () => {
  assert.deepEqual(ids('acupuntura'), ['anamnesis', 'session', 'auriculotherapy', 'laserpuncture', 'cupping']);
  assert.equal(FINANCE_SERVICES_BY_AREA.acupuntura[0].label, 'Avaliação inicial (anamnese)');
  assert.deepEqual(ids('nutricao'), ['anamnesis', 'return', 'session']);
  assert.deepEqual(ids('aba'), ['evaluation', 'home_visit', 'school_visit', 'session']);
  assert.deepEqual(ids('neuropsicologia'), ['evaluation']);
  assert.equal(FINANCE_SERVICES_BY_AREA.psicologia.find(type => type.id === 'evaluation').label, 'Avaliação psicológica');
  assert.equal(FINANCE_SERVICES_BY_AREA.neuropsicologia[0].label, 'Avaliação neuropsicológica');
  for (const area of ['psicologia', 'fisioterapia']) {
    for (const id of ['anamnesis', 'evaluation', 'session', 'neuromodulation', 'vascular_biomodulation']) assert.ok(ids(area).includes(id));
    // e-ILIB é a mesma biomodulação vascular (10/11/2026): só aparece onde já está gravado.
    assert.ok(!ids(area).includes('e_ilib'));
    assert.ok(financeServicesForArea(area, ['e_ilib']).some(service => service.id === 'e_ilib'));
    assert.equal(FINANCE_SERVICES_BY_AREA[area].find(type => type.id === 'vascular_biomodulation').label, 'Biomodulação vascular (e-ILIB)');
  }
  for (const area of ['acupuntura', 'nutricao', 'neuropsicologia', 'aba']) assert.ok(!ids(area).includes('neuromodulation'));
});

test('tela Valores (10/11/2026): sessão é o padrão, tipos gerais sem campo, Neuropsicologia com valor único', () => {
  const cards = Object.fromEntries(financeValueCards(['acupuntura', 'fisioterapia', 'psicologia', 'nutricao', 'neuropsicologia', 'aba']).map(card => [card.area, card]));
  const extras = area => cards[area].extras.map(service => service.id);
  assert.equal(cards.acupuntura.mainLabel, 'Valor padrão da sessão');
  assert.deepEqual(extras('acupuntura'), ['auriculotherapy', 'laserpuncture', 'cupping']);
  assert.deepEqual(extras('fisioterapia'), ['neuromodulation', 'vascular_biomodulation']);
  assert.deepEqual(extras('psicologia'), ['neuromodulation', 'vascular_biomodulation']);
  assert.deepEqual(extras('nutricao'), []);
  assert.deepEqual(extras('aba'), ['home_visit', 'school_visit']);
  assert.equal(cards.neuropsicologia.single, true);
  assert.equal(cards.neuropsicologia.mainLabel, 'Valor da avaliação completa');
  assert.deepEqual(extras('neuropsicologia'), []);
  for (const card of Object.values(cards)) {
    for (const general of ['anamnesis', 'session', 'evaluation', 'return', 'feedback', 'interview', 'first_visit', 'e_ilib']) {
      assert.ok(!extras(card.area).includes(general), `${general} não tem campo em ${card.area}`);
    }
  }
});

test('salvar grava só o que a tela mostra: tipo que saiu da tela é apagado, R$ 0 fica', () => {
  const visible = financeVisiblePriceKeys(['acupuntura', 'psicologia', 'nutricao']);
  const cells = financePriceCells([
    { discipline: 'acupuntura', appointment_type: null, price_cents: 15000 },
    { discipline: 'psicologia', appointment_type: 'feedback', price_cents: 0 },
    { discipline: 'psicologia', appointment_type: 'session', price_cents: 18000 },
    { discipline: 'nutricao', appointment_type: 'return', price_cents: 9000 },
  ]);
  cells['acupuntura:auriculotherapy'] = '80,50';
  cells['acupuntura:cupping'] = '0';
  const payload = financePricePayload(cells, visible);
  assert.deepEqual(payload.map(row => `${row.discipline}:${row.appointmentType || ''}`).sort(), ['acupuntura:', 'acupuntura:auriculotherapy', 'acupuntura:cupping']);
  assert.equal(payload.find(row => row.appointmentType === 'auriculotherapy').priceCents, 8050);
  assert.equal(payload.find(row => row.appointmentType === 'cupping').priceCents, 0, 'R$ 0 é "não cobra", não vazio');
  // Sem a lista, o comportamento antigo segue.
  assert.equal(financePricePayload(cells).length, 6);
  // Valor escondido conta como mudança: salvar é o que o apaga.
  assert.notEqual(financePriceSignature(cells, visible), financePriceSignature(cells));
});

test('alterações: ordem das células, espaços e formatação equivalente não criam mudança falsa', () => {
  const a = { 'psicologia:session': '150', 'acupuntura:': '100', 'nutricao:return': '' };
  const b = { 'acupuntura:': '100,00', 'psicologia:session': ' 150 ' };
  assert.equal(financePriceSignature(a), financePriceSignature(b));
  assert.notEqual(financePriceSignature(a), financePriceSignature({ ...a, 'psicologia:session': '0' }));
});

const prices = [
  { discipline: 'acupuntura', appointment_type: null, price_cents: 10000 },
  { discipline: 'acupuntura', appointment_type: 'auriculotherapy', price_cents: 3333 },
  { discipline: 'psicologia', appointment_type: 'anamnesis', price_cents: 22000 },
  { discipline: 'psicologia', appointment_type: 'session', price_cents: 15000 },
  { discipline: 'acupuntura', appointment_type: 'session', professional_id: 'prof', price_cents: 20000 },
];

test('pacotes: Acupuntura calcula 5% em centavos, com arredondamento único no total', () => {
  const quote = financePackageQuote({ discipline: 'acupuntura', types: ['session'], sessions: 10, prices });
  assert.deepEqual(quote, { unitCents: 10000, subtotalCents: 100000, discountCents: 5000, totalCents: 95000, discountPercent: 5 });
  assert.equal(financePackageQuote({ discipline: 'acupuntura', types: ['auriculotherapy'], sessions: 3, prices }).totalCents, 9499);
  assert.equal(financePackageQuote({ discipline: 'acupuntura', types: ['session'], sessions: 10, prices, professionalId: 'prof' }).totalCents, 190000);
});

test('pacotes: Psicologia não aplica desconto em anamnese nem sessão', () => {
  for (const [type, total] of [['anamnesis', 220000], ['session', 150000]]) {
    const quote = financePackageQuote({ discipline: 'psicologia', types: [type], sessions: 10, prices });
    assert.equal(quote.totalCents, total);
    assert.equal(quote.discountPercent, 0);
    assert.equal(quote.discountCents, 0);
  }
});

test('pacotes: não inventa valor ou desconto quando faltam dados ou o pacote mistura serviços', () => {
  const base = { discipline: 'acupuntura', types: ['session'], sessions: 10, prices };
  for (const change of [
    { types: [] }, { types: ['session', 'anamnesis'] }, { types: ['feedback'] },
    { prices: [] }, { sessions: 0 }, { sessions: 1.5 }, { sessions: 101 },
    { discipline: 'fisioterapia' }, { discipline: 'nutricao' },
  ]) assert.equal(financePackageQuote({ ...base, ...change }), null);
  const zero = financePackageQuote({ ...base, prices: [{ discipline: 'acupuntura', appointment_type: null, price_cents: 0 }] });
  assert.equal(zero.totalCents, 0, 'zero é valor conhecido, não ausência');
});

let server;
let config;
let packagePricing;
before(async () => {
  server = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' });
  config = await server.ssrLoadModule('/src/components/financeiro/FinanceConfig.jsx');
  packagePricing = await server.ssrLoadModule('/src/components/financeiro/FinancePackagePricing.jsx');
});
after(async () => { await server?.close(); });

test('tela real: um cartão por área, sem anamnese/sessão/retorno/pacotes e com e-ILIB numa linha só', () => {
  const fin = { data: { prices: [...prices, { discipline: 'psicologia', appointment_type: 'feedback', price_cents: 0 }], members: [], settings: null } };
  const html = renderToStaticMarkup(React.createElement(config.ValoresConfig, { fin }));
  assert.match(html, /class="fin-value-cards"/);
  assert.doesNotMatch(html, /fin-prices|<table/, 'a matriz antiga saiu');
  assert.match(html, /aria-label="Valor padrão da sessão, Acupuntura"/);
  assert.match(html, /aria-label="Sessão de auriculoterapia, Acupuntura"/);
  assert.match(html, /aria-label="Visita escolar, ABA"/);
  assert.doesNotMatch(html, /Valor padrão da área/);
  for (const gone of ['Avaliação inicial \\(anamnese\\)', 'Sessão de acupuntura', 'Devolutiva', 'Retorno', 'Avaliação psicológica', 'Tipo anterior cadastrado', 'Pacotes sem desconto', '5% de desconto nos pacotes']) {
    assert.doesNotMatch(html, new RegExp(`aria-label="${gone}|>${gone}<`), `${gone} não aparece em Valores`);
  }
  for (const area of ['Psicologia', 'Fisioterapia']) {
    assert.ok(html.includes(`aria-label="Neuromodulação, ${area}"`));
    assert.ok(html.includes(`aria-label="Biomodulação vascular (e-ILIB), ${area}"`));
    assert.ok(!html.includes(`aria-label="e-ILIB, ${area}"`));
  }
  assert.match(html, /aria-label="Valor da avaliação completa, Neuropsicologia"/, 'Neuropsicologia com um valor só (cobrança única em 20261110)');
  assert.match(html, /Valor único/);
});

test('botão de cálculo não chama persistência e pede dados quando falta base', () => {
  let applied = false;
  const props = { discipline: 'acupuntura', types: ['session'], sessions: 10, prices, onApply: () => { applied = true; } };
  const html = renderToStaticMarkup(React.createElement(packagePricing.FinancePackagePricing, props));
  assert.match(html, /R\$ 950/);
  assert.match(html, /Calcular com 5% de desconto/);
  assert.equal(applied, false);
  const missing = renderToStaticMarkup(React.createElement(packagePricing.FinancePackagePricing, { ...props, prices: [] }));
  assert.match(missing, /disabled=""/);
  assert.match(missing, /cadastre o valor avulso/);
});
