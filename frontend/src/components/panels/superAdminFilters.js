function normalizeSearchValue(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function filterManagedProfessionals(
  professionals,
  { query = '', status = 'all', clinicId = 'all', profession = 'all' } = {},
  resolveProfessionLabel = value => value,
) {
  const term = normalizeSearchValue(query);

  return professionals.filter(profile => {
    const statusMatches =
      status === 'all'
      || (status === 'active' && profile.is_active && !profile.must_change_password)
      || (status === 'pending' && profile.must_change_password)
      || (status === 'suspended' && !profile.is_active);

    const clinicMatches =
      clinicId === 'all'
      || (clinicId === 'unassigned' && !profile.clinic_id)
      || profile.clinic_id === clinicId;

    const professionMatches = profession === 'all' || profile.profession === profession;

    if (!statusMatches || !clinicMatches || !professionMatches) return false;
    if (!term) return true;

    return [
      profile.full_name,
      profile.username,
      profile.email,
      resolveProfessionLabel(profile.profession),
      profile.specialty,
      profile.professional_registration,
      profile.clinic_name,
    ].some(value => normalizeSearchValue(value).includes(term));
  });
}

export function filterClinicDirectory(
  professionals,
  { query = '', clinicId = 'all' } = {},
) {
  const term = normalizeSearchValue(query);

  return professionals.filter(profile => {
    const clinicMatches =
      clinicId === 'all'
      || (clinicId === 'unassigned' && !profile.clinic_id)
      || profile.clinic_id === clinicId;

    if (!clinicMatches) return false;
    if (!term) return true;

    return [profile.full_name, profile.email].some(value => (
      normalizeSearchValue(value).includes(term)
    ));
  });
}

export function filterClinics(clinics, query = '') {
  const term = normalizeSearchValue(query);
  if (!term) return clinics;

  return clinics.filter(clinic => [
    clinic.name,
    clinic.legal_name,
    clinic.cnpj,
    clinic.email,
    clinic.phone,
    clinic.address,
  ].some(value => normalizeSearchValue(value).includes(term)));
}
