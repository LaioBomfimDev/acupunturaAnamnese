const PREFIX = 'acup_patient_audit_log';

function getKey(patientId) {
  return `${PREFIX}:${patientId}`;
}

export function readPatientAuditLog(patientId) {
  if (!patientId) return [];
  try {
    return JSON.parse(localStorage.getItem(getKey(patientId)) || '[]');
  } catch {
    return [];
  }
}

export function appendPatientAuditLog(patientId, action) {
  if (!patientId || !action) return [];
  const next = [
    {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      action,
      at: new Date().toISOString(),
    },
    ...readPatientAuditLog(patientId),
  ].slice(0, 12);

  localStorage.setItem(getKey(patientId), JSON.stringify(next));
  return next;
}

export function clearPatientAuditLog(patientId) {
  if (!patientId) return;
  localStorage.removeItem(getKey(patientId));
}

