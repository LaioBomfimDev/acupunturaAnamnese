// ============================================================
// SHARED (puro, sem dependências): orçamento + relevância de prompt
//
// Problema: as camadas aditivas do SYSTEM_PROMPT (instruções + lições de
// correção) crescem sem limite. Um prompt de sistema gigante DILUI a atenção
// do modelo — ele passa a seguir cada regra pela metade. Aqui ficam as funções
// PURAS que a camada de correções usa para:
//   1. rankear as lições por relevância ao caso atual (sobreposição de termos);
//   2. caber num orçamento de caracteres (manda só o que importa, não tudo).
//
// Sem imports de runtime → testável direto em Node (type stripping).
// ============================================================

export interface RankableLesson {
  correction_text: string;
  reason: string | null;
  ai_output: Record<string, unknown> | null;
  context_snapshot: Record<string, unknown> | null;
  approval_status: string;
  author_id: string;
}

const STOPWORDS = new Set([
  'que', 'qual', 'quais', 'como', 'para', 'com', 'sem', 'dos', 'das', 'uma',
  'por', 'pra', 'sao', 'ser', 'tem', 'mais', 'menos', 'pode', 'nao', 'isso',
  'cada', 'entre', 'sobre', 'quando', 'ainda', 'pela', 'pelo', 'the', 'and',
]);

export function tokenize(text: string): string[] {
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
}

function lessonHaystack(lesson: RankableLesson): string {
  const context = lesson.context_snapshot ? JSON.stringify(lesson.context_snapshot) : '';
  return `${lesson.correction_text || ''} ${lesson.reason || ''} ${context}`;
}

// Score = nº de termos da query presentes no texto da lição (sobreposição).
export function scoreLessonRelevance(lesson: RankableLesson, queryTerms: Set<string>): number {
  if (queryTerms.size === 0) return 0;
  const terms = new Set(tokenize(lessonHaystack(lesson)));
  let score = 0;
  for (const term of queryTerms) {
    if (terms.has(term)) score += 1;
  }
  return score;
}

/**
 * Ordena as lições por relevância à query (desc), estável em empates
 * (preserva a ordem de entrada = recência). Sem query ou sem termos úteis →
 * devolve a ordem recebida intacta.
 */
export function rankLessonsByRelevance<T extends RankableLesson>(lessons: T[], relevanceQuery: string): T[] {
  const queryTerms = new Set(tokenize(relevanceQuery));
  if (queryTerms.size === 0) return [...lessons];
  return lessons
    .map((lesson, index) => ({ lesson, index, score: scoreLessonRelevance(lesson, queryTerms) }))
    .sort((a, b) => (b.score - a.score) || (a.index - b.index))
    .map((entry) => entry.lesson);
}

/**
 * Seleciona itens (strings já renderizadas) na ordem dada até caber no
 * orçamento de caracteres. Inclui ao menos o 1º quando há orçamento > 0
 * (uma lição relevante sempre passa, mesmo que sozinha).
 */
export function fitToBudget(items: string[], budgetChars: number): string[] {
  if (budgetChars <= 0) return [];
  const out: string[] = [];
  let used = 0;
  for (const item of items) {
    const cost = item.length + 1; // + separador
    if (out.length > 0 && used + cost > budgetChars) break;
    out.push(item);
    used += cost;
  }
  return out;
}
