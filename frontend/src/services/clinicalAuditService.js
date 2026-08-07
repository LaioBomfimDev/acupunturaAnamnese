import { getAuthenticatedUser, supabase } from '../lib/supabase';
import { LOCAL_DEVELOPMENT_MODE } from '../lib/localDevelopmentMode';

const ACTION_LABELS = {
  insert: 'Ficha clínica criada',
  create: 'Ficha clínica criada',
  update: 'Ficha clínica atualizada',
  version: 'Nova revisão clínica registrada',
  delete: 'Ficha clínica removida conforme política',
};

export async function getPatientAuditLog(patientId, limit = 50) {
  if (!patientId) return [];
  const user = await getAuthenticatedUser();
  if (!user) throw new Error('Usuário não autenticado.');
  if (LOCAL_DEVELOPMENT_MODE && user._isLocal) return [];

  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 50));
  const { data, error } = await supabase.rpc('get_patient_audit_log', {
    p_patient_id: patientId,
    p_limit: safeLimit,
  });
  if (error) {
    const details = [error.message, error.details, error.hint, error.code]
      .filter(Boolean)
      .join(' ');
    if (
      /get_patient_audit_log/.test(details)
      && /does not exist|schema cache|Could not find|PGRST202/i.test(details)
    ) {
      throw new Error(
        'Auditoria clínica durável ainda não foi ativada. Aplique a migração de hardening 20260723.',
      );
    }
    throw error;
  }

  return (data || []).map(row => ({
    id: row.audit_id,
    action: ACTION_LABELS[row.action] || String(row.action || 'Atividade clínica'),
    at: row.occurred_at,
    source: 'server',
    recordType: row.record_type,
    discipline: row.discipline,
    oldRevision: row.old_revision,
    newRevision: row.new_revision,
  }));
}
