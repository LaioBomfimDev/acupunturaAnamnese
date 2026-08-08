// Utilitários compartilhados pelas superfícies de IA do frontend.
//
// A simulação é permitida apenas no login local, explicitamente marcado com
// `_isLocal`. Uma sessão autenticada de verdade deve receber o erro da função
// remota: substituir uma indisponibilidade por conteúdo simulado pode induzir
// a profissional a revisar um resultado que nunca foi produzido pela IA.

// Faixas de confiança exibidas nas superfícies de IA (rótulo + nível
// para o CSS). Mesma escala em todos os módulos, para que "alta" queira
// dizer a mesma coisa na Língua, na Psicologia e no rail assistente.
export function confidenceBand(confidence) {
  if (confidence >= 0.8) return { label: 'alta', level: 'high' };
  if (confidence >= 0.6) return { label: 'média', level: 'medium' };
  return { label: 'baixa', level: 'low' };
}

export function resolveAiRuntime(overrides, defaults) {
  return {
    getAuthenticatedUser: overrides?.getAuthenticatedUser || defaults.getAuthenticatedUser,
    invoke: overrides?.invoke || defaults.invoke,
  };
}

export async function getAiFunctionErrorMessage(error, fallback) {
  if (typeof error?.context?.json === 'function') {
    try {
      const body = await error.context.json();
      if (body?.error || body?.message) return body.error || body.message;
    } catch {
      // O corpo pode não ser JSON; a mensagem da SDK ainda é útil abaixo.
    }
  }
  return error?.message || fallback;
}
