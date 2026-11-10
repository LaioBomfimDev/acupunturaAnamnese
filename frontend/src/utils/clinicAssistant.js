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
import { buildReceivables, isConvenioCharge } from './finance.js';
import { DISCIPLINES } from '../data/disciplines.js';
import { buildTissTiles, operatorReceiptsFrom } from './tissXml.js';
import { APPOINTMENT_STATUSES, birthdaysByDay } from './agenda.js';
import { APPOINTMENT_TYPES, SERVICES_BY_AREA, appointmentTypeLabel } from './appointmentTypes.js';
import { currentMonthBirthdays, isAbsence } from './gestaoDashboard.js';
import { summarizePackageSessions } from './agendaPackageSessions.js';
import { sendsTabSummary } from './patientForms.js';
import { fiscalQueue } from './fiscal.js';
import { schedulesOfDay } from './agendaTimeline.js';

export const ASSISTANT_SCREENS = [
  'inicio', 'agenda', 'evolucao', 'escalas', 'financeiro',
  'gestao', 'pacientes', 'documentos', 'area',
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
  contas: { screen: 'financeiro', label: 'Contas do mês' },
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
  area: 'Área de atendimento',
};

// Consultas que a assistente pode pedir ao aparelho (31/10/2026) e os
// motivos de não ter resposta: espelho de _shared/assistantConsulta.ts.
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


// FIN-5 (ACUP-018): o paciente sai do aparelho só como primeira palavra do
// nome e idade em anos. A data de nascimento fica aqui: só a idade sai.
export const FINANCE_MAX_AGE = 130;

/** Só a primeira palavra do nome (nunca sobrenome). */
export function firstNameOf(name) {
  const clean = typeof name === 'string' ? name.normalize('NFC') : '';
  // Corta em tudo que não é letra: ponto, sublinhado, número e espaço invisível também separam.
  const word = clean.split(/[^\p{L}\p{M}'’-]+/u).map(part => part.replace(/^[\p{M}'’-]+|['’-]+$/gu, '')).find(Boolean) || '';
  return word.slice(0, 40);
}

/**
 * Idade em anos no dia `today` (AAAA-MM-DD, já no fuso da clínica). Sem data
 * válida, data no futuro ou acima de 130 anos: null, nunca idade inventada.
 * Quem nasceu em 29/02 completa ano em 01/03 nos anos não bissextos.
 */
export function ageOn(birthDate, today) {
  const birth = typeof birthDate === 'string' ? birthDate.slice(0, 10) : '';
  if (!financeDay(birth) || !financeDay(today) || birth > today) return null;
  const age = Number(today.slice(0, 4)) - Number(birth.slice(0, 4)) - (today.slice(5) < birth.slice(5) ? 1 : 0);
  return age >= 0 && age <= FINANCE_MAX_AGE ? age : null;
}

// FIN-4: limite inclusivo, sem truncar linhas ou corrigir datas inválidas.
export const FINANCE_MAX_DAYS = 93;
export const FINANCE_MAX_ROWS = 50;
// ACUP-018 (FIN-7): por_area = recebido no período por área; por_paciente =
// sessões e parcelas por paciente, área e profissional.
export const FINANCE_FILTERS = ['recebidos', 'a_receber', 'atrasados', 'por_area', 'por_paciente'];
export const FINANCE_ROW_STATUS = ['recebido', 'a_receber', 'atrasado', 'recebido_operadora', 'a_receber_operadora', 'atrasado_operadora', 'aguardando_lote_operadora'];
export const FINANCE_FORMS = ['avulso', 'pacote_por_sessao', 'pacote_parcelas', 'convenio'];
export const FINANCE_SITUATIONS = ['atrasado', 'em_aberto', 'da_operadora', 'em_dia'];
export const FINANCE_NO_AREA = 'Sem área';
export const FINANCE_AREAS = [...DISCIPLINES.map(item => item.label), FINANCE_NO_AREA];
// Linha cujo paciente não está mais no cadastro: rótulo fixo, sem idade.
export const FINANCE_ARCHIVED = 'Paciente arquivado';
// Primeiro nome = uma palavra só de letras (acento, apóstrofo ou hífen valem).
// QA 09/11/2026: só "sem espaço" deixava passar "Lúcia.Souza", "Lúcia_Souza",
// sobrenome colado por espaço invisível, CPF, e-mail e data.
export const FINANCE_FIRST_NAME = /^\p{L}[\p{L}\p{M}'’-]{0,39}$/u;
// Contagens que cada forma nunca traz (vão null).
export const FINANCE_NULL_BY_FORM = {
  avulso: ['sessao_atual', 'sessoes_previstas', 'parcelas_pagas', 'parcelas_em_aberto'],
  convenio: ['sessao_atual', 'sessoes_previstas', 'parcelas_pagas', 'parcelas_em_aberto'],
  pacote_por_sessao: ['parcelas_pagas', 'parcelas_em_aberto'],
  pacote_parcelas: ['sessoes_feitas', 'sessoes_pagas', 'sessoes_sem_valor'],
};
// Chaves de cada recorte (lista fechada: o teste e a Edge conferem).
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
function financeCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}
function financeAge(value) {
  return value === null || value === undefined ? null : (Number.isInteger(value) && value >= 0 && value <= FINANCE_MAX_AGE ? value : undefined);
}
// FIN-7: paciente é uma palavra só (primeiro nome); com espaço, só o rótulo fixo de arquivado.
function financePatientLabel(value, age) {
  const name = financeName(value);
  if (!name) return '';
  if (name === FINANCE_ARCHIVED) return age === null ? name : '';
  return FINANCE_FIRST_NAME.test(name) ? name : '';
}
export function readFinanceConsulta(raw) {
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
    status: !invalidFilter && !fullName && age !== undefined && FINANCE_FILTERS.includes(item.status) ? item.status : '',
    paciente: fullName ? '' : patient, idade: age === undefined ? null : age,
    profissional: financeName(item.profissional) || 'equipe' };
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
  return { ...query, motivo, mensagem: FINANCE_REASONS[motivo], criterio: null, linhas: [], totais: null, total: null };
}
function readPatientFields(line) {
  const idade = financeAge(line.idade);
  const paciente = idade === undefined ? '' : financePatientLabel(line.paciente, idade);
  const area = financeName(line.area);
  if (!paciente || typeof line.homonimo !== 'boolean' || !FINANCE_AREAS.includes(area) || typeof line.profissional !== 'string') return null;
  return { paciente, idade, homonimo: line.homonimo, area, profissional: financeName(line.profissional) };
}
function readMoneyLine(line, query) {
  const who = readPatientFields(line);
  const vencimento = line.vencimento === null ? null : financeDay(line.vencimento);
  const pagamento = line.pagamento === null ? null : financeDay(line.pagamento);
  if (!who || financeCount(line.valor_centavos) === null || !FINANCE_ROW_STATUS.includes(line.status) || vencimento === '' || pagamento === '') return null;
  const paid = line.status === 'recebido' || line.status === 'recebido_operadora';
  const date = paid ? pagamento : vencimento;
  const waiting = line.status === 'aguardando_lote_operadora';
  if ((waiting && (vencimento !== null || pagamento !== null || query.status !== 'a_receber'))
      || (!waiting && (!date || date < query.de || date > query.ate)) || (query.status === 'recebidos') !== paid
      || (query.status === 'atrasados' && !line.status.startsWith('atrasado'))) return null;
  return { ...who, valor_centavos: line.valor_centavos, vencimento, pagamento, status: line.status };
}
function readAreaLine(line) {
  const area = financeName(line.area);
  const own = financeCount(line.paciente_centavos);
  const operator = financeCount(line.operadora_centavos);
  if (!FINANCE_AREAS.includes(area) || own === null || operator === null || line.total_centavos !== own + operator) return null;
  return { area, paciente_centavos: own, operadora_centavos: operator, total_centavos: own + operator };
}
function readPatientLine(line) {
  const who = readPatientFields(line);
  if (!who || !FINANCE_FORMS.includes(line.forma) || !FINANCE_SITUATIONS.includes(line.situacao)) return null;
  const counts = {};
  for (const key of ['sessoes_feitas', 'sessoes_pagas', 'sessoes_sem_valor', 'sessao_atual', 'sessoes_previstas', 'parcelas_pagas', 'parcelas_em_aberto']) {
    counts[key] = line[key] === null ? null : financeCount(line[key]);
    if (counts[key] === null && line[key] !== null) return null;
  }
  // Pacote à vista ou parcelado conta parcela, nunca sessão paga; avulso e
  // convênio não têm parcela nem "sessão N de M" (QA, 09/11/2026).
  if (FINANCE_NULL_BY_FORM[line.forma].some(key => counts[key] !== null)) return null;
  const open = financeCount(line.em_aberto_centavos);
  if (open === null || (open === 0) !== (line.situacao === 'em_dia')
      || (line.situacao === 'da_operadora') !== (line.forma === 'convenio' && open > 0)) return null;
  return { ...who, forma: line.forma, ...counts, em_aberto_centavos: open, situacao: line.situacao };
}
// Lista fechada T2/FIN-7: cada objeto é remontado só com as chaves do recorte;
// uma linha fora do contrato (nome completo, idade inventada, campo a mais
// que não cabe) derruba a resposta inteira, nunca chega ao modelo.
export function readFinanceResult(raw) {
  const item = financeRecord(raw);
  const query = readFinanceConsulta(item);
  const issue = financeConsultaIssue(query);
  if (issue) return financeConsultaFailure(query, issue);
  if (item.motivo) return financeConsultaFailure(query, item.motivo);
  if (!Array.isArray(item.linhas)) return financeConsultaFailure(query, 'erro');
  if (item.linhas.length > FINANCE_MAX_ROWS) return financeConsultaFailure(query, 'limite_linhas');
  const reader = query.status === 'por_area' ? readAreaLine : query.status === 'por_paciente' ? readPatientLine : readMoneyLine;
  const linhas = [];
  for (const rawLine of item.linhas) {
    const line = reader(financeRecord(rawLine), query);
    if (!line) return financeConsultaFailure(query, 'erro');
    linhas.push(line);
  }
  let totais = null;
  if (query.status === 'por_area') {
    const sum = key => linhas.reduce((total, line) => total + line[key], 0);
    totais = { paciente_centavos: sum('paciente_centavos'), operadora_centavos: sum('operadora_centavos'), total_centavos: sum('total_centavos') };
    if (!Number.isSafeInteger(totais.total_centavos)) return financeConsultaFailure(query, 'erro');
  }
  const criterio = query.status === 'por_area' ? FINANCE_CRITERIA.area
    : query.status === 'por_paciente' ? FINANCE_CRITERIA.paciente
      : query.status === 'recebidos' ? FINANCE_CRITERIA.pagamento
        : linhas.some(line => line.status === 'aguardando_lote_operadora') ? FINANCE_CRITERIA.misto : FINANCE_CRITERIA.vencimento;
  return { ...query, motivo: null, mensagem: '', criterio, linhas, totais, total: linhas.length };
}

const plainName = value => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR').trim();
const areaLabel = discipline => DISCIPLINES.find(item => item.id === discipline)?.label || FINANCE_NO_AREA;

/** Recebido no período, por área (paciente × operadora), sem nome de paciente. */
function receivedByArea({ money, query, chargeById, packageById, keep }) {
  const byArea = new Map();
  const receipts = [...(money.receipts || []), ...operatorReceiptsFrom(money.tissPaid)];
  for (const row of receipts) {
    if (row.voided_at || row.received_on < query.de || row.received_on > query.ate) continue;
    const charge = chargeById.get(row.charge_id);
    const pkg = packageById.get(row.package_id);
    if (!keep(row.patient_id || charge?.patient_id || pkg?.patient_id, charge?.professional_id || pkg?.professional_id)) continue;
    const area = areaLabel(charge?.discipline || pkg?.discipline);
    const line = byArea.get(area) || { area, paciente_centavos: 0, operadora_centavos: 0, total_centavos: 0 };
    line[row.source === 'operadora' ? 'operadora_centavos' : 'paciente_centavos'] += row.amount_cents;
    line.total_centavos += row.amount_cents;
    byArea.set(area, line);
  }
  return [...byArea.values()].sort((a, b) => b.total_centavos - a.total_centavos || a.area.localeCompare(b.area, 'pt-BR'));
}

/**
 * Sessões e parcelas por paciente, área e profissional, a partir dos itens de
 * buildReceivables (o mesmo "A receber" da tela): o que aparece lá está em
 * aberto; o que não aparece está pago. Pacote à vista ou parcelado: a dívida
 * está nas parcelas, nunca vira "sessão paga".
 */
function situationByPatient({ money, query, items, keep }) {
  const openByCharge = new Map();
  const openInstallments = new Map();
  for (const item of items) {
    // Avulso e convênio trazem chargeId; sessão de pacote "a cada sessão" vem
    // só na chave do item (buildReceivables: package:<pacote>:session:<cobrança>).
    const sessionCharge = item.kind === 'session' ? String(item.key || '').split(':')[3] : null;
    if (item.chargeId || sessionCharge) openByCharge.set(item.chargeId || sessionCharge, item);
    if (item.kind === 'installment') {
      const list = openInstallments.get(item.packageId) || [];
      list.push(item);
      openInstallments.set(item.packageId, list);
    }
  }
  const packageById = new Map((money.packages || []).filter(pkg => pkg.status !== 'voided').map(pkg => [pkg.id, pkg]));
  const groups = new Map();
  const groupOf = (patientId, professionalId, discipline, forma, extra = {}) => {
    const key = [patientId, professionalId, discipline, forma, extra.packageId || ''].join('|');
    const group = groups.get(key) || { patientId, professionalId, area: areaLabel(discipline), forma, sessoes_feitas: 0, sessoes_pagas: 0,
      sessoes_sem_valor: 0, sessao_atual: null, sessoes_previstas: null, parcelas_pagas: null, parcelas_em_aberto: null, open: 0, late: false };
    groups.set(key, group);
    return group;
  };
  const addOpen = (group, item) => {
    if (!item) return;
    group.open += item.openCents;
    group.late = group.late || Boolean(item.late);
  };

  for (const charge of money.charges || []) {
    if (charge.voided_at || charge.source !== 'appointment' || charge.service_on < query.de || charge.service_on > query.ate) continue;
    const pkg = charge.package_id ? packageById.get(charge.package_id) : null;
    if (charge.package_id && (!pkg || pkg.payment_plan !== 'per_session')) continue;
    const forma = pkg ? 'pacote_por_sessao' : isConvenioCharge(charge) ? 'convenio' : 'avulso';
    if (!keep(charge.patient_id || pkg?.patient_id, charge.professional_id)) continue;
    const group = groupOf(charge.patient_id || pkg?.patient_id, charge.professional_id, charge.discipline || pkg?.discipline, forma, { packageId: pkg?.id });
    group.sessoes_feitas += 1;
    const open = openByCharge.get(charge.id);
    if (charge.price_cents == null) group.sessoes_sem_valor += 1;
    else if (!open) group.sessoes_pagas += 1;
    addOpen(group, open);
    if (pkg) {
      group.sessao_atual = (money.charges || []).filter(row => row.package_id === pkg.id && row.source === 'appointment' && !row.voided_at).length;
      group.sessoes_previstas = pkg.sessions_planned ?? null;
    }
  }

  // Resto do encerramento de pacote "a cada sessão": entra no aberto, sem contar sessão.
  for (const item of items) {
    const pkg = item.kind === 'rest' ? packageById.get(item.packageId) : null;
    if (!pkg || item.dueOn < query.de || item.dueOn > query.ate || !keep(pkg.patient_id, item.professionalId)) continue;
    addOpen(groupOf(pkg.patient_id, item.professionalId, pkg.discipline, 'pacote_por_sessao', { packageId: pkg.id }), item);
  }

  for (const pkg of packageById.values()) {
    if (pkg.payment_plan === 'per_session' || !keep(pkg.patient_id, pkg.professional_id)) continue;
    const dueSoFar = (money.installments || []).filter(row => row.package_id === pkg.id && row.due_on <= query.ate);
    const sessions = (money.charges || []).filter(row => row.package_id === pkg.id && row.source === 'appointment' && !row.voided_at);
    const inPeriod = sessions.some(row => row.service_on >= query.de && row.service_on <= query.ate)
      || dueSoFar.some(row => row.due_on >= query.de);
    if (!inPeriod) continue;
    const open = (openInstallments.get(pkg.id) || []).filter(item => item.dueOn <= query.ate);
    const group = groupOf(pkg.patient_id, pkg.professional_id, pkg.discipline, 'pacote_parcelas', { packageId: pkg.id });
    group.sessoes_feitas = null;
    group.sessoes_pagas = null;
    group.sessoes_sem_valor = null;
    group.sessao_atual = sessions.length;
    group.sessoes_previstas = pkg.sessions_planned ?? null;
    group.parcelas_em_aberto = open.length;
    group.parcelas_pagas = Math.max(0, dueSoFar.length - open.length);
    open.forEach(item => addOpen(group, item));
  }

  return [...groups.values()].map(group => ({
    ...group,
    situacao: group.open === 0 ? 'em_dia' : group.forma === 'convenio' ? 'da_operadora' : group.late ? 'atrasado' : 'em_aberto',
  }));
}

/** Mesmas contas da tela. O paciente sai só com primeiro nome e idade (FIN-5). */
export function summarizeFinance({ consulta, money, patients, members, shortName, today, selfId }) {
  const query = readFinanceConsulta(consulta);
  const issue = financeConsultaIssue(query);
  if (issue) return financeConsultaFailure(query, issue);
  const people = new Map(patients.map(row => [row.id, { first: firstNameOf(row.name), age: ageOn(row.birth_date, today) }]));
  let patientIds = null;
  if (query.paciente) {
    const term = plainName(query.paciente);
    patientIds = new Set(patients.filter(row => plainName(people.get(row.id).first) === term
      && (query.idade === null || people.get(row.id).age === query.idade)).map(row => row.id));
    if (!patientIds.size) return financeConsultaFailure(query, 'nao_encontrado');
  }
  const matched = query.profissional === 'equipe' ? null : matchTeamMember(query.profissional, members, selfId);
  if (matched?.motivo) return financeConsultaFailure(query, matched.motivo);
  const professionalId = matched?.member?.id || null;
  const keep = (patientId, proId) => (!patientIds || patientIds.has(patientId)) && (!professionalId || proId === professionalId);
  const memberById = new Map(members.map(row => [row.id, shortName(row.full_name)]));
  const chargeById = new Map(money.charges.map(row => [row.id, row]));
  const packageById = new Map(money.packages.map(row => [row.id, row]));

  if (query.status === 'por_area') {
    const linhas = receivedByArea({ money, query, chargeById, packageById, keep });
    if (linhas.length > FINANCE_MAX_ROWS) return financeConsultaFailure(query, 'limite_linhas');
    return readFinanceResult({ ...query, linhas });
  }

  const receipts = [...money.receipts, ...operatorReceiptsFrom(money.tissPaid)];
  const items = buildReceivables({ ...money, receipts, today }).items;
  // Quem é quem sem sobrenome: homônimo = mesmo primeiro nome, idade e profissional, pessoas diferentes.
  const label = rows => {
    const owners = new Map();
    for (const row of rows) {
      const person = people.get(row.patientId);
      const key = person ? [plainName(person.first), person.age, row.professionalId].join('|') : '';
      if (!key) continue;
      owners.set(key, (owners.get(key) || new Set()).add(row.patientId));
    }
    return row => {
      const person = people.get(row.patientId);
      const key = person ? [plainName(person.first), person.age, row.professionalId].join('|') : '';
      return {
        paciente: person ? person.first : FINANCE_ARCHIVED,
        idade: person ? person.age : null,
        homonimo: Boolean(key) && owners.get(key).size > 1,
        area: areaLabel(row.discipline),
        profissional: memberById.get(row.professionalId) || '',
      };
    };
  };

  if (query.status === 'por_paciente') {
    const groups = situationByPatient({ money, query, items, keep });
    if (groups.length > FINANCE_MAX_ROWS) return financeConsultaFailure(query, 'limite_linhas');
    const who = label(groups);
    const order = FINANCE_SITUATIONS;
    const linhas = groups.map(group => ({ ...who({ ...group, discipline: null }), area: group.area,
      forma: group.forma, sessoes_feitas: group.sessoes_feitas, sessoes_pagas: group.sessoes_pagas, sessoes_sem_valor: group.sessoes_sem_valor,
      sessao_atual: group.sessao_atual, sessoes_previstas: group.sessoes_previstas, parcelas_pagas: group.parcelas_pagas,
      parcelas_em_aberto: group.parcelas_em_aberto, em_aberto_centavos: group.open, situacao: group.situacao }))
      .sort((a, b) => order.indexOf(a.situacao) - order.indexOf(b.situacao) || b.em_aberto_centavos - a.em_aberto_centavos
        || a.paciente.localeCompare(b.paciente, 'pt-BR'));
    return readFinanceResult({ ...query, linhas });
  }

  const entries = query.status === 'recebidos'
    ? receipts.filter(row => !row.voided_at).map(row => {
      const charge = chargeById.get(row.charge_id);
      const pkg = packageById.get(row.package_id);
      return { patientId: row.patient_id || charge?.patient_id || pkg?.patient_id,
        professionalId: charge?.professional_id || pkg?.professional_id, discipline: charge?.discipline || pkg?.discipline,
        value: row.amount_cents, date: row.received_on, due: null, paid: row.received_on,
        status: row.source === 'operadora' ? 'recebido_operadora' : 'recebido' };
    })
    : items
      .filter(row => query.status !== 'atrasados' || row.late)
      .map(row => ({ patientId: row.patientId, professionalId: row.professionalId, discipline: row.discipline, value: row.openCents,
        date: row.dueOn, due: row.hasDue === false ? null : row.dueOn, paid: null,
        status: row.hasDue === false && row.payer === 'convenio' ? 'aguardando_lote_operadora'
          : (row.late ? 'atrasado' : 'a_receber') + (row.payer === 'convenio' ? '_operadora' : '') }));
  const matches = entries.filter(row => keep(row.patientId, row.professionalId) && row.date >= query.de && row.date <= query.ate);
  if (matches.length > FINANCE_MAX_ROWS) return financeConsultaFailure(query, 'limite_linhas');
  const who = label(matches);
  return readFinanceResult({ ...query, linhas: matches.map(row => ({
    ...who(row), valor_centavos: row.value, vencimento: row.due, pagamento: row.paid, status: row.status,
  })) });
}

// ============================================================
// ACUP-023 (AG-1, AG-5): agenda e operação da clínica SEM paciente.
// Oito consultas, cada uma com a regra de perfil da tela de origem,
// contadas aqui pelas mesmas funções das telas. Nenhuma linha leva id
// (agendamento, pacote, profissional) nem nada do paciente; o
// profissional sai só pelo nome da Agenda. Espelho dos tipos, chaves,
// rótulos e da limpeza em supabase/functions/_shared/assistantConsulta.ts
// (mudou um, muda o outro; tests/regression/clinic-assistant-agenda.test.mjs).
// ============================================================

export const AGENDA_CONSULTAS = ['agenda', 'faltas', 'confirmacoes_pendentes', 'pacotes_fim', 'aniversarios', 'pesquisas', 'formularios_pendentes', 'convenio'];
// Quem vê cada consulta = quem vê a tela de origem.
//   equipe: Agenda (a clínica toda, inclusive recepção)
//   admin_recepcao: aniversários (botão só da administração e da recepção)
//   admin: Gestão institucional (pesquisas)
//   portal: Importáveis (can_manage_patient_portal)
//   financeiro: Financeiro → convênio e notas (can_manage_finance)
export const AGENDA_ACCESS = {
  agenda: 'equipe', faltas: 'equipe', confirmacoes_pendentes: 'equipe', pacotes_fim: 'equipe',
  aniversarios: 'admin_recepcao', pesquisas: 'admin', formularios_pendentes: 'portal', convenio: 'financeiro',
  // ACUP-025 (AG-8): com paciente; faltosos e aniversariantes só administração e recepção.
  agenda_pacientes: 'equipe', proxima_sessao: 'equipe', faltosos: 'admin_recepcao', aniversariantes: 'admin_recepcao',
};
// Com período obrigatório; confirmações usam amanhã quando não vier período.
export const AGENDA_PERIOD_REQUIRED = ['agenda', 'faltas', 'pesquisas'];
export const AGENDA_PERIOD_OPTIONAL = ['confirmacoes_pendentes'];
// Mesmo limite da "Sua atenção hoje" (packagesNearEnd): 1 sessão ou menos. A fonte é outra (série da Agenda, não pacote do Financeiro).
export const PACKAGE_NEAR_END_MAX = 1;
// Pacote da Agenda ainda em uso: alguma sessão até 30 dias atrás.
export const PACKAGE_ACTIVE_DAYS = 30;
export const PACKAGE_WINDOW_DAYS = 180;
export const AGENDA_SOURCE_LIMIT = 2000;

export const AGENDA_KEYS = {
  agenda: { linha: ['dia', 'inicio', 'fim', 'profissional', 'area', 'tipo_atendimento', 'modalidade', 'status'], resumo: ['agendados', 'atendidos', 'faltas', 'cancelamentos', 'bloqueios'] },
  faltas: { linha: ['profissional', 'area', 'nao_compareceu', 'cancelado_paciente', 'cancelado'], resumo: ['total', 'atendimentos'] },
  confirmacoes_pendentes: { linha: ['dia', 'inicio', 'profissional', 'area'], resumo: ['total'] },
  pacotes_fim: { linha: ['profissional', 'area', 'pacotes', 'sessoes_restantes'], resumo: ['total'] },
  aniversarios: { linha: [], resumo: ['total'] },
  pesquisas: { linha: [], resumo: ['respondidas', 'media', 'aguardando'] },
  formularios_pendentes: { linha: [], resumo: ['enviados', 'respondidos', 'aguardando'] },
  convenio: { linha: [], resumo: ['guias_com_pendencia', 'guias_prontas', 'lotes_nao_enviados', 'guias_esperando_operadora', 'valor_esperando_centavos', 'glosadas', 'notas_pendentes', 'notas_a_cancelar', 'valor_notas_pendentes_centavos'] },
};
export const AGENDA_STATUS_LABELS = [...new Set(APPOINTMENT_STATUSES.map(item => item.label))];
export const AGENDA_TYPE_LABELS = [...new Set([
  ...APPOINTMENT_TYPES.map(item => item.label),
  ...Object.values(SERVICES_BY_AREA).flat().map(item => item.label),
  'Sem tipo',
])].sort((a, b) => a.localeCompare(b, 'pt-BR'));
export const AGENDA_MODALITIES = ['Presencial', 'Online', 'Não informada'];
export const AGENDA_CRITERIA = {
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
function agendaRecord(raw) {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
}
function sameKeys(item, keys) {
  const own = Object.keys(item);
  return own.length === keys.length && keys.every(key => Object.hasOwn(item, key));
}

export function readAgendaConsulta(raw) {
  const item = agendaRecord(raw);
  const tipo = AGENDA_CONSULTAS.includes(item.tipo) ? item.tipo : '';
  const usesPeriod = AGENDA_PERIOD_REQUIRED.includes(tipo) || AGENDA_PERIOD_OPTIONAL.includes(tipo);
  return {
    tipo,
    de: usesPeriod ? financeDay(item.de) : '',
    ate: usesPeriod ? financeDay(item.ate) : '',
    profissional: typeof item.profissional === 'string' ? financeName(item.profissional).slice(0, 80) || 'equipe' : 'equipe',
  };
}
export function agendaConsultaIssue(raw) {
  const query = readAgendaConsulta(raw);
  if (!query.tipo) return 'erro';
  const required = AGENDA_PERIOD_REQUIRED.includes(query.tipo);
  if (!required && !query.de && !query.ate) return null;
  if (!query.de || !query.ate || query.de > query.ate) return 'periodo_invalido';
  if ((Date.parse(query.ate) - Date.parse(query.de)) / 86400000 + 1 > FINANCE_MAX_DAYS) return 'limite_periodo';
  return null;
}
export function agendaConsultaFailure(raw, reason, resumo = null) {
  const query = readAgendaConsulta(raw);
  const motivo = typeof reason === 'string' && Object.hasOwn(AGENDA_REASONS, reason) ? reason : 'erro';
  return { ...query, motivo, mensagem: AGENDA_REASONS[motivo], criterio: null, linhas: [], total: null, resumo };
}

function readAgendaSummary(tipo, raw) {
  const resumo = agendaRecord(raw);
  const keys = AGENDA_KEYS[tipo].resumo;
  if (!sameKeys(resumo, keys)) return null;
  const clean = {};
  for (const key of keys) {
    const value = resumo[key];
    if (key === 'media') {
      if (value !== null && !(typeof value === 'number' && value >= 1 && value <= 5 && Math.abs(value * 10 - Math.round(value * 10)) < 1e-9)) return null;
    } else if (!Number.isSafeInteger(value) || value < 0) return null;
    clean[key] = value;
  }
  return clean;
}
function readAgendaLine(tipo, raw) {
  const line = agendaRecord(raw);
  if (!sameKeys(line, AGENDA_KEYS[tipo].linha)) return null;
  const clean = {};
  for (const key of AGENDA_KEYS[tipo].linha) {
    const value = line[key];
    const ok = key === 'dia' ? financeDay(value) === value
      : key === 'inicio' || key === 'fim' ? typeof value === 'string' && HOUR.test(value)
        : key === 'profissional' ? typeof value === 'string' && value.length <= 80 && !/\p{Cc}/u.test(value)
          : key === 'area' ? FINANCE_AREAS.includes(value)
            : key === 'tipo_atendimento' ? AGENDA_TYPE_LABELS.includes(value)
              : key === 'modalidade' ? AGENDA_MODALITIES.includes(value)
                : key === 'status' ? AGENDA_STATUS_LABELS.includes(value)
                  : Number.isSafeInteger(value) && value >= 0;
    if (!ok) return null;
    clean[key] = value;
  }
  return clean;
}
const AGENDA_TOP_KEYS = ['tipo', 'de', 'ate', 'profissional', 'motivo', 'mensagem', 'criterio', 'linhas', 'total', 'resumo'];
/**
 * Lista fechada por tipo: chave a mais (paciente, id, token, observação)
 * em qualquer nível derruba a resposta inteira, que nunca chega ao modelo.
 * Lista acima de 50 itens volta sem lista, com o resumo em números.
 */
export function readAgendaResult(raw) {
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
  const linhas = [];
  for (const rawLine of item.linhas) {
    const line = readAgendaLine(query.tipo, rawLine);
    if (!line) return agendaConsultaFailure(query, 'erro');
    linhas.push(line);
  }
  return { ...query, motivo: null, mensagem: '', criterio: AGENDA_CRITERIA[query.tipo], linhas, total: linhas.length, resumo };
}

// ---------- contas (aparelho), só com funções das telas ----------

const pad2 = value => String(value).padStart(2, '0');
function localDay(iso) {
  const date = new Date(iso);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}
function localHour(iso) {
  const date = new Date(iso);
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}
const statusLabel = status => APPOINTMENT_STATUSES.find(item => item.id === status)?.label || 'Agendado';
const modalityLabel = modality => (modality === 'online' ? 'Online' : modality === 'presencial' ? 'Presencial' : 'Não informada');
const areaOf = discipline => DISCIPLINES.find(item => item.id === discipline)?.label || FINANCE_NO_AREA;
function withLimit(query, linhas, resumo) {
  if (linhas.length > FINANCE_MAX_ROWS) return readAgendaResult({ ...query, motivo: 'limite_linhas', linhas: [], total: null, resumo });
  return readAgendaResult({ ...query, motivo: null, mensagem: '', criterio: '', linhas, total: linhas.length, resumo });
}

/** Agenda do período: horário, área, tipo, modalidade e status. Bloqueio só conta. */
export function summarizeAgendaPeriod({ consulta, appointments = [], nameOf = () => '' }) {
  const query = readAgendaConsulta(consulta);
  const visits = appointments.filter(item => item?.kind !== 'block');
  const resumo = {
    agendados: visits.filter(item => item.status === 'scheduled' || item.status === 'ready').length,
    atendidos: visits.filter(item => item.status === 'attended').length,
    faltas: visits.filter(item => item.status === 'no_show').length,
    cancelamentos: visits.filter(item => item.status === 'excused' || item.status === 'cancelled').length,
    bloqueios: appointments.length - visits.length,
  };
  const linhas = visits.slice().sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at))).map(item => ({
    dia: localDay(item.starts_at),
    inicio: localHour(item.starts_at),
    fim: localHour(item.ends_at || item.starts_at),
    profissional: nameOf(item.professional_id),
    area: areaOf(item.discipline),
    tipo_atendimento: appointmentTypeLabel(item.appointment_type, item.discipline),
    modalidade: modalityLabel(item.modality),
    status: statusLabel(item.status),
  }));
  return withLimit(query, linhas, resumo);
}

/** Faltas e cancelamentos por profissional e área (isAbsence de Gestão → Indicadores). */
export function summarizeAbsencesPeriod({ consulta, appointments = [], nameOf = () => '' }) {
  const query = readAgendaConsulta(consulta);
  const absences = appointments.filter(isAbsence);
  const groups = new Map();
  for (const item of absences) {
    const key = `${item.professional_id}|${item.discipline}`;
    const line = groups.get(key) || { profissional: nameOf(item.professional_id), area: areaOf(item.discipline), nao_compareceu: 0, cancelado_paciente: 0, cancelado: 0 };
    if (item.status === 'no_show') line.nao_compareceu += 1;
    else if (item.status === 'excused') line.cancelado_paciente += 1;
    else line.cancelado += 1;
    groups.set(key, line);
  }
  const total = line => line.nao_compareceu + line.cancelado_paciente + line.cancelado;
  const linhas = [...groups.values()].sort((a, b) => total(b) - total(a) || a.profissional.localeCompare(b.profissional, 'pt-BR'));
  return withLimit(query, linhas, { total: absences.length, atendimentos: appointments.filter(item => item?.kind === 'appointment').length });
}

/** Confirmações pendentes (a lista vem de listPendingConfirmations, a fila da Agenda). */
export function summarizePendingConfirmationsPeriod({ consulta, pending = [], nameOf = () => '' }) {
  const query = readAgendaConsulta(consulta);
  const linhas = pending.slice().sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at))).map(item => ({
    dia: localDay(item.starts_at), inicio: localHour(item.starts_at), profissional: nameOf(item.professional_id), area: areaOf(item.discipline),
  }));
  return withLimit(query, linhas, { total: pending.length });
}

/**
 * Pacotes da Agenda perto do fim: série (recurrence_group_id) em uso, com
 * PACKAGE_NEAR_END_MAX sessão agendada ou menos, contada por
 * summarizePackageSessions (a mesma janela "Sessões do pacote").
 */
export function summarizePackagesNearEndAgenda({ consulta, appointments = [], nameOf = () => '', professionalId = null, now = new Date() }) {
  const query = readAgendaConsulta(consulta);
  const bySeries = new Map();
  for (const item of appointments) {
    if (!item?.recurrence_group_id || item.kind === 'block') continue;
    const list = bySeries.get(item.recurrence_group_id) || [];
    list.push(item);
    bySeries.set(item.recurrence_group_id, list);
  }
  const activeSince = now.getTime() - PACKAGE_ACTIVE_DAYS * 86_400_000;
  const groups = new Map();
  let packages = 0;
  for (const rows of bySeries.values()) {
    const summary = summarizePackageSessions(rows, { now });
    const recent = rows.some(row => row.status !== 'cancelled' && new Date(row.starts_at).getTime() >= activeSince);
    if (!recent || summary.remaining > PACKAGE_NEAR_END_MAX) continue;
    const last = rows.slice().sort((a, b) => String(b.starts_at).localeCompare(String(a.starts_at)))[0];
    if (professionalId && last.professional_id !== professionalId) continue;
    packages += 1;
    const key = `${last.professional_id}|${last.discipline}`;
    const line = groups.get(key) || { profissional: nameOf(last.professional_id), area: areaOf(last.discipline), pacotes: 0, sessoes_restantes: 0 };
    line.pacotes += 1;
    line.sessoes_restantes += summary.remaining;
    groups.set(key, line);
  }
  const linhas = [...groups.values()].sort((a, b) => b.pacotes - a.pacotes || a.profissional.localeCompare(b.profissional, 'pt-BR'));
  return withLimit(query, linhas, { total: packages });
}

/** Aniversários do mês: só a contagem (currentMonthBirthdays da Agenda). */
export function summarizeBirthdaysCount({ consulta, patients = [], today = new Date() }) {
  return withLimit(readAgendaConsulta(consulta), [], { total: currentMonthBirthdays(patients, today).length });
}

/** Pesquisas do período: respondidas, média e aguardando, sem comentário. */
export function summarizeSurveysPeriod({ consulta, surveys = [], now = new Date() }) {
  const responded = surveys.filter(item => item.responded_at);
  const waiting = surveys.filter(item => !item.responded_at && (!item.expires_at || new Date(item.expires_at) >= now)).length;
  // Mesma média do quadro Pesquisa do Resumo da Gestão (pesquisaTile): soma das notas ÷ respondidas.
  // O teste confere contra buildGestaoSummary (gestaoSummary.js não carrega fora do Vite).
  const media = responded.length ? Math.round((responded.reduce((sum, item) => sum + Number(item.rating || 0), 0) / responded.length) * 10) / 10 : null;
  return withLimit(readAgendaConsulta(consulta), [], { respondidas: responded.length, media, aguardando: waiting });
}

/** Formulários da Área do Paciente: mesma conta de Importáveis (sendsTabSummary). */
export function summarizePortalForms({ consulta, assignments = [], now = new Date() }) {
  const summary = sendsTabSummary(assignments, now);
  return withLimit(readAgendaConsulta(consulta), [], { enviados: summary.count, respondidos: summary.count - summary.waiting, aguardando: summary.waiting });
}

/** Convênio e notas: os números dos quadros Guias, Lotes, Pagamentos e Notas do Financeiro. */
export function summarizeConvenioState({ consulta, tiss, fiscal, today }) {
  const guides = tiss?.guides || [];
  const waiting = guides.filter(row => ['batched', 'glosa', 'appeal'].includes(row.status) && row.batch?.status === 'sent');
  const queue = fiscalQueue(fiscal?.documents || []);
  // Os dois primeiros números são os que os quadros Guias e Lotes mostram (buildTissTiles).
  const tiles = buildTissTiles({ tiss, tissError: null, today }).tiles;
  return withLimit(readAgendaConsulta(consulta), [], {
    guias_com_pendencia: Number(tiles.guias.display),
    guias_prontas: Number(tiles.lotes.display),
    lotes_nao_enviados: (tiss?.batches || []).filter(row => row.status === 'generated').length,
    guias_esperando_operadora: waiting.length,
    valor_esperando_centavos: waiting.reduce((sum, row) => sum + (row.total_cents - (row.settled?.paid_cents || 0)), 0),
    glosadas: guides.filter(row => row.status === 'glosa' || row.status === 'appeal').length,
    notas_pendentes: queue.pending.length,
    notas_a_cancelar: queue.toCancel.length,
    valor_notas_pendentes_centavos: queue.pending.reduce((sum, row) => sum + row.amount_cents, 0),
  });
}

// ============================================================
// ACUP-025 (AG-2, AG-8): agenda COM paciente, só primeiro nome + idade
// (mesmos firstNameOf, ageOn e FINANCE_FIRST_NAME do financeiro), só o que
// o login já vê na Agenda. Quatro tipos novos; os da fase 1 (ACUP-023)
// seguem sem paciente. Espelho em supabase/functions/_shared/assistantConsulta.ts.
// ============================================================

export const PATIENT_CONSULTAS = ['agenda_pacientes', 'proxima_sessao', 'faltosos', 'aniversariantes'];
// Paciente que a Agenda mostra mas que não está na lista do login: rótulo fixo, sem idade.
export const PATIENT_OUTSIDE = 'Paciente fora da sua lista';
export const PATIENT_NEXT_MAX = 5;
export const PATIENT_BIRTHDAY_MAX_DAYS = 31;
export const PATIENT_KEYS = {
  // ACUP-027 (AG-10): `ref` = código curto da conversa (nunca id), para a IA apontar o atendimento numa ação.
  agenda_pacientes: { linha: ['ref', 'dia', 'inicio', 'fim', 'paciente', 'idade', 'homonimo', 'profissional', 'area', 'tipo_atendimento', 'modalidade', 'status'], resumo: ['agendados', 'atendidos', 'faltas', 'cancelamentos', 'bloqueios'] },
  proxima_sessao: { linha: ['ref', 'paciente', 'idade', 'homonimo', 'dia', 'inicio', 'profissional', 'area', 'tipo_atendimento', 'sessao_numero', 'sessoes_total'], resumo: ['total'] },
  faltosos: { linha: ['paciente', 'idade', 'homonimo', 'profissional', 'area', 'nao_compareceu', 'cancelado_paciente'], resumo: ['total'] },
  aniversariantes: { linha: ['paciente', 'idade', 'homonimo'], resumo: ['total'] },
};
export const PATIENT_CRITERIA = {
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

export function readPatientConsulta(raw) {
  const item = agendaRecord(raw);
  const tipo = PATIENT_CONSULTAS.includes(item.tipo) ? item.tipo : '';
  const patient = typeof item.paciente === 'string' ? financeName(item.paciente) : '';
  const age = financeAge(item.idade);
  const minimo = item.minimo === undefined || item.minimo === null ? 2 : (Number.isInteger(item.minimo) && item.minimo >= 1 && item.minimo <= 20 ? item.minimo : 0);
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
function patientQuery(query) {
  // O pedido devolvido: sem o campo interno `pedido`; tipo inválido volta como o pedido para a mensagem.
  const { pedido, ...rest } = query;
  return { ...rest, tipo: rest.tipo || pedido };
}
export function patientConsultaIssue(raw) {
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
export function patientConsultaFailure(raw, reason, resumo = null) {
  const query = patientQuery(readPatientConsulta(raw));
  const motivo = typeof reason === 'string' && Object.hasOwn(PATIENT_REASONS, reason) ? reason : 'erro';
  return { ...query, motivo, mensagem: PATIENT_REASONS[motivo], criterio: null, linhas: [], total: null, resumo };
}

function readPatientLineFor(tipo, raw) {
  const line = agendaRecord(raw);
  const keys = PATIENT_KEYS[tipo].linha;
  if (!sameKeys(line, keys)) return null;
  const idade = financeAge(line.idade);
  const fixed = line.paciente === FINANCE_ARCHIVED || line.paciente === PATIENT_OUTSIDE;
  // FIN-7: primeiro nome só de letras; rótulo fixo só sem idade.
  if (idade === undefined || typeof line.paciente !== 'string' || (fixed ? idade !== null : !FINANCE_FIRST_NAME.test(line.paciente))
      || typeof line.homonimo !== 'boolean') return null;
  if (keys.includes('ref') && !(typeof line.ref === 'string' && ASSISTANT_REF.test(line.ref))) return null;
  const clean = { paciente: line.paciente, idade, homonimo: line.homonimo, ...(keys.includes('ref') ? { ref: line.ref } : {}) };
  for (const key of keys) {
    if (key in clean) continue;
    const value = line[key];
    // Campos da agenda: a mesma validação de readAgendaLine (valores fechados).
    const ok = key === 'sessao_numero' || key === 'sessoes_total'
      ? value === null || (Number.isSafeInteger(value) && value >= 1)
      : readAgendaLine('agenda', { dia: '2026-01-01', inicio: '00:00', fim: '00:00', profissional: '', area: FINANCE_NO_AREA, tipo_atendimento: 'Sem tipo', modalidade: 'Não informada', status: 'Agendado', [key]: value }) !== null
        || (['nao_compareceu', 'cancelado_paciente'].includes(key) && Number.isSafeInteger(value) && value >= 0);
    if (!ok) return null;
    clean[key] = value;
  }
  return Object.fromEntries(keys.map(key => [key, clean[key]]));
}
/** Lista fechada por tipo; nome completo ou chave a mais derruba a resposta inteira. */
export function readPatientResult(raw) {
  const item = agendaRecord(raw);
  const parsed = readPatientConsulta(item);
  const query = patientQuery(parsed);
  if (!parsed.tipo || Object.keys(item).some(key => !PATIENT_TOP_KEYS.includes(key))) return patientConsultaFailure(item, parsed.pedido && !parsed.tipo ? 'filtro_invalido' : 'erro');
  const issue = patientConsultaIssue(item);
  if (issue) return patientConsultaFailure(item, issue);
  const summaryKeys = PATIENT_KEYS[parsed.tipo].resumo;
  const readSummary = value => {
    const resumo = agendaRecord(value);
    if (!sameKeys(resumo, summaryKeys) || summaryKeys.some(key => !Number.isSafeInteger(resumo[key]) || resumo[key] < 0)) return null;
    return Object.fromEntries(summaryKeys.map(key => [key, resumo[key]]));
  };
  if (item.motivo === 'limite_linhas') {
    const resumo = readSummary(item.resumo);
    return patientConsultaFailure(item, resumo ? 'limite_linhas' : 'erro', resumo);
  }
  if (item.motivo) return patientConsultaFailure(item, item.motivo);
  const resumo = readSummary(item.resumo);
  if (!resumo || !Array.isArray(item.linhas)) return patientConsultaFailure(item, 'erro');
  if (item.linhas.length > FINANCE_MAX_ROWS) return patientConsultaFailure(item, 'limite_linhas', resumo);
  const linhas = [];
  for (const rawLine of item.linhas) {
    const line = readPatientLineFor(parsed.tipo, rawLine);
    if (!line) return patientConsultaFailure(item, 'erro');
    linhas.push(line);
  }
  return { ...query, motivo: null, mensagem: '', criterio: PATIENT_CRITERIA[parsed.tipo], linhas, total: linhas.length, resumo };
}

// ---------- contas (aparelho) ----------

/** Quem é quem sem sobrenome: homônimo = mesmo primeiro nome, idade e profissional, pessoas diferentes. */
function labelPatients(rows, people) {
  const owners = new Map();
  const keyOf = row => {
    const person = people.get(row.patientId);
    return person ? [plainName(person.first), person.age, row.professionalId || ''].join('|') : '';
  };
  for (const row of rows) {
    const key = keyOf(row);
    if (key) owners.set(key, (owners.get(key) || new Set()).add(row.patientId));
  }
  return row => {
    const person = people.get(row.patientId);
    const key = keyOf(row);
    return {
      paciente: person ? person.first : PATIENT_OUTSIDE,
      idade: person ? person.age : null,
      homonimo: Boolean(key) && owners.get(key).size > 1,
    };
  };
}
function peopleOf(patients, today) {
  return new Map(patients.filter(row => FINANCE_FIRST_NAME.test(firstNameOf(row.name)))
    .map(row => [row.id, { first: firstNameOf(row.name), age: ageOn(row.birth_date, today) }]));
}
/** Pacientes do login que casam com o primeiro nome (e a idade, se veio). */
export function matchPatients({ patients = [], paciente, idade = null, today }) {
  const term = plainName(paciente);
  return patients.filter(row => plainName(firstNameOf(row.name)) === term && (idade === null || ageOn(row.birth_date, today) === idade));
}
function patientLimit(query, linhas, resumo) {
  if (linhas.length > FINANCE_MAX_ROWS) return readPatientResult({ ...query, motivo: 'limite_linhas', linhas: [], total: null, resumo });
  return readPatientResult({ ...query, motivo: null, mensagem: '', criterio: '', linhas, total: linhas.length, resumo });
}

/** Agenda do período com paciente (só o que a Agenda do login mostra). */
export function summarizeAgendaWithPatients({ consulta, appointments = [], patients = [], nameOf = () => '', today, patientIds = null, refOf = createRefRegistry().refFor }) {
  const query = patientQuery(readPatientConsulta(consulta));
  const visits = appointments.filter(item => item?.kind !== 'block' && (!patientIds || patientIds.has(item.patient_id)));
  const people = peopleOf(patients, today);
  const rows = visits.slice().sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)))
    .map(item => ({ item, patientId: item.patient_id, professionalId: item.professional_id }));
  const who = labelPatients(rows, people);
  const resumo = {
    agendados: visits.filter(item => item.status === 'scheduled' || item.status === 'ready').length,
    atendidos: visits.filter(item => item.status === 'attended').length,
    faltas: visits.filter(item => item.status === 'no_show').length,
    cancelamentos: visits.filter(item => item.status === 'excused' || item.status === 'cancelled').length,
    bloqueios: patientIds ? 0 : appointments.length - visits.length,
  };
  const linhas = rows.map(row => ({
    ref: refOf(row.item),
    dia: localDay(row.item.starts_at), inicio: localHour(row.item.starts_at), fim: localHour(row.item.ends_at || row.item.starts_at),
    ...who(row), profissional: nameOf(row.item.professional_id), area: areaOf(row.item.discipline),
    tipo_atendimento: appointmentTypeLabel(row.item.appointment_type, row.item.discipline), modalidade: modalityLabel(row.item.modality), status: statusLabel(row.item.status),
  }));
  return patientLimit(query, linhas, resumo);
}

/** Próxima sessão: o primeiro atendimento Agendado de cada paciente; número pela regra de "Sessões do pacote". */
export function summarizeNextSessions({ consulta, nexts = [], patients = [], nameOf = () => '', today, refOf = createRefRegistry().refFor }) {
  const query = patientQuery(readPatientConsulta(consulta));
  const people = peopleOf(patients, today);
  const rows = nexts.map(next => ({ ...next, patientId: next.appointment.patient_id, professionalId: next.appointment.professional_id }));
  const who = labelPatients(rows, people);
  const linhas = rows.map(row => {
    const summary = row.series ? summarizePackageSessions(row.series, { currentId: row.appointment.id, now: new Date(`${today}T00:00:00`) }) : null;
    return {
      ref: refOf(row.appointment), ...who(row), dia: localDay(row.appointment.starts_at), inicio: localHour(row.appointment.starts_at), profissional: nameOf(row.appointment.professional_id),
      area: areaOf(row.appointment.discipline), tipo_atendimento: appointmentTypeLabel(row.appointment.appointment_type, row.appointment.discipline),
      sessao_numero: summary?.currentNumber ?? null, sessoes_total: summary ? summary.total || null : null,
    };
  });
  return patientLimit(query, linhas, { total: linhas.length });
}

/** Faltosos: não compareceu + cancelado pelo paciente, por paciente × profissional × área, a partir do mínimo. */
export function summarizeFrequentAbsences({ consulta, appointments = [], patients = [], nameOf = () => '', today }) {
  const query = patientQuery(readPatientConsulta(consulta));
  const groups = new Map();
  for (const item of appointments) {
    if (!isAbsence(item) || item.status === 'cancelled') continue;
    const key = `${item.patient_id}|${item.professional_id}|${item.discipline}`;
    const group = groups.get(key) || { patientId: item.patient_id, professionalId: item.professional_id, discipline: item.discipline, nao_compareceu: 0, cancelado_paciente: 0 };
    if (item.status === 'no_show') group.nao_compareceu += 1;
    else group.cancelado_paciente += 1;
    groups.set(key, group);
  }
  const rows = [...groups.values()].filter(group => group.nao_compareceu + group.cancelado_paciente >= query.minimo)
    .sort((a, b) => (b.nao_compareceu + b.cancelado_paciente) - (a.nao_compareceu + a.cancelado_paciente));
  const who = labelPatients(rows, peopleOf(patients, today));
  const linhas = rows.map(row => ({ ...who(row), profissional: nameOf(row.professionalId), area: areaOf(row.discipline), nao_compareceu: row.nao_compareceu, cancelado_paciente: row.cancelado_paciente }));
  return patientLimit(query, linhas, { total: linhas.length });
}

/** Aniversariantes do período (até 31 dias), pela mesma regra da Agenda (birthdaysByDay); sem a data. */
export function summarizeBirthdayPeople({ consulta, patients = [], today }) {
  let query = patientQuery(readPatientConsulta(consulta));
  if (!query.de && !query.ate) {
    const [year, month] = today.split('-').map(Number);
    query = { ...query, de: `${year}-${pad2(month)}-01`, ate: `${year}-${pad2(month)}-${pad2(new Date(year, month, 0).getDate())}` };
  }
  const found = [];
  const start = new Date(`${query.de}T00:00:00`);
  const end = new Date(`${query.ate}T00:00:00`);
  for (let cursor = new Date(start.getFullYear(), start.getMonth(), 1); cursor <= end; cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)) {
    for (const [day, list] of birthdaysByDay(patients, cursor.getFullYear(), cursor.getMonth() + 1)) {
      if (day < query.de || day > query.ate) continue;
      for (const person of list) found.push({ day, id: person.id, name: person.name, age: person.age });
    }
  }
  found.sort((a, b) => a.day.localeCompare(b.day));
  const valid = found.filter(person => FINANCE_FIRST_NAME.test(firstNameOf(person.name)));
  const people = new Map(valid.map(person => [person.id, { first: firstNameOf(person.name), age: person.age }]));
  const rows = valid.map(person => ({ patientId: person.id, professionalId: '' }));
  const who = labelPatients(rows, people);
  const linhas = rows.map(row => who(row));
  return patientLimit(query, linhas, { total: linhas.length });
}

// ============================================================
// ACUP-027 (AG-4, AG-10): ações que a assistente PREPARA e a pessoa decide.
// A IA aponta o atendimento por `ref` (código curto da conversa, só na
// memória da aba, nunca id); o aparelho resolve pelo próprio login. Uma
// ação por resposta; nada é enviado, salvo, agendado ou cobrado sozinho.
// ============================================================
export const ASSISTANT_REF = /^r[0-9a-z]{3}$/;
export const ASSISTANT_ACTIONS = ['confirmacao', 'novo_agendamento'];

/**
 * Ação pedida pela IA, limpa por lista fechada. `refs` (Edge) = os refs dos
 * dados aceitos nesta chamada; ref fora deles, nenhuma ação. Profissional fora
 * da EQUIPE, tipo fora da lista, dia ou hora inválidos ficam vazios: a pessoa
 * escolhe, nunca um palpite. Lista (várias ações) = nenhuma.
 */
export function readAssistantAction(raw, { team = null, refs = null } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (!ASSISTANT_ACTIONS.includes(raw.tipo) || typeof raw.ref !== 'string' || !ASSISTANT_REF.test(raw.ref)) return null;
  if (refs && !refs.includes(raw.ref)) return null;
  if (raw.tipo === 'confirmacao') return { tipo: 'confirmacao', ref: raw.ref };
  const profissional = typeof raw.profissional === 'string' ? financeName(raw.profissional).slice(0, 80) : '';
  return {
    tipo: 'novo_agendamento',
    ref: raw.ref,
    profissional: team && !team.includes(profissional) ? '' : profissional,
    dia: financeDay(raw.dia),
    hora: typeof raw.hora === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(raw.hora) ? raw.hora : '',
    tipo_atendimento: AGENDA_TYPE_LABELS.includes(raw.tipo_atendimento) && raw.tipo_atendimento !== 'Sem tipo' ? raw.tipo_atendimento : '',
  };
}

/** Refs dos dados aceitos (linhas de agenda_pacientes e proxima_sessao). */
export function refsOf(consultados = []) {
  return consultados.flatMap(item => (Array.isArray(item?.linhas) ? item.linhas : []))
    .map(line => line?.ref).filter(ref => typeof ref === 'string' && ASSISTANT_REF.test(ref));
}

/**
 * Tabela da conversa: ref → atendimento, só na memória da aba. Os códigos não
 * significam nada fora dela e são recriados a cada conversa.
 */
export function createRefRegistry(random = Math.random) {
  const byRef = new Map();
  const byAppointment = new Map();
  return {
    refFor(appointment) {
      if (byAppointment.has(appointment.id)) return byAppointment.get(appointment.id);
      let ref;
      do {
        ref = `r${Math.floor(random() * 46656).toString(36).padStart(3, '0')}`;
      } while (byRef.has(ref));
      byRef.set(ref, {
        appointmentId: appointment.id, patientId: appointment.patient_id, professionalId: appointment.professional_id,
        discipline: appointment.discipline, startsAt: appointment.starts_at,
      });
      byAppointment.set(appointment.id, ref);
      return ref;
    },
    resolve(ref) {
      return typeof ref === 'string' && ASSISTANT_REF.test(ref) ? byRef.get(ref) || null : null;
    },
  };
}
