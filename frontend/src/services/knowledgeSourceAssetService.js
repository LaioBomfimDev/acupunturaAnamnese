import { supabase } from '../lib/supabase';

export const KNOWLEDGE_SOURCE_ASSET_ROUTE_PREFIX = '/knowledge/source-assets/';
export const KNOWLEDGE_SOURCE_ASSET_FUNCTION = 'knowledge-source-asset-url';

const MAX_ASSET_KEY_LENGTH = 260;
const ASSET_KEY_PATTERN = /^[a-z0-9][a-z0-9._/-]{0,259}$/;
const ABSOLUTE_URL_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;
const LOCAL_FALLBACK_ENABLED =
  Boolean(import.meta.env?.DEV)
  || import.meta.env?.VITE_ENABLE_LOCAL_SOURCE_ASSET_FALLBACK === 'true';

function hasUnsafePathFragment(value) {
  return value.includes('..')
    || value.includes('//')
    || value.includes('\\')
    || value.includes('?')
    || value.includes('#')
    || value.startsWith('/');
}

export function isValidKnowledgeSourceAssetKey(value) {
  const key = String(value || '').trim();
  return key.length > 0
    && key.length <= MAX_ASSET_KEY_LENGTH
    && ASSET_KEY_PATTERN.test(key)
    && !hasUnsafePathFragment(key);
}

function currentOrigin() {
  if (typeof window === 'undefined') return '';
  return window.location?.origin || '';
}

function pathnameFromSourceAssetUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  if (ABSOLUTE_URL_PATTERN.test(raw)) {
    try {
      const parsed = new URL(raw);
      if (parsed.origin !== currentOrigin()) return '';
      return parsed.pathname;
    } catch {
      return '';
    }
  }

  try {
    return new URL(raw, 'http://local.invalid').pathname;
  } catch {
    return '';
  }
}

export function assetKeyFromSourceAssetUrl(value) {
  const raw = String(value || '').trim();
  if (isValidKnowledgeSourceAssetKey(raw)) return raw;

  const pathname = pathnameFromSourceAssetUrl(raw);
  if (!pathname.startsWith(KNOWLEDGE_SOURCE_ASSET_ROUTE_PREFIX)) return null;

  try {
    const assetKey = decodeURIComponent(pathname.slice(KNOWLEDGE_SOURCE_ASSET_ROUTE_PREFIX.length));
    return isValidKnowledgeSourceAssetKey(assetKey) ? assetKey : null;
  } catch {
    return null;
  }
}

export function sourceAssetUrlFromKey(assetKey) {
  if (!isValidKnowledgeSourceAssetKey(assetKey)) {
    throw new Error('Chave de fonte visual inválida.');
  }

  return `${KNOWLEDGE_SOURCE_ASSET_ROUTE_PREFIX}${assetKey
    .split('/')
    .map(part => encodeURIComponent(part))
    .join('/')}`;
}

async function functionErrorMessage(error, fallback) {
  if (typeof error?.context?.json === 'function') {
    try {
      const body = await error.context.json();
      if (body?.error) return body.error;
      if (body?.message) return body.message;
    } catch {
      // corpo não-JSON: usa fallback
    }
  }
  return error?.message || fallback;
}

export async function getSignedKnowledgeSourceAssetUrl(assetKey, { purpose = 'view' } = {}) {
  if (!isValidKnowledgeSourceAssetKey(assetKey)) {
    throw new Error('Chave de fonte visual inválida.');
  }

  const { data, error } = await supabase.functions.invoke(KNOWLEDGE_SOURCE_ASSET_FUNCTION, {
    body: { assetKey, purpose },
  });

  if (error) {
    throw new Error(await functionErrorMessage(error, 'Não foi possível gerar URL assinada da fonte.'));
  }
  if (data?.error) {
    throw new Error(data.error);
  }
  if (!data?.signedUrl) {
    throw new Error('Resposta sem URL assinada da fonte.');
  }

  return data.signedUrl;
}

export async function resolveKnowledgeSourceAssetUrl(value, options = {}) {
  const assetKey = assetKeyFromSourceAssetUrl(value);
  if (!assetKey) throw new Error('Fonte visual inválida.');

  const allowLocalFallback = options.allowLocalFallback ?? LOCAL_FALLBACK_ENABLED;
  if (allowLocalFallback) {
    return sourceAssetUrlFromKey(assetKey);
  }

  return getSignedKnowledgeSourceAssetUrl(assetKey, { purpose: options.purpose || 'view' });
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export async function fetchKnowledgeSourceJsonAsset(assetKeyOrUrl, fallbackUrl = '', options = {}) {
  const assetKey = assetKeyFromSourceAssetUrl(assetKeyOrUrl);
  if (!assetKey) throw new Error('Manifesto de fonte inválido.');

  const allowLocalFallback = options.allowLocalFallback ?? LOCAL_FALLBACK_ENABLED;
  const localUrl = fallbackUrl || sourceAssetUrlFromKey(assetKey);
  let localError = null;

  if (allowLocalFallback) {
    try {
      return await fetchJson(localUrl);
    } catch (error) {
      localError = error;
    }
  }

  try {
    const signedUrl = await getSignedKnowledgeSourceAssetUrl(assetKey, { purpose: options.purpose || 'manifest' });
    return await fetchJson(signedUrl);
  } catch (signedError) {
    if (localError) {
      throw new Error(
        `${signedError.message || 'Fonte protegida indisponível'}; fallback local: ${localError.message}`,
        { cause: signedError },
      );
    }
    throw signedError;
  }
}
