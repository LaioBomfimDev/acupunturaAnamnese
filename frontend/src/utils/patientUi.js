export function formatPatientCount(count) {
  return `${count} ${count === 1 ? 'paciente' : 'pacientes'}`;
}

export function isPatientDeletionConfirmationValid(value) {
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
