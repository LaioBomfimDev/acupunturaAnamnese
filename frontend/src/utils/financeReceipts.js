// ============================================================
// Recibos no desenho dos modelos da clínica (10/11/2026): o que vai em
// cada linha da folha. Prestador (modelo 07, 20261110c) e cliente
// (modelo 08, na numeração do comprovante de 20261104). A folha em si é
// components/financeiro/ClinicReceiptSheet.jsx.
// ============================================================

import { formatDay, formatPersonDocument, methodLabel, placeFromAddress, todayInClinic } from './finance.js';
import { formatTakerDocument } from './fiscal.js';

/** Opções do modelo e qual marcar, a partir da forma gravada. */
export function methodChoices(options, method) {
  const pick = {
    pix: 'PIX',
    dinheiro: 'Dinheiro',
    transferencia: 'Transferência',
    cartao_debito: 'Cartão',
    cartao_credito: 'Cartão',
  }[method];
  const known = options.includes(pick) ? pick : null;
  const other = known ? '' : ({ boleto: 'Boleto', outro: 'Outro', cartao_debito: 'Cartão de débito', cartao_credito: 'Cartão de crédito' }[method] || 'Outro');
  return options.map(label => (label === 'Outro'
    ? `( ${known ? ' ' : 'X'} ) Outro${known ? '' : other !== 'Outro' ? `: ${other}` : ''}`
    : `( ${label === known ? 'X' : ' '} ) ${label}`)).join('   ');
}


const PROVIDER_METHODS = ['PIX', 'Transferência', 'Dinheiro', 'Outro'];

export function providerNumber(number) {
  return String(number).padStart(4, '0');
}

/** Recibo de prestador valendo de uma saída (ou null). */
export function liveProviderReceipt(fin, expenseId) {
  return (fin.data.providerReceipts || []).find(row => row.expense_id === expenseId && !row.voided_at) || null;
}

/** Folha do modelo 07 a partir do recibo gravado. */
export function providerSheetProps(profile, receipt) {
  const clinicName = profile?.clinic?.name || profile?.clinic_name || 'a clínica';
  return {
    profile,
    kindLabel: 'Recibo de pagamento ao prestador',
    title: 'Recibo de pagamento ao prestador de serviços',
    number: providerNumber(receipt.number),
    issuedOn: receipt.issued_on,
    fields: [
      { label: 'Prestador(a)', value: receipt.provider_name },
      { label: 'CPF/CNPJ', value: receipt.provider_document ? formatPersonDocument(receipt.provider_document) : '' },
      { label: 'Serviço(s) prestado(s)', value: receipt.services },
      { label: 'Período de referência', value: receipt.period_text || '' },
    ],
    amountCents: receipt.amount_cents,
    methodLine: methodChoices(PROVIDER_METHODS, receipt.method),
    paidOn: receipt.paid_on,
    declaration: `Declaro, para os devidos fins, que recebi da ${clinicName} o valor acima indicado, referente aos serviços descritos neste recibo.`,
    place: receipt.place_label || '',
    signatureLabel: 'Assinatura do(a) prestador(a) / recebedor(a)',
    voided: receipt.voided_at ? { on: todayInClinic(new Date(receipt.voided_at)), reason: receipt.void_reason } : null,
  };
}


const CLIENT_METHODS = ['PIX', 'Cartão', 'Dinheiro', 'Transferência', 'Outro'];

/** Datas dos atendimentos pagos: "05/11/2026" ou "03/11/2026, 10/11/2026". */
function serviceDaysText(days) {
  const unique = [...new Set(days.filter(Boolean))].sort();
  if (!unique.length) return '';
  if (unique.length > 6) return `de ${formatDay(unique[0])} a ${formatDay(unique[unique.length - 1])} (${unique.length} atendimentos)`;
  return unique.map(formatDay).join(', ');
}

/** Folha do modelo 08 a partir do recebimento (um grupo de finance_receipts). */
export function clientSheetProps({ fin, number, group, doc, what, serviceDays, patient }) {
  const total = group.rows.reduce((sum, row) => sum + row.amount_cents, 0);
  const methods = [...new Set(group.rows.map(row => row.method))];
  const methodLine = methods.length === 1
    ? methodChoices(CLIENT_METHODS, methods[0])
    // Pago de mais de um jeito: marca Outro e diz quais.
    : `${methodChoices(CLIENT_METHODS, 'outro')}: ${methods.map(methodLabel).join(' + ')}`;
  const payer = doc?.taker_name || patient || 'paciente';
  const clinic = fin.profile?.clinic || null;
  return {
    profile: fin.profile,
    kindLabel: 'Recibo de pagamento do cliente',
    title: 'Recibo de pagamento do cliente',
    number: String(number).padStart(4, '0'),
    issuedOn: todayInClinic(),
    fields: [
      { label: 'Pagador(a) / responsável financeiro', value: payer },
      { label: 'CPF/CNPJ do(a) pagador(a)', value: doc?.taker_document ? formatTakerDocument(doc.taker_document) : '' },
      { label: 'Paciente', value: patient && patient !== payer ? patient : '' },
      { label: 'Serviço(s) pago(s)', value: what || doc?.description || 'Atendimento' },
      { label: 'Data(s) do atendimento', value: serviceDaysText(serviceDays || []) },
    ],
    amountCents: total,
    methodLine,
    paidOn: group.receivedOn,
    declaration: 'Declaramos o recebimento do valor acima identificado, referente ao(s) serviço(s) descrito(s) neste recibo.',
    place: placeFromAddress(clinic?.address),
    signatureLabel: 'Assinatura / identificação do responsável pela clínica',
    note: doc?.status === 'issued'
      ? `Nota fiscal de serviço (NFS-e) nº ${doc.nfse_number}${doc.access_key ? `, chave ${doc.access_key}` : ''}.`
      : 'Este recibo não substitui a nota fiscal de serviço (NFS-e).',
  };
}


// ---------- comprovante de despesa no pacote do mês ----------

/** Comprovante de despesa na mesma folha dos recibos (pacote do contador). */
export function expenseSheetProps(profile, expense, { category = '', payee = '', paidBy = '', items = [] } = {}) {
  const itemsText = items.length
    ? items.map(item => `${String(Number(item.quantity)).replace('.', ',')} × ${item.description}`).join('; ')
    : '';
  return {
    profile,
    kindLabel: expense.is_purchase ? 'Recibo de compra' : 'Comprovante de despesa',
    numberLabel: expense.is_purchase ? 'Recibo nº' : 'Comprovante nº',
    amountLabel: 'Valor pago',
    title: expense.is_purchase ? 'Recibo de compra' : 'Comprovante de despesa',
    number: expense.receipt_number,
    issuedOn: expense.paid_on,
    fields: [
      { label: 'Descrição', value: expense.description },
      { label: 'Itens', value: itemsText },
      { label: 'Referente ao vencimento', value: expense.occurrence_on ? formatDay(expense.occurrence_on) : '' },
      { label: 'Categoria', value: category },
      { label: 'Pago a', value: payee },
      { label: 'Pago por', value: paidBy },
    ],
    amountCents: expense.amount_cents,
    methodLine: methodLabel(expense.method),
    paidOn: expense.paid_on,
    declaration: 'Comprovante interno de controle de despesas da clínica. Não tem valor fiscal e não substitui o boleto pago nem a nota fiscal do fornecedor.',
    place: placeFromAddress(profile?.clinic?.address),
    signatureLabel: 'Assinatura / identificação do responsável pela clínica',
    voided: expense.voided_at ? { on: todayInClinic(new Date(expense.voided_at)), reason: expense.void_reason } : null,
  };
}
