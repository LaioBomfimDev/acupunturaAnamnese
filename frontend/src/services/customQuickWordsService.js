// ============================================================
// SERVICE: Atalhos de texto customizados ("+ palavra") por clínica.
//
// Compartilhado com toda a clínica, isolado por (clinic_id, discipline,
// field_id) — ver supabase/migrations/20260910_custom_quick_words.sql.
// clinic_id nunca é enviado pelo client: RLS + trigger resolvem no
// servidor a partir do usuário autenticado.
//
// Sem a migração aplicada, falha com erro EXPLÍCITO citando o arquivo
// (nada de fallback silencioso).
// ============================================================

import { supabase } from '../lib/supabase';
import { DISCIPLINE_IDS } from '../data/disciplines';

export const QUICK_WORDS_MIGRATION_HINT =
  'Estrutura de atalhos de texto ausente no banco. Aplique a migração ' +
  'supabase/migrations/20260910_custom_quick_words.sql no Supabase.';

export function isMissingQuickWordsSchemaError(error) {
  const text = [error?.message, error?.details, error?.hint, error?.code]
    .filter(Boolean)
    .join(' ');
  return /custom_quick_words/.test(text)
    && /does not exist|schema cache|Could not find/i.test(text);
}

function assertValidDiscipline(discipline) {
  if (!DISCIPLINE_IDS.includes(discipline)) {
    throw new Error(`Disciplina inválida: ${discipline || '(vazia)'}.`);
  }
}

// Todos os atalhos custom de uma disciplina (todos os campos), pra
// carregar 1x por workspace em vez de 1 consulta por campo.
export async function listCustomQuickWords(discipline) {
  assertValidDiscipline(discipline);
  const { data, error } = await supabase
    .from('custom_quick_words')
    .select('id, field_id, word')
    .eq('discipline', discipline)
    .order('created_at', { ascending: true });
  if (error) {
    if (isMissingQuickWordsSchemaError(error)) throw new Error(QUICK_WORDS_MIGRATION_HINT);
    throw error;
  }
  return data || [];
}

export async function addCustomQuickWord(discipline, fieldId, word) {
  assertValidDiscipline(discipline);
  const trimmed = String(word || '').trim();
  if (!trimmed) throw new Error('Palavra vazia.');
  if (!fieldId) throw new Error('Campo é obrigatório.');

  const { data, error } = await supabase
    .from('custom_quick_words')
    .insert({ discipline, field_id: fieldId, word: trimmed })
    .select('id, field_id, word')
    .single();
  if (error) {
    if (error.code === '23505') return null; // já existe (UNIQUE) — no-op silencioso
    if (isMissingQuickWordsSchemaError(error)) throw new Error(QUICK_WORDS_MIGRATION_HINT);
    throw error;
  }
  return data;
}
