// ============================================================
// EDGE FUNCTION: suggest-marks — anamnese (texto) → marcações
// Fase 1 da expansão de IA (ver roadmap-ia-expansao).
//
// Fluxo:
//  1. Valida o JWT do terapeuta (getCallerProfile);
//  2. Recebe o texto clínico JÁ ANONIMIZADO pelo cliente
//     (nome/CPF/telefone/datas mascarados antes de sair do browser);
//  3. Envia ao Gemini (flash, SEM thinking — tarefa simples)
//     com saída estruturada: o schema restringe as marcações ao CATÁLOGO
//     espelhado de checklists.js — a IA não inventa item fora do contrato;
//  4. Devolve sugestões {group, item, confidence, rationale} para revisão.
//
// A IA SUGERE marcações para conferência; só o que a profissional aceitar
// entra no checklist. Nunca diagnóstico nem conduta.
// Auth: Vertex AI (conta de serviço). Privacidade: NÃO logar o texto do paciente.
// ============================================================

import {
  corsHeaders,
  createServiceClient,
  getCallerProfile,
  jsonResponse,
} from '../_shared/security.ts';
import { vertexGenerateContent, isVertexConfigured } from '../_shared/vertex.ts';
import { withCorrectionLessons } from '../_shared/corrections.ts';

const MODEL_ID = 'gemini-2.5-flash';

// Catálogo de marcações sugeríveis a partir do texto da anamnese.
// MANTENHA EM SINCRONIA com `checklists.js` (grupos em escopo) — há teste
// de regressão (tests/regression/anamnese-ai.test.mjs) cobrando isso.
// Fora de escopo de propósito: lingua/pulso (exame objetivo, não-texto),
// oito/substancias (conclusões diagnósticas), objetivos/sintomas.
const CATALOG: Record<string, string[]> = {
  queixaEstruturada: [
    'Início súbito', 'Início gradual', 'Quadro crônico', 'Quadro recorrente',
    'Piora progressiva', 'Crises', 'Piora ao estresse', 'Piora após alimentação',
    'Piora à noite', 'Melhora com repouso', 'Melhora com calor', 'Melhora com movimento',
  ],
  historico: [
    'Hipertensão', 'Diabetes', 'Hipotireoidismo', 'Doença autoimune',
    'Doença neurológica', 'Cirurgias', 'Traumas', 'Dor crônica', 'Alergias',
    'Uso hormonal', 'Gestação', 'Menopausa', 'Histórico familiar relevante',
  ],
  substanciasUso: [
    'Álcool', 'Cigarro', 'Cafeína', 'Termogênicos', 'Energéticos', 'Suplementos',
    'Fitoterápicos', 'Medicamentos contínuos', 'Ansiolíticos', 'Antidepressivos',
    'Anticoncepcional', 'Corticoide', 'Anti-inflamatórios',
  ],
  sono: [
    'Dificuldade para iniciar sono', 'Despertares frequentes', 'Acorda entre 1h-3h',
    'Acorda entre 3h-5h', 'Sonhos intensos', 'Pesadelos', 'Sudorese noturna',
    'Bruxismo', 'Sono não reparador', 'Sonolência diurna',
  ],
  digestao: [
    'Fome aumentada', 'Pouca fome', 'Saciedade precoce', 'Compulsão alimentar',
    'Desejo por doce', 'Desejo por salgado', 'Refluxo/azia', 'Gases',
    'Náusea', 'Distensão abdominal', 'Peso após comer',
  ],
  gineco: [
    'TPM', 'Cólicas', 'Ciclo irregular', 'Fluxo intenso', 'Fluxo escasso',
    'Coágulos', 'Endometriose', 'SOP', 'Menopausa', 'Ondas de calor',
    'Baixa libido', 'Uso hormonal', 'Sem queixas ginecológicas/menstruais',
  ],
  urogenital: [
    'Sintomas urinários', 'Jato urinário fraco', 'Aumento da frequência urinária',
    'Urinar à noite', 'Dor pélvica/perineal', 'Alteração erétil',
    'Alteração ejaculatória', 'Baixa libido', 'Fertilidade/planejamento reprodutivo',
    'Uso hormonal', 'Sem queixas urogenitais/sexuais',
  ],
  dor: [
    'Pontada', 'Queimação', 'Peso', 'Pressão', 'Rigidez', 'Dor migratória',
    'Dor fixa', 'Irradiação', 'Formigamento', 'Dormência', 'Melhora com calor',
    'Melhora com frio', 'Piora à pressão', 'Piora ao movimento',
  ],
  clima: [
    'Piora com frio', 'Piora com calor', 'Piora com umidade', 'Piora com vento',
    'Piora com secura', 'Busca calor', 'Busca frio',
  ],
  emocoes: [
    'Raiva/irritabilidade', 'Frustração', 'Preocupação/ruminação', 'Ansiedade/agitação mental',
    'Tristeza', 'Medo/insegurança', 'Apatia/desânimo', 'Oscilações emocionais',
  ],
  fezes: [
    'Tipo 1', 'Tipo 2', 'Tipo 3', 'Tipo 4', 'Tipo 5', 'Tipo 6', 'Tipo 7',
    'Muco', 'Odor forte', 'Evacuação incompleta', 'Constipação', 'Diarreia',
    'Alternância intestinal',
  ],
  seguranca: [
    'Gestação', 'Anticoagulante', 'Marcapasso', 'Epilepsia',
    'Febre/infecção', 'Pressão descompensada', 'Diabetes descompensada',
    'Síncope com agulha', 'Feridas locais', 'Dor torácica sem avaliação',
    'Perda de peso não intencional', 'Desmaio recente', 'Queda recente', 'Trauma recente',
    'Distúrbio de coagulação', 'Histórico de câncer', 'Cirurgia recente',
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

const SYSTEM_PROMPT = `Você é um assistente de anamnese para acupunturistas no Brasil (Medicina Tradicional Chinesa).

Sua tarefa: ler o texto livre da anamnese (queixa, história, observações de sono/digestão/dor, medicações) e SUGERIR quais itens do checklist clínico marcar. Os itens são fechados — você só pode escolher chaves do catálogo fornecido pelo schema (campo "key", formato "grupo:item").

Regras:
- Sugira APENAS o que o texto sustenta diretamente. Não infira diagnóstico nem padrão energético — isso é outra etapa.
- Cada sugestão precisa de uma justificativa curta citando o sinal do texto (campo "rationale").
- Confiança conservadora: 0.8+ só quando o texto afirma o item claramente; 0.4–0.7 quando é provável mas indireto; não sugira abaixo de 0.35.
- Atenção especial a sinais de SEGURANÇA (grupo "seguranca"): gestação, anticoagulante, coagulopatia, marcapasso, epilepsia, febre, pressão/diabetes descompensada, dor torácica, perda de peso não intencional, desmaio, queda, trauma, câncer e cirurgia recente — se o texto indicar, sugira com prioridade.
- Em saúde reprodutiva, menstrual, sexual ou urogenital, sugira somente o que o texto afirmar. Nunca presuma anatomia, ciclo menstrual, identidade ou queixa a partir de sexo/gênero.
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
    const text = String(body.text || '').trim();
    if (!text) {
      return jsonResponse({ error: 'Texto da anamnese é obrigatório.' }, 400);
    }
    // Teto defensivo: anamnese não deveria passar de alguns milhares de chars.
    const clippedText = text.slice(0, 8000);

    const systemText = await withCorrectionLessons(supabaseAdmin, SYSTEM_PROMPT, {
      surface: 'anamnese_marks',
      callerId: caller.user.id,
      relevanceQuery: clippedText,
    });

    const geminiResponse = await vertexGenerateContent(MODEL_ID, {
      systemInstruction: { parts: [{ text: systemText }] },
      contents: [{
        role: 'user',
        parts: [{ text: `Texto da anamnese:\n"""\n${clippedText}\n"""\n\nSugira as marcações do checklist sustentadas por este texto.` }],
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
      console.error('suggest-marks: Gemini API erro', geminiResponse.status);
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

    // Saneamento: valida chave contra o catálogo, dedup, clamp, separa grupo/item.
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
      });

    return jsonResponse({
      modelVersion: MODEL_ID,
      analyzedAt: new Date().toISOString(),
      suggestions,
      warning: typeof parsed.warning === 'string' && parsed.warning ? parsed.warning : null,
    });
  } catch (error) {
    // Mensagem genérica no log — nunca o conteúdo clínico.
    console.error('suggest-marks:', error instanceof Error ? error.message : 'erro');
    return jsonResponse(
      { error: error instanceof Error ? error.message : 'Erro inesperado na sugestão.' },
      500,
    );
  }
});
