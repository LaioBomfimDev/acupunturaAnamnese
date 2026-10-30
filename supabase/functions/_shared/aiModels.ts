// ============================================================
// SHARED: modelo do Gemini usado pelas Edge Functions.
//
// Um lugar só para o nome do modelo: quando o Google aposenta uma
// versão, a troca é aqui (e o preço em aiUsage.ts, com o espelho em
// frontend/src/utils/aiUsage.js).
//
// 30/10/2026: o gemini-2.5-flash foi aposentado na Vertex em
// 20/10/2026. Escolha da administradora: o gemini-3.5-flash-lite (o
// 3.1 sai antes; o 3.5 fica até julho de 2027 ou depois). Ele não roda
// em southamerica-east1: a região vem de GCP_LOCATION (vertex.ts),
// aprovada em vertexReliability.ts.
// ============================================================

export const GEMINI_MODEL = 'gemini-3.5-flash-lite';

// Da família 3 em diante o "pensamento" é por nível; o thinkingBudget
// antigo pode dar 400 e não pode ir junto com o nível.
export const THINKING_MINIMAL = { thinkingLevel: 'MINIMAL' } as const;
export const THINKING_LOW = { thinkingLevel: 'LOW' } as const;
