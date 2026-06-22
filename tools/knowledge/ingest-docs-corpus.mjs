// ============================================================
// TOOL: ingest-docs-corpus — documentação curada → corpus da Biblioteca (RAG)
//
// Lê uma ALLOWLIST de docs clínicas curadas (docs/*.md), quebra cada uma em
// chunks por título (## / ###), extrai os termos em **negrito** como tags
// (os nomes de padrão MTC são chaves de busca de ouro) e gera o módulo
// frontend/src/knowledge/generated/doc-corpus.js no MESMO formato dos cards
// que a Biblioteca já consome. Assim o "Pergunte à Biblioteca" passa a
// recuperar e citar a sua documentação — sem vetores, sem custo de IA.
//
// As funções são exportadas para os testes; rodar como CLI gera o arquivo:
//   node tools/knowledge/ingest-docs-corpus.mjs
//
// Confiança: docs curadas entram como "média" por padrão (são referência
// operacional, refináveis pela equipe técnica) — não inflam a aba "Seguro
// para uso clínico" nem viram conduta automática.
// ============================================================

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');
const docsDir = path.join(projectRoot, 'docs');
const outputPath = path.join(
  projectRoot, 'frontend', 'src', 'knowledge', 'generated', 'doc-corpus.js',
);

// Allowlist: SÓ docs clínicas curadas entram no corpus da IA. Acrescente aqui
// conforme a equipe técnica liberar (e suba `confidence` para 'high' quando
// uma doc for assinada como segura para uso clínico).
export const DOC_CORPUS_SOURCES = [
  {
    file: 'repertorio-padroes-mtc.md',
    cat: 'Repertório',
    source: 'Repertório operacional MTC (curado)',
    confidence: 'medium',
  },
  {
    file: 'regras-clinicas-lingua-padrao.md',
    cat: 'Regra clínica',
    source: 'Ruleset clínico Língua→Padrão (curado)',
    confidence: 'medium',
  },
  {
    file: 'tecnicas-laseracupuntura.md',
    cat: 'Técnica terapêutica',
    source: 'Sanagua J. — Manual de Terapia y Acupuntura Láser (síntese pt-BR, fonte local)',
    confidence: 'medium',
  },
  {
    file: 'tecnicas-moxibustao.md',
    cat: 'Técnica terapêutica',
    source: 'Acupuntura Chinesa e Moxibustão (síntese pt-BR, fonte local)',
    confidence: 'medium',
  },
  {
    file: 'livro-questoes-fundamentos.md',
    cat: 'Fundamentos',
    source: 'Cruz E., Hohl A. e Ungarelli S. — Acupuntura Médica em Questões (TEAC, GPL-3.0; síntese curada)',
    confidence: 'medium',
  },
  {
    file: 'livro-questoes-casos.md',
    cat: 'Caso clínico',
    source: 'Cruz E., Hohl A. e Ungarelli S. — Acupuntura Médica em Questões (TEAC, GPL-3.0; síntese curada)',
    confidence: 'medium',
  },
  {
    file: 'livro-questoes-sindromes.md',
    cat: 'Síndrome',
    source: 'Cruz E., Hohl A. e Ungarelli S. — Acupuntura Médica em Questões (TEAC, GPL-3.0; síntese curada)',
    confidence: 'medium',
  },
  {
    file: 'livro-questoes-diagnostico.md',
    cat: 'Diagnóstico',
    source: 'Cruz E., Hohl A. e Ungarelli S. — Acupuntura Médica em Questões (TEAC, GPL-3.0; síntese curada)',
    confidence: 'medium',
  },
  {
    file: 'livro-questoes-auriculo.md',
    cat: 'Auriculoterapia',
    source: 'Cruz E., Hohl A. e Ungarelli S. — Acupuntura Médica em Questões (TEAC, GPL-3.0; síntese curada)',
    confidence: 'medium',
  },
  {
    file: 'livro-questoes-eletroacupuntura.md',
    cat: 'Eletroacupuntura',
    source: 'Cruz E., Hohl A. e Ungarelli S. — Acupuntura Médica em Questões (TEAC, GPL-3.0; síntese curada)',
    confidence: 'medium',
  },
];

// Mesmo mapeamento de status/cor usado pela Biblioteca (ver Biblioteca.jsx).
const STATUS_BY_CONFIDENCE = {
  high: { statusLabel: '✅ Seguro para Uso Clínico', cardColor: '#10b981' },
  medium: { statusLabel: 'Em revisão de fonte', cardColor: '#f59e0b' },
  low: { statusLabel: 'Rascunho bruto - não seguro', cardColor: '#f97316' },
};

const MAX_CHUNK_CHARS = 1600;

// Stopwords pt-BR + ruído de marcação que não servem como tag.
const TAG_STOPWORDS = new Set([
  'que', 'qual', 'quais', 'como', 'para', 'com', 'sem', 'dos', 'das', 'uma',
  'por', 'pra', 'são', 'ser', 'tem', 'meu', 'sua', 'seu', 'mais', 'menos',
  'pode', 'nao', 'não', 'que', 'ver', 'etc', 'ex', 'novo', 'nova', 'isso',
  'cada', 'entre', 'sobre', 'quando', 'ainda', 'já', 'ja', 'pela', 'pelo',
]);

export function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '');
}

function matchHeading(line) {
  const m = /^(#{1,6})\s+(.*\S)\s*$/.exec(line);
  return m ? { level: m[1].length, text: m[2].trim() } : null;
}

// Remove ênfase/links/código inline, preservando o texto legível.
export function stripInlineMarkdown(text) {
  return String(text || '')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1$2')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[`*_]/g, '')
    .trim();
}

// Coleta os termos em **negrito** de um trecho — ótimas chaves de busca
// (nomes de padrão, sinais-chave). Deduplica preservando a ordem.
export function extractBoldTerms(markdown) {
  const terms = [];
  const re = /\*\*([^*]+)\*\*/g;
  let m;
  while ((m = re.exec(markdown)) !== null) {
    const term = stripInlineMarkdown(m[1]).replace(/[.,;:]+$/, '').trim();
    if (term.length >= 3 && term.length <= 48) terms.push(term);
  }
  return [...new Set(terms)];
}

// Converte markdown de chunk em texto legível: tira blockquote, transforma
// tabelas em linhas "a — b — c" e remove ênfase. Serve ao card e à IA.
export function markdownToReadable(body) {
  const out = [];
  for (const rawLine of String(body || '').split(/\r?\n/)) {
    let line = rawLine.replace(/^\s*>\s?/, '').trimEnd();
    if (!line.trim()) {
      if (out.length && out[out.length - 1] !== '') out.push('');
      continue;
    }
    // Linha de tabela markdown.
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const cells = line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      // Pula a linha separadora (|---|---|).
      if (cells.every(c => /^:?-{2,}:?$/.test(c) || c === '')) continue;
      out.push(stripInlineMarkdown(cells.filter(Boolean).join(' — ')));
      continue;
    }
    out.push(stripInlineMarkdown(line));
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function tagsFromTitleAndBody(titleParts, body) {
  const fromTitle = titleParts
    .join(' ')
    .replace(/^\d+\.?\s*/g, ' ')
    .split(/[^\p{L}\p{N}]+/u)
    .map(w => w.trim())
    .filter(w => w.length >= 3 && !TAG_STOPWORDS.has(w.toLowerCase()));
  const bold = extractBoldTerms(body);
  // Negrito primeiro (mais específico), depois palavras do título.
  return [...new Set([...bold, ...fromTitle])].slice(0, 12);
}

// Quebra o markdown de uma doc em chunks por título (## e ###), com trilha
// (breadcrumb) "H1 › H2 › H3". Cada chunk grande é dividido por parágrafo.
export function chunkMarkdown(markdown, { maxChars = MAX_CHUNK_CHARS } = {}) {
  const lines = String(markdown || '').split(/\r?\n/);
  const sections = [];
  let h1 = '';
  let h2 = '';
  let h3 = '';
  let buffer = [];

  const currentParts = () => [h1, h2, h3].filter(Boolean);
  const flush = () => {
    const body = buffer.join('\n').trim();
    buffer = [];
    if (body) sections.push({ titleParts: currentParts(), body });
  };

  for (const line of lines) {
    const heading = matchHeading(line);
    if (heading && heading.level <= 3) {
      flush();
      const text = stripInlineMarkdown(heading.text);
      if (heading.level === 1) { h1 = text; h2 = ''; h3 = ''; }
      else if (heading.level === 2) { h2 = text; h3 = ''; }
      else { h3 = text; }
      continue;
    }
    buffer.push(line);
  }
  flush();

  // Divide seções muito grandes em partes por parágrafo (mantém tabelas juntas).
  // Cada chunk carrega `raw` (markdown original, p/ minerar tags em negrito) e
  // `text` (versão legível, p/ exibir e enviar à IA).
  const chunks = [];
  for (const section of sections) {
    const readable = markdownToReadable(section.body);
    if (!readable) continue;
    if (readable.length <= maxChars) {
      chunks.push({ titleParts: section.titleParts, text: readable, raw: section.body });
      continue;
    }
    const paragraphs = section.body.split(/\n{2,}/);
    let part = [];
    let size = 0;
    let partNo = 0;
    const pushPart = () => {
      if (!part.length) return;
      partNo += 1;
      const joinedRaw = part.join('\n\n');
      chunks.push({
        titleParts: [...section.titleParts, `parte ${partNo}`],
        text: markdownToReadable(joinedRaw),
        raw: joinedRaw,
      });
      part = [];
      size = 0;
    };
    for (const paragraph of paragraphs) {
      const pLen = markdownToReadable(paragraph).length;
      if (size + pLen > maxChars && part.length) pushPart();
      part.push(paragraph);
      size += pLen + 2;
    }
    pushPart();
  }
  return chunks;
}

// Monta os cards de uma doc (formato consumido pela Biblioteca).
export function buildCardsFromMarkdown(markdown, sourceDef) {
  const { file, cat, source, confidence = 'medium' } = sourceDef;
  const status = STATUS_BY_CONFIDENCE[confidence] || STATUS_BY_CONFIDENCE.medium;
  const fileSlug = slugify(file.replace(/\.md$/, ''));
  const chunks = chunkMarkdown(markdown);

  return chunks.map((chunk, index) => {
    // Título focado na folha: descarta o H1 (o documento já é identificado em
    // `source`). Menos ruído no ranking lexical e citações mais limpas.
    const displayParts = chunk.titleParts.length > 1 ? chunk.titleParts.slice(1) : chunk.titleParts;
    const title = displayParts.join(' › ') || file;
    return {
      id: `doc:${fileSlug}#${index + 1}`,
      cat,
      title,
      confidence,
      statusLabel: status.statusLabel,
      cardColor: status.cardColor,
      tags: tagsFromTitleAndBody(chunk.titleParts, chunk.raw).join(', '),
      source,
      txt: chunk.text,
      docFile: file,
    };
  });
}

// Lê a allowlist e devolve todos os cards (ordem estável p/ diffs limpos).
export async function buildDocCorpusCards(
  sources = DOC_CORPUS_SOURCES,
  { readFile = (p) => fs.readFile(p, 'utf8'), baseDir = docsDir } = {},
) {
  const cards = [];
  for (const sourceDef of sources) {
    const markdown = await readFile(path.join(baseDir, sourceDef.file));
    cards.push(...buildCardsFromMarkdown(markdown, sourceDef));
  }
  return cards;
}

function renderModule(cards) {
  return `// ============================================================
// AUTO-GERADO por tools/knowledge/ingest-docs-corpus.mjs — não editar à mão.
// Documentação clínica curada quebrada em chunks para o RAG da Biblioteca.
// Regenerar: node tools/knowledge/ingest-docs-corpus.mjs
// ============================================================

export const docCorpusCards = ${JSON.stringify(cards, null, 2)};
`;
}

export async function generate() {
  const cards = await buildDocCorpusCards();
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, renderModule(cards), 'utf8');
  return { cards, outputPath };
}

// Executa só quando rodado como CLI (não nos imports de teste).
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  generate()
    .then(({ cards, outputPath: out }) => {
      const byCat = cards.reduce((acc, c) => {
        acc[c.cat] = (acc[c.cat] || 0) + 1;
        return acc;
      }, {});
      console.log(`doc-corpus: ${cards.length} chunk(s) gerados em ${path.relative(projectRoot, out)}`);
      for (const [cat, count] of Object.entries(byCat)) {
        console.log(`  · ${cat}: ${count}`);
      }
    })
    .catch((error) => {
      console.error('doc-corpus: falha ao gerar', error);
      process.exitCode = 1;
    });
}
