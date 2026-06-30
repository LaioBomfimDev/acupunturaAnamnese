export function formatPatientCount(count) {
  return `${count} ${count === 1 ? 'paciente' : 'pacientes'}`;
}

export function isPatientDeletionConfirmationValid(value) {
  const text = String(value || '').trim();
  return text.toLowerCase() === 'excluir' || text === 'DELETE';
}
