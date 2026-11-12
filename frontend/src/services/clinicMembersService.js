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
 * @returns [{ id, full_name, profession, role, disciplines, is_active, has_agenda }]
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
      has_agenda: user.has_agenda !== false,
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
 * Liga/desliga se a pessoa aparece como profissional selecionável na
 * agenda (chip de agenda pessoal + seletor do formulário). Quem só
 * administra (ex.: clinic_admin que não atende) fica de fora sem deixar
 * de existir como membro ativo da equipe.
 *
 * Só clinic_admin da própria instituição (ou SuperAdm) pode chamar —
 * `profiles` não tem policy de UPDATE cruzado, a RPC
 * `set_member_has_agenda` é o único caminho.
 */
export async function setMemberHasAgenda(profileId, hasAgenda, { runtime } = {}) {
  if (!profileId) throw new Error('Profissional não informado.');

  const client = {
    getAuthenticatedUser: runtime?.getAuthenticatedUser || getAuthenticatedUser,
    rpc: runtime?.rpc || ((fn, args) => supabase.rpc(fn, args)),
  };

  const user = await client.getAuthenticatedUser();

  if (LOCAL_DEVELOPMENT_MODE && user?._isLocal) {
    return { id: profileId, has_agenda: hasAgenda === true };
  }

  const { error } = await client.rpc('set_member_has_agenda', {
    p_profile_id: profileId,
    p_has_agenda: hasAgenda === true,
  });

  if (error) {
    throw new Error(error.message || 'Não foi possível atualizar quem atende.');
  }

  return { id: profileId, has_agenda: hasAgenda === true };
}

/**
 * Troca as áreas em que a pessoa atende (Gestão → Equipe).
 *
 * Só a administração da própria instituição (ou SuperAdm): `profiles` não
 * tem policy de UPDATE cruzado, e `set_member_disciplines` (migration
 * 20261112) é o único caminho. O banco é quem limpa a lista — tira o que
 * não existe, tira repetido e devolve na ordem do catálogo —, então quem
 * manda na tela é a resposta, nunca o array enviado.
 */
export async function setMemberDisciplines(profileId, disciplines, { runtime } = {}) {
  if (!profileId) throw new Error('Profissional não informado.');

  const client = {
    getAuthenticatedUser: runtime?.getAuthenticatedUser || getAuthenticatedUser,
    rpc: runtime?.rpc || ((fn, args) => supabase.rpc(fn, args)),
  };

  const wanted = Array.isArray(disciplines) ? disciplines.filter(Boolean) : [];
  const user = await client.getAuthenticatedUser();

  if (LOCAL_DEVELOPMENT_MODE && user?._isLocal) {
    return { id: profileId, disciplines: wanted };
  }

  const { data, error } = await client.rpc('set_member_disciplines', {
    p_profile_id: profileId,
    p_disciplines: wanted,
  });

  if (error) {
    throw new Error(error.message || 'Não foi possível atualizar as áreas.');
  }

  return { id: profileId, disciplines: Array.isArray(data) ? data : wanted };
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
