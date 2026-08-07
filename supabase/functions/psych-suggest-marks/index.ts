// ============================================================
// EDGE FUNCTION: psych-suggest-marks — anamnese de Psicologia
// (texto) → sugestões de marcação do vocabulário psi.
// Fase 5 do plano multidisciplinar (workspace de Psicologia).
//
// Mesmo desenho da suggest-marks (MTC):
//  1. Valida o JWT do profissional (getCallerProfile);
//  2. Recebe o texto JÁ ANONIMIZADO pelo cliente;
//  3. Gemini flash com saída estruturada: o schema restringe as
//     marcações ao CATÁLOGO espelhado de psychologyAnamnese.js —
//     a IA não inventa item fora do contrato;
//  4. Devolve sugestões {group, item, confidence, rationale}.
//
// A IA SUGERE para conferência; só o que a profissional aceitar
// entra no checklist. RISCO (psiRisco) tem prioridade deliberada.
// Nunca diagnóstico (CID/DSM) nem conduta.
// Auth: Vertex AI (conta de serviço). NÃO logar texto do paciente.
// ============================================================

import {
  assertEdgeAccess,
  assertSuperAdmin,
  createCorsContext,
  createServiceClient,
  getCallerProfile,
} from '../_shared/security.ts';
import { enforceEdgeRateLimit } from '../_shared/rateLimit.ts';
import { vertexGenerateContent, isVertexConfigured } from '../_shared/vertex.ts';
import { getActiveInstructions, layerSystemPrompt } from '../_shared/instructions.ts';
import { withCorrectionLessons } from '../_shared/corrections.ts';
import { isDeployHealthSmoke, runAiSmokeCheck } from '../_shared/aiSmoke.ts';
import {
  ClinicalPayloadValidationError,
  readClinicalJsonBody,
  sanitizeClinicalPayload,
  type ClinicalPayloadSchema,
} from '../_shared/clinicalPayload.ts';
import {
  createCorrelationId,
  logOperationalEvent,
} from '../_shared/observability.ts';

const MODEL_ID = 'gemini-2.5-flash';
const REQUEST_SCHEMA: ClinicalPayloadSchema = {
  type: 'object',
  properties: {
    text: { type: 'string', required: true, maxLength: 8000, trim: true },
  },
};

// Catálogo de marcações sugeríveis — MANTENHA EM SINCRONIA com
// `psychologyAnamnese.js` (psychologyChecklists + psychologyRiskChecklist;
// psiSono espelha checklists.sono da MTC). Teste de regressão:
// tests/regression/psychology-ai.test.mjs.
const CATALOG: Record<string, string[]> = {
  psiHumor: [
    'Tristeza persistente', 'Apatia / desânimo', 'Perda de prazer (anedonia)',
    'Oscilações de humor', 'Irritabilidade', 'Choro frequente',
    'Culpa excessiva', 'Baixa autoestima', 'Desesperança',
  ],
  psiAnsiedade: [
    'Preocupação excessiva', 'Pensamento acelerado / ruminação',
    'Sintomas físicos (taquicardia, sudorese)', 'Inquietação',
    'Evitação de situações', 'Crises de pânico', 'Medos específicos',
    'Tensão constante',
  ],
  psiSono: [
    'Dificuldade para iniciar sono', 'Despertares frequentes', 'Acorda entre 1h-3h',
    'Acorda entre 3h-5h', 'Sonhos intensos', 'Pesadelos', 'Sudorese noturna',
    'Bruxismo', 'Sono não reparador', 'Sonolência diurna',
  ],
  psiAlimentacao: [
    'Redução do apetite', 'Aumento do apetite', 'Mudança de peso',
    'Compulsão alimentar', 'Restrição / relação disfuncional com a comida',
  ],
  psiCognicao: [
    'Dificuldade de atenção / concentração', 'Queixas de memória',
    'Dificuldade de linguagem / comunicação', 'Lentificação do pensamento',
    'Dificuldade de organização e planejamento',
  ],
  psiDesenvolvimento: [
    'Atraso em marcos do desenvolvimento', 'Dificuldade de aprendizagem escolar',
    'Dificuldade de interação social', 'Comportamentos repetitivos / restritos',
  ],
  psiTrauma: [
    'Exposição a evento traumático', 'Revivências / pesadelos',
    'Evitação de lembranças', 'Hipervigilância', 'Entorpecimento emocional',
  ],
  psiFuncionamento: [
    'Prejuízo no trabalho/estudo', 'Prejuízo nas relações',
    'Isolamento social', 'Autocuidado prejudicado',
    'Alteração de apetite', 'Queda de energia',
  ],
  psiSubstancias: [
    'Álcool', 'Tabaco', 'Cafeína em excesso', 'Maconha',
    'Outras substâncias', 'Uso aumentou recentemente',
  ],
  psiRisco: [
    'Ideação e comportamento suicida',
    'Autolesão não suicida',
    'Risco a terceiros / heteroagressividade',
    'Violência, abuso ou negligência',
    'Sinais de crise aguda',
  ],
};

// Itens não contêm ':' — chave composta "grupo:item" é separável no 1º ':'.
const ALLOWED_KEYS = Object.entries(CATALOG).flatMap(
  ([group, items]) => items.map((item) => `${group}:${item}`),
);
const ALLOWED_KEY_SET = new Set(ALLOWED_KEYS);

const OUTPUT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    suggestions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          key: {
            type: 'STRING',
            enum: ALLOWED_KEYS,
            description: 'sinal no formato "grupo:item", exatamente como no catálogo',
          },
          kind: {
            type: 'STRING',
            enum: ['sustentado', 'investigar'],
            description: '"sustentado" = o texto afirma o sinal claramente; "investigar" = só há indício e precisa ser explorado pela profissional',
          },
          confidence: {
            type: 'NUMBER',
            description: 'confiança entre 0 e 1, conservadora',
          },
          rationale: {
            type: 'STRING',
            description: 'trecho/sinal do texto que justifica, em pt-BR (curto)',
          },
        },
        required: ['key', 'kind', 'confidence', 'rationale'],
      },
    },
    warning: {
      type: 'STRING',
      nullable: true,
      description: 'aviso sobre o texto (ex.: vazio, ambíguo) ou null',
    },
  },
  required: ['suggestions', 'warning'],
} as const;

const SYSTEM_PROMPT = `Você é um assistente de anamnese para psicólogas clínicas no Brasil.

Sua tarefa: ler o texto livre da anamnese de psicologia (demanda, história, saúde mental, rede de apoio, observações da sessão) e apontar quais sinais do checklist o texto sugere, para a profissional conferir. Os itens são fechados — você só pode escolher chaves do catálogo fornecido pelo schema (campo "key", formato "grupo:item").

Cada sinal tem um tipo (campo "kind"):
- "sustentado": o texto AFIRMA o sinal claramente (ex.: "não durmo há semanas" → dificuldade para iniciar sono).
- "investigar": o texto só dá um INDÍCIO que precisa ser explorado, não uma afirmação (ex.: "tenho tido estresse no trabalho" é um indício a investigar, NÃO confirma "prejuízo no trabalho"). Na dúvida entre os dois, use "investigar".

Regras:
- Aponte APENAS o que o texto embasa. Não produza diagnóstico psicológico ou psiquiátrico (CID/DSM), não interprete conteúdo e não sugira conduta — isso é papel da profissional.
- NÃO transforme uma menção neutra em gravidade ou prejuízo: mencionar um tema (trabalho, família, sono) não é o mesmo que afirmar disfunção. Quando for só menção, marque "investigar" com confiança baixa.
- Cada sinal precisa de justificativa curta citando o trecho do texto (campo "rationale").
- Confiança conservadora: 0.8+ só quando o texto afirma o sinal claramente (kind "sustentado"); 0.4–0.7 quando é indício indireto (kind "investigar"); não sugira abaixo de 0.35.
- EXCEÇÃO DELIBERADA — RISCO (grupo "psiRisco": ideação e comportamento suicida, autolesão não suicida, risco a terceiros/heteroagressividade, violência/abuso/negligência, sinais de crise aguda): na dúvida razoável, PREFIRA apontar para o olhar humano conferir (kind "investigar"), e liste esses sinais PRIMEIRO. É melhor um alerta a mais do que um risco não visto.
- Não presuma nada a partir de gênero, idade ou profissão — apenas o que o texto afirma.
- Não repita a mesma chave. Máximo de 12 sinais, dos mais aos menos relevantes.
- O texto pode vir com identificadores mascarados ([NOME], [DATA], [CPF] etc.) — ignore-os, são esperados.
- Se o texto estiver vazio ou sem conteúdo clínico aproveitável, retorne suggestions vazio e explique em warning (pt-BR).`;

function clampConfidence(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
}

Deno.serve(async (req) => {
  const correlationId = createCorrelationId(req.headers.get('x-correlation-id'));
  const cors = createCorsContext(req);
  if (!cors.allowed) return cors.rejectResponse();
  const { headers: corsHeaders, jsonResponse } = cors;

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Método não permitido.' }, 405);
  }

  try {
    const supabaseAdmin = createServiceClient();
    const caller = await getCallerProfile(req, supabaseAdmin);
    if ('error' in caller) {
      return jsonResponse({ error: caller.error }, caller.status);
    }
    const access = assertEdgeAccess(caller.profile, caller.claims);
    if (!access.allowed) return jsonResponse({ error: access.error }, access.status);

    const rateLimitResponse = await enforceEdgeRateLimit({
      supabaseAdmin,
      subjectId: caller.user.id,
      functionName: 'psych-suggest-marks',
      jsonResponse,
    });
    if (rateLimitResponse) return rateLimitResponse;

    const body = await readClinicalJsonBody(req, 12_000);
    if (isDeployHealthSmoke(body)) {
      if (!assertSuperAdmin(caller.profile)) {
        return jsonResponse({ error: 'Acesso restrito ao SuperAdm ativo.' }, 403);
      }
      return await runAiSmokeCheck({
        functionName: 'psych-suggest-marks',
        jsonResponse,
        modelId: MODEL_ID,
      });
    }

    if (!isVertexConfigured()) {
      return jsonResponse({ error: 'Análise por IA não configurada no servidor (conta de serviço ausente).' }, 503);
    }

    const input = sanitizeClinicalPayload(body, REQUEST_SCHEMA) as { text: string };
    const text = input.text;
    if (!text) {
      return jsonResponse({ error: 'Texto da anamnese é obrigatório.' }, 400);
    }

    const extraInstructions = await getActiveInstructions(supabaseAdmin, ['psych-global', 'psych-anamnese-marks']);
    const instructedPrompt = layerSystemPrompt(SYSTEM_PROMPT, extraInstructions);
    const systemText = await withCorrectionLessons(supabaseAdmin, instructedPrompt, {
      surface: 'psych_marks',
      callerId: caller.user.id,
      relevanceQuery: text,
    });

    const geminiResponse = await vertexGenerateContent(MODEL_ID, {
      systemInstruction: { parts: [{ text: systemText }] },
      contents: [{
        role: 'user',
        parts: [{ text: `Texto da anamnese de psicologia:\n"""\n${text}\n"""\n\nAponte os sinais do checklist que este texto embasa, cada um com seu tipo (sustentado/investigar). Risco primeiro, se houver.` }],
      }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: OUTPUT_SCHEMA,
        // Tarefa simples e barata — sem raciocínio estendido.
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    if (!geminiResponse.ok) {
      logOperationalEvent('error', 'vertex_upstream_failed', {
        correlationId,
        operation: 'psych_suggest_marks',
        status: geminiResponse.status,
        reason: 'http_error',
      });
      throw new Error('A sugestão por IA falhou. Tente novamente em instantes.');
    }

    const geminiData = await geminiResponse.json();
    const out = geminiData?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text || '')
      .join('')
      .trim();
    if (!out) {
      throw new Error('A IA não retornou uma sugestão válida.');
    }
    const parsed = JSON.parse(out);

    // Saneamento: valida chave contra o catálogo, dedup, clamp, separa
    // grupo/item e garante o risco no topo independente do modelo.
    const seen = new Set<string>();
    const suggestions = (Array.isArray(parsed.suggestions) ? parsed.suggestions : [])
      .filter((s: { key?: string }) => typeof s.key === 'string' && ALLOWED_KEY_SET.has(s.key))
      .filter((s: { key: string }) => (seen.has(s.key) ? false : (seen.add(s.key), true)))
      .slice(0, 12)
      .map((s: { key: string; kind?: string; confidence: unknown; rationale?: string }) => {
        const idx = s.key.indexOf(':');
        return {
          group: s.key.slice(0, idx),
          item: s.key.slice(idx + 1),
          // Rótulo do card: "investigar" (indício a explorar) vs
          // "sustentado" (afirmado no texto). Default conservador.
          kind: s.kind === 'sustentado' ? 'sustentado' : 'investigar',
          confidence: clampConfidence(s.confidence),
          rationale: typeof s.rationale === 'string' ? s.rationale : '',
        };
      })
      .sort((a: { group: string }, b: { group: string }) =>
        Number(b.group === 'psiRisco') - Number(a.group === 'psiRisco'));

    return jsonResponse({
      modelVersion: MODEL_ID,
      analyzedAt: new Date().toISOString(),
      suggestions,
      warning: typeof parsed.warning === 'string' && parsed.warning ? parsed.warning : null,
    });
  } catch (error) {
    if (error instanceof ClinicalPayloadValidationError) {
      logOperationalEvent('warn', 'clinical_payload_rejected', {
        correlationId,
        operation: 'psych_suggest_marks',
        reason: error.code,
      });
      return jsonResponse({ error: 'Dados da anamnese inválidos.' }, 400);
    }
    logOperationalEvent('error', 'psych_suggest_marks_failed', {
      correlationId,
      operation: 'psych_suggest_marks',
      reason: error instanceof SyntaxError
        ? 'invalid_provider_response'
        : 'request_failed',
    });
    return jsonResponse(
      { error: `Não foi possível concluir a sugestão. Referência: ${correlationId}.` },
      500,
    );
  }
});
