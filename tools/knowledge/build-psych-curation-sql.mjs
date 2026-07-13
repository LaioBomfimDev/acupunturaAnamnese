#!/usr/bin/env node
/**
 * build-psych-curation-sql.mjs
 *
 * Gera o .sql que popula `psych_curation_items` a partir do RASCUNHO CURADO
 * e formulado (tools/knowledge/psych-anamnese-draft.json) — não mais do OCR
 * cru. Cada linha já é conteúdo coerente em pt-BR para a profissional revisar
 * (aprovar/editar/rejeitar). Basta colar no SQL Editor do Supabase.
 *
 * Saída: docs/seed-psych-curation-items.sql  (conteúdo é síntese, não verbatim;
 * pode ser versionado).
 *
 * Uso: node tools/knowledge/build-psych-curation-sql.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRows } from './psych-curation-rows.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..');
const OUT = path.join(root, 'docs', 'seed-psych-curation-items.sql');

const TAG = '$psych$';
const dq = (value) => {
  const s = String(value == null ? '' : value);
  if (s.includes(TAG)) throw new Error(`Colisão de dollar-quote: ${s.slice(0, 40)}…`);
  return `${TAG}${s}${TAG}`;
};
const jsonLit = (obj) => `${dq(JSON.stringify(obj ?? null))}::jsonb`;
const textArray = (arr) => `array[${(arr || []).map(dq).join(',')}]::text[]`;

const rows = buildRows();
const batch = new Date().toISOString();
const L = [];
L.push('-- Base curada da anamnese de Psicologia (rascunho formulado — síntese pt-BR).');
L.push('-- Cole e RODE no SQL Editor do Supabase. Idempotente: apaga e reinsere.');
L.push('-- Cada linha é conteúdo coerente para a profissional revisar; nada é verbatim.');
L.push('');
L.push(`delete from public.psych_curation_items where discipline = 'psicologia';`);
L.push('');
for (const r of rows) {
  L.push(
    'insert into public.psych_curation_items ' +
    '(discipline,kind,label,meta,total_candidates,unique_evidence,sources,evidence,status,copyright,batch) values (' +
    `'psicologia','${r.kind}',${dq(r.label)},${jsonLit(r.meta)},0,0,${textArray(r.sources)},'[]'::jsonb,` +
    `'review','draft-synthesis',${dq(batch)});`,
  );
}
L.push('');
L.push(`-- Conferência: select kind, count(*) from public.psych_curation_items group by kind order by kind;`);
L.push('');

fs.writeFileSync(OUT, L.join('\n'), 'utf8');
const byKind = rows.reduce((a, r) => ((a[r.kind] = (a[r.kind] || 0) + 1), a), {});
console.log(`[sql] ${rows.length} linhas:`, JSON.stringify(byKind));
console.log(`[sql] ${path.relative(root, OUT)}`);
