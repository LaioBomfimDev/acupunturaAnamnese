// ============================================================
// Agenda com particular ou convênio (02/11/2026, tela A)
//
// "Como paga" do agendamento: Particular ou Convênio · <operadora>, a
// partir do convênio ativo da ficha (patient_coverages). O banco confere
// carteira × paciente × operadora (gatilho appointments_payer_check em
// 20261102_agenda_convenio.sql); aqui só se monta a escolha e os avisos.
// Valor e código TUSS da operadora só aparecem para a administração.
// ============================================================

import { coverageExpired } from './convenio.js';
import { formatDay } from './finance.js';

export const PARTICULAR = Object.freeze({ billingType: 'particular', convenioId: null, coverageId: null });

/** Carteiras ativas do paciente, com o nome da operadora e do plano. */
export function coverageChoices(coverages, { convenios = [], plans = [] } = {}) {
  const convenioById = new Map(convenios.map(row => [row.id, row]));
  const planById = new Map(plans.map(row => [row.id, row]));
  return (coverages || [])
    .filter(row => row.active !== false && convenioById.has(row.convenio_id))
    .map(row => ({
      coverageId: row.id,
      convenioId: row.convenio_id,
      convenioName: convenioById.get(row.convenio_id).name,
      planName: planById.get(row.plan_id)?.name || '',
      cardNumber: row.card_number || '',
      validUntil: row.card_valid_until || null,
      coverage: row,
    }));
}

/** Ao escolher o paciente: o convênio ativo da ficha já vem marcado. */
export function defaultBilling(choices) {
  const first = (choices || [])[0];
  return first
    ? { billingType: 'convenio', convenioId: first.convenioId, coverageId: first.coverageId }
    : PARTICULAR;
}

/** Valor do agendamento gravado → valor do campo. */
export function billingOf(appointment) {
  return appointment?.billing_type === 'convenio'
    ? { billingType: 'convenio', convenioId: appointment.convenio_id || null, coverageId: appointment.coverage_id || null }
    : PARTICULAR;
}

export function sameBilling(a, b) {
  return (a?.billingType || 'particular') === (b?.billingType || 'particular')
    && (a?.convenioId || null) === (b?.convenioId || null)
    && (a?.coverageId || null) === (b?.coverageId || null);
}

/** Linha verde embaixo da escolha: plano, carteira e validade. */
export function coverageNote(choice) {
  if (!choice) return '';
  return [
    choice.planName ? `Plano ${choice.planName}` : '',
    choice.cardNumber ? `carteira ${choice.cardNumber}` : '',
    choice.validUntil ? `válida até ${formatDay(choice.validUntil)}` : 'sem validade na ficha',
  ].filter(Boolean).join(' · ');
}

/** Avisos em âmbar: carteira vencida e operadora sem preço para a área. */
export function billingWarnings({ choice, today, priceCheck, disciplineLabel }) {
  const warnings = [];
  if (choice && coverageExpired(choice.coverage, today)) {
    warnings.push(`Carteira vencida em ${formatDay(choice.validUntil)}.`);
  }
  if (choice && priceCheck && !priceCheck.hasPrice) {
    warnings.push(`${choice.convenioName} não tem preço para ${disciplineLabel}. A administração cadastra em Financeiro → Operadoras.`);
  }
  return warnings;
}

/** Selo do card e do detalhe. Nome da operadora só onde cabe. */
export function billingBadgeLabel(appointment, convenioName = '') {
  if (appointment?.billing_type !== 'convenio') return '';
  return convenioName ? `Convênio · ${convenioName}` : 'Convênio';
}
