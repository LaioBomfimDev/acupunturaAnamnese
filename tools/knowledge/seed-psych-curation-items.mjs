#!/usr/bin/env node
/**
 * seed-psych-curation-items.mjs
 *
 * Semeia a tabela Supabase `psych_curation_items` a partir da worksheet local
 * de curadoria de psicologia (build-psych-curation-worksheet.mjs). Roda com
 * SERVICE ROLE (ignora RLS) e é idempotente: apaga o lote anterior da
 * disciplina e reinsere o atual.
 *
 * Os trechos verbatim (DSM/CID/ABA) vão para uma tabela PRIVADA, lida só por
 * revisora de psicologia + super admin (RLS). Não é publicação: nada disso
 * entra no app/RAG; é material de curadoria para a psicóloga aprovar/editar.
 *
 * Uso:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node tools/knowledge/seed-psych-curation-items.mjs
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildRows } from './psych-curation-rows.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, '..', '..', 'frontend');
const DISCIPLINE = 'psicologia';
const TABLE = 'psych_curation_items';

function usage() {
  return [
    'Faltam credenciais do Supabase. Exemplo:',
    '  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node tools/knowledge/seed-psych-curation-items.mjs',
  ].join('\n');
}

function firstKey(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  if (value.startsWith('{') || value.startsWith('[')) {
    try { const parsed = JSON.parse(value); return Object.values(parsed)[0] || ''; } catch { return ''; }
  }
  return value.split(',')[0].trim();
}

async function loadSupabaseClient() {
  const require = createRequire(import.meta.url);
  const entry = require.resolve('@supabase/supabase-js', { paths: [frontendRoot] });
  const mod = await import(pathToFileURL(entry).href);
  return mod.createClient || mod.default?.createClient;
}

// Rascunho curado (psych-anamnese-draft.json) -> linhas da tabela.
function toRows(batch) {
  return buildRows().map(r => ({
    discipline: DISCIPLINE,
    kind: r.kind,
    label: r.label,
    meta: r.meta || {},
    total_candidates: 0,
    unique_evidence: 0,
    sources: r.sources || [],
    evidence: [],
    status: 'review',
    copyright: 'draft-synthesis',
    batch,
  }));
}

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || firstKey(process.env.SUPABASE_SECRET_KEYS);
  if (!supabaseUrl || !serviceRoleKey) {
    console.error(usage());
    process.exit(1);
  }

  const createClient = await loadSupabaseClient();
  if (!createClient) throw new Error('Não foi possível carregar @supabase/supabase-js a partir de frontend/node_modules.');
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const batch = new Date().toISOString();
  const rows = toRows(batch);
  console.log(`[seed] preparando ${rows.length} linhas (lote ${batch})`);

  // Idempotência: remove o lote anterior da disciplina.
  const del = await supabase.from(TABLE).delete().eq('discipline', DISCIPLINE);
  if (del.error) throw del.error;

  // Insere em blocos.
  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error } = await supabase.from(TABLE).insert(slice);
    if (error) throw error;
    console.log(`[seed] inseridas ${Math.min(i + CHUNK, rows.length)}/${rows.length}`);
  }

  const byKind = rows.reduce((a, r) => ((a[r.kind] = (a[r.kind] || 0) + 1), a), {});
  console.log('[seed] concluído:', JSON.stringify(byKind));
}

main().catch(err => { console.error('[seed] falhou:', err?.message || err); process.exit(1); });
