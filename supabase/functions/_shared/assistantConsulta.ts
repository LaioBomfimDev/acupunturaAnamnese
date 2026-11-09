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
  // ACUP-023: agenda e operação sem paciente.
  'agenda', 'faltas', 'confirmacoes_pendentes', 'pacotes_fim', 'aniversarios', 'pesquisas', 'formularios_pendentes', 'convenio',
  // ACUP-025: agenda com paciente (primeiro nome + idade).
  'agenda_pacientes', 'proxima_sessao', 'faltosos', 'aniversariantes',
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
  if (AGENDA_CONSULTAS.includes(tipo)) return readAgendaConsulta(item);
  if (PATIENT_CONSULTAS.includes(tipo)) return readPatientRequest(item);
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
  if (AGENDA_CONSULTAS.includes(tipo)) return readAgendaResult(item);
  if (PATIENT_CONSULTAS.includes(tipo)) return readPatientResult(item);
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
// Primeiro nome = uma palavra só de letras (acento, apóstrofo ou hífen valem).
// QA 09/11/2026: só "sem espaço" deixava passar "Lúcia.Souza", "Lúcia_Souza",
// sobrenome colado por espaço invisível, CPF, e-mail e data.
export const FINANCE_FIRST_NAME = /^\p{L}[\p{L}\p{M}'’-]{0,39}$/u;
// Contagens que cada forma nunca traz (vão null).
export const FINANCE_NULL_BY_FORM: Record<string, string[]> = {
  avulso: ['sessao_atual', 'sessoes_previstas', 'parcelas_pagas', 'parcelas_em_aberto'],
  convenio: ['sessao_atual', 'sessoes_previstas', 'parcelas_pagas', 'parcelas_em_aberto'],
  pacote_por_sessao: ['parcelas_pagas', 'parcelas_em_aberto'],
  pacote_parcelas: ['sessoes_feitas', 'sessoes_pagas', 'sessoes_sem_valor'],
};
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
  return FINANCE_FIRST_NAME.test(name) ? name : '';
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
  const fullName = patient !== '' && !FINANCE_FIRST_NAME.test(patient);
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
  // Pacote à vista ou parcelado conta parcela, nunca sessão paga; avulso e
  // convênio não têm parcela nem "sessão N de M" (QA, 09/11/2026).
  if (FINANCE_NULL_BY_FORM[forma].some(key => counts[key] !== null)) return null;
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

// ============================================================
// ACUP-023 (AG-1, AG-5): agenda e operação da clínica SEM paciente.
// Espelho de frontend/src/utils/clinicAssistant.js (tipos, acesso,
// chaves, rótulos, critérios, motivos e a limpeza); o teste
// tests/regression/clinic-assistant-agenda.test.mjs confere. Nenhuma
// linha leva id nem nada do paciente.
// ============================================================

export const AGENDA_CONSULTAS = ['agenda', 'faltas', 'confirmacoes_pendentes', 'pacotes_fim', 'aniversarios', 'pesquisas', 'formularios_pendentes', 'convenio'];
export const AGENDA_ACCESS: Record<string, string> = {
  agenda: 'equipe', faltas: 'equipe', confirmacoes_pendentes: 'equipe', pacotes_fim: 'equipe',
  aniversarios: 'admin_recepcao', pesquisas: 'admin', formularios_pendentes: 'portal', convenio: 'financeiro',
  // ACUP-025 (AG-8): com paciente; faltosos e aniversariantes só administração e recepção.
  agenda_pacientes: 'equipe', proxima_sessao: 'equipe', faltosos: 'admin_recepcao', aniversariantes: 'admin_recepcao',
};
export const AGENDA_PERIOD_REQUIRED = ['agenda', 'faltas', 'pesquisas'];
export const AGENDA_PERIOD_OPTIONAL = ['confirmacoes_pendentes'];
export const AGENDA_KEYS: Record<string, { linha: string[]; resumo: string[] }> = {
  agenda: { linha: ['dia', 'inicio', 'fim', 'profissional', 'area', 'tipo_atendimento', 'modalidade', 'status'], resumo: ['agendados', 'atendidos', 'faltas', 'cancelamentos', 'bloqueios'] },
  faltas: { linha: ['profissional', 'area', 'nao_compareceu', 'cancelado_paciente', 'cancelado'], resumo: ['total', 'atendimentos'] },
  confirmacoes_pendentes: { linha: ['dia', 'inicio', 'profissional', 'area'], resumo: ['total'] },
  pacotes_fim: { linha: ['profissional', 'area', 'pacotes', 'sessoes_restantes'], resumo: ['total'] },
  aniversarios: { linha: [], resumo: ['total'] },
  pesquisas: { linha: [], resumo: ['respondidas', 'media', 'aguardando'] },
  formularios_pendentes: { linha: [], resumo: ['enviados', 'respondidos', 'aguardando'] },
  convenio: { linha: [], resumo: ['guias_com_pendencia', 'guias_prontas', 'lotes_nao_enviados', 'guias_esperando_operadora', 'valor_esperando_centavos', 'glosadas', 'notas_pendentes', 'notas_a_cancelar', 'valor_notas_pendentes_centavos'] },
};
// Rótulos de frontend/src/utils/agenda.js e utils/appointmentTypes.js (o teste confere).
export const AGENDA_STATUS_LABELS = ['Agendado', 'Atendido', 'Cancelado', 'Não compareceu', 'Cancelado pelo paciente'];
export const AGENDA_TYPE_LABELS = ['Anamnese', 'Auriculoterapia', 'Avaliação', 'Avaliação inicial (anamnese)', 'Avaliação neuropsicológica', 'Avaliação psicológica', 'Biomodulação vascular', 'Devolutiva', 'e-ILIB', 'Entrevista', 'Laserpuntura', 'Neuromodulação', 'Primeira vez', 'Retorno', 'Sem tipo', 'Sessão', 'Sessão de acupuntura', 'Sessão de auriculoterapia', 'Sessão de laserpuntura', 'Sessão de ventosa', 'Ventosa', 'Visita domiciliar', 'Visita escolar'];
export const AGENDA_MODALITIES = ['Presencial', 'Online', 'Não informada'];
export const AGENDA_CRITERIA: Record<string, string> = {
  agenda: 'Atendimentos com início no período informado; bloqueios só entram na contagem.',
  faltas: 'Não compareceu, cancelado pelo paciente e cancelado, pela data do atendimento no período (mesma regra de Gestão → Indicadores).',
  confirmacoes_pendentes: 'Atendimentos agendados ainda sem confirmação, com início no período (mesma fila da Agenda).',
  pacotes_fim: 'Pacotes da Agenda (sessões marcadas juntas) em uso, com 1 sessão agendada ou menos. Não é o pacote do Financeiro, que a "Sua atenção hoje" conta: os dois números podem não bater.',
  aniversarios: 'Pacientes que fazem aniversário no mês atual (só a contagem).',
  pesquisas: 'Pesquisas enviadas no período: respondidas, nota média e as que ainda aguardam resposta.',
  formularios_pendentes: 'Formulários da Área do Paciente enviados e não cancelados (mesma conta de Gestão → Importáveis).',
  convenio: 'Situação de agora das guias, lotes e notas fiscais (mesma conta do Resumo do Financeiro).',
};
export const AGENDA_REASONS = {
  sem_permissao: 'Esta consulta é de uma tela que o seu perfil não vê.',
  periodo_invalido: 'Informe início e fim válidos no formato AAAA-MM-DD, em ordem.',
  limite_periodo: 'Escolha um período de até 93 dias.',
  limite_linhas: 'Há mais de 50 itens na lista. Os números do resumo valem; estreite o período ou o profissional para ver a lista.',
  ambiguo: 'Há mais de uma pessoa da equipe com esse nome. Diga qual.',
  nao_encontrado: 'Não encontrei essa pessoa na equipe.',
  erro: 'Não foi possível consultar agora. Confira a tela de origem e tente novamente.',
};

const HOUR = /^\d{2}:\d{2}$/;
function agendaRecord(raw: unknown): Row {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Row : {};
}
function sameKeys(item: Row, keys: string[]) {
  const own = Object.keys(item);
  return own.length === keys.length && keys.every(key => Object.hasOwn(item, key));
}

export function readAgendaConsulta(raw: unknown) {
  const item = agendaRecord(raw);
  const tipo = typeof item.tipo === 'string' && AGENDA_CONSULTAS.includes(item.tipo) ? item.tipo : '';
  const usesPeriod = AGENDA_PERIOD_REQUIRED.includes(tipo) || AGENDA_PERIOD_OPTIONAL.includes(tipo);
  return {
    tipo,
    de: usesPeriod ? financeDay(item.de) : '',
    ate: usesPeriod ? financeDay(item.ate) : '',
    profissional: typeof item.profissional === 'string' ? financeName(item.profissional).slice(0, 80) || 'equipe' : 'equipe',
  };
}
export function agendaConsultaIssue(raw: unknown) {
  const query = readAgendaConsulta(raw);
  if (!query.tipo) return 'erro';
  const required = AGENDA_PERIOD_REQUIRED.includes(query.tipo);
  if (!required && !query.de && !query.ate) return null;
  if (!query.de || !query.ate || query.de > query.ate) return 'periodo_invalido';
  if ((Date.parse(query.ate) - Date.parse(query.de)) / 86400000 + 1 > FINANCE_MAX_DAYS) return 'limite_periodo';
  return null;
}
export function agendaConsultaFailure(raw: unknown, reason: unknown, resumo: Row | null = null) {
  const query = readAgendaConsulta(raw);
  const motivo = typeof reason === 'string' && Object.hasOwn(AGENDA_REASONS, reason) ? reason as keyof typeof AGENDA_REASONS : 'erro';
  return { ...query, motivo, mensagem: AGENDA_REASONS[motivo], criterio: null, linhas: [] as Row[], total: null as number | null, resumo };
}

function readAgendaSummary(tipo: string, raw: unknown) {
  const resumo = agendaRecord(raw);
  const keys = AGENDA_KEYS[tipo].resumo;
  if (!sameKeys(resumo, keys)) return null;
  const clean: Row = {};
  for (const key of keys) {
    const value = resumo[key];
    if (key === 'media') {
      if (value !== null && !(typeof value === 'number' && value >= 1 && value <= 5 && Math.abs(value * 10 - Math.round(value * 10)) < 1e-9)) return null;
    } else if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return null;
    clean[key] = value;
  }
  return clean;
}
function readAgendaLine(tipo: string, raw: unknown) {
  const line = agendaRecord(raw);
  if (!sameKeys(line, AGENDA_KEYS[tipo].linha)) return null;
  const clean: Row = {};
  for (const key of AGENDA_KEYS[tipo].linha) {
    const value = line[key];
    const text = typeof value === 'string' ? value : '';
    const ok = key === 'dia' ? typeof value === 'string' && financeDay(value) === value
      : key === 'inicio' || key === 'fim' ? HOUR.test(text)
        : key === 'profissional' ? typeof value === 'string' && value.length <= 80 && !/\p{Cc}/u.test(value)
          : key === 'area' ? FINANCE_AREAS.includes(text)
            : key === 'tipo_atendimento' ? AGENDA_TYPE_LABELS.includes(text)
              : key === 'modalidade' ? AGENDA_MODALITIES.includes(text)
                : key === 'status' ? AGENDA_STATUS_LABELS.includes(text)
                  : typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
    if (!ok) return null;
    clean[key] = value;
  }
  return clean;
}
const AGENDA_TOP_KEYS = ['tipo', 'de', 'ate', 'profissional', 'motivo', 'mensagem', 'criterio', 'linhas', 'total', 'resumo'];
/** Lista fechada por tipo: chave a mais em qualquer nível derruba a resposta inteira. */
export function readAgendaResult(raw: unknown) {
  const item = agendaRecord(raw);
  const query = readAgendaConsulta(item);
  if (!query.tipo || Object.keys(item).some(key => !AGENDA_TOP_KEYS.includes(key))) return agendaConsultaFailure(query, 'erro');
  const issue = agendaConsultaIssue(query);
  if (issue) return agendaConsultaFailure(query, issue);
  if (item.motivo === 'limite_linhas') {
    const resumo = readAgendaSummary(query.tipo, item.resumo);
    return agendaConsultaFailure(query, resumo ? 'limite_linhas' : 'erro', resumo);
  }
  if (item.motivo) return agendaConsultaFailure(query, item.motivo);
  const resumo = readAgendaSummary(query.tipo, item.resumo);
  if (!resumo || !Array.isArray(item.linhas)) return agendaConsultaFailure(query, 'erro');
  if (item.linhas.length > FINANCE_MAX_ROWS) return agendaConsultaFailure(query, 'limite_linhas', resumo);
  const linhas: Row[] = [];
  for (const rawLine of item.linhas) {
    const line = readAgendaLine(query.tipo, rawLine);
    if (!line) return agendaConsultaFailure(query, 'erro');
    linhas.push(line);
  }
  return { ...query, motivo: null, mensagem: '', criterio: AGENDA_CRITERIA[query.tipo], linhas, total: linhas.length, resumo };
}

// ============================================================
// ACUP-025 (AG-2, AG-8): agenda COM paciente, só primeiro nome + idade.
// Espelho de frontend/src/utils/clinicAssistant.js (tipos, chaves,
// critérios, motivos e a limpeza); mesma trava FINANCE_FIRST_NAME do FIN-7.
// ============================================================

export const PATIENT_CONSULTAS = ['agenda_pacientes', 'proxima_sessao', 'faltosos', 'aniversariantes'];
export const PATIENT_OUTSIDE = 'Paciente fora da sua lista';
export const PATIENT_NEXT_MAX = 5;
export const PATIENT_BIRTHDAY_MAX_DAYS = 31;
export const PATIENT_KEYS: Record<string, { linha: string[]; resumo: string[] }> = {
  agenda_pacientes: { linha: ['dia', 'inicio', 'fim', 'paciente', 'idade', 'homonimo', 'profissional', 'area', 'tipo_atendimento', 'modalidade', 'status'], resumo: ['agendados', 'atendidos', 'faltas', 'cancelamentos', 'bloqueios'] },
  proxima_sessao: { linha: ['paciente', 'idade', 'homonimo', 'dia', 'inicio', 'profissional', 'area', 'tipo_atendimento', 'sessao_numero', 'sessoes_total'], resumo: ['total'] },
  faltosos: { linha: ['paciente', 'idade', 'homonimo', 'profissional', 'area', 'nao_compareceu', 'cancelado_paciente'], resumo: ['total'] },
  aniversariantes: { linha: ['paciente', 'idade', 'homonimo'], resumo: ['total'] },
};
export const PATIENT_CRITERIA: Record<string, string> = {
  agenda_pacientes: 'Atendimentos com início no período, como a Agenda mostra para o seu login; paciente só pelo primeiro nome e idade.',
  proxima_sessao: 'Próximo atendimento agendado (até 180 dias); em pacote, o número da sessão segue "Sessões do pacote" (cancelado não conta).',
  faltosos: 'Pacientes com o mínimo de faltas (não compareceu + cancelado pelo paciente) no período, por profissional e área.',
  aniversariantes: 'Pacientes que fazem aniversário no período (como a Agenda: 29/02 em 28/02 no ano comum); idade = a que vai fazer; sem a data.',
};
export const PATIENT_REASONS = {
  ...AGENDA_REASONS,
  ambiguo: 'Há mais de 5 pacientes com esse nome. Diga a idade ou o profissional.',
  nao_encontrado: 'Não encontrei esse paciente nem essa pessoa da equipe na sua lista.',
  filtro_invalido: 'Use só o primeiro nome do paciente, a idade em anos e um período válido.',
  limite_periodo: 'Escolha um período de até 93 dias (aniversariantes: até 31).',
};
const PATIENT_TOP_KEYS = ['tipo', 'de', 'ate', 'profissional', 'paciente', 'idade', 'minimo', 'motivo', 'mensagem', 'criterio', 'linhas', 'total', 'resumo'];

export function readPatientConsulta(raw: unknown) {
  const item = agendaRecord(raw);
  const tipo = typeof item.tipo === 'string' && PATIENT_CONSULTAS.includes(item.tipo) ? item.tipo : '';
  const patient = typeof item.paciente === 'string' ? financeName(item.paciente) : '';
  const age = financeAge(item.idade);
  const minimo = item.minimo === undefined || item.minimo === null ? 2
    : (typeof item.minimo === 'number' && Number.isInteger(item.minimo) && item.minimo >= 1 && item.minimo <= 20 ? item.minimo : 0);
  const invalid = (patient && !FINANCE_FIRST_NAME.test(patient)) || age === undefined || !minimo
    || (item.paciente !== undefined && typeof item.paciente !== 'string') || (tipo === 'proxima_sessao' && !patient);
  return {
    tipo: invalid ? '' : tipo,
    pedido: tipo,
    de: tipo === 'proxima_sessao' ? '' : financeDay(item.de),
    ate: tipo === 'proxima_sessao' ? '' : financeDay(item.ate),
    profissional: typeof item.profissional === 'string' ? financeName(item.profissional).slice(0, 80) || 'equipe' : 'equipe',
    paciente: invalid ? '' : patient,
    idade: age === undefined ? null : age,
    minimo: minimo || 2,
  };
}
function patientQuery(query: ReturnType<typeof readPatientConsulta>) {
  const { pedido, ...rest } = query;
  return { ...rest, tipo: rest.tipo || pedido };
}
/** Pedido que volta ao aparelho: o mesmo formato do resultado, sem campo interno. */
export function readPatientRequest(raw: unknown) {
  return patientQuery(readPatientConsulta(raw));
}
export function patientConsultaIssue(raw: unknown) {
  const query = readPatientConsulta(raw);
  if (!query.pedido) return 'erro';
  if (!query.tipo) return 'filtro_invalido';
  if (query.tipo === 'proxima_sessao') return null;
  if (query.tipo === 'aniversariantes' && !query.de && !query.ate) return null;
  if (!query.de || !query.ate || query.de > query.ate) return 'periodo_invalido';
  const days = (Date.parse(query.ate) - Date.parse(query.de)) / 86400000 + 1;
  if (days > (query.tipo === 'aniversariantes' ? PATIENT_BIRTHDAY_MAX_DAYS : FINANCE_MAX_DAYS)) return 'limite_periodo';
  return null;
}
export function patientConsultaFailure(raw: unknown, reason: unknown, resumo: Row | null = null) {
  const query = patientQuery(readPatientConsulta(raw));
  const motivo = typeof reason === 'string' && Object.hasOwn(PATIENT_REASONS, reason) ? reason as keyof typeof PATIENT_REASONS : 'erro';
  return { ...query, motivo, mensagem: PATIENT_REASONS[motivo], criterio: null, linhas: [] as Row[], total: null as number | null, resumo };
}

function readPatientLineFor(tipo: string, raw: unknown) {
  const line = agendaRecord(raw);
  const keys = PATIENT_KEYS[tipo].linha;
  if (!sameKeys(line, keys)) return null;
  const idade = financeAge(line.idade);
  const fixed = line.paciente === FINANCE_ARCHIVED || line.paciente === PATIENT_OUTSIDE;
  if (idade === undefined || typeof line.paciente !== 'string' || (fixed ? idade !== null : !FINANCE_FIRST_NAME.test(line.paciente))
      || typeof line.homonimo !== 'boolean') return null;
  const clean: Row = { paciente: line.paciente, idade, homonimo: line.homonimo };
  for (const key of keys) {
    if (key in clean) continue;
    const value = line[key];
    // Campos da agenda: a mesma validação de readAgendaLine (valores fechados).
    const ok = key === 'sessao_numero' || key === 'sessoes_total'
      ? value === null || (typeof value === 'number' && Number.isSafeInteger(value) && value >= 1)
      : readAgendaLine('agenda', { dia: '2026-01-01', inicio: '00:00', fim: '00:00', profissional: '', area: FINANCE_NO_AREA, tipo_atendimento: 'Sem tipo', modalidade: 'Não informada', status: 'Agendado', [key]: value }) !== null
        || (['nao_compareceu', 'cancelado_paciente'].includes(key) && typeof value === 'number' && Number.isSafeInteger(value) && value >= 0);
    if (!ok) return null;
    clean[key] = value;
  }
  return Object.fromEntries(keys.map(key => [key, clean[key]]));
}
/** Lista fechada por tipo; nome completo ou chave a mais derruba a resposta inteira. */
export function readPatientResult(raw: unknown) {
  const item = agendaRecord(raw);
  const parsed = readPatientConsulta(item);
  const query = patientQuery(parsed);
  if (!parsed.tipo || Object.keys(item).some(key => !PATIENT_TOP_KEYS.includes(key))) return patientConsultaFailure(item, parsed.pedido && !parsed.tipo ? 'filtro_invalido' : 'erro');
  const issue = patientConsultaIssue(item);
  if (issue) return patientConsultaFailure(item, issue);
  const summaryKeys = PATIENT_KEYS[parsed.tipo].resumo;
  const readSummary = (value: unknown) => {
    const resumo = agendaRecord(value);
    if (!sameKeys(resumo, summaryKeys) || summaryKeys.some(key => typeof resumo[key] !== 'number' || !Number.isSafeInteger(resumo[key]) || (resumo[key] as number) < 0)) return null;
    return Object.fromEntries(summaryKeys.map(key => [key, resumo[key]])) as Row;
  };
  if (item.motivo === 'limite_linhas') {
    const resumo = readSummary(item.resumo);
    return patientConsultaFailure(item, resumo ? 'limite_linhas' : 'erro', resumo);
  }
  if (item.motivo) return patientConsultaFailure(item, item.motivo);
  const resumo = readSummary(item.resumo);
  if (!resumo || !Array.isArray(item.linhas)) return patientConsultaFailure(item, 'erro');
  if (item.linhas.length > FINANCE_MAX_ROWS) return patientConsultaFailure(item, 'limite_linhas', resumo);
  const linhas: Row[] = [];
  for (const rawLine of item.linhas) {
    const line = readPatientLineFor(parsed.tipo, rawLine);
    if (!line) return patientConsultaFailure(item, 'erro');
    linhas.push(line);
  }
  return { ...query, motivo: null, mensagem: '', criterio: PATIENT_CRITERIA[parsed.tipo], linhas, total: linhas.length, resumo };
}
