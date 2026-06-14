// ============================================================
// UTILITÁRIO: Anonimização de texto clínico antes da IA
// Defesa em camadas (LGPD): mascara identificadores diretos
// ANTES de qualquer texto sair para o Gemini. Roda no cliente,
// então o dado bruto nunca chega ao servidor de IA.
//
// NÃO é infalível (não é NLP de nomes) — é uma rede de segurança
// combinada ao aviso na interface para a profissional não escrever
// identificadores. Ver roadmap-ia-expansao (decisão "ambos").
// ============================================================

// Pré-compilado: padrões de PII estruturada comuns no Brasil.
const PII_PATTERNS = [
  // CPF: 000.000.000-00 ou 00000000000
  { re: /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, tag: '[CPF]' },
  // CNPJ: 00.000.000/0000-00
  { re: /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, tag: '[CNPJ]' },
  // E-mail
  { re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, tag: '[EMAIL]' },
  // Telefone BR: (11) 91234-5678, 11912345678, +55 11 91234 5678
  { re: /(?:\+?55\s?)?\(?\d{2}\)?[\s.-]?\d{4,5}[\s.-]?\d{4}\b/g, tag: '[TELEFONE]' },
  // CEP: 00000-000
  { re: /\b\d{5}-?\d{3}\b/g, tag: '[CEP]' },
  // Datas: 01/02/2024, 1-2-24
  { re: /\b\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}\b/g, tag: '[DATA]' },
];

// Tokens do nome que NÃO devem ser mascarados (preposições comuns).
const NAME_STOPWORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Mascara cada token do nome do paciente (≥3 letras, fora as preposições)
// onde quer que apareça no texto, ignorando acentos não — usa o token literal.
function maskPatientName(text, patientName) {
  if (!patientName) return text;
  const tokens = String(patientName)
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length >= 3 && !NAME_STOPWORDS.has(t.toLowerCase()));

  let out = text;
  for (const token of tokens) {
    const re = new RegExp(`\\b${escapeRegExp(token)}\\b`, 'gi');
    out = out.replace(re, '[NOME]');
  }
  return out;
}

/**
 * Mascara identificadores diretos de um texto clínico.
 * @param {string} text
 * @param {{ patientName?: string }} [options]
 * @returns {string} texto com PII substituída por marcadores
 */
export function anonymizeClinicalText(text, { patientName } = {}) {
  if (!text) return '';
  // Padrões estruturados PRIMEIRO: assim um nome dentro de um e-mail
  // (maria@…) é capturado por [EMAIL] antes de o mascaramento de nome agir.
  let out = String(text);
  for (const { re, tag } of PII_PATTERNS) {
    out = out.replace(re, tag);
  }
  // Nome por último, sobre o que sobrou de texto.
  return maskPatientName(out, patientName);
}

/**
 * Indica se o texto AINDA contém algo que parece identificador direto,
 * para a UI poder alertar a profissional. Roda sobre o texto JÁ anonimizado
 * como verificação extra (ex.: nome não cadastrado escrito à mão).
 * @param {string} text
 * @returns {boolean}
 */
export function looksLikeContainsPII(text) {
  if (!text) return false;
  return PII_PATTERNS.some(({ re }) => {
    re.lastIndex = 0;
    return re.test(text);
  });
}
