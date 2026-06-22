// ============================================================
// SERVICE: Instruções editáveis da IA (camada aditiva sobre o prompt fixo)
//
// SuperAdm lê/edita; a escrita vai pela RPC atômica admin_save_ai_instructions
// (revalida SuperAdm, incrementa versão e grava histórico). As regras de
// segurança e o gate humano NÃO ficam aqui — são piso imutável no código das
// Edge Functions. Ver supabase/migrations/20260619_ai_instructions.sql.
// ============================================================

import { supabase, getAuthenticatedUser } from '../lib/supabase';

export const AI_INSTRUCTIONS_MAX_CHARS = 8000;

// Chaves conhecidas (espelham o seed da migration). A 'clinical-global' entra
// em TODAS as IAs clínicas; as demais refinam uma função específica.
export const AI_INSTRUCTION_KEYS = [
  {
    key: 'clinical-global',
    label: 'Diretrizes gerais (todas as IAs clínicas)',
    help: 'Vale para Biblioteca, Raciocínio Clínico e Inspeção da Língua. Use para tom, vocabulário e limites gerais da clínica.',
  },
  {
    key: 'tongue-analysis',
    label: 'Inspeção da língua',
    help: 'Refina só a análise assistiva das fotos da língua, sem mudar o contrato de tags nem o aceite profissional.',
  },
  {
    key: 'library-qa',
    label: 'Pergunte à Biblioteca',
    help: 'Refina só as respostas da Biblioteca (consulta/estudo ancorada nas fontes).',
  },
  {
    key: 'clinical-reasoning',
    label: 'Raciocínio clínico (IA Assistente)',
    help: 'Refina só o raciocínio assistivo sobre o caso (interpretação, diferencial, red flags).',
  },
];

// ------------------------------------------------------------
// Base fixa (somente leitura). Espelho LITERAL do SYSTEM_PROMPT de cada Edge
// Function — é o piso que a IA já segue antes das diretrizes desta tela.
// Exibido no painel para o SuperAdm ter noção do que já existe. NÃO afeta o
// servidor: se editar aqui, nada muda na IA. Mantenha em sincronia com:
//   supabase/functions/library-qa/index.ts
//   supabase/functions/clinical-reasoning/index.ts
//   supabase/functions/analyze-tongue/index.ts
// ------------------------------------------------------------
const BASE_PROMPT_LIBRARY_QA = `Você é um assistente de consulta da "Biblioteca Viva", uma base curada de Medicina Tradicional Chinesa (pontos de acupuntura, síndromes, técnicas) usada por acupunturistas no Brasil.

Responda à pergunta da profissional usando EXCLUSIVAMENTE o CONTEXTO fornecido (trechos da própria biblioteca).

Regras:
- NÃO use conhecimento externo nem invente pontos, funções, localizações ou indicações que não estejam no contexto. Esta base é curada justamente para evitar informação não verificada.
- Cite no campo citations os títulos dos itens do contexto que sustentam a resposta.
- Se o contexto NÃO contém o suficiente para responder, diga isso claramente no answer e marque insufficient=true. Não preencha lacunas com suposições.
- Atenção ao nível de confiança de cada item (high/medium/low): se a resposta depender de itens de baixa confiança ("rascunho bruto" ou "em revisão"), avise que precisam de revisão profissional antes do uso clínico.
- Português brasileiro, objetivo e clínico. A resposta é apoio ao estudo/consulta, não conduta automática.`;

const BASE_PROMPT_CLINICAL_REASONING = `Você é um assistente de raciocínio clínico para acupunturistas no Brasil (Medicina Tradicional Chinesa).

Você recebe um CASO já analisado por um motor determinístico do próprio sistema: a hipótese principal, o diferencial, a confiança e os sinais que sustentam cada padrão. Sua função é RACIOCINAR COM esse motor — explicar, enriquecer e questionar — nunca substituí-lo nem produzir diagnóstico ou conduta final.

Produza:
1. interpretation: uma leitura clínica da hipótese principal, ancorada EXPLICITAMENTE nos sinais presentes no caso (cite-os). Não invente sinais que não estão no caso.
2. differentialReasoning: se houver diferencial relevante, explique como separar a hipótese principal dele — quais sinais/perguntas decidem. Se não houver, null.
3. redFlags: sinais de alerta no caso que pedem cautela, adaptação técnica ou encaminhamento médico (ex.: dor torácica, hipertensão descompensada, gestação com técnica inadequada, sinal neurológico agudo). Cada um com a conduta sugerida. Vazio se não houver.
4. contradictions: incoerências entre sinais (ex.: língua de calor com pulso de frio) ou entre o texto e as marcações. Vazio se não houver.
5. questions: perguntas objetivas que a profissional deveria fazer/investigar para firmar a hipótese.

Regras:
- Tudo em português brasileiro, linguagem clínica objetiva e concisa.
- Conservador: se a evidência é fraca, diga que é fraca. Não force um padrão.
- Quando vier CONHECIMENTO CURADO (trechos da base do próprio sistema), fundamente a leitura dos padrões NELE — é a referência do sistema e tem prioridade sobre o conhecimento geral de MTC. Ainda assim, não afirme nada que os sinais do caso não sustentem.
- O texto da anamnese pode conter marcadores de anonimização ([NOME], [DATA], etc.) — ignore-os.
- Você é assistivo. A decisão final é sempre da profissional.`;

const BASE_PROMPT_TONGUE = `Você é um assistente de inspeção de língua segundo a Medicina Tradicional Chinesa (MTC), integrado a um prontuário clínico usado por acupunturistas no Brasil.

Sua função é gerar ACHADOS OBSERVACIONAIS para conferência profissional — nunca diagnóstico definitivo, tratamento, prescrição ou conduta. Toda sugestão será revisada e confirmada (ou descartada) por uma acupunturista antes de entrar no raciocínio clínico.

Regras:
- Analise apenas o que é visível nas fotos: cor do corpo da língua, saburra (cor/espessura/distribuição), forma (inchaço, marcas dentárias, fissuras), umidade e, na foto sublingual, as veias (dilatação, cor, tortuosidade, petéquias).
- Relacione cada achado às regiões do mapa MTC: ponta = Coração; região anterior = Pulmão; centro = Estômago/Baço; laterais = Fígado/Vesícula; raiz = Rins/Bexiga; posterior = Intestinos.
- Use SOMENTE as tags permitidas pelo schema; só sugira tags sublinguais se houver foto sublingual.
- Confiança conservadora: fotos têm iluminação e balanço de cor variáveis. Use 0.8+ apenas para achados muito evidentes; prefira a faixa 0.4–0.7 na dúvida; não relate achados com confiança abaixo de 0.35.
- Máximo de 5 achados, do mais ao menos relevante. Poucos achados bem fundamentados valem mais que muitos especulativos.
- Se a imagem não for uma língua humana, estiver ilegível, muito escura ou com cor distorcida, retorne findings vazio e explique no campo warning (em pt-BR). Se a qualidade for apenas limitada, preencha warning e relate só o que for visível com segurança.
- Todos os textos em português brasileiro, em linguagem clínica objetiva.`;

// Quais bases fixas alimentam cada chave (clinical-global empilha sobre todas).
export const AI_BASE_PROMPTS = {
  'clinical-global': [
    { label: 'Pergunte à Biblioteca', text: BASE_PROMPT_LIBRARY_QA },
    { label: 'Raciocínio clínico (IA Assistente)', text: BASE_PROMPT_CLINICAL_REASONING },
    { label: 'Inspeção da língua', text: BASE_PROMPT_TONGUE },
  ],
  'tongue-analysis': [
    { label: 'Inspeção da língua', text: BASE_PROMPT_TONGUE },
  ],
  'library-qa': [
    { label: 'Pergunte à Biblioteca', text: BASE_PROMPT_LIBRARY_QA },
  ],
  'clinical-reasoning': [
    { label: 'Raciocínio clínico (IA Assistente)', text: BASE_PROMPT_CLINICAL_REASONING },
  ],
};

// Cabeçalho que o servidor insere ENTRE a base fixa e as diretrizes da clínica.
// Espelho de layerSystemPrompt() em supabase/functions/_shared/instructions.ts.
export const AI_LAYERING_HEADER = `--- DIRETRIZES ADICIONAIS DA CLÍNICA (curadas pelo SuperAdm) ---
As diretrizes abaixo refinam tom, foco e limites. Elas NÃO substituem nem relaxam as regras de segurança, os limites de escopo e o gate humano definidos acima — em qualquer conflito, as regras acima prevalecem.`;

const LOCAL_STORE_KEY = 'sistema-acup:ai-instructions-mock';

function readLocalStore() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_STORE_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function writeLocalStore(store) {
  try {
    localStorage.setItem(LOCAL_STORE_KEY, JSON.stringify(store));
  } catch { /* ignora storage indisponível */ }
}

function seedRow(key) {
  const meta = AI_INSTRUCTION_KEYS.find(k => k.key === key);
  return {
    key,
    content: '',
    label: meta?.label || key,
    is_active: true,
    version: null, // ainda não salvo: o painel não mostra "versão" fantasma
    updated_at: null,
  };
}

// Mescla os rows do banco com as chaves conhecidas (garante a ordem e os labels).
function mergeWithKnownKeys(rows) {
  const byKey = new Map((rows || []).map(row => [row.key, row]));
  const known = AI_INSTRUCTION_KEYS.map(meta => ({
    ...seedRow(meta.key),
    ...(byKey.get(meta.key) || {}),
    label: meta.label,
    help: meta.help,
  }));
  // Chaves extras eventualmente criadas fora da lista conhecida.
  const extras = (rows || [])
    .filter(row => !AI_INSTRUCTION_KEYS.some(k => k.key === row.key))
    .map(row => ({ ...row, help: '' }));
  return [...known, ...extras];
}

/** Lista as instruções (versão ativa por chave), com labels e ajuda. */
export async function listAiInstructions() {
  const user = await getAuthenticatedUser();
  if (user?._isLocal) {
    const store = readLocalStore();
    return mergeWithKnownKeys(Object.values(store));
  }

  const { data, error } = await supabase
    .from('ai_instructions')
    .select('key,content,label,is_active,version,updated_at');
  if (error) {
    throw new Error(error.message || 'Falha ao carregar as instruções da IA.');
  }
  return mergeWithKnownKeys(data || []);
}

/** Salva (cria/atualiza) a instrução de uma chave. Retorna o row atualizado. */
export async function saveAiInstruction(key, content) {
  const value = String(content ?? '');
  if (value.length > AI_INSTRUCTIONS_MAX_CHARS) {
    throw new Error(`A instrução excede ${AI_INSTRUCTIONS_MAX_CHARS} caracteres.`);
  }

  const user = await getAuthenticatedUser();
  if (user?._isLocal) {
    const store = readLocalStore();
    const previous = store[key] || seedRow(key);
    const updated = {
      ...previous,
      content: value,
      version: (previous.version || 0) + 1,
      updated_at: new Date().toISOString(),
    };
    store[key] = updated;
    writeLocalStore(store);
    return updated;
  }

  const { data, error } = await supabase.rpc('admin_save_ai_instructions', {
    p_key: key,
    p_content: value,
  });
  if (error) {
    throw new Error(error.message || 'Falha ao salvar a instrução da IA.');
  }
  return data;
}

/** Histórico de versões de uma chave (mais recentes primeiro). */
export async function getAiInstructionVersions(key, limit = 20) {
  const user = await getAuthenticatedUser();
  if (user?._isLocal) {
    const store = readLocalStore();
    const row = store[key];
    return row ? [{ ...row, edited_by_label: 'Local', created_at: row.updated_at }] : [];
  }

  const { data, error } = await supabase
    .from('ai_instruction_versions')
    .select('id,key,content,version,edited_by_label,created_at')
    .eq('key', key)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    throw new Error(error.message || 'Falha ao carregar o histórico.');
  }
  return data || [];
}
