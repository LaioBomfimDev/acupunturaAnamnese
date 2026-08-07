// ============================================================
// EDGE FUNCTION: draft-narrative — rascunhos de texto clínico
// Fase 3 da expansão de IA (ver roadmap-ia-expansao).
//
// Dois usos, discriminados por `kind`:
//  * 'report'    — rascunho de relatório (modo: resumo/profissional/paciente)
//                  a partir de dados já estruturados pelo sistema;
//  * 'evolution' — resumo da trajetória do paciente entre sessões.
//
// O conteúdo chega JÁ ANONIMIZADO pelo cliente e SEM o nome do paciente
// (a IA fala "o paciente"; o nome real fica no template, fora da IA).
// Gemini flash, SEM thinking (geração de prosa simples).
//
// Saída: { paragraphs: string[] } — texto para REVISÃO da profissional.
// Nunca diagnóstico/conduta final. Auth: Vertex AI (conta de serviço).
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
const REPORT_MODES = [
  'Resumo clínico',
  'Relatório profissional',
  'Orientação ao paciente',
] as const;
const REPORT_PAYLOAD_SCHEMA: ClinicalPayloadSchema = {
  type: 'object',
  properties: {
    modo: { type: 'string', maxLength: 40, enum: REPORT_MODES },
    idade: { type: 'stringOrNumber', maxLength: 40, min: 0, max: 130 },
    queixa: { type: 'string', maxLength: 3000 },
    historia: { type: 'string', maxLength: 5000 },
    hipotese: { type: 'string', maxLength: 500 },
    raiz: { type: 'string', maxLength: 1600 },
    manifestacao: { type: 'string', maxLength: 1600 },
    oitoPrincipios: { type: 'string', maxLength: 1200 },
    cincoElementos: { type: 'string', maxLength: 1200 },
    principioTerapeutico: { type: 'string', maxLength: 1600 },
    protocolo: {
      type: 'object',
      properties: {
        body: { type: 'string', maxLength: 1600 },
        ear: { type: 'string', maxLength: 1600 },
        moxa: { type: 'string', maxLength: 1600 },
        laser: { type: 'string', maxLength: 1600 },
      },
    },
    pontos: {
      type: 'array',
      maxItems: 16,
      items: { type: 'string', maxLength: 800 },
    },
    referencias: {
      type: 'array',
      maxItems: 24,
      items: { type: 'string', maxLength: 500 },
    },
    evolucao: {
      type: 'object',
      properties: {
        numeroSessao: { type: 'number', integer: true, min: 1, max: 10000 },
        ultima: {
          type: 'object',
          nullable: true,
          properties: {
            data: { type: 'string', maxLength: 40 },
            dor: { type: 'stringOrNumber', maxLength: 40, min: 0, max: 10 },
            sono: { type: 'stringOrNumber', maxLength: 40, min: 0, max: 10 },
            ansiedade: { type: 'stringOrNumber', maxLength: 40, min: 0, max: 10 },
          },
        },
      },
    },
    seguranca: {
      type: 'array',
      maxItems: 32,
      items: { type: 'string', maxLength: 1200 },
    },
    reabilitacao: {
      type: 'object',
      nullable: true,
      properties: {
        total: { type: 'number', integer: true, min: 1, max: 10000 },
        periodo: {
          type: 'object',
          properties: {
            de: { type: 'string', maxLength: 40 },
            ate: { type: 'string', maxLength: 40 },
          },
        },
        objetivoFuncional: { type: 'string', maxLength: 1600 },
        medidas: {
          type: 'array',
          maxItems: 16,
          items: {
            type: 'object',
            properties: {
              medida: { type: 'string', maxLength: 160 },
              primeiro: { type: 'number', nullable: true, min: -1000, max: 1000 },
              ultimo: { type: 'number', nullable: true, min: -1000, max: 1000 },
            },
          },
        },
      },
    },
  },
};
const EVOLUTION_SESSION_SCHEMA: ClinicalPayloadSchema = {
  type: 'object',
  properties: {
    sessao: { type: 'stringOrNumber', maxLength: 40, min: 0, max: 10000 },
    dor: { type: 'stringOrNumber', maxLength: 40, min: 0, max: 10 },
    sono: { type: 'stringOrNumber', maxLength: 40, min: 0, max: 10 },
    ansiedade: { type: 'stringOrNumber', maxLength: 40, min: 0, max: 10 },
    energia: { type: 'stringOrNumber', maxLength: 40, min: 0, max: 10 },
    intestino: { type: 'stringOrNumber', maxLength: 40, min: 0, max: 10 },
    humor: { type: 'stringOrNumber', maxLength: 40, min: 0, max: 10 },
    hipotese: { type: 'string', maxLength: 800 },
    protocolo: { type: 'string', maxLength: 2400 },
    intercorrencia: { type: 'string', maxLength: 2400 },
    obs: { type: 'string', maxLength: 3000 },
    resposta: { type: 'string', maxLength: 3000 },
  },
};
const REPORT_REQUEST_SCHEMA: ClinicalPayloadSchema = {
  type: 'object',
  properties: {
    kind: { type: 'string', required: true, maxLength: 16, enum: ['report'] },
    mode: { type: 'string', required: true, maxLength: 40, enum: REPORT_MODES },
    payload: { ...REPORT_PAYLOAD_SCHEMA, required: true },
  },
};
const EVOLUTION_REQUEST_SCHEMA: ClinicalPayloadSchema = {
  type: 'object',
  properties: {
    kind: { type: 'string', required: true, maxLength: 16, enum: ['evolution'] },
    mode: { type: 'string', maxLength: 40, enum: REPORT_MODES, nullable: true },
    payload: {
      type: 'object',
      required: true,
      properties: {
        sessions: {
          type: 'array',
          required: true,
          maxItems: 120,
          items: EVOLUTION_SESSION_SCHEMA,
        },
      },
    },
  },
};

const OUTPUT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    paragraphs: {
      type: 'ARRAY',
      description: 'o texto em parágrafos; cada item é um parágrafo em pt-BR',
      items: { type: 'STRING' },
    },
  },
  required: ['paragraphs'],
} as const;

const REPORT_MODE_GUIDES: Record<string, string> = {
  'Resumo clínico': 'Resumo clínico interno, objetivo e conciso, para o prontuário da própria profissional. Linguagem técnica, sem floreios.',
  'Relatório profissional': 'Relatório de avaliação energética integrativa, linguagem clínica formal de MTC, organizado e fundamentado, para arquivo profissional ou encaminhamento entre profissionais.',
  'Orientação ao paciente': 'Texto dirigido AO paciente, em segunda pessoa, acolhedor, claro e sem jargão técnico. Explica o cuidado de forma compreensível, sem prometer cura.',
};

function buildReportPrompt(mode: string) {
  const guide = REPORT_MODE_GUIDES[mode] || REPORT_MODE_GUIDES['Resumo clínico'];
  return `Você redige rascunhos de texto clínico para acupunturistas no Brasil (Medicina Tradicional Chinesa). Estilo deste rascunho: ${guide}

Você recebe DADOS JÁ ESTRUTURADOS pelo sistema (hipótese energética, queixa, história, princípio terapêutico, protocolo, etc.). Sua tarefa é transformá-los em um texto corrido e bem escrito.

Regras:
- Use APENAS os dados fornecidos. NÃO invente sinais, hipóteses, pontos ou condutas que não estejam no payload. Se um campo estiver vazio, omita-o naturalmente.
- NÃO use o nome do paciente (ele não é enviado); refira-se como "o paciente" ou em segunda pessoa, conforme o estilo.
- Texto pode conter marcadores de anonimização ([NOME], [DATA]) — reescreva de forma neutra, sem citá-los.
- É um RASCUNHO para revisão da profissional. Não afirme certezas que os dados não sustentam; trate hipóteses como hipóteses.
- Português brasileiro. Devolva o texto dividido em parágrafos (campo paragraphs).`;
}

const EVOLUTION_PROMPT = `Você redige resumos de evolução para acupunturistas no Brasil (Medicina Tradicional Chinesa).

Você recebe a série de sessões de um paciente com indicadores 0–10 (dor, sono, ansiedade, energia, intestino, humor), além de hipóteses e observações por sessão. Escreva um resumo da TRAJETÓRIA: o que melhorou, o que piorou ou estagnou, padrões ao longo do tempo e pontos de atenção.

Regras:
- Baseie-se SOMENTE nos dados fornecidos. Cite tendências concretas (ex.: "dor caiu de 8 para 3 em 4 sessões").
- Não invente. Se houver poucas sessões, diga que a leitura ainda é preliminar.
- NÃO use o nome do paciente. Texto pode ter marcadores ([NOME], [DATA]) — reescreva de forma neutra.
- É um rascunho para revisão da profissional. Português brasileiro, dividido em parágrafos (campo paragraphs).`;

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
      functionName: 'draft-narrative',
      jsonResponse,
    });
    if (rateLimitResponse) return rateLimitResponse;

    const body = await readClinicalJsonBody(req, 32_768);
    if (isDeployHealthSmoke(body)) {
      if (!assertSuperAdmin(caller.profile)) {
        return jsonResponse({ error: 'Acesso restrito ao SuperAdm ativo.' }, 403);
      }
      return await runAiSmokeCheck({
        functionName: 'draft-narrative',
        jsonResponse,
        modelId: MODEL_ID,
      });
    }

    if (!isVertexConfigured()) {
      return jsonResponse({ error: 'Análise por IA não configurada no servidor (conta de serviço ausente).' }, 503);
    }

    if (body.kind !== 'report' && body.kind !== 'evolution') {
      return jsonResponse({ error: 'kind inválido.' }, 400);
    }
    const input = sanitizeClinicalPayload(
      body,
      body.kind === 'report' ? REPORT_REQUEST_SCHEMA : EVOLUTION_REQUEST_SCHEMA,
    ) as {
      kind: 'report' | 'evolution';
      mode?: string | null;
      payload: Record<string, unknown>;
    };
    const { kind, payload } = input;

    const baseSystemPrompt = kind === 'report'
      ? buildReportPrompt(input.mode || 'Resumo clínico')
      : EVOLUTION_PROMPT;
    const payloadText = JSON.stringify(payload);
    const systemPrompt = await withCorrectionLessons(supabaseAdmin, baseSystemPrompt, {
      surface: 'narrative',
      callerId: caller.user.id,
      relevanceQuery: payloadText,
    });
    const userText = kind === 'report'
      ? `Dados do relatório (JSON):\n${payloadText}\n\nRedija o rascunho.`
      : `Sessões do paciente (JSON):\n${payloadText}\n\nRedija o resumo da evolução.`;

    const geminiResponse = await vertexGenerateContent(MODEL_ID, {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userText }] }],
      generationConfig: {
        temperature: 0.4,
        responseMimeType: 'application/json',
        responseSchema: OUTPUT_SCHEMA,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    if (!geminiResponse.ok) {
      logOperationalEvent('error', 'vertex_upstream_failed', {
        correlationId,
        operation: 'draft_narrative',
        status: geminiResponse.status,
        reason: 'http_error',
      });
      throw new Error('A geração por IA falhou. Tente novamente em instantes.');
    }

    const geminiData = await geminiResponse.json();
    const out = geminiData?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text || '')
      .join('')
      .trim();
    if (!out) {
      throw new Error('A IA não retornou um texto válido.');
    }
    const parsed = JSON.parse(out);
    const paragraphs = (Array.isArray(parsed.paragraphs) ? parsed.paragraphs : [])
      .filter((p: unknown) => typeof p === 'string' && p.trim())
      .slice(0, 30);

    if (paragraphs.length === 0) {
      throw new Error('A IA não retornou texto aproveitável.');
    }

    return jsonResponse({
      modelVersion: MODEL_ID,
      analyzedAt: new Date().toISOString(),
      paragraphs,
    });
  } catch (error) {
    if (error instanceof ClinicalPayloadValidationError) {
      logOperationalEvent('warn', 'clinical_payload_rejected', {
        correlationId,
        operation: 'draft_narrative',
        reason: error.code,
      });
      return jsonResponse({ error: 'Dados do rascunho inválidos.' }, 400);
    }
    logOperationalEvent('error', 'draft_narrative_failed', {
      correlationId,
      operation: 'draft_narrative',
      reason: error instanceof SyntaxError
        ? 'invalid_provider_response'
        : 'request_failed',
    });
    return jsonResponse(
      { error: `Não foi possível concluir o rascunho. Referência: ${correlationId}.` },
      500,
    );
  }
});
