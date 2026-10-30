// ============================================================
// SHARED: regras da assistente da clínica (30/10/2026, etapa 1).
// Espelho de frontend/src/utils/clinicAssistant.js: telas, atalhos e
// limites da conversa. Mudou um, muda o outro
// (tests/regression/clinic-assistant.test.mjs confere).
// ============================================================

// Onde a pessoa pode estar quando abre a assistente.
export const ASSISTANT_SCREENS = [
  'inicio', 'agenda', 'evolucao', 'escalas', 'financeiro',
  'gestao', 'pacientes', 'documentos', 'area',
];

// Telas que a resposta pode oferecer como atalho ("Abrir Agenda →").
export const ASSISTANT_LINKS = [
  'agenda', 'evolucao', 'escalas', 'financeiro', 'gestao', 'pacientes',
];

export const ASSISTANT_MAX_MESSAGES = 12;
export const ASSISTANT_MAX_MESSAGE_CHARS = 1500;

export type AssistantRole = 'admin' | 'professional' | 'reception';

/** Atalhos que este perfil pode abrir (o mesmo corte do menu da tela inicial). */
export function linksForRole(role: AssistantRole) {
  return ASSISTANT_LINKS.filter(link => {
    if (link === 'financeiro') return role === 'admin';
    if (link === 'evolucao' || link === 'escalas') return role !== 'reception';
    return true;
  });
}
