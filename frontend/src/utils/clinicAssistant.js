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
