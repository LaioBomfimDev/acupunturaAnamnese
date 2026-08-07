// ============================================================
// EDGE FUNCTION: psych-reading — leitura diagnóstica em RASCUNHO
// para a anamnese de Psicologia (Fase 5 do plano multidisciplinar).
//
// Recebe o CASO já montado e ANONIMIZADO pelo cliente:
//  * campos de texto livre rotulados (já mascarados);
//  * itens marcados por grupo (rótulos do vocabulário fechado);
//  * anotações de risco.
//
// Devolve uma LEITURA PRELIMINAR estruturada para revisão da
// profissional: visão geral, hipóteses (linguagem de hipótese),
// alertas de risco (primeiro), perguntas a explorar e cautelas.
//
// Decisão do dono do produto (2026-07-10): a IA PODE interpretar,
// desde que como rascunho revisável + loop Corrigir (igual MTC).
// NUNCA diagnóstico fechado (CID/DSM), conduta, plano terapêutico
// ou medicação. Auth: Vertex AI. Não logar conteúdo do caso.
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
const SELECTED_ITEMS_SCHEMA: ClinicalPayloadSchema = {
  type: 'array',
  maxItems: 64,
  items: { type: 'string', maxLength: 240 },
};
const INFORMANT_SCHEMA: ClinicalPayloadSchema = {
  type: 'object',
  nullable: true,
  properties: {
    type: { type: 'string', maxLength: 120 },
    // O nome do informante não é necessário para o raciocínio.
    name: { type: 'string', maxLength: 240, redact: true },
  },
};
const REQUEST_SCHEMA: ClinicalPayloadSchema = {
  type: 'object',
  properties: {
    case: {
      type: 'object',
      required: true,
      properties: {
        intakeProfile: { type: 'string', maxLength: 80, nullable: true },
        fields: {
          type: 'array',
          maxItems: 80,
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', maxLength: 120 },
              label: { type: 'string', maxLength: 240 },
              text: { type: 'string', maxLength: 5000 },
              informant: INFORMANT_SCHEMA,
            },
          },
        },
        axes: {
          type: 'array',
          maxItems: 32,
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', maxLength: 120 },
              label: { type: 'string', maxLength: 240 },
              framework: { type: 'string', maxLength: 240 },
              text: { type: 'string', maxLength: 5000 },
            },
          },
        },
        selected: {
          type: 'object',
          properties: {
            psiHumor: SELECTED_ITEMS_SCHEMA,
            psiAnsiedade: SELECTED_ITEMS_SCHEMA,
            psiSono: SELECTED_ITEMS_SCHEMA,
            psiAlimentacao: SELECTED_ITEMS_SCHEMA,
            psiCognicao: SELECTED_ITEMS_SCHEMA,
            psiDesenvolvimento: SELECTED_ITEMS_SCHEMA,
            psiTrauma: SELECTED_ITEMS_SCHEMA,
            psiFuncionamento: SELECTED_ITEMS_SCHEMA,
            psiSubstancias: SELECTED_ITEMS_SCHEMA,
            psiRisco: SELECTED_ITEMS_SCHEMA,
          },
        },
        riskNotes: { type: 'string', maxLength: 5000 },
        complementaryQuestions: {
          type: 'array',
          maxItems: 80,
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', maxLength: 160 },
              question: { type: 'string', maxLength: 1600 },
              sourceQuestion: { type: 'string', maxLength: 1600 },
              answer: { type: 'string', maxLength: 5000 },
              informant: INFORMANT_SCHEMA,
              source: {
                type: 'string',
                maxLength: 40,
                enum: ['manual', 'ai_selected_by_professional'],
              },
            },
          },
        },
      },
    },
  },
};

const OUTPUT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    overview: {
      type: 'STRING',
      description: 'visão geral do caso em 2-5 frases, ancorada nos dados fornecidos; se houver risco, começar por ele',
    },
    hypotheses: {
      type: 'ARRAY',
      description: 'hipóteses de trabalho em linguagem de hipótese ("quadro compatível com…"), nunca diagnóstico fechado; vazio se os dados não sustentarem nenhuma',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING', description: 'nome da hipótese de trabalho' },
          confidence: { type: 'NUMBER', description: 'confiança entre 0 e 1, conservadora' },
          basis: { type: 'STRING', description: 'sinais do caso que sustentam, citados explicitamente' },
        },
        required: ['name', 'confidence', 'basis'],
      },
    },
    riskAlerts: {
      type: 'ARRAY',
      description: 'sinais de risco presentes nos dados (ideação suicida, autolesão, risco a terceiros, crise, violência); vazio se não houver',
      items: {
        type: 'OBJECT',
        properties: {
          sign: { type: 'STRING', description: 'o sinal de risco observado' },
          note: { type: 'STRING', description: 'por que merece atenção — SEM prescrever conduta' },
        },
        required: ['sign', 'note'],
      },
    },
    questions: {
      type: 'ARRAY',
      description: 'perguntas novas, neutras e objetivas para a profissional explorar; não repetir perguntas complementares já selecionadas ou respondidas',
      items: { type: 'STRING' },
    },
    cautions: {
      type: 'ARRAY',
      description: 'pontos onde a evidência é fraca ou ambígua e a leitura pode estar errada',
      items: { type: 'STRING' },
    },
  },
  required: ['overview', 'hypotheses', 'riskAlerts', 'questions', 'cautions'],
} as const;

const SYSTEM_PROMPT = `Você é um assistente de leitura clínica para psicólogas no Brasil.

Você recebe um CASO de anamnese de psicologia (campos de texto livre rotulados + itens marcados de um vocabulário fechado + anotações de risco + perguntas complementares selecionadas pela profissional e suas respostas) e produz uma LEITURA PRELIMINAR EM RASCUNHO, para a profissional revisar, confirmar ou corrigir. Você é colaborador rápido, não autoridade clínica — a decisão é sempre dela.

Produza:
1. overview: visão geral do caso em 2-5 frases, ancorada EXPLICITAMENTE nos dados (cite os sinais; não invente nada além deles). Se houver sinal de risco, a primeira frase é sobre ele.
2. hypotheses: até 4 hipóteses de trabalho, SEMPRE em linguagem de hipótese ("quadro compatível com…", "sinais sugestivos de…"), cada uma com os sinais que a sustentam e confiança conservadora (0.8+ só com sustentação forte e consistente). Nunca rótulo diagnóstico fechado, nunca código CID/DSM.
3. riskAlerts: TODO sinal de risco marcado ou presente no texto (ideação suicida, planejamento/tentativa, autolesão, risco a terceiros, crise aguda, violência/negligência) entra aqui, com uma nota do porquê merece atenção — SEM prescrever conduta, protocolo ou encaminhamento (isso é decisão da profissional e do protocolo da clínica).
4. questions: perguntas NOVAS que ajudariam a firmar ou descartar as hipóteses. Cada pergunta deve explorar um único ponto, ser neutra (sem induzir resposta), clara e adequada ao perfil etário/informante disponível. Não repita pergunta complementar já selecionada ou respondida; use as respostas existentes para propor o próximo aprofundamento realmente necessário.
5. cautions: onde a evidência é fraca, ambígua ou contraditória — diga honestamente.

PROIBIÇÕES (invioláveis):
- Não dar diagnóstico psicológico ou psiquiátrico fechado, nem CID/DSM.
- Não sugerir conduta, técnica, intervenção, plano terapêutico ou medicação.
- Não decidir nada sobre risco — apenas destacar para o olhar humano.
- Não interpretar além do que os dados sustentam; na dúvida, registrar em cautions.

Tudo em português brasileiro, linguagem clínica objetiva. O texto pode conter marcadores de anonimização ([NOME], [DATA] etc.) — ignore-os, são esperados.`;

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
      functionName: 'psych-reading',
      jsonResponse,
    });
    if (rateLimitResponse) return rateLimitResponse;

    const body = await readClinicalJsonBody(req, 32_768);
    if (isDeployHealthSmoke(body)) {
      if (!assertSuperAdmin(caller.profile)) {
        return jsonResponse({ error: 'Acesso restrito ao SuperAdm ativo.' }, 403);
      }
      return await runAiSmokeCheck({
        functionName: 'psych-reading',
        jsonResponse,
        modelId: MODEL_ID,
      });
    }

    if (!isVertexConfigured()) {
      return jsonResponse({ error: 'Análise por IA não configurada no servidor (conta de serviço ausente).' }, 503);
    }

    const input = sanitizeClinicalPayload(body, REQUEST_SCHEMA) as {
      case: Record<string, unknown>;
    };
    const psychologyCase = input.case;
    const caseText = JSON.stringify(psychologyCase);

    // Diretrizes adicionais curadas (aditivas; a segurança do prompt fixo
    // é piso). Key própria da leitura psi + a global clínica.
    const extraInstructions = await getActiveInstructions(supabaseAdmin, ['psych-global', 'psych-case-assistant']);
    const systemPromptText = layerSystemPrompt(SYSTEM_PROMPT, extraInstructions);

    // Query de relevância p/ correções: textos + itens marcados.
    const selectedValues = Object.values(
      (psychologyCase as { selected?: Record<string, string[]> }).selected || {},
    ).flat();
    const fieldTexts = Array.isArray((psychologyCase as { fields?: { text?: string }[] }).fields)
      ? (psychologyCase as { fields: { text?: string }[] }).fields.map((f) => f.text || '')
      : [];
    const complementaryTexts = Array.isArray((psychologyCase as {
      complementaryQuestions?: { question?: string; sourceQuestion?: string; answer?: string }[];
    }).complementaryQuestions)
      ? (psychologyCase as {
        complementaryQuestions: { question?: string; sourceQuestion?: string; answer?: string }[];
      }).complementaryQuestions.flatMap(item => [
        item.question || '', item.sourceQuestion || '', item.answer || '',
      ])
      : [];
    const relevanceQuery = [...selectedValues, ...fieldTexts, ...complementaryTexts]
      .filter(Boolean).join(' ').slice(0, 4000);

    const systemText = await withCorrectionLessons(supabaseAdmin, systemPromptText, {
      surface: 'psych_reading',
      callerId: caller.user.id,
      relevanceQuery,
    });

    const geminiResponse = await vertexGenerateContent(MODEL_ID, {
      systemInstruction: { parts: [{ text: systemText }] },
      contents: [{
        role: 'user',
        parts: [{ text: `Caso da anamnese de psicologia (JSON):\n${caseText}\n\nProduza a leitura preliminar em rascunho para revisão profissional (risco primeiro, se houver).` }],
      }],
      generationConfig: {
        temperature: 0.3,
        responseMimeType: 'application/json',
        responseSchema: OUTPUT_SCHEMA,
        // Raciocínio LEVE: orçamento de "thinking" baixo p/ custo/latência.
        thinkingConfig: { thinkingBudget: 1024 },
      },
    });

    if (!geminiResponse.ok) {
      logOperationalEvent('error', 'vertex_upstream_failed', {
        correlationId,
        operation: 'psych_reading',
        status: geminiResponse.status,
        reason: 'http_error',
      });
      throw new Error('A leitura por IA falhou. Tente novamente em instantes.');
    }

    const geminiData = await geminiResponse.json();
    const out = geminiData?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text || '')
      .join('')
      .trim();
    if (!out) {
      throw new Error('A IA não retornou uma leitura válida.');
    }
    const parsed = JSON.parse(out);

    const asArray = (v: unknown) => (Array.isArray(v) ? v : []);
    const clampConfidence = (value: unknown) => {
      const n = Number(value);
      if (!Number.isFinite(n)) return 0.5;
      return Math.min(1, Math.max(0, n));
    };

    return jsonResponse({
      modelVersion: MODEL_ID,
      analyzedAt: new Date().toISOString(),
      overview: typeof parsed.overview === 'string' ? parsed.overview : '',
      hypotheses: asArray(parsed.hypotheses)
        .filter((h: { name?: string }) => h && typeof h.name === 'string')
        .map((h: { name: string; confidence: unknown; basis?: string }) => ({
          name: h.name,
          confidence: clampConfidence(h.confidence),
          basis: typeof h.basis === 'string' ? h.basis : '',
        }))
        .slice(0, 4),
      riskAlerts: asArray(parsed.riskAlerts)
        .filter((a: { sign?: string }) => a && typeof a.sign === 'string')
        .map((a: { sign: string; note?: string }) => ({
          sign: a.sign,
          note: typeof a.note === 'string' ? a.note : '',
        }))
        .slice(0, 6),
      questions: asArray(parsed.questions).filter((s: unknown) => typeof s === 'string').slice(0, 8),
      cautions: asArray(parsed.cautions).filter((s: unknown) => typeof s === 'string').slice(0, 5),
    });
  } catch (error) {
    if (error instanceof ClinicalPayloadValidationError) {
      logOperationalEvent('warn', 'clinical_payload_rejected', {
        correlationId,
        operation: 'psych_reading',
        reason: error.code,
      });
      return jsonResponse({ error: 'Dados da anamnese inválidos.' }, 400);
    }
    logOperationalEvent('error', 'psych_reading_failed', {
      correlationId,
      operation: 'psych_reading',
      reason: error instanceof SyntaxError
        ? 'invalid_provider_response'
        : 'request_failed',
    });
    return jsonResponse(
      { error: `Não foi possível concluir a leitura. Referência: ${correlationId}.` },
      500,
    );
  }
});
