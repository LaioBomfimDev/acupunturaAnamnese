// ============================================================
// Uso da IA: custo estimado do mês (quadro "IA do mês" na Gestão).
//
// Preço em dólar por milhão de tokens, da tabela pública da Vertex
// (pagamento por uso, prompt até 200 mil tokens); o raciocínio do modelo
// é cobrado como saída. Espelho de supabase/functions/_shared/aiUsage.ts:
// mudou um, muda o outro (tests/regression/clinic-assistant.test.mjs).
// A fatura do Google é a referência; esta conta é estimativa.
// ============================================================

export const AI_PRICES_USD_PER_MILLION = {
  'gemini-2.5-flash': { input: 0.30, output: 2.50 },
  'gemini-2.5-flash-lite': { input: 0.10, output: 0.40 },
};

// Nome de cada função de IA como a pessoa conhece.
export const AI_FUNCTION_LABELS = {
  'clinic-assistant': 'Assistente',
  'analyze-tongue': 'Língua (foto)',
  'clinical-reasoning': 'Raciocínio clínico',
  'draft-narrative': 'Rascunho de relatório e evolução',
  'food-research': 'Dietoterapia',
  'library-qa': 'Biblioteca',
  'psych-reading': 'Leitura da Psicologia',
  'psych-report': 'Relatório da Psicologia',
  'psych-suggest-marks': 'Revisão assistida da Psicologia',
};

function costOf(row) {
  const price = row.modelo ? AI_PRICES_USD_PER_MILLION[row.modelo] : null;
  if (!price) return 0;
  return (Number(row.entrada) || 0) * price.input / 1_000_000
    + ((Number(row.saida) || 0) + (Number(row.raciocinio) || 0)) * price.output / 1_000_000;
}

/**
 * Junta as linhas de ai_usage_month por função: chamadas, tokens e custo.
 * A linha vazia (mês sem uso) só traz o teto.
 */
export function summarizeAiUsage(rows = []) {
  const byFunction = new Map();
  let limitUsd = null;
  for (const row of rows) {
    if (row.teto_usd !== null && row.teto_usd !== undefined) limitUsd = Number(row.teto_usd);
    if (!row.funcao) continue;
    const entry = byFunction.get(row.funcao) || { id: row.funcao, label: AI_FUNCTION_LABELS[row.funcao] || row.funcao, calls: 0, tokens: 0, usd: 0 };
    entry.calls += Number(row.chamadas) || 0;
    entry.tokens += (Number(row.entrada) || 0) + (Number(row.saida) || 0) + (Number(row.raciocinio) || 0);
    entry.usd += costOf(row);
    byFunction.set(row.funcao, entry);
  }
  const functions = [...byFunction.values()].sort((a, b) => b.usd - a.usd || a.label.localeCompare(b.label));
  const totalUsd = functions.reduce((sum, item) => sum + item.usd, 0);
  const calls = functions.reduce((sum, item) => sum + item.calls, 0);
  return withLimit({ functions, totalUsd, calls }, limitUsd);
}

/** O mesmo resumo com outro teto (null = sem teto). */
export function withLimit(summary, limitUsd) {
  return {
    ...summary,
    limitUsd,
    limitReached: limitUsd !== null && summary.totalUsd >= limitUsd,
    limitShare: limitUsd ? Math.min(1, summary.totalUsd / limitUsd) : null,
  };
}

/** Dólar com vírgula: "US$ 0,42"; abaixo de um centavo, "menos de US$ 0,01". */
export function formatUsd(value) {
  const number = Number(value) || 0;
  if (number > 0 && number < 0.005) return 'menos de US$ 0,01';
  return `US$ ${number.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
