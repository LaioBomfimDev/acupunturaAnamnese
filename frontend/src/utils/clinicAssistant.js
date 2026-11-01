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
import { schedulesOfDay } from './agendaTimeline.js';

export const ASSISTANT_SCREENS = [
  'inicio', 'agenda', 'evolucao', 'escalas', 'financeiro',
  'gestao', 'pacientes', 'documentos', 'whatsapp', 'area',
];

export const ASSISTANT_LINKS = [
  'agenda', 'evolucao', 'escalas', 'financeiro', 'gestao', 'pacientes',
];

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
export const ASSISTANT_CONSULTAS = ['horarios_vagos'];
export const CONSULTA_MOTIVOS = [
  'sem_jornada', 'feriado', 'passado', 'nao_encontrado', 'ambiguo', 'sem_agenda', 'erro',
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
  return ASSISTANT_LINKS.filter(link => {
    if (link === 'financeiro') return role === 'admin';
    if (link === 'evolucao' || link === 'escalas') return role !== 'reception';
    return true;
  });
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
