// ============================================================
// SERVICE: Análise de língua assistida por IA
// Contrato único entre a UI e o motor de análise.
//
// `analyzeTongueImages` decide a implementação:
//  * usuário local (login fallback, sem Supabase real) → MOCK;
//  * usuário real → Edge Function `analyze-tongue`, que valida
//    terapeuta/paciente, baixa as fotos do bucket privado e chama
//    o modelo de visão (Claude) com saída estruturada.
// A chave da API vive em secret do Supabase — nunca no frontend.
//
// Formato de resposta (mock e real são idênticos):
// {
//   modelVersion: string,
//   analyzedAt: ISO string,
//   warning: string|null,        // qualidade/conteúdo da imagem
//   findings: [{
//     id: string,                 // identificador único do achado
//     title: string,              // ex.: "Língua inchada"
//     pattern: string,            // padrão energético sugerido
//     confidence: number,         // 0..1
//     type: 'color'|'coating'|'shape'|'moisture'|'sublingual',
//     explanation: string,        // justificativa curta
//     suggestedTags: string[],    // tags estáveis → tongueAiTagMap
//   }]
// }
// A IA gera ACHADOS para revisão, nunca conduta final.
// ============================================================

import { supabase, getAuthenticatedUser } from '../lib/supabase';

export const TONGUE_AI_MOCK_VERSION = 'mock-0.1';

export const TONGUE_AI_DISCLAIMER =
  'A análise é assistiva. Apenas achados confirmados pela profissional entram no raciocínio clínico.';

// Faixas de confiança: comunicamos faixa + inteiro arredondado,
// nunca decimais — precisão decimal transmite falsa certeza clínica.
export function confidenceBand(confidence) {
  if (confidence >= 0.8) return { label: 'alta', level: 'high' };
  if (confidence >= 0.6) return { label: 'média', level: 'medium' };
  return { label: 'baixa', level: 'low' };
}

const MOCK_TOP_FINDINGS = [
  {
    id: 'swollen_tongue_qi_def',
    title: 'Língua inchada com marcas dentárias',
    pattern: 'Deficiência de Qi do Baço · Umidade',
    confidence: 0.86,
    type: 'shape',
    explanation:
      'Inchaço central com marcas dentárias nas bordas sugere fraqueza do Qi do Baço com acúmulo de umidade.',
    suggestedTags: ['swollen_center', 'teeth_marks'],
  },
  {
    id: 'red_tip_heart_heat',
    title: 'Ponta avermelhada',
    pattern: 'Calor no Coração · Shen agitado',
    confidence: 0.72,
    type: 'color',
    explanation:
      'Ponta mais vermelha que o corpo da língua costuma indicar calor no Coração, com possível agitação do Shen (sono, ansiedade).',
    suggestedTags: ['red_tip', 'red_dots_tip'],
  },
  {
    id: 'greasy_center_coating',
    title: 'Saburra gordurosa no centro',
    pattern: 'Umidade-Fleuma no Aquecedor Médio',
    confidence: 0.55,
    type: 'coating',
    explanation:
      'Saburra espessa e gordurosa na região central sugere umidade-fleuma comprometendo a digestão.',
    suggestedTags: ['thick_center_coating', 'greasy_coating'],
  },
];

const MOCK_SUBLINGUAL_FINDINGS = [
  {
    id: 'sublingual_stasis',
    title: 'Veias sublinguais dilatadas e escuras',
    pattern: 'Estase de Xue',
    confidence: 0.81,
    type: 'sublingual',
    explanation:
      'Veias sublinguais dilatadas e arroxeadas são sinal clássico de estagnação de sangue (Xue).',
    suggestedTags: ['distended_sublingual_veins', 'purple_sublingual_veins'],
  },
];

/**
 * Implementação simulada (usada no login local e nos testes).
 * Retorna achados fixos após um atraso curto; a presença da foto
 * sublingual habilita os achados de estase.
 */
export function mockAnalyzeTongueImages(photos) {
  if (!photos?.top) {
    return Promise.reject(new Error('É necessária a foto superior da língua para analisar.'));
  }

  const findings = [
    ...MOCK_TOP_FINDINGS,
    ...(photos.sublingual ? MOCK_SUBLINGUAL_FINDINGS : []),
  ].map(f => ({ ...f, suggestedTags: [...f.suggestedTags] }));

  return new Promise(resolve => {
    setTimeout(() => {
      resolve({
        modelVersion: TONGUE_AI_MOCK_VERSION,
        analyzedAt: new Date().toISOString(),
        warning: null,
        findings,
      });
    }, 1200);
  });
}


// Extrai a mensagem de erro do corpo da resposta da Edge Function
async function functionErrorMessage(error, fallback) {
  if (typeof error?.context?.json === 'function') {
    try {
      const body = await error.context.json();
      if (body?.error) return body.error;
    } catch { /* corpo não-JSON — usa fallback */ }
  }
  return error?.message || fallback;
}

/**
 * Analisa as fotos da língua e retorna achados estruturados para revisão.
 *
 * Usuário local (login fallback) → análise simulada (mock).
 * Usuário real → Edge Function `analyze-tongue` (Gemini Vision).
 * Se a função estiver indisponível ou sem chave, cai no mock com aviso.
 *
 * @param {{ top: object, sublingual?: object|null }} photos - fotos do estado tongueAi
 * @param {{ patientId?: string }} [context]
 * @returns {Promise<{ modelVersion, analyzedAt, warning, findings }>}
 */
export async function analyzeTongueImages(photos, context = {}) {
  if (!photos?.top) {
    throw new Error('É necessária a foto superior da língua para analisar.');
  }

  const user = await getAuthenticatedUser();

  // Login local: sem Storage nem Edge Function — análise simulada
  if (user?._isLocal) {
    return mockAnalyzeTongueImages(photos);
  }

  if (!photos.top.path) {
    throw new Error('Aguarde o envio da foto ao armazenamento seguro antes de analisar.');
  }
  if (!context.patientId) {
    throw new Error('Paciente não identificado para a análise.');
  }

  const { data, error } = await supabase.functions.invoke('analyze-tongue', {
    body: {
      patientId: context.patientId,
      photos: {
        top: photos.top.path,
        sublingual: photos.sublingual?.path || null,
      },
    },
  });

  if (error) {
    const msg = await functionErrorMessage(error, '');
    // Cai no mock quando a IA não está configurada ou a função está indisponível
    const isMockable =
      !msg ||
      msg.includes('Failed to send') ||
      msg.includes('fetch') ||
      msg.includes('not found') ||
      msg.includes('GEMINI_API_KEY') ||
      msg.includes('não configurada');
    if (isMockable) {
      const result = await mockAnalyzeTongueImages(photos);
      return {
        ...result,
        warning: 'Análise simulada — a IA por imagem ainda não está ativa neste servidor. Os achados abaixo são exemplos fixos para demonstração.',
      };
    }
    throw new Error(msg || 'Falha ao analisar as imagens.');
  }
  if (!data || !Array.isArray(data.findings)) {
    throw new Error('A análise retornou um formato inesperado.');
  }
  return data;
}
