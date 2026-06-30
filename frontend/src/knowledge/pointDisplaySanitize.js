// Sanitizacao de EXIBICAO para o modal de detalhe do ponto (PointReviewDialog).
//
// Os reviews do Atlas guardam, junto do conteudo clinico, varias mensagens de
// SISTEMA/CURADORIA/ADMIN (proveniencia, aprovacao local, avisos de auditoria,
// status, timestamps). Essas informacoes interessam ao administrador, NAO ao
// acupunturista que abre a ficha do ponto. Aqui removemos esse ruido de sistema
// na hora de exibir, sem alterar os dados de origem.

// Sentencas/trechos puramente de sistema que nunca devem aparecer na ficha clinica.
const SYSTEM_PATTERNS = [
  // "Fonte primaria: ... p. 284-285." — consome ate a referencia de pagina
  /Fonte\s+prim[aá]ria:[\s\S]*?p\.\s*\d+(?:\s*-\s*\d+)?\.?/gi,
  /Fonte\s+prim[aá]ria:[^.]*\.?/gi,
  /Fonte\s+Atlas:\s*p\.\s*\d+(?:\s*-\s*\d+)?\.?/gi,
  /Fonte\s+Atlas:[^.]*\.?/gi,
  /Se[cç][aã]o\s+localizada\s+por\s+cabe[cç]alho\s+do\s+Atlas[^.]*\.?/gi,
  /Aprovad[oa]\s+localmente[^.]*\.?/gi,
  /Status\s+permanece\s+como\s+sugest[aã]o\s+local[^.]*\.?/gi,
  /Curadoria\s+profunda\s+local:[^.]*\.?/gi,
  /Manter\s+auditoria\s+profissional[^.]*\.?/gi,
  /n[aã]o\s+publicar\s+em\s+banco\s*\/?\s*produ[cç][aã]o[^.]*\.?/gi,
  /exige\s+curadoria\s+humana[^.]*\.?/gi,
  /Registro\s+(disponível|em\s+quarentena)[^.]*\.?/gi,
  /conferir\s+ru[ií]dos\s+de\s+OCR[^.]*\.?/gi,
  // rotulo "Nota de localizacao:" — remove o rotulo, preserva o texto que segue
  /Nota\s+de\s+localiza[cç][aã]o:\s*/gi,
];

// Frases de "porque" geradas pelo sistema (campo `why`) — comentario de sistema,
// nao conteudo clinico do ponto.
const SYSTEM_WHY_PATTERNS = [
  /foi\s+aprovado\s+na\s+Biblioteca\s+Viva/i,
  /Biblioteca\s+Viva/i,
  /Registro\s+disponível\s+para\s+confer[êe]ncia/i,
  /aguarda(ndo)?\s+(s[ií]ntese|revis[aã]o)/i,
  /Ponto\s+curado\s+como\s+apoio/i,
  /Informa[cç][aã]o\s+completa\s+depende/i,
  /tem\s+fonte\s+vinculada/i,
];

export function sanitizeClinicalNote(note) {
  if (!note || typeof note !== 'string') return '';
  let text = note;
  for (const re of SYSTEM_PATTERNS) text = text.replace(re, ' ');
  // limpa pontuacao/espacos orfaos resultantes
  text = text.replace(/\s{2,}/g, ' ').replace(/\s+([.,;:])/g, '$1').replace(/^[\s.,;:]+/, '').trim();
  // se sobrou so pontuacao/fragmento curto, considera vazio
  if (text.replace(/[\s.,;:()-]/g, '').length < 8) return '';
  return text;
}

// Retorna o texto de "rationale" do ponto somente se NAO for mensagem de sistema.
export function clinicalWhy(why) {
  if (!why || typeof why !== 'string') return '';
  if (SYSTEM_WHY_PATTERNS.some(re => re.test(why))) return '';
  return why.trim();
}

// Remove rotulos de sistema da lista de fontes (ex.: "Biblioteca Viva"),
// preservando a referencia bibliografica real (livro/atlas/pagina).
export function clinicalSources(sources = []) {
  return (sources || [])
    .filter(Boolean)
    .filter(src => !/^biblioteca\s+viva/i.test(String(src).trim()));
}
