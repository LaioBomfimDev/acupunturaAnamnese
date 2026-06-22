import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { buildPatternNormalizationMap } from '../../frontend/src/knowledge/anamneseKnowledgeCuration.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');
const defaultKnowledgeRoot = path.join(projectRoot, 'frontend', '.local-source-assets', 'pdf-sources', 'knowledge');
const defaultKnowledgeBasePath = path.join(projectRoot, 'frontend', 'src', 'knowledge', 'knowledgeBase.js');

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

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function loadPatternNames(filePath = defaultKnowledgeBasePath) {
  const text = await fs.readFile(filePath, 'utf8');
  const start = text.indexOf('export const patternDefinitions = {');
  const end = text.indexOf('export const techniqueKnowledge', start);
  if (start === -1 || end === -1) {
    throw new Error(`Nao foi possivel localizar patternDefinitions em ${filePath}`);
  }
  const block = text.slice(start, end);
  return [...block.matchAll(/^\s{2}'([^']+)':\s*\{/gmu)].map(match => match[1]);
}

export async function buildNormalizationMapFile({
  knowledgeRoot = defaultKnowledgeRoot,
  knowledgeBasePath = defaultKnowledgeBasePath,
  outputPath = path.join(knowledgeRoot, 'pattern-normalization-map.local.json'),
} = {}) {
  const findingPath = path.join(knowledgeRoot, 'finding-candidates.local.json');
  const patternPath = path.join(knowledgeRoot, 'pattern-candidates.local.json');

  if (!fsSync.existsSync(findingPath) || !fsSync.existsSync(patternPath)) {
    throw new Error(`Candidatos da fase 1 nao encontrados em ${knowledgeRoot}`);
  }

  const [findingEnvelope, patternEnvelope, knownPatternNames] = await Promise.all([
    readJson(findingPath),
    readJson(patternPath),
    loadPatternNames(knowledgeBasePath),
  ]);

  const map = buildPatternNormalizationMap({
    findings: findingEnvelope.items || [],
    patterns: patternEnvelope.items || [],
    knownPatternNames,
  });

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(map, null, 2)}\n`, 'utf8');
  return { outputPath, map };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await buildNormalizationMapFile({
    knowledgeRoot: args.knowledgeRoot || defaultKnowledgeRoot,
    knowledgeBasePath: args.knowledgeBase || defaultKnowledgeBasePath,
    outputPath: args.output || undefined,
  });

  process.stdout.write(JSON.stringify({
    outputPath: path.relative(projectRoot, result.outputPath),
    counts: result.map.counts,
  }, null, 2));
  process.stdout.write('\n');
}

const isCli = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isCli) {
  main().catch(error => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
