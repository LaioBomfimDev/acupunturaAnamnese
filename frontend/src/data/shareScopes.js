// ============================================================
// DADOS: Escopos de compartilhamento de prontuário (Fase 3)
// Plano: docs/plano-clinica-multidisciplinar.md
//
// O profissional escolhe O QUE envia ao encaminhar. "Cadastro" é
// sempre incluído (pré-setado e travado) — é o que já fica visível
// pela matrícula. Os demais são facetas da sessão clínica.
//
// LIMITE HONESTO: a sessão é um único registro criptografado; o banco
// autoriza no nível da sessão. Estes escopos são registrados para
// consentimento/auditoria e filtram a VISUALIZAÇÃO do colega, não são
// (ainda) uma fronteira criptográfica por faceta.
// ============================================================

export const SHARE_SCOPES = [
  {
    id: 'cadastro',
    label: 'Cadastro do paciente',
    description: 'Nome, contato e idade.',
    always: true,
  },
  {
    id: 'resumo',
    label: 'Resumo clínico',
    description: 'Hipótese principal e leitura de síntese.',
  },
  {
    id: 'anamnese',
    label: 'Anamnese',
    description: 'Queixa, história e checklists preenchidos.',
  },
  {
    id: 'dores',
    label: 'Dores e sinais físicos',
    description: 'Localização, escalas e regiões de dor.',
  },
  {
    id: 'evolucao',
    label: 'Evolução / progressão',
    description: 'Indicadores ao longo das sessões.',
  },
  {
    id: 'relatorio',
    label: 'Relatório',
    description: 'Texto de relatório já elaborado.',
  },
];

export const SHARE_SCOPE_IDS = SHARE_SCOPES.map(scope => scope.id);
export const ALWAYS_SHARED_SCOPES = SHARE_SCOPES.filter(s => s.always).map(s => s.id);
export const OPTIONAL_SHARE_SCOPES = SHARE_SCOPES.filter(s => !s.always);

export function getShareScope(id) {
  return SHARE_SCOPES.find(scope => scope.id === id) || null;
}

// Normaliza a escolha do usuário: mantém só ids válidos e garante os
// escopos sempre-incluídos, sem duplicar e preservando a ordem do catálogo.
export function normalizeSharedScopes(selected = []) {
  const chosen = new Set([...ALWAYS_SHARED_SCOPES, ...selected.filter(id => SHARE_SCOPE_IDS.includes(id))]);
  return SHARE_SCOPE_IDS.filter(id => chosen.has(id));
}

export function shareScopeLabels(ids = []) {
  return ids.map(id => getShareScope(id)?.label || id);
}
