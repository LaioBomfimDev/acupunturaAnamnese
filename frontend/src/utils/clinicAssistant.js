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

export const ASSISTANT_SCREENS = [
  'inicio', 'agenda', 'evolucao', 'escalas', 'financeiro',
  'gestao', 'pacientes', 'documentos', 'area',
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
  area: 'Área de atendimento',
};

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
 */
export function buildAttentionItems({ role, riskAlerts = null, pendingEvolutions = null, receivables = null, nearEndPackages = null }) {
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
