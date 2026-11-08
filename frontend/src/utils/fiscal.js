// ============================================================
// Notas fiscais e comprovante (04/11/2026) — regras da tela.
//
// O banco cria e acompanha a nota sozinho (20261104_notas_fiscais.sql):
// uma por recebimento do particular e uma por depósito da operadora,
// com a competência no dia do atendimento. Aqui ficam os espelhos,
// conferidos por tests/regression/notas-fiscais.test.mjs:
//  - FISCAL_MISSING_LABELS / fiscalMissing ↔ public.fiscal_missing
//  - FISCAL_STATUS ↔ CHECK fiscal_documents_status_check
// Mudou um lado, muda o outro.
// ============================================================

// Emissor Nacional da NFS-e (Simples Nacional, obrigatório desde
// 01/11/2026). A clínica pode trocar pelo emissor da prefeitura.
export const DEFAULT_EMITTER_URL = 'https://www.nfse.gov.br/EmissorNacional';

export const FISCAL_STATUS = {
  pending: { label: 'Falta emitir' },
  issued: { label: 'Emitida' },
  cancelled: { label: 'Cancelada' },
};

export const FISCAL_MISSING_LABELS = {
  documento_tomador: 'Falta o CPF ou CNPJ de quem recebe a nota (cadastro do paciente ou da operadora)',
  codigo_servico: 'Falta o código do serviço desta área (configure acima, com o contador)',
};

/** Espelho de public.fiscal_missing. */
export function fiscalMissing(doc) {
  const missing = [];
  if (!doc?.taker_document) missing.push('documento_tomador');
  if (!doc?.service_code) missing.push('codigo_servico');
  return missing;
}

// Sugestão pela lista de serviços da LC 116 (item 4). Quem decide é o
// contador: a tela mostra como sugestão, nunca grava sozinha.
export const SUGGESTED_SERVICE_CODES = {
  psicologia: { code: '04.16', label: 'Psicologia' },
  neuropsicologia: { code: '04.16', label: 'Psicologia' },
  fisioterapia: { code: '04.08', label: 'Terapia ocupacional, fisioterapia e fonoaudiologia' },
  nutricao: { code: '04.10', label: 'Nutrição' },
};

export function onlyDigits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

/** CPF 000.000.000-00 ou CNPJ 00.000.000/0000-00 (com letras desde 07/2026). */
export function formatTakerDocument(value) {
  const text = String(value ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (/^\d{11}$/.test(text)) return `${text.slice(0, 3)}.${text.slice(3, 6)}.${text.slice(6, 9)}-${text.slice(9)}`;
  if (/^[0-9A-Z]{12}\d{2}$/.test(text)) {
    return `${text.slice(0, 2)}.${text.slice(2, 5)}.${text.slice(5, 8)}/${text.slice(8, 12)}-${text.slice(12)}`;
  }
  return text;
}

/** "1234,56" (o Emissor Nacional pede vírgula). */
export function moneyForEmitter(cents) {
  const value = Number(cents || 0);
  return `${Math.trunc(value / 100)},${String(Math.abs(value % 100)).padStart(2, '0')}`;
}

/** Competência no formato do emissor: dd/mm/aaaa. */
export function dayForEmitter(day) {
  if (!day) return '';
  const [year, month, date] = String(day).slice(0, 10).split('-');
  return `${date}/${month}/${year}`;
}

/** Nota valendo de cada recebimento (grupo) e de cada depósito. */
export function fiscalBySource({ documents = [], sources = [] }) {
  const docById = new Map(documents.map(row => [row.id, row]));
  const byGroup = new Map();
  const byPayment = new Map();
  for (const source of sources) {
    if (source.released_at) continue;
    const doc = docById.get(source.document_id);
    if (!doc) continue;
    if (source.receipt_group_id) byGroup.set(source.receipt_group_id, doc);
    if (source.convenio_payment_id) byPayment.set(source.convenio_payment_id, doc);
  }
  return { byGroup, byPayment };
}

/** O que pede ação: falta emitir e nota emitida que precisa ser cancelada no emissor. */
export function fiscalQueue(documents = []) {
  const pending = documents.filter(row => row.status === 'pending');
  const toCancel = documents.filter(row => row.status === 'issued' && row.needs_cancellation);
  return { pending, toCancel, count: pending.length + toCancel.length };
}

function plural(count, one, many) {
  return `${count} ${count === 1 ? one : many}`;
}

/** Quadro do Resumo e número do menu. Carregando: traço; falha: aparece, nunca zero. */
export function buildFiscalTiles({ fiscal, fiscalError }) {
  if (fiscalError) {
    return { tiles: { notas: { value: null, display: '', line: 'Não foi possível carregar', tone: 'warning' } }, counts: {} };
  }
  if (!fiscal) return { tiles: { notas: { value: null, display: '', line: 'carregando…' } }, counts: {} };
  const { pending, toCancel, count } = fiscalQueue(fiscal.documents);
  const cents = pending.reduce((sum, row) => sum + row.amount_cents, 0);
  const missingCode = pending.filter(row => !row.service_code).length;
  return {
    tiles: {
      notas: {
        display: String(count),
        line: count
          ? [
            pending.length ? `${pending.length === 1 ? 'nota falta' : 'notas faltam'} emitir` : '',
            toCancel.length ? `${plural(toCancel.length, 'para cancelar', 'para cancelar')} no emissor` : '',
            missingCode ? 'falta código de serviço' : '',
          ].filter(Boolean).join(' · ') + (cents ? ` · ${(cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` : '')
          : 'todas as notas em dia',
        tone: count ? 'warning' : undefined,
      },
    },
    counts: { notas: { text: count ? String(count) : '', tone: count ? 'warning' : undefined } },
  };
}
