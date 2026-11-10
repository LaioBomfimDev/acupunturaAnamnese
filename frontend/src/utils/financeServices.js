import { GENERAL_APPOINTMENT_TYPE_IDS, SERVICES_BY_AREA } from './appointmentTypes.js';
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
  // Tipo aposentado (e-ILIB) só aparece onde já está gravado.
  const services = (FINANCE_SERVICES_BY_AREA[discipline] || []).filter(service => !service.retired || previousTypes.includes(service.id));
  for (const id of previousTypes) {
    if (!id || services.some(service => service.id === id)) continue;
    services.push({ id, label: FINANCE_APPOINTMENT_TYPES.find(type => type.id === id)?.label || 'Tipo anterior', legacy: true });
  }
  return services;
}

export function financeServiceLabel(discipline, type) {
  return financeServicesForArea(discipline, [type]).find(service => service.id === type)?.label || 'Sem tipo';
}

/** Áreas cobradas por avaliação inteira, com um valor só (10/11/2026):
 * na Neuropsicologia o valor não depende de quantas sessões houver. */
export const FINANCE_SINGLE_VALUE_AREAS = ['neuropsicologia'];

/** Tela Valores (prévia B, 10/11/2026): um cartão por área, com o valor
 * padrão da sessão em destaque e só os serviços que têm valor próprio.
 * Anamnese, avaliação, retorno, devolutiva e os demais tipos gerais não
 * têm campo: na cobrança caem no valor padrão da sessão da área. */
export function financeValueCards(areaIds) {
  // Área de valor único por último: ela não segue a lógica das outras.
  const ordered = [...areaIds.filter(area => !FINANCE_SINGLE_VALUE_AREAS.includes(area)), ...areaIds.filter(area => FINANCE_SINGLE_VALUE_AREAS.includes(area))];
  return ordered.map(area => {
    const single = FINANCE_SINGLE_VALUE_AREAS.includes(area);
    return {
      area,
      single,
      mainLabel: single ? 'Valor da avaliação completa' : 'Valor padrão da sessão',
      extras: single ? [] : (FINANCE_SERVICES_BY_AREA[area] || [])
        .filter(service => !service.retired && !GENERAL_APPOINTMENT_TYPE_IDS.includes(service.id)),
    };
  });
}

/** Chaves que a tela mostra. Salvar grava só elas: valor de tipo que saiu
 * da tela (anamnese, sessão, retorno…) é apagado no próximo salvar, como a
 * administradora pediu, e a cobrança passa a usar o valor da sessão. */
export function financeVisiblePriceKeys(areaIds) {
  const keys = new Set();
  for (const card of financeValueCards(areaIds)) {
    keys.add(financePriceKey(card.area, ''));
    for (const service of card.extras) keys.add(financePriceKey(card.area, service.id));
  }
  return keys;
}

export function financePriceKey(discipline, type) {
  return `${discipline}:${type || ''}`;
}

export function financePriceCells(prices) {
  return Object.fromEntries(prices.map(row => [financePriceKey(row.discipline, row.appointment_type), centsToInput(row.price_cents)]));
}

/** A RPC substitui todo o escopo. Com `visibleKeys`, só o que a tela
 * mostra entra: célula de tipo fora da tela sai do banco ao salvar. */
export function financePricePayload(cells, visibleKeys = null) {
  return Object.entries(cells)
    .filter(([key, text]) => text.trim() && (!visibleKeys || visibleKeys.has(key)))
    .map(([key, text]) => {
      const [discipline, type] = key.split(':');
      return { discipline, appointmentType: type || null, priceCents: parseBRLInput(text) };
    });
}

export function financePriceSignature(cells, visibleKeys = null) {
  return JSON.stringify(financePricePayload(cells, visibleKeys).sort((a, b) => financePriceKey(a.discipline, a.appointmentType).localeCompare(financePriceKey(b.discipline, b.appointmentType))));
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
