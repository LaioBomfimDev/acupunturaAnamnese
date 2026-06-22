// ============================================================
// SHARED: Lições de correção — o loop de ensino da IA
//
// Os modelos Gemini (Vertex) NÃO treinam com os dados. O aprendizado real
// e honesto é por RECUPERAÇÃO: cada superfície de IA, antes de chamar o
// modelo, busca as correções relevantes e as injeta no SYSTEM_PROMPT como
// lições autoritativas. Assim a IA passa a seguir as correções nas próximas
// análises, sem nenhuma edição de código por correção.
//
// Regra de propagação (decidida com o usuário):
//  * a autora usa as PRÓPRIAS correções na hora (mesmo em revisão);
//  * para todas, só as APROVADAS pela SuperAdm.
// A Edge Function usa service role (bypassa RLS), então a regra é aplicada
// aqui na query: surface = X AND status != rejected AND (status = approved
// OR author = caller).
//
// Nunca há PII: correction_text/reason são anonimizados no cliente e
// context_snapshot guarda só rótulos/texto já mascarado.
// ============================================================

import { createServiceClient } from './security.ts';
import { fitToBudget, rankLessonsByRelevance } from './promptBudget.ts';

// Orçamento do prompt de sistema (base + instruções + correções). Mantém o
// prompt enxuto para o modelo não diluir a atenção. As correções absorvem o
// aperto: base e instruções são preservadas; sobra entra para as lições.
const DEFAULT_TOTAL_SYSTEM_CHARS = 16000;
const MAX_CORRECTION_CHARS = 8000;

export type CorrectionSurface =
  | 'tongue'
  | 'anamnese_marks'
  | 'clinical_reasoning'
  | 'narrative'
  | 'library_qa';

export interface CorrectionLesson {
  correction_text: string;
  reason: string | null;
  ai_output: Record<string, unknown> | null;
  context_snapshot: Record<string, unknown> | null;
  approval_status: string;
  author_id: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Busca as lições de correção a aplicar nesta chamada: aprovadas (globais)
 * unidas às da própria autora (mesmo em revisão). Nunca derruba a análise:
 * qualquer erro retorna lista vazia.
 */
export async function fetchCorrectionLessons(
  supabaseAdmin: ReturnType<typeof createServiceClient>,
  { surface, callerId, limit = 80 }: { surface: CorrectionSurface; callerId: string; limit?: number },
): Promise<CorrectionLesson[]> {
  try {
    const query = supabaseAdmin
      .from('ai_corrections')
      .select('correction_text, reason, ai_output, context_snapshot, approval_status, author_id')
      .eq('surface', surface)
      .neq('approval_status', 'rejected')
      .order('created_at', { ascending: false })
      .limit(limit);

    // Inclui as da própria autora apenas quando o id é um UUID válido (defensivo).
    const scoped = UUID_RE.test(callerId)
      ? query.or(`approval_status.eq.approved,author_id.eq.${callerId}`)
      : query.eq('approval_status', 'approved');

    const { data, error } = await scoped;
    if (error) {
      console.error('fetchCorrectionLessons erro:', error.message);
      return [];
    }
    return Array.isArray(data) ? (data as CorrectionLesson[]) : [];
  } catch (error) {
    console.error('fetchCorrectionLessons exceção:', error instanceof Error ? error.message : 'erro');
    return [];
  }
}

// Resume o que a IA havia dito, a partir das formas conhecidas de ai_output.
function summarizeOutput(aiOutput: Record<string, unknown> | null): string {
  if (!aiOutput || typeof aiOutput !== 'object') return '';
  const o = aiOutput as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v : '');

  if (str(o.title)) return `${str(o.title)}${str(o.pattern) ? ` → ${str(o.pattern)}` : ''}`;
  if (str(o.item)) return `${str(o.group) ? `${str(o.group)}: ` : ''}${str(o.item)}`;
  if (str(o.answer)) return str(o.answer).slice(0, 180);
  if (str(o.interpretation)) return str(o.interpretation).slice(0, 180);
  if (Array.isArray(o.paragraphs)) return o.paragraphs.filter(p => typeof p === 'string').join(' ').slice(0, 180);

  const serialized = JSON.stringify(aiOutput);
  return serialized.length > 200 ? `${serialized.slice(0, 200)}…` : serialized;
}

function renderItem(lesson: CorrectionLesson): string {
  const said = summarizeOutput(lesson.ai_output);
  const correct = String(lesson.correction_text || '').slice(0, 600).trim();
  const why = lesson.reason ? ` Motivo: ${String(lesson.reason).slice(0, 300).trim()}` : '';
  const saidPart = said ? `Quando a IA tenderia a dizer "${said}", ` : '';
  return `- ${saidPart}o correto é: ${correct}.${why}`;
}

const APPROVED_HEADER =
  'CONFIRMADAS PELA CURADORIA (correções revisadas e aprovadas — trate como autoridade e siga-as quando o caso for semelhante):';
const PENDING_HEADER =
  'CORREÇÕES RECENTES DESTA PROFISSIONAL (ainda em revisão pela curadoria — considere com peso, sem tratar como verdade absoluta):';

/**
 * Monta o bloco de lições para anexar ao SYSTEM_PROMPT. Rankeia por relevância
 * ao caso (mais úteis primeiro), deduplica e respeita um orçamento de
 * caracteres — em vez de despejar todas as correções e diluir o prompt.
 * Distingue aprovadas (autoridade) das recentes da própria profissional
 * (em revisão). Vazio → string vazia.
 */
export function renderCorrectionBlock(
  lessons: CorrectionLesson[],
  { relevanceQuery = '', budgetChars = MAX_CORRECTION_CHARS }: { relevanceQuery?: string; budgetChars?: number } = {},
): string {
  if (!Array.isArray(lessons) || lessons.length === 0 || budgetChars <= 0) return '';

  // Deduplica por texto de correção (a mesma lição pode aparecer repetida).
  const seen = new Set<string>();
  const unique = lessons.filter((lesson) => {
    const key = String(lesson.correction_text || '').trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Mais relevantes ao caso primeiro (recência se não houver query).
  const ranked = rankLessonsByRelevance(unique, relevanceQuery);
  const approvedItems = ranked.filter((l) => l.approval_status === 'approved').map(renderItem);
  const pendingItems = ranked.filter((l) => l.approval_status !== 'approved').map(renderItem);

  const sections: string[] = [];
  let remaining = budgetChars;

  // Aprovadas (autoridade) consomem o orçamento primeiro.
  const fittedApproved = fitToBudget(approvedItems, remaining - APPROVED_HEADER.length);
  if (fittedApproved.length) {
    const block = `${APPROVED_HEADER}\n${fittedApproved.join('\n')}`;
    sections.push(block);
    remaining -= block.length;
  }
  // O que sobrar vai para as recentes da própria profissional.
  const fittedPending = fitToBudget(pendingItems, remaining - PENDING_HEADER.length);
  if (fittedPending.length) {
    sections.push(`${PENDING_HEADER}\n${fittedPending.join('\n')}`);
  }

  if (sections.length === 0) return '';
  return `\n\n=== LIÇÕES DE CORREÇÃO (ensinadas pelas profissionais) ===\n${sections.join('\n\n')}\n=== FIM DAS LIÇÕES ===`;
}

/**
 * Atalho: busca as lições e devolve o SYSTEM_PROMPT já com o bloco anexado,
 * rankeado por relevância e dentro do orçamento global (base + instruções +
 * correções). As correções absorvem o aperto — base e instruções preservadas.
 */
export async function withCorrectionLessons(
  supabaseAdmin: ReturnType<typeof createServiceClient>,
  systemPrompt: string,
  params: {
    surface: CorrectionSurface;
    callerId: string;
    relevanceQuery?: string;
    totalBudgetChars?: number;
    limit?: number;
  },
): Promise<string> {
  const lessons = await fetchCorrectionLessons(supabaseAdmin, params);
  const total = params.totalBudgetChars ?? DEFAULT_TOTAL_SYSTEM_CHARS;
  const budgetChars = Math.max(0, Math.min(MAX_CORRECTION_CHARS, total - systemPrompt.length));
  return systemPrompt + renderCorrectionBlock(lessons, { relevanceQuery: params.relevanceQuery, budgetChars });
}
