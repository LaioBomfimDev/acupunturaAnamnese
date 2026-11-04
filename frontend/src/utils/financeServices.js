import { SERVICES_BY_AREA } from './appointmentTypes.js';
import { FINANCE_APPOINTMENT_TYPES, centsToInput, parseBRLInput, resolvePrice } from './finance.js';

// O catálogo por área mora em utils/appointmentTypes.js (um só para Agenda,
// Financeiro e Convênios); aqui ficam as contas da configuração financeira.
export const FINANCE_SERVICES_BY_AREA = SERVICES_BY_AREA;

export const FINANCE_PACKAGE_RULES = {
  acupuntura: { discountPercent: 5, label: '5% de desconto nos pacotes' },
  psicologia: { discountPercent: 0, label: 'Pacotes sem desconto' },
  fisioterapia: { discountPercent: null, label: 'Pacotes disponíveis' },
};

export function financeServicesForArea(discipline, previousTypes = []) {
  const services = [...(FINANCE_SERVICES_BY_AREA[discipline] || [])];
  for (const id of previousTypes) {
    if (!id || services.some(service => service.id === id)) continue;
    services.push({ id, label: FINANCE_APPOINTMENT_TYPES.find(type => type.id === id)?.label || 'Tipo anterior', legacy: true });
  }
  return services;
}

export function financeServiceLabel(discipline, type) {
  return financeServicesForArea(discipline, [type]).find(service => service.id === type)?.label || 'Sem tipo';
}

/** Mantém a matriz existente, mas só oferece células pertinentes à área.
 * Tipos anteriores com valor cadastrado continuam visíveis e editáveis. */
export function financePriceRows(areaIds, prices) {
  const rows = new Map([['', { id: '', label: 'Valor padrão da área', services: {} }]]);
  for (const area of areaIds) {
    rows.get('').services[area] = { label: 'Valor padrão da área' };
    const previous = prices.filter(price => price.discipline === area).map(price => price.appointment_type);
    for (const service of financeServicesForArea(area, previous)) {
      if (!rows.has(service.id)) {
        const label = FINANCE_APPOINTMENT_TYPES.find(type => type.id === service.id)?.label || service.label;
        rows.set(service.id, { id: service.id, label, services: {} });
      }
      rows.get(service.id).services[area] = service;
    }
  }
  return [...rows.values()];
}

export function financePriceKey(discipline, type) {
  return `${discipline}:${type || ''}`;
}

export function financePriceCells(prices) {
  return Object.fromEntries(prices.map(row => [financePriceKey(row.discipline, row.appointment_type), centsToInput(row.price_cents)]));
}

/** A RPC substitui todo o escopo: incluir também células de tipos antigos. */
export function financePricePayload(cells) {
  return Object.entries(cells)
    .filter(([, text]) => text.trim())
    .map(([key, text]) => {
      const [discipline, type] = key.split(':');
      return { discipline, appointmentType: type || null, priceCents: parseBRLInput(text) };
    });
}

export function financePriceSignature(cells) {
  return JSON.stringify(financePricePayload(cells).sort((a, b) => financePriceKey(a.discipline, a.appointmentType).localeCompare(financePriceKey(b.discipline, b.appointmentType))));
}

/** Só calcula quando há um serviço definido: não supõe a composição
 * de um pacote misto nem escolhe o primeiro tipo de uma lista. */
export function financePackageQuote({ discipline, types, sessions, prices, professionalId = null }) {
  const rule = FINANCE_PACKAGE_RULES[discipline];
  if (rule?.discountPercent == null || types.length !== 1 || !Number.isInteger(sessions) || sessions < 1 || sessions > 100) return null;
  if (!FINANCE_SERVICES_BY_AREA[discipline]?.some(service => service.id === types[0])) return null;
  const { cents } = resolvePrice(prices, { discipline, type: types[0], professionalId });
  if (cents == null) return null;
  const subtotalCents = cents * sessions;
  const totalCents = Math.round(subtotalCents * (100 - rule.discountPercent) / 100);
  return { unitCents: cents, subtotalCents, totalCents, discountCents: subtotalCents - totalCents, discountPercent: rule.discountPercent };
}
