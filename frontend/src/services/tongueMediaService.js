// ============================================================
// SERVICE: Fotos clínicas da língua — Supabase Storage
// Bucket privado `clinical-tongue-photos`, caminho
// `therapist_id/patient_id/yyyy-mm-dd/slot-timestamp.webp`,
// RLS por pasta do terapeuta (ver migration
// 20260612_clinical_tongue_photos.sql).
//
// Privacidade (AGENTS.md §11): a imagem é redimensionada e
// re-codificada para WEBP via canvas ANTES do upload — o
// re-encode descarta todos os metadados EXIF (incluindo GPS).
// Nenhuma imagem vira base64 em clinical_records; a sessão
// guarda apenas o caminho do arquivo.
//
// Usuário local (login fallback, sem Supabase real): não há
// Storage — a foto fica apenas em memória na sessão atual e o
// chamador recebe { path: null } para exibir o aviso.
// ============================================================

import { supabase, getAuthenticatedUser } from '../lib/supabase';

export const TONGUE_PHOTOS_BUCKET = 'clinical-tongue-photos';
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1h — preview dentro da sessão de trabalho
const MAX_DIMENSION = 1600;
const WEBP_QUALITY = 0.85;

/**
 * Monta o caminho do arquivo no bucket. Puro, para ser testável.
 * O primeiro segmento DEVE ser o therapist_id — é o que a política
 * de RLS do Storage usa para isolar acesso.
 */
export function buildTonguePhotoPath(therapistId, patientId, slot, date = new Date()) {
  if (!therapistId || !patientId || !slot) {
    throw new Error('therapistId, patientId e slot são obrigatórios para montar o caminho da foto.');
  }
  const day = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
  return `${therapistId}/${patientId}/${day}/${slot}-${date.getTime()}.webp`;
}

/**
 * Redimensiona (máx. 1600px no maior lado) e re-codifica a imagem
 * para WEBP. O re-encode remove EXIF/GPS; navegadores modernos já
 * aplicam a orientação EXIF ao decodificar, então a imagem final
 * fica visualmente correta e sem metadados.
 * @param {File} file
 * @returns {Promise<Blob>} blob image/webp
 */
export async function compressTonguePhoto(file) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
      el.src = objectUrl;
    });

    const scale = Math.min(1, MAX_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', WEBP_QUALITY));
    if (!blob) throw new Error('Falha ao converter a imagem para WEBP.');
    return blob;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Comprime e envia a foto ao bucket privado.
 * @param {{ patientId: string, slot: 'top'|'sublingual', file: File }} params
 * @returns {Promise<{ path: string|null, blob: Blob, localOnly: boolean }>}
 *          path null = usuário local, sem Storage (foto só em memória).
 */
export async function uploadTonguePhoto({ patientId, slot, file }) {
  const user = await getAuthenticatedUser();
  if (!user) throw new Error('Usuário não autenticado.');

  const blob = await compressTonguePhoto(file);

  if (user._isLocal) {
    return { path: null, blob, localOnly: true };
  }

  const path = buildTonguePhotoPath(user.id, patientId, slot);
  const { error } = await supabase.storage
    .from(TONGUE_PHOTOS_BUCKET)
    .upload(path, blob, { contentType: 'image/webp', upsert: false });

  if (error) throw new Error(`Falha ao enviar a foto: ${error.message}`);
  return { path, blob, localOnly: false };
}

/**
 * Gera URL assinada de curta duração para exibir uma foto já enviada.
 * @param {string} path
 * @returns {Promise<string|null>} URL ou null se indisponível
 */
export async function getTonguePhotoUrl(path) {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(TONGUE_PHOTOS_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (error) {
    console.error('Erro ao gerar URL assinada da foto:', error);
    return null;
  }
  return data?.signedUrl || null;
}

/**
 * Remove uma foto do bucket (best-effort: erro é logado, não propaga,
 * para a remoção na UI nunca ficar bloqueada por falha de rede).
 * @param {string} path
 */
export async function deleteTonguePhoto(path) {
  if (!path) return;
  const { error } = await supabase.storage.from(TONGUE_PHOTOS_BUCKET).remove([path]);
  if (error) console.error('Erro ao remover foto do Storage:', error);
}
