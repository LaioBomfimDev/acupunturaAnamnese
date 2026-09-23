export function formatPatientCount(count) {
  return `${count} ${count === 1 ? 'paciente' : 'pacientes'}`;
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
