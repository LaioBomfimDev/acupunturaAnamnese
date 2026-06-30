import { jsonResponse } from './security.ts';
import { getLocation, isVertexConfigured, vertexGenerateContent } from './vertex.ts';

export const AI_SMOKE_PURPOSE = 'deploy-health';

const SMOKE_MARKER = 'sistema-acup-ai-smoke-ok';

const SMOKE_OUTPUT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    status: {
      type: 'STRING',
      enum: ['operacional'],
      description: 'status fixo do smoke tecnico',
    },
    marker: {
      type: 'STRING',
      description: 'marcador tecnico recebido no prompt',
    },
    note: {
      type: 'STRING',
      description: 'frase curta em pt-BR, sem conteudo clinico',
    },
  },
  required: ['status', 'marker', 'note'],
} as const;

export function isDeployHealthSmoke(body: unknown) {
  const record = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  return record.purpose === AI_SMOKE_PURPOSE && record.smoke === true;
}

function sanitizeSmokeError(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (/GCP_SERVICE_ACCOUNT_JSON ausente/i.test(message)) {
    return 'IA não configurada no servidor (conta de serviço Vertex ausente).';
  }
  if (/Conta de serviço inválida/i.test(message)) {
    return 'Conta de serviço Vertex inválida ou incompleta.';
  }
  if (/Falha ao autenticar na Vertex AI/i.test(message)) {
    return 'Falha ao autenticar na Vertex AI.';
  }
  return 'Smoke real da IA falhou na Vertex AI.';
}

export async function runAiSmokeCheck({
  functionName,
  modelId,
}: {
  functionName: string;
  modelId: string;
}) {
  if (!isVertexConfigured()) {
    return jsonResponse({ error: 'IA não configurada no servidor (conta de serviço Vertex ausente).' }, 503);
  }

  try {
    const vertexResponse = await vertexGenerateContent(modelId, {
      systemInstruction: {
        parts: [{
          text: 'Você executa somente smoke tests técnicos do Sistema Acup. Não gere conteúdo clínico, diagnóstico, conduta, prescrição ou dados simulados de paciente. Responda apenas o JSON solicitado.',
        }],
      },
      contents: [{
        role: 'user',
        parts: [{
          text: `Smoke técnico da Edge Function ${functionName}. Retorne status="operacional", marker="${SMOKE_MARKER}" e uma note curta dizendo que o probe técnico respondeu.`,
        }],
      }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 96,
        responseMimeType: 'application/json',
        responseSchema: SMOKE_OUTPUT_SCHEMA,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    if (!vertexResponse.ok) {
      console.error(`${functionName}: Vertex smoke erro`, vertexResponse.status);
      return jsonResponse({ error: 'Vertex AI respondeu erro no smoke real.' }, 503);
    }

    const vertexData = await vertexResponse.json();
    const out = vertexData?.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text || '')
      .join('')
      .trim();
    const parsed = out ? JSON.parse(out) : null;

    if (parsed?.status !== 'operacional' || parsed?.marker !== SMOKE_MARKER) {
      return jsonResponse({ error: 'A Vertex respondeu, mas o payload de smoke veio inválido.' }, 502);
    }

    return jsonResponse({
      ok: true,
      purpose: AI_SMOKE_PURPOSE,
      functionName,
      modelVersion: modelId,
      checkedAt: new Date().toISOString(),
      vertex: {
        configured: true,
        location: getLocation(),
      },
      smoke: {
        realVertexCall: true,
        mockAllowed: false,
      },
    });
  } catch (error) {
    console.error(`${functionName}: smoke`, error instanceof Error ? error.message : 'erro');
    return jsonResponse({ error: sanitizeSmokeError(error) }, 503);
  }
}
