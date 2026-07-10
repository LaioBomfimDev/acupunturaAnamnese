// ============================================================
// EDGE FUNCTION: psych-suggest-marks — anamnese de Psicologia
// (texto) → sugestões de marcação do vocabulário psi.
// Fase 5 do plano multidisciplinar (workspace de Psicologia).
//
// Mesmo desenho da suggest-marks (MTC):
//  1. Valida o JWT do profissional (getCallerProfile);
//  2. Recebe o texto JÁ ANONIMIZADO pelo cliente;
//  3. Gemini flash com saída estruturada: o schema restringe as
//     marcações ao CATÁLOGO espelhado de psychologyAnamnese.js —
//     a IA não inventa item fora do contrato;
//  4. Devolve sugestões {group, item, confidence, rationale}.
//
// A IA SUGERE para conferência; só o que a profissional aceitar
// entra no checklist. RISCO (psiRisco) tem prioridade deliberada.
// Nunca diagnóstico (CID/DSM) nem conduta.
// Auth: Vertex AI (conta de serviço). NÃO logar texto do paciente.
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

// Catálogo de marcações sugeríveis — MANTENHA EM SINCRONIA com
// `psychologyAnamnese.js` (psychologyChecklists + psychologyRiskChecklist;
// psiSono espelha checklists.sono da MTC). Teste de regressão:
// tests/regression/psychology-ai.test.mjs.
const CATALOG: Record<string, string[]> = {
  psiHumor: [
    'Tristeza persistente', 'Apatia / desânimo', 'Perda de prazer (anedonia)',
    'Oscilações de humor', 'Irritabilidade', 'Choro frequente',
    'Culpa excessiva', 'Baixa autoestima',
  ],
  psiAnsiedade: [
    'Preocupação excessiva', 'Sintomas físicos (taquicardia, sudorese)',
    'Inquietação', 'Evitação de situações', 'Crises de pânico',
    'Medos específicos', 'Tensão constante',
  ],
  psiSono: [
    'Dificuldade para iniciar sono', 'Despertares frequentes', 'Acorda entre 1h-3h',
    'Acorda entre 3h-5h', 'Sonhos intensos', 'Pesadelos', 'Sudorese noturna',
    'Bruxismo', 'Sono não reparador', 'Sonolência diurna',
  ],
  psiFuncionamento: [
    'Prejuízo no trabalho/estudo', 'Prejuízo nas relações',
    'Isolamento social', 'Autocuidado prejudicado',
    'Alteração de apetite', 'Queda de energia',
  ],
  psiSubstancias: [
    'Álcool', 'Tabaco', 'Cafeína em excesso', 'Maconha',
    'Outras substâncias', 'Uso aumentou recentemente',
  ],
  psiRisco: [
    'Ideação suicida',
    'Planejamento ou tentativa prévia',
    'Autolesão',
    'Risco a terceiros',
    'Sinais de crise aguda',
    'Suspeita de violência ou negligência sofrida',
  ],
};

// Itens não contêm ':' — chave composta "grupo:item" é separável no 1º ':'.
const ALLOWED_KEYS = Object.entries(CATALOG).flatMap(
  ([group, items]) => items.map((item) => `${group}:${item}`),
);
const ALLOWED_KEY_SET = new Set(ALLOWED_KEYS);

const OUTPUT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    suggestions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          key: {
            type: 'STRING',
            enum: ALLOWED_KEYS,
            description: 'marcação no formato "grupo:item", exatamente como no catálogo',
          },
          confidence: {
            type: 'NUMBER',
            description: 'confiança entre 0 e 1, conservadora',
          },
          rationale: {
            type: 'STRING',
            description: 'trecho/sinal do texto que justifica, em pt-BR (curto)',
          },
        },
        required: ['key', 'confidence', 'rationale'],
      },
    },
    warning: {
      type: 'STRING',
      nullable: true,
      description: 'aviso sobre o texto (ex.: vazio, ambíguo) ou null',
    },
  },
  required: ['suggestions', 'warning'],
} as const;

const SYSTEM_PROMPT = `Você é um assistente de anamnese para psicólogas clínicas no Brasil.

Sua tarefa: ler o texto livre da anamnese de psicologia (demanda, história, saúde mental, rede de apoio, observações da sessão) e SUGERIR quais itens do checklist marcar. Os itens são fechados — você só pode escolher chaves do catálogo fornecido pelo schema (campo "key", formato "grupo:item").

Regras:
- Sugira APENAS o que o texto sustenta. Não produza diagnóstico psicológico ou psiquiátrico (CID/DSM), não interprete conteúdo e não sugira conduta — isso é papel da profissional.
- Cada sugestão precisa de justificativa curta citando o sinal do texto (campo "rationale").
- Confiança conservadora: 0.8+ só quando o texto afirma o item claramente; 0.4–0.7 quando é provável mas indireto; não sugira abaixo de 0.35.
- EXCEÇÃO DELIBERADA — RISCO (grupo "psiRisco": ideação suicida, planejamento/tentativa, autolesão, risco a terceiros, crise aguda, violência/negligência sofrida): na dúvida razoável, PREFIRA sugerir para o olhar humano conferir, e liste essas sugestões PRIMEIRO. É melhor um alerta a mais do que um risco não visto.
- Não presuma nada a partir de gênero, idade ou profissão — apenas o que o texto afirma.
- Não repita a mesma chave. Máximo de 12 sugestões, das mais às menos relevantes.
- O texto pode vir com identificadores mascarados ([NOME], [DATA], [CPF] etc.) — ignore-os, são esperados.
- Se o texto estiver vazio ou sem conteúdo clínico aproveitável, retorne suggestions vazio e explique em warning (pt-BR).`;

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
      return await runAiSmokeCheck({ functionName: 'psych-suggest-marks', modelId: MODEL_ID });
    }

    if (!isVertexConfigured()) {
      return jsonResponse({ error: 'Análise por IA não configurada no servidor (conta de serviço ausente).' }, 503);
    }

    const text = String(body.text || '').trim();
    if (!text) {
      return jsonResponse({ error: 'Texto da anamnese é obrigatório.' }, 400);
    }
    // Teto defensivo: anamnese não deveria passar de alguns milhares de chars.
    const clippedText = text.slice(0, 8000);

    const systemText = await withCorrectionLessons(supabaseAdmin, SYSTEM_PROMPT, {
      surface: 'psych_marks',
      callerId: caller.user.id,
      relevanceQuery: clippedText,
    });

    const geminiResponse = await vertexGenerateContent(MODEL_ID, {
      systemInstruction: { parts: [{ text: systemText }] },
      contents: [{
        role: 'user',
        parts: [{ text: `Texto da anamnese de psicologia:\n"""\n${clippedText}\n"""\n\nSugira as marcações do checklist sustentadas por este texto (risco primeiro, se houver).` }],
      }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: OUTPUT_SCHEMA,
        // Tarefa simples e barata — sem raciocínio estendido.
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    if (!geminiResponse.ok) {
      // Não inclui o corpo da requisição (texto do paciente) no log.
      console.error('psych-suggest-marks: Gemini API erro', geminiResponse.status);
      throw new Error('A sugestão por IA falhou. Tente novamente em instantes.');
    }

    const geminiData = await geminiResponse.json();
    const out = geminiData?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text || '')
      .join('')
      .trim();
    if (!out) {
      throw new Error('A IA não retornou uma sugestão válida.');
    }
    const parsed = JSON.parse(out);

    // Saneamento: valida chave contra o catálogo, dedup, clamp, separa
    // grupo/item e garante o risco no topo independente do modelo.
    const seen = new Set<string>();
    const suggestions = (Array.isArray(parsed.suggestions) ? parsed.suggestions : [])
      .filter((s: { key?: string }) => typeof s.key === 'string' && ALLOWED_KEY_SET.has(s.key))
      .filter((s: { key: string }) => (seen.has(s.key) ? false : (seen.add(s.key), true)))
      .slice(0, 12)
      .map((s: { key: string; confidence: unknown; rationale?: string }) => {
        const idx = s.key.indexOf(':');
        return {
          group: s.key.slice(0, idx),
          item: s.key.slice(idx + 1),
          confidence: clampConfidence(s.confidence),
          rationale: typeof s.rationale === 'string' ? s.rationale : '',
        };
      })
      .sort((a: { group: string }, b: { group: string }) =>
        Number(b.group === 'psiRisco') - Number(a.group === 'psiRisco'));

    return jsonResponse({
      modelVersion: MODEL_ID,
      analyzedAt: new Date().toISOString(),
      suggestions,
      warning: typeof parsed.warning === 'string' && parsed.warning ? parsed.warning : null,
    });
  } catch (error) {
    // Mensagem genérica no log — nunca o conteúdo clínico.
    console.error('psych-suggest-marks:', error instanceof Error ? error.message : 'erro');
    return jsonResponse(
      { error: error instanceof Error ? error.message : 'Erro inesperado na sugestão.' },
      500,
    );
  }
});
