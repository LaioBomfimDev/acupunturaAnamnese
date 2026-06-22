// ============================================================
// SHARED: instruções editáveis da IA (camada ADITIVA sobre o prompt fixo)
//
// Lê as diretrizes ativas da tabela ai_instructions (via service role) e as
// empilha SOBRE o SYSTEM_PROMPT da função. As regras de segurança do prompt
// fixo permanecem como piso imutável — estas diretrizes só refinam tom/foco.
//
// Fail-open: qualquer erro de leitura → string vazia (a IA usa só o prompt
// fixo, nunca fica bloqueada por uma falha na tabela de instruções).
// Cache em memória curto para não consultar o banco a cada requisição.
// ============================================================

import { createServiceClient } from './security.ts';

type ServiceClient = ReturnType<typeof createServiceClient>;

const CACHE_TTL_MS = 60_000;
const MAX_TOTAL_CHARS = 8000;

const cache = new Map<string, { value: string; expiresAt: number }>();

// Conteúdo ativo de uma chave (cacheado, fail-open).
async function fetchKey(client: ServiceClient, key: string): Promise<string> {
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;

  let value = '';
  try {
    const { data, error } = await client
      .from('ai_instructions')
      .select('content,is_active')
      .eq('key', key)
      .maybeSingle();
    if (!error && data && data.is_active === true) {
      value = String(data.content || '').trim();
    }
  } catch (_error) {
    value = ''; // fail-open: segue só com o prompt fixo.
  }

  cache.set(key, { value, expiresAt: now + CACHE_TTL_MS });
  return value;
}

/**
 * Concatena as diretrizes ativas das chaves pedidas (ordem = prioridade).
 * Ex.: ['clinical-global', 'library-qa'] → global + específica da função.
 */
export async function getActiveInstructions(client: ServiceClient, keys: string[]): Promise<string> {
  // Busca as chaves em paralelo (uma ida ao banco no pior caso, não N sequenciais).
  const values = await Promise.all(keys.map((key) => fetchKey(client, key)));
  return values.filter(Boolean).join('\n\n').slice(0, MAX_TOTAL_CHARS);
}

/**
 * Empilha as diretrizes SOBRE o prompt fixo, com um cabeçalho que deixa
 * explícito que a segurança/escopo/gate humano acima são inegociáveis.
 */
export function layerSystemPrompt(basePrompt: string, instructions: string): string {
  if (!instructions || !instructions.trim()) return basePrompt;
  return `${basePrompt}

--- DIRETRIZES ADICIONAIS DA CLÍNICA (curadas pelo SuperAdm) ---
As diretrizes abaixo refinam tom, foco e limites. Elas NÃO substituem nem relaxam as regras de segurança, os limites de escopo e o gate humano definidos acima — em qualquer conflito, as regras acima prevalecem.

${instructions.trim()}`;
}

// Exposto para testes: limpa o cache em memória.
export function _clearInstructionsCache(): void {
  cache.clear();
}
