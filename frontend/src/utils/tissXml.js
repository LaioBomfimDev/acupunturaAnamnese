// ============================================================
// Convênios, Fase 2 (03/11/2026) — guia SP/SADT, lote XML TISS 4.03.00,
// pagamento da operadora e glosa: as regras que a tela usa.
//
// O banco gera o XML do lote, calcula o hash e guarda tudo congelado
// (supabase/migrations/20261103_convenios_fase2.sql). Aqui ficam os
// espelhos, conferidos pelo teste tests/regression/convenios-fase2.test.mjs
// contra o banco e contra o XSD oficial (supabase/tiss/4.03.00/):
//  - tissText        ↔ public.tiss_ascii
//  - buildBatchXml   ↔ public.tiss_batch_xml (mesma ordem de elementos)
//  - tissLeafText    ↔ o texto que public.tiss_hash passa ao MD5
//  - guideStatusFrom ↔ public.tiss_refresh_guide_status
//  - TISS_MISSING_LABELS / TISS_WARNING_LABELS ↔ chaves de
//    public.tiss_guide_snapshot (missing barra o lote, warnings só avisa)
// Mudou um lado, muda o outro.
// ============================================================

export const TISS_NAMESPACE = 'http://www.ans.gov.br/padroes/tiss/schemas';
export const TISS_VERSION = '4.03.00';
// maxOccurs de guiaSP-SADT em ctm_guiaLote (tissGuiasV4_03_00.xsd).
export const TISS_MAX_GUIDES_PER_BATCH = 100;
// Campo 13 do manual: solicitante sem código conhecido na operadora.
export const TISS_UNKNOWN_REQUESTER_CODE = '99999999999999';

const ACCENTED = 'ÁÀÂÃÄÅáàâãäåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñÝýÿ';
const PLAIN = 'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNnYyy';
const PLAIN_BY_ACCENTED = new Map([...ACCENTED].map((char, index) => [char, PLAIN[index]]));

/**
 * Texto do XML: sem acento, só ASCII imprimível, sem & < >, espaços
 * juntados, cortado no tamanho do XSD. Assim os bytes do arquivo são os
 * mesmos em ISO-8859-1 e em UTF-8 e o hash do epílogo não depende de qual
 * das duas leituras do manual a operadora usa. Vazio vira null.
 */
export function tissText(value, max) {
  const plain = [...String(value ?? '')].map(char => PLAIN_BY_ACCENTED.get(char) ?? char).join('');
  const cleaned = plain.replace(/[^ -~]|[&<>]/g, ' ').replace(/\s+/g, ' ').trim();
  const cut = cleaned.slice(0, max).trim();
  return cut || null;
}

export function tissMoney(cents) {
  if (cents == null) return null;
  const value = Number(cents);
  const whole = Math.trunc(value / 100);
  const rest = String(Math.abs(value % 100)).padStart(2, '0');
  return `${whole}.${rest}`;
}

function el(name, value) {
  return value == null || value === '' ? '' : `<ans:${name}>${value}</ans:${name}>`;
}

function time(value) {
  return value ? String(value).slice(0, 8) : null;
}

function itemXml(item) {
  return '<ans:procedimentoExecutado>'
    + el('sequencialItem', String(item.sequence))
    + el('dataExecucao', item.executed_on)
    + el('horaInicial', time(item.start_time))
    + el('horaFinal', time(item.end_time))
    + '<ans:procedimento>'
    + el('codigoTabela', item.tuss_table)
    + el('codigoProcedimento', item.tuss_code)
    + el('descricaoProcedimento', item.tuss_term)
    + '</ans:procedimento>'
    + el('quantidadeExecutada', String(item.quantity))
    + el('reducaoAcrescimo', '1.00')
    + el('valorUnitario', tissMoney(item.unit_cents))
    + el('valorTotal', tissMoney(item.total_cents))
    + '<ans:equipeSadt><ans:codProfissional>'
    + (item.executor_kind === 'code'
      ? el('codigoPrestadorNaOperadora', item.executor_value)
      : el('cpfContratado', item.executor_value))
    + '</ans:codProfissional>'
    + el('nomeProf', item.executor_name)
    + el('conselho', item.executor_council)
    + el('numeroConselhoProfissional', item.executor_council_number)
    + el('UF', item.executor_uf)
    + el('CBOS', item.executor_cbo)
    + '</ans:equipeSadt>'
    + '</ans:procedimentoExecutado>';
}

function contractorXml(kind, value) {
  if (kind === 'code') return el('codigoPrestadorNaOperadora', value);
  if (kind === 'cnpj') return el('cnpjContratado', value);
  return el('cpfContratado', value);
}

function guideXml(batch, guide) {
  return '<ans:guiaSP-SADT>'
    + '<ans:cabecalhoGuia>'
    + el('registroANS', batch.ans_registry)
    + el('numeroGuiaPrestador', guide.guide_number)
    + '</ans:cabecalhoGuia>'
    + (guide.authorized_on
      ? '<ans:dadosAutorizacao>'
        + el('numeroGuiaOperadora', guide.operator_guide_number)
        + el('dataAutorizacao', guide.authorized_on)
        + el('senha', guide.password)
        + el('dataValidadeSenha', guide.password_valid_until)
        + '</ans:dadosAutorizacao>'
      : '')
    + '<ans:dadosBeneficiario>'
    + el('numeroCarteira', guide.card_number)
    + el('atendimentoRN', 'N')
    + '</ans:dadosBeneficiario>'
    + '<ans:dadosSolicitante><ans:contratadoSolicitante>'
    + el('codigoPrestadorNaOperadora', guide.requester_code)
    + '</ans:contratadoSolicitante>'
    + el('nomeContratadoSolicitante', guide.requester_contractor_name)
    + '<ans:profissionalSolicitante>'
    + el('nomeProfissional', guide.requester_name)
    + el('conselhoProfissional', guide.requester_council)
    + el('numeroConselhoProfissional', guide.requester_council_number)
    + el('UF', guide.requester_uf)
    + el('CBOS', guide.requester_cbo)
    + '</ans:profissionalSolicitante></ans:dadosSolicitante>'
    + '<ans:dadosSolicitacao>'
    + el('dataSolicitacao', guide.requested_on)
    + el('caraterAtendimento', guide.character_code)
    + el('indicacaoClinica', guide.clinical_indication)
    + '</ans:dadosSolicitacao>'
    + '<ans:dadosExecutante><ans:contratadoExecutante>'
    + contractorXml(guide.contractor_kind, guide.contractor_value)
    + '</ans:contratadoExecutante>'
    + el('CNES', guide.cnes)
    + '</ans:dadosExecutante>'
    + '<ans:dadosAtendimento>'
    + el('tipoAtendimento', guide.attendance_type)
    + el('indicacaoAcidente', guide.accident_code)
    + el('regimeAtendimento', guide.regime_code)
    + '</ans:dadosAtendimento>'
    + '<ans:procedimentosExecutados>' + (guide.items || []).map(itemXml).join('') + '</ans:procedimentosExecutados>'
    + el('observacao', guide.notes)
    + '<ans:valorTotal>'
    + el('valorProcedimentos', tissMoney(guide.total_cents))
    + el('valorTotalGeral', tissMoney(guide.total_cents))
    + '</ans:valorTotal>'
    + '</ans:guiaSP-SADT>';
}

/**
 * XML do lote, igual ao que o banco gera, a partir da cópia congelada
 * (tiss_batches + tiss_batch_guides + tiss_batch_items). Sem hash (string
 * vazia no epílogo) quando `hash` não vem.
 */
export function buildBatchXml(batch, guides, hash = '') {
  const ordered = [...guides].sort((a, b) => Number(a.guide_number) - Number(b.guide_number));
  return '<?xml version="1.0" encoding="ISO-8859-1"?>'
    + `<ans:mensagemTISS xmlns:ans="${TISS_NAMESPACE}">`
    + '<ans:cabecalho><ans:identificacaoTransacao>'
    + el('tipoTransacao', 'ENVIO_LOTE_GUIAS')
    + el('sequencialTransacao', batch.number)
    + el('dataRegistroTransacao', batch.generated_on)
    + el('horaRegistroTransacao', time(batch.generated_time))
    + '</ans:identificacaoTransacao>'
    + '<ans:origem><ans:identificacaoPrestador>'
    + (batch.origin_kind === 'code'
      ? el('codigoPrestadorNaOperadora', batch.origin_value)
      : batch.origin_kind === 'cnpj' ? el('CNPJ', batch.origin_value) : el('CPF', batch.origin_value))
    + '</ans:identificacaoPrestador></ans:origem>'
    + '<ans:destino>' + el('registroANS', batch.ans_registry) + '</ans:destino>'
    + el('Padrao', TISS_VERSION)
    + '</ans:cabecalho>'
    + '<ans:prestadorParaOperadora><ans:loteGuias>'
    + el('numeroLote', batch.number)
    + '<ans:guiasTISS>' + ordered.map(guide => guideXml(batch, guide)).join('') + '</ans:guiasTISS>'
    + '</ans:loteGuias></ans:prestadorParaOperadora>'
    + `<ans:epilogo><ans:hash>${hash || ''}</ans:hash></ans:epilogo>`
    + '</ans:mensagemTISS>';
}

/**
 * O texto que entra no MD5 do epílogo: o conteúdo de cada elemento-folha,
 * em ordem, sem separador, fora do epílogo. Vale para o XML que o sistema
 * gera (sem espaço entre tags, sem atributo, sem CDATA).
 */
export function tissLeafText(xml) {
  const body = String(xml).split('<ans:epilogo>')[0];
  let text = '';
  for (const match of body.matchAll(/<ans:([A-Za-z-]+)>([^<]*)<\/ans:\1>/g)) text += match[2];
  return text;
}

// ---------- situação da guia ----------

export const GUIDE_STATUS = {
  open: { label: 'Em aberto', tone: 'neutral' },
  batched: { label: 'No lote', tone: 'accent' },
  paid: { label: 'Paga', tone: 'success' },
  glosa: { label: 'Glosada', tone: 'warning' },
  appeal: { label: 'Em recurso', tone: 'warning' },
  cancelled: { label: 'Cancelada', tone: 'neutral' },
};

export function guideStatusLabel(status) {
  return GUIDE_STATUS[status]?.label || status || '';
}

/** Espelho de public.tiss_refresh_guide_status. */
export function guideStatusFrom({ inBatch, totalCents, paidCents = 0, glosaCents = 0, appealOpen = false, cancelled = false }) {
  if (cancelled) return 'cancelled';
  if (!inBatch) return 'open';
  if (paidCents >= totalCents) return 'paid';
  if (appealOpen) return 'appeal';
  if (Math.min(glosaCents, totalCents - paidCents) > 0) return 'glosa';
  return 'batched';
}

// Chaves de public.tiss_guide_snapshot → o que a pessoa faz.
export const TISS_MISSING_LABELS = {
  registro_ans: { label: 'Falta o registro ANS da operadora', where: 'operadoras' },
  credenciamento: { label: 'Falta o código do prestador (credenciamento)', where: 'operadoras' },
  carteira: { label: 'Falta o número da carteira do paciente', where: 'paciente' },
  cpf_executante: { label: 'Falta o CPF de quem atendeu', where: 'faturamento' },
  conselho_executante: { label: 'Falta o conselho de quem atendeu', where: 'faturamento' },
  cbo_executante: { label: 'Falta o CBO de quem atendeu', where: 'faturamento' },
  procedimento: { label: 'Falta o código TUSS do procedimento', where: 'operadoras' },
  valor: { label: 'Falta o valor do atendimento', where: 'areceber' },
  data_autorizacao: { label: 'Com senha ou número da operadora, informe a data da autorização', where: 'guia' },
  atendimento_no_futuro: { label: 'Atendimento com data depois de hoje', where: 'agenda' },
};

export const TISS_WARNING_LABELS = {
  indicacao_clinica: 'Sem indicação clínica: muitas operadoras pedem em terapias',
  carteira_vencida: 'A carteira estava vencida no dia do atendimento',
  sem_cnes: 'A clínica não tem CNES: a guia vai com 9999999 (pode gerar glosa 1202)',
};

// Tabela 50 (tipo de atendimento) e 36 (indicação de acidente), como no XSD.
export const ATTENDANCE_TYPES = [
  { id: '03', label: 'Outras terapias' },
  { id: '04', label: 'Consulta' },
  { id: '23', label: 'Exame' },
  { id: '02', label: 'Pequena cirurgia' },
  { id: '13', label: 'Pequeno atendimento' },
  { id: '01', label: 'Remoção' },
  { id: '08', label: 'Quimioterapia' },
  { id: '09', label: 'Radioterapia' },
  { id: '10', label: 'Terapia renal substitutiva' },
];

export const ACCIDENT_CODES = [
  { id: '9', label: 'Não é acidente' },
  { id: '0', label: 'Acidente ou doença do trabalho' },
  { id: '1', label: 'Trânsito' },
  { id: '2', label: 'Outros acidentes' },
];

export const CHARACTER_CODES = [
  { id: '1', label: 'Eletivo' },
  { id: '2', label: 'Urgência ou emergência' },
];

// Espelha o CHECK de convenio_payments.method.
export const CONVENIO_PAYMENT_METHODS = [
  { id: 'ted', label: 'TED' },
  { id: 'pix', label: 'Pix' },
  { id: 'boleto', label: 'Boleto' },
  { id: 'deposito', label: 'Depósito' },
  { id: 'outro', label: 'Outro' },
];

// ---------- montar o lote ----------

/**
 * Guias prontas para o lote, separadas por contratado (o XML leva uma
 * origem só) e em pedaços de no máximo 100.
 */
export function batchCandidates(guides) {
  const ready = (guides || []).filter(guide => guide.status === 'open' && (guide.missing || []).length === 0);
  const byContractor = new Map();
  for (const guide of ready) {
    const key = guide.contractor_key || '';
    if (!byContractor.has(key)) byContractor.set(key, []);
    byContractor.get(key).push(guide);
  }
  const groups = [];
  for (const [key, list] of byContractor) {
    list.sort((a, b) => Number(a.guide_number) - Number(b.guide_number));
    for (let start = 0; start < list.length; start += TISS_MAX_GUIDES_PER_BATCH) {
      groups.push({ contractorKey: key, contractorName: list[0].contractor_name, guides: list.slice(start, start + TISS_MAX_GUIDES_PER_BATCH) });
    }
  }
  return groups;
}

// ---------- "A receber" e Resumo ----------

function addDaysText(day, amount) {
  const [year, month, date] = day.split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1, date + amount));
  return value.toISOString().slice(0, 10);
}

/**
 * Quando a operadora deveria pagar: dia do envio do lote + prazo da
 * operadora. Sem lote enviado ou sem prazo, não há vencimento (e nada
 * fica "em atraso").
 */
export function convenioDueOn({ sentOn, termDays }) {
  if (!sentOn || !termDays) return null;
  return addDaysText(sentOn, Number(termDays));
}

/**
 * Pagamento da operadora em forma de recebimento, para as contas que já
 * existem (o que falta receber, recebido no mês, repasse quando paga).
 * Fica fora da lista de "Recebidos" dos pacientes.
 */
export function operatorReceiptsFrom(paidRows) {
  return (paidRows || []).map(row => ({
    id: `operadora:${row.lancamento}:${row.cobranca}`,
    source: 'operadora',
    charge_id: row.cobranca,
    package_id: null,
    patient_id: null,
    convenio_id: row.operadora,
    group_id: row.lancamento,
    payment_id: row.pagamento,
    amount_cents: row.valor_centavos,
    method: row.forma,
    received_on: row.pago_em,
    voided_at: null,
  }));
}

// ---------- quadros do Resumo e números do menu ----------

function plural(count, one, many) {
  return `${count} ${count === 1 ? one : many}`;
}

function shortBRL(cents) {
  const value = cents / 100;
  if (value >= 1000) return `R$ ${(value / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return `R$ ${Math.round(value).toLocaleString('pt-BR')}`;
}

/**
 * Guias, Lotes e Pagamentos e glosas no Resumo do Financeiro e no menu.
 * Carregando: traço. Falha: aparece no quadro, nunca vira zero.
 */
export function buildTissTiles({ tiss, tissError, today }) {
  const ids = ['guias', 'lotes', 'pagamentos'];
  if (tissError) {
    const failed = { value: null, display: '', line: tissError.length > 80 ? 'Não foi possível carregar' : tissError, tone: 'warning' };
    return { tiles: Object.fromEntries(ids.map(id => [id, failed])), counts: {} };
  }
  if (!tiss) {
    const waiting = { value: null, display: '', line: 'carregando…' };
    return { tiles: Object.fromEntries(ids.map(id => [id, waiting])), counts: {} };
  }
  const guides = tiss.guides || [];
  const pending = guides.filter(row => row.status === 'open' && (row.missing || []).length > 0);
  const ready = guides.filter(row => row.status === 'open' && (row.missing || []).length === 0);
  const unsent = (tiss.batches || []).filter(row => row.status === 'generated');
  const waiting = guides.filter(row => ['batched', 'glosa', 'appeal'].includes(row.status) && row.batch?.status === 'sent');
  const waitingCents = waiting.reduce((sum, row) => sum + (row.total_cents - (row.settled?.paid_cents || 0)), 0);
  const glosas = guides.filter(row => row.status === 'glosa' || row.status === 'appeal');
  const late = waiting.filter(row => {
    const due = convenioDueOn({ sentOn: row.batch?.sent_on, termDays: row.payment_term_days });
    return due && today && due < today;
  });

  return {
    tiles: {
      guias: {
        display: String(pending.length),
        line: guides.length
          ? (pending.length ? `${pending.length === 1 ? 'guia com pendência' : 'guias com pendência'} · ${plural(ready.length, 'pronta', 'prontas')}` : `nenhuma pendência · ${plural(ready.length, 'pronta', 'prontas')} para o lote`)
          : 'nenhuma guia ainda',
        tone: pending.length ? 'warning' : undefined,
      },
      lotes: {
        display: String(ready.length),
        line: unsent.length
          ? `${plural(unsent.length, 'lote gerado', 'lotes gerados')} sem marcar envio`
          : ready.length ? `${ready.length === 1 ? 'guia pronta' : 'guias prontas'} para o próximo lote` : 'nada para montar',
        tone: unsent.length ? 'warning' : undefined,
      },
      pagamentos: {
        display: waitingCents ? shortBRL(waitingCents) : '0',
        line: waiting.length
          ? `${plural(waiting.length, 'guia esperando', 'guias esperando')} a operadora${glosas.length ? ` · ${plural(glosas.length, 'glosada', 'glosadas')}` : ''}`
          : 'nada esperando a operadora',
        tone: late.length || glosas.length ? 'warning' : undefined,
      },
    },
    counts: {
      guias: { text: pending.length ? String(pending.length) : '', tone: pending.length ? 'warning' : undefined },
      lotes: { text: ready.length ? String(ready.length) : '' },
      pagamentos: { text: glosas.length ? String(glosas.length) : waiting.length ? String(waiting.length) : '', tone: glosas.length ? 'warning' : undefined },
    },
  };
}
