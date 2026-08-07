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
    kind: {
      type: 'string',
      required: true,
      maxLength: 40,
      enum: ['avaliacao_neuropsicologica'],
    },
    case: {
      type: 'object',
      required: true,
      properties: {
        referral: {
          type: 'object',
          properties: {
            // Nome de solicitante não agrega ao rascunho e nunca sai da Edge.
            requester: { type: 'string', maxLength: 320, redact: true },
            reason: { type: 'string', maxLength: 5000 },
            questions: { type: 'string', maxLength: 5000 },
            priorHypotheses: { type: 'string', maxLength: 5000 },
            relevantHistory: { type: 'string', maxLength: 8000 },
          },
        },
        instruments: {
          type: 'array',
          maxItems: 80,
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', maxLength: 160 },
              name: { type: 'string', maxLength: 500 },
              domain: { type: 'string', maxLength: 500 },
              purpose: { type: 'string', maxLength: 2000 },
              sessionNumber: {
                type: 'number',
                integer: true,
                nullable: true,
                min: 0,
                max: 10000,
              },
              status: { type: 'string', maxLength: 80 },
              rawResult: { type: 'string', maxLength: 5000 },
              professionalInterpretation: { type: 'string', maxLength: 5000 },
            },
          },
        },
        sessions: {
          type: 'array',
          maxItems: 80,
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', maxLength: 160 },
              number: { type: 'number', integer: true, min: 1, max: 10000 },
              date: { type: 'string', maxLength: 40 },
              purpose: { type: 'string', maxLength: 1000 },
              participants: { type: 'string', maxLength: 1000, redact: true },
              informant: { type: 'string', maxLength: 500, redact: true },
              instruments: { type: 'string', maxLength: 3000 },
              observations: { type: 'string', maxLength: 5000 },
              behavior: { type: 'string', maxLength: 5000 },
              partialResults: { type: 'string', maxLength: 5000 },
              intercurrences: { type: 'string', maxLength: 5000 },
              nextSteps: { type: 'string', maxLength: 5000 },
              status: { type: 'string', maxLength: 80 },
            },
          },
        },
        integration: {
          type: 'object',
          properties: {
            procedures: { type: 'string', maxLength: 8000 },
            clinicalObservations: { type: 'string', maxLength: 8000 },
            resultsSummary: { type: 'string', maxLength: 8000 },
            convergences: { type: 'string', maxLength: 5000 },
            divergences: { type: 'string', maxLength: 5000 },
            workingHypotheses: { type: 'string', maxLength: 5000 },
            differentialQuestions: { type: 'string', maxLength: 5000 },
            limitations: { type: 'string', maxLength: 5000 },
            professionalConclusion: { type: 'string', maxLength: 8000 },
            recommendations: { type: 'string', maxLength: 8000 },
          },
        },
      },
    },
  },
};

const OUTPUT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    historico: { type: 'STRING' },
    procedimentos: { type: 'STRING' },
    observacoes: { type: 'STRING' },
    resultados: { type: 'STRING' },
    analise: { type: 'STRING' },
    consideracoes: { type: 'STRING' },
    limitacoes: { type: 'STRING' },
  },
  required: ['historico', 'procedimentos', 'observacoes', 'resultados', 'analise', 'consideracoes', 'limitacoes'],
} as const;

const SYSTEM_PROMPT = `Você redige RASCUNHOS de relatório neuropsicológico para revisão de uma neuropsicóloga no Brasil.

Receba somente dados estruturados e anonimizados já registrados: encaminhamento, instrumentos, sessões, observações, resultados parciais e integração escrita pela profissional.

Organize o texto nestas seções:
1. Histórico e demanda.
2. Procedimentos.
3. Observações clínicas e evolução do processo.
4. Resultados.
5. Análise integrativa.
6. Considerações profissionais.
7. Limitações.

Regras invioláveis:
- Não invente teste, resultado, percentil, diagnóstico, fato, recomendação ou conduta.
- Não converta resultado bruto em interpretação clínica por conta própria.
- Hipóteses permanecem hipóteses; diagnóstico/conclusão só pode reproduzir texto explicitamente registrado pela profissional.
- Se uma seção não tiver dados, declare que permanece pendente de preenchimento/revisão profissional.
- Não inclua nome, CPF, telefone ou outro identificador.
- Escreva em português brasileiro, linguagem técnica clara e sem afirmações absolutas.

O resultado é sempre rascunho. A profissional deve comparar, editar e confirmar antes de imprimir.`;

Deno.serve(async (req) => {
  const correlationId = createCorrelationId(req.headers.get('x-correlation-id'));
  const cors = createCorsContext(req);
  if (!cors.allowed) return cors.rejectResponse();
  const { headers: corsHeaders, jsonResponse } = cors;

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Método não permitido.' }, 405);

  try {
    const supabaseAdmin = createServiceClient();
    const caller = await getCallerProfile(req, supabaseAdmin);
    if ('error' in caller) return jsonResponse({ error: caller.error }, caller.status);
    const access = assertEdgeAccess(caller.profile, caller.claims);
    if (!access.allowed) return jsonResponse({ error: access.error }, access.status);

    const rateLimitResponse = await enforceEdgeRateLimit({
      supabaseAdmin,
      subjectId: caller.user.id,
      functionName: 'psych-report',
      jsonResponse,
    });
    if (rateLimitResponse) return rateLimitResponse;

    const body = await readClinicalJsonBody(req, 48_000);
    if (isDeployHealthSmoke(body)) {
      if (!assertSuperAdmin(caller.profile)) return jsonResponse({ error: 'Acesso restrito ao SuperAdm ativo.' }, 403);
      return await runAiSmokeCheck({
        functionName: 'psych-report',
        jsonResponse,
        modelId: MODEL_ID,
      });
    }
    if (!isVertexConfigured()) {
      return jsonResponse({ error: 'Geração por IA não configurada no servidor.' }, 503);
    }
    const input = sanitizeClinicalPayload(body, REQUEST_SCHEMA) as {
      kind: 'avaliacao_neuropsicologica';
      case: Record<string, unknown>;
    };

    const caseText = JSON.stringify(input.case);
    const extraInstructions = await getActiveInstructions(supabaseAdmin, ['psych-global', 'psych-report-assistant']);
    const layeredPrompt = layerSystemPrompt(SYSTEM_PROMPT, extraInstructions);
    const systemText = await withCorrectionLessons(supabaseAdmin, layeredPrompt, {
      surface: 'psych_reading',
      callerId: caller.user.id,
      relevanceQuery: caseText.slice(0, 4000),
    });

    const response = await vertexGenerateContent(MODEL_ID, {
      systemInstruction: { parts: [{ text: systemText }] },
      contents: [{
        role: 'user',
        parts: [{ text: `Avaliação neuropsicológica estruturada (JSON):\n${caseText}\n\nRedija o rascunho sem acrescentar fatos.` }],
      }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: OUTPUT_SCHEMA,
        thinkingConfig: { thinkingBudget: 1024 },
      },
    });

    if (!response.ok) {
      logOperationalEvent('error', 'vertex_upstream_failed', {
        correlationId,
        operation: 'psych_report',
        status: response.status,
        reason: 'http_error',
      });
      throw new Error('A geração do relatório falhou. Tente novamente em instantes.');
    }
    const payload = await response.json();
    const text = payload?.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text || '')
      .join('')
      .trim();
    if (!text) throw new Error('A IA não retornou um relatório válido.');
    const parsed = JSON.parse(text);
    const sections = [
      ['Histórico e demanda', parsed.historico],
      ['Procedimentos', parsed.procedimentos],
      ['Observações clínicas e evolução', parsed.observacoes],
      ['Resultados', parsed.resultados],
      ['Análise integrativa', parsed.analise],
      ['Considerações profissionais', parsed.consideracoes],
      ['Limitações', parsed.limitacoes],
    ].map(([heading, content]) => ({
      heading,
      content: typeof content === 'string' ? content : 'Pendente de revisão profissional.',
    }));
    return jsonResponse({ modelVersion: MODEL_ID, analyzedAt: new Date().toISOString(), sections });
  } catch (error) {
    if (error instanceof ClinicalPayloadValidationError) {
      logOperationalEvent('warn', 'clinical_payload_rejected', {
        correlationId,
        operation: 'psych_report',
        reason: error.code,
      });
      return jsonResponse({ error: 'Dados da avaliação inválidos.' }, 400);
    }
    logOperationalEvent('error', 'psych_report_failed', {
      correlationId,
      operation: 'psych_report',
      reason: error instanceof SyntaxError
        ? 'invalid_provider_response'
        : 'request_failed',
    });
    return jsonResponse(
      { error: `Não foi possível concluir o relatório. Referência: ${correlationId}.` },
      500,
    );
  }
});
