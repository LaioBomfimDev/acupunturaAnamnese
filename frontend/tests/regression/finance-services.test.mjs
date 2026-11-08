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
  financePriceRows,
  financePriceSignature,
  financeServicesForArea,
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
    for (const id of ['anamnesis', 'evaluation', 'session', 'neuromodulation', 'vascular_biomodulation', 'e_ilib']) assert.ok(ids(area).includes(id));
  }
  for (const area of ['acupuntura', 'nutricao', 'neuropsicologia', 'aba']) assert.ok(!ids(area).includes('neuromodulation'));
});

test('matriz: campos não pertinentes não aparecem e valores anteriores continuam editáveis', () => {
  const rows = financePriceRows(['acupuntura', 'nutricao', 'psicologia'], [
    { discipline: 'psicologia', appointment_type: 'feedback', price_cents: 0 },
  ]);
  assert.ok(rows.find(row => row.id === 'auriculotherapy').services.acupuntura);
  assert.equal(rows.find(row => row.id === 'auriculotherapy').services.nutricao, undefined);
  const legacy = rows.find(row => row.id === 'feedback');
  assert.equal(legacy.services.psicologia.legacy, true);
  assert.equal(legacy.services.acupuntura, undefined);
  assert.equal(rows.find(row => row.id === 'interview'), undefined);
  assert.ok(rows.find(row => row.id === '').services.nutricao);
});

test('salvar não apaga valor anterior, outra área nem R$ 0; vazio remove só a célula apagada', () => {
  const cells = financePriceCells([
    { discipline: 'acupuntura', appointment_type: null, price_cents: 15000 },
    { discipline: 'psicologia', appointment_type: 'feedback', price_cents: 0 },
    { discipline: 'nutricao', appointment_type: 'first_visit', price_cents: 18000 },
  ]);
  cells['acupuntura:auriculotherapy'] = '80,50';
  let payload = financePricePayload(cells);
  assert.equal(payload.length, 4);
  assert.deepEqual(payload.find(row => row.appointmentType === 'feedback'), { discipline: 'psicologia', appointmentType: 'feedback', priceCents: 0 });
  assert.equal(payload.find(row => row.appointmentType === 'auriculotherapy').priceCents, 8050);
  cells['acupuntura:'] = '';
  payload = financePricePayload(cells);
  assert.equal(payload.length, 3);
  assert.ok(payload.some(row => row.appointmentType === 'first_visit'));
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

test('tela real: serviços corretos, legado e políticas de pacote aparecem sem abrir acesso novo', () => {
  const fin = { data: { prices: [...prices, { discipline: 'psicologia', appointment_type: 'feedback', price_cents: 0 }], members: [], settings: null } };
  const html = renderToStaticMarkup(React.createElement(config.ValoresConfig, { fin }));
  assert.match(html, /aria-label="Avaliação inicial \(anamnese\), Acupuntura"/);
  assert.match(html, /aria-label="Sessão de auriculoterapia, Acupuntura"/);
  assert.match(html, /aria-label="Visita escolar, ABA"/);
  assert.doesNotMatch(html, /aria-label="Anamnese, ABA"/);
  assert.doesNotMatch(html, /aria-label="Devolutiva, Nutrição"/);
  assert.match(html, /aria-label="Devolutiva, Psicologia"/);
  assert.match(html, /Tipo anterior cadastrado/);
  assert.match(html, /5% de desconto nos pacotes/);
  assert.match(html, /Pacotes sem desconto/);
  for (const area of ['Psicologia', 'Fisioterapia']) {
    assert.ok(html.includes(`aria-label="Neuromodulação, ${area}"`));
    assert.ok(html.includes(`aria-label="Biomodulação vascular, ${area}"`));
    assert.ok(html.includes(`aria-label="e-ILIB, ${area}"`));
  }
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
