import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fnDir = path.resolve(root, '../supabase/functions');

// As superfícies de IA e o arquivo da Edge Function de cada uma,
// com o literal de superfície esperado na injeção de correções.
// 'anamnese_marks' saiu: a sugestão de marcações da anamnese de MTC foi
// removida do produto. O rótulo histórico continua em AI_SURFACE_LABELS
// para as correções antigas, mas não há mais superfície ativa.
const SURFACES = [
  { id: 'tongue', file: 'analyze-tongue/index.ts' },
  { id: 'clinical_reasoning', file: 'clinical-reasoning/index.ts' },
  { id: 'narrative', file: 'draft-narrative/index.ts' },
  { id: 'library_qa', file: 'library-qa/index.ts' },
  { id: 'food_research', file: 'food-research/index.ts' },
  { id: 'psych_marks', file: 'psych-suggest-marks/index.ts' },
  { id: 'psych_reading', file: 'psych-reading/index.ts' },
];

// A CHECK de surface começou no 20260619 e foi ampliada em migrações seguintes.
const SURFACE_MIGRATIONS = [
  '../supabase/migrations/20260619_ai_corrections.sql',
  '../supabase/migrations/20260705_ai_corrections_food_research.sql',
  '../supabase/migrations/20260711_ai_corrections_psychology.sql',
];

let server;
let aiCorrectionService;

before(async () => {
  server = await createServer({
    root,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  });
  aiCorrectionService = await server.ssrLoadModule('/src/services/aiCorrectionService.js');
});

after(async () => {
  await server?.close();
});

// ===== Serviço do frontend =====

test('AI_SURFACES cobre exatamente as superfícies de IA', () => {
  const { AI_SURFACES } = aiCorrectionService;
  assert.deepEqual(
    Object.values(AI_SURFACES).sort(),
    SURFACES.map(s => s.id).sort(),
    'AI_SURFACES deve casar com as superfícies das Edge Functions',
  );
});

test('todo surface tem rótulo legível', () => {
  const { AI_SURFACES, AI_SURFACE_LABELS } = aiCorrectionService;
  for (const surface of Object.values(AI_SURFACES)) {
    assert.ok(AI_SURFACE_LABELS[surface], `falta rótulo para a superfície "${surface}"`);
  }
});

test('submitAiCorrection rejeita superfície inválida antes de qualquer rede', async () => {
  const { submitAiCorrection } = aiCorrectionService;
  await assert.rejects(
    () => submitAiCorrection({ surface: 'inexistente', correctionText: 'algo' }),
    /Superfície de IA inválida/,
  );
});

test('submitAiCorrection exige a versão correta (texto não vazio)', async () => {
  const { submitAiCorrection, AI_SURFACES } = aiCorrectionService;
  await assert.rejects(
    () => submitAiCorrection({ surface: AI_SURFACES.TONGUE, correctionText: '   ' }),
    /Escreva a versão correta/,
  );
});

// ===== Edge Functions: injeção das lições de correção =====

test('as Edge Functions importam e aplicam as lições de correção', async () => {
  for (const { id, file } of SURFACES) {
    const source = await readFile(path.resolve(fnDir, file), 'utf8');
    assert.match(
      source,
      /from '\.\.\/_shared\/corrections\.ts'/,
      `${file} deve importar de _shared/corrections.ts`,
    );
    assert.match(
      source,
      /withCorrectionLessons\(/,
      `${file} deve chamar withCorrectionLessons`,
    );
    assert.ok(
      source.includes(`surface: '${id}'`),
      `${file} deve injetar com surface '${id}'`,
    );
  }
});

test('_shared/corrections.ts expõe o contrato do loop de ensino', async () => {
  const source = await readFile(path.resolve(fnDir, '_shared/corrections.ts'), 'utf8');
  for (const fn of ['fetchCorrectionLessons', 'renderCorrectionBlock', 'withCorrectionLessons']) {
    assert.ok(source.includes(`export async function ${fn}`) || source.includes(`export function ${fn}`),
      `corrections.ts deve exportar ${fn}`);
  }
  // Distingue aprovadas (autoridade) de correções da própria autora (em revisão).
  assert.match(source, /CONFIRMADAS PELA CURADORIA/, 'deve rotular as lições aprovadas');
  assert.match(source, /CORREÇÕES RECENTES DESTA PROFISSIONAL/, 'deve rotular as correções em revisão');
  // Regra de propagação: aprovadas (globais) ∪ as da própria autora.
  assert.match(source, /approval_status\.eq\.approved,author_id\.eq\./, 'deve unir aprovadas + autora');
  assert.match(source, /logOperationalEvent/, 'falhas devem usar log operacional sanitizado');
  assert.doesNotMatch(source, /error\.message|console\.error\(['"]fetchCorrectionLessons/);
});

// ===== Migração: tabela e CHECK de superfícies =====

test('a migração ai_corrections cobre as superfícies e o gate de aprovação', async () => {
  const source = await readFile(
    path.resolve(root, '../supabase/migrations/20260619_ai_corrections.sql'),
    'utf8',
  );
  // A CHECK de surface é ampliada por migrações seguintes — junta todas.
  const surfaceSql = (
    await Promise.all(SURFACE_MIGRATIONS.map(f => readFile(path.resolve(root, f), 'utf8')))
  ).join('\n');
  for (const { id } of SURFACES) {
    assert.ok(surfaceSql.includes(`'${id}'`), `CHECK de surface deve incluir '${id}'`);
  }
  for (const status of ['pending', 'approved', 'rejected']) {
    assert.ok(source.includes(`'${status}'`), `CHECK de status deve incluir '${status}'`);
  }
  assert.match(source, /ENABLE ROW LEVEL SECURITY/, 'a tabela precisa de RLS');
  assert.match(source, /author_id = auth\.uid\(\)/, 'a autora só insere/le as próprias');
  assert.match(source, /is_super_admin/, 'SuperAdm gerencia a curadoria');
});
