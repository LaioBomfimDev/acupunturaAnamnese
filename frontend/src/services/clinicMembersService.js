// ============================================================
// SERVICE: Equipe da instituição
// Migração: supabase/migrations/20260810_clinic_members.sql
//
// Existe por um motivo só: a política de `profiles` é "cada perfil vê
// apenas a si mesmo", o que impedia a agenda de recepção de listar os
// colegas. A RPC list_clinic_members devolve o ADMINISTRATIVO da equipe
// (quem é, o que faz, se está ativo) — nunca e-mail, telefone,
// documento ou registro profissional.
//
// Sem a migração aplicada → erro EXPLÍCITO citando o arquivo.
// Login local (teste) devolve só o próprio perfil.
// ============================================================

import { supabase, getAuthenticatedUser } from '../lib/supabase';
import { LOCAL_DEVELOPMENT_MODE } from '../lib/localDevelopmentMode';

export const CLINIC_MEMBERS_MIGRATION_HINT =
  'Leitura da equipe ausente no banco. Aplique a migração ' +
  'supabase/migrations/20260810_clinic_members.sql no Supabase.';

export function isMissingClinicMembersError(error) {
  const text = [error?.message, error?.details, error?.hint, error?.code]
    .filter(Boolean)
    .join(' ');
  return /list_clinic_members/.test(text)
    && /does not exist|schema cache|Could not find/i.test(text);
}

/** Nome curto para caber em chip e coluna de agenda: "Ana Paula S." */
export function shortName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'Profissional';
  if (parts.length <= 2) return parts.join(' ');
  return `${parts[0]} ${parts[1]} ${parts[parts.length - 1][0]}.`;
}

/**
 * Equipe ativa da instituição de quem está logado.
 *
 * @returns [{ id, full_name, profession, role, disciplines, is_active }]
 */
export async function listClinicMembers({ clinicId = null, runtime } = {}) {
  const client = {
    getAuthenticatedUser: runtime?.getAuthenticatedUser || getAuthenticatedUser,
    rpc: runtime?.rpc || ((fn, args) => supabase.rpc(fn, args)),
  };

  const user = await client.getAuthenticatedUser();

  if (LOCAL_DEVELOPMENT_MODE && user?._isLocal) {
    // No login local não existe equipe: a agenda vira a do próprio
    // usuário, que é exatamente o comportamento anterior.
    return [{
      id: user.id,
      full_name: user.full_name || user.email || 'Profissional (local)',
      profession: user.profession || null,
      role: user.role || 'therapist',
      disciplines: Array.isArray(user.disciplines) ? user.disciplines : [],
      is_active: true,
    }];
  }

  const { data, error } = await client.rpc('list_clinic_members', { p_clinic: clinicId });

  if (error) {
    if (isMissingClinicMembersError(error)) throw new Error(CLINIC_MEMBERS_MIGRATION_HINT);
    throw new Error(error.message || 'Não foi possível carregar a equipe da instituição.');
  }

  return data || [];
}

/**
 * Coloca quem está logado no topo da lista. A pessoa procura a própria
 * agenda primeiro — em recepção com dez profissionais, rolar até achar o
 * próprio nome é atrito diário.
 */
export function sortWithSelfFirst(members, selfId) {
  const list = Array.isArray(members) ? [...members] : [];
  return list.sort((a, b) => {
    if (a.id === selfId) return -1;
    if (b.id === selfId) return 1;
    return String(a.full_name || '').localeCompare(String(b.full_name || ''), 'pt-BR');
  });
}
