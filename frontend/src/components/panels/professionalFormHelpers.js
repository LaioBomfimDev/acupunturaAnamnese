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
  role: 'therapist',
  clinicId: '',
  notes: '',
  temporaryPassword: '',
  confirmTemporaryPassword: '',
};

// Tipos de acesso que o SuperAdm pode criar (allowlist espelha a da
// edge function super-admin-create-user).
export const CREATABLE_ROLES = [
  { value: 'therapist', label: 'Profissional (atendimento)' },
  { value: 'knowledge_reviewer', label: 'Revisora de curadoria (atendimento + curadoria)' },
];

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
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const bytes = new Uint32Array(12);
  crypto.getRandomValues(bytes);
  const randomPart = Array.from(
    bytes,
    byte => alphabet[byte % alphabet.length],
  ).join('');
  return `T7!a${randomPart}`;
}

export function getTemporaryPasswordValidationError(password, context = []) {
  const value = String(password || '');
  const lower = value.toLowerCase();
  const weakFragments = ['123456', '654321', 'password', 'senha', 'qwerty', 'admin', 'superadm'];

  if (value.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
  if (!/[a-z]/.test(value)) return 'Inclua pelo menos uma letra minúscula.';
  if (!/[A-Z]/.test(value)) return 'Inclua pelo menos uma letra maiúscula.';
  if (!/[0-9]/.test(value)) return 'Inclua pelo menos um número.';
  if (weakFragments.some(fragment => lower.includes(fragment))) {
    return 'Evite sequências e termos fáceis de adivinhar.';
  }
  if (context.some(item => {
    const normalized = String(item || '').trim().toLowerCase();
    return normalized.length >= 4 && lower.includes(normalized);
  })) {
    return 'A senha não pode conter dados do usuário.';
  }
  return '';
}

// Profissão → disciplina (para escopar a revisora de curadoria). Espelha o
// mapa em data/disciplines.js; mantido aqui para o helper ficar sem JSX/deps.
const PROFESSION_DISCIPLINE = {
  acupunturista: 'acupuntura',
  fisioterapeuta: 'fisioterapia',
  terapeuta_ocupacional: 'fisioterapia',
  psicologo: 'psicologia',
  nutricionista: 'nutricao',
};

// Disciplinas explícitas ao criar. Só a revisora precisa ser ESCOPADA
// (a coluna vence o fallback que sempre injeta acupuntura); o terapeuta
// segue o comportamento atual (coluna nula → fallback por profissão).
function resolveCreateDisciplines(role, profession) {
  if (role !== 'knowledge_reviewer') return [];
  const mapped = PROFESSION_DISCIPLINE[profession];
  return mapped ? [mapped] : ['acupuntura'];
}

export function buildProfessionalCreatePayload(form, clinics = []) {
  const email = String(form?.email || '').trim().toLowerCase();
  const clinicId = String(form?.clinicId || '').trim();
  const selectedClinic = Array.isArray(clinics)
    ? clinics.find(clinic => String(clinic?.id || '') === clinicId)
    : null;
  const role = CREATABLE_ROLES.some(item => item.value === form?.role) ? form.role : 'therapist';
  const profession = String(form?.profession || '').trim();

  return {
    ...form,
    firstName: String(form?.firstName || '').trim(),
    lastName: String(form?.lastName || '').trim(),
    email,
    username: normalizeUsername(form?.username || getEmailLogin(email)),
    phone: String(form?.phone || '').trim(),
    document: String(form?.document || '').trim(),
    profession,
    professionalRegistration: String(form?.professionalRegistration || '').trim(),
    specialty: String(form?.specialty || '').trim(),
    role,
    disciplines: resolveCreateDisciplines(role, profession),
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

  const passwordError = getTemporaryPasswordValidationError(
    payload.temporaryPassword,
    [payload.email, payload.username, payload.fullName],
  );
  if (passwordError) return passwordError;

  return '';
}
