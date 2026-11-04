import { FINANCE_APPOINTMENT_TYPES, centsToInput, parseBRLInput, resolvePrice } from './finance.js';

// Catálogo da configuração financeira. Os tipos novos precisam ser liberados
// pelo backend antes do uso na Agenda; não ampliar o catálogo global por aqui.
const ADJUNCT_SERVICES = [
  { id: 'neuromodulation', label: 'Neuromodulação' },
  { id: 'vascular_biomodulation', label: 'Biomodulação vascular' },
  { id: 'e_ilib', label: 'e-ILIB' },
];

export const FINANCE_SERVICES_BY_AREA = {
  acupuntura: [
    { id: 'anamnesis', label: 'Avaliação inicial (anamnese)' },
    { id: 'session', label: 'Sessão de acupuntura' },
    { id: 'auriculotherapy', label: 'Sessão de auriculoterapia' },
    { id: 'laserpuncture', label: 'Sessão de laserpuntura' },
    { id: 'cupping', label: 'Sessão de ventosa' },
  ],
  fisioterapia: [
    { id: 'anamnesis', label: 'Anamnese' },
    { id: 'session', label: 'Sessão' },
    { id: 'evaluation', label: 'Avaliação' },
    ...ADJUNCT_SERVICES,
  ],
  psicologia: [
    { id: 'anamnesis', label: 'Anamnese' },
    { id: 'session', label: 'Sessão' },
    { id: 'evaluation', label: 'Avaliação psicológica' },
    ...ADJUNCT_SERVICES,
  ],
  nutricao: [
    { id: 'anamnesis', label: 'Anamnese' },
    { id: 'return', label: 'Retorno' },
    { id: 'session', label: 'Sessão' },
  ],
  neuropsicologia: [
    { id: 'evaluation', label: 'Avaliação neuropsicológica' },
  ],
  aba: [
    { id: 'evaluation', label: 'Avaliação' },
    { id: 'home_visit', label: 'Visita domiciliar' },
    { id: 'school_visit', label: 'Visita escolar' },
    { id: 'session', label: 'Sessão' },
  ],
};

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
