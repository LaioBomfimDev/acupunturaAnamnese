// ============================================================
// EDGE FUNCTION: clinical-reasoning — camada de raciocínio da IA
// Fase 2 da expansão de IA (ver roadmap-ia-expansao).
//
// Recebe o CASO já montado e ANONIMIZADO pelo cliente:
//  * hipótese/diferencial/confiança calculados pelo motor determinístico
//    (assistantSynthesis) — a IA raciocina COM o motor, não do zero;
//  * sinais objetivos/subjetivos selecionados (rótulos, sem PII);
//  * texto livre da anamnese já mascarado.
//
// Chama o Gemini flash com raciocínio LEVE (thinkingBudget baixo) e
// devolve raciocínio estruturado para conferência: interpretação,
// como separar o diferencial, red flags, contradições e perguntas.
//
// NUNCA diagnóstico/conduta final. Auth: Vertex AI (conta de serviço).
// Privacidade: não logar o conteúdo do caso.
// ============================================================

import {
  assertSuperAdmin,
  corsHeaders,
  createServiceClient,
  getCallerProfile,
  jsonResponse,
} from '../_shared/security.ts';
import { vertexGenerateContent, isVertexConfigured } from '../_shared/vertex.ts';
import { getActiveInstructions, layerSystemPrompt } from '../_shared/instructions.ts';
import { withCorrectionLessons } from '../_shared/corrections.ts';
import { isDeployHealthSmoke, runAiSmokeCheck } from '../_shared/aiSmoke.ts';

const MODEL_ID = 'gemini-2.5-flash';

const OUTPUT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    interpretation: {
      type: 'STRING',
      description: 'leitura clínica da hipótese principal, ancorada nos sinais presentes no caso, em pt-BR (2-4 frases)',
    },
    differentialReasoning: {
      type: 'STRING',
      nullable: true,
      description: 'como distinguir a hipótese principal do diferencial; null se não houver diferencial relevante',
    },
    redFlags: {
      type: 'ARRAY',
      description: 'sinais de alerta que pedem cautela ou encaminhamento médico; vazio se não houver',
      items: {
        type: 'OBJECT',
        properties: {
          sign: { type: 'STRING', description: 'o sinal de alerta observado no caso' },
          action: { type: 'STRING', description: 'conduta sugerida (ex.: encaminhar, investigar antes de agulhar)' },
        },
        required: ['sign', 'action'],
      },
    },
    contradictions: {
      type: 'ARRAY',
      description: 'contradições entre sinais ou entre texto e marcações; vazio se não houver',
      items: { type: 'STRING' },
    },
    questions: {
      type: 'ARRAY',
      description: 'perguntas objetivas para a profissional investigar e firmar a hipótese',
      items: { type: 'STRING' },
    },
  },
  required: ['interpretation', 'differentialReasoning', 'redFlags', 'contradictions', 'questions'],
} as const;

const SYSTEM_PROMPT = `Você é um assistente de raciocínio clínico para acupunturistas no Brasil (Medicina Tradicional Chinesa).

Você recebe um CASO já analisado por um motor determinístico do próprio sistema: a hipótese principal, o diferencial, a confiança e os sinais que sustentam cada padrão. Sua função é RACIOCINAR COM esse motor — explicar, enriquecer e questionar — nunca substituí-lo nem produzir diagnóstico ou conduta final.

Produza:
1. interpretation: uma leitura clínica da hipótese principal, ancorada EXPLICITAMENTE nos sinais presentes no caso (cite-os). Não invente sinais que não estão no caso.
2. differentialReasoning: se houver diferencial relevante, explique como separar a hipótese principal dele — quais sinais/perguntas decidem. Se não houver, null.
3. redFlags: sinais de alerta no caso que pedem cautela, adaptação técnica ou encaminhamento médico (ex.: dor torácica, hipertensão descompensada, gestação com técnica inadequada, sinal neurológico agudo). Cada um com a conduta sugerida. Vazio se não houver.
4. contradictions: incoerências entre sinais (ex.: língua de calor com pulso de frio) ou entre o texto e as marcações. Vazio se não houver.
5. questions: perguntas objetivas que a profissional deveria fazer/investigar para firmar a hipótese.

Regras:
- Tudo em português brasileiro, linguagem clínica objetiva e concisa.
- Conservador: se a evidência é fraca, diga que é fraca. Não force um padrão.
- Quando vier CONHECIMENTO CURADO (trechos da base do próprio sistema), fundamente a leitura dos padrões NELE — é a referência do sistema e tem prioridade sobre o conhecimento geral de MTC. Ainda assim, não afirme nada que os sinais do caso não sustentem.
- O texto da anamnese pode conter marcadores de anonimização ([NOME], [DATA], etc.) — ignore-os.
- Você é assistivo. A decisão final é sempre da profissional.`;

Deno.serve(async (req) => {
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
    if (caller.profile.is_active !== true) {
      return jsonResponse({ error: 'Usuário suspenso.' }, 403);
    }

    const body = await req.json().catch(() => ({}));
    if (isDeployHealthSmoke(body)) {
      if (!assertSuperAdmin(caller.profile)) {
        return jsonResponse({ error: 'Acesso restrito ao SuperAdm ativo.' }, 403);
      }
      return await runAiSmokeCheck({ functionName: 'clinical-reasoning', modelId: MODEL_ID });
    }

    if (!isVertexConfigured()) {
      return jsonResponse({ error: 'Análise por IA não configurada no servidor (conta de serviço ausente).' }, 503);
    }

    const clinicalCase = body.case;
    if (!clinicalCase || typeof clinicalCase !== 'object') {
      return jsonResponse({ error: 'Caso clínico ausente.' }, 400);
    }
    // Conhecimento curado recuperado no cliente (âncora). Sai do JSON do caso
    // para não competir pelo teto e ser apresentado como bloco próprio.
    const knowledgeContext = Array.isArray(clinicalCase.knowledgeContext) ? clinicalCase.knowledgeContext : [];
    const caseForModel: Record<string, unknown> = { ...clinicalCase };
    delete caseForModel.knowledgeContext;
    // Teto defensivo no tamanho do caso serializado.
    const caseText = JSON.stringify(caseForModel).slice(0, 12000);
    const knowledgeText = knowledgeContext.length
      ? knowledgeContext
          .slice(0, 8)
          .map((k: Record<string, unknown>, i: number) =>
            `[${i + 1}] (${k.cat || '?'} · confiança ${k.confidence || '?'} · fonte ${k.source || '?'})\n${k.title || ''}: ${String(k.text || '').slice(0, 700)}`)
          .join('\n\n')
          .slice(0, 4500)
      : '';

    // Diretrizes adicionais curadas (aditivas; a segurança do prompt fixo é piso).
    const extraInstructions = await getActiveInstructions(supabaseAdmin, ['clinical-global', 'clinical-reasoning']);
    const systemPromptText = layerSystemPrompt(SYSTEM_PROMPT, extraInstructions);
    // Lições de correção (aprovadas + as da própria autora) sobre as diretrizes.
    // Query de relevância p/ as correções: hipótese + padrões + sinais do caso.
    const reasoningQuery = [
      clinicalCase.hypothesis?.primary,
      ...(Array.isArray(clinicalCase.topPatterns)
        ? clinicalCase.topPatterns.map((p: { name?: string }) => p?.name)
        : []),
      ...Object.values(clinicalCase.signals || {}).flat(),
    ].filter(Boolean).join(' ');
    const systemText = await withCorrectionLessons(supabaseAdmin, systemPromptText, {
      surface: 'clinical_reasoning',
      callerId: caller.user.id,
      relevanceQuery: reasoningQuery,
    });

    const geminiResponse = await vertexGenerateContent(MODEL_ID, {
      systemInstruction: { parts: [{ text: systemText }] },
      contents: [{
        role: 'user',
        parts: [{ text: `Caso clínico (JSON):\n${caseText}${knowledgeText ? `\n\nCONHECIMENTO CURADO RELEVANTE (base do próprio sistema — fundamente a leitura dos padrões nisto, priorizando sobre conhecimento geral; não invente além dos sinais do caso):\n${knowledgeText}` : ''}\n\nProduza o raciocínio estruturado para conferência profissional.` }],
      }],
      generationConfig: {
        temperature: 0.3,
        responseMimeType: 'application/json',
        responseSchema: OUTPUT_SCHEMA,
        // Raciocínio LEVE: orçamento de "thinking" baixo para conter custo/latência.
        thinkingConfig: { thinkingBudget: 1024 },
      },
    });

    if (!geminiResponse.ok) {
      console.error('clinical-reasoning: Gemini API erro', geminiResponse.status);
      throw new Error('O raciocínio por IA falhou. Tente novamente em instantes.');
    }

    const geminiData = await geminiResponse.json();
    const out = geminiData?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text || '')
      .join('')
      .trim();
    if (!out) {
      throw new Error('A IA não retornou um raciocínio válido.');
    }
    const parsed = JSON.parse(out);

    const asArray = (v: unknown) => (Array.isArray(v) ? v : []);
    return jsonResponse({
      modelVersion: MODEL_ID,
      analyzedAt: new Date().toISOString(),
      interpretation: typeof parsed.interpretation === 'string' ? parsed.interpretation : '',
      differentialReasoning: typeof parsed.differentialReasoning === 'string' ? parsed.differentialReasoning : null,
      redFlags: asArray(parsed.redFlags)
        .filter((f: { sign?: string }) => f && typeof f.sign === 'string')
        .map((f: { sign: string; action?: string }) => ({ sign: f.sign, action: typeof f.action === 'string' ? f.action : '' }))
        .slice(0, 8),
      contradictions: asArray(parsed.contradictions).filter((s: unknown) => typeof s === 'string').slice(0, 8),
      questions: asArray(parsed.questions).filter((s: unknown) => typeof s === 'string').slice(0, 8),
    });
  } catch (error) {
    console.error('clinical-reasoning:', error instanceof Error ? error.message : 'erro');
    return jsonResponse(
      { error: error instanceof Error ? error.message : 'Erro inesperado no raciocínio.' },
      500,
    );
  }
});
