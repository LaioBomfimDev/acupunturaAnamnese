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
  assertSuperAdmin,
  corsHeaders,
  createServiceClient,
  getCallerProfile,
  jsonResponse,
} from '../_shared/security.ts';
import { vertexGenerateContent, isVertexConfigured } from '../_shared/vertex.ts';
import { withCorrectionLessons } from '../_shared/corrections.ts';
import { isDeployHealthSmoke, runAiSmokeCheck } from '../_shared/aiSmoke.ts';

const MODEL_ID = 'gemini-2.5-flash';

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
      return await runAiSmokeCheck({ functionName: 'draft-narrative', modelId: MODEL_ID });
    }

    if (!isVertexConfigured()) {
      return jsonResponse({ error: 'Análise por IA não configurada no servidor (conta de serviço ausente).' }, 503);
    }

    const kind = body.kind;
    const payload = body.payload;
    if (kind !== 'report' && kind !== 'evolution') {
      return jsonResponse({ error: 'kind inválido.' }, 400);
    }
    if (!payload || typeof payload !== 'object') {
      return jsonResponse({ error: 'Dados ausentes.' }, 400);
    }

    const baseSystemPrompt = kind === 'report'
      ? buildReportPrompt(String(body.mode || 'Resumo clínico'))
      : EVOLUTION_PROMPT;
    const payloadText = JSON.stringify(payload).slice(0, 14000);
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
      console.error('draft-narrative: Gemini API erro', geminiResponse.status);
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
    console.error('draft-narrative:', error instanceof Error ? error.message : 'erro');
    return jsonResponse(
      { error: error instanceof Error ? error.message : 'Erro inesperado na geração.' },
      500,
    );
  }
});
