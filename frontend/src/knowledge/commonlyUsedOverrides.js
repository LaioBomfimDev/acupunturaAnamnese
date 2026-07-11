// ============================================================
// Overrides de "pontos comumente usados"
//
// A lista canônica em commonlyUsedPoints.js é estática. Quando a
// Acupunturista Revisora propõe promover um ponto oculto → comumente
// usado e o SuperAdm aprova, a promoção entra aqui (camada live), sem
// editar o arquivo estático. Nada é removido — só promovido.
//
// Persistência: localStorage (aplica imediatamente no navegador que
// aprovou). O passo de "commit" para todos os usuários é exportar essas
// chaves para um arquivo gerado versionado (futuro), como no restante da
// curadoria (padrão local + export JSON).
//
// Chaves normalizadas:
//   - corporal:  normalizePointCode(code)     ex.: "GB34"
//   - auricular: "auricular:<slug>"           ex.: "auricular:shen-men"
// ============================================================

import { normalizePointCode } from './aliases';

const STORAGE_KEY = 'acup_commonly_used_overrides_v1';

function readStore() {
  if (typeof localStorage === 'undefined') return [];
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeStore(keys) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(new Set(keys))));
}

export function normalizeOverrideKey(key) {
  const raw = String(key || '').trim();
  if (!raw) return '';
  if (/^auricular:/i.test(raw)) {
    return `auricular:${raw.replace(/^auricular:/i, '').toLowerCase()}`;
  }
  return normalizePointCode(raw);
}

/** Conjunto (Set) das chaves atualmente promovidas. */
export function getCommonlyUsedOverrideSet() {
  return new Set(readStore().map(normalizeOverrideKey).filter(Boolean));
}

/** true se a chave (código corporal ou auricular:slug) foi promovida. */
export function isCommonlyUsedOverride(key) {
  const normalized = normalizeOverrideKey(key);
  if (!normalized) return false;
  return getCommonlyUsedOverrideSet().has(normalized);
}

/** Promove uma chave. Retorna o conjunto atualizado. */
export function addCommonlyUsedOverride(key) {
  const normalized = normalizeOverrideKey(key);
  if (!normalized) return getCommonlyUsedOverrideSet();
  const keys = readStore().map(normalizeOverrideKey).filter(Boolean);
  keys.push(normalized);
  writeStore(keys);
  return getCommonlyUsedOverrideSet();
}

/** Remove uma promoção (desfazer). */
export function removeCommonlyUsedOverride(key) {
  const normalized = normalizeOverrideKey(key);
  const keys = readStore().map(normalizeOverrideKey).filter(k => k && k !== normalized);
  writeStore(keys);
  return getCommonlyUsedOverrideSet();
}
