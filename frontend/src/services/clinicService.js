// ============================================================
// SERVIÇO: Clínicas (cadastro institucional + vínculo de
// profissionais). O localStorage é usado apenas no login fallback local
// ou quando a migração de clínicas ainda não existe; erros reais do banco
// após a migração precisam aparecer para o SuperAdm.
// ============================================================

import { supabase } from '../lib/supabase';

const LOCAL_CLINICS_KEY = 'acup_clinics_v1';
const LOCAL_CLINIC_ASSIGNMENTS_KEY = 'acup_profile_clinics_v1';
const LOCAL_USER_KEY = 'acup_local_user';
const LOCAL_AUTH_FALLBACK_ENABLED =
  import.meta.env.DEV
  && import.meta.env.VITE_ENABLE_LOCAL_AUTH_FALLBACK === 'true';

export const DEFAULT_BRAND_COLOR = '#0E2A4A';

async function loadLocalProfiles() {
  if (!LOCAL_AUTH_FALLBACK_ENABLED) return [];
  const localAuth = await import('../dev/localAuthFallback.js');
  return localAuth.listLocalProfiles();
}

function readLocal(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || 'null');
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function isLocalId(id) {
  return String(id || '').startsWith('local-');
}

function hasSupabaseConfig() {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
}

function isLocalAuthFallbackActive() {
  if (!LOCAL_AUTH_FALLBACK_ENABLED || typeof localStorage === 'undefined') return false;
  try {
    const localUser = JSON.parse(localStorage.getItem(LOCAL_USER_KEY) || 'null');
    return Boolean(localUser?._isLocal || isLocalId(localUser?.id));
  } catch {
    return false;
  }
}

export function isMissingClinicSchemaError(error) {
  const code = String(error?.code || '');
  const message = [
    error?.message,
    error?.details,
    error?.hint,
  ].filter(Boolean).join(' ');

  if (['42P01', '42703', '42883'].includes(code)) return true;
  if (/schema cache/i.test(message) && /(clinics|clinic_id|admin_set_profile_clinic)/i.test(message)) return true;
  if (/(relation|column|function).*?(clinics|clinic_id|admin_set_profile_clinic).*?does not exist/i.test(message)) return true;
  if (/(clinics|clinic_id|admin_set_profile_clinic).*?(relation|column|function).*?does not exist/i.test(message)) return true;
  return false;
}

function canUseLocalFallback(error, { localEntity = false } = {}) {
  return LOCAL_AUTH_FALLBACK_ENABLED && (
    localEntity
      || isLocalAuthFallbackActive()
      || !hasSupabaseConfig()
      || isMissingClinicSchemaError(error)
  );
}

function readLocalClinics() {
  return readLocal(LOCAL_CLINICS_KEY, []);
}

function readLocalAssignments() {
  return readLocal(LOCAL_CLINIC_ASSIGNMENTS_KEY, {});
}

export async function listClinics() {
  try {
    const { data, error } = await supabase
      .from('clinics')
      .select('*')
      .order('name');
    if (error) throw error;
    return data || [];
  } catch (err) {
    if (canUseLocalFallback(err)) {
      console.warn('Clínicas: usando armazenamento local.', err?.message);
      return readLocalClinics();
    }
    throw err;
  }
}

export async function saveClinic(clinic) {
  const payload = {
    name: String(clinic.name || '').trim(),
    legal_name: clinic.legal_name || null,
    cnpj: clinic.cnpj || null,
    address: clinic.address || null,
    phone: clinic.phone || null,
    email: clinic.email || null,
    brand_color: clinic.brand_color || DEFAULT_BRAND_COLOR,
    logo_url: clinic.logo_url || null,
    logo_watermark: clinic.logo_watermark !== false,
    notes: clinic.notes || null,
  };

  if (!payload.name) {
    throw new Error('Informe o nome da clínica.');
  }

  if (isLocalId(clinic.id) && !LOCAL_AUTH_FALLBACK_ENABLED) {
    throw new Error('Clínicas locais só estão disponíveis no modo de desenvolvimento autorizado.');
  }

  const isUpdate = Boolean(clinic.id) && !String(clinic.id).startsWith('local-');

  function runSave(data) {
    return isUpdate
      ? supabase.from('clinics').update(data).eq('id', clinic.id).select().single()
      : supabase.from('clinics').insert(data).select().single();
  }

  try {
    let { data, error } = await runSave(payload);
    // Banco ainda sem a migração da marca d'água (coluna nova): tenta de novo
    // sem esse campo, pra não perder o resto (logo, cor, contato) por causa dele.
    if (error && /logo_watermark/i.test(error.message || '')) {
      const payloadWithoutWatermark = { ...payload };
      delete payloadWithoutWatermark.logo_watermark;
      ({ data, error } = await runSave(payloadWithoutWatermark));
    }
    if (error) throw error;
    return data;
  } catch (err) {
    if (!canUseLocalFallback(err, { localEntity: isLocalId(clinic.id) })) throw err;
    console.warn('Clínicas: salvando em armazenamento local.', err?.message);
    const clinics = readLocalClinics();
    const id = clinic.id || `local-${Date.now()}`;
    const saved = { ...payload, id, updated_at: new Date().toISOString() };
    const index = clinics.findIndex(item => item.id === id);
    if (index >= 0) clinics[index] = { ...clinics[index], ...saved };
    else clinics.push({ ...saved, created_at: saved.updated_at });
    writeLocal(LOCAL_CLINICS_KEY, clinics);
    return saved;
  }
}

export async function deleteClinic(clinicId) {
  if (isLocalId(clinicId) && !LOCAL_AUTH_FALLBACK_ENABLED) {
    throw new Error('Clínicas locais só estão disponíveis no modo de desenvolvimento autorizado.');
  }

  if (!isLocalId(clinicId)) {
    try {
      const { error } = await supabase.from('clinics').delete().eq('id', clinicId);
      if (error) throw error;
      return;
    } catch (err) {
      if (!canUseLocalFallback(err)) throw err;
      console.warn('Clínicas: removendo do armazenamento local.', err?.message);
    }
  }

  writeLocal(LOCAL_CLINICS_KEY, readLocalClinics().filter(item => item.id !== clinicId));
  const assignments = readLocalAssignments();
  for (const profileId of Object.keys(assignments)) {
    if (assignments[profileId] === clinicId) delete assignments[profileId];
  }
  writeLocal(LOCAL_CLINIC_ASSIGNMENTS_KEY, assignments);
}

// Lista profissionais com o vínculo de clínica atual (para a tela
// de vínculo do SuperAdm).
export async function listProfilesWithClinic() {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id,full_name,email,role,clinic_id')
      .neq('role', 'super_admin')
      .order('full_name');
    if (error) throw error;
    return data || [];
  } catch (err) {
    if (canUseLocalFallback(err)) {
      console.warn('Vínculos de clínica: usando armazenamento local.', err?.message);
      const assignments = readLocalAssignments();
      const localProfiles = await loadLocalProfiles();
      return localProfiles.map(profile => ({
        ...profile,
        role: 'therapist',
        clinic_id: assignments[profile.id] || null,
      }));
    }
    throw err;
  }
}

export async function setProfileClinic(profileId, clinicId) {
  if (isLocalId(profileId) && !LOCAL_AUTH_FALLBACK_ENABLED) {
    throw new Error('Perfis locais só estão disponíveis no modo de desenvolvimento autorizado.');
  }

  if (!isLocalId(profileId)) {
    try {
      const { error } = await supabase.rpc('admin_set_profile_clinic', {
        p_profile_id: profileId,
        p_clinic_id: clinicId || null,
      });
      if (error) throw error;
      return;
    } catch (err) {
      if (!canUseLocalFallback(err)) throw err;
      console.warn('Vínculo de clínica: salvando em armazenamento local.', err?.message);
    }
  }

  const assignments = readLocalAssignments();
  if (clinicId) assignments[profileId] = clinicId;
  else delete assignments[profileId];
  writeLocal(LOCAL_CLINIC_ASSIGNMENTS_KEY, assignments);
}

// Resolve a clínica de um perfil (usada no relatório). Aceita tanto
// perfis do Supabase (clinic_id) quanto locais (mapa em localStorage).
export async function getClinicForProfile(profile) {
  if (!profile) return null;

  if (profile.clinic_id && !isLocalId(profile.id)) {
    try {
      const BASE_COLUMNS = 'id,name,legal_name,cnpj,address,phone,email,brand_color,created_at,updated_at';
      let { data, error } = await supabase
        .from('clinics')
        .select(`${BASE_COLUMNS},logo_url,logo_watermark`)
        .eq('id', profile.clinic_id)
        .maybeSingle();
      // Banco ainda sem a migração da marca d'água (coluna nova): refaz só sem ela,
      // mantendo logo_url (migração mais antiga, já deve existir).
      if (error && /logo_watermark/i.test(error.message || '')) {
        ({ data, error } = await supabase
          .from('clinics')
          .select(`${BASE_COLUMNS},logo_url`)
          .eq('id', profile.clinic_id)
          .maybeSingle());
      }
      // Banco ainda sem a migração do logo: refaz sem nenhuma das duas colunas.
      if (error && /logo_url/i.test(error.message || '')) {
        ({ data, error } = await supabase
          .from('clinics')
          .select(BASE_COLUMNS)
          .eq('id', profile.clinic_id)
          .maybeSingle());
      }
      if (error) throw error;
      if (data) return data;
    } catch (err) {
      if (!canUseLocalFallback(err)) throw err;
      console.warn('Clínica do perfil: usando armazenamento local.', err?.message);
    }
  }

  if (!LOCAL_AUTH_FALLBACK_ENABLED) return null;

  const clinics = readLocalClinics();
  if (!clinics.length) return null;

  const assignments = readLocalAssignments();
  const assignedId = assignments[profile.id] || profile.clinic_id;
  return clinics.find(item => item.id === assignedId) || null;
}
