import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { selectedSourceKeys } from './clean-psych-text.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');
const defaultPdfRoot = path.join(projectRoot, 'frontend', '.local-source-assets', 'pdf-sources');
const defaultOutputDir = path.join(defaultPdfRoot, 'knowledge', 'psicologia');

const RISK_TERMS = [
  { label: 'Ideacao suicida', pattern: /\b(idea[cç][aã]o suicida|pensamentos? suicidas?|suic[ií]dio|risco suicida)\b/giu },
  { label: 'Autolesao', pattern: /\b(autoles[aã]o|autoagress[aã]o|autoexterm[ií]nio|automutila[cç][aã]o)\b/giu },
  { label: 'Risco a terceiros', pattern: /\b(risco a terceiros|homic[ií]dio|viol[eê]ncia contra|amea[cç]a de morte)\b/giu },
  { label: 'Violencia ou abuso', pattern: /\b(viol[eê]ncia|abuso sexual|abuso f[ií]sico|maus-tratos|neglig[eê]ncia)\b/giu },
];

const CHECKLIST_TERMS = [
  { label: 'Humor', category: 'estado emocional', pattern: /\b(humor|depress[aã]o|deprimido|tristeza|anedonia)\b/giu },
  { label: 'Ansiedade', category: 'estado emocional', pattern: /\b(ansiedade|p[aâ]nico|preocupa[cç][aã]o|medo)\b/giu },
  { label: 'Sono', category: 'rotina e sintomas', pattern: /\b(sono|ins[oô]nia|hipersonia|pesadelos?)\b/giu },
  { label: 'Alimentacao', category: 'rotina e sintomas', pattern: /\b(alimenta[cç][aã]o|apetite|compuls[aã]o alimentar|restri[cç][aã]o alimentar)\b/giu },
  { label: 'Atencao', category: 'cognicao', pattern: /\b(aten[cç][aã]o|desaten[cç][aã]o|concentra[cç][aã]o)\b/giu },
  { label: 'Memoria', category: 'cognicao', pattern: /\b(mem[oó]ria|recorda[cç][aã]o|esquecimento)\b/giu },
  { label: 'Funcoes executivas', category: 'cognicao', pattern: /\b(fun[cç][oõ]es executivas|planejamento|inibi[cç][aã]o|flexibilidade cognitiva)\b/giu },
  { label: 'Linguagem', category: 'desenvolvimento', pattern: /\b(linguagem|fala|comunica[cç][aã]o)\b/giu },
  { label: 'Aprendizagem', category: 'desenvolvimento', pattern: /\b(aprendizagem|desempenho escolar|habilidades acad[eê]micas)\b/giu },
  { label: 'Interacao social', category: 'funcionamento social', pattern: /\b(intera[cç][aã]o social|reciprocidade social|rela[cç][oõ]es sociais)\b/giu },
  { label: 'Comportamentos repetitivos', category: 'comportamento', pattern: /\b(comportamentos? repetitivos?|interesses restritos|estereotipias?)\b/giu },
  { label: 'Funcionamento adaptativo', category: 'funcionamento', pattern: /\b(funcionamento adaptativo|habilidades adaptativas|autonomia|atividades da vida di[aá]ria)\b/giu },
  { label: 'Desenvolvimento', category: 'historia de vida', pattern: /\b(desenvolvimento|marcos do desenvolvimento|neurodesenvolvimento)\b/giu },
  { label: 'Trauma', category: 'historia de vida', pattern: /\b(trauma|evento traum[aá]tico|estresse p[oó]s-traum[aá]tico)\b/giu },
];

const AXIS_TERMS = [
  { label: 'Funcionamento cognitivo', kind: 'eixo', pattern: /\b(funcionamento cognitivo|cogni[cç][aã]o|mem[oó]ria|aten[cç][aã]o|fun[cç][oõ]es executivas)\b/giu },
  { label: 'Funcionamento afetivo', kind: 'eixo', pattern: /\b(funcionamento afetivo|humor|afeto|regula[cç][aã]o emocional|labilidade)\b/giu },
  { label: 'Funcionamento adaptativo', kind: 'eixo', pattern: /\b(funcionamento adaptativo|habilidades adaptativas|autonomia)\b/giu },
  { label: 'Desenvolvimento e historia de vida', kind: 'eixo', pattern: /\b(hist[oó]ria de desenvolvimento|marcos do desenvolvimento|hist[oó]ria de vida|desenvolvimento infantil)\b/giu },
  { label: 'Contexto familiar e social', kind: 'eixo', pattern: /\b(contexto familiar|rela[cç][oõ]es familiares|contexto social|rede de apoio)\b/giu },
  { label: 'Avaliacao funcional', kind: 'dimensao-de-formulacao', pattern: /\b(avalia[cç][aã]o funcional|an[aá]lise funcional|antecedentes?|consequ[eê]ncias?|fun[cç][aã]o do comportamento)\b/giu },
  { label: 'Hipotese de trabalho', kind: 'hipotese-de-trabalho', pattern: /\b(hip[oó]tese(?:s)? de trabalho|hip[oó]tese diagn[oó]stica|formula[cç][aã]o|conceitualiza[cç][aã]o)\b/giu },
  { label: 'Criterios diagnosticos', kind: 'dimensao-de-formulacao', pattern: /\b(crit[eé]rios diagn[oó]sticos|especificadores?|diagn[oó]stico diferencial)\b/giu },
];

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith('--')) continue;
    const key = value.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

function pathExists(filePath) {
  return fsSync.existsSync(filePath);
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function readOptionalJson(filePath, fallback) {
  if (!pathExists(filePath)) return fallback;
  return readJson(filePath);
}

function stripDiacritics(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function slugify(text) {
  return stripDiacritics(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'item';
}

function stableHash(text) {
  return crypto.createHash('sha1').update(String(text || '')).digest('hex').slice(0, 10);
}

function sourceRef(source, page, snippet) {
  return {
    key: source.key,
    pdfPage: page.page,
    snippet,
    imageUrl: page.imageUrl || `/knowledge/source-assets/pdf-sources/${source.key}/pages/page-${String(page.page).padStart(3, '0')}.webp`,
  };
}

function makeBase(type, source, page, snippet, idSuffix) {
  return {
    id: `${type}:psicologia:${source.key}:p${String(page.page).padStart(4, '0')}:${idSuffix}`,
    status: 'review',
    discipline: 'psicologia',
    type,
    source: sourceRef(source, page, snippet),
    requiresProfessionalAudit: true,
  };
}

function normalizeText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function sentenceAround(text, index, maxLength = 700) {
  const value = normalizeText(text);
  if (!value) return '';
  const start = Math.max(0, value.lastIndexOf('. ', index - 1) + 2, value.lastIndexOf('? ', index - 1) + 2, value.lastIndexOf('! ', index - 1) + 2);
  let end = value.length;
  for (const marker of ['. ', '? ', '! ']) {
    const found = value.indexOf(marker, Math.max(index, start + 1));
    if (found !== -1) end = Math.min(end, found + 1);
  }
  let snippet = value.slice(start, end).trim();
  if (snippet.length < 80) {
    const padStart = Math.max(0, index - 260);
    snippet = value.slice(padStart, Math.min(value.length, padStart + maxLength)).trim();
  }
  return snippet.slice(0, maxLength).trim();
}

function firstSnippet(text, maxLength = 800) {
  return normalizeText(text).slice(0, maxLength).trim();
}

function frameworkFor(source, text) {
  const combined = `${source.title || ''} ${text || ''}`.toLowerCase();
  if (combined.includes('dsm-5') || combined.includes('dsm 5')) return 'DSM-5-TR';
  if (combined.includes('cid-11') || combined.includes('cid 11') || combined.includes('icd-11')) return 'CID-11';
  if (combined.includes('comportamento aplicada') || combined.includes('aba') || combined.includes('analise funcional')) return 'Analise do comportamento aplicada';
  if (combined.includes('neuropsicologia')) return 'Neuropsicologia';
  return '';
}

function extractQuestionCandidates(source, page) {
  const text = normalizeText(page.text);
  const candidates = [];
  for (const match of text.matchAll(/([^.!?]{20,220}\?)/gu)) {
    const prompt = match[1].trim();
    if (!/(hist[oó]ria|queixa|tratamento|sono|humor|ansiedade|risco|fam[ií]lia|desenvolvimento|comportamento|uso|sintomas?|dificuldade|quando|como|qual|quais|por que)/iu.test(prompt)) {
      continue;
    }
    const snippet = sentenceAround(text, match.index || 0);
    candidates.push({
      ...makeBase('question', source, page, snippet, stableHash(prompt)),
      prompt,
      rationale: 'Pergunta explicita localizada na fonte; precisa de adaptacao e aprovacao profissional antes de entrar no roteiro.',
    });
    if (candidates.length >= 4) break;
  }
  return candidates;
}

function extractTermCandidates(source, page, terms, type) {
  const text = normalizeText(page.text);
  const candidates = [];
  const seen = new Set();

  for (const term of terms) {
    term.pattern.lastIndex = 0;
    const match = term.pattern.exec(text);
    if (!match) continue;
    const key = `${type}:${term.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const snippet = sentenceAround(text, match.index || 0);
    const idSuffix = slugify(term.label);

    if (type === 'riskSign') {
      candidates.push({
        ...makeBase(type, source, page, snippet, idSuffix),
        label: term.label,
        signal: match[0],
        priority: 'alta',
        safetyScope: 'Sinal para bloco de seguranca e curadoria; nao gera conduta, diagnostico ou alerta automatico nesta fase.',
      });
    } else if (type === 'checklistItem') {
      candidates.push({
        ...makeBase(type, source, page, snippet, idSuffix),
        label: term.label,
        category: term.category,
        term: match[0],
        rationale: 'Termo recorrente localizado na fonte como vocabulario candidato para checklist revisavel.',
      });
    } else if (type === 'reasoningAxis') {
      candidates.push({
        ...makeBase(type, source, page, snippet, idSuffix),
        label: term.label,
        kind: term.kind,
        describes: snippet,
        observableCues: [],
        linkedFindings: [],
        framework: frameworkFor(source, snippet),
        differentials: '',
      });
    }
  }

  return candidates.slice(0, type === 'riskSign' ? 5 : 8);
}

function extractReferenceCandidate(source, page) {
  const snippet = firstSnippet(page.text);
  if (snippet.length < 180) return null;
  const heading = page.headings?.[0] || `${source.title} p. ${page.page}`;
  return {
    ...makeBase('reference', source, page, snippet, 'pagina'),
    label: heading.slice(0, 180),
    topic: frameworkFor(source, snippet) || 'psicologia',
    textRole: 'trecho teorico/fonte para RAG e curadoria',
  };
}

function candidatesFromTranscript(transcript) {
  const source = transcript.source;
  const buckets = {
    questions: [],
    reasoningAxes: [],
    checklistItems: [],
    riskSigns: [],
    references: [],
  };
  let pagesWithText = 0;
  let pagesSkipped = 0;

  for (const page of transcript.pages || []) {
    if (!page.text || page.status === 'image_only' || page.status === 'skipped') {
      pagesSkipped += 1;
      continue;
    }
    pagesWithText += 1;
    buckets.questions.push(...extractQuestionCandidates(source, page));
    buckets.reasoningAxes.push(...extractTermCandidates(source, page, AXIS_TERMS, 'reasoningAxis'));
    buckets.checklistItems.push(...extractTermCandidates(source, page, CHECKLIST_TERMS, 'checklistItem'));
    buckets.riskSigns.push(...extractTermCandidates(source, page, RISK_TERMS, 'riskSign'));
    const reference = extractReferenceCandidate(source, page);
    if (reference) buckets.references.push(reference);
  }

  return {
    buckets,
    audit: {
      sourceKey: source.key,
      title: source.title,
      pages: transcript.pages?.length || 0,
      pagesWithText,
      pagesSkipped,
      methods: transcript.counts?.methods || {},
      candidates: {
        questions: buckets.questions.length,
        reasoningAxes: buckets.reasoningAxes.length,
        checklistItems: buckets.checklistItems.length,
        riskSigns: buckets.riskSigns.length,
        references: buckets.references.length,
      },
    },
  };
}

function uniqueById(items) {
  const map = new Map();
  for (const item of items) map.set(item.id, item);
  return [...map.values()].sort((a, b) => a.id.localeCompare(b.id));
}

async function mergeAndWrite(filePath, selectedKeys, newItems) {
  const existingEnvelope = await readOptionalJson(filePath, null);
  const existingItems = Array.isArray(existingEnvelope) ? existingEnvelope : existingEnvelope?.items || [];
  const kept = existingItems.filter(item => !selectedKeys.has(item.source?.key));
  const envelope = {
    schemaVersion: 'psych-candidates.local.v1',
    generatedAt: new Date().toISOString(),
    policy: {
      status: 'review',
      discipline: 'psicologia',
      requiresProfessionalAudit: true,
      clinicalActivation: 'none',
      rule: 'Candidatos extraidos de fonte local para curadoria; nao interpretam, nao pontuam e nao diagnosticam.',
    },
    items: uniqueById([...kept, ...newItems]),
  };
  await fs.writeFile(filePath, `${JSON.stringify(envelope, null, 2)}\n`, 'utf8');
  return envelope.items.length;
}

function summaryMarkdown(audit, totals, generatedAt) {
  const fallbackPages = audit.sources.reduce((sum, source) => sum + (source.validation?.fallbackCandidatePages || 0), 0);
  const flaggedPages = audit.sources.reduce((sum, source) => sum + (source.validation?.flaggedPages || 0), 0);
  const totalPages = audit.sources.reduce((sum, source) => sum + source.pages, 0);
  const fallbackPercent = totalPages ? Math.round((fallbackPages / totalPages) * 10000) / 100 : 0;
  const rows = audit.sources.map(source => {
    const validation = source.validation || {};
    return `| ${source.sourceKey} | ${source.pages} | ${source.pagesWithText} | ${source.pagesSkipped} | ${validation.flaggedPages || 0} | ${validation.fallbackCandidatePages || 0} | ${source.candidates.questions} | ${source.candidates.reasoningAxes} | ${source.candidates.checklistItems} | ${source.candidates.riskSigns} | ${source.candidates.references} |`;
  }).join('\n');

  return `# Base local de psicologia para anamnese

Gerado em: ${generatedAt}

## Escopo

- 5 PDFs locais processados na lane \`psicologia\`, alvo \`anamnese-psicologia\`.
- Todo material permanece \`review\` e \`requiresProfessionalAudit: true\`.
- Nenhum dado foi publicado no app clinico, Supabase ou bundle publico.
- Candidatos foram extraidos de modo conservador, por termos e trechos rastreaveis, sem diagnostico, scoring ou conduta automatica.

## Cobertura

| Fonte | Paginas | Com texto | Puladas | Flagged | Fallback | Perguntas | Eixos | Checklist | Risco | Referencias |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${rows}

## Totais

- Perguntas candidatas: ${totals.questions}
- Eixos/hipoteses/formulacao: ${totals.reasoningAxes}
- Itens de checklist: ${totals.checklistItems}
- Sinais de risco: ${totals.riskSigns}
- Referencias para Biblioteca/RAG: ${totals.references}
- Paginas marcadas pela validacao: ${flaggedPages}
- Paginas na fila de fallback de qualidade: ${fallbackPages} (${fallbackPercent}% do lote)

## Arquivos locais

- \`frontend/.local-source-assets/pdf-sources/<fonte>/ocr/transcript.local.json\`
- \`frontend/.local-source-assets/pdf-sources/<fonte>/ocr/validation-report.local.json\`
- \`frontend/.local-source-assets/pdf-sources/knowledge/psicologia/*.local.json\`

## Observacao

O PDF de ABA/TEA veio sem texto embutido e foi tratado por OCR local. Paginas na fila de fallback ficam em worksheet local para conferencia humana/visao antes de qualquer uso clinico. Paginas apenas marcadas por idioma/contexto ficam no relatorio de validacao, mas nao entram automaticamente no fallback de qualidade.
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pdfRoot = path.resolve(args.pdfRoot || defaultPdfRoot);
  const outputDir = path.resolve(args.outputDir || defaultOutputDir);
  const summaryPath = path.resolve(args.summary || path.join(projectRoot, 'docs', 'pdf-source-learning-2026-07-10-psicologia.md'));
  const generatedAt = new Date().toISOString();
  const keys = await selectedSourceKeys(args, pdfRoot);
  if (!keys.length) throw new Error('Nenhuma fonte selecionada para extracao.');

  const selectedKeys = new Set(keys);
  const all = {
    questions: [],
    reasoningAxes: [],
    checklistItems: [],
    riskSigns: [],
    references: [],
  };
  const audit = {
    schemaVersion: 'psych-extract-audit.local.v1',
    generatedAt,
    policy: {
      status: 'review',
      requiresProfessionalAudit: true,
      clinicalActivation: 'none',
    },
    sources: [],
  };

  for (const key of keys) {
    console.log(`[${key}] extraindo candidatos`);
    const transcriptPath = path.join(pdfRoot, key, 'ocr', 'transcript.local.json');
    if (!pathExists(transcriptPath)) throw new Error(`Transcript nao encontrado para ${key}: ${transcriptPath}`);
    const transcript = await readJson(transcriptPath);
    const extracted = candidatesFromTranscript(transcript);
    const validationPath = path.join(pdfRoot, key, 'ocr', 'validation-report.local.json');
    if (pathExists(validationPath)) {
      extracted.audit.validation = (await readJson(validationPath)).counts;
    }
    all.questions.push(...extracted.buckets.questions);
    all.reasoningAxes.push(...extracted.buckets.reasoningAxes);
    all.checklistItems.push(...extracted.buckets.checklistItems);
    all.riskSigns.push(...extracted.buckets.riskSigns);
    all.references.push(...extracted.buckets.references);
    audit.sources.push(extracted.audit);
  }

  await fs.mkdir(outputDir, { recursive: true });
  const totals = {
    questions: await mergeAndWrite(path.join(outputDir, 'question-candidates.local.json'), selectedKeys, all.questions),
    reasoningAxes: await mergeAndWrite(path.join(outputDir, 'reasoning-axis-candidates.local.json'), selectedKeys, all.reasoningAxes),
    checklistItems: await mergeAndWrite(path.join(outputDir, 'checklist-item-candidates.local.json'), selectedKeys, all.checklistItems),
    riskSigns: await mergeAndWrite(path.join(outputDir, 'risk-sign-candidates.local.json'), selectedKeys, all.riskSigns),
    references: await mergeAndWrite(path.join(outputDir, 'reference-candidates.local.json'), selectedKeys, all.references),
  };

  audit.totals = totals;
  await fs.writeFile(path.join(outputDir, 'extract-audit.local.json'), `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
  await fs.writeFile(summaryPath, summaryMarkdown(audit, totals, generatedAt), 'utf8');

  console.log(JSON.stringify({
    generatedAt,
    outputDir: path.relative(projectRoot, outputDir),
    summary: path.relative(projectRoot, summaryPath),
    totals,
  }, null, 2));
}

export {
  candidatesFromTranscript,
  slugify,
};

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
