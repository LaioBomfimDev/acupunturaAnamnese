// ============================================================
// SHARED: consultas que a assistente pede ao aparelho (31/10/2026).
//
// A assistente não lê o banco. Quando a pergunta pede um dado (por
// enquanto, só os horários vagos de quem atende num dia), o Gemini
// devolve o pedido em `consulta`; o aparelho de quem perguntou faz a
// conta com o próprio login (a mesma permissão da tela e a mesma conta
// de "Copiar horários vagos", utils/agendaFreeSlots.js) e manda de volta
// só o resultado em `dados`. Nunca vai nome de paciente: só horários e o
// nome de quem atende. Espelho de frontend/src/utils/clinicAssistant.js
// (tipos e motivos; tests/regression/clinic-assistant.test.mjs confere).
// ============================================================

// 01/11/2026 (caminho A): além dos horários vagos, contagens da clínica
// sem paciente: atendimentos do dia, evoluções faltando, escalas
// aplicadas no mês e pacientes sem retorno. Só números e nomes da equipe.
export const ASSISTANT_CONSULTAS = [
  'horarios_vagos', 'atendimentos_dia', 'evolucoes_pendentes', 'escalas_aplicadas', 'retornos_pendentes', 'financeiro',
];

export const CONSULTA_MOTIVOS = [
  'sem_jornada', 'feriado', 'passado', 'nao_encontrado', 'ambiguo', 'sem_agenda', 'erro', 'sem_permissao', 'periodo_invalido', 'limite_periodo', 'limite_linhas', 'filtro_invalido',
];

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

function text(value: unknown, max: number) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : '';
}

/** Pedido de consulta vindo do Gemini; null quando não serve. */
export function readConsulta(raw: unknown) {
  const item = raw as Record<string, unknown> | null;
  if (!item || typeof item !== 'object') return null;
  const tipo = text(item.tipo, 30);
  const profissional = text(item.profissional, 80) || 'equipe';
  const dia = text(item.dia, 10);
  const dias = Number(item.dias);
  if (!ASSISTANT_CONSULTAS.includes(tipo)) return null;
  if (tipo === 'financeiro') return readFinanceConsulta(item);
  // Horários vagos são sempre de uma pessoa num dia certo.
  if (tipo === 'horarios_vagos' && (profissional === 'equipe' || !DAY.test(dia))) return null;
  return {
    tipo,
    profissional,
    dia: DAY.test(dia) ? dia : '',
    dias: Number.isInteger(dias) && dias >= 1 && dias <= 365 ? dias : null,
  };
}

/** Resultado da consulta vindo do aparelho, limpo antes de ir ao Gemini. */
export function readConsultaResult(raw: unknown) {
  const item = raw as Record<string, unknown> | null;
  if (!item || typeof item !== 'object') return null;
  const tipo = text(item.tipo, 30);
  if (!ASSISTANT_CONSULTAS.includes(tipo)) return null;
  if (tipo === 'financeiro') return readFinanceResult(item);
  const motivo = text(item.motivo, 30);
  return {
    tipo,
    profissional: text(item.profissional, 80),
    dia: DAY.test(text(item.dia, 10)) ? text(item.dia, 10) : '',
    horarios: (Array.isArray(item.horarios) ? item.horarios : [])
      .map(value => text(value, 5))
      .filter(value => TIME.test(value))
      .slice(0, 96),
    motivo: CONSULTA_MOTIVOS.includes(motivo) ? motivo : null,
    grade: text(item.grade, 10) === 'padrao' ? 'padrao' : 'jornada',
    opcoes: (Array.isArray(item.opcoes) ? item.opcoes : []).map(value => text(value, 60)).filter(Boolean).slice(0, 12),
    // Contagens: só rótulo e número (nomes da equipe, siglas de escala).
    periodo: text(item.periodo, 40),
    total: Number.isInteger(item.total) ? item.total as number : null,
    linhas: (Array.isArray(item.linhas) ? item.linhas : [])
      .map(line => ({ rotulo: text((line as Record<string, unknown>)?.rotulo, 80), valor: Number((line as Record<string, unknown>)?.valor) }))
      .filter(line => line.rotulo && Number.isInteger(line.valor) && line.valor >= 0)
      .slice(0, 40),
  };
}

/** Nomes de quem atende, vindos do aparelho (só para a IA saber quem existe). */
export function readTeam(raw: unknown) {
  return (Array.isArray(raw) ? raw : []).map(value => text(value, 60)).filter(Boolean).slice(0, 40);
}

const WEEKDAY = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: 'America/Sao_Paulo' });
const ISO_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' });

/** Os próximos 14 dias com o dia da semana, para "terça" ou "amanhã" virar data certa. */
export function upcomingDays(now = new Date(), count = 14) {
  return Array.from({ length: count }, (_, index) => {
    const day = new Date(now.getTime() + index * 86_400_000);
    return `${ISO_DAY.format(day)} (${WEEKDAY.format(day)}${index === 0 ? ', hoje' : index === 1 ? ', amanhã' : ''})`;
  });
}


// FIN-4: limite inclusivo, sem truncar linhas ou corrigir datas inválidas.
export const FINANCE_MAX_DAYS = 93;
export const FINANCE_MAX_ROWS = 50;
export const FINANCE_FILTERS = ['recebidos', 'a_receber', 'atrasados'];
export const FINANCE_ROW_STATUS = ['recebido', 'a_receber', 'atrasado', 'recebido_operadora', 'a_receber_operadora', 'atrasado_operadora', 'aguardando_lote_operadora'];
export const FINANCE_CRITERIA = {
  pagamento: 'Data de pagamento no período informado.',
  vencimento: 'Data de vencimento no período informado.',
  misto: 'Data de vencimento; convênio aguardando lote ou prazo usa a data do atendimento e não é cobrança ao paciente.',
};
export const FINANCE_REASONS = {
  sem_permissao: 'Esta consulta está disponível somente para a administração da sua instituição.',
  periodo_invalido: 'Informe início e fim válidos no formato AAAA-MM-DD, em ordem.',
  limite_periodo: 'Escolha um período de até 93 dias para consultar o financeiro.',
  limite_linhas: 'Há mais de 50 itens. Estreite o período, o paciente ou o profissional.',
  filtro_invalido: 'Escolha recebidos, a receber ou atrasados para consultar o financeiro.',
  ambiguo: 'Há mais de uma pessoa com esse nome. Informe o nome completo.',
  nao_encontrado: 'Não encontrei essa pessoa nas fontes disponíveis do Financeiro.',
  erro: 'Não foi possível consultar o financeiro agora. Confira a tela Financeiro e tente novamente.',
};
function financeRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
}
function financeName(value: unknown) {
  return typeof value === 'string' ? value.replace(/\p{Cc}/gu, ' ').trim().slice(0, 120) : '';
}
function financeDay(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const time = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? value : '';
}
export function readFinanceConsulta(raw: unknown) {
  const item = financeRecord(raw);
  const invalidFilter = ['paciente', 'profissional'].some(key => {
    const value = item[key];
    return value !== undefined && (typeof value !== 'string' || value.length > 120);
  });
  return { tipo: 'financeiro', de: financeDay(item.de), ate: financeDay(item.ate),
    status: !invalidFilter && typeof item.status === 'string' && FINANCE_FILTERS.includes(item.status) ? item.status : '',
    paciente: financeName(item.paciente), profissional: financeName(item.profissional) || 'equipe' };
}
export function financeConsultaIssue(raw: unknown) {
  const query = readFinanceConsulta(raw);
  if (!query.de || !query.ate || query.de > query.ate) return 'periodo_invalido';
  if ((Date.parse(query.ate) - Date.parse(query.de)) / 86400000 + 1 > FINANCE_MAX_DAYS) return 'limite_periodo';
  if (!query.status) return 'filtro_invalido';
  return null;
}
export function financeConsultaFailure(raw: unknown, reason: unknown) {
  const query = readFinanceConsulta(raw);
  const motivo = typeof reason === 'string' && Object.hasOwn(FINANCE_REASONS, reason) ? reason as keyof typeof FINANCE_REASONS : 'erro';
  return { ...query, motivo, mensagem: FINANCE_REASONS[motivo], criterio: null, linhas: [], total: null };
}
// Lista fechada T2: nenhum identificador, documento, contato ou texto livre atravessa.
export function readFinanceResult(raw: unknown) {
  const item = financeRecord(raw);
  const query = readFinanceConsulta(item);
  const issue = financeConsultaIssue(query);
  if (issue) return financeConsultaFailure(query, issue);
  if (item.motivo) return financeConsultaFailure(query, item.motivo);
  if (!Array.isArray(item.linhas)) return financeConsultaFailure(query, 'erro');
  if (item.linhas.length > FINANCE_MAX_ROWS) return financeConsultaFailure(query, 'limite_linhas');
  const linhas = [];
  for (const rawLine of item.linhas) {
    const line = financeRecord(rawLine);
    const paciente = financeName(line.paciente);
    const profissional = financeName(line.profissional);
    const vencimento = line.vencimento === null ? null : financeDay(line.vencimento);
    const pagamento = line.pagamento === null ? null : financeDay(line.pagamento);
    if (!paciente || typeof line.profissional !== 'string' || typeof line.valor_centavos !== 'number' || !Number.isSafeInteger(line.valor_centavos) || line.valor_centavos < 0
        || typeof line.status !== 'string' || !FINANCE_ROW_STATUS.includes(line.status) || vencimento === '' || pagamento === '') return financeConsultaFailure(query, 'erro');
    const paid = line.status === 'recebido' || line.status === 'recebido_operadora';
    const date = paid ? pagamento : vencimento;
    const waiting = line.status === 'aguardando_lote_operadora';
    if ((waiting && (vencimento !== null || pagamento !== null || query.status !== 'a_receber'))
        || (!waiting && (!date || date < query.de || date > query.ate)) || (query.status === 'recebidos') !== paid
        || (query.status === 'atrasados' && !line.status.startsWith('atrasado'))) return financeConsultaFailure(query, 'erro');
    linhas.push({ paciente, profissional, valor_centavos: line.valor_centavos, vencimento, pagamento, status: line.status });
  }
  return { ...query, motivo: null, mensagem: '',
    criterio: query.status === 'recebidos' ? FINANCE_CRITERIA.pagamento
      : linhas.some(line => line.status === 'aguardando_lote_operadora') ? FINANCE_CRITERIA.misto : FINANCE_CRITERIA.vencimento,
    linhas, total: linhas.length };
}
