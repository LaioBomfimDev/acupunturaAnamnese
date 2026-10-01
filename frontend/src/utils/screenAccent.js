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

// Barra de título do app instalado (e a do navegador no celular) vem do
// <meta name="theme-color">: segue a mesma cor da tela. O valor do
// index.html fica guardado no próprio meta para voltar quando não há cor
// (login, SuperAdm).
export function applyThemeColorMeta(color, doc = globalThis.document) {
  const meta = doc?.querySelector?.('meta[name="theme-color"]');
  if (!meta) return;
  if (meta.dataset.defaultColor === undefined) {
    meta.dataset.defaultColor = meta.getAttribute('content') || '';
  }
  meta.setAttribute('content', color || meta.dataset.defaultColor);
}
