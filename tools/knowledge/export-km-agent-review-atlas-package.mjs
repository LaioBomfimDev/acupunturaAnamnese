import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');

const INPUT_PATH = path.join(projectRoot, 'docs', 'km-agent-review-inputs.json');
const OUTPUT_DIR = path.join(projectRoot, 'docs', 'km-agent-pacote-atlas-ednea');
const MAX_POINTS_PER_BATCH = 25;

const MERIDIAN_ORDER = [
  'LU',
  'LI',
  'ST',
  'SP',
  'HT',
  'SI',
  'BL',
  'KI',
  'PC',
  'TE',
  'GB',
  'LR',
  'CV',
  'GV',
  'EX-HN',
  'EX-B',
  'EX-CA',
  'EX-UE',
  'EX-LE',
  'AA',
  'SA',
];

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeText(filePath, text) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, text, 'utf8');
}

function cleanFilePart(value) {
  return String(value || 'SEM-MERIDIANO')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toUpperCase();
}

function joinList(values = []) {
  return values.filter(Boolean).join(', ');
}

function compactText(value) {
  return String(value || '').trim() || '(vazio)';
}

function acukgIndications(item) {
  return (item.sourceContext?.acukg?.indications || [])
    .slice(0, 16)
    .map(indication => indication.ptBrDraft || indication.original)
    .filter(Boolean);
}

function acukgActions(item) {
  return (item.sourceContext?.acukg?.actionTargets || [])
    .slice(0, 16)
    .map(action => [action.relation, action.target].filter(Boolean).join(': '))
    .filter(Boolean);
}

function acukgAnatomy(item) {
  const anatomy = item.sourceContext?.acukg?.anatomy || {};
  return [
    ...(anatomy.locatedNear || []),
    ...(anatomy.partOf || []),
    ...(anatomy.directionOf || []),
    ...(anatomy.distanceOf || []),
  ]
    .slice(0, 16)
    .map(entry => [entry.Relation, entry.Anatomy].filter(Boolean).join(' '))
    .filter(Boolean);
}

function pointMarkdown(item, itemIndex) {
  const review = item.reviewInputs || {};
  const source = item.sourceContext || {};
  const location = source.importedLocation || {};
  const needling = source.importedNeedling || {};
  const names = source.names || {};

  return `## ${itemIndex}. ${review.code || source.code || item.sourceDraftId}

IDENTIFICADOR: ${item.sourceDraftId}
code: ${review.code || ''}
displayCode: ${review.displayCode || ''}
title atual: ${review.title || source.titlePtBr || ''}
meridianCode: ${review.meridianCode || ''}
meridian: ${review.meridian || ''}
nomes: ${joinList([names.pinyin, names.en, names.zh, names.ko]) || '(vazio)'}

### Rascunho e contexto

Localizacao EN:
${compactText(location.originalEn)}

Localizacao KO:
${compactText(location.originalKo)}

Localizacao pt-BR rascunho:
${compactText(review.locationText)}

Agulhamento original:
${compactText(needling.original)}

Agulhamento pt-BR rascunho:
${compactText(review.needling)}

Termos nao resolvidos: ${joinList(needling.unresolvedTerms || []) || 'nenhum registrado'}

Sugestoes AcuKG - indicacoes: ${joinList(acukgIndications(item)) || 'sem sugestoes'}
Sugestoes AcuKG - acoes/alvos: ${joinList(acukgActions(item)) || 'sem sugestoes'}
Sugestoes AcuKG - anatomia: ${joinList(acukgAnatomy(item)) || 'sem sugestoes'}
`;
}

function promptFile() {
  return `# Prompt pronto para a outra IA

Use este prompt junto com o PDF clinico principal e um arquivo de lote.

---

Voce vai preencher um lote de rascunhos KM-Agent para revisao profissional de pontos de acupuntura.

Fonte primaria obrigatoria: Atlas da Ednea Martins anexado nesta conversa. Use-o primeiro para localizacao, acoes, indicacoes, cautelas e agulhamento. Quando possivel, inclua pagina/secao em \`references\`.

Fonte secundaria: o texto do lote anexado. Ele contem rascunhos KM-Agent e sugestoes AcuKG. Use KM-Agent como rascunho e AcuKG apenas como sugestao nao revisada.

Regras:
- Responda apenas JSON valido, sem Markdown.
- Preencha todos os pontos do lote.
- Preserve \`sourceDraftId\`, \`code\`, \`displayCode\`, \`meridianCode\` e \`meridian\`, exceto se o Atlas mostrar erro claro.
- Responda em pt-BR.
- Campos de lista devem ser strings separadas por virgula.
- Nao invente informacao clinica. Se faltar fonte, deixe o campo vazio e explique em \`clinicalNote\`.
- Nao aprove clinicamente; mantenha \`requiresHumanReview: true\`.

Formato exato da resposta:

\`\`\`json
{
  "schemaVersion": "km-agent-review-inputs.answer.v1",
  "items": [
    {
      "sourceDraftId": "acupoint:LU1",
      "reviewInputs": {
        "code": "LU1",
        "displayCode": "LU1",
        "title": "",
        "meridianCode": "LU",
        "meridian": "Pulmao",
        "techniques": "",
        "locationText": "",
        "actions": "",
        "indications": "",
        "cautions": "",
        "relatedPatterns": "",
        "needling": "",
        "clinicalNote": ""
      },
      "references": [
        {
          "field": "locationText",
          "source": "Atlas da Ednea Martins",
          "page": null,
          "note": ""
        }
      ],
      "confidence": "low | medium | high",
      "requiresHumanReview": true
    }
  ]
}
\`\`\`
`;
}

function howToUseFile(batchCount, itemCount) {
  return `# Como usar o pacote Atlas Ednea

Este pacote foi criado para a IA que nao aceita o JSON grande de entrada.

Total de pontos: ${itemCount}
Total de lotes: ${batchCount}
Tamanho maximo por lote: ${MAX_POINTS_PER_BATCH} pontos

## Fluxo recomendado

1. Anexe o PDF clinico principal: Atlas da Ednea Martins.
2. Cole ou anexe \`00-prompt-pronto.md\`.
3. Anexe um unico lote, por exemplo \`01-LU-001.md\`.
4. Peca para a IA responder apenas JSON valido.
5. Salve a resposta como arquivo, por exemplo \`resposta-01-LU-001.json\`.
6. Repita o processo para os proximos lotes.
7. Depois envie as respostas para conversao/importacao.

## Por que nao mandar tudo de uma vez

O arquivo JSON completo tem muitos dados. Em lotes por meridiano/subgrupo, a IA consegue consultar o PDF com mais precisao e a resposta tem menor chance de ser cortada.
`;
}

function batchFile(items, batchName, sequence, totalBatches) {
  const first = items[0]?.reviewInputs?.code || '';
  const last = items[items.length - 1]?.reviewInputs?.code || '';
  const body = items.map((item, index) => pointMarkdown(item, index + 1)).join('\n---\n\n');

  return `# ${batchName}

Lote ${sequence} de ${totalBatches}
Pontos: ${first} a ${last}

Use com o PDF clinico principal e responda apenas JSON valido no formato pedido em \`00-prompt-pronto.md\`.

${body}
`;
}

const payload = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf8'));
const items = payload.items || [];
const groups = new Map();

for (const item of items) {
  const key = item.reviewInputs?.meridianCode || item.sourceContext?.meridian?.code || 'SEM-MERIDIANO';
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(item);
}

const orderedKeys = [
  ...MERIDIAN_ORDER.filter(key => groups.has(key)),
  ...[...groups.keys()].filter(key => !MERIDIAN_ORDER.includes(key)).sort(),
];

const batches = [];
for (const key of orderedKeys) {
  const groupItems = groups.get(key);
  for (let index = 0; index < groupItems.length; index += MAX_POINTS_PER_BATCH) {
    const chunk = groupItems.slice(index, index + MAX_POINTS_PER_BATCH);
    const chunkNumber = Math.floor(index / MAX_POINTS_PER_BATCH) + 1;
    batches.push({
      key,
      chunkNumber,
      items: chunk,
      fileName: `${String(batches.length + 1).padStart(2, '0')}-${cleanFilePart(key)}-${String(chunkNumber).padStart(3, '0')}.md`,
    });
  }
}

ensureDir(OUTPUT_DIR);
writeText(path.join(OUTPUT_DIR, '00-como-usar.md'), howToUseFile(batches.length, items.length));
writeText(path.join(OUTPUT_DIR, '00-prompt-pronto.md'), promptFile());

for (let index = 0; index < batches.length; index += 1) {
  const batch = batches[index];
  const name = `Meridiano ${batch.key} - sublote ${batch.chunkNumber}`;
  writeText(path.join(OUTPUT_DIR, batch.fileName), batchFile(batch.items, name, index + 1, batches.length));
}

console.log(`Wrote ${batches.length} Atlas/Ednea Markdown batches to ${OUTPUT_DIR}`);
