// ============================================================
// SHARED: regras da assistente da clínica (30/10/2026, etapa 1).
// Espelho de frontend/src/utils/clinicAssistant.js: telas, atalhos e
// limites da conversa. Mudou um, muda o outro
// (tests/regression/clinic-assistant.test.mjs confere).
// ============================================================

// Onde a pessoa pode estar quando abre a assistente.
export const ASSISTANT_SCREENS = [
  'inicio', 'agenda', 'evolucao', 'escalas', 'financeiro',
  'gestao', 'pacientes', 'documentos', 'whatsapp', 'area',
];

// Telas que a resposta pode oferecer como atalho ("Abrir Agenda →").
export const ASSISTANT_LINKS = [
  'agenda', 'evolucao', 'escalas', 'financeiro', 'gestao', 'pacientes',
];

// Abas que a resposta pode abrir direto (06/11/2026): "Abrir Documentos
// timbrados →" em vez de "Abrir Gestão →". O id é o da aba na tela; o rótulo
// é o do menu. `everyone`: existe para todo perfil; as outras são só da
// administração. Aba nova da Gestão ou do Financeiro entra aqui.
export const ASSISTANT_SECTION_LINKS: Record<string, { screen: string; label: string; everyone?: boolean }> = {
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
  pacotes: { screen: 'financeiro', label: 'Pacotes' },
  apagar: { screen: 'financeiro', label: 'A pagar' },
  pagas: { screen: 'financeiro', label: 'Pagas' },
  equipe: { screen: 'financeiro', label: 'Equipe e repasses' },
  valores: { screen: 'financeiro', label: 'Valores dos atendimentos' },
  modelos: { screen: 'financeiro', label: 'Modelos de pacote' },
  recebimento: { screen: 'financeiro', label: 'Como cada um recebe' },
  saidasfixas: { screen: 'financeiro', label: 'Saídas fixas' },
  operadoras: { screen: 'financeiro', label: 'Operadoras' },
  solicitantes: { screen: 'financeiro', label: 'Solicitantes' },
  faturamento: { screen: 'financeiro', label: 'Dados para faturamento' },
};

export const ASSISTANT_MAX_MESSAGES = 12;
export const ASSISTANT_MAX_MESSAGE_CHARS = 1500;

export type AssistantRole = 'admin' | 'professional' | 'reception';

/** Atalhos que este perfil pode abrir (o mesmo corte do menu da tela inicial). */
export function linksForRole(role: AssistantRole) {
  const screens = ASSISTANT_LINKS.filter(link => {
    if (link === 'financeiro') return role === 'admin';
    if (link === 'evolucao' || link === 'escalas') return role !== 'reception';
    return true;
  });
  const sections = Object.keys(ASSISTANT_SECTION_LINKS)
    .filter(link => role === 'admin' || ASSISTANT_SECTION_LINKS[link].everyone);
  return [...screens, ...sections];
}
