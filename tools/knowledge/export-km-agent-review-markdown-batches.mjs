import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');

const DEFAULT_INPUT = path.join(projectRoot, 'docs', 'km-agent-review-inputs.json');
const DEFAULT_OUTPUT_DIR = path.join(projectRoot, 'docs', 'km-agent-pacote-llm-md');
const DEFAULT_BATCH_SIZE = 20;

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

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeText(filePath, text) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, text, 'utf8');
}

function csv(values = []) {
  return values.filter(Boolean).join(', ');
}

function acukgIndications(item) {
  return (item.sourceContext?.acukg?.indications || [])
    .slice(0, 20)
    .map(indication => indication.ptBrDraft || indication.original)
    .filter(Boolean);
}

function acukgActions(item) {
  return (item.sourceContext?.acukg?.actionTargets || [])
    .slice(0, 20)
    .map(action => `${action.relation || 'relacao'}: ${action.target || ''}`.trim())
    .filter(Boolean);
}

function acukgAnatomy(item) {
  const anatomy = item.sourceContext?.acukg?.anatomy || {};
  const groups = [
    ...(anatomy.locatedNear || []),
    ...(anatomy.partOf || []),
    ...(anatomy.directionOf || []),
    ...(anatomy.distanceOf || []),
  ];
  return groups
    .slice(0, 20)
    .map(entry => [entry.Relation, entry.Anatomy].filter(Boolean).join(' '))
    .filter(Boolean);
}

function fenced(value) {
  const text = String(value || '').trim();
  return text ? `\n${text}\n` : '\n\n';
}

function pointBlock(item, number) {
  const review = item.reviewInputs || {};
  const source = item.sourceContext || {};
  const location = source.importedLocation || {};
  const needling = source.importedNeedling || {};
  const names = source.names || {};

  return `## ${number}. ${review.code || source.code || item.sourceDraftId} - ${review.title || source.titlePtBr || ''}

IDENTIFICADOR: ${item.sourceDraftId}
CODIGO WHO: ${review.code || ''}
CODIGO EXIBIDO: ${review.displayCode || ''}
MERIDIANO: ${review.meridianCode || ''} - ${review.meridian || ''}
NOMES: ${csv([names.pinyin, names.en, names.zh, names.ko])}

### Contexto importado

Localizacao original EN:
${fenced(location.originalEn)}
Localizacao original KO:
${fenced(location.originalKo)}
Localizacao pt-BR rascunho:
${fenced(review.locationText)}
Tecnica/aguilhamento original:
${fenced(needling.original)}
Tecnica/aguilhamento pt-BR rascunho:
${fenced(review.needling)}
Termos nao resolvidos: ${csv(needling.unresolvedTerms || []) || 'nenhum registrado'}

### Sugestoes AcuKG nao revisadas

Indicacoes: ${csv(acukgIndications(item)) || 'sem sugestoes'}
Alvos/acoes: ${csv(acukgActions(item)) || 'sem sugestoes'}
Anatomia: ${csv(acukgAnatomy(item)) || 'sem sugestoes'}

### Preencher resposta para este ponto

Mantenha o IDENTIFICADOR exatamente igual. Preencha em pt-BR. Se faltar fonte, deixe vazio e explique na nota.

IDENTIFICADOR: ${item.sourceDraftId}
code: ${review.code || ''}
displayCode: ${review.displayCode || ''}
title:
meridianCode: ${review.meridianCode || ''}
meridian: ${review.meridian || ''}
techniques:
locationText:
actions:
indications:
cautions:
relatedPatterns:
needling:
clinicalNote:
references: PDF principal, pagina/secao:
confidence: low | medium | high
requiresHumanReview: true
`;
}

function instructions() {
  return `# Pacote KM-Agent para IA sem JSON

Este pacote existe porque algumas IAs recusam arquivos JSON grandes.
Use os arquivos Markdown de lote no lugar do JSON.

## Como enviar para a outra IA

1. Anexe o PDF clinico principal.
2. Anexe um lote por vez, por exemplo \`lote-001.md\`.
3. Peça para a IA responder preenchendo os campos abaixo de cada ponto.
4. Repita com os proximos lotes.

## Regra de fonte

1. O PDF clinico principal vem primeiro.
2. O contexto KM-Agent e rascunho.
3. AcuKG e apenas sugestao nao revisada.
4. Se nao houver evidencia, deixar campo vazio e explicar em \`clinicalNote\`.

## Campos a preencher

- \`title\`
- \`techniques\`
- \`locationText\`
- \`actions\`
- \`indications\`
- \`cautions\`
- \`relatedPatterns\`
- \`needling\`
- \`clinicalNote\`
- \`references\`
- \`confidence\`

Preserve sempre \`IDENTIFICADOR\`, \`code\`, \`displayCode\`, \`meridianCode\` e \`meridian\`, exceto se o PDF principal mostrar erro claro.

## Prompt curto sugerido

Preencha este lote de pontos de acupuntura em pt-BR usando primeiro o PDF clinico anexado. Use o contexto KM-Agent apenas como rascunho e AcuKG apenas como sugestao. Responda no mesmo formato do arquivo, mantendo o IDENTIFICADOR de cada ponto. Nao invente informacao clinica; quando nao houver fonte, deixe vazio e explique em clinicalNote.
`;
}

function batchText(items, batchIndex, batchCount, startIndex) {
  const first = items[0]?.reviewInputs?.code || 'inicio';
  const last = items[items.length - 1]?.reviewInputs?.code || 'fim';
  const blocks = items.map((item, index) => pointBlock(item, startIndex + index + 1)).join('\n---\n\n');

  return `# Lote ${String(batchIndex + 1).padStart(3, '0')} de ${String(batchCount).padStart(3, '0')} - ${first} a ${last}

Use junto com o PDF clinico principal. Preencha em pt-BR, preserve os identificadores e nao transforme sugestoes em aprovacao clinica.

${blocks}
`;
}

const args = parseArgs(process.argv.slice(2));
const inputPath = path.resolve(args.input || DEFAULT_INPUT);
const outputDir = path.resolve(args.outputDir || DEFAULT_OUTPUT_DIR);
const batchSize = Number(args.batchSize || DEFAULT_BATCH_SIZE);

const payload = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
if (!Array.isArray(payload.items)) {
  throw new Error(`Arquivo de entrada invalido: ${inputPath}`);
}

ensureDir(outputDir);
writeText(path.join(outputDir, '00-instrucoes.md'), instructions());

const batchCount = Math.ceil(payload.items.length / batchSize);
for (let index = 0; index < batchCount; index += 1) {
  const start = index * batchSize;
  const batch = payload.items.slice(start, start + batchSize);
  const fileName = `lote-${String(index + 1).padStart(3, '0')}.md`;
  writeText(path.join(outputDir, fileName), batchText(batch, index, batchCount, start));
}

console.log(`Wrote ${batchCount} Markdown batches to ${outputDir}`);
