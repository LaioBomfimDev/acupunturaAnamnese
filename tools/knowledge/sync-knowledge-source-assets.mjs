#!/usr/bin/env node

import crypto from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..', '..');
const frontendRoot = path.join(projectRoot, 'frontend');
const localAssetRoot = path.join(frontendRoot, '.local-source-assets');
const bucketId = process.env.KNOWLEDGE_SOURCE_ASSETS_BUCKET || 'knowledge-source-assets';
const batchSize = 100;
const allowedTopLevelDirs = new Set(['atlas-ednea', 'pdf-sources']);
const dryRun = process.argv.includes('--dry-run');
const limitArg = process.argv.find(arg => arg.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : 0;

function usage() {
  return [
    'Uso:',
    '  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node tools/knowledge/sync-knowledge-source-assets.mjs',
    '',
    'Opções:',
    '  --dry-run      Lista o que seria enviado sem tocar no Supabase.',
    '  --limit=N      Envia apenas N arquivos (útil para smoke test).',
    '',
    'A service role key deve ficar apenas no ambiente local/CI seguro. Nunca coloque essa chave no frontend, Vercel ou GitHub.',
  ].join('\n');
}

function getNamedOrFirstKey(rawKeys, preferredName = 'default') {
  if (!rawKeys) return '';
  const keys = JSON.parse(rawKeys);
  return keys[preferredName] || Object.values(keys)[0] || '';
}

function jwtRole(token) {
  try {
    const [, payload] = String(token || '').split('.');
    if (!payload) return '';
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))?.role || '';
  } catch {
    return '';
  }
}

async function loadSupabaseClient() {
  const require = createRequire(import.meta.url);
  const entry = require.resolve('@supabase/supabase-js', { paths: [frontendRoot] });
  const mod = await import(pathToFileURL(entry).href);
  return mod.createClient || mod.default?.createClient;
}

function assertInside(root, candidate) {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  const relative = path.relative(resolvedRoot, resolvedCandidate);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Caminho fora da pasta permitida: ${candidate}`);
  }
}

function toAssetKey(filePath) {
  assertInside(localAssetRoot, filePath);
  return path.relative(localAssetRoot, filePath).split(path.sep).join('/');
}

function isAllowedAssetKey(assetKey) {
  return /^[a-z0-9][a-z0-9._/-]{0,259}$/.test(assetKey)
    && !assetKey.includes('..')
    && !assetKey.includes('//')
    && !assetKey.includes('\\')
    && !assetKey.startsWith('/');
}

function mimeTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.json') return 'application/json';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.txt') return 'text/plain';
  if (ext === '.pdf') return 'application/pdf';
  return 'application/octet-stream';
}

function assetKindFor(assetKey) {
  if (assetKey.endsWith('.json')) return 'manifest';
  if (/\/pages\/page-\d+\.webp$/.test(assetKey)) return 'source_page';
  if (/\/(?:text|ocr)\/page-\d+\.txt$/.test(assetKey)) return 'source_text';
  if (assetKey.endsWith('.pdf')) return 'source_pdf';
  return 'other';
}

function sourceKeyFor(assetKey) {
  const parts = assetKey.split('/');
  if (parts[0] === 'atlas-ednea') return 'atlas-ednea';
  if (parts[0] === 'pdf-sources') return parts.length > 2 ? parts[1] : 'pdf-sources';
  return parts[0] || null;
}

function pdfPageFor(assetKey) {
  const match = assetKey.match(/page-(\d+)/);
  return match ? Number(match[1]) : null;
}

async function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  await new Promise((resolve, reject) => {
    createReadStream(filePath)
      .on('data', chunk => hash.update(chunk))
      .on('error', reject)
      .on('end', resolve);
  });
  return hash.digest('hex');
}

async function* walkFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkFiles(fullPath);
    } else if (entry.isFile()) {
      yield fullPath;
    }
  }
}

async function collectAssets() {
  await fs.access(localAssetRoot);
  const assets = [];
  for await (const filePath of walkFiles(localAssetRoot)) {
    const assetKey = toAssetKey(filePath);
    if (!allowedTopLevelDirs.has(assetKey.split('/')[0])) continue;

    const mimeType = mimeTypeFor(filePath);
    if (!['application/json', 'image/webp', 'text/plain', 'application/pdf'].includes(mimeType)) continue;
    if (!isAllowedAssetKey(assetKey)) {
      throw new Error(`Asset key insegura gerada: ${assetKey}`);
    }

    const stats = await fs.stat(filePath);
    assets.push({
      filePath,
      assetKey,
      objectPath: assetKey,
      mimeType,
      byteSize: stats.size,
      assetKind: assetKindFor(assetKey),
      sourceKey: sourceKeyFor(assetKey),
      pdfPage: pdfPageFor(assetKey),
    });
  }

  assets.sort((left, right) => left.assetKey.localeCompare(right.assetKey));
  return limit > 0 ? assets.slice(0, limit) : assets;
}

async function upsertRows(supabase, rows) {
  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize);
    const { error } = await supabase
      .from('knowledge_source_assets')
      .upsert(batch, { onConflict: 'asset_key' });
    if (error) throw new Error(`Falha ao salvar manifesto: ${error.message}`);
  }
}

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY
    || getNamedOrFirstKey(process.env.SUPABASE_SECRET_KEYS);

  if (!dryRun) {
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error(`SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios.\n\n${usage()}`);
    }
    if (jwtRole(serviceRoleKey) !== 'service_role') {
      throw new Error('A chave informada não parece ser service_role. Não use anon key para este script.');
    }
  }

  const assets = await collectAssets();
  console.log(`Assets encontrados: ${assets.length}`);
  for (const asset of assets.slice(0, 8)) {
    console.log(`- ${asset.assetKey} (${asset.mimeType}, ${asset.byteSize} bytes)`);
  }

  if (dryRun) {
    console.log('Dry-run concluído. Nenhum arquivo foi enviado.');
    return;
  }

  const createClient = await loadSupabaseClient();
  if (!createClient) throw new Error('Não foi possível carregar @supabase/supabase-js a partir de frontend/node_modules.');

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: bucket, error: bucketError } = await supabase.storage.getBucket(bucketId);
  if (bucketError || !bucket) {
    throw new Error(`Bucket privado "${bucketId}" não encontrado. Rode a migration 20260615_knowledge_source_assets.sql antes.`);
  }
  if (bucket.public) {
    throw new Error(`Bucket "${bucketId}" está público. Interrompido para evitar exposição de fontes.`);
  }

  const rows = [];
  let uploaded = 0;
  for (const asset of assets) {
    const checksum = await sha256File(asset.filePath);
    const body = await fs.readFile(asset.filePath);
    const { error: uploadError } = await supabase.storage
      .from(bucketId)
      .upload(asset.objectPath, body, {
        contentType: asset.mimeType,
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Falha ao enviar ${asset.assetKey}: ${uploadError.message}`);
    }

    rows.push({
      asset_key: asset.assetKey,
      bucket_id: bucketId,
      object_path: asset.objectPath,
      asset_kind: asset.assetKind,
      source_key: asset.sourceKey,
      mime_type: asset.mimeType,
      byte_size: asset.byteSize,
      checksum_sha256: checksum,
      pdf_page: asset.pdfPage,
      metadata: {
        syncTool: 'tools/knowledge/sync-knowledge-source-assets.mjs',
      },
      is_active: true,
    });

    uploaded += 1;
    if (uploaded % 100 === 0) {
      await upsertRows(supabase, rows.splice(0, rows.length));
      console.log(`Enviados ${uploaded}/${assets.length}`);
    }
  }

  await upsertRows(supabase, rows);
  console.log(`Concluído: ${uploaded} assets enviados para bucket privado "${bucketId}".`);
}

main().catch(error => {
  console.error(error.message || error);
  process.exitCode = 1;
});
