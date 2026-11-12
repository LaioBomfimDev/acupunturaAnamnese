export function formatPatientCount(count) {
  return `${count} ${count === 1 ? 'paciente' : 'pacientes'}`;
}

// Ordem das listas de pacientes ("Selecionar paciente" de cada área e
// Pacientes da instituição, 18/10/2026, pedido da administradora). Abre em
// A a Z; o banco devolve por cadastro, mais recente primeiro.
export const PATIENT_SORT_OPTIONS = [
  { value: 'name_asc', label: 'Nome (A a Z)' },
  { value: 'name_desc', label: 'Nome (Z a A)' },
  { value: 'recent', label: 'Cadastro mais recente' },
];

export const DEFAULT_PATIENT_SORT = 'name_asc';

// Situação do paciente (12/11/2026, pedido da administradora; antes era
// "Suspender paciente"). Inativo = `patients.suspended_at` preenchido: pausa
// reversível, sem revisão e sem apagar nada. A lista de Pacientes da
// instituição abre em Ativos.
export const PATIENT_STATUS_OPTIONS = [
  { value: 'active', label: 'Ativos' },
  { value: 'inactive', label: 'Inativos' },
  { value: 'all', label: 'Todos' },
];

export const DEFAULT_PATIENT_STATUS_FILTER = 'active';

export function isPatientInactive(patient) {
  return Boolean(patient?.suspended_at);
}

/** Cópia filtrada pela situação; valor desconhecido mostra todos. */
export function filterPatientsByStatus(patients, status = DEFAULT_PATIENT_STATUS_FILTER) {
  const list = patients || [];
  if (status === 'active') return list.filter(patient => !isPatientInactive(patient));
  if (status === 'inactive') return list.filter(isPatientInactive);
  return [...list];
}

/** "Inativo desde 12/11/2026" ou só "Inativo" quando a data não vem. */
export function formatInactiveSince(patient) {
  const time = Date.parse(patient?.suspended_at || '');
  if (Number.isNaN(time)) return 'Inativo';
  return `Inativo desde ${new Date(time).toLocaleDateString('pt-BR')}`;
}

// "Ágata" junto de "Agata", maiúscula igual a minúscula, "Ana 2" antes de "Ana 10".
const nameCollator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });

function patientNameKey(patient) {
  return String(patient?.name || '').trim();
}

function createdAtTime(patient) {
  const time = Date.parse(patient?.created_at || '');
  return Number.isNaN(time) ? -Infinity : time;
}

/** Cópia ordenada; nunca mexe na lista recebida. Sem nome vai para o fim. */
export function sortPatients(patients, order = DEFAULT_PATIENT_SORT) {
  const list = [...(patients || [])];
  if (order === 'recent') {
    return list.sort((a, b) => createdAtTime(b) - createdAtTime(a));
  }
  const direction = order === 'name_desc' ? -1 : 1;
  return list.sort((a, b) => {
    const nameA = patientNameKey(a);
    const nameB = patientNameKey(b);
    if (!nameA || !nameB) return (nameA ? 0 : 1) - (nameB ? 0 : 1);
    return direction * nameCollator.compare(nameA, nameB);
  });
}

/**
 * Confirmação por digitação ("excluir"/"DELETE") pra qualquer exclusão
 * definitiva no sistema — não é só de paciente (nome ficou genérico de
 * propósito: agenda usa a mesma regra em `Agenda.jsx`). Um clique em
 * "sim" de `window.confirm` é fácil demais de dar sem ler; digitar a
 * palavra força a pessoa a registrar que entendeu que é sem volta.
 */
export function isDeleteConfirmationValid(value) {
  const text = String(value || '').trim();
  return text.toLowerCase() === 'excluir' || text === 'DELETE';
}

export function formatBirthDate(value) {
  if (!value) return 'Sem nascimento';
  return new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR');
}

export function formatAge(patient) {
  if (patient?.age !== undefined && patient?.age !== null && patient?.age !== '') {
    return `${patient.age} anos`;
  }
  return formatBirthDate(patient?.birth_date);
}

/** "34 anos", pela idade gravada ou pela data de nascimento; sem as duas, nada. */
export function patientAgeLabel(patient, now = new Date()) {
  if (patient?.age !== undefined && patient?.age !== null && patient?.age !== '') return `${patient.age} anos`;
  if (!patient?.birth_date) return null;
  const birth = new Date(`${patient.birth_date}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  let years = now.getFullYear() - birth.getFullYear();
  if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) years -= 1;
  if (years < 0) return null;
  return years === 1 ? '1 ano' : `${years} anos`;
}

export function getInitials(name) {
  return String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part.charAt(0).toUpperCase())
    .join('');
}

// Mesma paleta de TEAM_AVATAR_COLORS (Agenda.jsx) e AVATAR_COLORS
// (BirthdaysPanel.jsx) — centralizada aqui pra qualquer lista de
// pessoas (paciente ou profissional) usar a mesma cor pro mesmo nome,
// sem depender de ordem/posição na lista.
const AVATAR_PALETTE = ['#33403f', '#2e5578', '#5c3d63', '#7a5a2e', '#46426b', '#7d9291'];

export function getAvatarColor(name) {
  const text = String(name || '');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}
