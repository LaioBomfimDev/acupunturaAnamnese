// ============================================================
// EDGE FUNCTION: library-qa — perguntas à Biblioteca Viva (RAG)
// Fase 4 da expansão de IA (ver roadmap-ia-expansao).
//
// A recuperação acontece no CLIENTE (sobreposição de termos sobre os
// cards já carregados) — barato e sem infra de vetores. Aqui só a
// GERAÇÃO: o Gemini responde ANCORADO no contexto recebido, cita as
// fontes e admite quando o contexto não cobre a pergunta.
//
// Não há dado de paciente (é base de conhecimento) — sem anonimização.
// Gemini flash, sem thinking. Auth: Vertex AI (conta de serviço).
// ============================================================

import {
  corsHeaders,
  createServiceClient,
  getCallerProfile,
  jsonResponse,
} from '../_shared/security.ts';
import { vertexGenerateContent, isVertexConfigured } from '../_shared/vertex.ts';
import { getActiveInstructions, layerSystemPrompt } from '../_shared/instructions.ts';
import { withCorrectionLessons } from '../_shared/corrections.ts';

const MODEL_ID = 'gemini-2.5-flash';

const OUTPUT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    answer: {
      type: 'STRING',
      description: 'resposta em pt-BR, ancorada apenas no contexto fornecido',
    },
    citations: {
      type: 'ARRAY',
      description: 'títulos dos itens do contexto efetivamente usados na resposta',
      items: { type: 'STRING' },
    },
    insufficient: {
      type: 'BOOLEAN',
      description: 'true se o contexto não cobre a pergunta',
    },
  },
  required: ['answer', 'citations', 'insufficient'],
} as const;

const SYSTEM_PROMPT = `Você é um assistente de consulta da "Biblioteca Viva", uma base curada de Medicina Tradicional Chinesa (pontos de acupuntura, síndromes, técnicas) usada por acupunturistas no Brasil.

Responda à pergunta da profissional usando EXCLUSIVAMENTE o CONTEXTO fornecido (trechos da própria biblioteca).

Regras:
- NÃO use conhecimento externo nem invente pontos, funções, localizações ou indicações que não estejam no contexto. Esta base é curada justamente para evitar informação não verificada.
- Cite no campo citations os títulos dos itens do contexto que sustentam a resposta.
- Quando usar uma fonte "Acupuntura Médica em Questões (TEAC)", atribua a conclusão no próprio texto: "De acordo com Cruz, Höhl e Ungarelli, Acupuntura Médica em Questões (TEAC [ano], questão [número]), ...". Copie ano e número da linha "Fonte" do contexto; se o trecho não tiver questão numerada, cite o capítulo. Nunca apresente a resposta de prova como verdade clínica universal, diagnóstico final ou conduta.
- Para fonte TEAC, cada item em citations deve conter também a referência rastreável no formato "TEAC [ano], questão [número] — [título]" ou "TEAC, capítulo [nome] — [título]". Não invente ano, número ou capítulo.
- Se o contexto NÃO contém o suficiente para responder, diga isso claramente no answer e marque insufficient=true. Não preencha lacunas com suposições.
- Atenção ao nível de confiança de cada item (high/medium/low): se a resposta depender de itens de baixa confiança ("rascunho bruto" ou "em revisão"), avise que precisam de revisão profissional antes do uso clínico.
- Português brasileiro, objetivo e clínico. A resposta é apoio ao estudo/consulta, não conduta automática.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Método não permitido.' }, 405);
  }

  try {
    if (!isVertexConfigured()) {
      return jsonResponse({ error: 'Análise por IA não configurada no servidor (conta de serviço ausente).' }, 503);
    }

    const supabaseAdmin = createServiceClient();
    const caller = await getCallerProfile(req, supabaseAdmin);
    if ('error' in caller) {
      return jsonResponse({ error: caller.error }, caller.status);
    }
    if (caller.profile.is_active !== true) {
      return jsonResponse({ error: 'Usuário suspenso.' }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const question = String(body.question || '').trim();
    const context = Array.isArray(body.context) ? body.context : [];
    if (!question) {
      return jsonResponse({ error: 'Pergunta é obrigatória.' }, 400);
    }
    if (context.length === 0) {
      return jsonResponse({ error: 'Contexto vazio.' }, 400);
    }

    // Monta o contexto como texto numerado e limita o tamanho total.
    const contextText = context
      .slice(0, 12)
      .map((c: Record<string, unknown>, i: number) =>
        `[${i + 1}] (${c.cat || '?'} · confiança ${c.confidence || '?'} · fonte ${c.source || '?'})\nTítulo: ${c.title || ''}\n${c.text || ''}`)
      .join('\n\n')
      .slice(0, 14000);

    // Diretrizes adicionais curadas (aditivas; a segurança do prompt fixo é piso).
    const extraInstructions = await getActiveInstructions(supabaseAdmin, ['clinical-global', 'library-qa']);
    const systemPromptText = layerSystemPrompt(SYSTEM_PROMPT, extraInstructions);
    // Lições de correção (aprovadas + as da própria autora) sobre as diretrizes.
    const systemText = await withCorrectionLessons(supabaseAdmin, systemPromptText, {
      surface: 'library_qa',
      callerId: caller.user.id,
      relevanceQuery: question,
    });

    const geminiResponse = await vertexGenerateContent(MODEL_ID, {
      systemInstruction: { parts: [{ text: systemText }] },
      contents: [{
        role: 'user',
        parts: [{ text: `CONTEXTO:\n${contextText}\n\nPERGUNTA: ${question.slice(0, 1000)}` }],
      }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: OUTPUT_SCHEMA,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    if (!geminiResponse.ok) {
      console.error('library-qa: Gemini API erro', geminiResponse.status);
      throw new Error('A consulta por IA falhou. Tente novamente em instantes.');
    }

    const geminiData = await geminiResponse.json();
    const out = geminiData?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text || '')
      .join('')
      .trim();
    if (!out) {
      throw new Error('A IA não retornou uma resposta válida.');
    }
    const parsed = JSON.parse(out);

    return jsonResponse({
      modelVersion: MODEL_ID,
      analyzedAt: new Date().toISOString(),
      answer: typeof parsed.answer === 'string' ? parsed.answer : '',
      citations: (Array.isArray(parsed.citations) ? parsed.citations : [])
        .filter((s: unknown) => typeof s === 'string').slice(0, 12),
      insufficient: Boolean(parsed.insufficient),
    });
  } catch (error) {
    console.error('library-qa:', error instanceof Error ? error.message : 'erro');
    return jsonResponse(
      { error: error instanceof Error ? error.message : 'Erro inesperado na consulta.' },
      500,
    );
  }
});
