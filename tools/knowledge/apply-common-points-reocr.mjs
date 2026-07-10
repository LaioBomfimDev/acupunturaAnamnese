#!/usr/bin/env node
// Aplica o RE-OCR manual (tools/knowledge/common-points-reocr.json) sobre os
// pacotes de reviews. Para os pontos comuns cujo OCR automatico era irrecuperavel,
// substitui locationText/needling/actions/indications pela transcricao fiel das
// paginas do Atlas (lida diretamente). Marca proveniencia e exige auditoria
// profissional final. NAO inventa: so escreve o que foi transcrito da fonte.
//
// Rodar DEPOIS de clean-common-points-ocr.mjs (o re-OCR tem prioridade e e' final).
// Uso: node tools/knowledge/apply-common-points-reocr.mjs [--dry]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const HIGH = path.join(ROOT, 'frontend/.local-source-assets/atlas-ednea/high-confidence-reviews.json');
const DEEP = path.join(ROOT, 'frontend/.local-source-assets/atlas-ednea/deep-curated-reviews.json');
const REOCR = path.join(__dirname, 'common-points-reocr.json');
const DRY = process.argv.includes('--dry');

const FIELDS = ['locationText', 'needling', 'actions', 'indications'];

function normCode(c) {
  return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function asArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value) return [];
  return [String(value)].filter(Boolean);
}

function isAtlasCharacteristic(value) {
  const text = String(value || '').trim();
  return /^(?:Ponto|Movimento)\b/i.test(text)
    || /\b(?:Localização|Nota de localização|Método|Funções energéticas|Indicações)\b/i.test(text)
    || /\b(?:dis1ãncia|pon10|ter ço)\b/i.test(text);
}

function mergeRelatedPatterns(existing, sourcePatterns) {
  const preserved = asArray(existing).filter(item => !isAtlasCharacteristic(item));
  const merged = [...asArray(sourcePatterns), ...preserved];
  return [...new Set(merged)];
}

function mergeCautions(existing, sourceCautions) {
  return [...new Set([...asArray(sourceCautions), ...asArray(existing)])];
}

function applyReocrEntry(review, entry) {
  for (const f of FIELDS) {
    if (entry[f] != null) review[f] = JSON.parse(JSON.stringify(entry[f]));
  }
  if (entry.title) review.title = entry.title;
  if (entry.relatedPatterns) {
    review.relatedPatterns = mergeRelatedPatterns(review.relatedPatterns, entry.relatedPatterns);
  }
  if (entry.cautions) {
    review.cautions = entry.cautionsMode === 'replace'
      ? asArray(entry.cautions)
      : mergeCautions(review.cautions, entry.cautions);
  }
  review.status = 'approved_local';
  review.approvalMode = 'local_only';
  review.clinicalSource = 'reocr_atlas';
  review.requiresProfessionalAudit = true;
  // re-OCR limpo: zera o rastro de duvidas do OCR automatico para estes campos
  if (review.ocrCleanup) review.ocrCleanup = { tool: 'apply-common-points-reocr.mjs', at: new Date().toISOString().slice(0, 10), reocr: true };
  return review;
}

function applyTo(file, reocrByCode, label) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const arr = Array.isArray(raw) ? raw : raw.reviews;
  let applied = 0;
  for (const review of arr) {
    const entry = reocrByCode.get(normCode(review.code));
    if (!entry) continue;
    applyReocrEntry(review, entry);
    applied += 1;
  }
  if (!DRY) fs.writeFileSync(file, JSON.stringify(raw, null, 2) + '\n');
  console.log(`${label}: ${applied} pontos re-OCR aplicados${DRY ? ' (dry-run)' : ''}`);
  return applied;
}

function main() {
  const reocr = JSON.parse(fs.readFileSync(REOCR, 'utf8'));
  const byCode = new Map(Object.entries(reocr.points).map(([code, data]) => [normCode(code), data]));
  console.log(`re-OCR fonte: ${byCode.size} pontos (${reocr._meta?.source || ''})`);
  applyTo(HIGH, byCode, 'high-confidence');
  applyTo(DEEP, byCode, 'deep-curated');
}

export { applyReocrEntry, mergeRelatedPatterns, normCode };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
