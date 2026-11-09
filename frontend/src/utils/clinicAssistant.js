// ============================================================
// Assistente da clínica (30/10/2026, etapa 1; prévia escolhida: C na
// tela inicial + painel A minimizado em todas as telas).
//
// Telas, atalhos e limites da conversa: espelho de
// supabase/functions/_shared/clinicAssistant.ts (mudou um, muda o outro;
// tests/regression/clinic-assistant.test.mjs confere).
//
// "Sua atenção hoje" é contada aqui, sem IA, pelas mesmas regras das
// telas: alerta de risco de escala ainda não visto (vermelho), evolução
// faltando (âmbar), pacote perto do fim e valor em atraso (cinza, só a
// administração). A lista lembra; quem decide é a pessoa.
// ============================================================

import { freeSlotsOfDay } from './agendaFreeSlots.js';
import { buildReceivables } from './finance.js';
import { operatorReceiptsFrom } from './tissXml.js';
import { schedulesOfDay } from './agendaTimeline.js';

export const ASSISTANT_SCREENS = [
  'inicio', 'agenda', 'evolucao', 'escalas', 'financeiro',
  'gestao', 'pacientes', 'documentos', 'whatsapp', 'area',
];

export const ASSISTANT_LINKS = [
  'agenda', 'evolucao', 'escalas', 'financeiro', 'gestao', 'pacientes',
];

// Abas que a resposta pode abrir direto (06/11/2026): "Abrir Documentos
// timbrados →" em vez de "Abrir Gestão →". O id é o da aba na tela; o rótulo
// é o do menu. `everyone`: existe para todo perfil; as outras são só da
// administração. Aba nova da Gestão ou do Financeiro entra aqui.
export const ASSISTANT_SECTION_LINKS = {
  indicadores: { screen: 'gestao', label: 'Indicadores' },
  faltosos: { screen: 'gestao', label: 'Faltosos' },
  retornos: { screen: 'gestao', label: 'Retornos' },
  pesquisa: { screen: 'gestao', label: 'Pesquisa de satisfação' },
  importaveis: { screen: 'gestao', label: 'Importáveis' },
  profissionais: { screen: 'gestao', label: 'Profissionais' },
  acessos: { screen: 'gestao', label: 'Acessos' },
  documentos: { screen: 'gestao', label: 'Documentos timbrados', everyone: true },
  personalizar: { screen: 'gestao', label: 'Personalizar', everyone: true },
  acessopaciente: { screen: 'gestao', label: 'Acesso do paciente' },
  ia: { screen: 'gestao', label: 'IA do mês' },
  cadastro: { screen: 'gestao', label: 'Meu cadastro', everyone: true },
  areceber: { screen: 'financeiro', label: 'A receber' },
  recebidos: { screen: 'financeiro', label: 'Recebidos' },
  notas: { screen: 'financeiro', label: 'Notas fiscais' },
  pacotes: { screen: 'financeiro', label: 'Pacotes' },
  apagar: { screen: 'financeiro', label: 'A pagar' },
  pagas: { screen: 'financeiro', label: 'Pagas' },
  equipe: { screen: 'financeiro', label: 'Equipe e repasses' },
  valores: { screen: 'financeiro', label: 'Valores dos atendimentos' },
  modelos: { screen: 'financeiro', label: 'Modelos de pacote' },
  recebimento: { screen: 'financeiro', label: 'Como cada um recebe' },
  saidasfixas: { screen: 'financeiro', label: 'Saídas fixas' },
  guias: { screen: 'financeiro', label: 'Guias' },
  lotes: { screen: 'financeiro', label: 'Lotes' },
  pagamentos: { screen: 'financeiro', label: 'Pagamentos e glosas' },
  operadoras: { screen: 'financeiro', label: 'Operadoras' },
  solicitantes: { screen: 'financeiro', label: 'Solicitantes' },
  faturamento: { screen: 'financeiro', label: 'Dados para faturamento' },
};

export const ASSISTANT_MAX_MESSAGES = 12;
export const ASSISTANT_MAX_MESSAGE_CHARS = 1500;

export const ASSISTANT_SCREEN_LABELS = {
  inicio: 'Tela inicial',
  agenda: 'Agenda',
  evolucao: 'Evoluções',
  escalas: 'Escalas',
  financeiro: 'Financeiro',
  gestao: 'Gestão',
  pacientes: 'Pacientes da instituição',
  documentos: 'Documentos timbrados',
  whatsapp: 'WhatsApp',
  area: 'Área de atendimento',
};

// Consultas que a assistente pode pedir ao aparelho (31/10/2026) e os
// motivos de não ter resposta: espelho de _shared/assistantConsulta.ts.
export const ASSISTANT_CONSULTAS = [
  'horarios_vagos', 'atendimentos_dia', 'evolucoes_pendentes', 'escalas_aplicadas', 'retornos_pendentes', 'financeiro',
];
export const CONSULTA_MOTIVOS = [
  'sem_jornada', 'feriado', 'passado', 'nao_encontrado', 'ambiguo', 'sem_agenda', 'erro', 'sem_permissao', 'periodo_invalido', 'limite_periodo', 'limite_linhas', 'filtro_invalido',
];

const SELF_WORDS = new Set(['eu', 'mim', 'meu', 'meus', 'minha', 'minhas', 'comigo']);
// Títulos e profissões não ajudam a achar a pessoa ("Denise psicóloga").
const NAME_NOISE = new Set([
  'dra', 'dr', 'doutora', 'doutor', 'psicologa', 'psicologo', 'fisioterapeuta', 'nutricionista',
  'acupunturista', 'neuropsicologa', 'neuropsicologo', 'terapeuta', 'profissional', 'agenda', 'horarios',
]);

function plain(text) {
  return String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * De quem é a agenda pedida: "eu" é quem pergunta; um nome é procurado
 * na equipe que atende. Ambíguo ou fora da equipe volta com as opções
 * para a assistente perguntar, nunca chuta.
 * @returns {{ member: object|null, motivo: null|'sem_agenda'|'ambiguo'|'nao_encontrado', opcoes: object[] }}
 */
export function matchTeamMember(query, members = [], selfId = null) {
  const words = plain(query).split(/[^a-z0-9]+/).filter(Boolean);
  if (words.length > 0 && words.every(word => SELF_WORDS.has(word))) {
    const self = members.find(member => member.id === selfId);
    return self ? { member: self, motivo: null, opcoes: [] } : { member: null, motivo: 'sem_agenda', opcoes: [] };
  }
  const tokens = words.filter(word => word.length >= 3 && !NAME_NOISE.has(word));
  if (!tokens.length) return { member: null, motivo: 'nao_encontrado', opcoes: members.slice(0, 12) };
  const nameWords = member => plain(member.full_name).split(/[^a-z0-9]+/).filter(Boolean);
  const hits = predicate => members.filter(member => {
    const names = nameWords(member);
    return predicate(token => names.some(name => name.startsWith(token)));
  });
  for (const found of [hits(has => tokens.every(has)), hits(has => tokens.some(has))]) {
    if (found.length === 1) return { member: found[0], motivo: null, opcoes: [] };
    if (found.length > 1) return { member: null, motivo: 'ambiguo', opcoes: found.slice(0, 12) };
  }
  return { member: null, motivo: 'nao_encontrado', opcoes: members.slice(0, 12) };
}

/**
 * Horários vagos de UMA pessoa num dia, para a assistente: a mesma conta
 * do "Copiar horários vagos" da agenda de uma pessoa. Sem jornada
 * cadastrada no dia vale a grade padrão da clínica, como a Agenda mostra
 * (bug de 01/11/2026: a assistente respondia "sem jornada" para quem
 * tinha a terça cheia na grade padrão). `grade` diz qual valeu.
 */
export function freeSlotsForAssistant({ date, professionalId, schedules = [], appointments = [], holidays = [], fallback = null, now = null }) {
  const grade = schedulesOfDay(schedules, date).length > 0 ? 'jornada' : 'padrao';
  const { slots, closedReason } = freeSlotsOfDay({ date, professionalId, schedules, appointments, holidays, fallback, now });
  if (closedReason === 'past') return { horarios: [], motivo: 'passado', grade };
  if (closedReason === 'holiday') return { horarios: [], motivo: 'feriado', grade };
  return { horarios: slots.map(slot => slot.label), motivo: null, grade };
}

// ---------- contagens da clínica para a assistente (01/11/2026) ----------
// Só números e nomes da equipe (`nameOf`), nunca paciente. Cada uma
// devolve { total, linhas: [{ rotulo, valor }] } no formato de `dados`.

const ABSENT = ['no_show', 'excused', 'cancelled'];

function countBy(list, keyOf) {
  const counts = new Map();
  for (const item of list) {
    const key = keyOf(item);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function byCountDesc(a, b) {
  return b.valor - a.valor || a.rotulo.localeCompare(b.rotulo);
}

/** Atendimentos de um dia: totais da clínica (ou da pessoa) e por profissional. */
export function summarizeDayAppointments({ appointments = [], nameOf = id => id, professionalId = null }) {
  const people = appointments.filter(item => item?.kind !== 'block'
    && (!professionalId || item?.professional_id === professionalId));
  const attended = people.filter(item => item.status === 'attended').length;
  const absent = people.filter(item => ABSENT.includes(item.status)).length;
  const linhas = [
    { rotulo: 'A atender', valor: people.length - attended - absent },
    { rotulo: 'Atendidos', valor: attended },
    { rotulo: 'Faltas e cancelamentos', valor: absent },
  ];
  if (!professionalId) {
    const perPerson = countBy(people, item => item.professional_id);
    for (const [id, valor] of perPerson) linhas.push({ rotulo: `Marcados com ${nameOf(id)}`, valor });
  }
  return { total: people.length, linhas };
}

/** Evoluções faltando, por profissional (a RLS já corta o que a pessoa pode ver). */
export function summarizePendingEvolutions({ pending = [], nameOf = id => id }) {
  const linhas = [...countBy(pending, item => item.professional_id)]
    .map(([id, valor]) => ({ rotulo: nameOf(id), valor }))
    .sort(byCountDesc);
  return { total: pending.length, linhas };
}

/** Escalas aplicadas no período, por escala (consultório + Área do Paciente). */
export function summarizeScaleApplications({ rows = [], labelOf = id => id }) {
  const perScale = new Map();
  for (const row of rows) {
    const key = row.instrumento;
    const entry = perScale.get(key) || { total: 0, casa: 0 };
    entry.total += Number(row.total) || 0;
    if (row.origem === 'area_do_paciente') entry.casa += Number(row.total) || 0;
    perScale.set(key, entry);
  }
  const linhas = [...perScale]
    .map(([id, entry]) => ({
      rotulo: entry.casa ? `${labelOf(id)} (${entry.casa} respondidas em casa)` : labelOf(id),
      valor: entry.total,
    }))
    .sort(byCountDesc);
  return { total: linhas.reduce((sum, line) => sum + line.valor, 0), linhas };
}

/** Pacientes sem retorno há N dias ou mais: só a conta, por profissional. */
export function summarizeReturns({ returns = [], nameOf = id => id }) {
  const linhas = [...countBy(returns, item => item.professional_id)]
    .map(([id, valor]) => ({ rotulo: nameOf(id), valor }))
    .sort(byCountDesc);
  return { total: returns.length, linhas };
}

// Valor em aberto há mais que isto conta como atraso que pede atenção.
export const ATTENTION_LATE_DAYS = 15;

/** Perfil da assistente a partir do papel: admin, professional ou reception. */
export function assistantRoleOf(profile) {
  if (profile?.role === 'clinic_admin') return 'admin';
  if (profile?.role === 'receptionist') return 'reception';
  return 'professional';
}

/** Atalhos que este perfil pode abrir (mesmo corte do menu da tela inicial). */
export function linksForRole(role) {
  const screens = ASSISTANT_LINKS.filter(link => {
    if (link === 'financeiro') return role === 'admin';
    if (link === 'evolucao' || link === 'escalas') return role !== 'reception';
    return true;
  });
  const sections = Object.keys(ASSISTANT_SECTION_LINKS)
    .filter(link => role === 'admin' || ASSISTANT_SECTION_LINKS[link].everyone);
  return [...screens, ...sections];
}

/** Nome do destino no botão "Abrir … →". */
export function assistantLinkLabel(link) {
  return ASSISTANT_SECTION_LINKS[link]?.label || ASSISTANT_SCREEN_LABELS[link];
}

/**
 * Para onde o atalho leva. Documentos timbrados é aba da Gestão só para a
 * administração; para os outros perfis é tela própria.
 */
export function assistantLinkDestination(link, role) {
  const sectionLink = ASSISTANT_SECTION_LINKS[link];
  if (!sectionLink) return { target: link, section: null };
  if (link === 'documentos' && role !== 'admin') return { target: 'documentos', section: null };
  return { target: sectionLink.screen, section: link };
}

function plural(count, one, many) {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * Pacotes ativos com uma sessão ou nenhuma para acabar. As sessões feitas
 * são as cobranças do pacote que valem (falta não gasta sessão).
 */
export function packagesNearEnd({ packages = [], charges = [] }) {
  const used = new Map();
  for (const charge of charges) {
    if (!charge.package_id || charge.voided_at || charge.source !== 'appointment') continue;
    used.set(charge.package_id, (used.get(charge.package_id) || 0) + 1);
  }
  return packages.filter(pkg => pkg.status === 'active'
    && pkg.sessions_planned - (used.get(pkg.id) || 0) <= 1);
}

/**
 * Itens de "Sua atenção hoje". Cada fonte que falhou vem como null e
 * não entra (a lista nunca inventa zero); `failed` diz quais faltaram.
 *
 * @param riskAlerts      alertas de risco de escala ainda não vistos
 * @param pendingEvolutions atendimentos que esperam evolução
 * @param receivables     itens a receber (utils/finance.js, buildReceivables)
 * @param nearEndPackages pacotes perto do fim (packagesNearEnd)
 * @param aiAlert         aviso do limite de IA (aiAlertFor): false sem aviso,
 *                        null quando não deu para conferir
 */
export function buildAttentionItems({ role, riskAlerts = null, pendingEvolutions = null, receivables = null, nearEndPackages = null, aiAlert = undefined }) {
  const items = [];
  const failed = [];

  if (role !== 'reception') {
    if (riskAlerts === null) failed.push('escalas');
    else if (riskAlerts.length) {
      items.push({
        id: 'risk',
        tone: 'risk',
        strong: plural(riskAlerts.length, 'escala com alerta de risco', 'escalas com alerta de risco'),
        text: 'aguardando "Vi o alerta"',
        target: 'escalas',
        targetLabel: 'Escalas',
      });
    }
    if (pendingEvolutions === null) failed.push('evoluções');
    else if (pendingEvolutions.length) {
      items.push({
        id: 'evolutions',
        tone: 'pending',
        strong: plural(pendingEvolutions.length, 'evolução', 'evoluções'),
        text: role === 'admin' ? 'faltando na equipe' : 'para escrever',
        target: 'evolucao',
        targetLabel: 'Evoluções',
      });
    }
  }

  if (role === 'admin') {
    // Limite de IA do mês (aviso em 50%, 80% e 100%, utils/aiUsage.js).
    if (aiAlert === null) failed.push('IA do mês');
    else if (aiAlert) {
      items.push({
        id: 'ai',
        tone: aiAlert.level >= 80 ? 'pending' : 'info',
        strong: `IA do mês em ${aiAlert.level}%`,
        text: aiAlert.level >= 100 ? 'do limite: as funções de IA pararam' : 'do limite',
        target: 'gestao',
        section: 'ia',
        targetLabel: 'IA do mês',
      });
    }
    if (nearEndPackages === null) failed.push('pacotes');
    else if (nearEndPackages.length) {
      items.push({
        id: 'packages',
        tone: 'info',
        strong: plural(nearEndPackages.length, 'pacote', 'pacotes'),
        text: 'com uma sessão ou nenhuma para acabar',
        target: 'financeiro',
        targetLabel: 'Pacotes',
      });
    }
    if (receivables === null) failed.push('a receber');
    else {
      const late = receivables.filter(item => item.late && item.daysLate > ATTENTION_LATE_DAYS);
      if (late.length) {
        const cents = late.reduce((sum, item) => sum + (item.openCents || 0), 0);
        items.push({
          id: 'late',
          tone: 'info',
          cents,
          text: `em atraso há mais de ${ATTENTION_LATE_DAYS} dias`,
          target: 'financeiro',
          targetLabel: 'A receber',
        });
      }
    }
  }

  return { items, failed };
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
function financeRecord(raw) {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
}
function financeName(value) {
  return typeof value === 'string' ? value.replace(/\p{Cc}/gu, ' ').trim().slice(0, 120) : '';
}
function financeDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const time = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? value : '';
}
export function readFinanceConsulta(raw) {
  const item = financeRecord(raw);
  const invalidFilter = ['paciente', 'profissional'].some(key => {
    const value = item[key];
    return value !== undefined && (typeof value !== 'string' || value.length > 120);
  });
  return { tipo: 'financeiro', de: financeDay(item.de), ate: financeDay(item.ate),
    status: !invalidFilter && FINANCE_FILTERS.includes(item.status) ? item.status : '',
    paciente: financeName(item.paciente), profissional: financeName(item.profissional) || 'equipe' };
}
export function financeConsultaIssue(raw) {
  const query = readFinanceConsulta(raw);
  if (!query.de || !query.ate || query.de > query.ate) return 'periodo_invalido';
  if ((Date.parse(query.ate) - Date.parse(query.de)) / 86400000 + 1 > FINANCE_MAX_DAYS) return 'limite_periodo';
  if (!query.status) return 'filtro_invalido';
  return null;
}
export function financeConsultaFailure(raw, reason) {
  const query = readFinanceConsulta(raw);
  const motivo = typeof reason === 'string' && Object.hasOwn(FINANCE_REASONS, reason) ? reason : 'erro';
  return { ...query, motivo, mensagem: FINANCE_REASONS[motivo], criterio: null, linhas: [], total: null };
}
// Lista fechada T2: nenhum identificador, documento, contato ou texto livre atravessa.
export function readFinanceResult(raw) {
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
    if (!paciente || typeof line.profissional !== 'string' || !Number.isSafeInteger(line.valor_centavos) || line.valor_centavos < 0
        || !FINANCE_ROW_STATUS.includes(line.status) || vencimento === '' || pagamento === '') return financeConsultaFailure(query, 'erro');
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

/** Mesmas contas da tela. O chamador fornece só nomes a partir das fontes do Financeiro. */
export function summarizeFinance({ consulta, money, patients, members, shortName, today, selfId }) {
  const query = readFinanceConsulta(consulta);
  const issue = financeConsultaIssue(query);
  if (issue) return financeConsultaFailure(query, issue);
  const plainName = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
  function resolveName(needle, rows, nameOf) {
    const term = plainName(needle);
    if (!term) return { id: null };
    const exact = rows.filter(row => plainName(nameOf(row)) === term);
    const hits = exact.length ? exact : rows.filter(row => plainName(nameOf(row)).includes(term));
    return hits.length === 1 ? { id: hits[0].id } : { motivo: hits.length ? 'ambiguo' : 'nao_encontrado' };
  }
  const patient = resolveName(query.paciente, patients, row => row.name);
  const matched = query.profissional === 'equipe' ? null : matchTeamMember(query.profissional, members, selfId);
  const professional = matched ? { id: matched.member?.id, motivo: matched.motivo } : { id: null };
  if (patient.motivo || professional.motivo) return financeConsultaFailure(query, patient.motivo || professional.motivo);
  const patientById = new Map(patients.map(row => [row.id, row.name]));
  const memberById = new Map(members.map(row => [row.id, shortName(row.full_name)]));
  const chargeById = new Map(money.charges.map(row => [row.id, row]));
  const packageById = new Map(money.packages.map(row => [row.id, row]));
  const receipts = [...money.receipts, ...operatorReceiptsFrom(money.tissPaid)];
  const entries = query.status === 'recebidos'
    ? receipts.filter(row => !row.voided_at).map(row => {
      const charge = chargeById.get(row.charge_id);
      const pkg = packageById.get(row.package_id);
      return { patientId: row.patient_id || charge?.patient_id || pkg?.patient_id,
        professionalId: charge?.professional_id || pkg?.professional_id, value: row.amount_cents,
        date: row.received_on, due: null, paid: row.received_on,
        status: row.source === 'operadora' ? 'recebido_operadora' : 'recebido' };
    })
    : buildReceivables({ ...money, receipts, today }).items
      .filter(row => query.status !== 'atrasados' || row.late)
      .map(row => ({ patientId: row.patientId, professionalId: row.professionalId, value: row.openCents,
        date: row.dueOn, due: row.hasDue === false ? null : row.dueOn, paid: null,
        status: row.hasDue === false && row.payer === 'convenio' ? 'aguardando_lote_operadora'
          : (row.late ? 'atrasado' : 'a_receber') + (row.payer === 'convenio' ? '_operadora' : '') }));
  const matches = entries.filter(row => (!patient.id || row.patientId === patient.id)
    && (!professional.id || row.professionalId === professional.id) && row.date >= query.de && row.date <= query.ate);
  if (matches.length > FINANCE_MAX_ROWS) return financeConsultaFailure(query, 'limite_linhas');
  return readFinanceResult({ ...query, linhas: matches.map(row => ({
    paciente: patientById.get(row.patientId) || 'Paciente arquivado',
    profissional: memberById.get(row.professionalId) || '',
    valor_centavos: row.value, vencimento: row.due, pagamento: row.paid, status: row.status,
  })) });
}
