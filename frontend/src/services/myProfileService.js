// ============================================================
// SERVIÇO: o próprio cadastro (Gestão → Meu cadastro / Personalizar)
//
// Leitura pela policy "select self" de profiles; escrita SÓ por RPC
// (profiles não tem policy de UPDATE). update_my_profile aceita apenas
// dados pessoais — profissão, papel, clínica e áreas seguem com a
// administração. Ver migração 20260925b_personal_accent_self_profile.
// ============================================================

import { supabase } from '../lib/supabase';

const MY_PROFILE_COLUMNS = [
  'id', 'email', 'username', 'full_name', 'role', 'profession',
  'phone', 'document', 'professional_registration', 'specialty',
  'endereco_cep', 'endereco_logradouro', 'endereco_numero', 'endereco_complemento',
  'endereco_bairro', 'endereco_cidade', 'endereco_uf',
].join(',');

const PENDING_MIGRATION_MESSAGE = 'Esta função ainda não está disponível no banco (migração 20260925b pendente).';

function isMissingRpc(error, name) {
  const text = [error?.message, error?.details, error?.hint].filter(Boolean).join(' ');
  return error?.code === 'PGRST202' || error?.code === '42883' || new RegExp(name, 'i').test(text);
}

export async function getMyProfile(profileId) {
  const { data, error } = await supabase
    .from('profiles')
    .select(MY_PROFILE_COLUMNS)
    .eq('id', profileId)
    .maybeSingle();
  if (error) throw new Error(error.message || 'Não foi possível carregar o seu cadastro.');
  if (!data) throw new Error('Cadastro não encontrado.');
  return data;
}

export async function updateMyProfile(form) {
  const { error } = await supabase.rpc('update_my_profile', {
    p_full_name: form.fullName,
    p_phone: form.phone,
    p_document: form.document,
    p_professional_registration: form.professionalRegistration,
    p_specialty: form.specialty,
    p_endereco_cep: form.enderecoCep,
    p_endereco_logradouro: form.enderecoLogradouro,
    p_endereco_numero: form.enderecoNumero,
    p_endereco_complemento: form.enderecoComplemento,
    p_endereco_bairro: form.enderecoBairro,
    p_endereco_cidade: form.enderecoCidade,
    p_endereco_uf: form.enderecoUf,
  });
  if (error) {
    if (isMissingRpc(error, 'update_my_profile')) throw new Error(PENDING_MIGRATION_MESSAGE);
    throw new Error(error.message || 'Não foi possível salvar o seu cadastro.');
  }
}

// color vazio/null = voltar à cor da instituição.
export async function updateMyAccentColor(color) {
  const { error } = await supabase.rpc('update_my_accent_color', {
    p_color: color || null,
  });
  if (error) {
    if (isMissingRpc(error, 'update_my_accent_color')) throw new Error(PENDING_MIGRATION_MESSAGE);
    throw new Error(error.message || 'Não foi possível salvar a cor da sua tela.');
  }
}
