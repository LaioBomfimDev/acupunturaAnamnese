// ============================================================
// SHARED: uso da IA (30/10/2026)
//
// Cada chamada ao Gemini grava uma linha em ai_usage_events com os
// tokens que a Vertex informou (usageMetadata). Nada de conteúdo: nem
// pergunta, nem resposta, nem paciente.
//
// Preço em dólar por milhão de tokens, da tabela pública da Vertex
// (pagamento por uso, prompt até 200 mil tokens). O raciocínio do modelo
// é cobrado como saída. Espelho de frontend/src/utils/aiUsage.js: mudou
// um, muda o outro (tests/regression/clinic-assistant.test.mjs confere).
// A fatura do Google é a referência; esta conta é estimativa.
// ============================================================

export const AI_PRICES_USD_PER_MILLION: Record<string, { input: number; output: number }> = {
  'gemini-2.5-flash': { input: 0.30, output: 2.50 },
  'gemini-2.5-flash-lite': { input: 0.10, output: 0.40 },
};

export type AiUsageTotals = {
  modelo: string | null;
  entrada: number;
  saida: number;
  raciocinio: number;
};

/** Custo estimado em dólar de um conjunto de somas (modelo sem preço conta zero). */
export function estimateUsageUsd(rows: AiUsageTotals[]) {
  let total = 0;
  for (const row of rows) {
    const price = row.modelo ? AI_PRICES_USD_PER_MILLION[row.modelo] : undefined;
    if (!price) continue;
    total += (Number(row.entrada) || 0) * price.input / 1_000_000;
    total += ((Number(row.saida) || 0) + (Number(row.raciocinio) || 0)) * price.output / 1_000_000;
  }
  return total;
}

type InsertClient = {
  from(table: string): {
    insert(values: Record<string, unknown>): PromiseLike<{ error: unknown }>;
  };
};

export type AiUsageContext = {
  supabaseAdmin: unknown;
  functionName: string;
  userId: string | null;
  clinicId: string | null;
};

type UsageMetadata = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
};

function count(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
}

/**
 * Grava uma chamada. Falhar aqui nunca derruba a resposta da IA: o uso
 * fica sem registro e o erro vai para o log operacional (sem conteúdo).
 */
export async function recordAiUsage(
  context: AiUsageContext,
  model: string,
  usage: UsageMetadata | null | undefined,
) {
  try {
    const client = context.supabaseAdmin as InsertClient;
    const { error } = await client.from('ai_usage_events').insert({
      clinic_id: context.clinicId,
      user_id: context.userId,
      function_name: context.functionName,
      model,
      input_tokens: count(usage?.promptTokenCount),
      output_tokens: count(usage?.candidatesTokenCount),
      thinking_tokens: count(usage?.thoughtsTokenCount),
    });
    if (error) console.error(`${context.functionName}: uso da IA não gravado`);
  } catch {
    console.error(`${context.functionName}: uso da IA não gravado`);
  }
}

/** Contexto de uso a partir do perfil de quem chamou (getCallerProfile). */
export function usageContextFor(
  supabaseAdmin: unknown,
  functionName: string,
  caller: { user: { id: string }; profile: { clinic_id?: string | null } },
): AiUsageContext {
  return {
    supabaseAdmin,
    functionName,
    userId: caller.user.id,
    clinicId: caller.profile.clinic_id ?? null,
  };
}
