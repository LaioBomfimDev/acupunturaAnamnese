// ============================================================
// Relatório do contador e comparação de meses (11/11/2026, etapa 3).
//
// Duas datas em cada lançamento:
//   * data do serviço (padrão, "em teste", decisão de 10/11/2026): o dia
//     do atendimento pago (recebimento), o vencimento da conta fixa
//     (saída fixa) ou o dia do pagamento (o resto: pacote pago antes,
//     gasto rápido, compra, repasse);
//   * data do pagamento: quando o dinheiro entrou ou saiu, que é o que o
//     fechamento do mês trava (20261111, decisão de 11/11/2026).
// Anulado aparece na lista, riscado, e fica fora dos totais. Com o mês
// fechado, o que foi lançado ou anulado depois do fechamento é marcado.
// Tudo em centavos e datas "AAAA-MM-DD"; sem mexer em nada do banco.
// ============================================================

import { addDays, formatDay, inRange, methodLabel, monthOf, shiftMonth, typeLabel } from './finance.js';

const chargeLabel = charge => typeLabel(charge.appointment_type, charge.discipline) || 'Atendimento';

export const REPORT_BASES = [
  { id: 'servico', label: 'Data do serviço' },
  { id: 'pagamento', label: 'Data do pagamento' },
];

/** Semana de domingo a sábado que contém o dia (mesma regra da Gestão). */
export function weekOf(day) {
  const [year, month, date] = String(day).split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, date)).getUTCDay();
  const from = addDays(day, -weekday);
  return { from, to: addDays(from, 6) };
}

/** Período escolhido: semana, mês ou de/até. */
export function reportRange({ kind, anchor, from = '', to = '' }) {
  if (kind === 'semana') return { kind, ...weekOf(anchor) };
  if (kind === 'periodo') return { kind, from, to };
  const month = monthOf(anchor);
  return { kind: 'mes', from: month.from, to: month.to, month };
}

/** Período válido: de ≤ até e no máximo 400 dias (um relatório legível). */
export function rangeError(range) {
  if (!range.from || !range.to) return 'Escolha as duas datas.';
  if (range.from > range.to) return 'A data inicial é depois da final.';
  const days = (Date.parse(`${range.to}T00:00:00Z`) - Date.parse(`${range.from}T00:00:00Z`)) / 86400000;
  if (days > 400) return 'Escolha no máximo um ano e um mês.';
  return '';
}

function after(stamp, closing) {
  return Boolean(closing && stamp && Date.parse(stamp) > Date.parse(closing.closed_at));
}

// A quem foi pago, sem repetir o nome que a descrição já traz ("Repasse · Ana").
function payeeFor(row, membersById, peopleById) {
  const name = row.professional_id ? nameOf(membersById, row.professional_id, 'Profissional')
    : row.person_id ? nameOf(peopleById, row.person_id, 'Pessoa') : '';
  return name && !String(row.description || '').includes(name) ? name : '';
}

function nameOf(map, id, fallback) {
  if (!id) return fallback;
  const row = map.get(id);
  return row?.full_name || row?.name || fallback;
}

/**
 * Linhas do relatório. lookups: chargesById, packagesById, patientsById,
 * membersById, peopleById, categoriesById, conveniosById, vouchersByGroup,
 * fiscalByGroup, providerByExpense.
 */
export function buildReportRows({ receipts = [], operatorReceipts = [], expenses = [], lookups, range, basis = 'servico', closing = null }) {
  const {
    chargesById = new Map(), packagesById = new Map(), patientsById = new Map(), membersById = new Map(),
    peopleById = new Map(), categoriesById = new Map(), conveniosById = new Map(), vouchersByGroup = new Map(),
    fiscalByGroup = new Map(), providerByExpense = new Map(),
  } = lookups || {};
  const pick = (serviceOn, paidOn) => (basis === 'pagamento' ? paidOn : serviceOn);

  const entradas = [];
  for (const row of receipts) {
    const charge = row.charge_id ? chargesById.get(row.charge_id) : null;
    const pkg = row.package_id ? packagesById.get(row.package_id) : null;
    const serviceOn = charge?.service_on || row.received_on;
    const day = pick(serviceOn, row.received_on);
    if (!inRange(day, range)) continue;
    const doc = fiscalByGroup.get(row.group_id);
    entradas.push({
      id: row.id,
      day,
      serviceOn,
      paidOn: row.received_on,
      source: 'paciente',
      who: nameOf(patientsById, row.patient_id, 'Paciente'),
      what: charge ? chargeLabel(charge) : (pkg?.name || 'Pacote'),
      discipline: charge?.discipline || pkg?.discipline || '',
      method: methodLabel(row.method),
      amountCents: row.amount_cents,
      receiptNumber: vouchersByGroup.has(row.group_id) ? String(vouchersByGroup.get(row.group_id)).padStart(4, '0') : '',
      nfse: doc?.status === 'issued' ? doc.nfse_number : '',
      voided: Boolean(row.voided_at),
      voidReason: row.void_reason || '',
      afterClose: after(row.created_at, closing) || after(row.voided_at, closing),
    });
  }
  for (const row of operatorReceipts) {
    const charge = row.charge_id ? chargesById.get(row.charge_id) : null;
    const serviceOn = charge?.service_on || row.received_on;
    const day = pick(serviceOn, row.received_on);
    if (!inRange(day, range)) continue;
    entradas.push({
      id: row.id,
      day,
      serviceOn,
      paidOn: row.received_on,
      source: 'operadora',
      who: nameOf(conveniosById, row.convenio_id, 'Operadora'),
      what: charge ? `Convênio · ${chargeLabel(charge)}` : 'Convênio',
      discipline: charge?.discipline || '',
      method: methodLabel(row.method),
      amountCents: row.amount_cents,
      receiptNumber: '',
      nfse: '',
      voided: Boolean(row.voided_at),
      voidReason: '',
      afterClose: false,
    });
  }

  const saidas = [];
  for (const row of expenses) {
    if (row.skipped || !row.paid_on) continue;
    const serviceOn = row.occurrence_on || row.paid_on;
    const day = pick(serviceOn, row.paid_on);
    if (!inRange(day, range)) continue;
    const category = categoriesById.get(row.category_id);
    const provider = providerByExpense.get(row.id);
    saidas.push({
      id: row.id,
      day,
      serviceOn,
      paidOn: row.paid_on,
      description: row.description,
      category: category?.system_key === 'avulsa' ? 'Gasto rápido' : (category?.name || 'Sem categoria'),
      payee: payeeFor(row, membersById, peopleById),
      kind: row.is_quick ? 'Gasto rápido' : row.is_purchase ? 'Compra' : row.recurring_id ? 'Conta fixa' : 'Saída',
      method: methodLabel(row.method),
      amountCents: row.amount_cents,
      receiptNumber: row.receipt_number || '',
      providerNumber: provider ? String(provider.number).padStart(4, '0') : '',
      providerSigned: Boolean(provider?.signed_at),
      voided: Boolean(row.voided_at),
      voidReason: row.void_reason || '',
      afterClose: after(row.created_at, closing) || after(row.voided_at, closing),
    });
  }

  const byDay = (a, b) => a.day.localeCompare(b.day) || String(a.id).localeCompare(String(b.id));
  entradas.sort(byDay);
  saidas.sort(byDay);
  return { entradas, saidas, totals: reportTotals(entradas, saidas) };
}

export function reportTotals(entradas, saidas) {
  const live = list => list.filter(row => !row.voided);
  const sum = list => list.reduce((total, row) => total + row.amountCents, 0);
  const group = (list, key) => {
    const map = new Map();
    for (const row of live(list)) map.set(row[key], (map.get(row[key]) || 0) + row.amountCents);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  };
  const inCents = sum(live(entradas));
  const outCents = sum(live(saidas));
  return {
    inCents,
    outCents,
    resultCents: inCents - outCents,
    patientsCents: sum(live(entradas).filter(row => row.source === 'paciente')),
    operatorsCents: sum(live(entradas).filter(row => row.source === 'operadora')),
    byCategory: group(saidas, 'category'),
    byMethodIn: group(entradas, 'method'),
    byMethodOut: group(saidas, 'method'),
    voidedCount: entradas.filter(row => row.voided).length + saidas.filter(row => row.voided).length,
    afterCloseCount: entradas.filter(row => row.afterClose).length + saidas.filter(row => row.afterClose).length,
    missingProvider: live(saidas).filter(row => row.providerNumber && !row.providerSigned).length,
  };
}

/** Os últimos N meses até o mês de referência (o mais antigo primeiro). */
export function lastMonths(anchorMonth, count) {
  const months = [];
  for (let index = count - 1; index >= 0; index -= 1) months.push(shiftMonth(anchorMonth, -index));
  return months;
}

/**
 * Comparação: entradas, saídas e resultado de cada mês, e as saídas por
 * categoria, com a diferença para o mês anterior.
 */
export function buildMonthComparison({ months, rowsFor }) {
  const columns = months.map(month => {
    const { totals } = rowsFor(month);
    return { month, totals, byCategory: new Map(totals.byCategory) };
  });
  const categories = [...new Set(columns.flatMap(column => [...column.byCategory.keys()]))]
    .sort((a, b) => columns.reduce((t, c) => t + (c.byCategory.get(b) || 0), 0) - columns.reduce((t, c) => t + (c.byCategory.get(a) || 0), 0));
  const change = (current, previous) => (previous ? Math.round(((current - previous) / Math.abs(previous)) * 100) : null);
  return {
    columns: columns.map((column, index) => {
      const previous = columns[index - 1];
      return {
        ...column,
        inChange: previous ? change(column.totals.inCents, previous.totals.inCents) : null,
        outChange: previous ? change(column.totals.outCents, previous.totals.outCents) : null,
      };
    }),
    categories: categories.map(name => ({
      name,
      values: columns.map(column => column.byCategory.get(name) || 0),
    })),
  };
}

/** "+12%", "−5%" ou "" (sem mês anterior ou anterior zerado). */
export function formatChange(percent) {
  if (percent == null) return '';
  if (percent === 0) return '0%';
  return `${percent > 0 ? '+' : '−'}${Math.abs(percent)}%`;
}

// ---------- rótulos e planilha ----------

export function rangeLabel(range) {
  if (range.kind === 'mes') return range.month.label;
  return `${formatDay(range.from)} a ${formatDay(range.to)}`;
}

export function fileStamp(range) {
  return range.kind === 'mes' ? range.from.slice(0, 7) : `${range.from}_a_${range.to}`;
}

export function reportSheets({ report, range, basisLabel }) {
  const { entradas, saidas, totals } = report;
  return [
    {
      name: 'Resumo',
      columns: [{ header: 'Item', width: 36 }, { header: 'Valor', width: 18, type: 'money' }],
      rows: [
        ['Período', rangeLabel(range)],
        ['Base das datas', basisLabel],
        ['Entradas de pacientes', totals.patientsCents],
        ['Entradas de operadoras', totals.operatorsCents],
        ['Total de entradas', totals.inCents],
        ['Total de saídas', totals.outCents],
        ['Resultado', totals.resultCents],
        ...totals.byCategory.map(([name, cents]) => [`Saídas · ${name}`, cents]),
      ],
    },
    {
      name: 'Entradas',
      columns: [
        { header: 'Data do serviço', width: 14, type: 'date' },
        { header: 'Data do pagamento', width: 14, type: 'date' },
        { header: 'Origem', width: 11 },
        { header: 'De', width: 30 },
        { header: 'Referente a', width: 32 },
        { header: 'Forma', width: 16 },
        { header: 'Recibo nº', width: 11 },
        { header: 'NFS-e nº', width: 11 },
        { header: 'Valor', width: 14, type: 'money' },
        { header: 'Situação', width: 30 },
      ],
      rows: entradas.map(row => [
        row.serviceOn, row.paidOn, row.source === 'operadora' ? 'Operadora' : 'Paciente', row.who, row.what, row.method,
        row.receiptNumber, row.nfse, row.amountCents,
        [row.voided ? `Anulado: ${row.voidReason}` : 'Valendo', row.afterClose ? 'depois do fechamento' : ''].filter(Boolean).join(' · '),
      ]),
    },
    {
      name: 'Saídas',
      columns: [
        { header: 'Data do serviço', width: 14, type: 'date' },
        { header: 'Data do pagamento', width: 14, type: 'date' },
        { header: 'Tipo', width: 13 },
        { header: 'Descrição', width: 34 },
        { header: 'Categoria', width: 22 },
        { header: 'Pago a', width: 26 },
        { header: 'Forma', width: 16 },
        { header: 'Comprovante nº', width: 15 },
        { header: 'Recibo do prestador', width: 18 },
        { header: 'Valor', width: 14, type: 'money' },
        { header: 'Situação', width: 30 },
      ],
      rows: saidas.map(row => [
        row.serviceOn, row.paidOn, row.kind, row.description, row.category, row.payee, row.method,
        row.receiptNumber, row.providerNumber ? `${row.providerNumber}${row.providerSigned ? ' (assinado)' : ' (falta assinar)'}` : '',
        row.amountCents,
        [row.voided ? `Anulado: ${row.voidReason}` : 'Valendo', row.afterClose ? 'depois do fechamento' : ''].filter(Boolean).join(' · '),
      ]),
    },
  ];
}

