// ============================================================
// EDGE FUNCTION: analyze-tongue — análise assistiva da língua
// Fase 5 do módulo Língua.
//
// Fluxo:
//  1. Valida o JWT do terapeuta (getCallerProfile);
//  2. Confere que o paciente pertence ao terapeuta;
//  3. Confere que os caminhos das fotos estão na pasta do terapeuta
//     (mesma regra do RLS do bucket clinical-tongue-photos);
//  4. Baixa as fotos do bucket privado (service role);
//  5. Envia ao Gemini (visão) com saída estruturada: o schema
//     restringe as tags às do tongueAiTagMap do frontend — a IA
//     não consegue inventar tag fora do contrato;
//  6. Devolve o JSON no mesmo formato do mock do frontend.
//
// A IA gera ACHADOS para conferência profissional, nunca conduta.
// Auth: Vertex AI (conta de serviço, secret GCP_SERVICE_ACCOUNT_JSON).
// Usa o tier gratuito da Google AI (Gemini API).
// ============================================================

import { encodeBase64 } from 'jsr:@std/encoding/base64';
import {
  corsHeaders,
  createServiceClient,
  getCallerProfile,
  jsonResponse,
} from '../_shared/security.ts';
import { vertexGenerateContent, isVertexConfigured } from '../_shared/vertex.ts';

const MODEL_ID = 'gemini-2.5-flash';
const BUCKET = 'clinical-tongue-photos';

// Mantenha em sincronia com tongueAiTagMap em
// frontend/src/data/tongueData.js — há teste de regressão cobrando isso.
const ALLOWED_TAGS = [
  'swollen_center', 'teeth_marks', 'thick_center_coating', 'greasy_coating',
  'pale_center', 'central_cracks',
  'red_tip', 'red_dots_tip', 'pale_tip', 'central_crack_to_tip',
  'red_sides', 'purple_sides', 'swollen_sides', 'red_dots_sides',
  'pale_anterior', 'white_anterior_coating', 'dry_anterior',
  'no_root_coating', 'thick_root_coating', 'wet_root',
  'yellow_posterior_coating', 'greasy_posterior_coating',
  'distended_sublingual_veins', 'purple_sublingual_veins',
  'tortuous_sublingual_veins', 'sublingual_petechiae',
];

const SUBLINGUAL_TAGS = ALLOWED_TAGS.filter((t) => t.includes('sublingual'));

// Schema no formato do Gemini (responseSchema): tipos em MAIÚSCULAS,
// `nullable` em vez de anyOf, sem additionalProperties.
const OUTPUT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    findings: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          id: { type: 'STRING', description: 'identificador curto em snake_case' },
          title: { type: 'STRING', description: 'título curto do achado, em pt-BR' },
          pattern: { type: 'STRING', description: 'padrão energético MTC sugerido, em pt-BR' },
          confidence: { type: 'NUMBER', description: 'confiança estimada entre 0 e 1, calibrada de forma conservadora' },
          type: { type: 'STRING', enum: ['color', 'coating', 'shape', 'moisture', 'sublingual'] },
          explanation: { type: 'STRING', description: 'justificativa clínica curta em pt-BR (1-2 frases)' },
          suggestedTags: {
            type: 'ARRAY',
            items: { type: 'STRING', enum: ALLOWED_TAGS },
            description: 'tags do checklist correspondentes ao achado',
          },
        },
        required: ['id', 'title', 'pattern', 'confidence', 'type', 'explanation', 'suggestedTags'],
      },
    },
    warning: {
      type: 'STRING',
      nullable: true,
      description: 'aviso sobre qualidade/conteúdo da imagem, ou null',
    },
  },
  required: ['findings', 'warning'],
} as const;

const SYSTEM_PROMPT = `Você é um assistente de inspeção de língua segundo a Medicina Tradicional Chinesa (MTC), integrado a um prontuário clínico usado por acupunturistas no Brasil.

Sua função é gerar ACHADOS OBSERVACIONAIS para conferência profissional — nunca diagnóstico definitivo, tratamento, prescrição ou conduta. Toda sugestão será revisada e confirmada (ou descartada) por uma acupunturista antes de entrar no raciocínio clínico.

Regras:
- Analise apenas o que é visível nas fotos: cor do corpo da língua, saburra (cor/espessura/distribuição), forma (inchaço, marcas dentárias, fissuras), umidade e, na foto sublingual, as veias (dilatação, cor, tortuosidade, petéquias).
- Relacione cada achado às regiões do mapa MTC: ponta = Coração; região anterior = Pulmão; centro = Estômago/Baço; laterais = Fígado/Vesícula; raiz = Rins/Bexiga; posterior = Intestinos.
- Use SOMENTE as tags permitidas pelo schema; só sugira tags sublinguais se houver foto sublingual.
- Confiança conservadora: fotos têm iluminação e balanço de cor variáveis. Use 0.8+ apenas para achados muito evidentes; prefira a faixa 0.4–0.7 na dúvida; não relate achados com confiança abaixo de 0.35.
- Máximo de 5 achados, do mais ao menos relevante. Poucos achados bem fundamentados valem mais que muitos especulativos.
- Se a imagem não for uma língua humana, estiver ilegível, muito escura ou com cor distorcida, retorne findings vazio e explique no campo warning (em pt-BR). Se a qualidade for apenas limitada, preencha warning e relate só o que for visível com segurança.
- Todos os textos em português brasileiro, em linguagem clínica objetiva.`;

function isValidPhotoPath(path: unknown, therapistId: string, patientId: string) {
  if (typeof path !== 'string' || !path) return false;
  if (path.includes('..')) return false;
  if (!path.endsWith('.webp')) return false;
  return path.startsWith(`${therapistId}/${patientId}/`);
}

async function downloadPhotoAsBase64(
  supabaseAdmin: ReturnType<typeof createServiceClient>,
  path: string,
) {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(path);
  if (error || !data) {
    throw new Error(`Não foi possível ler a foto no armazenamento (${path.split('/').pop()}).`);
  }
  return encodeBase64(new Uint8Array(await data.arrayBuffer()));
}

function clampConfidence(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
}

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
    const patientId = String(body.patientId || '').trim();
    const topPath = body.photos?.top;
    const sublingualPath = body.photos?.sublingual || null;

    if (!patientId) {
      return jsonResponse({ error: 'patientId é obrigatório.' }, 400);
    }

    // O paciente precisa pertencer ao terapeuta autenticado
    const { data: patient, error: patientError } = await supabaseAdmin
      .from('patients')
      .select('id')
      .eq('id', patientId)
      .eq('therapist_id', caller.user.id)
      .maybeSingle();
    if (patientError) throw patientError;
    if (!patient) {
      return jsonResponse({ error: 'Paciente não encontrado para este profissional.' }, 403);
    }

    if (!isValidPhotoPath(topPath, caller.user.id, patientId)) {
      return jsonResponse({ error: 'Caminho da foto superior inválido.' }, 400);
    }
    if (sublingualPath !== null && !isValidPhotoPath(sublingualPath, caller.user.id, patientId)) {
      return jsonResponse({ error: 'Caminho da foto sublingual inválido.' }, 400);
    }

    const topBase64 = await downloadPhotoAsBase64(supabaseAdmin, topPath);
    const sublingualBase64 = sublingualPath
      ? await downloadPhotoAsBase64(supabaseAdmin, sublingualPath)
      : null;

    // Partes da mensagem no formato do Gemini (texto + imagens inline)
    const parts: Array<Record<string, unknown>> = [
      { text: 'Foto 1 — face superior (dorso) da língua:' },
      { inlineData: { mimeType: 'image/webp', data: topBase64 } },
    ];
    if (sublingualBase64) {
      parts.push(
        { text: 'Foto 2 — face inferior (sublingual) da língua:' },
        { inlineData: { mimeType: 'image/webp', data: sublingualBase64 } },
      );
    }
    parts.push({
      text: sublingualBase64
        ? 'Analise as duas fotos e gere os achados estruturados para conferência profissional.'
        : 'Analise a foto e gere os achados estruturados para conferência profissional. NÃO sugira tags sublinguais (não há foto sublingual).',
    });

    const geminiResponse = await vertexGenerateContent(MODEL_ID, {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts }],
      generationConfig: {
        temperature: 0.4,
        responseMimeType: 'application/json',
        responseSchema: OUTPUT_SCHEMA,
      },
    });

    if (!geminiResponse.ok) {
      const errBody = await geminiResponse.text().catch(() => '');
      console.error('Gemini API erro:', geminiResponse.status, errBody);
      throw new Error('A análise por IA falhou. Tente novamente em instantes.');
    }

    const geminiData = await geminiResponse.json();
    const text = geminiData?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text || '')
      .join('')
      .trim();
    if (!text) {
      throw new Error('A IA não retornou uma análise válida.');
    }
    const parsed = JSON.parse(text);

    // Saneamento defensivo (o schema já restringe, mas a confiança é número livre)
    const findings = (Array.isArray(parsed.findings) ? parsed.findings : [])
      .slice(0, 5)
      .map((f: Record<string, unknown>) => ({
        ...f,
        confidence: clampConfidence(f.confidence),
        suggestedTags: (Array.isArray(f.suggestedTags) ? f.suggestedTags : [])
          .filter((tag: unknown) => ALLOWED_TAGS.includes(String(tag)))
          .filter((tag: string) => sublingualBase64 || !SUBLINGUAL_TAGS.includes(tag)),
      }))
      .filter((f: { suggestedTags: string[] }) => f.suggestedTags.length > 0 || parsed.findings.length === 0);

    return jsonResponse({
      modelVersion: MODEL_ID,
      analyzedAt: new Date().toISOString(),
      findings,
      warning: typeof parsed.warning === 'string' && parsed.warning ? parsed.warning : null,
    });
  } catch (error) {
    console.error('analyze-tongue:', error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : 'Erro inesperado na análise.' },
      500,
    );
  }
});
