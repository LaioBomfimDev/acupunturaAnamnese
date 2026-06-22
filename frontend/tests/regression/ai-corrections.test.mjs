import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fnDir = path.resolve(root, '../supabase/functions');

// As 5 superfícies de IA e o arquivo da Edge Function de cada uma,
// com o literal de superfície esperado na injeção de correções.
const SURFACES = [
  { id: 'tongue', file: 'analyze-tongue/index.ts' },
  { id: 'anamnese_marks', file: 'suggest-marks/index.ts' },
  { id: 'clinical_reasoning', file: 'clinical-reasoning/index.ts' },
  { id: 'narrative', file: 'draft-narrative/index.ts' },
  { id: 'library_qa', file: 'library-qa/index.ts' },
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

test('AI_SURFACES cobre exatamente as 5 superfícies de IA', () => {
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

test('as 5 Edge Functions importam e aplicam as lições de correção', async () => {
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
});

// ===== Migração: tabela e CHECK de superfícies =====

test('a migração ai_corrections cobre as 5 superfícies e o gate de aprovação', async () => {
  const source = await readFile(
    path.resolve(root, '../supabase/migrations/20260619_ai_corrections.sql'),
    'utf8',
  );
  for (const { id } of SURFACES) {
    assert.ok(source.includes(`'${id}'`), `CHECK de surface deve incluir '${id}'`);
  }
  for (const status of ['pending', 'approved', 'rejected']) {
    assert.ok(source.includes(`'${status}'`), `CHECK de status deve incluir '${status}'`);
  }
  assert.match(source, /ENABLE ROW LEVEL SECURITY/, 'a tabela precisa de RLS');
  assert.match(source, /author_id = auth\.uid\(\)/, 'a autora só insere/le as próprias');
  assert.match(source, /is_super_admin/, 'SuperAdm gerencia a curadoria');
});
