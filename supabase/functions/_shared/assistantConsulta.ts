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
// Espelho de frontend/src/utils/clinicAssistant.js (mudou um, muda o outro;
// tests/regression/clinic-assistant-finance.test.mjs confere).
export const FINANCE_MAX_DAYS = 93;
export const FINANCE_MAX_ROWS = 50;
// FIN-5 (ACUP-018): paciente = só a primeira palavra do nome + idade em anos.
export const FINANCE_MAX_AGE = 130;
// ACUP-018 (FIN-7): por_area = recebido no período por área; por_paciente =
// sessões e parcelas por paciente, área e profissional.
export const FINANCE_FILTERS = ['recebidos', 'a_receber', 'atrasados', 'por_area', 'por_paciente'];
export const FINANCE_ROW_STATUS = ['recebido', 'a_receber', 'atrasado', 'recebido_operadora', 'a_receber_operadora', 'atrasado_operadora', 'aguardando_lote_operadora'];
export const FINANCE_FORMS = ['avulso', 'pacote_por_sessao', 'pacote_parcelas', 'convenio'];
export const FINANCE_SITUATIONS = ['atrasado', 'em_aberto', 'da_operadora', 'em_dia'];
export const FINANCE_NO_AREA = 'Sem área';
// Rótulos de frontend/src/data/disciplines.js (o teste confere).
export const FINANCE_AREAS = ['Acupuntura', 'Fisioterapia', 'Psicologia', 'Nutrição', 'Neuropsicologia', 'ABA', FINANCE_NO_AREA];
export const FINANCE_ARCHIVED = 'Paciente arquivado';
export const FINANCE_KEYS = {
  linha: ['paciente', 'idade', 'homonimo', 'area', 'profissional', 'valor_centavos', 'vencimento', 'pagamento', 'status'],
  area: ['area', 'paciente_centavos', 'operadora_centavos', 'total_centavos'],
  paciente: ['paciente', 'idade', 'homonimo', 'area', 'profissional', 'forma', 'sessoes_feitas', 'sessoes_pagas', 'sessoes_sem_valor',
    'sessao_atual', 'sessoes_previstas', 'parcelas_pagas', 'parcelas_em_aberto', 'em_aberto_centavos', 'situacao'],
  totais: ['paciente_centavos', 'operadora_centavos', 'total_centavos'],
};
export const FINANCE_CRITERIA = {
  pagamento: 'Data de pagamento no período informado.',
  vencimento: 'Data de vencimento no período informado.',
  misto: 'Data de vencimento; convênio aguardando lote ou prazo usa a data do atendimento e não é cobrança ao paciente.',
  area: 'Data de pagamento no período informado, somada por área; o que a operadora pagou fica separado do que o paciente pagou.',
  paciente: 'Atendimentos com data no período informado e parcelas de pacote que vencem até o fim do período, por paciente, área e profissional.',
};
export const FINANCE_REASONS = {
  sem_permissao: 'Esta consulta está disponível somente para a administração da sua instituição.',
  periodo_invalido: 'Informe início e fim válidos no formato AAAA-MM-DD, em ordem.',
  limite_periodo: 'Escolha um período de até 93 dias para consultar o financeiro.',
  limite_linhas: 'Há mais de 50 itens. Estreite o período, o paciente ou o profissional.',
  filtro_invalido: 'Escolha recebidos, a receber, atrasados, por área ou por paciente, e use só o primeiro nome do paciente.',
  ambiguo: 'Há mais de uma pessoa com esse nome. Informe o nome completo.',
  nao_encontrado: 'Não encontrei essa pessoa nas fontes disponíveis do Financeiro.',
  erro: 'Não foi possível consultar o financeiro agora. Confira a tela Financeiro e tente novamente.',
};
type Row = Record<string, unknown>;
function financeRecord(raw: unknown): Row {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Row : {};
}
function financeName(value: unknown) {
  return typeof value === 'string' ? value.replace(/\p{Cc}/gu, ' ').trim().slice(0, 120) : '';
}
function financeDay(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const time = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? value : '';
}
function financeCount(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
function financeAge(value: unknown) {
  return value === null || value === undefined ? null
    : (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= FINANCE_MAX_AGE ? value : undefined);
}
// FIN-7: paciente é uma palavra só (primeiro nome); com espaço, só o rótulo fixo de arquivado.
function financePatientLabel(value: unknown, age: number | null) {
  const name = financeName(value);
  if (!name) return '';
  if (name === FINANCE_ARCHIVED) return age === null ? name : '';
  return /\s/u.test(name) ? '' : name;
}
export function readFinanceConsulta(raw: unknown) {
  const item = financeRecord(raw);
  const invalidFilter = ['paciente', 'profissional'].some(key => {
    const value = item[key];
    return value !== undefined && (typeof value !== 'string' || value.length > 120);
  });
  const age = financeAge(item.idade);
  const patient = financeName(item.paciente);
  // Pedido com nome completo nunca é atendido nem devolvido: vira filtro inválido.
  const fullName = /\s/u.test(patient);
  return { tipo: 'financeiro', de: financeDay(item.de), ate: financeDay(item.ate),
    status: !invalidFilter && !fullName && age !== undefined && typeof item.status === 'string' && FINANCE_FILTERS.includes(item.status) ? item.status : '',
    paciente: fullName ? '' : patient, idade: age === undefined ? null : age,
    profissional: financeName(item.profissional) || 'equipe' };
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
  return { ...query, motivo, mensagem: FINANCE_REASONS[motivo], criterio: null, linhas: [], totais: null, total: null };
}
function readPatientFields(line: Row) {
  const idade = financeAge(line.idade);
  const paciente = idade === undefined ? '' : financePatientLabel(line.paciente, idade);
  const area = financeName(line.area);
  if (!paciente || typeof line.homonimo !== 'boolean' || !FINANCE_AREAS.includes(area) || typeof line.profissional !== 'string') return null;
  return { paciente, idade: idade as number | null, homonimo: line.homonimo, area, profissional: financeName(line.profissional) };
}
function readMoneyLine(line: Row, query: ReturnType<typeof readFinanceConsulta>) {
  const who = readPatientFields(line);
  const vencimento = line.vencimento === null ? null : financeDay(line.vencimento);
  const pagamento = line.pagamento === null ? null : financeDay(line.pagamento);
  const status = typeof line.status === 'string' ? line.status : '';
  if (!who || financeCount(line.valor_centavos) === null || !FINANCE_ROW_STATUS.includes(status) || vencimento === '' || pagamento === '') return null;
  const paid = status === 'recebido' || status === 'recebido_operadora';
  const date = paid ? pagamento : vencimento;
  const waiting = status === 'aguardando_lote_operadora';
  if ((waiting && (vencimento !== null || pagamento !== null || query.status !== 'a_receber'))
      || (!waiting && (!date || date < query.de || date > query.ate)) || (query.status === 'recebidos') !== paid
      || (query.status === 'atrasados' && !status.startsWith('atrasado'))) return null;
  return { ...who, valor_centavos: line.valor_centavos as number, vencimento, pagamento, status };
}
function readAreaLine(line: Row) {
  const area = financeName(line.area);
  const own = financeCount(line.paciente_centavos);
  const operator = financeCount(line.operadora_centavos);
  if (!FINANCE_AREAS.includes(area) || own === null || operator === null || line.total_centavos !== own + operator) return null;
  return { area, paciente_centavos: own, operadora_centavos: operator, total_centavos: own + operator };
}
function readPatientLine(line: Row) {
  const who = readPatientFields(line);
  const forma = typeof line.forma === 'string' ? line.forma : '';
  const situacao = typeof line.situacao === 'string' ? line.situacao : '';
  if (!who || !FINANCE_FORMS.includes(forma) || !FINANCE_SITUATIONS.includes(situacao)) return null;
  const counts: Record<string, number | null> = {};
  for (const key of ['sessoes_feitas', 'sessoes_pagas', 'sessoes_sem_valor', 'sessao_atual', 'sessoes_previstas', 'parcelas_pagas', 'parcelas_em_aberto']) {
    counts[key] = line[key] === null ? null : financeCount(line[key]);
    if (counts[key] === null && line[key] !== null) return null;
  }
  const open = financeCount(line.em_aberto_centavos);
  if (open === null || (open === 0) !== (situacao === 'em_dia')
      || (situacao === 'da_operadora') !== (forma === 'convenio' && open > 0)) return null;
  return { ...who, forma, ...counts, em_aberto_centavos: open, situacao };
}
// Lista fechada T2/FIN-7: cada objeto é remontado só com as chaves do recorte;
// uma linha fora do contrato (nome completo, idade inventada) derruba a
// resposta inteira, nunca chega ao modelo.
export function readFinanceResult(raw: unknown) {
  const item = financeRecord(raw);
  const query = readFinanceConsulta(item);
  const issue = financeConsultaIssue(query);
  if (issue) return financeConsultaFailure(query, issue);
  if (item.motivo) return financeConsultaFailure(query, item.motivo);
  if (!Array.isArray(item.linhas)) return financeConsultaFailure(query, 'erro');
  if (item.linhas.length > FINANCE_MAX_ROWS) return financeConsultaFailure(query, 'limite_linhas');
  const linhas: Row[] = [];
  for (const rawLine of item.linhas) {
    const record = financeRecord(rawLine);
    const line = query.status === 'por_area' ? readAreaLine(record)
      : query.status === 'por_paciente' ? readPatientLine(record) : readMoneyLine(record, query);
    if (!line) return financeConsultaFailure(query, 'erro');
    linhas.push(line);
  }
  let totais: Record<string, number> | null = null;
  if (query.status === 'por_area') {
    const sum = (key: string) => linhas.reduce((total, line) => total + (line[key] as number), 0);
    totais = { paciente_centavos: sum('paciente_centavos'), operadora_centavos: sum('operadora_centavos'), total_centavos: sum('total_centavos') };
    if (!Number.isSafeInteger(totais.total_centavos)) return financeConsultaFailure(query, 'erro');
  }
  const criterio = query.status === 'por_area' ? FINANCE_CRITERIA.area
    : query.status === 'por_paciente' ? FINANCE_CRITERIA.paciente
      : query.status === 'recebidos' ? FINANCE_CRITERIA.pagamento
        : linhas.some(line => line.status === 'aguardando_lote_operadora') ? FINANCE_CRITERIA.misto : FINANCE_CRITERIA.vencimento;
  return { ...query, motivo: null, mensagem: '', criterio, linhas, totais, total: linhas.length };
}
