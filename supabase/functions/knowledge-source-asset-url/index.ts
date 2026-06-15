// ============================================================
// EDGE FUNCTION: knowledge-source-asset-url
//
// Media o acesso às fontes visuais bibliográficas em Storage privado.
// O cliente só envia assetKey; bucket/object_path vêm do manifesto
// `knowledge_source_assets`, protegido por RLS e consultado via service role.
//
// Segurança:
//  * apenas POST;
//  * exige sessão Supabase válida;
//  * exige SuperAdm ativo e sem troca de senha pendente;
//  * não lista assets;
//  * não aceita bucket, objectPath nem expiração do cliente;
//  * URL assinada curta, sem logar signedUrl/object_path.
// ============================================================

import {
  assertSuperAdmin,
  corsHeaders,
  createServiceClient,
  getCallerProfile,
  jsonResponse,
  writeAuditLog,
} from '../_shared/security.ts';

const BUCKET_ID = Deno.env.get('KNOWLEDGE_SOURCE_ASSETS_BUCKET') || 'knowledge-source-assets';
const SIGNED_URL_TTL_SECONDS = 5 * 60;
const MAX_ASSET_KEY_LENGTH = 260;
const ASSET_KEY_PATTERN = /^[a-z0-9][a-z0-9._/-]{0,259}$/;

type KnowledgeSourceAsset = {
  asset_key: string;
  bucket_id: string;
  object_path: string;
  asset_kind: string;
  source_key: string | null;
  pdf_page: number | null;
  mime_type: string;
};

function isSafeAssetPath(value: unknown, maxLength = MAX_ASSET_KEY_LENGTH) {
  const text = String(value || '').trim();
  return text.length > 0
    && text.length <= maxLength
    && ASSET_KEY_PATTERN.test(text)
    && !text.includes('..')
    && !text.includes('//')
    && !text.includes('\\')
    && !text.startsWith('/');
}

function normalizePurpose(value: unknown) {
  return String(value || 'view')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 40) || 'view';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Método não permitido.' }, 405);
  }

  try {
    const supabaseAdmin = createServiceClient();
    const caller = await getCallerProfile(req, supabaseAdmin);
    if ('error' in caller) {
      return jsonResponse({ error: caller.error }, caller.status);
    }
    if (!assertSuperAdmin(caller.profile)) {
      return jsonResponse({ error: 'Acesso restrito ao SuperAdm ativo.' }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const assetKey = String(body?.assetKey || '').trim();
    if (!isSafeAssetPath(assetKey)) {
      return jsonResponse({ error: 'Fonte visual inválida.' }, 400);
    }

    const { data: asset, error: assetError } = await supabaseAdmin
      .from('knowledge_source_assets')
      .select('asset_key,bucket_id,object_path,asset_kind,source_key,pdf_page,mime_type')
      .eq('asset_key', assetKey)
      .eq('bucket_id', BUCKET_ID)
      .eq('is_active', true)
      .maybeSingle<KnowledgeSourceAsset>();

    if (assetError) {
      console.error('knowledge-source-asset-url: manifesto falhou', assetError.message);
      return jsonResponse({ error: 'Não foi possível validar a fonte visual.' }, 500);
    }
    if (!asset) {
      return jsonResponse({ error: 'Fonte visual não encontrada.' }, 404);
    }
    if (!isSafeAssetPath(asset.object_path, 512)) {
      console.error('knowledge-source-asset-url: object_path inseguro no manifesto', asset.asset_key);
      return jsonResponse({ error: 'Manifesto de fonte inválido.' }, 500);
    }

    const { data: signedData, error: signedError } = await supabaseAdmin.storage
      .from(BUCKET_ID)
      .createSignedUrl(asset.object_path, SIGNED_URL_TTL_SECONDS);

    if (signedError || !signedData?.signedUrl) {
      console.error('knowledge-source-asset-url: assinatura falhou', signedError?.message || 'sem signedUrl');
      return jsonResponse({ error: 'Fonte visual indisponível no Storage privado.' }, 404);
    }

    await writeAuditLog(supabaseAdmin, {
      actorId: caller.profile.id,
      action: 'knowledge_source_asset_signed_url',
      details: {
        assetKey: asset.asset_key,
        assetKind: asset.asset_kind,
        sourceKey: asset.source_key,
        pdfPage: asset.pdf_page,
        purpose: normalizePurpose(body?.purpose),
      },
    });

    return jsonResponse({
      assetKey: asset.asset_key,
      signedUrl: signedData.signedUrl,
      expiresIn: SIGNED_URL_TTL_SECONDS,
      assetKind: asset.asset_kind,
      sourceKey: asset.source_key,
      pdfPage: asset.pdf_page,
      mimeType: asset.mime_type,
    });
  } catch (error) {
    console.error('knowledge-source-asset-url:', error instanceof Error ? error.message : 'erro inesperado');
    return jsonResponse({ error: 'Erro inesperado ao proteger a fonte visual.' }, 500);
  }
});
