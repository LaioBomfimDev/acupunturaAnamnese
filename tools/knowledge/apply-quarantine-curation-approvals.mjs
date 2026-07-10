#!/usr/bin/env node
/**
 * Aplica aprovacoes locais da planilha de quarentena.
 *
 * Escopo:
 * - local only;
 * - nao migra para Supabase/producao;
 * - aprova apenas entradas com localizacao revisada e sem baixa confianca/Tier C;
 * - preserva auditoria da quarentena anterior em `dataQuality`.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_REVIEWS_PATH = path.join(root, 'frontend', '.local-source-assets', 'atlas-ednea', 'high-confidence-reviews.json');
const DEFAULT_WORKSHEET_PATH = path.join(root, 'docs', 'quarantine-curation-worksheet.json');
const DEFAULT_REPORT_JSON_PATH = path.join(root, 'docs', 'quarantine-curation-approval.json');
const DEFAULT_REPORT_MD_PATH = path.join(root, 'docs', 'quarantine-curation-approval.md');

const APPROVAL_METHOD = 'operator_approved_quarantine_worksheet';
const WORKSHEET_SOURCE = 'docs/quarantine-curation-worksheet.json';
const FIELDS = {
  location: 'locationText',
  actions: 'actions',
  indications: 'indications',
  needling: 'needling',
};

function keyFor(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/^ACUPOINT:/, '')
    .replace(/[^A-Z0-9]/g, '');
}

function textValue(suggestion) {
  return String(suggestion?.value || '').trim();
}

function listValue(suggestion) {
  const text = textValue(suggestion);
  if (!text || text === '—') return [];
  return [text];
}

function hasLowConfidenceSuggestion(entry) {
  return Object.values(entry?.suggestions || {})
    .some(suggestion => String(suggestion?.confidence || '').toLowerCase() === 'baixa');
}

export function isEntryEligibleForLocalApproval(entry) {
  if (!entry || entry.tier === 'C') return false;
  if (hasLowConfidenceSuggestion(entry)) return false;
  return Boolean(textValue(entry.suggestions?.location));
}

function appliedFieldsFor(entry) {
  const suggestions = entry.suggestions || {};
  return Object.fromEntries(Object.keys(FIELDS).map(field => [
    field,
    Boolean(textValue(suggestions[field])),
  ]));
}

function clinicalNoteWithCuration(review, entry, approvedAt) {
  const base = String(review?.clinicalNote || '').trim();
  const date = approvedAt.slice(0, 10);
  const note = [
    `Curadoria de quarentena aprovada localmente em ${date} por solicitação explícita do operador.`,
    `Campos revisados aplicados de ${WORKSHEET_SOURCE}.`,
    'Manter auditoria profissional final antes de banco/produção.',
    entry.crossNote ? `Correção: ${entry.crossNote}` : '',
    entry.reviewNote ? `Nota: ${entry.reviewNote}` : '',
  ].filter(Boolean).join(' ');

  if (base.includes('Curadoria de quarentena aprovada localmente')) return base;
  return [base, note].filter(Boolean).join(' ');
}

export function applyEntryToReview(review, entry, approvedAt) {
  const previousDataQuality = review.dataQuality ? structuredClone(review.dataQuality) : null;
  const suggestions = entry.suggestions || {};

  return {
    ...review,
    status: 'approved_local',
    locationText: textValue(suggestions.location),
    actions: listValue(suggestions.actions),
    indications: listValue(suggestions.indications),
    needling: textValue(suggestions.needling),
    approvalMode: 'local_only',
    requiresProfessionalAudit: true,
    updatedAt: approvedAt,
    clinicalNote: clinicalNoteWithCuration(review, entry, approvedAt),
    dataQuality: {
      status: 'curated_approved_local',
      blockedFromClinical: false,
      previousStatus: previousDataQuality?.status || null,
      previousBlockedFromClinical: previousDataQuality?.blockedFromClinical === true,
      previousIssues: previousDataQuality?.issues || [],
      previousMissingEssential: previousDataQuality?.missingEssential || [],
      approvedAt,
      approvalMode: 'local_only',
      approvalMethod: APPROVAL_METHOD,
      sourceWorksheet: WORKSHEET_SOURCE,
      requiresProfessionalAudit: true,
      appliedFields: appliedFieldsFor(entry),
    },
    enrichment: {
      ...(review.enrichment || {}),
      quarantineCuration: {
        approvedAt,
        approvalMode: 'local_only',
        approvalMethod: APPROVAL_METHOD,
        sourceWorksheet: WORKSHEET_SOURCE,
        requiresProfessionalAudit: true,
        appliedFields: appliedFieldsFor(entry),
      },
    },
  };
}

export function applyQuarantineCurationApprovals({ reviewsPayload, worksheet, approvedAt = new Date().toISOString() }) {
  const entriesByCode = new Map((worksheet.entries || []).map(entry => [keyFor(entry.code), entry]));
  const approved = [];
  const skipped = [];

  const reviews = (reviewsPayload.reviews || []).map(review => {
    const entry = entriesByCode.get(keyFor(review.code || review.displayCode));
    if (!entry) return review;

    if (!isEntryEligibleForLocalApproval(entry)) {
      skipped.push({
        code: entry.code,
        tier: entry.tier,
        reason: entry.tier === 'C'
          ? 'sem fonte utilizavel'
          : hasLowConfidenceSuggestion(entry)
            ? 'baixa confianca'
            : 'sem localizacao revisada',
      });
      return review;
    }

    approved.push({
      code: entry.code,
      tier: entry.tier,
      fields: appliedFieldsFor(entry),
    });
    return applyEntryToReview(review, entry, approvedAt);
  });

  return {
    payload: {
      ...reviewsPayload,
      generatedAt: approvedAt,
      approvalMode: 'local_only',
      source: {
        ...(reviewsPayload.source || {}),
        quarantineCurationWorksheet: WORKSHEET_SOURCE,
      },
      counts: {
        ...(reviewsPayload.counts || {}),
        quarantineCuratedLocalApproved: approved.length,
        quarantineCurationSkipped: skipped.length,
      },
      quarantineCuration: {
        approvedAt,
        approvalMode: 'local_only',
        approvalMethod: APPROVAL_METHOD,
        sourceWorksheet: WORKSHEET_SOURCE,
        requiresProfessionalAudit: true,
        approvedCodes: approved.map(item => item.code),
        skippedCodes: skipped.map(item => item.code),
      },
      reviews,
    },
    report: {
      schemaVersion: 1,
      generatedAt: approvedAt,
      approvalMode: 'local_only',
      approvalMethod: APPROVAL_METHOD,
      sourceWorksheet: WORKSHEET_SOURCE,
      approved,
      skipped,
      counts: {
        approved: approved.length,
        skipped: skipped.length,
      },
    },
  };
}

function renderReport(report) {
  const approvedRows = report.approved
    .map(item => `- ${item.code}: Tier ${item.tier}; campos aplicados: ${Object.entries(item.fields).filter(([, ok]) => ok).map(([field]) => field).join(', ')}`)
    .join('\n');
  const skippedRows = report.skipped
    .map(item => `- ${item.code}: Tier ${item.tier}; motivo: ${item.reason}`)
    .join('\n');

  return `# Aprovação local da planilha de quarentena

Gerado em: ${report.generatedAt}

## Escopo

- Aprovação local somente (approvalMode: local_only).
- Não migra para Supabase/produção.
- Mantém requiresProfessionalAudit: true.
- Aplica apenas entradas com localização revisada e sem baixa confiança/Tier C.

## Aprovados localmente

${approvedRows || '- Nenhum.'}

## Mantidos em quarentena

${skippedRows || '- Nenhum.'}
`;
}

export async function run({
  reviewsPath = DEFAULT_REVIEWS_PATH,
  worksheetPath = DEFAULT_WORKSHEET_PATH,
  reportJsonPath = DEFAULT_REPORT_JSON_PATH,
  reportMdPath = DEFAULT_REPORT_MD_PATH,
} = {}) {
  const [reviewsPayload, worksheet] = await Promise.all([
    fs.readFile(reviewsPath, 'utf8').then(JSON.parse),
    fs.readFile(worksheetPath, 'utf8').then(JSON.parse),
  ]);
  const result = applyQuarantineCurationApprovals({ reviewsPayload, worksheet });

  await fs.writeFile(reviewsPath, `${JSON.stringify(result.payload, null, 2)}\n`, 'utf8');
  await fs.writeFile(reportJsonPath, `${JSON.stringify(result.report, null, 2)}\n`, 'utf8');
  await fs.writeFile(reportMdPath, renderReport(result.report), 'utf8');

  return result.report;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1] === fileURLToPath(import.meta.url)) {
  run().then(report => {
    console.log(JSON.stringify(report.counts, null, 2));
  }).catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
