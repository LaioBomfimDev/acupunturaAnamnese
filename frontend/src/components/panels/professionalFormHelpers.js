// ============================================================
// Helpers do cadastro de profissional (sem JSX)
// Máscaras, normalização de login/nome e geração de senha,
// compartilhados pelo formulário de criação e pela edição.
// ============================================================

export const EMPTY_PROFESSIONAL_FORM = {
  firstName: '',
  lastName: '',
  email: '',
  username: '',
  phone: '',
  document: '',
  profession: '',
  professionalRegistration: '',
  specialty: '',
  clinicId: '',
  notes: '',
  temporaryPassword: '',
  confirmTemporaryPassword: '',
};

export function normalizeUsername(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '');
}

export function getEmailLogin(email) {
  return normalizeUsername(String(email || '').split('@')[0]);
}

export function getFullName(firstName, lastName) {
  return [firstName, lastName].map(part => String(part || '').trim()).filter(Boolean).join(' ');
}

export function splitFullName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts.shift() || '',
    lastName: parts.join(' '),
  };
}

export function maskCpfCnpj(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 14);

  if (digits.length <= 11) {
    return digits
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4');
  }

  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3/$4')
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, '$1.$2.$3/$4-$5');
}

export function generatePassword() {
  const bytes = new Uint32Array(4);
  crypto.getRandomValues(bytes);
  const digits = Array.from(bytes, byte => String(byte % 10)).join('');
  return `Acup${digits}`;
}

export function buildProfessionalCreatePayload(form, clinics = []) {
  const email = String(form?.email || '').trim().toLowerCase();
  const clinicId = String(form?.clinicId || '').trim();
  const selectedClinic = Array.isArray(clinics)
    ? clinics.find(clinic => String(clinic?.id || '') === clinicId)
    : null;

  return {
    ...form,
    firstName: String(form?.firstName || '').trim(),
    lastName: String(form?.lastName || '').trim(),
    email,
    username: normalizeUsername(form?.username || getEmailLogin(email)),
    phone: String(form?.phone || '').trim(),
    document: String(form?.document || '').trim(),
    profession: String(form?.profession || '').trim(),
    professionalRegistration: String(form?.professionalRegistration || '').trim(),
    specialty: String(form?.specialty || '').trim(),
    clinicId,
    clinicName: selectedClinic?.name || '',
    notes: String(form?.notes || '').trim(),
    temporaryPassword: String(form?.temporaryPassword || ''),
    confirmTemporaryPassword: String(form?.confirmTemporaryPassword || ''),
    fullName: getFullName(form?.firstName, form?.lastName),
  };
}

export function getProfessionalCreateValidationError(payload) {
  if (!String(payload?.fullName || '').trim() || payload.fullName.trim().length < 3) {
    return 'Informe o nome do profissional.';
  }

  if (!payload?.email || !payload?.username) {
    return 'Preencha e-mail e login.';
  }

  if (!payload?.profession) {
    return 'Selecione a profissão do profissional.';
  }

  if (payload.temporaryPassword !== payload.confirmTemporaryPassword) {
    return 'A confirmação da senha temporária não confere.';
  }

  if (String(payload.temporaryPassword || '').length < 6) {
    return 'A senha temporária precisa ter pelo menos 6 caracteres.';
  }

  return '';
}
