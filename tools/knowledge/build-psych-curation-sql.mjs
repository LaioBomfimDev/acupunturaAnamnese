#!/usr/bin/env node
/**
 * build-psych-curation-sql.mjs
 *
 * Gera um arquivo .sql com os INSERTs da base de curadoria de psicologia,
 * para o usuário simplesmente COLAR no SQL Editor do Supabase (sem terminal,
 * sem service role key). Alternativa amigável ao seed-psych-curation-items.mjs.
 *
 * Saída (área local ignorada pelo git, pois carrega trecho protegido):
 *   frontend/.local-source-assets/pdf-sources/knowledge/psicologia/
 *     seed-psych-curation-items.local.sql
 *
 * Uso: node tools/knowledge/build-psych-curation-sql.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from './build-psych-curation-worksheet.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..');
const OUT = path.join(root, 'frontend', '.local-source-assets', 'pdf-sources', 'knowledge', 'psicologia', 'seed-psych-curation-items.local.sql');

const TAG = '$psych$'; // dollar-quoting: evita escapar aspas dentro dos textos
const dq = (value) => {
  const s = String(value == null ? '' : value);
  if (s.includes(TAG)) throw new Error(`Colisão de dollar-quote no texto: ${s.slice(0, 40)}…`);
  return `${TAG}${s}${TAG}`;
};
const jsonLit = (obj) => `${dq(JSON.stringify(obj ?? null))}::jsonb`;
const textArray = (arr) => `array[${(arr || []).map(dq).join(',')}]::text[]`;

function rowsFromWorksheet(ws, batch) {
  const rows = [];
  const s = ws.sections;
  const push = (kind, g) => rows.push({
    kind,
    label: g.label,
    meta: g.meta || {},
    total: g.totalCandidates || 0,
    uniq: g.uniqueEvidence || 0,
    sources: g.sources || [],
    evidence: g.evidence || [],
  });
  for (const g of s.riskSigns.groups) push('risk', g);
  for (const g of s.reasoningAxes.groups) push('axis', g);
  for (const g of s.checklist.groups) push('checklist', g);
  s.questions.sample.forEach((e, i) => {
    rows.push({
      kind: 'question',
      label: (e.snippet || '').slice(0, 80) || `pergunta ${i + 1}`,
      meta: { totalInCorpus: s.questions.totalCandidates, note: s.questions.note },
      total: 1,
      uniq: 1,
      sources: [e.sourceLabel].filter(Boolean),
      evidence: [e],
    });
  });
  return { rows, batch };
}

const ws = build();
const batch = new Date().toISOString();
const { rows } = rowsFromWorksheet(ws, batch);

const L = [];
L.push('-- Base de curadoria de psicologia — COLE E RODE no SQL Editor do Supabase.');
L.push('-- Idempotente: apaga o lote anterior e reinsere. Não publica nada no app.');
L.push('');
L.push(`delete from public.psych_curation_items where discipline = 'psicologia';`);
L.push('');
for (const r of rows) {
  L.push(
    'insert into public.psych_curation_items ' +
    '(discipline,kind,label,meta,total_candidates,unique_evidence,sources,evidence,status,copyright,batch) values (' +
    `'psicologia',` +
    `'${r.kind}',` +
    `${dq(r.label)},` +
    `${jsonLit(r.meta)},` +
    `${r.total},` +
    `${r.uniq},` +
    `${textArray(r.sources)},` +
    `${jsonLit(r.evidence)},` +
    `'review','source-only',` +
    `${dq(batch)});`,
  );
}
L.push('');
L.push(`-- Conferência: select kind, count(*) from public.psych_curation_items group by kind;`);
L.push('');

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, L.join('\n'), 'utf8');

const byKind = rows.reduce((a, r) => ((a[r.kind] = (a[r.kind] || 0) + 1), a), {});
console.log(`[sql] ${rows.length} linhas:`, JSON.stringify(byKind));
console.log(`[sql] ${path.relative(root, OUT)}`);
