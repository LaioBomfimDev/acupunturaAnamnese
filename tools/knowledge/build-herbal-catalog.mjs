#!/usr/bin/env node
/**
 * build-herbal-catalog.mjs
 *
 * Deriva o catálogo de ervas do FRONTEND a partir da planilha de curadoria já
 * revisada (`docs/herbal-curation-worksheet.json`). É o equivalente, para a
 * LANE FITOTERÁPICA, do extrator de monografias de alimentos: transforma o
 * material de curadoria numa fonte de dados importável pela tela.
 *
 * IMPORTANTE (paradigma próprio, AGENTS.md §8): a fonte das ervas é fitoterapia
 * OCIDENTAL e NÃO traz associação MTC (natureza térmica / zang-fu). Este catálogo
 * carrega só o que a fonte tem — indicações tradicionais/populares, partes usadas,
 * toxicologia — e o resumo/cautela já curados. O status sugerido pelo worksheet
 * é `worksheetSuggestedStatus`, não liberação ao paciente. NUNCA inventa energia
 * ou órgão MTC.
 *
 * Uso: node tools/knowledge/build-herbal-catalog.mjs
 * Saída: frontend/src/knowledge/generated/herbalCatalog.js
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..');

const WORKSHEET_PATH = path.join(root, 'docs', 'herbal-curation-worksheet.json');
const OUT_PATH = path.join(root, 'frontend', 'src', 'knowledge', 'generated', 'herbalCatalog.js');

export function buildHerbalCatalog(worksheet) {
  const entries = (worksheet?.entries || []).map(e => ({
    id: e.plantId,
    commonName: e.commonName,
    scientificName: e.scientificName || '',
    botanicalFamily: e.botanicalFamily || '',
    sourcePdfPages: e.sourcePdfPages || [],
    tier: e.tier || null,
    contentReleaseStatus: 'source_only',
    publicationStatus: 'not_published',
    approvalMode: 'local_only',
    requiresProfessionalAudit: true,
    worksheetSuggestedStatus: e.suggestedStatus || 'restrito_profissional',
    educationalSummary: e.educationalSummary || '',
    cautionSummary: e.cautionSummary || '',
    partsUsed: e.source?.partsUsed || '',
    traditionalIndications: e.source?.traditionalIndications || '',
    toxicology: e.source?.toxicology || '',
    // A fonte não tem associação MTC — registrado explicitamente para a lane
    // saber que não deve tratar erva como alimento MTC.
    mtcAvailable: Boolean(e.mtcAssociation?.available),
  }));
  return entries;
}

function render(entries, worksheet) {
  const banner = `// ============================================================
// herbalCatalog — AUTO-GERADO. NÃO editar à mão.
//
// Fonte: E-book "Ervas Medicinais" (fitoterapia OCIDENTAL), via a planilha de
// curadoria docs/herbal-curation-worksheet.json (${entries.length} ervas de baixo risco).
// A fonte NÃO traz associação MTC (natureza térmica / zang-fu): mtcAvailable=false
// em todas. NÃO inventar energia/órgão MTC aqui — a ligação com a anamnese é por
// TEMA DE SINTOMA (lane fitoterápica própria), ver herbalIndicationLinking.js.
// worksheetSuggestedStatus é PROPOSTA DE REVISÃO, não publicação ao paciente.
//
// Regenerar: node tools/knowledge/build-herbal-catalog.mjs
// ============================================================

export const HERBAL_CATALOG_SOURCE = ${JSON.stringify(
    { key: 'ebook-ervas-medicinais', title: 'Ervas Medicinais (fitoterapia ocidental)', paradigm: 'fitoterapia_ocidental', generatedFrom: 'docs/herbal-curation-worksheet.json', disclaimer: worksheet?.disclaimer || '' },
    null, 2,
  )};

export const HERBAL_CATALOG = ${JSON.stringify(entries, null, 2)};
`;
  return banner;
}

function main() {
  const worksheet = JSON.parse(fs.readFileSync(WORKSHEET_PATH, 'utf8'));
  const entries = buildHerbalCatalog(worksheet);
  fs.writeFileSync(OUT_PATH, render(entries, worksheet), 'utf8');
  console.log(`herbalCatalog.js gerado com ${entries.length} ervas → ${path.relative(root, OUT_PATH)}`);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('build-herbal-catalog.mjs')) {
  main();
}
