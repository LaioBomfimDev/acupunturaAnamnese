// ============================================================
// Financeiro (etapa 1, 23/10/2026) — contas da tela, sem banco.
//
// O banco grava e protege (20261023_financeiro_etapa1.sql): o valor de
// cada atendimento é gravado quando ele vira Atendido, e dinheiro
// lançado só se anula com motivo. Aqui se lê o que foi gravado e se
// monta o que a tela mostra: o que falta receber, o que falta pagar, o
// repasse de cada profissional e o resumo do mês.
//
// Dinheiro sempre em centavos inteiros. Datas sempre "AAAA-MM-DD" no
// fuso da clínica, comparadas como texto: sem Date, sem fuso no meio.
//
// Duas contas existem dos dois lados e precisam bater:
//  - resolvePrice  ↔ public.finance_resolve_price
//  - packageShare  ↔ a parte da sessão em public.finance_charge_appointment
// ============================================================

export const CLINIC_TIME_ZONE = 'America/Sao_Paulo';

// Espelha o CHECK das tabelas do financeiro (sem Convênio, que é etapa 2).
export const PAYMENT_METHODS = [
  { id: 'pix', label: 'Pix' },
  { id: 'dinheiro', label: 'Dinheiro' },
  { id: 'cartao_debito', label: 'Cartão de débito' },
  { id: 'cartao_credito', label: 'Cartão de crédito' },
  { id: 'outro', label: 'Outro' },
];

// Espelha APPOINTMENT_TYPES (services/appointmentService.js), na mesma
// ordem alfabética do campo "Tipo" da Agenda.
export const FINANCE_APPOINTMENT_TYPES = [
  { id: 'anamnesis', label: 'Anamnese' },
  { id: 'evaluation', label: 'Avaliação' },
  { id: 'feedback', label: 'Devolutiva' },
  { id: 'interview', label: 'Entrevista' },
  { id: 'first_visit', label: 'Primeira vez' },
  { id: 'return', label: 'Retorno' },
  { id: 'session', label: 'Sessão' },
];

export const PAYOUT_MODES = [
  { id: 'percent', label: '% do valor do atendimento' },
  { id: 'per_appointment', label: 'Valor fixo por atendimento' },
  { id: 'salary', label: 'Salário fixo mensal' },
  { id: 'none', label: 'Não recebe pelo sistema' },
];

export const PAYMENT_PLANS = [
  { id: 'upfront', label: 'À vista' },
  { id: 'installments', label: 'Parcelado' },
  { id: 'per_session', label: 'A cada sessão' },
];

export const PAYOUT_BASIS = [
  { id: 'on_payment', label: 'Quando o paciente paga' },
  { id: 'on_attendance', label: 'Quando o atendimento acontece' },
];

export const RECURRING_FREQUENCIES = [
  { id: 'monthly', label: 'Todo mês' },
  { id: 'weekly', label: 'Toda semana' },
  { id: 'biweekly', label: 'A cada 15 dias' },
];

export const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export function labelOf(list, id) {
  return list.find(item => item.id === id)?.label || '';
}

export function methodLabel(id) {
  return labelOf(PAYMENT_METHODS, id) || 'Outro';
}

export function typeLabel(id) {
  return labelOf(FINANCE_APPOINTMENT_TYPES, id) || 'Sem tipo';
}

// ---------- dinheiro ----------

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const BRL_WHOLE = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 });

/** R$ 150 quando é inteiro, R$ 133,33 quando tem centavos. */
export function formatBRL(cents) {
  if (cents == null || !Number.isFinite(Number(cents))) return '–';
  const value = Number(cents);
  return (value % 100 === 0 ? BRL_WHOLE : BRL).format(value / 100).replace(/[\u00a0\u202f]/g, ' ');
}

/** "150", "150,5", "1.234,56", "R$ 90" → centavos. Vazio ou inválido → null. */
export function parseBRLInput(text) {
  const raw = String(text ?? '').replace(/R\$/i, '').replace(/\s/g, '');
  if (!raw) return null;
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$|^\d+(\.\d{1,2})$/.test(raw)) return null;
  let normalized;
  if (raw.includes(',')) normalized = raw.replace(/\./g, '').replace(',', '.');
  else if (/^\d+\.\d{1,2}$/.test(raw)) normalized = raw;
  else normalized = raw.replace(/\./g, '');
  const value = Math.round(Number(normalized) * 100);
  return Number.isFinite(value) ? value : null;
}

/** Centavos → texto do campo ("150" ou "133,33"). */
export function centsToInput(cents) {
  if (cents == null) return '';
  const value = Number(cents);
  if (value % 100 === 0) return String(value / 100);
  return (value / 100).toFixed(2).replace('.', ',');
}

/** Para os quadros: R$ 18.420 vira "18,4 mil"; abaixo de mil fica inteiro. */
export function formatShortBRL(cents) {
  if (cents == null) return '–';
  const reais = Math.round(Number(cents) / 100);
  if (Math.abs(reais) < 1000) return formatBRL(reais * 100);
  const thousands = reais / 1000;
  const text = (Math.round(thousands * 10) / 10).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  return `${text} mil`;
}

// ---------- datas (texto AAAA-MM-DD) ----------

export function todayInClinic(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: CLINIC_TIME_ZONE }).format(now);
}

function parts(day) {
  const [year, month, date] = String(day).split('-').map(Number);
  return { year, month, date };
}

function toKey(year, month, date) {
  return `${year}-${String(month).padStart(2, '0')}-${String(date).padStart(2, '0')}`;
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addDays(day, amount) {
  const { year, month, date } = parts(day);
  const value = new Date(Date.UTC(year, month - 1, date + amount));
  return toKey(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
}

export function daysBetween(from, to) {
  const a = parts(from);
  const b = parts(to);
  return Math.round((Date.UTC(b.year, b.month - 1, b.date) - Date.UTC(a.year, a.month - 1, a.date)) / 86400000);
}

function weekdayOf(day) {
  const { year, month, date } = parts(day);
  return new Date(Date.UTC(year, month - 1, date)).getUTCDay();
}

export function formatDay(day) {
  if (!day) return '–';
  const { year, month, date } = parts(day);
  return `${String(date).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
}

export function formatShortDay(day) {
  if (!day) return '–';
  const { month, date } = parts(day);
  return `${String(date).padStart(2, '0')}/${String(month).padStart(2, '0')}`;
}

/** Mês que contém `day`: { key: '2026-10', from, to, label: 'outubro de 2026' }. */
export function monthOf(day) {
  const { year, month } = parts(day);
  return {
    key: `${year}-${String(month).padStart(2, '0')}`,
    from: toKey(year, month, 1),
    to: toKey(year, month, daysInMonth(year, month)),
    label: `${MONTHS[month - 1]} de ${year}`,
  };
}

export function shiftMonth(month, amount) {
  const { year, month: index } = parts(`${month.key}-01`);
  const total = year * 12 + (index - 1) + amount;
  return monthOf(toKey(Math.floor(total / 12), (total % 12) + 1, 1));
}

export function inRange(day, range) {
  return Boolean(day) && day >= range.from && day <= range.to;
}

// ---------- valores ----------

/**
 * Valor de um atendimento pela tabela. Mesma ordem do banco: tipo do
 * profissional > tipo da instituição > padrão do profissional > padrão
 * da instituição. Devolve também de onde veio, para a tela dizer.
 */
export function resolvePrice(prices, { discipline, type = null, professionalId = null }) {
  const candidates = (prices || []).filter(row => row.active !== false
    && row.discipline === discipline
    && (row.appointment_type == null || row.appointment_type === type)
    && (row.professional_id == null || row.professional_id === professionalId));
  const rank = row => (row.appointment_type == null ? 2 : 0) + (row.professional_id == null ? 1 : 0);
  const best = [...candidates].sort((a, b) => rank(a) - rank(b))[0];
  if (!best) return { cents: null, source: null };
  const source = `${best.professional_id == null ? 'inst' : 'own'}-${best.appointment_type == null ? 'default' : 'type'}`;
  return { cents: best.price_cents, source };
}

/**
 * Parte de uma sessão de pacote: o que falta do valor ÷ as sessões que
 * faltam na previsão; a última prevista leva o resto. Passou do previsto:
 * 0 quando o pacote "não cobra", null quando a sessão vira avulsa.
 */
export function packageShare({ totalCents, discountCents = 0, usedCents, done, planned, overPlan = 'free' }) {
  if (done >= planned) return overPlan === 'free' ? 0 : null;
  const remaining = totalCents - discountCents - usedCents;
  if (remaining <= 0) return 0;
  const left = planned - done;
  if (left <= 1) return remaining;
  return Math.floor(remaining / left);
}

/** Simulação da Configuração: sessões com a previsão mudando no meio. */
export function simulateClosedPackage({ totalCents, planned, changeAfter = null, newPlanned = null, sessions }) {
  const shares = [];
  let used = 0;
  for (let index = 0; index < sessions; index += 1) {
    const currentPlanned = changeAfter != null && index >= changeAfter ? newPlanned : planned;
    const share = packageShare({ totalCents, usedCents: used, done: index, planned: currentPlanned, overPlan: 'free' });
    shares.push(share);
    used += share;
  }
  return shares;
}

/** Pacote de sessões contadas: valor por sessão e quanto fica abaixo do avulso. */
export function packageSizeInfo({ totalCents, sessions, singleCents }) {
  const perSession = sessions > 0 ? Math.round(totalCents / sessions) : null;
  const discountPercent = singleCents > 0 && perSession != null
    ? Math.round((1 - perSession / singleCents) * 100)
    : null;
  return { perSession, discountPercent };
}

/** Parcelas como o banco gera: iguais, o resto na última. */
export function splitInstallments(totalCents, count) {
  const n = Math.max(1, Math.floor(count));
  const base = Math.floor(totalCents / n);
  return Array.from({ length: n }, (_, index) => base + (index === n - 1 ? totalCents - base * n : 0));
}

// ---------- o que falta receber ----------

function sumBy(rows, key) {
  const map = new Map();
  for (const row of rows) {
    if (!row[key]) continue;
    map.set(row[key], (map.get(row[key]) || 0) + row.amount_cents);
  }
  return map;
}

function liveReceipts(receipts) {
  return (receipts || []).filter(row => !row.voided_at);
}

function packageChargesInOrder(charges, packageId) {
  return (charges || [])
    .filter(row => row.package_id === packageId && !row.voided_at)
    .sort((a, b) => (a.session_number ?? Infinity) - (b.session_number ?? Infinity)
      || String(a.created_at || '').localeCompare(String(b.created_at || '')));
}

/** Parcelas com o desconto do encerramento tirado das últimas. */
function installmentsAfterDiscount(installments, discountCents) {
  const list = [...installments].sort((a, b) => a.number - b.number).map(row => ({ ...row }));
  let left = discountCents || 0;
  for (let index = list.length - 1; index >= 0 && left > 0; index -= 1) {
    const cut = Math.min(left, list[index].amount_cents);
    list[index].amount_cents -= cut;
    left -= cut;
  }
  return list.filter(row => row.amount_cents > 0);
}

/** O que o pacote cobra, na ordem em que o pagamento vai cobrindo. */
function packageDues(pkg, charges, installments) {
  if (pkg.payment_plan === 'per_session') {
    return packageChargesInOrder(charges, pkg.id)
      .filter(row => (row.price_cents || 0) > 0)
      .map(row => ({
        kind: row.source === 'package_rest' ? 'rest' : 'session',
        dueOn: row.service_on,
        amount: row.price_cents,
        chargeId: row.id,
        sessionNumber: row.session_number,
        professionalId: row.professional_id,
      }));
  }
  const own = (installments || []).filter(row => row.package_id === pkg.id);
  return installmentsAfterDiscount(own, pkg.discount_cents).map(row => ({
    kind: 'installment',
    dueOn: row.due_on,
    amount: row.amount_cents,
    installmentNumber: row.number,
    professionalId: pkg.professional_id,
  }));
}

/**
 * Tudo o que falta receber, item por item: atendimento avulso feito e não
 * pago (vence no dia do atendimento), parcela de pacote, sessão de pacote
 * "a cada sessão". Também o atendimento que ficou sem valor na tabela e o
 * crédito de quem pagou um atendimento que deixou de valer.
 */
export function buildReceivables({ charges = [], packages = [], installments = [], receipts = [], today }) {
  const live = liveReceipts(receipts);
  const paidByCharge = sumBy(live, 'charge_id');
  const paidByPackage = sumBy(live, 'package_id');
  const items = [];
  const missingPrice = [];
  const credits = new Map();

  for (const charge of charges) {
    if (charge.package_id || charge.source !== 'appointment') continue;
    const paid = paidByCharge.get(charge.id) || 0;
    if (charge.voided_at) {
      if (paid > 0) credits.set(charge.patient_id, (credits.get(charge.patient_id) || 0) + paid);
      continue;
    }
    if (charge.price_cents == null) {
      missingPrice.push(charge);
      continue;
    }
    const open = charge.price_cents - paid;
    if (open <= 0) continue;
    items.push({
      key: `charge:${charge.id}`,
      kind: 'charge',
      patientId: charge.patient_id,
      professionalId: charge.professional_id,
      discipline: charge.discipline,
      appointmentType: charge.appointment_type,
      chargeId: charge.id,
      dueOn: charge.service_on,
      totalCents: charge.price_cents,
      openCents: open,
    });
  }

  for (const pkg of packages) {
    if (pkg.status === 'voided') continue;
    let paid = paidByPackage.get(pkg.id) || 0;
    for (const due of packageDues(pkg, charges, installments)) {
      const covered = Math.min(paid, due.amount);
      paid -= covered;
      const open = due.amount - covered;
      if (open <= 0) continue;
      items.push({
        key: `package:${pkg.id}:${due.kind}:${due.chargeId || due.installmentNumber}`,
        kind: due.kind,
        patientId: pkg.patient_id,
        professionalId: due.professionalId || pkg.professional_id,
        discipline: pkg.discipline,
        packageId: pkg.id,
        packageName: pkg.name,
        sessionNumber: due.sessionNumber ?? null,
        sessionsPlanned: pkg.sessions_planned,
        installmentNumber: due.installmentNumber ?? null,
        installments: pkg.installments,
        dueOn: due.dueOn,
        totalCents: due.amount,
        openCents: open,
      });
    }
  }

  for (const item of items) {
    item.late = Boolean(today) && item.dueOn < today;
    item.daysLate = item.late ? daysBetween(item.dueOn, today) : 0;
  }
  items.sort((a, b) => (a.late === b.late ? 0 : a.late ? -1 : 1) || a.dueOn.localeCompare(b.dueOn));

  return { items, missingPrice, credits };
}

/** Itens a receber de cada paciente, com o total e o atraso. */
export function groupReceivablesByPatient(items) {
  const groups = new Map();
  for (const item of items) {
    const group = groups.get(item.patientId) || { patientId: item.patientId, items: [], openCents: 0, lateCents: 0, oldestDue: item.dueOn };
    group.items.push(item);
    group.openCents += item.openCents;
    if (item.late) group.lateCents += item.openCents;
    if (item.dueOn < group.oldestDue) group.oldestDue = item.dueOn;
    groups.set(item.patientId, group);
  }
  return [...groups.values()].sort((a, b) => (b.lateCents > 0) - (a.lateCents > 0) || a.oldestDue.localeCompare(b.oldestDue));
}

/**
 * Divide um recebimento entre os itens escolhidos, na ordem da lista
 * (o mais antigo primeiro), e entre as formas de pagamento. Devolve as
 * linhas que vão para o banco: uma por item e por forma.
 */
export function allocateReceipt(items, splits) {
  const targets = items.map(item => ({ item, left: item.openCents }));
  const rows = [];
  for (const split of splits) {
    let amount = split.amountCents;
    for (const target of targets) {
      if (amount <= 0) break;
      if (target.left <= 0) continue;
      const part = Math.min(amount, target.left);
      target.left -= part;
      amount -= part;
      const existing = rows.find(row => row.method === split.method && row.key === target.item.key);
      if (existing) existing.amount_cents += part;
      else rows.push({
        key: target.item.key,
        method: split.method,
        amount_cents: part,
        ...(target.item.chargeId && !target.item.packageId ? { charge_id: target.item.chargeId } : { package_id: target.item.packageId }),
      });
    }
    if (amount > 0) return { rows: [], error: 'O valor passa do que foi escolhido para pagar.' };
  }
  for (const row of rows) delete row.key;
  return { rows, error: '' };
}

// ---------- repasse ----------

/** Quanto de cada atendimento já foi pago (0 a 1), pacote a pacote. */
export function chargePaidFractions({ charges = [], packages = [], receipts = [] }) {
  const live = liveReceipts(receipts);
  const paidByCharge = sumBy(live, 'charge_id');
  const paidByPackage = sumBy(live, 'package_id');
  const fractions = new Map();

  for (const charge of charges) {
    if (charge.voided_at || charge.package_id) continue;
    if (charge.price_cents == null) fractions.set(charge.id, 0);
    else if (charge.price_cents === 0) fractions.set(charge.id, 1);
    else fractions.set(charge.id, Math.min(1, (paidByCharge.get(charge.id) || 0) / charge.price_cents));
  }

  for (const pkg of packages) {
    let paid = paidByPackage.get(pkg.id) || 0;
    for (const charge of packageChargesInOrder(charges, pkg.id)) {
      const price = charge.price_cents || 0;
      if (price === 0) { fractions.set(charge.id, 1); continue; }
      const covered = Math.min(paid, price);
      paid -= covered;
      fractions.set(charge.id, covered / price);
    }
  }
  return fractions;
}

/** Jeito de receber de cada pessoa (linha sem área e sem tipo). */
export function baseRuleOf(rules, professionalId) {
  return (rules || []).find(row => row.professional_id === professionalId && !row.discipline && !row.appointment_type) || null;
}

export function describeRule(base, overrides = []) {
  if (!base) return 'Ainda não configurado';
  if (base.mode === 'salary') return 'Salário fixo mensal';
  if (base.mode === 'none') return 'Não recebe pelo sistema';
  const main = base.mode === 'percent'
    ? `${String(Number(base.percent)).replace('.', ',')}% do valor do atendimento`
    : `${formatBRL(base.amount_cents)} por atendimento`;
  return overrides.length ? `${main} · ${overrides.length} ${overrides.length === 1 ? 'exceção' : 'exceções'}` : main;
}

/**
 * Repasse de cada profissional. O devido é acumulado (desde o início do
 * financeiro), para nada se perder entre um mês e outro: pela regra da
 * instituição, conta o atendimento feito ou só a parte já paga pelo
 * paciente. O mês mostra o que foi gerado e pago nele.
 */
export function buildPayouts({ charges = [], packages = [], receipts = [], expenses = [], repasseCategoryId, basis = 'on_payment', month }) {
  const fractions = basis === 'on_payment' ? chargePaidFractions({ charges, packages, receipts }) : null;
  const byProfessional = new Map();
  const entry = id => {
    if (!byProfessional.has(id)) {
      byProfessional.set(id, { professionalId: id, monthCount: 0, monthGeneratedCents: 0, monthPayoutCents: 0, dueCents: 0, paidCents: 0, monthPaidCents: 0 });
    }
    return byProfessional.get(id);
  };

  for (const charge of charges) {
    if (charge.voided_at || !charge.professional_id) continue;
    const row = entry(charge.professional_id);
    const fraction = fractions ? (fractions.get(charge.id) ?? 0) : 1;
    row.dueCents += (charge.payout_cents || 0) * fraction;
    if (month && inRange(charge.service_on, month)) {
      if (charge.source === 'appointment') row.monthCount += 1;
      row.monthGeneratedCents += charge.price_cents || 0;
      row.monthPayoutCents += charge.payout_cents || 0;
    }
  }

  for (const expense of expenses) {
    if (expense.voided_at || expense.skipped || !expense.paid_on || !expense.professional_id) continue;
    if (expense.category_id !== repasseCategoryId) continue;
    const row = entry(expense.professional_id);
    row.paidCents += expense.amount_cents;
    if (month && inRange(expense.paid_on, month)) row.monthPaidCents += expense.amount_cents;
  }

  for (const row of byProfessional.values()) {
    row.dueCents = Math.round(row.dueCents);
    row.balanceCents = row.dueCents - row.paidCents;
  }
  return byProfessional;
}

// ---------- saídas fixas e o que falta pagar ----------

/** Vencimentos de uma saída fixa entre duas datas (inclusive). */
export function recurringOccurrences(rec, from, to) {
  if (!rec || rec.active === false) return [];
  const start = rec.starts_on > from ? rec.starts_on : from;
  const end = rec.ends_on && rec.ends_on < to ? rec.ends_on : to;
  if (start > end) return [];
  const days = [];

  if (rec.frequency === 'monthly') {
    let { year, month } = parts(start);
    for (let guard = 0; guard < 600; guard += 1) {
      const day = toKey(year, month, Math.min(rec.day_of_month, daysInMonth(year, month)));
      if (day > end) break;
      if (day >= start) days.push(day);
      month += 1;
      if (month > 12) { month = 1; year += 1; }
    }
    return days;
  }

  const step = rec.frequency === 'biweekly' ? 14 : 7;
  // A quinzena conta a partir da primeira vez depois do início da saída.
  let day = rec.starts_on;
  while (weekdayOf(day) !== Number(rec.weekday)) day = addDays(day, 1);
  if (day < start) {
    const jumps = Math.ceil(daysBetween(day, start) / step);
    day = addDays(day, jumps * step);
  }
  for (let guard = 0; day <= end && guard < 2000; guard += 1) {
    days.push(day);
    day = addDays(day, step);
  }
  return days;
}

export function describeRecurring(rec) {
  if (rec.frequency === 'monthly') return `todo dia ${rec.day_of_month}`;
  const weekday = WEEKDAYS[rec.weekday] || '';
  const article = rec.weekday === 0 || rec.weekday === 6 ? 'todo' : 'toda';
  return rec.frequency === 'weekly' ? `${article} ${weekday}` : `a cada 15 dias, ${weekday}`;
}

/**
 * O que falta pagar até `until`: vencimento de saída fixa sem pagamento
 * (desde a data de início do financeiro), saída lançada "a pagar" e o
 * repasse que ainda não foi pago a cada profissional.
 */
export function buildPayables({ recurring = [], expenses = [], startsOn, until, today, payouts = null }) {
  const settled = new Set(expenses
    .filter(row => row.recurring_id && !row.voided_at)
    .map(row => `${row.recurring_id}:${row.occurrence_on}`));
  const items = [];

  for (const rec of recurring) {
    const from = startsOn && startsOn > rec.starts_on ? startsOn : rec.starts_on;
    for (const day of recurringOccurrences(rec, from, until)) {
      if (settled.has(`${rec.id}:${day}`)) continue;
      items.push({
        key: `recurring:${rec.id}:${day}`,
        kind: 'recurring',
        recurringId: rec.id,
        occurrenceOn: day,
        dueOn: day,
        description: rec.description,
        categoryId: rec.category_id,
        professionalId: rec.professional_id || null,
        personId: rec.person_id || null,
        amountCents: rec.amount_cents ?? null,
      });
    }
  }

  for (const expense of expenses) {
    if (expense.voided_at || expense.skipped || expense.paid_on || !expense.due_on) continue;
    items.push({
      key: `pending:${expense.id}`,
      kind: 'pending',
      expenseId: expense.id,
      dueOn: expense.due_on,
      description: expense.description,
      categoryId: expense.category_id,
      professionalId: expense.professional_id || null,
      personId: expense.person_id || null,
      amountCents: expense.amount_cents,
    });
  }

  if (payouts) {
    for (const row of payouts.values()) {
      if (row.balanceCents <= 0) continue;
      items.push({
        key: `payout:${row.professionalId}`,
        kind: 'payout',
        professionalId: row.professionalId,
        dueOn: until,
        description: 'Repasse',
        amountCents: row.balanceCents,
      });
    }
  }

  for (const item of items) item.late = item.kind !== 'payout' && Boolean(today) && item.dueOn < today;
  items.sort((a, b) => (a.late === b.late ? 0 : a.late ? -1 : 1) || a.dueOn.localeCompare(b.dueOn));
  return items;
}

// ---------- resumo do mês ----------

export function buildMonthSummary({ receipts = [], expenses = [], charges = [], packages = [], receivables, payables, month, today }) {
  const chargeById = new Map(charges.map(row => [row.id, row]));
  const packageById = new Map(packages.map(row => [row.id, row]));
  const monthReceipts = liveReceipts(receipts).filter(row => inRange(row.received_on, month));
  const monthExpenses = expenses.filter(row => !row.voided_at && !row.skipped && row.paid_on && inRange(row.paid_on, month));

  const byArea = new Map();
  const byMethod = new Map();
  for (const row of monthReceipts) {
    const area = row.charge_id ? chargeById.get(row.charge_id)?.discipline : packageById.get(row.package_id)?.discipline;
    byArea.set(area || 'outra', (byArea.get(area || 'outra') || 0) + row.amount_cents);
    byMethod.set(row.method, (byMethod.get(row.method) || 0) + row.amount_cents);
  }
  const byCategory = new Map();
  for (const row of monthExpenses) byCategory.set(row.category_id, (byCategory.get(row.category_id) || 0) + row.amount_cents);

  const inCents = monthReceipts.reduce((total, row) => total + row.amount_cents, 0);
  const outCents = monthExpenses.reduce((total, row) => total + row.amount_cents, 0);
  const openItems = receivables?.items || [];
  const lateItems = openItems.filter(item => item.late);
  const monthPayables = (payables || []).filter(item => item.kind === 'payout' || item.dueOn <= month.to);
  const unknownAmounts = monthPayables.filter(item => item.amountCents == null).length;

  return {
    inCents,
    outCents,
    resultCents: inCents - outCents,
    receiptCount: new Set(monthReceipts.map(row => row.group_id)).size,
    expenseCount: monthExpenses.length,
    receivableCents: openItems.reduce((total, item) => total + item.openCents, 0),
    receivableCount: openItems.length,
    lateCents: lateItems.reduce((total, item) => total + item.openCents, 0),
    latePatients: new Set(lateItems.map(item => item.patientId)).size,
    payableCents: monthPayables.reduce((total, item) => total + (item.amountCents || 0), 0),
    payableCount: monthPayables.length,
    payableLate: monthPayables.filter(item => item.late).length,
    payableUnknown: unknownAmounts,
    payoutCents: monthPayables.filter(item => item.kind === 'payout').reduce((total, item) => total + item.amountCents, 0),
    byArea: [...byArea.entries()].sort((a, b) => b[1] - a[1]),
    byMethod: [...byMethod.entries()].sort((a, b) => b[1] - a[1]),
    byCategory: [...byCategory.entries()].sort((a, b) => b[1] - a[1]),
    isCurrentMonth: Boolean(today) && inRange(today, month),
  };
}

// ---------- configuração ----------

/** Quem entra em "Como cada um recebe": a equipe ativa, quem atende primeiro. */
export function payableMembers(members) {
  return (members || [])
    .filter(member => member.is_active !== false)
    .sort((a, b) => (a.has_agenda === false) - (b.has_agenda === false)
      || String(a.full_name || '').localeCompare(String(b.full_name || ''), 'pt-BR'));
}

/**
 * As quatro partes da Configuração e se cada uma está pronta. Valores:
 * toda área de quem atende tem valor padrão. Pacotes: há modelo ou a
 * administração disse que não vende. Equipe: quem atende tem jeito de
 * receber. Saídas: há saída fixa ou a administração conferiu.
 */
export function buildConfigStatus({ settings, prices = [], models = [], rules = [], members = [], recurring = [] }) {
  const attending = (members || []).filter(member => member.is_active !== false && member.has_agenda !== false);
  const areas = [...new Set(attending.flatMap(member => member.disciplines || []))];
  const withDefault = new Set(prices.filter(row => !row.professional_id && !row.appointment_type).map(row => row.discipline));
  const missingAreas = areas.filter(area => !withDefault.has(area));
  const configured = attending.filter(member => baseRuleOf(rules, member.id));

  const valores = withDefault.size > 0 && missingAreas.length === 0
    ? { ok: true, line: `${withDefault.size} ${withDefault.size === 1 ? 'área com valor' : 'áreas com valor'}` }
    : { ok: false, line: withDefault.size === 0 ? 'nenhuma área com valor' : `${missingAreas.length} ${missingAreas.length === 1 ? 'área sem valor' : 'áreas sem valor'}` };
  const pacotes = models.length > 0 || settings?.packages_reviewed
    ? { ok: true, line: models.length ? `${models.length} ${models.length === 1 ? 'modelo' : 'modelos'}` : 'a clínica não vende pacote' }
    : { ok: false, line: 'conferir os pacotes' };
  const equipe = attending.length > 0 && configured.length === attending.length
    ? { ok: true, line: `${configured.length} ${configured.length === 1 ? 'pessoa configurada' : 'pessoas configuradas'}` }
    : { ok: false, line: `${configured.length} de ${attending.length} ${attending.length === 1 ? 'que atende' : 'que atendem'}` };
  const saidas = recurring.length > 0 || settings?.expenses_reviewed
    ? { ok: true, line: recurring.length ? `${recurring.length} ${recurring.length === 1 ? 'saída fixa' : 'saídas fixas'}` : 'sem saída fixa' }
    : { ok: false, line: 'conferir as saídas fixas' };

  const steps = { valores, pacotes, equipe, saidas };
  return { ...steps, started: Boolean(settings), readyCount: Object.values(steps).filter(step => step.ok).length };
}

/** Linha de quem paga ou recebe, para as listas. */
export function payeeName({ professionalId, personId }, { membersById, peopleById }) {
  if (professionalId) return membersById.get(professionalId)?.full_name || 'Profissional';
  if (personId) {
    const person = peopleById.get(personId);
    return person ? `${person.name}${person.role_label ? ` · ${person.role_label}` : ''}` : 'Pessoa';
  }
  return '';
}
