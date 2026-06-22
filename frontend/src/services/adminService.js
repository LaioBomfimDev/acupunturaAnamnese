import { supabase } from '../lib/supabase';

async function throwFunctionError(error, fallbackMessage) {
  if (!error) return;

  if (typeof error.context?.json === 'function') {
    try {
      const body = await error.context.json();
      throw new Error(body?.error || body?.message || error.message || fallbackMessage);
    } catch (bodyError) {
      if (bodyError instanceof Error && bodyError.message) {
        throw bodyError;
      }
    }
  }

  throw new Error(error.message || fallbackMessage);
}

export async function listProfessionals() {
  const { data, error } = await supabase.rpc('admin_list_profiles');
  if (error) throw error;
  return data || [];
}

export async function createTherapist(payload) {
  const { data, error } = await supabase.functions.invoke('super-admin-create-user', {
    body: payload,
  });

  await throwFunctionError(error, 'Não foi possível criar o profissional.');

  if (data?.error) {
    throw new Error(data.error);
  }

  return data?.user;
}

export async function resetTemporaryPassword(profileId, temporaryPassword, confirmTemporaryPassword) {
  const { data, error } = await supabase.functions.invoke('super-admin-reset-password', {
    body: {
      profileId,
      temporaryPassword,
      confirmTemporaryPassword,
    },
  });

  await throwFunctionError(error, 'Não foi possível redefinir a senha temporária.');

  if (data?.error) {
    throw new Error(data.error);
  }

  return data;
}

export async function setProfessionalActive(profileId, isActive) {
  const { error } = await supabase.rpc('admin_set_profile_active', {
    p_profile_id: profileId,
    p_is_active: isActive,
  });

  if (error) throw error;
}

export async function updateProfessionalProfile(profileId, payload) {
  const { error } = await supabase.rpc('admin_update_profile', {
    p_profile_id: profileId,
    p_full_name: payload.fullName,
    p_phone: payload.phone,
    p_document: payload.document,
    p_professional_registration: payload.professionalRegistration,
    p_specialty: payload.specialty,
    p_profession: payload.profession,
    p_clinic_name: payload.clinicName,
    p_notes: payload.notes,
  });

  if (error) throw error;
}

export async function listAuditLogs(limit = 60) {
  const { data, error } = await supabase.rpc('admin_list_audit_logs', {
    p_limit: limit,
  });

  if (error) throw error;
  return data || [];
}
