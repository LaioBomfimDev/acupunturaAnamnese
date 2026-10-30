// ============================================================
// SHARED: teto de IA do mês da instituição (30/10/2026).
//
// Toda Edge Function de IA chama enforceAiBudget logo antes do Gemini.
// O gasto do mês soma as chamadas gravadas da instituição
// (ai_usage_totals) com o preço de aiUsage.ts; o teto é
// clinics.ai_monthly_limit_usd, que só o SuperAdm define (NULL = sem
// teto). Sem conseguir conferir, não chama: gasto sem controle é pior
// que a IA parada. SuperAdm (sem instituição) não tem teto.
// ============================================================

import { estimateUsageUsd } from './aiUsage.ts';
import { logOperationalEvent } from './observability.ts';

type RpcClient = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        maybeSingle(): PromiseLike<{ data: { ai_monthly_limit_usd?: number | string | null } | null; error: unknown }>;
      };
    };
  };
};

type JsonResponder = (body: unknown, status?: number) => Response;

export const AI_LIMIT_MESSAGE =
  'O limite de IA deste mês da instituição foi atingido. A equipe do sistema pode ampliar o limite.';

/** Dia de hoje no fuso da clínica, para o mês virar na hora certa. */
export function todayInClinic(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now);
}

/** Gasto e teto do mês da instituição; null quando não deu para conferir. */
export async function readClinicBudget(supabaseAdmin: unknown, clinicId: string) {
  const client = supabaseAdmin as RpcClient;
  const [totals, clinic] = await Promise.all([
    client.rpc('ai_usage_totals', { p_clinic: clinicId, p_month: todayInClinic() }),
    client.from('clinics').select('ai_monthly_limit_usd').eq('id', clinicId).maybeSingle(),
  ]);
  if (totals.error || clinic.error) return null;
  const rawLimit = clinic.data?.ai_monthly_limit_usd;
  return {
    spentUsd: estimateUsageUsd((totals.data as never[]) || []),
    limitUsd: rawLimit === null || rawLimit === undefined ? null : Number(rawLimit),
  };
}

/**
 * Devolve a resposta de recusa quando o teto do mês foi atingido (429)
 * ou não deu para conferir (503); null quando pode chamar a IA.
 */
export async function enforceAiBudget(
  supabaseAdmin: unknown,
  caller: { profile: { clinic_id?: string | null } },
  jsonResponse: JsonResponder,
): Promise<Response | null> {
  const clinicId = caller.profile.clinic_id;
  if (!clinicId) return null;

  const budget = await readClinicBudget(supabaseAdmin, clinicId).catch(() => null);
  if (!budget) {
    logOperationalEvent('error', 'ai_budget_unavailable', {
      operation: 'ai_budget',
      reason: 'storage_unavailable',
    });
    return jsonResponse({ error: 'Não consegui conferir o uso de IA do mês. Tente de novo em instantes.' }, 503);
  }
  if (budget.limitUsd !== null && budget.spentUsd >= budget.limitUsd) {
    return jsonResponse({ error: AI_LIMIT_MESSAGE, code: 'ai_limit' }, 429);
  }
  return null;
}
