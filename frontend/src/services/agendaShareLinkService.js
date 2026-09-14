// ============================================================
// SERVICE: Link público da agenda (somente leitura, sem login)
// Migração: supabase/migrations/20260914_agenda_share_links.sql
//
// Criar/listar/revogar aqui passa por RLS normal (staff autenticado da
// clínica). Quem ABRE o link não passa por este arquivo — vai direto
// para a Edge Function pública public-agenda, chamada por
// PublicAgendaPage.jsx sem sessão nenhuma.
// ============================================================

import { supabase, getAuthenticatedUser } from '../lib/supabase';

const LINK_COLUMNS = 'id,clinic_id,day,disciplines,professional_id,token,created_at,expires_at';

function isMissingShareLinksTableError(error) {
  const text = [error?.message, error?.details, error?.hint, error?.code]
    .filter(Boolean)
    .join(' ');
  return /agenda_share_links/.test(text) && /does not exist|schema cache|Could not find/i.test(text);
}

const MIGRATION_HINT =
  'Link público da agenda ausente no banco. Aplique a migração ' +
  'supabase/migrations/20260914_agenda_share_links.sql no Supabase.';

/**
 * Gera um link público para a agenda de UM dia, com o mesmo filtro de
 * área/profissional que o ShareAgendaPanel já usa na mensagem de texto.
 * `disciplines` vazio = todas; `professionalId` vazio = toda a equipe.
 */
export async function createAgendaShareLink({ clinicId, day, disciplines = [], professionalId = null }) {
  if (!clinicId) throw new Error('Clínica não identificada para gerar o link.');
  if (!day) throw new Error('Selecione o dia para gerar o link.');

  const user = await getAuthenticatedUser();
  if (!user) throw new Error('Usuário não autenticado.');

  const { data, error } = await supabase
    .from('agenda_share_links')
    .insert({
      clinic_id: clinicId,
      day,
      disciplines: disciplines.length > 0 ? disciplines : null,
      professional_id: professionalId || null,
      created_by: user.id,
    })
    .select(LINK_COLUMNS)
    .single();

  if (error) {
    if (isMissingShareLinksTableError(error)) throw new Error(MIGRATION_HINT);
    throw new Error(error.message || 'Não foi possível gerar o link.');
  }

  return data;
}

/** Revoga (apaga) um link já gerado — mata o acesso na hora. */
export async function revokeAgendaShareLink(id) {
  if (!id) return;
  const { error } = await supabase.from('agenda_share_links').delete().eq('id', id);
  if (error) {
    if (isMissingShareLinksTableError(error)) throw new Error(MIGRATION_HINT);
    throw new Error(error.message || 'Não foi possível revogar o link.');
  }
}

export function buildAgendaShareLink(token) {
  return `${window.location.origin}/agenda-publica?token=${token}`;
}
