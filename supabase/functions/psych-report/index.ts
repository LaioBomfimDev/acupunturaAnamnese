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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Método não permitido.' }, 405);

  try {
    const supabaseAdmin = createServiceClient();
    const caller = await getCallerProfile(req, supabaseAdmin);
    if ('error' in caller) return jsonResponse({ error: caller.error }, caller.status);
    if (caller.profile.is_active !== true) return jsonResponse({ error: 'Usuário suspenso.' }, 403);

    const body = await req.json().catch(() => ({}));
    if (isDeployHealthSmoke(body)) {
      if (!assertSuperAdmin(caller.profile)) return jsonResponse({ error: 'Acesso restrito ao SuperAdm ativo.' }, 403);
      return await runAiSmokeCheck({ functionName: 'psych-report', modelId: MODEL_ID });
    }
    if (!isVertexConfigured()) {
      return jsonResponse({ error: 'Geração por IA não configurada no servidor.' }, 503);
    }
    if (body.kind !== 'avaliacao_neuropsicologica' || !body.case || typeof body.case !== 'object') {
      return jsonResponse({ error: 'Dados estruturados da avaliação ausentes.' }, 400);
    }

    const caseText = JSON.stringify(body.case).slice(0, 24000);
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
      console.error('psych-report: Gemini API erro', response.status);
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
    console.error('psych-report:', error instanceof Error ? error.message : 'erro');
    return jsonResponse({ error: error instanceof Error ? error.message : 'Erro inesperado.' }, 500);
  }
});
