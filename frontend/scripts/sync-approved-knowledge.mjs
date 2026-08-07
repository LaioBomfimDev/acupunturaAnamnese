import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
import { isClinicallyActiveKnowledgeReview } from '../src/knowledge/reviewSourcePolicy.js';

const root = path.resolve(import.meta.dirname, '..');
const apply = process.argv.includes('--apply');
const sourceFiles = [
  path.join(root, '.local-source-assets', 'atlas-ednea', 'deep-curated-reviews.json'),
  path.join(root, '.local-source-assets', 'atlas-ednea', 'high-confidence-reviews.json'),
];

function rowsFrom(value) {
  if (Array.isArray(value)) return value;
  return Array.isArray(value?.reviews) ? value.reviews : [];
}

function reviewCode(review) {
  return String(
    review?.code || review?.displayCode || review?.sourceDraftId || review?.id || '',
  ).trim().toUpperCase();
}

function entityKey(review) {
  const code = reviewCode(review)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return code ? `atlas-point:${code}` : '';
}

function hasProfessionalAttestation(review) {
  const attestation = review?.professionalReview;
  return (
    review?.approvalMode === 'server_professional'
    && review?.requiresProfessionalAudit === false
    && attestation?.decision === 'approved'
    && /^[0-9a-f-]{36}$/i.test(String(attestation?.reviewerId || ''))
    && Boolean(Date.parse(attestation?.reviewedAt))
    && Boolean(String(attestation?.attestationId || '').trim())
  );
}

const merged = new Map();
for (const file of sourceFiles) {
  const parsed = JSON.parse(await readFile(file, 'utf8'));
  for (const review of rowsFrom(parsed)) {
    const code = reviewCode(review);
    if (code) merged.set(code, review);
  }
}

const allReviews = [...merged.values()];
const clinicallyActive = allReviews.filter(isClinicallyActiveKnowledgeReview);
const eligible = clinicallyActive.filter(hasProfessionalAttestation);
const blocked = clinicallyActive.length - eligible.length;

console.log(JSON.stringify({
  mode: apply ? 'apply' : 'dry-run',
  mergedReviews: allReviews.length,
  clinicallyActiveReviews: clinicallyActive.length,
  eligibleWithProfessionalAttestation: eligible.length,
  blockedWithoutProfessionalAttestation: blocked,
}, null, 2));

if (!apply) {
  console.log(
    'Dry-run concluído. Para aplicar, revise os atestados profissionais e use --apply com confirmação explícita.',
  );
  process.exit(0);
}

if (process.env.CONFIRM_KNOWLEDGE_IMPORT !== 'IMPORTAR_APROVADOS') {
  throw new Error(
    'Defina CONFIRM_KNOWLEDGE_IMPORT=IMPORTAR_APROVADOS somente após revisar o dry-run.',
  );
}
if (eligible.length === 0) {
  throw new Error('Nenhuma revisão possui gate profissional rastreável para importar.');
}

const supabaseUrl = String(process.env.SUPABASE_URL || '').trim();
const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
if (!supabaseUrl.startsWith('https://') || !serviceRoleKey) {
  throw new Error(
    'Defina SUPABASE_URL HTTPS e SUPABASE_SERVICE_ROLE_KEY somente no ambiente temporário do terminal.',
  );
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: source, error: sourceError } = await supabase
  .from('knowledge_sources')
  .upsert({
    source_key: 'atlas-ednea',
    title: 'Atlas dos Pontos de Acupuntura — Ednéa Martins',
    source_type: 'atlas_publico',
    citation: 'Ednéa Martins, Atlas dos Pontos de Acupuntura.',
    license_note: 'Fonte pública do projeto; revisar proveniência por item.',
  }, { onConflict: 'source_key' })
  .select('id')
  .single();
if (sourceError || !source?.id) {
  throw new Error(`Não foi possível garantir a fonte Atlas: ${sourceError?.code || 'sem id'}.`);
}

let imported = 0;
let unchanged = 0;
const failures = [];
for (const review of eligible) {
  const code = reviewCode(review);
  const key = entityKey(review);
  const title = String(review.title || review.names?.pt || code).trim();
  const tags = [
    code,
    review.displayCode,
    review.meridian,
    ...(Array.isArray(review.aliases) ? review.aliases : []),
  ].filter(Boolean).map(String);

  const { data, error } = await supabase.rpc('import_approved_knowledge_review', {
    p_entity_key: key,
    p_entity_type: review.category === 'auriculo'
      ? 'auricular_point'
      : 'acupoint',
    p_title: title,
    p_code: code,
    p_tags: [...new Set(tags)],
    p_payload: review,
    p_source_id: source.id,
    p_payload_checksum: null,
  });

  if (error) {
    failures.push({ code, errorCode: error.code || 'RPC_ERROR' });
    continue;
  }
  const result = Array.isArray(data) ? data[0] : data;
  if (result?.created_version === false || result?.replayed === true) unchanged += 1;
  else imported += 1;
}

console.log(JSON.stringify({
  imported,
  unchanged,
  failures,
}, null, 2));
if (failures.length) process.exitCode = 1;
