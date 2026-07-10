// ============================================================
// EDGE FUNCTION: food-research — pesquisa educativa de alimento/planta (IA)
// Aba de Dietoterapia (ver docs/plano-dietoterapia.md).
//
// Diferente de library-qa (que responde ANCORADO na base curada), aqui a
// profissional pede à IA uma PESQUISA por TÓPICOS FIXOS sobre um alimento
// ou planta específica. Não é prompt genérico ("fale sobre X"): cada MODO
// tem um roteiro de tópicos obrigatórios (visão medicinal, receitas, leitura
// MTC, segurança). O modelo usa conhecimento geral, mas dentro de trilhos
// de segurança rígidos: educativo, sem diagnóstico/prescrição, sem promessa
// de cura, rotulando o nível de evidência e admitindo incerteza.
//
// A leitura curada da MTC do próprio sistema (natureza, sabor, sistemas,
// cautela) vai junto como contexto — é a "fonte da casa"; a pesquisa externa
// é apoio de estudo e precisa de conferência profissional. Sem dado de
// paciente. Gemini flash, sem thinking. Auth: Vertex AI (conta de serviço).
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

// Roteiro de tópicos por modo. O prompt vive no SERVIDOR (o cliente só manda
// o id do modo) — assim o roteiro de segurança não pode ser contornado pela UI.
const MODES: Record<string, { label: string; topics: string }> = {
  visao_geral: {
    label: 'Visão geral medicinal',
    topics: `Organize a resposta em seções, uma por tópico, nesta ordem:
1. Nome comum e nome científico (se aplicável).
2. Principais compostos ativos conhecidos.
3. Usos tradicionais em diferentes culturas.
4. Possíveis benefícios estudados pela ciência.
5. Diferença entre uso popular, uso tradicional e evidência científica.
6. Riscos, contraindicações e possíveis interações com medicamentos.
7. Formas comuns de uso: chá, infusão, decocção, alimento, extrato, pó etc.
8. Cuidados para uso seguro.`,
  },
  receitas: {
    label: 'Receitas tradicionais e funcionais',
    topics: `Traga receitas tradicionais, funcionais ou fitoterápicas envolvendo o alimento/planta.
Se um OBJETIVO for informado (ex.: digestão, sono, energia, imunidade, tosse, ansiedade, circulação), priorize receitas ligadas a ele.
Para CADA receita, crie uma seção cujo "heading" é o nome da receita e cujo "body" traz, em linhas rotuladas:
- Ingredientes.
- Forma de preparo.
- Finalidade tradicional.
- Base cultural ou sistema de origem, se conhecido.
- Cuidados, contraindicações e interações possíveis.
- Se é mais culinária, tradicional ou medicinal.
- Nível de evidência: tradicional, preliminar ou bem estudado.
Traga de 3 a 5 receitas. Evite prometer cura ou resultado garantido.`,
  },
  mtc: {
    label: 'Leitura energética (MTC)',
    topics: `Aprofunde a leitura tradicional da Medicina Tradicional Chinesa para este alimento/planta.
Use a leitura curada da casa (fornecida no CONTEXTO) como âncora e sinalize se a literatura clássica diverge.
Organize em seções nesta ordem:
1. Natureza térmica (quente/morna/neutra/fresca/fria) e o que isso significa no uso.
2. Sabor(es) e a ação tradicional de cada sabor.
3. Tropismo — sistemas funcionais (Órgãos-Vísceras) e meridianos afins.
4. Ações e indicações tradicionais na MTC (sem prometer cura).
5. Movimento (ascender/descender, exteriorizar/interiorizar) e estação/clima favoráveis.
6. Combinações clássicas com outros alimentos e sinais de excesso ou desequilíbrio a observar.
Deixe claro que são associações tradicionais da MTC, não diagnóstico biomédico.`,
  },
  seguranca: {
    label: 'Segurança, contraindicações e interações',
    topics: `Foco em uso seguro. Organize em seções nesta ordem:
1. Populações que exigem cautela (gestação, lactação, crianças, idosos, doença renal/hepática etc.).
2. Contraindicações conhecidas.
3. Interações possíveis com medicamentos (ex.: anticoagulantes, anti-hipertensivos, hipoglicemiantes) — descreva o mecanismo quando conhecido.
4. Faixa de uso tradicional versus uso concentrado/terapêutico e por que a diferença importa.
5. Sinais de alerta e efeitos adversos relatados.
6. Quando encaminhar a avaliação médica/nutricional antes de usar.
Rotule cada afirmação pelo nível de evidência e diga quando a informação é incerta.`,
  },
};

const OUTPUT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    sections: {
      type: 'ARRAY',
      description: 'seções da pesquisa, uma por tópico do roteiro do modo',
      items: {
        type: 'OBJECT',
        properties: {
          heading: { type: 'STRING', description: 'título curto do tópico' },
          body: { type: 'STRING', description: 'texto do tópico em pt-BR' },
        },
        required: ['heading', 'body'],
      },
    },
    evidenceNote: {
      type: 'STRING',
      description: 'síntese do nível de evidência (tradicional / preliminar / bem estudado)',
    },
    safety: {
      type: 'STRING',
      description: 'cuidados, contraindicações e quando procurar profissional',
    },
    insufficient: {
      type: 'BOOLEAN',
      description: 'true se não há informação confiável suficiente sobre o item',
    },
  },
  required: ['sections', 'evidenceNote', 'safety', 'insufficient'],
} as const;

const BASE_PROMPT = `Você é um assistente de PESQUISA educativa em dietoterapia e fitoterapia, para uma acupunturista no Brasil que estuda alimentos e plantas. A resposta é material de ESTUDO da profissional, não conteúdo para o paciente.

Trilhos de segurança (inegociáveis):
- NÃO faça diagnóstico, prescrição, dose terapêutica personalizada nem plano alimentar. Isto é educação, não conduta.
- NÃO prometa cura nem resultado garantido. Fale em "uso tradicional", "possível benefício", "estudado em".
- Rotule SEMPRE o nível de evidência de cada afirmação relevante: tradicional, preliminar ou bem estudado. Quando houver incerteza ou os dados forem fracos, diga isso claramente.
- Separe uso popular, uso tradicional (sistema/cultura de origem) e evidência científica — não os misture como se fossem a mesma coisa.
- Sempre que houver risco, contraindicação ou interação medicamentosa plausível, sinalize e recomende conferência profissional (médica/nutricional/farmacêutica).
- Português brasileiro, objetivo. Preencha o campo "sections" seguindo EXATAMENTE o roteiro de tópicos do modo pedido; não responda em prosa genérica. Use "evidenceNote" para a síntese de evidência e "safety" para os cuidados. Se não houver informação confiável sobre o item, marque insufficient=true e explique.
- O CONTEXTO traz a leitura curada da casa (MTC); trate-a como âncora da leitura tradicional, mas o restante é pesquisa externa que a profissional ainda precisa conferir.`;

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
      return await runAiSmokeCheck({ functionName: 'food-research', modelId: MODEL_ID });
    }

    if (!isVertexConfigured()) {
      return jsonResponse({ error: 'Análise por IA não configurada no servidor (conta de serviço ausente).' }, 503);
    }

    const modeId = String(body.mode || '').trim();
    const mode = MODES[modeId];
    if (!mode) {
      return jsonResponse({ error: 'Modo de pesquisa inválido.' }, 400);
    }

    const food = (body.food && typeof body.food === 'object') ? body.food : {};
    const foodName = String(food.commonName || body.name || '').trim();
    if (!foodName) {
      return jsonResponse({ error: 'Informe o alimento ou planta.' }, 400);
    }
    const objective = String(body.objective || '').trim().slice(0, 200);

    // Contexto: a leitura curada da MTC do próprio sistema, como âncora.
    const contextLines = [
      `Alimento/planta: ${foodName}`,
      food.energyLabel ? `Natureza (curada, MTC): ${food.energyLabel}` : '',
      Array.isArray(food.flavors) && food.flavors.length ? `Sabores (curados): ${food.flavors.join(', ')}` : '',
      Array.isArray(food.organs) && food.organs.length ? `Sistemas funcionais (curados): ${food.organs.join(', ')}` : '',
      food.tradition ? `Leitura tradicional da casa: ${food.tradition}` : '',
      food.caution ? `Cautela registrada: ${food.caution}` : '',
    ].filter(Boolean).join('\n').slice(0, 4000);

    const modePrompt = `MODO: ${mode.label}\n${mode.topics}`;

    // Diretrizes adicionais curadas (aditivas; a segurança do prompt fixo é piso).
    const extraInstructions = await getActiveInstructions(supabaseAdmin, ['clinical-global', 'food-research']);
    const systemPromptText = layerSystemPrompt(`${BASE_PROMPT}\n\n${modePrompt}`, extraInstructions);
    const systemText = await withCorrectionLessons(supabaseAdmin, systemPromptText, {
      surface: 'food_research',
      callerId: caller.user.id,
      relevanceQuery: `${foodName} ${mode.label} ${objective}`,
    });

    const userText = [
      `CONTEXTO (leitura curada da casa):\n${contextLines}`,
      objective ? `OBJETIVO em foco: ${objective}` : '',
      `Faça a pesquisa do modo "${mode.label}" sobre: ${foodName}.`,
    ].filter(Boolean).join('\n\n');

    const geminiResponse = await vertexGenerateContent(MODEL_ID, {
      systemInstruction: { parts: [{ text: systemText }] },
      contents: [{ role: 'user', parts: [{ text: userText }] }],
      generationConfig: {
        temperature: 0.3,
        responseMimeType: 'application/json',
        responseSchema: OUTPUT_SCHEMA,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    if (!geminiResponse.ok) {
      console.error('food-research: Gemini API erro', geminiResponse.status);
      throw new Error('A pesquisa por IA falhou. Tente novamente em instantes.');
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

    const sections = (Array.isArray(parsed.sections) ? parsed.sections : [])
      .filter((s: unknown) => s && typeof s === 'object')
      .map((s: Record<string, unknown>) => ({
        heading: String(s.heading || '').slice(0, 200),
        body: String(s.body || '').slice(0, 4000),
      }))
      .filter((s: { heading: string; body: string }) => s.heading || s.body)
      .slice(0, 12);

    return jsonResponse({
      modelVersion: MODEL_ID,
      analyzedAt: new Date().toISOString(),
      mode: modeId,
      food: foodName,
      sections,
      evidenceNote: typeof parsed.evidenceNote === 'string' ? parsed.evidenceNote : '',
      safety: typeof parsed.safety === 'string' ? parsed.safety : '',
      insufficient: Boolean(parsed.insufficient),
    });
  } catch (error) {
    console.error('food-research:', error instanceof Error ? error.message : 'erro');
    return jsonResponse(
      { error: error instanceof Error ? error.message : 'Erro inesperado na pesquisa.' },
      500,
    );
  }
});
