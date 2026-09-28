// ============================================================
// SERVICE: Configuração da agenda da instituição
// Migração: supabase/migrations/20260928_agenda_settings.sql
//
// Leitura: qualquer pessoa da clínica (a agenda de todo mundo segue a
// mesma regra). Gravação: só o clinic_admin, pela RPC — a policy de
// UPDATE de clinics continua exclusiva do SuperAdm.
//
// O conteúdo SEMPRE passa por normalizeAgendaSettings: o que vier do
// banco (ou for gravado) nunca quebra a agenda.
// ============================================================

import { supabase, getAuthenticatedUser } from '../lib/supabase';
import { LOCAL_DEVELOPMENT_MODE } from '../lib/localDevelopmentMode';
import { normalizeAgendaSettings } from '../utils/agendaSettings';

const LOCAL_AGENDA_SETTINGS_KEY = 'acup_local_agenda_settings';

export const AGENDA_SETTINGS_MIGRATION_HINT =
  'A configuração da agenda ainda não está disponível no banco '
  + '(migração 20260928_agenda_settings.sql pendente).';

function isMissingSettingsSchema(error) {
  const text = [error?.message, error?.details, error?.hint].filter(Boolean).join(' ');
  return /agenda_settings/i.test(text)
    && /does not exist|schema cache|Could not find/i.test(text);
}

function readLocal() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_AGENDA_SETTINGS_KEY) || 'null');
  } catch {
    return null;
  }
}

/**
 * @returns { settings, available } — `available: false` quando o banco
 * ainda não tem a coluna: a agenda segue no padrão e a tela de
 * configuração avisa em vez de fingir que salvou.
 */
export async function loadAgendaSettings(clinicId, { runtime } = {}) {
  const client = {
    getAuthenticatedUser: runtime?.getAuthenticatedUser || getAuthenticatedUser,
    from: runtime?.from || ((table) => supabase.from(table)),
  };

  const user = await client.getAuthenticatedUser();

  if (LOCAL_DEVELOPMENT_MODE && user?._isLocal) {
    return { settings: normalizeAgendaSettings(readLocal()), available: true };
  }

  if (!clinicId) return { settings: normalizeAgendaSettings(null), available: false };

  const { data, error } = await client.from('clinics')
    .select('agenda_settings')
    .eq('id', clinicId)
    .maybeSingle();

  if (error) {
    if (isMissingSettingsSchema(error)) {
      return { settings: normalizeAgendaSettings(null), available: false };
    }
    throw new Error(error.message || 'Não foi possível ler a configuração da agenda.');
  }

  return { settings: normalizeAgendaSettings(data?.agenda_settings), available: true };
}

/** Grava (só clinic_admin) e devolve a configuração normalizada que ficou no banco. */
export async function saveAgendaSettings(settings, { runtime } = {}) {
  const normalized = normalizeAgendaSettings(settings);

  const client = {
    getAuthenticatedUser: runtime?.getAuthenticatedUser || getAuthenticatedUser,
    rpc: runtime?.rpc || ((name, args) => supabase.rpc(name, args)),
  };

  const user = await client.getAuthenticatedUser();

  if (LOCAL_DEVELOPMENT_MODE && user?._isLocal) {
    localStorage.setItem(LOCAL_AGENDA_SETTINGS_KEY, JSON.stringify(normalized));
    return normalized;
  }

  const { data, error } = await client.rpc('clinic_admin_update_agenda_settings', {
    p_settings: normalized,
  });

  if (error) {
    if (isMissingSettingsSchema(error) || /clinic_admin_update_agenda_settings/i.test(error.message || '')) {
      throw new Error(AGENDA_SETTINGS_MIGRATION_HINT);
    }
    if (error.code === '42501') {
      throw new Error('Só quem é Admin da clínica pode configurar a agenda.');
    }
    throw new Error(error.message || 'Não foi possível salvar a configuração da agenda.');
  }

  return normalizeAgendaSettings(data);
}
