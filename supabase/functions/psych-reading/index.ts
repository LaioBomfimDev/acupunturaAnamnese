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
      description: 'perguntas objetivas para a profissional explorar nas próximas sessões',
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

Você recebe um CASO de anamnese de psicologia (campos de texto livre rotulados + itens marcados de um vocabulário fechado + anotações de risco) e produz uma LEITURA PRELIMINAR EM RASCUNHO, para a profissional revisar, confirmar ou corrigir. Você é colaborador rápido, não autoridade clínica — a decisão é sempre dela.

Produza:
1. overview: visão geral do caso em 2-5 frases, ancorada EXPLICITAMENTE nos dados (cite os sinais; não invente nada além deles). Se houver sinal de risco, a primeira frase é sobre ele.
2. hypotheses: até 4 hipóteses de trabalho, SEMPRE em linguagem de hipótese ("quadro compatível com…", "sinais sugestivos de…"), cada uma com os sinais que a sustentam e confiança conservadora (0.8+ só com sustentação forte e consistente). Nunca rótulo diagnóstico fechado, nunca código CID/DSM.
3. riskAlerts: TODO sinal de risco marcado ou presente no texto (ideação suicida, planejamento/tentativa, autolesão, risco a terceiros, crise aguda, violência/negligência) entra aqui, com uma nota do porquê merece atenção — SEM prescrever conduta, protocolo ou encaminhamento (isso é decisão da profissional e do protocolo da clínica).
4. questions: perguntas objetivas que ajudariam a firmar ou descartar as hipóteses.
5. cautions: onde a evidência é fraca, ambígua ou contraditória — diga honestamente.

PROIBIÇÕES (invioláveis):
- Não dar diagnóstico psicológico ou psiquiátrico fechado, nem CID/DSM.
- Não sugerir conduta, técnica, intervenção, plano terapêutico ou medicação.
- Não decidir nada sobre risco — apenas destacar para o olhar humano.
- Não interpretar além do que os dados sustentam; na dúvida, registrar em cautions.

Tudo em português brasileiro, linguagem clínica objetiva. O texto pode conter marcadores de anonimização ([NOME], [DATA] etc.) — ignore-os, são esperados.`;

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
      return await runAiSmokeCheck({ functionName: 'psych-reading', modelId: MODEL_ID });
    }

    if (!isVertexConfigured()) {
      return jsonResponse({ error: 'Análise por IA não configurada no servidor (conta de serviço ausente).' }, 503);
    }

    const psychologyCase = body.case;
    if (!psychologyCase || typeof psychologyCase !== 'object') {
      return jsonResponse({ error: 'Caso da anamnese ausente.' }, 400);
    }
    // Teto defensivo no tamanho do caso serializado.
    const caseText = JSON.stringify(psychologyCase).slice(0, 12000);

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
    const relevanceQuery = [...selectedValues, ...fieldTexts].filter(Boolean).join(' ').slice(0, 4000);

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
      console.error('psych-reading: Gemini API erro', geminiResponse.status);
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
    console.error('psych-reading:', error instanceof Error ? error.message : 'erro');
    return jsonResponse(
      { error: error instanceof Error ? error.message : 'Erro inesperado na leitura.' },
      500,
    );
  }
});
