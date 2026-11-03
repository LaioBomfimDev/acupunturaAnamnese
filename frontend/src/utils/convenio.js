// ============================================================
// Convênios, Fase 1 (31/10/2026): regras da tela de cadastros.
//
// Os formatos espelham os CHECKs de 20261031_convenios_fase1.sql (mudou
// um, muda o outro); a tela confere antes para dizer o que está errado
// em vez de esperar o banco recusar. Dígito verificador de CPF e CNPJ só
// a tela confere: o banco garante o formato.
// ============================================================

import { payableMembers } from './finance.js';

export const ANS_PATTERN = /^\d{6}$/;
export const CNES_PATTERN = /^\d{7}$/;
export const CNS_PATTERN = /^\d{15}$/;
export const TUSS_PATTERN = /^\d{8}$/;
export const OWN_CODE_PATTERN = /^[A-Za-z0-9.-]{1,10}$/;
export const PROVIDER_CODE_PATTERN = /^[A-Za-z0-9./-]{1,14}$/;
export const COUNCIL_NUMBER_PATTERN = /^[A-Za-z0-9./-]{1,15}$/;
export const CARD_PATTERN = /^[A-Za-z0-9./ -]{1,20}$/;

// Guia sem CNES leva 9999999 (regra da ANS).
export const CNES_NONE = '9999999';

export const SUBMISSION_CHANNELS = [
  { id: 'portal', label: 'Portal da operadora' },
  { id: 'webservice', label: 'Webservice' },
];

export const TUSS_TABLES = [
  { id: '22', label: 'Código TUSS' },
  { id: '00', label: 'Tabela própria da operadora' },
];

export const onlyDigits = value => String(value || '').replace(/\D/g, '');

/** CNPJ alfanumérico (07/2026): 12 letras/números + 2 dígitos, sem máscara. */
export function normalizeCnpj(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function cnpjDigit(chars, weights) {
  const sum = chars.reduce((total, char, index) => total + (char.charCodeAt(0) - 48) * weights[index], 0);
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

// Cálculo da Receita Federal para o CNPJ alfanumérico: cada caractere vale
// o código ASCII menos 48 (os números continuam valendo o próprio número).
export function isValidCnpj(value) {
  const cnpj = normalizeCnpj(value);
  if (!/^[A-Z0-9]{12}\d{2}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false;
  const chars = cnpj.split('');
  const first = cnpjDigit(chars.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = cnpjDigit([...chars.slice(0, 12), String(first)], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return Number(cnpj[12]) === first && Number(cnpj[13]) === second;
}

export function formatCnpj(value) {
  const cnpj = normalizeCnpj(value);
  if (cnpj.length !== 14) return cnpj;
  return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
}

export function isValidCpf(value) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = length => {
    const sum = cpf.slice(0, length).split('').reduce((total, char, index) => total + Number(char) * (length + 1 - index), 0);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

export function formatCpf(value) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11) return cpf;
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
}

/** O que falta para faturar esta operadora: uma linha por item, na ordem do passo a passo. */
export function convenioReadiness({ convenio, credentials = [], plans = [], prices = [] }) {
  const ownCredentials = credentials.filter(row => row.convenio_id === convenio.id && row.active !== false);
  const ownPlans = plans.filter(row => row.convenio_id === convenio.id && row.active !== false);
  const ownPrices = prices.filter(row => row.convenio_id === convenio.id);
  const coded = ownPrices.filter(row => row.tuss_code);
  const items = [
    {
      key: 'operadora',
      step: 1,
      ok: ANS_PATTERN.test(convenio.ans_registry || '') && Boolean(convenio.cnpj),
      label: convenio.ans_registry && convenio.cnpj ? 'Registro ANS e CNPJ' : convenio.ans_registry ? 'Falta o CNPJ' : 'Falta o registro ANS',
    },
    {
      key: 'credenciamento',
      step: 2,
      ok: ownCredentials.length > 0,
      label: ownCredentials.length
        ? (ownCredentials.length === 1 ? 'Código do prestador' : `${ownCredentials.length} códigos de prestador`)
        : 'Falta o código do prestador',
    },
    {
      key: 'planos',
      step: 3,
      ok: true,
      optional: true,
      label: ownPlans.length ? `${ownPlans.length} ${ownPlans.length === 1 ? 'plano' : 'planos'}` : 'Sem planos cadastrados (opcional)',
    },
    {
      key: 'precos',
      step: 4,
      ok: coded.length > 0 && coded.length === ownPrices.length,
      label: !coded.length
        ? 'Nenhum preço com código'
        : coded.length === ownPrices.length
          ? `${coded.length} ${coded.length === 1 ? 'preço com código' : 'preços com código'}`
          : `${ownPrices.length - coded.length} de ${ownPrices.length} preços sem código`,
    },
  ];
  const missing = items.filter(item => !item.ok).length;
  const required = items.filter(item => !item.optional);
  return {
    items,
    missing,
    ready: convenio.active !== false && missing === 0,
    percent: Math.round((required.filter(item => item.ok).length / required.length) * 100),
  };
}

export function missingLabel(missing) {
  return missing === 1 ? 'Falta 1 item' : `Faltam ${missing} itens`;
}

/** Dados de faturamento de quem atende: o que falta, na ordem da tela. */
export function professionalBillingMissing(info) {
  const missing = [];
  if (!info?.cpf) missing.push('CPF');
  if (!info?.council_code || !info?.council_number || !info?.council_uf) missing.push('conselho');
  if (!info?.cbo_code) missing.push('CBO');
  return missing;
}

/** Carteira vencida: a validade já passou no dia de hoje da clínica. */
export function coverageExpired(coverage, today) {
  return Boolean(coverage?.card_valid_until && coverage.card_valid_until < today);
}

/** Linha de procedimento → texto curto do código ("TUSS 50000470" / "Própria NEURO-01"). */
export function procedureCodeLabel(price) {
  if (!price?.tuss_code) return 'sem código';
  return price.tuss_table === '00' ? `Própria ${price.tuss_code}` : `TUSS ${price.tuss_code}`;
}

function plural(count, one, many) {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * Quadros do Resumo e números do menu das três partes de Convênios do
 * Financeiro. Carregando, traço; falha ao carregar aparece no quadro,
 * nunca vira zero.
 */
export function buildConvenioTiles(fin) {
  if (fin.convError) {
    const failed = { value: null, display: '', line: 'Não foi possível carregar', tone: 'warning' };
    return { tiles: { operadoras: failed, solicitantes: failed, faturamento: failed }, counts: {} };
  }
  if (!fin.conv) {
    const waiting = { value: null, display: '', line: 'carregando…' };
    return { tiles: { operadoras: waiting, solicitantes: waiting, faturamento: waiting }, counts: {} };
  }
  const active = fin.conv.convenios.filter(row => row.active !== false);
  const ready = active.filter(convenio => convenioReadiness({ convenio, ...fin.conv }).ready);
  const requesters = fin.conv.requesters.filter(row => row.active !== false);
  const billingById = new Map(fin.conv.billing.map(row => [row.professional_id, row]));
  const attending = payableMembers(fin.data.members).filter(member => member.has_agenda !== false);
  const incomplete = attending.filter(member => professionalBillingMissing(billingById.get(member.id)).length > 0);
  const operadorasOk = active.length > 0 && ready.length === active.length;

  return {
    tiles: {
      operadoras: {
        value: null,
        display: '',
        line: active.length
          ? `${operadorasOk ? 'Pronto' : 'Falta'} · ${ready.length} de ${plural(active.length, 'operadora pronta', 'operadoras prontas')}`
          : 'Nenhuma operadora cadastrada',
        tone: active.length && !operadorasOk ? 'warning' : undefined,
      },
      solicitantes: {
        display: String(requesters.length),
        line: requesters.length ? `${requesters.length === 1 ? 'solicitante cadastrado' : 'solicitantes cadastrados'}` : 'nenhum solicitante',
      },
      faturamento: {
        value: null,
        display: '',
        line: incomplete.length
          ? `Falta · ${plural(incomplete.length, 'profissional incompleto', 'profissionais incompletos')}`
          : `Pronto · ${fin.conv.clinic?.cnes ? `CNES ${fin.conv.clinic.cnes}` : `sem CNES (vai ${CNES_NONE})`}`,
        tone: incomplete.length ? 'warning' : undefined,
      },
    },
    counts: {
      operadoras: active.length ? { text: operadorasOk ? '✓' : 'falta', tone: operadorasOk ? undefined : 'warning' } : { text: '' },
      solicitantes: { text: requesters.length ? String(requesters.length) : '' },
      faturamento: { text: incomplete.length ? 'falta' : '✓', tone: incomplete.length ? 'warning' : undefined },
    },
  };
}

// ---------- Agenda com particular ou convênio (02/11/2026) ----------

/**
 * Preço da operadora para um atendimento: o tipo vence o padrão da área.
 * Mesma escolha do banco (finance_convenio_price em
 * 20261102_agenda_convenio.sql): mudou um, muda o outro. Sem linha, o
 * atendimento grava "sem valor" para a administração resolver.
 */
export function resolveConvenioPrice(prices, { convenioId, discipline, type = null }) {
  const candidates = (prices || []).filter(row => row.convenio_id === convenioId
    && row.discipline === discipline
    && (row.appointment_type == null || row.appointment_type === type));
  const best = [...candidates].sort((a, b) => (a.appointment_type == null) - (b.appointment_type == null))[0];
  if (!best) return { found: false, cents: null, byType: false, price: null };
  return { found: true, cents: best.price_cents, byType: best.appointment_type != null, price: best };
}
