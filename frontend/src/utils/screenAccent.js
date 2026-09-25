// ============================================================
// Cor da TELA (não dos documentos)
//
// A instituição decide em Gestão → Personalizar se a cor do sistema é
// fixa para a equipe (clinics.personal_accent_allowed = false, padrão)
// ou se cada profissional escolhe a própria (profiles.accent_color).
// Papel timbrado, relatórios e evoluções continuam SEMPRE com a cor da
// instituição — ver getClinicLetterheadColor em reportUtils.
// ============================================================

// Sem clínica vinculada não há trava a respeitar.
export function isPersonalAccentAllowed(profile) {
  const clinic = profile?.clinic || null;
  if (!clinic?.id) return true;
  return clinic.personal_accent_allowed === true;
}

export function resolveScreenAccentColor(profile) {
  const personal = profile?.accent_color || '';
  if (personal && isPersonalAccentAllowed(profile)) return personal;
  return profile?.clinic?.brand_color || '';
}
